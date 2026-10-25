"""Safety and idempotency tests; every GitHub mutation is simulated."""
import importlib.util
import io
import json
import contextlib
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec=importlib.util.spec_from_file_location('publisher',Path(__file__).with_name('local-publisher.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
TEST_DIR=Path(__file__).resolve().parent/'.publisher-test-temp'
TEST_DIR.mkdir(exist_ok=True)

@contextlib.contextmanager
def test_folder():
    with tempfile.TemporaryDirectory(dir=TEST_DIR) as folder:
        assert Path(folder).resolve().parent==TEST_DIR.resolve()
        yield folder

def release(channel,v,draft=False):
    name=p.CHANNELS[channel][1].format(v=v)
    return {'tag_name':channel+'-v'+v,'draft':draft,'prerelease':False,'assets':[{'name':name,'state':'uploaded','size':100,'digest':'sha256:'+'a'*64}]}

def archive(names):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as out:
        for name in names:out.writestr(name,b'data')
    stream.seek(0)
    return zipfile.ZipFile(stream)

class Validation(unittest.TestCase):
    def test_windows_child_processes_never_create_console_windows(self):
        result=type('Result',(),{'returncode':0,'stdout':'ok','stderr':''})()
        with patch.object(p.os,'name','nt'),patch.object(p.subprocess,'run',return_value=result) as child:
            self.assertEqual(p.run(['gh','api','repos/example/repository']),'ok')
        self.assertTrue(child.call_args.kwargs['creationflags'] & 0x08000000)
        self.assertTrue(child.call_args.kwargs['capture_output'])

    def test_only_opted_in_version_matched_public_report_changes_are_published(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'infernal-rift-unity-android','kind':'apk','path':str(file),'version':'2.15.12'}
            report=root/'Instrukcja-i-raport-v2.15.12.txt'
            report.write_text('Infernal Rift Unity v2.15.12 — poprawki\nPC i Android korzystają ze wspólnych zasobów.\n\nPoprawki:\n- Przywrócono krew\n  i plamy na podłożu.\n- Zachowano zapisane życie.\n\nInstalacja:\nC:\\private\\report.txt\n',encoding='utf-8')
            with self.assertRaisesRegex(p.Rejected,'Brak publicznego opisu'):p.public_release_notes(candidate)
            candidate['allowPublicReport']=True
            self.assertEqual(p.release_notes_file(candidate),report)
            self.assertEqual(p.public_release_notes(candidate),['Przywrócono krew i plamy na podłożu.','Zachowano zapisane życie.'])
            (root/'Infernal-Rift-Unity-v2.15.12.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':'2.15.12','changes':['Jawny opis autora.']}),encoding='utf-8')
            self.assertEqual(p.public_release_notes(candidate),['Jawny opis autora.'])

    def test_public_reports_keep_platform_specific_changes_separate(self):
        text='Infernal Rift Unity v2.15.12 — poprawki\nPC i Android.\nPoprawki:\n- Wspólna zmiana.\nAndroid:\n- Dotyk.\nWindows:\n- Mysz.\nWspólne:\n- Zapis.\n- Android: Ikony.\n- PC: Skróty.\nInstalacja:\nPrywatny tekst.'
        for suffix,expected in [('android',['Wspólna zmiana.','Dotyk.','Zapis.','Android: Ikony.']),('windows',['Wspólna zmiana.','Mysz.','Zapis.','PC: Skróty.'])]:
            candidate={'channel':'infernal-rift-unity-'+suffix,'version':'2.15.12','allowPublicReport':True}
            self.assertEqual(p.public_report_data(text,candidate)['changes'],expected)

    def test_wrong_private_or_ambiguous_report_cannot_unlock_a_release(self):
        with test_folder() as folder:
            root=Path(folder);candidate={'path':str(root/'app.apk'),'channel':'infernal-rift-unity-android','version':'2.15.12','allowPublicReport':True}
            report=root/'Instrukcja-i-raport-v2.15.12.txt'
            base='Infernal Rift Unity v2.15.12 — poprawki\nPC i Android.\nPoprawki:\n- Poprawiono krew.\n'
            for text in (base.replace('v2.15.12','v2.15.11'),base.replace('PC i Android.','Nieokreślony system.'),base+'- token=private\n',base+'Niewyodrębniona dodatkowa zmiana.\n',base+'- Wspólna zmiana; PC: inna funkcja.\n',base+'- person@example.com\n'):
                report.write_text(text,encoding='utf-8')
                with self.assertRaises(p.Rejected):p.public_release_notes(candidate)
            with self.assertRaises(p.Rejected):p.public_report_data(base,{**candidate,'channel':'moj-notatnik-android'})

    def test_public_report_changes_restart_the_stability_period(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'infernal-rift-unity-android','kind':'apk','path':str(file),'version':'2.15.12','allowPublicReport':True}
            note=root/'Instrukcja-i-raport-v2.15.12.txt'
            base='Infernal Rift Unity v2.15.12 — poprawki\nPC i Android.\nPoprawki:\n- Pierwszy opis.\n'
            note.write_text(base,encoding='utf-8')
            class Fake:
                def releases(self):return []
                def publish(self,*args):raise AssertionError('Modified public notes must wait')
            state={};now=p.time.time()+1000
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p.time,'time',return_value=now):
                first=p.check({'quietSeconds':60},state,Fake(),{},True)
            note.write_text(base.replace('Pierwszy opis.','Uzupełniony opis.'),encoding='utf-8')
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p.time,'time',return_value=now+61):
                second=p.check({'quietSeconds':60},state,Fake(),{},True)
            self.assertTrue(any(e['status']=='waiting' for e in first))
            self.assertTrue(any(e['status']=='waiting' for e in second))

    def test_missing_notes_block_before_validation_or_upload_then_matching_notes_unblock_check(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'moj-notatnik-android','kind':'apk','path':str(file),'version':'2.9.8'}
            class Fake:
                def releases(self):return [release('moj-notatnik-android','2.9.7')]
                def publish(self,*args):raise AssertionError('Missing notes must block every upload')
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p,'validate_apk') as validate,patch.object(p,'package_folder') as package:
                for publishing in (False,True):
                    events=p.check({}, {},Fake(),{},publishing)
                    self.assertTrue(any(e['status']=='blocked' and 'Brak publicznego opisu' in e['reason'] for e in events))
                validate.assert_not_called();package.assert_not_called()
            (root/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':['Poprawiono nagrywanie.']}),encoding='utf-8')
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p,'validate_apk',return_value={'version':'2.9.8'}) as validate:
                events=p.check({}, {},Fake(),{},False)
                self.assertTrue(any(e['status']=='ready' and e['version']=='2.9.8' for e in events))
                validate.assert_called_once()

    def test_notes_preserve_every_long_point_and_normalize_wrapped_text(self):
        with test_folder() as folder:
            root=Path(folder);candidate={'path':str(root/'app.apk'),'channel':'moj-notatnik-android','version':'2.9.8'}
            items=['Dłuższa zmiana '+('szczegóły '*90).strip()]+['Zmiana '+str(i)+'.' for i in range(30)]+['Ustawienia > HUD\n  i zapis układu.']
            data={'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':items}
            note=root/'Moj-Notatnik-v2.9.8.changes.json';note.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            checked=p.public_release_notes(candidate)
            self.assertEqual(len(checked),32)
            self.assertEqual(checked[:-1],items[:-1])
            self.assertEqual(checked[-1],'Ustawienia > HUD i zapis układu.')
            data['channel']='volvio-scanner-android';note.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaisesRegex(p.Rejected,'kanału'):p.public_release_notes(candidate)

    def test_newer_version_without_notes_does_not_publish_an_older_local_candidate(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidates=[{'channel':'moj-notatnik-android','kind':'apk','path':str(file),'version':v} for v in ('2.9.8','2.9.9')]
            (root/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidates[0]['channel'],'version':'2.9.8','changes':['Starsza zmiana.']}),encoding='utf-8')
            class Fake:
                def releases(self):return [release('moj-notatnik-android','2.9.7')]
                def publish(self,*args):raise AssertionError('Do not fall back to an older local version')
            with patch.object(p,'discover',return_value=candidates),patch.object(p,'validate_apk') as validate:
                events=p.check({}, {},Fake(),{},False)
                validate.assert_not_called()
                self.assertTrue(any(e['status']=='blocked' and e['version']=='2.9.9' for e in events))
                self.assertFalse(any(e.get('version')=='2.9.8' for e in events))

    def test_one_missing_changelog_does_not_block_an_independent_described_channel(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidates=[{'channel':ch,'kind':'apk','path':str(file),'version':v} for ch,v in [('moj-notatnik-android','2.9.8'),('volvio-scanner-android','3.18.0')]]
            (root/'VolVio-Scanner-v3.18.0.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':'volvio-scanner-android','version':'3.18.0','changes':['Opis z dokumentacji tej wersji.']}),encoding='utf-8')
            class Fake:
                def releases(self):return []
            with patch.object(p,'discover',return_value=candidates),patch.object(p,'validate_apk',return_value={}):
                events=p.check({}, {},Fake(),{},False)
            self.assertTrue(any(e['channel']=='moj-notatnik-android' and e['status']=='blocked' for e in events))
            self.assertTrue(any(e['channel']=='volvio-scanner-android' and e['status']=='ready' for e in events))

    def test_note_changes_restart_the_stability_period(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'moj-notatnik-android','kind':'apk','path':str(file),'version':'2.9.8'}
            data={'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':['Pierwszy opis.']}
            note=root/'Moj-Notatnik-v2.9.8.changes.json';note.write_text(json.dumps(data),encoding='utf-8')
            class Fake:
                def releases(self):return []
                def publish(self,*args):raise AssertionError('Changed notes must wait for stability')
            state={};now=p.time.time()+1000
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p.time,'time',return_value=now):
                first=p.check({'quietSeconds':600},state,Fake(),{},True)
            data['changes']=['Poprawiony opis.'];note.write_text(json.dumps(data),encoding='utf-8')
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p.time,'time',return_value=now+601):
                second=p.check({'quietSeconds':600},state,Fake(),{},True)
            self.assertTrue(any(e['status']=='waiting' for e in first))
            self.assertTrue(any(e['status']=='waiting' for e in second))

    def test_direct_publish_without_notes_cannot_mutate_github(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh'},True)
            candidate={'channel':'moj-notatnik-android','version':'2.9.8','path':str(file)}
            with patch.object(gh,'enabled'),patch.object(gh,'api') as api:
                with self.assertRaisesRegex(p.Rejected,'Brak publicznego opisu'):gh.publish(candidate,{'path':str(file),'sizeBytes':3,'sha256':p.sha(file)},[])
                api.assert_not_called()

    def test_public_notes_require_explicit_companion_and_matching_version(self):
        with test_folder() as folder:
            root=Path(folder)
            candidate={'path':str(root/'app.apk'),'channel':'moj-notatnik-android','version':'2.9.8'}
            (root/'README.md').write_text('Private project report',encoding='utf-8')
            with self.assertRaisesRegex(p.Rejected,'Brak publicznego opisu'):p.public_release_notes(candidate)
            note=root/'Moj-Notatnik-v2.9.8.changes.json'
            data={'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':['Poprawiono nagrywanie.']}
            note.write_text(json.dumps(data),encoding='utf-8')
            self.assertEqual(p.public_release_notes(candidate),data['changes'])
            data['version']='2.9.7';note.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaisesRegex(p.Rejected,'wersji'):p.public_release_notes(candidate)

    def test_public_notes_reject_private_content_and_unexpected_fields(self):
        with test_folder() as folder:
            root=Path(folder);candidate={'path':str(root/'app.apk'),'channel':'moj-notatnik-android','version':'2.9.8'}
            note=root/'Moj-Notatnik-v2.9.8.changes.json'
            for text in ('C:\\Users\\private\\notes.txt','token=private','<script>bad</script>','Tekst\x01Druga linia','person@example.com','https://private.example/report','github_pat_private','**','__','`','  ** __ `  '):
                data={'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':[text]}
                note.write_text(json.dumps(data),encoding='utf-8')
                with self.assertRaises(p.Rejected,msg=text):p.public_release_notes(candidate)
            data={'schemaVersion':1,'channel':candidate['channel'],'version':'2.9.8','changes':['Publiczny opis.'],'privateKey':'private'}
            note.write_text(json.dumps(data),encoding='utf-8')
            with self.assertRaises(p.Rejected):p.public_release_notes(candidate)

    def test_an_alternative_copy_of_the_same_latest_version_with_notes_is_ready(self):
        with test_folder() as folder:
            root=Path(folder);first=root/'first';second=root/'second'
            first.mkdir();second.mkdir()
            for part in (first,second):(part/'app.apk').write_bytes(b'apk')
            candidates=[{'channel':'moj-notatnik-android','kind':'apk','path':str(part/'app.apk'),'version':'2.9.8'} for part in (first,second)]
            (second/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':'moj-notatnik-android','version':'2.9.8','changes':['**Poprawiono** zapis `notatki`.']}),encoding='utf-8')
            self.assertEqual(p.public_release_notes(candidates[1]),['Poprawiono zapis notatki.'])
            class Fake:
                def releases(self):return []
            with patch.object(p,'discover',return_value=candidates),patch.object(p,'validate_apk',return_value={'version':'2.9.8'}) as validate:
                events=p.check({}, {},Fake(),{},False)
            self.assertTrue(any(e['status']=='ready' and e['version']=='2.9.8' for e in events))
            validate.assert_called_once_with(str(second/'app.apk'),'moj-notatnik-android',{})

    def test_notes_must_match_the_hash_verified_with_the_package_before_any_upload(self):
        with test_folder() as folder:
            root=Path(folder);file=root/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'moj-notatnik-android','version':'2.9.8','path':str(file)}
            (root/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':candidate['version'],'changes':['Poprawiono zapis.']}),encoding='utf-8')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh'},True)
            with patch.object(gh,'enabled'),patch.object(gh,'api') as api:
                with self.assertRaisesRegex(p.Rejected,'sprawdzonego razem z paczką'):gh.publish(candidate,{'path':str(file),'sizeBytes':3,'sha256':p.sha(file),'notesSHA256':'0'*64},[])
                api.assert_not_called()

    def test_semantic_order_and_internal_four_component_version(self):
        self.assertGreater(p.order('2.15.3'),p.order('2.9.99'))
        self.assertEqual(p.version('0.1.12.0'),'0.1.12')
        for value in ('2.15','v2.15.3-dev','0.1.12.1','../2.15.3'):
            with self.assertRaises(p.Rejected):p.version(value)

    def test_volvio_two_part_manifest_version_has_explicit_zero_patch(self):
        text="package: name='pl.volvio.scanner' versionCode='317' versionName='3.17'"
        with patch.object(p,'run',return_value=text):
            meta=p.apk_metadata('app.apk',{'aapt':'aapt'})
        self.assertEqual(meta['versionName'],'3.17')
        self.assertEqual(meta['version'],'3.17.0')

    def test_game_version_comes_from_length_prefixed_unity_data(self):
        text=b'2.15.3'
        data=b'6000.3.4f1\0'+struct.pack('<I',len(text))+text+b'\0'
        self.assertEqual(p.unity_version(data),'2.15.3')
        with self.assertRaises(p.Rejected):p.unity_version(b'2.15.3')
        with self.assertRaises(p.Rejected):p.unity_version(data+struct.pack('<I',5)+b'1.0.0\0')

    def test_only_real_channels_latest_per_platform(self):
        rows=[release('infernal-rift-unity-android','2.15.3'),release('infernal-rift-unity-windows','2.15.2'),release('infernal-rift-unity-windows','2.15.4',True),release('moj-notatnik-android','2.9.7')]
        rows+=[{'tag_name':'infernal-forge-windows-v99.0.0','assets':[]},{'tag_name':'photomind-android-v99.0.0','assets':[]}]
        latest=p.remote_channels(rows)
        self.assertEqual(latest['infernal-rift-unity-android']['version'],'2.15.3')
        self.assertEqual(latest['infernal-rift-unity-windows']['version'],'2.15.2')
        self.assertFalse(any('forge' in k or 'photomind' in k for k in p.CHANNELS))

    def test_missing_digest_sources_and_previews_not_available(self):
        good=release('padbridge-windows','0.1.12')
        missing=release('padbridge-windows','0.1.13');missing['assets'][0]['digest']=None
        source=release('padbridge-windows','0.1.14');source['assets'][0]['name']='PadBridge-zrodla.zip'
        preview=release('padbridge-windows','0.1.15');preview['prerelease']=True
        self.assertEqual(p.remote_channels([missing,source,preview,good])['padbridge-windows']['version'],'0.1.12')

    def test_private_source_and_debug_paths_excluded(self):
        for name in ('app/token.json','logs/last-built-project.ecad.json','app/source.cs','app/source.cpp','app/Screen.kt','app/a.pdb','app/.env','app/key.keystore','app/release.p12','app/release.pkcs12','backup/profile.zip'):
            self.assertFalse(p.safe_name(name),name)
        for name in ('../secret.txt','C:/secret.txt','a\\secret.txt'):
            with self.assertRaises(p.Rejected):p.safe_name(name)
        self.assertTrue(p.safe_name('PadBridge/PadBridge.dll'))

    def test_windows_collisions_rejected_android_resource_case_preserved(self):
        with archive(['res/GR.xml','res/gR.xml']) as bundle:
            p.checked_entries(bundle,windows=False)
            with self.assertRaises(p.Rejected):p.checked_entries(bundle)
        with archive(['same.txt','same.txt']) as bundle:
            with self.assertRaises(p.Rejected):p.checked_entries(bundle,windows=False)

    def test_zip_traversal_and_symlink_rejected(self):
        with archive(['../keys.txt']) as bundle:
            with self.assertRaises(p.Rejected):p.checked_entries(bundle)
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as bundle:
            info=zipfile.ZipInfo('link');info.external_attr=0o120777<<16;bundle.writestr(info,'secret')
        stream.seek(0)
        with zipfile.ZipFile(stream) as bundle:
            with self.assertRaises(p.Rejected):p.checked_entries(bundle)

    def test_changed_or_incomplete_runtime_is_blocked(self):
        with test_folder() as folder:
            root=Path(folder);(root/'PadBridge.exe').write_bytes(b'exe')
            profile={'entries':['PadBridge/PadBridge.exe','PadBridge/coreclr.dll','CZYTAJ-MNIE.txt']}
            with self.assertRaisesRegex(p.Rejected,'brak:'):
                p.folder_plan(root,'padbridge-windows',profile,{})
            (root/'coreclr.dll').write_bytes(b'dll')
            self.assertEqual(len(p.folder_plan(root,'padbridge-windows',profile,{})),2)
            (root/'private.txt').write_text('private')
            with self.assertRaisesRegex(p.Rejected,'nowe:'):
                p.folder_plan(root,'padbridge-windows',profile,{})

    def test_secrets_in_approved_json_are_blocked(self):
        for data in ({'client_secret':'secret'},{'auth':{'refreshToken':'secret'}}):
            with self.assertRaises(p.Rejected):p.json_without_secrets(data)
        p.json_without_secrets({'runtimeOptions':{'tfm':'net8.0'}})

    def test_new_apk_debug_and_unapproved_certificate_are_blocked(self):
        cfg={'java':'java','apksigner':'signer','certificates':{'moj-notatnik-android':['a'*64]}}
        with patch.object(p,'apk_metadata',return_value={'package':'pl.notatnik.app','debuggable':True,'version':'2.9.8'}):
            with self.assertRaises(p.Rejected):p.validate_apk('never-opened.apk','moj-notatnik-android',cfg)
        with patch.object(p,'apk_metadata',return_value={'package':'pl.notatnik.app','debuggable':False,'version':'2.9.8'}),patch.object(p,'run',return_value='Verified using v2 scheme (APK Signature Scheme v2): true\ncertificate SHA-256 digest: '+'b'*64):
            with self.assertRaisesRegex(p.Rejected,'Certyfikat'):p.validate_apk('never-opened.apk','moj-notatnik-android',cfg)

    def test_androidx_credentials_metadata_requires_exact_path_and_version_only(self):
        cfg={'java':'java','apksigner':'signer','certificates':{'moj-notatnik-android':['a'*64]}}
        metadata={'package':'pl.notatnik.app','debuggable':False,'version':'2.9.8','versionName':'2.9.8','versionCode':21}
        output='Verified using v2 scheme (APK Signature Scheme v2): true\ncertificate SHA-256 digest: '+'a'*64
        name='META-INF/androidx.credentials_credentials.version'
        self.assertTrue(p.safe_name(name))
        self.assertFalse(p.safe_name('assets/androidx.credentials_credentials.version'))
        with test_folder() as folder,patch.object(p,'apk_metadata',return_value=metadata),patch.object(p,'run',return_value=output):
            path=Path(folder)/'app.apk'
            with zipfile.ZipFile(path,'w') as bundle:bundle.writestr(name,'1.3.0\n')
            self.assertEqual(p.validate_apk(path,'moj-notatnik-android',cfg)['version'],'2.9.8')
            with zipfile.ZipFile(path,'w') as bundle:bundle.writestr(name,'access_token=private-data')
            with self.assertRaisesRegex(p.Rejected,'numer wersji'):p.validate_apk(path,'moj-notatnik-android',cfg)

    def test_paused_local_switch_does_not_touch_github(self):
        with test_folder() as folder:
            cfg=Path(folder)/'config.json';cfg.write_text('{"enabled":false}')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh','_path':str(cfg),'stateDir':folder},True)
            with patch.object(gh,'api') as api:
                with self.assertRaisesRegex(p.Rejected,'lokalnie'):gh.enabled()
                api.assert_not_called()

    def test_remote_disable_stops_writes(self):
        with test_folder() as folder:
            cfg=Path(folder)/'config.json';cfg.write_text('{"enabled":true}')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh','_path':str(cfg),'stateDir':folder},True)
            with patch.object(gh,'api',return_value={'value':'false'}):
                with self.assertRaisesRegex(p.Rejected,'Administrator'):gh.enabled()

    def test_plaintext_credentials_are_refused(self):
        with test_folder() as folder:
            (Path(folder)/'hosts.yml').write_text('github.com:\n    oauth_token: fake-test-token\n')
            with self.assertRaisesRegex(p.Rejected,'bezpiecznym'):p.GitHub({'ghConfig':folder},True)

    def test_first_observation_waits_no_upload(self):
        with test_folder() as folder:
            file=Path(folder)/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'moj-notatnik-android','kind':'apk','path':str(file),'version':'2.9.8'}
            (Path(folder)/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':candidate['version'],'changes':['Poprawiono nagrywanie.']}),encoding='utf-8')
            class Fake:
                def releases(self):return [release('moj-notatnik-android','2.9.7')]
                def publish(self,*a):raise AssertionError('Should not publish an unstable file')
            with patch.object(p,'discover',return_value=[candidate]):
                events=p.check({'quietSeconds':600},{},Fake(),{},True)
            self.assertTrue(any(e['status']=='waiting' for e in events))

    def test_one_minute_stability_still_requires_two_unchanged_observations(self):
        with test_folder() as folder:
            file=Path(folder)/'app.apk';file.write_bytes(b'apk')
            candidate={'channel':'moj-notatnik-android','kind':'apk','path':str(file),'version':'2.9.8'}
            (Path(folder)/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':candidate['version'],'changes':['Poprawiono nagrywanie.']}),encoding='utf-8')
            class Fake:
                def releases(self):return []
                def publish(self,*args):return {'tag':'moj-notatnik-android-v2.9.8'}
                def enabled(self):pass
                def api(self,*args):pass
            state={};now=p.time.time()+1000
            config={'quietSeconds':1,'stateDir':folder}
            with patch.object(p,'discover',return_value=[candidate]),patch.object(p,'validate_apk',return_value={'version':'2.9.8'}):
                for offset in (0,59):
                    with patch.object(p.time,'time',return_value=now+offset):events=p.check(config,state,Fake(),{},True)
                    self.assertTrue(any(e['status']=='waiting' for e in events))
                with patch.object(p.time,'time',return_value=now+60):events=p.check(config,state,Fake(),{},True)
                self.assertTrue(any(e['status']=='published' for e in events))

    def test_failed_website_refresh_is_retried_even_without_another_new_package(self):
        calls=[]
        class Fake:
            def releases(self):return []
            def enabled(self):pass
            def api(self,*args):
                calls.append(args)
                if len(calls)==1:raise p.Rejected('Temporary connection failure')
        state={'websiteRefreshPending':True};github=Fake()
        with patch.object(p,'discover',return_value=[]):
            p.check({},state,github,{},False)
            self.assertEqual(calls,[])
            first=p.check({},state,github,{},True)
            self.assertTrue(state['websiteRefreshPending'])
            self.assertTrue(any(e['status']=='website-refresh-pending' for e in first))
            second=p.check({},state,github,{},True)
            self.assertFalse(state['websiteRefreshPending'])
            self.assertTrue(any(e['status']=='website-refresh-requested' for e in second))
            p.check({},state,github,{},True)
            self.assertEqual(len(calls),2)

    def test_equal_version_never_repacked_or_uploaded(self):
        candidate={'channel':'padbridge-windows','kind':'folder','path':'never-read','version':'0.1.12'}
        class Fake:
            def releases(self):return [release('padbridge-windows','0.1.12')]
        with patch.object(p,'discover',return_value=[candidate]),patch.object(p,'package_folder') as pack:
            events=p.check({}, {},Fake(),{},True)
            pack.assert_not_called()
        self.assertTrue(any(e['status']=='up-to-date' for e in events))

    def test_remote_hash_mismatch_cannot_publish_draft(self):
        with test_folder() as folder:
            file=Path(folder)/'app.apk';file.write_bytes(b'apk')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh'},True)
            candidate={'channel':'moj-notatnik-android','version':'2.9.8','path':str(file)}
            (Path(folder)/'Moj-Notatnik-v2.9.8.changes.json').write_text(json.dumps({'schemaVersion':1,'channel':candidate['channel'],'version':candidate['version'],'changes':['Poprawiono nagrywanie.']}),encoding='utf-8')
            name=p.CHANNELS[candidate['channel']][1].format(v='2.9.8')
            draft={'id':1,'assets':[],'draft':True,'tag_name':'moj-notatnik-android-v2.9.8','body':p.MARKER,'upload_url':f'https://uploads.github.com/repos/{p.REPO}/releases/1/assets{{?name}}'}
            calls=[]
            def api(path,method='GET',body=None,file=None):
                calls.append((path,method))
                if path.endswith('/commits/main'):return {'sha':'a'*40}
                if method=='POST' and path.endswith('/releases'):return draft
                if path.startswith('https://uploads.'):return {'name':name,'state':'uploaded','size':3,'digest':'sha256:'+'b'*64}
                raise AssertionError('Unexpected call '+path)
            with patch.object(gh,'enabled'),patch.object(gh,'api',side_effect=api):
                with self.assertRaisesRegex(p.Rejected,'SHA256'):gh.publish(candidate,{'path':str(file),'sizeBytes':3,'sha256':p.sha(file)},[])
            self.assertFalse(any(method=='PATCH' for _,method in calls))

    def test_resume_own_draft_accepts_temporary_url_verifies_final_url_no_reupload(self):
        with test_folder() as folder:
            file=Path(folder)/'app.apk';file.write_bytes(b'apk')
            gh=p.GitHub({'ghConfig':folder,'gh':'gh'},True)
            channel,v='moj-notatnik-android','2.9.8'
            tag=channel+'-v'+v;name=p.CHANNELS[channel][1].format(v=v)
            (Path(folder)/(Path(name).stem+'.changes.json')).write_text(json.dumps({'schemaVersion':1,'channel':channel,'version':v,'changes':['Poprawiono nagrywanie.']}),encoding='utf-8')
            asset={'id':10,'name':name,'state':'uploaded','size':3,'digest':'sha256:'+p.sha(file),'browser_download_url':f'https://github.com/{p.REPO}/releases/download/untagged-abc123/{name}'}
            draft={'id':1,'assets':[asset],'draft':True,'prerelease':False,'tag_name':tag,'body':p.MARKER,'html_url':f'https://github.com/{p.REPO}/releases/tag/{tag}'}
            calls=[]
            expected_hash=p.sha(file)
            def api(path,method='GET',body=None,file=None):
                calls.append((path,method))
                self.assertFalse(path.startswith('https://uploads.'))
                if method=='PATCH':
                    self.assertIn('## Co nowego\n\n- Poprawiono nagrywanie.',body['body'])
                    self.assertIn('SHA256: `'+expected_hash+'`',body['body'])
                    draft['draft']=False
                    draft['body']=body['body']
                    asset['browser_download_url']=f'https://github.com/{p.REPO}/releases/download/{tag}/{name}'
                return draft
            with patch.object(gh,'enabled'),patch.object(gh,'api',side_effect=api):
                result=gh.publish({'channel':channel,'version':v,'path':str(file)},{'path':str(file),'sizeBytes':3,'sha256':p.sha(file)},[draft])
            self.assertEqual(result['tag'],tag)
            self.assertEqual(sum(method=='PATCH' for _,method in calls),1)

if __name__=='__main__':unittest.main(verbosity=2)
