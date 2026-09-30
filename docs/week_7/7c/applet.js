/* 7C Sequence expansion: bracket adjacency pairs, join them into sequences, and
   attach expansions to the base pair they depend on.

   Model (0-based turn indices internally, 1-based on screen):
     turns  [{id, speaker, text}]   id is the turn id used in exported JSON
     pairs  [{id:'p1', kind:'turn', a:turnIdx, b:turnIdx}]   adjacency pair, a < b
            [{id:'p3', kind:'pair', a:'p1',   b:'p2'}]       sequence of two pairs, a before b
     deps   {'t8': 7, 'p2': 0}   unit key -> index of the turn it depends on
   A unit key is 't<index>' for a single turn or a pair id. Expansion types are never
   stored: they are derived from where a unit sits relative to its target's pair. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const STORE='ling2150-7c-v1', MAX_TURNS=40, MAX_CHARS=400, LANE_L=14, LANE_R=20;

// Constructed examples. Key: pairs are [turn, turn] (1-based) or ['pN','pN'] for a
// sequence of earlier entries (ids follow list order); deps are [unit, turn number].
const EXAMPLES={
  essay:{title:'The essay',label:'The essay (post-expansion)',turns:[
    ['Jordan','Did you finish the essay?'],
    ['Sam','Yeah, last night.'],
    ['Jordan','Really?'],
    ['Sam','Yeah, I stayed up till three.'],
    ['Jordan','Oh wow.']],
    key:{pairs:[[1,2],[3,4]],deps:[['p2',2],['t5',4]]}},
  counter:{title:'At the counter',label:'At the counter (insert expansions)',turns:[
    ['Customer','Can I get a large iced latte?'],
    ['Barista','Sorry, a large what?'],
    ['Customer','An iced latte.'],
    ['Barista','For here or to go?'],
    ['Customer','To go.'],
    ['Barista','Sure, that’s five twenty-five.'],
    ['Customer','Great, thanks.']],
    key:{pairs:[[1,6],[2,3],[4,5]],deps:[['p2',1],['p3',6],['t7',6]]}},
  saturday:{title:'Saturday plans',label:'Saturday plans (all three positions)',turns:[
    ['Maya','Are you doing anything on Saturday?'],
    ['Leo','Why?'],
    ['Maya','I’ve got two tickets for a concert.'],
    ['Leo','No, I’m free.'],
    ['Maya','Do you want to come?'],
    ['Leo','Who’s playing?'],
    ['Maya','A jazz trio from Atlanta.'],
    ['Leo','Yeah, I’d love to.'],
    ['Maya','Great.']],
    key:{pairs:[[1,4],[2,3],[5,8],[6,7]],deps:[['p1',5],['p2',1],['p4',8],['t9',8]]}},
  greetings:{title:'Catching up',label:'Catching up (sequences of sequences)',turns:[
    ['Ana','Hi, Chris!'],
    ['Chris','Hey, Ana!'],
    ['Ana','How are you?'],
    ['Chris','Good, thanks.'],
    ['Chris','How about you?'],
    ['Ana','Not bad.']],
    key:{pairs:[[1,2],[3,4],[5,6],['p2','p3'],['p1','p4']],deps:[]}}
};
const NAMES={pre:'pre-expansion',insF:'insert expansion (post-first)',insS:'insert expansion (pre-second)',post:'post-expansion',dep:'expansion'};
const SUB={pre:'pre',insF:'ins',insS:'ins',post:'post',dep:'',base:'base'};

let store={example:'essay',work:{},custom:null};
try{const s=JSON.parse(localStorage.getItem(STORE));
  if(s&&typeof s==='object'){
    // A class example id is only checked once 7c/examples/ has loaded.
    if(typeof s.example==='string')store.example=s.example;
    if(s.work&&typeof s.work==='object')store.work=s.work;
    const c=s.custom;
    if(Array.isArray(c?.turns)&&c.turns.length<=MAX_TURNS&&c.turns.every(t=>typeof t?.speaker==='string'&&typeof t?.text==='string'))
      store.custom={id:/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(c.id)?c.id:'my-transcript',title:typeof c.title==='string'?c.title:'My own transcript',
        source:plainSource(c.source),
        turns:c.turns.map((t,i)=>({id:typeof t.id==='string'?t.id:'t'+(i+1),speaker:t.speaker,text:t.text}))};
  }}catch{}

let mine=null, D=null, keyView=false, selected=null, armed=null, lanes=null, geo=null;

/* ---------- small helpers ---------- */
function h(tag,props={},...kids){const el=document.createElement(tag);
  for(const[k,v]of Object.entries(props)){if(v==null||v===false)continue;
    if(k==='class')el.className=v;else if(k==='text')el.textContent=v;
    else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);
    else if(['value','disabled','hidden','selected','htmlFor'].includes(k))el[k]=v;
    else el.setAttribute(k,v===true?'':v);}
  for(const c of kids.flat())if(c!=null&&c!==false)el.append(c);return el;}
const say=t=>{$('sx-status').textContent=t;};
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const clip=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
const isTurn=k=>k[0]==='t', tIdx=k=>+k.slice(1);

/* ---------- structure queries ---------- */
const pairById=id=>D.pairs.find(p=>p.id===id);
const turnPairOf=t=>D.pairs.find(p=>p.kind==='turn'&&(p.a===t||p.b===t));
const parentOf=id=>D.pairs.find(p=>p.kind==='pair'&&(p.a===id||p.b===id));
function parentKey(k){const p=isTurn(k)?turnPairOf(tIdx(k)):parentOf(k);return p?p.id:null;}
function span(k){if(isTurn(k)){const t=tIdx(k);return[t,t];}
  const p=pairById(k);return p.kind==='turn'?[p.a,p.b]:[span(p.a)[0],span(p.b)[1]];}
function chainUp(k){const out=[];for(let x=k;x;x=parentKey(x))out.push(x);return out;}
function unitText(k){const[s,e]=span(k);return s===e?`turn ${s+1}`:`turns ${s+1}–${e+1}`;}
function pairLabel(p){return (p.kind==='turn'?'Adjacency pair':'Sequence')+`, ${unitText(p.id)}`;}
function roleOf(t){const p=turnPairOf(t);return p?(t===p.a?'FPP':'SPP'):null;}
// Would making `key` depend on turn `tgt` create a loop? True if anything containing
// tgt already depends (directly or through other dependencies) on something inside key.
function reaches(tgt,key){const seen=new Set(),stack=[tgt];
  while(stack.length){for(const k of chainUp('t'+stack.pop())){if(k===key)return true;
    if(seen.has(k))continue;seen.add(k);if(D.deps[k]!=null)stack.push(D.deps[k]);}}
  return false;}

// Name the expansion `k` from its position relative to the pair its target belongs to.
function classify(k){const tgt=D.deps[k];if(tgt==null)return null;
  const single=isTurn(k),[s,e]=span(k),p=turnPairOf(tgt);
  if(!p)return{type:'dep',name:'expansion',warn:`Turn ${tgt+1} is not part of an adjacency pair yet.`};
  const F=p.a,S=p.b;let r;
  if(e<F)r={type:'pre',warn:tgt===S?'Pre-expansions normally attach to the base FPP.':''};
  else if(s>S)r={type:'post',warn:tgt===F?'Post-expansions normally attach to the base SPP.':''};
  else if(s>F&&e<S)r={type:tgt===F?'insF':'insS',warn:''};
  else return{type:'dep',name:'expansion',warn:`${cap(unitText(k))} overlaps the pair in turns ${F+1}–${S+1}.`};
  r.name=r.type==='post'&&single?'minimal post-expansion':NAMES[r.type];
  return r;}
const isBase=p=>Object.values(D.deps).some(t=>t===p.a||t===p.b);
// Expansion type of a pair, inherited from the nearest dependent container; else base.
function pairType(p){for(let k=p.id;k;k=parentKey(k)){const c=classify(k);if(c)return c.type;}
  return p.kind==='turn'&&isBase(p)?'base':'';}
function tagFor(t){const p=turnPairOf(t);
  if(!p){const c=classify('t'+t);if(!c)return null;
    return{main:{pre:'pre',insF:'ins',insS:'ins',post:'SCT',dep:'exp'}[c.type],sub:'',cls:c.type};}
  const type=pairType(p);return{main:t===p.a?'FPP':'SPP',sub:SUB[type]||'',cls:type};}

/* ---------- edits ---------- */
function makeAP(t1,t2){if(t1===t2)return;const[a,b]=t1<t2?[t1,t2]:[t2,t1];
  for(const t of[a,b]){const p=turnPairOf(t);if(p){say(`Turn ${t+1} is already in the adjacency pair in ${unitText(p.id)}. Remove that bracket first.`);return;}}
  const id='p'+D.next++;D.pairs.push({id,kind:'turn',a,b});
  for(const t of[a,b]){const k='t'+t;if(k in D.deps){const tg=D.deps[k];delete D.deps[k];
    if(!(id in D.deps)&&!(tg>=a&&tg<=b)&&!reaches(tg,id))D.deps[id]=tg;}}
  const same=D.turns[a].speaker===D.turns[b].speaker;
  say(`Turns ${a+1} and ${b+1} are now an adjacency pair: turn ${a+1} is the FPP and turn ${b+1} the SPP.`+(same?' Note: both turns are by the same speaker.':''));
  selected=id;update();}
function makeSeq(k1,k2){if(k1===k2)return;
  if(parentOf(k1)||parentOf(k2)){say('A bracket can join only one larger sequence. Use the dot of the outer bracket instead.');return;}
  const[s1,e1]=span(k1),[s2,e2]=span(k2);
  if(s1<=e2&&s2<=e1){say('These brackets overlap. Only side-by-side sequences can be joined; attach an inserted sequence to its base pair with a dependency instead.');return;}
  const[a,b]=s1<s2?[k1,k2]:[k2,k1],id='p'+D.next++;D.pairs.push({id,kind:'pair',a,b});
  say(`${cap(unitText(a))} and ${unitText(b)} now form one sequence (${unitText(id)}).`);
  selected=id;update();}
function setDep(k,tgt){if(isTurn(k)){const p=turnPairOf(tIdx(k));if(p)k=p.id;}
  const[s,e]=span(k);
  if(tgt>=s&&tgt<=e){say('A turn or pair cannot depend on one of its own turns.');return;}
  if(reaches(tgt,k)){say(`That would make a loop: turn ${tgt+1} already depends on ${unitText(k)}.`);return;}
  D.deps[k]=tgt;const c=classify(k),role=roleOf(tgt);
  say(`${cap(unitText(k))} now ${isTurn(k)?'depends':'depend'} on turn ${tgt+1}`+(role?` (${role}): ${c.name}.`:', which is not in an adjacency pair yet.'));
  selected=k;update();}
function clearDep(k){if(k in D.deps){delete D.deps[k];say(`${cap(unitText(k))} no longer ${isTurn(k)?'depends':'depend'} on another turn.`);update();}}
function removePair(id){const p=pairById(id);if(!p)return;const label=unitText(id);
  const parent=parentOf(id);if(parent)removePair(parent.id);
  D.pairs=D.pairs.filter(x=>x.id!==id);delete D.deps[id];
  if(selected===id)selected=null;if(armed===id)armed=null;
  say(`Removed the bracket for ${label}`+(parent?', and the larger sequence it belonged to.':'.'));update();}
function join(a,b){if(isTurn(a)&&isTurn(b))makeAP(tIdx(a),tIdx(b));else if(!isTurn(a)&&!isTurn(b))makeSeq(a,b);}

/* ---------- loading and saving ---------- */
// Transcripts come from three places: the built-in EXAMPLES, class examples listed in
// 7c/examples/index.json (CLASS, filled at start-up), and the student's own ('custom').
const CLASS={}, EXAMPLE_DIR='7c/examples/', ID=/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SPEC='https://uga-ling2150.github.io/applets/specs/sequence-annotation/v1.schema.json';
const TOOL_URL='https://uga-ling2150.github.io/applets/week_7/7C_sequence_expansion.html';
const known=id=>Object.hasOwn(EXAMPLES,id)||Object.hasOwn(CLASS,id)||id==='custom';
const hasKey=id=>Object.hasOwn(EXAMPLES,id)||!!CLASS[id]?.key;
function meta(id){
  if(id==='custom'){const c=store.custom||{};return{id:c.id||'my-transcript',title:c.title||'My own transcript',source:c.source};}
  if(Object.hasOwn(CLASS,id))return{id,title:CLASS[id].title,source:CLASS[id].source};
  return{id,title:EXAMPLES[id].title,source:{citation:'Written for LING2150 Activity 7C: Sequence Expansion.',constructed:true}};}
function turnsFor(id){const copy=ts=>ts.map(t=>({...t}));
  if(id==='custom')return store.custom?copy(store.custom.turns):[];
  if(Object.hasOwn(CLASS,id))return copy(CLASS[id].turns);
  return EXAMPLES[id].turns.map(([speaker,text],i)=>({id:'t'+(i+1),speaker,text}));}
// Fingerprint of a transcript, so saved work is dropped if its transcript was edited.
function sig(turns){let x=0;for(const c of turns.map(t=>t.speaker+'\u0001'+t.text).join('\u0002'))x=(x*31+c.codePointAt(0))|0;
  return turns.length+':'+(x>>>0).toString(36);}
function slug(s){const x=s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
  return x?(/^[a-z]/.test(x)?x:'t-'+x):'';}
function valid(w,n){try{if(!Array.isArray(w.pairs)||!w.deps||typeof w.deps!=='object'||!Number.isInteger(w.next))return false;
  const seen=new Set(),used=new Set();
  for(const p of w.pairs){if(!/^p\d+$/.test(p.id)||seen.has(p.id))return false;
    if(p.kind==='turn'){if(![p.a,p.b].every(Number.isInteger)||p.a<0||p.b>=n||p.a>=p.b||used.has('t'+p.a)||used.has('t'+p.b))return false;used.add('t'+p.a);used.add('t'+p.b);}
    else if(p.kind==='pair'){if(!seen.has(p.a)||!seen.has(p.b)||used.has(p.a)||used.has(p.b)||p.a===p.b)return false;used.add(p.a);used.add(p.b);}
    else return false;seen.add(p.id);}
  for(const[k,t]of Object.entries(w.deps)){if(!Number.isInteger(t)||t<0||t>=n)return false;
    if(isTurn(k)){const i=tIdx(k);if(!Number.isInteger(i)||i<0||i>=n)return false;}else if(!seen.has(k))return false;}
  return true;}catch{return false;}}
function buildKey(id){const d={turns:turnsFor(id),pairs:[],deps:{},next:1};
  if(Object.hasOwn(CLASS,id))return Object.assign(d,structuredClone(CLASS[id].key));
  const ex=EXAMPLES[id];
  for(const[a,b]of ex.key.pairs){const pid='p'+d.next++;
    d.pairs.push(typeof a==='number'?{id:pid,kind:'turn',a:a-1,b:b-1}:{id:pid,kind:'pair',a,b});}
  for(const[k,t]of ex.key.deps)d.deps[isTurn(k)?'t'+(tIdx(k)-1):k]=t-1;
  return d;}
function load(id){store.example=id;$('sx-example').value=id;$('sx-custom').hidden=id!=='custom';
  const turns=turnsFor(id),w=store.work[id];
  mine={turns,pairs:[],deps:{},next:1};
  if(w&&(!w.sig||w.sig===sig(turns))&&valid(w,turns.length))Object.assign(mine,{pairs:w.pairs,deps:w.deps,next:w.next});
  D=mine;keyView=false;selected=armed=null;hideConfirm();buildRows();update();
  say(id==='custom'&&!turns.length?'Paste a transcript above and load it to begin.':'');}
function save(){store.work[store.example]={pairs:mine.pairs,deps:mine.deps,next:mine.next,sig:sig(mine.turns)};
  let note;try{localStorage.setItem(STORE,JSON.stringify(store));note='Your analysis is saved in this browser. Download it to keep a copy.';}
  catch{note='Browser saving is unavailable. Download your work before leaving.';}
  if($('sx-save').textContent!==note)$('sx-save').textContent=note;}
function parseTranscript(src){const turns=[];
  for(const raw of src.split(/\r?\n/)){const line=raw.trim();if(!line)continue;
    const m=line.match(/^(?:\d+[.)]?\s+)?([^:]{1,40}):\s*(.*)$/);
    if(m)turns.push({speaker:m[1].trim(),text:m[2].trim()});
    else if(turns.length)turns[turns.length-1].text+=' '+line;
    else turns.push({speaker:'?',text:line});}
  return turns.map((t,i)=>({id:'t'+(i+1),speaker:clip(t.speaker,40),text:clip(t.text,MAX_CHARS)}));}

/* ---------- sequence-annotation JSON (docs/specs/sequence-annotation/) ---------- */
// Structural rules A1–A10 of the spec, on an internal doc; returns a problem or ''.
function checkRules(d){const saved=D;D=d;try{
  if(!valid(d,d.turns.length))return'a turn or pair is used in two places, or an adjacency pair lists its SPP first.';
  for(const p of d.pairs)if(p.kind==='pair'&&!(span(p.a)[1]<span(p.b)[0]))return`the sequence in ${unitText(p.id)} joins parts that overlap or are out of order.`;
  for(const[k,t]of Object.entries(d.deps)){
    if(isTurn(k)&&turnPairOf(tIdx(k)))return`turn ${tIdx(k)+1} is in an adjacency pair, so its pair (not the turn) should be the dependent.`;
    const[s,e]=span(k);if(t>=s&&t<=e)return`${unitText(k)} depends on one of its own turns.`;
    delete d.deps[k];const loop=reaches(t,k);d.deps[k]=t;if(loop)return`the dependencies form a loop at ${unitText(k)}.`;}
  return'';}finally{D=saved;}}
function plainSource(s){if(!s||typeof s!=='object')return undefined;const o={};
  for(const k of['citation','url','license'])if(typeof s[k]==='string')o[k]=clip(s[k],500);
  if(typeof s.constructed==='boolean')o.constructed=s.constructed;return Object.keys(o).length?o:undefined;}
// Read a version 1 document. Throws an Error with a student-readable message if it is not
// one or breaks the structural rules. Custom pair ids, notes and x- fields are not kept.
function fromDoc(o){const bad=m=>{throw new Error(m);};
  if(!o||typeof o!=='object'||o.format!=='sequence-annotation'||!/^1\./.test(String(o.version)))bad('This is not a sequence-annotation file (version 1).');
  const tr=o.transcript;
  if(!tr||!Array.isArray(tr.turns)||!tr.turns.length)bad('The file has no transcript turns.');
  if(tr.turns.length>MAX_TURNS)bad(`The transcript has more than ${MAX_TURNS} turns.`);
  const labels=new Map((Array.isArray(tr.speakers)?tr.speakers:[]).map(s=>[s?.id,typeof s?.label==='string'?s.label:s?.id])),index=new Map();
  const turns=tr.turns.map((t,i)=>{
    if(!t||!ID.test(t.id)||index.has(t.id)||typeof t.speaker!=='string'||typeof t.text!=='string')bad(`Turn ${i+1} is missing an id, speaker or text, or repeats another turn’s id.`);
    index.set(t.id,i);return{id:t.id,speaker:clip(String(labels.get(t.speaker)??t.speaker),40),text:clip(t.text,MAX_CHARS)};});
  const analyses=(Array.isArray(o.analyses)?o.analyses:[]).map((a,n)=>{
    const where=`Analysis ${n+1}`+(typeof a?.label==='string'&&a.label?` (“${a.label}”)`:'');
    if(!a||!Array.isArray(a.pairs)||!Array.isArray(a.dependencies))bad(`${where} has no pairs or dependencies list.`);
    const d={turns,pairs:[],deps:{},next:1},map=new Map(),ids=new Set();
    for(const p of a.pairs){if(!p||!ID.test(p.id)||ids.has(p.id)||index.has(p.id))bad(`${where}: every pair needs its own id, different from the turn ids.`);ids.add(p.id);
      if(!Array.isArray(p.parts)||p.parts.length!==2)bad(`${where}: pair “${p.id}” must have exactly two parts.`);}
    // Add each pair once its parts exist, so a sequence may be listed before its parts.
    let todo=[...a.pairs];
    while(todo.length){const left=[];
      for(const p of todo){const[x,y]=p.parts;
        if(p.type==='adjacency'){if(!index.has(x)||!index.has(y))bad(`${where}: adjacency pair “${p.id}” must join two turns.`);
          const id='p'+d.next++;map.set(p.id,id);d.pairs.push({id,kind:'turn',a:index.get(x),b:index.get(y)});}
        else if(p.type==='sequence'){if(map.has(x)&&map.has(y)){const id='p'+d.next++;map.set(p.id,id);d.pairs.push({id,kind:'pair',a:map.get(x),b:map.get(y)});}else left.push(p);}
        else bad(`${where}: pair “${p.id}” has an unknown type.`);}
      if(left.length===todo.length)bad(`${where}: sequence “${left[0].id}” joins something that is not a pair here.`);
      todo=left;}
    for(const dep of a.dependencies){const k=index.has(dep?.dependent)?'t'+index.get(dep.dependent):map.get(dep?.dependent);
      if(!k||!index.has(dep.head))bad(`${where}: a dependency refers to a unit or head turn that does not exist.`);
      if(k in d.deps)bad(`${where}: “${dep.dependent}” depends on more than one turn.`);
      d.deps[k]=index.get(dep.head);}
    const problem=checkRules(d);if(problem)bad(`${where}: ${problem}`);
    return{label:typeof a.label==='string'?a.label:'',pairs:d.pairs,deps:d.deps,next:d.next};});
  return{id:ID.test(tr.id)?tr.id:null,title:typeof tr.title==='string'&&tr.title.trim()?clip(tr.title.trim(),80):'Opened transcript',
    source:plainSource(tr.source),turns,analyses};}
const SPEC_TYPE={pre:'pre',insF:'insert-post-first',insS:'insert-pre-second',post:'post',dep:'unclassified'};
function toDoc(){const m=meta(store.example),saved=D;D=mine;try{
  const ids=mine.turns.map((t,i)=>t.id||'t'+(i+1)),pid=k=>ids.includes(k)?'pair-'+k:k,unit=k=>isTurn(k)?ids[tIdx(k)]:pid(k);
  return{$schema:SPEC,format:'sequence-annotation',version:'1.0',
    transcript:{id:m.id,title:m.title,...(m.source?{source:m.source}:{}),turns:mine.turns.map((t,i)=>({id:ids[i],speaker:t.speaker,text:t.text}))},
    analyses:[{id:'mine',label:'My analysis',modified:new Date().toISOString(),tool:{name:'LING2150 Sequence builder',version:'1',url:TOOL_URL},
      pairs:mine.pairs.map(p=>({id:pid(p.id),type:p.kind==='turn'?'adjacency':'sequence',parts:p.kind==='turn'?[ids[p.a],ids[p.b]]:[pid(p.a),pid(p.b)]})),
      dependencies:Object.entries(mine.deps).map(([k,t])=>{const c=classify(k);
        return{dependent:unit(k),head:ids[t],type:c.type==='post'&&isTurn(k)?'minimal-post':SPEC_TYPE[c.type]};})}]};
  }finally{D=saved;}}
async function loadClassExamples(){if(location.protocol==='file:')return;try{
  const r=await fetch(EXAMPLE_DIR+'index.json',{cache:'no-cache'});if(!r.ok)return;
  const list=(await r.json())?.examples;if(!Array.isArray(list))return;
  for(const e of list){const file=typeof e==='string'?e:e?.file;
    if(!/^[\w.-]+\.json$/.test(file||'')){console.warn('7C: skipped a class example entry without a plain .json file name.');continue;}
    try{const res=await fetch(EXAMPLE_DIR+file,{cache:'no-cache'});if(!res.ok)throw new Error('HTTP '+res.status);
      const doc=fromDoc(await res.json());
      if(!doc.id||known(doc.id))throw new Error('its transcript needs an id that no other example uses.');
      const a=doc.analyses[0];
      CLASS[doc.id]={title:typeof e?.label==='string'?e.label:doc.title,source:doc.source,turns:doc.turns,key:a?{pairs:a.pairs,deps:a.deps,next:a.next}:null};
    }catch(err){console.warn(`7C: could not load class example ${file}: ${err.message}`);}}
}catch{/* No list (e.g. opened from disk): built-in examples only. */}}
function rebuildMenu(){const own=store.custom?.title;
  $('sx-example').replaceChildren(
    h('optgroup',{label:'Practice transcripts'},Object.entries(EXAMPLES).map(([id,ex])=>h('option',{value:id,text:ex.label}))),
    Object.keys(CLASS).length?h('optgroup',{label:'Class examples'},Object.entries(CLASS).map(([id,c])=>h('option',{value:id,text:c.title}))):null,
    h('optgroup',{label:'Your own'},h('option',{value:'custom',text:own&&own!=='My own transcript'?`My own: ${own}`:'My own transcript'})));
  if(known(store.example))$('sx-example').value=store.example;}

/* ---------- rendering ---------- */
function buildRows(){const list=$('sx-turns');list.replaceChildren();
  D.turns.forEach((t,i)=>list.append(h('li',{class:'sx-turn','data-turn':i},
    h('span',{class:'sx-gutter','aria-hidden':'true'}),
    h('button',{type:'button',class:'sx-dot','data-key':'t'+i,'aria-label':`Turn ${i+1} dot`}),
    h('button',{type:'button',class:'sx-who'},h('span',{class:'sx-num',text:(i+1)+'.'}),h('span',{class:'sx-name',text:t.speaker}),h('span',{class:'sx-tag'})),
    h('div',{class:'sx-say',text:t.text}))));
  if(!D.turns.length)list.append(h('li',{class:'sx-empty',text:'No turns yet.'}));}
function computeLanes(){const left={},right={},order=[],pl=[],pr=[];
  const bySpan=(x,y)=>(x.hi-x.lo)-(y.hi-y.lo)||x.lo-y.lo;
  // Inner (shorter) brackets sit nearest the dots; a sequence is always outside its parts.
  for(const it of D.pairs.map(p=>{const[lo,hi]=span(p.id);return{p,lo,hi};}).sort(bySpan)){
    let lane=it.p.kind==='pair'?Math.max(left[it.p.a],left[it.p.b])+1:0;
    while(pl.some(q=>q.lane===lane&&q.lo<=it.hi&&it.lo<=q.hi))lane++;
    left[it.p.id]=lane;pl.push({lane,lo:it.lo,hi:it.hi});order.push(it.p);}
  for(const it of Object.entries(D.deps).map(([k,t])=>{const[s,e]=span(k);return{k,lo:Math.min(s,t),hi:Math.max(e,t)};}).sort(bySpan)){
    let lane=0;while(pr.some(q=>q.lane===lane&&q.lo<=it.hi&&it.lo<=q.hi))lane++;
    right[it.k]=lane;pr.push({lane,lo:it.lo,hi:it.hi});}
  lanes={left,right,order,L:pl.length?Math.max(...pl.map(q=>q.lane))+1:0,R:pr.length?Math.max(...pr.map(q=>q.lane))+1:0};}
function refreshRows(){const sel=selected&&!isTurn(selected)?span(selected):null;
  [...$('sx-turns').querySelectorAll('.sx-turn')].forEach((li,i)=>{const tag=tagFor(i),el=li.querySelector('.sx-tag');
    el.className='sx-tag'+(tag?` sx-t-${tag.cls||'none'}`:'');el.replaceChildren();
    if(tag){el.append(tag.main);if(tag.sub)el.append(h('sub',{text:tag.sub}));}
    li.classList.toggle('is-selected',selected==='t'+i);
    li.classList.toggle('is-member',!!sel&&i>=sel[0]&&i<=sel[1]);
    li.querySelector('.sx-dot').setAttribute('aria-pressed',String(armed==='t'+i));});}
function draw(){const board=$('sx-board');if(!lanes)return;
  board.style.setProperty('--gl',(lanes.L?lanes.L*LANE_L+12:8)+'px');
  board.style.setProperty('--gr',(lanes.R?lanes.R*LANE_R+20:8)+'px');
  const b=board.getBoundingClientRect(),pos={},rows=[];let rightX=0;
  [...$('sx-turns').querySelectorAll('.sx-turn')].forEach((li,i)=>{const d=li.querySelector('.sx-dot').getBoundingClientRect(),
    r=li.getBoundingClientRect(),say=li.querySelector('.sx-say').getBoundingClientRect();
    pos['t'+i]={x:d.left+d.width/2-b.left,y:d.top+d.height/2-b.top,r:6};
    rows[i]={top:r.top-b.top,bottom:r.bottom-b.top};rightX=Math.max(rightX,say.right-b.left);});
  geo={pos,rightX};
  const dotX=pos.t0?pos.t0.x:0,laneX=n=>dotX-18-n*LANE_L;let svg='';
  for(const p of lanes.order){const x=laneX(lanes.left[p.id]),ka=p.kind==='turn'?'t'+p.a:p.a,kb=p.kind==='turn'?'t'+p.b:p.b,
    A=pos[ka],B=pos[kb],d=`M${A.x-A.r} ${A.y}H${x}V${B.y}H${B.x-B.r}`,cls=`sx-t-${pairType(p)||'none'}`;
    pos[p.id]={x,y:(A.y+B.y)/2,r:6};
    svg+=`<path class="sx-line ${cls}${selected===p.id?' is-selected':''}${p.kind==='pair'?' is-seq':''}" d="${d}"/><path class="sx-hit" data-key="${p.id}" d="${d}"/>`;}
  for(const[k,tgt]of Object.entries(D.deps)){const c=classify(k),cls=`sx-t-${c.type}`,xl=rightX+14+lanes.right[k]*LANE_R,yT=pos['t'+tgt].y;
    let d,y;
    if(isTurn(k)){y=pos[k].y;d=`M${rightX+2} ${y}H${xl}V${yT}H${rightX+9}`;}
    else{const[s,e]=span(k),top=rows[s].top+5,bot=rows[e].bottom-5;y=(top+bot)/2;
      d=`M${rightX+2} ${top}h4V${bot}h-4M${rightX+6} ${y}H${xl}V${yT}H${rightX+9}`;}
    const label={pre:'pre',insF:'ins',insS:'ins',post:isTurn(k)?'SCT':'post',dep:'?'}[c.type],ly=(y+yT)/2;
    svg+=`<g class="${cls}${selected===k?' is-selected':''}"><path class="sx-line" d="${d}"/><path class="sx-arrow" d="M${rightX+2} ${yT}l8 -4.5v9z"/>`+
      `<text class="sx-lbl" x="${xl}" y="${ly}" transform="rotate(-90 ${xl} ${ly})" text-anchor="middle" dy="-4">${label}</text>`+
      `<path class="sx-hit" data-select="${k}" d="${d}"/></g>`;}
  $('sx-svg').innerHTML=svg;
  $('sx-pdots').replaceChildren(...lanes.order.map(p=>h('button',{type:'button',
    class:`sx-pdot sx-t-${pairType(p)||'none'}${selected===p.id?' is-selected':''}`,'data-key':p.id,
    style:`left:${pos[p.id].x}px;top:${pos[p.id].y}px`,'aria-pressed':String(armed===p.id),'aria-label':`${pairLabel(p)} (bracket dot)`})));}
function describeTurn(t){const p=turnPairOf(t),c=classify('t'+t);
  if(p){const type=pairType(p),role=t===p.a?'First pair part (FPP)':'Second pair part (SPP)';
    return`${role} of the adjacency pair in ${unitText(p.id)}`+(type==='base'?', which is a base pair.':type?`, which is part of a ${NAMES[type]}.`:'.');}
  if(c)return`A single turn: ${c.name} of turn ${D.deps['t'+t]+1}.`+(c.warn?' '+c.warn:'');
  return'Not yet part of an adjacency pair or an expansion.';}
function field(id,label,control,hint){return h('div',{class:'field'},h('label',{htmlFor:id,text:label}),control,hint?h('p',{class:'field-hint',text:hint}):null);}
function depSelect(k){const[s,e]=span(k),sel=h('select',{id:'sx-dep',onchange:()=>sel.value===''?clearDep(k):setDep(k,+sel.value)});
  sel.append(h('option',{value:'',text:'Nothing (not an expansion)'}));
  D.turns.forEach((t,i)=>{if(i<s||i>e)sel.append(h('option',{value:String(i),text:`Turn ${i+1}. ${t.speaker}: ${clip(t.text,40)}`}));});
  sel.value=k in D.deps?String(D.deps[k]):'';return sel;}
function renderInspector(){const box=$('sx-inspector'),ro=D!==mine;box.replaceChildren();
  if(!selected){box.append(h('p',{class:'field-hint',text:'Click a turn or a bracket dot to see it here. You can also make and remove pairs and dependencies from this panel with the keyboard.'}));return;}
  if(isTurn(selected)){const t=tIdx(selected),p=turnPairOf(t);
    box.append(h('p',{class:'sx-sel-title',text:`Turn ${t+1} (${D.turns[t].speaker})`}),h('p',{class:'sx-sel-desc',text:describeTurn(t)}));
    if(p){box.append(h('div',{class:'btn-row'},h('button',{type:'button',class:'btn-uga-outline',id:'sx-go',text:'Select its adjacency pair',onclick:()=>{selected=p.id;update();}})));return;}
    if(ro)return;
    const free=D.turns.map((_,i)=>i).filter(i=>i!==t&&!turnPairOf(i));
    if(free.length){const sel=h('select',{id:'sx-with'},free.map(i=>h('option',{value:String(i),text:`Turn ${i+1}. ${D.turns[i].speaker}: ${clip(D.turns[i].text,40)}`})));
      box.append(field('sx-with','Make an adjacency pair with',sel),h('div',{class:'btn-row'},h('button',{type:'button',class:'btn-uga',id:'sx-make',text:'Make adjacency pair',onclick:()=>makeAP(t,+sel.value)})));}
    box.append(field('sx-dep',`Turn ${t+1} depends on`,depSelect(selected),'Choose the base FPP for a pre-expansion or post-first insert, and the base SPP for a pre-second insert or post-expansion.'));
    return;}
  const p=pairById(selected),c=classify(p.id),parent=parentOf(p.id);
  let desc=p.kind==='turn'?`Turn ${p.a+1} is the FPP and turn ${p.b+1} the SPP.`:`Joins ${unitText(p.a)} and ${unitText(p.b)} into one sequence.`;
  if(c)desc+=` It is a ${c.name} of turn ${D.deps[p.id]+1}.`+(c.warn?' '+c.warn:'');
  else if(pairType(p)==='base')desc+=' Other turns expand it, so it is a base pair.';
  box.append(h('p',{class:'sx-sel-title',text:pairLabel(p)}),h('p',{class:'sx-sel-desc',text:desc}));
  if(ro)return;
  box.append(field('sx-dep',`${cap(unitText(p.id))} depend on`,depSelect(p.id)));
  const row=h('div',{class:'btn-row'});
  if(parent)row.append(h('button',{type:'button',class:'btn-uga-outline',id:'sx-go',text:'Select the larger sequence',onclick:()=>{selected=parent.id;update();}}));
  else{const[s,e]=span(p.id),others=D.pairs.filter(q=>q.id!==p.id&&!parentOf(q.id)&&(([a,b])=>b<s||a>e)(span(q.id)));
    if(others.length){const sel=h('select',{id:'sx-join'},others.map(q=>h('option',{value:q.id,text:pairLabel(q)})));
      box.append(field('sx-join','Join with another pair or sequence',sel));
      row.append(h('button',{type:'button',class:'btn-uga',id:'sx-join-btn',text:'Join into a sequence',onclick:()=>makeSeq(p.id,sel.value)}));}}
  row.append(h('button',{type:'button',class:'btn-reset',id:'sx-remove',text:parent?'Remove this bracket (and the larger sequence)':'Remove this bracket',onclick:()=>removePair(p.id)}));
  box.append(row);}
function summaryItems(){const items=[];
  for(const p of D.pairs){const[s,e]=span(p.id),c=classify(p.id),warns=[];
    let text=p.kind==='turn'?`${cap(unitText(p.id))}: adjacency pair (FPP ${p.a+1}, SPP ${p.b+1})`:`${cap(unitText(p.id))}: sequence joining ${unitText(p.a)} and ${unitText(p.b)}`;
    if(c){text+=`; ${c.name} of turn ${D.deps[p.id]+1}`;if(c.warn)warns.push(c.warn);}
    else if(p.kind==='turn'&&isBase(p))text+='; base pair';
    if(p.kind==='turn'&&D.turns[p.a].speaker===D.turns[p.b].speaker)warns.push('Both turns are by the same speaker. Adjacency pairs are normally produced by different speakers.');
    items.push({s,text,warns});}
  for(const[k,tgt]of Object.entries(D.deps))if(isTurn(k)){const c=classify(k);
    items.push({s:tIdx(k),text:`Turn ${tIdx(k)+1}: ${c.name} of turn ${tgt+1}`,warns:c.warn?[c.warn]:[]});}
  return items.sort((x,y)=>x.s-y.s);}
function renderSummary(){const list=$('sx-summary'),items=summaryItems();list.replaceChildren();
  $('sx-summary-title').textContent=keyView?'Suggested analysis':'Your analysis';
  if(!items.length){list.append(h('li',{class:'field-hint',text:'Nothing yet. Drag from one turn’s dot to another’s to make an adjacency pair.'}));return;}
  for(const it of items)list.append(h('li',{},it.text+'.',...it.warns.map(w=>h('span',{class:'sx-warn',text:' '+w}))));}
function update(){const f=document.activeElement,fk=f?.dataset?.key,fid=f?.id;
  computeLanes();refreshRows();draw();renderInspector();renderSummary();
  $('sx-key').hidden=!hasKey(store.example);$('sx-key').textContent=keyView?'Back to my analysis':'Show a suggested analysis';
  $('sx-key-note').hidden=!keyView;$('sx-clear').disabled=keyView;$('sx-board').classList.toggle('is-readonly',keyView);
  if(D===mine)save();
  const back=(fk&&document.querySelector(`#sx-board [data-key="${fk}"]:not(.sx-hit)`))||(fid&&$(fid));
  if(back&&back!==document.activeElement&&f!==document.body)back.focus();}

/* ---------- pointer: drag to join or attach ---------- */
const board=$('sx-board');let drag=null,justDragged=false;
function sourceFrom(el){const dot=el.closest('.sx-dot');if(dot)return{kind:'turnDot',key:dot.dataset.key};
  const pd=el.closest('.sx-pdot, .sx-hit[data-key]');if(pd)return{kind:'pair',key:pd.dataset.key};
  const cell=el.closest('.sx-who, .sx-say');if(cell)return{kind:'turn',key:'t'+cell.closest('.sx-turn').dataset.turn};
  return null;}
function targetAt(x,y){const el=document.elementFromPoint(x,y);if(!el||!board.contains(el))return null;
  const pd=el.closest('.sx-pdot, .sx-hit[data-key]');if(pd)return{kind:'pair',key:pd.dataset.key,el:pd};
  const row=el.closest('.sx-turn');if(row)return{kind:'turn',key:'t'+row.dataset.turn,el:row};
  return null;}
// Dependencies leave from a turn's right edge; brackets start from their dots.
function anchor(src){return src.kind==='turn'?{x:geo.rightX,y:geo.pos[src.key].y}:geo.pos[src.key];}
function markDrop(t){board.querySelectorAll('.is-drop').forEach(el=>el.classList.remove('is-drop'));if(t)t.el.classList.add('is-drop');}
function endDrag(){markDrop(null);$('sx-rubber').setAttribute('d','');document.body.classList.remove('sx-dragging');drag=null;}
board.addEventListener('pointerdown',e=>{if(e.button!==0||D!==mine||!geo)return;const src=sourceFrom(e.target);if(!src)return;
  justDragged=false;drag={src,x0:e.clientX,y0:e.clientY,moved:false};
  if(e.pointerType==='mouse')e.preventDefault();
  try{e.target.setPointerCapture(e.pointerId);}catch{}});
board.addEventListener('pointermove',e=>{if(!drag)return;
  if(!drag.moved){if(Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<6)return;drag.moved=true;document.body.classList.add('sx-dragging');}
  const b=board.getBoundingClientRect(),a=anchor(drag.src);
  $('sx-rubber').setAttribute('d',`M${a.x} ${a.y}L${e.clientX-b.left} ${e.clientY-b.top}`);
  const t=targetAt(e.clientX,e.clientY);markDrop(t&&t.key!==drag.src.key?t:null);});
board.addEventListener('pointerup',e=>{if(!drag)return;const{src,moved}=drag;endDrag();if(!moved)return;
  justDragged=true;armed=null;const t=targetAt(e.clientX,e.clientY);
  if(!t||t.key===src.key){update();return;}
  if(src.kind==='turnDot'){if(t.kind==='turn')makeAP(tIdx(src.key),tIdx(t.key));else say('Join a turn’s dot to another turn’s dot, or a bracket’s dot to another bracket’s dot.');}
  else if(src.kind==='pair'){if(t.kind==='pair')makeSeq(src.key,t.key);else setDep(src.key,tIdx(t.key));}
  else if(t.kind==='turn')setDep(src.key,tIdx(t.key));
  else say('Release a turn on the turn it depends on.');});
board.addEventListener('pointercancel',()=>{if(drag)endDrag();});

/* ---------- click and keyboard ---------- */
board.addEventListener('click',e=>{if(justDragged&&e.detail){justDragged=false;e.preventDefault();return;}
  const dot=e.target.closest('.sx-dot, .sx-pdot');
  if(dot){const k=dot.dataset.key;
    if(D===mine&&armed&&armed!==k&&isTurn(armed)===isTurn(k)){const a=armed;armed=null;join(a,k);return;}
    armed=D===mine&&armed!==k?k:null;selected=k;update();
    if(armed)say(isTurn(k)?`Turn ${tIdx(k)+1} chosen. Choose another turn’s dot to pair them, or press Escape.`:'Bracket chosen. Choose another bracket’s dot to join them into a sequence, or press Escape.');
    return;}
  const hit=e.target.closest('.sx-hit');if(hit){armed=null;selected=hit.dataset.key||hit.dataset.select;update();return;}
  const cell=e.target.closest('.sx-who, .sx-say');if(cell){armed=null;selected='t'+cell.closest('.sx-turn').dataset.turn;update();return;}
  if(armed||selected){armed=null;selected=null;update();}});
// Pointerdown suppresses native focus (to stop text selection), so after a mouse click
// move focus to what is now selected; Delete then acts on what the student clicked.
board.addEventListener('click',e=>{if(!e.detail||!selected)return;
  const el=e.target.closest('.sx-dot, .sx-pdot')||(isTurn(selected)?board.querySelector(`.sx-turn[data-turn="${tIdx(selected)}"] .sx-who`):board.querySelector(`.sx-pdot[data-key="${selected}"]`));
  el?.focus({preventScroll:true});});
board.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&(armed||drag)){if(drag)endDrag();armed=null;say('Cancelled.');update();}});
// Delete/Backspace peels one annotation off the focused (or, after a mouse click, the
// selected) turn or bracket: its dependency first, then the bracket it belongs to.
function deleteAnnotation(k){
  if(isTurn(k)&&!(k in D.deps)){const p=turnPairOf(tIdx(k));if(!p){say(`Turn ${tIdx(k)+1} has no annotation to delete.`);return;}k=p.id;}
  if(k in D.deps){clearDep(k);return;}
  const first=span(k)[0];removePair(k);
  if(!document.activeElement||document.activeElement===document.body)$('sx-turns').querySelector(`[data-key="t${first}"]`)?.focus();}
document.addEventListener('keydown',e=>{
  if((e.key!=='Delete'&&e.key!=='Backspace')||D!==mine||drag)return;
  const t=e.target;if(t.closest('input, textarea, select, [contenteditable]'))return;
  let k=null;
  if(board.contains(t)){const el=t.closest('[data-key], .sx-turn');k=el?el.dataset.key||'t'+el.dataset.turn:selected;}
  else if(t===document.body||t.closest('.sx-lower'))k=selected;
  if(!k)return;
  e.preventDefault();armed=null;deleteAnnotation(k);});

/* ---------- toolbar ---------- */
$('sx-example').addEventListener('change',e=>load(e.target.value));
$('sx-load').addEventListener('click',()=>{const turns=parseTranscript($('sx-paste').value);
  if(turns.length<2){$('sx-paste-error').textContent='Paste at least two turns, one per line, as “Speaker: what they said”.';return;}
  if(turns.length>MAX_TURNS){$('sx-paste-error').textContent=`Use at most ${MAX_TURNS} turns.`;return;}
  const title=clip($('sx-title').value.trim(),80);
  $('sx-paste-error').textContent='';store.custom={id:slug(title)||'my-transcript',title:title||'My own transcript',turns};
  delete store.work.custom;rebuildMenu();load('custom');
  say(`Loaded ${turns.length} turns. Any previous analysis of your own transcript was cleared.`);});
$('sx-key').addEventListener('click',()=>{keyView=!keyView;D=keyView?buildKey(store.example):mine;selected=armed=null;hideConfirm();update();
  say(keyView?'Showing a suggested analysis (read-only).':'Back to your analysis.');});
function hideConfirm(){$('sx-confirm').hidden=true;}
$('sx-clear').addEventListener('click',()=>{$('sx-confirm').hidden=false;$('sx-clear-no').focus();});
$('sx-clear-no').addEventListener('click',()=>{hideConfirm();$('sx-clear').focus();});
$('sx-clear-yes').addEventListener('click',()=>{Object.assign(mine,{pairs:[],deps:{},next:1});selected=armed=null;hideConfirm();update();say('Your analysis of this transcript was cleared.');$('sx-clear').focus();});
function saveFile(text,name,type){
  const url=URL.createObjectURL(new Blob([text],{type})),a=h('a',{href:url,download:name});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('sx-download').addEventListener('click',()=>{const title=meta(store.example).title,saved=D;D=mine;
  const lines=['LING2150: Activity 7C: Sequence Expansion','',`Transcript: ${title}`,''];
  mine.turns.forEach((t,i)=>{const tag=tagFor(i);lines.push(`${String(i+1).padStart(2)}. ${(tag?`[${tag.main}${tag.sub?' '+tag.sub:''}]`:'').padEnd(12)} ${t.speaker}: ${t.text}`);});
  lines.push('','My analysis');const items=summaryItems();
  if(!items.length)lines.push('(nothing marked yet)');
  for(const it of items)lines.push(`- ${it.text}.`+it.warns.map(w=>' '+w).join(''));
  D=saved;
  saveFile(lines.join('\n')+'\n','LING2150-7C-sequence-analysis.txt','text/plain;charset=utf-8');
  $('sx-download-status').textContent='Downloaded.';});
$('sx-json').addEventListener('click',()=>{
  saveFile(JSON.stringify(toDoc(),null,2)+'\n',`${meta(store.example).id}.seqann.json`,'application/json');
  $('sx-download-status').textContent='Downloaded. Open this file here later to carry on, or share it.';});
$('sx-open').addEventListener('click',()=>$('sx-file').click());
$('sx-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;
  const status=$('sx-download-status');let doc;
  try{if(file.size>1e6)throw new Error('That file is too large to be an analysis.');doc=fromDoc(JSON.parse(await file.text()));}
  catch(err){status.textContent=err instanceof SyntaxError?'That file is not valid JSON.':err.message;return;}
  // A file from a transcript that is already here (same id and words) reopens in place,
  // keeping that transcript's suggested analysis; anything else becomes "My own".
  const target=doc.id&&doc.id!=='custom'&&known(doc.id)&&sig(turnsFor(doc.id))===sig(doc.turns)?doc.id:'custom';
  const old=store.work[target];
  if(old?.pairs?.length||Object.keys(old?.deps||{}).length){
    if(!window.confirm(`Replace your current analysis of “${target==='custom'?meta('custom').title:meta(target).title}” with the one in this file?`)){status.textContent='Nothing was changed.';return;}}
  if(target==='custom'){store.custom={id:doc.id||'my-transcript',title:doc.title,source:doc.source,turns:doc.turns};
    $('sx-paste').value=doc.turns.map(t=>`${t.speaker}: ${t.text}`).join('\n');$('sx-title').value=doc.title;}
  const a=doc.analyses[0];
  if(a)store.work[target]={pairs:a.pairs,deps:a.deps,next:a.next,sig:sig(doc.turns)};else delete store.work[target];
  rebuildMenu();load(target);
  status.textContent=`Opened “${meta(target).title}”`+(a?(a.label?` with “${a.label}”`:' with its analysis'):' (no analysis in the file)')+
    (doc.analyses.length>1?`, the first of its ${doc.analyses.length} analyses.`:'.');});

let raf=0;new ResizeObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);}).observe(board);
document.fonts?.ready.then(()=>draw());
if(store.custom){$('sx-paste').value=store.custom.turns.map(t=>`${t.speaker}: ${t.text}`).join('\n');$('sx-title').value=store.custom.title==='My own transcript'?'':store.custom.title;}
// ?example=<id> opens a given transcript, e.g. a class example linked from the course page.
rebuildMenu();
loadClassExamples().finally(()=>{const want=new URLSearchParams(location.search).get('example');
  rebuildMenu();load(want&&known(want)?want:known(store.example)?store.example:'essay');});
})();
