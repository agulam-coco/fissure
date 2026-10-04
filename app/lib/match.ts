import { isValidated, type ClustersData, type ValidatedVehicle } from "./types";

export type Match = {
    vehicle: ValidatedVehicle;
    /** Short name for the core sphere. */
    title: string;
    /** Official categories this defect was filed under, biggest first. */
    categories: { label: string; short: string; count: number }[];
    score: number;
};

/**
 * Short, speakable names for each vehicle's flagged defect. The JSON carries
 * the full regulator phrasing, which is too long to sit inside a sphere.
 */
const DISPLAY_NAME: Record<string, string> = {
    ford_fusion: "Steering assist loss",
    chevrolet_silverado: "Steering assist loss",
};

/**
 * Owners do not write "electric power steering assist fault". They write
 * "stiff", "sticky", "hard to turn". Lexical matching alone misses that, so a
 * small hand-built bridge covers the gap when watsonx is unavailable.
 */
const SYNONYMS: Record<string, string[]> = {
    sticky: ["stiff", "tight", "binding", "hard"],
    stiff: ["sticky", "tight", "hard", "heavy"],
    tight: ["stiff", "sticky", "hard"],
    jerky: ["jerk", "lurch", "snatch"],
    clicking: ["click", "clunk", "knock", "pop"],
    clunk: ["clunking", "knock", "click"],
    grinding: ["grind", "groan", "noise"],
    whine: ["whining", "noise", "hum"],
    heavy: ["stiff", "hard", "effort"],
    stalls: ["stall", "stalling", "shut", "died", "cut"],
    died: ["stall", "shut", "cut", "quit"],
    wobble: ["shake", "shimmy", "vibrate"],
    dash: ["dashboard", "cluster", "warning", "light"],
    wheel: ["steering"],
    turning: ["turn", "steer", "steering"],
    steer: ["steering", "wheel"],
    power: ["assist", "eps"],
    light: ["warning", "illuminated", "lamp"],
    brakes: ["brake", "braking", "pedal"],
    engine: ["motor", "stall", "power"],
};

const STOP = new Set([
    "the", "a", "an", "my", "is", "it", "and", "to", "of", "in", "on", "at",
    "for", "with", "that", "this", "i", "me", "when", "was", "has", "have",
    "car", "vehicle", "truck", "its", "but", "so", "feels", "feel", "makes",
    "make", "really", "very", "like", "keeps", "keep", "get", "gets", "got",
]);

function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP.has(t));
}

function expand(tokens: string[]): Set<string> {
    const out = new Set<string>();
    for (const t of tokens) {
        out.add(t);
        // Crude stemming: "clicking" also matches "click".
        if (t.endsWith("ing") && t.length > 5) out.add(t.slice(0, -3));
        if (t.endsWith("s") && t.length > 4) out.add(t.slice(0, -1));
        for (const syn of SYNONYMS[t] ?? []) out.add(syn);
    }
    return out;
}

/** "ELECTRONIC STABILITY CONTROL (ESC)" -> "ESC" */
export function shortenCategory(label: string): string {
    const map: Record<string, string> = {
        "STEERING": "Steering",
        "ELECTRICAL SYSTEM": "Electrical",
        "ELECTRONIC STABILITY CONTROL (ESC)": "ESC",
        "POWER TRAIN": "Power train",
        "UNKNOWN OR OTHER": "Unknown",
        "AIR BAGS": "Air bags",
        "ENGINE": "Engine",
        "SERVICE BRAKES": "Brakes",
        "SUSPENSION": "Suspension",
        "STEERING:ELECTRIC POWER ASSIST SYSTEM": "EPAS",
        "VEHICLE SPEED CONTROL": "Speed control",
        "FUEL/PROPULSION SYSTEM": "Fuel system",
        "WHEELS": "Wheels",
        "STEERING:RACK AND PINION": "Rack & pinion",
        "TRACTION CONTROL SYSTEM": "Traction",
        "EXTERIOR LIGHTING": "Lighting",
        "STRUCTURE:BODY": "Body",
        "SERVICE BRAKES, HYDRAULIC": "Hydraulic brakes",
        "VISIBILITY/WIPER": "Wipers",
        "ELECTRICAL SYSTEM:HORN": "Horn",
        "SEAT BELTS": "Seat belts",
        "SEATS": "Seats",
    };
    if (map[label]) return map[label];
    // Fall back to the most specific segment, title-cased and truncated.
    const tail = label.split(":").pop() ?? label;
    const pretty = tail.charAt(0) + tail.slice(1).toLowerCase();
    return pretty.length > 15 ? pretty.slice(0, 14) + "…" : pretty;
}

export function categoriesFor(v: ValidatedVehicle, limit = 8) {
    return Object.entries(v.validation.compdesc_breakdown)
        .slice(0, limit)
        .map(([label, count]) => ({ label, short: shortenCategory(label), count }));
}

export function titleFor(v: ValidatedVehicle) {
    return DISPLAY_NAME[v.vehicle_id] ?? "Recurring failure";
}

/**
 * Score a query against every validated vehicle's flagged cluster and return
 * the best. Lexical only: this is the fallback for when the watsonx call
 * fails or is slow, not the primary path.
 */
export function matchLocally(data: ClustersData, query: string): Match | null {
    const q = expand(tokenize(query));
    if (q.size === 0) return null;

    let best: Match | null = null;

    for (const v of data.vehicles) {
        if (!isValidated(v)) continue;
        const focus = v.clusters.find((c) => c.is_focus);
        if (!focus) continue;

        let score = 0;
        // Earlier terms carry more weight: top_terms is ordered by centroid weight.
        focus.top_terms.forEach((term, i) => {
            const weight = 1 / (1 + i * 0.35);
            for (const part of tokenize(term)) {
                if (q.has(part)) score += weight;
            }
        });
        for (const part of tokenize(v.meta.defect_description)) {
            if (q.has(part)) score += 0.6;
        }
        for (const part of tokenize(titleFor(v))) {
            if (q.has(part)) score += 1.1;
        }

        if (!best || score > best.score) {
            best = { vehicle: v, title: titleFor(v), categories: categoriesFor(v), score };
        }
    }

    return best && best.score > 0 ? best : null;
}