// U-Boote in Draufsicht (1 Einheit = 1 m, Bug = +x).
// U 212A (Maiskolbistan): kompakt, X-Ruder, tropfenförmiger Turm. Virginia (Paprikistan): lang, Kreuzleitwerk, Pumpjet.
// anim: { t, seed, h, flag, z (Tiefe, negativ), v }
import { finish } from "./shade.js";

function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// Schallabsorbierende Gummikacheln: feines Raster
let tilePat = null;
function tiles(ctx) {
  if (!tilePat) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    for (let i = 0; i <= 32; i += 8) {
      g.beginPath();
      g.moveTo(i + 0.5, 0);
      g.lineTo(i + 0.5, 32);
      g.moveTo(0, i + 0.5);
      g.lineTo(32, i + 0.5);
      g.stroke();
    }
    // einzelne abgelöste/ersetzte Kacheln
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(8, 16, 8, 8);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(24, 0, 8, 8);
    tilePat = ctx.createPattern(c, "repeat");
  }
  tilePat.setTransform(new DOMMatrix().scale(0.04));
  return tilePat;
}

// Druckkörper: Zylinder mit gerundetem Bug und spitz zulaufendem Heck
function hull(L, B, bowR = 0.16, tail = 0.3) {
  const p = new Path2D();
  const hl = L / 2;
  const hb = B / 2;
  const bx = hl - L * bowR;
  const sx = -hl + L * tail;
  p.moveTo(hl, 0);
  p.bezierCurveTo(hl, -hb * 0.75, bx + L * 0.04, -hb, bx, -hb);
  p.lineTo(sx, -hb);
  p.bezierCurveTo(sx - L * 0.12, -hb, -hl + L * 0.04, -hb * 0.3, -hl, -hb * 0.12);
  p.lineTo(-hl, hb * 0.12);
  p.bezierCurveTo(-hl + L * 0.04, hb * 0.3, sx - L * 0.12, hb, sx, hb);
  p.lineTo(bx, hb);
  p.bezierCurveTo(bx + L * 0.04, hb, hl, hb * 0.75, hl, 0);
  p.closePath();
  return p;
}

const U212 = { L: 56, B: 7, hull: hull(56, 7, 0.15, 0.3) };
const VA = { L: 115, B: 10.4, hull: hull(115, 10.4, 0.07, 0.22) };
export const SUB_OUTLINES = { u212: U212.hull, virginia: VA.hull };

function body(ctx, M, base) {
  ctx.fillStyle = lin(ctx, 0, -M.B / 2, 0, M.B / 2, [
    [0, "#121517"],
    [0.3, base],
    [0.45, "#4a5257"],
    [0.6, base],
    [1, "#0e1113"],
  ]);
  ctx.fill(M.hull);
  ctx.save();
  ctx.clip(M.hull);
  ctx.fillStyle = tiles(ctx);
  ctx.fillRect(-M.L / 2, -M.B / 2, M.L, M.B);
  // Wasserlinie / Algenbewuchs zum Heck
  ctx.fillStyle = lin(ctx, -M.L / 2, 0, -M.L * 0.2, 0, [
    [0, "rgba(40,60,45,0.35)"],
    [1, "rgba(40,60,45,0)"],
  ]);
  ctx.fillRect(-M.L / 2, -M.B / 2, M.L * 0.3, M.B);
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 0.12;
  ctx.stroke(M.hull);
}

function mastTops(ctx, x, list, t, up) {
  // Sehrohre und Masten (oben auf dem Turm, ausgefahren auf Sehrohrtiefe)
  for (const [dx, r, col] of list) {
    ctx.fillStyle = col;
    circle(ctx, x + dx, 0, r * (up ? 1 : 0.7));
    ctx.fill();
    if (up) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      circle(ctx, x + dx - r * 0.3, -r * 0.3, r * 0.35);
      ctx.fill();
    }
  }
}

export function drawU212(ctx, a = {}) {
  const t = a.t || 0;
  const up = (a.z ?? 0) > -30;
  // X-Ruder: von oben vier schräge Flossen am Heck
  ctx.fillStyle = "#1d2225";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-21, s * 1.2);
    ctx.lineTo(-25.5, s * 4.3);
    ctx.lineTo(-27.6, s * 4.3);
    ctx.lineTo(-26.2, s * 0.9);
    ctx.closePath();
    ctx.fill();
  }
  // Propeller (7 Sichelblätter) hinter dem Heck
  ctx.save();
  ctx.translate(-28.2, 0);
  ctx.fillStyle = "#6b5a3a";
  ctx.fillRect(-0.4, -1.6, 0.6, 3.2);
  ctx.restore();
  body(ctx, U212, "#2a3033");
  // Bugsonar-Fenster und Torpedorohrklappen
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(24, 0, 2.6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 0.08;
  for (const y of [-1.6, -0.55, 0.55, 1.6]) ctx.strokeRect(19.2, y - 0.3, 1.6, 0.6);
  // Flankensonar
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(-8, -3.5, 16, 0.5);
  ctx.fillRect(-8, 3.0, 16, 0.5);
  // Turm (tropfenförmig), leicht nach vorn gesetzt
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(5.8, 0.6, 5.2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, -1.4, 0, 1.4, [
    [0, "#1a1f22"],
    [0.4, "#4b5459"],
    [1, "#15191b"],
  ]);
  ctx.beginPath();
  ctx.moveTo(10.6, 0);
  ctx.bezierCurveTo(10.4, -1.3, 7, -1.4, 4, -1.2);
  ctx.lineTo(1.2, -0.7);
  ctx.lineTo(1.2, 0.7);
  ctx.lineTo(4, 1.2);
  ctx.bezierCurveTo(7, 1.4, 10.4, 1.3, 10.6, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 0.08;
  ctx.stroke();
  mastTops(ctx, 6, [[2.6, 0.32, "#555"], [1.2, 0.28, "#3d3d3d"], [-0.3, 0.38, "#2a2a2a"], [-1.8, 0.3, "#4a4a4a"]], t, up);
  // Kennung, Flagge (nur aufgetaucht sinnvoll sichtbar)
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(2 + i * 0.5, -0.45, 0.5, 0.9);
      else ctx.fillRect(2, -0.45 + i * 0.3, 1.5, 0.3);
    }
  }
  finish(ctx, U212.hull, 28, 3.5, a.h || 0, 0.5);
}

export function drawVirginia(ctx, a = {}) {
  const t = a.t || 0;
  const up = (a.z ?? 0) > -30;
  // Kreuzleitwerk: Höhenruder seitlich sichtbar, Seitenruder als Strich
  ctx.fillStyle = "#1a1e21";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-44, s * 2.4);
    ctx.lineTo(-50, s * 6.4);
    ctx.lineTo(-53.5, s * 6.4);
    ctx.lineTo(-52.6, s * 1.8);
    ctx.closePath();
    ctx.fill();
  }
  body(ctx, VA, "#262c2f");
  // Pumpjet-Ummantelung am Heck
  ctx.strokeStyle = "#3a3f42";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-54.5, -1.6);
  ctx.lineTo(-57.2, -1.3);
  ctx.moveTo(-54.5, 1.6);
  ctx.lineTo(-57.2, 1.3);
  ctx.stroke();
  // Große Senkrechtstartrohre (2 Lukendeckel) vor dem Turm, Flankensonar
  ctx.fillStyle = "#1b2023";
  for (const x of [44, 39]) {
    circle(ctx, x, 0, 1.55);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.1;
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  for (const s of [-1, 1]) {
    ctx.fillRect(-30, s * 4.9 - 0.35, 18, 0.7);
    ctx.fillRect(-6, s * 4.9 - 0.35, 18, 0.7);
  }
  // Bugsonar (Großfläche)
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(52, 0, 4.2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Turm mit Anströmkörper am Fuß
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(27.5, 0.9, 6.8, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lin(ctx, 0, -1.6, 0, 1.6, [
    [0, "#171b1d"],
    [0.4, "#454e53"],
    [1, "#131618"],
  ]);
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.bezierCurveTo(33.5, -2.0, 30, -1.6, 27, -1.5);
  ctx.lineTo(21.5, -1.3);
  ctx.lineTo(21.2, 1.3);
  ctx.lineTo(27, 1.5);
  ctx.bezierCurveTo(30, 1.6, 33.5, 2.0, 34, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 0.1;
  ctx.stroke();
  mastTops(ctx, 27, [[3.6, 0.42, "#5a5a5a"], [1.8, 0.36, "#3d3d3d"], [0, 0.48, "#2b2b2b"], [-2.2, 0.36, "#4a4a4a"]], t, up);
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(23 + i * 0.6, -0.5, 0.6, 1);
      else ctx.fillRect(23, -0.5 + i * 0.33, 1.8, 0.33);
    }
  }
  finish(ctx, VA.hull, 57, 5.2, a.h || 0, 0.5);
}

// Unter Wasser: Rumpf verschwimmt im Wasser (je tiefer, desto blauer und blasser)
export function drawSub(ctx, type, a) {
  if (type === "u212") drawU212(ctx, a);
  else drawVirginia(ctx, a);
  const z = a.z ?? 0;
  if (z < -2) {
    const k = Math.min(0.82, 0.25 + (-z / 140) * 0.6);
    ctx.fillStyle = `rgba(20,80,126,${k})`;
    ctx.fill(SUB_OUTLINES[type]);
  }
}
