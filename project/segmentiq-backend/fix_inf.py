"""
fix_inf.py — Reecrit les documents agg et sample pour remplacer inf/nan par 0
Lancer depuis le dossier segmentiq-backend :
    python fix_inf.py
"""
import math
from database import db, segments_agg_col, segments_sample_col

def sanitize(obj):
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return 0.0
        return obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj

# Fix segments_agg
print("Correction segments_agg...")
fixed = 0
for doc in segments_agg_col.find():
    oid = doc["_id"]
    clean = sanitize(doc)
    segments_agg_col.replace_one({"_id": oid}, clean)
    fixed += 1
print(f"  {fixed} documents corriges")

# Fix segments_sample
print("Correction segments_sample...")
fixed = 0
for doc in segments_sample_col.find():
    oid = doc["_id"]
    clean = sanitize(doc)
    segments_sample_col.replace_one({"_id": oid}, clean)
    fixed += 1
print(f"  {fixed} documents corriges")

print("Termine ! Relancez uvicorn.")