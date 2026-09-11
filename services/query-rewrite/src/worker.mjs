import {MODEL,LIMITS,validate,parseRewrite,messages,limitedJSON,admit} from './core.mjs';
const enc=new TextEncoder();
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function token(secret){const payload=`${crypto.randomUUID()}.${Date.now()+86400000}`;return `${payload}.${hex(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(payload)))}`;}
async function session(request,secret){
  const t=request.headers.get('X-Session')||'';if(!/^[\da-f-]{36}\.\d{13}\.[\da-f]{64}$/.test(t))return null;
  const [id,exp,sig]=t.split('.');if(Number(exp)<Date.now())return null;
  const bytes=new Uint8Array(sig.match(/../g).map(x=>parseInt(x,16)));
  return await crypto.subtle.verify('HMAC',await key(secret),bytes,enc.encode(`${id}.${exp}`))?id:null;
}
export default {async fetch(request,env,ctx){
  const origin=request.headers.get('Origin');
  const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim());
  if(!origin || !allowed.includes(origin))return json({error:'origin_not_allowed'},403);
  const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Session','Access-Control-Expose-Headers':'Retry-After'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const reply=(d,s=200,h={})=>json(d,s,{...cors,...h});
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return reply({enabled:env.ENABLED==='true',model:env.MODEL||MODEL});
  if(env.ENABLED!=='true' || !env.SESSION_SECRET || !env.AI || !env.CLASSROOM)return reply({error:'unavailable'},503);
  if(path==='/session'&&request.method==='POST')return reply({token:await token(env.SESSION_SECRET)});
  if(path!=='/rewrite'||request.method!=='POST')return reply({error:'not_found'},404);
  const sid=await session(request,env.SESSION_SECRET);if(!sid)return reply({error:'session_expired'},401);
  let turns;try{turns=validate(await limitedJSON(request));}catch(e){return reply({error:'invalid_input',message:e.message},400);}
  const id=crypto.randomUUID(), gate=env.CLASSROOM.get(env.CLASSROOM.idFromName('5c'));
  let admission;
  try{admission=await (await gate.fetch('https://internal/admit',{method:'POST',body:JSON.stringify({session:sid,id})})).json();}catch{return reply({error:'unavailable'},503);}
  if(!admission.ok)return reply({error:admission.code},429,admission.retry?{'Retry-After':String(admission.retry)}:{});
  let timer;
  try{
    const result=await Promise.race([env.AI.run(env.MODEL||MODEL,{messages:messages(turns),max_tokens:LIMITS.output,temperature:0}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),25000);})]);
    const raw=typeof result.response==='string'?result.response:result.choices?.[0]?.message?.content;
    const rewrite=parseRewrite(raw);
    return reply({rewrite,model:env.MODEL||MODEL});
  }catch(e){return reply({error:e.message==='timeout'?'timeout':'model_unavailable'},503);}
  finally{clearTimeout(timer);ctx.waitUntil(gate.fetch('https://internal/release',{method:'POST',body:JSON.stringify({id})}).catch(()=>{}));}
}};
export class Classroom {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.queue=Promise.resolve();}
  fetch(request){const task=this.queue.then(()=>this.handle(request));this.queue=task.catch(()=>{});return task;}
  async handle(request){
    const state=await this.ctx.storage.get('budget')||{};const body=await request.json();
    if(new URL(request.url).pathname==='/release'){if(state.active)delete state.active[body.id];await this.ctx.storage.put('budget',state);return json({ok:true});}
    const number=(name,fallback)=>Number.isFinite(Number(this.env[name]))&&Number(this.env[name])>0?Math.floor(Number(this.env[name])):fallback;
    const result=admit(state,body.session,body.id,Date.now(),{daily:number('DAILY_REQUEST_LIMIT',360),session:number('SESSION_REQUEST_LIMIT',24),rpm:number('RPM_LIMIT',240),concurrent:number('CONCURRENCY_LIMIT',60)});
    await this.ctx.storage.put('budget',state);return json(result);
  }
}
