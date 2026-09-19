// Fixed course URL resolves to one automatically provisioned collection.
// Private legacy rooms are never imported into this shared collection.
export async function sharedCollection(ctx,env,path,request){
 const store=ctx.storage,now=Date.now();
 if(path==='/shared/list'){const rows=[...(await store.list({prefix:'collection:'})).values()].filter(x=>x.expiresAt>now);return Response.json({rooms:rows.sort((a,b)=>b.createdAt-a.createdAt)});}
 let current=await store.get('current');
 if(path==='/shared/next'||!current||current.expiresAt<=now){
  const clipId='ami-is1008b-b-383000-450300-v1';
  const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%32]).join('');
  const room=env.ROOMS.get(env.ROOMS.idFromName(code));
  const response=await room.fetch('https://internal/init',{method:'POST',body:JSON.stringify({code,clipId,shared:true})});
  if(!response.ok)return response;
  current={...await response.json(),shared:true,createdAt:now};
  await store.put({current,['collection:'+code]:current});
 }
 return Response.json(current,{headers:{'Cache-Control':'no-store'}});
}
