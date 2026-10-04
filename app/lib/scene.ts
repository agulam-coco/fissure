/**
 * Shared geometry for the volcano scene. The SVG, the canvas plume and the DOM
 * bubbles all use this one mapping, so the core and bubbles always land
 * exactly on the crater and plume no matter the screen size.
 *
 * Scene units: a 1600 x 1000 design space. The crater sits at (800, 565).
 */
export const VB_W = 1600;
export const VB_H = 1000;
export const CRATER = { x: 800, y: 565 };
export const CORE = { x: 800, y: 345 };

export type Fit = { s: number; ox: number; oy: number; w: number; h: number };

/** Scene units -> CSS pixels for a container of size w x h. Bottom anchored. */
export function fit(w: number, h: number): Fit {
  // Fit by height on wide screens, by width on narrower ones, but never let
  // phones shrink the volcano to a speck (crop the sides instead).
  const s = Math.min(h / VB_H, Math.max(w / VB_W, (h / VB_H) * 0.7));
  return { s, ox: (w - VB_W * s) / 2, oy: h - VB_H * s, w, h };
}

/** Horizontal position of the cone's edge at height y. side -1 left, 1 right. */
export function flankX(y: number, side: -1 | 1) {
  const t = Math.min(1, Math.max(0, (y - 572) / 438));
  return CRATER.x + side * (70 + 600 * Math.pow(t, 1.6));
}