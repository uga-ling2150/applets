import { $, node, download, connection, generate } from "./common.mjs?v=20261021-meeting";
import { exactSpans } from "./core.mjs?v=20261021-meeting";
let pair = null,
  annotations = [],
  history = [],
  busy = false;
const examples = {
  a: "A manageable plan starts with identifying the exam topics. You could then divide the week between reviewing key ideas and practising retrieval.",
  b: "Let’s tackle the trickiest topics first! Give yourself a small practice challenge each day, and build momentum through the week.",
};
function renderOutput(side) {
  const log = $("log-" + side);
  log.replaceChildren();
  if (!pair) {
    log.append(
      node(
        "li",
        "Generate outputs or load the offline comparison.",
        "chat-empty",
      ),
    );
    return;
  }
  const li = node("li", undefined, "chat-turn ai");
  li.append(
    node(
      "span",
      `Persona ${side.toUpperCase()} (${pair.kind === "practice" ? "authored practice example" : pair.model[side]})`,
      "chat-turn__speaker",
    ),
  );
  const p = node("p", undefined, "chat-turn__text");
  p.dataset.side = side;
  const text = pair.outputs[side],
    ranges = annotations
      .filter((a) => a.side === side)
      .flatMap((a) => exactSpans(text, a.quote));
  const activeRanges = $("side").value === side ? exactSpans(text,$("quote").value) : [];
  let cuts = new Set([0, text.length]);
  activeRanges.forEach(([a,b])=>{cuts.add(a);cuts.add(b);});
  ranges.forEach(([a, b]) => {
    cuts.add(a);
    cuts.add(b);
  });
  const points = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const covered = ranges.some(([s, e]) => a >= s && b <= e);
    const active = activeRanges.some(([s,e]) => a>=s && b<=e);
    p.append(node(covered || active ? "mark" : "span", text.slice(a,b),active?"current-phrase":undefined));
  }
  li.append(p);
  log.append(li);
  log.scrollTop = log.scrollHeight;
}
function renderAnnotations() {
  $("annotations").replaceChildren();
  annotations.forEach((a, i) => {
    const li = node("li");
    li.append(
      node("strong", `Persona ${a.side.toUpperCase()}: “${a.quote}”`),
      node("p", `${a.category}: ${a.interpretation}`),
    );
    const remove = node("button", "🗑", "btn-uga-outline");
    remove.setAttribute("aria-label", `Remove annotation ${i + 1} for Persona ${a.side.toUpperCase()}`);
    remove.title = "Remove annotation";
    remove.type = "button";
    remove.onclick = () => {
      annotations.splice(i, 1);
      render();
      $("annotate").focus();
      $("status").textContent = "Annotation removed.";
    };
    const actions = node("div", undefined, "btn-row");
    actions.append(remove);
    li.append(actions);
    $("annotations").append(li);
  });
}
function render() {
  $("annotation-panel").hidden = !pair;
  $("evidence-panel").hidden = !pair;
  promptNotice();
  renderOutput("a");
  renderOutput("b");
  renderAnnotations();
}
function save() {
  if (!pair) return;
  const snapshot = structuredClone({ ...pair, annotations });
  const existing = history.findIndex((p) => p.id === pair.id);
  if (existing >= 0) history[existing] = snapshot;
  else history.push(snapshot);
  renderHistory();
}
function renderHistory() {
  $("history-panel").hidden = history.length === 0;
  $("history").replaceChildren();
  history.forEach((p, i) => {
    const details = node("details", undefined, "glossary-box");
    details.append(
      node(
        "summary",
        `Comparison ${i + 1}: ${p.kind === "practice" ? "authored practice" : "live model"}, ${new Date(p.created).toLocaleTimeString()}`,
      ),
    );
    details.append(node("p", "User question: " + p.prompt));
    for (const side of ["a", "b"]) {
      details.append(
        node("h4", "Persona " + side.toUpperCase()),
        node("p", "System prompt: " + p.systems[side]),
        node("p", p.outputs[side]),
      );
    }
    p.annotations.forEach((a) =>
      details.append(
        node(
          "p",
          `“${a.quote}” (${a.side.toUpperCase()}): ${a.interpretation}`,
        ),
      ),
    );
    $("history").append(details);
  });
}
// Capture text selections without a second button; keep exact quote entry for keyboard users.
document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  const quote = selection?.toString();
  const anchor = selection?.anchorNode?.parentElement?.closest("[data-side]");
  const focus = selection?.focusNode?.parentElement?.closest("[data-side]");
  if (!pair || !quote || !anchor || anchor !== focus) return;
  $("side").value = anchor.dataset.side;
  $("quote").value = quote;
  $("error").textContent = "";
  $("status").textContent = `Phrase from Persona ${anchor.dataset.side.toUpperCase()} selected. Choose a feature and explain its effect.`;
  // Native selection remains visible until the student moves into the form.
});
function showCurrentPhrase() { renderOutput("a"); renderOutput("b"); }
$("interpretation").addEventListener("focus", showCurrentPhrase);
$("quote").addEventListener("input", showCurrentPhrase);
$("side").addEventListener("change", showCurrentPhrase);
$("annotate").onclick = () => {
  const side = $("side").value,
    quote = $("quote").value,
    interpretation = $("interpretation").value.trim();
  if (
    !pair ||
    !quote ||
    !exactSpans(pair.outputs[side], quote).length ||
    !interpretation
  ) {
    $("error").textContent =
      "Select a phrase or enter an exact quote from the chosen output, then add an interpretation.";
    if(!pair || !quote || !exactSpans(pair.outputs[side],quote).length){
      $("quote-entry").open=true; $("quote").focus();
    } else { $("interpretation").focus(); }
    return;
  }
  annotations.push({
    side,
    quote,
    interpretation,
    category: $("category").selectedOptions[0].textContent,
  });
  $("error").textContent = "";
  $("quote").value = "";
  $("interpretation").value = "";
  render();
  $("status").textContent =
    "Annotation added. All exact occurrences of the phrase are highlighted.";
};
$("generate").onclick = async () => {
  if (busy) return;
  const prompt = $("prompt").value.trim(),
    systems = { a: $("system-a").value.trim(), b: $("system-b").value.trim() };
  if (!prompt || !systems.a || !systems.b) {
    $("error").textContent = "Enter a question and both system prompts.";
    return;
  }
  busy = true;
  for (const id of ["generate", "prompt", "system-a", "system-b", "example"]) $(id).disabled = true;
  $("error").textContent = "";
  $("status").textContent = "Generating both personas…";
  try {
    const results = {};
    for (const side of ["a", "b"])
      results[side] = await generate({
        mode: "persona",
        prompt,
        system: systems[side],
        temperature: 0.7,
        topk: 50,
        topp: 1,
      });
    save();
    pair = {
      id: crypto.randomUUID(),
      created: new Date().toISOString(),
      kind: "live",
      prompt,
      systems,
      outputs: { a: results.a.reply, b: results.b.reply },
      model: { a: results.a.model, b: results.b.model },
      settings: { temperature: 0.7, topk: 50, topp: 1 },
    };
    annotations = [];
    $("quote").value=""; $("interpretation").value="";
    render();
    $("status").textContent =
      "Both outputs received. Annotate evidence before changing the prompts.";
  } catch (e) {
    $("error").textContent = e.message;
    $("status").textContent =
      "No comparison replaced; any existing work is preserved.";
  } finally {
    busy = false;
    for (const id of ["generate", "prompt", "system-a", "system-b", "example"]) $(id).disabled = false;
  }
};
$("save-pair").onclick = () => {
  save();
  $("status").textContent = pair
    ? "Comparison saved on this page. Download your work before closing."
    : "Generate or load a comparison first.";
};
$("example").onclick = () => {
  save();
  pair = {
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
    kind: "practice",
    prompt: "In 1–2 sentences, how can I prepare for a difficult exam next week?",
    systems: {
      a: "Authored to illustrate a measured university tutor.",
      b: "Authored to illustrate an enthusiastic peer.",
    },
    outputs: examples,
    model: { a: "authored example", b: "authored example" },
  };
  annotations = [];
  $("quote").value=""; $("interpretation").value="";
  render();
  $("status").textContent =
    "Authored practice comparison loaded. These examples were not generated by the edited prompts.";
};
$("download").onclick = () => {
  save();
  download("11A-style-persona.json", { activity: "11A", comparisons: history });
};
function promptNotice() {
  const changed = pair && pair.kind === "live" &&
    (pair.prompt !== $("prompt").value.trim() ||
     pair.systems.a !== $("system-a").value.trim() ||
     pair.systems.b !== $("system-b").value.trim());
  $("prompt-notice").textContent = changed
    ? "Prompts changed. Outputs still use the previous prompts. Generate again to compare." : "";
}
for (const id of ["prompt", "system-a", "system-b"]) $(id).addEventListener("input", promptNotice);
connection();
render();
