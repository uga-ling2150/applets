const LIMITS = { bytes: 16000 };
export async function limitedJSON(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw Error("invalid_input");
  const r = request.body?.getReader();
  if (!r) throw Error("invalid_input");
  let n = 0,
    chunks = [];
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.byteLength;
    if (n > LIMITS.bytes) {
      await r.cancel();
      throw Error("invalid_input");
    }
    chunks.push(value);
  }
  const b = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    b.set(c, at);
    at += c.length;
  }
  return JSON.parse(new TextDecoder().decode(b));
}
export function admit(s, session, mode, id, now, c) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (s.day !== day)
    Object.assign(s, { day, count: 0, sessions: {}, recent: [], active: {} });
  s.recent = s.recent.filter((t) => t > now - 60000);
  for (const [k, v] of Object.entries(s.active))
    if (v.until <= now) delete s.active[k];
  if (c.daily > 0 && s.count >= c.daily) return { code: "daily_limit" };
  if (c.session > 0 && (s.sessions[session] || 0) >= c.session) return { code: "session_limit" };
  if (
    Object.values(s.active).some(
      (v) => v.session === session && v.mode === mode,
    )
  )
    return { code: "busy", retry: 3 };
  if (s.recent.length >= c.rpm || Object.keys(s.active).length >= c.concurrent)
    return { code: "busy", retry: 5 };
  s.count++;
  if (c.session > 0) s.sessions[session] = (s.sessions[session] || 0) + 1;
  s.recent.push(now);
  s.active[id] = { session, mode, until: now + 35000 };
  return { ok: true };
}
