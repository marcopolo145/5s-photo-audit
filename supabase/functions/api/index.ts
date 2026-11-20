// Supabase Edge Function: AI scoring + Google Sheet / Drive saving.
// Secrets (set with `supabase secrets set`): ALLOWED, ANTHROPIC_API_KEY or GEMINI_API_KEY,
// APPS_SCRIPT_URL, APPS_SCRIPT_SECRET. Optional: CLAUDE_MODEL.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// The gateway has already verified the JWT; here we only read the email from it.
function emailOf(req: Request): string {
  try {
    const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.email || "").toLowerCase();
  } catch {
    return "";
  }
}

function allowed(email: string): boolean {
  const list = (Deno.env.get("ALLOWED") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (!email || !list.length) return false; // deny by default
  return list.some((a) => (a.startsWith("@") ? email.endsWith(a) : email === a));
}

function parseJson(t: string) {
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw { code: "bad_ai_reply", message: "AI reply was not JSON" };
  return JSON.parse(t.slice(a, b + 1));
}

async function ai(prompt: string, images: string[]) {
  const ak = Deno.env.get("ANTHROPIC_API_KEY"), gk = Deno.env.get("GEMINI_API_KEY");
  const text = prompt + "\n\nReturn ONLY valid JSON, nothing else.";
  let out = "";
  if (ak) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ak, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            ...images.map((d) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: d } })),
            { type: "text", text },
          ],
        }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw { code: "ai_error", message: j?.error?.message || r.statusText };
    out = (j.content || []).map((c: { text?: string }) => c.text || "").join("");
  } else if (gk) {
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": gk, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [...images.map((d) => ({ inline_data: { mime_type: "image/jpeg", data: d } })), { text }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw { code: "ai_error", message: j?.error?.message || r.statusText };
    out = (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  } else {
    throw { code: "no_ai_key", message: "No AI key is set on the server" };
  }
  return parseJson(out);
}

async function sheet(tool: string, args: unknown) {
  const url = Deno.env.get("APPS_SCRIPT_URL"), secret = Deno.env.get("APPS_SCRIPT_SECRET");
  if (!url || !secret) throw { code: "no_sheet_backend", message: "Google Sheet backend is not set up" };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ secret, tool, args }),
    redirect: "follow",
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { throw { code: "sheet_bad_reply", message: "Google script replied with: " + t.slice(0, 120) }; }
  if (!j.ok) throw { code: "tool_error", message: j.error || "Google script error" };
  return j.result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!allowed(emailOf(req))) return json({ error: "This account is not allowed.", code: "forbidden" }, 403);
  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request", code: "bad_request" }, 400); }
  try {
    if (b.action === "ai") return json({ json: await ai(String(b.prompt || ""), b.images || []) });
    if (b.action === "sheet") return json({ result: await sheet(String(b.tool || ""), b.args) });
  } catch (e) {
    const x = e as { code?: string; message?: string };
    return json({ error: x.message || String(e), code: x.code || "server_error" }, 500);
  }
  return json({ error: "Unknown action", code: "bad_request" }, 400);
});
