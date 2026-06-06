import traceback, json, math

def _sanitize(obj):
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

try:
    from database import segments_agg_col
    result = {}
    for doc in segments_agg_col.find():
        seg_id = str(doc.pop("seg_id"))
        doc.pop("_id", None)
        result[seg_id] = _sanitize(doc)
    print("OK — premiers 500 chars:")
    print(json.dumps(result)[:500])
except Exception as e:
    traceback.print_exc()