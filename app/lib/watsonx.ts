/**
 * Minimal IBM watsonx.ai client. Server-only: it reads the API key from the
 * environment, so never import this from a "use client" file.
 *
 * Two steps per call:
 *   1. Trade the IBM Cloud API key for a short-lived IAM bearer token
 *      (cached in memory until ~5 minutes before it expires).
 *   2. POST to the watsonx chat endpoint with that token.
 */

const IAM_URL = process.env.WATSONX_IAM_URL || "https://iam.cloud.ibm.com/identity/token";
const API_VERSION = "2024-05-01";

export type WatsonxConfig = {
    apiKey: string;
    projectId: string;
    url: string;
    modelId: string;
};

export function readConfig(): WatsonxConfig | null {
    const apiKey = process.env.WATSONX_API_KEY;
    const projectId = process.env.WATSONX_PROJECT_ID;
    if (!apiKey || !projectId) return null;
    return {
        apiKey,
        projectId,
        url: (process.env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com").replace(/\/$/, ""),
        modelId: process.env.WATSONX_MODEL_ID || "ibm/granite-4-h-small",
    };
}

let cached: { token: string; expiresAt: number } | null = null;

async function getToken(apiKey: string): Promise<string> {
    if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached.token;

    const res = await fetch(IAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
            grant_type: "urn:ibm:params:oauth:grant-type:apikey",
            apikey: apiKey,
        }),
        signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`IAM token request failed: ${res.status} ${await res.text()}`);

    const body = (await res.json()) as { access_token: string; expiration: number };
    cached = { token: body.access_token, expiresAt: body.expiration * 1000 };
    return cached.token;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
    cfg: WatsonxConfig,
    messages: ChatMessage[],
    opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
    const token = await getToken(cfg.apiKey);
    const res = await fetch(`${cfg.url}/ml/v1/text/chat?version=${API_VERSION}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            model_id: cfg.modelId,
            project_id: cfg.projectId,
            messages,
            max_tokens: opts.maxTokens ?? 200,
            temperature: 0,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 6000),
    });
    if (!res.ok) throw new Error(`watsonx chat failed: ${res.status} ${await res.text()}`);

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("watsonx chat returned no content");
    return text;
}

/** Pull the first {...} block out of a model reply and parse it. */
export function extractJson<T>(text: string): T | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
        return null;
    }
}