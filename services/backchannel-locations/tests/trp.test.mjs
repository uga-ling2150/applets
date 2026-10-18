import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{BackchannelRoom} from '../src/worker.mjs';
import {CLIPS} from '../src/recordings.mjs';
class Store {
  data=new Map();
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){if(typeof k==='string')this.data.set(k,structuredClone(v));else for(const [a,b] of Object.entries(k))this.data.set(a,structuredClone(b));}
  async list({prefix}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)));}
  async delete(k){this.data.delete(k);}
  async deleteAll(){this.data.clear();}
  async setAlarm(){}
}
function setup(){
  const objects=new Map();
  const env={GITHUB_TEACHER_IDS:'43101723',ROOMS:{idFromName:x=>x,get:id=>{
    if(!objects.has(id))objects.set(id,new BackchannelRoom({storage:new Store()},env));
    return {fetch:(input,init)=>objects.get(id).fetch(input instanceof Request?input:new Request(input,init))};
  }}};
  const call=(p,method='GET',body,headers={})=>worker.fetch(new Request('https://test/api'+p,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {env,call};
}
async function login(s){
 const auth=s.env.ROOMS.get('teacher-account');
 const issued=await auth.fetch('https://internal/auth/issue',{method:'POST',body:JSON.stringify({id:43101723,login:'teacher-test'})});
 const {handoff}=await issued.json();return (await(await s.call('/teacher/exchange','POST',{handoff})).json()).token;
}
test('TRP collections are separate for all five excerpts and from Backchannel',async()=>{
 const s=setup();const codes=[];
 for(const [id,duration] of Object.entries(CLIPS).filter(([id])=>id.startsWith('trp-9a-'))){
  const r=await s.call('/current?clipId='+id);assert.equal(r.status,200);const collection=await r.json();codes.push(collection.code);
  assert.equal(collection.clipId,id);assert.equal((await(await s.call('/rooms/'+collection.code)).json()).duration,duration);
 }
 codes.push((await(await s.call('/current')).json()).code);assert.equal(new Set(codes).size,6);
 assert.equal((await s.call('/current?clipId=__proto__')).status,400);
});
test('TRP accepts one click or no click, preserves retries, and protects unreleased results',async()=>{
 const s=setup(),token=await login(s),teacher={Authorization:'Bearer '+token};
 const {code}=await(await s.call('/current?clipId=trp-9a-access-v1')).json(),base='/rooms/'+code;
 assert.equal((await s.call(base+'/live-control','POST',{action:'prepare'})).status,403);
 const {session}=await(await s.call(base+'/live-control','POST',{action:'prepare'},teacher)).json();
 const keys=Array.from({length:60},()=>crypto.randomUUID());
 for(const key of keys)assert.equal((await s.call(base+'/live-join','POST',{}, {'X-Participant-Key':key})).status,200);
 const h={'X-Participant-Key':keys[0]},save={marks:[2],exposed:false,sequence:1,complete:false};
 assert.equal((await s.call(base+'/live-save','POST',{...save,marks:[2,3]},h)).status,400);
 assert.equal((await s.call(base+'/live-save','POST',save,h)).status,200);
 assert.equal((await s.call(base+'/live-save','POST',{...save,marks:[3]},h)).status,200);
 const own=await(await s.call(base+'/live-join','POST',{},h)).json();assert.deepEqual(own.record.marks,[2]);
 assert.equal((await s.call(base+'/live-results')).status,403);
 const control={sessionId:session.id,controller:crypto.randomUUID()};
 await s.call(base+'/live-control','POST',{...control,action:'start'},teacher);
 const current=(await(await s.call(base+'/live')).json()).session;
 await s.call(base+'/live-control','POST',{...control,action:'anchor',revision:current.revision,status:'ended',position:6.77,sampleAt:Date.now()},teacher);
 for(let i=0;i<keys.length;i++)assert.equal((await s.call(base+'/live-save','POST',{marks:i?[3]:[],exposed:false,sequence:2,complete:true},{'X-Participant-Key':keys[i]})).status,200);
 assert.equal((await s.call(base+'/live-save','POST',{...save,sequence:3},h)).status,409);
 await s.call(base+'/live-control','POST',{sessionId:session.id,action:'release'},teacher);
 const results=await(await s.call(base+'/live-results')).json();assert.equal(results.records.length,60);assert.equal(results.records[0].marks.length,0);
 assert.ok(results.records.every(r=>!Object.hasOwn(r,'submittedAt')));
});
test('9A OAuth returns only to the allowlisted page and retains PKCE and single-use state',async()=>{
 const s=setup();Object.assign(s.env,{GITHUB_CLIENT_ID:'test',GITHUB_CLIENT_SECRET:'test'});
 const response=await s.call('/teacher/start?activity=9a');const target=new URL(response.headers.get('location')),state=target.searchParams.get('state');
 assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.equal(target.searchParams.get('scope'),null);
 const original=globalThis.fetch;globalThis.fetch=async url=>String(url).includes('access_token')?Response.json({access_token:'fake'}):Response.json({id:43101723,login:'teacher-test'});
 try {
  const result=await s.call('/teacher/callback?state='+state+'&code=test','GET',null,{Cookie:'__Host-7a-oauth='+state});
  assert.match(result.headers.get('location'),/^https:\/\/uga-ling2150\.github\.io\/applets\/week_9\/9A_turn_taking_trps\.html#teacher-signin=/);
  const again=await s.call('/teacher/callback?state='+state+'&code=test','GET',null,{Cookie:'__Host-7a-oauth='+state});assert.match(again.headers.get('location'),/teacher-error=signin$/);
  const other=await s.call('/teacher/start?activity=https://example.com');const state2=new URL(other.headers.get('location')).searchParams.get('state');
  const returned=await s.call('/teacher/callback?state='+state2+'&code=test','GET',null,{Cookie:'__Host-7a-oauth='+state2});assert.ok(returned.headers.get('location').includes('/week_7/7A_backchannel_locations.html'));
 }finally{globalThis.fetch=original;}
});
