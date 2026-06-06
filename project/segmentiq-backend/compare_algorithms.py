"""
compare_algorithms.py
---------------------
Run this script once to compare K-Means, DBSCAN, GMM, and Hierarchical
clustering on your actual customer data.

HOW TO RUN:
    cd project/segmentiq-backend
    python compare_algorithms.py

No changes to your existing app — this is standalone.
"""

import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.mixture import GaussianMixture

# ── 1. Load your features (reuses your existing engine) ──────────────────────
print("\n📦 Loading features from your data...\n")
from segment_engine import build_features, FEATURE_NAMES

cache = build_features("data")
feat  = cache["feat"].copy()

N_CLUSTERS   = 4          # same default as your app
ACTIVE_FEATS = FEATURE_NAMES[:10]

X  = feat[ACTIVE_FEATS].values
Xs = StandardScaler().fit_transform(X)

# ── 2. Define algorithms to compare ──────────────────────────────────────────
algorithms = {
    "K-Means": KMeans(n_clusters=N_CLUSTERS, random_state=42, n_init=10),
    "GMM":     GaussianMixture(n_components=N_CLUSTERS, random_state=42),
    "Hierarchical": AgglomerativeClustering(n_clusters=N_CLUSTERS),
    "DBSCAN":  DBSCAN(eps=0.8, min_samples=10),   # eps tuned for StandardScaler output
}

# ── 3. Run each algorithm and score it ───────────────────────────────────────
print("=" * 65)
print(f"{'Algorithm':<16} {'Segments':>9} {'Silhouette':>12} {'Davies-Bouldin':>15} {'Calinski-H':>12}")
print("-" * 65)

results = []

for name, model in algorithms.items():
    # Fit & predict
    if name == "GMM":
        labels = model.fit_predict(Xs)
    else:
        labels = model.fit_predict(Xs)

    unique_labels = set(labels)

    # DBSCAN uses -1 for noise — filter those out for scoring
    noise_count = int((labels == -1).sum()) if -1 in unique_labels else 0
    mask        = labels != -1
    n_segments  = len(unique_labels - {-1})

    # Need at least 2 clusters to compute scores
    if n_segments < 2:
        print(f"{name:<16} {'N/A':>9} {'N/A':>12} {'N/A':>15} {'N/A':>12}  ⚠️  Only 1 cluster found — tune eps")
        results.append({"Algorithm": name, "Segments": n_segments, "Silhouette": None,
                        "Davies-Bouldin": None, "Calinski-H": None, "Noise": noise_count})
        continue

    sil = round(silhouette_score(Xs[mask], labels[mask]), 4)
    dbi = round(davies_bouldin_score(Xs[mask], labels[mask]), 4)
    chi = round(calinski_harabasz_score(Xs[mask], labels[mask]), 2)

    noise_note = f"  ({noise_count} noise pts)" if noise_count else ""
    print(f"{name:<16} {n_segments:>9} {sil:>12} {dbi:>15} {chi:>12}{noise_note}")

    results.append({"Algorithm": name, "Segments": n_segments, "Silhouette": sil,
                    "Davies-Bouldin": dbi, "Calinski-H": chi, "Noise": noise_count})

print("=" * 65)

# ── 4. Explain the scores ─────────────────────────────────────────────────────
print("""
📊 HOW TO READ THE SCORES:
  • Silhouette      → HIGHER is better  (range: -1 to 1)
                      Measures how well each customer fits its segment
  • Davies-Bouldin  → LOWER is better   (range: 0 to ∞)
                      Measures how separated the segments are
  • Calinski-H      → HIGHER is better  (range: 0 to ∞)
                      Measures cluster density vs separation
""")

# ── 5. Pick the winner ────────────────────────────────────────────────────────
valid = [r for r in results if r["Silhouette"] is not None]

if valid:
    best_sil = max(valid, key=lambda r: r["Silhouette"])
    best_dbi = min(valid, key=lambda r: r["Davies-Bouldin"])
    best_chi = max(valid, key=lambda r: r["Calinski-H"])

    print("🏆 WINNER BY EACH METRIC:")
    print(f"   Silhouette     → {best_sil['Algorithm']}  ({best_sil['Silhouette']})")
    print(f"   Davies-Bouldin → {best_dbi['Algorithm']}  ({best_dbi['Davies-Bouldin']})")
    print(f"   Calinski-H     → {best_chi['Algorithm']}  ({best_chi['Calinski-H']})")

    # Overall winner = wins most metrics
    from collections import Counter
    votes = Counter([best_sil["Algorithm"], best_dbi["Algorithm"], best_chi["Algorithm"]])
    overall_winner = votes.most_common(1)[0][0]
    print(f"\n✅ OVERALL BEST FOR YOUR DATA → {overall_winner}\n")
else:
    print("⚠️  No valid results to compare. Try tuning DBSCAN eps value.\n")
