const $ = id => document.getElementById(id);
const titles = {validation:'Validation', indirectness:'Indirectness', framing:'Framing', combined:'All three (combined)'};
const definitions = {
  validation: 'Validation supports the user’s feelings or perspective. Ask whether that support is warranted in this situation.',
  indirectness: 'Indirectness gives hedged or vague guidance rather than clear advice. Ask what a more direct response would change.',
  framing: 'Framing accepts the user’s premises rather than questioning them. Ask whose version of events the response takes for granted.',
  combined: 'Combined weights were trained on all three patterns occurring together (AND), not any one pattern (OR). A word is a clue, not proof that all three occur here.'
};
const examples = {
  privacy: {context:'I read my roommate’s private messages without asking because I felt left out. Now they are angry. Am I wrong to feel hurt?', response:'It’s understandable to feel conflicted. Your feelings are valid, and you deserve to be heard. You might consider talking about boundaries and explaining your perspective.'},
  support: {context:'I did not get the role in our student play. I feel disappointed, although I know the auditions were fair. How can I move forward?', response:'Your disappointment is understandable. It is valid to feel sad after working hard. Give yourself some time, then ask for feedback and consider another opportunity.'},
  team: {context:'My group did not use my idea. I think that proves they are jealous of me. Should I stop doing my share of the project?', response:'That sounds like a tough situation. It is understandable that you feel conflicted. Here are a few suggestions: consider sharing your feelings with the group and focusing on what you need.'}
};
let data, ctl, shown = false, compared = false, snapshot = '', observations = [];
function element(tag, text, cls) {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls; return el;
}
function notice(message, target = 'error') {
  for (const id of ['error','annotation-error','compare-error']) $(id).textContent = '';
  for (const id of ['context','response','quote','interpretation','rewrite']) $(id).removeAttribute('aria-invalid');
  $(target).textContent = message;
}
function invalid(id, message, target) {
  notice(message, target); $(id).setAttribute('aria-invalid','true'); $(id).focus();
}
function loadExample() {
  const e = examples[$('example').value];
  $('context').value = e.context; $('response').value = e.response;
  $('prediction').value = ''; $('rewrite').value = ''; $('quote').value = ''; $('interpretation').value = '';
  observations = []; renderObservations(); invalidate(); notice('');
  $('evidence-status').textContent = ''; $('work-status').textContent = '';
}
function invalidate() {
  shown = false; compared = false;
  $('inspect-stage').hidden = true; $('rewrite-stage').hidden = true; $('comparison').hidden = true;
  notice(''); $('work-status').textContent = '';
  if (data) $('load-status').textContent = 'Read and predict, then reveal the clues. Changing the text requires a new reveal.';
}
function model() {
  const key = $('dimension').value;
  return {...data.models[key], labels: {
    positive: `positive association with ${titles[key].toLowerCase()}`,
    negative: `negative association with ${titles[key].toLowerCase()}`
  }};
}
function update() {
  if (!shown || !ctl) return;
  ctl.setWeights(model()); ctl.setShowWeights($('show-weights').checked);
  $('definition').textContent = definitions[$('dimension').value];
  $('match-status').textContent = `${ctl.matches.length} word occurrences highlighted for ${titles[$('dimension').value].toLowerCase()}. No highlight does not mean no face-preserving language.`;
  if (compared) renderRewrite();
}
function renderRewrite() {
  const text = $('rewrite').value;
  const matches = Highlighter.find(text, ctl.model);
  Highlighter.render($('comparison-original'), snapshot, ctl.matches, ctl.model, $('show-weights').checked);
  Highlighter.render($('rewrite-output'), text, matches, ctl.model, $('show-weights').checked);
  $('comparison').hidden = false;
  $('rewrite-status').textContent = `${matches.length} word occurrences highlighted, compared with ${ctl.matches.length} in the original. Compare the stance and context, not just the counts.`;
}
function renderObservations() {
  $('evidence').replaceChildren();
  $('observations-section').hidden = observations.length === 0;
  observations.forEach((o, index) => {
    const li = element('li'); li.append(element('strong', `${o.dimension}: “${o.quote}”`), element('p',o.interpretation));
    if (o.original !== snapshot || o.context !== $('context').value) {
      const source = element('details',undefined,'glossary-box');
      source.append(element('summary','Observation from an earlier text'),element('p','Situation: '+o.context),element('p','Response: '+o.original));
      li.append(source);
    }
    const actions = element('div',undefined,'btn-row'); const button = element('button','Remove','btn-uga-outline');
    button.type = 'button'; button.setAttribute('aria-label', `Remove observation ${index+1}`);
    button.onclick = () => { observations.splice(index,1); renderObservations(); $('add').focus(); $('evidence-status').textContent = 'Observation removed.'; };
    actions.append(button); li.append(actions); $('evidence').append(li);
  });
}
$('example').addEventListener('change', loadExample);
for (const id of ['context','response']) $(id).addEventListener('input',invalidate);
$('rewrite').addEventListener('input',()=>{ compared = false; $('comparison').hidden = true; $('rewrite-status').textContent = ''; });
$('dimension').addEventListener('change',update); $('show-weights').addEventListener('change',update);
$('reveal').onclick = () => {
  if (!$('context').value.trim() || !$('response').value.trim()) { invalid(!$('context').value.trim() ? 'context' : 'response','Enter a situation and a response before revealing clues.','error'); return; }
  notice(''); snapshot = $('response').value; shown = true;
  $('inspect-stage').hidden = false; $('rewrite-stage').hidden = false; update(); renderObservations();
  $('load-status').textContent = 'Clues revealed. Interpret them against the situation.'; $('inspect-title').focus();
};
$('add').onclick = () => {
  const quote = $('quote').value.trim(), interpretation = $('interpretation').value.trim();
  if (!quote || !snapshot.includes(quote)) { invalid('quote','Copy an exact phrase from the original response. It need not be highlighted.','annotation-error'); return; }
  if (!interpretation) { invalid('interpretation','Explain what this phrase does in this situation.','annotation-error'); return; }
  notice(''); observations.push({dimension:titles[$('dimension').value], quote, interpretation, context:$('context').value, original:snapshot}); renderObservations();
  $('quote').value = ''; $('interpretation').value = ''; $('evidence-status').textContent = 'Observation kept on this page.';
};
$('compare').onclick = () => {
  if (!$('rewrite').value.trim()) { invalid('rewrite','Write a response before comparing.','compare-error'); return; }
  notice(''); compared = true; renderRewrite();
};
$('download').onclick = () => {
  const work = {activity:'Activity 12A: AI Sycophancy', sourceCommit:data.sourceCommit, combinedTarget:data.combinedTarget,
    context:$('context').value, original:snapshot, prediction:$('prediction').value, dimension:titles[$('dimension').value],
    observations, rewrite:$('rewrite').value, rewriteCompared:compared, interpretation:'Lexical teaching clues; not a classifier or probability.'};
  const url = URL.createObjectURL(new Blob([JSON.stringify(work,null,2)],{type:'application/json'}));
  const link = element('a'); link.href = url; link.download = '12A-sycophancy-work.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000); $('work-status').textContent = 'Download requested. Reflection notes have their own download below.';
};
loadExample();
try {
  const response = await fetch(new URL('./weights.json',import.meta.url));
  if (!response.ok) throw Error('Word lists unavailable');
  data = await response.json();
  ctl = await Highlighter.attach({weights:model(), input:'#response', output:'#output', legend:'#legend', matches:'#matches'});
  // The helper's live rendering stays hidden until students request the clues.
  const m = data.models.validation;
  $('data-note').textContent = `Each source list has ${m.sourceRows} rows: ${Object.keys(m.weights).length} lexical entries are retained, with ${m.excluded.length} non-lexical or metadata rows documented separately. Research source revision: ${data.sourceCommit.slice(0,7)}.`;
  $('reveal').disabled = false; $('load-status').textContent = 'Ready. Read the situation and make a prediction first.';
} catch (error) {
  notice('The word lists could not load. Reload the page while online. Your typed text is still here.');
  $('load-status').textContent = 'Clues unavailable.';
}
