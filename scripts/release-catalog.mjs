import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {releaseNotes} from './release-notes.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const projects=['infernal-rift','moj-notatnik','volvio-scanner','encloser-cad','padbridge'];
const channels=[['infernal-rift','native','android'],['infernal-rift','unity','android'],['infernal-rift','unity','windows'],['moj-notatnik',null,'android'],['moj-notatnik',null,'windows'],['volvio-scanner',null,'android'],['encloser-cad',null,'windows'],['padbridge',null,'windows']];
export function parseTag(tag){
 for(const [project,engine,platform] of channels){
  const prefix=`${project}-${engine?engine+'-':''}${platform}-v`;
  if(tag.startsWith(prefix)&&/^\d+\.\d+\.\d+$/.test(tag.slice(prefix.length)))return {project,engine,platform,version:'v'+tag.slice(prefix.length)};
 }
 const old=/^infernal-rift-(native|unity)-(v\d+\.\d+\.\d+)$/.exec(tag);
 return old?{project:'infernal-rift',engine:old[1],platform:null,version:old[2]}:null;
}
export function versionOrder(a,b){
 const va=a.version.slice(1).split('.').map(Number),vb=b.version.slice(1).split('.').map(Number);
 for(let i=0;i<3;i++)if(va[i]!==vb[i])return vb[i]-va[i];
 return String(b.date||'').localeCompare(String(a.date||''));
}
function expectedNames({project,engine,version:v},platform){
 if(project==='infernal-rift')return engine==='native'?(platform==='android'?[`Infernal-Rift-${v}.apk`]:[]):platform==='android'?[`Infernal-Rift-Unity-${v}.apk`]:[`Infernal-Rift-Unity-${v}-Windows-PC.zip`];
 if(project==='moj-notatnik')return platform==='android'?[`Moj-Notatnik-${v}.apk`]:[`Moj-Notatnik-${v}-Windows-x64.zip`,`Moj-Notatnik-Windows-${v.slice(1)}-x64.zip`];
 const prefix={'volvio-scanner':'VolVio-Scanner','encloser-cad':'Encloser-CAD','padbridge':'PadBridge'}[project];
 return platform==='android'?[`${prefix}-${v}.apk`]:[`${prefix}-${v}-Windows-x64.zip`];
}
export function assetFiles(release,parsed,repo){
 return (Array.isArray(release.assets)?release.assets:[]).flatMap(asset=>{
  const platform=/\.apk$/i.test(asset.name||'')?'android':/\.zip$/i.test(asset.name||'')?'windows':null;
  if(!platform||(parsed.platform&&parsed.platform!==platform)||(parsed.engine==='native'&&platform!=='android'))return [];
  if(!expectedNames(parsed,platform).includes(asset.name)||asset.state!=='uploaded'||!Number.isSafeInteger(asset.size)||asset.size<=0||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))return [];
  let url;try{url=new URL(asset.browser_download_url)}catch{return []}
  const expected=`/${repo}/releases/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(asset.name)}`;
  if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash||url.pathname!==expected)return [];
  return [{type:platform==='android'?'APK':'ZIP',platform:platform==='android'?'Android':'Windows',name:asset.name,sizeBytes:asset.size,sha256:asset.digest.slice(7).toLowerCase(),url:url.href,access:'public'}];
 });
}
export function buildCatalog(published,metadata,repo,checked=new Date().toISOString()){
 const candidates=[];
 for(const release of published){
  if(release.draft||release.prerelease)continue;
  const parsed=parseTag(String(release.tag_name||''));if(!parsed)continue;
  const planned=(metadata.planned||[]).find(p=>p.tag===release.tag_name);
  for(const file of assetFiles(release,parsed,repo))candidates.push({project:parsed.project,version:parsed.version,...(parsed.engine?{engine:parsed.engine==='native'?'Własny silnik':'Unity'}:{}),channel:[parsed.engine,file.platform.toLowerCase()].filter(Boolean).join('-'),date:String(release.published_at||release.created_at||'').slice(0,10),description:planned?.description||String(release.name||'').slice(0,160),tag:release.tag_name,releaseUrl:release.html_url,body:release.body,file});
 }
 candidates.sort(versionOrder);
 const releases=Object.fromEntries(projects.map(p=>[p,{versions:[],...(metadata.unavailable?.[p]?{unavailableReason:metadata.unavailable[p]}:{})}]));
 const seen=new Set();
 for(const candidate of candidates){
  const key=`${candidate.project}/${candidate.channel}`;if(seen.has(key))continue;seen.add(key);
  const {project,file,body,...record}=candidate;
  let changelog=null,status='missing';
  try{changelog=releaseNotes(body);if(changelog)status='complete';}catch{status='invalid';}
  releases[project].versions.push({...record,...(changelog?{changelog}:{}),changelogStatus:status,files:[file]});
 }
 return {schemaVersion:2,lastChecked:checked,sourceRepository:repo,releases};
}
async function fetchReleases(repo){
 const all=[];
 for(let page=1;page<=100;page++){
  const response=await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'zeroskilla-dev-studio-pages',...(process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{})},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`GitHub Releases HTTP ${response.status}`);
  const batch=await response.json();if(!Array.isArray(batch))throw new Error('Invalid Releases response');
  all.push(...batch);if(batch.length<100)return all;
 }
 throw new Error('Pagination limit exceeded; refusing partial catalog');
}
export async function main(){
 const metadata=JSON.parse(await readFile(join(root,'releases-source.json'),'utf8'));
 const repo=process.env.RELEASE_REPOSITORY||process.env.GITHUB_REPOSITORY||'k4mik4zz3-droid/zeroskilla-dev-studio';
 if(!/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repo))throw new Error('Invalid release repository');
 const fixture=process.argv.indexOf('--from-file');
 const published=process.argv.includes('--offline')?[]:fixture>=0?JSON.parse((await readFile(process.argv[fixture+1],'utf8')).replace(/^\uFEFF/,'')):await fetchReleases(repo);
 const catalog=buildCatalog(published,metadata,repo),count=Object.values(catalog.releases).flatMap(p=>p.versions).length;
 const missing=Object.values(catalog.releases).flatMap(p=>p.versions).filter(v=>v.changelogStatus!=='complete');
 for(const v of missing)console.warn(`::warning::Publiczne wydanie ${v.tag} wymaga poprawnego opisu zmian; zachowano najnowszą paczkę bez kopiowania starego opisu.`);
 if(!process.argv.includes('--offline')&&!count)throw new Error('No verified assets; keeping previous catalog');
 await writeFile(join(root,'dist','releases.json'),JSON.stringify(catalog,null,2)+'\n');
 console.log(`Latest verified channels: ${count}`);
}
