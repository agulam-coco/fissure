import pandas as pd
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = SCRIPT_DIR / "processed"

VEHICLES = [
    "ford_fusion",
    "jeep_grand_cherokee",
    "chevrolet_silverado",
    "honda_civic",
    "toyota_camry",
]


def vectorize_vehicle(slug, n_components=100):
    """Load one vehicle's filtered complaints, vectorize the narrative text,
    and return the dataframe + the reduced vector matrix."""

    in_path = PROCESSED_DIR / f"complaints_{slug}.pkl"
    df = pd.read_pickle(in_path)

    df = df[df["CDESCR"].notna() & (df["CDESCR"].str.strip() != "")].copy()
    df = df.reset_index(drop=True)

    texts = df["CDESCR"].tolist()

    tfidf = TfidfVectorizer(
        max_features=20000,
        ngram_range=(1, 2),
        stop_words="english",
    )
    tfidf_matrix = tfidf.fit_transform(texts)

    svd = TruncatedSVD(n_components=n_components, random_state=42)
    reduced = svd.fit_transform(tfidf_matrix)

    print(f"{slug}: {len(df):,} complaints with narratives → vectorized to {reduced.shape}")

    return df, reduced


if __name__ == "__main__":
    results = {}
    for slug in VEHICLES:
        df, reduced = vectorize_vehicle(slug)
        results[slug] = (df, reduced)