KVALTÍK HUB v15 – AUTOMATICKÉ AKTUALIZACE

JAK TO FUNGUJE
==============
Kvaltík Hub používá electron-updater + GitHub Releases.

Nainstalovaná aplikace:
1. zkontroluje GitHub Release,
2. porovná verzi s aktuální aplikací,
3. nabídne novou verzi,
4. může ji automaticky stáhnout,
5. po kliknutí „Restartovat a nainstalovat“ spustí NSIS aktualizaci.

DŮLEŽITÉ
========
Automatické aktualizace jsou určené pro NAINSTALOVANOU NSIS verzi.
Portable verze se automaticky neaktualizuje.

PRVNÍ NASTAVENÍ – POUZE JEDNOU
===============================
1. Na GitHubu vytvoř VEŘEJNÝ repozitář, například:
   Kvaltik-Hub

2. V projektu spusť:
   NASTAVIT_AKTUALIZACE.cmd

3. Zadej GitHub uživatelské jméno a název repozitáře.

4. Potom:
   npm install
   npm run dist:installer

5. Nainstaluj tuto první verzi.

AUTOMATICKÉ VYDÁVÁNÍ PŘES GITHUB ACTIONS
=========================================
Projekt obsahuje:
.github/workflows/release.yml

Pro novou verzi například 15.0.1:

1. Spusť:
   NOVA_VERZE.cmd

   a zadej:
   15.0.1

2. Commitni změny do GitHubu.

3. Vytvoř a pushni tag:
   git tag v15.0.1
   git push origin v15.0.1

4. GitHub Actions automaticky:
   - sestaví Windows NSIS instalátor,
   - vytvoří/publikuje GitHub Release,
   - nahraje instalační EXE,
   - nahraje blockmap,
   - nahraje latest.yml.

5. Uživatelům Kvaltík Hubu se nová verze objeví v:
   Nastavení -> Aktualizace

RUČNÍ PUBLIKOVÁNÍ Z WINDOWS
============================
Můžeš také publikovat přímo ze svého počítače.

Nejdřív nastav GH_TOKEN pouze v terminálu / systémové proměnné.
Token NIKDY nevkládej do aplikace nebo package.json.

Pak:
   npm run release

BEZPEČNOST DAT
==============
Aktualizace používá stejné appId:
cz.kvaltik.hub

Uživatelská data jsou uložená mimo programovou instalační složku,
takže aktualizace nesmaže:
- účty,
- ETS 2 jízdy,
- Farming data,
- virtuální firmu,
- přátele,
- obrázky,
- Discord nastavení,
- počasí,
- playlist hudby.

TEST AKTUALIZACE
================
Doporučený test:

A) Sestav a nainstaluj verzi 15.0.0.
B) Publikuj GitHub Release 15.0.1.
C) Spusť nainstalovanou 15.0.0.
D) Nastavení -> Aktualizace -> Zkontrolovat aktualizace.
E) Stáhni 15.0.1.
F) Klikni „Restartovat a nainstalovat“.

POZOR NA GITHUB RELEASE
=======================
Release nesmí zůstat pouze jako Draft, protože draft není pro běžné klienty
viditelný jako veřejná aktualizace.
