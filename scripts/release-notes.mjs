const headings=new Map([['co nowego','changes'],['zmiany','changes'],["what's new",'changes'],['changelog','changes'],['informacje o wydaniu','release'],['zmiany w dystrybucji','distribution']]);
const privateText=/(?:[a-z]:[\\/]|\\\\|file:\/\/|-----BEGIN|github_pat_|gh[pousr]_[a-z0-9]|(?:token|password|client_secret|api_key)\s*[:=])/i;

export function releaseNotes(body){
  if(typeof body!=='string')return null;
  const lines=body.replace(/<!--[\s\S]*?-->/g,'').replace(/\r\n?/g,'\n').split('\n');
  let kind=null,depth=0,subheading='',pending=[],fence=null,isBullet=false,afterBlank=false;
  const items=[];
  function finish(){
    if(!pending.length){isBullet=false;afterBlank=false;return;}
    const text=(subheading?subheading+': ':'')+pending.join(' ').replace(/\*\*|__|`/g,'').replace(/\s+/g,' ').trim();
    pending=[];
    isBullet=false;afterBlank=false;
    if(!text.trim()||/<\/?[a-z!][^>]*>/i.test(text)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||privateText.test(text))throw Error('Nieprawidłowy lub prywatny punkt opisu zmian');
    items.push(text);
  }
  for(const raw of lines){
    const code=/^\s*(`{3,}|~{3,})/.exec(raw);
    if(code){if(!fence)fence=code[1][0];else if(fence===code[1][0])fence=null;continue;}
    if(fence)continue;
    const heading=/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
    if(heading){
      if(kind){
        finish();
        if(heading[1].length<=depth)break;
        subheading=heading[2].trim();
      }else{
        kind=headings.get(heading[2].toLocaleLowerCase('pl-PL').replace(/’/g,"'"))||null;
        if(kind)depth=heading[1].length;
      }
      continue;
    }
    if(!kind)continue;
    const bullet=/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(raw);
    if(bullet){finish();pending=[bullet[1]];isBullet=true;}
    else if(!raw.trim()){afterBlank=true;continue;}
    else{if(afterBlank&&!(isBullet&&/^\s/.test(raw)))finish();pending.push(raw.trim());}
    afterBlank=false;
  }
  finish();
  return kind&&items.length?{kind,items}:null;
}
