// Gemeinsamer Simulationscode für Server (Durable Object) und Client (Vorhersage).
// Einheiten: Meter, Sekunden, Radiant. Kurs 0 = Osten (+x), positiv = im Uhrzeigersinn (y nach unten).

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const WORLD_SIZE = 6000;
export const MAP_SEED = 48143;
export const MAX_NAME = 16;

// Fahrzeugtypen. kind: "ship" (fährt auf dem Wasser) oder "heli" (fliegt über alles hinweg).
// weapons: Reihenfolge = Tasten 1, 2, 3 …; ability: Fähigkeit auf Taste E.
export const BOATS = {
  gepard: {
    typeId: 0,
    kind: "ship",
    label: "Schnellboot Gepard (Kl. 143A)",
    short: "Schnellboot",
    price: 0,
    weapons: ["gun", "exocet", "ram"],
    ability: "radar",
    level: 1,
    length: 57.6,
    beam: 7.8,
    maxSpeed: 20.6, // ~40 kn
    maxReverse: 0.3, // Anteil von maxSpeed
    accel: 2.4,
    decel: 3.2,
    turnRate: 0.32, // rad/s bei Volllast
    // 76-mm-Turm: Position (m vor Mitte), Schwenkbereich ±arc (hinter der Brücke gesperrt), Schwenkgeschw. rad/s
    gun: { x: 16.5, arc: (150 * Math.PI) / 180, speed: 1.4 },
    // RAM-Starter am Heck: Ruhestellung nach achtern, Schwenkbereich ±arc um achtern
    ram: { x: -21.5, arc: (150 * Math.PI) / 180, speed: 1.8 },
    hp: 100,
  },
  carrier: {
    typeId: 1,
    kind: "ship",
    label: "Hubschrauberträger Klasse Ähre",
    short: "Hubschrauberträger",
    price: 6000,
    weapons: ["ram"],
    ability: "radar",
    level: 2,
    length: 182,
    beam: 30,
    maxSpeed: 10.3, // ~20 kn
    maxReverse: 0.25,
    accel: 0.7,
    decel: 1.0,
    turnRate: 0.085,
    // RAM-Starter am Heck (feuert) und am Bug (schwenkt mit)
    ram: { x: -84, arc: (150 * Math.PI) / 180, speed: 1.6 },
    hp: 400,
    // Landepunkte auf dem Flugdeck (Bootskoordinaten); hier starten Black Hawks des Teams
    heliSpots: [
      { x: 64, y: -4 },
      { x: 38, y: -4 },
      { x: 12, y: -4 },
      { x: -14, y: -4 },
      { x: -40, y: -4 },
      { x: -66, y: -4 },
    ],
  },
  blackhawk: {
    typeId: 2,
    kind: "heli",
    label: "UH-60 Black Hawk",
    short: "Black Hawk",
    price: 0,
    weapons: ["mg", "hellfire"],
    ability: "flares",
    level: 2,
    length: 19.8,
    beam: 16.4, // Rotordurchmesser
    maxSpeed: 72, // ~140 kn
    maxReverse: 0.35,
    accel: 16,
    decel: 22,
    turnRate: 1.5,
    hitRadius: 8,
    hp: 40,
  },
};
export const TYPE_BY_ID = ["gepard", "carrier", "blackhawk"];

// Geld (Taler): Belohnungen je nach Typ des versenkten Gegners
export const ECONOMY = {
  kill: { gepard: 1000, carrier: 3000, blackhawk: 600 },
  assistShare: 0.4, // Anteil der Abschussprämie für Assists (Schaden in den letzten 30 s)
  assistWindow: 30,
  perDamage: 5, // Taler je verursachtem Trefferpunkt
};

// Waffen und Flugkörper. Geschwindigkeiten sind für das Spiel verkürzt.
export const WEAPONS = {
  gun: {
    label: "76 mm OTO Melara",
    auto: true, // Dauerfeuer solange F gedrückt
    reload: 0.6, // s pro Schuss
    speed: 320, // m/s
    range: 2200,
    damage: 6,
    spread: 0.012,
  },
  exocet: {
    label: "MM38 Exocet",
    cells: 4,
    reload: 15, // s pro Zelle
    interval: 0.6, // min. Abstand zwischen Starts
    speed: 140,
    turn: 1.0, // rad/s
    range: 4200,
    damage: 40,
    seekerRange: 1200,
    seekerCone: 0.6, // rad halber Öffnungswinkel
    // Zellen: Position (Bootskoordinaten) und Startrichtung relativ zum Bug
    launchers: [
      { x: -6.4, y: -1.5, a: -0.32 },
      { x: -6.0, y: -0.5, a: -0.32 },
      { x: -6.0, y: 0.5, a: 0.32 },
      { x: -6.4, y: 1.5, a: 0.32 },
    ],
  },
  ram: {
    label: "RAM Luftabwehr",
    magazine: 21,
    reload: 4, // s pro nachgeladenem Flugkörper
    interval: 0.35,
    speed: 230,
    turn: 3.2,
    range: 1800,
    damage: 6, // gegen Schiffe
    seekerRange: 1500,
    pk: 0.7, // Abfangwahrscheinlichkeit
  },
  mg: {
    label: "M240 Türschütze",
    auto: true,
    reload: 0.09,
    speed: 520,
    range: 800,
    damage: 0.6, // gegen Schiffe
    heliDamage: 1.2,
    spread: 0.035,
  },
  hellfire: {
    label: "AGM-114 Hellfire",
    count: 8,
    reload: 6, // s pro nachgeladenem Flugkörper
    interval: 0.4,
    speed: 210,
    turn: 2.4,
    range: 3000,
    damage: 14,
    seekerRange: 900,
    seekerCone: 0.55,
    // Startschienen an den Stummelflügeln (links/rechts abwechselnd)
    rails: [
      { x: -1.2, y: -3.4 },
      { x: -1.2, y: 3.4 },
    ],
  },
  lock: {
    range: 3000, // Radar-Erfassungsreichweite
    breakRange: 5500, // ein Lock hält bis hierhin (auch nach Ende der Radar-Fähigkeit)
    time: 1.2, // s bis zur Aufschaltung
    pick: 140, // m um den Mauszeiger
  },
};

// Fähigkeiten (Taste E)
export const ABILITIES = {
  radar: {
    label: "Radar-Rundumsuche",
    duration: 10, // s aktiv
    cooldown: 30, // s Abklingzeit nach Ende
    lockRange: 5000, // erweiterte Lock-Reichweite während aktiv
    pick: 380, // größerer Fangradius am Mauszeiger (weit herausgezoomt)
    viewRange: 5200, // sichtbarer Radius in der Radaransicht
  },
};

// Fähigkeit des Hubschraubers: Täuschkörper lenken RAM-Flugkörper ab
ABILITIES.flares = {
  label: "Täuschkörper",
  duration: 3,
  cooldown: 18,
};

export const PROJ = { SHELL: 1, EXOCET: 2, RAM: 3, BULLET: 4, HELLFIRE: 5 };

// Zielwinkel von Geschütz und RAM-Starter zur Mausposition (Weltkoordinaten).
// gun: relativ zum Bug, ram: relativ zu achtern. Im toten Winkel → Ruhestellung (0).
export function aimAngles(b, def, mx, my) {
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  let g = 0;
  let gunOk = false;
  if (def.gun) {
    const gx = b.x + c * def.gun.x;
    const gy = b.y + s * def.gun.x;
    g = wrapAngle(Math.atan2(my - gy, mx - gx) - b.h);
    gunOk = Math.abs(g) <= def.gun.arc;
  }
  let r = 0;
  let ramOk = false;
  if (def.ram) {
    const rx = b.x + c * def.ram.x;
    const ry = b.y + s * def.ram.x;
    r = wrapAngle(Math.atan2(my - ry, mx - rx) - b.h - Math.PI);
    ramOk = Math.abs(r) <= def.ram.arc;
  }
  return { gun: gunOk ? g : 0, gunOk, ram: ramOk ? r : 0, ramOk };
}

// Turm mit begrenzter Geschwindigkeit nachführen (bleibt im Bereich ±arc → nie durch den toten Winkel)
export function slewTurret(cur, target, mount, dt) {
  const step = mount.speed * dt;
  return clamp(cur + clamp(target - cur, -step, step), -mount.arc, mount.arc);
}

// Abstand Punkt → Strecke
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export const MS_TO_KN = 1.94384;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Karte ----------
// Insel = Mittelpunkt + Radius als Funktion des Winkels (Summe von Harmonischen).

export function islandRadius(isl, theta) {
  let r = 1;
  for (const h of isl.harm) r += h.a * Math.sin(h.k * theta + h.p);
  return isl.r * r;
}

// ---------- Teams und Marinebasen ----------
// Flaggen: Maiskolbistan laut Staatsflagge (assets/flagge.svg aus maiskolbistan-info): senkrecht Rot · Gold · Rot.
// Paprikistan (eigener Entwurf): waagerecht Rot · Orange · Grün.
export const TEAMS = [
  {
    id: 0,
    key: "mais",
    name: "Maiskolbistan",
    color: "#f1c94b",
    dark: "#7A0F1A",
    flag: { dir: "vertical", colors: ["#7A0F1A", "#C9A227", "#7A0F1A"] },
  },
  {
    id: 1,
    key: "paprika",
    name: "Paprikistan",
    color: "#ff7b5c",
    dark: "#1f6b2c",
    flag: { dir: "horizontal", colors: ["#D7261E", "#F28C1B", "#2E8B3A"] },
  },
];

// Basis-Geometrie in lokalen Koordinaten: x = Abstand vom Kartenrand Richtung See, y quer.
export const BASE_LAYOUT = {
  landDepth: 350, // Festland mit Werften
  landHalf: 1300,
  // Molen und Piers (lokal: [x0, x1, y0, y1])
  moles: [
    [350, 700, -720, -680],
    [660, 700, -720, -230],
    [350, 700, 680, 720],
    [660, 700, 230, 720],
  ],
  piers: [
    [350, 480, -457, -443],
    [350, 480, -157, -143],
    [350, 480, 143, 157],
    [350, 480, 443, 457],
  ],
  harbor: [350, 660, -680, 680], // Hafenbecken = sicherer Bereich
  // Liegeplätze für Schnellboote (der mittlere Platz bei y = 0 gehört dem Hubschrauberträger)
  spawns: [-590, -300, 300, 590].flatMap((y) => [
    { x: 560, y },
    { x: 425, y },
  ]),
  carrierSpawn: { x: 505, y: 0 },
};

export function teamBase(team) {
  const half = WORLD_SIZE / 2;
  return team === 0 ? { team, edge: -half, dir: 1 } : { team, edge: half, dir: -1 };
}

function localRect(base, [x0, x1, y0, y1]) {
  const a = base.edge + base.dir * x0;
  const b = base.edge + base.dir * x1;
  return { x0: Math.min(a, b), x1: Math.max(a, b), y0, y1 };
}

export function baseRects(base) {
  const L = BASE_LAYOUT;
  return [[0, L.landDepth, -L.landHalf, L.landHalf], ...L.moles, ...L.piers].map((r) => localRect(base, r));
}

export function harborRect(base) {
  return localRect(base, BASE_LAYOUT.harbor);
}

export function inRect(r, x, y, m = 0) {
  return x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m;
}

export function baseSpawn(team, i) {
  const base = teamBase(team);
  const s = BASE_LAYOUT.spawns[i % BASE_LAYOUT.spawns.length];
  return { x: base.edge + base.dir * s.x, y: s.y, h: base.dir === 1 ? 0 : Math.PI };
}

export function carrierSpawn(team) {
  const base = teamBase(team);
  const s = BASE_LAYOUT.carrierSpawn;
  return { x: base.edge + base.dir * s.x, y: s.y, h: base.dir === 1 ? 0 : Math.PI };
}

// Landepunkt i eines Trägers in Weltkoordinaten
export function heliSpotWorld(b, i) {
  const sp = BOATS.carrier.heliSpots[i];
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  return { x: b.x + sp.x * c - sp.y * s, y: b.y + sp.x * s + sp.y * c, h: b.h };
}

export function generateMap(seed = MAP_SEED) {
  const rnd = mulberry32(seed);
  const islands = [];
  const half = WORLD_SIZE / 2;
  let tries = 0;
  while (islands.length < 26 && tries < 2000) {
    tries++;
    const r = 70 + Math.pow(rnd(), 1.8) * 380;
    const x = (rnd() * 2 - 1) * (half - r - 250);
    const y = (rnd() * 2 - 1) * (half - r - 250);
    // Mitte frei halten und Abstand zwischen Inseln für Fahrrinnen; Basen an den Rändern frei lassen
    if (Math.hypot(x, y) < 500 + r) continue;
    if (Math.abs(x) + r * 1.5 > half - 1000) continue;
    let ok = true;
    for (const o of islands) {
      if (Math.hypot(o.x - x, o.y - y) < (o.r + r) * 1.45 + 160) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const harm = [];
    for (let k = 2; k <= 7; k++) {
      harm.push({ k, a: (rnd() * 0.22) / (k * 0.55), p: rnd() * Math.PI * 2 });
    }
    islands.push({ id: islands.length, x, y, r, harm, seed: Math.floor(rnd() * 1e9) });
  }
  const rects = [...baseRects(teamBase(0)), ...baseRects(teamBase(1))];
  return { size: WORLD_SIZE, islands, rects };
}

export function isOnLand(map, x, y, margin = 0) {
  if (map.rects) for (const r of map.rects) if (inRect(r, x, y, margin)) return true;
  for (const isl of map.islands) {
    const dx = x - isl.x;
    const dy = y - isl.y;
    const d2 = dx * dx + dy * dy;
    const maxR = isl.r * 1.6 + margin;
    if (d2 > maxR * maxR) continue;
    const d = Math.sqrt(d2);
    if (d < islandRadius(isl, Math.atan2(dy, dx)) + margin) return true;
  }
  return false;
}

// Rumpf-Prüfpunkte im Bootskoordinatensystem (Bug = +x)
function hullPoints(def) {
  const L = def.length / 2;
  const B = def.beam / 2;
  return [
    [L, 0],
    [L * 0.5, B * 0.8],
    [L * 0.5, -B * 0.8],
    [0, B],
    [0, -B],
    [-L, B * 0.9],
    [-L, -B * 0.9],
  ];
}

export function hullHitsLand(map, b, def) {
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  for (const [px, py] of hullPoints(def)) {
    const wx = b.x + px * c - py * s;
    const wy = b.y + px * s + py * c;
    if (isOnLand(map, wx, wy)) return true;
  }
  return false;
}

export function findSpawn(map, rnd = Math.random) {
  for (let i = 0; i < 200; i++) {
    const x = (rnd() * 2 - 1) * (WORLD_SIZE / 2 - 400);
    const y = (rnd() * 2 - 1) * (WORLD_SIZE / 2 - 400);
    if (!isOnLand(map, x, y, 120)) return { x, y, h: rnd() * Math.PI * 2 };
  }
  return { x: 0, y: 0, h: 0 };
}

// ---------- Physik ----------
// Boot-Zustand: { x, y, h, v, w }  (Position, Kurs, Fahrt, Drehrate)
// Eingabe: { th: -1..1 Fahrstufe, ru: -1..1 Ruder }

// Hubschrauber: schwebt, dreht auch im Stand, ignoriert Land
export function stepHeli(b, input, def) {
  const th = clamp(+input.th || 0, -def.maxReverse, 1);
  const ru = clamp(+input.ru || 0, -1, 1);
  const target = th * def.maxSpeed;
  const dv = target - b.v;
  const a = Math.abs(target) > Math.abs(b.v) ? def.accel : def.decel;
  b.v += clamp(dv, -a * DT, a * DT);
  b.w += (ru * def.turnRate - b.w) * Math.min(1, DT * 5);
  b.h = wrapAngle(b.h + b.w * DT);
  b.x += Math.cos(b.h) * b.v * DT;
  b.y += Math.sin(b.h) * b.v * DT;
  const lim = WORLD_SIZE / 2 - 20;
  if (Math.abs(b.x) > lim || Math.abs(b.y) > lim) {
    b.x = clamp(b.x, -lim, lim);
    b.y = clamp(b.y, -lim, lim);
    b.v *= 0.5;
  }
}

export function stepEntity(b, input, def, map) {
  if (def.kind === "heli") stepHeli(b, input, def);
  else stepBoat(b, input, def, map);
}

export function stepBoat(b, input, def, map) {
  const th = clamp(+input.th || 0, -def.maxReverse, 1);
  const ru = clamp(+input.ru || 0, -1, 1);

  const target = th * def.maxSpeed;
  const dv = target - b.v;
  const a = Math.abs(target) > Math.abs(b.v) && Math.sign(target) !== -Math.sign(b.v) ? def.accel : def.decel;
  b.v += clamp(dv, -a * DT, a * DT);

  // Ruderwirkung braucht Fahrt durchs Wasser
  const speedFactor = clamp(Math.abs(b.v) / (def.maxSpeed * 0.35), 0, 1);
  const targetW = ru * def.turnRate * speedFactor * (b.v >= 0 ? 1 : -1);
  b.w += (targetW - b.w) * Math.min(1, DT * 2.2);

  const px = b.x;
  const py = b.y;
  const ph = b.h;
  b.h = wrapAngle(b.h + b.w * DT);
  b.x += Math.cos(b.h) * b.v * DT;
  b.y += Math.sin(b.h) * b.v * DT;

  const lim = WORLD_SIZE / 2 - def.length / 2;
  if (b.x < -lim || b.x > lim || b.y < -lim || b.y > lim) {
    b.x = clamp(b.x, -lim, lim);
    b.y = clamp(b.y, -lim, lim);
    b.v *= 0.5;
  }

  if (map && hullHitsLand(map, b, def)) {
    // Auflaufen: zurücksetzen und abprallen
    b.x = px;
    b.y = py;
    b.h = ph;
    b.v = -b.v * 0.25;
    b.w = 0;
  }
}

// Kollision Boot gegen Boot (nur Server): Kreise entlang der Längsachse.
export function boatCircles(b, def) {
  const n = Math.max(5, Math.round(def.length / (def.beam * 0.9)));
  const r = def.beam * 0.55;
  const out = [];
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (def.length - def.beam);
    out.push({ x: b.x + c * t, y: b.y + s * t, r });
  }
  return out;
}

export function resolveBoatCollision(a, defA, b, defB, map) {
  const dx0 = a.x - b.x;
  const dy0 = a.y - b.y;
  const reach = (defA.length + defB.length) / 2;
  if (dx0 * dx0 + dy0 * dy0 > reach * reach) return false;
  // Schwere Schiffe werden weniger weggeschoben
  const wa = defB.hp / (defA.hp + defB.hp);
  const wb = defA.hp / (defA.hp + defB.hp);
  let hit = false;
  for (const ca of boatCircles(a, defA)) {
    for (const cb of boatCircles(b, defB)) {
      const dx = ca.x - cb.x;
      const dy = ca.y - cb.y;
      const d = Math.hypot(dx, dy);
      const min = ca.r + cb.r;
      if (d < min && d > 1e-6) {
        const push = min - d;
        const nx = dx / d;
        const ny = dy / d;
        const ax = a.x + nx * push * wa, ay = a.y + ny * push * wa;
        const bx = b.x - nx * push * wb, by = b.y - ny * push * wb;
        if (!map || !isOnLand(map, ax, ay)) { a.x = ax; a.y = ay; }
        if (!map || !isOnLand(map, bx, by)) { b.x = bx; b.y = by; }
        hit = true;
      }
    }
  }
  if (hit) {
    a.v *= 0.9;
    b.v *= 0.9;
  }
  return hit;
}

export function sanitizeName(raw) {
  let n = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, "")
    .trim()
    .slice(0, MAX_NAME);
  return n || "Matrose";
}
