import test from "node:test";
import assert from "node:assert/strict";
import worker, { Classroom } from "../src/worker.mjs";
import { validate, messages } from "../src/core.mjs";
import {
  bigrams,
  distribution,
  sample,
  exactSpans,
} from "../../../docs/week_11/core.mjs";
const input = {
  mode: "sampling",
  prompt: "Write a sentence.",
  temperature: 0.7,
  topk: 20,
  topp: 0.9,
};
function setup() {
  const store = new Map(),
    waits = [],
    seen = [];
  const env = {
    ENABLED: "true",
    SESSION_SECRET: "unit-test-secret-at-least-32-characters",
    AI: {
      run: async (m, b) => {
        seen.push(b);
        return { response: "A sentence." };
      },
    },
  };
  const room = new Classroom(
    {
      storage: {
        get: async (k) => structuredClone(store.get(k)),
        put: async (k, v) => store.set(k, structuredClone(v)),
      },
    },
    env,
  );
  env.CLASSROOM = {
    idFromName: (x) => x,
    get: () => ({ fetch: (url, init) => room.fetch(new Request(url, init)) }),
  };
  return { env, ctx: { waitUntil: (p) => waits.push(p) }, waits, seen, store };
}
const req = (path, body = {}, token) =>
  new Request("https://lab.test" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Session": token } : {}),
    },
    body: JSON.stringify(body),
  });
test("bigram counts never cross sentence boundaries", () => {
  const m = bigrams("we study language\nwe study speech");
  assert.equal(m.get("we").get("study"), 2);
  assert.equal(m.has("language"), false);
});
test("temperature, k, p and normalization follow the displayed order", () => {
  let counts = new Map([
    ["a", 6],
    ["b", 3],
    ["c", 1],
  ]);
  let r = distribution(counts);
  r.forEach((x, i) => assert.ok(Math.abs(x.prob - [0.6, 0.3, 0.1][i]) < 1e-12));
  r = distribution(counts, { temperature: 0, topk: 0, topp: 1 });
  assert.deepEqual(
    r.map((r) => r.prob),
    [1, 0, 0],
  );
  r = distribution(counts, { temperature: 1, topk: 2, topp: 0.6 });
  assert.equal(r.filter((r) => r.kept).length, 1);
  assert.equal(r[0].prob, 1);
  assert.equal(
    sample(r, () => 0.99),
    "a",
  );
});
test("extreme legal temperature stays finite and invalid settings fail", () => {
  const r = distribution(
    new Map([
      ["a", 100],
      ["b", 1],
    ]),
    { temperature: 0.001, topk: 0, topp: 1 },
  );
  assert.ok(r.every((x) => Number.isFinite(x.prob)));
  assert.throws(() => distribution(new Map([["a", 1]]), { topk: 1.5 }));
  assert.throws(() => distribution(new Map()));
});
test("overlapping annotation phrases retain exact text offsets", () => {
  assert.deepEqual(exactSpans("had had had", "had"), [
    [0, 3],
    [4, 7],
    [8, 11],
  ]);
  assert.deepEqual(exactSpans("<script>", "<script>"), [[0, 8]]);
});
test("validation strips notes and rejects conflicting nucleus settings", () => {
  assert.ok(
    !JSON.stringify(validate({ ...input, reflection: "PRIVATE" })).includes(
      "PRIVATE",
    ),
  );
  assert.throws(() => validate({ ...input, topq: 0.9 }));
  assert.throws(() => validate({ ...input, topk: 0 }));
  assert.throws(() => validate({ ...input, temperature: NaN }));
  assert.throws(() => validate({ ...input, mode: "persona", system: "" }));
});
test("system prompt and user prompt remain separate roles", () => {
  const b = validate({
    ...input,
    mode: "persona",
    system: "Use measured language.",
  });
  const m = messages(b);
  assert.equal(m[0].role, "system");
  assert.ok(m[0].content.includes(b.system));
  assert.equal(m[1].content, b.prompt);
});
test("session enforcement, bounded sampling parameters, and private-note exclusion", async () => {
  const { env, ctx, waits, seen } = setup();
  assert.equal(
    (await worker.fetch(req("/api/chat", input), env, ctx)).status,
    401,
  );
  const { token } = await (
    await worker.fetch(req("/api/session"), env, ctx)
  ).json();
  const r = await worker.fetch(
    req("/api/chat", { ...input, reflection: "PRIVATE" }, token),
    env,
    ctx,
  );
  assert.equal(r.status, 200);
  assert.equal(seen[0].top_k, 20);
  assert.equal(seen[0].top_p, 0.9);
  assert.equal(seen[0].temperature, 0.7);
  assert.ok(!JSON.stringify(seen).includes("PRIVATE"));
  await Promise.all(waits);
});
test("provider failure releases concurrency and retains budget accounting", async () => {
  const { env, ctx, waits, store } = setup();
  env.AI.run = async () => {
    throw Error("down");
  };
  const { token } = await (
    await worker.fetch(req("/api/session"), env, ctx)
  ).json();
  assert.equal(
    (await worker.fetch(req("/api/chat", input, token), env, ctx)).status,
    503,
  );
  await Promise.all(waits);
  assert.equal(store.get("budget").count, 1);
  assert.equal(Object.keys(store.get("budget").active).length, 0);
});
test("daily quota prevents further model calls", async () => {
  const { env, ctx, waits, seen } = setup();
  env.DAILY_REQUEST_LIMIT = "1";
  const { token } = await (
    await worker.fetch(req("/api/session"), env, ctx)
  ).json();
  await worker.fetch(req("/api/chat", input, token), env, ctx);
  await Promise.all(waits);
  assert.equal(
    (await worker.fetch(req("/api/chat", input, token), env, ctx)).status,
    429,
  );
  assert.equal(seen.length, 1);
});

test("top-q nucleus keeps the boundary candidate and matches top-p", () => {
  const counts = new Map([["a", 6], ["b", 3], ["c", 1]]);
  assert.deepEqual(distribution(counts, { topq: 0.7 }), distribution(counts, { topp: 0.7 }));
  distribution(counts, { topq: 0.7 }).forEach((r,i)=>assert.ok(Math.abs(r.prob - [2/3,1/3,0][i]) < 1e-12));
  assert.equal(distribution(counts, { topq: 1 }).filter(r=>r.kept).length, 3);
  assert.throws(()=>distribution(counts, { topq: 0 }));
  assert.throws(()=>distribution(counts, { topq: 0.7, topp: 0.7 }));
});
test("top-q is passed to the provider as top_p and preserved in metadata", async () => {
  const {topp, ...rest} = input;
  const b = {...rest, topq: 0.65};
  assert.equal(validate(b).topp, 0.65);
  assert.equal(validate(b).nucleusName, "top-q");
  assert.throws(()=>validate({...b, topq: 0}));
  const { env, seen, ctx, waits } = setup();
  const session = await worker.fetch(new Request("https://test/api/session", {method:"POST"}), env);
  const {token} = await session.json();
  const result = await worker.fetch(new Request("https://test/api/chat", {method:"POST", headers:{"Content-Type":"application/json", "X-Session":token}, body:JSON.stringify(b)}), env, ctx);
  assert.equal(result.status, 200);
  assert.equal(seen[0].top_p, 0.65);
  assert.equal((await result.json()).settings.nucleusName, "top-q");
  await Promise.all(waits);
});
