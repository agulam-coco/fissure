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
 *
 * Both validated recalls are electric power steering, but they are NOT the
 * same defect and these names have to say so. 15V-340 (Fusion): assist fails
 * and stays failed, the wheel goes heavy and stays heavy. 18V-586
 * (Silverado): assist drops out and hands itself back a moment later.
 */
const DISPLAY_NAME: Record<string, string> = {
    ford_fusion: "Steering assist loss",
    chevrolet_silverado: "Steering cuts in and out",
};

/**
 * How owners actually name each vehicle. Naming the car is the strongest
 * signal there is, so it is checked against the raw query rather than the
 * tokenized one, where STOP would have eaten "truck".
 */
const VEHICLE_ALIASES: Record<string, string[]> = {
    ford_fusion: ["fusion", "ford", "sedan"],
    chevrolet_silverado: ["silverado", "chevy", "chevrolet", "truck", "pickup"],
};

/**
 * The words that actually separate the two failure modes. Both clusters are
 * dominated by "steering" and "power steering", so shared vocabulary cannot
 * tell them apart and the higher-volume vehicle would win every time.
 */
const SIGNATURE: Record<string, string[]> = {
    ford_fusion: [
        "heavy", "stiff", "hard", "effort", "stuck", "locked",
        "stayed", "permanently", "strength", "muscle",
    ],
    chevrolet_silverado: [
        "intermittent", "intermittently", "momentarily", "momentary",
        "returned", "restored", "sporadic", "sometimes", "occasionally",
        "randomly", "briefly", "flickered", "flickering",
    ],
};

/** Multi-word tells, which tokenizing would split apart. */
const SIGNATURE_PHRASES: Record<string, string[]> = {
    ford_fusion: [
        "hard to turn", "would not turn", "could not turn",
        "both hands", "stayed that way", "never came back",
    ],
    chevrolet_silverado: [
        "comes back", "came back", "come back", "goes away", "went away",
        "on and off", "in and out", "for a second", "for a moment",
        "then it was fine", "cuts out", "cut out", "cutting out",
    ],
};

/**
 * The part each defect is about. A description has to mention the SYSTEM
 * before it can match a defect in that system, no matter how well the rest
 * of the wording lines up.
 *
 * Without this gate the failure-mode words below carry a match on their own,
 * and "my handbrake sometimes randomly activates" scores on the Silverado
 * purely because "sometimes" and "randomly" describe intermittency. Those
 * words say HOW something fails. They say nothing about WHAT failed, and only
 * the pair is evidence.
 */
const SUBJECT_STRONG: Record<string, string[]> = {
    ford_fusion: ["steering", "steer", "steers", "steered", "eps", "epas"],
    chevrolet_silverado: ["steering", "steer", "steers", "steered", "eps", "epas"],
};

/**
 * Ambiguous on their own. A "wheel" can be the thing you hold or the thing
 * the tyre is on, and plenty of systems "assist". One of these counts as
 * subject evidence only alongside a failure description, so "the wheel got
 * heavy while turning" is steering and "the wheel bearings are noisy" is not.
 */
const SUBJECT_WEAK: Record<string, string[]> = {
    ford_fusion: ["wheel", "turn", "turns", "turning", "handling", "assist"],
    chevrolet_silverado: ["wheel", "turn", "turns", "turning", "handling", "assist"],
};

/**
 * Below this, the evidence is too thin to put a defect on screen. Real
 * matches land around 10 and up; the worst false positives before the
 * SUBJECT gate sat near 7, so this is a backstop and not the main defence.
 */
const MIN_SCORE = 3;

/** Whole-word test, so "struck" never counts as "truck". */
function mentions(raw: string, needle: string): boolean {
    return new RegExp(`\\b${needle}\\b`).test(raw);
}

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
    const raw = query.toLowerCase();
    const words = tokenize(query);
    // The subject gate reads the words the person actually typed. The expanded
    // set below maps "wheel" and "turning" onto "steering", which is useful for
    // scoring and would otherwise let a synonym manufacture the evidence that
    // the gate exists to demand.
    const typed = new Set(words);
    const q = expand(words);
    if (q.size === 0) return null;

    let best: Match | null = null;

    for (const v of data.vehicles) {
        if (!isValidated(v)) continue;
        const focus = v.clusters.find((c) => c.is_focus);
        if (!focus) continue;

        // THE GATE. Does the description even mention this defect's system?
        // Everything below only separates one steering defect from another,
        // so none of it is evidence until this passes. Naming the vehicle
        // does not bypass it either: "my Silverado's radio is broken" is a
        // Silverado complaint and still not this defect.
        const strong = (SUBJECT_STRONG[v.vehicle_id] ?? []).some((w) => typed.has(w));
        const weak = (SUBJECT_WEAK[v.vehicle_id] ?? []).some((w) => typed.has(w));
        const describesFailure =
            (SIGNATURE[v.vehicle_id] ?? []).some((w) => q.has(w)) ||
            (SIGNATURE_PHRASES[v.vehicle_id] ?? []).some((p) => raw.includes(p));
        if (!strong && !(weak && describesFailure)) continue;

        let score = 0;

        // Naming the vehicle settles WHICH steering defect, now that we know
        // the description is about steering at all.
        for (const alias of VEHICLE_ALIASES[v.vehicle_id] ?? []) {
            if (mentions(raw, alias)) {
                score += 4;
                break;
            }
        }

        // Failure-mode tells: stays-broken vs comes-back.
        for (const word of SIGNATURE[v.vehicle_id] ?? []) {
            if (q.has(word)) score += 1.5;
        }
        for (const phrase of SIGNATURE_PHRASES[v.vehicle_id] ?? []) {
            if (raw.includes(phrase)) score += 2;
        }

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

    return best && best.score >= MIN_SCORE ? best : null;
}