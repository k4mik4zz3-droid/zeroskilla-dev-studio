"""Publish only validated, stable local application builds. No dependencies beyond Python.

Default is a read-only check. --publish additionally requires enabled configuration,
Windows-secured GitHub CLI authentication and both repositories' publication switches.
"""
from __future__ import annotations

import argparse
import contextlib
import ctypes
import datetime as dt
import glob
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
import zipfile

REPO = 'k4mik4zz3-droid/zeroskilla-dev-studio'
SITE = 'ZeroSkillaDevStudio/zeroskilladevstudio.github.io'
MARKER = '<!-- zeroskilla-local-publisher:v1 -->'
CHANNELS = {
    'infernal-rift-native-android': ('Infernal Rift — własny silnik', 'Infernal-Rift-v{v}.apk', 'com.deeprifter.v542'),
    'infernal-rift-unity-android': ('Infernal Rift Unity', 'Infernal-Rift-Unity-v{v}.apk', 'com.deeprifter.unity.v2'),
    'infernal-rift-unity-windows': ('Infernal Rift Unity', 'Infernal-Rift-Unity-v{v}-Windows-PC.zip', None),
    'moj-notatnik-android': ('Mój Notatnik', 'Moj-Notatnik-v{v}.apk', 'pl.notatnik.app'),
    'moj-notatnik-windows': ('Mój Notatnik', 'Moj-Notatnik-v{v}-Windows-x64.zip', None),
    'volvio-scanner-android': ('VolVio Scanner', 'VolVio-Scanner-v{v}.apk', 'pl.volvio.scanner'),
    'encloser-cad-windows': ('Encloser CAD', 'Encloser-CAD-v{v}-Windows-x64.zip', None),
    'padbridge-windows': ('PadBridge', 'PadBridge-v{v}-Windows-x64.zip', None),
}
EXES = {'moj-notatnik-windows':'MojNotatnik.exe', 'encloser-cad-windows':'EnclosureCAD.exe', 'padbridge-windows':'PadBridge.exe'}
FOLDERS = {'moj-notatnik-windows':'MojNotatnik', 'encloser-cad-windows':'EnclosureCAD', 'padbridge-windows':'PadBridge'}
BAD_EXT = {'.pdb','.mdb','.cs','.csproj','.sln','.c','.cpp','.cxx','.h','.hpp','.java','.kt','.kts','.jks','.keystore','.pfx','.p12','.pkcs12','.p8','.pem','.key','.bak','.log','.jsonl','.db','.sqlite','.sqlite3','.dmp','.scad','.fcstd','.frag','.vert','.user'}
BAD_DIR = {'logs','backup','backups','sources','zrodla','userdata','savedata','playerdata','.git','.vs','obj','debug','tests','profiles'}
BAD_NAMES = {'createdump.exe','czytaj-najpierw.html'}
PUBLIC_RUNTIME_NAMES = {'microsoft.security.authentication.oauth.projection.dll','microsoft.security.authentication.oauth.winmd'}
ANDROID_VERSION_FILES = {'META-INF/androidx.credentials_credentials.version','META-INF/androidx.credentials_credentials-play-services-auth.version'}
SECRET_NAME = re.compile(r'(^|[_.-])(id_rsa|id_ed25519|credentials|secrets?|tokens?|oauth|client_secret|service_account|private_key)([_.-]|$)', re.I)

class Rejected(Exception):
    pass

def run(args, **kwargs):
    proc = subprocess.run([str(x) for x in args], capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=kwargs.pop('timeout',180), **kwargs)
    if proc.returncode:
        # Commands and environment are deliberately not included (can contain credentials).
        message = (proc.stderr or proc.stdout).strip()[-1200:]
        raise Rejected(message or f'Proces zakończony kodem {proc.returncode}')
    return proc.stdout

def version(value):
    value = str(value).strip().removeprefix('v')
    match = re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.0)?(?:\+[a-fA-F0-9]+)?',value)
    if not match:
        raise Rejected(f'Wersja nie ma formatu X.Y.Z: {value[:60]}')
    return '.'.join(match.groups())

def order(v):
    return tuple(map(int, version(v).split('.')))

def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()

def safe_name(name):
    path = PurePosixPath(name)
    if '\\' in name or path.is_absolute() or '..' in path.parts or ':' in name:
        raise Rejected('Niebezpieczna ścieżka w paczce')
    if any(p.lower() in BAD_DIR for p in path.parts) or path.suffix.lower() in BAD_EXT:
        return False
    if path.name.lower() in BAD_NAMES or path.name.startswith('.env') or (SECRET_NAME.search(path.name) and path.name.lower() not in PUBLIC_RUNTIME_NAMES and name not in ANDROID_VERSION_FILES):
        return False
    return True

def normal_unity(name, v):
    # Only the version in the existing executable/data root varies.
    return name.replace(f'Infernal Rift v{v}', 'Infernal Rift v{version}')

def unity_version(data):
    # Unity serialized strings are length-prefixed. Reject ambiguous files.
    found = set()
    for match in re.finditer(rb'(?<![0-9.])\d+\.\d+\.\d+(?![0-9.a-zA-Z])',data):
        start = match.start()
        if start >= 4 and int.from_bytes(data[start-4:start],'little') == len(match[0]):
            found.add(version(match[0].decode('ascii')))
    if len(found) != 1:
        raise Rejected('Nie można jednoznacznie odczytać wersji z globalgamemanagers')
    return found.pop()

def pe_version(path):
    """Read Windows fixed PRODUCTVERSION, rather than the directory name."""
    api = ctypes.WinDLL('version',use_last_error=True)
    api.GetFileVersionInfoSizeW.argtypes = [ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_uint)]
    api.GetFileVersionInfoW.argtypes = [ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p]
    api.VerQueryValueW.argtypes = [ctypes.c_void_p,ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(ctypes.c_uint)]
    dummy = ctypes.c_uint()
    size = api.GetFileVersionInfoSizeW(str(path),ctypes.byref(dummy))
    if not size:
        raise Rejected('Brak wersji produktu w EXE/DLL')
    buffer = ctypes.create_string_buffer(size)
    if not api.GetFileVersionInfoW(str(path),0,size,buffer):
        raise Rejected('Nie można odczytać zasobu wersji Windows')
    pointer, length = ctypes.c_void_p(), ctypes.c_uint()
    if not api.VerQueryValueW(buffer,'\\',ctypes.byref(pointer),ctypes.byref(length)) or length.value < 52:
        raise Rejected('Uszkodzony zasób wersji Windows')
    fields = struct.unpack('<13I',ctypes.string_at(pointer,52))
    if fields[0] != 0xFEEF04BD:
        raise Rejected('Niepoprawny podpis zasobu wersji')
    ms, ls = fields[4:6]
    return version(f'{ms>>16}.{ms&65535}.{ls>>16}.{ls&65535}')

def apk_metadata(path, config):
    path = Path(path)
    if not str(path).isascii():
        # Windows aapt cannot open some Unicode/DriveFS paths. Copy only this APK,
        # into the private metadata cache, and reject a concurrent source change.
        cache = Path(config['stateDir'])/'metadata-cache'
        cache.mkdir(exist_ok=True)
        local = cache/(hashlib.sha256(str(path).encode()).hexdigest()+'.apk')
        before = (path.stat().st_size,path.stat().st_mtime_ns)
        shutil.copyfile(path,local)
        if (path.stat().st_size,path.stat().st_mtime_ns)!=before:
            raise Rejected('APK zmienił się podczas odczytu wersji')
        path = local
    text = run([config['aapt'],'dump','badging',path])
    package = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'",text,re.M)
    if not package:
        raise Rejected('Nie można odczytać manifestu APK')
    raw_version = package[3]
    canonical = raw_version+'.0' if package[1]=='pl.volvio.scanner' and re.fullmatch(r'\d+\.\d+',raw_version) else raw_version
    return {'package':package[1], 'versionCode':int(package[2]), 'version':version(canonical),'versionName':raw_version,
            'debuggable':'application-debuggable' in text}

def validate_apk(path, channel, config):
    meta = apk_metadata(path,config)
    if meta['package'] != CHANNELS[channel][2] or meta['debuggable']:
        raise Rejected('APK ma inny identyfikator lub włączone debugowanie')
    output = run([config['java'],'-jar',config['apksigner'],'verify','--verbose','--print-certs',path])
    if not re.search(r'Verified using v[23](?:\.\d+)? scheme[^\n]*: true',output):
        raise Rejected('APK nie ma poprawnego podpisu v2/v3')
    if re.search(r'certificate DN:.*(?:Android Debug|CN=debug)',output,re.I):
        raise Rejected('APK podpisany kluczem debug')
    certs = set(re.findall(r'certificate SHA-256 digest: ([a-fA-F0-9]{64})',output))
    approved = set(config.get('certificates',{}).get(channel,[]))
    if not certs or not certs.issubset(approved):
        raise Rejected('Certyfikat APK wymaga zatwierdzenia w lokalnej konfiguracji')
    with zipfile.ZipFile(path) as archive:
        checked_entries(archive,windows=False)
        if archive.testzip() is not None:
            raise Rejected('Błąd integralności APK')
        for info in archive.infolist():
            if not info.is_dir() and not safe_name(info.filename):
                raise Rejected(f'Niedozwolony plik APK: {info.filename}')
            if info.filename in ANDROID_VERSION_FILES:
                # AndroidX publishes these two dependency-version markers. The
                # exact path is exempted only when its contents are a version.
                if info.file_size>80 or not re.fullmatch(rb'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\r?\n?',archive.read(info)):
                    raise Rejected('Metadane biblioteki AndroidX zawierają treść inną niż numer wersji')
    return {**meta,'certificates':sorted(certs),'sha256':sha(path),'sizeBytes':Path(path).stat().st_size}

def checked_entries(archive,windows=True):
    names = set()
    total = 0
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        name = entry.filename
        safe_name(name)  # checks traversal, including a Windows separator/drive
        identity = name.casefold() if windows else name
        if identity in names or (entry.external_attr >> 16) & 0o170000 == 0o120000:
            raise Rejected('Powtórzona ścieżka lub dowiązanie w ZIP')
        names.add(identity)
        total += entry.file_size
        if total > 8*1024**3 or entry.flag_bits & 1:
            raise Rejected('ZIP jest zaszyfrowany lub przekracza limit 8 GiB')

def validate_windows_zip(path, channel, v, profile):
    with zipfile.ZipFile(path) as archive:
        checked_entries(archive)
        names = [e.filename for e in archive.infolist() if not e.is_dir()]
        normalized = {normal_unity(n,v) if channel=='infernal-rift-unity-windows' else n for n in names}
        required = set(profile['entries'])
        extra, missing = normalized-required, required-normalized
        if extra or missing:
            raise Rejected(f'Układ paczki wymaga przeglądu; nowe: {sorted(extra)[:6]}, brak: {sorted(missing)[:6]}')
        if archive.testzip() is not None:
            raise Rejected('Błąd integralności ZIP')
        for name in names:
            if not safe_name(name):
                raise Rejected(f'Niedozwolony plik ZIP: {name}')
        if channel=='infernal-rift-unity-windows':
            managers = [n for n in names if n.endswith('_Data/globalgamemanagers')]
            if len(managers)!=1 or unity_version(archive.read(managers[0]))!=v:
                raise Rejected('Wersja danych Unity nie zgadza się z wydaniem')
    return {'version':v,'sha256':sha(path),'sizeBytes':Path(path).stat().st_size,'files':len(names)}

def scan_tree(root):
    """Never follow a reparse point or collect a private/work directory."""
    root = Path(root)
    if root.is_symlink() or getattr(root,'is_junction',lambda:False)():
        raise Rejected('Katalog wydania jest dowiązaniem')
    result = []
    for current, dirs, files in os.walk(root,followlinks=False):
        for d in list(dirs):
            path = Path(current)/d
            if d.lower() in BAD_DIR:
                dirs.remove(d)
            elif path.is_symlink() or getattr(path,'is_junction',lambda:False)():
                raise Rejected('Dowiązanie w katalogu wydania')
        for name in files:
            file = Path(current)/name
            rel = file.relative_to(root).as_posix()
            if file.is_symlink():
                raise Rejected('Dowiązanie do pliku w wydaniu')
            if safe_name(rel):
                result.append((rel,file))
    return sorted(result)

def json_without_secrets(data):
    if isinstance(data,dict):
        for key,value in data.items():
            if re.search(r'password|access.?token|refresh.?token|client.?secret|private.?key',key,re.I) and value:
                raise Rejected('Paczka zawiera dane uwierzytelniania w JSON')
            json_without_secrets(value)
    elif isinstance(data,list):
        for value in data:
            json_without_secrets(value)

def folder_plan(path,channel,profile,config):
    base = FOLDERS[channel]
    plan = {}
    for relative,file in scan_tree(path):
        entry = base+'/'+relative
        if channel=='encloser-cad-windows' and relative.startswith('_internal/OCP/') and file.suffix=='.py':
            entry = entry[:-3]+'.pyc'
        plan[entry] = file
    if channel=='moj-notatnik-windows':
        for name in ('MSVCP140.dll','VCOMP140.DLL','VCRUNTIME140.dll','VCRUNTIME140_1.dll'):
            plan[base+'/speech/'+name] = Path(os.environ.get('SystemRoot',r'C:\Windows'))/'System32'/name
    if channel=='encloser-cad-windows':
        licenses = Path(path)/'_internal/enclosurecad/assets/batteries/sources'
        if licenses.exists():
            for file in licenses.rglob('*'):
                if file.is_file() and file.name.lower().startswith(('license','readme')) and file.suffix.lower()!='.scad':
                    plan[base+'/LICENCJE-MODELI/'+file.relative_to(licenses).as_posix()] = file
    expected = set(profile['entries'])-{'CZYTAJ-MNIE.txt'}
    extra, missing = set(plan)-expected, expected-set(plan)
    if extra or missing:
        raise Rejected(f'Układ Windows wymaga przeglądu; nowe: {sorted(extra)[:6]}, brak: {sorted(missing)[:6]}')
    for name,file in plan.items():
        if not file.is_file() or file.is_symlink():
            raise Rejected(f'Brak pliku wykonawczego/biblioteki: {name}')
        if file.suffix=='.json':
            json_without_secrets(json.loads(file.read_text(encoding='utf-8-sig')))
    return plan

def plan_fingerprint(plan):
    rows = [(n,p.stat().st_size,p.stat().st_mtime_ns) for n,p in sorted(plan.items())]
    raw = json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()
    return hashlib.sha256(raw).hexdigest(),max((p.stat().st_mtime for p in plan.values()),default=0)

def package_folder(candidate,profile,config,target):
    path,channel,v = Path(candidate['path']),candidate['channel'],candidate['version']
    plan = folder_plan(path,channel,profile,config)
    before,_ = plan_fingerprint(plan)
    if pe_version(path/EXES[channel])!=v:
        raise Rejected('Wersja EXE zmieniła się w trakcie sprawdzania')
    if channel in ('moj-notatnik-windows','padbridge-windows'):
        if pe_version(path/(Path(EXES[channel]).stem+'.dll'))!=v:
            raise Rejected('Wersja EXE i głównej biblioteki DLL różni się')
    temporary = target.with_suffix('.partial')
    compiled = target.parent/'bytecode'
    try:
        with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as archive:
            for name,file in sorted(plan.items()):
                if name.endswith('.pyc') and file.suffix=='.py':
                    compiled.mkdir(exist_ok=True)
                    bytecode = compiled/(hashlib.sha256(name.encode()).hexdigest()+'.pyc')
                    run([config['cadPython'],'-c','import py_compile,sys; py_compile.compile(sys.argv[1],cfile=sys.argv[2],dfile=sys.argv[3],doraise=True)',file,bytecode,name[:-1]])
                    archive.write(bytecode,name)
                elif file.name.endswith('.deps.json'):
                    deps = json.loads(file.read_text(encoding='utf-8-sig'))
                    for packages in deps['targets'].values():
                        for package in packages.values():
                            for kind in ('native','runtime'):
                                for asset in list(package.get(kind,{})):
                                    if PurePosixPath(asset).name=='createdump.exe':
                                        del package[kind][asset]
                    archive.writestr(name,json.dumps(deps,ensure_ascii=False,indent=2)+'\n')
                else:
                    archive.write(file,name)
            archive.writestr('CZYTAJ-MNIE.txt',f'{CHANNELS[channel][0]} v{v}\n\nRozpakuj cały ZIP do nowego folderu. Uruchom {FOLDERS[channel]}\\{EXES[channel]}. Zachowaj wszystkie dołączone biblioteki.\n\n'+profile['readme'])
        after,_ = plan_fingerprint(folder_plan(path,channel,profile,config))
        if after!=before:
            raise Rejected('Build zmienił się podczas pakowania')
        temporary.replace(target)
        return validate_windows_zip(target,channel,v,profile)
    finally:
        temporary.unlink(missing_ok=True)
        if compiled.exists():
            # Exact task-owned cache; never delete anything below a project root.
            for file in compiled.glob('*.pyc'):
                file.unlink()
            compiled.rmdir()

def remote_channels(releases):
    latest = {}
    for release in releases:
        if release.get('draft') or release.get('prerelease'):
            continue
        tag = release.get('tag_name','')
        for channel,(_,pattern,_) in CHANNELS.items():
            prefixes = [channel+'-v']
            if channel.startswith('infernal-rift-'):
                prefixes += [channel.rsplit('-',1)[0]+'-v']
            prefix = next((p for p in prefixes if tag.startswith(p)),None)
            if prefix is None:
                continue
            try:
                v = version(tag[len(prefix):])
            except Rejected:
                continue
            for asset in release.get('assets',[]):
                if asset.get('name') != pattern.format(v=v) or asset.get('state')!='uploaded' or not asset.get('size'):
                    continue
                if not re.fullmatch(r'sha256:[a-fA-F0-9]{64}',asset.get('digest') or ''):
                    continue
                if channel not in latest or order(v)>order(latest[channel]['version']):
                    latest[channel] = {'version':v,'tag':tag,'asset':asset}
    return latest


def release_notes_file(candidate):
    if not candidate.get('path'):
        raise Rejected('Brak lokalizacji paczki do dopasowania publicznego opisu zmian')
    channel,v = candidate['channel'],candidate['version']
    name = Path(CHANNELS[channel][1].format(v=v)).stem+'.changes.json'
    return Path(candidate['path']).parent/name


def public_release_notes(candidate):
    """Read only an explicitly named public companion, never project reports."""
    channel,v = candidate['channel'],candidate['version']
    file = release_notes_file(candidate)
    if not file.exists():
        raise Rejected(f'Brak publicznego opisu zmian dla {channel} v{v}; paczka nie zostanie opublikowana')
    if file.is_symlink() or not file.is_file() or file.stat().st_size>65536:
        raise Rejected('Nieprawidłowy publiczny opis zmian')
    data = json.loads(file.read_text(encoding='utf-8-sig'))
    if not isinstance(data,dict) or set(data)!={'schemaVersion','channel','version','changes'} or data['schemaVersion']!=1 or data['channel']!=channel or version(data['version'])!=v:
        raise Rejected('Opis zmian nie pasuje do kanału i wersji paczki')
    items = data['changes']
    if not isinstance(items,list) or not items:
        raise Rejected('Publiczny opis wymaga niepustej listy rzeczywistych zmian')
    private = re.compile(r'[a-z]:[\\/]|\\\\|file://|https?://|-----BEGIN|github_pat_|gh[pousr]_[a-z0-9]|(?:token|password|client_secret|api_key)\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}',re.I)
    normalized=[]
    for item in items:
        if not isinstance(item,str):
            raise Rejected('Punkt zmian musi być tekstem')
        text=' '.join(item.replace('**','').replace('__','').replace('`','').split())
        if not text or re.search(r'</?[A-Za-z!][^>]*>|[\x00-\x08\x0b\x0c\x0e-\x1f]',item) or private.search(item) or private.search(text):
            raise Rejected('Punkt zmian zawiera niedozwoloną treść lub dane prywatne')
        normalized.append(text)
    return normalized

class GitHub:
    def __init__(self, config, authenticated=False):
        self.config,self.authenticated = config,authenticated
        self.env = {**os.environ,'GH_CONFIG_DIR':config['ghConfig'],'GH_HOST':'github.com','GH_PROMPT_DISABLED':'1','GH_NO_UPDATE_NOTIFIER':'1','GH_NO_EXTENSION_UPDATE_NOTIFIER':'1'}
        for key in ('GH_DEBUG','GITHUB_TOKEN','GH_TOKEN'):
            self.env.pop(key,None)
        hosts = Path(config['ghConfig'])/'hosts.yml'
        if authenticated and hosts.exists() and re.search(r'oauth_token:[ \t]*[^ \t\r\n]+',hosts.read_text(encoding='utf-8')):
            raise Rejected('Poświadczenia GitHub muszą być zapisane w bezpiecznym magazynie Windows')

    def api(self,path,method='GET',body=None,file=None):
        if self.authenticated:
            args = [self.config['gh'],'api',path,'--method',method,'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2022-11-28']
            if file:
                args += ['-H','Content-Type: application/octet-stream','--input',str(file)]
            elif body is not None:
                args += ['--input','-']
            result = run(args,env=self.env,input=json.dumps(body) if body is not None else None,timeout=1200 if file else 90)
            return json.loads(result) if result.strip() else None
        if method!='GET':
            raise Rejected('Tryb sprawdzania nie może zapisywać danych na GitHub')
        request = urllib.request.Request('https://api.github.com/'+path,headers={'User-Agent':'ZeroSkilla-local-publisher','Accept':'application/vnd.github+json'})
        with urllib.request.urlopen(request,timeout=45) as response:
            return json.load(response)

    def releases(self):
        releases = []
        for page in range(1,101):
            batch = self.api(f'repos/{REPO}/releases?per_page=100&page={page}')
            if not isinstance(batch,list):
                raise Rejected('Błędna odpowiedź GitHub Releases')
            releases += batch
            if len(batch)<100:
                return releases
        raise Rejected('Niepełna lista wydań — publikacja wstrzymana')

    def enabled(self):
        current = json.loads(Path(self.config['_path']).read_text(encoding='utf-8-sig'))
        if current.get('enabled') is not True or (Path(self.config['stateDir'])/'PAUSE').exists():
            raise Rejected('Publikacja została lokalnie wyłączona')
        for repo in (REPO,SITE):
            try:
                switch = self.api(f'repos/{repo}/actions/variables/PUBLICATION_ENABLED')
            except Rejected as error:
                if 'HTTP 404' in str(error):
                    continue # Missing variable defaults to enabled, as in the workflows.
                raise
            if str(switch.get('value','')).lower()=='false':
                raise Rejected('Administrator wyłączył publikację na GitHub')

    def publish(self, candidate, package, releases):
        self.enabled()
        channel,v = candidate['channel'],candidate['version']
        name = CHANNELS[channel][1].format(v=v)
        tag = channel+'-v'+v
        title = f'{CHANNELS[channel][0]} v{v} — '+('Android' if channel.endswith('android') else 'Windows')
        notes = public_release_notes(candidate)
        if not notes:
            raise Rejected('Brak publicznego opisu zmian; paczka nie zostanie opublikowana')
        notes_path=release_notes_file(candidate)
        notes_hash=sha(notes_path)
        if package.get('notesSHA256',notes_hash)!=notes_hash:
            raise Rejected('Opis zmian różni się od sprawdzonego razem z paczką')
        public_changes = '## Co nowego\n\n'+'\n'.join('- '+item for item in notes)+'\n\n## Plik do pobrania\n\n'
        body = f'{MARKER}\n\n{title}\n\nGotowa paczka dystrybucyjna. Wersja wewnętrzna i integralność sprawdzone automatycznie.\n\nPlik: `{name}`\nRozmiar: {package["sizeBytes"]} bajtów\nSHA256: `{package["sha256"]}`\n\n'+('APK: sprawdzony podpis produkcyjny, debugowanie wyłączone.' if channel.endswith('android') else 'Windows: przenośny ZIP; rozpakuj wszystkie pliki. Kontrola statyczna paczki nie zastępuje testów działania aplikacji.')
        body = body.replace(title+'\n\n',title+'\n\n'+public_changes,1)
        release = next((r for r in releases if r['tag_name']==tag),None)
        if release:
            if not release.get('draft') or release.get('prerelease') or MARKER not in (release.get('body') or ''):
                raise Rejected('Wydanie już istnieje; automat nie nadpisuje wydań ani cudzych szkiców')
        else:
            # Pin the current main SHA: never create a release from an arbitrary local ref.
            commit = self.api(f'repos/{REPO}/commits/main')['sha']
            release = self.api(f'repos/{REPO}/releases','POST',{'tag_name':tag,'target_commitish':commit,'name':title,'body':body,'draft':True,'prerelease':False})
        if any(a['name']!=name for a in release.get('assets',[])):
            raise Rejected('Szkic zawiera dodatkowe pliki — publikacja wstrzymana')
        asset = next((a for a in release['assets'] if a['name']==name),None)
        if not asset:
            from urllib.parse import quote
            upload = release['upload_url'].split('{')[0]+'?name='+quote(name)
            if not upload.startswith(f'https://uploads.github.com/repos/{REPO}/releases/'):
                raise Rejected('Niepoprawny adres przesyłania pliku')
            self.enabled()
            asset = self.api(upload,'POST',file=package['path'])
        if asset.get('state')!='uploaded' or asset.get('size')!=package['sizeBytes'] or asset.get('digest')!='sha256:'+package['sha256']:
            raise Rejected('GitHub nie potwierdził rozmiaru i SHA256 przesłanego pliku; pozostawiono szkic')
        expected_url = f'https://github.com/{REPO}/releases/download/{tag}/{name}'
        # Drafts expose an untagged URL until GitHub publishes the release.
        temporary_url = re.fullmatch(r'https://github\.com/'+re.escape(REPO)+r'/releases/download/untagged-[a-zA-Z0-9-]+/'+re.escape(name),asset.get('browser_download_url',''))
        if asset.get('browser_download_url')!=expected_url and not temporary_url:
            raise Rejected('Adres pliku nie zgadza się z repozytorium i tagiem')
        if sha(package['path'])!=package['sha256']:
            raise Rejected('Lokalna paczka zmieniła się w trakcie wysyłania')
        refreshed = self.api(f'repos/{REPO}/releases/{release["id"]}')
        if not refreshed.get('draft') or refreshed.get('tag_name')!=tag or MARKER not in (refreshed.get('body') or '') or len(refreshed.get('assets',[]))!=1 or refreshed['assets'][0].get('id')!=asset.get('id'):
            raise Rejected('Szkic zmienił się w trakcie wysyłania — publikacja wstrzymana')
        self.enabled()
        if sha(notes_path)!=notes_hash:
            raise Rejected('Opis zmian zmienił się w trakcie wysyłania; pozostawiono szkic')
        self.api(f'repos/{REPO}/releases/{release["id"]}','PATCH',{'draft':False,'body':body})
        published = self.api(f'repos/{REPO}/releases/{release["id"]}')
        final_assets = published.get('assets',[])
        if published['draft'] or len(final_assets)!=1 or final_assets[0].get('browser_download_url')!=expected_url or final_assets[0].get('size')!=package['sizeBytes'] or final_assets[0].get('digest')!='sha256:'+package['sha256']:
            raise Rejected('GitHub nie potwierdził publikacji, końcowego adresu i sumy pliku')
        if published.get('body')!=body:
            raise Rejected('GitHub nie potwierdził pełnego opisu zmian wydania')
        return {'tag':tag,'url':published['html_url'],'downloadUrl':expected_url,'sha256':package['sha256'],'sizeBytes':package['sizeBytes']}

def discover(config, state, events):
    found = []
    seen = set()
    for source in config['sources']:
        channel,kind = source['channel'],source['kind']
        if channel not in CHANNELS:
            raise Rejected('Niedozwolony kanał w konfiguracji')
        for path_string in glob.iglob(source['glob'],recursive=False):
            path = Path(path_string)
            key = (channel,str(path))
            if key in seen:
                continue
            seen.add(key)
            try:
                metadata_file = path/EXES[channel] if kind=='folder' else path
                if not metadata_file.is_file() or path.is_symlink():
                    continue
                stat = metadata_file.stat()
                stamp = f'{stat.st_size}/{stat.st_mtime_ns}'
                cache_key = channel+'|'+str(path)
                cached = state.setdefault('metadata',{}).get(cache_key)
                if cached and cached['stamp']==stamp:
                    meta = cached['value']
                elif kind=='apk':
                    meta = apk_metadata(path,config)
                elif kind=='folder':
                    meta = {'version':pe_version(metadata_file)}
                elif kind=='unity-zip':
                    with zipfile.ZipFile(path) as archive:
                        matches = [n for n in archive.namelist() if n.endswith('_Data/globalgamemanagers')]
                        if len(matches)!=1:
                            raise Rejected('Brak jednoznacznego pliku wersji Unity')
                        meta = {'version':unity_version(archive.read(matches[0]))}
                else:
                    raise Rejected('Nieznany rodzaj paczki')
                state['metadata'][cache_key] = {'stamp':stamp,'value':meta}
                if kind=='apk' and (meta['debuggable'] or meta['package']!=CHANNELS[channel][2]):
                    events.append({'channel':channel,'status':'rejected','file':path.name,'reason':'Wersja debug lub inny identyfikator aplikacji'})
                    continue
                found.append({'channel':channel,'kind':kind,'path':str(path),'version':meta['version']})
            except Exception as error:
                events.append({'channel':channel,'status':'rejected','file':path.name,'reason':str(error)[:1000]})
    return found

@contextlib.contextmanager
def exclusive_lock(path):
    import msvcrt
    with Path(path).open('a+b') as stream:
        stream.seek(0)
        if not stream.read(1):
            stream.write(b'0');stream.flush()
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
        except OSError:
            raise Rejected('Poprzednie sprawdzanie nadal trwa') from None
        try:
            yield
        finally:
            stream.seek(0);msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)

def check(config, state, github, profiles, publish=False):
    events = []
    releases = github.releases()
    latest = remote_channels(releases)
    candidates = discover(config,state,events)
    for channel in CHANNELS:
        choices = sorted((c for c in candidates if c['channel']==channel),key=lambda c:order(c['version']),reverse=True)
        if not choices:
            events.append({'channel':channel,'status':'missing','reason':'Brak gotowej paczki w skonfigurowanych lokalizacjach'})
            continue
        if channel in latest and order(choices[0]['version'])<=order(latest[channel]['version']):
            events.append({'channel':channel,'status':'up-to-date','version':latest[channel]['version']})
            continue
        notes_required_version=None
        for candidate in choices:
            v = candidate['version']
            if notes_required_version is not None and order(v)<order(notes_required_version):
                break
            if channel in latest and order(v)<=order(latest[channel]['version']):
                break
            try:
                public_release_notes(candidate)
            except Exception as error:
                events.append({'channel':channel,'version':v,'status':'blocked','reason':str(error)[:1500]})
                notes_required_version=v
                continue
            try:
                profile = profiles.get(channel,{})
                if candidate['kind']=='folder':
                    plan = folder_plan(candidate['path'],channel,profile,config)
                else:
                    plan = {Path(candidate['path']).name:Path(candidate['path'])}
                notes_path=release_notes_file(candidate)
                plan={**plan,'public-release-notes/'+notes_path.name:notes_path}
                notes_hash_before=sha(notes_path)
                fingerprint,newest = plan_fingerprint(plan)
                if sha(notes_path)!=notes_hash_before:
                    raise Rejected('Opis zmian zmienił się podczas sprawdzania stabilności')
                observation_key = channel+'|'+v+'|'+candidate['path']
                observed = state.setdefault('observations',{}).get(observation_key,{})
                now = time.time()
                if observed.get('fingerprint')!=fingerprint:
                    observed = {'fingerprint':fingerprint,'since':now}
                state['observations'][observation_key] = observed
                quiet = max(60, int(config.get('quietSeconds',60)))
                if publish and (now-newest<quiet or now-observed['since']<quiet):
                    events.append({'channel':channel,'version':v,'status':'waiting','reason':f'Paczka musi pozostać bez zmian przez dwa sprawdzenia i co najmniej {quiet} sekund'})
                    break
                if not publish:
                    # Real APK/ZIP checks in check mode, without copying or packaging huge folders.
                    if candidate['kind']=='apk':
                        validate_apk(candidate['path'],channel,config)
                    elif candidate['kind']=='unity-zip':
                        validate_windows_zip(candidate['path'],channel,v,profile)
                    events.append({'channel':channel,'version':v,'status':'ready','file':Path(candidate['path']).name})
                    break
                cache = Path(config['stateDir'])/'packages'/channel/v
                cache.mkdir(parents=True,exist_ok=True)
                target = cache/CHANNELS[channel][1].format(v=v)
                if candidate['kind']=='folder':
                    meta = package_folder(candidate,profile,config,target)
                else:
                    before = fingerprint
                    shutil.copyfile(candidate['path'],target)
                    if plan_fingerprint(plan)[0]!=before:
                        raise Rejected('Plik zmienił się w trakcie kopiowania')
                    meta = validate_apk(target,channel,config) if candidate['kind']=='apk' else validate_windows_zip(target,channel,v,profile)
                if meta['version']!=v:
                    raise Rejected('Wersja zweryfikowanej paczki różni się od wykrytej')
                if sha(notes_path)!=notes_hash_before:
                    raise Rejected('Opis zmian zmienił się podczas przygotowania paczki')
                meta['path'] = str(target)
                meta['notesSHA256']=notes_hash_before
                result = github.publish(candidate,meta,releases)
                events.append({'channel':channel,'version':v,'status':'published',**result})
                # Keep verified cache for retries; avoid repackaging/reuploading existing versions.
                break
            except Exception as error:
                events.append({'channel':channel,'version':v,'status':'blocked','reason':str(error)[:1500]})
    if any(e['status']=='published' for e in events):
        state['websiteRefreshPending'] = True
    if publish and state.get('websiteRefreshPending'):
        try:
            github.enabled()
            github.api(f'repos/{SITE}/actions/workflows/publish.yml/dispatches','POST',{'ref':'main'})
            state['websiteRefreshPending'] = False
            events.append({'status':'website-refresh-requested'})
        except Exception as error:
            events.append({'status':'website-refresh-pending','reason':str(error)[:1000]})
    return events

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True)
    parser.add_argument('--publish',action='store_true')
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    config = json.loads(config_path.read_text(encoding='utf-8-sig'))
    config['_path'] = str(config_path)
    state_dir = Path(config['stateDir'])
    state_dir.mkdir(parents=True,exist_ok=True)
    report = {'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'mode':'publish' if args.publish else 'check','events':[]}
    exit_code = 0
    try:
        with exclusive_lock(state_dir/'publisher.lock'):
            if args.publish and (config.get('enabled') is not True or (state_dir/'PAUSE').exists()):
                report['events'] = [{'status':'paused'}]
            else:
                profiles = json.loads(Path(config['profiles']).read_text(encoding='utf-8-sig'))
                state_file = state_dir/'state.json'
                state = json.loads(state_file.read_text(encoding='utf-8-sig')) if state_file.exists() else {}
                github = GitHub(config,authenticated=args.publish)
                if args.publish:
                    github.enabled()
                report['events'] = check(config,state,github,profiles,args.publish)
                temporary = state_dir/'state.tmp'
                temporary.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
                temporary.replace(state_file)
    except Exception as error:
        report['events'].append({'status':'error','reason':str(error)[:1500]})
        exit_code = 1
    logs = state_dir/'logs'
    logs.mkdir(exist_ok=True)
    body = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    (state_dir/'last-run.json').write_text(body,encoding='utf-8')
    (logs/(dt.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')).write_text(body,encoding='utf-8')
    for old in sorted(logs.glob('*.json'))[:-200]:
        old.unlink()
    # Summary contains no tokens or private contents. Full local paths stay in local state only.
    print(body)
    return exit_code

if __name__=='__main__':
    raise SystemExit(main())
