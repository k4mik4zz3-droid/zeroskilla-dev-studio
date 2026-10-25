import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const projects=['infernal-rift','moj-notatnik','volvio-scanner','encloser-cad','padbridge'];
const start='<!-- project-features:start -->',end='<!-- project-features:end -->';
const historyStart='<!-- project-history:start -->',historyEnd='<!-- project-history:end -->';
const historySection=`${historyStart}
    <section class="project-history" id="historia" aria-labelledby="history-title"><div class="section-top"><div><p class="eyebrow">HISTORIA</p><h2 id="history-title">Historia aktualizacji<span class="title-dot">.</span></h2><p class="section-description">Opublikowane wersje i ich zmiany, od najnowszych do starszych. Wybierz wersję, aby rozwinąć opis.</p></div><a class="button button-secondary" href="#pobierz">Pobierz najnowszą ↓</a></div><div class="history-controls" id="history-controls" hidden><label id="history-engine-label" for="history-engine">Silnik<select id="history-engine"><option value="">Wszystkie silniki</option></select></label><label id="history-platform-label" for="history-platform">System<select id="history-platform"><option value="">Wszystkie systemy</option></select></label></div><p class="history-status" id="history-status" role="status" aria-live="polite">Wczytywanie historii…</p><div class="history-list" id="history-list"></div></section>
    ${historyEnd}`;
const escape=(value)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=(value)=>value.toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const editionName={native:'Własny silnik',unity:'Unity'};
const samePlatforms=(a,b)=>[...a].sort().join('|')===[...b].sort().join('|');

function labelFor(edition,platforms,project){
  const parts=[];
  if(edition)parts.push(editionName[edition]||edition);
  if(platforms?.length&&!samePlatforms(platforms,project.platforms))parts.push(platforms.join(' / '));
  return parts.join(' · ');
}

function render(project){
  if(!project.groups?.length)throw Error('Missing feature groups');
  const ids=new Set();let count=0;
  const groups=project.groups.map((group,index)=>{
    if(!group.title?.trim()||!group.items?.length)throw Error('Empty feature group');
    const id='funkcje-'+slug(group.title);
    if(ids.has(id))throw Error('Duplicate feature category: '+id);
    ids.add(id);
    const groupLabel=labelFor(group.edition,group.platforms,project);
    const items=group.items.map(item=>{
      if(!item.name?.trim()||!item.description?.trim())throw Error('Feature must include a name and description');
      if(/(?:[A-Z]:\\|oauth_token|BEGIN .*PRIVATE KEY)/i.test(item.name+' '+item.description))throw Error('Private implementation material is not public feature content');
      count++;
      const label=labelFor(item.edition,item.platforms,project);
      const badge=label&&label!==groupLabel?`<span class="function-scope">${escape(label)}</span>`:'';
      return `<div class="function-item"><dt>${escape(item.name)}${badge}</dt><dd>${escape(item.description)}</dd></div>`;
    }).join('');
    return {id,title:group.title,count:group.items.length,html:`<details class="function-group" id="${id}" open><summary><div class="function-group-label"><span class="function-group-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><h3>${escape(group.title)}</h3></div><span class="function-group-meta">${groupLabel?`<span class="function-scope">${escape(groupLabel)}</span>`:''}<span class="function-count">${group.items.length}</span><span class="function-chevron" aria-hidden="true"></span></span></summary><dl class="function-list">${items}</dl></details>`};
  });
  return {count,html:`${start}\n    <section class="project-features" id="funkcje" aria-labelledby="features-title"><div class="section-top"><div><p class="eyebrow">FUNKCJE</p><h2 id="features-title">Pełny spis funkcji<span class="title-dot">.</span></h2><p class="section-description">${escape(project.introduction)}</p></div></div><div class="function-controls" hidden><label class="function-search-label" for="function-search">Szukaj funkcji<input id="function-search" type="search" placeholder="Wpisz nazwę lub fragment opisu…" autocomplete="off"></label><div class="function-buttons"><button type="button" data-functions-expand>Rozwiń wszystkie</button><button type="button" data-functions-collapse>Zwiń wszystkie</button></div><p id="function-result" class="function-result" role="status" aria-live="polite"></p></div><p class="function-empty" hidden>Nie znaleziono funkcji. Zmień wpisane słowa.</p><div class="function-groups">${groups.map(g=>g.html).join('')}</div></section>\n    ${end}`};
}

export async function buildFeaturePages(){
  const data=JSON.parse(await readFile(join(root,'project-features.json'),'utf8'));
  if(data.schemaVersion!==1||Object.keys(data.projects).sort().join('|')!==[...projects].sort().join('|'))throw Error('Invalid project feature catalog');
  const css=await readFile(join(root,'dist/project-page.css'),'utf8');
  const cssHash=createHash('sha256').update(css).digest('hex').slice(0,12);
  const js=await readFile(join(root,'dist/project-features.js'),'utf8');
  const jsHash=createHash('sha256').update(js).digest('hex').slice(0,12);
  const pageJsHash=createHash('sha256').update(await readFile(join(root,'dist/project-page.js'),'utf8')).digest('hex').slice(0,12);
  const feedHash=createHash('sha256').update(await readFile(join(root,'dist/release-feed.js'),'utf8')).digest('hex').slice(0,12);
  const feedScript=(defer)=>`<script src="./release-feed.js?v=${feedHash}"${defer?' defer':''}></script>`;
  const counts={};
  for(const id of projects){
    const project=data.projects[id],file=join(root,'dist',id+'.html');
    const rendered=render(project);counts[id]=rendered.count;
    let html=await readFile(file,'utf8');
    if(html.includes(start)){
      const from=html.indexOf(start),to=html.indexOf(end,from);
      if(to<from)throw Error('Missing feature section boundary');
      html=html.slice(0,from)+rendered.html+html.slice(to+end.length);
    }else{
      const pattern=/<div class="feature-grid">[\s\S]*?<\/section>/;
      if(!pattern.test(html))throw Error('No existing project description to update: '+id);
      html=html.replace(pattern,'</section>\n    '+rendered.html);
    }
    if(!html.includes('href="#funkcje"')){
      const gallery='<a class="button button-secondary" href="#galeria">';
      if(!html.includes(gallery))throw Error('Missing project navigation');
      html=html.replace(gallery,'<a class="button button-secondary" href="#funkcje">Wszystkie funkcje ↓</a>'+gallery);
    }
    if(html.includes(historyStart)){
      const from=html.indexOf(historyStart),to=html.indexOf(historyEnd,from);
      if(to<from)throw Error('Missing history section boundary');
      html=html.slice(0,from)+historySection+html.slice(to+historyEnd.length);
    }else{
      const before='<div class="back-to-catalog">';
      if(!html.includes(before))throw Error('Missing project footer navigation');
      html=html.replace(before,historySection+'\n    '+before);
    }
    if(!html.includes('class="button button-secondary" href="#historia"'))html=html.replace('<a class="button button-secondary" href="#galeria">','<a class="button button-secondary" href="#historia">Historia aktualizacji ↓</a><a class="button button-secondary" href="#galeria">');
    if(!html.includes('class="back-link" href="#historia"'))html=html.replace('<a class="navcta" href="#pobierz">','<a class="back-link" href="#historia">Historia</a><a class="navcta" href="#pobierz">');
    html=html.replace(/\.\/project-page\.css\?v=[a-f0-9]+/g,'./project-page.css?v='+cssHash);
    html=html.replace(/\.\/project-page\.js\?v=[a-f0-9]+/g,'./project-page.js?v='+pageJsHash);
    if(/<script src="\.\/release-feed\.js[^"<]*" defer><\/script>/.test(html))html=html.replace(/<script src="\.\/release-feed\.js[^"<]*" defer><\/script>/,feedScript(true));
    else html=html.replace(/(<script src="\.\/project-page\.js[^"<]*" defer><\/script>)/,feedScript(true)+'\n  $1');
    const script=`<script src="./project-features.js?v=${jsHash}" defer></script>`;
    if(/<script src="\.\/project-features\.js[^"<]*" defer><\/script>/.test(html))html=html.replace(/<script src="\.\/project-features\.js[^"<]*" defer><\/script>/,script);
    else html=html.replace('</body>',`  ${script}\n</body>`);
    await writeFile(file,html);
  }
  const indexFile=join(root,'dist/index.html');
  let index=await readFile(indexFile,'utf8');
  if(/<script src="\.\/release-feed\.js[^"<]*"><\/script>/.test(index))index=index.replace(/<script src="\.\/release-feed\.js[^"<]*"><\/script>/,feedScript(false));
  else index=index.replace('  <script>','  '+feedScript(false)+'\n  <script>');
  await writeFile(indexFile,index);
  console.log('Project feature lists: '+JSON.stringify(counts));
  return counts;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildFeaturePages();
