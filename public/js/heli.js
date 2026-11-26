import { drawPod } from "./aircraft.js";
// UH-60 Black Hawk – Draufsicht in Metern, Nase = +x, Steuerbord = +y.
// Bewegliche Teile: Hauptrotor (4 Blätter), Heckrotor, Hellfire-Starter (leeren sich beim Feuern),
// Türschütze schwenkt zum Ziel, Positionslichter blinken.

const BODY = "#4b5548";
const BODY_DARK = "#3a4238";
const BODY_LIGHT = "#5f6a5b";
const ROTOR_R = 8.18;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function fuselagePath(ctx) {
  ctx.beginPath();
  ctx.moveTo(7.7, 0);
  ctx.bezierCurveTo(7.6, -0.9, 6.6, -1.2, 5.2, -1.2);
  ctx.lineTo(-2.6, -1.2);
  ctx.lineTo(-3.4, -0.55);
  ctx.lineTo(-10.2, -0.32);
  ctx.lineTo(-10.6, -0.2);
  ctx.lineTo(-10.6, 0.2);
  ctx.lineTo(-10.2, 0.32);
  ctx.lineTo(-3.4, 0.55);
  ctx.lineTo(-2.6, 1.2);
  ctx.lineTo(5.2, 1.2);
  ctx.bezierCurveTo(6.6, 1.2, 7.6, 0.9, 7.7, 0);
  ctx.closePath();
}

// Schatten auf der Wasseroberfläche (Silhouette ohne Details)
export function drawBlackhawkShadow(ctx, alpha = 0.3) {
  ctx.fillStyle = `rgba(0,15,30,${alpha})`;
  fuselagePath(ctx);
  ctx.fill();
  ctx.fillRect(-1.2, -4.4, 1.6, 8.8);
  ctx.fillRect(-10.9, -2.2, 1.1, 4.4);
  ctx.fillStyle = `rgba(0,15,30,${alpha * 0.35})`;
  circle(ctx, 0.6, 0, ROTOR_R);
  ctx.fill();
}

/**
 * anim: { t, seed, hf: Anzahl verbleibender Hellfire (0..8), gunner: Winkel des Türschützen, flag, flares }
 */
export function drawBlackhawk(ctx, anim) {
  const t = anim.t;
  const ph = ((anim.seed || 0) % 1000) / 97;
  const hf = anim.hf ?? 8;

  // Stummelflügel (ESSS) mit Hellfire-Startern M299
  ctx.fillStyle = BODY_DARK;
  rr(ctx, -1.3, -4.5, 1.8, 9.0, 0.3);
  ctx.fill();
  for (const side of [-1, 1]) {
    // Starterschiene
    ctx.fillStyle = "#2d332c";
    rr(ctx, -2.4, side * 3.4 - 0.95, 3.2, 1.9, 0.2);
    ctx.fill();
    if (anim.pod && anim.pod !== "hellfire") {
      // andere Hangar-Bewaffnung: Stinger bzw. Raketenbehälter
      for (let i = 0; i < 2; i++) {
        const idx = side < 0 ? i * 2 : i * 2 + 1;
        drawPod(ctx, anim.pod, -0.8, side * 3.4 + (i - 0.5) * 0.9, anim.pod === "rkt70" ? hf > 0 : idx < hf, t);
      }
      continue;
    }
    // 4 Flugkörper pro Seite (zwei Reihen à zwei, von oben versetzt sichtbar)
    for (let i = 0; i < 4; i++) {
      // Reihenfolge des Abfeuerns: abwechselnd links/rechts
      const idx = side < 0 ? i * 2 : i * 2 + 1;
      const present = idx < hf;
      const y = side * 3.4 + (i - 1.5) * 0.45;
      if (present) {
        ctx.fillStyle = "#c9c9b8";
        rr(ctx, -2.5, y - 0.18, 3.2, 0.36, 0.17);
        ctx.fill();
        ctx.fillStyle = "#2b2b2b";
        circle(ctx, 0.7, y, 0.16);
        ctx.fill();
        ctx.fillStyle = "#a1a28d";
        ctx.fillRect(-2.5, y - 0.3, 0.35, 0.6);
      } else {
        ctx.fillStyle = "rgba(20,20,20,0.6)";
        ctx.fillRect(-2.4, y - 0.08, 3.0, 0.16);
      }
    }
  }

  // Rumpf
  const g = ctx.createLinearGradient(0, -1.2, 0, 1.2);
  g.addColorStop(0, BODY_LIGHT);
  g.addColorStop(0.5, BODY);
  g.addColorStop(1, BODY_DARK);
  ctx.fillStyle = g;
  fuselagePath(ctx);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.06;
  ctx.stroke();

  // Cockpitverglasung
  ctx.fillStyle = "#1c2d3a";
  ctx.beginPath();
  ctx.moveTo(7.4, 0);
  ctx.bezierCurveTo(7.3, -0.7, 6.5, -1.0, 5.4, -1.0);
  ctx.lineTo(4.6, -1.0);
  ctx.lineTo(4.6, 1.0);
  ctx.lineTo(5.4, 1.0);
  ctx.bezierCurveTo(6.5, 1.0, 7.3, 0.7, 7.4, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(140,180,210,0.6)";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(4.6, 0);
  ctx.lineTo(7.3, 0);
  ctx.moveTo(5.8, -1.0);
  ctx.lineTo(5.8, 1.0);
  ctx.stroke();
  // Kabinentüren (Schiebetüren offen: dunkel)
  ctx.fillStyle = "#1b1f1a";
  ctx.fillRect(1.4, -1.22, 2.6, 0.22);
  ctx.fillRect(1.4, 1.0, 2.6, 0.22);
  // Türschütze mit M240 (schwenkt zum Ziel)
  ctx.save();
  ctx.translate(2.0, 1.15);
  ctx.rotate(anim.gunner ?? Math.PI / 2);
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, -0.06, 1.4, 0.12);
  ctx.restore();
  ctx.save();
  ctx.translate(2.0, -1.15);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, -0.06, 1.2, 0.12);
  ctx.restore();

  // Triebwerksverkleidungen (2 × T700) und Abgasaustritte
  for (const side of [-1, 1]) {
    ctx.fillStyle = BODY_LIGHT;
    rr(ctx, -1.6, side * 0.75 - 0.45, 3.4, 0.9, 0.4);
    ctx.fill();
    ctx.fillStyle = "#1a1d19";
    rr(ctx, -1.9, side * 0.95 - 0.25, 0.6, 0.5, 0.15);
    ctx.fill();
  }
  ctx.fillStyle = BODY_DARK;
  rr(ctx, -0.4, -0.45, 2.2, 0.9, 0.3); // Getriebe
  ctx.fill();

  // Heckausleger-Details, Stabilator und Heckpylon
  ctx.fillStyle = BODY_DARK;
  rr(ctx, -10.9, -2.2, 1.1, 4.4, 0.3);
  ctx.fill();
  ctx.fillStyle = BODY;
  rr(ctx, -10.7, -0.35, 1.6, 0.7, 0.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.05;
  for (let x = -9.5; x < -3.5; x += 1.2) {
    ctx.beginPath();
    ctx.moveTo(x, -0.4);
    ctx.lineTo(x, 0.4);
    ctx.stroke();
  }

  // Teamflagge (aufgemalt) an der Kabinenseite
  if (anim.flag) {
    const f = anim.flag;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = f.colors[i];
      if (f.dir === "vertical") ctx.fillRect(-1.8 + i * 0.4, -1.1, 0.4, 0.5);
      else ctx.fillRect(-1.8, -1.1 + i * 0.167, 1.2, 0.17);
    }
  }

  // Positionslichter (blinken)
  const blink = Math.sin(t * 6 + ph) > 0.6;
  ctx.fillStyle = "#ff3b30";
  circle(ctx, 0, -4.5, 0.18);
  ctx.fill();
  ctx.fillStyle = "#34e35a";
  circle(ctx, 0, 4.5, 0.18);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = "rgba(255,80,60,0.9)";
    circle(ctx, -6, 0, 0.35);
    ctx.fill();
  }

  // Heckrotor: steht senkrecht → von oben als schmale, flirrende Scheibe an der rechten Seite
  ctx.save();
  ctx.translate(-10.1, 0.75);
  ctx.fillStyle = "rgba(30,30,30,0.35)";
  rr(ctx, -1.7, -0.12, 3.4, 0.24, 0.12);
  ctx.fill();
  const tb = Math.sin(t * 90 + ph) * 1.6;
  ctx.fillStyle = "rgba(25,25,25,0.85)";
  ctx.fillRect(tb - 0.12, -0.1, 0.24, 0.2);
  ctx.restore();

  // Hauptrotor: Scheibe + 4 Blätter mit Bewegungsunschärfe
  ctx.save();
  ctx.translate(0.6, 0);
  const disc = ctx.createRadialGradient(0, 0, 0.8, 0, 0, ROTOR_R);
  disc.addColorStop(0, "rgba(40,40,40,0.18)");
  disc.addColorStop(0.85, "rgba(40,40,40,0.12)");
  disc.addColorStop(1, "rgba(40,40,40,0.04)");
  ctx.fillStyle = disc;
  circle(ctx, 0, 0, ROTOR_R);
  ctx.fill();
  const a0 = t * 14 + ph;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    // Unschärfe-Sektor hinter jedem Blatt
    ctx.fillStyle = "rgba(25,25,25,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, ROTOR_R, a - 0.45, a);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = "rgba(20,20,20,0.75)";
    rr(ctx, 0.4, -0.27, ROTOR_R - 0.4, 0.54, 0.2);
    ctx.fill();
    ctx.fillStyle = "rgba(230,200,40,0.85)"; // gelbe Blattspitze
    ctx.fillRect(ROTOR_R - 0.6, -0.27, 0.6, 0.54);
    ctx.restore();
  }
  ctx.fillStyle = "#2a2f29";
  circle(ctx, 0, 0, 0.6);
  ctx.fill();
  ctx.restore();
}

export const HELI_ROTOR_R = ROTOR_R;
