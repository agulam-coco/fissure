"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hero from "@/components/Hero";
import Timeline from "@/components/Timeline";
import {
    ClusterPanel,
    EvidencePanel,
    ExcludedPanel,
    FragmentationPanel,
    Headline,
    MethodPanel,
    SensitivityPanel,
    ValidationPanel,
} from "@/components/Panels";
import { isValidated, type ClustersData, type ValidatedVehicle } from "@/lib/types";

export default function Page() {
    const [data, setData] = useState<ClustersData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const evidenceRef = useRef<HTMLElement>(null);

    useEffect(() => {
        fetch("/clusters.json")
            .then((r) => {
                if (!r.ok) throw new Error(`clusters.json returned ${r.status}`);
                return r.json();
            })
            .then((d: ClustersData) => {
                setData(d);
                const first = d.vehicles.find(isValidated);
                if (first) setSelected(first.vehicle_id);
            })
            .catch((e) => setError(String(e)));
    }, []);

    const validated = useMemo(
        () => (data ? data.vehicles.filter(isValidated) : []),
        [data],
    );

    const vehicle: ValidatedVehicle | undefined = useMemo(
        () => validated.find((v) => v.vehicle_id === selected),
        [validated, selected],
    );

    const seeEvidence = useCallback((vehicleId: string) => {
        setSelected(vehicleId);
        requestAnimationFrame(() => {
            evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }, []);

    if (error) {
        return (
            <main className="mx-auto max-w-2xl px-6 py-24">
                <h1 className="text-sm text-[#ff5a1f]">clusters.json did not load</h1>
                <p className="mt-2 text-sm text-[#8b8293]">{error}</p>
                <p className="mt-4 font-mono text-xs text-[#6b6472]">
                    cp ../data/processed/clusters.json public/
                </p>
            </main>
        );
    }

    if (!data || !vehicle) {
        return (
            <main className="grid min-h-screen place-items-center">
                <p className="text-sm text-[#6b6472]">Loading</p>
            </main>
        );
    }

    return (
        <main>
            <Hero data={data} onSeeEvidence={seeEvidence} />

            {/* Deliberately cold after the hero: the drama is over, this is the record. */}
            <section ref={evidenceRef} className="mx-auto max-w-5xl px-6 py-20">
                <div className="mb-10 max-w-2xl">
                    <h2 className="text-2xl font-semibold tracking-tight text-[#efe7f0]">
                        The evidence
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-[#8b8293]">
                        Everything below is computed from the public NHTSA complaint file. The
                        month Fissure would have raised a flag is calculated from complaint
                        volume alone, then compared against the real recall date afterwards.
                    </p>
                </div>

                <nav className="mb-8 flex flex-wrap gap-2">
                    {validated.map((v) => {
                        const active = v.vehicle_id === vehicle.vehicle_id;
                        return (
                            <button
                                key={v.vehicle_id}
                                onClick={() => setSelected(v.vehicle_id)}
                                className={`rounded-lg border px-4 py-2.5 text-left transition ${active
                                        ? "border-[#4a1e0c] bg-[#1a1116]"
                                        : "border-[#221e27] bg-[#16141a] hover:border-[#2d2834]"
                                    }`}
                            >
                                <div
                                    className={`text-sm font-medium ${active ? "text-[#ffb245]" : "text-[#a99fb0]"
                                        }`}
                                >
                                    {v.make.charAt(0) + v.make.slice(1).toLowerCase()}{" "}
                                    {v.model.charAt(0) + v.model.slice(1).toLowerCase()}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-[#6b6472]">
                                    {v.meta.recall_campaign_number}
                                </div>
                            </button>
                        );
                    })}
                </nav>

                <div className="space-y-6">
                    <Headline vehicle={vehicle} />
                    <Timeline vehicle={vehicle} />

                    <div className="grid gap-6 lg:grid-cols-2">
                        <EvidencePanel vehicle={vehicle} />
                        <SensitivityPanel vehicle={vehicle} />
                    </div>

                    <FragmentationPanel vehicle={vehicle} />
                    <ClusterPanel vehicle={vehicle} />
                    <ValidationPanel vehicle={vehicle} />

                    <div className="grid gap-6 lg:grid-cols-2">
                        <ExcludedPanel vehicles={data.vehicles} />
                        <MethodPanel method={data.method} />
                    </div>
                </div>

                <footer className="mt-16 border-t border-[#221e27] pt-6 text-xs leading-relaxed text-[#6b6472]">
                    Source: {vehicle.meta.source}. Recall dates verified against NHTSA&rsquo;s
                    campaign API.
                </footer>
            </section>
        </main>
    );
}