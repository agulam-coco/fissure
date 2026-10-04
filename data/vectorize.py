import pandas as pd
import numpy as np
import re
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = SCRIPT_DIR / "processed"

VEHICLES = [
    "ford_fusion",
    "jeep_grand_cherokee",
    "chevrolet_silverado",
    "honda_civic",
    "toyota_camry",
]

NARRATIVE_STOPWORDS = [
    "tl", "contact", "owns", "owned", "stated", "vehicle", "consumer",
    "dealer", "dealership", "nhtsa", "campaign", "recall", "notification",
    "notified", "unaware", "manufacturer", "mfr", "vin", "unknown",
    "mileage", "approximately", "contacted","repaired", "repair", "diagnosed", "taken", "mechanic", "needed",
"replaced", "inspected", "technician", "fixed", "towed", "informed",
"advised", "told",
]


def strip_boilerplate(text):
    text = re.sub(r"^TL\*?\s*THE CONTACT (OWNS|OWNED|STATED).*?\.\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"THE CONTACT (STATED|OWNS|OWNED)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"THE MANUFACTURER WAS (NOT )?(MADE AWARE|NOTIFIED).*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"VIN\s*(NUMBER|TOOL)?\s*WAS (NOT )?AVAILABLE.*", "", text, flags=re.IGNORECASE)
    return text.strip()


def vectorize_vehicle(slug, n_components=100):
    """Returns (df, reduced, tfidf_matrix, feature_names).

    reduced is L2-normalized so that Euclidean KMeans behaves as cosine
    (spherical) KMeans. Without this, cluster assignment is partly driven by
    document length, which correlates with whether the complaint was written
    by the owner or transcribed by an NHTSA call center.
    """
    df = pd.read_pickle(PROCESSED_DIR / f"complaints_{slug}.pkl")
    df = df[df["CDESCR"].notna() & (df["CDESCR"].str.strip() != "")].copy()
    df = df.reset_index(drop=True)

    texts = [strip_boilerplate(t) for t in df["CDESCR"].tolist()]

    stop_words = list(TfidfVectorizer(stop_words="english").get_stop_words()) + NARRATIVE_STOPWORDS

    tfidf = TfidfVectorizer(max_features=20000, ngram_range=(1, 2), stop_words=stop_words)
    tfidf_matrix = tfidf.fit_transform(texts)

    svd = TruncatedSVD(n_components=n_components, random_state=42)
    reduced = normalize(svd.fit_transform(tfidf_matrix))

    print(f"{slug}: {len(df):,} complaints → {reduced.shape}, "
          f"SVD explains {svd.explained_variance_ratio_.sum():.1%} of variance")

    return df, reduced, tfidf_matrix, np.array(tfidf.get_feature_names_out())


if __name__ == "__main__":
    for slug in VEHICLES:
        vectorize_vehicle(slug)