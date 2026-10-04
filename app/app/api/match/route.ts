import { NextResponse } from "next/server";
import clusters from "@/public/clusters.json";
import { isValidated, type ClustersData } from "@/lib/types";
import { chat, extractJson, readConfig } from "@/lib/watsonx";

export const runtime = "nodejs";

const data = clusters as unknown as ClustersData;

/**
 * Both validated recalls are electric power steering, so their clustered
 * vocabulary is nearly identical and the model cannot separate them on the
 * defect sentence alone. One line each, stating what makes them different.
 */
const DISTINGUISHER: Record<string, string> = {
    ford_fusion:
        "Assist is lost and STAYS lost. The wheel goes heavy and needs real effort until it is repaired.",
    chevrolet_silverado:
        "Assist drops out and COMES BACK on its own, often within seconds. Intermittent, usually with a warning light.",
};

/** What the model is shown for each known defect pattern. */
const CANDIDATES = data.vehicles.filter(isValidated).map((v) => {
    const focus = v.clusters.find((c) => c.is_focus);
    return {
        id: v.vehicle_id,
        vehicle: `${v.make} ${v.model} (${v.meta.window.slice(0, 4)}-${v.meta.window.slice(-10, -6)})`,
        defect: v.meta.defect_description,
        tells: DISTINGUISHER[v.vehicle_id] ?? "",
        words: (focus?.top_terms ?? []).slice(0, 15).join(", "),
    };
});
const IDS = new Set(CANDIDATES.map((c) => c.id));

const SYSTEM = `You match a car owner's plain-language problem description to known vehicle defect patterns that were found by clustering NHTSA owner complaints. Owners use informal words ("sticky", "heavy", "went stiff"), so match on meaning, not exact wording. Reply with one JSON object and nothing else.`;

function userPrompt(query: string) {
    const list = CANDIDATES.map(
        (c) =>
            `- id: ${c.id}\n  vehicle: ${c.vehicle}\n  defect: ${c.defect}\n  how to tell it apart: ${c.tells}\n  words owners used most: ${c.words}`,
    ).join("\n");
    return `Owner description:
"""${query}"""

Known defect patterns:
${list}

Rules:
- Pick the pattern whose failure best matches the symptoms described.
- If the owner names a make or model, prefer the pattern for that vehicle.
- Several patterns may involve the same part. Use "how to tell it apart" to choose between them: whether the failure persists or returns on its own is usually the deciding detail.
- If no pattern plausibly fits the symptoms, use "none".

Respond as JSON exactly like:
{"vehicle_id": "<one of the ids above, or none>", "confidence": <number 0 to 1>, "reason": "<one plain-English sentence under 25 words>"}`;
}

type GraniteReply = { vehicle_id?: string; confidence?: number; reason?: string };

export async function POST(req: Request) {
    const cfg = readConfig();
    if (!cfg) {
        return NextResponse.json({ error: "watsonx is not configured" }, { status: 503 });
    }

    let query = "";
    try {
        const body = (await req.json()) as { query?: unknown };
        query = typeof body.query === "string" ? body.query.trim() : "";
    } catch {
        /* fall through to validation */
    }
    if (query.length < 3 || query.length > 600) {
        return NextResponse.json({ error: "query must be 3 to 600 characters" }, { status: 400 });
    }

    try {
        const started = Date.now();
        const text = await chat(
            cfg,
            [
                { role: "system", content: SYSTEM },
                { role: "user", content: userPrompt(query) },
            ],
            { maxTokens: 160, timeoutMs: 6000 },
        );

        const parsed = extractJson<GraniteReply>(text);
        const id = parsed?.vehicle_id?.trim();
        if (!parsed || !id || (id !== "none" && !IDS.has(id))) {
            return NextResponse.json({ error: "unparseable model reply", raw: text.slice(0, 300) }, { status: 502 });
        }

        return NextResponse.json({
            vehicle_id: id,
            confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : null,
            reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 220) : "",
            model: cfg.modelId,
            ms: Date.now() - started,
        });
    } catch (err) {
        // Log the detail server-side; the browser just falls back to local matching.
        console.error("[api/match]", err);
        return NextResponse.json({ error: "watsonx call failed" }, { status: 502 });
    }
}