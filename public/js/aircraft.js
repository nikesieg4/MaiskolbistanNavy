// Luftfahrzeuge in Draufsicht (Meter, Nase = +x): NH90 NFH (Maiskolbistan) und die Aufklärungsdrohnen
// Heron TP (Maiskolbistan) und MQ-9 Reaper (Paprikistan).
// Bewegliche Teile: Rotoren bzw. Druckpropeller drehen, Marte/ARM verschwinden beim Abfeuern, Lichter blinken.

const TAU = Math.PI * 2;
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function rotorDisc(ctx, x, y, R, t, blades, ph, tip = "rgba(230,200,40,0.85)") {
  ctx.save();
  ctx.translate(x, y);
  const disc = ctx.createRadialGradient(0, 0, 0.8, 0, 0, R);
  disc.addColorStop(0, "rgba(40,40,40,0.18)");
  disc.addColorStop(0.85, "rgba(40,40,40,0.12)");
  disc.addColorStop(1, "rgba(40,40,40,0.04)");
  ctx.fillStyle = disc;
  circle(ctx, 0, 0, R);
  ctx.fill();
  const a0 = t * 14 + ph;
  for (let k = 0; k < blades; k++) {
    const a = a0 + (k * TAU) / blades;
    ctx.fillStyle = "rgba(25,25,25,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a - 0.45, a);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = "rgba(20,20,20,0.75)";
    rr(ctx, 0.4, -0.3, R - 0.4, 0.6, 0.2);
    ctx.fill();
    ctx.fillStyle = tip;
    ctx.fillRect(R - 0.6, -0.3, 0.6, 0.6);
    ctx.restore();
  }
  ctx.fillStyle = "#2a2f29";
  circle(ctx, 0, 0, 0.65);
  ctx.fill();
  ctx.restore();
}

// ---------- NH90 NFH ----------
const NH_BODY = "#6c7680";
const NH_DARK = "#525b64";
const NH_LIGHT = "#86909a";

function nhPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(7.6, 0);
  ctx.bezierCurveTo(7.5, -1.2, 6.2, -1.6, 4.6, -1.6);
  ctx.lineTo(-2.6, -1.6);
  ctx.lineTo(-3.6, -0.6);
  ctx.lineTo(-10.4, -0.36);
  ctx.lineTo(-10.6, 0);
  ctx.lineTo(-10.4, 0.36);
  ctx.lineTo(-3.6, 0.6);
  ctx.lineTo(-2.6, 1.6);
  ctx.lineTo(4.6, 1.6);
  ctx.bezierCurveTo(6.2, 1.6, 7.5, 1.2, 7.6, 0);
  ctx.closePath();
}

export function drawNH90Shadow(ctx, alpha = 0.3) {
  ctx.fillStyle = `rgba(0,15,30,${alpha})`;
  nhPath(ctx);
  ctx.fill();
  ctx.fillRect(-1.6, -2.6, 3.2, 5.2);
  ctx.fillStyle = `rgba(0,15,30,${alpha * 0.35})`;
  circle(ctx, 0.4, 0, 8.15);
  ctx.fill();
}

/** anim: { t, seed, n (verbleibende Marte 0..4), gunner, flag } */
export function drawNH90(ctx, a) {
  const t = a.t;
  const ph = ((a.seed || 0) % 1000) / 97;
  const n = a.n ?? 4;
  // Seitliche Sponsons mit Fahrwerk und Marte-Startern
  for (const side of [-1, 1]) {
    ctx.fillStyle = NH_DARK;
    rr(ctx, -1.8, side * 1.6 - (side < 0 ? 1.1 : 0), 3.6, 1.1, 0.5);
    ctx.fill();
    for (let i = 0; i < 2; i++) {
      const idx = side < 0 ? i * 2 : i * 2 + 1;
      const y = side * (2.4 + i * 0.55);
      if (idx < n) {
        ctx.fillStyle = "#d8dcd0";
        rr(ctx, -1.8, y - 0.22, 4.0, 0.44, 0.2);
        ctx.fill();
        ctx.fillStyle = "#2b2b2b";
        circle(ctx, 2.2, y, 0.2);
        ctx.fill();
        ctx.fillStyle = "#b9bdb1";
        ctx.fillRect(-1.8, y - 0.45, 0.4, 0.9);
      } else {
        ctx.fillStyle = "rgba(20,20,20,0.55)";
        ctx.fillRect(-1.6, y - 0.08, 3.6, 0.16);
      }
    }
  }
  const g = ctx.createLinearGradient(0, -1.6, 0, 1.6);
  g.addColorStop(0, NH_LIGHT);
  g.addColorStop(0.5, NH_BODY);
  g.addColorStop(1, NH_DARK);
  ctx.fillStyle = g;
  nhPath(ctx);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // Radarkuppel unter dem Rumpf (ragt seitlich hervor) und Cockpit
  ctx.fillStyle = "rgba(230,232,232,0.9)";
  circle(ctx, 2.6, 0, 1.1);
  ctx.fill();
  ctx.fillStyle = "#1c2d3a";
  ctx.beginPath();
  ctx.moveTo(7.3, 0);
  ctx.bezierCurveTo(7.2, -1.0, 6.2, -1.35, 5.0, -1.35);
  ctx.lineTo(4.4, -1.35);
  ctx.lineTo(4.4, 1.35);
  ctx.lineTo(5.0, 1.35);
  ctx.bezierCurveTo(6.2, 1.35, 7.2, 1.0, 7.3, 0);
  ctx.fill();
  // Triebwerke
  for (const side of [-1, 1]) {
    ctx.fillStyle = NH_LIGHT;
    rr(ctx, -2.2, side * 0.8 - 0.45, 3.6, 0.9, 0.4);
    ctx.fill();
    ctx.fillStyle = "#1a1d19";
    rr(ctx, -2.5, side * 1.0 - 0.25, 0.6, 0.5, 0.15);
    ctx.fill();
  }
  // Türschütze
  ctx.save();
  ctx.translate(1.5, 1.55);
  ctx.rotate(a.gunner ?? Math.PI / 2);
  ctx.fillStyle = "#151515";
  ctx.fillRect(0, -0.06, 1.4, 0.12);
  ctx.restore();
  // Heck: Leitwerk und Heckrotor (links)
  ctx.fillStyle = NH_DARK;
  rr(ctx, -10.8, -1.8, 1.0, 3.6, 0.3);
  ctx.fill();
  ctx.save();
  ctx.translate(-10.2, -0.7);
  ctx.fillStyle = "rgba(30,30,30,0.35)";
  rr(ctx, -1.6, -0.12, 3.2, 0.24, 0.12);
  ctx.fill();
  ctx.fillStyle = "rgba(25,25,25,0.85)";
  ctx.fillRect(Math.sin(t * 90 + ph) * 1.5 - 0.12, -0.1, 0.24, 0.2);
  ctx.restore();
  // Teamflagge
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(-1.6 + i * 0.4, -1.5, 0.4, 0.5);
      else ctx.fillRect(-1.6, -1.5 + i * 0.167, 1.2, 0.17);
    }
  }
  if (Math.sin(t * 6 + ph) > 0.6) {
    ctx.fillStyle = "rgba(255,80,60,0.9)";
    circle(ctx, -6, 0, 0.35);
    ctx.fill();
  }
  rotorDisc(ctx, 0.4, 0, 8.15, t, 4, ph, "rgba(240,240,240,0.85)");
}

// ---------- Drohnen ----------

function prop(ctx, x, t, ph, r) {
  ctx.save();
  ctx.translate(x, 0);
  // Druckpropeller steht senkrecht → von oben als flirrende Linie
  ctx.fillStyle = "rgba(30,30,30,0.3)";
  rr(ctx, -0.12, -r, 0.24, r * 2, 0.1);
  ctx.fill();
  ctx.fillStyle = "rgba(20,20,20,0.85)";
  const p = Math.sin(t * 70 + ph) * r;
  ctx.fillRect(-0.12, p - 0.15, 0.24, 0.3);
  ctx.restore();
}

function armUnder(ctx, x, y, present) {
  if (present) {
    ctx.fillStyle = "#e4e6e2";
    rr(ctx, x - 2.0, y - 0.18, 4.1, 0.36, 0.17);
    ctx.fill();
    ctx.fillStyle = "#9a9d98";
    ctx.fillRect(x - 0.2, y - 0.5, 0.25, 1.0);
    ctx.fillRect(x - 1.9, y - 0.45, 0.25, 0.9);
    ctx.fillStyle = "#2b2b2b";
    circle(ctx, x + 2.1, y, 0.17);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(30,30,30,0.6)";
    ctx.fillRect(x - 0.6, y - 0.1, 1.2, 0.2);
  }
}

export function drawDroneShadow(ctx, type, alpha = 0.25) {
  ctx.fillStyle = `rgba(0,15,30,${alpha})`;
  if (type === "heron") {
    ctx.fillRect(-6, -0.6, 13, 1.2);
    ctx.fillRect(-0.6, -13, 1.6, 26);
    ctx.fillRect(-6.5, -2.4, 0.5, 4.8);
  } else {
    ctx.fillRect(-5.5, -0.5, 11, 1);
    ctx.fillRect(-0.4, -10, 1.3, 20);
  }
}

/** anim: { t, seed, n (verbleibende ARM), flag } */
export function drawHeron(ctx, a) {
  const t = a.t;
  const ph = ((a.seed || 0) % 1000) / 97;
  const n = a.n ?? 2;
  // Doppelte Leitwerksträger
  ctx.fillStyle = "#c9ced2";
  for (const y of [-2.4, 2.4]) {
    rr(ctx, -6.6, y - 0.18, 7.0, 0.36, 0.15);
    ctx.fill();
  }
  ctx.fillStyle = "#b9bfc3";
  rr(ctx, -6.9, -2.6, 0.7, 5.2, 0.2);
  ctx.fill();
  // Flügel (26 m)
  const wg = ctx.createLinearGradient(0, -13, 0, 13);
  wg.addColorStop(0, "#d9dde0");
  wg.addColorStop(0.5, "#c7cdd1");
  wg.addColorStop(1, "#b5bcc1");
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.moveTo(1.0, -13);
  ctx.lineTo(1.4, -1);
  ctx.lineTo(1.4, 1);
  ctx.lineTo(1.0, 13);
  ctx.lineTo(-0.4, 13);
  ctx.lineTo(-0.6, 1);
  ctx.lineTo(-0.6, -1);
  ctx.lineTo(-0.4, -13);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.05;
  ctx.stroke();
  armUnder(ctx, 0.3, -6, n > 0);
  armUnder(ctx, 0.3, 6, n > 1);
  // Rumpf mit Satellitenbuckel
  const g = ctx.createLinearGradient(0, -0.9, 0, 0.9);
  g.addColorStop(0, "#e2e6e8");
  g.addColorStop(1, "#aab1b6");
  ctx.fillStyle = g;
  rr(ctx, -4.5, -0.9, 11.5, 1.8, 0.9);
  ctx.fill();
  ctx.fillStyle = "#c2c8cc";
  circle(ctx, 4.2, 0, 0.75);
  ctx.fill();
  // Sensorkugel unter der Nase
  ctx.fillStyle = "#2c3236";
  circle(ctx, 6.2, 0, 0.35);
  ctx.fill();
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(-2 + i * 0.35, -0.5, 0.35, 0.42);
      else ctx.fillRect(-2, -0.5 + i * 0.14, 1.05, 0.15);
    }
  }
  prop(ctx, -4.7, t, ph, 1.6);
  if (Math.sin(t * 5 + ph) > 0.7) {
    ctx.fillStyle = "rgba(255,80,60,0.9)";
    circle(ctx, -0.2, -12.8, 0.25);
    ctx.fill();
    ctx.fillStyle = "rgba(60,255,100,0.9)";
    circle(ctx, -0.2, 12.8, 0.25);
    ctx.fill();
  }
}

export function drawReaper(ctx, a) {
  const t = a.t;
  const ph = ((a.seed || 0) % 1000) / 97;
  const n = a.n ?? 2;
  // Flügel (20 m), leicht gepfeilt
  const wg = ctx.createLinearGradient(0, -10, 0, 10);
  wg.addColorStop(0, "#a9afb3");
  wg.addColorStop(1, "#8a9196");
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.moveTo(0.8, -10);
  ctx.lineTo(1.4, -0.8);
  ctx.lineTo(1.4, 0.8);
  ctx.lineTo(0.8, 10);
  ctx.lineTo(-0.2, 10);
  ctx.lineTo(-0.4, 0.8);
  ctx.lineTo(-0.4, -0.8);
  ctx.lineTo(-0.2, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.05;
  ctx.stroke();
  armUnder(ctx, 0.4, -5, n > 0);
  armUnder(ctx, 0.4, 5, n > 1);
  // Rumpf: schlank, bauchige Nase
  const g = ctx.createLinearGradient(0, -0.7, 0, 0.7);
  g.addColorStop(0, "#b4babe");
  g.addColorStop(1, "#7f868b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(5.6, 0);
  ctx.bezierCurveTo(5.5, -0.9, 4.4, -0.85, 3, -0.7);
  ctx.lineTo(-5, -0.4);
  ctx.lineTo(-5, 0.4);
  ctx.lineTo(3, 0.7);
  ctx.bezierCurveTo(4.4, 0.85, 5.5, 0.9, 5.6, 0);
  ctx.fill();
  // Umgekehrtes Y-Leitwerk (von oben zwei schräge Flossen + Kiel)
  ctx.fillStyle = "#8c9398";
  ctx.beginPath();
  ctx.moveTo(-3.8, 0);
  ctx.lineTo(-5.2, -2.6);
  ctx.lineTo(-5.6, -2.6);
  ctx.lineTo(-5.0, 0);
  ctx.lineTo(-5.6, 2.6);
  ctx.lineTo(-5.2, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2c3236";
  circle(ctx, 4.6, 0.3, 0.32);
  ctx.fill();
  if (a.flag) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = a.flag.colors[i];
      if (a.flag.dir === "vertical") ctx.fillRect(-2 + i * 0.3, -0.35, 0.3, 0.36);
      else ctx.fillRect(-2, -0.35 + i * 0.12, 0.9, 0.13);
    }
  }
  prop(ctx, -5.2, t, ph, 1.4);
  if (Math.sin(t * 5 + ph) > 0.7) {
    ctx.fillStyle = "rgba(255,80,60,0.9)";
    circle(ctx, 0.2, -9.8, 0.22);
    ctx.fill();
    ctx.fillStyle = "rgba(60,255,100,0.9)";
    circle(ctx, 0.2, 9.8, 0.22);
    ctx.fill();
  }
}
