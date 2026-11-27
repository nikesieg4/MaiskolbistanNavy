// Flugzeugträger in Draufsicht (1 Einheit = 1 m, Bug = +x, Backbord = −y).
// Charles de Gaulle (Maiskolbistan) und Gerald R. Ford (Paprikistan): Flugdeck mit Winkeldeck nach Backbord,
// Katapulte, Fangseile, Insel an Steuerbord mit drehendem Radar, Aufzüge, Decksmarkierungen.
import { finish } from "./shade.js";

const poly = (pts) => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// Grundform (CdG-Maße), Ford wird daraus skaliert und angepasst
const CDG_DECK = [
  [130, 0], [127, -8], [118, -14], [100, -17], [60, -19], [30, -21], [10, -31], [-40, -36], [-100, -34], [-122, -30],
  [-130, -24], [-131, -6], [-131, 14], [-126, 22], [-90, 27], [-40, 30], [0, 31], [50, 28], [90, 22], [115, 14], [126, 6],
];

function makeSpec(kind) {
  if (kind === "cdg") {
    return {
      L: 261, B: 64, hullB: 31.5, hullNo: "91",
      deck: CDG_DECK,
      angled: { a: [-130, -9], b: [32, -27], w: 23 },
      cats: [[[42, -3], [126, -3]], [[-34, -21], [24, -29]]],
      wires: [-102, -94, -86],
      island: { x0: 18, x1: 46, y0: 17, y1: 29.5, radar: [30, 23.5], mast: [40, 23] },
      elevators: [[-22, -4, 22, 31], [-52, -34, 22, 30]],
      deckColor: "#5a6064",
    };
  }
  const sx = 333 / 261;
  const sy = 78 / 64;
  const S = ([x, y]) => [x * sx, y * sy];
  return {
    L: 333, B: 78, hullB: 41, hullNo: "78",
    deck: CDG_DECK.map(S),
    angled: { a: S([-130, -9]), b: S([32, -27]), w: 29 },
    cats: [[[60, -6], [162, -6]], [[70, 3], [162, 3]], [[-50, -24], [20, -34]], [[-30, -30], [36, -40]]],
    wires: [-136, -128, -120],
    island: { x0: -58, x1: -28, y0: 26, y1: 37, radar: [-42, 31.5], mast: [-34, 31] },
    elevators: [[40, 62, 26, 38], [8, 30, 27, 38], [-140, -118, -42, -30]],
    deckColor: "#555b5f",
  };
}
const SPECS = { cdg: makeSpec("cdg"), ford: makeSpec("ford") };
for (const s of Object.values(SPECS)) s.deckPath = poly(s.deck);
export const CARRIER_OUTLINES = { cdg: SPECS.cdg.deckPath, ford: SPECS.ford.deckPath };

// Nicht-rutschende Deckbeschichtung: feines Korn
let grainPat = null;
function grain(ctx) {
  if (!grainPat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    for (let i = 0; i < 700; i++) {
      g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)";
      g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
    }
    // Reifenabrieb
    g.strokeStyle = "rgba(0,0,0,0.08)";
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, 10 + i * 15);
      g.lineTo(64, 12 + i * 15);
      g.stroke();
    }
    grainPat = ctx.createPattern(c, "repeat");
  }
  grainPat.setTransform(new DOMMatrix().scale(0.12));
  return grainPat;
}

function line(ctx, pts, w, color, dash) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
}

export function drawSupercarrier(ctx, type, a = {}) {
  const S = SPECS[type];
  const t = a.t || 0;
  const hl = S.L / 2;
  // Rumpf unter dem Deck (am Bug und Heck sichtbar), Schatten
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.save();
  ctx.translate(2.5, 4);
  ctx.fill(S.deckPath);
  ctx.restore();
  ctx.fillStyle = lin(ctx, 0, -S.hullB / 2, 0, S.hullB / 2, [
    [0, "#3e4549"],
    [0.5, "#6b7378"],
    [1, "#34393c"],
  ]);
  ctx.beginPath();
  ctx.moveTo(hl + 4, 0);
  ctx.quadraticCurveTo(hl - 10, -S.hullB / 2, hl - 40, -S.hullB / 2);
  ctx.lineTo(-hl + 6, -S.hullB / 2);
  ctx.lineTo(-hl + 2, S.hullB / 2);
  ctx.lineTo(hl - 40, S.hullB / 2);
  ctx.quadraticCurveTo(hl - 10, S.hullB / 2, hl + 4, 0);
  ctx.fill();
  // Flugdeck
  ctx.fillStyle = S.deckColor;
  ctx.fill(S.deckPath);
  ctx.save();
  ctx.clip(S.deckPath);
  ctx.fillStyle = grain(ctx);
  ctx.fillRect(-hl - 5, -S.B, S.L + 10, S.B * 2);
  // Winkeldeck: Landebahn mit Rand- und Mittellinie
  const { a: A, b: Bp, w } = S.angled;
  const ang = Math.atan2(Bp[1] - A[1], Bp[0] - A[0]);
  const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
  ctx.save();
  ctx.translate(A[0], A[1]);
  ctx.rotate(ang);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, -w / 2, len, w);
  line(ctx, [[0, -w / 2], [len, -w / 2]], 0.6, "rgba(255,255,255,0.85)");
  line(ctx, [[0, w / 2], [len, w / 2]], 0.6, "rgba(255,255,255,0.85)");
  line(ctx, [[2, 0], [len, 0]], 0.5, "rgba(255,255,255,0.9)", [6, 4]);
  // Aufsetzzone und Heckmarkierung rot-weiß
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#e9e9e6" : "#b8332b";
    ctx.fillRect(0, -w / 2 + (i * w) / 8, 2.2, w / 8);
  }
  // Fangseile quer über die Landebahn
  for (const wx of S.wires) {
    const d = (wx - A[0]) / Math.cos(ang);
    line(ctx, [[d, -w / 2 + 1], [d, w / 2 - 1]], 0.35, "rgba(30,30,30,0.9)");
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(d - 0.6, -w / 2 - 0.4, 1.2, 1.2);
    ctx.fillRect(d - 0.6, w / 2 - 0.8, 1.2, 1.2);
  }
  ctx.restore();
  // Katapulte: Schienen mit Schlitten, Strahlabweiser dahinter
  S.cats.forEach(([p0, p1], i) => {
    line(ctx, [p0, p1], 1.1, "rgba(25,25,25,0.75)");
    line(ctx, [p0, p1], 0.3, "rgba(200,200,200,0.5)", [3, 3]);
    const ca = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    // Schlitten fährt beim Start nach vorn (Animation nur Optik)
    const k = (t * 0.15 + i * 0.37) % 1;
    const sxp = p0[0] + (p1[0] - p0[0]) * (k < 0.1 ? k * 10 : 0);
    const syp = p0[1] + (p1[1] - p0[1]) * (k < 0.1 ? k * 10 : 0);
    ctx.fillStyle = "#d0a020";
    ctx.fillRect(sxp - 1.2, syp - 0.7, 2.4, 1.4);
    ctx.save();
    ctx.translate(p0[0] - Math.cos(ca) * 6, p0[1] - Math.sin(ca) * 6);
    ctx.rotate(ca);
    ctx.fillStyle = "#43494d";
    ctx.fillRect(-1, -6, 2, 12);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(-1, -6, 0.5, 12);
    ctx.restore();
  });
  // Gelbe Rollwege und Abstellplätze, Sicherheitslinie zum Winkeldeck
  line(ctx, [[hl - 12, 10], [S.L * 0.1, 18], [-hl * 0.7, 22]], 0.4, "rgba(240,200,60,0.85)");
  line(ctx, [[hl - 10, -10], [0, -14]], 0.4, "rgba(240,200,60,0.7)");
  line(ctx, [[-hl, -S.B * 0.02], [hl * 0.25, -S.B * 0.2]], 0.5, "rgba(255,40,40,0.55)", [4, 3]);
  // Aufzüge
  for (const [x0, x1, y0, y1] of S.elevators) {
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = "rgba(230,230,230,0.55)";
    ctx.lineWidth = 0.35;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  // Kennung am Bug
  ctx.save();
  ctx.translate(hl - 30, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "rgba(240,240,235,0.85)";
  ctx.font = `bold ${S.B * 0.22}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(S.hullNo, 0, 0);
  ctx.restore();
  ctx.restore();
  // Decksrand
  ctx.strokeStyle = "rgba(20,24,26,0.8)";
  ctx.lineWidth = 0.6;
  ctx.stroke(S.deckPath);
  // Insel (Brücke) mit Schatten, Fenstern, Schornstein-/Mastbereich und drehendem Radar
  const I = S.island;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(I.x0 + 2.5, I.y0 + 3.5, I.x1 - I.x0, I.y1 - I.y0);
  ctx.fillStyle = lin(ctx, 0, I.y0, 0, I.y1, [
    [0, "#9aa2a7"],
    [0.4, "#b8bfc3"],
    [1, "#7b8388"],
  ]);
  ctx.fillRect(I.x0, I.y0, I.x1 - I.x0, I.y1 - I.y0);
  ctx.fillStyle = "#8d969b";
  ctx.fillRect(I.x0 + 3, I.y0 + 2, (I.x1 - I.x0) * 0.55, I.y1 - I.y0 - 4);
  ctx.fillStyle = "#1c2a33";
  ctx.fillRect(I.x1 - 2.2, I.y0 + 1, 1.2, I.y1 - I.y0 - 2); // Brückenfenster nach vorn
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(I.x0, I.y0, I.x1 - I.x0, 0.6);
  // Fest eingebaute Radarflächen (Ecken)
  ctx.fillStyle = "#59666d";
  ctx.fillRect(I.x1 - 1.4, I.y0 - 0.6, 1.4, 3);
  ctx.fillRect(I.x0, I.y0 - 0.6, 1.4, 3);
  // Mast
  ctx.fillStyle = "#4b5256";
  ctx.beginPath();
  ctx.arc(I.mast[0], I.mast[1], 1.6, 0, Math.PI * 2);
  ctx.fill();
  // drehendes Radar
  ctx.save();
  ctx.translate(I.radar[0], I.radar[1]);
  ctx.rotate(a.radarAngle ?? t * 2);
  ctx.fillStyle = "#2f363a";
  ctx.fillRect(-0.6, -4.2, 1.2, 8.4);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-0.6, -4.2, 0.4, 8.4);
  ctx.restore();
  // Flagge am Heck
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(-hl - 3.5 + i * 1.2, -1.8, 1.2, 3.6);
      else ctx.fillRect(-hl - 3.5, -1.8 + i * 1.2, 3.6, 1.2);
    }
  }
  finish(ctx, S.deckPath, hl, S.B / 2, a.h || 0, 0.6);
}
