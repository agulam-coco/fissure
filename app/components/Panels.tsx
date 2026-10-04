"use client";

import { useState } from "react";
import { INK, type ClustersData, type ValidatedVehicle } from "@/lib/types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => n.toLocaleString();

function Panel({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="panel rounded-lg p-5">
            <h3 className="text-sm font-medium text-[#efe7f0]">{title}</h3>
            {subtitle && (
                <p className="mt-1 max-w-prose text-xs leading-relaxed text-[#6b6472]">{subtitle}</p>
            )}
            <div className="mt-5">{children}</div>
        </section>
    );
}

/** Horizontal magnitude bar. 4px rounded data-end, 2px gap to the surface. */
function Bar({
    value,
    max,
    color,
}: {
    value: number;
    max: number;
    color: string;
}) {
    return (
        <div className="h-5 flex-1 overflow-hidden rounded-sm bg-[#0f0d12]">
            <div
                className="h-full rounded-r-[4px]"
                style={{
                    width: `${Math.max((value / max) * 100, 1.5)}%`,
                    background: color,
                    opacity: 0.55,
                }}
            />
        </div>
    );
}

/**
 * The four numbers the pitch rests on. Only the lead time wears the accent;
 * the rest stay in ink so the one number that matters is unmistakable.
 */
export function Headline({ vehicle }: { vehicle: ValidatedVehicle }) {
    const d = vehicle.detection;
    const v = vehicle.validation;
    const at24 = d.cumulative_evidence.find((r) => r.months_before_recall === 24);
    const at12 = d.cumulative_evidence.find((r) => r.months_before_recall === 12);

    const stats: { label: string; value: string; accent?: boolean }[] = [
        {
            label: "Between the first flag and the recall",
            value: d.lead_months != null ? `${d.lead_months} mo` : "no flag",
            accent: true,
        },
        {
            label: "Complaints on file two years before",
            value: at24 ? num(at24.complaints_filed) : "n/a",
        },
        {
            label: "Complaints on file one year before",
            value: at12 ? num(at12.complaints_filed) : "n/a",
        },
        {
            label: "Official categories they were split across",
            value: num(v.distinct_compdesc_labels),
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
                <div key={s.label} className="panel rounded-lg px-4 py-4">
                    <div
                        className="font-mono text-[26px] leading-none"
                        style={{ color: s.accent ? INK.incandescent : INK.primary }}
                    >
                        {s.value}
                    </div>
                    <div className="mt-2 text-[11px] leading-snug text-[#6b6472]">{s.label}</div>
                </div>
            ))}
        </div>
    );
}

export function EvidencePanel({ vehicle }: { vehicle: ValidatedVehicle }) {
    const rows = vehicle.detection.cumulative_evidence;
    const max = Math.max(...rows.map((r) => r.complaints_filed), 1);

    return (
        <Panel
            title="Evidence already on file"
            subtitle="No threshold and no model here. This is only how many complaints existed by each date."
        >
            <div className="space-y-1.5">
                {rows.map((r) => (
                    <div key={r.months_before_recall} className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-right font-mono text-[#6b6472]">
                            {r.months_before_recall} mo before
                        </span>
                        <Bar value={r.complaints_filed} max={max} color={INK.magma} />
                        <span className="w-14 shrink-0 text-right font-mono text-[#efe7f0]">
                            {num(r.complaints_filed)}
                        </span>
                    </div>
                ))}
            </div>
            <p className="mt-5 border-t border-[#221e27] pt-3 text-xs leading-relaxed text-[#a99fb0]">
                {num(vehicle.detection.complaints_on_file_before_recall)} complaints were on
                file in this cluster the day the recall was filed.
            </p>
        </Panel>
    );
}

export function FragmentationPanel({ vehicle }: { vehicle: ValidatedVehicle }) {
    const entries = Object.entries(vehicle.validation.compdesc_breakdown);
    const total = entries.reduce((a, [, n]) => a + n, 0);
    const top = entries.slice(0, 8);
    const rest = total - top.reduce((a, [, n]) => a + n, 0);

    return (
        <Panel
            title="Why nobody saw it as one defect"
            subtitle={`All ${num(vehicle.validation.defect_keyword_matches)} of these complaints describe the same failure. They were filed under ${vehicle.validation.distinct_compdesc_labels} different official component codes.`}
        >
            <div className="space-y-1.5">
                {top.map(([label, n]) => (
                    <div key={label} className="flex items-center gap-3 text-xs">
                        <span className="w-52 shrink-0 truncate text-[#a99fb0]" title={label}>
                            {label}
                        </span>
                        <Bar value={n} max={top[0][1]} color={INK.steel} />
                        <span className="w-12 shrink-0 text-right font-mono text-[#efe7f0]">{n}</span>
                    </div>
                ))}
                {rest > 0 && (
                    <p className="pt-2 text-xs text-[#6b6472]">
                        and {num(rest)} more spread across the remaining categories
                    </p>
                )}
            </div>
        </Panel>
    );
}

export function ClusterPanel({ vehicle }: { vehicle: ValidatedVehicle }) {
    return (
        <Panel
            title={`Every cluster the model found (k=${vehicle.meta.n_clusters})`}
            subtitle="Unsupervised over complaint text alone. No component codes and no recall data went in as input."
        >
            <div className="space-y-2">
                {vehicle.clusters.map((c) => (
                    <div
                        key={c.cluster_id}
                        className="rounded-md border px-3.5 py-3"
                        style={{
                            borderColor: c.is_focus ? "rgba(255,90,31,0.4)" : INK.grid,
                            background: c.is_focus ? "rgba(255,90,31,0.04)" : "transparent",
                        }}
                    >
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-xs font-medium text-[#efe7f0]">
                                Cluster {c.cluster_id}
                                {c.is_focus && (
                                    <span
                                        className="ml-2 rounded-sm px-1.5 py-0.5 text-[10px] font-normal"
                                        style={{ background: "rgba(255,90,31,0.14)", color: INK.incandescent }}
                                    >
                                        flagged
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-[#6b6472]">
                                {num(c.size)} complaints, {pct(c.purity)} on-defect
                            </span>
                        </div>
                        <p className="mt-2 font-mono text-[11px] leading-relaxed text-[#6b6472]">
                            {c.top_terms.slice(0, 10).join("  ")}
                        </p>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

export function SensitivityPanel({ vehicle }: { vehicle: ValidatedVehicle }) {
    const d = vehicle.detection;
    return (
        <Panel title="How much the answer moves with the threshold" subtitle={d.policy}>
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-left text-[#6b6472]">
                        <th className="pb-2 font-normal">Flag at</th>
                        <th className="pb-2 font-normal">Would have fired</th>
                        <th className="pb-2 text-right font-normal">Warning</th>
                    </tr>
                </thead>
                <tbody className="font-mono">
                    {d.alert_sensitivity.map((s) => {
                        const active = s.threshold === d.primary_threshold;
                        return (
                            <tr
                                key={s.threshold}
                                className="border-t border-[#221e27]"
                                style={{ color: active ? INK.incandescent : INK.secondary }}
                            >
                                <td className="py-1.5">{s.threshold}/yr</td>
                                <td className="py-1.5">{s.alert_month ?? "never"}</td>
                                <td className="py-1.5 text-right">
                                    {s.lead_months != null ? `${s.lead_months} mo` : "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="mt-4 border-t border-[#221e27] pt-3 text-xs leading-relaxed text-[#6b6472]">
                The highlighted row is the rule used everywhere on this page. The whole band
                is here because the warning time depends on where the line is drawn, and
                hiding that behind one number would be the easy thing to do.
            </p>
        </Panel>
    );
}

export function ValidationPanel({ vehicle }: { vehicle: ValidatedVehicle }) {
    const v = vehicle.validation;
    const rows: [string, string][] = [
        ["Complaints analyzed", num(vehicle.meta.total_complaints_analyzed)],
        ["Flagged cluster size", num(vehicle.meta.focus_cluster_size)],
        ["Share of the defect captured", pct(v.focus_recall)],
        ["Share of the cluster on-defect", pct(v.focus_purity)],
        ["Lift over base rate", `${v.focus_lift}x`],
        ["Recall campaign", vehicle.meta.recall_campaign_number],
    ];
    return (
        <Panel title="Validation" subtitle={v.note}>
            <dl className="grid grid-cols-1 gap-x-10 gap-y-2 sm:grid-cols-2">
                {rows.map(([k, val]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
                        <dt className="text-[#6b6472]">{k}</dt>
                        <dd className="font-mono text-[#efe7f0]">{val}</dd>
                    </div>
                ))}
            </dl>
        </Panel>
    );
}

export function ExcludedPanel({ vehicles }: { vehicles: ClustersData["vehicles"] }) {
    const excluded = vehicles.filter((v) => v.status === "excluded");
    const [open, setOpen] = useState<string | null>(null);
    if (!excluded.length) return null;

    return (
        <Panel
            title="Tested and rejected"
            subtitle="Recalls this method could not backtest, and why. Kept on the page rather than quietly dropped."
        >
            <div className="space-y-2">
                {excluded.map((v) => {
                    const isOpen = open === v.vehicle_id;
                    return (
                        <div key={v.vehicle_id} className="rounded-md border border-[#221e27]">
                            <button
                                onClick={() => setOpen(isOpen ? null : v.vehicle_id)}
                                aria-expanded={isOpen}
                                className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left"
                            >
                                <span className="text-xs text-[#a99fb0]">
                                    {v.make.charAt(0) + v.make.slice(1).toLowerCase()}{" "}
                                    {v.model.charAt(0) + v.model.slice(1).toLowerCase()}
                                    <span className="ml-2 font-mono text-[11px] text-[#6b6472]">
                                        {v.meta.recall_campaign_number}
                                    </span>
                                </span>
                                <span className="shrink-0 text-[11px] text-[#6b6472]">
                                    {isOpen ? "Hide" : "Why"}
                                </span>
                            </button>
                            {isOpen && "excluded_because" in v && (
                                <p className="border-t border-[#221e27] px-3.5 py-3 text-xs leading-relaxed text-[#a99fb0]">
                                    {v.excluded_because}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}

export function MethodPanel({ method }: { method: ClustersData["method"] }) {
    return (
        <Panel title="Method" subtitle={method.summary}>
            <div className="space-y-6">
                <div>
                    <h4 className="mb-2.5 text-xs font-medium text-[#a99fb0]">Preprocessing</h4>
                    <ol className="space-y-2">
                        {method.preprocessing.map((p, i) => (
                            <li key={i} className="flex gap-3 text-xs leading-relaxed text-[#6b6472]">
                                <span className="font-mono text-[#3a3344]">{i + 1}</span>
                                <span>{p}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                <div>
                    <h4 className="mb-2.5 text-xs font-medium text-[#a99fb0]">
                        Where this breaks down
                    </h4>
                    <ul className="space-y-2">
                        {method.known_limitations.map((p, i) => (
                            <li key={i} className="text-xs leading-relaxed text-[#6b6472]">
                                {p}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </Panel>
    );
}