# Automatyczne wydania z komputera

Lokalny program `scripts/local-publisher.py` uzupełnia istniejące odświeżanie GitHub Pages. Uruchamia się z Harmonogramu zadań Windows co 10 minut i po zalogowaniu użytkownika. Komputer musi być włączony, użytkownik zalogowany, a internet dostępny. Po publikacji paczki zleca odświeżenie głównej strony; godzinny harmonogram GitHub Actions pozostaje zabezpieczeniem na wypadek niedostępnego zlecenia.

## Reguły

- Sprawdza wyłącznie jawnie skonfigurowane lokalizacje gotowych paczek. Nie skanuje całego dysku, nie buduje aplikacji i nie kopiuje źródeł.
- Wersję odczytuje z manifestu APK, zasobu PRODUCTVERSION w EXE/DLL lub danych Playera Unity. Nazwa katalogu nie rozstrzyga o wersji.
- Wybiera najnowszą dostępną wersję osobno dla kanału. Nie nadpisuje publicznych wydań ani plików o tym samym numerze. Nie publikuje historycznych wersji niższych niż najnowsza już dostępna.
- Przed wysłaniem wymaga co najmniej dwóch zgodnych obserwacji i 10 minut bez zmian plików. Odczyt/pakowanie musi zakończyć się bez zmiany źródłowego buildu.
- APK musi mieć oczekiwany identyfikator aplikacji, wyłączone debugowanie, poprawny podpis v2/v3 i zatwierdzony certyfikat produkcyjny. Klucz Android Debug jest odrzucany. Nowy certyfikat wymaga świadomej aktualizacji konfiguracji.
- ZIP Windows musi zawierać cały zatwierdzony zestaw plików wykonawczych i bibliotek. Profile w `scripts/local-publisher-profiles.json` pochodzą z uprzednio zweryfikowanych publicznych paczek. Inny zestaw plików wstrzymuje publikację do przeglądu profilu. Nie usuwaj tej kontroli, by wymusić wysłanie niekompletnej paczki.
- Źródła, klucze, tokeny, profile, notatki, logi, kopie, symbole debug i pliki robocze są wykluczone. OCP jest dołączane jako bajtkod Python 3.12, z zachowaniem bibliotek i licencji. Infernal Forge oraz PhotoMind nie mają publicznego kanału.
- Nowy Release powstaje najpierw jako szkic. Publikacja następuje dopiero po potwierdzeniu przez GitHub rozmiaru i SHA256 jedynego oczekiwanego pliku. Niezgodność pozostawia szkic bez publicznego pobierania. Automat może wznowić wyłącznie własny szkic oznaczony znacznikiem programu.

## Instalacja i obsługa

Lokalne ustawienia, bezwzględne ścieżki, raporty i dane logowania pozostają poza repozytorium. GitHub CLI korzysta z bezpiecznego magazynu poświadczeń Windows; automat odrzuca token zapisany jawnie w konfiguracji CLI. Nigdy nie dodawaj konfiguracji konta, plików auth, prywatnych kluczy ani katalogu stanu do Git.

W lokalnym folderze **Automatyczne-wydania**:

- `Sprawdz-teraz.cmd` sprawdza gotowość bez publikacji.
- `Wlacz.cmd` włącza zaplanowaną publikację po sprawdzeniu dostępu do obu repozytoriów.
- `Wylacz.cmd` natychmiast blokuje lokalne wysyłanie i zatrzymuje zadanie.
- `Status.cmd` pokazuje ostatnie sprawdzenie i powód ewentualnego wstrzymania paczki.

Po przeniesieniu projektu/buildów dopisz konkretną ścieżkę w lokalnym `ustawienia.json`. Nie dodawaj ogólnego rekurencyjnego skanowania C: ani dysku prywatnych danych. Raporty są lokalne i obejmują ostatnie 200 uruchomień. Pierwszy produkcyjny APK nowego kanału wymaga zatwierdzenia jego certyfikatu; nie zatwierdzaj certyfikatu debug.

Repozytoryjna zmienna `PUBLICATION_ENABLED=false` w którymkolwiek z obu repozytoriów również blokuje wysyłanie nowych paczek. Nie wycofuje już publicznych plików. Wyłączenie samej strony opisuje [ADMIN.md](ADMIN.md).

## Weryfikacja

`python scripts/test-local-publisher.py` sprawdza reguły bezpieczeństwa, wybór wersji, stan nieukończonego buildu, wyłączniki, brak nadpisywania i wstrzymanie przy niezgodnej sumie. Operacje zapisu GitHub są w testach symulowane. Kontrola paczki Windows jest statyczna; nie stanowi deklaracji pełnej akceptacji działania aplikacji.

## Produkcyjny podpis VolVio

APK VolVio ma wewnętrzną wersję `3.17`; jej jednoznaczną postacią dla tagu i nazwy pliku jest `3.17.0`. Analogiczna normalizacja dotyczy kolejnych dwuczłonowych wersji VolVio. Pozostałe aplikacje wymagają X.Y.Z.

Publiczne wydanie jest podpisane osobnym kluczem produkcyjnym. Pierwotna wersja testowa miała certyfikat Android Debug; przejście z niej wymaga odinstalowania wersji testowej po zabezpieczeniu potrzebnych danych. Klucz produkcyjny i hasło zabezpieczone Windows DPAPI pozostają wyłącznie w prywatnym katalogu automatu. Nie zmieniaj ani nie usuwaj tego klucza — kolejne aktualizacje APK muszą mieć ten sam podpis. Hasło DPAPI jest związane z kontem i komputerem; kopiowanie samego zaszyfrowanego pliku nie zapewnia odzyskania na innym komputerze.

Lokalny `Podpisz-VolVio.ps1` może podpisać kolejny gotowy APK istniejącym kluczem, a wynik powinien trafić do skonfigurowanego folderu gotowych paczek. W zwykłym użyciu nie podawaj `-Initialize`: ten przełącznik służył wyłącznie jednorazowemu utworzeniu klucza. Automat nie podpisuje samodzielnie kolejnych paczek testowych; akceptuje wyłącznie zatwierdzony podpis produkcyjny. Nie publikuj klucza, hasła, konfiguracji konta ani kopii danych użytkownika w repozytorium lub GitHub Releases.

## Publiczny opis zmian obok paczki

Gotowy build może mieć obok plik o nazwie paczki z końcówką `.changes.json` zamiast `.apk` lub `.zip`, np. `Moj-Notatnik-v2.9.8.changes.json`. Dla źródła będącego folderem Windows umieść go w katalogu nadrzędnym tego folderu, używając nazwy docelowego ZIP z tabeli kanałów w README.

```json
{
  "schemaVersion": 1,
  "channel": "moj-notatnik-android",
  "version": "2.9.8",
  "changes": [
    "Krótki opis faktycznie dodanej lub poprawionej funkcji."
  ]
}
```

To obowiązkowa treść przeznaczona do publikacji. Lista musi zawierać rzeczywiste zmiany opisane w dokumentacji tej wersji; nie przedstawiaj istniejących wcześniej funkcji jako nowości. Nie dodawaj danych użytkownika, kont, adresów e-mail, ścieżek, linków, kluczy ani raportów roboczych. Numer wersji i kanał muszą odpowiadać zweryfikowanej paczce.

Brak, pusta lista lub nieprawidłowy opis blokują dany kanał przed oznaczeniem go jako gotowy, pakowaniem i wysłaniem plików. Inne poprawnie opisane kanały pracują dalej. Treść opisu jest objęta okresem stabilności razem z paczką; zmiana opisu rozpoczyna ten okres ponownie. Automat ponownie sprawdza opis przed publikacją, a po publikacji porównuje całą treść potwierdzoną przez GitHub.

Program nie ucina liczby ani długości punktów. Cały plik JSON ma limit 64 KiB; przekroczenie tego limitu jest zgłaszane jako błąd, zamiast publikować część tekstu. Plik opisowy nie jest dodawany do ZIP/APK ani wysyłany jako osobny załącznik: jego punkty trafiają do sekcji `Co nowego` GitHub Release, a stamtąd automatycznie na stronę. Opis już publicznego wydania można poprawić bez ponownego wysyłania paczki w treści Release na GitHub.
