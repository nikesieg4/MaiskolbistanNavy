# MaiskolbistanNavy 🌽⚓

Top-down-Multiplayer-Schiffsspiel im Stil von mk48.io. Läuft komplett auf Cloudflare:
ein Worker liefert den Client aus, ein Durable Object ist der autoritative Spielserver (WebSocket, 20 Ticks/s).

**Live:** https://maiskolbistan-navy.nikesieg0.workers.dev

## Steuerung
| Taste | Aktion |
|---|---|
| W / S | Fahrstufe erhöhen / verringern (bleibt stehen, bis du sie änderst) |
| A / D | Ruder Backbord / Steuerbord |
| Leertaste / X | Maschine stopp |
| Maus | Geschütz und RAM-Starter richten sich auf den Mauszeiger |
| 1 / 2 / 3 | Waffe wählen: 76 mm, Exocet, RAM (oder Klick in der Waffenleiste) |
| F | Feuer (76 mm: Dauerfeuer solange gedrückt; Flugkörper: einer pro Tastendruck) |
| R | AGIS-Radar-Lock auf das Schiff unter dem Mauszeiger (nochmal R = lösen) |
| E | Fähigkeit Radar-Rundumsuche (10 s aktiv, 30 s Abklingzeit) |
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
src/worker.js      Worker (Auslieferung + /ws) und Durable Object `World`
scripts/build-assets.mjs  Bettet public/ in src/assets.gen.js ein
```

Der Server ist autoritativ. Der Client berechnet sein eigenes Boot mit denselben Eingaben voraus,
gleicht es mit dem Serverstand ab und blendet Korrekturen weich aus. Andere Boote werden mit ~110 ms Verzögerung interpoliert.

## Entwickeln & Deployen
```bash
npm install
npm run dev      # lokal auf http://localhost:8787
npm run deploy   # auf Cloudflare (wrangler login bzw. CLOUDFLARE_API_TOKEN nötig)
```
