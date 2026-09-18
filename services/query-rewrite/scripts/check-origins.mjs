import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Three real model calls; never save session tokens in the report.
const base=process.env.MODEL_API;
if(!base)throw new Error('Set MODEL_API to the deployed Worker URL');
const results=[];
for(const origin of ['https://uga-ling2150.github.io','http://localhost:5500','null']){
  const pre=await fetch(`${base}/rewrite`,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-session'}});
  assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'*');
  const session=await fetch(`${base}/session`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(session.status,200);assert.equal(session.headers.get('access-control-allow-origin'),'*');
  const {token}=await session.json();
  const start=Date.now();
  const response=await fetch(`${base}/rewrite`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Session':token},body:JSON.stringify({turns:[{role:'human',text:'I chose the blue backpack.'},{role:'ai',text:'What would you like to know about it?'},{role:'human',text:'Is it waterproof?'}]})});
  const data=await response.json();
  results.push({origin,preflight:pre.status,session:session.status,rewrite:response.status,cors:response.headers.get('access-control-allow-origin'),ms:Date.now()-start,data});
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');assert.equal(typeof data.rewrite,'string');
}
const report={at:new Date().toISOString(),results};
if(process.env.RESULT_PATH)await writeFile(process.env.RESULT_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
