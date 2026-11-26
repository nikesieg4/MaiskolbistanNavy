// Gemeinsamer Simulationscode für Server (Durable Object) und Client (Vorhersage).
// Einheiten: Meter, Sekunden, Radiant. Kurs 0 = Osten (+x), positiv = im Uhrzeigersinn (y nach unten).

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const WORLD_SIZE = 10000;
export const MAP_SEED = 48143;
export const MAX_NAME = 16;

// Fahrzeugtypen. kind: "ship" (fährt), "sub" (taucht), "heli" (schwebt), "drone" (fliegt, Mindestgeschwindigkeit)
// oder "jet" (Kampfflugzeug mit Treibstoff und Nachbrenner; vtol = Senkrechtstarter).
// rank: nötiger Dienstgrad zum Kauf (siehe RANKS).
// team: 0 = Maiskolbistan (deutsch/europäisch), 1 = Paprikistan (amerikanisch).
// weapons: Reihenfolge = Tasten 1, 2, 3 …; ability: Fähigkeit auf Taste E.
// sensor: Erfassungsreichweite (m), sig: Signatur (wie gut man selbst entdeckt wird).
const DEG = Math.PI / 180;
export const BOATS = {
  // ---------------- Maiskolbistan ----------------
  gepard: {
    typeId: 0, team: 0, kind: "ship", level: 1, price: 0,
    label: "Schnellboot Gepard (Kl. 143A)", short: "Schnellboot Gepard",
    weapons: ["gun76", "exocet", "ram"], ability: "radar",
    length: 57.6, beam: 7.8, maxSpeed: 20.6, maxReverse: 0.3, accel: 2.4, decel: 3.2, turnRate: 0.32,
    gun: { x: 16.5, arc: 150 * DEG, speed: 1.4 },
    ram: { x: -21.5, arc: 150 * DEG, speed: 1.8 },
    ssm: [
      { x: -6.4, y: -1.5, a: -0.32 },
      { x: -6.0, y: -0.5, a: -0.32 },
      { x: -6.0, y: 0.5, a: 0.32 },
      { x: -6.4, y: 1.5, a: 0.32 },
    ],
    hp: 100, sensor: 2200, sig: 0.8,
  },
  k130: {
    typeId: 3, team: 0, kind: "ship", level: 2, price: 4000,
    label: "Korvette Braunschweig (Kl. 130)", short: "Korvette Braunschweig",
    weapons: ["gun76", "rbs15", "ram"], ability: "radar",
    length: 89, beam: 13.3, maxSpeed: 13.4, maxReverse: 0.3, accel: 1.5, decel: 2.2, turnRate: 0.2,
    gun: { x: 28, arc: 150 * DEG, speed: 1.4 },
    ram: { x: -30, arc: 150 * DEG, speed: 1.8 },
    ssm: [
      { x: -12, y: -2.6, a: -0.5 },
      { x: -15, y: -2.6, a: -0.5 },
      { x: -12, y: 2.6, a: 0.5 },
      { x: -15, y: 2.6, a: 0.5 },
    ],
    mags: { ram: 42 },
    hp: 180, sensor: 2600, sig: 0.9, sonar: 1200, rank: 3,
  },
  f124: {
    typeId: 4, team: 0, kind: "ship", level: 3, price: 12000,
    label: "Fregatte Sachsen (F124)", short: "Fregatte Sachsen",
    weapons: ["gun76", "harpoon", "sm2", "ram", "mu90"], ability: "radar",
    // ein Landedeck am Heck = ein Hubschrauber
    heliType: "nh90", heliSpots: [{ x: -61.5, y: 0 }],
    length: 143, beam: 17.4, maxSpeed: 14.9, maxReverse: 0.3, accel: 1.1, decel: 1.6, turnRate: 0.14,
    gun: { x: 52, arc: 150 * DEG, speed: 1.4 },
    ram: { x: -40, arc: 150 * DEG, speed: 1.8 },
    vls: { x: 38, y: 0 },
    ssm: [
      { x: 2, y: -3.2, a: -0.55 }, { x: 0, y: -3.2, a: -0.55 }, { x: -2, y: -3.2, a: -0.55 }, { x: -4, y: -3.2, a: -0.55 },
      { x: 2, y: 3.2, a: 0.55 }, { x: 0, y: 3.2, a: 0.55 }, { x: -2, y: 3.2, a: 0.55 }, { x: -4, y: 3.2, a: 0.55 },
    ],
    hp: 320, sensor: 3200, sig: 1.0, sonar: 2600, rank: 7,
  },
  carrier: {
    typeId: 1, team: 0, kind: "ship", level: 2, price: 6000,
    label: "Hubschrauberträger Klasse Ähre", short: "Hubschrauberträger Ähre",
    weapons: ["ram"], ability: "radar", heliType: "nh90", carrier: true, drawScale: 1,
    length: 182, beam: 30, maxSpeed: 10.3, maxReverse: 0.25, accel: 0.7, decel: 1.0, turnRate: 0.085,
    ram: { x: -84, arc: 150 * DEG, speed: 1.6 },
    mags: { ram: 42 },
    hp: 400, sensor: 2800, sig: 1.3, rank: 5,
    heliSpots: [64, 38, 12, -14, -40, -66].map((x) => ({ x, y: -4 })),
  },
  nh90: {
    typeId: 5, team: 0, kind: "heli", level: 2, price: 0,
    label: "NH90 NFH", short: "NH90",
    weapons: ["mg", "marte"], ability: "flares",
    slots: { 1: ["marte", "stinger_aa", "rkt70", "mu90"] },
    length: 19.6, beam: 16.3, maxSpeed: 74, maxReverse: 0.35, accel: 16, decel: 22, turnRate: 1.45,
    hitRadius: 8, hp: 45, sensor: 1600, sig: 0.6, sonar: 2400, dipping: true,
    alt: { min: 15, max: 1500, cruise: 120, climb: 14 },
  },
  heron: {
    typeId: 6, team: 0, kind: "drone", level: 1, price: 0,
    label: "Aufklärungsdrohne Heron TP", short: "Heron TP",
    weapons: ["armiger"], ability: "radar",
    slots: { 0: ["armiger", "jammer"] },
    length: 14, beam: 26, maxSpeed: 62, minSpeed: 26, maxReverse: 0, accel: 10, decel: 10, turnRate: 0.55,
    hitRadius: 9, hp: 25, sensor: 3400, sig: 0.45,
    alt: { min: 150, max: 6000, cruise: 1800, climb: 12 },
  },
  // ---------------- Paprikistan ----------------
  cyclone: {
    typeId: 7, team: 1, kind: "ship", level: 1, price: 0,
    label: "Patrouillenboot Cyclone (PC-1)", short: "Patrouillenboot Cyclone",
    weapons: ["gun25", "griffin", "stinger"], ability: "radar",
    length: 54.6, beam: 7.9, maxSpeed: 18, maxReverse: 0.3, accel: 2.6, decel: 3.4, turnRate: 0.34,
    gun: { x: 14, arc: 150 * DEG, speed: 2.0 },
    ram: { x: -16, arc: 160 * DEG, speed: 2.2 },
    ssm: [
      { x: -2, y: -2.6, a: -0.2 }, { x: -3.2, y: -2.6, a: -0.2 }, { x: -4.4, y: -2.6, a: -0.2 },
      { x: -2, y: 2.6, a: 0.2 }, { x: -3.2, y: 2.6, a: 0.2 }, { x: -4.4, y: 2.6, a: 0.2 },
    ],
    hp: 95, sensor: 2100, sig: 0.75,
  },
  lcs: {
    typeId: 8, team: 1, kind: "ship", level: 2, price: 4000,
    label: "Littoral Combat Ship Independence", short: "LCS Independence",
    weapons: ["gun57", "nsm", "searam"], ability: "radar",
    heliType: "blackhawk", heliSpots: [{ x: -39, y: 0 }],
    length: 127, beam: 31.6, maxSpeed: 20.6, maxReverse: 0.3, accel: 1.6, decel: 2.2, turnRate: 0.15,
    gun: { x: 44, arc: 150 * DEG, speed: 1.8 },
    ram: { x: 12, arc: 150 * DEG, speed: 1.8 },
    ssm: [
      { x: 30, y: -5, a: -0.6 }, { x: 28, y: -5, a: -0.6 }, { x: 26, y: -5, a: -0.6 }, { x: 24, y: -5, a: -0.6 },
      { x: 30, y: 5, a: 0.6 }, { x: 28, y: 5, a: 0.6 }, { x: 26, y: 5, a: 0.6 }, { x: 24, y: 5, a: 0.6 },
    ],
    hp: 200, sensor: 2600, sig: 0.95, sonar: 1600, rank: 3,
  },
  burke: {
    typeId: 9, team: 1, kind: "ship", level: 3, price: 12000,
    label: "Zerstörer Arleigh Burke (DDG-51)", short: "Zerstörer Arleigh Burke",
    weapons: ["gun127", "harpoon", "sm2", "mk54"], ability: "radar",
    heliType: "blackhawk", heliSpots: [{ x: -69.5, y: 0 }],
    length: 155, beam: 20, maxSpeed: 15.4, maxReverse: 0.3, accel: 1.1, decel: 1.6, turnRate: 0.13,
    gun: { x: 58, arc: 150 * DEG, speed: 1.2 },
    vls: { x: 44, y: 0 },
    ssm: [
      { x: -38, y: -3.4, a: -0.6 }, { x: -40, y: -3.4, a: -0.6 }, { x: -42, y: -3.4, a: -0.6 }, { x: -44, y: -3.4, a: -0.6 },
      { x: -38, y: 3.4, a: 0.6 }, { x: -40, y: 3.4, a: 0.6 }, { x: -42, y: 3.4, a: 0.6 }, { x: -44, y: 3.4, a: 0.6 },
    ],
    mags: { sm2: 40 },
    hp: 340, sensor: 3200, sig: 1.0, sonar: 2800, rank: 7,
  },
  america: {
    typeId: 10, team: 1, kind: "ship", level: 2, price: 6000,
    label: "Amphibisches Angriffsschiff America (LHA-6)", short: "USS-Klasse America",
    weapons: ["searam"], ability: "radar", heliType: "blackhawk", carrier: true, drawScale: [1.4, 1.2],
    length: 257, beam: 36, maxSpeed: 11.3, maxReverse: 0.25, accel: 0.6, decel: 0.9, turnRate: 0.07,
    ram: { x: -118, arc: 150 * DEG, speed: 1.6 },
    mags: { searam: 22 },
    hp: 450, sensor: 2800, sig: 1.4, rank: 5,
    heliSpots: [64, 38, 12, -14, -40, -66].map((x) => ({ x: x * 1.4, y: -4.8 })),
  },
  blackhawk: {
    typeId: 2, team: 1, kind: "heli", level: 2, price: 0,
    label: "UH-60 Black Hawk", short: "Black Hawk",
    weapons: ["mg", "hellfire"], ability: "flares",
    slots: { 1: ["hellfire", "stinger_aa", "rkt70", "mk54"] },
    length: 19.8, beam: 16.4, maxSpeed: 72, maxReverse: 0.35, accel: 16, decel: 22, turnRate: 1.5,
    hitRadius: 8, hp: 40, sensor: 1600, sig: 0.6, sonar: 2400, dipping: true,
    alt: { min: 15, max: 1500, cruise: 120, climb: 14 },
  },
  reaper: {
    typeId: 11, team: 1, kind: "drone", level: 1, price: 0,
    label: "Aufklärungsdrohne MQ-9 Reaper", short: "MQ-9 Reaper",
    weapons: ["harm"], ability: "radar",
    slots: { 0: ["harm", "jammer", "hellfire"] },
    length: 11, beam: 20, maxSpeed: 68, minSpeed: 28, maxReverse: 0, accel: 11, decel: 11, turnRate: 0.6,
    hitRadius: 8, hp: 25, sensor: 3300, sig: 0.45,
    alt: { min: 150, max: 6000, cruise: 1800, climb: 12 },
  },

  // ---------------- Kampfflugzeuge ----------------
  // Landjäger starten von der Bahn, Senkrechtstarter (vtol) auch vom Trägerdeck.
  eurofighter: {
    typeId: 12, team: 0, kind: "jet", level: 3, price: 12000, rank: 9,
    label: "Eurofighter Typhoon", short: "Eurofighter",
    weapons: ["gun27", "iris_t", "meteor"], ability: "flares",
    slots: { 2: ["meteor", "taurus", "gbu12"] },
    length: 15.96, beam: 10.95, maxSpeed: 230, abSpeed: 310, minSpeed: 75, landSpeed: 95, maxReverse: 0,
    accel: 24, decel: 18, turnRate: 0.62,
    hitRadius: 9, hp: 60, sensor: 5500, sig: 0.9, fuel: 240,
    alt: { min: 40, max: 12000, cruise: 2500, climb: 70 },
  },
  harrier: {
    typeId: 13, team: 0, kind: "jet", level: 2, price: 8000, rank: 6, vtol: true,
    label: "AV-8B Harrier II", short: "Harrier II",
    weapons: ["gau12", "aim9x", "gbu12"], ability: "flares",
    slots: { 2: ["gbu12", "aim120", "marte"] },
    length: 14.12, beam: 9.25, maxSpeed: 190, minSpeed: 0, landSpeed: 95, maxReverse: 0,
    accel: 18, decel: 16, turnRate: 0.6,
    hitRadius: 8, hp: 50, sensor: 3800, sig: 0.8, fuel: 200,
    alt: { min: 15, max: 10000, cruise: 1500, climb: 55 },
  },
  f16: {
    typeId: 14, team: 1, kind: "jet", level: 2, price: 8000, rank: 6,
    label: "F-16C Fighting Falcon", short: "F-16C",
    weapons: ["m61", "aim9x", "aim120"], ability: "flares",
    slots: { 2: ["aim120", "harm", "gbu12"] },
    length: 15.06, beam: 9.96, maxSpeed: 225, abSpeed: 300, minSpeed: 72, landSpeed: 95, maxReverse: 0,
    accel: 24, decel: 18, turnRate: 0.66,
    hitRadius: 8, hp: 55, sensor: 5000, sig: 0.85, fuel: 220,
    alt: { min: 40, max: 12000, cruise: 2500, climb: 75 },
  },
  f35: {
    typeId: 15, team: 1, kind: "jet", level: 3, price: 12000, rank: 9, vtol: true,
    label: "F-35B Lightning II", short: "F-35B",
    weapons: ["gau22", "aim120", "gbu12"], ability: "flares",
    slots: { 2: ["gbu12", "jsm"] },
    length: 15.6, beam: 10.7, maxSpeed: 210, abSpeed: 280, minSpeed: 0, landSpeed: 95, maxReverse: 0,
    accel: 20, decel: 16, turnRate: 0.58,
    hitRadius: 9, hp: 60, sensor: 6000, sig: 0.3, fuel: 230, // Tarnkappe: Waffen im Rumpfschacht
    alt: { min: 15, max: 12000, cruise: 2500, climb: 65 },
  },
  // ---------------- U-Boote ----------------
  // depth: tiefste Tauchtiefe (negativ), Sehrohrtiefe = −15 m. noise: Eigengeräusch für gegnerisches Sonar.
  u212: {
    typeId: 16, team: 0, kind: "sub", level: 2, price: 7000, rank: 5,
    label: "U-Boot Klasse 212A", short: "U 212A",
    weapons: ["dm2a4", "idas"], ability: "decoy",
    length: 56, beam: 7, maxSpeed: 10.3, maxReverse: 0.25, accel: 0.9, decel: 1.3, turnRate: 0.2,
    hp: 140, sensor: 2400, sonar: 4200, sig: 0.55, noise: 0.5,
    depth: { min: -300, cruise: -15, rate: 5 },
  },
  virginia: {
    typeId: 17, team: 1, kind: "sub", level: 3, price: 9000, rank: 6,
    label: "U-Boot Virginia-Klasse (SSN-774)", short: "Virginia",
    weapons: ["mk48", "harpoon"], ability: "decoy",
    length: 115, beam: 10.4, maxSpeed: 12.9, maxReverse: 0.25, accel: 0.8, decel: 1.2, turnRate: 0.15,
    ssm: [{ x: 34, y: -1.4, a: 0 }, { x: 34, y: 1.4, a: 0 }, { x: 31, y: -1.4, a: 0 }, { x: 31, y: 1.4, a: 0 }],
    hp: 220, sensor: 2600, sonar: 4800, sig: 0.7, noise: 0.6,
    depth: { min: -400, cruise: -15, rate: 5 },
  },
};
export const TYPE_BY_ID = [];
for (const [k, d] of Object.entries(BOATS)) TYPE_BY_ID[d.typeId] = k;
export const START_SHIP = ["gepard", "cyclone"];
export const DRONE_OF = ["heron", "reaper"];
export const isAir = (def) => def.kind === "heli" || def.kind === "drone" || def.kind === "jet";
export const isSub = (def) => def.kind === "sub";
// Kaufbare Fahrzeuge (Laden): Schiffe, U-Boote, Kampfflugzeuge
export const isBuyable = (def) => def.kind === "ship" || def.kind === "sub" || def.kind === "jet";
// Tiefenstufen der U-Boote
export const DEPTH = { surface: -5, periscope: -25 };
// Hangar: Optionen für einen Waffenplatz eines Luftfahrzeugs
export function slotOptions(def, i) {
  return (def.slots && def.slots[i]) || null;
}

// Geld (Taler)
export const ECONOMY = {
  // Abschussprämie nach Stufe/Art des Opfers
  bounty(def) {
    if (def.kind === "drone") return 400;
    if (def.kind === "heli") return 600;
    if (def.kind === "jet") return 900 + def.level * 300;
    if (def.carrier) return 3000;
    return [0, 1000, 1800, 3000][def.level] || 1000;
  },
  assistShare: 0.4,
  assistWindow: 30,
  perDamage: 5,
  rescue: 150, // je geborgenem Schiffbrüchigen
  capture: 600, // Stützpunkt erobert (je beteiligtem Fahrzeug)
  neutralize: 200,
};

// Waffen. kind: gun (Rohrwaffe), ssm (Seezielflugkörper), sam (Flugabwehr), mg, agm (Luft-Boden).
export const WEAPONS = {
  gun76: { ceiling: 3000, kind: "gun", label: "76 mm OTO Melara", auto: true, reload: 0.6, speed: 320, range: 2200, damage: 6, spread: 0.012 },
  gun25: { ceiling: 1500, kind: "gun", label: "25 mm Mk 38", auto: true, reload: 0.15, speed: 460, range: 1300, damage: 1.6, spread: 0.02 },
  gun57: { ceiling: 2600, kind: "gun", label: "57 mm Mk 110", auto: true, reload: 0.35, speed: 380, range: 2000, damage: 4, spread: 0.015 },
  gun127: { ceiling: 4000, kind: "gun", label: "127 mm Mk 45", auto: true, reload: 1.3, speed: 300, range: 3000, damage: 13, spread: 0.01 },
  exocet: { kind: "ssm", label: "MM38 Exocet", reload: 15, interval: 0.6, speed: 140, turn: 1.0, range: 4200, damage: 40, seekerRange: 1200, seekerCone: 0.6 },
  rbs15: { kind: "ssm", label: "RBS 15 Mk3", reload: 16, interval: 0.6, speed: 150, turn: 1.0, range: 5000, damage: 45, seekerRange: 1300, seekerCone: 0.6 },
  harpoon: { kind: "ssm", label: "RGM-84 Harpoon", reload: 18, interval: 0.5, speed: 145, turn: 1.0, range: 5000, damage: 45, seekerRange: 1300, seekerCone: 0.6 },
  nsm: { kind: "ssm", label: "Naval Strike Missile", reload: 16, interval: 0.5, speed: 150, turn: 1.4, range: 4800, damage: 42, seekerRange: 1400, seekerCone: 0.7 },
  griffin: { kind: "ssm", label: "Griffin", reload: 8, interval: 0.35, speed: 170, turn: 2.0, range: 2600, damage: 16, seekerRange: 900, seekerCone: 0.6 },
  ram: { ceiling: 3000, kind: "sam", label: "RAM Luftabwehr", magazine: 21, reload: 4, interval: 0.35, speed: 230, turn: 3.2, range: 1800, damage: 6, seekerRange: 1500, pk: 0.7 },
  searam: { ceiling: 3000, kind: "sam", label: "SeaRAM", magazine: 11, reload: 3.5, interval: 0.35, speed: 230, turn: 3.2, range: 1800, damage: 6, seekerRange: 1500, pk: 0.7 },
  stinger: { ceiling: 3500, kind: "sam", label: "Stinger", magazine: 8, reload: 5, interval: 0.5, speed: 260, turn: 3.6, range: 1100, damage: 3, seekerRange: 1000, pk: 0.6 },
  sm2: { ceiling: 15000, kind: "sam", label: "SM-2 Standard", magazine: 32, reload: 6, interval: 0.6, speed: 300, turn: 2.2, range: 8000, damage: 8, seekerRange: 3000, pk: 0.75 },
  mg: { ceiling: 1000, kind: "mg", label: "Türschützen-MG", auto: true, reload: 0.09, speed: 520, range: 800, damage: 0.6, heliDamage: 1.2, spread: 0.035 },
  hellfire: {
    kind: "agm", label: "AGM-114 Hellfire", count: 8, reload: 6, interval: 0.4, speed: 210, turn: 2.4, range: 3000, damage: 14,
    seekerRange: 900, seekerCone: 0.55, rails: [{ x: -1.2, y: -3.4 }, { x: -1.2, y: 3.4 }],
  },
  marte: {
    kind: "agm", label: "Marte ER", count: 4, reload: 9, interval: 0.6, speed: 190, turn: 1.6, range: 4500, damage: 24,
    seekerRange: 1300, seekerCone: 0.6, rails: [{ x: -0.5, y: -2.4 }, { x: -0.5, y: 2.4 }],
  },
  // Anti-Radar-Flugkörper: jagen nur Schiffe mit eingeschaltetem Radar.
  // Schaltet das Ziel sein Radar ab, fliegt die ARM nur noch zur letzten bekannten Position.
  armiger: {
    kind: "arm", label: "ARMIGER", count: 2, reload: 20, interval: 1, speed: 260, turn: 1.8, range: 6500, damage: 30,
    seekerRange: 6500, seekerCone: 0.9, rails: [{ x: 0, y: -5 }, { x: 0, y: 5 }],
  },
  harm: {
    kind: "arm", label: "AGM-88 HARM", count: 2, reload: 20, interval: 1, speed: 260, turn: 1.8, range: 6500, damage: 30,
    seekerRange: 6500, seekerCone: 0.9, rails: [{ x: 0, y: -4.5 }, { x: 0, y: 4.5 }],
  },
  // Hangar-Bewaffnung für Hubschrauber
  stinger_aa: {
    ceiling: 3500, kind: "sam", label: "Stinger (Luft-Luft)", magazine: 4, reload: 10, interval: 0.6, speed: 260, turn: 3.6, range: 1300, damage: 3,
    seekerRange: 1100, pk: 0.65, rails: [{ x: -0.5, y: -2.6 }, { x: -0.5, y: 2.6 }],
  },
  rkt70: {
    kind: "rkt", label: "70-mm-Raketen", magazine: 14, reload: 1.4, interval: 0.12, speed: 270, range: 1600, damage: 3.5, spread: 0.03,
    rails: [{ x: 0, y: -2.6 }, { x: 0, y: 2.6 }],
  },
  // Radarstörpod für Drohnen: stört gegnerische Sensoren, Locks und Lenkwaffen in der Nähe – sendet dabei selbst
  jammer: { kind: "jam", label: "Radarstörpod", duration: 8, reload: 20, radius: 2600, lockRadius: 1400, sensorFactor: 0.45, breakChance: 0.05 },
  // Bordkanonen der Kampfflugzeuge: feuern starr in Flugrichtung
  gun27: { kind: "jgun", label: "27 mm Mauser BK-27", auto: true, reload: 0.07, speed: 950, range: 1500, damage: 1, airDamage: 3, spread: 0.01, ceiling: 200 },
  m61: { kind: "jgun", label: "20 mm M61 Vulcan", auto: true, reload: 0.05, speed: 950, range: 1400, damage: 0.8, airDamage: 2.4, spread: 0.012, ceiling: 200 },
  gau12: { kind: "jgun", label: "25 mm GAU-12 (Behälter)", auto: true, reload: 0.06, speed: 900, range: 1400, damage: 1.1, airDamage: 2.6, spread: 0.014, ceiling: 200 },
  gau22: { kind: "jgun", label: "25 mm GAU-22/A", auto: true, reload: 0.06, speed: 900, range: 1400, damage: 1.1, airDamage: 2.6, spread: 0.012, ceiling: 200 },
  // Luft-Luft-Flugkörper. ir = Infrarot (Täuschkörper wirken stark), sonst Radar (braucht Lock für große Reichweite)
  iris_t: {
    kind: "aam", ir: true, label: "IRIS-T", count: 2, reload: 40, interval: 0.6, speed: 650, turn: 3.0, range: 2600, damage: 30,
    seekerRange: 2200, seekerCone: 0.9, rails: [{ x: -4.9, y: -5.6 }, { x: -4.9, y: 5.6 }],
  },
  aim9x: {
    kind: "aam", ir: true, label: "AIM-9X Sidewinder", count: 2, reload: 40, interval: 0.6, speed: 640, turn: 3.0, range: 2500, damage: 30,
    seekerRange: 2100, seekerCone: 0.9, rails: [{ x: -2.4, y: -4.9 }, { x: -2.4, y: 4.9 }],
  },
  meteor: {
    kind: "aam", label: "Meteor", count: 2, reload: 50, interval: 0.8, speed: 720, turn: 2.0, range: 6500, damage: 40,
    seekerRange: 2600, seekerCone: 0.7, rails: [{ x: -2.3, y: -3.2 }, { x: -2.3, y: 3.2 }],
  },
  aim120: {
    kind: "aam", label: "AIM-120 AMRAAM", count: 2, reload: 50, interval: 0.8, speed: 680, turn: 2.1, range: 5500, damage: 40,
    seekerRange: 2400, seekerCone: 0.7, rails: [{ x: -1.8, y: -3.2 }, { x: -1.8, y: 3.2 }],
  },
  // Luft-Boden: Marschflugkörper und Lenkbomben
  taurus: {
    kind: "agm", label: "Taurus KEPD 350", count: 2, reload: 60, interval: 1, speed: 250, turn: 1.0, range: 7500, damage: 45,
    seekerRange: 1500, seekerCone: 0.6, rails: [{ x: -2.6, y: -3.2 }, { x: -2.6, y: 3.2 }],
  },
  jsm: {
    kind: "agm", label: "Joint Strike Missile", count: 2, reload: 60, interval: 1, speed: 260, turn: 1.2, range: 6500, damage: 42,
    seekerRange: 1500, seekerCone: 0.7, rails: [{ x: -1.5, y: -0.8 }, { x: -1.5, y: 0.8 }],
  },
  gbu12: {
    kind: "bomb", label: "GBU-12 Paveway II", count: 2, reload: 50, interval: 0.6, speed: 0, turn: 0.5, range: 9000, damage: 50,
    radius: 30, rails: [{ x: -1.9, y: -3.2 }, { x: -1.9, y: 3.2 }],
  },
  // Torpedos: schwer (U-Boote) und leicht (Fregatten, Bordhubschrauber). Treffen Schiffe und getauchte U-Boote.
  dm2a4: { kind: "torp", label: "DM2A4 Seehecht", count: 4, reload: 25, interval: 2, speed: 30, turn: 0.45, range: 6500, damage: 60, seekerRange: 1100, seekerCone: 0.7 },
  mk48: { kind: "torp", label: "Mk 48 ADCAP", count: 4, reload: 25, interval: 2, speed: 31, turn: 0.42, range: 7000, damage: 70, seekerRange: 1100, seekerCone: 0.7 },
  mu90: { kind: "torp", label: "MU90 Leichttorpedo", count: 2, reload: 35, interval: 1.5, speed: 27, turn: 0.6, range: 3500, damage: 35, seekerRange: 850, seekerCone: 0.8 },
  mk54: { kind: "torp", label: "Mk 54 Leichttorpedo", count: 2, reload: 35, interval: 1.5, speed: 27, turn: 0.6, range: 3500, damage: 35, seekerRange: 850, seekerCone: 0.8 },
  // Flugabwehr aus dem getauchten U-Boot (nur auf Sehrohrtiefe): jagt nur Luftfahrzeuge
  idas: {
    ceiling: 2500, kind: "sam", airOnly: true, label: "IDAS", magazine: 4, reload: 30, interval: 1, speed: 240, turn: 3, range: 2200, damage: 6,
    seekerRange: 1800, pk: 0.7, rails: [{ x: 8, y: 0 }],
  },
  lock: {
    range: 3000, // Lock-Reichweite (Ziel muss vom Team erfasst sein)
    breakRange: 5500,
    time: 1.2,
    pick: 140,
  },
};
// Alte Namen (Kompatibilität)
WEAPONS.gun = WEAPONS.gun76;

// Fähigkeiten (Taste E)
export const ABILITIES = {
  radar: {
    label: "Radar-Rundumsuche",
    duration: 10,
    cooldown: 30,
    lockRange: 5000,
    pick: 380,
    viewRange: 5200,
  },
  flares: {
    label: "Täuschkörper",
    duration: 3,
    cooldown: 18,
  },
  decoy: {
    label: "Torpedotäuschkörper",
    duration: 6,
    cooldown: 30,
    breakChance: 0.7,
  },
};

export const PROJ = { SHELL: 1, EXOCET: 2, RAM: 3, BULLET: 4, HELLFIRE: 5, ARM: 6, ROCKET: 7, AAM: 8, BOMB: 9, TORP: 10 };
export const PROJ_OF_KIND = { gun: 1, ssm: 2, sam: 3, mg: 4, agm: 5, arm: 6, rkt: 7, jgun: 4, aam: 8, bomb: 9, torp: 10 };
// Flugkörper, die von Flugabwehr (sam) abgefangen werden können
export const INTERCEPTABLE = new Set([2, 5, 6]);

// ---------- Sensoren ----------
// ---------- Höhe ----------
export const ALTITUDE = {
  lowFly: 60, // darunter: „unter dem Radar“
  lowSig: 0.35, // Signatur im Tiefflug gegenüber Radar (Sicht bleibt)
  landHeli: 30, // Hubschrauber landen/retten nur darunter
  landDrone: 250, // Drohnen setzen nur unterhalb dieser Höhe auf
  captureHeli: 300,
  seaSkim: 5, // Flughöhe der Seezielflugkörper
  hitShip: 40, // Flugkörper treffen Schiffe nur unterhalb dieser Höhe
  shipZ: 8, // Abschusshöhe auf Schiffen
};

export const SENSORS = {
  radarOffFactor: 0.4, // eigene Reichweite bei ausgeschaltetem Radar (nur Sicht)
  radarOffSig: 0.6, // eigene Signatur bei ausgeschaltetem Radar
  emitterBonus: 1.25, // eingeschaltetes Radar wird weiter entdeckt (ESM)
  radarAbility: 5000, // Reichweite während der Radar-Rundumsuche
  base: 2600, // Abdeckung der Marinebasis
  outpost: 2300, // Abdeckung eines gehaltenen Stützpunkts
  ghost: 12, // s: zuletzt gesehene Kontakte
};

// Wetterfaktoren: vis = Sicht, radar, sonar, sea = Fahrtminderung durch Seegang (1 = keine)
const ENV_NEUTRAL = { vis: 1, radar: 1, sonar: 1, sea: 1, rain: 0, fog: 0, cloud: 0, night: 0 };

// Erfassungsreichweite (Radar/Sicht) einer Einheit. Luftfahrzeuge: weiter, je höher sie fliegen (Radarhorizont).
// U-Boote sehen nur aufgetaucht oder auf Sehrohrtiefe etwas (sonst nur Sonar).
export function sensorRange(def, radarOn, abilityRadar, z = 0, env = ENV_NEUTRAL) {
  let r = def.sensor;
  if (def.kind === "sub") {
    if (z < DEPTH.periscope) return 0;
    return r * (z < DEPTH.surface ? 0.8 : 1) * env.vis;
  }
  if (def.alt) r *= 0.55 + 0.45 * Math.min(1, Math.sqrt(Math.max(0, z) / (def.alt.max * 0.5)));
  if (abilityRadar) return Math.max(SENSORS.radarAbility * env.radar, r);
  if (def.kind === "ship") return radarOn ? r * env.radar : r * SENSORS.radarOffFactor * env.vis;
  if (def.kind === "jet") return r * env.radar;
  return r * (0.6 * env.radar + 0.4 * env.vis);
}
// Sonarreichweite: Rumpfsonar (Schiffe), Passivsonar (U-Boote), Tauchsonar (Hubschrauber nur im Schwebeflug tief)
export function sonarRange(def, b, env = ENV_NEUTRAL) {
  if (!def.sonar) return 0;
  if (def.dipping) return (b.z || 0) <= ALTITUDE.lowFly && Math.abs(b.v) < 10 ? def.sonar * env.sonar : 0;
  const flow = 1 - 0.5 * Math.min(1, Math.abs(b.v) / def.maxSpeed); // Strömungsgeräusch bei hoher Fahrt
  return def.sonar * flow * env.sonar;
}
// Wie laut ist ein Fahrzeug unter Wasser? (Schiffe laut, U-Boote leise, schnell = lauter)
export function noiseLevel(def, b) {
  const v = Math.min(1, Math.abs(b.v) / def.maxSpeed);
  if (def.kind === "sub") return def.noise * (0.3 + 1.1 * v) * ((b.z || 0) > DEPTH.surface ? 2 : 1);
  return (def.noise || 1.1) * (0.5 + 0.5 * v);
}
export function signature(def, radarOn, z = 0) {
  if (def.kind === "sub") return def.sig * (z < DEPTH.surface ? 0.3 : 1); // Sehrohr/Mast
  if (def.kind !== "ship") return def.sig * (z < ALTITUDE.lowFly ? ALTITUDE.lowSig : 1);
  return def.sig * (radarOn ? SENSORS.emitterBonus : SENSORS.radarOffSig);
}

// ---------- Tageszeit und Wetter ----------
// 1 Spielstunde = 1 Minute (ein Tag = 24 Minuten), Wetter wechselt alle 8 Minuten mit 1 Minute Übergang.
export const WEATHER = [
  { key: "klar", label: "Klar", vis: 1, radar: 1, sonar: 1, sea: 1, rain: 0, fog: 0, cloud: 0.1, weight: 35 },
  { key: "wolkig", label: "Bewölkt", vis: 0.9, radar: 1, sonar: 1, sea: 1, rain: 0, fog: 0, cloud: 0.6, weight: 25 },
  { key: "regen", label: "Regen", vis: 0.7, radar: 0.85, sonar: 0.9, sea: 0.95, rain: 0.55, fog: 0.15, cloud: 0.85, weight: 18 },
  { key: "nebel", label: "Nebel", vis: 0.45, radar: 0.95, sonar: 1, sea: 1, rain: 0, fog: 0.8, cloud: 0.4, weight: 12 },
  { key: "sturm", label: "Sturm", vis: 0.6, radar: 0.75, sonar: 0.7, sea: 0.8, rain: 1, fog: 0.25, cloud: 1, weight: 10 },
];
export const WEATHER_SLOT = 8 * 60000;
const WEATHER_FADE = 60000;
function weatherOfSlot(slot) {
  const r = mulberry32(slot * 7919 + 13)();
  const total = WEATHER.reduce((a, w) => a + w.weight, 0);
  let acc = 0;
  for (let i = 0; i < WEATHER.length; i++) {
    acc += WEATHER[i].weight / total;
    if (r < acc) return i;
  }
  return 0;
}
// Zustand zur Zeit now: h = Stunde (0–24), w = Wetter, p = vorheriges Wetter, k = Übergang 0..1
export function envAt(now) {
  const h = (now / 60000) % 24;
  const slot = Math.floor(now / WEATHER_SLOT);
  const k = Math.min(1, (now - slot * WEATHER_SLOT) / WEATHER_FADE);
  return { h, w: weatherOfSlot(slot), p: weatherOfSlot(slot - 1), k };
}
// Tageslicht 0 (Nacht) … 1 (Tag): Dämmerung 5–7 Uhr und 19–21 Uhr
export function dayLight(h) {
  if (h >= 7 && h <= 19) return 1;
  if (h <= 5 || h >= 21) return 0;
  const t = h < 12 ? (h - 5) / 2 : (21 - h) / 2;
  return t * t * (3 - 2 * t);
}
export function envFactors(env) {
  if (!env) return ENV_NEUTRAL;
  const a = WEATHER[env.p];
  const b = WEATHER[env.w];
  const mix = (key) => a[key] + (b[key] - a[key]) * env.k;
  const night = 1 - dayLight(env.h);
  return {
    vis: mix("vis") * (1 - 0.45 * night),
    radar: mix("radar"),
    sonar: mix("sonar"),
    sea: mix("sea"),
    rain: mix("rain"),
    fog: mix("fog"),
    cloud: mix("cloud"),
    night,
  };
}

// ---------- Dienstgrade (Erfahrungspunkte) ----------
export const RANKS = [
  { name: "Matrose", short: "Mt", xp: 0 },
  { name: "Gefreiter", short: "Gefr", xp: 100 },
  { name: "Obergefreiter", short: "OGefr", xp: 300 },
  { name: "Maat", short: "Maat", xp: 700 },
  { name: "Obermaat", short: "OMt", xp: 1300 },
  { name: "Bootsmann", short: "Btsm", xp: 2200 },
  { name: "Oberbootsmann", short: "OBtsm", xp: 3500 },
  { name: "Leutnant zur See", short: "Lt", xp: 5500 },
  { name: "Oberleutnant zur See", short: "OLt", xp: 8000 },
  { name: "Kapitänleutnant", short: "KptLt", xp: 11500 },
  { name: "Korvettenkapitän", short: "KKpt", xp: 16000 },
  { name: "Fregattenkapitän", short: "FKpt", xp: 22000 },
  { name: "Kapitän zur See", short: "KzS", xp: 30000 },
  { name: "Flottillenadmiral", short: "FltlAdm", xp: 40000 },
  { name: "Konteradmiral", short: "KAdm", xp: 55000 },
  { name: "Vizeadmiral", short: "VAdm", xp: 75000 },
  { name: "Admiral", short: "Adm", xp: 100000 },
];
export function rankOf(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if ((xp || 0) >= RANKS[i].xp) r = i;
  return r;
}
export const XP_PER_TALER = 0.1; // Erfahrung = ein Zehntel der verdienten Taler (nur aus dem Gefecht)

// ---------- Saisons der Frontkarte ----------
// Jede Saison dauert eine Woche (Montag 0 Uhr UTC). Das Team mit mehr Stützpunkten am Ende gewinnt.
export const SEASON = {
  epoch: Date.UTC(2026, 10, 23), // Montag, 23.11.2026
  length: 7 * 24 * 3600 * 1000,
  medalBonus: 5000, // Taler für Sieger mit Beitrag
  minPoints: 20, // nötiger Beitrag (Erfahrung in dieser Saison für das Siegerteam)
};
export function seasonOf(now) {
  return Math.max(1, Math.floor((now - SEASON.epoch) / SEASON.length) + 1);
}
export function seasonEnd(id) {
  return SEASON.epoch + id * SEASON.length;
}

// ---------- Frontkarte: Stützpunkte ----------
export const OUTPOST_NAMES = ["Sturmfels", "Goldsand", "Kolbenriff", "Schotenbank", "Leuchtturm Nord", "Ährenkap", "Paprikaklippe", "Nebelsund", "Silberbucht", "Rotkopf"];
export const FRONT = {
  // Am Stützpunkt dürfen nur kleine Schiffe starten (Stufe 1–2, keine Träger)
  maxSpawnLevel: 2,
  rate: 1.25, // Fortschritt je halbe Sekunde und Fahrzeug (höchstens 3 zählen), Ziel ±100
  zoneExtra: 320, // Zonenradius = Inselradius + zoneExtra
};

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

// Kontinente links (Maiskolbistan) und rechts (Paprikistan): Die Küste liegt CONTINENT.depth vom Kartenrand.
// Die Marinebasis sitzt an einem geraden Küstenabschnitt (|y| < straight), sonst ist die Küste zerklüftet.
export const CONTINENT = { depth: 1500, straight: 1500, ramp: 500 };

export function teamBase(team) {
  const half = WORLD_SIZE / 2;
  const edge = half - CONTINENT.depth;
  return team === 0 ? { team, edge: -edge, dir: 1 } : { team, edge, dir: -1 };
}

// Küstenverlauf: Abstand der Küste vom Basis-Nullpunkt (lokal), abhängig von y
const COAST_WAVES = [
  [
    [230, 1 / 1100, 0.4],
    [120, 1 / 470, 2.1],
    [55, 1 / 190, 4.0],
  ],
  [
    [240, 1 / 1000, 1.7],
    [110, 1 / 520, 5.2],
    [60, 1 / 170, 0.9],
  ],
];
export function coastLocal(team, y) {
  const ay = Math.abs(y);
  if (ay < CONTINENT.straight) return BASE_LAYOUT.landDepth;
  const k = Math.min(1, (ay - CONTINENT.straight) / CONTINENT.ramp);
  let n = 0;
  for (const [a, f, p] of COAST_WAVES[team]) n += a * Math.sin(y * f + p);
  // Buchten und Landzungen, im Mittel etwas weiter draußen als die Basis
  return BASE_LAYOUT.landDepth + k * (120 + n);
}
export function coastX(team, y) {
  const b = teamBase(team);
  return b.edge + b.dir * coastLocal(team, y);
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

// ---------- Flugfeld (hinter der Marinebasis im Landesinneren) ----------
// Lokale Koordinaten wie die Basis (x = vom Basis-Nullpunkt Richtung See, negativ = landeinwärts).
export const AIRFIELD = {
  area: [-800, -150, -1200, 1200], // Gelände (sicher für das eigene Team)
  runway: { x: -500, y0: -950, y1: 950, w: 46 },
  helipads: [-700, -560, -420].map((y) => ({ x: -260, y })),
  apron: [520, 640, 760, 880].map((y) => ({ x: -300, y })),
  hangars: [-180, 40, 260].map((y) => ({ x: -300, y, w: 90, h: 150 })),
  tower: { x: -330, y: -330 },
};

function afWorld(team, lx, ly) {
  const b = teamBase(team);
  return { x: b.edge + b.dir * lx, y: ly };
}
export function airfieldRect(team) {
  return localRect(teamBase(team), AIRFIELD.area);
}
export function runwayRect(team) {
  const r = AIRFIELD.runway;
  return localRect(teamBase(team), [r.x - r.w, r.x + r.w, r.y0 - 60, r.y1 + 60]);
}
// Drohnen starten am Südende der Bahn Richtung Norden
export function runwayStart(team) {
  const r = AIRFIELD.runway;
  const p = afWorld(team, r.x, r.y1 - 40);
  return { ...p, h: -Math.PI / 2 };
}
export function helipadSpawn(team, i) {
  const pad = AIRFIELD.helipads[i % AIRFIELD.helipads.length];
  const p = afWorld(team, pad.x, pad.y);
  return { ...p, h: teamBase(team).dir === 1 ? 0 : Math.PI };
}
export function apronSpot(team, i) {
  const a = AIRFIELD.apron[i % AIRFIELD.apron.length];
  const p = afWorld(team, a.x, a.y);
  return { ...p, h: teamBase(team).dir === 1 ? Math.PI : 0 };
}

// Kurs vom Liegeplatz zur Hafeneinfahrt (lokal x = 740, y = 0)
function harborHeading(base, lx, ly) {
  return Math.atan2(-ly, (740 - lx) * base.dir);
}

export function baseSpawn(team, i, def) {
  const base = teamBase(team);
  const big = def && def.length > 100;
  const slots = BASE_LAYOUT.spawns.filter((s) => !big || s.x >= 500);
  const s = slots[i % slots.length];
  return { x: base.edge + base.dir * s.x, y: s.y, h: harborHeading(base, s.x, s.y) };
}

export function carrierSpawn(team) {
  const base = teamBase(team);
  const s = BASE_LAYOUT.carrierSpawn;
  return { x: base.edge + base.dir * s.x, y: s.y, h: base.dir === 1 ? 0 : Math.PI };
}

// Drohnen starten auf der Startbahn des eigenen Flugfelds
export function droneSpawn(team) {
  return runwayStart(team);
}

// Landepunkt i eines Trägers in Weltkoordinaten
export function heliSpotWorld(b, i, def = BOATS.carrier) {
  const sp = def.heliSpots[i];
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  return { x: b.x + sp.x * c - sp.y * s, y: b.y + sp.x * s + sp.y * c, h: b.h };
}

// Startpunkt im Wasser vor einem Stützpunkt, zur eigenen Basis hin
export function outpostSpawn(map, o, team, def) {
  const base = teamBase(team);
  const toward = Math.atan2(0 - o.y, base.edge - o.x);
  for (let k = 0; k < 16; k++) {
    const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
    const d = o.isl.r * 1.45 + 120 + (def ? def.length / 2 : 30);
    const x = o.x + Math.cos(a) * d;
    const y = o.y + Math.sin(a) * d;
    const h = a + Math.PI / 2;
    const b = { x, y, h, v: 0, w: 0 };
    if (!def || !hullHitsLand(map, b, def)) return { x, y, h };
  }
  return null;
}

export function generateMap(seed = MAP_SEED) {
  const rnd = mulberry32(seed);
  const islands = [];
  const half = WORLD_SIZE / 2;
  let tries = 0;
  const seaHalf = half - CONTINENT.depth - BASE_LAYOUT.landDepth;
  while (islands.length < 48 && tries < 4000) {
    tries++;
    const r = 70 + Math.pow(rnd(), 1.8) * 420;
    const x = (rnd() * 2 - 1) * (seaHalf - r - 250);
    const y = (rnd() * 2 - 1) * (half - r - 250);
    // Mitte frei halten und Abstand zwischen Inseln für Fahrrinnen; vor den Küsten und Basen frei lassen
    if (Math.hypot(x, y) < 500 + r) continue;
    if (Math.abs(x) + r * 1.5 > seaHalf - 900) continue;
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
  // Stützpunkte: 7 Inseln, möglichst gleichmäßig über die Karte verteilt (größere bevorzugt)
  const outposts = [];
  const cand = islands.filter((i) => i.r >= 120).sort((a, b) => b.r - a.r);
  for (const isl of cand) {
    if (outposts.length >= OUTPOST_NAMES.length) break;
    if (outposts.some((o) => Math.hypot(o.x - isl.x, o.y - isl.y) < 1450)) continue;
    outposts.push({ isl, x: isl.x, y: isl.y, r: isl.r + FRONT.zoneExtra });
  }
  outposts.sort((a, b) => a.x - b.x || a.y - b.y);
  outposts.forEach((o, i) => {
    o.id = i;
    o.name = OUTPOST_NAMES[i];
  });
  return { size: WORLD_SIZE, islands, rects, outposts };
}

export function isOnLand(map, x, y, margin = 0) {
  // Kontinente
  if (x < coastX(0, y) + margin || x > coastX(1, y) - margin) return true;
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

// Hubschrauber: schwebt, dreht auch im Stand, ignoriert Land. Drohnen und Jets: Mindestgeschwindigkeit.
// Jets: Nachbrenner (input.ab, nur bei Vollschub), ohne Treibstoff (b.fuel ≤ 0) Gleitflug bis zum Absturz.
export function stepHeli(b, input, def) {
  const th = clamp(+input.th || 0, -def.maxReverse, 1);
  const ru = clamp(+input.ru || 0, -1, 1);
  const noFuel = def.fuel && b.fuel !== undefined && b.fuel <= 0;
  // Drohnen fliegen wie Flugzeuge: nie langsamer als minSpeed
  let target = def.minSpeed ? def.minSpeed + Math.max(0, th) * (def.maxSpeed - def.minSpeed) : th * def.maxSpeed;
  if (def.kind === "jet") {
    target = def.minSpeed + Math.max(0, th) * (def.maxSpeed - def.minSpeed);
    if (input.ab && def.abSpeed && th > 0.9) target = def.abSpeed;
    if (noFuel) target = Math.max(def.vtol ? 0 : 60, b.v - 6);
  }
  const dv = target - b.v;
  const a = Math.abs(target) > Math.abs(b.v) ? def.accel : def.decel;
  b.v += clamp(dv, -a * DT, a * DT);
  b.w += (ru * def.turnRate - b.w) * Math.min(1, DT * 5);
  // Höhe: Q/C verschieben die Sollhöhe, die Ist-Höhe folgt mit der Steigrate
  if (def.alt) {
    const A = def.alt;
    if (b.zt === undefined) b.zt = A.cruise;
    if (b.z === undefined) b.z = A.cruise;
    b.zt = clamp(b.zt + clamp(+input.up || 0, -1, 1) * A.climb * 1.6 * DT, A.min, A.max);
    if (noFuel) b.zt = 0; // Triebwerk aus: sinkt bis aufs Wasser
    b.z += clamp(b.zt - b.z, -A.climb * DT, A.climb * DT);
  }
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

// env: { sea } Fahrtminderung durch Seegang (kleine Boote leiden stärker)
export function stepEntity(b, input, def, map, env) {
  if (isAir(def)) stepHeli(b, input, def);
  else {
    stepBoat(b, input, def, map, env);
    if (def.depth) {
      // U-Boot: Q = auftauchen (flacher), C = tiefer
      const D = def.depth;
      if (b.zt === undefined) b.zt = 0;
      if (b.z === undefined) b.z = 0;
      b.zt = clamp(b.zt + clamp(+input.up || 0, -1, 1) * D.rate * 1.6 * DT, D.min, 0);
      b.z += clamp(b.zt - b.z, -D.rate * DT, D.rate * DT);
    }
  }
}

export function seaFactor(def, env) {
  if (!env || env.sea >= 1 || isAir(def)) return 1;
  return def.length < 70 ? Math.pow(env.sea, 1.5) : env.sea;
}

export function stepBoat(b, input, def, map, env) {
  const th = clamp(+input.th || 0, -def.maxReverse, 1);
  const ru = clamp(+input.ru || 0, -1, 1);
  // Getauchte U-Boote spüren den Seegang nicht
  const sea = def.kind === "sub" && (b.z || 0) < DEPTH.periscope ? 1 : seaFactor(def, env);
  const target = th * def.maxSpeed * sea;
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
