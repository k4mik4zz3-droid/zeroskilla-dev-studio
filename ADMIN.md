# Administracja publikacją

Strona pozostaje publiczna: https://zeroskilladevstudio.github.io/

## Wyłącz stronę

1. W repozytorium strony otwórz [Settings → Secrets and variables → Actions → Variables](https://github.com/ZeroSkillaDevStudio/zeroskilladevstudio.github.io/settings/variables/actions). Dodaj lub ustaw zmienną repozytorium `PUBLICATION_ENABLED` na `false`. To zatrzymuje kolejne automatyczne wdrożenia; samo nie usuwa już opublikowanej strony.
2. W [Actions](https://github.com/ZeroSkillaDevStudio/zeroskilladevstudio.github.io/actions) anuluj ewentualne trwające wdrożenie.
3. W [Settings → Pages](https://github.com/ZeroSkillaDevStudio/zeroskilladevstudio.github.io/settings/pages) wybierz **Unpublish site**. GitHub sprawdza uprawnienia administratora.

Repozytorium i pliki GitHub Releases pozostają publiczne. Wyłączenie strony nie cofa pobranych plików ani nie ukrywa wydań. Nie jest potrzebna zmiana widoczności repozytorium.

Repozytorium źródłowe ma osobny pomocniczy adres Pages. Jeśli chcesz wyłączyć również ten adres, ustaw `PUBLICATION_ENABLED=false`, anuluj trwające wdrożenie i wybierz Unpublish site także w [jego ustawieniach Pages](https://github.com/k4mik4zz3-droid/zeroskilla-dev-studio/settings/pages).

## Przywróć stronę

Ustaw `PUBLICATION_ENABLED=true` (lub usuń zmienną), pozostaw **Build and deployment → GitHub Actions** w ustawieniach Pages i uruchom workflow **Publish ZeroSkilla Dev Studio** z gałęzi `main` przez **Run workflow**. Adres pozostaje ten sam.

## Zarządzaj paczkami

[GitHub Releases](https://github.com/k4mik4zz3-droid/zeroskilla-dev-studio/releases) przechowuje APK i ZIP. Reguły tagów i nazw plików są w README. Usunięcie lub przeniesienie wydania do Draft usuwa je z katalogu przy następnym udanym odświeżeniu. Nie przesyłaj źródeł, kluczy, tokenów, profili, kopii danych, logów, symboli debug ani Infernal Forge.

Witryna nie przechowuje hasła i nie ma własnego mechanizmu nadawania uprawnień. Link Administracja prowadzi do ustawień Pages na GitHub.
