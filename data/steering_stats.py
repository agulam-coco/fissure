"""Verify the steering numbers used in the Fissure slides and video.

Run from the data/ folder:
    python3 steering_stats.py

Uses processed/clustered_ford_fusion.pkl, the same cleaned complaints the app's
clusters.json was built from.
"""
from pathlib import Path

import pandas as pd

PROCESSED = Path(__file__).resolve().parent / "processed"
PATTERN = r"POWER STEERING|STEERING ASSIST|STEERING WHEEL|LOSS OF STEERING"  # cluster.py DEFECT_PATTERNS
RECALL = pd.Timestamp("2015-09-10")
TWO_YEARS_BEFORE = pd.Timestamp("2013-09-10")
FOCUS_CLUSTER = 1
MIN_DATE = pd.Timestamp("2009-01-01")

df = pd.read_pickle(PROCESSED / "clustered_ford_fusion.pkl")
df["filed"] = pd.to_datetime(df["DATEA"], format="%Y%m%d", errors="coerce")
df["mentions"] = df["CDESCR"].str.contains(PATTERN, case=False, na=False, regex=True)
df["label_exact"] = df["COMPDESC"].fillna("").str.upper().eq("STEERING")
df["label_any_steering"] = df["COMPDESC"].fillna("").str.upper().str.contains("STEERING")


def split(rows, title):
    m = rows[rows["mentions"]]
    exact = int(m["label_exact"].sum())
    anyst = int(m["label_any_steering"].sum())
    print(f"\n{title}")
    print(f"  described steering in their own words : {len(m):>6,}")
    print(f'  filed under exactly "STEERING"         : {exact:>6,}  ({exact / max(len(m), 1):.0%})')
    print(f"  filed under any STEERING* label        : {anyst:>6,}  ({anyst / max(len(m), 1):.0%})")
    print(f"  filed under NO steering label at all   : {len(m) - anyst:>6,}  ({(len(m) - anyst) / max(len(m), 1):.0%})")
    print(f"  distinct labels used                   : {m['COMPDESC'].nunique():>6,}")


print("=" * 64)
print("ROWS IN THE FILE (what clusters.json and the slides count)")
split(df, "All filing dates")
split(df[df["filed"] < RECALL], "Filed BEFORE the recall (2015-09-10)")
split(df[df["filed"] < TWO_YEARS_BEFORE], "Filed 2+ years before the recall (before 2013-09-10)")

# NHTSA can list one complaint once per component it involves. Count each
# complaint (ODINO) once, and call it "steering" if ANY of its rows is.
if "ODINO" in df.columns:
    per = df.groupby("ODINO").agg(
        mentions=("mentions", "max"),
        label_exact=("label_exact", "max"),
        label_any_steering=("label_any_steering", "max"),
        COMPDESC=("COMPDESC", "first"),
        filed=("filed", "min"),
    )
    print("\n" + "=" * 64)
    print(f"UNIQUE COMPLAINTS (by ODINO): {len(per):,} complaints vs {len(df):,} rows")
    split(per, "All filing dates, unique complaints")
    split(per[per["filed"] < RECALL], "Before the recall, unique complaints")

# The 192 on the hook slide: Fissure's flagged cluster, filed by 2 years out.
if "defect_group" in df.columns:
    c = df[(df["defect_group"] == FOCUS_CLUSTER) & (df["filed"] >= MIN_DATE) & (df["filed"] < TWO_YEARS_BEFORE)]
    print("\n" + "=" * 64)
    print(f"FLAGGED CLUSTER, filed before 2013-09-10: {len(c):,} complaints (hook slide says 192)")
    print(f'  filed under exactly "STEERING": {int(c["label_exact"].sum()):,}')
    print(f"  filed under no steering label : {int((~c['label_any_steering']).sum()):,}")

# Real examples anyone can look up on nhtsa.gov by complaint number.
ex = df[df["mentions"] & ~df["label_any_steering"] & (df["filed"] < RECALL)]
if len(ex):
    print("\n" + "=" * 64)
    print("EXAMPLES: describe steering, filed under something else (pre-recall)")
    idcol = "ODINO" if "ODINO" in df.columns else None
    for _, r in ex.sample(min(5, len(ex)), random_state=7).iterrows():
        cid = r[idcol] if idcol else "(no id column)"
        print(f"\n  complaint {cid} | filed {r['filed'].date()} | label: {r['COMPDESC']}")
        print(f"  \"{str(r['CDESCR'])[:220]}...\"")