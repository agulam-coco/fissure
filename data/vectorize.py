import pandas as pd
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

# Extra narrative/reporting scaffolding words on top of sklearn's generic
# English stopwords. Without these, TF-IDF picks up on formal-report phrasing
# ("the contact", "nhtsa campaign") vs informal first-person phrasing
# ("i have", "my car") as if it were a topical signal, splitting the SAME
# defect into separate clusters just because some people wrote the complaint
# themselves and others had it transcribed by an NHTSA call center. Also
# includes post-hoc service-outcome vocabulary ("repaired", "diagnosed") which
# describes what happened AFTER the complaint, not the defect itself, and
# clusters complaints by repair narrative instead of by failure mode.
NARRATIVE_STOPWORDS = [
    "tl", "contact", "owns", "owned", "stated", "vehicle", "consumer",
    "dealer", "dealership", "nhtsa", "campaign", "recall", "notification",
    "notified", "unaware", "manufacturer", "mfr", "vin", "unknown",
    "mileage", "approximately", "contacted",
    "repaired", "repair", "diagnosed", "taken", "mechanic", "needed",
    "replaced", "inspected", "technician", "fixed", "towed", "informed",
    "advised", "told",
]

# Post-recall administrative complaints: people writing in about the RECALL
# PROCESS itself (parts unavailable, waiting too long), not describing the
# original defect. These happen AFTER a recall is announced, so they are
# useless for early-detection backtesting and they pollute cluster content
# with recall/parts-availability language instead of symptom language.
ADMIN_PATTERN = (
    r"EXCEEDED A REASONABLE AMOUNT OF TIME"
    r"|PARTS? (?:NEEDED|TO DO THE REPAIR|FOR THE REPAIR).{0,30}(?:UN)?AVAILABLE"
    r"|RECEIVED (?:A )?NOTIFICATION OF NHTSA CAMPAIGN"
    r"|RECEIVED (?:A )?(?:RECALL )?NOTICE (?:FOR|OF) NHTSA CAMPAIGN"
)


def strip_boilerplate(text):
    text = re.sub(r"^TL\*?\s*THE CONTACT (OWNS|OWNED|STATED).*?\.\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"THE CONTACT (STATED|OWNS|OWNED)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"THE MANUFACTURER WAS (NOT )?(MADE AWARE|NOTIFIED).*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"VIN\s*(NUMBER|TOOL)?\s*WAS (NOT )?AVAILABLE.*", "", text, flags=re.IGNORECASE)
    return text.strip()


def vectorize_vehicle(slug, n_components=100):
    """Load one vehicle's filtered complaints, drop post-recall administrative
    complaints, vectorize the remaining narrative text, and return the
    dataframe + the reduced vector matrix + the raw tfidf matrix + feature
    names (the last two are needed for top-terms and centroid-similarity
    diagnostics in cluster.py).

    reduced is L2-normalized so that Euclidean KMeans behaves as cosine
    (spherical) KMeans. Without this, cluster assignment is partly driven by
    document length, which correlates with whether the complaint was written
    by the owner or transcribed by an NHTSA call center.
    """
    df = pd.read_pickle(PROCESSED_DIR / f"complaints_{slug}.pkl")
    df = df[df["CDESCR"].notna() & (df["CDESCR"].str.strip() != "")].copy()
    df = df.reset_index(drop=True)

    admin = df["CDESCR"].str.contains(ADMIN_PATTERN, case=False, na=False, regex=True)
    print(f"{slug}: dropping {admin.sum():,} post-recall administrative complaints")
    df = df[~admin].reset_index(drop=True)

    texts = [strip_boilerplate(t) for t in df["CDESCR"].tolist()]

    stop_words = [w for w in TfidfVectorizer(stop_words="english").get_stop_words() if w not in {"not", "no", "never", "nor", "cannot"}] + NARRATIVE_STOPWORDS

    tfidf = TfidfVectorizer(max_features=20000, ngram_range=(1, 2), stop_words=stop_words)
    tfidf_matrix = tfidf.fit_transform(texts)

    svd = TruncatedSVD(n_components=n_components, random_state=42)
    reduced = normalize(svd.fit_transform(tfidf_matrix))

    print(f"{slug}: {len(df):,} complaints → {reduced.shape}, "
          f"SVD explains {svd.explained_variance_ratio_.sum():.1%} of variance")

    return df, reduced, tfidf_matrix, tfidf.get_feature_names_out()


if __name__ == "__main__":
    for slug in VEHICLES:
        vectorize_vehicle(slug)