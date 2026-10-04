import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from vectorize import vectorize_vehicle, VEHICLES, PROCESSED_DIR

# Keyword ground truth, used ONLY to measure how well a known defect gets
# captured by clustering. It never feeds the clustering itself — the pipeline
# stays unsupervised. This is how we backtest against real recalls.
DEFECT_PATTERNS = {
    "ford_fusion": r"POWER STEERING|STEERING ASSIST|STEERING WHEEL|LOSS OF STEERING",
}


def cluster_vehicle(reduced, n_clusters):
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    return km.fit_predict(reduced)


def fragmentation_report(df, labels, pattern):
    """How many clusters does the known defect get spread across, and how
    diluted is each one?"""
    hit = df["CDESCR"].str.contains(pattern, case=False, na=False, regex=True).values
    total = hit.sum()
    print(f"  defect-keyword complaints: {total:,} ({total/len(df)*100:.1f}% of vehicle)")

    rows = []
    for cid in np.unique(labels):
        in_c = labels == cid
        n_hit = (in_c & hit).sum()
        if n_hit == 0:
            continue
        rows.append({
            "cluster": cid,
            "size": int(in_c.sum()),
            "defect": int(n_hit),
            "recall": n_hit / total,       # share of the defect living here
            "purity": n_hit / in_c.sum(),  # share of this cluster that is the defect
        })
    rows.sort(key=lambda r: -r["defect"])

    for r in rows:
        print(f"    cluster {r['cluster']:>2} | size {r['size']:>6,} | "
              f"defect {r['defect']:>5,} | recall {r['recall']:>5.1%} | purity {r['purity']:>5.1%}")

    major = [r for r in rows if r["recall"] >= 0.10]
    best = max(rows, key=lambda r: r["recall"])
    print(f"  → spread across {len(major)} clusters holding >=10% each; "
          f"best single cluster captures {best['recall']:.1%} at {best['purity']:.1%} purity")
    return rows


def top_terms(tfidf_matrix, feature_names, labels, n_terms=12):
    for cid in np.unique(labels):
        idx = np.where(labels == cid)[0]
        centroid = np.asarray(tfidf_matrix[idx].mean(axis=0)).ravel()
        terms = feature_names[centroid.argsort()[::-1][:n_terms]]
        print(f"    cluster {cid:>2} ({len(idx):>6,}): {', '.join(terms)}")


def centroid_similarity(tfidf_matrix, labels):
    cids = np.unique(labels)
    cents = np.vstack([
        np.asarray(tfidf_matrix[np.where(labels == c)[0]].mean(axis=0)).ravel()
        for c in cids
    ])
    sim = cosine_similarity(cents)
    print("    " + "".join(f"{c:>7}" for c in cids))
    for i, c in enumerate(cids):
        print(f"{c:>3} " + "".join(f"{sim[i, j]:>7.2f}" for j in range(len(cids))))
    return cids, sim


def merge_clusters(labels, cids, sim, threshold):
    """Union-find merge of clusters whose TF-IDF centroids are close. Use this
    only if a vehicle's defect still fragments after picking the best k — an
    explicit, documented second stage rather than relying on KMeans alone."""
    parent = {int(c): int(c) for c in cids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(len(cids)):
        for j in range(i + 1, len(cids)):
            if sim[i, j] >= threshold:
                a, b = find(int(cids[i])), find(int(cids[j]))
                if a != b:
                    parent[max(a, b)] = min(a, b)
                    print(f"    merge cluster {cids[j]} + {cids[i]} (cos={sim[i, j]:.2f})")

    return np.array([find(int(l)) for l in labels])


if __name__ == "__main__":
    slug = "ford_fusion"
    pattern = DEFECT_PATTERNS[slug]

    df, reduced, tfidf_matrix, feature_names = vectorize_vehicle(slug)

    labels = cluster_vehicle(reduced, 6)
    print(f"\n{slug}, k=6:")
    fragmentation_report(df, labels, pattern)

    print("\n  top terms:")
    top_terms(tfidf_matrix, feature_names, labels)

    hit = df["CDESCR"].str.contains(pattern, case=False, na=False, regex=True)
    print(f"\n{df[hit]['COMPDESC'].nunique()} distinct official COMPDESC labels for steering complaints:")
    print(df[hit]["COMPDESC"].value_counts().head(15))

    df["defect_group"] = labels
    out_path = PROCESSED_DIR / f"clustered_{slug}.pkl"
    df.to_pickle(out_path)
    print(f"\nSaved clustered data to {out_path}")