"""Generate processed/clusters.json, the single artifact the app consumes.

Everything here is computed from the data rather than typed in by hand, so
re-running any upstream step and then re-running this keeps the app honest.

Run after cluster.py has saved clustered_<slug>.pkl for each validated vehicle.
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path

from vectorize import vectorize_vehicle, PROCESSED_DIR
from cluster import cluster_vehicle, DEFECT_PATTERNS

HORIZONS = [48, 36, 24, 18, 12, 6, 3, 1]
ALERT_THRESHOLDS = [25, 50, 100, 200]
TRAILING_WINDOW = 12

# The alerting rule the demo quotes. Stated out loud as a policy choice: flag a
# defect cluster once it accumulates this many complaints in a rolling 12
# months. Chosen because it is the lowest threshold that fires on BOTH
# validated vehicles, so the same rule is applied to each; the full sensitivity
# table ships alongside it so the dependence on this number is visible.
PRIMARY_THRESHOLD = 25

VALIDATED = {
    "ford_fusion": {
        "make": "FORD",
        "model": "FUSION",
        "best_k": 6,
        "focus_clusters": [1],
        "window": "2010-01-01 to 2016-12-31",
        "recall_date": "2015-09-10",
        "campaign": "15V-340",
        "defect": "Electric power steering assist may fail, requiring greater steering effort",
        "min_date": "2009-01-01",
    },
    "chevrolet_silverado": {
        "make": "CHEVROLET",
        "model": "SILVERADO",
        "best_k": 5,
        "focus_clusters": [3],
        "window": "2015-01-01 to 2015-12-31",
        "recall_date": "2018-07-09",
        "campaign": "18V-586",
        "defect": "Electric power steering assist may be lost momentarily, then suddenly return",
        "min_date": "2014-01-01",
    },
}

EXCLUDED = {
    "honda_civic": {
        "make": "HONDA",
        "model": "CIVIC",
        "window": "2001-01-01 to 2005-12-31",
        "recall_date": "2015-05-28",
        "campaign": "15V-320",
        "defect": "Takata driver frontal airbag inflator may rupture",
        "excluded_because": (
            "The clustering produced a very pure cluster (98.2%), but on inspection its "
            "top terms are 'did not deploy' / 'not deploy' -- it captures airbag "
            "NON-deployment complaints, which is the opposite failure mode from an "
            "inflator rupture. Separately, there is no pre-recall ramp to detect: 630 of "
            "the 879 pre-recall complaints were already filed 48 months out, and the rate "
            "is flat at roughly 60/year for 14 years. Takata ruptures numbered in the "
            "dozens nationwide, so no complaint wave ever existed. Two independent "
            "reasons, either sufficient."
        ),
    },
    "jeep_grand_cherokee": {
        "make": "JEEP",
        "model": "GRAND CHEROKEE",
        "window": "2008-01-01 to 2008-12-31",
        "recall_date": "2014-09-17",
        "campaign": "14V-567",
        "defect": "Ignition key may not return from START to ON, shutting the engine off",
        "excluded_because": (
            "The manufacturer's Part 573 report cites approximately 13 complaints at "
            "filing. The detection method needs a complaint wave; 13 complaints is not "
            "one, so this recall is structurally unbacktestable here regardless of "
            "clustering quality. Clustering confirmed it: best cluster reached only 1.3x "
            "lift over base rate, essentially no discriminative power."
        ),
    },
    "toyota_camry": {
        "make": "TOYOTA",
        "model": "CAMRY",
        "window": "2004-01-01 to 2009-12-31",
        "recall_date": "2009-05-10",
        "campaign": "09V-388",
        "defect": "Accelerator pedal may be trapped by an unsecured or incompatible floor mat",
        "excluded_because": (
            "Best lift was 2.6x with purity never above 21%. This vehicle's complaint "
            "population is dominated by unrelated high-volume issues (melting dashboards, "
            "oil consumption, sun visor failures), and only 8% of complaints matched the "
            "defect's language at all. The floor mat signal is real but too small relative "
            "to the noise to isolate cleanly."
        ),
    },
    "chevrolet_cobalt": {
        "make": "CHEVROLET",
        "model": "COBALT",
        "window": "2005-01-01 to 2007-12-31",
        # 2014-02-14 is the Part 573 report date (RCAK-14V047-5800) for the
        # ORIGINAL campaign: 2005-2007 Cobalt and 2007 Pontiac G5. The NHTSA
        # campaign API returns 2014-10-02 and six models, which is a later
        # amendment. We use the original on purpose: between February and
        # October 2014 this defect was a congressional-hearing-level news
        # story, so complaints in that window are driven by publicity.
        # Backtesting against the amendment would detect the news cycle and
        # call it an early warning.
        "recall_date": "2014-02-14",
        "campaign": "14V-047",
        "defect": (
            "Ignition switch may move out of the run position, shutting off the "
            "engine and disabling the airbags"
        ),
        "excluded_because": (
            "Not a volume problem. 1,005 of 7,189 complaints match the ignition/stall "
            "language and 335 of those were filed before the recall, so unlike the Jeep "
            "the complaint wave exists. It fails on isolation. The defect spreads across "
            "4 clusters each holding >=10%, and the best single cluster captures only "
            "39.3% of it at 23.0% purity (1.6x lift), against 72.0% / 95.6% / 3.0x for "
            "the Fusion. The cause is that one root defect produces four unrelated "
            "complaint vocabularies: the engine stalling, the key leaving the run "
            "position, the airbags failing to deploy in the resulting crash, and the "
            "loss of power steering and braking once the engine is off. The official "
            "categories show the same split -- 277 ELECTRICAL SYSTEM, 173 STEERING, "
            "91 ENGINE, 71 AIR BAGS. KMeans separated those narratives correctly, "
            "because they genuinely are different texts, which is exactly the wrong "
            "outcome for this defect. Merging the two best clusters at k=6 reaches "
            "63.2% recall but only 29.8% purity (2.1x lift), below the Camry already "
            "rejected at 2.6x. "
            "Worth recording honestly: the 25-complaints-in-12-months rule WOULD have "
            "fired in January 2006, 97 months before the recall. We do not count that "
            "as a detection. A 1.6x cluster is barely better than drawing complaints at "
            "random, and an alert that cannot be attributed to one specific failure is "
            "not an early warning, it is a coincidence with a good date on it."
        ),
    },
}

SOURCE = "NHTSA ODI Complaints flat file (public domain)"


def top_terms(tfidf_matrix, feature_names, labels, cluster_id, n_terms=12):
    feature_names = np.array(feature_names)
    idx = np.where(labels == cluster_id)[0]
    centroid = np.asarray(tfidf_matrix[idx].mean(axis=0)).ravel()
    return [str(t) for t in feature_names[centroid.argsort()[::-1][:n_terms]]]


def filed_dates(df, min_date):
    filed = pd.to_datetime(df["DATEA"], format="%Y%m%d", errors="coerce")
    ok = filed.notna() & (filed >= pd.Timestamp(min_date)) & (filed <= pd.Timestamp.today())
    return filed[ok]


def monthly_counts(dates):
    s = dates.to_frame("d").set_index("d").resample("MS").size()
    full = pd.date_range(s.index.min(), s.index.max(), freq="MS")
    return s.reindex(full, fill_value=0)


def build_validated(slug, spec):
    pattern = DEFECT_PATTERNS[slug]
    df, reduced, tfidf_matrix, feature_names = vectorize_vehicle(slug)
    labels = cluster_vehicle(reduced, spec["best_k"])
    df = df.copy()
    df["defect_group"] = labels

    hit = df["CDESCR"].str.contains(pattern, case=False, na=False, regex=True).values
    base_rate = hit.sum() / len(df)

    focus_mask = df["defect_group"].isin(spec["focus_clusters"]).values
    focus_hit = int((focus_mask & hit).sum())
    focus_size = int(focus_mask.sum())

    recall_dt = pd.Timestamp(spec["recall_date"])
    focus_dates = filed_dates(df[focus_mask], spec["min_date"])
    monthly = monthly_counts(focus_dates)
    trailing = monthly.rolling(TRAILING_WINDOW).sum()

    evidence = []
    for m in HORIZONS:
        cutoff = recall_dt - pd.DateOffset(months=m)
        evidence.append({
            "months_before_recall": m,
            "as_of": str(cutoff.date()),
            "complaints_filed": int((focus_dates <= cutoff).sum()),
        })

    sensitivity = []
    for t in ALERT_THRESHOLDS:
        crossed = trailing[(trailing >= t) & (trailing.index < recall_dt)]
        if len(crossed) == 0:
            sensitivity.append({"threshold": t, "alert_month": None, "lead_months": None})
        else:
            first = crossed.index.min()
            sensitivity.append({
                "threshold": t,
                "alert_month": first.strftime("%Y-%m"),
                "lead_months": round((recall_dt - first).days / 30.44, 1),
            })

    primary = next(s for s in sensitivity if s["threshold"] == PRIMARY_THRESHOLD)

    clusters = []
    for cid in sorted(np.unique(labels)):
        cm = labels == cid
        clusters.append({
            "cluster_id": int(cid),
            "size": int(cm.sum()),
            "is_focus": bool(cid in spec["focus_clusters"]),
            "defect_keyword_matches": int((cm & hit).sum()),
            "purity": round(float((cm & hit).sum() / cm.sum()), 4),
            "top_terms": top_terms(tfidf_matrix, feature_names, labels, cid),
        })

    return {
        "vehicle_id": slug,
        "make": spec["make"],
        "model": spec["model"],
        "status": "validated",
        "meta": {
            "window": spec["window"],
            "total_complaints_analyzed": int(len(df)),
            "n_clusters": spec["best_k"],
            "focus_cluster_ids": spec["focus_clusters"],
            "focus_cluster_size": focus_size,
            "recall_campaign_number": spec["campaign"],
            "recall_signal_month": spec["recall_date"],
            "defect_description": spec["defect"],
            "source": SOURCE,
        },
        "validation": {
            "defect_keyword_matches": int(hit.sum()),
            "base_rate": round(float(base_rate), 4),
            "focus_recall": round(float(focus_hit / hit.sum()), 4),
            "focus_purity": round(float(focus_hit / focus_size), 4),
            "focus_lift": round(float((focus_hit / focus_size) / base_rate), 2),
            "distinct_compdesc_labels": int(df[hit]["COMPDESC"].nunique()),
            "compdesc_breakdown": {
                str(k): int(v)
                for k, v in df[hit]["COMPDESC"].value_counts().head(20).items()
            },
            "note": (
                "defect_keyword_matches is a keyword-based ground truth used only to "
                "MEASURE the clustering. It never feeds the clustering, which is "
                "unsupervised over complaint narrative text alone."
            ),
        },
        "detection": {
            "policy": (
                f"Flag a cluster once it accumulates {PRIMARY_THRESHOLD} complaints in a "
                f"rolling {TRAILING_WINDOW} months."
            ),
            "primary_threshold": PRIMARY_THRESHOLD,
            "alert_month": primary["alert_month"],
            "lead_months": primary["lead_months"],
            "complaints_on_file_before_recall": int((focus_dates < recall_dt).sum()),
            "cumulative_evidence": evidence,
            "alert_sensitivity": sensitivity,
            "timeline_field": "DATEA (date complaint was filed with NHTSA)",
            "timeline_note": (
                "Uses filing date, not failure date. An early-warning system can only act "
                "on complaints that have actually been filed, so this is what was knowable "
                "at the time."
            ),
        },
        "monthly_series": [
            {"month": d.strftime("%Y-%m"), "complaints": int(c)}
            for d, c in monthly.items()
        ],
        "clusters": clusters,
    }


def build_excluded(slug, spec):
    return {
        "vehicle_id": slug,
        "make": spec["make"],
        "model": spec["model"],
        "status": "excluded",
        "meta": {
            "window": spec["window"],
            "recall_campaign_number": spec["campaign"],
            "recall_signal_month": spec["recall_date"],
            "defect_description": spec["defect"],
            "source": SOURCE,
        },
        "excluded_because": spec["excluded_because"],
    }


if __name__ == "__main__":
    vehicles = [build_validated(s, spec) for s, spec in VALIDATED.items()]
    vehicles += [build_excluded(s, spec) for s, spec in EXCLUDED.items()]

    out = {
        "generated_at": pd.Timestamp.today().strftime("%Y-%m-%d"),
        "method": {
            "summary": (
                "Complaint narratives are vectorized with TF-IDF (1-2 grams), reduced with "
                "truncated SVD, L2-normalized, and clustered with KMeans. No component "
                "codes, recall data, or labels of any kind are used as input."
            ),
            "preprocessing": [
                "Drop complaints with empty narratives.",
                "Drop post-recall administrative complaints (parts unavailable, recall-notice "
                "follow-ups): these postdate the recall by definition and cannot contribute "
                "to early detection.",
                "Strip NHTSA call-center boilerplate ('TL* THE CONTACT OWNS A...') so the "
                "model does not cluster on who transcribed the complaint.",
                "Extend stopwords with narrative scaffolding and post-hoc service-outcome "
                "vocabulary, but PRESERVE negation words (not/no/never): removing them makes "
                "'airbag did not deploy' identical to 'airbag did deploy'.",
                "L2-normalize SVD output so KMeans compares direction rather than document "
                "length, which otherwise proxies for writing style.",
            ],
            "known_limitations": [
                "Reach depends on complaint volume. A defect that generates few complaints "
                "before its recall cannot be detected by a volume-based method, however good "
                "the clustering is.",
                "Lead time depends on the alerting threshold. The sensitivity table is shipped "
                "so this dependence is visible rather than hidden behind one number.",
                "Three of five candidate vehicles were excluded after testing. Their reasons "
                "are recorded here rather than omitted.",
            ],
        },
        "vehicles": vehicles,
    }

    out_path = PROCESSED_DIR / "clusters.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\nWrote {out_path}")
    for v in vehicles:
        if v["status"] == "validated":
            d = v["detection"]
            print(f"  {v['vehicle_id']}: alert {d['alert_month']}, "
                  f"lead {d['lead_months']} mo, "
                  f"{d['complaints_on_file_before_recall']} complaints pre-recall")
        else:
            print(f"  {v['vehicle_id']}: excluded")