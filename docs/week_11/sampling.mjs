import { $, node, download, connection, generate } from "./common.mjs?v=20261021-meeting";
import { sentenceBigrams, distribution, sample } from "./core.mjs?v=20261021-meeting";
let sentenceWords=[], trace=[], complete=false;
// Observations are real generated words, grouped by their preceding context.
// A parameter change or corpus rebuild starts a new counting condition.
const observations = new Map();
let activeCondition = '';
function conditionKey(p) { return JSON.stringify([p.temperature,p.topk,p.topq ?? p.topp ?? 1]); }
function showObservations(context) {
  const observed=observations.get(context);
  counts=observed?.counts || Object.create(null); total=observed?.total || 0; lastDraw=observed?.lastDraw || '';
}
function recordObservation(context,word) {
  if(!observations.has(context))observations.set(context,{counts:Object.create(null),total:0,lastDraw:''});
  const observed=observations.get(context);
  observed.counts[word]=(observed.counts[word]||0)+1; observed.total++; observed.lastDraw=word;
}
function settingsLabel(p) {
 return `temperature ${p.temperature}, top-k ${p.topk}, ${p.topq!==undefined?'top-q':'top-p'} ${p.topq ?? p.topp}`;
}
let model,
  rows = [],
  counts = Object.create(null),
  total = 0,
  lastDraw = "",
  generations = [],
  busy = false,
  settings,
  appliedInput,
  modelDirty = false,
  dirty = false;
function parameters(prefix = "") {
  const ids = prefix
    ? ["live-temperature", "live-topk", "live-topp"]
    : ["temperature", "topk", "topp"];
  return {
    temperature: $(ids[0]).value.trim() ? Number($(ids[0]).value) : NaN,
    topk: $(ids[1]).value.trim() ? Number($(ids[1]).value) : NaN,
    [$(prefix ? "live-nucleus" : "nucleus").value]: $(ids[2]).value.trim() ? Number($(ids[2]).value) : NaN,
  };
}
function render() {
  renderCharts();
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
    `Observed at context “${$("context").value}” under the current controls: ${total} ${total===1?'draw':'draws'}. ` +
    (lastDraw ? `Last observed word: “${lastDraw}”. ` : '') +
    'Counts accumulate across generated sentences at this context; changing parameters or rebuilding resets them.';
}
function apply() {
  $("inspection-area").hidden = trace.length === 0;
  $("inspect-choice").hidden = trace.length === 0;
  if (trace.length) $("word-options").hidden = false;
  const savedStep=trace[Number($("inspect-step").value)];
  const context=savedStep?.context || '<start>';
  try {
    const nextSettings = parameters();
    const nextRows = distribution(model.get(context) || new Map(), nextSettings);
    const nextCondition=conditionKey(nextSettings);
    if(nextCondition!==activeCondition){observations.clear();activeCondition=nextCondition;}
    settings = nextSettings;
    rows = nextRows;
    $("context").value=context;
    $("context-view").textContent=context;
    appliedInput = {corpus: $("corpus").value, context};
    dirty = false;
    $("probability-panel").hidden = false;
    showObservations(context);
    $("error").textContent = "";
    $("status").textContent = savedStep
      ? `Saved step ${Number($("inspect-step").value)+1}: context “${context}”; originally sampled “${savedStep.word}” with ${settingsLabel(savedStep.settings)}. Charts use the current controls; the saved sentence is unchanged.`
      : 'Generate a sentence to reveal its word choices and probability charts.';
    render();
    for (const id of ["sample", "many", "clear"]) $(id).disabled = false;
  } catch (e) {
    $("inspection-area").hidden = false;
    $("error").textContent = e.message;
    $("status").textContent = "No current distribution. Fix the settings or rebuild the model. The saved sentence has not changed.";
    $("probability-panel").hidden = true;
    dirty = true;
    for (const id of ["sample", "many", "clear"]) $(id).disabled = true;
  }
}
function train() {
  restartSentence();
  observations.clear();
  model = sentenceBigrams($("corpus").value);
  modelDirty = false;
  $("context").disabled = true;
  $("context").replaceChildren();
  for (const word of model.keys()) {
    $("context").append(new Option(word, word));
  }
  $("context").value = "<start>";
  apply();
}
$("train").onclick = train;
$("context").onchange = apply;
for (const id of ["temperature", "topk", "topp", "nucleus"]) {
  $(id).addEventListener("input", () => { if (!modelDirty) apply(); });
}
$("corpus").addEventListener("input", () => {
  restartSentence();
  observations.clear();
  modelDirty = true;
  dirty = true;
  $("probability-panel").hidden = true;
  $("error").textContent = "";
  for (const id of ["sample", "many", "clear", "context"]) $(id).disabled = true;
  $("status").textContent = "Corpus changed. Build the model to update the distribution.";
});
function restartSentence() {
  $("inspection-area").hidden = true;
  $("context-view").textContent = "<start>";
  $("live-activity").hidden = generations.length === 0;
  sentenceWords=[]; trace=[]; complete=false;
  $("sentence-output").textContent="Sentence not started.";
  $("inspect-step").replaceChildren(); $("inspect-step").disabled=true;
  rows=[]; counts=Object.create(null); total=0; lastDraw="";
  $("live-activity").disabled=true;
  $("unlock-status").textContent="Complete a sentence in part 1 to unlock part 2.";
  if(model?.has('<start>')) $("context").value='<start>';
}
function draw(n) {
  try {
    if(complete || trace.length>=40) { restartSentence(); }
    let remaining=n===1 ? 1 : 40-trace.length;
    while(remaining-- > 0 && !complete) {
      const context=sentenceWords.at(-1)||'<start>';
      const stepRows=distribution(model.get(context)||new Map(),settings);
      const word=sample(stepRows);
      trace.push({context,word,rows:stepRows,settings:{...settings}});
      recordObservation(context,word);
      if(word==='<end>') complete=true; else sentenceWords.push(word);
      if(trace.length>=40) break;
    }
    $("sentence-output").textContent=sentenceWords.join(' ')+(complete?'.':' …')+(trace.length>=40&&!complete?' (Stopped at 40 steps; restart or adjust the corpus/settings.)':'');
    $("inspect-step").replaceChildren();
    trace.forEach((t,i)=>$("inspect-step").append(new Option(`${i+1}. ${t.context} → ${t.word}`,i)));
    $("inspect-step").disabled=false;
    const branching = n === 1 ? -1 : trace.findIndex(t=>t.rows.length>1);
    $("inspect-step").value=branching>=0?branching:trace.length-1;
    inspect();
    if(complete) { $("live-activity").hidden=false; $("live-activity").disabled=false; $("unlock-status").textContent='Sentence complete: part 2 is unlocked. Change controls to compare this step; rebuild the corpus or restart the sentence to begin again.'; }
  } catch(e) { $("error").textContent=e.message; }
}
function inspect() {
  // Recompute only the view. Never replace the saved draw or its original settings.
  if(!modelDirty)apply();
}
$("inspect-step").onchange=inspect;
$("sample").onclick=()=>draw(1);
$("many").onclick=()=>draw(40);
$("clear").onclick=()=>{restartSentence();apply();};
function renderCharts() {
  const host=$("probability-charts"); host.replaceChildren();
  host.append(node('p','Shared scale: 0% to 100%. Orange: retained; red: added; striped outline: removed.','field-hint'));
  const grid=node('div',undefined,'lab-grid');
  for(const phase of ['base','prob']) {
    const panel=node('section');panel.append(node('h4',phase==='base'?'Base probabilities':'Final probabilities and changes'));
    const k=Number(settings?.topk||0);
    rows.forEach((r,i)=>{
      if(k>0 && i===k) panel.append(node('p',`Top-k cutoff: candidates ranked below ${k} are excluded.`, 'cutoff-line'));
      const row=node('div',undefined,'probability-row');
      const name=r.word==='<end>'?'End sentence':r.word==='<start>'?'Start sentence':r.word;
      row.append(node('span',`${name}: ${(100*r[phase]).toFixed(1)}%${!r.kept && phase==='prob'?' (excluded)':''}`));
      const track=node('div',undefined,'probability-track');track.setAttribute('aria-hidden','true');
      const segment=(val,cls)=>{const el=node('span',undefined,cls);el.style.width=`${100*val}%`;track.append(el);};
      if(phase==='base')segment(r.base,'prob-retained');
      else {segment(Math.min(r.base,r.prob),'prob-retained');segment(Math.max(0,r.prob-r.base),'prob-added');segment(Math.max(0,r.base-r.prob),'prob-removed');}
      row.append(track);panel.append(row);
    });grid.append(panel);
  }host.append(grid);
}
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
  for (const id of ["generate", "prompt", "live-temperature", "live-topk", "live-topp", "live-nucleus"]) $(id).disabled = true;
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
    $("live-activity").hidden = false;
    const article = node("article", undefined, "generation");
    article.append(
      node("h4", `Generation ${generations.length}`),
      node(
        "p",
        `${r.model}, temperature ${p.temperature}, top-k ${p.topk}, ${p.topq !== undefined ? "top-q" : "top-p"} ${p.topq ?? p.topp}`,
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
    for (const id of ["generate", "prompt", "live-temperature", "live-topk", "live-topp", "live-nucleus"]) $(id).disabled = false;
  }
};
$("download").onclick = () =>
  download("11B-sampling.json", {
    activity: "11B",
    corpus: appliedInput?.corpus,
    context: appliedInput?.context,
    pendingInputs: dirty ? {corpus: $("corpus").value, context: $("context").value, settings: parameters()} : null,
    settings,
    distribution: rows,
    counts,
    total,
    generations,
    sentenceTrace: trace,
    sentenceWords,
    languageEvidence: $("language-evidence").value,
  });
for (const prefix of ["", "live-"]) {
  $(prefix + "nucleus").addEventListener("change", () => {
    const name = $(prefix + "nucleus").value === "topq" ? "Top-q" : "Top-p";
    const label=$(prefix + "cutoff-label");
    const text=prefix ? "LLM " + name.toLowerCase() : name + " cumulative probability ";
    if(label.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.nodeValue=text;else label.textContent=text;
  });
}
connection();
train();

// Help remains keyboard accessible and can be dismissed without moving focus.
for (const help of document.querySelectorAll('.term-help')) {
 help.addEventListener('keydown', e => {if(e.key==='Escape'){help.classList.add('help-dismissed');e.preventDefault();}});
 help.addEventListener('blur',()=>help.classList.remove('help-dismissed'));
 help.addEventListener('mouseleave',()=>help.classList.remove('help-dismissed'));
}
