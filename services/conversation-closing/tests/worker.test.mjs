import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{Classroom} from '../src/worker.mjs';
function setup(){
  const store=new Map();let seen=[];
  const env={ENABLED:'true',SESSION_SECRET:'test-only-not-a-production-secret',AI:{run:async(model,input)=>{seen.push(input);return {response:'You are welcome. Bye!'};}},ASSETS:{fetch:async()=>new Response('page')}};
  const room=new Classroom({storage:{get:async key=>structuredClone(store.get(key)),put:async(key,value)=>store.set(key,structuredClone(value))}},env);
  env.CLASSROOM={idFromName:key=>key,get:()=>({fetch:(url,init)=>room.fetch(new Request(url,init))})};
  const waits=[];const ctx={waitUntil:promise=>waits.push(promise)};
  return {env,ctx,waits,seen,store};
}
const req=(path,body,token)=>new Request('https://10a.test'+path,{method:'POST',headers:{'Content-Type':'application/json','Origin':'null',...(token?{'X-Session':token}:{})},body:JSON.stringify(body||{})});

test('requires a signed session and keeps private annotations out of inference',async()=>{
  const {env,ctx,waits,seen}=setup();
  const body={mode:'close',turns:[{role:'user',content:'Thanks. Bye!'}],prediction:'PRIVATE PREDICTION',evidence:'PRIVATE EVIDENCE'};
  assert.equal((await worker.fetch(req('/api/chat',body),env,ctx)).status,401);
  const {token}=await(await worker.fetch(req('/api/session'),env,ctx)).json();
  const result=await worker.fetch(req('/api/chat',body,token),env,ctx);
  assert.equal(result.status,200);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'*');
  assert.equal(seen.length,1);assert.equal(seen[0].messages.at(-1).content,'Thanks. Bye!');
  assert.ok(!JSON.stringify(seen[0]).includes('PRIVATE'));
  await Promise.all(waits);
});

test('failed inference releases capacity, and disabling AI preserves the page',async()=>{
  const {env,ctx,waits,store}=setup();env.AI.run=async()=>{throw Error('provider down');};
  const {token}=await(await worker.fetch(req('/api/session'),env,ctx)).json();
  assert.equal((await worker.fetch(req('/api/chat',{mode:'continue',turns:[{role:'user',content:'Bye'}]},token),env,ctx)).status,503);
  await Promise.all(waits);assert.equal(store.get('budget').count,1);assert.equal(Object.keys(store.get('budget').active).length,0);
  env.ENABLED='false';assert.equal(await(await worker.fetch(new Request('https://10a.test/'),env,ctx)).text(),'page');
  assert.equal((await worker.fetch(req('/api/session'),env,ctx)).status,503);
});
