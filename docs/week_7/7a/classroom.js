(function(){
'use strict';
const $=id=>document.getElementById(id),app=window.BC_APP;
const API='https://ling2150-7a-classroom.ling2150-query-rewrite.workers.dev';
const c=window.BC_CLASSROOM={mode:'offline',room:null,initializing:false};
let teacherKey='',participantKey='',pending=null,poll=null,requestBusy=false;
const base=location.protocol==='file:'?'https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html':location.origin+location.pathname;
const address=(room,key='')=>{if(location.protocol!=='file:')history.replaceState(null,'',base+(key?'#room='+room+'&key='+encodeURIComponent(key):'?room='+room));};
$('class-leave').href=location.protocol==='file:'?location.pathname:base;
const message=t=>{$('class-message').textContent=t;};const fail=t=>{$('class-error').textContent=t;};
function stored(key,fallback=''){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
function store(key,value){try{localStorage.setItem(key,value);}catch{message('Browser saving is unavailable. Keep this tab open and save the private teacher link if you created this activity.');}}
async function api(path,method='GET',data=null,teacher=false){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
 try{const headers={'Content-Type':'application/json'};if(teacher)headers['X-Teacher-Key']=teacherKey;if(participantKey&&!teacher)headers['X-Participant-Key']=participantKey;
 const r=await fetch(API+path,{method,headers,body:data?JSON.stringify(data):undefined,signal:ac.signal,cache:'no-store',referrerPolicy:'no-referrer'});const d=await r.json();if(!r.ok)throw Error(d.error||'The classroom service could not complete this request.');return d;
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('Connection interrupted. Your local work is kept. Please try again.');throw e;}finally{clearTimeout(timer);}}
const path=s=>`/api/rooms/${c.room}${s||''}`;
function summary(d){c.closed=!d.open;c.released=d.released;$('class-summary').textContent=`Activity ${c.room} · ${d.submitted} of ${d.joined} joined participants submitted${d.released?' · Comparison shared':!d.open?' · Submissions closed':''}`;$('class-retention').textContent=`Download before ${new Date(d.expiresAt).toLocaleDateString()}; this activity is automatically deleted after that date.`;$('class-view').disabled=!d.released||app.snapshot().active;$('class-results').disabled=!d.submitted;$('class-release').disabled=!d.submitted||d.released;$('class-close').disabled=!d.open;$('class-reopen').disabled=d.open;app.controls();}
async function results(){if(app.snapshot().active){fail('Finish or discard your current round before viewing the comparison.');return;}if(requestBusy)return;requestBusy=true;try{const d=await api(path('/results'),'GET',null,c.mode==='teacher');summary(d);app.compare(d.runs);message(`Loaded ${d.runs.length} submitted participants. Use the download buttons below to export the comparison.`);fail('');}catch(e){fail(e.message);}finally{requestBusy=false;}}
async function submit(run){if(c.mode!=='student'||c.submitted||!run)return;pending=run;c.completed=true;app.controls();$('class-retry').hidden=true;$('class-submission').textContent='Submitting your completed round…';
 try{const d=await api(path('/submit'),'POST',{run});c.submitted=true;pending=null;$('class-submission').textContent=`Submitted successfully as participant ${d.participant}. Your teacher has your marker times. Wait for the class comparison.`;fail('');await refresh();}catch(e){$('class-submission').textContent='Not submitted yet. Your completed round is still saved on this browser; retry below.';$('class-retry').hidden=false;fail(e.message);}app.controls();}
async function refresh(){if(!c.room||c.initializing||document.hidden)return;try{summary(await api(path()));}catch(e){message(e.message);}}
async function enter(room,key='',initial=false){
 if(!/^[A-Z2-9]{8}$/.test(room))throw Error('Enter the 8-character activity code.');
 if(!initial&&app.snapshot().active)throw Error('Finish or discard your current round before joining a class.');
 c.room=room;c.mode=key?'teacher':'student';c.initializing=true;c.submitted=false;c.completed=false;teacherKey=key;app.controls();$('class-home').hidden=true;$('class-active').hidden=false;$('class-teacher').hidden=true;$('class-student').hidden=true;message('Opening class activity…');fail('');
 try{
 let d;if(key)d=await api(path('/results'),'GET',null,true);else d=await api(path());
 app.select(d.clipId);
 if(key){const studentLink=base+'?room='+room;const privateLink=base+'#room='+room+'&key='+encodeURIComponent(key);$('class-student-link').value=studentLink;$('class-teacher-link').value=privateLink;$('class-teacher').hidden=false;store('7a-last-teacher-link',privateLink);summary(d);if(d.runs.length)app.compare(d.runs);message('Share only the student link. Keep the private teacher link for later access and export.');}
 else{
  $('class-student').hidden=false;
  participantKey=stored('7a-participant:'+room);if(!participantKey){participantKey=crypto.randomUUID()+crypto.randomUUID();store('7a-participant:'+room,participantKey);}
  try{d=await api(path('/join'),'POST',{key:participantKey});c.participant=d.participant;c.submitted=d.submittedByYou;}
  catch(e){if(!d.released)throw e;}
  summary(d);const last=app.last();c.completed=c.submitted||!!last;
  $('class-submission').textContent=c.submitted?`Participant ${c.participant}: your completed round is already submitted.`:c.released?'The comparison has been released. You can view it below.':`You are participant ${c.participant}. Listen independently; your completed round will submit automatically.`;
  message('Only anonymous marker data is submitted. Your written reflection stays on this browser.');
  if(last&&!c.submitted&&!d.released){c.initializing=false;await submit(last);}
 }
 c.initializing=false;app.controls();clearInterval(poll);poll=setInterval(refresh,10000);
 }catch(e){c.initializing=false;c.closed=true;app.controls();message('Could not open the activity. Use the return link above to try again.');throw e;}
}
for(const clip of window.BC_CLIPS){const o=document.createElement('option');o.value=clip.id;o.textContent=clip.title;$('class-clip').append(o);}
const lastTeacher=stored('7a-last-teacher-link');if(lastTeacher){$('class-resume').href=lastTeacher;$('class-resume').hidden=false;}
$('class-join-form').onsubmit=e=>{e.preventDefault();const room=$('class-code').value.trim().toUpperCase();address(room);enter(room).catch(e=>fail(e.message));};
$('class-create').onclick=async()=>{if(app.snapshot().active){fail('Finish or discard the current round first.');return;}$('class-create').disabled=true;fail('');try{const d=await api('/api/rooms','POST',{clipId:$('class-clip').value});address(d.code,d.teacherKey);await enter(d.code,d.teacherKey);}catch(e){fail(e.message);}finally{$('class-create').disabled=false;}};
for(const [button,field] of [['class-copy-student','class-student-link'],['class-copy-teacher','class-teacher-link']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(field).value);message(button==='class-copy-student'?'Student link copied. Share it with the class.':'Private teacher link copied. Save it privately.');}catch{$(field).focus();$(field).select();message('Link selected. Copy it using your keyboard or browser menu.');}};
$('class-results').onclick=results;$('class-view').onclick=results;$('class-retry').onclick=()=>submit(pending||app.last());
for(const [button,action] of [['class-close','close'],['class-reopen','open'],['class-release','release']])$(button).onclick=async()=>{if(action==='release'&&!confirm('Close submissions and let everyone with the activity code see the anonymous comparison?'))return;$(button).disabled=true;try{summary(await api(path('/manage'),'POST',{action},true));message(action==='release'?'Comparison shared. Students can click “Check for class comparison”.':action==='open'?'Submissions reopened. Previously viewed results cannot be unseen.':'Submissions closed. Existing results are kept.');fail('');}catch(e){fail(e.message);}finally{await refresh();}};
window.addEventListener('bc-round-complete',e=>submit(e.detail));
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main').focus();$('main').scrollIntoView();};
const params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));const room=fragment.get('room')||params.get('room');if(room)enter(room.toUpperCase(),fragment.get('key')||'',true).catch(e=>fail(e.message));
})();
