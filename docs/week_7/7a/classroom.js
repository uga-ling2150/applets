(function(){
'use strict';
const $=id=>document.getElementById(id),app=window.BC_APP;
const API='https://ling2150-7a-classroom.ling2150-query-rewrite.workers.dev';
const c=window.BC_CLASSROOM={mode:'offline',room:null,initializing:false};
let session='',participantKey='',pending=null,poll=null,requestBusy=false;
try{session=sessionStorage.getItem('7a-teacher-session')||'';}catch{}
const base=location.protocol==='file:'?'https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html':location.origin+location.pathname;
const address=(room,teacher=false)=>{if(location.protocol!=='file:')history.replaceState(null,'',base+(room?(teacher?'#teacher-room=':'?room=')+room:''));};
$('class-leave').href=location.protocol==='file:'?location.pathname:base;
const message=t=>{$('class-message').textContent=t;};const fail=t=>{$('class-error').textContent=t;};
const panel=()=>{$('activity-panel').hidden=false;$('reflection-panel').hidden=false;};
$('activity-panel').hidden=true;$('reflection-panel').hidden=true;
function stored(key){try{return localStorage.getItem(key)||'';}catch{return '';}}
function store(key,value){try{localStorage.setItem(key,value);}catch{message('Browser saving is unavailable. Keep this tab open until your round is submitted.');}}
function saveSession(value){session=value;try{if(value)sessionStorage.setItem('7a-teacher-session',value);else sessionStorage.removeItem('7a-teacher-session');}catch{}}
async function api(path,method='GET',data=null,teacher=false){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
 try{const headers={'Content-Type':'application/json'};if(teacher&&session)headers.Authorization='Bearer '+session;if(participantKey&&!teacher)headers['X-Participant-Key']=participantKey;
 const r=await fetch(API+path,{method,headers,body:data?JSON.stringify(data):undefined,signal:ac.signal,cache:'no-store',referrerPolicy:'no-referrer'});const d=await r.json();if(!r.ok){if(r.status===401&&teacher){saveSession('');$('teacher-login').hidden=false;$('teacher-dashboard').hidden=true;$('teacher-panel').open=true;}throw Error(d.error||'Please try again.');}return d;
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('Connection interrupted. Your local work is kept. Please try again.');throw e;}finally{clearTimeout(timer);}}
const path=s=>`/api/rooms/${c.room}${s||''}`;
function summary(d){c.closed=!d.open;c.released=d.released;$('class-summary').textContent=`${c.room} · ${d.submitted} / ${d.joined} submitted${d.released?' · Comparison shared':!d.open?' · Closed':''}`;$('class-retention').textContent=c.mode==='teacher'?`Download by ${new Date(d.expiresAt).toLocaleDateString()}.`:'';$('class-view').disabled=!d.released||app.snapshot().active;$('class-results').disabled=!d.submitted;$('class-release').disabled=!d.submitted||d.released;$('class-close').disabled=!d.open;$('class-reopen').disabled=d.open;app.controls();}
async function results(){if(app.snapshot().active){fail('Finish or discard your round first.');return;}if(requestBusy)return;requestBusy=true;try{const d=await api(path('/results'),'GET',null,c.mode==='teacher');summary(d);panel();app.compare(d.runs);message(`${d.runs.length} participants loaded. Download the CSV below.`);fail('');}catch(e){fail(e.message);}finally{requestBusy=false;}}
async function submit(run){if(c.mode!=='student'||c.submitted||!run)return;pending=run;c.completed=true;app.controls();$('class-retry').hidden=true;$('class-submission').textContent='Submitting…';
 try{const d=await api(path('/submit'),'POST',{run});c.submitted=true;pending=null;$('class-submission').textContent=`Submitted as participant ${d.participant}. Wait for your teacher to share the comparison.`;fail('');await refresh();}catch(e){$('class-submission').textContent='Not submitted yet. Your round is kept on this browser.';$('class-retry').hidden=false;fail(e.message);}app.controls();}
async function refresh(){if(!c.room||c.initializing||document.hidden)return;try{summary(await api(path()));}catch(e){message(e.message);}}
async function enter(room,teacher=false,initial=false){
 if(!/^[A-Z2-9]{8}$/.test(room))throw Error('Enter the 8-character activity code.');
 if(!initial&&app.snapshot().active)throw Error('Finish or discard your current round first.');
 if(teacher&&!session){$('teacher-panel').open=true;fail('Sign in with GitHub to manage this activity.');return;}
 c.room=room;c.mode=teacher?'teacher':'student';c.initializing=true;c.submitted=false;c.completed=false;app.controls();$('class-home').hidden=true;$('class-active').hidden=false;$('class-teacher').hidden=true;$('class-student').hidden=true;$('teacher-panel').hidden=!teacher;document.body.classList.toggle('teacher-mode',teacher);document.body.classList.add('class-mode');message('Opening activity…');fail('');
 try{
 let d=await api(path(teacher?'/results':''),'GET',null,teacher);app.select(d.clipId);
 if(teacher){$('class-student-link').value=base+'?room='+room;$('class-teacher').hidden=false;summary(d);if(d.runs.length){panel();app.compare(d.runs);}message('Share the student link with your class.');}
 else{
  panel();$('class-student').hidden=false;participantKey=stored('7a-participant:'+room);if(!participantKey){participantKey=crypto.randomUUID()+crypto.randomUUID();store('7a-participant:'+room,participantKey);}
  try{d=await api(path('/join'),'POST',{key:participantKey});c.participant=d.participant;c.submitted=d.submittedByYou;}catch(e){if(!d.released)throw e;}
  summary(d);const last=app.last();c.completed=c.submitted||!!last;
  $('class-submission').textContent=c.submitted?`Participant ${c.participant}: already submitted.`:c.released?'The class comparison is ready.':`Participant ${c.participant} · Listen independently. Your round submits at the end.`;message('');
  if(last&&!c.submitted&&!d.released){c.initializing=false;await submit(last);}
 }
 c.initializing=false;app.controls();clearInterval(poll);poll=setInterval(refresh,10000);
 }catch(e){c.initializing=false;c.closed=true;app.controls();message('Use Return to start to try again.');throw e;}
}
async function dashboard(){const d=await api('/api/teacher/rooms','GET',null,true);$('teacher-login').hidden=true;$('teacher-dashboard').hidden=false;$('teacher-identity').textContent='Signed in as '+d.username;$('teacher-rooms').replaceChildren();for(const room of d.rooms){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='btn-uga-outline';b.textContent=`${room.code} · ${new Date(room.createdAt).toLocaleDateString()}`;b.onclick=()=>{address(room.code,true);enter(room.code,true).catch(e=>fail(e.message));};li.append(b);$('teacher-rooms').append(li);}if(!d.rooms.length)$('teacher-rooms').textContent='No activities yet.';}
for(const clip of window.BC_CLIPS){const o=document.createElement('option');o.value=clip.id;o.textContent=clip.title;$('class-clip').append(o);}
$('solo-start').onclick=()=>{panel();$('activity-panel').scrollIntoView({behavior:'smooth'});};
$('class-join-form').onsubmit=e=>{e.preventDefault();const room=$('class-code').value.trim().toUpperCase();address(room);enter(room).catch(e=>fail(e.message));};
$('class-create').onclick=async()=>{if(app.snapshot().active){fail('Finish or discard the current round first.');return;}$('class-create').disabled=true;fail('');try{const d=await api('/api/rooms','POST',{clipId:$('class-clip').value},true);address(d.code,true);await dashboard();await enter(d.code,true);}catch(e){fail(e.message);}finally{$('class-create').disabled=false;}};
$('teacher-logout').onclick=async()=>{try{await api('/api/teacher/logout','POST',null,true);}catch(e){fail(e.message);return;}saveSession('');location.href=location.protocol==='file:'?location.pathname:base;};
$('class-copy-student').onclick=async()=>{try{await navigator.clipboard.writeText($('class-student-link').value);message('Student link copied.');}catch{$('class-student-link').focus();$('class-student-link').select();message('Link selected. Copy with your keyboard.');}};
$('class-results').onclick=results;$('class-view').onclick=results;$('class-retry').onclick=()=>submit(pending||app.last());
for(const [button,action] of [['class-close','close'],['class-reopen','open'],['class-release','release']])$(button).onclick=async()=>{if(action==='release'&&!confirm('Close submissions and share the anonymous comparison with everyone holding the activity code?'))return;$(button).disabled=true;try{summary(await api(path('/manage'),'POST',{action},true));message(action==='release'?'Comparison shared with the class.':action==='open'?'Submissions reopened. Previously viewed results cannot be unseen.':'Submissions closed.');fail('');}catch(e){fail(e.message);}finally{await refresh();}};
window.addEventListener('bc-round-complete',e=>submit(e.detail));document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main').focus();$('main').scrollIntoView();};
async function initialize(){const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));const handoff=fragment.get('teacher-signin'),authError=fragment.get('teacher-error');if(handoff){address('');const d=await api('/api/teacher/exchange','POST',{handoff});saveSession(d.token);$('teacher-panel').open=true;}if(authError){address('');$('teacher-panel').open=true;fail(authError==='configuration'?'GitHub teacher sign-in is awaiting administrator configuration.':authError==='unauthorized'?'This GitHub account is not authorized as a teacher.':'Sign-in was not completed. Please try again.');}if(session){try{await dashboard();}catch(e){fail(e.message);}}const teacherRoom=fragment.get('teacher-room')||(fragment.has('key')&&fragment.get('room'));const room=teacherRoom||params.get('room');if(room){address(room,!!teacherRoom);await enter(room.toUpperCase(),!!teacherRoom,true);}}
initialize().catch(e=>fail(e.message));
})();
