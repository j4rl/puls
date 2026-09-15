# Puls

En svensk webbapp för att skapa en fråga, dela en QR-kod eller sexsiffrig kod och visa gruppens svar live. PHP och MariaDB/MySQL på servern; vanlig JavaScript i webbläsaren. Ingen byggprocess behövs.

## Kör på den här datorn

Appen är installerad i `C:\xampp\htdocs\puls`. Databasen `puls` och en separat databasanvändare `puls_app` är skapade. Den lokala anslutningen finns i `config.php`, som ignoreras av Git och är spärrad från webbåtkomst.

1. Starta **Apache** och **MySQL** i XAMPP om de inte redan körs. Om MariaDB redan kör som Windows-tjänst på port 3306 ska du använda den befintliga tjänsten.
2. Öppna **http://localhost/puls/**.
3. Skapa ett konto i appen om du vill spara frågor och egna teman över flera enheter. Inget förinställt användarkonto eller standardlösenord har skapats.

### Deltagare på mobiler

Öppna Puls via datorns nätverksadress innan du skapar/delar frågan. Då får QR-koden rätt adress. Vid installationen var Wi-Fi-adressen **http://192.168.68.104/puls/**. IP-adressen kan ändras; kontrollera med `ipconfig`.

Mobilerna behöver vara på samma nätverk och kunna nå Apache på port 80. `localhost` i en QR-kod pekar på deltagarens egen enhet. Om Windows frågar efter nätverksåtkomst för Apache, tillåt det på det privata nätverket. Inställningen `base_url` i `config.php` kan användas för en fast deltagaradress; lämna den annars tom för att använda den adress appen öppnades med.

### Installera eller uppdatera lokalt igen

Kör från projektmappen i PowerShell:

```powershell
& C:\xampp\php\php.exe scripts/setup-local.php
```

Skriptet körs enbart på kommandoraden. Det importerar `database.sql` utan att radera befintliga frågor/svar och skapar vid första installationen ett slumpat lösenord för `puls_app`. Appanvändaren får bara `SELECT`, `INSERT`, `UPDATE` och `DELETE` i databasen `puls`.

För lokal databasadministration använder skriptet `root` utan lösenord enligt XAMPP:s standard. Har den lokala databasen andra uppgifter, ange miljövariablerna `PULS_DB_ADMIN_USER`, `PULS_DB_ADMIN_PASSWORD` och vid behov `PULS_DB_PORT` i terminalen. Dessa uppgifter används bara vid installation. Skriptet skriver inte över en befintlig egen konfiguration eller byter lösenord på en redan befintlig databasanvändare.

## Funktioner och konton

- Flerval, ja/nej, kryssrutor, tal med valfritt intervall, meningar och enstaka ord.
- Staplar, cirkeldiagram, termometer, ordmoln och textsvar.
- QR-kod, deltagarlänk, kopiering, helskärm, paus/återupptagning och dolda resultat.
- Resultat hämtas varannan sekund. Deltagarvyn följer pausning automatiskt.
- Upp till 5 000 svar per fråga och ett svar per webbläsare. Det är ett cookieskydd; nya webbläsare eller raderade cookies kan ge nya svar.
- Gäster kan skapa frågor utan konto. Gästfrågor hör till skaparens webbläsarcookie.
- Registrering flyttar den webbläsarens gästfrågor till det nya kontot. Vid inloggning på ett befintligt konto väljer användaren uttryckligen om gästfrågorna ska flyttas.
- Kontoägda resultat är tillgängliga på enheter där ägaren loggar in. Utloggning återger inte åtkomst via gamla gästcookies.
- Inloggningen går ut efter 12 timmars inaktivitet eller högst sju dagar. Webbläsaren använder en sessionscookie.

## Ljust, mörkt och egna teman

Puls laddar den riktiga komponenten från **https://ld.j4rl.se/ld-theme-toggle.js**. Valen Auto, Ljust och Mörkt sparas med tjänstens `ld-theme`-nyckel i webbläsaren. Auto följer operativsystemet. Om tjänsten inte kan laddas finns en lokal väljare med samma funktion.

**theme.j4rl.se är en CSS-exportör, utan ett konto- eller katalog-API.** Integrationens arbetsflöde följer tjänstens export:

1. Logga in i Puls och välj **Mitt tema**.
2. Följ länken till **https://theme.j4rl.se/** och skapa ett tema.
3. Kopiera exporterad CSS eller ladda ned en `.css`-fil.
4. Klistra in koden eller välj filen i Puls och välj **Spara och använd**.

Både ljus och mörk variant sparas i databasen på Puls-kontot. Färger, typsnitt och rundning används i gränssnittet och diagrammen. **Återställ Puls-temat** tar bort det egna temat från kontot. Ett eget tema per konto stöds.

Importen läser endast tillåtna designvariabler; godtyckliga CSS-regler, resursadresser och `@import` körs inte. Exportformaten hex, rgb, hsl, oklch, display-p3 och alla format är verifierade i Chromium. Moderna färger omvandlas till vanliga hex-färger; på äldre webbläsare kan hex-export behövas. CSS-filer får vara högst 64 kB. Valda externa typsnitt hämtas från Google Fonts via en fast adress, med lokala reservtypsnitt om anslutningen saknas.

## Publicera på puls.j4rl.se

Projektet är förberett för subdomänen. Publik DNS, webbhotell och TLS-certifikat behöver konfigureras på målservern; den lokala installationen ändrar inte dessa.

1. Skapa DNS-posten för `puls.j4rl.se` mot webbservern och ordna ett giltigt HTTPS-certifikat.
2. Lägg appen i subdomänens dokumentrot. Ladda upp `index.html`, `api.php`, `assets/`, `includes/` och `.htaccess`. Ta med `.htaccess` i `includes/` och behåll QR-bibliotekets licensinformation. Publicera inte lokal `config.php`, Git-mappen, tester eller installationsskript.
3. Skapa en separat produktionsdatabas och importera `database.sql` med en användare som får skapa tabeller. Ge appens egen databasanvändare endast läs-/skrivrättigheter till den databasen.
4. Skapa serverns `config.php` från `config.example.php` med produktionsdatabasens uppgifter och **`'base_url' => 'https://puls.j4rl.se/'`**. Låt inte lokala XAMPP-uppgifter följa med.
5. Aktivera PHP 8.0 eller senare med `mysqli`, `mysqlnd` och `mbstring`, samt MariaDB 10.4+ eller MySQL 5.7+. Använd en underhållen PHP-version i produktion. Apache 2.4 ska tillåta `.htaccess` och ha `mod_rewrite` och `mod_headers` aktiverade.
6. På egen Apache-server finns en mall i **`deploy/puls.j4rl.se.conf.example`**. Byt dokumentrot och certifikatsökvägar till serverns riktiga värden. På webbhotell görs motsvarande inställningar i kontrollpanelen. HTTP ska omdirigeras till HTTPS innan appen används.
7. Kontrollera registrering/inloggning, skapa en fråga, skanna QR-koden på mobilen och kontrollera livesvar. Kontrollera även att `/config.php`, `/.git/config`, `/includes/` och `/database.sql` inte kan laddas ned.

Sessionscookies får automatiskt flaggorna `HttpOnly`, `SameSite=Lax` och `Secure` vid HTTPS. Appen litar inte automatiskt på `X-Forwarded-For`. Vid en omvänd proxy, konfigurera den riktiga klientadressen i webbservern enbart från betrodda proxyadresser; annars delas IP-baserade försöksgränser av alla bakom proxyn. Säkerhetskopiera produktionsdatabasen regelbundet.

## Tester

Från projektmappen:

```powershell
& C:\xampp\php\php.exe tests/validation.php
node tests/charts.mjs
node tests/appearance.mjs
& C:\xampp\php\php.exe tests/integration.php
```

HTTP-testet kräver en körande lokal XAMPP-installation och PHP:s `curl`-tillägg. Det skapar unika testkonton/frågor och tar bort sina egna testdata efteråt. Testet får bara köras mot `localhost` eller `127.0.0.1`.

Valideringstesterna täcker indata, lösenord och säker temaimport. HTTP-testerna täcker alla frågetyper, dubbla svar, behörigheter, sessions-/CSRF-byte, återspelade gästcookies, flytt av gästfrågor, kontosparade teman, försöksgränser och spärrade filer.

Dessutom verifierades hela användarflödet i Chromium med en verklig export från theme.j4rl.se: registrering, temaimport, QR, mobilsvar, liveuppdatering, paus/återupptagning, flera webbläsare och utloggning i flera flikar. Ljus/mörkt läge testades även med blockerad ld-tjänst. Lokala skärmbilder och testresultat finns i den Git-ignorerade mappen `test-results/`.

## Fortsatt utveckling

Lämpliga nästa steg är e-postverifiering och lösenordsåterställning (kräver e-posttjänst), export/radering av egna frågor och svar samt samlingar med flera frågor. Dessa funktioner ingår ännu inte. Frågelistan visar för närvarande de 50 senaste frågorna; äldre frågor finns kvar via sina resultatadresser.
