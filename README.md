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
| Mausrad | Zoom |

## Boote
- **Level 1 – Schnellboot Klasse 143A „Gepard“**: 57,6 m, ~40 kn. Detailliertes Vektormodell mit beweglichen Teilen:
  rotierendes 3RM-20-Navigationsradar, WM-27-Feuerleitradom, suchender 76-mm-OTO-Melara-Turm, schwenkender RAM-Starter,
  wehende Flagge und schwingendes Beiboot, dazu Bugwelle, Kielwasser (Kelvin-Winkel) und Dieselabgase.

## Aufbau
```
public/            Client (wird beim Build in den Worker eingebettet)
  shared/sim.js    Gemeinsame Physik, Kartengenerator, Kollision (Server + Client)
  js/gepard.js     Zeichnung des Gepard-Schnellboots
  js/main.js       Netzwerk, Client-Vorhersage, Rendering, HUD
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
