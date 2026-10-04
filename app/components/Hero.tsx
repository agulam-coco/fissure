"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { VolcanoDrive } from "./VolcanoScene";
import Logo from "./Logo";
import { categoriesFor, matchLocally, titleFor, type Match } from "@/lib/match";
import { CORE, CRATER, fit } from "@/lib/scene";
import { isValidated, type ClustersData } from "@/lib/types";

const VolcanoScene = dynamic(() => import("./VolcanoScene"), { ssr: false });

type Phase = "dormant" | "rumbling" | "erupting" | "resolved";

const RUMBLE_MS = 1000;
const ERUPT_MS = 1100;

/** How long the volcano keeps rumbling while it waits on Granite before
 *  falling back to the local keyword matcher. */
const GRANITE_TIMEOUT_MS = 5000;

type Result = Match & {
  source: "granite" | "local";
  reason?: string;
  model?: string;
};

type GraniteResponse = {
  vehicle_id: string;
  confidence: number | null;
  reason: string;
  model: string;
};

/** Core climbs out of the crater, then bubbles get thrown out one by one. */
const CORE_RISE_MS = 750;
const LAUNCH_DELAY_MS = 260;
const LAUNCH_MS = 950;
const LAUNCH_STAGGER_MS = 85;
const LAUNCH_ARC = 150; // scene units of extra height at the top of the arc

/** Bubble ring around the core, in scene units. */
const ORBIT_RX = 370;
const ORBIT_RY = 145;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const prefersReduced = () => window.matchMedia(MOTION_QUERY).matches;
const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

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
  const [match, setMatch] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, prefersReduced, () => false);

  const drive = useRef<VolcanoDrive>({ heat: 0.2, erupt: 0, shake: 0 });
  const phaseRef = useRef<Phase>("dormant");
  const phaseStart = useRef(0);
  const eruptAt = useRef(0);
  /** Set once the match (Granite or fallback) is in, so the eruption can go. */
  const ready = useRef(false);
  const runId = useRef(0);

  const shakeRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    phaseStart.current = performance.now();
    if (p === "erupting") eruptAt.current = performance.now();
    setPhase(p);
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const el = now - phaseStart.current;
      const d = drive.current;
      const ph = phaseRef.current;

      // --- drive the scene -----------------------------------------------
      if (reduced) {
        if (ph === "rumbling" && ready.current) go("resolved");
        const on = ph === "resolved";
        d.heat = on ? 1 : 0.2;
        d.erupt = on ? 1 : 0;
        d.shake = 0;
      } else if (ph === "dormant") {
        d.heat += (0.2 - d.heat) * 0.06;
        d.erupt = 0;
        d.shake += (0 - d.shake) * 0.15;
      } else if (ph === "rumbling") {
        // Keeps rumbling at full strength past RUMBLE_MS if Granite is slow.
        const t = clamp01(el / RUMBLE_MS);
        d.heat = 0.2 + 0.8 * t * t;
        d.shake = 0.15 + 0.85 * Math.pow(t, 2);
        d.erupt = 0;
        if (el >= RUMBLE_MS && ready.current) go("erupting");
      } else if (ph === "erupting") {
        const t = clamp01(el / ERUPT_MS);
        d.heat = 1;
        d.erupt = 0.1 + 0.9 * t;
        d.shake = (1 - t) * 1.1;
        if (el >= ERUPT_MS) go("resolved");
      } else {
        d.heat += (0.85 - d.heat) * 0.05;
        d.erupt = 1;
        d.shake += (0 - d.shake) * 0.12;
      }

      // --- camera shake: whole scene + bubbles, never the search UI -------
      const sh = shakeRef.current;
      if (sh) {
        const k = d.shake;
        const s = now / 1000;
        const x = k * (Math.sin(s * 53) * 6 + Math.sin(s * 91) * 3.5);
        const y = k * (Math.sin(s * 61 + 1.3) * 5 + Math.sin(s * 107) * 2.5);
        sh.style.transform = k > 0.002 ? `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` : "";
      }

      // --- core + bubbles -------------------------------------------------
      const anchor = anchorRef.current;
      if (sh && anchor) {
        const F = fit(sh.clientWidth, sh.clientHeight);
        const cx = F.ox + CORE.x * F.s;
        const cy = F.oy + CORE.y * F.s;
        anchor.style.left = `${cx}px`;
        anchor.style.top = `${cy}px`;

        const ventDy = (CRATER.y - CORE.y) * F.s;
        const out = ph === "erupting" || ph === "resolved";
        const since = out ? now - eruptAt.current : -1;
        const k = Math.min(1.12, Math.max(0.72, F.s * 1.1));

        const core = coreRef.current;
        if (core) {
          if (!out) {
            core.style.opacity = "0";
          } else {
            const t = reduced ? 1 : clamp01(since / CORE_RISE_MS);
            const y = ventDy * (1 - easeOutCubic(t));
            const sc = (0.2 + 0.8 * easeOutBack(t)) * k;
            core.style.opacity = String(Math.min(1, t * 3));
            core.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
          }
        }

        const nodes = nodeRefs.current;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (!n) continue;
          if (!out) {
            n.style.opacity = "0";
            continue;
          }
          const a = now * 0.00005 + (i / nodes.length) * Math.PI * 2 + 0.4;
          const rx = Math.cos(a) * ORBIT_RX * F.s;
          const ry = Math.sin(a) * ORBIT_RY * F.s;
          const depth = (Math.sin(a) + 1) / 2; // 1 = front (lower), 0 = back
          const restScale = (0.82 + depth * 0.26) * k;
          const t = reduced ? 1 : clamp01((since - LAUNCH_DELAY_MS - i * LAUNCH_STAGGER_MS) / LAUNCH_MS);
          if (t <= 0) {
            n.style.opacity = "0";
            continue;
          }
          // Behind the core while in flight so nothing crosses the title,
          // then settle into front/back depth once landed.
          n.style.zIndex = t < 1 ? "4" : depth > 0.5 ? "6" : "4";
          const e = easeOutCubic(t);
          // Sideways motion leads, so bubbles clear the core early.
          const x = rx * Math.min(1, easeOutCubic(Math.min(1, t * 1.6)));
          const y = ventDy + (ry - ventDy) * e - Math.sin(t * Math.PI) * LAUNCH_ARC * F.s;
          const sc = (0.15 + 0.85 * easeOutBack(t)) * restScale;
          n.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)})`;
          n.style.opacity = String(Math.min(1, t * 2.5) * (0.62 + depth * 0.38));
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, go]);

  const busy = phase === "rumbling" || phase === "erupting";

  const run = useCallback(
    async (q: string) => {
      if (phaseRef.current === "rumbling" || phaseRef.current === "erupting") return;
      const id = ++runId.current;
      ready.current = false;
      nodeRefs.current = [];
      setNotice(null);
      setMatch(null);
      setThinking(true);
      go("rumbling");

      // Primary path: IBM Granite on watsonx reads the description.
      let result: Result | null = null;
      let graniteSaidNone = false;
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
          signal: AbortSignal.timeout(GRANITE_TIMEOUT_MS),
        });
        if (res.ok) {
          const g = (await res.json()) as GraniteResponse;
          if (g.vehicle_id === "none") {
            graniteSaidNone = true;
          } else {
            const v = data.vehicles.find((x) => x.vehicle_id === g.vehicle_id);
            if (v && isValidated(v)) {
              result = {
                vehicle: v,
                title: titleFor(v),
                categories: categoriesFor(v),
                score: g.confidence ?? 1,
                source: "granite",
                reason: g.reason,
                model: g.model,
              };
            }
          }
        }
      } catch {
        // Timeout, offline, or not configured: fall through to local.
      }

      // Fallback: the local keyword + synonym matcher, so the demo never dies.
      if (!result && !graniteSaidNone) {
        const local = matchLocally(data, q);
        if (local) result = { ...local, source: "local" };
      }

      if (id !== runId.current) return; // a newer search replaced this one
      setThinking(false);

      if (!result) {
        go("dormant");
        setNotice(
          "No known defect pattern matches that yet.",
        );
        return;
      }

      setMatch(result);
      ready.current = true;
    },
    [data, go],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 3) return;
    run(query);
  };

  const resolved = phase === "resolved";
  const erupted = phase === "erupting" || resolved;
  const cats = match?.categories ?? [];
  const v = match?.vehicle;
  const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

  return (
    <>
      <section className="stage">
        {/* Everything in here shakes together. Oversized so shaking never
            exposes an edge. */}
        <div ref={shakeRef} className="absolute -inset-4">
          <VolcanoScene drive={drive} reducedMotion={reduced} />

          <div ref={anchorRef} className="pointer-events-none absolute" style={{ left: "50%", top: "33%" }}>
            {match && (
              <>
                <div ref={coreRef} className="core-sphere" style={{ opacity: 0 }}>
                  <span>{match.title}</span>
                </div>
                {cats.map((c, i) => (
                  <div
                    key={`${v?.vehicle_id}-${c.label}`}
                    ref={(el) => {
                      nodeRefs.current[i] = el;
                    }}
                    data-lit={erupted && i < 6}
                    className="orbit-node text-[10px] font-medium"
                    style={{ ["--d" as string]: `${50 + Math.min(c.count, 300) / 12}px`, opacity: 0 }}
                    title={`${c.label}, ${c.count} complaints`}
                  >
                    {c.short}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="stage-vignette" />

        <div className="stage-ui">
          <div className="mx-auto max-w-5xl px-6">
            <header className="flex items-center pt-6">
              <div className="brand pointer-events-auto flex items-center gap-3">
                <Logo size={36} />
                <span className="text-[19px] font-semibold tracking-tight text-[#efe7f0]">Fissure</span>
              </div>
            </header>

            <form onSubmit={onSubmit} className="mx-auto mt-6 w-full max-w-xl">
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
                  disabled={busy}
                  className="ignite shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
                >
                  {busy ? "Reading..." : "Find the pattern"}
                </button>
              </div>
              {thinking && (
                <p className="mt-3 text-center text-[12px] text-[#a99fb0]" aria-live="polite">
                  IBM Granite is reading your description...
                </p>
              )}
              {notice && phase === "dormant" && (
                <p className="mt-3 text-center text-[13px] text-[#ffb245]" role="status">
                  {notice}
                </p>
              )}
              {phase === "dormant" && (
                <>
                  <p className="mt-3 text-center text-[13px] text-[#8b8293]">
                    In your own words. Fissure reads the description, not the category it gets filed under.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          setQuery(ex);
                          run(ex);
                        }}
                        className="example-chip rounded-full px-3 py-1 text-[11px]"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* The record, underneath the volcano */}
      {match && v && resolved && (
        <div className="relative z-10 -mt-24 px-6">
          <article className="record rise mx-auto max-w-2xl rounded-xl px-6 py-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#ff8a45]">What this likely is</p>
            <h3 className="mt-1 text-[17px] font-semibold leading-snug text-[#efe7f0]">
              {v.meta.defect_description}
            </h3>
            <p className="mt-1 text-xs text-[#a99fb0]">
              {cap(v.make)} {cap(v.model)}, {v.meta.window.slice(0, 4)}–{v.meta.window.slice(-10, -6)}
            </p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <p className="max-w-sm text-[13px] leading-relaxed text-[#8b8293]">
                <span className="font-mono text-[#ffb245]">{v.meta.focus_cluster_size.toLocaleString()}</span> drivers
                described this failure,{" "}
                <span className="font-mono text-[#ffb245]">
                  {v.detection.complaints_on_file_before_recall.toLocaleString()}
                </span>{" "}
                of them before the recall was filed.
              </p>
              <button
                onClick={() => onSeeEvidence(v.vehicle_id)}
                className="ignite shrink-0 rounded-full px-5 py-2 text-[13px] font-semibold"
              >
                See the evidence
              </button>
            </div>
            <p className="mt-4 border-t border-[#2a2228] pt-3 text-[12px] leading-relaxed text-[#8b8293]">
              {match.source === "granite" ? (
                <>
                  <span className="text-[#ffb245]">Matched by IBM Granite</span>
                  <span className="font-mono text-[11px] text-[#6b6472]"> ({match.model})</span>
                  {match.reason && <>: &ldquo;{match.reason}&rdquo;</>}
                </>
              ) : (
                <>Matched by local keyword fallback (watsonx unavailable)</>
              )}
            </p>
          </article>
        </div>
      )}
    </>
  );
}