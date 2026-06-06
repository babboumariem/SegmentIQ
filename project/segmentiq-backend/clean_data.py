"""
clean_data.py — SegmentIQ data cleaning for The3Beez real data.

Sources utilisées :
  - The3B.User.csv                → customers
  - The3B.UserAddress.csv         → region (governorate) per user
  - The3B.Product.csv             → products
  - The3B.ProductCategory.csv     → category names
  - The3B.ProductIngredient.csv   → ingredients per product
  - The3B.Collection.csv          → product collections
  - The3B.ProductForCollection.csv→ product ↔ collection map
  - The3B.UserPurshase.csv        → orders (structure wide, jusqu'à 36 items/ligne)
  - The3B.PaymentLog.csv          → payment gateway / status par promo code
  - The3B.Offer.csv               → détails des codes promo
  - The3B.Country.csv             → country id → nom lisible

Sources exclues :
  - The3B.DeliveryRequest.csv     → fichier vide dans ce dataset
  - The3B.ProductTesterSetting.csv → stock distributor, sans valeur analytique client
  - The3B.PaymentRequest.csv      → 636 MB, UserId souvent null, doublon avec PaymentLog

Structure de The3B.UserPurshase.csv :
  Colonnes ordre  : _id, UserID, CreationDate, Status, FullAmount, PaymentMethod,
                    CountryID, PromotionCode, Source, ...
  Colonnes items  : ListPurshaseItems[i].TypeId, .Price[0].Price, .Price[0].SalePrice,
                    .Price[0].InSale, .Quantity, .DiscountValue  (i = 0..35)
  Status values   : 1=Paid, 3=Returned, 4=Canceled (entiers)
"""

import re

import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────────
# Mappings
# ─────────────────────────────────────────────────────────────────

_CHANNEL_MAP = {0: "Cash", 1: "KNET", 2: "Credit Card", 3: "Online"}
_SOURCE_MAP   = {0: "Web", 1: "Mobile App"}

# Status entiers dans UserPurshase
_STATUS_OK       = {1}            # Paid / livré
_STATUS_RETURNED = {3, 4}         # Returned / Canceled

MAX_ITEMS = 36  # max items par commande dans UserPurshase


# ─────────────────────────────────────────────────────────────────
# Country lookup
# ─────────────────────────────────────────────────────────────────

def _build_country_lookup(country_path):
    """
    Retourne {code_lower -> name} depuis The3B.Country.csv.
    Exemple : {'kw': 'Kuwait', 'sa': 'Saudi Arabia', ...}
    """
    if not country_path:
        return {}
    try:
        df = pd.read_csv(country_path, low_memory=False)
        df.columns = df.columns.str.strip()
        if "Code" not in df.columns or "Name.En" not in df.columns:
            return {}
        df = df[df["IsDeleted"].astype(str).str.lower() != "true"]
        df = df[df["Name.En"].notna() & ~df["Name.En"].str.lower().isin(["test", "vfds", "ar"])]
        return {
            str(row["Code"]).strip().lower(): str(row["Name.En"]).strip()
            for _, row in df.iterrows()
            if str(row["Code"]).strip().lower() not in ("", "nan")
        }
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────
# Payment gateway lookup via PaymentLog
# ─────────────────────────────────────────────────────────────────

def _build_payment_gateway_lookup(payment_log_path):
    """
    Retourne {promotion_code -> gateway} depuis The3B.PaymentLog.csv.
    """
    if not payment_log_path:
        return {}
    try:
        needed = ["PromotionCode", "PaymentGateway", "Status"]
        df = pd.read_csv(payment_log_path, usecols=needed, low_memory=False)
        df.columns = df.columns.str.strip()
        df = df[df["Status"] == "Paid"]
        df = df[df["PromotionCode"].notna() & (df["PromotionCode"].astype(str).str.strip() != "")]
        gw = (
            df.groupby("PromotionCode")["PaymentGateway"]
            .agg(lambda x: x.value_counts().index[0] if len(x) > 0 else None)
        )
        return gw.to_dict()
    except Exception:
        return {}


def _build_payment_stats(payment_log_path):
    """Stats globales de paiement pour le summary MongoDB.

    Total Revenue = transactions PaymentLog Status='Paid', dédupliquées sur
    InvoiceId (supprime les doublons de retentatives gateway).
    Valeur de référence vérifiée sur données brutes : 2,894,094 KD.
    """
    if not payment_log_path:
        return {}
    try:
        needed = ["Status", "PaymentGateway", "InvoiceId", "TransationValue"]
        df = pd.read_csv(payment_log_path, usecols=needed, low_memory=False)
        df.columns = df.columns.str.strip()
        total = len(df)

        gw_dist     = {k: int(v) for k, v in df["PaymentGateway"].value_counts().head(10).items()}
        status_dist = {k: int(v) for k, v in df["Status"].value_counts().items()}
        failure_rate = round(
            df[df["Status"] == "Payment Failure"].shape[0] / total * 100, 2
        ) if total > 0 else 0.0

        # ── Total Revenue : Paid dédupliqué sur InvoiceId ──────────
        paid = df[df["Status"].str.strip() == "Paid"].copy()
        paid["TransationValue"] = pd.to_numeric(paid["TransationValue"], errors="coerce").fillna(0)
        paid_dedup = paid.drop_duplicates(subset="InvoiceId", keep="first")
        total_revenue = round(float(paid_dedup["TransationValue"].sum()), 2)   # 2,894,094 KD

        return {
            "gateway_distribution": gw_dist,
            "payment_status_dist":  status_dist,
            "payment_failure_rate": failure_rate,
            "total_payment_logs":   total,
            "total_revenue":        total_revenue,   # valeur fiable depuis PaymentLog dédupliqué
        }
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────
# Offer lookup
# ─────────────────────────────────────────────────────────────────

def _build_offer_lookup(offer_path):
    """
    Retourne {promotion_code -> offer_info} depuis The3B.Offer.csv.
    """
    if not offer_path:
        return {}
    REDUCTION_TYPE_MAP = {0: "Percentage", 1: "Fixed", 2: "Free Shipping", 3: "Buy X Get Y"}
    try:
        df = pd.read_csv(offer_path, low_memory=False)
        df.columns = df.columns.str.strip()
        df = df[df["PromotionCode"].notna()]
        lookup = {}
        for _, row in df.iterrows():
            code = str(row["PromotionCode"]).strip()
            if not code:
                continue
            rt = int(row["Action.ReductionType"]) if pd.notna(row.get("Action.ReductionType")) else -1
            lookup[code] = {
                "offer_name":        str(row.get("Name", "") or "").strip(),
                "reduction_type":    REDUCTION_TYPE_MAP.get(rt, "Unknown"),
                "reduction_value":   float(row["Action.ReductionValue"])
                                     if pd.notna(row.get("Action.ReductionValue")) else 0.0,
                "is_auto_offer":     bool(row.get("IsGeneratedAutomated", False)),
                "offer_usage_count": int(row["CurrentNumberOfTime"])
                                     if pd.notna(row.get("CurrentNumberOfTime")) else 0,
            }
        return lookup
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────
# Product enrichment helpers
# ─────────────────────────────────────────────────────────────────

def _build_ingredients_lookup(ingredients_path):
    """Retourne {product_id -> [ingredient_name, ...]}."""
    if not ingredients_path:
        return {}
    try:
        df = pd.read_csv(ingredients_path, low_memory=False)
        df.columns = df.columns.str.strip()
        df = df[df["ProductId"].notna() & df["Ingredient"].notna()]
        df["ProductId"]  = df["ProductId"].astype(str).str.strip()
        df["Ingredient"] = df["Ingredient"].astype(str).str.strip()
        return df.groupby("ProductId")["Ingredient"].apply(list).to_dict()
    except Exception:
        return {}


def _build_collection_lookup(collection_path, product_for_collection_path):
    """Retourne {product_id -> collection_name}."""
    if not collection_path or not product_for_collection_path:
        return {}
    try:
        col_df = pd.read_csv(collection_path, low_memory=False)
        col_df.columns = col_df.columns.str.strip()
        name_col = "Name.En" if "Name.En" in col_df.columns else col_df.columns[1]
        col_df = col_df[col_df["IsDeleted"].astype(str).str.lower() != "true"]
        col_name_map = dict(zip(col_df["_id"].astype(str), col_df[name_col].astype(str)))

        pfc_df = pd.read_csv(product_for_collection_path, low_memory=False)
        pfc_df.columns = pfc_df.columns.str.strip()
        pfc_df = pfc_df[pfc_df["IsDeleted"].astype(str).str.lower() != "true"]
        pfc_df = pfc_df[pfc_df["ProductId"].notna() & pfc_df["CollectionId"].notna()]
        pfc_df["ProductId"]    = pfc_df["ProductId"].astype(str).str.strip()
        pfc_df["CollectionId"] = pfc_df["CollectionId"].astype(str).str.strip()

        pfc_df["collection_name"] = pfc_df["CollectionId"].map(col_name_map)
        first = (
            pfc_df[pfc_df["collection_name"].notna()]
            .drop_duplicates("ProductId")
            .set_index("ProductId")["collection_name"]
        )
        return first.to_dict()
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────────────────────────

def clean_customers(users_path, addresses_path=None):
    user = pd.read_csv(users_path, low_memory=False)
    user.columns = user.columns.str.strip()

    df = pd.DataFrame()
    df["customer_id"]         = user["_id"].astype(str)
    df["gender"]              = user["Gender"].fillna("Unknown").astype(str).str.strip()
    df["acquisition_channel"] = "App/Web"
    df["phone"]               = user["PhoneNumber"].fillna("").astype(str).str.strip()

    if "Birthday" in user.columns:
        bday = pd.to_datetime(user["Birthday"], errors="coerce", utc=True).dt.tz_localize(None)
        ref  = pd.Timestamp("2024-01-01")
        df["age"] = ((ref - bday).dt.days / 365.25).round(0).astype("Int64")
    else:
        df["age"] = np.nan

    df["region"] = "Kuwait"
    if addresses_path:
        try:
            addr = pd.read_csv(addresses_path, low_memory=False)
            addr.columns = addr.columns.str.strip()
            gov_col = next((c for c in addr.columns if "Government.EnglishName" in c), None)
            if gov_col and "UserId" in addr.columns:
                first = (
                    addr[["UserId", gov_col]].dropna()
                    .drop_duplicates("UserId")
                    .rename(columns={"UserId": "customer_id", gov_col: "region_addr"})
                )
                df = df.merge(first, on="customer_id", how="left")
                df["region"] = df["region_addr"].fillna("Kuwait")
                df.drop(columns=["region_addr"], inplace=True)
        except Exception:
            pass

    df["region"] = df["region"].fillna("Kuwait").astype(str).str.strip()
    df["gender"] = df["gender"].replace({"": "Unknown", "nan": "Unknown"})
    df = df.drop_duplicates("customer_id").reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────
# Products  (enrichi avec ingredients + collections)
# ─────────────────────────────────────────────────────────────────

def clean_products(
    products_path,
    categories_path=None,
    ingredients_path=None,
    collection_path=None,
    product_for_collection_path=None,
):
    prod = pd.read_csv(products_path, low_memory=False)
    prod.columns = prod.columns.str.strip()

    # Category lookup
    cat_lookup = {}
    if categories_path:
        try:
            cat_df = pd.read_csv(categories_path, low_memory=False)
            cat_df.columns = cat_df.columns.str.strip()
            name_col = "Name.En" if "Name.En" in cat_df.columns else cat_df.columns[0]
            cat_lookup = dict(zip(cat_df["_id"].astype(str), cat_df[name_col].astype(str)))
        except Exception:
            pass

    df = pd.DataFrame()
    df["product_id"] = prod["_id"].astype(str)
    df["sku"]        = prod["SKU"].fillna("").astype(str).str.strip()

    title_col = "Title.En" if "Title.En" in prod.columns else None
    df["name"] = prod[title_col].fillna("").astype(str).str.strip() if title_col else ""

    cat_cols = [c for c in prod.columns if re.match(r"Category\[\d+\]$", c)]
    if cat_cols:
        def _first_cat(row):
            for c in cat_cols:
                v = row.get(c)
                if pd.notna(v) and str(v).strip() not in ("", "nan", "0"):
                    return cat_lookup.get(str(v).strip(), str(v).strip())
            return "Other"
        df["category"] = prod[cat_cols].apply(_first_cat, axis=1)
    else:
        df["category"] = "Other"

    price_col      = next((c for c in prod.columns if "PriceByCountry" in c and ".Price" in c and "Sale" not in c and "DHL" not in c), None)
    sale_price_col = next((c for c in prod.columns if "PriceByCountry" in c and "SalePrice" in c), None)
    in_sale_col    = next((c for c in prod.columns if "PriceByCountry" in c and "InSale" in c), None)
    qty_col        = next((c for c in prod.columns if "PriceByCountry" in c and "Quantity" in c), None)

    df["price_kwd"]      = pd.to_numeric(prod[price_col],      errors="coerce").fillna(0) if price_col      else 0
    df["sale_price_kwd"] = pd.to_numeric(prod[sale_price_col], errors="coerce").fillna(0) if sale_price_col else 0
    df["in_sale"]        = prod[in_sale_col].fillna(False).astype(bool)                   if in_sale_col    else False
    df["stock"]          = pd.to_numeric(prod[qty_col], errors="coerce").fillna(0)        if qty_col        else 0

    ingredients_map = _build_ingredients_lookup(ingredients_path)
    if ingredients_map:
        df["ingredients"]      = df["product_id"].map(lambda pid: ", ".join(ingredients_map.get(pid, [])))
        df["ingredient_count"] = df["product_id"].map(lambda pid: len(ingredients_map.get(pid, [])))
    else:
        df["ingredients"]      = ""
        df["ingredient_count"] = 0

    collection_map = _build_collection_lookup(collection_path, product_for_collection_path)
    df["collection"] = df["product_id"].map(collection_map).fillna("") if collection_map else ""

    df = df.drop_duplicates("product_id").reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────
# _iter_items_from_wide : générateur d'items depuis la structure wide
# ─────────────────────────────────────────────────────────────────

def _iter_items_from_wide(row, max_items=MAX_ITEMS):
    """
    Itère sur les items d'une ligne UserPurshase (structure wide).
    Yield des dicts : {product_id, price, sale_price, in_sale, qty, discount_value}
    """
    for i in range(max_items):
        pid = row.get(f"ListPurshaseItems[{i}].TypeId")
        if pid is None or (isinstance(pid, float) and np.isnan(pid)):
            continue   # FIX: continue au lieu de break — les slots peuvent être non-contigus
        pid = str(pid).strip()
        if not pid or pid in ("nan", "0", "None"):
            continue   # FIX: idem

        def _n(v, default=0.0):
            try:
                f = float(v)
                return f if not np.isnan(f) else float(default)
            except Exception:
                return float(default)

        price      = _n(row.get(f"ListPurshaseItems[{i}].Price[0].Price", 0))
        sale_price = _n(row.get(f"ListPurshaseItems[{i}].Price[0].SalePrice", 0))
        in_sale    = str(row.get(f"ListPurshaseItems[{i}].Price[0].InSale", "False")).lower() == "true"
        qty        = max(_n(row.get(f"ListPurshaseItems[{i}].Quantity", 1), 1), 1)
        disc_val   = _n(row.get(f"ListPurshaseItems[{i}].DiscountValue", 0))

        yield {
            "product_id":     pid,
            "price":          price,
            "sale_price":     sale_price,
            "in_sale":        in_sale,
            "qty":            qty,
            "discount_value": disc_val,
        }


# ─────────────────────────────────────────────────────────────────
# Orders  (depuis The3B.UserPurshase.csv — structure wide)
# ─────────────────────────────────────────────────────────────────

def clean_orders(
    purchase_path,
    categories_path=None,
    products_path=None,
    country_path=None,
    payment_log_path=None,
    offer_path=None,
    ingredients_path=None,
    collection_path=None,
    product_for_collection_path=None,
):
    """
    Lit The3B.UserPurshase.csv (structure wide, jusqu'à 36 items/ligne),
    explose par item et retourne un DataFrame nettoyé.

    Paramètre principal : purchase_path  (anciennement delivery_path)
    """
    # ── Lookup tables ─────────────────────────────────────────────
    prod_cat_map = {}
    if products_path and categories_path:
        try:
            prods = clean_products(
                products_path, categories_path,
                ingredients_path, collection_path, product_for_collection_path,
            )
            prod_cat_map = dict(zip(prods["product_id"].astype(str), prods["category"].astype(str)))
        except Exception:
            pass

    country_lookup = _build_country_lookup(country_path)
    gw_lookup      = _build_payment_gateway_lookup(payment_log_path)
    offer_lookup   = _build_offer_lookup(offer_path)

    # ── Colonnes à lire ───────────────────────────────────────────
    order_cols = {
        "_id", "UserID", "CreationDate", "FullAmount",
        "PaymentMethod", "CountryID", "PromotionCode", "Source", "Status",
    }
    item_col_patterns = [
        r"ListPurshaseItems\[\d+\]\.(TypeId|Quantity|DiscountValue)$",
        r"ListPurshaseItems\[\d+\]\.Price\[0\]\.(Price|SalePrice|InSale)$",
    ]

    def _keep_col(c):
        if c in order_cols:
            return True
        for pat in item_col_patterns:
            if re.match(pat, c):
                return True
        return False

    df_raw = pd.read_csv(purchase_path, usecols=_keep_col, low_memory=False)
    df_raw.columns = df_raw.columns.str.strip()

    # Garder uniquement les commandes Paid (Status=1)
    if "Status" in df_raw.columns:
        df_raw = df_raw[df_raw["Status"].isin(_STATUS_OK)]

    # Filtrer UserID null / 0 / anonyme (guest = 000000000000000000000000)
    _NULL_USER_IDS = {"", "0", "none", "nan", "000000000000000000000000"}
    df_raw = df_raw[
        df_raw["UserID"].notna() &
        ~df_raw["UserID"].astype(str).str.strip().str.lower().isin(_NULL_USER_IDS)
    ]

    # ── Construire les lignes explodées ───────────────────────────
    rows = []
    for _, r in df_raw.iterrows():
        order_id    = str(r["_id"])
        customer_id = str(r["UserID"])
        order_date  = pd.to_datetime(r.get("CreationDate"), errors="coerce", utc=True)
        if order_date is not pd.NaT:
            try:
                order_date = order_date.tz_localize(None)
            except Exception:
                pass

        pm = r.get("PaymentMethod")
        try:
            channel = _CHANNEL_MAP.get(int(float(pm)), "Other") if pd.notna(pm) else "Other"
        except Exception:
            channel = "Other"

        src = r.get("Source")
        try:
            source = _SOURCE_MAP.get(int(float(src)), "Web") if pd.notna(src) else "Web"
        except Exception:
            source = "Web"

        raw_country = str(r.get("CountryID", "kw") or "kw").strip().lower()
        country     = country_lookup.get(raw_country, raw_country.upper()) if country_lookup else raw_country

        promo_code      = str(r.get("PromotionCode") or "").strip()
        payment_gateway = gw_lookup.get(promo_code, "") if promo_code else ""
        offer_info      = offer_lookup.get(promo_code, {}) if promo_code else {}
        offer_name      = offer_info.get("offer_name", "")
        reduction_type  = offer_info.get("reduction_type", "")
        reduction_value = offer_info.get("reduction_value", 0.0)
        is_auto_offer   = offer_info.get("is_auto_offer", False)

        full_total = float(r.get("FullAmount") or 0)

        items = list(_iter_items_from_wide(r))

        if not items:
            rows.append({
                "order_id":        order_id,
                "customer_id":     customer_id,
                "order_date":      order_date,
                "net_amount_kwd":  full_total,
                "discount_pct":    0.0,
                "product_id":      "unknown",
                "category":        "Other",
                "channel":         channel,
                "source":          source,
                "country":         country,
                "promo_code":      promo_code,
                "payment_gateway": payment_gateway,
                "offer_name":      offer_name,
                "reduction_type":  reduction_type,
                "reduction_value": reduction_value,
                "is_auto_offer":   is_auto_offer,
            })
            continue

        # Calcul du total brut des items (avant réduction globale)
        gross_items_total = 0.0
        for item in items:
            unit_price = item["sale_price"] if (item["in_sale"] and item["sale_price"] > 0) else item["price"]
            gross_items_total += unit_price * item["qty"]

        for item in items:
            pid = item["product_id"]
            cat = prod_cat_map.get(pid, "Other")
            qty = item["qty"]

            unit_price = item["sale_price"] if (item["in_sale"] and item["sale_price"] > 0) else item["price"]
            item_gross = unit_price * qty

            # Distribuer full_total proportionnellement au poids de chaque item
            # Cela garantit que la somme des net_amount_kwd == FullAmount de la commande
            if gross_items_total > 0:
                net = round(full_total * (item_gross / gross_items_total), 3)
            else:
                net = round(full_total / len(items), 3)

            # Calcul du discount_pct pour information (comparaison prix brut item vs part allouée)
            disc_pct = round((1 - net / item_gross) * 100, 2) if item_gross > 0 else 0.0
            disc_pct = max(disc_pct, 0.0)  # pas de discount négatif

            rows.append({
                "order_id":        order_id,
                "customer_id":     customer_id,
                "order_date":      order_date,
                "net_amount_kwd":  net,
                "discount_pct":    disc_pct,
                "product_id":      pid,
                "category":        cat,
                "channel":         channel,
                "source":          source,
                "country":         country,
                "promo_code":      promo_code,
                "payment_gateway": payment_gateway,
                "offer_name":      offer_name,
                "reduction_type":  reduction_type,
                "reduction_value": reduction_value,
                "is_auto_offer":   is_auto_offer,
            })

    orders = pd.DataFrame(rows)
    if orders.empty:
        return orders

    orders["net_amount_kwd"] = pd.to_numeric(orders["net_amount_kwd"], errors="coerce").fillna(0)
    orders["discount_pct"]   = pd.to_numeric(orders["discount_pct"],   errors="coerce").fillna(0)
    # FIX: Exclure les commandes gratuites / à montant nul (IsFreeOrder, tests, etc.)
    # Ces commandes (≈5.7% du total) faussent les moyennes mensuelles par client,
    # provoquant des chutes artificielles à ~0 KWD sur le graphique Monthly Spend Trend.
    orders = orders[orders["net_amount_kwd"] > 0]
    orders = orders.drop_duplicates().reset_index(drop=True)
    return orders


# ─────────────────────────────────────────────────────────────────
# Returns  (UserPurshase rows avec Status Returned/Canceled)
# ─────────────────────────────────────────────────────────────────

def clean_returns(purchase_path):
    """
    Lit les lignes Returned/Canceled depuis The3B.UserPurshase.csv.
    Status 3 = Returned, 4 = Canceled.

    Les lignes avec UserID null (000000000000000000000000) sont conservées
    avec customer_id="__unattributed__" afin que leur montant soit bien
    déduit du total_revenue global (net = gross - ALL refunds).
    Elles ne seront pas rattachées à un segment.
    """
    needed = {"_id", "UserID", "UpdatedDate", "FullAmount", "Status", "Note"}
    df = pd.read_csv(purchase_path, usecols=lambda c: c in needed, low_memory=False)
    df.columns = df.columns.str.strip()

    ret = df[df["Status"].isin(_STATUS_RETURNED)].copy()

    # Remplacer les UserID nuls par "__unattributed__" au lieu de les supprimer
    # → leur montant sera déduit du total_revenue global mais pas d'un segment
    NULL_IDS = {"", "0", "none", "nan", "000000000000000000000000"}
    ret = ret[ret["UserID"].notna()].copy()
    null_mask = ret["UserID"].astype(str).str.strip().str.lower().isin(NULL_IDS)
    ret.loc[null_mask, "UserID"] = "__unattributed__"

    out = pd.DataFrame()
    out["return_id"]         = ret["_id"].astype(str).values
    out["customer_id"]       = ret["UserID"].astype(str).values
    out["return_date"]       = pd.to_datetime(
        ret.get("UpdatedDate", pd.Series(dtype=str)), errors="coerce", utc=True
    ).dt.tz_localize(None).values
    out["refund_amount_kwd"] = pd.to_numeric(ret["FullAmount"], errors="coerce").fillna(0).values
    out["return_status"]     = ret["Status"].map({3: "Returned", 4: "Canceled"}).fillna("Unknown").values
    out["return_reason"]     = ret["Note"].fillna("Not specified").astype(str).values if "Note" in ret.columns else "Not specified"

    out = out.drop_duplicates("return_id").reset_index(drop=True)
    return out


# ─────────────────────────────────────────────────────────────────
# Payment stats  (exposé pour import_data.py)
# ─────────────────────────────────────────────────────────────────

def get_payment_stats(payment_log_path):
    """Retourne les stats globales de paiement pour le summary MongoDB."""
    return _build_payment_stats(payment_log_path)