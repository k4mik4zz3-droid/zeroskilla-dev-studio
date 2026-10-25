import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {buildCatalog,parseTag} from './release-catalog.mjs';
import {releaseNotes} from './release-notes.mjs';
const repo='owner/releases',digest='sha256:'+'a'.repeat(64);
function release(tag,names,extra={}){return {tag_name:tag,published_at:'2026-10-23T12:00:00Z',name:tag,...extra,assets:names.map(name=>({name,size:100,state:'uploaded',digest,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/${name}`}))}}
test('Highest semantic version independently for engine and platform',()=>{
 const r=buildCatalog([
  release('infernal-rift-unity-v2.9.0',['Infernal-Rift-Unity-v2.9.0.apk','Infernal-Rift-Unity-v2.9.0-Windows-PC.zip']),
  release('infernal-rift-unity-android-v2.15.2',['Infernal-Rift-Unity-v2.15.2.apk']),
  release('infernal-rift-unity-windows-v2.14.1',['Infernal-Rift-Unity-v2.14.1-Windows-PC.zip']),
  release('infernal-rift-native-v0.346.0',['Infernal-Rift-v0.346.0.apk'])
 ],{planned:[{tag:'infernal-rift-unity-v99.0.0'}]},repo).releases['infernal-rift'].versions;
 assert.equal(r.length,3);
 assert.deepEqual(Object.fromEntries(r.map(v=>[v.channel,v.version])),{'unity-android':'v2.15.2','unity-windows':'v2.14.1','native-android':'v0.346.0'});
});
test('Reject drafts, previews, source ZIPs, debug, Forge, missing hashes and foreign URLs',()=>{
 const bad=release('padbridge-windows-v9.0.0',['PadBridge-v9.0.0-Windows-x64.zip']);bad.assets[0].digest=null;
 const foreign=release('padbridge-windows-v8.0.0',['PadBridge-v8.0.0-Windows-x64.zip']);foreign.assets[0].browser_download_url='https://example.com/file.zip';
 const r=buildCatalog([
  release('infernal-forge-windows-v99.0.0',['Infernal-Forge.zip']),
  release('photomind-android-v99.0.0',['PhotoMind-v99.0.0.apk']),
  release('padbridge-windows-v6.0.0',['PadBridge-v6.0.0-Windows-x64.zip'],{draft:true}),
  release('padbridge-windows-v5.0.0',['PadBridge-v5.0.0-Windows-x64.zip'],{prerelease:true}),
  release('padbridge-windows-v4.0.0',['PadBridge-v4.0.0-zrodla.zip','PadBridge-v4.0.0-debug.zip']),bad,foreign,
  release('padbridge-windows-v0.1.12',['PadBridge-v0.1.12-Windows-x64.zip'])
 ],{},repo);
 assert.equal(Object.values(r.releases).flatMap(p=>p.versions).length,1);
 assert.equal(Object.hasOwn(r.releases,'photomind'),false);
 assert.equal(r.releases.padbridge.versions[0].version,'v0.1.12');
 assert.equal(r.releases.padbridge.versions[0].files[0].sha256,'a'.repeat(64));
});
test('Incomplete newer release does not hide latest available platform',()=>{
 const r=buildCatalog([release('moj-notatnik-android-v3.0.0',[]),release('moj-notatnik-android-v2.9.7',['Moj-Notatnik-v2.9.7.apk']),release('moj-notatnik-windows-v0.1.0',['Moj-Notatnik-v0.1.0-Windows-x64.zip'])],{},repo);
 assert.equal(r.releases['moj-notatnik'].versions.length,2);
 assert.equal(parseTag('infernal-rift-native-windows-v0.346.0'),null);
});

test('Read the explicit public change section without including packaging or validation',()=>{
 const body='Plik: app.apk\nSHA256: secret\n\n## Co nowego\n- **Lepszy odczyt kontrolera.**\n- Poprawiono zapis.\n\n## Weryfikacja\n- Wewnętrzny raport';
 assert.deepEqual(releaseNotes(body),{kind:'changes',items:['Lepszy odczyt kontrolera.','Poprawiono zapis.']});
 assert.equal(releaseNotes('Gotowa paczka.\nSHA256: abc'),null);
 assert.equal(releaseNotes('<!-- ## Co nowego\n- Ukryty tekst -->'),null);
 for(const bad of ['<img src=x onerror=alert(1)>','C:\\Users\\private\\notes.txt','token=private'])assert.throws(()=>releaseNotes('## Co nowego\n- Poprawna zmiana.\n- '+bad),/Nieprawidłowy/);
});

test('Latest release never inherits an older changelog or another platform change list',()=>{
 const rows=[release('moj-notatnik-android-v2.9.7',['Moj-Notatnik-v2.9.7.apk'],{body:'## Co nowego\n- Widget nagrywania.'}),release('moj-notatnik-android-v2.9.8',['Moj-Notatnik-v2.9.8.apk']),release('moj-notatnik-windows-v0.1.0',['Moj-Notatnik-v0.1.0-Windows-x64.zip'],{body:'## Informacje o wydaniu\n- Wersja Windows.'})];
 const versions=buildCatalog(rows,{},repo).releases['moj-notatnik'].versions;
 assert.equal(versions.find(v=>v.channel==='android').version,'v2.9.8');
 assert.equal(versions.find(v=>v.channel==='android').changelog,undefined);
 assert.equal(versions.find(v=>v.channel==='android').changelogStatus,'missing');
 assert.deepEqual(versions.find(v=>v.channel==='windows').changelog,{kind:'release',items:['Wersja Windows.']});
});

test('Preserve all long, wrapped and subdivided notes including those after item 20',()=>{
 const long='Pełny opis '+('dłuższej zmiany '.repeat(60)).trim();
 const expected=['Nowości: '+long,...Array.from({length:30},(_,i)=>'Nowości: Zmiana '+(i+1)+'.'),'Poprawki: Pełny opis z dalszą częścią punktu.'];
 const body='Wstęp.\n'.repeat(16000)+'\n## Co nowego\n### Nowości\n- '+long+'\n'+Array.from({length:30},(_,i)=>'- Zmiana '+(i+1)+'.').join('\n')+'\n### Poprawki\n- Pełny opis\n\n  z dalszą częścią punktu.\n\n```text\n- Prywatny przykład kodu.\n```\n## Instalacja\n- Nie należy do zmian.';
 assert.deepEqual(releaseNotes(body),{kind:'changes',items:expected});
});

test('Invalid current notes are diagnosed without silently keeping a partial list or selecting an old package',()=>{
 const versions=buildCatalog([
  release('moj-notatnik-android-v2.9.7',['Moj-Notatnik-v2.9.7.apk'],{body:'## Co nowego\n- Starsza zmiana.'}),
  release('moj-notatnik-android-v2.9.8',['Moj-Notatnik-v2.9.8.apk'],{body:'## Co nowego\n- Nowa zmiana.\n- token=private'})
 ],{},repo).releases['moj-notatnik'].versions;
 assert.equal(versions.length,1);
 assert.equal(versions[0].version,'v2.9.8');
 assert.equal(versions[0].changelogStatus,'invalid');
 assert.equal(versions[0].changelog,undefined);
});

test('Distribution notes stay distinct from application changes',()=>{
 assert.deepEqual(releaseNotes('## Zmiany w dystrybucji\n- Podpis produkcyjny.\n\n## Suma pliku\n- abc'),{kind:'distribution',items:['Podpis produkcyjny.']});
});

test('The actual project page renders every note, including long entries after item 20',async()=>{
 const actualRepo='k4mik4zz3-droid/zeroskilla-dev-studio';
 const items=Array.from({length:31},(_,i)=>'Zmiana '+i+'. '+(i===30?'Dalszy pełny opis '.repeat(55):''));
 const row=release('moj-notatnik-android-v2.9.8',['Moj-Notatnik-v2.9.8.apk'],{body:'## Co nowego\n'+items.map(item=>'- '+item).join('\n')});
 row.assets[0].browser_download_url=row.assets[0].browser_download_url.replace(repo,actualRepo);
 row.html_url=`https://github.com/${actualRepo}/releases/tag/${row.tag_name}`;
 const catalog=buildCatalog([row],{},actualRepo);
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',addEventListener(){}});return elements.get(id);};
 const source=await readFile(new URL('../dist/project-page.js',import.meta.url),'utf8');
 runInNewContext(source,{URL,Intl,document:{body:{dataset:{project:'moj-notatnik'}},getElementById:get,querySelectorAll:()=>[]},fetch:async()=>({ok:true,json:async()=>catalog})});
 await new Promise(setImmediate);
 const html=get('download-list').innerHTML;
 assert.equal((html.match(/<li>/g)||[]).length,31);
 assert.ok(html.includes(items[30].trim()));
 assert.ok(html.includes('<h4>Co nowego</h4>'));
 assert.equal(get('availability').textContent,'Dostępne do pobrania');
 assert.equal(get('history-controls').hidden,true);
 assert.equal(get('history-engine-label').hidden,true);
 assert.equal(get('history-platform-label').hidden,true);
 assert.equal((get('history-list').innerHTML.match(/<li>/g)||[]).length,31);
});

test('History contains older verified versions while downloads keep only the latest channel',()=>{
 const rows=[
  release('infernal-rift-unity-android-v2.15.4',['Infernal-Rift-Unity-v2.15.4.apk'],{published_at:'2026-10-22T12:00:00Z',body:'## Co nowego\n- Nowa zmiana.'}),
  release('infernal-rift-unity-android-v2.15.3',['Infernal-Rift-Unity-v2.15.3.apk'],{published_at:'2026-10-24T12:00:00Z',body:'## Co nowego\n- Starsza zmiana.'}),
  release('infernal-rift-native-v0.346.0',['Infernal-Rift-v0.346.0.apk'])
 ];
 const entry=buildCatalog(rows,{},repo).releases['infernal-rift'];
 assert.equal(entry.versions.length,2);
 assert.equal(entry.versions.find(v=>v.channel==='unity-android').version,'v2.15.4');
 assert.deepEqual(entry.history.map(v=>v.version),['v2.15.3','v0.346.0','v2.15.4']);
 assert.ok(entry.history.every(v=>!Object.hasOwn(v,'files')));
 assert.equal(entry.history.find(v=>v.version==='v2.15.3').changelog.items[0],'Starsza zmiana.');
});

test('Canonical platform tags deduplicate a legacy history channel without losing the other platform',()=>{
 const entry=buildCatalog([
  release('infernal-rift-unity-v2.14.1',['Infernal-Rift-Unity-v2.14.1.apk','Infernal-Rift-Unity-v2.14.1-Windows-PC.zip']),
  release('infernal-rift-unity-android-v2.14.1',['Infernal-Rift-Unity-v2.14.1.apk']),
  release('infernal-rift-unity-android-v2.14.2',['Infernal-Rift-Unity-v2.14.2.apk'],{draft:true})
 ],{},repo).releases['infernal-rift'];
 assert.equal(entry.history.length,2);
 assert.equal(entry.history.find(v=>v.platform==='Android').tag,'infernal-rift-unity-android-v2.14.1');
 assert.equal(entry.history.find(v=>v.platform==='Windows').tag,'infernal-rift-unity-v2.14.1');
 assert.equal(entry.versions.length,2);
});

test('A shared legacy release keeps Android-only and Windows-only changes in the correct history',()=>{
 const body='## Co nowego\n### Wspólne\n- Wspólna poprawka.\n### Android\n- Obrót telefonu.\n### PC\n- Kursor myszy.\n## Instalacja\n- To nie jest zmiana.';
 const entry=buildCatalog([release('infernal-rift-unity-v2.14.1',['Infernal-Rift-Unity-v2.14.1.apk','Infernal-Rift-Unity-v2.14.1-Windows-PC.zip'],{body})],{},repo).releases['infernal-rift'];
 assert.deepEqual(entry.history.find(v=>v.platform==='Android').changelog.items,['Wspólne: Wspólna poprawka.','Android: Obrót telefonu.']);
 assert.deepEqual(entry.history.find(v=>v.platform==='Windows').changelog.items,['Wspólne: Wspólna poprawka.','PC: Kursor myszy.']);
 assert.equal(releaseNotes(body).items.length,3);
});

test('Actual history controls filter platform and engine, and never render archived package downloads',async()=>{
 const actualRepo='k4mik4zz3-droid/zeroskilla-dev-studio';
 const rows=[release('infernal-rift-unity-android-v2.15.8',['Infernal-Rift-Unity-v2.15.8.apk']),release('infernal-rift-unity-android-v2.15.7',['Infernal-Rift-Unity-v2.15.7.apk']),release('infernal-rift-unity-windows-v2.15.9',['Infernal-Rift-Unity-v2.15.9-Windows-PC.zip']),release('infernal-rift-native-v0.346.0',['Infernal-Rift-v0.346.0.apk'])];
 for(const r of rows){r.body='## Co nowego\n- Zmiana '+r.tag_name+'.';r.html_url=`https://github.com/${actualRepo}/releases/tag/${r.tag_name}`;for(const f of r.assets)f.browser_download_url=f.browser_download_url.replace(repo,actualRepo);}
 const catalog=buildCatalog(rows,{},actualRepo),elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',events:{},addEventListener(name,action){this.events[name]=action;}});return elements.get(id);};
 const source=await readFile(new URL('../dist/project-page.js',import.meta.url),'utf8');
 runInNewContext(source,{URL,Intl,document:{body:{dataset:{project:'infernal-rift'}},getElementById:get,querySelectorAll:()=>[]},fetch:async()=>({ok:true,json:async()=>catalog})});
 await new Promise(setImmediate);
 const count=()=>((get('history-list').innerHTML.match(/<details class="history-item"/g))||[]).length;
 assert.equal(count(),4);
 assert.equal(get('history-controls').hidden,false);
 assert.ok(!get('history-list').innerHTML.includes('/releases/download/'));
 assert.ok(!get('download-list').innerHTML.includes('v2.15.7.apk'));
 get('history-platform').value='Android';get('history-platform').onchange();
 assert.equal(count(),3);
 get('history-engine').value='Unity';get('history-engine').onchange();
 assert.equal(count(),2);
 get('history-engine').value='Własny silnik';get('history-engine').onchange();
 assert.equal(count(),1);
 get('history-platform').value='Windows';get('history-platform').onchange();
 assert.equal(count(),0);
 assert.ok(get('history-list').innerHTML.includes('Brak aktualizacji dla wybranych filtrów.'));
});

test('Open pages receive new release data every minute and upon returning to the tab',async()=>{
 const source=await readFile(new URL('../dist/release-feed.js',import.meta.url),'utf8');
 const events={},calls=[],delivered=[];let tick,revision=1;
 const document={hidden:false,addEventListener(name,fn){events[name]=fn;}};
 const context={document,AbortSignal,Date,URL,setTimeout,clearTimeout,setInterval(fn,ms){assert.equal(ms,60000);tick=fn;return 1;},clearInterval(){},fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>({schemaVersion:2,lastChecked:'2026-10-25T08:00:00Z',releases:{padbridge:{versions:[{version:'v0.1.'+revision}]}}})}}};
 runInNewContext(source,context);
 const stop=context.ZeroSkillaReleases.watch(data=>delivered.push(data));
 await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered.length,1);
 assert.ok(calls[0].startsWith('https://k4mik4zz3-droid.github.io/zeroskilla-dev-studio/releases.json?v='));
 tick();await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered.length,1,'Unchanged data must not collapse open history or rerender controls');
 revision=2;tick();await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered.length,2);assert.equal(delivered[1].releases.padbridge.versions[0].version,'v0.1.2');
 document.hidden=true;const count=calls.length;tick();assert.equal(calls.length,count);
 revision=3;document.hidden=false;events.visibilitychange();await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered[2].releases.padbridge.versions[0].version,'v0.1.3');stop();
});

test('A temporary source outage keeps newer data instead of reverting to an older hosted catalog',async()=>{
 const source=await readFile(new URL('../dist/release-feed.js',import.meta.url),'utf8');
 let offline=false,failAll=false;const delivered=[],errors=[];
 const context={AbortSignal,Date,setTimeout,clearTimeout,document:{addEventListener(){}},setInterval(){return 1},clearInterval(){},fetch:async(url)=>{
  if(failAll||(offline&&url.startsWith('https:')))throw Error('Temporary outage');
  return {ok:true,json:async()=>({schemaVersion:2,lastChecked:url.startsWith('https:')?'2026-10-25T08:01:00Z':'2026-10-25T08:00:00Z',releases:{padbridge:{versions:[{version:url.startsWith('https:')?'v0.1.13':'v0.1.12'}]}}})};
 }};
 runInNewContext(source,context);context.ZeroSkillaReleases.watch(data=>delivered.push(data),error=>errors.push(error));
 await context.ZeroSkillaReleases.refresh();offline=true;await context.ZeroSkillaReleases.refresh();
 failAll=true;await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered.length,1);assert.equal(delivered[0].releases.padbridge.versions[0].version,'v0.1.13');assert.equal(errors.length,0);
});

test('Local release data remains available when the primary source cannot be read',async()=>{
 const source=await readFile(new URL('../dist/release-feed.js',import.meta.url),'utf8');const delivered=[];
 const context={AbortSignal,Date,setTimeout,clearTimeout,document:{addEventListener(){}},setInterval(){return 1},clearInterval(){},fetch:async(url)=>{
  if(url.startsWith('https:'))return {ok:true,json:async()=>({schemaVersion:1})};
  return {ok:true,json:async()=>({schemaVersion:2,lastChecked:'2026-10-25T08:00:00Z',releases:{padbridge:{versions:[]}}})};
 }};
 runInNewContext(source,context);context.ZeroSkillaReleases.watch(data=>delivered.push(data));await context.ZeroSkillaReleases.refresh();
 assert.equal(delivered.length,1);
});

test('Mobile browsers without AbortSignal.timeout or AbortController still load public releases',async()=>{
 const source=await readFile(new URL('../dist/release-feed.js',import.meta.url),'utf8');
 for(const controls of [{AbortSignal:{},AbortController},{}]){
  const delivered=[],errors=[],options=[];
  const context={...controls,setTimeout,clearTimeout,Date,document:{addEventListener(){}},setInterval(){return 1},clearInterval(){},fetch:async(url,request)=>{
   options.push(request);return {ok:true,json:async()=>({schemaVersion:2,lastChecked:'2026-10-25T08:00:00Z',releases:{padbridge:{versions:[]}}})};
  }};
  runInNewContext(source,context);context.ZeroSkillaReleases.watch(data=>delivered.push(data),error=>errors.push(error));
  await context.ZeroSkillaReleases.refresh();
  assert.equal(delivered.length,1);assert.equal(errors.length,0);assert.equal(options.length,2);
  assert.equal(Object.hasOwn(options[0],'signal'),Boolean(controls.AbortController));
 }
});

test('A stalled cross-site request cannot delay rendering the same-site mobile catalog',async()=>{
 const source=await readFile(new URL('../dist/release-feed.js',import.meta.url),'utf8');
 const delivered=[],timeouts=new Map();let nextId=0;
 const context={Date,document:{addEventListener(){}},setInterval(){return 1},clearInterval(){},
  setTimeout(fn){timeouts.set(++nextId,fn);return nextId},clearTimeout(id){timeouts.delete(id)},fetch:async(url)=>{
   if(url.startsWith('https:'))return new Promise(()=>{});
   return {ok:true,json:async()=>({schemaVersion:2,lastChecked:'2026-10-25T08:00:00Z',releases:{padbridge:{versions:[{version:'v0.1.12'}]}}})};
  }};
 runInNewContext(source,context);context.ZeroSkillaReleases.watch(data=>delivered.push(data));
 await new Promise(setImmediate);
 assert.equal(delivered.length,1,'Local catalog should render before the remote request times out');
 assert.equal(delivered[0].releases.padbridge.versions[0].version,'v0.1.12');
 assert.equal(timeouts.size,1);
 for(const expire of timeouts.values())expire();
 await context.ZeroSkillaReleases.refresh();
 assert.equal(timeouts.size,0);
});
