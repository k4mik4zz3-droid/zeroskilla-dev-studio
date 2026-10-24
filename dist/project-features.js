"use strict";
(()=>{
  const section=document.getElementById('funkcje');
  if(!section)return;
  const controls=section.querySelector('.function-controls');
  const search=section.querySelector('#function-search');
  const status=section.querySelector('#function-result');
  const empty=section.querySelector('.function-empty');
  const groups=[...section.querySelectorAll('.function-group')];
  const fold=value=>String(value).toLocaleLowerCase('pl-PL').replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const rows=groups.map(group=>({group,counter:group.querySelector('.function-count'),title:fold(group.querySelector('h3').textContent+' '+(group.querySelector('summary .function-scope')?.textContent||'')),items:[...group.querySelectorAll('.function-item')].map(element=>({element,text:fold(element.textContent)}))}));
  const total=rows.reduce((n,row)=>n+row.items.length,0);
  let activeSearch=false,previousState=new Map();
  groups.forEach((group,index)=>group.open=index===0);
  controls.hidden=false;
  const plural=n=>n===1?'funkcja':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'funkcje':'funkcji';
  const matches=(text,terms)=>terms.every(term=>term.length<3?text.split(/[^a-z0-9]+/).includes(term):text.includes(term));
  function filter(){
    const terms=fold(search.value).trim().split(/\s+/).filter(Boolean),searching=terms.length>0;
    if(searching&&!activeSearch)previousState=new Map(groups.map(group=>[group,group.open]));
    let visible=0;
    for(const row of rows){
      let count=0;
      for(const item of row.items){item.element.hidden=searching&&!matches(row.title+' '+item.text,terms);if(!item.element.hidden)count++;}
      row.group.hidden=count===0;
      row.counter.textContent=searching?`${count} / ${row.items.length}`:String(row.items.length);
      row.counter.setAttribute('aria-label',searching?`${count} ${plural(count)} z ${row.items.length}`:`${row.items.length} ${plural(row.items.length)}`);
      if(searching)row.group.open=count>0;
      else if(activeSearch)row.group.open=previousState.get(row.group)??false;
      visible+=count;
    }
    activeSearch=searching;
    empty.hidden=visible!==0;
    status.textContent=searching?`${visible} ${plural(visible)} z ${total}`:`${total} ${plural(total)} w ${groups.length} kategoriach`;
  }
  function openHash(){
    let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const group=groups.find(row=>row.id===id);
    if(group){if(search.value){search.value='';filter();}group.open=true;}
  }
  search.addEventListener('input',filter);
  section.querySelector('[data-functions-expand]').addEventListener('click',()=>groups.filter(group=>!group.hidden).forEach(group=>group.open=true));
  section.querySelector('[data-functions-collapse]').addEventListener('click',()=>groups.forEach(group=>group.open=false));
  window.addEventListener('hashchange',openHash);
  filter();openHash();
})();
