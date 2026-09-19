const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export const token=()=>crypto.randomUUID()+crypto.randomUUID();
export async function authHandle(ctx,env,r,readBody){
 const store=ctx.storage,path=new URL(r.url).pathname,now=Date.now();
 const bearer=r.headers.get('Authorization')?.match(/^Bearer ([a-zA-Z0-9-]{72})$/)?.[1];
 const sessionKey=bearer?'session:'+await digest(bearer):'';
 const session=sessionKey?await store.get(sessionKey):null;
 const loggedIn=session&&session.expiresAt>now;
 if(path==='/auth/check')return loggedIn?json({username:session.username,teacherId:session.teacherId}):json({error:'Please sign in with your authorized GitHub account.'},401);
 if(path==='/auth/logout'){if(sessionKey)await store.delete(sessionKey);return json({ok:true});}
 if(path==='/auth/add-room'){const room=await readBody(r);await store.put('room:'+room.code,room);return json({ok:true});}
 if(path==='/auth/rooms'){if(!loggedIn)return json({error:'Teacher sign-in is required.'},401);const rooms=[...(await store.list({prefix:'room:'})).values()].filter(x=>x.expiresAt>now&&x.teacherId===session.teacherId).sort((a,b)=>b.createdAt-a.createdAt);return json({username:session.username,rooms});}
 if(path==='/auth/new-state'){const b=await readBody(r);const rate='rate:'+Math.floor(now/600000)+':'+await digest(r.headers.get('CF-Connecting-IP')||'unknown');const n=await store.get(rate)||0;if(n>=20)return json({error:'Too many sign-in attempts. Try again in 10 minutes.'},429);await store.put(rate,n+1);await store.put('state:'+await digest(b.state),{verifier:b.verifier,expiresAt:now+600000});await store.put('auth-store',true);await store.setAlarm(now+86400000);return json({ok:true});}
 if(path==='/auth/use-state'){const b=await readBody(r),key='state:'+await digest(b.state),value=await store.get(key);await store.delete(key);return value&&value.expiresAt>now?json(value):json({error:'Sign-in expired. Please try again.'},401);}
 if(path==='/auth/issue'){const b=await readBody(r);const allowed=(env.GITHUB_TEACHER_IDS||'').split(',').map(x=>x.trim());if(!allowed.includes(String(b.id)))return json({error:'This GitHub account is not authorized as a teacher.'},403);const handoff=token();await store.put('handoff:'+await digest(handoff),{teacherId:String(b.id),username:b.login,expiresAt:now+60000});return json({handoff});}
 if(path==='/auth/exchange'&&r.method==='POST'){const b=await readBody(r);if(typeof b.handoff!=='string'||b.handoff.length>100)return json({error:'Invalid sign-in response.'},400);const key='handoff:'+await digest(b.handoff),value=await store.get(key);await store.delete(key);if(!value||value.expiresAt<=now)return json({error:'Sign-in expired. Please try again.'},401);const sessionToken=token(),expiresAt=now+8*3600000;await store.put('session:'+await digest(sessionToken),{...value,expiresAt});return json({token:sessionToken,username:value.username,expiresAt});}
 return json({error:'Not found.'},404);
}
export async function cleanAuth(ctx){for(const prefix of ['session:','state:','handoff:','room:','rate:'])for(const [key,value]of await ctx.storage.list({prefix})){if(prefix==='rate:'||value.expiresAt<=Date.now())await ctx.storage.delete(key);}await ctx.storage.setAlarm(Date.now()+86400000);}
const PAGE='https://uga-ling2150.github.io/applets/week_7/7A_backchannel_locations.html';
export async function oauth(r,env,auth){
 const url=new URL(r.url),callback=url.origin+'/api/teacher/callback';
 const redirect=(fragment,cookie='')=>new Response(null,{status:302,headers:{Location:PAGE+'#'+fragment,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
 if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.GITHUB_TEACHER_IDS)return redirect('teacher-error=configuration');
 if(url.pathname.endsWith('/start')){
  const state=token(),verifier=token();const admitted=await auth.fetch('https://internal/auth/new-state',{method:'POST',headers:r.headers,body:JSON.stringify({state,verifier})});if(!admitted.ok)return redirect('teacher-error=busy');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));const challenge=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const params=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,redirect_uri:callback,state,code_challenge:challenge,code_challenge_method:'S256',allow_signup:'false'});
  return new Response(null,{status:302,headers:{Location:'https://github.com/login/oauth/authorize?'+params,'Set-Cookie':'__Host-7a-oauth='+state+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 const cookie=r.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-7a-oauth=([a-zA-Z0-9-]+)/)?.[1];const state=url.searchParams.get('state'),code=url.searchParams.get('code');const clear='__Host-7a-oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
 if(!cookie||state!==cookie||!code)return redirect('teacher-error=signin',clear);
 const stateResult=await auth.fetch('https://internal/auth/use-state',{method:'POST',body:JSON.stringify({state})});if(!stateResult.ok)return redirect('teacher-error=signin',clear);const {verifier}=await stateResult.json();
 try{
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback,code_verifier:verifier})});const value=await response.json();if(!response.ok||!value.access_token)return redirect('teacher-error=signin',clear);
  const profile=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+value.access_token,Accept:'application/vnd.github+json','User-Agent':'LING2150-7A'}});if(!profile.ok)return redirect('teacher-error=signin',clear);const user=await profile.json();
  const issued=await auth.fetch('https://internal/auth/issue',{method:'POST',body:JSON.stringify({id:user.id,login:user.login})});if(!issued.ok)return redirect('teacher-error=unauthorized',clear);const {handoff}=await issued.json();return redirect('teacher-signin='+handoff,clear);
 }catch{return redirect('teacher-error=signin',clear);}
}
