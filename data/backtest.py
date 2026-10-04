"""Backtest Fissure's defect clusters against the real recall dates.

Two separate questions, deliberately kept apart:

1. "How much evidence had accumulated before the recall?"  This is answered by
   counting complaints at fixed horizons before the recall date.  There is no
   threshold, no tuning, and no parameter to argue about -- it is just counting.
   This is the claim the pitch should lead with.

2. "When would an alerting system have fired?"  This REQUIRES choosing a
   threshold, and the answer moves a lot depending on which one you pick.  So
   this script reports a sensitivity table across several thresholds instead of
   a single number, and labels it as a policy choice rather than a finding.

Timeline uses DATEA (the date the complaint was added to NHTSA's database),
not FAILDATE.  An early-warning system can only act on complaints that have
actually been filed, so DATEA is what was knowable at the time.  FAILDATE is
reported separately as context for when failures began occurring in the field.
"""

import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = SCRIPT_DIR / "processed"

BACKTEST_CONFIG = {
    "ford_fusion": {
        "clusters": [1],
        "recall_date": "2015-09-10",
        "campaign": "15V-340",
        "defect": "Electric power steering assist loss",
        # Model years 2010-2016, which go on sale from roughly mid-2009.  A
        # complaint dated before 2009 is a corrupted date field, not a real
        # event (the Fusion nameplate only launched in 2006, and this window
        # starts at 2010).  Leaving these in creates ~95 zero-filled months
        # of fake "prehistory" that wrecks any baseline calculation.
        "min_date": "2009-01-01",
    },
    "chevrolet_silverado": {
        "clusters": [3],
        "recall_date": "2018-07-09",
        "campaign": "18V-586",
        "defect": "Electric power steering assist loss",
        "min_date": "2014-01-01",
    },
    "honda_civic": {
        "clusters": [1, 2],
        "recall_date": "2015-05-28",
        "campaign": "15V-320",
        "defect": "Takata driver airbag inflator",
        "min_date": "2000-01-01",
    },
}

# Months before the recall at which to report accumulated complaint counts.
HORIZONS = [48, 36, 24, 18, 12, 6, 3, 1]

# Trailing-12-month complaint counts to test as alerting thresholds.  These are
# policy choices, not discovered values -- the point of showing several is to be
# honest that the "lead time" depends on which one you adopt.
ALERT_THRESHOLDS = [25, 50, 100, 200]

TRAILING_WINDOW = 12


def load_focus(slug, cfg):
    """Load a vehicle's clustered complaints, keep only the focus cluster(s),
    and attach a cleaned filing date."""
    df = pd.read_pickle(PROCESSED_DIR / f"clustered_{slug}.pkl")
    focus = df[df["defect_group"].isin(cfg["clusters"])].copy()

    min_date = pd.Timestamp(cfg["min_date"])
    max_date = pd.Timestamp.today()

    # NHTSA stores these as YYYYMMDD strings.
    filed = pd.to_datetime(focus["DATEA"], format="%Y%m%d", errors="coerce")
    failed = pd.to_datetime(focus["FAILDATE"], format="%Y%m%d", errors="coerce")

    focus["filed_date"] = filed
    focus["failure_date"] = failed

    before = len(focus)
    focus = focus[
        focus["filed_date"].notna()
        & (focus["filed_date"] >= min_date)
        & (focus["filed_date"] <= max_date)
    ].copy()
    dropped = before - len(focus)

    return focus, dropped


def monthly_series(focus, date_col="filed_date"):
    s = focus.set_index(date_col).resample("MS").size()
    full_index = pd.date_range(s.index.min(), s.index.max(), freq="MS")
    return s.reindex(full_index, fill_value=0)


def cumulative_table(focus, recall_date):
    """How many complaints had been FILED by each horizon before the recall."""
    recall = pd.Timestamp(recall_date)
    rows = []
    for months in HORIZONS:
        cutoff = recall - pd.DateOffset(months=months)
        n = (focus["filed_date"] <= cutoff).sum()
        rows.append({"months_before": months, "as_of": cutoff.date(), "complaints_filed": int(n)})
    total_before = int((focus["filed_date"] < recall).sum())
    return rows, total_before


def alert_sensitivity(monthly, recall_date):
    """For each candidate threshold, the first month the trailing-12-month
    filed count reached it, and how far ahead of the recall that was."""
    recall = pd.Timestamp(recall_date)
    trailing = monthly.rolling(TRAILING_WINDOW).sum()

    rows = []
    for threshold in ALERT_THRESHOLDS:
        crossed = trailing[trailing >= threshold]
        crossed_before = crossed[crossed.index < recall]
        if len(crossed_before) == 0:
            rows.append({
                "threshold": threshold,
                "alert_month": None,
                "lead_months": None,
            })
            continue
        first = crossed_before.index.min()
        lead = round((recall - first).days / 30.44, 1)
        rows.append({
            "threshold": threshold,
            "alert_month": first.strftime("%Y-%m"),
            "lead_months": lead,
        })
    return rows


def report(slug, cfg):
    focus, dropped = load_focus(slug, cfg)
    monthly = monthly_series(focus)
    recall = pd.Timestamp(cfg["recall_date"])

    print(f"\n{'=' * 68}")
    print(f"{slug}  |  {cfg['campaign']}  |  {cfg['defect']}")
    print(f"{'=' * 68}")
    print(f"  focus cluster(s):      {cfg['clusters']}")
    print(f"  complaints in cluster: {len(focus):,}")
    if dropped:
        print(f"  dropped (bad dates):   {dropped}")
    print(f"  filing dates span:     {monthly.index.min().date()} to {monthly.index.max().date()}")
    print(f"  recall filed:          {recall.date()}")

    rows, total_before = cumulative_table(focus, cfg["recall_date"])
    print(f"\n  Complaints already on file before the recall: {total_before:,}")
    print(f"\n  Accumulated evidence by horizon (no threshold, just counting):")
    print(f"    {'months before':>14}  {'as of':>12}  {'filed':>8}")
    for r in rows:
        print(f"    {r['months_before']:>14}  {str(r['as_of']):>12}  {r['complaints_filed']:>8,}")

    sens = alert_sensitivity(monthly, cfg["recall_date"])
    print(f"\n  Alert month by threshold (trailing {TRAILING_WINDOW}-month filed count):")
    print(f"    {'threshold':>10}  {'alert month':>12}  {'lead (months)':>14}")
    for r in sens:
        am = r["alert_month"] or "never"
        lm = f"{r['lead_months']}" if r["lead_months"] is not None else "-"
        print(f"    {r['threshold']:>10}  {am:>12}  {lm:>14}")

    # Context only: when failures were actually occurring in the field, which
    # is a different question from when they became knowable to a regulator.
    failures = focus["failure_date"].dropna()
    failures = failures[failures >= pd.Timestamp(cfg["min_date"])]
    if len(failures):
        print(f"\n  (context) earliest valid FAILDATE: {failures.min().date()}"
              f"  |  median: {failures.median().date()}")

    return {
        "slug": slug,
        "campaign": cfg["campaign"],
        "cluster_size": len(focus),
        "total_before_recall": total_before,
        "horizons": rows,
        "sensitivity": sens,
    }


if __name__ == "__main__":
    results = [report(slug, cfg) for slug, cfg in BACKTEST_CONFIG.items()]

    print(f"\n\n{'=' * 68}")
    print("SUMMARY  (the threshold-free claim, for the pitch)")
    print(f"{'=' * 68}")
    for r in results:
        h24 = next((x for x in r["horizons"] if x["months_before"] == 24), None)
        h12 = next((x for x in r["horizons"] if x["months_before"] == 12), None)
        print(f"\n  {r['slug']}  ({r['campaign']})")
        print(f"    {r['total_before_recall']:,} complaints on file before the recall")
        if h24:
            print(f"    {h24['complaints_filed']:,} already filed 24 months before")
        if h12:
            print(f"    {h12['complaints_filed']:,} already filed 12 months before")