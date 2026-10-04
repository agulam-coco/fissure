"use client";

import { useMemo, useState } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { INK, type ValidatedVehicle } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2015-09-10" or "2015-09" -> "2015-09" */
const toMonth = (d: string) => d.slice(0, 7);

function monthLabel(m: string) {
    const [y, mo] = m.split("-");
    return `${MONTHS[Number(mo) - 1]} ${y}`;
}

function addMonths(m: string, n: number) {
    const [y, mo] = m.split("-").map(Number);
    const total = y * 12 + (mo - 1) + n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export default function Timeline({ vehicle }: { vehicle: ValidatedVehicle }) {
    const [full, setFull] = useState(false);

    const recallMonth = toMonth(vehicle.meta.recall_signal_month);
    const alertMonth = vehicle.detection.alert_month;
    const lead = vehicle.detection.lead_months;

    const data = useMemo(() => {
        const series = vehicle.monthly_series;
        if (full) return series;
        // Default view stops a year past the recall. The tail runs to 2026 and
        // would flatten the ramp that matters.
        const cutoff = addMonths(recallMonth, 12);
        return series.filter((p) => p.month <= cutoff);
    }, [vehicle.monthly_series, full, recallMonth]);

    return (
        <section className="panel rounded-lg p-5">
            <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                    <h3 className="text-sm font-medium text-[#efe7f0]">
                        Complaints per month describing this failure
                    </h3>
                    <p className="mt-1 text-xs text-[#6b6472]">
                        Plotted by the date each complaint was filed, so every point was
                        knowable at the time.
                    </p>
                </div>
                <button
                    onClick={() => setFull((f) => !f)}
                    className="rounded border border-[#2a2430] px-2.5 py-1 text-xs text-[#a99fb0] transition hover:border-[#3a3344] hover:text-[#efe7f0]"
                >
                    {full ? "Focus on the recall window" : "Show full history"}
                </button>
            </header>

            <div className="h-72 w-full">
                <ResponsiveContainer>
                    <AreaChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="reported" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={INK.magma} stopOpacity={0.38} />
                                <stop offset="100%" stopColor={INK.magma} stopOpacity={0.02} />
                            </linearGradient>
                        </defs>

                        {/* Recessive: horizontal only, no vertical rules competing with
                the two event markers. */}
                        <CartesianGrid stroke={INK.grid} vertical={false} />

                        <XAxis
                            dataKey="month"
                            tick={{ fill: INK.muted, fontSize: 11 }}
                            tickFormatter={(m: string) => (m.endsWith("-01") ? m.slice(0, 4) : "")}
                            interval={0}
                            axisLine={{ stroke: INK.grid }}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: INK.muted, fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={44}
                        />

                        {/* The warning the data was already giving. */}
                        {alertMonth && (
                            <ReferenceArea
                                x1={alertMonth}
                                x2={recallMonth}
                                fill={INK.incandescent}
                                fillOpacity={0.06}
                            />
                        )}

                        <Area
                            type="monotone"
                            dataKey="complaints"
                            stroke={INK.magma}
                            strokeWidth={2}
                            fill="url(#reported)"
                            dot={false}
                            activeDot={{ r: 4.5, fill: INK.magma, stroke: INK.surface, strokeWidth: 2 }}
                        />

                        {alertMonth && (
                            <ReferenceLine
                                x={alertMonth}
                                stroke={INK.incandescent}
                                strokeWidth={2}
                                strokeDasharray="5 4"
                                label={{
                                    value: "Fissure flags it",
                                    position: "insideTopLeft",
                                    fill: INK.incandescent,
                                    fontSize: 11,
                                    offset: 8,
                                }}
                            />
                        )}

                        <ReferenceLine
                            x={recallMonth}
                            stroke={INK.steel}
                            strokeWidth={2}
                            label={{
                                value: "Recall filed",
                                position: "insideTopRight",
                                fill: INK.steel,
                                fontSize: 11,
                                offset: 8,
                            }}
                        />

                        <Tooltip
                            cursor={{ stroke: INK.muted, strokeWidth: 1, strokeDasharray: "3 3" }}
                            contentStyle={{
                                background: "#0d0b10",
                                border: `1px solid ${INK.grid}`,
                                borderRadius: 6,
                                fontSize: 12,
                            }}
                            labelStyle={{ color: INK.secondary, marginBottom: 2 }}
                            itemStyle={{ color: INK.primary }}
                            labelFormatter={(m) => monthLabel(String(m))}
                            formatter={(v) => [`${v} filed`, ""]}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {alertMonth && lead != null && (
                <footer className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#221e27] pt-3 text-xs">
                    <span className="flex items-center gap-2 text-[#a99fb0]">
                        <span
                            className="inline-block h-0 w-4 border-t-2 border-dashed"
                            style={{ borderColor: INK.incandescent }}
                        />
                        Flagged {monthLabel(alertMonth)}
                    </span>
                    <span className="flex items-center gap-2 text-[#a99fb0]">
                        <span
                            className="inline-block h-0 w-4 border-t-2"
                            style={{ borderColor: INK.steel }}
                        />
                        Recalled {monthLabel(recallMonth)}
                    </span>
                    <span className="font-mono" style={{ color: INK.incandescent }}>
                        {lead} months between them
                    </span>
                </footer>
            )}
        </section>
    );
}