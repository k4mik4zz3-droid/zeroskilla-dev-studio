# ZeroSkilla Dev Studio — GitHub Pages

Publiczna strona studia i katalog APK dla Androida oraz przenośnych ZIP dla Windows.

Strona jest hostowana na **GitHub Pages**, a paczki jako załączniki **GitHub Releases**. Nie dodawaj plików APK/ZIP do historii repozytorium Git: umieszczaj je w zasobach wydań (*Releases → Assets*).

## Uruchomienie

1. Na koncie `k4mik4zz3-droid` utwórz **publiczne, puste** repozytorium `zeroskilla-dev-studio` (bez automatycznego README i licencji).
2. Prześlij zawartość tego katalogu na gałąź `main`.
3. W repozytorium przejdź do **Settings → Pages → Build and deployment** i wybierz **GitHub Actions**.
4. W zakładce **Releases** utwórz wydania według poniższej listy i dołącz odpowiadające im prawdziwe pliki APK/ZIP.
5. Uruchom workflow **Publish ZeroSkilla Dev Studio** ręcznie (`Actions → Run workflow`) lub po prostu opublikuj Release — katalog zostanie odświeżony automatycznie.

Adres po pomyślnej publikacji będzie miał postać `https://k4mik4zz3-droid.github.io/zeroskilla-dev-studio/`. Adres ten nie jest aktywny, dopóki publikacja nie zakończy się powodzeniem.

## Wydania do przeniesienia

| Projekt | GitHub Release tag | Oczekiwane pliki |
| --- | --- | --- |
| Infernal Rift / natywny | `infernal-rift-native-v0.346.0` | `Infernal-Rift-v0.346.0.apk` |
| Infernal Rift / natywny | `infernal-rift-native-v0.345.0` | `Infernal-Rift-v0.345.0.apk` |
| Infernal Rift / natywny | `infernal-rift-native-v0.344.0` | `Infernal-Rift-v0.344.0.apk` |
| Infernal Rift / Unity | `infernal-rift-unity-v2.14.1` | `Infernal-Rift-Unity-v2.14.1.apk`, `Infernal-Rift-Unity-v2.14.1-Windows-PC.zip` |
| Infernal Rift / Unity | `infernal-rift-unity-v2.14.0` | `Infernal-Rift-Unity-v2.14.0.apk`, `Infernal-Rift-Unity-v2.14.0-Windows-PC.zip` |
| Mój Notatnik / Android | `moj-notatnik-android-v2.9.7` | `Moj-Notatnik-v2.9.7.apk` |

Katalog jest budowany z rzeczywistych plików zwróconych przez API GitHub. Wersje wpisane w `releases-source.json` pozostają widoczne jako zapowiedziane, jeśli ich pliki nie zostały jeszcze przesłane — przycisk pobierania nie jest wtedy aktywny. Dla przyszłych wydań używaj tagów w formacie `<projekt>-<kanał>-vX.Y.Z`, np. `padbridge-windows-v1.0.0`.

## Bezpieczeństwo i koszty

- Repozytorium i wydania są publiczne. Dodawaj wyłącznie pliki przeznaczone do dystrybucji.
- **Nie przesyłaj** kodu źródłowego prywatnych projektów, kluczy podpisywania aplikacji, tokenów, baz danych ani zasobów nieprzeznaczonych do publikacji.
- Hosting strony i wydania GitHub Releases są dostępne bez opłat przy zwykłym użytkowaniu zgodnym z zasadami GitHub. Pojedynczy załącznik wydania musi mieć mniej niż 2 GiB.

## Testy lokalne

`node scripts/build-releases.mjs --offline`

To generuje demonstracyjny katalog z zaplanowanymi wersjami bez aktywnych linków. Prawdziwe adresy są dodawane dopiero przez workflow po odczycie opublikowanych zasobów na GitHub.
