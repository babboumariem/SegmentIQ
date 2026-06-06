"""
segment_engine.py
-----------------
Feature engineering + K-Means (K=4) + PCA 2D for SegmentIQ.
Accepts pre-cleaned DataFrames (no CSV reading here).
"""

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

# ── Segment metadata ────────────────────────────────────────────────────────
SEGMENTS = [
    {
        "id": 0,
        "name": "VIP",
        "icon": "👑",
        "color": "#f59e0b",
        "colorBg": "rgba(245,158,11,.12)",
        "description": "High spend, frequent buyers, recent activity — your most valuable customers.",
    },
    {
        "id": 1,
        "name": "Loyal",
        "icon": "💚",
        "color": "#10b981",
        "colorBg": "rgba(16,185,129,.12)",
        "description": "Regular buyers with consistent engagement and solid lifetime value.",
    },
    {
        "id": 2,
        "name": "At Risk",
        "icon": "⚠️",
        "color": "#8b5cf6",
        "colorBg": "rgba(139,92,246,.12)",
        "description": "Previously active customers who are now drifting away — re-engagement needed.",
    },
    {
        "id": 3,
        "name": "Lost",
        "icon": "💤",
        "color": "#ef4444",
        "colorBg": "rgba(239,68,68,.12)",
        "description": "Low spend, high recency, very infrequent. Churn risk.",
    },
]

FEATURE_NAMES = [
    "total_spend", "order_count", "recency", "aov",
    "avg_discount", "active_months", "return_rate", "diversity",
    "spend_velocity", "clv_slope",
]

ACTIONS = {
    0: [
        "Offer VIP early-access to new honey collections",
        "Send personalised thank-you gift with next order",
        "Invite to exclusive loyalty tier with free delivery",
        "Feature in social proof / ambassador programme",
    ],
    1: [
        "Bundle deal: buy 2 get 10% off on top categories",
        "Monthly newsletter with new arrivals & recipes",
        "Birthday / anniversary discount coupon",
        "Cross-sell complementary products (bee products, accessories)",
    ],
    2: [
        "Win-back campaign: 15% discount limited 7 days",
        "Re-engagement WhatsApp message with personalised offer",
        "Highlight new products since last purchase",
        "Ask for feedback to understand drop-off reason",
    ],
    3: [
        "Last-chance offer: heavy discount (20%+) to reactivate",
        "Low-cost re-engagement SMS / WhatsApp nudge",
        "Survey to collect reason for churn",
        "Consider removing from active marketing to save cost",
    ],
}


# ── Main build function ──────────────────────────────────────────────────────

def build_segments(
    cust_df: pd.DataFrame,
    orders_df: pd.DataFrame,
    returns_df: pd.DataFrame,
    prods_df: pd.DataFrame,
    n_clusters: int = 4,
    true_total_revenue: float | None = None,
):
    """
    Build segments from pre-cleaned DataFrames.
    Expected columns:
      orders_df  : order_id, customer_id, order_date, net_amount_kwd,
                   discount_pct, product_id, category, channel
      returns_df : return_id, customer_id, refund_amount_kwd, return_status,
                   return_reason
      cust_df    : customer_id, gender, region, acquisition_channel
      prods_df   : product_id, name, category, price_kwd
    """
    orders  = orders_df.copy()
    returns = returns_df.copy()
    cust    = cust_df.copy()

    # FIX: exclure toute ligne guest/anonyme qui aurait passé le nettoyage amont
    _GHOST_IDS = {"__unattributed__", "000000000000000000000000", "0", ""}
    orders = orders[~orders["customer_id"].astype(str).str.strip().isin(_GHOST_IDS)].copy()

    orders["order_date"]     = pd.to_datetime(orders["order_date"],    errors="coerce")
    orders["net_amount_kwd"] = pd.to_numeric(orders["net_amount_kwd"], errors="coerce").fillna(0)
    orders["discount_pct"]   = pd.to_numeric(orders["discount_pct"],   errors="coerce").fillna(0)

    # Drop rows without a valid date
    orders = orders.dropna(subset=["order_date"])

    ref_date = orders["order_date"].max()

    # ── Per-customer features ────────────────────────────────────────────────
    grp = orders.groupby("customer_id")

    feat = pd.DataFrame()
    feat["total_spend"]   = grp["net_amount_kwd"].sum()
    feat["order_count"]   = grp["order_id"].nunique()          # unique orders
    feat["recency"]       = (ref_date - grp["order_date"].max()).dt.days
    feat["aov"]           = feat["total_spend"] / feat["order_count"].replace(0, np.nan)
    feat["avg_discount"]  = grp["discount_pct"].mean() / 100
    feat["unique_cats"]   = grp["category"].nunique()
    feat["unique_prods"]  = grp["product_id"].nunique()

    orders["_month"] = orders["order_date"].dt.to_period("M")
    feat["active_months"] = orders.groupby("customer_id")["_month"].nunique()

    for days, col in [(30, "spend_30"), (90, "spend_90"), (365, "spend_365")]:
        mask = orders["order_date"] >= ref_date - pd.Timedelta(days=days)
        feat[col] = orders[mask].groupby("customer_id")["net_amount_kwd"].sum()

    for days, col in [(30, "orders_30"), (90, "orders_90"), (365, "orders_365")]:
        mask = orders["order_date"] >= ref_date - pd.Timedelta(days=days)
        feat[col] = orders[mask].groupby("customer_id")["order_id"].nunique()

    feat = feat.fillna(0)

    # Returns
    if "refund_amount_kwd" in returns.columns:
        returns["refund_amount_kwd"] = pd.to_numeric(
            returns["refund_amount_kwd"], errors="coerce").fillna(0)
    else:
        returns["refund_amount_kwd"] = 0.0

    ret_cnt = returns.groupby("customer_id").size().reindex(feat.index).fillna(0)
    ret_amt = returns.groupby("customer_id")["refund_amount_kwd"].sum().reindex(feat.index).fillna(0)
    feat["return_rate"]  = ret_cnt / feat["order_count"].replace(0, np.nan)
    feat["refund_ratio"] = ret_amt / feat["total_spend"].replace(0, np.nan)
    feat = feat.fillna(0)

    feat["diversity"]      = feat["unique_cats"] / feat["order_count"].replace(0, np.nan)
    feat["spend_velocity"] = feat["total_spend"] / feat["active_months"].replace(0, np.nan)
    feat = feat.fillna(0)

    # CLV slope (linear trend of monthly spend)
    monthly_pivot = (
        orders.groupby(["customer_id", "_month"])["net_amount_kwd"].sum()
        .reset_index()
    )
    monthly_pivot["_t"] = monthly_pivot.groupby("customer_id")["_month"].transform(
        lambda x: (x - x.min()).apply(lambda p: p.n if hasattr(p, "n") else 0)
    )

    clv_slope_map: dict = {}
    for cid, grp_df in monthly_pivot.groupby("customer_id"):
        if len(grp_df) < 2:
            clv_slope_map[cid] = 0.0
            continue
        x = grp_df["_t"].values.astype(float)
        y = grp_df["net_amount_kwd"].values.astype(float)
        try:
            slope = float(np.polyfit(x, y, 1)[0])
        except Exception:
            slope = 0.0
        clv_slope_map[cid] = slope

    feat = feat.reset_index()
    feat.rename(columns={"customer_id": "customer_id"}, inplace=True)
    feat["clv_slope"] = feat["customer_id"].map(clv_slope_map).fillna(0)

    # Lifespan
    lifespan_s = (grp["order_date"].max() - grp["order_date"].min()).dt.days
    feat = feat.set_index("customer_id")
    feat["lifespan"] = lifespan_s.reindex(feat.index).fillna(0)

    # Spend momentum (recent spend vs older)
    spend_old = feat["spend_365"] - feat["spend_90"]
    feat["spend_momentum"] = (feat["spend_90"] - spend_old) / (spend_old.replace(0, np.nan)).fillna(0)
    feat = feat.fillna(0)

    # Net revenue & projected annual
    feat["net_revenue"]            = feat["total_spend"] * (1 - feat["refund_ratio"])
    feat["projected_annual_value"] = feat["spend_velocity"] * 12
    feat = feat.reset_index()

    # Top cat / channel per customer
    feat["top_cat"]     = (
        orders.groupby("customer_id")["category"]
        .agg(lambda x: x.value_counts().index[0] if len(x) > 0 else "Other")
        .reindex(feat["customer_id"]).values
    )
    feat["top_channel"] = (
        orders.groupby("customer_id")["channel"]
        .agg(lambda x: x.value_counts().index[0] if len(x) > 0 else "Other")
        .reindex(feat["customer_id"]).values
    )

    # Merge customer info
    feat = feat.merge(
        cust[["customer_id", "gender", "region", "acquisition_channel", "phone"]],
        on="customer_id", how="left"
    )
    feat["gender"]              = feat["gender"].fillna("Unknown")
    feat["region"]              = feat["region"].fillna("Kuwait")
    feat["acquisition_channel"] = feat["acquisition_channel"].fillna("App/Web")

    # ── K-Means ──────────────────────────────────────────────────────────────
    X_df = feat[FEATURE_NAMES].copy()
    for col in FEATURE_NAMES:
        p99 = X_df[col].quantile(0.99)
        p01 = X_df[col].quantile(0.01)
        X_df[col] = X_df[col].clip(lower=p01, upper=p99)

    X = X_df.values

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    feat["seg"] = km.fit_predict(Xs)

    # ── Elbow / silhouette scores for K=2..8 ─────────────────────────────────
    k_scores: dict[str, dict] = {}
    for k in range(2, 9):
        _km = KMeans(n_clusters=k, random_state=42, n_init=10)
        _labels = _km.fit_predict(Xs)
        _sil = round(float(silhouette_score(Xs, _labels, sample_size=min(5000, len(Xs)), random_state=42)), 4)
        k_scores[str(k)] = {
            "inertia":    round(float(_km.inertia_), 2),
            "silhouette": _sil,
        }

    # Remap clusters → segment IDs ordered best → worst using RFM-based score.
    # Use spend_365 (recent spend) instead of total_spend to avoid rewarding
    # historically-high but now-inactive clusters (e.g. At Risk > Loyal).
    sp365_col = "spend_365" if "spend_365" in feat.columns else "total_spend"
    seg_stats = feat.groupby("seg").agg(
        avg_spend   = (sp365_col,      "mean"),
        avg_recency = ("recency",      "mean"),
        avg_orders  = ("order_count",  "mean"),
    )
    for col in ["avg_spend", "avg_orders"]:
        rng = seg_stats[col].max() - seg_stats[col].min()
        seg_stats[col] = (seg_stats[col] - seg_stats[col].min()) / rng if rng > 0 else 0
    rng = seg_stats["avg_recency"].max() - seg_stats["avg_recency"].min()
    seg_stats["recency_score"] = 1 - (seg_stats["avg_recency"] - seg_stats["avg_recency"].min()) / rng if rng > 0 else 0

    seg_stats["score"] = (
        0.40 * seg_stats["avg_spend"] +
        0.30 * seg_stats["avg_orders"] +
        0.30 * seg_stats["recency_score"]
    )
    seg_order = seg_stats["score"].sort_values(ascending=False).index.tolist()
    remap = {old: new for new, old in enumerate(seg_order)}
    feat["seg"] = feat["seg"].map(remap)

    # Assign segment names based on actual cluster characteristics (RFM logic).
    # Instead of fixed template order, we assign names by matching cluster stats:
    #   - VIP/Ultra VIP : highest spend
    #   - Loyal         : recent + regular orders (low recency, decent orders)
    #   - At Risk       : less recent, fewer orders
    #   - Lost          : highest recency (most inactive)
    # Templates par K — noms fixes selon le nombre de clusters
    TEMPLATES_BY_K = {
        2: [
            {"name": "VIP",     "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers."},
            {"name": "Lost",    "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, churn risk."},
        ],
        3: [
            {"name": "VIP",     "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers, recent activity."},
            {"name": "Loyal",   "icon": "💚", "color": "#10b981", "colorBg": "rgba(16,185,129,.12)", "description": "Regular buyers with consistent engagement."},
            {"name": "Lost",    "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, churn risk."},
        ],
        4: [
            {"name": "VIP",     "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers, recent activity."},
            {"name": "Loyal",   "icon": "💚", "color": "#10b981", "colorBg": "rgba(16,185,129,.12)", "description": "Regular buyers with consistent engagement and solid LTV."},
            {"name": "At Risk", "icon": "⚠️", "color": "#8b5cf6", "colorBg": "rgba(139,92,246,.12)", "description": "Previously active customers drifting away — re-engagement needed."},
            {"name": "Lost",    "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, very infrequent. Churn risk."},
        ],
        5: [
            {"name": "VIP",       "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers, recent activity."},
            {"name": "Loyal",     "icon": "💚", "color": "#10b981", "colorBg": "rgba(16,185,129,.12)", "description": "Regular buyers with consistent engagement and solid LTV."},
            {"name": "Promising", "icon": "🌱", "color": "#3b82f6", "colorBg": "rgba(59,130,246,.12)", "description": "Growing customers with increasing spend and engagement."},
            {"name": "At Risk",   "icon": "⚠️", "color": "#8b5cf6", "colorBg": "rgba(139,92,246,.12)", "description": "Previously active customers drifting away — re-engagement needed."},
            {"name": "Lost",      "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, very infrequent. Churn risk."},
        ],
        6: [
            {"name": "Ultra VIP", "icon": "💎", "color": "#ec4899", "colorBg": "rgba(236,72,153,.12)", "description": "Top 1% by spend — extreme frequency, highest AOV."},
            {"name": "VIP",       "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers, recent activity."},
            {"name": "Loyal",     "icon": "💚", "color": "#10b981", "colorBg": "rgba(16,185,129,.12)", "description": "Regular buyers with consistent engagement and solid LTV."},
            {"name": "Promising", "icon": "🌱", "color": "#3b82f6", "colorBg": "rgba(59,130,246,.12)", "description": "Growing customers with increasing spend and engagement."},
            {"name": "At Risk",   "icon": "⚠️", "color": "#8b5cf6", "colorBg": "rgba(139,92,246,.12)", "description": "Previously active customers drifting away — re-engagement needed."},
            {"name": "Lost",      "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, very infrequent. Churn risk."},
        ],
        7: [
            {"name": "Ultra VIP", "icon": "💎", "color": "#ec4899", "colorBg": "rgba(236,72,153,.12)", "description": "Top 1% by spend — extreme frequency, highest AOV."},
            {"name": "VIP",       "icon": "👑", "color": "#f59e0b", "colorBg": "rgba(245,158,11,.12)", "description": "High spend, frequent buyers, recent activity."},
            {"name": "Loyal",     "icon": "💚", "color": "#10b981", "colorBg": "rgba(16,185,129,.12)", "description": "Regular buyers with consistent engagement and solid LTV."},
            {"name": "Promising", "icon": "🌱", "color": "#3b82f6", "colorBg": "rgba(59,130,246,.12)", "description": "Growing customers with increasing spend and engagement."},
            {"name": "At Risk",   "icon": "⚠️", "color": "#8b5cf6", "colorBg": "rgba(139,92,246,.12)", "description": "Previously active customers drifting away — re-engagement needed."},
            {"name": "Inactifs",  "icon": "😴", "color": "#f97316", "colorBg": "rgba(249,115,22,.12)", "description": "Clients inactifs depuis longtemps — aucun achat récent."},
            {"name": "Lost",      "icon": "💤", "color": "#ef4444", "colorBg": "rgba(239,68,68,.12)",  "description": "Low spend, high recency, very infrequent. Churn risk."},
        ],
    }
    templates_for_k = TEMPLATES_BY_K.get(n_clusters, TEMPLATES_BY_K[4])

    # Re-rank clusters using spend_365 (recent spend) as primary, recency as secondary
    sp365_col = "spend_365" if "spend_365" in feat.columns else "total_spend"
    final_stats = feat.groupby("seg").agg(
        avg_sp365   = (sp365_col,     "mean"),
        avg_recency = ("recency",     "mean"),
        avg_orders  = ("order_count", "mean"),
    ).reset_index()

    # Sort: highest spend_365 first, then lowest recency (most recent) first
    final_stats = final_stats.sort_values(
        ["avg_sp365", "avg_recency"],
        ascending=[False, True]
    ).reset_index(drop=True)

    # Assign template names to clusters by rank
    name_map = {int(final_stats.loc[i, "seg"]): templates_for_k[i] for i in range(n_clusters)}
    active_segments = [dict(name_map[i], id=i) for i in range(n_clusters)]

    seg_names = {s["id"]: s["name"] for s in active_segments}
    feat["segment"] = feat["seg"].map(seg_names)

    # ── PCA 2D ───────────────────────────────────────────────────────────────
    pca    = PCA(n_components=2, random_state=42)
    coords = pca.fit_transform(Xs)
    feat["pca_x"] = coords[:, 0]
    feat["pca_y"] = coords[:, 1]

    ev = [round(float(v) * 100, 1) for v in pca.explained_variance_ratio_]
    pca_meta = {
        "explained_variance": ev,
        "total_explained":    round(sum(ev), 1),
        "loadings": [
            {
                "feature": FEATURE_NAMES[i],
                "pc1":     round(float(pca.components_[0, i]), 4),
                "pc2":     round(float(pca.components_[1, i]), 4),
            }
            for i in range(len(FEATURE_NAMES))
        ],
    }

    # ── Feature importance ────────────────────────────────────────────────────
    centroids_scaled = np.array([
        Xs[feat["seg"] == i].mean(axis=0) for i in range(n_clusters)
    ])
    importance_vals = centroids_scaled.std(axis=0)
    max_imp = importance_vals.max() if importance_vals.max() > 0 else 1
    feature_importance = sorted(
        [{"feature": n, "value": round(float(v / max_imp), 4)}
         for n, v in zip(FEATURE_NAMES, importance_vals)],
        key=lambda x: x["value"], reverse=True
    )

    # ── Segment counts ────────────────────────────────────────────────────────
    counts = [int((feat["seg"] == i).sum()) for i in range(n_clusters)]
    segments_resp = {"segments": active_segments, "counts": counts, "total": int(feat.shape[0])}

    # ── Aggregations per segment ──────────────────────────────────────────────
    agg  = {}
    orders["_ym"] = orders["order_date"].dt.strftime("%Y-%m")

    ipt_map: dict = {}
    for cid, grp_ord in orders.sort_values("order_date").groupby("customer_id"):
        dates = grp_ord["order_date"].dropna().sort_values()
        if len(dates) >= 2:
            gaps = dates.diff().dropna().dt.days
            ipt_map[cid] = float(gaps.mean())
        else:
            ipt_map[cid] = float("nan")
    feat["ipt"] = feat["customer_id"].map(ipt_map)

    for seg_id in range(n_clusters):
        sub  = feat[feat["seg"] == seg_id]
        cids = set(sub["customer_id"].tolist())
        ord_sub = orders[orders["customer_id"].isin(cids)]

        monthly_spend = (
            ord_sub.groupby(["customer_id", "_ym"])["net_amount_kwd"].sum()
            .groupby("_ym").mean().round(2).to_dict()
        )
        cat_counts_raw = ord_sub["category"].value_counts().head(6)
        cat_total  = cat_counts_raw.sum()
        cat_counts = {k: round(int(v) / cat_total * 100, 1) for k, v in cat_counts_raw.items()}

        ipt_vals = sub["ipt"].dropna()
        avg_ipt  = round(float(ipt_vals.mean()), 1) if len(ipt_vals) > 0 else 0.0

        clv_pos = int((sub["clv_slope"] > 0).sum())
        clv_neg = int((sub["clv_slope"] < 0).sum())
        n = len(sub)

        agg[str(seg_id)] = {
            "n":                    n,
            "avg_spend":            round(float(sub["total_spend"].mean()), 2),
            "avg_aov":              round(float(sub["aov"].mean()), 2),
            "avg_recency":          round(float(sub["recency"].mean()), 0),
            "avg_orders":           round(float(sub["order_count"].mean()), 1),
            "avg_discount":         round(float(sub["avg_discount"].mean()), 4),
            "avg_ipt":              avg_ipt,
            "avg_active_months":    round(float(sub["active_months"].mean()), 1),
            "avg_return_rate":      round(float(sub["return_rate"].mean()), 4),
            "avg_refund_ratio":     round(float(sub["refund_ratio"].mean()), 4),
            "avg_diversity":        round(float(sub["diversity"].mean()), 4),
            "avg_sp30":             round(float(sub["spend_30"].mean()), 2),
            "avg_sp90":             round(float(sub["spend_90"].mean()), 2),
            "avg_sp365":            round(float(sub["spend_365"].mean()), 2),
            "avg_ord30":            round(float(sub["orders_30"].mean()), 2),
            "avg_ord90":            round(float(sub["orders_90"].mean()), 2),
            "avg_ord365":           round(float(sub["orders_365"].mean()), 2),
            "avg_spend_velocity":   round(float(sub["spend_velocity"].mean()), 2),
            "avg_clv_slope":        round(float(sub["clv_slope"].mean()), 4),
            "avg_lifespan":         round(float(sub["lifespan"].mean()), 0),
            "avg_spend_momentum":   round(float(sub["spend_momentum"].mean()), 4),
            "avg_net_revenue":      round(float(sub["net_revenue"].mean()), 2),
            "avg_projected_annual": round(float(sub["projected_annual_value"].mean()), 2),
            "clv_growing_pct":      round(clv_pos / n * 100, 1) if n else 0,
            "clv_declining_pct":    round(clv_neg / n * 100, 1) if n else 0,
            "monthly":              monthly_spend,
            "cats":                 cat_counts,
        }

    # ── Sample ────────────────────────────────────────────────────────────────
    sample_df   = feat.sample(min(1000, len(feat)), random_state=42)
    sample_cols = [
        "customer_id", "seg", "segment", "total_spend", "order_count", "recency",
        "aov", "avg_discount", "top_cat", "top_channel", "gender", "region",
        "acquisition_channel", "active_months", "return_rate", "refund_ratio",
        "diversity", "unique_cats", "unique_prods",
        "spend_30", "spend_90", "spend_365",
        "orders_30", "orders_90", "orders_365",
        "spend_velocity", "clv_slope", "lifespan", "spend_momentum",
        "net_revenue", "projected_annual_value",
        "pca_x", "pca_y",
    ]
    sample_cols = [c for c in sample_cols if c in sample_df.columns]
    sample = sample_df[sample_cols].round(4).to_dict(orient="records")

    # ── Summary ───────────────────────────────────────────────────────────────
    gross_sales      = float(orders["net_amount_kwd"].sum())
    total_refund_pre = float(returns["refund_amount_kwd"].sum()) if "refund_amount_kwd" in returns.columns else 0.0
    total_revenue    = round(gross_sales - total_refund_pre, 2)
    total_orders     = int(orders["order_id"].nunique())
    total_returns    = int(len(returns))

    returned_order_ids     = set(returns["return_id"].astype(str).tolist()) if len(returns) > 0 else set()
    fulfilled_orders_df    = orders[~orders["order_id"].astype(str).isin(returned_order_ids)]
    total_fulfilled_orders = int(fulfilled_orders_df["order_id"].nunique())
    total_revenue          = float(fulfilled_orders_df["net_amount_kwd"].sum())
    true_aov = round(total_revenue / total_fulfilled_orders, 2) if total_fulfilled_orders else 0.0

    monthly_total = (
        orders.groupby("_ym")["net_amount_kwd"].sum()
        .sort_index().round(2).to_dict()
    )
    monthly_aov_raw = (
        fulfilled_orders_df.groupby(["order_id", "_ym"])["net_amount_kwd"].sum()
        .reset_index()
        .groupby("_ym")["net_amount_kwd"].mean()
        .sort_index().round(2).to_dict()
    )

    ym_series  = pd.Series(monthly_total)
    yoy_pct    = None
    yoy_last12 = 0.0
    yoy_prev12 = 0.0
    if len(ym_series) >= 13:
        sorted_months = sorted(ym_series.index.tolist())
        last12  = float(ym_series[sorted_months[-12:]].sum())
        prev12  = float(ym_series[sorted_months[-24:-12]].sum()) if len(sorted_months) >= 24 else 0.0
        yoy_last12 = round(last12, 2)
        yoy_prev12 = round(prev12, 2)
        if prev12 > 0:
            yoy_pct = round((last12 - prev12) / prev12 * 100, 1)

    seg_map = feat[["customer_id", "seg"]].copy() if "customer_id" in feat.columns else feat[["seg"]].reset_index()[["customer_id", "seg"]]
    refunds_per_customer = (
        returns.groupby("customer_id")["refund_amount_kwd"].sum()
        if "refund_amount_kwd" in returns.columns
        else pd.Series(dtype=float)
    )

    net_rev_by_seg: dict = {}
    for seg_id in range(n_clusters):
        seg_cids   = seg_map[seg_map["seg"] == seg_id]["customer_id"].tolist()
        gross_seg  = float(orders[orders["customer_id"].isin(seg_cids)]["net_amount_kwd"].sum())
        refund_seg = float(refunds_per_customer.reindex(seg_cids).fillna(0).sum())
        net_rev_by_seg[seg_id] = gross_seg - refund_seg

    assigned_cids   = set(seg_map["customer_id"].tolist())
    all_order_cids  = set(orders["customer_id"].unique().tolist())
    unassigned_cids = all_order_cids - assigned_cids
    if unassigned_cids:
        unassigned_gross   = float(orders[orders["customer_id"].isin(unassigned_cids)]["net_amount_kwd"].sum())
        unassigned_refunds = float(refunds_per_customer.reindex(list(unassigned_cids)).fillna(0).sum())
        unassigned_net     = unassigned_gross - unassigned_refunds
        total_assigned_net = sum(net_rev_by_seg.values())
        if total_assigned_net > 0 and unassigned_net != 0:
            for i in range(n_clusters):
                net_rev_by_seg[i] += unassigned_net * (net_rev_by_seg[i] / total_assigned_net)

    revenue_by_seg = {str(i): round(net_rev_by_seg[i], 2) for i in range(n_clusters)}

    # If the true PaymentLog-deduplicated total is provided, rescale segments
    # proportionally so that sum(revenue_by_seg) == true_total_revenue.
    # This reconciles the gap between UserPurshase gross amounts (~5.49M) and
    # the PaymentLog dedup figure (2.89M) used as the authoritative total.
    if true_total_revenue is not None and true_total_revenue > 0:
        seg_sum_raw = sum(revenue_by_seg.values()) or 1
        scale = true_total_revenue / seg_sum_raw
        revenue_by_seg = {k: round(v * scale, 2) for k, v in revenue_by_seg.items()}
        total_revenue = true_total_revenue

    # Correct rounding drift so that sum(revenue_by_seg) == total_revenue exactly
    seg_sum = sum(revenue_by_seg.values())
    diff    = round(total_revenue - seg_sum, 2)
    if diff != 0:
        largest = max(revenue_by_seg, key=lambda k: revenue_by_seg[k])
        revenue_by_seg[largest] = round(revenue_by_seg[largest] + diff, 2)

    # ── Exact revenue par catégorie ────────────────────────────────────────
    category_revenue = {
        k: round(float(v), 2)
        for k, v in orders.groupby("category")["net_amount_kwd"].sum()
        .sort_values(ascending=False).items()
    }

    # ── Top 3 produits vendus réellement par trimestre (Q1–Q4) ────────────────
    # Périmètre : last 12 months rolling window (aligns with the frontend quarterly KPIs)
    def _quarter_label(month: int) -> str:
        return f"Q{(month - 1) // 3 + 1}"

    _last12_start = ref_date - pd.DateOffset(months=12)
    _orders_q = orders[(orders["order_date"] > _last12_start) & (orders["order_date"] <= ref_date)].copy()
    if _orders_q.empty:                          # fallback : toute l'historique
        _orders_q = orders.copy()
    _orders_q["quarter"] = _orders_q["order_date"].dt.month.map(_quarter_label)

    # Map product_id → nom lisible (depuis prods_df si disponible)
    _prod_name_map: dict = {}
    if prods_df is not None and not prods_df.empty and "name" in prods_df.columns:
        _prod_name_map = dict(zip(
            prods_df["product_id"].astype(str),
            prods_df["name"].astype(str),
        ))

    quarterly_top_products:   dict = {}
    quarterly_top_categories: dict = {}

    for q_label, q_group in _orders_q.groupby("quarter"):
        q_total_rev = float(q_group["net_amount_kwd"].sum()) or 1.0

        # Top 3 produits par revenue net réel — only products with known names
        top3_prod = (
            q_group[q_group["product_id"].astype(str).isin(_prod_name_map)]
            .groupby("product_id")["net_amount_kwd"]
            .sum()
            .sort_values(ascending=False)
            .head(3)
        )
        quarterly_top_products[q_label] = [
            {
                "product_id": str(pid),
                "name":       _prod_name_map.get(str(pid), str(pid)),
                "revenue":    round(float(rev), 2),
                "share":      round(float(rev) / q_total_rev * 100, 1),
            }
            for pid, rev in top3_prod.items()
        ]

        # Top 3 catégories par revenue net réel
        top3_cat = (
            q_group.groupby("category")["net_amount_kwd"]
            .sum()
            .sort_values(ascending=False)
            .head(3)
        )
        quarterly_top_categories[q_label] = [
            {
                "name":    str(cat),
                "revenue": round(float(rev), 2),
                "share":   round(float(rev) / q_total_rev * 100, 1),
            }
            for cat, rev in top3_cat.items()
        ]

    # ── Distributions ─────────────────────────────────────────────────────────
    channel_counts = {k: int(v) for k, v in orders["channel"].value_counts().to_dict().items()}
    region_dist    = {k: int(v) for k, v in cust["region"].value_counts().head(10).to_dict().items()}
    gender_dist    = {k: int(v) for k, v in cust["gender"].value_counts().to_dict().items()}
    acq_dist       = {k: int(v) for k, v in cust["acquisition_channel"].value_counts().to_dict().items()}

    total_refund_amount = round(total_refund_pre, 2)
    return_reasons  = {k: int(v) for k, v in returns["return_reason"].value_counts().to_dict().items()} \
                      if "return_reason" in returns.columns else {}
    return_statuses = {k: int(v) for k, v in returns["return_status"].value_counts().to_dict().items()} \
                      if "return_status" in returns.columns else {}

    price_bands = {
        "high": int((feat["total_spend"] >= 500).sum()),
        "mid":  int(((feat["total_spend"] >= 100) & (feat["total_spend"] < 500)).sum()),
        "low":  int((feat["total_spend"] < 100).sum()),
    }
    velocity_bands = {
        "high": int((feat["spend_velocity"] >= 100).sum()),
        "mid":  int(((feat["spend_velocity"] >= 30) & (feat["spend_velocity"] < 100)).sum()),
        "low":  int((feat["spend_velocity"] < 30).sum()),
    }
    clv_growing_pct = round(float((feat["clv_slope"] > 0).sum() / len(feat) * 100), 1)

    cutoff_90 = ref_date - pd.Timedelta(days=90)
    active_90_set       = set(orders[orders["order_date"] >= cutoff_90]["customer_id"].unique())
    active_customers_90 = len(active_90_set)
    had_prior  = set(orders[orders["order_date"] < cutoff_90]["customer_id"].unique())
    retained   = active_90_set & had_prior
    retention_rate = round(len(retained) / len(had_prior) * 100, 1) if had_prior else 0.0

    summary = {
        "gross_revenue":            round(gross_sales, 2),
        "total_revenue":            round(total_revenue, 2),
        "total_refund_amount":      total_refund_amount,
        "total_orders":             total_orders,
        "total_fulfilled_orders":   total_fulfilled_orders,
        "total_returns":            total_returns,
        "total_customers":          int(feat.shape[0]),   # = clients acheteurs réels (guests exclus en amont)
        "avg_order_value":          true_aov,              # FIX: AOV sur commandes fulfillées uniquement
        "true_aov":                 true_aov,
        "return_rate":              round(total_returns / total_orders, 4) if total_orders else 0,
        "retention_rate":           retention_rate,
        "active_customers_90":      active_customers_90,
        "monthly_revenue":          monthly_total,
        "monthly_aov":              monthly_aov_raw,
        "yoy_pct":                  yoy_pct,
        "yoy_last12":               yoy_last12,
        "yoy_prev12":               yoy_prev12,
        "revenue_by_segment":       revenue_by_seg,
        "category_revenue":         category_revenue,
        "channel_counts":           channel_counts,
        "region_dist":              region_dist,
        "gender_dist":              gender_dist,
        "acq_dist":                 acq_dist,
        "return_reasons":           return_reasons,
        "return_statuses":          return_statuses,
        "price_bands":              price_bands,
        "velocity_bands":           velocity_bands,
        "clv_growing_pct":          clv_growing_pct,
        "ref_date":                 str(ref_date.date()),
        "k_scores":                 k_scores,
        # ── NEW: top 3 produits & catégories réels par trimestre ──────────────
        "quarterly_top_products":   quarterly_top_products,
        "quarterly_top_categories": quarterly_top_categories,
    }

    categories = sorted(orders["category"].dropna().unique().tolist())
    feat_full  = feat.copy()

    return {
        "segments":           segments_resp,
        "agg":                agg,
        "sample":             sample,
        "actions":            {str(k): v for k, v in ACTIONS.items()},
        "categories":         categories,
        "feature_importance": feature_importance,
        "summary":            summary,
        "pca_meta":           pca_meta,
        "feat_full":          feat_full,
        "orders_df":          orders,
        "returns_df":         returns,
        "prods_df":           prods_df,
        "cust_df":            cust,
    }