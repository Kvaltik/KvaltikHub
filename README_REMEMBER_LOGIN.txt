KVALTÍK HUB v16 – ZAPAMATOVAT PŘIHLÁŠENÍ

NOVINKA
=======
Na přihlašovací obrazovce je nově:

  ☑ Zapamatovat přihlášení

Když je volba zapnutá:
- po úspěšném přihlášení si aplikace zapamatuje relaci,
- při dalším spuštění tě přihlásí automaticky,
- heslo se NIKDY neukládá do souboru v otevřeném textu.

Když volbu vypneš:
- budeš přihlášený jen do zavření aplikace,
- při dalším spuštění se přihlásíš znovu.

DŮLEŽITÁ OPRAVA ÚLOŽIŠTĚ
========================
Starší verze Kvaltík Hubu používaly browser localStorage.
Od v12 se interní HTTP port vybíral automaticky, což může znamenat jiný
browser origin při každém spuštění.

v16 proto ukládá účty, relaci i data aplikace do:
  Electron userData / hub-storage.json

Tím jsou data nezávislá na interním portu a zůstanou dostupná mezi spuštěními.

MIGRACE
=======
Při prvním spuštění v16 se aplikace pokusí automaticky převést data
z aktuálně dostupného starého localStorage.

Pokud máš v současné verzi důležitá data, doporučuje se před instalací v16
udělat také ruční zálohu:
  Nastavení -> Záloha -> Exportovat data

INSTALÁTOR
==========
npm install
npm run dist:installer

AKTUALIZACE
===========
Verze aplikace je 16.0.0.
Automatické aktualizace z v15 zůstávají zachované.
