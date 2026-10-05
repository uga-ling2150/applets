(()=>{'use strict';
const API='https://ling2150-10a-closing.ling2150-query-rewrite.workers.dev';
const STORE='ling2150-10a-v1',modes=['continue','close'],labels={continue:'A',close:'B'},$=id=>document.getElementById(id);
const fresh=()=>({started:false,firstMessage:'Thanks, that should do it.',prediction:'',chats:{continue:[],close:[]},drafts:{continue:'',close:''},judgments:{continue:'',close:''},evidence:{continue:'',close:''}});
let state=fresh(),token='',tokenPromise=null;
const runs={continue:null,close:null},cooldown={continue:0,close:0};
try{
  const s=JSON.parse(sessionStorage.getItem(STORE));
  if(s&&typeof s.started==='boolean'&&typeof s.firstMessage==='string'&&s.firstMessage.length<=500&&typeof s.prediction==='string'&&s.prediction.length<=500&&modes.every(m=>Array.isArray(s.chats?.[m])&&s.chats[m].length<=16&&s.chats[m].every((t,i)=>t.role===(i%2?'assistant':'user')&&typeof t.content==='string'&&t.content.length<=1200)&&typeof s.drafts?.[m]==='string'&&s.drafts[m].length<=500&&typeof s.judgments?.[m]==='string'&&typeof s.evidence?.[m]==='string'&&s.evidence[m].length<=700))state=s;
}catch{}
function save(){
  let notice;
  try{sessionStorage.setItem(STORE,JSON.stringify(state));notice='Work saved in this browser tab. Download it before closing.';}
  catch{notice='Browser saving is unavailable. Download your work before leaving.';}
  if($('save-status').textContent!==notice)$('save-status').textContent=notice;
}
function status(mode,message){$(mode+'-status').textContent=message;}
function error(mode,message){$(mode+'-error').textContent=message;}
function controls(mode){
  const turns=state.chats[mode],pending=turns.at(-1)?.role==='user',busy=!!runs[mode],full=turns.length>=16;
  const canSend=state.started&&!pending&&!busy&&!full;
  $(mode+'-input').disabled=!canSend;$(mode+'-send').disabled=!canSend;
  $(mode+'-retry').hidden=!pending||busy;$(mode+'-retry').disabled=Date.now()<cooldown[mode];
  $(mode+'-stop').hidden=!busy;
  $(mode+'-limit').textContent=full?'This conversation has reached its limit. Download your work or begin a new comparison.':`${Math.floor(turns.length/2)} of 8 replies received. Your next message can be up to 500 characters.`;
}
function render(mode){
  const list=$(mode+'-transcript');list.replaceChildren();
  if(!state.chats[mode].length){const li=document.createElement('li');li.className='chat-empty';li.textContent='Your shared ending message will appear here after you send it.';list.append(li);}
  state.chats[mode].forEach((turn,index)=>{
    const user=turn.role==='user',li=document.createElement('li'),who=document.createElement('span'),body=document.createElement('p');
    li.className='chat-turn '+(user?'human':'ai');who.className='chat-turn__speaker';who.textContent=`${index+5}. ${user?'You':'Assistant '+labels[mode]}`;
    body.className='chat-turn__text';body.textContent=turn.content;li.append(who,body);list.append(li);
  });
  list.scrollTop=list.scrollHeight;controls(mode);
}
function paint(){
  $('first-message').value=state.firstMessage;$('first-message').readOnly=state.started;$('start').disabled=state.started;
  $('prediction').value=state.prediction;
  for(const mode of modes){
    $(mode+'-input').value=state.drafts[mode];$(mode+'-judgment').value=state.judgments[mode];$(mode+'-evidence').value=state.evidence[mode];render(mode);
    status(mode,state.chats[mode].at(-1)?.role==='user'?'Reply not completed. You can retry it.':state.chats[mode].length?'Conversation restored. Continue below.':'Ready for your ending message.');
  }
  save();
}
async function getSession(){
  if(token)return token;
  if(!tokenPromise)tokenPromise=(async()=>{
    const response=await fetch(API+'/api/session',{method:'POST',credentials:'omit',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('unavailable');const data=await response.json();if(typeof data.token!=='string')throw Error('unavailable');token=data.token;return token;
  })().finally(()=>{tokenPromise=null;});
  return tokenPromise;
}
const errors={unavailable:'The live service is unavailable. Your work is kept; retry later or use the clearly labelled offline example.',busy:'The classroom service is busy. Wait a few seconds, then retry this reply.',daily_limit:'The shared service allowance has been reached for today. Download your work and use the offline example.',session_limit:'This session has reached its request limit. Download your work and use the offline example.',timeout:'The reply took too long. Your message is kept. Please retry.',model_unavailable:'The model could not return a reply. Your work is kept. Please retry later.',session_expired:'The service session expired. Retry to reconnect.',conversation_limit:'This conversation has reached its length limit. Download your work and start a new comparison.',invalid_input:'This message could not be sent. Download your work and start a new comparison if this persists.'};
async function reply(mode){
  if(runs[mode]||Date.now()<cooldown[mode]||state.chats[mode].at(-1)?.role!=='user')return;
  error(mode,'');const controller=new AbortController();runs[mode]=controller;controls(mode);status(mode,'Waiting for a live reply…');
  const timer=setTimeout(()=>controller.abort('timeout'),30000);
  try{
    const session=await getSession();if(controller.signal.aborted)throw Error('stopped');
    const response=await fetch(API+'/api/chat',{method:'POST',credentials:'omit',signal:controller.signal,headers:{'Content-Type':'application/json','X-Session':session},body:JSON.stringify({mode,turns:state.chats[mode].map(({role,content})=>({role,content}))})});
    const data=await response.json();
    if(!response.ok){if(response.status===401)token='';const delay=Number(response.headers.get('Retry-After'));if(Number.isFinite(delay)&&delay>0){cooldown[mode]=Date.now()+Math.min(delay,60)*1000;setTimeout(()=>controls(mode),Math.min(delay,60)*1000+50);}throw Error(data.error||'unavailable');}
    if(runs[mode]!==controller)return;
    if(typeof data.reply!=='string'||!data.reply.trim()||data.reply.length>1200)throw Error('model_unavailable');
    state.chats[mode].push({role:'assistant',content:data.reply});render(mode);status(mode,'Live reply ready. Compare it with the other assistant.');save();
  }catch(e){if(runs[mode]===controller){error(mode,controller.signal.aborted?(controller.signal.reason==='timeout'?errors.timeout:'Stopped waiting. Your message is kept; retry when ready.'):(errors[e.message]||errors.unavailable));status(mode,'No reply added.');}}
  finally{clearTimeout(timer);if(runs[mode]===controller){runs[mode]=null;controls(mode);save();}}
}
$('first-message').addEventListener('input',()=>{state.firstMessage=$('first-message').value;save();});
$('prediction').addEventListener('input',()=>{state.prediction=$('prediction').value;save();});
$('first-form').addEventListener('submit',event=>{
  event.preventDefault();if(state.started)return;const message=$('first-message').value.trim();
  if(!message){$('setup-error').textContent='Write an ending message first.';$('first-message').focus();return;}
  state.firstMessage=message;state.started=true;$('setup-error').textContent='';
  for(const mode of modes)state.chats[mode]=[{role:'user',content:message}];
  paint();$('compare-title').focus?.();for(const mode of modes)void reply(mode);
});
for(const mode of modes){
  $(mode+'-input').addEventListener('input',()=>{state.drafts[mode]=$(mode+'-input').value;save();});
  $(mode+'-judgment').addEventListener('change',()=>{state.judgments[mode]=$(mode+'-judgment').value;save();});
  $(mode+'-evidence').addEventListener('input',()=>{state.evidence[mode]=$(mode+'-evidence').value;save();});
  $(mode+'-form').addEventListener('submit',event=>{
    event.preventDefault();const message=$(mode+'-input').value.trim(),turns=state.chats[mode];
    if(!state.started||runs[mode]||turns.at(-1)?.role!=='assistant'||turns.length>=16)return;
    if(!message){error(mode,'Write a message first.');$(mode+'-input').focus();return;}
    if(turns.reduce((n,turn)=>n+turn.content.length,0)+message.length>6000){error(mode,errors.conversation_limit);return;}
    turns.push({role:'user',content:message});state.drafts[mode]='';$(mode+'-input').value='';render(mode);save();void reply(mode);
  });
  $(mode+'-retry').addEventListener('click',()=>void reply(mode));
  $(mode+'-stop').addEventListener('click',()=>runs[mode]?.abort('stopped'));
}
$('reset').addEventListener('click',()=>{$('reset-confirm').hidden=false;$('reset-yes').focus();});
$('reset-no').addEventListener('click',()=>{$('reset-confirm').hidden=true;$('reset').focus();});
$('reset-yes').addEventListener('click',()=>{
  for(const mode of modes){runs[mode]?.abort('reset');runs[mode]=null;cooldown[mode]=0;error(mode,'');}
  state=fresh();$('reset-confirm').hidden=true;$('download-status').textContent='';$('setup-error').textContent='';paint();$('first-message').focus();
});
$('download').addEventListener('click',()=>{
  const lines=['LING2150 — Activity 10A: Conversation Opening and Closing','Live conversations (scripted offline example is NOT included)','',
    'Shared opening and middle:',
    '1. You: Help me write a short reminder to my study group about our meeting.',
    '2. Assistant: Sure. When and where is the meeting, and what should everyone bring?',
    '3. You: Thursday at 4 p.m. in the library. Everyone should bring their notes for the linguistics quiz.',
    '4. Assistant: Here is a short reminder: "Hi everyone, our study group meets Thursday at 4 p.m. in the library. Please bring your notes for the linguistics quiz. See you there!"',
    '',`Prediction: ${state.prediction}`];
  for(const mode of modes){
    lines.push('',`ASSISTANT ${labels[mode]} (${mode==='continue'?'engagement-oriented':'task-focused'})`);
    state.chats[mode].forEach((turn,index)=>lines.push(`${index+5}. ${turn.role==='user'?'You':'Assistant '+labels[mode]}: ${turn.content}`));
    if(state.chats[mode].at(-1)?.role==='user')lines.push('[No assistant reply received for the final message.]');
    if(state.drafts[mode])lines.push('Unsent draft: '+state.drafts[mode]);
    lines.push('First-reply judgment: '+state.judgments[mode],'Evidence: '+state.evidence[mode]);
  }
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='LING2150-10A-my-work.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('download-status').textContent='Download requested. Check your browser’s downloads.';
});
paint();
})();
