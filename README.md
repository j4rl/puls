# Puls

En svensk webbapp för att skapa frågor och frågeset, dela en QR-kod eller sexsiffrig kod och visa gruppens svar live. PHP och MariaDB/MySQL på servern; vanlig JavaScript i webbläsaren. Ingen byggprocess behövs.

## Kör på den här datorn

Appen är installerad i `C:\xampp\htdocs\puls`. Databasen `puls` och en separat databasanvändare `puls_app` är skapade. Den lokala anslutningen finns i `config.php`, som ignoreras av Git och är spärrad från webbåtkomst.

1. Starta **Apache** och **MySQL** i XAMPP om de inte redan körs. Om MariaDB redan kör som Windows-tjänst på port 3306 ska du använda den befintliga tjänsten.
2. Öppna **http://localhost/puls/**.
3. Välj **Logga in** och sedan **Skapa konto** för att registrera ett konto. Inloggning krävs för att skapa frågor; deltagare kan svara utan konto. Inget förinställt användarkonto eller standardlösenord har skapats.

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

- Flerval, ja/nej, kryssrutor, skala, rangordning, matris, tal med valfritt intervall, meningar och enstaka ord.
- Frågeset med 1–20 frågor, valfri blandning av frågetyper och en gemensam deltagarkod.
- Staplar, cirkeldiagram, termometer, ordmoln, rangordningsresultat, matris och textsvar.
- **Skriv ut / spara PDF** i resultatvyn öppnar webbläsarens utskriftsdialog. Välj skrivare eller **Spara som PDF**. Utskriften innehåller frågan, antal svar, tidpunkt och resultatet, även när det är dolt på skärmen. Alla textsvar och alla ords antal tas med.
- QR-kod, deltagarlänk, kopiering, helskärm, paus/återupptagning och dolda resultat.
- Utseende kan ställas in separat för en fråga eller ett frågeset. Färger, bakgrund, förgrundsbild och logotyp visas direkt i den inbyggda förhandsvisningen och följer med till deltagar- och Live-vyn.
- Resultat hämtas varannan sekund. Deltagarvyn följer pausning automatiskt.
- Upp till 5 000 svar per fråga och ett svar per webbläsare. Det är ett cookieskydd; nya webbläsare eller raderade cookies kan ge nya svar.
- Frågeformuläret, förhandsvisningen och egna frågor visas först efter inloggning. Deltagare kan svara utan konto via en kod eller deltagarlänk.
- Äldre gästfrågor hör till skaparens webbläsarcookie och kan fortfarande nås via sina resultatadresser. Registrering flyttar den webbläsarens äldre gästfrågor till det nya kontot. Vid inloggning på ett befintligt konto väljer användaren uttryckligen om gästfrågorna ska flyttas.
- Kontoägda resultat är tillgängliga på enheter där ägaren loggar in. Utloggning återger inte åtkomst via gamla gästcookies.
- Inloggade användare kan ta bort egna frågor från **Dina publicerade frågor**. Efter bekräftelse raderas frågan och alla dess svar permanent, och deltagarlänken slutar fungera.
- Inloggningen går ut efter 12 timmars inaktivitet eller högst sju dagar. Webbläsaren använder en sessionscookie.

## Frågeset

1. Logga in och markera **Samla frågor i ett frågeset** i frågeformuläret.
2. Ge setet ett namn och välj när nästa fråga ska visas: **Automatiskt efter deltagarens svar** eller **Jag bestämmer när nästa fråga öppnas**.
3. Skriv frågorna med **Lägg till fråga**. Klicka på en fråga för att redigera den och använd **Flytta upp/ned** för att ändra ordningen före publicering.
4. Välj **Publicera frågeset** och dela koden eller QR-länken en gång.

I automatiskt läge går varje deltagare vidare i egen takt till sin första obesvarade fråga. I skaparstyrt läge väntar deltagaren efter sitt svar. Skaparen väljer **Öppna nästa fråga** för att byta fråga för alla. Deltagare som ansluter sent börjar på den aktuella frågan; tidigare frågor hoppas över. **Avsluta frågeset** avslutar efter den sista frågan. Det går inte att gå tillbaka i deltagarnas frågeordning eller återöppna ett avslutat set.

**Pausa svar** pausar hela setet. Progressionen sparas genom svaren och behålls när deltagaren laddar om sidan i samma webbläsare. Varje svar binds till ett fråge-ID så att sena svar aldrig sparas på nästa fråga. Setets innehåll och läge väljs före publicering.

Skaparen kan välja vilken frågas resultat som visas utan att ändra deltagarnas fråga. Utskrift/PDF gäller den valda frågans resultat. Frågesetet visas som en post i listan; borttagning efter bekräftelse raderar alla frågor och svar i setet. Varje fråga räknas mot gränsen för nya frågor per timme och har sin egen svarsgräns.

Vid uppgradering behöver **database.sql importeras igen** innan den nya koden används. Det lägger till `question_sets`, `set_questions`, `set_designs`, `set_design_assets`, `question_designs` och `question_design_assets` utan att ändra befintliga frågor eller svar. Lokalt görs det med `scripts/setup-local.php` enligt ovan. Webbappen behöver inga nya databasrättigheter.

### Eget utseende för varje set

Öppna **Färgtema och bilder för setet** i formuläret, eller välj **Utseende för setet** i ett publicerat sets resultatvy. Välj ett färgförslag (Puls, Skog, Hav eller Natt) och justera bakgrund, frågeruta, text och accent med färgväljarna. Inställningarna hör till setet och påverkar inte ditt kontotema eller andra set.

Du kan ladda upp en bakgrundsbild, en förgrundsbild och en logotyp. Bakgrunden fyller sidan bakom innehållet; förgrunden och logotypen visas ovanför frågan. PNG, JPEG och WebP stöds, inklusive transparens. Varje bild får vara högst 1 MB och 4096 × 4096 pixlar. Förhandsvisningen visar färger och bilder före sparandet. **Avbryt** behåller sparat utseende; varje bild kan tas bort separat, eller allt återställas.

Utseendet följer med till deltagarvyn, vänteläget, resultatvyn och helskärm. Sparade ändringar hämtas med den vanliga pollningen och behåller påbörjade svar. En avslutad deltagarvy hämtar det senaste utseendet vid omladdning. Utskrift/PDF tar med logotyp och förgrundsbild på vit bakgrund.

Bilderna lagras i databasen och hämtas via setets deltagarkod; deltagare behöver inget konto för att se dem. Endast ägaren får ändra utseendet. Radering av setet raderar även dess bilder. `database.sql` lägger också till `set_designs` och `set_design_assets` vid import. Ingen skrivbar uppladdningsmapp behövs. Servern måste tillåta JSON-förfrågningar på upp till 5 MB för tre bilder och ett set.

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

Valideringstesterna täcker indata, lösenord och säker temaimport. HTTP-testerna täcker inloggningskrav för att skapa och lista frågor, gästsvar för alla frågetyper, dubbla svar, behörigheter, radering av egna frågor och tillhörande svar, sessions-/CSRF-byte, återspelade gästcookies, flytt av äldre gästfrågor, kontosparade teman, försöksgränser och spärrade filer.

Gränssnittets inloggningsflöde kan även testas med `node tests/frontend-auth.mjs` när Playwright och Chromium finns installerade. Testet använder simulerade API-svar och kontrollerar bland annat gästvyn, registrering från loginrutan, inloggning, utloggning och deltagarvyn. Ange vid behov `PULS_PLAYWRIGHT_PATH` till en befintlig Playwright-installation, `PULS_BROWSER_EXECUTABLE` till webbläsarens körbara fil eller `PULS_TEST_URL` till en annan lokal appadress.

Utskrift och PDF testas med `node tests/frontend-print.mjs` i samma Playwright-miljö. Testet kontrollerar bland annat fullständiga textsvar, utskriftslayout, uppdaterade resultat och att skärmvyn återställs efter utskrift.

HTTP-testet inkluderar `tests/question-sets-integration.php`, som kontrollerar automatiska och skaparstyrda set, individuella framsteg, paus, behörigheter, blockerade framtida/sena svar, upprepade anrop, medlemskap och fullständig radering. `node tests/frontend-sets.mjs` testar hela flödet med Chromium och den lokala databasen, inklusive redigering, ordning, flera deltagare, omladdning, resultatval, PDF och mobilvy. Det skapar ett tillfälligt testkonto och tar bort kontots frågor och svar efteråt. Ange vid behov `PULS_PHP_PATH` till PHP; övriga Playwright-inställningar är desamma som ovan.

Dessutom verifierades hela användarflödet i Chromium med en verklig export från theme.j4rl.se: registrering, temaimport, QR, mobilsvar, liveuppdatering, paus/återupptagning, flera webbläsare och utloggning i flera flikar. Ljus/mörkt läge testades även med blockerad ld-tjänst. Lokala skärmbilder och testresultat finns i den Git-ignorerade mappen `test-results/`.

## Fortsatt utveckling

Lämpliga nästa steg är e-postverifiering och lösenordsåterställning (kräver e-posttjänst) samt dataexport av egna frågor och svar. Resultat kan redan skrivas ut eller sparas som PDF via webbläsaren. Listan visar de 50 senaste frågorna/frågeseten; äldre finns kvar via sina resultatadresser.
