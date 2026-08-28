KVALTÍK HUB v17 – OPRAVA HUDEBNÍHO PŘEHRÁVAČE A HODIN

HLAVNÍ CHYBA
============
app.js byl v HTML vložený PŘED mini přehrávačem.

JavaScript proto při startu narazil například na:
  document.getElementById("addMusicBtn") === null

a další část JavaScriptu se už nespustila.

To způsobovalo mimo jiné:
- nefunkční mini přehrávač,
- nespouštějící se hodiny,
- některé další handlery po přehrávači se nemusely inicializovat.

OPRAVA
======
- app.js se nyní načítá až úplně na konci BODY po celém rozhraní.
- Hodiny se spouští bezpečně po načtení UI.
- Hodiny jsou na Dashboardu i v horní liště.
- Čas se aktualizuje každou sekundu.
- Mini přehrávač umí:
  MP3, WAV, M4A, AAC, OGG a FLAC.
- Doplněné správné MIME pro FLAC.
- Vylepšené streamování audio souborů přes HTTP Range.
- Přidané chybové hlášení při nepodporovaném/poškozeném audio souboru.
- Hlasitost se zapamatuje mezi spuštěními.
- Playlist zůstává uložený mezi spuštěními.

POUŽITÍ PŘEHRÁVAČE
==================
1. Spusť Kvaltík Hub.
2. Dole klikni:
   + Přidat hudbu
3. Vyber jednu nebo více skladeb.
4. Vyber skladbu z playlistu nebo klikni ▶.
5. Hudba pokračuje při přecházení mezi stránkami Kvaltík Hubu.

INSTALÁTOR
==========
npm install
npm run dist:installer
