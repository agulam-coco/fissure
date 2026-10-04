import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = SCRIPT_DIR / "processed"
MASTER_PATH = PROCESSED_DIR / "complaints_clean.pkl"


def filter_vehicle(df, make, model, year_start, year_end, slug):
    """Filter the master complaints table to one vehicle + year range,
    save it as its own file, and return the filtered dataframe."""

    years = pd.to_numeric(df["YEARTXT"], errors="coerce")

    mask = (
        (df["MAKETXT"] == make)
        & (df["MODELTXT"] == model)
        & (years >= year_start)
        & (years <= year_end)
    )
    subset = df[mask].copy()

    out_path = PROCESSED_DIR / f"complaints_{slug}.pkl"
    subset.to_pickle(out_path)

    print(f"{make} {model} ({year_start}-{year_end}): {len(subset):,} complaints → saved to {out_path.name}")
    return subset

def filter_vehicle_multi_model(df, make, models, year_start, year_end, slug):
    """Same as filter_vehicle, but matches any of several real MODELTXT variants."""
    years = pd.to_numeric(df["YEARTXT"], errors="coerce")

    mask = (
        (df["MAKETXT"] == make)
        & (df["MODELTXT"].isin(models))
        & (years >= year_start)
        & (years <= year_end)
    )
    subset = df[mask].copy()

    out_path = PROCESSED_DIR / f"complaints_{slug}.pkl"
    subset.to_pickle(out_path)

    print(f"{make} {models} ({year_start}-{year_end}): {len(subset):,} complaints → saved to {out_path.name}")
    return subset

# ---- load the master table once ----
df = pd.read_pickle(MASTER_PATH)
print(f"Loaded master table: {len(df):,} rows\n")

# ---- run the filter for each of the 5 confirmed vehicles ----
filter_vehicle(df, "FORD", "FUSION", 2010, 2016, "ford_fusion")
filter_vehicle(df, "JEEP", "GRAND CHEROKEE", 2008, 2016, "jeep_grand_cherokee")
filter_vehicle(df, "HONDA", "CIVIC", 2001, 2015, "honda_civic")
filter_vehicle(df, "TOYOTA", "CAMRY", 2004, 2009, "toyota_camry")
filter_vehicle_multi_model(
    df,
    "CHEVROLET",
    ["SILVERADO 1500", "SILVERADO 2500", "SILVERADO 3500", "SILVERADO"],
    2013, 2021,
    "chevrolet_silverado",
)