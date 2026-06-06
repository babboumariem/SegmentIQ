"""
database.py  —  MongoDB connection + helpers pour SegmentIQ / The3Beez

Collections actives (toutes écrites par import_data.py) :
  segments_meta    — 4 docs : metadata + counts par segment
  segments_agg     — 4 docs : agrégations par segment
  segments_sample  — 1 000 docs : points PCA pour visualisation
  segments_feat    — 11 074 docs : features complètes par client
  summary          — 1 doc  : KPIs globaux
  feature_importance — 10 docs
  offers           — 1 578 docs : promotions
  countries        — 8 docs  : pays
  actions          — 1 doc  : actions recommandées par segment
  categories       — 1 doc  : liste des catégories produit

NOTE: Les collections 'customers', 'products', 'orders', 'returns' ne sont
PAS utilisées. Toutes les données clients sont dans segments_feat.
"""
from pymongo import MongoClient, ASCENDING, DESCENDING

MONGO_URI = "mongodb://localhost:27017"
DB_NAME   = "the3beez"

client = MongoClient(MONGO_URI)
db     = client[DB_NAME]

# Collections résultats ML (écrites par import_data.py)
segments_meta_col    = db["segments_meta"]      # metadata + counts par segment
segments_agg_col     = db["segments_agg"]       # agrégations par segment
segments_sample_col  = db["segments_sample"]    # 1000 points PCA
segments_feat_col    = db["segments_feat"]      # features complètes par client (11 074 docs)
summary_col          = db["summary"]            # KPIs globaux
feature_imp_col      = db["feature_importance"] # importance des features
offers_col           = db["offers"]             # promotions (Offer.csv)
countries_col        = db["countries"]          # pays (Country.csv)


def create_indexes():
    segments_feat_col.create_index([("customer_id", ASCENDING)], unique=True)
    segments_feat_col.create_index([("seg", ASCENDING)])
    segments_feat_col.create_index([("region", ASCENDING)])
    segments_feat_col.create_index([("gender", ASCENDING)])
    segments_feat_col.create_index([("top_channel", ASCENDING)])
    segments_feat_col.create_index([("total_spend", DESCENDING)])
    segments_feat_col.create_index([("recency", ASCENDING)])
    segments_feat_col.create_index([("order_count", DESCENDING)])

    offers_col.create_index([("offer_usage_count", DESCENDING)])
    offers_col.create_index([("reduction_type", ASCENDING)])

    print("  Indexes MongoDB crees.")