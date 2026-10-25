"use strict";
(()=>{
  const intervalMs=60000;
  const sources=['https://k4mik4zz3-droid.github.io/zeroskilla-dev-studio/releases.json','./releases.json'];
  const subscribers=new Set();
  let current=null,signature='',pending=null,timer=null;
  const valid=data=>data?.schemaVersion===2&&data.releases&&typeof data.releases==='object'&&!Array.isArray(data.releases)&&Number.isFinite(Date.parse(data.lastChecked));
  function deliver(subscriber,data){try{subscriber.update(data)}catch(error){subscriber.error?.(error)}}
  function refresh(){
    if(pending)return pending;
    pending=(async()=>{
      let data=null,lastError;
      for(const source of sources){
        try{
          const response=await fetch(source+'?v='+Math.floor(Date.now()/intervalMs),{cache:'no-store',signal:AbortSignal.timeout(15000)});
          if(!response.ok)throw Error('Manifest niedostępny');
          const result=await response.json();
          if(!valid(result))throw Error('Nieprawidłowy manifest');
          data=result;break;
        }catch(error){lastError=error;}
      }
      if(!data){if(!current)for(const subscriber of subscribers)subscriber.error?.(lastError);return;}
      if(current&&Date.parse(data.lastChecked)<Date.parse(current.lastChecked))return;
      const nextSignature=JSON.stringify(data.releases);
      current=data;
      if(nextSignature!==signature){signature=nextSignature;for(const subscriber of subscribers)deliver(subscriber,data);}
    })().finally(()=>{pending=null});
    return pending;
  }
  function watch(update,error){
    const subscriber={update,error};subscribers.add(subscriber);
    if(current)deliver(subscriber,current);else refresh();
    if(!timer)timer=setInterval(()=>{if(!document.hidden)refresh()},intervalMs);
    return ()=>{subscribers.delete(subscriber);if(!subscribers.size){clearInterval(timer);timer=null;}};
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&subscribers.size)refresh()});
  globalThis.addEventListener?.('focus',()=>{if(subscribers.size)refresh()});
  globalThis.ZeroSkillaReleases=Object.freeze({watch,refresh});
})();
