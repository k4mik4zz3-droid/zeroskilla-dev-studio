"use strict";
(()=>{
  const $=(id)=>document.getElementById(id);
  const projectId=document.body.dataset.project;
  const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl=(value)=>{try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/k4mik4zz3-droid/zeroskilla-dev-studio/releases/download/')?url.href:null}catch{return null}};
  const filesFor=(v)=>Array.isArray(v.files)?v.files.filter(f=>safeUrl(f.url)&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&Number.isSafeInteger(f.sizeBytes)&&f.sizeBytes>0):[];
  const sizeOf=(n)=>(n/1048576).toLocaleString('pl-PL',{maximumFractionDigits:1,minimumFractionDigits:1})+' MiB';
  const releaseUrl=(v)=>{try{const url=new URL(v.releaseUrl);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.pathname==='/k4mik4zz3-droid/zeroskilla-dev-studio/releases/tag/'+encodeURIComponent(v.tag)?url.href:null}catch{return null}};
  const changesId=(v)=>'zmiany-'+v.channel+'-'+v.version;
  function latestOrder(a,b){
    const av=a.version.slice(1).split('.').map(Number),bv=b.version.slice(1).split('.').map(Number);
    for(let i=0;i<3;i++)if(av[i]!==bv[i])return bv[i]-av[i];
    return String(b.date||'').localeCompare(String(a.date||''))||String(a.channel).localeCompare(String(b.channel));
  }
  function showQuickDownloads(versions){
    const list=$('latest-downloads');if(!list)return;
    const sorted=versions.filter(v=>/^v\d+\.\d+\.\d+$/.test(v.version||'')).slice().sort(latestOrder);
    const buttons=['Android','Windows'].flatMap(platform=>{
      for(const v of sorted){
        const file=filesFor(v).find(f=>f.platform===platform&&f.type===(platform==='Android'?'APK':'ZIP'));
        if(!file)continue;
        const label='Pobierz na '+(platform==='Android'?'Androida':'Windows');
        const context=[v.version,v.engine,platform].filter(Boolean).join(' · ');
        return ['<div class="latest-download"><a class="button button-primary latest-download-link" href="'+escapeHtml(safeUrl(file.url))+'" target="_blank" rel="noopener noreferrer" title="'+escapeHtml(file.name)+'"><strong>'+label+' ↓</strong><span>'+escapeHtml([v.version,v.engine,file.type,sizeOf(file.sizeBytes)].filter(Boolean).join(' · '))+'</span></a><a class="button button-secondary latest-changes-link" href="#'+escapeHtml(encodeURIComponent(changesId(v)))+'" aria-label="Opis zmian — '+escapeHtml(context)+'">Opis zmian</a></div>'];
      }
      return [];
    });
    list.dataset.count=String(buttons.length);
    list.innerHTML=buttons.length?buttons.join(''):'<p class="latest-download-status">Brak zweryfikowanej wersji do pobrania.</p>';
  }
  function showChanges(v,anchored=false){
    const kind=['changes','release','distribution'].includes(v.changelog?.kind)?v.changelog.kind:'changes';
    const data=v.changelog?.items;
    const valid=Array.isArray(data)&&data.length>0&&data.every(item=>typeof item==='string'&&item.trim());
    const items=valid?data:[];
    const title='Co nowego';
    const scope={changes:'',release:'Informacje o wydaniu',distribution:'Zmiany w wydaniu publicznym'}[kind];
    const url=releaseUrl(v);
    const context=[v.version,v.engine,...new Set(filesFor(v).map(f=>f.platform))].filter(Boolean).join(' · ');
    return '<section class="release-changes"'+(anchored?' id="'+escapeHtml(changesId(v))+'" tabindex="-1"':'')+' aria-label="'+escapeHtml(title+' — '+context)+'"><h4>'+title+'</h4>'+(anchored?'<p class="changes-version">'+escapeHtml(context)+'</p>':'')+(scope?'<p class="release-scope-label">'+scope+'</p>':'')+(items.length?'<ul>'+items.map(item=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul>':'<p>Opis zmian tej wersji wymaga uzupełnienia przez autora.</p>')+(kind==='distribution'?'<p class="release-scope-note">Opis dotyczy publikacji paczki. Szczegółowa lista zmian funkcji tej wersji nie została udostępniona.</p>':'')+(url?'<a class="release-more" href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">Informacje o wydaniu na GitHub ↗</a>':'')+'</section>';
  }
  function formattedDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return '';
    const date=new Date(value+'T00:00:00Z');if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
  }
  function publicationDate(value){
    const label=formattedDate(value);
    return label?'<p class="release-date">Opublikowano <time datetime="'+escapeHtml(value)+'">'+label+'</time></p>':'';
  }
  function showHistory(entry){
    const list=$('history-list');if(!list)return;
    const rows=(Array.isArray(entry?.history)?entry.history:[]).filter(v=>/^v\d+\.\d+\.\d+$/.test(v.version||'')&&['Android','Windows'].includes(v.platform));
    const latest=new Set((entry?.versions||[]).map(v=>v.channel+'/'+v.version));
    const engine=$('history-engine'),platform=$('history-platform');
    const previousEngine=engine.value,previousPlatform=platform.value;
    const opened=new Set([...(list.querySelectorAll?.('details[open][data-history]')||[])].map(item=>item.dataset.history));
    const engines=[...new Set(rows.map(v=>v.engine).filter(Boolean))].sort();
    const platforms=[...new Set(rows.map(v=>v.platform))].sort();
    $('history-engine-label').hidden=engines.length<2;
    $('history-platform-label').hidden=platforms.length<2;
    $('history-controls').hidden=engines.length<2&&platforms.length<2;
    engine.innerHTML='<option value="">Wszystkie silniki</option>'+engines.map(value=>'<option value="'+escapeHtml(value)+'">'+escapeHtml(value)+'</option>').join('');
    platform.innerHTML='<option value="">Wszystkie systemy</option>'+platforms.map(value=>'<option value="'+escapeHtml(value)+'">'+escapeHtml(value)+'</option>').join('');
    engine.value=engines.includes(previousEngine)?previousEngine:'';platform.value=platforms.includes(previousPlatform)?previousPlatform:'';
    function renderHistory(){
      const selected=rows.filter(v=>(!engine.value||v.engine===engine.value)&&(!platform.value||v.platform===platform.value));
      const count=selected.length;
      $('history-status').textContent=count+' '+(count===1?'wpis':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'wpisy':'wpisów')+' w historii';
      if(!selected.length){list.innerHTML='<p class="history-empty">'+(rows.length?'Brak aktualizacji dla wybranych filtrów.':'Historia pojawi się po opublikowaniu pierwszego wydania.')+'</p>';return;}
      list.innerHTML=selected.map(v=>{
        const current=latest.has(v.channel+'/'+v.version),date=formattedDate(v.date);
        const key=v.channel+'/'+v.version;
        return '<details class="history-item" data-history="'+escapeHtml(key)+'"'+(opened.has(key)?' open':'')+'><summary><span class="history-version"><strong>'+escapeHtml(v.version)+'</strong><span>'+escapeHtml([v.engine,v.platform].filter(Boolean).join(' · '))+'</span></span><span class="history-meta">'+(date?'<time datetime="'+escapeHtml(v.date)+'">'+date+'</time>':'')+'<span class="history-badge'+(current?' is-current':'')+'">'+(current?'Najnowsza':'Archiwum')+'</span><span class="history-chevron" aria-hidden="true"></span></span></summary><div class="history-body">'+(v.description?'<p class="history-description">'+escapeHtml(v.description)+'</p>':'')+showChanges(v)+'</div></details>';
      }).join('');
    }
    engine.onchange=renderHistory;
    platform.onchange=renderHistory;
    renderHistory();
  }
  function showDownloads(entry){
    const versions=(Array.isArray(entry?.versions)?entry.versions:[]).filter(v=>filesFor(v).length);
    showQuickDownloads(versions);
    if(!versions.length){
      $('availability').textContent='W przygotowaniu';
      $('download-list').innerHTML='<div class="unavailable"><h3>Wydanie jeszcze niedostępne</h3><p>'+escapeHtml(entry?.unavailableReason||'Brak zweryfikowanej paczki do publicznego pobrania.')+'</p></div>';
      return;
    }
    $('availability').textContent='Dostępne do pobrania';
    $('download-list').innerHTML=versions.map(v=>{
      const files=filesFor(v),platform=[...new Set(files.map(f=>f.platform))].join(' / ');
      return '<article class="release-panel"><div><span class="release-channel">'+escapeHtml([v.engine,platform,'Najnowsza wersja'].filter(Boolean).join(' · '))+'</span><h3>'+escapeHtml(v.version)+'</h3><p>'+escapeHtml(v.description||'')+'</p>'+publicationDate(v.date)+'</div><div class="version-files">'+files.map(f=>'<div class="download-file"><a class="file-link" href="'+escapeHtml(safeUrl(f.url))+'" target="_blank" rel="noopener noreferrer" title="'+escapeHtml(f.name)+'"><span class="file-symbol">'+escapeHtml(f.type)+'</span><span><strong>Pobierz '+escapeHtml(f.type)+' ↓</strong><small>'+escapeHtml(f.platform)+' · '+sizeOf(f.sizeBytes)+'</small></span></a><details class="checksum"><summary>Sprawdź sumę SHA256</summary><code>'+escapeHtml(f.sha256)+'</code></details></div>').join('')+'</div>'+showChanges(v,true)+'</article>';
    }).join('');
  }
  function updateReleases(data){
    if(data?.schemaVersion!==2||!data.releases||typeof data.releases!=='object')throw Error('Nieprawidłowy manifest');
    showDownloads(data.releases[projectId]);
    showHistory(data.releases[projectId]);
  }
  function releaseError(){
    if($('latest-downloads'))$('latest-downloads').innerHTML='<p class="latest-download-status">Nie udało się sprawdzić wydań. <a href="#pobierz">Przejdź do pobierania ↓</a></p>';
    $('availability').textContent='Nie udało się sprawdzić';
    $('download-list').innerHTML='<div class="unavailable"><h3>Nie udało się wczytać wydań</h3><p>Odśwież stronę lub sprawdź <a href="https://github.com/k4mik4zz3-droid/zeroskilla-dev-studio/releases" target="_blank" rel="noopener noreferrer">archiwum GitHub Releases ↗</a>.</p></div>';
    if($('history-list'))$('history-list').innerHTML='<p class="history-empty">Nie udało się wczytać historii. Odśwież stronę lub sprawdź archiwum GitHub Releases.</p>';
    if($('history-status'))$('history-status').textContent='Historia chwilowo niedostępna';
  }
  if(globalThis.ZeroSkillaReleases)globalThis.ZeroSkillaReleases.watch(updateReleases,releaseError);
  else fetch('./releases.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Manifest niedostępny');return response.json()}).then(updateReleases).catch(releaseError);
  const gallery=[...document.querySelectorAll('.gallery-open')];
  const dialog=$('gallery-dialog');
  let currentImage=0;
  function showImage(index){
    currentImage=(index+gallery.length)%gallery.length;
    const button=gallery[currentImage];
    $('lightbox-image').src=button.dataset.image;
    $('gallery-original').href=button.dataset.image;
    $('lightbox-image').alt=button.querySelector('img').alt;
    $('lightbox-caption').textContent=button.dataset.caption;
    $('gallery-count').textContent=(currentImage+1)+' / '+gallery.length;
    $('gallery-prev').disabled=gallery.length<2;
    $('gallery-next').disabled=gallery.length<2;
  }
  gallery.forEach((button,index)=>button.addEventListener('click',()=>{showImage(index);dialog.showModal()}));
  $('gallery-prev').addEventListener('click',()=>showImage(currentImage-1));
  $('gallery-next').addEventListener('click',()=>showImage(currentImage+1));
  $('gallery-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close()});
  dialog.addEventListener('keydown',(event)=>{
    if(event.key==='ArrowRight'){event.preventDefault();showImage(currentImage+1)}
    if(event.key==='ArrowLeft'){event.preventDefault();showImage(currentImage-1)}
  });
  $('year').textContent=new Date().getFullYear();
})();
