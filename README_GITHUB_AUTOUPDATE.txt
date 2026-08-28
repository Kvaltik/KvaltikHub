KVALTÍK HUB v17.0.0 – GITHUB AUTO UPDATE READY

GitHub:
https://github.com/Kvaltik/KvaltikHub

AUTOMATICKÉ AKTUALIZACE
========================
Projekt je už přímo nastavený na:

owner: Kvaltik
repo:  KvaltikHub

Není potřeba spouštět NASTAVIT_AKTUALIZACE.cmd.

PRVNÍ VYDÁNÍ v17.0.0
=====================
1. Nahraj celý obsah projektu do GitHub repozitáře KvaltikHub.

2. V terminálu ve složce projektu:

   git init
   git add .
   git commit -m "Kvaltik Hub 17.0.0"
   git branch -M main
   git remote add origin https://github.com/Kvaltik/KvaltikHub.git
   git push -u origin main

3. Potom vytvoř tag:

   git tag v17.0.0
   git push origin v17.0.0

4. GitHub Actions automaticky:
   - nainstaluje Node balíčky,
   - sestaví Windows NSIS instalátor,
   - vytvoří GitHub Release,
   - nahraje instalační EXE,
   - nahraje latest.yml,
   - nahraje blockmap.

5. Na GitHubu otevři:
   Actions

   a počkej, až workflow „Vydat Kvaltik Hub“ skončí zeleně.

6. Potom otevři:
   Releases

   a stáhni/nainstaluj v17.0.0.

TEST AUTOMATICKÉ AKTUALIZACE 17.0.0 -> 17.0.1
=============================================
1. Nech nainstalovanou verzi 17.0.0.

2. V projektu spusť:
   NOVA_VERZE_A_RELEASE.cmd

3. Zadej:
   17.0.1

4. Pro test můžeš změnit třeba text v aplikaci nebo přidat malou funkci.

5. Potom spusť:

   git add .
   git commit -m "Kvaltik Hub 17.0.1"
   git push
   git tag v17.0.1
   git push origin v17.0.1

6. Počkej na GitHub Actions.

7. Spusť nainstalovaný Kvaltík Hub 17.0.0.

8. Otevři:
   Nastavení -> Aktualizace

9. Klikni:
   Zkontrolovat aktualizace

10. Měla by se objevit verze 17.0.1.

11. Stáhni aktualizaci a klikni:
    Restartovat a nainstalovat

DŮLEŽITÉ
========
- Aktualizace testuj na nainstalované NSIS verzi, ne na portable verzi.
- GitHub repozitář musí být pro tento jednoduchý update postup veřejný.
- Release nesmí zůstat Draft.
- package.json a Git tag musí mít stejnou verzi.
- GitHub token se do aplikace NEUKLÁDÁ.
- GitHub Actions používá automatický GITHUB_TOKEN pouze při vytváření releasu.
- Uživatelská data zůstávají v Electron userData a aktualizace je nemaže.
