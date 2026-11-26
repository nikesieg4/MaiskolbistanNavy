// Kampfflugzeuge in Draufsicht (1 Einheit = 1 m, Nase = +x, Backbord = −y).
// Eurofighter Typhoon, F-16C Fighting Falcon, AV-8B Harrier II, F-35A/B Lightning II.
// Noch nicht spielbar – Modelle für die geplante Jet-Rolle.
//
// anim: { t, seed, h (Kurs, für das Licht), flag, ab (Nachbrenner 0..1), throttle (0..1),
//         stores (Außenlasten-Satz, s. LOADOUTS), gear, nozzle (Harrier: 0 = hinten … 1 = senkrecht),
//         fan (F-35B: 0 = zu … 1 = Hubgebläse offen), variant ("A" | "B" bei der F-35) }

import { finish } from "./shade.js";

// ---------- Maße (für die spätere Simulation) ----------
export const JETS = {
  eurofighter: { label: "Eurofighter Typhoon", length: 15.96, span: 10.95, team: 0 },
  harrier: { label: "AV-8B Harrier II", length: 14.12, span: 9.25, team: 0 },
  f16: { label: "F-16C Fighting Falcon", length: 15.06, span: 9.96, team: 1 },
  f35: { label: "F-35B Lightning II", length: 15.6, span: 10.7, team: 1 },
};

// ---------- Hilfen ----------
// Punkte [x, y, rund?]: rund = Ecke als Kurve durch die Mitte zum nächsten Punkt
function shape(pts) {
  const p = new Path2D();
  const n = pts.length;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < n; i++) {
    const [x, y, s] = pts[i];
    const nx = pts[(i + 1) % n];
    if (s) p.quadraticCurveTo(x, y, (x + nx[0]) / 2, (y + nx[1]) / 2);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}
// Backbordhälfte (Nase → Heck, y ≤ 0) spiegeln zu einem geschlossenen Umriss
function sym(half) {
  const back = half
    .slice()
    .reverse()
    .filter((q) => q[1] !== 0)
    .map(([x, y, s]) => [x, -y, s]);
  return shape([...half, ...back]);
}
const flipY = (pts) => pts.map(([x, y, s]) => [x, -y, s]);
function both(pts) {
  return [shape(pts), shape(flipY(pts))];
}
function union(...paths) {
  const p = new Path2D();
  for (const q of paths.flat()) p.addPath(q);
  return p;
}
function lines(ctx, segs, w = 0.03, color = "rgba(0,0,0,0.28)") {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  for (const s of segs) {
    ctx.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
  }
  ctx.stroke();
}
// Spiegelt Liniensegmente (für Plattenfugen beider Seiten)
const mirrorSegs = (segs) => [...segs, ...segs.map((s) => s.map((v, i) => (i % 2 ? -v : v)))];
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
// Rumpfrundung: hell oben links, dunkel zur Seite
function bodyGrad(ctx, halfW, base, hi, lo) {
  return lin(ctx, 0, -halfW, 0, halfW, [
    [0, lo],
    [0.22, base],
    [0.42, hi],
    [0.62, base],
    [1, lo],
  ]);
}

// ---------- Triebwerk, Nachbrenner ----------
function nozzle(ctx, x, y, r, len, t, ab, petals = 12, color = "#6d6a66") {
  // Schubdüse von oben: kurzer Zylinder mit Klappen (Petals)
  const g = lin(ctx, 0, y - r, 0, y + r, [
    [0, "#3b3936"],
    [0.3, color],
    [0.5, "#a19a90"],
    [0.75, color],
    [1, "#2e2c2a"],
  ]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - len, y - r * 0.86);
  ctx.lineTo(x - len, y + r * 0.86);
  ctx.lineTo(x, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.025;
  ctx.beginPath();
  for (let i = 1; i < petals / 2; i++) {
    const yy = y - r + (2 * r * i) / (petals / 2);
    ctx.moveTo(x, yy);
    ctx.lineTo(x - len, y + (yy - y) * 0.86);
  }
  ctx.stroke();
  // Hitzeverfärbung (bläulich-bronze)
  ctx.fillStyle = lin(ctx, x, 0, x - len, 0, [
    [0, "rgba(0,0,0,0)"],
    [1, "rgba(90,70,140,0.35)"],
  ]);
  ctx.fillRect(x - len, y - r * 0.86, len, r * 1.72);
}

function flame(ctx, x, y, r, t, ab, seed = 0) {
  if (ab <= 0.02) {
    // nur Hitzeflimmern
    ctx.fillStyle = lin(ctx, x, 0, x - 3, 0, [
      [0, "rgba(40,30,30,0.18)"],
      [1, "rgba(40,30,30,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(x - 1.5, y, 1.5, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const flick = 0.88 + 0.12 * Math.sin(t * 47 + seed * 3.1) * Math.sin(t * 13 + seed);
  const L = (2.4 + 3.2 * ab) * flick;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // äußerer Glutkegel
  ctx.fillStyle = lin(ctx, x, 0, x - L, 0, [
    [0, `rgba(255,150,60,${0.55 * ab})`],
    [0.4, `rgba(255,90,30,${0.3 * ab})`],
    [1, "rgba(255,60,20,0)"],
  ]);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.85);
  ctx.quadraticCurveTo(x - L * 0.5, y - r * 1.15, x - L, y);
  ctx.quadraticCurveTo(x - L * 0.5, y + r * 1.15, x, y + r * 0.85);
  ctx.fill();
  // innerer Kern
  ctx.fillStyle = lin(ctx, x, 0, x - L * 0.55, 0, [
    [0, `rgba(255,245,215,${0.7 * ab})`],
    [0.5, `rgba(255,190,110,${0.4 * ab})`],
    [1, "rgba(255,180,90,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(x - L * 0.25, y, L * 0.3, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Machsche Knoten (Schockdiamanten)
  for (let i = 1; i <= 4; i++) {
    const xx = x - L * (0.14 + i * 0.15);
    const a = ab * (0.45 - i * 0.09);
    ctx.fillStyle = `rgba(255,240,200,${a})`;
    ctx.beginPath();
    ctx.ellipse(xx, y, r * 0.32, r * 0.42 * (1 - i * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Außenlasten ----------
// Draufsicht eines Flugkörpers: Nase bei x + len/2
function missile(ctx, x, y, kind) {
  const S = {
    aim120: { len: 3.65, d: 0.18, body: "#e7e8e4", nose: "#bfc3c0", mid: 0.32, tail: 0.3, band: "#c9a227" },
    aim9: { len: 2.9, d: 0.127, body: "#d9dbd7", nose: "#5c5f5d", can: 0.22, tail: 0.24, band: "#c9a227" },
    iris: { len: 2.94, d: 0.127, body: "#dfe1dd", nose: "#77807d", tail: 0.22, band: "#c9a227" },
    meteor: { len: 3.65, d: 0.178, body: "#d6d8d3", nose: "#a8aca8", tail: 0.28, ramjet: true, band: "#7a0f1a" },
  }[kind];
  const h = S.len / 2;
  const r = S.d / 2;
  ctx.save();
  ctx.translate(x, y);
  // Flossen (Kreuz – von oben sieht man die waagrechten)
  ctx.fillStyle = "#b9bdb9";
  const fin = (xc, span, chord) => {
    ctx.beginPath();
    ctx.moveTo(xc + chord * 0.3, -r);
    ctx.lineTo(xc - chord * 0.5, -r - span);
    ctx.lineTo(xc - chord * 0.7, -r - span);
    ctx.lineTo(xc - chord * 0.7, r + span);
    ctx.lineTo(xc - chord * 0.5, r + span);
    ctx.lineTo(xc + chord * 0.3, r);
    ctx.closePath();
    ctx.fill();
  };
  fin(-h + 0.2, S.tail, 0.32);
  if (S.mid) fin(0.15, S.mid * 0.6, 0.55);
  if (S.can) fin(h - 0.45, S.can * 0.6, 0.18);
  // Rumpf
  ctx.fillStyle = lin(ctx, 0, -r, 0, r, [
    [0, "#8d918e"],
    [0.4, S.body],
    [1, "#7c807d"],
  ]);
  ctx.beginPath();
  ctx.moveTo(h, 0);
  ctx.quadraticCurveTo(h - 0.05, -r, h - 0.35, -r);
  ctx.lineTo(-h, -r);
  ctx.lineTo(-h, r);
  ctx.lineTo(h - 0.35, r);
  ctx.quadraticCurveTo(h - 0.05, r, h, 0);
  ctx.fill();
  ctx.fillStyle = S.nose;
  ctx.beginPath();
  ctx.moveTo(h, 0);
  ctx.quadraticCurveTo(h - 0.05, -r, h - 0.35, -r);
  ctx.lineTo(h - 0.35, r);
  ctx.quadraticCurveTo(h - 0.05, r, h, 0);
  ctx.fill();
  if (S.ramjet) {
    // Meteor: zwei Lufteinläufe hinten
    ctx.fillStyle = "#9da19d";
    ctx.fillRect(-h + 0.5, -r - 0.07, 1.0, 0.07);
    ctx.fillRect(-h + 0.5, r, 1.0, 0.07);
  }
  ctx.fillStyle = S.band; // Kennband scharfer Gefechtskopf
  ctx.fillRect(h - 0.9, -r, 0.07, r * 2);
  ctx.restore();
}

function bomb(ctx, x, y, kind) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "tank") {
    // Zusatztank ~1.100 l
    const len = 4.6;
    const r = 0.33;
    ctx.fillStyle = lin(ctx, 0, -r, 0, r, [
      [0, "#6f777c"],
      [0.38, "#b4bbbf"],
      [1, "#646b70"],
    ]);
    ctx.beginPath();
    ctx.ellipse(0, 0, len / 2, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8d959a";
    ctx.fillRect(-len / 2 + 0.25, -0.42, 0.45, 0.84); // Stabilisierungsflossen
  } else if (kind === "gbu") {
    // GBU-12 Paveway II: Suchkopf vorne, Klappflügel hinten
    ctx.fillStyle = "#878a56";
    ctx.fillRect(-1.5, -0.6, 0.45, 1.2);
    ctx.fillStyle = lin(ctx, 0, -0.14, 0, 0.14, [
      [0, "#4f5232"],
      [0.4, "#7b7f4c"],
      [1, "#444729"],
    ]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.65, 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(0.6, -0.14, 0.06, 0.28);
    ctx.fillStyle = "#9da19d";
    ctx.fillRect(1.1, -0.22, 0.25, 0.44); // Steuerflächen am Suchkopf
    ctx.fillStyle = "#c7cacc";
    circle(ctx, 1.62, 0, 0.07);
    ctx.fill();
  } else if (kind === "taurus") {
    // Taurus KEPD 350: flacher Marschflugkörper mit Klappflügeln
    ctx.fillStyle = lin(ctx, 0, -0.5, 0, 0.5, [
      [0, "#5d6467"],
      [0.4, "#8e969a"],
      [1, "#535a5d"],
    ]);
    ctx.beginPath();
    ctx.moveTo(2.55, 0);
    ctx.lineTo(2.1, -0.42);
    ctx.lineTo(-2.4, -0.5);
    ctx.lineTo(-2.55, -0.3);
    ctx.lineTo(-2.55, 0.3);
    ctx.lineTo(-2.4, 0.5);
    ctx.lineTo(2.1, 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.025;
    ctx.stroke();
    ctx.fillStyle = "#3c4245";
    ctx.fillRect(-0.9, -0.05, 1.2, 0.1); // eingeklappte Flügel
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(1.4, -0.44, 0.06, 0.88);
  } else if (kind === "pod") {
    // Zielbehälter (Sniper/LITENING)
    ctx.fillStyle = lin(ctx, 0, -0.17, 0, 0.17, [
      [0, "#6d7377"],
      [0.4, "#a9b0b4"],
      [1, "#5f6569"],
    ]);
    ctx.beginPath();
    ctx.roundRect(-1.2, -0.17, 2.4, 0.34, 0.17);
    ctx.fill();
    ctx.fillStyle = "#1d2a33";
    circle(ctx, 1.12, 0, 0.13);
    ctx.fill();
    ctx.fillStyle = "rgba(160,220,255,0.6)";
    circle(ctx, 1.15, -0.04, 0.04);
    ctx.fill();
  } else if (kind === "dass") {
    // Eurofighter-Flügelspitzenbehälter (ESM/ECM)
    ctx.fillStyle = lin(ctx, 0, -0.16, 0, 0.16, [
      [0, "#7a8287"],
      [0.4, "#b4bbbf"],
      [1, "#6b7378"],
    ]);
    ctx.beginPath();
    ctx.roundRect(-1.0, -0.16, 2.0, 0.32, 0.16);
    ctx.fill();
    ctx.fillStyle = "#3e464b";
    ctx.fillRect(0.75, -0.16, 0.25, 0.32);
  } else if (kind === "gunpod") {
    ctx.fillStyle = "#5e6569";
    ctx.beginPath();
    ctx.roundRect(-1.4, -0.2, 2.8, 0.4, 0.2);
    ctx.fill();
  }
  ctx.restore();
}

function stores(ctx, list) {
  for (const [x, y, kind] of list) {
    if (kind === "aim120" || kind === "aim9" || kind === "iris" || kind === "meteor") missile(ctx, x, y, kind);
    else bomb(ctx, x, y, kind);
  }
}

// Bewaffnungssätze (Position unter dem Flügel → von oben ragt nur die Spitze vor die Vorderkante)
const pair = (x, y, k) => [
  [x, -y, k],
  [x, y, k],
];
export const LOADOUTS = {
  eurofighter: {
    air: [...pair(-1.2, 2.1, "tank"), ...pair(-2.35, 3.2, "meteor"), ...pair(-3.2, 4.25, "iris"), ...pair(-4.9, 5.58, "dass")],
    strike: [...pair(-1.2, 2.1, "tank"), ...pair(-2.6, 3.2, "taurus"), ...pair(-3.2, 4.25, "iris"), ...pair(-4.9, 5.58, "dass")],
    clean: [...pair(-4.9, 5.58, "dass")],
  },
  f16: {
    air: [...pair(-2.45, 4.88, "aim120"), ...pair(-2.15, 4.0, "aim9"), ...pair(-1.85, 3.2, "aim120"), ...pair(-1.35, 2.3, "tank")],
    strike: [...pair(-2.45, 4.88, "aim120"), ...pair(-2.15, 4.0, "aim9"), ...pair(-1.9, 3.2, "gbu"), ...pair(-1.35, 2.3, "tank"), [-1.2, 0.95, "pod"]],
    clean: [...pair(-2.45, 4.88, "aim120")],
  },
  harrier: {
    air: [...pair(-1.7, 3.6, "aim9"), ...pair(-1.45, 2.8, "aim120"), ...pair(-0.9, 1.95, "tank"), [-0.4, 0, "gunpod"]],
    strike: [...pair(-1.7, 3.6, "aim9"), ...pair(-1.6, 2.8, "gbu"), ...pair(-0.9, 1.95, "tank"), [-0.4, 0, "gunpod"]],
    clean: [],
  },
  f35: {
    // Tarnkappe: Waffen im Rumpfschacht – außen nur im „Beast Mode“
    air: [],
    strike: [],
    beast: [...pair(-2.55, 4.55, "aim9"), ...pair(-2.25, 3.6, "gbu"), ...pair(-2.1, 2.55, "gbu")],
    clean: [],
  },
};

// ---------- Kleinteile ----------
function canopy(ctx, path, x0, x1, halfW, tint) {
  ctx.fillStyle = lin(ctx, x0, -halfW, x1, halfW, tint || [
    [0, "#8fb2c4"],
    [0.3, "#2d4a5c"],
    [0.7, "#142531"],
    [1, "#0b161d"],
  ]);
  ctx.fill(path);
  // Spiegelung des Himmels
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(x0 - (x0 - x1) * 0.35, -halfW * 0.45, (x0 - x1) * 0.28, halfW * 0.22, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x1, -halfW, x0 - x1, halfW * 0.35);
  ctx.restore();
  ctx.strokeStyle = "rgba(20,24,26,0.75)";
  ctx.lineWidth = 0.05;
  ctx.stroke(path);
}
function seat(ctx, x, w = 0.22) {
  // Schleudersitz durch die Haube (dunkel, angedeutet)
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.roundRect(x - 0.35, -w, 0.55, w * 2, 0.08);
  ctx.fill();
  ctx.fillStyle = "rgba(201,162,39,0.35)"; // gelb-schwarze Abzuggriffe
  ctx.fillRect(x + 0.05, -0.05, 0.1, 0.1);
}
function navLights(ctx, port, star, tail, t, seed) {
  ctx.fillStyle = "rgba(255,70,60,0.95)";
  circle(ctx, port[0], port[1], 0.09);
  ctx.fill();
  ctx.fillStyle = "rgba(70,255,120,0.95)";
  circle(ctx, star[0], star[1], 0.09);
  ctx.fill();
  if (Math.sin(t * 6 + seed) > 0.75) {
    // Blitzlicht (Antikollision)
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    circle(ctx, tail[0], tail[1], 0.08);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    circle(ctx, tail[0], tail[1], 0.3);
    ctx.fill();
  }
}
// Hoheitszeichen auf dem Flügel: Flagge als Kreis-Kokarde (Teamfarben aus der Flagge)
function roundel(ctx, x, y, r, flag, lowVis) {
  const c = flag ? flag.colors : ["#7a0f1a", "#c9a227", "#7a0f1a"];
  ctx.save();
  if (lowVis) ctx.globalAlpha = 0.28;
  ctx.fillStyle = c[0];
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.fillStyle = c[1];
  circle(ctx, x, y, r * 0.66);
  ctx.fill();
  ctx.fillStyle = c[2] === c[0] ? "#f0ece0" : c[2];
  circle(ctx, x, y, r * 0.3);
  ctx.fill();
  ctx.restore();
}
function shadowFill(ctx, path, alpha) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fill(path);
}

// =====================================================================
// Eurofighter Typhoon (Maiskolbistan) – Delta mit Entenflügeln, zwei EJ200
// =====================================================================
const EF = (() => {
  const fus = sym([
    [8.0, 0],
    [7.7, -0.16, 1],
    [6.9, -0.38, 1],
    [5.8, -0.52],
    [4.6, -0.6],
    [3.4, -0.68],
    [2.6, -0.8, 1],
    [1.6, -0.95],
    [-1.5, -1.02],
    [-5.8, -1.0],
    [-6.7, -0.95],
    [-7.25, -0.92],
    [-7.25, 0],
  ]);
  const wing = both([
    [1.7, -0.85],
    [-4.38, -5.38],
    [-4.62, -5.47],
    [-5.4, -5.47],
    [-6.45, -0.95],
  ]);
  const canard = both([
    [4.55, -0.62],
    [3.05, -2.32],
    [2.55, -2.32],
    [2.92, -0.62],
  ]);
  const can = sym([
    [6.0, 0],
    [5.6, -0.3, 1],
    [4.7, -0.41],
    [3.6, -0.39, 1],
    [2.9, 0],
  ]);
  const fin = sym([
    [-3.3, 0],
    [-3.6, -0.13],
    [-7.55, -0.11],
    [-7.75, 0],
  ]);
  return { fus, wing, canard, can, fin, all: union(fus, wing, canard, fin) };
})();

export function drawEurofighter(ctx, a = {}) {
  const t = a.t || 0;
  const seed = ((a.seed || 0) % 100) / 7;
  const ab = a.ab || 0;
  const base = "#a3abb0";
  const dark = "#8f989d";
  for (const y of [-0.48, 0.48]) flame(ctx, -7.9, y, 0.4, t, ab, seed + y);
  stores(ctx, LOADOUTS.eurofighter[a.stores || "air"]);
  // Flügel
  for (const w of EF.wing) {
    ctx.fillStyle = lin(ctx, 1.5, 0, -6.4, 0, [
      [0, "#b2b9bd"],
      [1, dark],
    ]);
    ctx.fill(w);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.04;
    ctx.stroke(w);
  }
  // Ruder: Vorflügel außen, Flaperons innen/außen, Fugen
  lines(
    ctx,
    mirrorSegs([
      [-1.05, -3.0, -3.95, -5.18], // Vorflügel
      [-6.15, -1.15, -5.7, -3.2, -5.25, -5.2], // Flaperon-Scharnierlinie
      [-5.7, -3.2, -6.32, -3.2], // Trennung innen/außen
      [-0.4, -1.0, -5.9, -1.0], // Flügelwurzel
      [-2.0, -1.0, -3.6, -3.8, -5.3, -3.8], // Plattenfuge
    ]),
    0.035
  );
  // Entenflügel
  for (const c of EF.canard) {
    ctx.fillStyle = lin(ctx, 4.5, 0, 2.6, 0, [
      [0, "#b6bdc1"],
      [1, dark],
    ]);
    ctx.fill(c);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.035;
    ctx.stroke(c);
  }
  // Düsen
  for (const y of [-0.48, 0.48]) nozzle(ctx, -7.2, y, 0.42, 0.7, t, ab, 14);
  // Rumpf
  ctx.fillStyle = bodyGrad(ctx, 1.0, base, "#c3c9cc", "#7d868b");
  ctx.fill(EF.fus);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.04;
  ctx.stroke(EF.fus);
  // Radom (etwas anderer Grauton) und Staurohr
  ctx.save();
  ctx.clip(EF.fus);
  ctx.fillStyle = "rgba(60,66,70,0.18)";
  ctx.fillRect(6.6, -1, 1.5, 2);
  ctx.restore();
  lines(ctx, [[8.0, 0, 8.55, 0]], 0.05, "#444");
  // Rückenlinie, Luftbremse, Plattenfugen
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(-3.2, -0.32, 6.1, 0.64, 0.3);
  ctx.fill();
  lines(ctx, [[2.6, -0.3, 1.2, -0.3, 1.2, 0.3, 2.6, 0.3, 2.6, -0.3]], 0.03, "rgba(0,0,0,0.4)"); // Luftbremse
  lines(
    ctx,
    mirrorSegs([
      [6.6, -0.42, 6.6, 0],
      [3.0, -0.72, 3.0, -0.4],
      [0.6, -0.98, 0.6, -0.35],
      [-1.8, -1.02, -1.8, -0.33],
      [-4.2, -1.0, -4.2, -0.2],
      [-6.0, -1.0, -6.0, -0.2],
      [2.2, -0.88, -6.9, -0.7], // Seitenlinie Triebwerksschacht
    ]),
    0.028
  );
  // Seitenleitwerk
  ctx.fillStyle = lin(ctx, 0, -0.13, 0, 0.13, [
    [0, "#7a8287"],
    [0.4, "#b5bcc0"],
    [1, "#6d757a"],
  ]);
  ctx.fill(EF.fin);
  lines(ctx, [[-6.4, 0, -7.6, 0]], 0.02, "rgba(0,0,0,0.5)"); // Seitenruder
  ctx.fillStyle = "#5c6367";
  ctx.fillRect(-3.65, -0.08, 0.5, 0.16); // Antennenverkleidung
  // Haube
  seat(ctx, 4.3);
  canopy(ctx, EF.can, 6.0, 2.9, 0.41);
  lines(ctx, [[4.85, -0.41, 4.85, 0.41]], 0.06, "rgba(40,44,46,0.9)"); // Windschutzrahmen
  // Hoheitszeichen, Kennung
  roundel(ctx, -3.6, -3.4, 0.55, a.flag);
  roundel(ctx, -3.6, 3.4, 0.55, a.flag);
  ctx.fillStyle = "rgba(40,44,46,0.55)";
  ctx.font = "bold 0.55px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.translate(-5.2, -2.1);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("31+07", 0, 0);
  ctx.restore();
  finish(ctx, EF.all, 8, 5.5, a.h || 0, 0.22);
  navLights(ctx, [-5.0, -5.5], [-5.0, 5.5], [-7.7, 0], t, seed);
}

// =====================================================================
// F-16C Fighting Falcon (Paprikistan) – Mischflügel mit Strake, ein F110
// =====================================================================
const F16 = (() => {
  const fus = sym([
    [7.55, 0],
    [7.1, -0.16, 1],
    [6.1, -0.38, 1],
    [5.0, -0.5],
    [3.7, -0.58],
    [2.7, -0.72, 1],
    [1.5, -1.12, 1],
    [0.55, -1.42],
    [-3.7, -1.0],
    [-4.4, -0.88],
    [-6.7, -0.74],
    [-7.05, -0.62],
    [-7.05, 0],
  ]);
  const wing = both([
    [0.62, -1.3],
    [-2.28, -4.73],
    [-3.4, -4.73],
    [-3.75, -1.0],
  ]);
  const stab = both([
    [-4.45, -0.82],
    [-6.5, -2.75],
    [-7.45, -2.75],
    [-7.3, -0.72],
  ]);
  const can = sym([
    [5.7, 0],
    [5.35, -0.3, 1],
    [4.3, -0.43, 1],
    [3.0, -0.37, 1],
    [2.25, 0],
  ]);
  const fin = sym([
    [-3.4, 0],
    [-3.7, -0.13],
    [-7.25, -0.12],
    [-7.65, -0.05],
    [-7.65, 0],
  ]);
  return { fus, wing, stab, can, fin, all: union(fus, wing, stab, fin) };
})();

export function drawF16(ctx, a = {}) {
  const t = a.t || 0;
  const seed = ((a.seed || 0) % 100) / 7;
  const ab = a.ab || 0;
  const base = "#9aa3a9";
  const camo = "#838d94"; // zweifarbiges „Hill Gray“
  flame(ctx, -7.7, 0, 0.52, t, ab, seed);
  stores(ctx, LOADOUTS.f16[a.stores || "air"]);
  for (const w of F16.wing) {
    ctx.fillStyle = lin(ctx, 0.5, 0, -3.6, 0, [
      [0, "#a9b1b6"],
      [1, "#8d969c"],
    ]);
    ctx.fill(w);
    // Tarnfleck
    ctx.save();
    ctx.clip(w);
    ctx.fillStyle = camo;
    ctx.beginPath();
    ctx.ellipse(-1.5, w === F16.wing[0] ? -2.8 : 2.8, 1.5, 0.9, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.04;
    ctx.stroke(w);
  }
  lines(
    ctx,
    mirrorSegs([
      [0.3, -1.65, -1.9, -4.35], // Vorderkantenklappe
      [-3.05, -1.2, -2.95, -4.0], // Flaperon
      [-2.95, -4.0, -3.45, -4.0],
      [-0.5, -1.4, -3.7, -1.1],
    ]),
    0.035
  );
  // Höhenleitwerk (Pendelruder)
  for (const s of F16.stab) {
    ctx.fillStyle = lin(ctx, -4.5, 0, -7.4, 0, [
      [0, "#a6aeb3"],
      [1, "#858e94"],
    ]);
    ctx.fill(s);
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 0.035;
    ctx.stroke(s);
  }
  nozzle(ctx, -7.0, 0, 0.55, 0.75, t, ab, 16);
  ctx.fillStyle = bodyGrad(ctx, 1.4, base, "#bcc3c7", "#7a838a");
  ctx.fill(F16.fus);
  ctx.save();
  ctx.clip(F16.fus);
  ctx.fillStyle = camo;
  ctx.beginPath();
  ctx.ellipse(0.8, -0.9, 1.4, 0.5, 0.3, 0, Math.PI * 2);
  ctx.ellipse(-2.4, 0.6, 1.6, 0.45, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(60,66,70,0.25)";
  ctx.fillRect(6.0, -1, 2, 2); // Radom
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.04;
  ctx.stroke(F16.fus);
  lines(ctx, [[7.55, 0, 8.05, 0]], 0.05, "#444");
  // Rückenverkleidung (Block 50), Tankstutzen, Fugen
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(-3.5, -0.3, 5.9, 0.6, 0.3);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.03;
  ctx.strokeRect(-0.55, -0.13, 0.35, 0.26); // Luftbetankungsklappe
  lines(
    ctx,
    mirrorSegs([
      [6.0, -0.4, 6.0, 0],
      [2.0, -0.85, 2.0, -0.3],
      [0.0, -1.3, 0.0, -0.3],
      [-2.2, -1.1, -2.2, -0.3],
      [-4.4, -0.88, -4.4, -0.2],
      [-5.9, -0.8, -5.9, -0.2],
    ]),
    0.028
  );
  // Seitenleitwerk mit Bremsschirmgehäuse
  ctx.fillStyle = lin(ctx, 0, -0.13, 0, 0.13, [
    [0, "#757e84"],
    [0.4, "#aeb5ba"],
    [1, "#6a7379"],
  ]);
  ctx.fill(F16.fin);
  ctx.fillStyle = "#6b7378";
  ctx.beginPath();
  ctx.roundRect(-7.75, -0.16, 0.7, 0.32, 0.14);
  ctx.fill();
  // Einteilige, goldgetönte Haube
  seat(ctx, 3.6, 0.2);
  canopy(ctx, F16.can, 5.7, 2.25, 0.43, [
    [0, "#d8c88a"],
    [0.3, "#6b5e2f"],
    [0.7, "#2c2614"],
    [1, "#16130a"],
  ]);
  lines(ctx, [[2.85, -0.36, 2.85, 0.36]], 0.06, "rgba(40,44,46,0.9)");
  roundel(ctx, -2.3, -3.6, 0.48, a.flag);
  roundel(ctx, -2.3, 3.6, 0.48, a.flag);
  finish(ctx, F16.all, 7.6, 5, a.h || 0, 0.25);
  navLights(ctx, [-1.0, -4.95], [-1.0, 4.95], [-7.7, 0], t, seed);
}

// =====================================================================
// AV-8B Harrier II (Maiskolbistan, Bordflugzeug der Ähre) – Senkrechtstarter
// =====================================================================
const AV8 = (() => {
  const fus = sym([
    [7.0, 0],
    [6.65, -0.24, 1],
    [5.8, -0.47, 1],
    [4.6, -0.6],
    [3.0, -0.7],
    [2.75, -1.22, 1],
    [2.2, -1.34],
    [-2.3, -1.26],
    [-3.3, -0.92, 1],
    [-4.6, -0.55],
    [-6.3, -0.33],
    [-6.95, -0.2, 1],
    [-7.12, 0],
  ]);
  // Schulterdecker: ein durchgehender Flügel über dem Rumpf
  const wing = sym([
    [1.45, 0],
    [1.0, -1.1],
    [-1.98, -4.62],
    [-3.0, -4.62],
    [-3.8, -1.15],
    [-4.0, 0],
  ]);
  const stab = both([
    [-4.95, -0.42],
    [-6.12, -2.1],
    [-6.82, -2.1],
    [-6.62, -0.33],
  ]);
  const can = sym([
    [5.65, 0],
    [5.25, -0.34, 1],
    [4.0, -0.47, 1],
    [2.95, -0.37, 1],
    [2.35, 0],
  ]);
  const fin = sym([
    [-3.9, 0],
    [-4.2, -0.11],
    [-6.45, -0.1],
    [-6.7, 0],
  ]);
  return { fus, wing, stab, can, fin, all: union(fus, wing, stab, fin) };
})();

export function drawHarrier(ctx, a = {}) {
  const t = a.t || 0;
  const seed = ((a.seed || 0) % 100) / 7;
  const nz = Math.max(0, Math.min(1, a.nozzle ?? 0)); // 0 = Schub nach hinten, 1 = senkrecht
  const base = "#727b80";
  // Schwenkdüsen (Pegasus): vorne kalt (Bläserluft), hinten heiß – von oben verkürzt, wenn sie nach unten zeigen
  const nozzleAt = (x, hot) => {
    const len = 0.95 * Math.cos((nz * Math.PI) / 2) + 0.28;
    for (const s of [-1, 1]) {
      ctx.fillStyle = lin(ctx, 0, s * 1.2, 0, s * 1.75, [
        [0, hot ? "#4a4440" : "#5b6266"],
        [0.5, hot ? "#8d7f73" : "#9aa1a5"],
        [1, hot ? "#3a3532" : "#4c5357"],
      ]);
      ctx.beginPath();
      ctx.roundRect(x - len, s > 0 ? 1.18 : -1.72, len + 0.25, 0.54, 0.22);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 0.03;
      ctx.stroke();
      // Leitschaufeln
      lines(ctx, [[x - len + 0.1, s * 1.3, x - len + 0.1, s * 1.62]], 0.03, "rgba(0,0,0,0.5)");
      if (hot && nz > 0.6) {
        // Hitzeschleier unter senkrecht gestellten Düsen
        ctx.fillStyle = `rgba(255,200,150,${(nz - 0.6) * 0.25 * (0.8 + 0.2 * Math.sin(t * 30 + s))})`;
        circle(ctx, x - 0.2, s * 1.45, 0.9);
        ctx.fill();
      }
    }
  };
  nozzleAt(1.25, false);
  nozzleAt(-1.75, true);
  stores(ctx, LOADOUTS.harrier[a.stores || "air"]);
  // Höhenleitwerk (negative V-Stellung)
  for (const s of AV8.stab) {
    ctx.fillStyle = lin(ctx, -5, 0, -6.8, 0, [
      [0, "#7b8489"],
      [1, "#61696e"],
    ]);
    ctx.fill(s);
    ctx.strokeStyle = "rgba(0,0,0,0.38)";
    ctx.lineWidth = 0.035;
    ctx.stroke(s);
  }
  // Rumpf
  ctx.fillStyle = bodyGrad(ctx, 1.34, base, "#8c959a", "#565e63");
  ctx.fill(AV8.fus);
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 0.04;
  ctx.stroke(AV8.fus);
  lines(ctx, [[7.0, 0, 7.4, 0]], 0.05, "#333");
  // Große seitliche Lufteinläufe mit Hilfstüren
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#15191b";
    ctx.beginPath();
    ctx.moveTo(2.95, s * 0.72);
    ctx.quadraticCurveTo(2.75, s * 1.24, 2.25, s * 1.3);
    ctx.lineTo(2.45, s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 0.025;
    for (let i = 0; i < 4; i++) ctx.strokeRect(1.9 - i * 0.32, s > 0 ? 1.05 : -1.25, 0.24, 0.2);
  }
  // Flügel über dem Rumpf
  ctx.fillStyle = lin(ctx, 1.4, 0, -3.9, 0, [
    [0, "#808a8f"],
    [1, "#626a6f"],
  ]);
  ctx.fill(AV8.wing);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.04;
  ctx.stroke(AV8.wing);
  lines(
    ctx,
    mirrorSegs([
      [-3.15, -1.2, -2.45, -3.9], // Spaltklappe
      [-2.45, -3.9, -3.1, -3.9],
      [0.55, -1.6, -1.6, -4.25], // Vorderkantenwurzel
      [-0.6, -1.15, -2.4, -4.1],
    ]),
    0.035
  );
  // Rückenverkleidung (Klimaanlage) und Flügelmitte
  ctx.fillStyle = lin(ctx, 0, -0.36, 0, 0.36, [
    [0, "#5f676c"],
    [0.4, "#8f989d"],
    [1, "#545c61"],
  ]);
  ctx.beginPath();
  ctx.roundRect(-4.4, -0.34, 6.1, 0.68, 0.3);
  ctx.fill();
  ctx.fillStyle = "#1c2124";
  ctx.beginPath();
  ctx.ellipse(1.55, 0, 0.18, 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ausleger-Fahrwerk an den Flügeln
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#5a6266";
    ctx.beginPath();
    ctx.roundRect(-3.6, s * 3.45 - 0.13, 1.6, 0.26, 0.13);
    ctx.fill();
  }
  // Seitenleitwerk
  ctx.fillStyle = lin(ctx, 0, -0.11, 0, 0.11, [
    [0, "#596166"],
    [0.4, "#8a9398"],
    [1, "#50585c"],
  ]);
  ctx.fill(AV8.fin);
  // Steuerdüsen-Ventile (Reaktionssteuerung) an Heck und Flügelspitzen
  ctx.fillStyle = "#2a2e30";
  circle(ctx, -7.05, 0, 0.09);
  ctx.fill();
  // Haube
  seat(ctx, 3.8, 0.22);
  canopy(ctx, AV8.can, 5.65, 2.35, 0.47);
  lines(ctx, [[4.95, -0.42, 4.95, 0.42]], 0.06, "rgba(30,34,36,0.9)");
  roundel(ctx, -2.2, -3.4, 0.42, a.flag);
  roundel(ctx, -2.2, 3.4, 0.42, a.flag);
  finish(ctx, AV8.all, 7, 4.6, a.h || 0, 0.35);
  navLights(ctx, [-2.4, -4.62], [-2.4, 4.62], [-6.9, 0], t, seed);
}

// =====================================================================
// F-35B Lightning II (Paprikistan, Bordflugzeug der America) – Tarnkappe
// =====================================================================
const F35 = (() => {
  const fus = sym([
    [7.8, 0],
    [7.35, -0.2, 1],
    [6.4, -0.5],
    [5.0, -0.83],
    [4.0, -1.02],
    [3.45, -1.3],
    [2.4, -1.34],
    [1.0, -1.32],
    [-3.6, -1.32],
    [-4.6, -1.16],
    [-6.2, -0.86],
    [-6.85, -0.75],
    [-6.85, 0],
  ]);
  const wing = both([
    [1.4, -1.25],
    [-1.45, -5.35],
    [-2.85, -5.35],
    [-3.9, -1.25],
  ]);
  // Höhenleitwerk mit Sägezahn-Hinterkante (Kantenausrichtung)
  const stab = both([
    [-4.0, -0.85],
    [-5.9, -3.4],
    [-6.9, -3.4],
    [-6.62, -2.05],
    [-7.15, -1.35],
    [-6.95, -0.8],
  ]);
  // Nach außen geneigte Doppel-Seitenleitwerke (von oben als schräge Flächen)
  const vtail = both([
    [-3.45, -1.02],
    [-4.95, -1.72],
    [-5.95, -1.78],
    [-6.0, -1.1],
  ]);
  const can = sym([
    [6.05, 0],
    [5.62, -0.37, 1],
    [4.4, -0.49, 1],
    [3.2, -0.41, 1],
    [2.6, 0],
  ]);
  return { fus, wing, stab, vtail, can, all: union(fus, wing, stab, vtail) };
})();

export function drawF35(ctx, a = {}) {
  const t = a.t || 0;
  const seed = ((a.seed || 0) % 100) / 7;
  const ab = a.ab || 0;
  const fan = a.variant === "A" ? 0 : Math.max(0, Math.min(1, a.fan ?? 0));
  const base = "#5d6368";
  const ram = "#53595e"; // Radarabsorbierende Beschichtung, Kanten dunkler
  flame(ctx, -7.55, 0, 0.6, t, ab, seed);
  stores(ctx, LOADOUTS.f35[a.stores || "air"]);
  for (const w of F35.wing) {
    ctx.fillStyle = lin(ctx, 1.3, 0, -3.8, 0, [
      [0, "#646a6f"],
      [1, "#52585d"],
    ]);
    ctx.fill(w);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.04;
    ctx.stroke(w);
  }
  // Kantenbänder (RAM) an Vorder- und Hinterkanten
  lines(
    ctx,
    mirrorSegs([
      [1.2, -1.5, -1.38, -5.15],
      [-3.75, -1.4, -2.8, -5.2],
      [-1.6, -1.35, -2.95, -3.7, -2.25, -5.0], // Klappen-/Querruder-Fugen
    ]),
    0.06,
    "rgba(30,33,36,0.45)"
  );
  for (const s of F35.stab) {
    ctx.fillStyle = lin(ctx, -4, 0, -7, 0, [
      [0, "#62686d"],
      [1, "#4c5257"],
    ]);
    ctx.fill(s);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 0.035;
    ctx.stroke(s);
  }
  // Düse mit Sägezahnrand (F-35B: schwenkbar, hier in Reiseflugstellung)
  nozzle(ctx, -6.8, 0, 0.62, 0.75, t, ab, 18, "#5f5a55");
  ctx.strokeStyle = "rgba(20,20,20,0.6)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const yy = -0.53 + (1.06 * i) / 8;
    ctx.lineTo(-7.55 + (i % 2 ? 0.12 : 0), yy);
  }
  ctx.stroke();
  // Rumpf mit Kinnkanten (Chines)
  ctx.fillStyle = bodyGrad(ctx, 1.34, base, "#727a80", "#454b50");
  ctx.fill(F35.fus);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.04;
  ctx.stroke(F35.fus);
  // DSI-Einläufe (Buckel ohne Grenzschichtweiche)
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#16191b";
    ctx.beginPath();
    ctx.moveTo(3.95, s * 1.02);
    ctx.lineTo(3.45, s * 1.3);
    ctx.lineTo(3.2, s * 1.3);
    ctx.lineTo(3.55, s * 0.98);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.ellipse(3.1, s * 1.05, 0.6, 0.18, s * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sägezahn-Fugen der Klappen und Wartungsöffnungen
  const zig = (x0, x1, y, n, amp) => {
    const s = [];
    for (let i = 0; i <= n; i++) s.push(x0 + ((x1 - x0) * i) / n, y + (i % 2 ? amp : -amp));
    return s;
  };
  lines(
    ctx,
    mirrorSegs([
      zig(-0.4, -3.4, -0.75, 8, 0.07),
      zig(2.2, 0.8, -0.95, 4, 0.06),
      [-3.6, -1.32, -3.6, -0.85, -4.6, -0.6],
    ]),
    0.03,
    "rgba(0,0,0,0.35)"
  );
  // Seitenleitwerke
  for (const v of F35.vtail) {
    ctx.fillStyle = lin(ctx, -3.5, 0, -6, 0, [
      [0, "#6c7378"],
      [1, "#4a5055"],
    ]);
    ctx.fill(v);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 0.035;
    ctx.stroke(v);
  }
  // F-35B: Hubgebläse hinter dem Cockpit, Klappe nach hinten aufgestellt
  if (a.variant !== "A") {
    const doorLen = 1.9 * (1 - 0.55 * fan);
    if (fan > 0.05) {
      ctx.fillStyle = "#111416";
      ctx.beginPath();
      ctx.roundRect(0.7, -0.55, 1.9, 1.1, 0.25);
      ctx.fill();
      // drehendes Gebläse
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0.7, -0.55, 1.9, 1.1, 0.25);
      ctx.clip();
      ctx.translate(1.65, 0);
      ctx.rotate(t * 30);
      ctx.strokeStyle = `rgba(150,155,160,${0.35 + 0.3 * fan})`;
      ctx.lineWidth = 0.06;
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0.12, 0);
        ctx.lineTo(0.55, 0.08);
        ctx.stroke();
      }
      ctx.restore();
      // aufgestellte Klappe (Scharnier hinten, verkürzt gesehen)
      ctx.fillStyle = lin(ctx, 0.6 - doorLen * 0.3, 0, 0.6, 0, [
        [0, "#7d858a"],
        [1, "#4d5358"],
      ]);
      ctx.beginPath();
      ctx.roundRect(0.6 - doorLen * 0.45, -0.6, doorLen * 0.45, 1.2, 0.15);
      ctx.fill();
      // Hilfseinlass-Klappen
      ctx.fillStyle = "#1b1f22";
      ctx.fillRect(-0.45, -0.38, 0.55, 0.22);
      ctx.fillRect(-0.45, 0.16, 0.55, 0.22);
    } else {
      lines(ctx, [zig(2.6, 0.7, -0.55, 6, 0.05), zig(2.6, 0.7, 0.55, 6, 0.05), [0.7, -0.55, 0.7, 0.55]], 0.03, "rgba(0,0,0,0.45)");
    }
  }
  // Goldbedampfte Haube (ohne Mittelstrebe)
  seat(ctx, 4.0, 0.22);
  canopy(ctx, F35.can, 6.05, 2.6, 0.49, [
    [0, "#e3c46a"],
    [0.3, "#7b6223"],
    [0.65, "#2e250e"],
    [1, "#181307"],
  ]);
  // Tarnkappen-Kennzeichen: kaum sichtbar
  roundel(ctx, -2.4, -3.9, 0.48, a.flag, true);
  roundel(ctx, -2.4, 3.9, 0.48, a.flag, true);
  finish(ctx, F35.all, 7.8, 5.4, a.h || 0, 0.15);
  // Formationsleuchtstreifen
  ctx.fillStyle = "rgba(190,255,150,0.35)";
  for (const s of [-1, 1]) ctx.fillRect(-2.3, s * 5.1 - 0.04, 0.6, 0.08);
  navLights(ctx, [-1.6, -5.3], [-1.6, 5.3], [-6.0, 0], t, seed);
}

// ---------- Gemeinsamer Einstieg ----------
export function drawJet(ctx, type, a) {
  if (type === "eurofighter") return drawEurofighter(ctx, a);
  if (type === "f16") return drawF16(ctx, a);
  if (type === "harrier") return drawHarrier(ctx, a);
  if (type === "f35") return drawF35(ctx, a);
}

export function drawJetShadow(ctx, type, alpha = 0.28) {
  const m = { eurofighter: EF, f16: F16, harrier: AV8, f35: F35 }[type];
  if (m) shadowFill(ctx, m.all, alpha);
}
