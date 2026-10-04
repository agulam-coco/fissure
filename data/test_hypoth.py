"""Try a third vehicle: the GM ignition switch recall, 14V-047.

Run from data/:
    python3 add_cobalt.py

Why this one. Fusion and Silverado are both electric power steering, so the
method is so far only proven on one component family. This recall is a
different failure entirely: the ignition switch slips out of the run position
and the engine shuts off while driving. NHTSA files it under AIR BAGS, because
the consequence they care about is that the airbags will not deploy once the
key is out of run.

Recall facts, from the Part 573 Defect Information Report (RCAK-14V047-5800):
    campaign     14V-047
    report date  2014-02-14
    scope        Chevrolet Cobalt 2005-2007, Pontiac G5 2007
    units        619,122

The NHTSA campaign API reports 2014-10-02 for this campaign and a much wider
model list. That is a later amendment. We deliberately use the ORIGINAL date
and the ORIGINAL scope: between February and October 2014 this recall was a
national news story, so complaints filed in that window are contaminated by
publicity. Backtesting against the amendment date would let us detect the
news cycle and call it an early warning.

This script does not commit to anything. It filters, clusters, sweeps k, and
backtests, then prints whether the result clears the same bar Fusion and
Silverado cleared. If it does not, the honest move is an EXCLUDED entry with
the reason, same as Civic, Jeep and Camry.
"""
from pathlib import Path

import pandas as pd

from filter_vehicles import filter_vehicle, PROCESSED_DIR
from vectorize import vectorize_vehicle
from cluster import cluster_vehicle, fragmentation_report

SLUG = "chevrolet_cobalt"
RECALL = pd.Timestamp("2014-02-14")
TRAILING_WINDOW = 12
PRIMARY_THRESHOLD = 25

# Owner language for "the engine shut off while I was driving". Built on the
# same shape as the Jeep pattern, which already handles the \b STALL/INSTALL
# trap. Tune this if the sweep looks wrong.
PATTERN = (
    r"\bSTALL"
    r"|IGNITION SWITCH"
    r"|SHUT (?:OFF|DOWN) (?:WHILE|WHEN|DURING)"
    r"|(?:ENGINE|CAR|VEHICLE) (?:JUST )?(?:SHUT|CUT|TURNED?) (?:OFF|OUT|DOWN)"
    r"|KEY (?:TURNED|MOVED|SLIPPED|ROTATED|FELL)"
    r"|RUN POSITION|ACCESSORY POSITION"
    r"|LOST (?:ALL )?POWER (?:WHILE|WHEN)"
    r"|WITHOUT WARNING (?:WHILE|WHEN) DRIVING"
)


def rolling_alert(dates):
    """First month where the cluster holds PRIMARY_THRESHOLD complaints in a
    trailing 12 months. Same rule backtest.py applies to the other vehicles."""
    if not len(dates):
        return None
    monthly = dates.dt.to_period("M").value_counts().sort_index()
    full = monthly.reindex(
        pd.period_range(monthly.index.min(), monthly.index.max(), freq="M"),
        fill_value=0,
    )
    rolling = full.rolling(TRAILING_WINDOW, min_periods=1).sum()
    hit = rolling[rolling >= PRIMARY_THRESHOLD]
    return hit.index[0] if len(hit) else None


print("=" * 70)
print("STEP 1  filter")
master = pd.read_pickle(PROCESSED_DIR / "complaints_clean.pkl")
chev = master[master["MAKETXT"].fillna("").str.upper() == "CHEVROLET"]
variants = [m for m in chev["MODELTXT"].dropna().unique() if "COBALT" in str(m).upper()]
print(f"  Chevrolet model strings containing COBALT: {variants}")
if not variants:
    raise SystemExit("  No COBALT rows found. Check MODELTXT spelling in the raw file.")

filter_vehicle(master, "CHEVROLET", "COBALT", 2005, 2007, SLUG)

print("\n" + "=" * 70)
print("STEP 2  vectorize")
df, reduced, _, _ = vectorize_vehicle(SLUG)
hit = df["CDESCR"].str.contains(PATTERN, case=False, na=False, regex=True)
print(f"  complaints: {len(df):,}")
print(f"  matching the ignition-switch pattern: {int(hit.sum()):,} ({hit.mean():.1%})")

filed = pd.to_datetime(df["DATEA"], format="%Y%m%d", errors="coerce")
print(f"  filed before the recall: {int((filed < RECALL).sum()):,}")
print(f"  of those, matching the pattern: {int((hit & (filed < RECALL)).sum()):,}")

print("\n  official categories these complaints were filed under:")
for label, n in df[hit]["COMPDESC"].value_counts().head(8).items():
    print(f"    {n:>5,}  {label}")

if hit.sum() < 50:
    print("\n  WARNING: under 50 keyword matches. Jeep died here at 13.")

print("\n" + "=" * 70)
print("STEP 3  k-sweep")
results = {}
for k in (5, 6, 8, 10):
    print(f"\n{'=' * 20} {SLUG} k={k} {'=' * 20}")
    labels = cluster_vehicle(reduced, k)
    rows = fragmentation_report(df, labels, PATTERN)
    best = max(rows, key=lambda r: r["recall"])
    results[k] = (best, labels)

print("\n" + "=" * 70)
print("STEP 4  backtest the best cluster at each k")
print(f"  recall filed {RECALL.date()}, rule = {PRIMARY_THRESHOLD} complaints in a rolling {TRAILING_WINDOW} months\n")
print(f"  {'k':>3}  {'recall':>7}  {'purity':>7}  {'lift':>6}  {'alert':>8}  {'lead':>9}")
for k, (best, labels) in results.items():
    in_cluster = labels == best["cluster"]
    alert = rolling_alert(filed[in_cluster & (filed < RECALL)].dropna())
    if alert is None:
        lead = "never"
        alert_s = "-"
    else:
        alert_ts = alert.to_timestamp()
        lead = f"{(RECALL - alert_ts).days / 30.44:.1f} mo"
        alert_s = str(alert)
    print(f"  {k:>3}  {best['recall']:>6.1%}  {best['purity']:>6.1%}  "
          f"{best['lift']:>5.1f}x  {alert_s:>8}  {lead:>9}")

print("\n" + "=" * 70)
print("VERDICT")
print("  Bar the other two cleared: Fusion 72.0% recall / 95.6% purity / 3.0x")
print("                             Silverado 67.7% / 47.1% / 3.5x")
ok = [k for k, (b, _) in results.items() if b["recall"] >= 0.40 and b["lift"] >= 2.5]
if ok:
    print(f"  Clears it at k={ok}. Pick one and promote it to VALIDATED.")
else:
    print("  Does not clear it. Write an EXCLUDED entry with the real reason,")
    print("  the way Civic, Jeep and Camry are handled. That is still a result.")