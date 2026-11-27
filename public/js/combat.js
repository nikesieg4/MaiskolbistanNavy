// Flugkörper, Granaten, Explosionen, Wracks und AGIS-Lock-Anzeige (nur Darstellung).
import { PROJ, TEAMS, TYPE_BY_ID, BOATS } from "../shared/sim.js";
import { drawVehicle } from "./vehicles.js";

const particles = [];
const wrecks = [];
const flashes = [];
const rings = [];

const rand = (a, b) => a + Math.random() * (b - a);

function puff(x, y, o) {
  particles.push({
    x,
    y,
    vx: o.vx ?? 0,
    vy: o.vy ?? 0,
    r: o.r ?? 1,
    grow: o.grow ?? 1,
    life: o.life ?? 1,
    age: 0,
    color: o.color ?? "80,80,80",
    alpha: o.alpha ?? 0.4,
    drag: o.drag ?? 1.5,
    glow: o.glow ?? false,
  });
}

function burst(x, y, n, speed, o) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(0.2, 1) * speed;
    puff(x, y, { ...o, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(0.6, 1.4) * (o.r ?? 1), life: rand(0.6, 1.2) * (o.life ?? 1) });
  }
}

function explosion(x, y, size) {
  flashes.push({ x, y, r: size * 3, age: 0, life: 0.25 });
  rings.push({ x, y, r: size, grow: size * 18, age: 0, life: 0.6, color: "255,240,210", width: size * 0.35 });
  burst(x, y, 10 + size * 3, size * 14, { r: size * 1.1, grow: size * 0.8, life: 0.7, color: "255,170,60", alpha: 0.9, glow: true, drag: 4 });
  burst(x, y, 8 + size * 3, size * 6, { r: size * 1.6, grow: size * 2.4, life: 3.2, color: "45,45,45", alpha: 0.5, drag: 1.2 });
  burst(x, y, 6 + size * 2, size * 22, { r: size * 0.25, grow: 0, life: 0.8, color: "40,35,30", alpha: 0.9, drag: 1 });
}

function splash(x, y, size) {
  rings.push({ x, y, r: size * 0.5, grow: size * 7, age: 0, life: 1.4, color: "235,248,255", width: size * 0.4 });
  burst(x, y, 10 + size * 2, size * 7, { r: size * 0.7, grow: size * 0.6, life: 1.0, color: "240,250,255", alpha: 0.85, drag: 3 });
}

// Server-Ereignis → Effekt
export function spawnEvent(e) {
  const [type, x, y, h] = e;
  switch (type) {
    case "muzzle":
      flashes.push({ x, y, r: 6, age: 0, life: 0.1 });
      for (let i = 0; i < 5; i++) puff(x, y, { vx: Math.cos(h) * rand(4, 14) + rand(-2, 2), vy: Math.sin(h) * rand(4, 14) + rand(-2, 2), r: 1.2, grow: 3, life: 1.4, color: "200,200,200", alpha: 0.45 });
      break;
    case "launch":
      flashes.push({ x, y, r: 9, age: 0, life: 0.2 });
      for (let i = 0; i < 14; i++) puff(x, y, { vx: -Math.cos(h) * rand(2, 14) + rand(-4, 4), vy: -Math.sin(h) * rand(2, 14) + rand(-4, 4), r: 1.4, grow: 2.2, life: rand(1.5, 2.5), color: "225,225,225", alpha: 0.32, drag: 1.2 });
      break;
    case "splash":
      splash(x, y, 4);
      break;
    case "hit":
      explosion(x, y, 1.6);
      break;
    case "bighit":
      explosion(x, y, 4.5);
      break;
    case "dirt":
      burst(x, y, 12, 12, { r: 2, grow: 2, life: 1.5, color: "120,95,60", alpha: 0.7, drag: 2 });
      break;
    case "air":
    case "intercept":
      flashes.push({ x, y, r: type === "intercept" ? 18 : 8, age: 0, life: 0.2 });
      burst(x, y, 14, 30, { r: 1.2, grow: 1, life: 0.5, color: "255,200,90", alpha: 0.9, glow: true, drag: 4 });
      burst(x, y, 8, 8, { r: 2.5, grow: 3, life: 2.5, color: "30,30,30", alpha: 0.55, drag: 1.5 });
      break;
    case "sink":
      sinkAt(x, y, h, e[4] | 0, e[5] | 0);
      break;
    case "rescue":
      burst(x, y, 12, 10, { r: 0.8, grow: 0.5, life: 0.8, color: "255,255,255", alpha: 0.9, glow: true, drag: 3 });
      rings.push({ x, y, r: 3, grow: 25, age: 0, life: 0.8, color: "255,215,94", width: 1.5 });
      break;
    case "crash":
      crashAt(x, y, h);
      break;
    case "hflaunch":
      flashes.push({ x, y, r: 4, age: 0, life: 0.15 });
      for (let i = 0; i < 6; i++) puff(x, y, { vx: -Math.cos(h) * rand(4, 12) + rand(-2, 2), vy: -Math.sin(h) * rand(4, 12) + rand(-2, 2), r: 0.8, grow: 1.6, life: 1.4, color: "220,220,220", alpha: 0.35 });
      break;
    case "spark":
      burst(x, y, 4, 10, { r: 0.4, grow: 0, life: 0.25, color: "255,220,120", alpha: 0.9, glow: true, drag: 3 });
      break;
    case "spray":
      burst(x, y, 3, 3, { r: 0.6, grow: 0.6, life: 0.6, color: "235,248,255", alpha: 0.7, drag: 3 });
      break;
    case "catapult":
      // Katapultstart: Dampfwolke am Katapult
      for (let i = 0; i < 18; i++) puff(x - Math.cos(h) * rand(0, 60), y - Math.sin(h) * rand(0, 60), { vx: rand(-4, 4), vy: rand(-4, 4), r: 2, grow: 3, life: rand(1.2, 2.2), color: "245,245,245", alpha: 0.55, drag: 1.5 });
      break;
    case "trap":
      // Fangseil: Reifenqualm beim Aufsetzen
      burst(x, y, 10, 8, { r: 1.2, grow: 2, life: 1.2, color: "200,200,200", alpha: 0.5, drag: 2 });
      break;
    case "buoy":
      splash(x, y, 1.5);
      break;
    case "torp":
      // Torpedoausstoß: Luftblasen
      burst(x, y, 10, 6, { r: 0.8, grow: 0.8, life: 1.6, color: "220,240,255", alpha: 0.7, drag: 2 });
      break;
    case "torphit":
      // Wassersäule unter dem Kiel
      explosion(x, y, 3);
      rings.push({ x, y, r: 6, grow: 60, age: 0, life: 1.8, color: "235,248,255", width: 3 });
      burst(x, y, 40, 24, { r: 3, grow: 2.5, life: 2.4, color: "240,250,255", alpha: 0.85, drag: 2 });
      break;
    case "torpend":
      burst(x, y, 6, 4, { r: 0.8, grow: 0.6, life: 1.2, color: "220,240,255", alpha: 0.5, drag: 2 });
      break;
    case "decoy":
      for (let i = 0; i < 4; i++) setTimeout(() => burst(x + rand(-20, 20), y + rand(-20, 20), 10, 8, { r: 1, grow: 1.4, life: 2, color: "220,240,255", alpha: 0.6, drag: 2 }), i * 250);
      break;
    case "flare":
      // Täuschkörper: helle, fallende Leuchtkugeln seitlich nach hinten
      for (const side of [-1, 1]) {
        const a = h + Math.PI + side * 0.9;
        puff(x, y, { vx: Math.cos(a) * rand(14, 22), vy: Math.sin(a) * rand(14, 22), r: 1.1, grow: -0.4, life: 1.6, color: "255,245,200", alpha: 1, glow: true, drag: 1.2 });
        puff(x, y, { vx: Math.cos(a) * rand(8, 14), vy: Math.sin(a) * rand(8, 14), r: 1.2, grow: 2, life: 2.5, color: "235,235,235", alpha: 0.35, drag: 1 });
      }
      break;
  }
}

export function sinkAt(x, y, h, team = 0, typeId = 0) {
  const big = (BOATS[TYPE_BY_ID[typeId]] || BOATS.gepard).length > 120;
  explosion(x, y, big ? 10 : 7);
  for (let i = 0; i < (big ? 12 : 6); i++) {
    const d = rand(-22, 22) * (big ? 3.5 : 1);
    setTimeout(() => explosion(x + Math.cos(h) * d, y + Math.sin(h) * d, rand(2, 4) * (big ? 1.6 : 1)), rand(100, big ? 3500 : 2200));
  }
  wrecks.push({ x, y, h, team, typeId, age: 0, life: big ? 10 : 7, roll: rand(-0.25, 0.25) });
}

// Hubschrauber stürzt ab: Feuerball, Trümmer, Aufschlag im Wasser
export function crashAt(x, y, h) {
  explosion(x, y, 3.5);
  burst(x, y, 14, 25, { r: 0.5, grow: 0, life: 1.2, color: "40,40,40", alpha: 0.9, drag: 1.5 });
  setTimeout(() => splash(x + Math.cos(h) * 8, y + Math.sin(h) * 8, 6), 600);
}

// Lichtquellen für die Nacht: Mündungsfeuer, Explosionen, brennende Wracks
export function lightSources() {
  const out = [];
  for (const f of flashes) out.push({ x: f.x, y: f.y, r: f.r * 8 });
  for (const w of wrecks) if (w.age < w.life * 0.7) out.push({ x: w.x, y: w.y, r: 80 });
  return out;
}

// Abgasspuren der Flugkörper: durchgehende Rauchfahne, die breiter wird und verblasst
const trails = new Map(); // id -> { pts: [{x,y,age}], big, alive }
const TRAIL_LIFE = 2.6;
export function emitTrails(projs, dt) {
  for (const tr of trails.values()) {
    tr.alive = false;
    for (const p of tr.pts) p.age += dt;
    while (tr.pts.length && tr.pts[0].age > TRAIL_LIFE) tr.pts.shift();
  }
  for (const q of projs) {
    if (q.type === PROJ.SHELL || q.type === PROJ.BULLET || q.type === PROJ.TORP || q.type === PROJ.BOMB) continue;
    let tr = trails.get(q.id);
    if (!tr) trails.set(q.id, (tr = { pts: [], big: q.type === PROJ.EXOCET || q.type === PROJ.ARM }));
    tr.alive = true;
    const back = tr.big ? 3.4 : 1.8;
    const x = q.x - Math.cos(q.h) * back;
    const y = q.y - Math.sin(q.h) * back;
    const last = tr.pts[tr.pts.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 2) tr.pts.push({ x, y, age: 0, wob: rand(-1, 1) });
  }
  for (const [id, tr] of trails) if (!tr.alive && tr.pts.length === 0) trails.delete(id);
}

function drawTrails(ctx) {
  ctx.lineCap = "round";
  for (const tr of trails.values()) {
    const pts = tr.pts;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[i - 1];
      const k = p.age / TRAIL_LIFE;
      const a = (tr.big ? 0.5 : 0.38) * (1 - k);
      if (a <= 0.01) continue;
      ctx.strokeStyle = `rgba(232,236,238,${a})`;
      ctx.lineWidth = (tr.big ? 0.9 : 0.5) + k * (tr.big ? 7 : 4);
      const drift = k * 3;
      ctx.beginPath();
      ctx.moveTo(q.x + q.wob * drift + drift, q.y + q.wob * drift);
      ctx.lineTo(p.x + p.wob * drift + drift, p.y + p.wob * drift);
      ctx.stroke();
    }
  }
}

export function updateEffects(dt) {
  for (const p of particles) {
    p.age += dt;
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vy *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.r += p.grow * dt;
  }
  for (const arr of [particles, flashes, rings, wrecks]) {
    for (const f of arr) if (arr !== particles) f.age += dt;
    let w = 0;
    for (const f of arr) if (f.age < f.life) arr[w++] = f;
    arr.length = w;
  }
  if (particles.length > 4000) particles.splice(0, particles.length - 4000);
}

// Unter den Schiffen: Wracks, Wasserringe
export function drawEffectsBelow(ctx, t) {
  for (const w of wrecks) {
    const k = w.age / w.life;
    // Ölfleck
    ctx.fillStyle = `rgba(10,15,20,${0.35 * (1 - k)})`;
    ctx.beginPath();
    ctx.ellipse(w.x, w.y, 30 + k * 40, 14 + k * 30, w.h, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.h + w.roll * k);
    const sc = 1 - k * 0.25;
    ctx.scale(sc, sc * (1 - k * 0.35));
    ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
    ctx.filter = `brightness(${0.55 - k * 0.3})`;
    const type = TYPE_BY_ID[w.typeId] || "gepard";
    const d = BOATS[type];
    const empty = d.weapons.map((k) => (k && d.ssm && /exocet|rbs15|harpoon|nsm|griffin/.test(k) ? d.ssm.map(() => 1) : [0, 0, 0]));
    drawVehicle(ctx, type, { t: 0, seed: 1, gun: 0.4, ram: -0.6, ammo: empty, flag: TEAMS[w.team].flag });
    ctx.filter = "none";
    ctx.restore();
    ctx.globalAlpha = 1;
    if (Math.random() < 0.5) {
      puff(w.x + rand(-15, 15), w.y + rand(-15, 15), { r: 2, grow: 4, life: 3, color: "30,30,30", alpha: 0.4 * (1 - k), vx: 2, vy: 1 });
    }
    if (Math.random() < 0.35 * (1 - k)) {
      puff(w.x + rand(-12, 12), w.y + rand(-6, 6), { r: 1.5, grow: 1, life: 0.6, color: "255,140,40", alpha: 0.8, glow: true });
    }
  }
  for (const r of rings) {
    const k = r.age / r.life;
    ctx.strokeStyle = `rgba(${r.color},${0.6 * (1 - k)})`;
    ctx.lineWidth = r.width * (1 - k * 0.5);
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + r.grow * k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Über den Schiffen: Rauch, Feuer, Blitze
export function drawEffectsAbove(ctx) {
  drawTrails(ctx);
  for (const p of particles) {
    const k = p.age / p.life;
    const a = p.alpha * (1 - k) * (p.glow ? 1 : Math.min(1, (1 - k) * 2));
    if (a <= 0.005) continue;
    ctx.fillStyle = `rgba(${p.color},${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const f of flashes) {
    const k = f.age / f.life;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, `rgba(255,255,230,${0.95 * (1 - k)})`);
    g.addColorStop(0.4, `rgba(255,190,80,${0.6 * (1 - k)})`);
    g.addColorStop(1, "rgba(255,120,30,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Schadensrauch / Brand an beschädigten Schiffen
export function damageFx(b, dt) {
  if (b.hp >= 65) return;
  const sev = 1 - b.hp / 65;
  const c = Math.cos(b.h);
  const s = Math.sin(b.h);
  if (Math.random() < dt * (6 + sev * 20)) {
    const d = rand(-18, 14);
    puff(b.x + c * d + rand(-2, 2), b.y + s * d + rand(-2, 2), { r: 1.5, grow: 3.5, life: 3.5, color: sev > 0.5 ? "25,25,25" : "70,70,70", alpha: 0.45, vx: 3, vy: 1.2, drag: 0.4 });
  }
  if (sev > 0.5 && Math.random() < dt * 25) {
    const d = rand(-15, 10);
    puff(b.x + c * d, b.y + s * d, { r: 1, grow: 0.8, life: 0.45, color: "255,150,40", alpha: 0.9, glow: true, vx: rand(-1, 1), vy: rand(-1, 1) });
  }
}

// ---------- Flugkörper zeichnen ----------

// Triebwerksstrahl: weißer Kern, gelb-oranger Mantel, flackernd
function plume(ctx, x, r, len, t, seed) {
  const fl = 0.75 + Math.sin(t * 60 + seed) * 0.15 + Math.sin(t * 37 + seed * 2) * 0.1;
  const L = len * fl;
  const g = ctx.createLinearGradient(x, 0, x - L, 0);
  g.addColorStop(0, "rgba(255,255,240,1)");
  g.addColorStop(0.15, "rgba(255,220,120,0.95)");
  g.addColorStop(0.5, "rgba(255,140,40,0.6)");
  g.addColorStop(1, "rgba(255,80,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, -r);
  ctx.quadraticCurveTo(x - L * 0.4, -r * 1.6, x - L, 0);
  ctx.quadraticCurveTo(x - L * 0.4, r * 1.6, x, r);
  ctx.closePath();
  ctx.fill();
  // Glühen
  const gl = ctx.createRadialGradient(x - r, 0, 0, x - r, 0, r * 5);
  gl.addColorStop(0, "rgba(255,200,100,0.45)");
  gl.addColorStop(1, "rgba(255,150,50,0)");
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(x - r, 0, r * 5, 0, Math.PI * 2);
  ctx.fill();
}

function body(ctx, x0, x1, r, col) {
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, col);
  g.addColorStop(0.75, "rgba(120,128,134,1)");
  g.addColorStop(1, "#5d656b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x0, -r, x1 - x0, r * 2, r * 0.6);
  ctx.fill();
}

function fins(ctx, x, span, chord, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x - chord * 0.6, -span);
  ctx.lineTo(x - chord, -span);
  ctx.lineTo(x - chord * 0.8, 0);
  ctx.lineTo(x - chord, span);
  ctx.lineTo(x - chord * 0.6, span);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x - chord * 0.6, -span);
  ctx.lineTo(x - chord * 0.7, -span);
  ctx.lineTo(x - chord * 0.15, 0);
  ctx.closePath();
  ctx.fill();
}

function drawExocetBody(ctx, t) {
  plume(ctx, -2.6, 0.22, 3.4, t, 1);
  fins(ctx, 0.3, 1.0, 1.6, "#8f989e");
  fins(ctx, -1.9, 0.62, 0.7, "#8f989e");
  body(ctx, -2.6, 2.0, 0.21, "#e9edef");
  // Suchkopf
  const n = ctx.createLinearGradient(2.0, -0.2, 2.8, 0.2);
  n.addColorStop(0, "#5a6268");
  n.addColorStop(1, "#22282c");
  ctx.fillStyle = n;
  ctx.beginPath();
  ctx.moveTo(2.0, -0.21);
  ctx.quadraticCurveTo(2.85, -0.05, 2.9, 0);
  ctx.quadraticCurveTo(2.85, 0.05, 2.0, 0.21);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(0.9, -0.21, 0.16, 0.42);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(-0.8, -0.21, 0.06, 0.42);
}

function drawRamBody(ctx, t) {
  plume(ctx, -1.3, 0.12, 2.2, t, 2);
  fins(ctx, -0.9, 0.42, 0.45, "#a4adb2");
  body(ctx, -1.3, 1.25, 0.12, "#f4f6f7");
  ctx.fillStyle = "#2c3236";
  ctx.beginPath();
  ctx.moveTo(1.25, -0.12);
  ctx.quadraticCurveTo(1.6, 0, 1.25, 0.12);
  ctx.closePath();
  ctx.fill();
  // Leitflächen am Kopf (Canards)
  ctx.fillStyle = "#a4adb2";
  ctx.fillRect(0.7, -0.3, 0.18, 0.6);
}

export function drawProjectiles(ctx, projs, t, zoom) {
  // kleine Objekte bei weitem Zoom etwas vergrößern, damit sie sichtbar bleiben
  const boost = Math.max(1, 2.2 / zoom);
  // Schatten auf dem Wasser (nur Flugkörper in der Höhe)
  for (const q of projs) {
    if (!q.z || q.z < 15 || q.type === PROJ.SHELL || q.type === PROJ.BULLET || q.type === PROJ.TORP) continue;
    const off = Math.min(90, 2 + Math.sqrt(q.z) * 1.6);
    ctx.save();
    ctx.translate(q.x + off * 0.55, q.y + off);
    ctx.rotate(q.h);
    ctx.fillStyle = `rgba(0,15,30,${Math.max(0.08, 0.3 - q.z / 8000)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6 * boost, 0.35 * boost, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const q of projs) {
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(q.h);
    // in großer Höhe etwas größer (Perspektive)
    if (q.z > 200) {
      const zs = 1 + Math.min(0.35, q.z / 6000);
      ctx.scale(zs, zs);
    }
    if (q.type === PROJ.TORP) {
      // Torpedo unter Wasser: dunkler Schemen mit Blasenspur
      const k = Math.min(0.75, 0.35 + -(q.z || 0) / 150);
      ctx.fillStyle = `rgba(10,30,45,${0.75 - k * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.4 * boost, 0.45 * boost, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(220,240,255,0.5)";
      for (let i = 1; i <= 6; i++) {
        const wob = Math.sin(t * 9 + i * 1.7 + q.id) * 0.8;
        ctx.beginPath();
        ctx.arc(-3 * boost - i * 3.2, wob, (0.5 + i * 0.12) * boost * (1 - i / 9), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (q.type === PROJ.BOMB) {
      // Lenkbombe: olivgrüner Körper mit Leitwerk
      const s2 = 1.2 * boost;
      ctx.scale(s2, s2);
      ctx.fillStyle = "#8a8e58";
      ctx.fillRect(-1.6, -0.55, 0.4, 1.1);
      ctx.fillStyle = "#6f7344";
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.6, 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(0.6, -0.16, 0.06, 0.32);
    } else if (q.type === PROJ.AAM) {
      // Luft-Luft-Flugkörper: schlank, heller Feuerstrahl
      const s2 = 1.1 * boost;
      ctx.scale(s2, s2);
      ctx.fillStyle = "rgba(255,220,140,0.9)";
      ctx.beginPath();
      ctx.moveTo(-1.8, -0.12);
      ctx.lineTo(-4.5 - Math.random(), 0);
      ctx.lineTo(-1.8, 0.12);
      ctx.fill();
      ctx.fillStyle = "#eceee9";
      ctx.fillRect(-1.8, -0.09, 3.4, 0.18);
      ctx.fillStyle = "#6b706d";
      ctx.fillRect(1.4, -0.09, 0.3, 0.18);
      ctx.fillStyle = "#a9ada9";
      ctx.fillRect(-1.7, -0.32, 0.3, 0.64);
    } else if (q.type === PROJ.ROCKET) {
      ctx.fillStyle = "rgba(255,190,90,0.9)";
      ctx.fillRect(-4 * boost, -0.25 * boost, 2.4 * boost, 0.5 * boost);
      ctx.fillStyle = "#e6e6e0";
      ctx.fillRect(-1.6 * boost, -0.15 * boost, 2 * boost, 0.3 * boost);
    } else if (q.type === PROJ.BULLET) {
      ctx.strokeStyle = "rgba(255,235,150,0.9)";
      ctx.lineWidth = 0.3 * boost;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, 0);
      ctx.stroke();
    } else if (q.type === PROJ.SHELL) {
      const g = ctx.createLinearGradient(0, 0, -14, 0);
      g.addColorStop(0, "rgba(255,250,200,1)");
      g.addColorStop(1, "rgba(255,180,60,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.6 * boost;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, 0);
      ctx.stroke();
    } else {
      const s = 1.3 * boost;
      ctx.scale(s, s);
      if (q.type === PROJ.EXOCET) drawExocetBody(ctx, t);
      else if (q.type === PROJ.ARM) {
        ctx.scale(0.85, 0.75);
        drawExocetBody(ctx, t);
      } else if (q.type === PROJ.HELLFIRE) {
        ctx.scale(0.65, 0.9);
        drawRamBody(ctx, t);
      } else drawRamBody(ctx, t);
    }
    ctx.restore();
  }
}

// AGIS-Lock: Erfassungsklammern um das Ziel (Weltkoordinaten)
export function drawLock(ctx, me, target, progress, t) {
  const locked = progress >= 1;
  const size = 36;
  ctx.save();
  // Peillinie
  ctx.strokeStyle = locked ? "rgba(255,70,60,0.45)" : "rgba(255,215,94,0.35)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(me.x, me.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(target.x, target.y);
  if (!locked) {
    // Erfassung läuft: rotierende, zusammenlaufende Klammern
    const r = size + (1 - progress) * 40;
    ctx.rotate(t * 2);
    ctx.strokeStyle = "rgba(255,215,94,0.95)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, r, -0.35, 0.35);
      ctx.stroke();
    }
  } else {
    const r = size + Math.sin(t * 8) * 2;
    ctx.strokeStyle = "rgba(255,60,50,0.95)";
    ctx.lineWidth = 2.4;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(sx * r, sy * (r - 12));
      ctx.lineTo(sx * r, sy * r);
      ctx.lineTo(sx * (r - 12), sy * r);
      ctx.stroke();
    }
  }
  ctx.restore();
}
