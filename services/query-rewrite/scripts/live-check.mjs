// Real endpoint probe only. Does not simulate or substitute model outputs.
// MODEL_API=https://... ORIGIN=https://uga-ling2150.github.io node scripts/live-check.mjs [concurrency]
import fs from 'node:fs/promises';
const base=process.env.MODEL_API,origin=process.env.ORIGIN||'https://uga-ling2150.github.io';
if(!base)throw new Error('Set MODEL_API to the deployed Worker URL.');
const n=Number(process.argv[2]||1);if(!Number.isInteger(n)||n<1||n>60)throw new Error('Choose 1–60 sessions. Each uses real free quota.');
const cases=[
  [{role:'human',text:'I chose the blue backpack.'},{role:'ai',text:'What would you like to know about it?'},{role:'human',text:'Is it waterproof?'}],
  [{role:'human',text:'I would like to collect the book.'},{role:'ai',text:'On Friday or Saturday?'},{role:'human',text:'On Saturday, please.'}],
  [{role:'human',text:'What is a pronoun?'}],
  [{role:'human',text:'Sam and Alex each have a bicycle.'},{role:'ai',text:'What would you like to know?'},{role:'human',text:'Is it new?'}],
  [{role:'human',text:'I want the red bag, not the blue bag.'},{role:'ai',text:'Would you like the red bag delivered?'},{role:'human',text:'Do not send it yet.'}],
  [{role:'human',text:'We discussed the museum. Now I want to ask about the library.'},{role:'ai',text:'What about the library?'},{role:'human',text:'When does it close?'}]
];
const tokens=await Promise.all(Array.from({length:n},async()=>{const r=await fetch(base+'/session',{method:'POST',headers:{Origin:origin}});if(!r.ok)throw new Error('Session failed: '+r.status);return (await r.json()).token;}));
const results=await Promise.all(tokens.map(async(token,i)=>{const start=performance.now();try{const r=await fetch(base+'/rewrite',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Session':token},body:JSON.stringify({turns:cases[i%cases.length]}),signal:AbortSignal.timeout(35000)});return {case:i%cases.length,status:r.status,ms:Math.round(performance.now()-start),data:await r.json()};}catch(e){return {case:i%cases.length,status:0,ms:Math.round(performance.now()-start),error:e.message};}}));
const times=results.map(r=>r.ms).sort((a,b)=>a-b),report={at:new Date().toISOString(),kind:'REAL_WORKER_REQUESTS',sessions:n,success:results.filter(r=>r.status===200).length,p95:times[Math.ceil(n*.95)-1],cases,results};
await fs.writeFile('live-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({sessions:n,success:report.success,p95:report.p95,report:'live-results.json'}));
if(report.success!==n)process.exitCode=1;
