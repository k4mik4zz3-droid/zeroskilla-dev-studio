"use strict";
(()=>{
  const $=(id)=>document.getElementById(id);
  const projectId=document.body.dataset.project;
  const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl=(value)=>{try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/k4mik4zz3-droid/zeroskilla-dev-studio/releases/download/')?url.href:null}catch{return null}};
  const filesFor=(v)=>Array.isArray(v.files)?v.files.filter(f=>safeUrl(f.url)&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&Number.isSafeInteger(f.sizeBytes)&&f.sizeBytes>0):[];
  const sizeOf=(n)=>(n/1048576).toLocaleString('pl-PL',{maximumFractionDigits:1,minimumFractionDigits:1})+' MiB';
  function showDownloads(entry){
    const versions=(Array.isArray(entry?.versions)?entry.versions:[]).filter(v=>filesFor(v).length);
    if(!versions.length){
      $('availability').textContent='W przygotowaniu';
      $('download-list').innerHTML='<div class="unavailable"><h3>Wydanie jeszcze niedostępne</h3><p>'+escapeHtml(entry?.unavailableReason||'Brak zweryfikowanej paczki do publicznego pobrania.')+'</p></div>';
      return;
    }
    $('availability').textContent='Dostępne do pobrania';
    $('download-list').innerHTML=versions.map(v=>{
      const files=filesFor(v),platform=[...new Set(files.map(f=>f.platform))].join(' / ');
      return '<article class="release-panel"><div><span class="release-channel">'+escapeHtml([v.engine,platform,'Najnowsza wersja'].filter(Boolean).join(' · '))+'</span><h3>'+escapeHtml(v.version)+'</h3><p>'+escapeHtml(v.description||'')+'</p></div><div class="version-files">'+files.map(f=>'<div class="download-file"><a class="file-link" href="'+escapeHtml(safeUrl(f.url))+'" target="_blank" rel="noopener noreferrer" title="'+escapeHtml(f.name)+'"><span class="file-symbol">'+escapeHtml(f.type)+'</span><span><strong>Pobierz '+escapeHtml(f.type)+' ↓</strong><small>'+escapeHtml(f.platform)+' · '+sizeOf(f.sizeBytes)+'</small></span></a><details class="checksum"><summary>Sprawdź sumę SHA256</summary><code>'+escapeHtml(f.sha256)+'</code></details></div>').join('')+'</div></article>';
    }).join('');
  }
  fetch('./releases.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Manifest niedostępny');return response.json()}).then(data=>{
    if(data?.schemaVersion!==2||!data.releases||typeof data.releases!=='object')throw Error('Nieprawidłowy manifest');
    showDownloads(data.releases[projectId]);
  }).catch(()=>{
    $('availability').textContent='Nie udało się sprawdzić';
    $('download-list').innerHTML='<div class="unavailable"><h3>Nie udało się wczytać wydań</h3><p>Odśwież stronę lub sprawdź <a href="https://github.com/k4mik4zz3-droid/zeroskilla-dev-studio/releases" target="_blank" rel="noopener noreferrer">archiwum GitHub Releases ↗</a>.</p></div>';
  });
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
