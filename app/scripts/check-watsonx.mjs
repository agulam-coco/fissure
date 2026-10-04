// Checks your watsonx setup end to end. Run from the app folder:
//   node scripts/check-watsonx.mjs
// It reads .env.local, gets an IAM token, lists the Granite chat models your
// region offers, and sends one test message.

import { readFileSync } from "node:fs";

const env = {};
try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
} catch {
    console.error("x  No .env.local found. Run this from the app folder.");
    process.exit(1);
}

const apiKey = env.WATSONX_API_KEY;
const projectId = env.WATSONX_PROJECT_ID;
const url = (env.WATSONX_URL || "https://us-south.ml.cloud.ibm.com").replace(/\/$/, "");
const modelId = env.WATSONX_MODEL_ID || "ibm/granite-4-h-small";
const V = "2024-05-01";

if (!apiKey || !projectId) {
    console.error("x  WATSONX_API_KEY and WATSONX_PROJECT_ID must both be set in .env.local");
    process.exit(1);
}

// 1. IAM token
const tokRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "urn:ibm:params:oauth:grant-type:apikey", apikey: apiKey }),
});
if (!tokRes.ok) {
    console.error(`x  API key rejected (${tokRes.status}). Make a new key in IBM Cloud > Manage > Access (IAM) > API keys.`);
    console.error(await tokRes.text());
    process.exit(1);
}
const { access_token } = await tokRes.json();
console.log("ok IAM token");

// 2. Which Granite chat models does this region have?
const specRes = await fetch(`${url}/ml/v1/foundation_model_specs?version=${V}&filters=function_text_chat&limit=200`);
if (specRes.ok) {
    const specs = await specRes.json();
    const granite = (specs.resources ?? []).map((r) => r.model_id).filter((id) => id.includes("granite"));
    console.log(`ok Granite chat models in ${url}:`);
    for (const id of granite) console.log(`     ${id === modelId ? "*" : " "} ${id}`);
    if (!granite.includes(modelId)) {
        console.log(`!  WATSONX_MODEL_ID "${modelId}" is not in that list. Set it to one of the above (an 8b instruct one is a good pick).`);
    }
} else {
    console.log(`!  Could not list models (${specRes.status}). Check WATSONX_URL matches your project's region.`);
}

// 3. One real call
const t0 = Date.now();
const chatRes = await fetch(`${url}/ml/v1/text/chat?version=${V}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
        model_id: modelId,
        project_id: projectId,
        messages: [{ role: "user", content: 'Reply with only this JSON: {"ok": true}' }],
        max_tokens: 20,
        temperature: 0,
    }),
});
const text = await chatRes.text();
if (!chatRes.ok) {
    console.error(`x  Chat call failed (${chatRes.status}):`);
    console.error(text);
    if (/associat|instance|WML|runtime/i.test(text)) {
        console.error("   Your project probably has no watsonx.ai Runtime attached. Project > Manage > Services & integrations > Associate service.");
    }
    if (chatRes.status === 404 || /model/i.test(text)) {
        console.error("   If it mentions the model, pick a model_id from the list above.");
    }
    process.exit(1);
}
const reply = JSON.parse(text).choices?.[0]?.message?.content;
console.log(`ok Chat works with ${modelId} in ${Date.now() - t0} ms. Model said: ${reply}`);
