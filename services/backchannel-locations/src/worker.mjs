import {liveRequest} from './live.mjs';
import {sharedCollection} from './shared.mjs';
import {recordEvents,submitAttempt,auditRecords} from './audit.mjs';
import {authHandle,cleanAuth,oauth} from './auth.mjs';
const CLIPS={'ami-es2003b-a-599500-765650-v1':166.15,'ami-is1005c-c-461490-609600-v1':148.11,'ami-is1008b-b-383000-450300-v1':67.3,'ami-ib4010-a-172300-232900-v1':60.6};
const TTL=30*86400000,MAX=60;
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function body(r){if(Number(r.headers.get('content-length'))>16000)throw Error('Request too large.');const reader=r.body?.getReader();if(!reader)return {};let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16000){await reader.cancel();throw Error('Request too large.');}chunks.push(value);}let all=new Uint8Array(bytes),i=0;for(const c of chunks){all.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(all));}
export function validRun(r,clipId){if(!r||r.clipId!==clipId||r.complete!==true||typeof r.exposed!=='boolean'||!Array.isArray(r.marks)||r.marks.length>300)throw Error('Invalid completed round.');const marks=[...r.marks];if(!marks.every((t,i)=>Number.isFinite(t)&&t>=0&&t<=CLIPS[clipId]&&(!i||t-marks[i-1]>=0.12)))throw Error('Invalid marker times.');return {clipId,complete:true,exposed:r.exposed,marks};}
export default {async fetch(r,env){
 const origin=r.headers.get('Origin')||'';const allowed=['https://uga-ling2150.github.io','http://127.0.0.1:8903','null'];const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'https://uga-ling2150.github.io','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Participant-Key','Vary':'Origin'};
 if(r.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 let result;try{
 const p=new URL(r.url).pathname;
 const auth=env.ROOMS.get(env.ROOMS.idFromName('teacher-account'));
 const teacherRoute=p.match(/^\/api\/teacher\/(exchange|logout|session|rooms)$/);
 let identity=null;const isTeacher=async()=>{const check=await auth.fetch(new Request('https://internal/auth/check',{headers:r.headers}));if(check.ok)identity=await check.json();return check.ok;};
 if(p==='/api/health')result=json({ok:true,version:'7a-live-1'});
 else if(['/api/teacher/start','/api/teacher/callback'].includes(p)&&r.method==='GET')return oauth(r,env,auth);
 else if(p==='/api/current'&&r.method==='GET')result=await env.ROOMS.get(env.ROOMS.idFromName('shared-directory')).fetch('https://internal/shared/current'+new URL(r.url).search);
 else if(p==='/api/teacher/next'&&r.method==='POST'){if(!await isTeacher())result=json({error:'Teacher sign-in is required.'},401);else result=await env.ROOMS.get(env.ROOMS.idFromName('shared-directory')).fetch('https://internal/shared/next'+new URL(r.url).search,{method:'POST'});}
 else if(teacherRoute){const action=teacherRoute[1]==='session'?'check':teacherRoute[1];result=await auth.fetch(new Request('https://internal/auth/'+action,r));if(action==='rooms'&&result.ok){const own=await result.json();const shared=await(await env.ROOMS.get(env.ROOMS.idFromName('shared-directory')).fetch('https://internal/shared/list')).json();result=json({...own,rooms:[...shared.rooms,...own.rooms]});}}
 else if(p==='/api/rooms'&&r.method==='POST'){
  if(!await isTeacher())return new Response(JSON.stringify({error:'Teacher sign-in is required to create an activity.'}),{status:401,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  const b=await body(r);if(!CLIPS[b.clipId])throw Error('Choose an available recording.');
  const gate=env.ROOMS.get(env.ROOMS.idFromName('creation-limit'));
  const admitted=await gate.fetch('https://internal/quota',{method:'POST'});if(!admitted.ok)result=admitted;
  else {const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');const room=env.ROOMS.get(env.ROOMS.idFromName(code));result=await room.fetch('https://internal/init',{method:'POST',body:JSON.stringify({code,clipId:b.clipId,createdAt:Date.now(),teacherId:identity.teacherId})});if(result.ok){const created=await result.json();await auth.fetch('https://internal/auth/add-room',{method:'POST',body:JSON.stringify({...created,createdAt:Date.now(),teacherId:identity.teacherId})});result=json(created);}}
 }else{
  const m=p.match(/^\/api\/rooms\/([A-Z2-9]{8})(?:\/(join|submit|results|manage|events|audit|live|live-control|live-join|live-save|live-results))?$/);if(!m)result=json({error:'Activity not found.'},404);else {const forwarded=new Request('https://internal/'+(m[2]||'info')+new URL(r.url).search,r);forwarded.headers.delete('X-Verified-Teacher');forwarded.headers.delete('X-Teacher-Key');if(r.headers.has('Authorization')){if(!await isTeacher())result=json({error:'Your teacher session has expired. Please sign in again.'},401);else forwarded.headers.set('X-Verified-Teacher',identity.teacherId);}if(!result)result=await env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(forwarded);}
 }
 }catch(e){result=json({error:e instanceof SyntaxError?'Invalid JSON.':e.message||'Service unavailable.'},400);}
 const h=new Headers(result.headers);for(const [k,v] of Object.entries(cors))h.set(k,v);return new Response(result.body,{status:result.status,headers:h});
}};
export class BackchannelRoom{
 constructor(ctx,env={}){this.ctx=ctx;this.env=env;this.queue=Promise.resolve();}
 fetch(r){const p=this.queue.then(()=>this.handle(r));this.queue=p.catch(()=>{});return p;}
 async alarm(){if(await this.ctx.storage.get('auth-store'))await cleanAuth(this.ctx);else await this.ctx.storage.deleteAll();}
 async handle(r){
 const store=this.ctx.storage,path=new URL(r.url).pathname,now=Date.now();
 if(path.startsWith('/shared/'))return sharedCollection(this.ctx,this.env,path,r);
 if(path.startsWith('/auth/'))return authHandle(this.ctx,this.env,r,body);
 if(path==='/quota') {const day=Math.floor(now/86400000);let q=await store.get('quota')||{day,n:0};if(q.day!==day)q={day,n:0};if(q.n>=100)return json({error:'Daily activity-creation limit reached. Try again tomorrow.'},429);q.n++;await store.put('quota',q);return json({ok:true});}
 if(path==='/init'&&r.method==='POST'){if(await store.get('meta'))return json({error:'Please create the activity again.'},409);const b=await body(r);const m={...b,createdAt:now,expiresAt:now+TTL,open:true,released:false,joined:0,submitted:0};await store.put('meta',m);await store.setAlarm(m.expiresAt);return json({code:m.code,clipId:m.clipId,expiresAt:m.expiresAt});}
 const m=await store.get('meta');if(!m||m.expiresAt<=now)return json({error:'This activity does not exist or has expired.'},404);
 const verifiedTeacher=r.headers.get('X-Verified-Teacher');const teacher=!!verifiedTeacher&&(!m.teacherId||verifiedTeacher===m.teacherId);
 if(path.startsWith('/live'))return liveRequest({store,m,path,r,teacher,body,hash,duration:CLIPS[m.clipId],now});
 const info=()=>({code:m.code,clipId:m.clipId,duration:CLIPS[m.clipId],open:m.open,released:m.released,joined:m.joined,submitted:m.submitted,totalSubmissions:m.totalSubmissions??m.submitted,expiresAt:m.expiresAt});
 if(path==='/info'&&r.method==='GET')return json(info());
 if(path==='/join'&&r.method==='POST'){
  const b=await body(r);if(typeof b.key!=='string'||!/^[a-zA-Z0-9-]{36,100}$/.test(b.key))return json({error:'Invalid browser participant key.'},400);
  const k=await hash(b.key);let s=await store.get('participant:'+k);
  if(!s){if(!m.open||m.released)return json({error:'The teacher has closed this activity.'},409);if(m.joined>=MAX)return json({error:'This activity is full (60 participants).'},409);s={id:crypto.randomUUID(),number:++m.joined,submitted:false};await store.put({['participant:'+k]:s,meta:m});}
  const attempts=[...(await store.list({prefix:'attempt:'+s.id+':'})).values()];const first=await store.get('run:'+s.id);
  return json({...info(),participant:s.number,submittedByYou:s.submitted,attemptCount:s.attemptCount||0,legacyFirst:!!(first&&!attempts.some(a=>a.id===first.id)),receipts:attempts.filter(a=>a.status==='complete').map(a=>({id:a.clientAttemptId,attempt:a.attempt,submittedAt:a.submittedAt})),completedAttemptIds:attempts.filter(a=>a.status==='complete').map(a=>a.clientAttemptId)});
 }
 if((path==='/submit'||path==='/events')&&r.method==='POST'){
  const k=await hash(r.headers.get('X-Participant-Key')||'');const s=await store.get('participant:'+k);if(!s)return json({error:'Join the activity before submitting.'},401);
  const b=await body(r);return path==='/events'?recordEvents(store,m,s,k,b):submitAttempt(store,m,s,k,b,validRun);
 }
 if(path==='/audit'&&r.method==='GET'){if(!teacher)return json({error:'Activity history is visible only to the authorized teacher.'},403);return auditRecords(store,m);}
 if(path==='/results'&&r.method==='GET'){
  if(!teacher&&!m.released)return json({error:'The teacher has not released the comparison yet.'},403);
  const rows=await store.list({prefix:'run:'});const runs=[...rows.values()].sort((a,b)=>a.participant-b.participant);return json({...info(),format:'ling2150-7a',version:1,runs});
 }
 if(path==='/manage'&&r.method==='POST'){
  if(!teacher)return json({error:'Teacher sign-in is required.'},403);
  const b=await body(r);if(b.action==='close')m.open=false;else if(b.action==='open'){m.open=true;m.released=false;}else if(b.action==='release'){m.open=false;m.released=true;}else return json({error:'Unknown action.'},400);
  await store.put('meta',m);return json(info());
 }
 return json({error:'Not found.'},404);
 }
}
