import { $, node, download, connection, generate } from "./common.mjs";
import { bigrams, distribution, sample } from "./core.mjs";
let model,
  rows = [],
  counts = {},
  total = 0,
  lastDraw = "",
  generations = [],
  busy = false,
  settings;
function parameters(prefix = "") {
  const ids = prefix
    ? ["live-temperature", "live-topk", "live-topp"]
    : ["temperature", "topk", "topp"];
  return {
    temperature: $(ids[0]).value.trim() ? Number($(ids[0]).value) : NaN,
    topk: $(ids[1]).value.trim() ? Number($(ids[1]).value) : NaN,
    topp: $(ids[2]).value.trim() ? Number($(ids[2]).value) : NaN,
  };
}
function render() {
  const tbody = $("distribution");
  tbody.replaceChildren();
  rows.forEach((r) => {
    const tr = node("tr");
    const word = node("th", r.word);
    word.scope = "row";
    tr.append(word);
    for (const value of [
      r.count,
      (100 * r.base).toFixed(1) + "%",
      (100 * r.tempered).toFixed(1) + "%",
      r.kept ? "Yes" : "No",
      (100 * r.prob).toFixed(1) + "%",
      counts[r.word] || 0,
    ])
      tr.append(node("td", String(value)));
    const cell = tr.children[5];
    const meter = document.createElement("meter");
    meter.min = 0;
    meter.max = 1;
    meter.value = r.prob;
    meter.setAttribute("aria-label", `Final probability for ${r.word}`);
    cell.append(meter);
    tbody.append(tr);
  });
  $("sample-status").textContent =
    (lastDraw ? `Sampled “${lastDraw}”. ` : "") + `${total} draws for the current distribution.`;
}
function apply() {
  try {
    settings = parameters();
    rows = distribution(model.get($("context").value) || new Map(), settings);
    counts = {};
    total = 0;
    lastDraw = "";
    $("error").textContent = "";
    $("status").textContent = "Distribution updated. Sampling counts reset.";
    render();
    for (const id of ["sample", "many", "clear"]) $(id).disabled = false;
  } catch (e) {
    $("error").textContent = e.message;
    for (const id of ["sample", "many", "clear"]) $(id).disabled = true;
  }
}
function train() {
  model = bigrams($("corpus").value);
  $("context").replaceChildren();
  for (const word of model.keys()) {
    $("context").append(new Option(word, word));
  }
  if (model.has("study")) $("context").value = "study";
  apply();
}
$("train").onclick = train;
$("apply").onclick = apply;
$("context").onchange = apply;
for (const id of ["temperature", "topk", "topp", "corpus"])
  $(id).addEventListener("input", () => {
    for (const id of ["sample", "many", "clear"]) $(id).disabled = true;
    $("status").textContent =
      "Inputs changed. " +
      (id === "corpus"
        ? "Build the bigram model again."
        : "Apply the settings before sampling.");
    if (id === "corpus") {
      $("apply").disabled = true;
      $("context").disabled = true;
    }
  });
$("train").addEventListener("click", () => {
  $("apply").disabled = false;
  $("context").disabled = false;
});
function draw(n) {
  lastDraw = "";
  for (let i = 0; i < n; i++) {
    const word = sample(rows);
    if (n === 1) lastDraw = word;
    counts[word] = (counts[word] || 0) + 1;
    total++;
  }
  render();
}
$("sample").onclick = () => draw(1);
$("many").onclick = () => draw(100);
$("clear").onclick = () => {
  counts = {};
  total = 0;
  lastDraw = "";
  render();
};
$("generate").onclick = async () => {
  if (busy) return;
  const prompt = $("prompt").value.trim(),
    p = parameters("live");
  try {
    distribution(new Map([["test", 1]]), p);
    if (p.topk < 1 || !prompt)
      throw Error("Enter a prompt and an integer LLM top-k from 1 to 50.");
  } catch (e) {
    $("live-error").textContent = e.message;
    return;
  }
  busy = true;
  $("generate").disabled = true;
  $("live-error").textContent = "";
  $("live-status").textContent = "Waiting for the model…";
  try {
    const r = await generate({ mode: "sampling", prompt, ...p });
    const record = {
      prompt,
      settings: p,
      model: r.model,
      text: r.reply,
      created: new Date().toISOString(),
    };
    generations.push(record);
    const article = node("article", undefined, "generation");
    article.append(
      node("h4", `Generation ${generations.length}`),
      node(
        "p",
        `${r.model}, temperature ${p.temperature}, top-k ${p.topk}, top-p ${p.topp}`,
        "field-hint",
      ),
      node("p", "Prompt: " + prompt),
      node("p", r.reply),
    );
    $("generations").append(article);
    $("live-status").textContent =
      "Generation saved on this page. Repeat the condition or change one parameter.";
  } catch (e) {
    $("live-error").textContent = e.message;
    $("live-status").textContent = "Existing results preserved.";
  } finally {
    busy = false;
    $("generate").disabled = false;
  }
};
$("download").onclick = () =>
  download("11B-sampling.json", {
    activity: "11B",
    corpus: $("corpus").value,
    context: $("context").value,
    settings,
    distribution: rows,
    counts,
    total,
    generations,
  });
connection();
train();
