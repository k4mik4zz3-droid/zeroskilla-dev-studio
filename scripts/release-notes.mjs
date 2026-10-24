const headings=new Map([['co nowego','changes'],['zmiany','changes'],["what's new",'changes'],['changelog','changes'],['informacje o wydaniu','release'],['zmiany w dystrybucji','distribution']]);
const privateText=/(?:[a-z]:[\\/]|\\\\|file:\/\/|-----BEGIN|github_pat_|gh[pousr]_[a-z0-9]|(?:token|password|client_secret|api_key)\s*[:=])/i;

export function releaseNotes(body){
  if(typeof body!=='string')return null;
  const lines=body.slice(0,100000).replace(/<!--[\s\S]*?-->/g,'').replace(/\r\n?/g,'\n').split('\n');
  let kind=null,items=[];
  for(const raw of lines){
    const heading=/^\s*#{1,6}\s+(.+?)\s*#*\s*$/.exec(raw);
    if(heading){
      if(kind)break;
      kind=headings.get(heading[1].toLocaleLowerCase('pl-PL'))||null;
      continue;
    }
    if(!kind)continue;
    const bullet=/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/.exec(raw);
    if(!bullet)continue;
    const text=bullet[1].replace(/\*\*|__|`/g,'').replace(/\s+/g,' ').trim();
    // Only explicit public bullets are displayed. Raw HTML, local paths and
    // credential-like content never become website copy.
    if(!text||text.length>600||/[<>\u0000-\u001f]/.test(text)||privateText.test(text))continue;
    if(!items.includes(text))items.push(text);
    if(items.length>=20)break;
  }
  return kind&&items.length?{kind,items}:null;
}
