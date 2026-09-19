(function(){
'use strict';
const $=id=>document.getElementById(id),app=window.BC_APP;
const API='https://ling2150-7a-classroom.ling2150-query-rewrite.workers.dev';
const c=window.BC_CLASSROOM={mode:'offline',room:null,initializing:false};
let teacherRooms=[];
let session='',participantKey='',pending=null,poll=null,requestBusy=false,sent=new Set(),outbox=[],syncing=false,submitting=false,logBlocked=false,releaseLock=null;
try{session=sessionStorage.getItem('7a-teacher-session')||'';}catch{}
const base=location.protocol==='file:'?'https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html':location.origin+location.pathname;
const selectedClip=()=>window.BC_CLIPS[Number(new URLSearchParams(location.search).get('recording'))===1?1:0];
const address=(room,teacher=false)=>{if(location.protocol!=='file:')history.replaceState(null,'',base+(room?(teacher?'#teacher-room=':'?room=')+room:''));};
$('class-leave').href=location.protocol==='file:'?location.pathname:base;
const message=t=>{$('class-message').textContent=t;};const fail=t=>{$('class-error').textContent=t;$('class-leave').hidden=!t;};
const panel=()=>{$('activity-panel').hidden=false;$('reflection-panel').hidden=false;};
$('activity-panel').hidden=false;c.initializing=true;app.controls();
function stored(key){try{return localStorage.getItem(key)||'';}catch{return '';}}
function store(key,value){try{localStorage.setItem(key,value);}catch{c.storageUnavailable=true;message('Browser saving is unavailable. Keep this tab open until your round is submitted.');}}
function saveSession(value){session=value;try{if(value)sessionStorage.setItem('7a-teacher-session',value);else sessionStorage.removeItem('7a-teacher-session');}catch{}}
function clearTeacher(){
 saveSession('');clearInterval(poll);c.initializing=true;c.closed=true;app.clearView();
 $('class-teacher').hidden=true;$('teacher-dashboard').hidden=true;$('teacher-login').hidden=false;$('teacher-panel').open=true;
 $('teacher-rooms').replaceChildren();$('teacher-attempts').replaceChildren();$('teacher-identity').textContent='';$('teacher-current').textContent='';$('class-summary').textContent='';$('class-retention').textContent='';
 app.controls();
}
window.addEventListener('storage',e=>{if(e.key==='7a-teacher-signout'&&session){clearTeacher();fail('Teacher signed out. Sign in again or reload to continue as a student.');}});
async function api(path,method='GET',data=null,teacher=false,keepalive=false){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
 try{const headers={'Content-Type':'application/json'};if(teacher&&session)headers.Authorization='Bearer '+session;if(participantKey&&!teacher)headers['X-Participant-Key']=participantKey;
 const r=await fetch(API+path,{method,headers,body:data?JSON.stringify(data):undefined,signal:ac.signal,keepalive,cache:'no-store',referrerPolicy:'no-referrer'});const d=await r.json();if(!r.ok){if(r.status===401&&teacher){clearTeacher();}const error=Error(d.error||'Please try again.');error.status=r.status;throw error;}return d;
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('Connection interrupted. Your local work is kept. Please try again.');throw e;}finally{clearTimeout(timer);}}
function saveOutbox(){store('7a-events:'+c.identityNamespace,JSON.stringify(outbox));}
function action(detail){if(c.readOnly||c.mode!=='student'||!participantKey||c.initializing)return;const event={id:crypto.randomUUID(),type:detail.type,at:new Date().toISOString(),position:detail.position??null};outbox.push({attemptId:detail.attemptId??null,event});saveOutbox();if(detail.type==='start'||detail.type==='complete'||detail.type==='page_leave'||outbox.length>=10)flushEvents(detail.type==='page_leave');}
async function flushEvents(keepalive=false){if(logBlocked||c.readOnly||syncing||!outbox.length||c.mode!=='student'||!participantKey)return;syncing=true;const attemptId=outbox[0].attemptId,batch=outbox.filter(x=>x.attemptId===attemptId).slice(0,40),ids=new Set(batch.map(x=>x.event.id));try{await api(path('/events'),'POST',{attemptId,events:batch.map(x=>x.event)},false,keepalive);outbox=outbox.filter(x=>!ids.has(x.event.id));saveOutbox();$('class-audit-status').textContent=outbox.length?'Saving activity history…':'Activity history synced.';$('class-log-retry').hidden=true;}catch(e){logBlocked=[400,401,404,409,429].includes(e.status);$('class-audit-status').textContent=logBlocked?e.message+' Unsynced actions remain on this browser.':'Activity history is waiting to sync. Keep this browser data until it is synced.';$('class-log-retry').hidden=false;}finally{syncing=false;}}
window.addEventListener('bc-action',e=>action(e.detail));window.addEventListener('online',()=>{flushEvents();flushSubmissions();});setInterval(()=>flushEvents(),5000);
function downloadHistory(name,rows){const encode=x=>'"'+String(x??'').replace(/"/g,'""')+'"';const text=rows.map(row=>row.map(encode).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function historyData(kind){const d=await api(path('/audit'),'GET',null,true);$('teacher-attempts').replaceChildren();for(const a of d.attempts){const tr=document.createElement('tr');for(const value of [`P${a.participant} · A${a.attempt}`,({in_progress:'In progress',complete:'Submitted',discarded:'Discarded'})[a.status]||a.status,a.submittedAt?new Date(a.submittedAt).toLocaleString():'—',a.inComparison?'Yes':'No']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('teacher-attempts').append(tr);}
 if(kind==='attempts'){const rows=[['activity','participant','attempt','record_id','status','first_received_utc','submitted_utc','marker_seconds','prior_listening_transcript_or_comparison_exposed','in_class_comparison']];for(const a of d.attempts)for(const t of a.marks.length?a.marks:[''])rows.push([c.room,a.participant,a.attempt,a.id,a.status,a.receivedAt,a.submittedAt,t,a.exposed??'',a.inComparison]);downloadHistory('7A-'+c.room+'-all-attempts.csv',rows);}
 if(kind==='events'){const rows=[['activity','participant','attempt','event','client_reported_utc','server_received_utc','audio_seconds','event_id']];for(const {a,e} of [...d.activity,...d.attempts].flatMap(a=>a.events.map(e=>({a,e}))).sort((x,y)=>x.e.receivedAt.localeCompare(y.e.receivedAt)||x.e.clientAt.localeCompare(y.e.clientAt)))rows.push([c.room,a.participant,a.attempt,e.type,e.clientAt,e.receivedAt,e.position,e.id]);downloadHistory('7A-'+c.room+'-activity-log.csv',rows);}
 return d;
}
$('class-log-retry').onclick=()=>{logBlocked=false;flushEvents();};$('teacher-all-csv').onclick=()=>historyData('attempts').catch(e=>fail(e.message));$('teacher-events-csv').onclick=()=>historyData('events').catch(e=>fail(e.message));$('teacher-history-refresh').onclick=()=>historyData().catch(e=>fail(e.message));
const path=s=>`/api/rooms/${c.room}${s||''}`;
function summary(d){c.closed=!d.open;c.released=d.released;$('class-summary').textContent=`${d.joined} browsers joined · ${d.submitted} have submitted · ${d.totalSubmissions??d.submitted} total attempts${d.released?' · Comparison shared':!d.open?' · Closed':''}`;$('class-retention').textContent=c.mode==='teacher'?`Download by ${new Date(d.expiresAt).toLocaleDateString()}.`:'';$('class-view').disabled=!d.released||app.snapshot().active;$('class-results').disabled=!d.submitted;$('class-release').disabled=!d.submitted||d.released;$('class-close').disabled=!d.open;$('class-reopen').disabled=d.open;app.controls();}
async function results(){if(app.snapshot().active){fail('Finish or discard your round first.');return;}if(requestBusy)return;requestBusy=true;c.loading=true;app.controls();try{const d=await api(path('/results'),'GET',null,c.mode==='teacher');summary(d);panel();app.compare(d.runs);if(c.mode==='teacher')await historyData();message(c.mode==='teacher'?'Class results updated.':'Class results loaded.');fail('');}catch(e){fail(e.message);}finally{requestBusy=false;c.loading=false;app.controls();}}
async function submit(run){if(c.readOnly||c.mode!=='student'||sent.has(run.id))return;pending=run;c.submitting=true;app.controls();$('class-retry').hidden=true;$('class-submission').textContent='Submitting this attempt…';
 try{const d=await api(path('/submit'),'POST',{run});sent.add(run.id);c.submitted=true;pending=null;app.status('Attempt submitted successfully.');$('class-submission').textContent='Submitted. Your clicks are saved. See My records for your receipt.';$('class-receipts').value+=('\n'+c.room+' · P'+d.participant+' · A'+d.attempt+' · '+(d.submittedAt?new Date(d.submittedAt).toLocaleString():'time unavailable'));fail('');await refresh();}catch(e){$('class-submission').textContent='This attempt has not submitted yet. Your local work is kept.';$('class-retry').hidden=false;fail(e.message);throw e;}finally{c.submitting=false;app.controls();}}
async function flushSubmissions(){if(c.readOnly||submitting||c.mode!=='student')return;submitting=true;try{for(const run of app.snapshot().runs){if(!sent.has(run.id))await submit(run);}}catch{}finally{submitting=false;}}
async function refresh(){if(!c.room||c.initializing||document.hidden)return;try{if(c.mode==='teacher')await api('/api/teacher/session','GET',null,true);summary(await api(path()));}catch(e){message(e.message);}}
async function enter(room,teacher=false,initial=false){
 if(!/^[A-Z2-9]{8}$/.test(room))throw Error('The activity could not be opened. Please refresh.');
 if(!initial&&(app.snapshot().active||syncing||submitting||outbox.length))throw Error('Finish or discard your current round first.');
 if(teacher&&!session){$('teacher-panel').open=true;fail('Sign in with GitHub to manage this activity.');return;}
 c.room=room;c.mode=teacher?'teacher':'student';c.initializing=true;c.submitted=false;c.completed=false;app.controls();$('class-home').hidden=true;$('class-active').hidden=false;$('class-teacher').hidden=true;$('class-student').hidden=true;$('teacher-panel').hidden=false;document.body.classList.toggle('teacher-mode',teacher);document.body.classList.add('class-mode');message('Opening activity…');fail('');
 try{
 let d=await api(path(teacher?'/results':''),'GET',null,teacher);
 if(!teacher){
  participantKey=stored('7a-participant:'+room);const existing=!!participantKey;
  if(!participantKey){participantKey=crypto.randomUUID()+crypto.randomUUID();store('7a-participant:'+room,participantKey);}
  c.identityNamespace=room+':'+participantKey;
  if(existing&&!stored('7a-migrated:'+room)){const old='ling2150-7a:'+room+':'+d.clipId,next='ling2150-7a:'+c.identityNamespace+':'+d.clipId;if(!stored(next)&&stored(old))store(next,stored(old));if(stored('7a-events:'+room))store('7a-events:'+c.identityNamespace,stored('7a-events:'+room));store('7a-migrated:'+room,'1');}
  if(navigator.locks){const acquired=await new Promise(resolve=>{navigator.locks.request('7a-room:'+room,{ifAvailable:true},lock=>{resolve(!!lock);return lock?new Promise(done=>{releaseLock=done;}):undefined;}).catch(()=>resolve(false));});c.readOnly=!acquired;}else c.readOnly=true;
 }
 app.select(d.clipId);
 if(teacher){$('class-teacher').hidden=false;$('teacher-panel').open=true;$('recording-choice').after($('teacher-panel'));$('teacher-summary-slot').append($('class-summary'),$('class-retention'));$('applet-title').textContent='Class results';renderTeacherRooms();summary(d);if(d.runs.length){panel();app.compare(d.runs);}await historyData();message(d.runs.length?'':'No submissions yet for this recording. Use View / refresh results after students finish.');}
 else{
  panel();$('class-student').hidden=false;
  try{d=await api(path('/join'),'POST',{key:participantKey});c.participant=d.participant;c.submitted=d.submittedByYou;}catch(e){if(!d.released)throw e;}
  summary(d);sent=new Set(d.completedAttemptIds||[]);if(d.submittedByYou&&d.legacyFirst&&app.snapshot().runs.length)sent.add(app.snapshot().runs[0].id);try{outbox=JSON.parse(stored('7a-events:'+c.identityNamespace)||'[]');if(!Array.isArray(outbox))outbox=[];}catch{outbox=[];}const last=app.last();c.completed=c.submitted||!!last;
  $('class-submission').textContent=c.participant?`Your number: P${c.participant}. `+(c.closed?'Submissions are closed.':c.submitted?'Your previous submissions are saved.':'Your clicks will submit when the recording ends.'):'Visitor view: the class comparison is available; no participant record was created.';
 $('class-receipts').value=(d.receipts||[]).sort((a,b)=>a.attempt-b.attempt).map(r=>`${room} · P${c.participant} · A${r.attempt} · ${new Date(r.submittedAt).toLocaleString()}`).join('\n');
 if(c.storageUnavailable)$('class-submission').textContent+=' Browser saving is unavailable: refreshing may create a new participant and lose unsynced work.';
 if(c.readOnly)fail('This activity is open in another tab, or this browser cannot protect simultaneous edits. Use one tab for recording; close the other tab and refresh.');message('');
  c.initializing=false;if(c.participant)action({type:performance.getEntriesByType('navigation')[0]?.type==='reload'?'page_reload':'page_open',attemptId:app.snapshot().attemptId,position:null});if(c.participant)flushEvents();if(last&&!d.released)await flushSubmissions();
 }
 c.initializing=false;document.body.classList.remove('bc-loading');app.controls();clearInterval(poll);poll=setInterval(refresh,10000);
 }catch(e){c.initializing=false;c.closed=true;app.controls();message('Use Return to start to try again.');throw e;}
}
function renderTeacherRooms(){
 const current=teacherRooms.find(r=>r.code===c.room),clipId=app.snapshot().clip.id;
 $('teacher-current').textContent=current?`Viewing: ${window.BC_CLIPS.find(x=>x.id===current.clipId)?.title||'Recording'} · ${new Date(current.createdAt).toLocaleString()}`:'Viewing the selected collection';
 $('teacher-rooms').replaceChildren();const older=teacherRooms.filter(r=>r.code!==c.room&&r.clipId===clipId);
 for(const room of older){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='btn-uga-outline';b.textContent=new Date(room.createdAt).toLocaleString();b.onclick=()=>{location.href=base+'#teacher-room='+room.code;location.reload();};li.append(b);$('teacher-rooms').append(li);}
 $('teacher-history-collections').hidden=!older.length;
}
async function dashboard(){const d=await api('/api/teacher/rooms','GET',null,true);teacherRooms=d.rooms;$('teacher-login').hidden=true;$('teacher-dashboard').hidden=false;$('teacher-identity').textContent='Signed in as '+d.username;renderTeacherRooms();}
async function copyField(id,success){const field=$(id);if(!field.value){message('No submitted receipts yet.');return;}try{await navigator.clipboard.writeText(field.value);message(success);}catch{field.focus();field.select();message('Selected. Copy with your keyboard.');}}
$('class-copy-receipts').onclick=()=>copyField('class-receipts','Submission receipts copied.');
$('teacher-signin').onclick=()=>{try{sessionStorage.setItem('7a-return-recording',String(window.BC_CLIPS.findIndex(x=>x.id===app.snapshot().clip.id)));}catch{}};
$('clip').onchange=()=>{if(app.snapshot().active||c.submitting||c.loading){$('clip').value=window.BC_CLIPS.findIndex(x=>x.id===app.snapshot().clip.id);return;}location.href=base+'?recording='+$('clip').value;};
$('class-create').onclick=async()=>{if(!confirm('Begin a separate collection for the next class? Students opening the fixed page will enter the new collection. Earlier records are retained until expiry.'))return;try{const d=await api('/api/teacher/next?clipId='+encodeURIComponent(app.snapshot().clip.id),'POST',{},true);address(d.code,true);await dashboard();await enter(d.code,true);}catch(e){fail(e.message);}};
$('teacher-logout').onclick=async()=>{try{await api('/api/teacher/logout','POST',null,true);}catch(e){fail(e.message);return;}clearTeacher();try{localStorage.setItem('7a-teacher-signout',String(Date.now()));}catch{}location.href=location.protocol==='file:'?location.pathname:base;};
$('class-results').onclick=results;$('class-view').onclick=results;$('class-retry').onclick=()=>{action({type:'submit_retry',attemptId:pending?.id||null,position:null});flushSubmissions();};
for(const [button,action] of [['class-close','close'],['class-reopen','open'],['class-release','release']])$(button).onclick=async()=>{if(action==='release'&&!confirm('Close submissions and share the anonymous comparison with everyone visiting this page?'))return;$(button).disabled=true;try{summary(await api(path('/manage'),'POST',{action},true));message(action==='release'?'Comparison shared with the class.':action==='open'?'Submissions reopened. Previously viewed results cannot be unseen.':'Submissions closed.');fail('');}catch(e){fail(e.message);}finally{await refresh();}};
window.addEventListener('bc-round-complete',()=>flushSubmissions());document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main').focus();$('main').scrollIntoView();};
async function initialize(){const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));const handoff=fragment.get('teacher-signin'),authError=fragment.get('teacher-error');let authNotice='';if(handoff){address('');const d=await api('/api/teacher/exchange','POST',{handoff});saveSession(d.token);let recording='0';try{recording=sessionStorage.getItem('7a-return-recording')||'0';sessionStorage.removeItem('7a-return-recording');}catch{}location.replace(base+'?recording='+ (recording==='1'?'1':'0'));return;}if(authError){address('');$('teacher-panel').open=true;authNotice=authError==='configuration'?'GitHub teacher sign-in is awaiting administrator configuration.':authError==='unauthorized'?'This GitHub account is not authorized as a teacher.':authError==='busy'?'Too many sign-in attempts. Please wait 10 minutes and try again.':'Sign-in was not completed. Please try again.';}if(session){try{await dashboard();}catch(e){if(e.status!==401)throw e;fail('Teacher session expired. You can sign in again.');}}const teacherRoom=fragment.get('teacher-room')||(fragment.has('key')&&fragment.get('room'));const room=teacherRoom||params.get('room');if(room){address(room,!!session);await enter(room.toUpperCase(),!!session,true);}else{const current=await api('/api/current?clipId='+encodeURIComponent(selectedClip().id));if(session){await dashboard();address(current.code,true);await enter(current.code,true,true);}else{await enter(current.code,false,true);}}if(authNotice){$('teacher-panel').open=true;fail(authNotice);}}
initialize().catch(e=>{c.initializing=false;c.closed=true;app.controls();fail(e.message+' Refresh the page to retry.');});
})();
