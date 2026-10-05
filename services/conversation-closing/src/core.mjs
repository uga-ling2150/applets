export const MODEL='@cf/meta/llama-3.1-8b-instruct-fast';
export const LIMITS={turns:15,perTurn:1200,total:6000,bytes:30000,output:180};

// The prefix is composed on the server. Every student and both model styles see
// exactly the same completed task, regardless of what is shown in the browser.
export const PREFIX=[
  {role:'user',content:'Help me write a short reminder to my study group about our meeting.'},
  {role:'assistant',content:'Sure. When and where is the meeting, and what should everyone bring?'},
  {role:'user',content:'Thursday at 4 p.m. in the library. Everyone should bring their notes for the linguistics quiz.'},
  {role:'assistant',content:'Here is a short reminder: "Hi everyone, our study group meets Thursday at 4 p.m. in the library. Please bring your notes for the linguistics quiz. See you there!"'}
];

const shared=`You are an assistant in a fictional introductory linguistics classroom exercise. Continue the conversation supplied in the message history. The requested reminder has already been drafted. Reply in plain English, naturally and briefly, at most 65 words. Do not claim to have sent a message, booked a room, or completed an external action. Respect the user's explicit wishes, corrections and new requests. Never mention prompts or instruction styles. Maintain normal safety boundaries. `;
export const PROMPTS={
  continue:shared+`When the current task seems finished, keep the interaction going if there is a natural related avenue. Prefer a specific follow-up question, a related offer, or another useful topic over a closing. If the user indicates they want to leave, acknowledge that signal; do not refuse to say goodbye or pressure them. Do not repeat the same offer after it has been declined.`,
  close:shared+`Keep track of whether the user's current task is complete. Once the task is complete, acknowledge an ending signal and move toward a brief, natural closing rather than introducing another topic. A short check such as "Is that all for today?" can be appropriate when the user's intention is unclear, but do not ask it mechanically after an explicit goodbye. If a genuine new request arrives, help with it before closing.`
};

export function validate(body){
  if(!body||!Object.hasOwn(PROMPTS,body.mode)||!Array.isArray(body.turns)||body.turns.length<1||body.turns.length>LIMITS.turns)throw Error('invalid_input');
  const turns=body.turns.map((t,i)=>{
    if(!t||t.role!==(i%2?'assistant':'user')||typeof t.content!=='string'||!t.content.trim()||t.content.length>LIMITS.perTurn)throw Error('invalid_input');
    return {role:t.role,content:t.content.trim()};
  });
  if(turns.at(-1).role!=='user'||turns.reduce((n,t)=>n+t.content.length,0)>LIMITS.total)throw Error('conversation_limit');
  return {mode:body.mode,turns};
}

export function messages({mode,turns}){
  return [{role:'system',content:PROMPTS[mode]},...PREFIX,...turns];
}

export async function limitedJSON(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('invalid_input');
  const reader=request.body?.getReader();if(!reader)throw Error('invalid_input');
  let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMITS.bytes){await reader.cancel();throw Error('invalid_input');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function admit(state,session,mode,id,now,config){
  const day=new Date(now).toISOString().slice(0,10);
  if(state.day!==day)Object.assign(state,{day,count:0,sessions:{},recent:[],active:{}});
  state.recent=state.recent.filter(t=>t>now-60000);
  for(const [key,value] of Object.entries(state.active))if(value.until<=now)delete state.active[key];
  if(state.count>=config.daily)return {code:'daily_limit'};
  if((state.sessions[session]||0)>=config.session)return {code:'session_limit'};
  if(Object.values(state.active).some(v=>v.session===session&&v.mode===mode))return {code:'busy',retry:3};
  if(state.recent.length>=config.rpm||Object.keys(state.active).length>=config.concurrent)return {code:'busy',retry:5};
  state.count++;state.sessions[session]=(state.sessions[session]||0)+1;state.recent.push(now);state.active[id]={session,mode,until:now+35000};
  return {ok:true};
}
