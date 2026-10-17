export {limitedJSON,admit} from './budget.mjs';
export const MODEL='@cf/meta/llama-3.1-8b-instruct-fp8';
export const LIMITS={output:200,perTurn:5000};
export function validate(b){
 if(!b||Object.hasOwn(b,'topq')||!['persona','sampling'].includes(b.mode)||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>1200)throw Error('invalid_input');
 if(!Number.isFinite(b.temperature)||b.temperature<0||b.temperature>2||!Number.isInteger(b.topk)||b.topk<1||b.topk>50||!Number.isFinite(b.topp)||b.topp<0.01||b.topp>1)throw Error('invalid_input');
 if(b.mode==='persona'&&(typeof b.system!=='string'||!b.system.trim()||b.system.length>1600))throw Error('invalid_input');
 return {mode:b.mode,prompt:b.prompt.trim(),system:b.mode==='persona'?b.system.trim():'',temperature:b.temperature,topk:b.topk,topp:b.topp};
}
export function messages(b){return [{role:'system',content:'You are participating in an introductory linguistics classroom activity. Reply in English, in plain text, at most 100 words. Do not claim to have taken actions outside the conversation. '+(b.mode==='persona'?b.system:'Respond to the requested writing task directly. Do not explain your sampling settings.')},{role:'user',content:b.prompt}];}
