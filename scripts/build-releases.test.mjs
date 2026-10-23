import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCatalog,parseTag} from './release-catalog.mjs';
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
  release('padbridge-windows-v6.0.0',['PadBridge-v6.0.0-Windows-x64.zip'],{draft:true}),
  release('padbridge-windows-v5.0.0',['PadBridge-v5.0.0-Windows-x64.zip'],{prerelease:true}),
  release('padbridge-windows-v4.0.0',['PadBridge-v4.0.0-zrodla.zip','PadBridge-v4.0.0-debug.zip']),bad,foreign,
  release('padbridge-windows-v0.1.12',['PadBridge-v0.1.12-Windows-x64.zip'])
 ],{},repo);
 assert.equal(Object.values(r.releases).flatMap(p=>p.versions).length,1);
 assert.equal(r.releases.padbridge.versions[0].version,'v0.1.12');
 assert.equal(r.releases.padbridge.versions[0].files[0].sha256,'a'.repeat(64));
});
test('Incomplete newer release does not hide latest available platform',()=>{
 const r=buildCatalog([release('moj-notatnik-android-v3.0.0',[]),release('moj-notatnik-android-v2.9.7',['Moj-Notatnik-v2.9.7.apk']),release('moj-notatnik-windows-v0.1.0',['Moj-Notatnik-v0.1.0-Windows-x64.zip'])],{},repo);
 assert.equal(r.releases['moj-notatnik'].versions.length,2);
 assert.equal(parseTag('infernal-rift-native-windows-v0.346.0'),null);
});
