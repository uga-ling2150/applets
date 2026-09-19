(()=>{'use strict';
const API="https://ling2150-7b-grounding.ling2150-query-rewrite.workers.dev", $=id=>document.getElementById(id), modes=['assume','clarify'], labels={assume:'A',clarify:'B'}, STORE='ling2150-7b-v1';
const examples={interview:'Help me prepare for my interview.',reference:'Alex and Jordan each brought a laptop. Can you help me set it up?',plans:'Help me plan something for Friday.',clear:'Give me three open-ended questions to ask my grandfather about his childhood for an oral-history project. I already have his permission to record.',custom:''};
const fresh=()=>({scenario:'interview',opening:examples.interview,intention:'',reflection:'',started:false,chats:{assume:[],clarify:[]},drafts:{assume:'',clarify:''}});
let state=fresh(),sessionToken='',sessionPromise=null;
const runs={assume:null,clarify:null}, cooldown={assume:0,clarify:0};
try{const s=JSON.parse(sessionStorage.getItem(STORE));
 if(s&&Object.hasOwn(examples,s.scenario)&&typeof s.opening==='string'&&s.opening.length<=500&&typeof s.intention==='string'&&s.intention.length<=500&&typeof s.reflection==='string'&&s.reflection.length<=4000&&modes.every(m=>Array.isArray(s.chats?.[m])&&s.chats[m].length<=20&&s.chats[m].every((t,i)=>t.role===(i%2?'assistant':'user')&&typeof t.content==='string'&&t.content.length<=1200)&&typeof s.drafts?.[m]==='string'&&s.drafts[m].length<=500))state=s;
}catch{}
function save(){let notice;try{sessionStorage.setItem(STORE,JSON.stringify(state));notice='Work saved in this browser tab. Download it before closing.';}catch{notice='Browser saving is unavailable. Download your work before leaving.';}if($('save-status').textContent!==notice)$('save-status').textContent=notice;}
function status(m,t){$(m+'-status').textContent=t;}
function error(m,t){$(m+'-error').textContent=t;}
function controls(m){const t=state.chats[m],pending=t.at(-1)?.role==='user',busy=!!runs[m],full=t.length>=20;
 $(m+'-send').disabled=!state.started||pending||busy||full;
 $(m+'-input').disabled=!state.started||pending||busy||full;
 $(m+'-retry').hidden=!pending||busy;$(m+'-retry').disabled=Date.now()<cooldown[m];$(m+'-stop').hidden=!busy;
 $(m+'-limit').textContent=full?'Comparison limit reached. Download your work, then start a new comparison.':`${Math.floor(t.length/2)} of 10 replies received. Your next message can be up to 500 characters.`;
}
function render(m){const list=$(m+'-transcript');list.replaceChildren();const turns=state.chats[m];
 if(!turns.length){const li=document.createElement('li');li.className='chat-turn';li.textContent='Start both conversations using the opening message above.';list.append(li);}
 turns.forEach((t,i)=>{const li=document.createElement('li');li.className='chat-turn '+t.role;const who=document.createElement('strong');who.textContent=`${i+1}. ${t.role==='user'?'You':'Assistant '+labels[m]}`;const p=document.createElement('p');p.textContent=t.content;li.append(who,p);
 const label=document.createElement('label');label.className='turn-label';label.htmlFor=`${m}-tag-${i}`;label.textContent='Mark this turn (optional)';const sel=document.createElement('select');sel.id=label.htmlFor;
 for(const [v,txt] of [['','No mark'],['assumption','Unconfirmed assumption'],['clarification','Request for clarification'],['correction','Correction / repair'],['answer','Useful answer'],['other','Other / uncertain']]){const o=document.createElement('option');o.value=v;o.textContent=txt;sel.append(o);}sel.value=t.tag||'';sel.addEventListener('change',()=>{t.tag=sel.value;save();});li.append(label,sel);list.append(li);
 });list.scrollTop=list.scrollHeight;controls(m);
}
function paint(){for(const k of ['scenario','opening','intention','reflection'])$(k).value=state[k];$('scenario').disabled=state.started;$('opening').readOnly=state.started;$('start').disabled=state.started;
 for(const m of modes){$(m+'-input').value=state.drafts[m];render(m);status(m,state.chats[m].at(-1)?.role==='user'?'Reply not completed. You can retry it.':state.chats[m].length?'Conversation restored. Continue below.':'Ready for your opening message.');}save();}
async function getSession(signal){
 if(sessionToken)return sessionToken;
 // Shared promise keeps A and B in the same classroom session.
 if(!sessionPromise)sessionPromise=(async()=>{const r=await fetch(API+'/api/session',{method:'POST',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('unavailable');const d=await r.json();if(typeof d.token!=='string')throw Error('unavailable');sessionToken=d.token;return sessionToken;})().finally(()=>{sessionPromise=null;});
 return sessionPromise;
}
const errors={unavailable:'The live service is unavailable. Your work is kept; retry later or use the clearly labelled offline example.',busy:'The classroom service is busy. Wait a few seconds, then retry this reply.',daily_limit:'The shared service allowance has been reached for today. Save your work and use the offline discussion example.',session_limit:'This session has reached its request limit. Save your work and continue with the offline example.',timeout:'The reply took too long. Your message is kept. You can retry this side.',model_unavailable:'The model could not return a reply. Your work is kept. Please retry later.',session_expired:'The service session expired. Retry to reconnect.',conversation_limit:'This conversation has reached its length limit. Download your work and start a new comparison.',invalid_input:'This message could not be sent. Download your work and start a new comparison if the problem persists.'};
async function reply(m){if(runs[m]||Date.now()<cooldown[m]||state.chats[m].at(-1)?.role!=='user')return;
 error(m,'');if(!API){error(m,errors.unavailable);controls(m);return;}
 const c=new AbortController();runs[m]=c;controls(m);status(m,'Waiting for a live reply… You can still read the other conversation.');
 const timer=setTimeout(()=>c.abort('timeout'),30000);
 try{const token=await getSession(c.signal);if(c.signal.aborted)throw Error('stopped');
 const r=await fetch(API+'/api/chat',{method:'POST',credentials:'omit',signal:c.signal,headers:{'Content-Type':'application/json','X-Session':token},body:JSON.stringify({mode:m,turns:state.chats[m].map(({role,content})=>({role,content}))})});
 const d=await r.json();if(!r.ok){if(r.status===401)sessionToken='';const delay=Number(r.headers.get('Retry-After'));if(Number.isFinite(delay)&&delay>0){cooldown[m]=Date.now()+Math.min(delay,60)*1000;setTimeout(()=>controls(m),Math.min(delay,60)*1000+50);}throw Error(d.error||'unavailable');}
 if(runs[m]!==c)return;
 if(typeof d.reply!=='string'||!d.reply.trim()||d.reply.length>1200)throw Error('model_unavailable');
 state.chats[m].push({role:'assistant',content:d.reply,tag:''});render(m);status(m,'Live reply ready. Read it, then continue below.');save();
 }catch(e){if(runs[m]===c){error(m,c.signal.aborted?(c.signal.reason==='timeout'?errors.timeout:'Stopped waiting. Your message is kept; retry when ready.'):(errors[e.message]||errors.unavailable));status(m,'No reply added.');}}
 finally{clearTimeout(timer);if(runs[m]===c){runs[m]=null;controls(m);save();}}
}
$('scenario').addEventListener('change',()=>{state.scenario=$('scenario').value;state.opening=examples[state.scenario];$('opening').value=state.opening;save();});
for(const k of ['opening','intention','reflection'])$(k).addEventListener('input',()=>{state[k]=$(k).value;save();});
$('opening-form').addEventListener('submit',e=>{e.preventDefault();if(state.started)return;const text=$('opening').value.trim();if(!text){$('setup-error').textContent='Write an opening message first.';$('opening').focus();return;}
 state.opening=text;state.started=true;$('setup-error').textContent='';for(const m of modes)state.chats[m]=[{role:'user',content:text,tag:''}];paint();for(const m of modes)void reply(m);
});
for(const m of modes){$(m+'-input').addEventListener('input',()=>{state.drafts[m]=$(m+'-input').value;save();});
 $(m+'-form').addEventListener('submit',e=>{e.preventDefault();const text=$(m+'-input').value.trim(),t=state.chats[m];if(!state.started||runs[m]||t.at(-1)?.role!=='assistant'||t.length>=20)return;if(!text){error(m,'Write a message first.');return;}
 if(t.reduce((n,x)=>n+x.content.length,0)+text.length>6000){error(m,errors.conversation_limit);return;}
 t.push({role:'user',content:text,tag:''});state.drafts[m]='';$(m+'-input').value='';render(m);save();void reply(m);
 });
 $(m+'-retry').addEventListener('click',()=>void reply(m));$(m+'-stop').addEventListener('click',()=>runs[m]?.abort('stopped'));
}
$('reset').addEventListener('click',()=>{$('reset-confirm').hidden=false;$('reset-yes').focus();});$('reset-no').addEventListener('click',()=>{$('reset-confirm').hidden=true;$('reset').focus();});
$('reset-yes').addEventListener('click',()=>{for(const m of modes){runs[m]?.abort('reset');runs[m]=null;cooldown[m]=0;error(m,'');}state=fresh();$('reset-confirm').hidden=true;$('download-status').textContent='';$('setup-error').textContent='';paint();$('opening').focus();});
$('download').addEventListener('click',()=>{const lines=['LING2150 — Activity 7B: Presumptive Grounding','Live conversations (scripted offline example is NOT included)','',`Scenario: ${state.scenario}`,`Private intention: ${state.intention}`];for(const m of modes){lines.push('',`ASSISTANT ${labels[m]} (${m==='assume'?'presumptive':'clarification-oriented'})`);state.chats[m].forEach((t,i)=>lines.push(`${i+1}. ${t.role==='user'?'You':'Assistant '+labels[m]}: ${t.content}`,t.tag?`Annotation: ${t.tag}`:''));if(state.chats[m].at(-1)?.role==='user')lines.push('[No assistant reply received for the final message.]');if(state.drafts[m])lines.push('Unsent draft: '+state.drafts[m]);}lines.push('','Reflection:',state.reflection);const u=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='LING2150-7B-my-work.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);$('download-status').textContent='Download requested. Check your browser’s downloads.';});
paint();
})();
