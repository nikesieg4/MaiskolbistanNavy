# Multiplayer Seegefecht 🌽⚓

(Repo und Webadresse heißen aus technischen Gründen weiter `MaiskolbistanNavy` bzw. `maiskolbistan-navy`.)

Top-down-Multiplayer-Schiffsspiel im Stil von mk48.io. Läuft komplett auf Cloudflare:
ein Worker liefert den Client aus, ein Durable Object ist der autoritative Spielserver (WebSocket, 20 Ticks/s).

**Live:** https://maiskolbistan-navy.nikesieg0.workers.dev

## Welt, Teams und Frontkarte
- **Karte:** 10 × 10 km. Links der Kontinent **Maiskolbistan** (Maisfelder, rote Dächer), rechts **Paprikistan**
  (Paprikafelder). An der Küste liegt jeweils die Marinebasis mit Werften, dazwischen ein Meer mit rund 50 Inseln.
- **Flaggen:** Maiskolbistan = Staatsflagge Rot · Gold · Rot (`assets/flagge.svg` in nikesieg4/maiskolbistan-info),
  Paprikistan = Rot · Orange · Grün (eigener Entwurf).
- **Frontkarte:** 9 Inseln tragen **Stützpunkte** mit Radarstation. Erobert wird, wenn nur Schiffe oder Hubschrauber
  eines Teams in der Zone sind (bis zu 3 zählen, Drohnen nicht). Der Besitz wird dauerhaft gespeichert (Durable Object
  „front“) und übersteht Neustarts und Updates. Gehaltene Stützpunkte liefern Radarabdeckung und sind **Startorte für
  kleine Schiffe (Stufe 1–2, keine Träger)**. Eroberung bringt 600 Taler pro beteiligtem Fahrzeug.
- **Sicherer Hafen:** Im eigenen Hafenbecken nimmt man keinen Schaden. Kein Eigenbeschuss.

## Flotten der Nationen
| | Maiskolbistan (deutsch/europäisch) | Paprikistan (amerikanisch) | Preis |
|---|---|---|---|
| Stufe 1 | Schnellboot Gepard (Kl. 143A): 76 mm, Exocet, RAM | Patrouillenboot Cyclone (PC-1): 25 mm, Griffin, Stinger | – |
| Stufe 2 | Korvette Braunschweig (Kl. 130): 76 mm, RBS 15, 2 × RAM | LCS Independence (Trimaran): 57 mm, NSM, SeaRAM | 4.000 |
| Stufe 3 | Fregatte Sachsen (F124): 76 mm, Harpoon, SM-2, RAM | Zerstörer Arleigh Burke: 127 mm, Harpoon, SM-2 | 12.000 |
| Träger | Hubschrauberträger Ähre | USS America (LHA-6) | 6.000 |
| Hubschrauber | NH90 NFH: MG, Marte ER | UH-60 Black Hawk: MG, Hellfire | Start vom Träger |
| Drohne | Heron TP: ARMIGER | MQ-9 Reaper: AGM-88 HARM | Start von der Basis |

## Sensorkrieg
- Gegner sind nur sichtbar, wenn **dein Team** sie erfasst (Schiffe, Luftfahrzeuge, Basis, gehaltene Stützpunkte).
  Erfasste Kontakte sind für das ganze Team sichtbar, verlorene bleiben 12 s als „?“ stehen.
- **Radar ein/aus (T):** Mit eingeschaltetem Radar siehst du weit, wirst aber selbst weiter entdeckt.
  Ausgeschaltet bist du schwer zu finden, siehst aber nur nahe Ziele. „⚠ Vom Gegner erfasst“ zeigt, ob man dich sieht.
- **Zielmarkierung:** Jeder AGIS-Lock gilt für das ganze Team. Seeziel- und Luft-Boden-Flugkörper ohne eigenen Lock
  fliegen auf die Markierung eines Teammitglieds (z. B. einer Drohne).
- **Anti-Radar-Flugkörper (ARM):** Drohnen tragen 2 ARM. Sie jagen nur Schiffe mit **sendendem Radar**. Schaltet das
  Ziel sein Radar ab, fliegt die ARM nur noch zur letzten bekannten Position. Flugabwehr kann ARM abfangen.

## Luftrollen
- **Hubschrauber** (vom Träger des Teams): Angriff mit MG und Luft-Boden-Raketen, Täuschkörper gegen Flugabwehr.
- **Seenotrettung:** Nach jedem Untergang treiben Rettungsinseln. Ein Hubschrauber, der langsam darüber schwebt,
  birgt die Schiffbrüchigen (150 Taler je Insel).
- **Aufklärungsdrohnen** (von der Basis): sehr große Sensorreichweite, Zielmarkierung für das Team, ARM gegen Radare.
  Drohnen fliegen wie Flugzeuge (Mindestgeschwindigkeit) und können keine Stützpunkte erobern.

## Flugfeld, Landen und Hangar
- Hinter jeder Marinebasis liegt ein **Flugfeld** mit Start- und Landebahn, Rollwegen, Vorfeld, drei Hangars,
  Tower mit Radar, drei Hubschrauberlandeplätzen und Windsack. Über dem eigenen Flugfeld ist man sicher.
- **Drohnen** starten auf dem Vorfeld (geparkt) und heben mit W von der Bahn ab. **Hubschrauber** können wahlweise
  vom Flugfeld oder von einem Träger des Teams starten.
- **Landen:** Drohne langsam (S halten) über die eigene Bahn fliegen; Hubschrauber langsam über einem freien
  Landepunkt eines eigenen Trägers oder über dem Flugfeld schweben. Am Boden wird repariert und aufmunitioniert,
  auf dem Träger fährt man mit. Start mit W.
- **Hangar (Knopf „🛩 Hangar – Bewaffnung“ oben in der Mitte oder Taste H, nur gelandet):** Bewaffnung wählen – wird im Konto gespeichert.

| Fahrzeug | Waffenplatz-Optionen |
|---|---|
| Heron TP | ARMIGER (Anti-Radar) · Radarstörpod |
| MQ-9 Reaper | AGM-88 HARM · Radarstörpod · Hellfire |
| NH90 | Marte ER · Stinger (Luft-Luft) · 70-mm-Raketen |
| Black Hawk | Hellfire · Stinger (Luft-Luft) · 70-mm-Raketen |

- **Radarstörpod (F):** 8 s aktiv, 20 s Abklingzeit. Gegnerische Sensoren im Umkreis von 2,6 km sehen nur halb so weit,
  Locks auf Ziele in der Nähe bauen sich nicht auf, gelenkte Flugkörper können ihr Ziel verlieren. Der Störer sendet
  selbst – ARM können sich auf ihn aufschalten.

## Konto (sicher)
- **Gast:** ohne Anmeldung, Fortschritt nur in diesem Browser (zufälliger Schlüssel im `localStorage`).
- **Registrieren / Anmelden** im Startmenü mit Name (3–16 Zeichen) und Passwort (mind. 8 Zeichen). Beim Registrieren wird der Gast-Fortschritt übernommen.
- Sicherheit:
  - Passwörter nur als **PBKDF2-SHA-256-Hash** mit 100.000 Runden und eigenem Salz je Konto, nie im Klartext.
  - Anmeldung über einen **zufälligen 256-Bit-Sitzungsschlüssel**, den nur der Server erzeugt (180 Tage gültig, Abmelden löscht ihn).
  - Nach der Registrierung ist der alte Gastschlüssel wertlos. Abgemeldete oder abgelaufene Schlüssel geben keinen Zugriff.
  - Nach 8 Fehlversuchen je Name bzw. IP ist die Anmeldung 15 Minuten gesperrt. Vergleich in konstanter Zeit, gleiche Antwortzeit auch bei unbekanntem Namen.
  - Registrierte Namen sind geschützt: Gäste mit diesem Namen heißen im Spiel „Gast-123“. Registrierte spielen immer unter ihrem Kontonamen.
- „Mit Google anmelden“ ist vorbereitet (zweiter Anmeldeweg zum selben Konto) und folgt später.

## Dienstgrade und Erfahrung
- Erfahrung (EP) = ein Zehntel der im Gefecht verdienten Taler (Abschüsse, Assists, Schaden, Eroberungen, Rettungen).
- 17 Dienstgrade von Matrose bis Admiral. Der Dienstgrad steht am Namensschild, in der Flottenliste und im HUD.
- Freischaltungen: Korvette/LCS ab Maat, Träger und U 212A ab Bootsmann, Harrier/F-16/Virginia ab Oberbootsmann,
  F124/Burke ab Leutnant zur See, Eurofighter/F-35B ab Kapitänleutnant. Dazu braucht man die Taler.
- Kaufen geht im Startmenü (Klick auf ein noch nicht gekauftes Fahrzeug) oder im Laden (Hafen bzw. Flugfeld).

## Saisons der Frontkarte
- Eine Saison dauert eine Woche (Montag 0 Uhr UTC). Am Ende gewinnt das Team mit mehr Stützpunkten.
- Wer für das Siegerteam mindestens 20 EP beigetragen hat, bekommt eine **Medaille** und 5.000 Taler (auch wenn er erst später wieder online ist).
- Danach wird die Frontkarte zurückgesetzt. Die letzten Sieger stehen im Startmenü.

## Tageszeit und Wetter
- Ein Tag dauert 24 Minuten (1 Spielstunde = 1 Minute). Nachts ist die Sicht kurz, Schiffe, Basen und Explosionen leuchten.
- Das Wetter wechselt alle 8 Minuten: klar, bewölkt, Regen, Nebel, Sturm.
- Wirkung:
  - Nebel und Nacht verkürzen die Sicht.
  - Regen und Sturm schwächen das Radar.
  - Sturm stört das Sonar und bremst Schiffe; kleine Boote bremst er stärker.
- Uhrzeit und Wetter stehen im HUD.

## Flugzeugträger
| Typ | Nation | Länge | Katapulte | Abstellplätze | Abwehr |
|---|---|---|---|---|---|
| Charles de Gaulle (R91) | Maiskolbistan | 261 m | 2 | 8 | Aster 15, RAM |
| Gerald R. Ford (CVN-78) | Paprikistan | 333 m | 4 | 9 | ESSM, SeaRAM |
- **Freischaltung:** ab Korvettenkapitän, 15.000 Taler. Kopfgeld 5.000 Taler.
- **Start:** Die Träger starten vor dem Hafen, weil sie nicht ins Hafenbecken passen.
- **Auf dem Deck starten:** Alle Jets des Teams können hier starten. Landjäger stehen auf einem Abstellplatz und starten mit **W** per Katapult. Senkrechtstarter heben senkrecht ab.
- **Fangseil-Landung:** Jets langsam (≤ 95 m/s) und unter 60 m über das Deck fliegen.
- **Abstellplätze:** Jeder Platz trägt ein Luftfahrzeug (Jet, Hubschrauber oder TB3), bis es zerstört ist.

## Bayraktar TB3 (U-Jagd-Drohne)
- **Verfügbarkeit:** für beide Nationen, ab Obermaat, kostenlos. Startet vom Flugfeld oder vom Deck jedes eigenen Trägers (Ähre, America, CdG, Ford).
- **Start und Landung:** Kurzstart über den Bug. Landen langsam und unter 60 m über einem eigenen Trägerdeck.
- **Bewaffnung:**
  - Leichttorpedos: MU90 bzw. Mk 54.
  - 6 Sonarbojen: Eine Boje hört 90 s lang U-Boote im Umkreis von 2,5 km für das ganze Team. Sie wird mit gestricheltem Kreis angezeigt.

## Kampfflugzeuge
| Typ | Nation | Start | Bewaffnung (Hangar-Platz 3 wählbar) |
|---|---|---|---|
| Eurofighter Typhoon | Maiskolbistan | Bahn | BK-27, IRIS-T, Meteor / Taurus / GBU-12 |
| AV-8B Harrier II | Maiskolbistan | Bahn oder Deck der Ähre (Senkrechtstarter) | GAU-12, AIM-9X, GBU-12 / AIM-120 / Marte |
| F-16C | Paprikistan | Bahn | M61, AIM-9X, AIM-120 / HARM / GBU-12 |
| F-35B | Paprikistan | Bahn oder Deck der America (Tarnkappe) | GAU-22, AIM-120, GBU-12 / JSM |
- Steuerung:
  - **W** Vollschub, **Shift** Nachbrenner, **S** Leerlauf (Senkrechtstarter schweben), **Q/C** Höhe.
  - Die Bordkanone schießt starr nach vorn.
- **Treibstoff:**
  - Der Nachbrenner verbraucht ihn dreifach, Schweben mehr.
  - Bei 20 % kommt die Warnung „Bingo Fuel“.
  - Ist er leer, fällt das Triebwerk aus und der Jet stürzt ab.
  - Landen tankt auf.
- **Landen:** auf der eigenen Bahn langsam (≤ 95 m/s) unter 250 m. Senkrechtstarter schwebend auf einem Trägerdeck (belegt einen Platz wie ein Hubschrauber).
- **Luft-Luft:**
  - IRIS-T und AIM-9X: Infrarot, Täuschkörper wirken sicher.
  - Meteor und AIM-120: Radar. Mit Lock (R) haben sie große Reichweite, Täuschkörper wirken nur zur Hälfte, Störer brechen sie.
- **GBU-12:** gleitet aus der Höhe auf Lock-Ziel oder Mauszeiger; je höher der Abwurf, desto weiter fliegt sie.
- Die F-35B ist schwer zu orten, weil sie ihre Waffen im Rumpfschacht trägt.
- Jets können nicht erobern.

## U-Boote
| Typ | Nation | Bewaffnung |
|---|---|---|
| U-Boot Klasse 212A | Maiskolbistan | DM2A4-Torpedos, IDAS (Flugabwehr aus dem U-Boot) |
| Virginia-Klasse | Paprikistan | Mk-48-Torpedos, Harpoon |
- **Tauchen:** **Q** auftauchen, **C** tiefer. Bis −5 m ist man aufgetaucht, bis −25 m auf Sehrohrtiefe, darunter getaucht.
- **Getaucht:**
  - Radar und Sicht orten das U-Boot nicht mehr, nur noch Sonar. Leise und langsam bleibt es lange unentdeckt.
  - Flugkörper (IDAS, Harpoon) gehen nur auf Sehrohrtiefe, Torpedos in jeder Tiefe.
- **Sonar** haben F124, Burke, LCS, Korvette, Basis, gehaltene Stützpunkte und NH90/Black Hawk. Die Hubschrauber orten nur mit Tauchsonar, also schwebend unter 60 m.
- **Leichttorpedos:**
  - F124 hat MU90, Burke Mk 54.
  - Hubschrauber können sie im Hangar laden.
- **Torpedos:**
  - Sie treffen Schiffe und U-Boote.
  - Sie lassen sich nicht abfangen.
  - Der Torpedotäuschkörper (E) lenkt sie mit 70 % Wahrscheinlichkeit ab.
- Gegnerische U-Boote mit Sonarkontakt erscheinen als blasser Schemen mit gestricheltem Kreis.

## Chat
- **Enter** (oder 💬 rechts, fürs iPad) öffnet den Chat, Enter sendet, Esc schließt. **Tab** bzw. der Knopf links wechselt zwischen „Alle“ und „Team“.
- Höchstens 140 Zeichen, eine Nachricht pro 0,7 s. Die letzten 8 Zeilen stehen links unten und blenden nach 12 s aus.

## Admin-Menü
- `:DEV` im Chat öffnet eine Passwortabfrage (der Befehl wird nicht an andere gesendet).
- **Passwort:**
  - Es steht nicht im Quellcode. Der Server vergleicht nur mit einem SHA-256-Hash im Cloudflare-Secret `ADMIN_PASSWORD_HASH`.
  - Ändern: `printf '%s' 'NEUES_PASSWORT' | sha256sum`, den Hash mit `npx wrangler secret put ADMIN_PASSWORD_HASH` setzen.
- **Fehlversuche:** 3 je Verbindung, 10 je 10 Minuten insgesamt.
- **Gültigkeit:** Admin gilt nur für die aktuelle Verbindung, jede Aktion prüft der Server.
- **Ich selbst:**
  - Taler geben, Dienstgrad setzen, alle Fahrzeuge freischalten.
  - Reparieren, aufmunitionieren und betanken, unverwundbar an/aus.
  - Teleport per Klick auf die Karte.
- **Spieler:** Taler geben, heilen, unverwundbar, stummschalten, zerstören, vom Server entfernen.
- **Welt:**
  - Wetter und Uhrzeit festlegen oder wieder automatisch.
  - Ansage an alle.
  - Stützpunkte einzeln setzen, Frontkarte zurücksetzen, alle Geschosse löschen.

## Landedecks und Hubschrauber-Start
- Hubschrauber wählen beim Start, wo sie erscheinen: Flugfeld (unbegrenzt) oder ein Schiff des eigenen Teams mit Landedeck.
- Jedes Landedeck trägt genau einen Hubschrauber: Fregatte Sachsen (F124), Arleigh Burke und LCS Independence je 1 Platz, die Träger Ähre und America je 6.
- Startet ein Spieler dort, ist der Platz belegt („0/1 – belegt“), bis dieser Hubschrauber zerstört ist. Wegfliegen gibt den Platz nicht frei.
- Wird das Schiff selbst versenkt, verfallen seine Plätze.
- Landen (Hangar, Reparatur, Bewaffnung) geht auf jedem freien Landedeck des eigenen Teams.

## Höhe (Hubschrauber, Drohnen, Flugkörper)
- **Q** steigen, **C** sinken (Sollhöhe, die Ist-Höhe folgt mit der Steigrate). Hubschrauber 15–1.500 m, Drohnen 150–6.000 m.
- Höher = größere Sensorreichweite (Radarhorizont). Unter 60 m fliegt man „unter dem Radar“ und wird viel schwerer entdeckt.
- Gipfelhöhen gegen Luftziele: MG 1.000 m, 25 mm 1.500 m, 57 mm 2.600 m, 76 mm 3.000 m, 127 mm 4.000 m,
  RAM/SeaRAM 3.000 m, Stinger 3.500 m, SM-2 15.000 m – eine hoch fliegende Drohne holt nur die SM-2 (F124, Burke) herunter.
- Landen, Seenotrettung (Hubschrauber unter 30 m, Drohnen unter 250 m) und Eroberung (Hubschrauber unter 300 m) nur in Bodennähe.
- Seezielflugkörper fliegen im Tiefflug, Luft-Boden-Raketen und ARM gleiten zum Ziel hinab, Flugabwehr steigt auf Zielhöhe.
- Der Schatten auf dem Wasser wandert mit der Höhe, das Namensschild zeigt die Flughöhe.

## Radarwarnanlage
- **Lock-Warnung:** gelbe Peilmarke während ein Gegner aufschaltet, blinkendes „⚠ LOCK“ und rote Marke, sobald der Lock steht –
  auch wenn du den Gegner selbst nicht siehst.
- **Raketenwarnung:** „⚠ RAKETE“ mit Anzahl und Entfernung, ein roter Pfeil je anfliegendem Flugkörper und ein pulsierender
  roter Bildschirmrand.
- „⚡ Radar gestört“ zeigt, wenn deine Sensoren von einem Störer betroffen sind.

## Steuerung
| Taste | Aktion |
|---|---|
| W / S | Schiff: Fahrstufe erhöhen / verringern · Hubschrauber: vorwärts / rückwärts (loslassen = schweben) |
| A / D | Ruder Backbord / Steuerbord |
| Leertaste / X | Maschine stopp |
| Maus | Geschütz und RAM-Starter richten sich auf den Mauszeiger |
| 1 / 2 / 3 | Waffe wählen: 76 mm, Exocet, RAM (oder Klick in der Waffenleiste) |
| F | Feuer (76 mm: Dauerfeuer solange gedrückt; Flugkörper: einer pro Tastendruck) |
| R | AGIS-Radar-Lock auf das Schiff unter dem Mauszeiger (nochmal R = lösen) |
| E | Fähigkeit: Radar-Rundumsuche (Schiffe, Drohnen) bzw. Täuschkörper (Hubschrauber) |
| T | Radar ein/aus (Schiffe) |
| H | Hangar (gelandet) |
| Enter | Chat (Tab: Alle/Team) |
| Q / C | Höhe: steigen / sinken (Hubschrauber, Drohnen, Jets) · U-Boot: auftauchen / tiefer |
| Shift | Nachbrenner (Jets, bei Vollschub) |
| + / − | Zoomen (auch Mausrad, Knöpfe rechts unten fürs iPad, Zwei-Finger-Pinch) |
| B | Laden (im eigenen Hafen oder gelandet auf dem Flugfeld) |
| Mausrad | Zoom |

## Waffen
| Waffe | Wirkung |
|---|---|
| **76 mm OTO Melara** | Granaten in Turmrichtung, 6 Schaden, 0,6 s Nachladen, 2,2 km. Toter Winkel hinter der Brücke (±150°). |
| **MM38 Exocet** | 4 Zellen, je 15 s Nachladen, 40 Schaden. Mit Lock: lenkt selbst ins Ziel (mit Vorhalt). Ohne Lock: fliegt zum Mauszeiger, dann sucht der Suchkopf ein Schiff. |
| **RAM** | 21 Flugkörper, lädt alle 4 s einen nach. Sucht selbstständig anfliegende gegnerische Flugkörper und fängt sie zu 70 % ab. |
| **AGIS** | Radar-Lock bis 3 km (mit Radar-Rundumsuche 5 km), Aufschaltung dauert 1,2 s, bricht ab über 5,5 km. |

## Fähigkeiten
- **Radar-Rundumsuche (E):** Für 10 s zoomt die Ansicht weit heraus auf ein grünes Radarbild mit rotierendem Strahl,
  Entfernungsringen und Peilskala. Kontakte leuchten auf, wenn der Strahl sie überstreicht. Mit R oder per Klick auf einen
  Kontakt lockt man Schiffe bis 5 km. Danach 30 s Abklingzeit.
- Gelockte Schiffe werden auf der Minimap rot mit Zielklammern und Peillinie markiert (gelb während der Aufschaltung).

Schiffe haben 100 Trefferpunkte. Inseln blocken Granaten und Flugkörper. Nach dem Ablegen gibt es 4 s Spawnschutz (endet beim ersten Schuss).

## Boote
- **Level 1 – Schnellboot Klasse 143A „Gepard“**: 57,6 m, ~40 kn. Detailliertes Vektormodell mit beweglichen Teilen:
  rotierendes 3RM-20-Navigationsradar, WM-27-Feuerleitradom, suchender 76-mm-OTO-Melara-Turm, schwenkender RAM-Starter,
  wehende Flagge und schwingendes Beiboot, dazu Bugwelle, Kielwasser (Kelvin-Winkel) und Dieselabgase.

## Aufbau
```
public/            Client (wird beim Build in den Worker eingebettet)
  shared/sim.js    Gemeinsame Physik, Kartengenerator, Kollision (Server + Client)
  js/gepard.js     Zeichnung des Gepard-Schnellboots
  js/main.js       Netzwerk, Client-Vorhersage, Rendering, HUD, Waffenleiste
  js/combat.js     Flugkörper, Explosionen, Wracks, Lock-Anzeige
  js/radar.js      Radaransicht der Fähigkeit Radar-Rundumsuche
  js/base.js       Marinebasen mit Werften
  js/carrier.js    Hubschrauberträger
  js/heli.js       UH-60 Black Hawk
  js/ui.js         Symbole der Waffenleiste
  js/warships.js   K130, F124, Cyclone, LCS, Arleigh Burke
  js/aircraft.js   NH90, Heron TP, MQ-9 Reaper
  js/vehicles.js   zeichnet jedes Fahrzeug nach Typ
  js/world.js      Kontinente, Stützpunkte, Frontkarte
  js/jets.js       Eurofighter, Harrier II, F-16C, F-35B
  js/subs.js       U 212A, Virginia
  js/weather.js    Tageszeit, Wetter, Nachtlichter
  js/account.js    Konto im Menü (Anmelden, Dienstgrad, Medaillen, Saison)
src/worker.js      Worker (Auslieferung + /ws) und Durable Object `World`
scripts/build-assets.mjs  Bettet public/ in src/assets.gen.js ein
```

Der Server ist autoritativ. Der Client berechnet sein eigenes Boot mit denselben Eingaben voraus,
gleicht es mit dem Serverstand ab und blendet Korrekturen weich aus. Andere Boote werden mit ~110 ms Verzögerung interpoliert.

## Vorschaubild (spiele.maiskolbistan.app)
`public/vorschau.jpg` (1200 × 1200) und `public/vorschau_breit.jpg` (1200 × 600) werden aus den echten Spielgrafiken erzeugt
und vom Worker unter `/vorschau.jpg` bzw. `/vorschau_breit.jpg` ausgeliefert. Neu erzeugen (lokaler Server muss laufen):
```bash
npm run dev
node scripts/vorschau.cjs
```
Die Seite erlaubt Einbettung nur auf sich selbst und auf `https://spiele.maiskolbistan.app` (`frame-ancestors`).

## Entwickeln & Deployen
```bash
npm install
npm run dev      # lokal auf http://localhost:8787
npx wrangler dev --var DEV_START_MONEY:20000 --var DEV_START_XP:12000   # lokal mit Startguthaben und Dienstgrad zum Testen
npm run deploy   # auf Cloudflare (wrangler login bzw. CLOUDFLARE_API_TOKEN nötig)
```
