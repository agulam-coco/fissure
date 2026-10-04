"use client";

import { useEffect, useMemo, useRef } from "react";
import { CRATER, VB_H, VB_W, fit, flankX, type Fit } from "@/lib/scene";

/** Written by Hero every frame. Never React state, so nothing re-renders. */
export type VolcanoDrive = { heat: number; erupt: number; shake: number };

/* ------------------------------------------------------------------------ */
/* Deterministic randomness so the art is identical on every load.          */
/* ------------------------------------------------------------------------ */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

type Pt = [number, number];

function smoothPath(pts: Pt[]) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
}

/* ------------------------------------------------------------------------ */
/* Static art: cone, facets, lava rivers, mountains, clouds, rocks.         */
/* ------------------------------------------------------------------------ */

type River = { d: string; w: number; delay: number };

function buildRivers(): River[] {
  const r = rng(11);
  const out: River[] = [];

  const add = (sx: number, sy: number, tx: number, ty: number, w: number, delay: number, depth: number) => {
    const pts: Pt[] = [];
    const steps = 36;
    const ph = r() * 10;
    const amp = 14 + r() * 26;
    const freq = 1.5 + r() * 2.5;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const y = sy + (ty - sy) * t;
      const base = sx + (tx - sx) * Math.pow(t, 1.35);
      const wig = Math.sin(t * freq * Math.PI + ph) * amp * t + Math.sin(t * 17 + ph * 2) * 6 * t;
      let x = base + wig;
      const side = x < CRATER.x ? -1 : 1;
      const lim = Math.abs(flankX(y, side) - CRATER.x) * 0.93;
      x = CRATER.x + Math.max(-lim, Math.min(lim, x - CRATER.x));
      pts.push([x, y]);

      // Rivers fork as they run out onto the gentler slope.
      if (depth < 2 && k > 7 && k < steps - 7 && r() < 0.06) {
        const away = x - CRATER.x;
        const btx = x + away * (0.35 + r() * 0.5) + (r() - 0.5) * 160;
        if (out.length < 60) add(x, y, btx, ty - r() * 70, w * 0.62, delay + t * 0.55, depth + 1);
      }
    }
    out.push({ d: smoothPath(pts), w, delay });
  };

  // Main flows leave the rim through notches and run roughly downhill.
  const N = 7;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const spread = (u - 0.5) * 2;
    const sx = 752 + u * 96 + (r() - 0.5) * 8;
    const tx = CRATER.x + spread * 430 + (r() - 0.5) * 120;
    add(sx, 570, tx, 1012, 5 + r() * 2, Math.abs(spread) * 0.1 + r() * 0.08, 0);
  }
  // A few vents breaking out lower on the flanks, like the reference art.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const y0 = 650 + r() * 120;
    const x0 = CRATER.x + side * (Math.abs(flankX(y0, 1) - CRATER.x) * (0.25 + r() * 0.4));
    add(x0, y0, x0 + side * (120 + r() * 200), 1012, 3.2 + r() * 1.2, 0.35 + r() * 0.2, 1);
  }
  return out;
}

function conePath() {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let y = 1010; y >= 572; y -= 8) left.push([flankX(y, -1), y]);
  for (let y = 572; y <= 1010; y += 8) right.push([flankX(y, 1), y]);
  const l = left.map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(" ");
  const rr = right.map(([x, y]) => `L${x.toFixed(1)} ${y}`).join(" ");
  // Slightly ragged lip on top.
  const lip = `L748 566 L772 571 L800 568 L828 572 L852 566`;
  return `M${left[0][0].toFixed(1)} 1010 ${l} ${lip} ${rr} Z`;
}

function facets() {
  const r = rng(5);
  const out: { d: string; light: boolean }[] = [];
  for (let i = 0; i < 16; i++) {
    const x0 = 735 + r() * 130;
    const away = x0 - CRATER.x;
    const x1 = CRATER.x + away * 8 + (r() - 0.5) * 140;
    const w = 25 + r() * 70;
    const light = away < 0 ? r() < 0.7 : r() < 0.2;
    out.push({ d: `M${x0.toFixed(0)} 572 L${(x1 - w).toFixed(0)} 1010 L${(x1 + w).toFixed(0)} 1010 Z`, light });
  }
  return out;
}

function ridgeLine(seed: number, x0: number, x1: number, yMin: number, yMax: number, step: number) {
  const r = rng(seed);
  let d = `M${x0} 1100 L${x0} ${yMax}`;
  for (let x = x0; x <= x1; x += step * (0.5 + r())) {
    d += ` L${x.toFixed(0)} ${(yMin + r() * (yMax - yMin)).toFixed(0)}`;
  }
  return d + ` L${x1} ${yMax} L${x1} 1100 Z`;
}

type Cloud = { x: number; y: number; k: number; toward: number };
const CLOUDS: Cloud[] = [
  { x: 250, y: 470, k: 1.15, toward: 1 },
  { x: 1370, y: 420, k: 1.25, toward: -1 },
  { x: -260, y: 380, k: 1.3, toward: 1 },
  { x: 1900, y: 360, k: 1.2, toward: -1 },
  { x: 520, y: 250, k: 0.55, toward: 1 },
  { x: 1120, y: 200, k: 0.6, toward: -1 },
];
const PUFFS: [number, number, number][] = [
  [0, 0, 90], [-110, 30, 70], [110, 25, 78], [-200, 60, 55], [205, 60, 58],
  [-50, -55, 72], [60, -60, 66], [0, 50, 80], [-140, -15, 60], [150, -10, 62],
];

/* ------------------------------------------------------------------------ */
/* Plume: billowing cloud sprites + spark streaks, drawn on a 2D canvas.    */
/* ------------------------------------------------------------------------ */

// Hot -> cold. Index 1.0 is white-hot at the vent, 0 is cooled ash.
const RAMP: [number, [number, number, number]][] = [
  [0.0, [52, 30, 48]],
  [0.14, [118, 40, 44]],
  [0.3, [184, 52, 30]],
  [0.46, [255, 92, 31]],
  [0.64, [255, 158, 46]],
  [0.82, [255, 214, 104]],
  [1.0, [255, 248, 220]],
];

function ramp(h: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (h <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1];
      const [b, cb] = RAMP[i];
      const t = (h - a) / (b - a);
      return [0, 1, 2].map((j) => ca[j] + (cb[j] - ca[j]) * t) as [number, number, number];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

const SPRITES = 32;

function makeSprites() {
  const sprites: HTMLCanvasElement[] = [];
  for (let i = 0; i < SPRITES; i++) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const [r, gg, b] = ramp(i / (SPRITES - 1));
    // Lit from below by the lava: highlight sits low, rim goes dark.
    const grad = g.createRadialGradient(64, 80, 4, 64, 64, 64);
    const lift = (n: number, k: number) => Math.round(Math.min(255, n + (255 - n) * k));
    const sink = (n: number, k: number) => Math.round(n * (1 - k));
    grad.addColorStop(0, `rgba(${lift(r, 0.22)},${lift(gg, 0.22)},${lift(b, 0.22)},1)`);
    grad.addColorStop(0.55, `rgba(${r | 0},${gg | 0},${b | 0},1)`);
    grad.addColorStop(0.84, `rgba(${sink(r, 0.28)},${sink(gg, 0.28)},${sink(b, 0.28)},1)`);
    grad.addColorStop(0.95, `rgba(${sink(r, 0.35)},${sink(gg, 0.35)},${sink(b, 0.35)},0.85)`);
    grad.addColorStop(1, `rgba(${sink(r, 0.3)},${sink(gg, 0.3)},${sink(b, 0.3)},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    sprites.push(c);
  }
  const glow = document.createElement("canvas");
  glow.width = glow.height = 128;
  const g = glow.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,220,140,1)");
  grad.addColorStop(0.4, "rgba(255,120,40,0.45)");
  grad.addColorStop(1, "rgba(255,80,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return { sprites, glow };
}

type Puff = { x: number; y: number; vx: number; vy: number; r: number; grow: number; age: number; life: number; hot: number; cool: number; alpha: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; big: boolean };

const CAP_Y = 215;
const MAX_PUFFS = 420;
const MAX_SPARKS = 700;

/* ------------------------------------------------------------------------ */

export default function VolcanoScene({
  drive,
  reducedMotion,
}: {
  drive: React.RefObject<VolcanoDrive>;
  reducedMotion: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riverRefs = useRef<(SVGPathElement | null)[]>([]);

  const art = useMemo(() => {
    const r = rng(3);
    return {
      rivers: buildRivers(),
      cone: conePath(),
      facets: facets(),
      farRange: ridgeLine(21, -1600, 3200, 610, 760, 110),
      nearLeft: ridgeLine(22, -1600, 520, 760, 880, 90),
      nearRight: ridgeLine(23, 1080, 3200, 760, 880, 90),
      rocksLeft: ridgeLine(24, -1600, 330, 880, 960, 70),
      rocksRight: ridgeLine(25, 1270, 3200, 870, 960, 70),
      stars: Array.from({ length: 90 }, () => ({
        x: -1400 + r() * 4400,
        y: -700 + r() * 1100,
        s: 0.8 + r() * 1.8,
        o: 0.25 + r() * 0.6,
      })),
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const svg = svgRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { sprites, glow } = makeSprites();
    const rand = Math.random;

    let F: Fit = fit(1, 1);
    let dpr = 1;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      F = fit(w, h);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // Make the SVG viewBox match the container exactly, so scene units map
      // to pixels the same way for the SVG, the canvas and the DOM overlay.
      svg.setAttribute(
        "viewBox",
        `${(-F.ox / F.s).toFixed(2)} ${(-F.oy / F.s).toFixed(2)} ${(w / F.s).toFixed(2)} ${(h / F.s).toFixed(2)}`,
      );
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const puffs: Puff[] = [];
    const sparks: Spark[] = [];
    let puffAcc = 0;
    let sparkAcc = 0;
    let flow = 0;
    let burst = 0;
    let flash = 0;
    let wasErupting = false;
    let last = performance.now();
    let raf = 0;
    let lastFlowWritten = -1;

    const spawnPuff = (eruptive: boolean, heat: number) => {
      if (puffs.length >= MAX_PUFFS) return;
      const v0 = eruptive ? 430 + rand() * 330 : 45 + rand() * 35;
      puffs.push({
        x: CRATER.x + (rand() - 0.5) * (eruptive ? 60 : 30),
        y: CRATER.y - 4,
        vx: (rand() - 0.5) * (eruptive ? 90 : 20),
        vy: -v0,
        r: eruptive ? 24 + rand() * 22 : 12 + rand() * 9,
        grow: eruptive ? 38 + rand() * 34 : 13 + rand() * 6,
        age: 0,
        life: eruptive ? 3 + rand() * 1.5 : 5 + rand() * 2.5,
        hot: eruptive ? 1 : 0.04 + heat * 0.25,
        cool: eruptive ? 1.5 + rand() * 1.1 : 1,
        alpha: eruptive ? 0.96 : 0.3,
      });
    };

    const spawnSpark = (power: number) => {
      if (sparks.length >= MAX_SPARKS) return;
      const a = -Math.PI / 2 + (rand() - 0.5) * 1.7;
      const sp = (260 + rand() * 520) * power;
      sparks.push({
        x: CRATER.x + (rand() - 0.5) * 50,
        y: CRATER.y - 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        age: 0,
        life: 1.1 + rand() * 1.4,
        big: rand() < 0.08,
      });
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const d = drive.current;
      const heat = d?.heat ?? 0.2;
      const erupt = d?.erupt ?? 0;
      const erupting = erupt > 0.05;

      // --- state ----------------------------------------------------------
      if (erupting && !wasErupting) {
        burst = 1;
        flash = 1;
        if (!reducedMotion) {
          for (let i = 0; i < 46; i++) spawnPuff(true, heat);
          for (let i = 0; i < 160; i++) spawnSpark(1.15);
        }
      }
      wasErupting = erupting;
      burst = Math.max(0, burst - dt / 2.4);
      flash = Math.max(0, flash - dt / 0.5);

      if (reducedMotion) flow = erupting ? 1.7 : 0;
      else flow = erupting ? Math.min(1.7, flow + dt * 0.62) : Math.max(0, flow - dt * 1.4);

      // --- lava rivers + scene vars (SVG) ---------------------------------
      if (Math.abs(flow - lastFlowWritten) > 0.001) {
        lastFlowWritten = flow;
        const rv = art.rivers;
        for (let i = 0; i < rv.length; i++) {
          const local = clamp01((flow - rv[i].delay) / 0.55);
          const off = String(1 - local);
          for (let j = 0; j < 3; j++) {
            const el = riverRefs.current[i * 3 + j];
            if (el) el.style.strokeDashoffset = off;
          }
        }
        svg.style.setProperty("--pool", String(smooth(0.7, 1.4, flow)));
        svg.style.setProperty("--shimmer", String(smooth(0.9, 1.5, flow)));
      }
      svg.style.setProperty("--heat", heat.toFixed(3));

      // --- emit -----------------------------------------------------------
      if (!reducedMotion) {
        const puffRate = erupting ? 26 + 50 * burst : heat > 0.35 ? 3 + 14 * (heat - 0.35) : 2.2;
        const sparkRate = erupting ? 30 + 170 * burst : heat > 0.5 ? 10 * heat : 0;
        puffAcc += puffRate * dt;
        sparkAcc += sparkRate * dt;
        while (puffAcc >= 1) {
          spawnPuff(erupting, heat);
          puffAcc -= 1;
        }
        while (sparkAcc >= 1) {
          spawnSpark(erupting ? 0.75 + burst * 0.4 : 0.45);
          sparkAcc -= 1;
        }
      }

      // --- simulate -------------------------------------------------------
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) {
          puffs.splice(i, 1);
          continue;
        }
        p.vy *= Math.exp(-1.55 * dt);
        p.vy -= 22 * dt;
        p.vx *= Math.exp(-0.5 * dt);
        const away = p.x - CRATER.x;
        p.vx += away * 0.55 * dt;
        p.vx *= Math.abs(away) > 480 ? Math.exp(-3 * dt) : 1;
        if (p.y < CAP_Y) {
          // Mushroom: the column hits its ceiling and rolls outward.
          p.vx += Math.max(-420, Math.min(420, away)) * 1.2 * dt + Math.sign(away || rand() - 0.5) * 30 * dt;
          p.vy *= Math.exp(-2.6 * dt);
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r = Math.min(p.r + p.grow * dt * (1 - (p.age / p.life) * 0.5), 120);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life || s.y > VB_H + 40) {
          sparks.splice(i, 1);
          continue;
        }
        s.vy += 620 * dt;
        s.vx *= Math.exp(-0.25 * dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }

      // --- draw -----------------------------------------------------------
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * F.s, 0, 0, dpr * F.s, dpr * F.ox, dpr * F.oy);

      // Crater glow under everything.
      ctx.globalCompositeOperation = "lighter";
      const cg = 70 + heat * 150 + flash * 380;
      ctx.globalAlpha = Math.min(1, 0.15 + heat * 0.55 + flash * 0.6);
      ctx.drawImage(glow, CRATER.x - cg, CRATER.y - cg * 0.8, cg * 2, cg * 1.6);

      // Cloud body, oldest first so fresh hot puffs sit on top.
      ctx.globalCompositeOperation = "source-over";
      for (const p of puffs) {
        const t = p.age / p.life;
        const h = Math.max(p.hot * (1 - smooth(0, p.cool, p.age)), p.hot > 0.5 ? 0.2 * heat : 0);
        const idx = Math.round(clamp01(h) * (SPRITES - 1));
        ctx.globalAlpha = p.alpha * Math.min(1, p.age / 0.12) * (1 - smooth(0.45, 1, t));
        ctx.drawImage(sprites[idx], p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }

      // Additive fire glow on the hot part of the column.
      ctx.globalCompositeOperation = "lighter";
      for (const p of puffs) {
        const h = p.hot * (1 - smooth(0, p.cool, p.age));
        if (h < 0.5) continue;
        ctx.globalAlpha = (h - 0.5) * 0.7 * Math.min(1, p.age / 0.1);
        const g = p.r * 1.7;
        ctx.drawImage(glow, p.x - g, p.y - g, g * 2, g * 2);
      }

      // Sparks and lava bombs as short streaks.
      ctx.lineCap = "round";
      for (const s of sparks) {
        const t = s.age / s.life;
        ctx.globalAlpha = 1 - t * t;
        ctx.strokeStyle = s.big ? "rgb(255,150,60)" : `rgb(255,${Math.round(230 - 110 * t)},${Math.round(150 - 110 * t)})`;
        ctx.lineWidth = s.big ? 6 : 2.4;
        const tail = s.big ? 0.06 : 0.035;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail);
        ctx.stroke();
      }

      // Eruption flash.
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.55;
        const fr = 520;
        ctx.drawImage(glow, CRATER.x - fr, CRATER.y - fr, fr * 2, fr * 2);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [art, drive, reducedMotion]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ ["--heat" as string]: 0.2, ["--pool" as string]: 0, ["--shimmer" as string]: 0 }}
        aria-hidden
      >
        <defs>
          <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="-700" x2="0" y2="900">
            <stop offset="0" stopColor="#06050c" />
            <stop offset="0.45" stopColor="#140d26" />
            <stop offset="0.75" stopColor="#2c1430" />
            <stop offset="1" stopColor="#40182a" />
          </linearGradient>
          <radialGradient id="skyGlow" gradientUnits="userSpaceOnUse" cx="800" cy="560" r="980">
            <stop offset="0" stopColor="#ff7a2e" stopOpacity="0.75" />
            <stop offset="0.35" stopColor="#c8402a" stopOpacity="0.32" />
            <stop offset="1" stopColor="#40182a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cloudBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#231c40" />
            <stop offset="0.6" stopColor="#3a2350" />
            <stop offset="1" stopColor="#5a2c50" />
          </linearGradient>
          <linearGradient id="cone" gradientUnits="userSpaceOnUse" x1="200" y1="0" x2="1400" y2="0">
            <stop offset="0" stopColor="#523056" />
            <stop offset="0.45" stopColor="#4a2a50" />
            <stop offset="0.6" stopColor="#30193a" />
            <stop offset="1" stopColor="#1a0d20" />
          </linearGradient>
          <linearGradient id="coneBase" gradientUnits="userSpaceOnUse" x1="0" y1="700" x2="0" y2="1010">
            <stop offset="0" stopColor="#07050a" stopOpacity="0" />
            <stop offset="1" stopColor="#07050a" stopOpacity="0.85" />
          </linearGradient>
          <radialGradient id="coneHeat" gradientUnits="userSpaceOnUse" cx="800" cy="575" r="330">
            <stop offset="0" stopColor="#ff8a3a" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#c03a1c" stopOpacity="0.28" />
            <stop offset="1" stopColor="#c03a1c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="crater" cx="0.5" cy="0.35" r="0.6">
            <stop offset="0" stopColor="#fff6d6" />
            <stop offset="0.35" stopColor="#ffb648" />
            <stop offset="0.75" stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#6a1a08" />
          </radialGradient>
          <radialGradient id="pool" gradientUnits="userSpaceOnUse" cx="800" cy="1000" r="760">
            <stop offset="0" stopColor="#ff7a2a" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
          </radialGradient>
          <clipPath id="coneClip">
            <path d={art.cone} />
          </clipPath>
          <filter id="lavaGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* Sky */}
        <rect x="-3000" y="-2000" width="7600" height="3200" fill="url(#sky)" />
        <rect
          x="-3000" y="-2000" width="7600" height="3200" fill="url(#skyGlow)"
          style={{ opacity: "calc(0.25 + var(--heat) * 0.75)" }}
        />
        {art.stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#efe6ff" opacity={s.o * 0.7} />
        ))}

        {/* Cloud banks, rim-lit from the volcano side */}
        {CLOUDS.map((c, ci) => (
          <g key={ci} transform={`translate(${c.x} ${c.y}) scale(${c.k})`} opacity={0.82}>
            <g
              transform={`translate(${c.toward * 7} 7)`}
              style={{ opacity: "calc(0.1 + var(--heat) * 0.5)" }}
            >
              {PUFFS.map(([x, y, rad], i) => (
                <circle key={i} cx={x} cy={y} r={rad} fill="#ff8a45" />
              ))}
            </g>
            {PUFFS.map(([x, y, rad], i) => (
              <circle key={i} cx={x} cy={y} r={rad} fill="url(#cloudBody)" />
            ))}
          </g>
        ))}

        {/* Distant ranges */}
        <path d={art.farRange} fill="#171124" />
        <path d={art.farRange} fill="none" stroke="#ff7a3a" strokeWidth="2" style={{ opacity: "calc(var(--heat) * 0.25)" }} />
        <path d={art.nearLeft} fill="#0e0a16" />
        <path d={art.nearRight} fill="#0e0a16" />

        {/* The volcano */}
        <path d={art.cone} fill="url(#cone)" />
        <g clipPath="url(#coneClip)">
          {art.facets.map((f, i) => (
            <path key={i} d={f.d} fill={f.light ? "#7a4774" : "#0d0612"} opacity={f.light ? 0.26 : 0.42} />
          ))}
          <rect x="0" y="520" width="1600" height="500" fill="url(#coneHeat)" style={{ opacity: "calc(0.25 + var(--heat) * 0.75)" }} />

          {/* Cooled cracks, always there */}
          {art.rivers.map((rv, i) => (
            <path key={`c${i}`} d={rv.d} fill="none" stroke="#2a0b0a" strokeWidth={rv.w * 1.3} strokeLinecap="round" />
          ))}
          {art.rivers.map((rv, i) => (
            <path
              key={`e${i}`} d={rv.d} fill="none" stroke="#a0300f" strokeWidth={rv.w * 0.45} strokeLinecap="round"
              style={{ opacity: "calc(0.25 + var(--heat) * 0.5)" }}
            />
          ))}

          {/* Live lava: glow, body, core. Revealed downhill by dashoffset. */}
          <g filter="url(#lavaGlow)">
            {art.rivers.map((rv, i) => (
              <path
                key={`g${i}`} ref={(el) => { riverRefs.current[i * 3] = el; }}
                d={rv.d} pathLength={1} fill="none" stroke="#ff5a1f" strokeWidth={rv.w * 3.4}
                strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1} opacity={0.85}
              />
            ))}
          </g>
          {art.rivers.map((rv, i) => (
            <path
              key={`b${i}`} ref={(el) => { riverRefs.current[i * 3 + 1] = el; }}
              d={rv.d} pathLength={1} fill="none" stroke="#ff7d1e" strokeWidth={rv.w * 1.25}
              strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1}
            />
          ))}
          {art.rivers.map((rv, i) => (
            <path
              key={`k${i}`} ref={(el) => { riverRefs.current[i * 3 + 2] = el; }}
              d={rv.d} pathLength={1} fill="none" stroke="#ffd774" strokeWidth={rv.w * 0.5}
              strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1}
            />
          ))}
          {/* Bright blobs travelling down once the flow is established */}
          <g style={{ opacity: "var(--shimmer)" }}>
            {art.rivers.map((rv, i) => (
              <path
                key={`s${i}`} d={rv.d} pathLength={1} fill="none" stroke="#fff3cf"
                strokeWidth={rv.w * 0.55} strokeLinecap="round" className="lava-shimmer"
                style={{ animationDelay: `${-(i * 0.37) % 1.6}s` }}
              />
            ))}
          </g>

          <rect x="0" y="700" width="1600" height="320" fill="url(#coneBase)" />
        </g>

        <path d={art.cone} fill="none" stroke="#ff8a45" strokeWidth="2.5" style={{ opacity: "calc(0.12 + var(--heat) * 0.45)" }} />

        {/* Crater */}
        <ellipse cx="800" cy="570" rx="50" ry="7" fill="#ff7a2a" filter="url(#lavaGlow)" style={{ opacity: "calc(0.2 + var(--heat) * 0.8)" }} />
        <ellipse cx="800" cy="569" rx="44" ry="5.5" fill="url(#crater)" style={{ opacity: "calc(0.35 + var(--heat) * 0.65)" }} />

        {/* Ground, lava pool where the rivers spill out, foreground rocks */}
        <rect x="-3000" y="1005" width="7600" height="400" fill="#0b0810" />
        <ellipse cx="800" cy="1010" rx="760" ry="60" fill="url(#pool)" style={{ opacity: "var(--pool)" }} />
        <path d={art.rocksLeft} fill="#08060b" />
        <path d={art.rocksRight} fill="#08060b" />
        <path d={art.rocksLeft} fill="none" stroke="#ff7a3a" strokeWidth="1.5" style={{ opacity: "calc(var(--heat) * 0.3)" }} />
        <path d={art.rocksRight} fill="none" stroke="#ff7a3a" strokeWidth="1.5" style={{ opacity: "calc(var(--heat) * 0.3)" }} />
      </svg>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}