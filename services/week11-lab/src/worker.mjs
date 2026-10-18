import {
  MODEL,
  LIMITS,
  messages,
  validate,
  limitedJSON,
  admit,
} from "./core.mjs";
const enc = new TextEncoder();
const json = (d, status = 200, headers = {}) =>
  Response.json(d, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const hex = (b) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const key = (s) =>
  crypto.subtle.importKey(
    "raw",
    enc.encode(s),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
async function token(secret) {
  const p = `${crypto.randomUUID()}.${Date.now() + 86400000}`;
  return `${p}.${hex(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(p)))}`;
}
async function session(r, secret) {
  const t = r.headers.get("X-Session") || "";
  if (!/^[\da-f-]{36}\.\d{13}\.[\da-f]{64}$/.test(t)) return null;
  const [id, exp, sig] = t.split(".");
  if (Number(exp) < Date.now()) return null;
  return (await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    new Uint8Array(sig.match(/../g).map((x) => parseInt(x, 16))),
    enc.encode(`${id}.${exp}`),
  ))
    ? id
    : null;
}
function requestLimits(env) {
  const n = (k, fallback, allowZero = false) => {
    const value = Number(env[k]);
    return env[k] !== undefined && Number.isFinite(value) && value >= (allowZero ? 0 : 1)
      ? Math.floor(value) : fallback;
  };
  return {
    daily: n("DAILY_REQUEST_LIMIT", 0, true),
    session: n("SESSION_REQUEST_LIMIT", 0, true),
    rpm: n("RPM_LIMIT", 120),
    concurrent: n("CONCURRENCY_LIMIT", 30),
  };
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/"))
      return json({ service: "LING2150 week 11 model service" });
    // Public classroom endpoint supports GitHub Pages and downloadable file:// HTML.
    // No cookies or private account data. The global budget, not CORS, bounds use.
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Session",
      "Access-Control-Expose-Headers": "Retry-After",
    };
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    const reply = (d, s = 200, h = {}) => json(d, s, { ...cors, ...h });
    if (path === "/api/health" && request.method === "GET")
      return reply({
        enabled: env.ENABLED === "true",
        model: env.MODEL || MODEL,
        version: "week11-1",
        limits: {...requestLimits(env), outputTokens: LIMITS.output},
      });
    if (
      env.ENABLED !== "true" ||
      !env.SESSION_SECRET ||
      !env.AI ||
      !env.CLASSROOM
    )
      return reply({ error: "unavailable" }, 503);
    if (path === "/api/session" && request.method === "POST")
      return reply({ token: await token(env.SESSION_SECRET) });
    if (path !== "/api/chat" || request.method !== "POST")
      return reply({ error: "not_found" }, 404);
    const sid = await session(request, env.SESSION_SECRET);
    if (!sid) return reply({ error: "session_expired" }, 401);
    let input;
    try {
      input = validate(await limitedJSON(request));
    } catch (e) {
      return reply(
        {
          error:
            e.message === "conversation_limit" ? e.message : "invalid_input",
        },
        400,
      );
    }
    const id = crypto.randomUUID(),
      gate = env.CLASSROOM.get(env.CLASSROOM.idFromName("week11"));
    let a;
    try {
      a = await (
        await gate.fetch("https://internal/admit", {
          method: "POST",
          body: JSON.stringify({ session: sid, mode: input.mode, id }),
        })
      ).json();
    } catch {
      return reply({ error: "unavailable" }, 503);
    }
    if (!a.ok)
      return reply(
        { error: a.code },
        429,
        a.retry ? { "Retry-After": String(a.retry) } : {},
      );
    let timer;
    try {
      const start = Date.now();
      const result = await Promise.race([
        env.AI.run(env.MODEL || MODEL, {
          messages: messages(input),
          temperature: input.temperature,
          top_k: input.topk,
          top_p: input.topp,
          max_tokens: LIMITS.output,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("timeout")), LIMITS.inferenceMs);
        }),
      ]);
      const text = result.response || result.choices?.[0]?.message?.content;
      if (
        typeof text !== "string" ||
        !text.trim() ||
        text.length > LIMITS.perTurn
      )
        throw Error("model_unavailable");
      return reply({
        reply: text.trim(),
        model: env.MODEL || MODEL,
        elapsedMs: Date.now() - start,
        settings: {
          temperature: input.temperature,
          topk: input.topk,
          topp: input.topp,
          nucleusName: input.nucleusName,
        },
      });
    } catch (e) {
      return reply(
        { error: e.message === "timeout" ? "timeout" : "model_unavailable" },
        503,
      );
    } finally {
      clearTimeout(timer);
      ctx.waitUntil(
        gate
          .fetch("https://internal/release", {
            method: "POST",
            body: JSON.stringify({ id }),
          })
          .catch(() => {}),
      );
    }
  },
};
export class Classroom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.queue = Promise.resolve();
  }
  fetch(r) {
    const t = this.queue.then(() => this.handle(r));
    this.queue = t.catch(() => {});
    return t;
  }
  async handle(r) {
    const s = (await this.ctx.storage.get("budget")) || {},
      b = await r.json();
    if (new URL(r.url).pathname === "/release") {
      if (s.active) delete s.active[b.id];
      await this.ctx.storage.put("budget", s);
      return json({ ok: true });
    }
    const a = admit(s, b.session, b.mode, b.id, Date.now(), requestLimits(this.env));
    await this.ctx.storage.put("budget", s);
    return json(a);
  }
}
