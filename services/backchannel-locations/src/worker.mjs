const CLIPS={'ami-is1008b-b-383000-450300-v1':67.3,'ami-ib4010-a-172300-232900-v1':60.6};
const TTL=30*86400000,MAX=60;
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(r){if(Number(r.headers.get('content-length'))>16000)throw Error('Request too large.');const reader=r.body?.getReader();if(!reader)return {};let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16000){await reader.cancel();throw Error('Request too large.');}chunks.push(value);}let all=new Uint8Array(bytes),i=0;for(const c of chunks){all.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(all));}
export function validRun(r,clipId){if(!r||r.clipId!==clipId||r.complete!==true||typeof r.exposed!=='boolean'||!Array.isArray(r.marks)||r.marks.length>300)throw Error('Invalid completed round.');const marks=[...r.marks];if(!marks.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=CLIPS[clipId]&&(!i||t-marks[i-1]>=0.12)))throw Error('Invalid marker times.');return {clipId,complete:true,exposed:r.exposed,marks};}
export default {async fetch(r,env){
 const origin=r.headers.get('Origin')||'';const allowed=['https://uga-ling2150.github.io','http://127.0.0.1:8903','null'];const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'https://uga-ling2150.github.io','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Teacher-Key, X-Participant-Key','Vary':'Origin'};
 if(r.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 let result;try{
 const p=new URL(r.url).pathname;
 if(p==='/api/health')result=json({ok:true,version:'7a-classroom-1'});
 else if(p==='/api/rooms'&&r.method==='POST'){
  const b=await body(r);if(!CLIPS[b.clipId])throw Error('Choose an available recording.');
  const gate=env.ROOMS.get(env.ROOMS.idFromName('creation-limit'));
  const admitted=await gate.fetch('https://internal/quota',{method:'POST'});if(!admitted.ok)result=admitted;
  else {const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');const teacherKey=token();const room=env.ROOMS.get(env.ROOMS.idFromName(code));result=await room.fetch('https://internal/init',{method:'POST',body:JSON.stringify({code,clipId:b.clipId,teacherHash:await hash(teacherKey)})});if(result.ok)result=json({...await result.json(),teacherKey});}
 }else{
  const m=p.match(/^\/api\/rooms\/([A-Z2-9]{8})(?:\/(join|submit|results|manage))?$/);if(!m)result=json({error:'Activity not found.'},404);else result=await env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(new Request('https://internal/'+(m[2]||'info'),r));
 }
 }catch(e){result=json({error:e instanceof SyntaxError?'Invalid JSON.':e.message||'Service unavailable.'},400);}
 const h=new Headers(result.headers);for(const [k,v] of Object.entries(cors))h.set(k,v);return new Response(result.body,{status:result.status,headers:h});
}};
export class BackchannelRoom{
 constructor(ctx){this.ctx=ctx;this.queue=Promise.resolve();}
 fetch(r){const p=this.queue.then(()=>this.handle(r));this.queue=p.catch(()=>{});return p;}
 async alarm(){await this.ctx.storage.deleteAll();}
 async handle(r){
 const store=this.ctx.storage,path=new URL(r.url).pathname,now=Date.now();
 if(path==='/quota') {const day=Math.floor(now/86400000);let q=await store.get('quota')||{day,n:0};if(q.day!==day)q={day,n:0};if(q.n>=100)return json({error:'Daily activity-creation limit reached. Try again tomorrow.'},429);q.n++;await store.put('quota',q);return json({ok:true});}
 if(path==='/init'&&r.method==='POST'){if(await store.get('meta'))return json({error:'Please create the activity again.'},409);const b=await body(r);const m={...b,createdAt:now,expiresAt:now+TTL,open:true,released:false,joined:0,submitted:0};await store.put('meta',m);await store.setAlarm(m.expiresAt);return json({code:m.code,clipId:m.clipId,expiresAt:m.expiresAt});}
 const m=await store.get('meta');if(!m||m.expiresAt<=now)return json({error:'This activity does not exist or has expired.'},404);
 const teacherKey=r.headers.get('X-Teacher-Key');const teacher=teacherKey&&await hash(teacherKey)===m.teacherHash;
 const info=()=>({code:m.code,clipId:m.clipId,duration:CLIPS[m.clipId],open:m.open,released:m.released,joined:m.joined,submitted:m.submitted,expiresAt:m.expiresAt});
 if(path==='/info'&&r.method==='GET')return json(info());
 if(path==='/join'&&r.method==='POST'){
  const b=await body(r);if(typeof b.key!=='string'||!/^[a-zA-Z0-9-]{36,100}$/.test(b.key))return json({error:'Invalid browser participant key.'},400);
  const k=await hash(b.key);let s=await store.get('participant:'+k);
  if(!s){if(!m.open||m.released)return json({error:'The teacher has closed this activity.'},409);if(m.joined>=MAX)return json({error:'This activity is full (60 participants).'},409);s={id:crypto.randomUUID(),number:++m.joined,submitted:false};await store.put({['participant:'+k]:s,meta:m});}
  return json({...info(),participant:s.number,submittedByYou:s.submitted});
 }
 if(path==='/submit'&&r.method==='POST'){
  const k=await hash(r.headers.get('X-Participant-Key')||'');const s=await store.get('participant:'+k);if(!s)return json({error:'Join the activity before submitting.'},401);
  const b=await body(r);let run;try{run=validRun(b.run,m.clipId);}catch(e){return json({error:e.message},400);}
  const record={...run,id:s.id,participant:s.number};const previous=await store.get('run:'+s.id);
  if(previous){if(JSON.stringify(previous)!==JSON.stringify(record))return json({error:'Your first completed round has already been submitted.'},409);return json({ok:true,participant:s.number,duplicate:true});}
  if(!m.open||m.released)return json({error:'The teacher has closed submissions. Download your local result and contact your teacher.'},409);
  s.submitted=true;m.submitted++;await store.put({['run:'+s.id]:record,['participant:'+k]:s,meta:m});return json({ok:true,participant:s.number});
 }
 if(path==='/results'&&r.method==='GET'){
  if(!teacher&&!m.released)return json({error:'The teacher has not released the comparison yet.'},403);
  const rows=await store.list({prefix:'run:'});const runs=[...rows.values()].sort((a,b)=>a.participant-b.participant);return json({...info(),format:'ling2150-7a',version:1,runs});
 }
 if(path==='/manage'&&r.method==='POST'){
  if(!teacher)return json({error:'The private teacher link is required.'},403);
  const b=await body(r);if(b.action==='close')m.open=false;else if(b.action==='open'){m.open=true;m.released=false;}else if(b.action==='release'){m.open=false;m.released=true;}else return json({error:'Unknown action.'},400);
  await store.put('meta',m);return json(info());
 }
 return json({error:'Not found.'},404);
 }
}
