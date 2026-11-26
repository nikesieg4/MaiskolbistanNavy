# MaiskolbistanNavy 🌽⚓

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
| B | Schiffsladen (im eigenen Hafen) |
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
npx wrangler dev --var DEV_START_MONEY:20000   # lokal mit Startguthaben zum Testen des Ladens
npm run deploy   # auf Cloudflare (wrangler login bzw. CLOUDFLARE_API_TOKEN nötig)
```
