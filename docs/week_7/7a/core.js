/* Shared pure validation and comparison functions; no network or storage. */
(function(root){
'use strict';
const MAX_RUNS=60, MAX_MARKS=300;
function validateRun(r,clip){
 if(!r || typeof r.id!=='string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(r.id) || r.clipId!==clip.id || r.complete!==true || !Array.isArray(r.marks) || r.marks.length>MAX_MARKS || typeof r.exposed!=='boolean') throw Error('Invalid participant record.');
 if(!r.marks.every(t=>Number.isFinite(t)&&t>=0&&t<=clip.duration)) throw Error('A marker lies outside this recording.');
 const marks=[...r.marks].sort((a,b)=>a-b);
 if(marks.some((t,i)=>i&&t-marks[i-1]<0.12)) throw Error('Repeated markers are too close together.');
 return {id:r.id,clipId:clip.id,complete:true,exposed:r.exposed,marks};
}
function merge(existing,payload,clip){
 if(!payload||payload.format!=='ling2150-7a'||payload.version!==1||payload.clipId!==clip.id||payload.duration!==clip.duration||!Array.isArray(payload.runs)||payload.runs.length>MAX_RUNS) throw Error('Choose a 7A results file for this exact recording and version.');
 const incoming=payload.runs.map(r=>validateRun(r,clip));
 const byId=new Map(existing.map(r=>[r.id,validateRun(r,clip)]));
 for(const r of incoming){const old=byId.get(r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw Error('Conflicting copies of the same participant. No records were imported.');byId.set(r.id,r);}
 if(byId.size>MAX_RUNS)throw Error('This comparison supports up to 60 participants.');
 return [...byId.values()];
}
function bins(runs,duration,width=1){
 const result=Array.from({length:Math.ceil(duration/width)},()=>0);
 for(const r of runs){const seen=new Set(r.marks.map(t=>Math.min(result.length-1,Math.floor(t/width))));for(const i of seen)result[i]++;}
 return result;
}
const api={MAX_RUNS,MAX_MARKS,validateRun,merge,bins};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.BC_CORE=api;
})(typeof window!=='undefined'?window:globalThis);
