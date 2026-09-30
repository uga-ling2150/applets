/* Shared-clock estimates anchored to performance.now(), not the device wall clock. */
(function(root){
 class SharedClock {
  constructor(){this.samples=[];this.offset=null;this.rtt=Infinity;}
  observe(serverTime,before,after){if(!Number.isFinite(serverTime)||after<before)return;this.samples.push({offset:serverTime-(before+after)/2,rtt:after-before,at:after});this.samples=this.samples.filter(s=>after-s.at<15000).slice(-20);const best=this.samples.reduce((a,b)=>a.rtt<b.rtt?a:b);this.offset=best.offset;this.rtt=best.rtt;}
  now(t){return this.offset===null?NaN:t+this.offset;}
  position(s,t,duration){const now=this.now(t);return Math.max(0,Math.min(duration,s.position+(s.status==='running'?Math.max(0,now-s.sampleAt)/1000:0)));}
  usable(s,t,lastResponse){const now=this.now(t);return s?.status==='running'&&this.rtt<800&&t-lastResponse<2000&&now-s.heartbeatAt<2500&&now-s.sampleAt<2500;}
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=SharedClock;else root.BCSharedClock=SharedClock;
})(typeof window!=='undefined'?window:globalThis);
