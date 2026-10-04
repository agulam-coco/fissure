import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = SCRIPT_DIR / "processed"


def filter_vehicle(df, make, model, year_start, year_end, slug):
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


if __name__ == "__main__":
    df = pd.read_pickle(PROCESSED_DIR / "complaints_clean.pkl")
    print(f"Loaded master table: {len(df):,} rows")

    # Ford Fusion — steering (15V-340, filed 2015-09-10). Window unchanged.
    filter_vehicle(
        df, "FORD", "FUSION",
        2010, 2016, "ford_fusion",
    )

    # Jeep Grand Cherokee — FOBIK ignition key (14V-567, filed 2014-09-17,
    # confirmed via NHTSA campaign API). The recall covers ONLY the 2008
    # model year, so narrowing from the old 2008-2016 window should give a
    # much cleaner signal — most of the old window's complaints belong to
    # model years this defect was never in.
    filter_vehicle(
        df, "JEEP", "GRAND CHEROKEE",
        2008, 2008, "jeep_grand_cherokee",
    )

    # Chevrolet Silverado — electric power steering assist loss (18V-586,
    # filed 2018-07-09, confirmed via NHTSA campaign API + complaint-text
    # campaign number extraction). NOTE: this replaces the old "20V-504"
    # campaign number, which was wrong — it belongs to an unrelated airbag
    # inflator recall. 18V-586 covers ONLY the 2015 model year.
    filter_vehicle_multi_model(
        df, "CHEVROLET",
        ["SILVERADO 1500", "SILVERADO 2500", "SILVERADO 3500", "SILVERADO"],
        2015, 2015, "chevrolet_silverado",
    )

    # Honda Civic — Takata driver airbag inflator (15V-320, filed 2015-05-28,
    # confirmed via NHTSA campaign API). Covers ONLY 2001-2005 model years
    # for Civic specifically (the full campaign also covers Accord, CR-V,
    # Element, Odyssey, Pilot, Ridgeline, and some Acura models, but those
    # are out of scope here).
    filter_vehicle(
        df, "HONDA", "CIVIC",
        2001, 2005, "honda_civic",
    )

    # Toyota Camry — floor mat accelerator pedal entrapment (09V-388, filed
    # 2009-05-10). Window unchanged; this recall's affected model years were
    # already correctly scoped at 2004-2009.
    filter_vehicle(
        df, "TOYOTA", "CAMRY",
        2004, 2009, "toyota_camry",
    )
    
       # Chevrolet Cobalt — ignition switch / airbag non-deployment (14V-047,
    # filed 2014-02-14 per the Part 573 report RCAK-14V047-5800). The ORIGINAL
    # campaign covers 2005-2007 Cobalt and 2007 Pontiac G5. The NHTSA campaign
    # API returns 2014-10-02 and a six-model list; that is a later amendment,
    # and Feb-Oct 2014 is contaminated by national news coverage, so the
    # original date and scope are what we backtest against.
    filter_vehicle(
        df, "CHEVROLET", "COBALT",
        2005, 2007, "chevrolet_cobalt",
    )