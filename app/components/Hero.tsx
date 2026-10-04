"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VolcanoDrive } from "./VolcanoCanvas";
import { matchLocally, type Match } from "@/lib/match";
import type { ClustersData } from "@/lib/types";

// WebGL cannot render on the server, and the scene is heavy enough that
// deferring it keeps first paint fast.
const VolcanoCanvas = dynamic(() => import("./VolcanoCanvas"), { ssr: false });

type Phase = "dormant" | "rumbling" | "erupting" | "resolved";

const RUMBLE_MS = 900;
const ERUPT_MS = 700;

/** Eases toward 1 with a slight overshoot, so the core lands rather than creeps. */
function overshoot(t: number) {
  const c = 1.9;
  return 1 + c * Math.pow(t - 1, 3) + (c - 0.55) * Math.pow(t - 1, 2);
}

const EXAMPLES = [
  "my steering feels sticky and makes a clicking noise",
  "the wheel suddenly got heavy while i was turning",
  "dash lit up and the steering went stiff",
];

export default function Hero({
  data,
  onSeeEvidence,
}: {
  data: ClustersData;
  onSeeEvidence: (vehicleId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("dormant");
  const [match, setMatch] = useState<Match | null>(null);
  const [reduced, setReduced] = useState(false);

  const drive = useRef<VolcanoDrive>({ heat: 0.22, erupt: 0, shake: 0 });
  const phaseStart = useRef(0);
  const phaseRef = useRef<Phase>("dormant");
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setPhaseNow = useCallback((p: Phase) => {
    phaseRef.current = p;
    phaseStart.current = performance.now();
    setPhase(p);
  }, []);

  /* The whole eruption runs off one rAF loop writing into a ref, so none of
     it causes React to re-render. */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const el = now - phaseStart.current;
      const d = drive.current;

      if (reduced) {
        const on = phaseRef.current === "resolved";
        d.heat = on ? 1 : 0.22;
        d.erupt = on ? 1 : 0;
        d.shake = 0;
      } else {
        switch (phaseRef.current) {
          case "dormant":
            d.heat += (0.22 - d.heat) * 0.08;
            d.erupt += (0 - d.erupt) * 0.12;
            d.shake += (0 - d.shake) * 0.15;
            break;
          case "rumbling": {
            const t = Math.min(1, el / RUMBLE_MS);
            d.heat = 0.22 + (1 - 0.22) * t * t;
            // Shake builds slowly then hard, like pressure finding the crack.
            d.shake = Math.pow(t, 2.4);
            d.erupt = 0;
            if (el >= RUMBLE_MS) setPhaseNow("erupting");
            break;
          }
          case "erupting": {
            const t = Math.min(1, el / ERUPT_MS);
            d.heat = 1;
            d.erupt = Math.max(0, overshoot(t));
            d.shake = Math.max(0.12, 1 - t) * (1 - t * 0.5);
            if (el >= ERUPT_MS) setPhaseNow("resolved");
            break;
          }
          case "resolved":
            d.heat += (1 - d.heat) * 0.1;
            d.erupt += (1 - d.erupt) * 0.1;
            d.shake += (0 - d.shake) * 0.12;
            break;
        }
      }

      // Orbit. Written straight to the DOM for the same reason.
      const nodes = nodeRefs.current;
      if (nodes.length) {
        const spin = now * 0.000045;
        const lit = phaseRef.current === "resolved";
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (!n) continue;
          const a = spin + (i / nodes.length) * Math.PI * 2;
          const rx = 270;
          const ry = 120;
          const x = Math.cos(a) * rx;
          const y = Math.sin(a) * ry;
          // Nodes at the back sit slightly smaller and dimmer.
          const depth = (Math.sin(a) + 1) / 2;
          const s = 0.84 + depth * 0.2;
          const settle = lit ? 1 : 0.55;
          n.style.transform = `translate(${x}px, ${y}px) scale(${s * settle})`;
          n.style.opacity = String((0.42 + depth * 0.35) * (lit ? 1 : 0.55));
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, setPhaseNow]);

  const run = useCallback(
    (q: string) => {
      const found = matchLocally(data, q);
      if (!found) return;
      setMatch(found);
      nodeRefs.current = [];
      setPhaseNow(reduced ? "resolved" : "rumbling");
    },
    [data, reduced, setPhaseNow],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    run(query);
  };

  const resolved = phase === "resolved";
  const cats = match?.categories ?? [];

  return (
    <section className="stage">
      <div className="stage-canvas">
        <VolcanoCanvas drive={drive} reducedMotion={reduced} />
      </div>
      <div className="stage-vignette" />

      {/* White-hot flash at the moment the column breaks the surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-500"
        style={{
          opacity: phase === "erupting" ? 0.5 : 0,
          background:
            "radial-gradient(44% 34% at 50% 62%, rgba(255,241,214,0.55), transparent 70%)",
        }}
      />

      <div className="stage-ui mx-auto flex max-w-5xl flex-col px-6">
        <header className="flex items-baseline justify-between pt-7">
          <span className="font-semibold tracking-tight text-[#efe7f0]">Fissure</span>
          <span className="text-xs text-[#6b6472]">early defect detection</span>
        </header>

        <form onSubmit={onSubmit} className="mx-auto mt-8 w-full max-w-xl">
          <div className="vent-input flex items-center gap-3 rounded-full py-2 pl-5 pr-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What is your car doing?"
              aria-label="Describe the problem in your own words"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-[#efe7f0] outline-none"
            />
            <button
              type="submit"
              className="ignite shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold"
            >
              Find the pattern
            </button>
          </div>
          <p className="mt-3 text-center text-[13px] text-[#6b6472]">
            In your own words. Fissure reads the description, not the category it
            gets filed under.
          </p>
          {phase === "dormant" && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setQuery(ex);
                    run(ex);
                  }}
                  className="rounded-full border border-[#2a2430] px-3 py-1 text-[11px] text-[#6b6472] transition hover:border-[#4a1e0c] hover:text-[#a99fb0]"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Core label + orbiting official categories, pinned over the WebGL sphere. */}
        <div className="pointer-events-none relative flex-1">
          <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2">
            {match && (
              <div
                ref={orbitRef}
                className="relative"
                style={{ opacity: resolved ? 1 : 0, transition: "opacity 400ms ease" }}
              >
                <h2 className="w-[14rem] -translate-x-1/2 -translate-y-1/2 text-center text-[19px] font-semibold leading-tight text-[#2a1304]">
                  {match.title}
                </h2>
                {cats.map((c, i) => (
                  <div
                    key={c.label}
                    ref={(el) => {
                      nodeRefs.current[i] = el;
                    }}
                    data-lit={resolved && i < 6}
                    className="orbit-node text-[10px] font-medium"
                    style={{ ["--d" as string]: `${58 + Math.min(c.count, 300) / 12}px` }}
                    title={`${c.label} — ${c.count} complaints`}
                  >
                    {c.short}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Result */}
        {match && resolved && (
          <div className="rise mx-auto mb-10 w-full max-w-3xl">
            <article className="record rounded-2xl px-7 py-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <h3 className="text-[19px] font-semibold leading-snug text-[#efe7f0]">
                    {match.vehicle.meta.defect_description}
                  </h3>
                  <p className="mt-1 text-sm text-[#a99fb0]">
                    {match.vehicle.make} {match.vehicle.model},{" "}
                    {match.vehicle.meta.window.slice(0, 4)}–
                    {match.vehicle.meta.window.slice(-10, -6)}
                  </p>
                  <p className="mt-4 max-w-prose text-sm leading-relaxed text-[#8b8293]">
                    <span className="font-mono text-[#ffb245]">
                      {match.vehicle.meta.focus_cluster_size.toLocaleString()}
                    </span>{" "}
                    drivers described this same failure.{" "}
                    <span className="font-mono text-[#ffb245]">
                      {match.vehicle.detection.complaints_on_file_before_recall.toLocaleString()}
                    </span>{" "}
                    of them before {match.vehicle.make.charAt(0)}
                    {match.vehicle.make.slice(1).toLowerCase()} filed recall{" "}
                    <span className="font-mono text-[#cfc9d4]">
                      {match.vehicle.meta.recall_campaign_number}
                    </span>
                    .
                  </p>
                </div>
                <button
                  onClick={() => onSeeEvidence(match.vehicle.vehicle_id)}
                  className="ignite pointer-events-auto shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold"
                >
                  See the evidence
                </button>
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}