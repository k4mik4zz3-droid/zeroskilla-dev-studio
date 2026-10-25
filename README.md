# ZeroSkilla Dev Studio

Publiczna strona: https://zeroskilladevstudio.github.io/

Stronę utrzymuje repozytorium `ZeroSkillaDevStudio/zeroskilladevstudio.github.io`. Kod i publiczne paczki APK/ZIP znajdują się w tym repozytorium. Hosting pozostaje w GitHub Pages, pliki w GitHub Releases; nie dodawaj binarnych paczek do historii Git.

## Automatyczny katalog

Gotowe paczki z lokalnego komputera może również publikować [lokalny automat](LOCAL-PUBLISHER.md). Po sprawdzeniu paczki wysyła nowy Release i zleca odświeżenie głównej strony. Szczegóły kontroli i wyłączniki są w instrukcji automatu.

Obydwa workflow generują katalog bezpośrednio z GitHub Releases API. Główna strona odświeża się po zmianie workflow, ręcznie i co godzinę. Repozytorium źródłowe reaguje też na publikację, edycję lub usunięcie wydania.

Strona główna i pięć podstron korzystają ze wspólnego `release-feed.js`. Na otwartej, widocznej karcie sprawdzają katalog co 60 sekund oraz po powrocie do karty lub okna. Równolegle czytają lokalny `releases.json` i katalog z repozytorium źródłowego, który powstaje po zdarzeniu publikacji Release. Pierwsza poprawna odpowiedź jest od razu wyświetlana, a nowsza może ją zastąpić; powolne lub niedostępne drugie źródło nie blokuje uruchomienia strony. Starsza kopia nie zastępuje już wczytanych nowszych danych. Limit czasu obejmuje połączenie i odczyt JSON oraz działa również bez `AbortSignal.timeout` i bez `AbortController` w starszych przeglądarkach telefonu. Adres JSON ma parametr bieżącej minuty ograniczający opóźnienie pamięci podręcznej. Niezmienione dane nie powodują ponownego rysowania strony. Opóźnienie obejmuje wykrycie stabilnej paczki, kontrolę i przesłanie, czas wykonania GitHub Actions oraz maksymalnie minutę do następnego sprawdzenia w przeglądarce; GitHub nie gwarantuje czasu uruchomienia zadania.

Generator wybiera najwyższą rzeczywiście dostępną wersję osobno dla projektu, silnika i platformy. Brak Windows w nowszym wydaniu Androida nie ukrywa ostatniej dostępnej paczki Windows. Zaplanowane, puste, robocze oraz przedpremierowe wydania nie są pokazywane. Starsze wydania pozostają w archiwum Releases i w historii zmian na podstronie projektu; przyciski pobierania nadal wskazują tylko najnowszą paczkę każdego kanału.

Nowe tagi i nazwy plików:

| Kanał | Tag | Paczka |
| --- | --- | --- |
| Infernal Rift / własny / Android | `infernal-rift-native-android-vX.Y.Z` | `Infernal-Rift-vX.Y.Z.apk` |
| Infernal Rift / Unity / Android | `infernal-rift-unity-android-vX.Y.Z` | `Infernal-Rift-Unity-vX.Y.Z.apk` |
| Infernal Rift / Unity / Windows | `infernal-rift-unity-windows-vX.Y.Z` | `Infernal-Rift-Unity-vX.Y.Z-Windows-PC.zip` |
| Mój Notatnik / Android | `moj-notatnik-android-vX.Y.Z` | `Moj-Notatnik-vX.Y.Z.apk` |
| Mój Notatnik / Windows | `moj-notatnik-windows-vX.Y.Z` | `Moj-Notatnik-vX.Y.Z-Windows-x64.zip` |
| VolVio Scanner / Android | `volvio-scanner-android-vX.Y.Z` | `VolVio-Scanner-vX.Y.Z.apk` |
| Encloser CAD / Windows | `encloser-cad-windows-vX.Y.Z` | `Encloser-CAD-vX.Y.Z-Windows-x64.zip` |
| PadBridge / Windows | `padbridge-windows-vX.Y.Z` | `PadBridge-vX.Y.Z-Windows-x64.zip` |

Starsze tagi `infernal-rift-native-vX.Y.Z` i `infernal-rift-unity-vX.Y.Z` nadal działają. Akceptowane są wyłącznie dokładne nazwy paczek produkcyjnych, dodatni rozmiar i SHA256 przekazane przez GitHub. ZIP źródeł oraz nazwy debug nie przechodzą tej listy.

Przed publikacją sprawdź wersję wewnątrz APK/EXE/danych Playera, podpis i brak debuggable w APK, kompletność bibliotek, integralność ZIP i SHA256. Generator sprawdza metadane dystrybucji; nie zastępuje kontroli bezpieczeństwa zawartości ani testów aplikacji. Infernal Forge jest narzędziem wewnętrznym i nie ma publicznego kanału.

## Sprawdzenie lokalne

`node --test scripts/build-releases.test.mjs`

`node scripts/build-releases.mjs` pobiera rzeczywiste wydania; opcjonalna zmienna `RELEASE_REPOSITORY` wskazuje repozytorium. `--offline` tworzy pusty katalog bez linków; `--from-file plik.json` służy do testowania zapisanej odpowiedzi GitHub API.

Braki paczek opisuje `unavailable` w `releases-source.json`. Nie dodawaj numerów wersji i atrap plików jako dostępnych wydań.

## Strony projektów i galeria

Pięć kart katalogu prowadzi do osobnych plików HTML w `dist/`: `infernal-rift.html`, `moj-notatnik.html`, `volvio-scanner.html`, `encloser-cad.html` i `padbridge.html`. Link pobierania na karcie prowadzi do sekcji `#pobierz` odpowiedniej podstrony. Wspólny styl to `studio.css` i `project-page.css`, a pobieranie aktualnego katalogu oraz powiększanie galerii obsługuje `project-page.js`.

Każda podstrona pobiera aktualny `releases.json`; numerów i linków do paczek nie wpisuje się ręcznie do stron projektu. Galerie zawierają rzeczywiste zrzuty aplikacji i gier z kontrolowanych przykładów. Notatnik korzysta z fikcyjnych notatek w osobnym profilu; VolVio pokazuje ekrany bez połączenia z samochodem; CAD i PadBridge używają przykładów testowych. Obrazy są kodowane bezstratnie w WebP, bez zmiany treści interfejsu. Przy dodawaniu materiałów nie publikuj prywatnych notatek, fotografii, kont, VIN, MAC urządzeń, ścieżek ani plików projektu. Opisy i podpisy galerii aktualizuj razem z materiałami.

PhotoMind jest na życzenie administratora wyłączony z publicznego katalogu i generatora wydań. Nie przywracaj go automatycznie po dodaniu Release.

## Spisy funkcji

Publiczne opisy funkcji znajdują się w `project-features.json`. Każda pozycja ma nazwę i krótki opis; opcjonalne oznaczenia wskazują system lub silnik. `reviewedVersions` zapisuje wersje, na których sprawdzono opis. Po zmianie możliwości aplikacji zaktualizuj tę listę na podstawie gotowego wydania, bez przenoszenia prywatnych danych, ścieżek, kodu źródłowego ani materiałów audytu.

`node scripts/build-releases.mjs` najpierw generuje statyczne spisy na pięciu podstronach, a potem odświeża katalog paczek. Samo odtworzenie opisów wykonuje `node scripts/build-project-features.mjs`. Strony zawierają pełną treść także bez JavaScript; skrypt `project-features.js` dodaje rozwijane kategorie i wyszukiwanie nazw oraz opisów z obsługą polskich znaków. Nowe wydanie pobiera się automatycznie z Releases, natomiast zmiana jego funkcji wymaga aktualizacji opisów w tym pliku.

Wyłączenie i przywrócenie publikacji opisuje [ADMIN.md](ADMIN.md).

## Ostatnia aktualizacja — Co nowego

Katalog pobiera listy zmian z treści tego samego GitHub Release, z którego pochodzi paczka danego kanału. W opisie wydania dodaj nagłówek `## Co nowego` i poniżej zwykłe punkty `- Zmiana.`. Kolejny nagłówek tego samego lub wyższego poziomu kończy listę; głębsze nagłówki tworzą jej podsekcje. Strona pokazuje wersję, datę publikacji, listę zmian i link do pełnego wydania. Nie kopiuje opisu starszej wersji, gdy nowa nie ma własnych notatek.

Dla pierwszego opisu paczki bez porównania z wcześniejszą wersją użyj `## Informacje o wydaniu`. `## Zmiany w dystrybucji` służy zmianom podpisu lub publikacji paczki i jest wyraźnie odróżnione od zmian funkcji. Brak notatek pozostaje oznaczony wprost. Nie wpisuj całej listy istniejących funkcji jako nowości.

Lokalny automat wymaga publicznych notatek z jawnego pliku `.changes.json` obok gotowej paczki; format opisuje [LOCAL-PUBLISHER.md](LOCAL-PUBLISHER.md). Dla jawnie skonfigurowanych folderów Infernal Rift Unity obsługuje także publiczną, wersjonowaną instrukcję i wyłącznie jej sekcję zmian. Brak lub niezgodny opis zatrzymuje nową paczkę przed publikacją. Nie odczytuje prywatnych dokumentów ani notatek użytkownika i nie publikuje pełnych raportów.

Czytnik zachowuje pełną listę punktów, ciągi dalsze w kolejnych wierszach i podsekcje pod nagłówkiem zmian. Nie ucina listy po 20 wpisach ani dłuższych punktów. Nieprawidłowy opis już publicznego wydania jest zgłaszany w GitHub Actions; wybór najnowszej paczki nadal zależy od jej wersji i integralności, bez cofania numeru lub kopiowania starszych zmian. Nagłówek `Co nowego` jest wspólny dla wszystkich kanałów, a dodatkowa etykieta rozróżnia zmiany funkcji, informacje o wydaniu i zmiany dystrybucji.

## Historia aktualizacji

Każda podstrona projektu ma sekcję `#historia` z rozwijanymi wpisami: numerem wersji, datą publikacji GitHub, systemem, opcjonalnym silnikiem i pełną listą zmian. Filtry pojawiają się tylko wtedy, gdy istnieje więcej niż jeden system lub silnik. Nowe i edytowane wydania trafiają do historii przez ten sam automatyczny katalog, bez ręcznej zmiany HTML.

`releases.json` zachowuje dotychczasowe `versions` z najnowszymi paczkami, a `history` zawiera wszystkie opublikowane, zweryfikowane kanały i wersje. Historia używa tej samej kontroli tagu, nazwy pliku, rozmiaru i SHA256 co pobieranie; nie zawiera bezpośrednich linków do starych APK/ZIP. Dla jednego projektu, kanału i numeru wersji powstaje jeden wpis; tag z jawną platformą ma pierwszeństwo przed starszym wspólnym tagiem. Wpisy są uporządkowane według dnia publikacji, następnie malejąco według numeru wersji, z rozdzieleniem kanałów.

Starszy wspólny Release może rozdzielać zmiany pod nagłówkami `### Android` i `### Windows` (także `### PC`). Czytnik przypisuje je tylko właściwemu systemowi. Pozostałe podsekcje tego samego poziomu są wspólne. Puste lub nieprawidłowe opisy pozostają jawnie oznaczone; historii nie uzupełnia się opisami innej wersji. Pełne spisy funkcji, galerie i pobieranie najnowszych paczek działają niezależnie od historii.
