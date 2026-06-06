"""
import_data.py  —  The3Beez SegmentIQ
======================================
Charge les CSV The3B, lance la segmentation K-Means,
et stocke TOUT dans MongoDB (the3beez).

A lancer UNE SEULE FOIS (ou pour reimporter) :
    python import_data.py

Prerequis : MongoDB sur localhost:27017

Fichiers CSV utilises (dossier data/) :
  - The3B.User.csv
  - The3B.UserAddress.csv
  - The3B.Product.csv
  - The3B.ProductCategory.csv
  - The3B.ProductIngredient.csv     [NEW]
  - The3B.Collection.csv            [NEW]
  - The3B.ProductForCollection.csv  [NEW]
  - The3B.DeliveryRequest.csv
  - The3B.PaymentLog.csv            [NEW]
  - The3B.Offer.csv                 [NEW]
  - The3B.Country.csv               [NEW]
"""

import sys
import os
import pandas as pd
import numpy as np
from database import (
    db, create_indexes,
    segments_meta_col, segments_agg_col, segments_sample_col,
    segments_feat_col, summary_col, feature_imp_col,
    offers_col, countries_col,
)
from clean_data import (
    clean_customers, clean_products, clean_orders, clean_returns,
    get_payment_stats,
)
from segment_engine import build_segments

DATA_DIR = "data"


def _to_docs(df: pd.DataFrame) -> list:
    records = df.copy()
    for col in records.select_dtypes(include=["datetime64[ns]"]).columns:
        records[col] = records[col].astype(str)
    records = records.where(pd.notnull(records), None)
    return [
        {k: (int(v) if isinstance(v, (np.integer,)) else
             float(v) if isinstance(v, (np.floating,)) else v)
         for k, v in row.items()}
        for row in records.to_dict(orient="records")
    ]


def upsert(collection, docs: list, label: str):
    collection.drop()
    if docs:
        collection.insert_many(docs)
    print(f"  {label:30s}: {collection.count_documents({}):>8,} documents")


def run(n_clusters: int = 4):
    print("\n" + "="*55)
    print("  SegmentIQ — Import MongoDB | The3Beez")
    print("="*55)

    # ── File paths ──────────────────────────────────────────────────────────
    users_path                  = f"{DATA_DIR}/The3B.User.csv"
    addresses_path              = f"{DATA_DIR}/The3B.UserAddress.csv"
    products_path               = f"{DATA_DIR}/The3B.Product.csv"
    categories_path             = f"{DATA_DIR}/The3B.ProductCategory.csv"
    ingredients_path            = f"{DATA_DIR}/The3B.ProductIngredient.csv"        # [NEW]
    collection_path             = f"{DATA_DIR}/The3B.Collection.csv"               # [NEW]
    product_for_collection_path = f"{DATA_DIR}/The3B.ProductForCollection.csv"     # [NEW]
    delivery_path               = f"{DATA_DIR}/The3B.UserPurshase.csv"
    payment_log_path            = f"{DATA_DIR}/The3B.PaymentLog.csv"               # [NEW]
    offer_path                  = f"{DATA_DIR}/The3B.Offer.csv"                    # [NEW]
    country_path                = f"{DATA_DIR}/The3B.Country.csv"                  # [NEW]

    # Verifier que les fichiers optionnels existent
    def _opt(path: str) -> str | None:
        return path if os.path.exists(path) else None

    # ── 1. Lecture CSV ──────────────────────────────────────────────────────
    print("\n[1/3] Lecture des CSV The3B...")
    cust = clean_customers(users_path, addresses_path)

    prods = clean_products(
        products_path,
        categories_path,
        ingredients_path=_opt(ingredients_path),
        collection_path=_opt(collection_path),
        product_for_collection_path=_opt(product_for_collection_path),
    )

    orders = clean_orders(
        delivery_path,
        categories_path,
        products_path,
        country_path=_opt(country_path),
        payment_log_path=_opt(payment_log_path),
        offer_path=_opt(offer_path),
        ingredients_path=_opt(ingredients_path),
        collection_path=_opt(collection_path),
        product_for_collection_path=_opt(product_for_collection_path),
    )

    returns = clean_returns(delivery_path)

    print(f"  Customers : {len(cust):,}  |  Products : {len(prods):,}")
    print(f"  Orders    : {len(orders):,}  |  Returns  : {len(returns):,}")

    # ── 2. Segmentation K-Means ─────────────────────────────────────────────
    print("\n[2/3] Segmentation K-Means (K=4) + PCA...")
    # Pre-fetch PaymentLog total so revenue_by_segment is scaled correctly
    payment_stats_pre = get_payment_stats(_opt(payment_log_path))
    true_rev = payment_stats_pre.get("total_revenue") if payment_stats_pre else None
    data = build_segments(
        cust_df=cust,
        orders_df=orders,
        returns_df=returns,
        prods_df=prods,
        n_clusters=n_clusters,
        true_total_revenue=true_rev,
    )

    # Segments meta
    seg_raw    = data["segments"]
    seg_counts = seg_raw["counts"]
    segments   = [{**s, "count": seg_counts[i]}
                  for i, s in enumerate(seg_raw["segments"])]
    upsert(segments_meta_col, segments, "segments_meta")

    # Agregations par segment
    agg_docs = [{"seg_id": int(k), **v} for k, v in data["agg"].items()]
    upsert(segments_agg_col, agg_docs, "segments_agg")

    # Sample PCA
    upsert(segments_sample_col, data["sample"], "segments_sample")

    # Features completes par client
    feat_df = data["feat_full"]
    for col in feat_df.columns:
        if hasattr(feat_df[col], 'dt'):
            try:
                feat_df[col] = feat_df[col].astype(str)
            except Exception:
                pass
    upsert(segments_feat_col, _to_docs(feat_df), "segments_feat")

    # Summary global (enrichi avec stats de paiement)
    payment_stats = payment_stats_pre  # already fetched above for build_segments
    summary       = {**data["summary"], **payment_stats}       # [NEW] merge

    summary_col.drop()
    summary_col.insert_one({"_id": "global", **summary})
    print(f"  {'summary':30s}:         1 document")

    # Feature importance
    upsert(feature_imp_col, data["feature_importance"], "feature_importance")

    # PCA meta (explained variance + loadings)
    db["pca_meta"].drop()
    db["pca_meta"].insert_one({"_id": "global", **data["pca_meta"]})
    print(f"  {'pca_meta':30s}:         1 document")

    # Categories
    db["categories"].drop()
    db["categories"].insert_one({"_id": "list", "values": data["categories"]})

    # Actions
    db["actions"].drop()
    db["actions"].insert_one({"_id": "map", **data["actions"]})

    # [NEW] Offres / promotions
    if _opt(offer_path):
        from clean_data import _build_offer_lookup
        offer_map = _build_offer_lookup(offer_path)
        offer_docs = [{"_id": code, **info} for code, info in offer_map.items()]
        offers_col.drop()
        if offer_docs:
            offers_col.insert_many(offer_docs)
        print(f"  {'offers':30s}: {db['offers'].count_documents({}):>8,} documents")

    # [NEW] Countries
    if _opt(country_path):
        from clean_data import _build_country_lookup
        country_map = _build_country_lookup(country_path)
        country_docs = [{"_id": code, "name": name} for code, name in country_map.items()]
        countries_col.drop()
        if country_docs:
            countries_col.insert_many(country_docs)
        print(f"  {'countries':30s}: {db['countries'].count_documents({}):>8,} documents")

    # ── 4. Index ─────────────────────────────────────────────────────────────
    print("\n[3/3] Creation des index...")
    create_indexes()

    # ── Resume ────────────────────────────────────────────────────────────────
    s = summary   # utilise le summary enrichi (PaymentLog dédupliqué)
    print("\n" + "="*55)
    print("  Import termine avec succes !")
    print(f"  Revenue total  : {s['total_revenue']:>12,.2f} KWD")  # = 2,894,094 KD
    print(f"  Commandes      : {s['total_orders']:>12,}")
    print(f"  Clients        : {s['total_customers']:>12,}")
    print(f"  AOV            : {s['avg_order_value']:>12.2f} KWD")

    # [NEW] Afficher stats de paiement
    if payment_stats:
        print(f"  Taux echec pmt : {payment_stats.get('payment_failure_rate', 0):>11.1f} %")
        gw_top = list(payment_stats.get("gateway_distribution", {}).items())[:3]
        for gw, cnt in gw_top:
            print(f"  {gw:20s} : {cnt:>8,} transactions")

    print()
    for seg in segments:
        print(f"  Segment {seg['id']} {seg['icon']} {seg['name']:10s}: {seg['count']:,} clients")
    print("="*55 + "\n")


# Alias used by /api/retrain endpoint in main.py
run_import = run


if __name__ == "__main__":
    run()