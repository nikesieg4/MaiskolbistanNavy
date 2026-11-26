// Hubschrauberträger Klasse „Ähre" – Draufsicht in Metern, Bug = +x, Steuerbord = +y.
// Bewegliche Teile: großes 3D-Luftraumradar (rotiert), Navigationsradar, zwei RAM-Starter,
// Deckskran, Flagge, Rauch aus dem Schornstein (in main.js).
import { BOATS } from "../shared/sim.js";

const D = BOATS.carrier;
const HL = D.length / 2; // 91
const HB = D.beam / 2; // 15

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function hullPath(ctx, inset = 0) {
  const b = HB - inset;
  ctx.beginPath();
  ctx.moveTo(-HL + inset, -b + 1.5);
  ctx.lineTo(-HL + 3 + inset, -b);
  ctx.lineTo(50, -b);
  ctx.bezierCurveTo(72, -b, 84, -b * 0.6, HL - inset * 1.5, -1.2);
  ctx.lineTo(HL - inset * 1.5, 1.2);
  ctx.bezierCurveTo(84, b * 0.6, 72, b, 50, b);
  ctx.lineTo(-HL + 3 + inset, b);
  ctx.lineTo(-HL + inset, b - 1.5);
  ctx.closePath();
}

function flag(ctx, t, ph, f) {
  if (!f) return;
  const len = 3.2;
  const wid = 1.9;
  const segs = 8;
  const wave = (u) => Math.sin(t * 6 + ph - u * 5) * 0.35 * u;
  const band = (u0, u1, v0, v1, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = u0 + ((u1 - u0) * i) / segs;
      ctx.lineTo(-u * len, -wid / 2 + v0 * wid + wave(u));
    }
    for (let i = segs; i >= 0; i--) {
      const u = u0 + ((u1 - u0) * i) / segs;
      ctx.lineTo(-u * len, -wid / 2 + v1 * wid + wave(u));
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 3; i++) {
    if (f.dir === "vertical") band(i / 3, (i + 1) / 3, 0, 1, f.colors[i]);
    else band(0, 1, i / 3, (i + 1) / 3, f.colors[i]);
  }
}

function ramLauncher(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#6c757b";
  circle(ctx, 0, 0, 2.0);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, -1.0, -1.0, 2.6, 2.3, 0.25);
  ctx.fill();
  ctx.fillStyle = "#b4bcc1";
  rr(ctx, -1.2, -1.05, 2.6, 2.1, 0.25);
  ctx.fill();
  ctx.fillStyle = "#23282b";
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      circle(ctx, 0.75 + row * 0.18, -0.75 + col * 0.3 + (row % 2 ? 0.15 : 0), 0.1);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * anim: { t, seed, ram (Winkel relativ achtern), radarAngle, flag, spots: Set belegter Landepunkte }
 */
export function drawCarrier(ctx, anim) {
  const t = anim.t;
  const ph = ((anim.seed || 0) % 1000) / 159;

  // Wasserlinien-Schatten
  ctx.save();
  ctx.translate(1.2, 1.8);
  ctx.fillStyle = "rgba(0,20,40,0.38)";
  hullPath(ctx, -0.4);
  ctx.fill();
  ctx.restore();

  // Bordwand und Flugdeck
  ctx.fillStyle = "#525c63";
  hullPath(ctx, 0);
  ctx.fill();
  const dg = ctx.createLinearGradient(0, -HB, 0, HB);
  dg.addColorStop(0, "#5f676d");
  dg.addColorStop(0.5, "#555d63");
  dg.addColorStop(1, "#4d555b");
  ctx.fillStyle = dg;
  hullPath(ctx, 0.8);
  ctx.fill();

  // Rutschfester Belag: Plattenraster
  ctx.save();
  hullPath(ctx, 0.8);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.08;
  for (let x = -HL; x < HL; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x, -HB);
    ctx.lineTo(x, HB);
    ctx.stroke();
  }
  for (let y = -HB; y < HB; y += 4) {
    ctx.beginPath();
    ctx.moveTo(-HL, y);
    ctx.lineTo(HL, y);
    ctx.stroke();
  }
  // Mittellinie (gestrichelt gelb) und weiße Randlinien
  ctx.strokeStyle = "rgba(240,200,60,0.85)";
  ctx.lineWidth = 0.35;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(-HL + 4, -4);
  ctx.lineTo(80, -4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(235,235,235,0.7)";
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-HL + 3, -HB + 1.6);
  ctx.lineTo(55, -HB + 1.6);
  ctx.moveTo(-HL + 3, 8.2);
  ctx.lineTo(-22, 8.2);
  ctx.moveTo(42, 8.2);
  ctx.lineTo(55, 8.2);
  ctx.stroke();
  ctx.restore();

  // Landepunkte mit Nummern
  D.heliSpots.forEach((sp, i) => {
    const used = anim.spots && anim.spots.has(i);
    ctx.strokeStyle = used ? "rgba(255,215,94,0.95)" : "rgba(240,240,240,0.75)";
    ctx.lineWidth = 0.35;
    circle(ctx, sp.x, sp.y, 8.2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(240,200,60,0.85)";
    ctx.beginPath();
    ctx.moveTo(sp.x - 2.5, sp.y);
    ctx.lineTo(sp.x + 2.5, sp.y);
    ctx.moveTo(sp.x, sp.y - 2.5);
    ctx.lineTo(sp.x, sp.y + 2.5);
    ctx.stroke();
    ctx.save();
    ctx.translate(sp.x - 6.2, sp.y);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "rgba(240,240,240,0.8)";
    ctx.font = "bold 2.4px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 0, 0);
    ctx.restore();
  });

  // Flugzeugaufzüge (achtern Mitte und Deckskanten-Aufzug Steuerbord)
  ctx.fillStyle = "#4a5258";
  ctx.strokeStyle = "rgba(240,200,60,0.7)";
  ctx.lineWidth = 0.3;
  rr(ctx, -84, -10, 13, 12, 0.3);
  ctx.fill();
  ctx.stroke();
  rr(ctx, -44, 9.5, 14, 6.6, 0.3);
  ctx.fill();
  ctx.stroke();

  // Insel (Aufbau) Steuerbord
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  rr(ctx, -19, 9.4, 64, 7.4, 0.6);
  ctx.fill();
  const ig = ctx.createLinearGradient(0, 8, 0, 15);
  ig.addColorStop(0, "#c7ced3");
  ig.addColorStop(1, "#9aa3a9");
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.moveTo(-20, 9);
  ctx.lineTo(38, 9);
  ctx.lineTo(42, 10.5);
  ctx.lineTo(42, 14.8);
  ctx.lineTo(-20, 14.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.12;
  ctx.stroke();
  // Brückenfenster
  ctx.fillStyle = "#1f3b52";
  ctx.beginPath();
  ctx.moveTo(37.6, 9.3);
  ctx.lineTo(41.6, 10.7);
  ctx.lineTo(41.6, 14.5);
  ctx.lineTo(40.8, 14.5);
  ctx.lineTo(40.8, 11.1);
  ctx.lineTo(37.2, 9.8);
  ctx.closePath();
  ctx.fill();
  // Oberdecks der Insel
  ctx.fillStyle = "#b6bec3";
  rr(ctx, -12, 10, 44, 4, 0.3);
  ctx.fill();
  // Schornstein mit Abgasöffnungen
  ctx.fillStyle = "#7d868c";
  rr(ctx, -16, 10.2, 7, 4.2, 0.6);
  ctx.fill();
  ctx.fillStyle = "#1a1d1f";
  rr(ctx, -15.2, 10.9, 2.4, 2.8, 0.4);
  ctx.fill();
  rr(ctx, -12.4, 10.9, 2.4, 2.8, 0.4);
  ctx.fill();
  // Flugleitstand (Glas zur Deckseite)
  ctx.fillStyle = "#24445e";
  rr(ctx, 2, 9.1, 9, 1.2, 0.3);
  ctx.fill();

  // Mast mit 3D-Radar (dreht) und Navigationsradar
  ctx.save();
  ctx.translate(18, 12);
  ctx.strokeStyle = "#596267";
  ctx.lineWidth = 0.25;
  ctx.strokeRect(-1.8, -1.8, 3.6, 3.6);
  ctx.beginPath();
  ctx.moveTo(-1.8, -1.8);
  ctx.lineTo(1.8, 1.8);
  ctx.moveTo(1.8, -1.8);
  ctx.lineTo(-1.8, 1.8);
  ctx.stroke();
  ctx.rotate(anim.radarAngle ?? t * 1.4 + ph);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, -0.5, -4.2, 1.6, 8.6, 0.3);
  ctx.fill();
  ctx.fillStyle = "#e3e8ea";
  rr(ctx, -0.8, -4.4, 1.6, 8.8, 0.3);
  ctx.fill();
  ctx.fillStyle = "#9aa4aa";
  rr(ctx, -0.8, -4.4, 0.5, 8.8, 0.2);
  ctx.fill();
  ctx.fillStyle = "#3d454a";
  circle(ctx, 0, 0, 0.6);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(28, 12.3);
  ctx.rotate((anim.radarAngle ?? t) * 1.8 + 1);
  ctx.fillStyle = "#dfe5e8";
  rr(ctx, -0.25, -2.2, 0.5, 4.4, 0.2);
  ctx.fill();
  ctx.restore();
  // Satcom-Kuppeln
  ctx.fillStyle = "#eef1f2";
  circle(ctx, 6, 12.6, 1.1);
  ctx.fill();
  circle(ctx, -4, 12.6, 1.1);
  ctx.fill();
  // Positionslaternen
  ctx.fillStyle = "#ff3b30";
  circle(ctx, 36, 9.4, 0.3);
  ctx.fill();
  ctx.fillStyle = "#34e35a";
  circle(ctx, 36, 14.5, 0.3);
  ctx.fill();

  // Deckskran achtern der Insel (schwenkt langsam)
  ctx.save();
  ctx.translate(-26, 12.5);
  ctx.rotate(Math.PI + Math.sin(t * 0.2 + ph) * 0.5);
  ctx.fillStyle = "#e0a526";
  rr(ctx, -0.6, -0.5, 10, 1, 0.3);
  ctx.fill();
  ctx.fillStyle = "#6b4f12";
  circle(ctx, 0, 0, 0.9);
  ctx.fill();
  ctx.restore();

  // RAM-Starter Heck (feuert) und Bug (schwenkt mit)
  const ramA = Math.PI + (anim.ram ?? Math.sin(t * 0.17 + ph) * 1.2);
  ramLauncher(ctx, D.ram.x, 9, ramA);
  ramLauncher(ctx, 80, -2, ramA + Math.PI);

  // Rettungsinseln an der Bordkante
  for (let x = -70; x < 40; x += 12) {
    ctx.fillStyle = "#d9dfe2";
    rr(ctx, x, HB - 1.0, 2.2, 0.9, 0.4);
    ctx.fill();
    rr(ctx, x, -HB + 0.1, 2.2, 0.9, 0.4);
    ctx.fill();
  }

  // Heckflagge
  ctx.save();
  ctx.translate(-HL + 0.5, 6);
  ctx.fillStyle = "#c0c6ca";
  circle(ctx, 0, 0, 0.2);
  ctx.fill();
  flag(ctx, t, ph, anim.flag);
  ctx.restore();

  // Rumpfkennung auf dem Vordeck
  ctx.save();
  ctx.translate(82, -4);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "rgba(240,244,246,0.75)";
  ctx.font = "bold 4.5px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(anim.hullNo || "L 21", 0, 0);
  ctx.restore();
}

export const CARRIER_EXHAUSTS = [
  [-14, 12.3],
  [-11.2, 12.3],
];
