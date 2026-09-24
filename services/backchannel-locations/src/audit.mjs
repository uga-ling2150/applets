const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const TYPES=new Set(['page_open','page_reload','page_leave','start','pause','resume','mark','undo','discard','complete','submit_retry','transcript_open','transcript_close','practice_start','practice_complete','comparison_view','audio_waiting','audio_error']);
const ID=/^[a-zA-Z0-9_-]{8,100}$/;
async function attemptFor(store,m,s,participantKey,id){
 const key='attempt:'+s.id+':'+id;let a=await store.get(key);
 if(!a){if(!m.open||m.released)return {error:json({error:'The activity is closed to new attempts.'},409)};if((s.attemptCount||0)>=20)return {error:json({error:'This participant has reached the 20-attempt limit.'},429)};
  const legacy=await store.get('run:'+s.id);s.attemptCount=(s.attemptCount||(legacy?1:0))+1;
  a={id:crypto.randomUUID(),clientAttemptId:id,participant:s.number,attempt:s.attemptCount,status:'in_progress',receivedAt:new Date().toISOString(),submittedAt:null,marks:[],events:[]};
 }
 return {key,a};
}
export async function recordEvents(store,m,s,participantKey,b){
 if(!Array.isArray(b.events)||!b.events.length||b.events.length>40||b.attemptId!==null&&!ID.test(b.attemptId||''))return json({error:'Invalid activity event batch.'},400);
 const clean=[];
 for(const e of b.events){if(!e||!ID.test(e.id||'')||!TYPES.has(e.type)||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||e.position!==null&&(!Number.isFinite(e.position)||e.position<0||e.position>180))return json({error:'Invalid activity event.'},400);clean.push({id:e.id,type:e.type,clientAt:new Date(e.at).toISOString(),position:e.position,receivedAt:new Date().toISOString()});}
 let key,a;if(b.attemptId===null){key='activity:'+s.id;a=await store.get(key)||{participant:s.number,attempt:null,events:[]};}else {const found=await attemptFor(store,m,s,participantKey,b.attemptId);if(found.error)return found.error;({key,a}=found);}
 const ids=new Set(a.events.map(e=>e.id));const fresh=clean.filter(e=>!ids.has(e.id)&&ids.add(e.id));
 if(a.events.length+fresh.length>1000||(m.eventCount||0)+fresh.length>20000)return json({error:'Activity log limit reached. Your local event log is kept.'},429);
 a.events.push(...fresh);if(a.status==='in_progress'){for(const e of fresh){if(e.type==='mark'&&e.position!==null)a.marks.push(e.position);if(e.type==='undo')a.marks.pop();}}if(a.status==='in_progress'&&fresh.some(e=>e.type==='discard'))a.status='discarded';m.eventCount=(m.eventCount||0)+fresh.length;
 await store.put({[key]:a,['participant:'+participantKey]:s,meta:m});return json({ok:true,attempt:a.attempt,participant:s.number});
}
export async function submitAttempt(store,m,s,participantKey,b,validRun){
 let run;try{run=validRun(b.run,m.clipId);}catch(e){return json({error:e.message},400);}
 const attemptId=b.run.id||'legacy-first';if(!ID.test(attemptId))return json({error:'Invalid attempt identifier.'},400);
 const found=await attemptFor(store,m,s,participantKey,attemptId);if(found.error)return found.error;const {key,a}=found;
 const record={...run,id:a.id,participant:s.number,attempt:a.attempt};
 if(a.status==='complete'){if(JSON.stringify(a.record)!==JSON.stringify(record))return json({error:'This submitted attempt cannot be overwritten. Start another attempt instead.'},409);return json({ok:true,participant:s.number,attempt:a.attempt,submittedAt:a.submittedAt,duplicate:true});}
 if(!m.open||m.released)return json({error:'Submissions are closed. Your local attempt is kept.'},409);
 if(a.status==='discarded')return json({error:'A discarded attempt cannot be submitted.'},409);
 a.status='complete';a.record=record;a.marks=run.marks;a.exposed=run.exposed;a.submittedAt=new Date().toISOString();
 m.totalSubmissions=(m.totalSubmissions??m.submitted)+1;
 if(!s.submitted){s.submitted=true;m.submitted++;}
 const first=await store.get('run:'+s.id);await store.put({[key]:a,...(!first?{['run:'+s.id]:record}:{}),['participant:'+participantKey]:s,meta:m});
 return json({ok:true,participant:s.number,attempt:a.attempt,submittedAt:a.submittedAt});
}
export async function auditRecords(store,m){
 const attempts=[...(await store.list({prefix:'attempt:'})).values()];const first=[...(await store.list({prefix:'run:'})).values()];
 for(const r of first)if(!attempts.some(a=>a.id===r.id))attempts.push({id:r.id,participant:r.participant,attempt:1,status:'complete',receivedAt:null,submittedAt:null,marks:r.marks,exposed:r.exposed,events:[],legacy:true});
 attempts.sort((a,b)=>a.participant-b.participant||a.attempt-b.attempt);
 return json({code:m.code,clipId:m.clipId,comparison:'first_completed_attempt_per_participant',attempts:attempts.map(a=>({...a,clientAttemptId:undefined,record:undefined,inComparison:first.some(r=>r.id===a.id)})),activity:[...(await store.list({prefix:'activity:'})).values()]});
}
