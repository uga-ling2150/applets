(() => {
  'use strict';
  const $=id=>document.getElementById(id), NAME='LING2150 5C: Explicature and query rewriting', STORE='ling2150-5c-v1';
  const example=[{role:'human',text:'I’m choosing between the red backpack and the blue backpack.'},{role:'ai',text:'Which backpack would you prefer?'},{role:'human',text:'The blue one.'},{role:'ai',text:'Would you like to collect the blue backpack on Friday or Saturday?'},{role:'human',text:'On Saturday, please.'},{role:'ai',text:'What else would you like to know about the blue backpack?'},{role:'human',text:'Does it have a laptop compartment?'}];
  const fresh=()=>({turns:structuredClone(example),work:{},current:0,overall:''});
  let state=fresh(), pending=null, replacement=null, token='', busy=false;
  try{const saved=JSON.parse(sessionStorage.getItem(STORE));if(saved&&Array.isArray(saved.turns)&&saved.turns.length<=16&&saved.turns.every(t=>['human','ai'].includes(t.role)&&typeof t.text==='string'&&t.text.length<=500)&&saved.work&&typeof saved.work==='object'){state=saved;}}catch{}
  const api=String(window.QUERY_REWRITE_CONFIG?.apiBase||'').replace(/\/$/,'');
  const feedback=new URL($('feedback-link').href);feedback.searchParams.set('title',`[Applet feedback] ${NAME}`);feedback.searchParams.set('applet',NAME);feedback.searchParams.set('source-url',location.href.split('#')[0]);$('feedback-link').href=feedback.href;
  function save(){try{sessionStorage.setItem(STORE,JSON.stringify(state));$('save-status').textContent='Saved in this browser tab.';}catch{$('save-status').textContent='Browser saving is unavailable. Download your work before leaving.';}}
  function current(){return state.work[state.current] ||= {mine:'',submitted:'',model:'',modelId:'',judgment:'',reason:'',done:false};}
  function announce(text){$('request-status').textContent=text;}
  function stop(){if(pending)pending.abort();pending=null;busy=false;$('compare').disabled=false;$('my-rewrite').readOnly=false;$('keep-original').disabled=false;}
  function invalidate(index){stop();for(const key of Object.keys(state.work))if(Number(key)>=index)delete state.work[key];$('practice').hidden=true;save();}
  function editor(){
    $('turns').replaceChildren();
    state.turns.forEach((turn,i)=>{
      const field=document.createElement('fieldset');field.className='turn';
      const legend=document.createElement('legend');legend.textContent=`Turn ${i+1}`;field.append(legend);
      const bar=document.createElement('div');bar.className='toolbar';
      const label=document.createElement('label');label.htmlFor=`speaker-${i}`;label.textContent='Speaker';
      const select=document.createElement('select');select.id=label.htmlFor;select.setAttribute('aria-label',`Speaker for turn ${i+1}`);
      for(const role of ['human','ai']){const o=document.createElement('option');o.value=role;o.textContent=role==='human'?'Human':'AI';select.append(o);}select.value=turn.role;
      select.addEventListener('change',()=>{turn.role=select.value;invalidate(i);});
      const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='Remove turn';remove.setAttribute('aria-label',`Remove turn ${i+1}`);remove.disabled=state.turns.length<=1;
      remove.addEventListener('click',()=>{state.turns.splice(i,1);invalidate(i);editor();$(`utterance-${Math.min(i,state.turns.length-1)}`).focus();});
      bar.append(label,select,remove);field.append(bar);
      const tl=document.createElement('label');tl.htmlFor=`utterance-${i}`;tl.textContent='Utterance';
      const textarea=document.createElement('textarea');textarea.id=tl.htmlFor;textarea.rows=2;textarea.maxLength=500;textarea.value=turn.text;textarea.setAttribute('aria-label',`Utterance for turn ${i+1}`);
      textarea.addEventListener('input',()=>{turn.text=textarea.value;invalidate(i);count();});field.append(tl,textarea);$('turns').append(field);
    });count();
  }
  function count(){$('turn-count').textContent=`${state.turns.length}/16 turns · ${state.turns.reduce((n,t)=>n+t.text.length,0)}/4,500 characters`;$('add-turn').disabled=state.turns.length>=16;}
  function humans(){return state.turns.map((t,i)=>t.role==='human'?i:-1).filter(i=>i>=0);}
  function renderPractice(focus=false){
    const ids=humans();if(!ids.length)return; if(!ids.includes(Number(state.current)))state.current=ids[0];state.current=Number(state.current);
    const w=current();$('editor-panel').open=false;$('practice').hidden=false;$('human-turn').replaceChildren();
    ids.forEach(i=>{const o=document.createElement('option');o.value=i;o.textContent=`Turn ${i+1}${state.work[i]?.done?' · reflected':''}`;$('human-turn').append(o);});$('human-turn').value=state.current;
    $('progress').textContent=`${ids.filter(i=>state.work[i]?.done).length}/${ids.length} reflections saved`;
    $('context').replaceChildren();state.turns.slice(0,state.current+1).forEach(t=>{const li=document.createElement('li');const strong=document.createElement('strong');strong.textContent=t.role==='human'?'Human: ':'AI: ';li.append(strong,document.createTextNode(t.text));$('context').append(li);});
    $('original').textContent=state.turns[state.current].text;$('my-rewrite').value=w.mine||'';$('comparison').hidden=!w.model;$('submitted-rewrite').textContent=w.submitted||'';$('model-rewrite').textContent=w.model||'';$('model-name').textContent=w.modelId?`Generated by ${w.modelId.replace('@cf/meta/','')}.`:'';
    $('judgment').value=w.judgment||'';$('reason').value=w.reason||'';$('request-error').textContent='';announce('');$('compare').textContent=w.model?'Show saved comparison':'Show model rewrite';
    $('service-notice').hidden=!!api;$('service-notice').textContent='Model comparison is not available yet. You can write your rewrites and download your work.';
    if(focus)$('practice-title').focus();save();
  }
  function validateEditor(){
    const bad=state.turns.findIndex(t=>!t.text.trim());if(bad>=0){$('editor-error').textContent=`Enter an utterance for turn ${bad+1}, or remove that turn.`;$(`utterance-${bad}`).focus();return false;}
    if(state.turns.reduce((n,t)=>n+t.text.length,0)>4500){$('editor-error').textContent='Shorten the conversation to 4,500 characters or fewer.';return false;}
    if(!humans().length){$('editor-error').textContent='Choose Human as the speaker for at least one turn.';$('speaker-0').focus();return false;}
    $('editor-error').textContent='';return true;
  }
  async function session(signal){if(token)return token;const res=await fetch(`${api}/session`,{method:'POST',signal,credentials:'omit'});if(!res.ok)throw new Error('unavailable');const d=await res.json();if(typeof d.token!=='string')throw new Error('unavailable');token=d.token;return token;}
  const errors={unavailable:'The model service is unavailable. Your work is saved; please try again later.',session_expired:'Your connection expired. Please try again.',daily_limit:'The model service has reached today’s capacity. Your work is saved. You can download it and return later.',session_limit:'You have reached today’s rewrite limit for this session. Your work is saved.',busy:'The model is handling other requests. Your work is saved; please try again shortly.',timeout:'The model took too long to respond. Your work is saved; please try again.',model_unavailable:'The model could not return a usable rewrite. Your work is saved; please try again.'};
  $('compare').addEventListener('click',async()=>{
    if(busy)return;const w=current();w.mine=$('my-rewrite').value;$('request-error').textContent='';
    if(!w.mine.trim()){$('request-error').textContent='Write your own rewrite first, or choose “Use original unchanged”.';$('my-rewrite').focus();return;}
    if(w.model){$('comparison').hidden=false;$('comparison-heading').focus();return;}
    if(!api){$('request-error').textContent=errors.unavailable;return;}
    const selected=state.current, controller=new AbortController();pending=controller;busy=true;$('compare').disabled=true;$('my-rewrite').readOnly=true;$('keep-original').disabled=true;announce('Generating the model’s rewrite…');save();
    const timeout=setTimeout(()=>controller.abort('timeout'),30000);
    try{
      const t=await session(controller.signal);const res=await fetch(`${api}/rewrite`,{method:'POST',credentials:'omit',signal:controller.signal,headers:{'Content-Type':'application/json','X-Session':t},body:JSON.stringify({turns:state.turns.slice(0,selected+1)})});
      const data=await res.json();if(!res.ok){if(res.status===401)token='';throw new Error(data.error||'unavailable');}
      if(typeof data.rewrite!=='string'||!data.rewrite.trim()||data.rewrite.length>1600||typeof data.model!=='string')throw new Error('model_unavailable');
      if(pending!==controller||state.current!==selected)return;
      w.submitted=w.mine;w.model=data.rewrite;w.modelId=data.model;renderPractice();announce('Model rewrite ready. Compare both interpretations.');$('comparison-heading').focus();
    }catch(e){if(pending===controller){$('request-error').textContent=errors[controller.signal.reason==='timeout'?'timeout':e.message]||errors.unavailable;announce('');}}
    finally{clearTimeout(timeout);if(pending===controller){stop();save();}}
  });
  $('start-practice').addEventListener('click',()=>{if(validateEditor()){stop();renderPractice(true);}});
  $('human-turn').addEventListener('change',()=>{stop();state.current=Number($('human-turn').value);renderPractice();$('my-rewrite').focus();});
  $('my-rewrite').addEventListener('input',()=>{current().mine=$('my-rewrite').value;save();});
  $('keep-original').addEventListener('click',()=>{current().mine=state.turns[state.current].text;$('my-rewrite').value=current().mine;save();$('my-rewrite').focus();});
  $('judgment').addEventListener('change',()=>{current().judgment=$('judgment').value;current().done=false;save();});
  $('reason').addEventListener('input',()=>{current().reason=$('reason').value;current().done=false;save();});
  $('save-reflection').addEventListener('click',()=>{const w=current();if(!w.judgment){$('request-error').textContent='Choose a judgment before continuing.';$('judgment').focus();return;}if(!w.reason.trim()){$('request-error').textContent='Explain your judgment before continuing.';$('reason').focus();return;}w.done=true;const ids=humans(), next=ids.find(i=>i>state.current&&!state.work[i]?.done);if(next!==undefined){state.current=next;renderPractice(true);}else{renderPractice();announce('Reflection saved. Review another turn, or write your takeaway and download your work.');$('overall-reflection').focus();}save();});
  $('add-turn').addEventListener('click',()=>{if(state.turns.length>=16)return;const i=state.turns.length;state.turns.push({role:state.turns.at(-1)?.role==='human'?'ai':'human',text:''});invalidate(i);editor();$(`utterance-${i}`).focus();});
  function askReplace(kind){replacement=kind;$('replace-confirm').hidden=false;$('confirm-replace').focus();}
  $('load-example').addEventListener('click',()=>askReplace('example'));$('start-blank').addEventListener('click',()=>askReplace('blank'));
  $('cancel-replace').addEventListener('click',()=>{$('replace-confirm').hidden=true;$(replacement==='blank'?'start-blank':'load-example').focus();});
  $('confirm-replace').addEventListener('click',()=>{stop();state=fresh();if(replacement==='blank')state.turns=[{role:'human',text:''},{role:'ai',text:''}];$('practice').hidden=true;$('replace-confirm').hidden=true;$('overall-reflection').value='';$('editor-error').textContent='';editor();save();$('utterance-0').focus();});
  $('overall-reflection').value=state.overall||'';$('overall-reflection').addEventListener('input',()=>{state.overall=$('overall-reflection').value;save();});
  $('download-work').addEventListener('click',()=>{let text=`${NAME}\n\nConversation\n`;state.turns.forEach((t,i)=>{text+=`\n${i+1}. ${t.role.toUpperCase()}: ${t.text}\n`;});for(const i of humans()){const w=state.work[i];if(!w)continue;text+=`\n--- Human turn ${i+1} ---\nMy current rewrite: ${w.mine||''}\nMy rewrite at reveal: ${w.submitted||''}\nModel rewrite: ${w.model||'(not generated)'}\nModel: ${w.modelId||''}\nJudgment: ${w.judgment||''}\nReason: ${w.reason||''}\n`;}text+=`\nTakeaway: ${state.overall||''}\n`;const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='LING2150-5C-my-work.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  editor();save();
})();
