import { $, node, download, connection, generate } from "./common.mjs";
import { exactSpans } from "./core.mjs";
let pair = null,
  annotations = [],
  history = [],
  busy = false;
const examples = {
  a: "A manageable plan starts with identifying the exam topics. You could divide the remaining days between reviewing key ideas and practising retrieval. If possible, check which areas need the most attention before deciding how much time to spend on each.",
  b: "Let’s make this feel a bit more manageable! Pick the trickiest topics first, then give yourself a small practice challenge each day. You’ve got a week to build momentum. Want to start by listing the three topics that worry you most?",
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
  let cuts = new Set([0, text.length]);
  ranges.forEach(([a, b]) => {
    cuts.add(a);
    cuts.add(b);
  });
  const points = [...cuts].sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    const covered = ranges.some(([s, e]) => a >= s && b <= e);
    p.append(node(covered ? "mark" : "span", text.slice(a, b)));
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
    const remove = node("button", "Remove annotation", "btn-uga-outline");
    remove.type = "button";
    remove.onclick = () => {
      annotations.splice(i, 1);
      render();
    };
    li.append(remove);
    $("annotations").append(li);
  });
}
function render() {
  $("annotation-panel").hidden = !pair;
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
$("capture").onclick = () => {
  const selection = window.getSelection();
  const quote = selection?.toString();
  const anchor = selection?.anchorNode?.parentElement?.closest("[data-side]");
  const focus = selection?.focusNode?.parentElement?.closest("[data-side]");
  if (!quote || anchor !== focus || !anchor) {
    $("error").textContent =
      "Select a phrase entirely inside one output, or type an exact quote below.";
    return;
  }
  $("side").value = anchor.dataset.side;
  $("quote").value = quote;
  $("error").textContent = "";
  $("interpretation").focus();
};
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
      "Enter an exact quote from the chosen output and an interpretation.";
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
  $("generate").disabled = true;
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
    render();
    $("status").textContent =
      "Both outputs received. Annotate evidence before changing the prompts.";
  } catch (e) {
    $("error").textContent = e.message;
    $("status").textContent =
      "No comparison replaced; any existing work is preserved.";
  } finally {
    busy = false;
    $("generate").disabled = false;
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
    prompt: "How can I prepare for a difficult exam next week?",
    systems: {
      a: "Authored to illustrate a measured university tutor.",
      b: "Authored to illustrate an enthusiastic peer.",
    },
    outputs: examples,
    model: { a: "authored example", b: "authored example" },
  };
  annotations = [];
  render();
  $("status").textContent =
    "Authored practice comparison loaded. These examples were not generated by the edited prompts.";
};
$("download").onclick = () => {
  save();
  download("11A-style-persona.json", { activity: "11A", comparisons: history });
};
connection();
render();
