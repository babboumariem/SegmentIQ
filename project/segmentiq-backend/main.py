"""
main.py  —  SegmentIQ FastAPI backend (The3Beez)
=================================================
TOUTES les données viennent de MongoDB (rempli par import_data.py).

Collections réelles utilisées :
  segments_feat      — features par client (11 074 docs)  → /api/customers
  segments_meta      — metadata segments  (4 docs)         → /api/segments
  segments_agg       — agrégations        (4 docs)         → /api/agg
  segments_sample    — sample PCA         (1 000 docs)     → /api/sample
  summary            — KPIs globaux       (1 doc)          → /api/summary
  feature_importance — importance         (10 docs)        → /api/feature-importance
  offers             — promotions         (1 578 docs)     → /api/offers
  countries          — pays               (8 docs)         → /api/countries
  actions            — actions marketing  (1 doc)          → /api/actions
  categories         — catégories         (1 doc)          → /api/categories

NOTE: Pas de collections brutes products/orders/returns —
toutes les données analytiques sont dans segments_feat et summary.

Démarrage :
    uvicorn main:app --reload --port 8000
"""

import io
import os
import time
import threading
import logging
from collections import defaultdict
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    from pathlib import Path
    # Charge le .env depuis le même dossier que main.py,
    # quelle que soit la façon dont uvicorn est lancé (subprocess, autre CWD, etc.)
    _env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=_env_path, override=False)
except ImportError:
    pass

import pandas as pd
from fastapi import FastAPI, Query, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext

from database import (
    segments_meta_col, segments_agg_col, segments_sample_col,
    segments_feat_col, summary_col, feature_imp_col,
    offers_col, countries_col, db,
)

# Collections dynamiques (non exportées par database.py)
actions_col      = db["actions"]
categories_col   = db["categories"]
pca_meta_col     = db["pca_meta"]

app = FastAPI(title="SegmentIQ API — The3Beez", version="4.0")

_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:4200").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JWT config ────────────────────────────────────────────────────────────────
_jwt_secret = os.getenv("JWT_SECRET")
if not _jwt_secret:
    raise RuntimeError(
        "JWT_SECRET n'est pas défini. "
        "Ajoutez JWT_SECRET=<valeur-aléatoire-longue> dans votre fichier .env. "
        "Générez-en une avec : python -c \"import secrets; print(secrets.token_hex(64))\""
    )
JWT_SECRET  = _jwt_secret
JWT_ALGO    = "HS256"
JWT_EXPIRE  = 60 * 8  # 8 heures

pwd_ctx = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("segmentiq")

# ── Protection brute-force : rate limiting sur le login ──────────────────────
class _LoginRateLimiter:
    def __init__(self):
        self._lock    = threading.Lock()
        self._records = defaultdict(lambda: {"count": 0, "window_start": 0.0, "locked_until": 0.0})
        self.max_attempts  = int(os.getenv("LOGIN_MAX_ATTEMPTS",  "5"))
        self.window        = int(os.getenv("LOGIN_WINDOW_SECONDS", "60"))
        self.lockout       = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "300"))

    def check(self, ip: str) -> None:
        now = time.time()
        with self._lock:
            r = self._records[ip]
            if now < r["locked_until"]:
                remaining = int(r["locked_until"] - now)
                raise HTTPException(status_code=429, detail=f"Trop de tentatives. Réessayez dans {remaining} secondes.")
            if now - r["window_start"] > self.window:
                r["count"] = 0
                r["window_start"] = now

    def record_failure(self, ip: str) -> None:
        now = time.time()
        with self._lock:
            r = self._records[ip]
            r["count"] += 1
            if r["count"] >= self.max_attempts:
                r["locked_until"] = now + self.lockout
                r["count"] = 0
                logger.warning(f"[Auth] IP {ip} bloquée pour {self.lockout}s (trop de tentatives)")

    def record_success(self, ip: str) -> None:
        with self._lock:
            self._records[ip] = {"count": 0, "window_start": 0.0, "locked_until": 0.0}

_login_limiter = _LoginRateLimiter()

# ── Comptes utilisateurs (mots de passe hashés dans .env) ────────────────────
_admin_hash    = os.getenv("ADMIN_PW_HASH")
_analyst_hash  = os.getenv("ANALYST_PW_HASH")
_admin_email   = os.getenv("ADMIN_EMAIL",   "admin@the3beez.com")
_analyst_email = os.getenv("ANALYST_EMAIL", "analyst@the3beez.com")

if not _admin_hash or not _analyst_hash:
    raise RuntimeError(
        "ADMIN_PW_HASH et ANALYST_PW_HASH doivent être définis dans .env.\n"
        "Générez les hashs avec : python -c \"from passlib.context import CryptContext; "
        "c=CryptContext(schemes=['sha256_crypt']); print(c.hash('VotreMotDePasse!'))\""
    )

USERS_DB = {
    _admin_email:   {"name": "Admin",   "role": "admin",   "hashed_pw": _admin_hash},
    _analyst_email: {"name": "Analyst", "role": "analyst", "hashed_pw": _analyst_hash},
}

def _create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

def get_current_user(request: Request) -> dict:
    """Lit le JWT depuis le cookie HttpOnly (jamais depuis JS/localStorage)."""
    token = request.cookies.get("siq_jwt")
    if not token:
        raise HTTPException(status_code=401, detail="Token manquant ou session expirée")
    return _decode_token(token)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sanitize(obj):
    import math
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _clean(doc: dict) -> dict:
    """Retire _id MongoDB et sanitise inf/nan pour la sérialisation JSON."""
    doc.pop("_id", None)
    return _sanitize(doc)


def _csv_response(records: list, filename: str) -> StreamingResponse:
    if not records:
        raise HTTPException(status_code=404, detail="No data")
    df = pd.DataFrame(records)
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _check_mongo():
    """Vérifie que l'import MongoDB a bien été fait."""
    if segments_meta_col.count_documents({}) == 0:
        raise HTTPException(
            status_code=503,
            detail="MongoDB vide — lance d'abord : python import_data.py"
        )



# ════════════════════════════════════════════════════════════════════════════
# Auth routes — JWT via cookie HttpOnly
# ════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
def login(body: LoginRequest, request: Request, response: Response):
    client_ip = request.client.host if request.client else "unknown"
    _login_limiter.check(client_ip)

    user = USERS_DB.get(body.email)
    if not user or not pwd_ctx.verify(body.password, user["hashed_pw"]):
        _login_limiter.record_failure(client_ip)
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    _login_limiter.record_success(client_ip)
    token = _create_token({"sub": body.email, "role": user["role"], "name": user["name"]})

    # Cookie HttpOnly : inaccessible depuis JavaScript → protection XSS
    is_secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    response.set_cookie(
        key="siq_jwt",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="strict",
        max_age=JWT_EXPIRE * 60,
        path="/api",
    )
    return {"role": user["role"], "name": user["name"]}


@app.post("/api/auth/logout")
def logout(response: Response):
    """Invalide le cookie de session."""
    response.delete_cookie(key="siq_jwt", path="/api")
    return {"detail": "Déconnecté"}


@app.get("/api/auth/me")
def me(user: dict = Depends(get_current_user)):
    return {"email": user["sub"], "role": user["role"], "name": user["name"]}


# ════════════════════════════════════════════════════════════════════════════
# Segmentation routes
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/segments")
def get_segments():
    """Retourne les 4 segments (meta + counts)."""
    _check_mongo()
    return [_clean(doc) for doc in segments_meta_col.find()]


@app.get("/api/agg")
def get_agg():
    """Retourne les agrégations par segment (moyennes, monthly, cats…)."""
    _check_mongo()
    result = {}
    for doc in segments_agg_col.find():
        seg_id = str(doc.pop("seg_id"))
        doc.pop("_id", None)
        result[seg_id] = _sanitize(doc)
    return result


@app.get("/api/sample")
def get_sample():
    """Retourne les 1 000 points PCA pour visualisation."""
    _check_mongo()
    return [_clean(doc) for doc in segments_sample_col.find()]


@app.get("/api/sample/download")
def download_sample():
    _check_mongo()
    docs = list(segments_sample_col.find({}, {"_id": 0}))
    return _csv_response(docs, "sample_segments.csv")


@app.get("/api/actions")
def get_actions():
    """Retourne les actions recommandées par segment."""
    _check_mongo()
    doc = actions_col.find_one({"_id": "map"})
    if not doc:
        return {}
    doc.pop("_id")
    return doc


@app.get("/api/categories")
def get_categories():
    """Retourne la liste des catégories produit."""
    _check_mongo()
    doc = categories_col.find_one({"_id": "list"})
    return doc["values"] if doc else []


@app.get("/api/feature-importance")
def get_feature_importance():
    """Retourne l'importance des features pour le modèle K-Means."""
    _check_mongo()
    return [_clean(doc) for doc in feature_imp_col.find().sort("value", -1)]


@app.get("/api/pca-meta")
def get_pca_meta():
    """Retourne les métadonnées PCA : variance expliquée par PC1/PC2 et loadings."""
    _check_mongo()
    doc = pca_meta_col.find_one({"_id": "global"})
    if not doc:
        raise HTTPException(status_code=404, detail="pca_meta not found — please re-run import_data.py")
    return _clean(doc)


# ════════════════════════════════════════════════════════════════════════════
# Summary & KPIs
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/summary")
def get_summary():
    """
    KPIs globaux : revenue, commandes, clients, AOV, true_aov,
    total_fulfilled_orders, return_rate, retention_rate, active_customers_90,
    monthly_revenue, monthly_aov, yoy_pct, revenue_by_segment, category_revenue,
    channel_counts, region_dist, gender_dist, gateway_distribution,
    payment_failure_rate, k_scores…
    """
    _check_mongo()
    doc = summary_col.find_one({"_id": "global"})
    if not doc:
        raise HTTPException(status_code=404, detail="Summary not found — relance import_data.py")
    doc.pop("_id")
    return _sanitize(doc)


@app.get("/api/payment-stats")
def get_payment_stats():
    """
    Statistiques de paiement issues de PaymentLog :
    gateway_distribution, payment_status_dist, payment_failure_rate, total_payment_logs.
    """
    _check_mongo()
    doc = summary_col.find_one({"_id": "global"})
    if not doc:
        raise HTTPException(status_code=404, detail="Summary not found")
    return _sanitize({
        "gateway_distribution": doc.get("gateway_distribution", {}),
        "payment_status_dist":  doc.get("payment_status_dist", {}),
        "payment_failure_rate": doc.get("payment_failure_rate", 0.0),
        "total_payment_logs":   doc.get("total_payment_logs", 0),
    })


# ════════════════════════════════════════════════════════════════════════════
# Customers  (source : segments_feat — 11 074 clients avec features ML)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/customers")
def get_customers(
    limit:   int = Query(500, ge=1, le=10000),
    offset:  int = Query(0,   ge=0),
    region:  str | None = None,
    gender:  str | None = None,
    channel: str | None = None,
    q:       str | None = None,
    seg:     int | None = None,
    sort:    str | None = "total_spend",
    random:  bool = False,
):
    """
    Liste des clients avec leurs features ML (total_spend, recency, aov,
    order_count, seg, region, gender, top_channel, top_cat, etc.).
    Source : collection segments_feat (11 074 docs).
    """
    _check_mongo()
    filt = {}
    if region:       filt["region"]      = {"$regex": region,  "$options": "i"}
    if gender:       filt["gender"]      = {"$regex": gender,  "$options": "i"}
    if channel:      filt["top_channel"] = {"$regex": channel, "$options": "i"}
    if q:            filt["$or"] = [
                         {"customer_id": {"$regex": q, "$options": "i"}},
                         {"phone":       {"$regex": q, "$options": "i"}},
                     ]
    if seg is not None:
        filt["seg"] = seg

    SORT_MAP = {
        "total_spend": ("total_spend", -1),
        "recency":     ("recency",      1),
        "order_count": ("order_count", -1),
        "aov":         ("aov",         -1),
    }
    sort_field, sort_dir = SORT_MAP.get(sort or "total_spend", ("total_spend", -1))
    total = segments_feat_col.count_documents(filt)

    if random:
        pipeline = [{"$match": filt}, {"$sample": {"size": limit}}, {"$unset": "_id"}]
        docs = list(segments_feat_col.aggregate(pipeline))
    else:
        docs = list(
            segments_feat_col.find(filt, {"_id": 0})
            .sort(sort_field, sort_dir)
            .skip(offset)
            .limit(limit)
        )
    return {"total": total, "data": _sanitize(docs)}


@app.get("/api/customers/download")
def download_customers():
    """Télécharge tous les clients avec leurs features en CSV."""
    _check_mongo()
    docs = list(segments_feat_col.find({}, {"_id": 0}))
    return _csv_response(docs, "customers_segments.csv")


@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str):
    """Retourne le profil complet d'un client (features ML + segment)."""
    _check_mongo()
    doc = segments_feat_col.find_one({"customer_id": customer_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Client '{customer_id}' introuvable")
    return _sanitize(doc)


# ════════════════════════════════════════════════════════════════════════════
# Offers / Promotions
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/offers")
def get_offers(limit: int = Query(500, ge=1, le=5000)):
    """
    Liste des promotions avec type, valeur, et nombre d'utilisations.
    Source : The3B.Offer.csv → collection offers (1 578 docs).
    """
    _check_mongo()
    docs = list(offers_col.find({}, {"_id": 0}).limit(limit))
    return docs


@app.get("/api/offers/stats")
def get_offers_stats():
    """
    Stats agrégées sur les promotions :
    - répartition par type de réduction
    - offres les plus utilisées (top 10)
    - count auto vs manuelles
    """
    _check_mongo()
    docs = list(offers_col.find({}, {"_id": 0}))
    if not docs:
        return {}

    df = pd.DataFrame(docs)
    type_dist   = df["reduction_type"].value_counts().to_dict() if "reduction_type" in df.columns else {}
    auto_count  = int(df["is_auto_offer"].sum()) if "is_auto_offer" in df.columns else 0
    total       = len(df)
    top_offers  = (
        df.nlargest(10, "offer_usage_count")[["offer_name", "reduction_type", "reduction_value", "offer_usage_count"]]
        .to_dict(orient="records")
    ) if "offer_usage_count" in df.columns else []

    return {
        "total_offers":         total,
        "auto_offers_count":    auto_count,
        "manual_offers_count":  total - auto_count,
        "reduction_type_dist":  type_dist,
        "top_offers_by_usage":  top_offers,
    }


# ════════════════════════════════════════════════════════════════════════════
# Countries
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/countries")
def get_countries():
    """
    Liste des pays actifs avec code et nom.
    Source : The3B.Country.csv → collection countries (8 docs).
    """
    _check_mongo()
    docs = list(countries_col.find({}, {"_id": 1, "name": 1}))
    return [{"code": d["_id"], "name": d.get("name", d["_id"])} for d in docs]


# ════════════════════════════════════════════════════════════════════════════
# Retrain  — re-run K-Means avec K demandé
# ════════════════════════════════════════════════════════════════════════════

class RetrainRequest(BaseModel):
    n_clusters: int = 4


@app.post("/api/retrain")
def retrain(req: RetrainRequest):
    """
    Relance le K-Means avec n_clusters (2–8), recalcule toutes les collections
    MongoDB et retourne le nouveau résumé.
    """
    if req.n_clusters < 2 or req.n_clusters > 8:
        raise HTTPException(status_code=422, detail="n_clusters doit être entre 2 et 8")

    try:
        from import_data import run_import
        run_import(n_clusters=req.n_clusters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrain échoué : {exc}") from exc

    doc = summary_col.find_one({"_id": "global"})
    if doc:
        doc.pop("_id")
    return {"status": "ok", "n_clusters": req.n_clusters, "summary": _sanitize(doc or {})}


# ════════════════════════════════════════════════════════════════════════════
# Chat AI  —  proxy vers OpenRouter
# ════════════════════════════════════════════════════════════════════════════

from typing import Literal
import httpx


class ChatMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model: str = "meta-llama/llama-3.3-70b-instruct:free"
    max_tokens: int = 1000
    system: str = ""
    messages: list[ChatMsg] = []
    # Champs envoyés par le frontend Angular
    message: str = ""
    history: list[ChatMsg] = []
    session_id: str | None = None


CHAT_SYSTEM_PROMPT = """You are SegmentIQ AI, an expert marketing analyst assistant for The3Beez e-commerce platform.
You help the user understand their customer segments and take concrete marketing actions.

IMPORTANT — STRUCTURED RESPONSE FORMAT:
When your answer includes a concrete marketing action (create a campaign, send whatsapp, create a segment),
you MUST return a JSON object with this exact structure (no markdown fences, raw JSON only):

{
  "response": "Your full conversational answer here (markdown supported: **bold**, *italic*, bullet lists with -)",
  "action": {
    "type": "create_campaign",
    "label": "Short action label shown on the button",
    "params": {
      "segment": "Segment name",
      "channel": "email",
      "subject": "Email subject line",
      "body": "Full message body",
      "discount": "15% off",
      "count": 1200
    }
  }
}

Action types:
- "create_campaign" → email, whatsapp, sms, or email+whatsapp campaigns
- "send_whatsapp"   → direct WhatsApp blast
- "create_segment"  → new custom segment (use params.filter_label for segment name)

If no action is needed, return ONLY:
{"response": "Your conversational answer here"}

Never wrap the JSON in markdown code fences. Always return valid JSON.
Always respond in the same language the user writes in (French or English).
"""


def _parse_chat_response(raw: str) -> dict:
    """Parse the LLM response: extract JSON {response, action?} or treat as plain text."""
    import json, re
    # Strip markdown fences if model wraps anyway
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and "response" in parsed:
            return parsed
    except Exception:
        pass
    # Fallback: look for embedded JSON block
    m = re.search(r'\{[\s\S]*"response"[\s\S]*\}', raw)
    if m:
        try:
            parsed = json.loads(m.group(0))
            if isinstance(parsed, dict) and "response" in parsed:
                return parsed
        except Exception:
            pass
    # No JSON found — return raw text as response, no action
    return {"response": raw}


@app.post("/api/chat")
def chat(req: ChatRequest):
    # Normalise les deux formats possibles
    if req.message and not req.messages:
        req.messages = req.history + [ChatMsg(role="user", content=req.message)]

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY manquant dans le fichier .env"
        )

    messages = []
    # Inject the default system prompt (caller can override with req.system)
    system_content = req.system if req.system else CHAT_SYSTEM_PROMPT
    messages.append({"role": "system", "content": system_content})
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "max_tokens": req.max_tokens,
                    "messages": messages,
                },
            )
        resp.raise_for_status()
        data = resp.json()
        raw_text = data["choices"][0]["message"]["content"]

        # Parse structured response — extracts {response, action?}
        parsed = _parse_chat_response(raw_text)
        return {
            "response": parsed.get("response", raw_text),
            "action":   parsed.get("action"),        # None if no action → frontend ignores it
            "content":  [{"type": "text", "text": parsed.get("response", raw_text)}],
        }
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════════════════════════════════════
# Config  —  K-Means configuration persisted in MongoDB
# ════════════════════════════════════════════════════════════════════════════

_config_col = db["config"]


@app.get("/api/config")
def get_config():
    """Retourne la configuration courante du modèle (n_clusters, scaler, etc.)."""
    doc = _config_col.find_one({"_id": "model"})
    if not doc:
        # Default config
        return {"n_clusters": 4, "random_state": 42, "n_init": 10, "scaler": "StandardScaler", "features": 10}
    doc.pop("_id")
    return doc


class ConfigApply(BaseModel):
    n_clusters:   int = 4
    random_state: int = 42
    n_init:       int = 10
    scaler:       str = "StandardScaler"
    features:     int = 10


@app.post("/api/config/apply")
def apply_config(req: ConfigApply):
    """
    Applique la configuration et relance le K-Means.
    Persiste la config dans MongoDB puis appelle run_import.
    """
    if req.n_clusters < 2 or req.n_clusters > 8:
        raise HTTPException(status_code=422, detail="n_clusters doit être entre 2 et 8")

    cfg = {"n_clusters": req.n_clusters, "random_state": req.random_state,
           "n_init": req.n_init, "scaler": req.scaler, "features": req.features}
    _config_col.replace_one({"_id": "model"}, {"_id": "model", **cfg}, upsert=True)

    try:
        from import_data import run_import
        run_import(n_clusters=req.n_clusters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrain échoué : {exc}") from exc

    doc = summary_col.find_one({"_id": "global"})
    if doc:
        doc.pop("_id")
    return {"status": "ok", **cfg, "summary": _sanitize(doc or {})}


# ════════════════════════════════════════════════════════════════════════════
# Campaigns  —  stockées en MongoDB
# ════════════════════════════════════════════════════════════════════════════

_campaigns_col  = db["campaigns"]
_email_col      = db["email_sends"]
_whatsapp_col   = db["whatsapp_sends"]


@app.get("/api/campaigns")
def get_campaigns():
    docs = list(_campaigns_col.find({}, {"_id": 0}))
    return {"campaigns": [_sanitize(d) for d in docs]}


@app.post("/api/campaigns")
def create_campaign(body: dict):
    if "id" not in body:
        import uuid
        body["id"] = str(uuid.uuid4())
    _campaigns_col.replace_one({"id": body["id"]}, body, upsert=True)
    return _sanitize(body)


@app.patch("/api/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, body: dict):
    _campaigns_col.update_one({"id": campaign_id}, {"$set": body})
    doc = _campaigns_col.find_one({"id": campaign_id}, {"_id": 0})
    return _sanitize(doc or {})


@app.patch("/api/campaigns/{campaign_id}/status")
def update_campaign_status(campaign_id: str, body: dict):
    status = body.get("status")
    _campaigns_col.update_one({"id": campaign_id}, {"$set": {"status": status}})
    return {"id": campaign_id, "status": status}


@app.delete("/api/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str):
    _campaigns_col.delete_one({"id": campaign_id})
    return {"deleted": campaign_id}


# ── Email sends ──────────────────────────────────────────────────────────────

@app.get("/api/email/sends")
def get_email_sends():
    docs = list(_email_col.find({}, {"_id": 0}))
    return {"sends": [_sanitize(d) for d in docs]}


@app.post("/api/email/sends")
def create_email_send(body: dict):
    if "id" not in body:
        import uuid
        body["id"] = str(uuid.uuid4())
    _email_col.replace_one({"id": body["id"]}, body, upsert=True)
    return _sanitize(body)


@app.patch("/api/email/sends/{send_id}/status")
def update_email_send_status(send_id: str, body: dict):
    status = body.get("status")
    _email_col.update_one({"id": send_id}, {"$set": {"status": status}})
    return {"id": send_id, "status": status}


@app.delete("/api/email/sends/{send_id}")
def delete_email_send(send_id: str):
    _email_col.delete_one({"id": send_id})
    return {"deleted": send_id}


# ── WhatsApp sends ───────────────────────────────────────────────────────────

@app.get("/api/whatsapp/sends")
def get_whatsapp_sends():
    docs = list(_whatsapp_col.find({}, {"_id": 0}))
    return {"sends": [_sanitize(d) for d in docs]}


@app.post("/api/whatsapp/sends")
def create_whatsapp_send(body: dict):
    if "id" not in body:
        import uuid
        body["id"] = str(uuid.uuid4())
    _whatsapp_col.replace_one({"id": body["id"]}, body, upsert=True)
    return _sanitize(body)


@app.patch("/api/whatsapp/{send_id}/status")
def update_whatsapp_send_status(send_id: str, body: dict):
    status = body.get("status")
    _whatsapp_col.update_one({"id": send_id}, {"$set": {"status": status}})
    return {"id": send_id, "status": status}


@app.delete("/api/whatsapp/sends/{send_id}")
def delete_whatsapp_send(send_id: str):
    _whatsapp_col.delete_one({"id": send_id})
    return {"deleted": send_id}


# ════════════════════════════════════════════════════════════════════════════
# Chat sessions  —  historique des conversations chatbot
# ════════════════════════════════════════════════════════════════════════════

_sessions_col = db["chat_sessions"]


@app.post("/api/chat/sessions")
def create_session():
    import uuid
    from datetime import datetime
    sid = str(uuid.uuid4())
    doc = {"_id": sid, "messages": [], "created_at": datetime.utcnow().isoformat()}
    _sessions_col.insert_one(doc)
    return {"session_id": sid}


@app.get("/api/chat/sessions")
def list_sessions():
    docs = list(_sessions_col.find({}, {"messages": 0}).sort("created_at", -1).limit(50))
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"sessions": docs}


@app.get("/api/chat/sessions/{session_id}")
def get_session(session_id: str):
    doc = _sessions_col.find_one({"_id": session_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Session introuvable")
    doc["_id"] = str(doc["_id"])
    return _sanitize(doc)


@app.delete("/api/chat/sessions/{session_id}")
def delete_session(session_id: str):
    _sessions_col.delete_one({"_id": session_id})
    return {"deleted": session_id}


@app.patch("/api/chat/sessions/{session_id}/messages")
def append_message(session_id: str, body: dict):
    from datetime import datetime
    msg = {"role": body.get("role"), "content": body.get("content"), "ts": datetime.utcnow().isoformat()}
    _sessions_col.update_one({"_id": session_id}, {"$push": {"messages": msg}})
    return {"ok": True}


# ════════════════════════════════════════════════════════════════════════════
# Alerts  —  générées depuis le summary (At Risk %, etc.)
# ════════════════════════════════════════════════════════════════════════════

_alerts_col = db["alerts"]


@app.get("/api/alerts")
def get_alerts():
    """
    Génère des alertes dynamiques basées sur les données réelles MongoDB.
    Compare les segments courants à des seuils définis.
    """
    _check_mongo()
    alerts = []

    # Récupérer les counts de segments
    segs = list(segments_meta_col.find())
    total = sum(s.get("count", 0) for s in segs)

    if total > 0:
        for seg in segs:
            name = seg.get("name", "")
            count = seg.get("count", 0)
            pct = count / total * 100

            # Alerte si At Risk > 35%
            if name.lower() in ("at risk",) and pct > 35:
                existing = _alerts_col.find_one({"type": "at_risk_high", "acknowledged": False})
                if not existing:
                    import uuid
                    alert = {
                        "_id": str(uuid.uuid4()),
                        "type": "at_risk_high",
                        "segment": name,
                        "current_pct": round(pct, 1),
                        "baseline_pct": round(pct - 5, 1),
                        "delta": 5.0,
                        "acknowledged": False,
                        "severity": "warning",
                        "message": f"Segment '{name}' représente {pct:.1f}% des clients — action recommandée.",
                    }
                    _alerts_col.replace_one({"type": "at_risk_high"}, alert, upsert=True)

            # Alerte si Lost > 40%
            if name.lower() == "lost" and pct > 40:
                existing = _alerts_col.find_one({"type": "lost_high", "acknowledged": False})
                if not existing:
                    import uuid
                    alert = {
                        "_id": str(uuid.uuid4()),
                        "type": "lost_high",
                        "segment": name,
                        "current_pct": round(pct, 1),
                        "baseline_pct": round(pct - 8, 1),
                        "delta": 8.0,
                        "acknowledged": False,
                        "severity": "error",
                        "message": f"Segment '{name}' représente {pct:.1f}% — taux de churn élevé.",
                    }
                    _alerts_col.replace_one({"type": "lost_high"}, alert, upsert=True)

    active = list(_alerts_col.find({"acknowledged": False}, {"_id": 1, "type": 1, "segment": 1,
                                    "current_pct": 1, "baseline_pct": 1, "delta": 1,
                                    "severity": 1, "message": 1}))
    for a in active:
        a["_id"] = str(a["_id"])
    return {"alerts": active}


@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    _alerts_col.update_one({"_id": alert_id}, {"$set": {"acknowledged": True}})
    return {"ok": True, "acknowledged": alert_id}


# ════════════════════════════════════════════════════════════════════════════
# Custom segments  —  créés depuis le chatbot
# ════════════════════════════════════════════════════════════════════════════

_custom_segs_col = db["segments_custom"]


@app.post("/api/segments/custom")
def create_custom_segment(body: dict):
    import uuid
    from datetime import datetime
    doc = {
        "_id": str(uuid.uuid4()),
        "label":      body.get("label", "Custom Segment"),
        "filter":     body.get("filter", {}),
        "created_at": datetime.utcnow().isoformat(),
    }
    # Compter les clients qui matchent le filtre dans segments_feat
    filt = {}
    f = body.get("filter", {})
    if f.get("seg") is not None:
        filt["seg"] = int(f["seg"])
    if f.get("region"):
        filt["region"] = {"$regex": f["region"], "$options": "i"}
    if f.get("gender"):
        filt["gender"] = {"$regex": f["gender"], "$options": "i"}
    doc["count"] = segments_feat_col.count_documents(filt)
    _custom_segs_col.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return _sanitize(doc)


@app.post("/api/whatsapp/send")
def send_whatsapp_message(body: dict):
    """Envoie un message WhatsApp à un segment (stocke la demande dans MongoDB)."""
    import uuid
    from datetime import datetime
    doc = {
        "id": str(uuid.uuid4()),
        "segment": body.get("segment", "All Customers"),
        "message": body.get("message", ""),
        "status":  "queued",
        "created_at": datetime.utcnow().isoformat(),
    }
    _whatsapp_col.insert_one({**doc, "_id": doc["id"]})
    return _sanitize(doc)


@app.get("/api/segments/custom")
def get_custom_segments():
    """Retourne les segments personnalisés créés depuis le chatbot."""
    docs = list(_custom_segs_col.find().sort("created_at", -1).limit(50))
    for d in docs:
        d["_id"] = str(d["_id"])
    return {"segments": [_sanitize(d) for d in docs]}