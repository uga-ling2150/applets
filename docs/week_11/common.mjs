export const $ = (id) => document.getElementById(id);
export function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
let token = "",
  endpoint = "https://ling2150-week11-lab.ling2150-query-rewrite.workers.dev";
export function connection() {
  try {
    endpoint = localStorage.getItem("ling2150-week11-endpoint") || "https://ling2150-week11-lab.ling2150-query-rewrite.workers.dev";
  } catch {}
  $("endpoint").value = endpoint;
  $("disconnect").onclick = () => {
    endpoint = "";
    token = "";
    $("endpoint").value = "";
    try { localStorage.removeItem("ling2150-week11-endpoint"); } catch {}
    $("connection").textContent = "Disconnected. Offline activities remain available.";
  };
  $("connect").onclick = async () => {
    const raw = $("endpoint").value.trim();
    try {
      const u = new URL(raw);
      if (
        (u.protocol !== "https:" &&
          !(
            u.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(u.hostname)
          )) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        !["", "/"].includes(u.pathname)
      )
        throw Error("Use the HTTPS origin of the course service.");
      endpoint = u.origin;
      const res = await fetch(endpoint + "/api/health", {
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json();
      if (!res.ok || body.version !== "week11-1" || !body.enabled)
        throw Error("The course service is unavailable or disabled.");
      try {
        localStorage.setItem("ling2150-week11-endpoint", endpoint);
      } catch {}
      token = "";
      $("connection").textContent = "Connected to " + body.model + ".";
    } catch (e) {
      endpoint = "";
      $("connection").textContent = e.message;
    }
  };
}
export async function generate(body) {
  if (!endpoint)
    throw Error(
      "Live generation needs the course service. Open Instructor connection settings, or use the offline practice activity.",
    );
  if (!token) {
    const s = await fetch(endpoint + "/api/session", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });
    if (!s.ok)
      throw Error("The model service is unavailable. Please try again later.");
    token = (await s.json()).token;
  }
  const r = await fetch(endpoint + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session": token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(105000),
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) token = "";
    throw Error(
      r.status === 429
        ? "The classroom request limit was reached. Try later or use the offline activity."
        : r.status === 400
          ? "Check the prompt lengths and sampling settings."
          : "The model service is unavailable. Your work is still on this page.",
    );
  }
  return d;
}
