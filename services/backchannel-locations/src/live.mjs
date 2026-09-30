// Classroom-only sessions. Existing individual collections and audit records are untouched.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const ID=/^[a-zA-Z0-9_-]{8,100}$/;
export async function liveRequest({store,m,path,r,teacher,body,hash,duration,now=Date.now()}) {
 const query=new URL(r.url).searchParams;
 let id=query.get('session')||await store.get('live-current');
 let session=id?await store.get('live:'+id):null;
 const publicState=()=>({serverTime:Date.now(),code:m.code,clipId:m.clipId,duration,expiresAt:m.expiresAt,session:session?{id:session.id,status:session.status,position:session.position,sampleAt:session.sampleAt,heartbeatAt:session.heartbeatAt,startAt:session.startAt,revision:session.revision,released:session.released,joined:session.joined,submitted:session.submitted}:null});
 if(path==='/live'&&r.method==='GET'){const sessions=teacher?[...(await store.list({prefix:'live:'})).values()].map(s=>({id:s.id,createdAt:s.createdAt,status:s.status})):undefined;return json({...publicState(),sessions});}
 if(path==='/live-control'&&r.method==='POST') {
  if(!teacher)return json({error:'Teacher sign-in is required.'},403);
  const b=await body(r);
  if(b.action==='prepare') {
   if(session&&!['ended','cancelled'].includes(session.status))return json({error:'Finish or cancel the current classroom before preparing another.'},409);
   const count=await store.get('live-count')||0;if(count>=20)return json({error:'Start a new collection for more classroom sessions.'},429);
   id=crypto.randomUUID();session={id,createdAt:now,status:'ready',position:0,sampleAt:now,heartbeatAt:now,startAt:null,revision:0,joined:0,submitted:0,released:false,controller:null};
   await store.put({'live-current':id,'live-count':count+1,['live:'+id]:session});return json(publicState());
  }
  if(!session||b.sessionId!==session.id)return json({error:'The classroom session has changed. Refresh its state.'},409);
  if(b.action==='release') {if(session.status!=='ended')return json({error:'Finish playback before sharing results.'},409);session.released=true;}
  else if(b.action==='cancel') {session.status='cancelled';session.heartbeatAt=now;session.revision++;}
  else {
   if(!ID.test(b.controller||''))return json({error:'Invalid teacher controller.'},400);
   if(session.controller&&session.controller!==b.controller&&now-session.heartbeatAt<5000)return json({error:'Another teacher tab is controlling playback. Use that tab, or close it and wait five seconds.'},409);
   if(['ended','cancelled'].includes(session.status))return json({error:'This classroom has finished. Prepare a new one.'},409);
   if(b.action==='start') {if(!['ready','paused'].includes(session.status)&&now-session.heartbeatAt<5000)return json({error:'Playback is already starting or running.'},409);session.status='countdown';session.startAt=now+3000;session.revision++;}
   else if(b.action==='anchor') {
    if(b.revision!==session.revision)return json({error:'Playback state changed. Refresh before continuing.'},409);
    if(!['running','paused','ended'].includes(b.status)||!Number.isFinite(b.position)||b.position<0||b.position>duration||!Number.isFinite(b.sampleAt)||Math.abs(b.sampleAt-now)>5000)return json({error:'Invalid playback position or clock. Reconnect before continuing.'},400);
    if(b.sampleAt<session.sampleAt)return json({error:'An older playback update was ignored.'},409);
    // No backward seeking within a session: comparisons always use one continuous pass.
    if(b.position<session.position-0.05)return json({error:'Rewinding requires a new classroom session.'},409);
    session.status=b.status;session.position=b.position;session.sampleAt=b.sampleAt;session.startAt=null;
   } else return json({error:'Unknown classroom action.'},400);
   session.controller=b.controller;session.heartbeatAt=now;
  }
  await store.put('live:'+id,session);return json(publicState());
 }
 if(!session)return json({error:'Wait for the teacher to prepare a classroom.'},404);
 if(path==='/live-results'&&r.method==='GET') {
  if(!teacher&&!session.released)return json({error:'The teacher has not shared this classroom comparison.'},403);
  const records=[...(await store.list({prefix:'live-record:'+id+':'})).values()].filter(x=>x.complete).sort((a,b)=>a.participant-b.participant);
  return json({...publicState(),records:records.map(x=>({participant:x.participant,marks:x.marks,exposed:x.exposed,late:x.late,...(teacher?{submittedAt:x.submittedAt,updatedAt:x.updatedAt}: {})}))});
 }
 const key=r.headers.get('X-Participant-Key')||'';if(!/^[a-zA-Z0-9-]{36,100}$/.test(key))return json({error:'Join from your student browser first.'},401);
 const recordKey='live-record:'+id+':'+await hash(key);let record=await store.get(recordKey);
 if(path==='/live-join'&&r.method==='POST') {
  if(!record) {
   if(['ended','cancelled'].includes(session.status))return json({error:'This classroom is finished. You can view its comparison when shared.'},409);
   if(session.joined>=60)return json({error:'This classroom is full (60 browsers).'},409);
   record={participant:++session.joined,marks:[],exposed:false,late:!['ready','countdown'].includes(session.status),complete:false,sequence:0,updatedAt:now,submittedAt:null};await store.put({[recordKey]:record,['live:'+id]:session});
  }
  return json({...publicState(),record});
 }
 if(path==='/live-save'&&r.method==='POST') {
  if(!record)return json({error:'Join this classroom before saving.'},401);
  const b=await body(r);
  if(!Array.isArray(b.marks)||b.marks.length>300||!b.marks.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=duration&&(!i||t-b.marks[i-1]>=0.12))||typeof b.exposed!=='boolean'||!Number.isInteger(b.sequence)||b.sequence<1||typeof b.complete!=='boolean')return json({error:'Invalid classroom record.'},400);
  if(b.sequence<=record.sequence)return json({ok:true,record});
  if(record.complete)return json({error:'This submitted classroom record cannot be changed.'},409);
  if(session.status==='cancelled')return json({error:'This classroom was cancelled. Download your local clicks if needed.'},409);
  if(b.complete&&session.status!=='ended')return json({error:'Wait for the teacher playback to finish.'},409);
  record={...record,marks:b.marks,exposed:record.exposed||b.exposed,sequence:b.sequence,complete:b.complete,updatedAt:now,submittedAt:b.complete?now:null};
  if(record.complete)session.submitted++;
  await store.put({[recordKey]:record,['live:'+id]:session});return json({ok:true,record});
 }
 return json({error:'Not found.'},404);
}
