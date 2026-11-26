import {
  DT,
  BOATS,
  MS_TO_KN,
  WORLD_SIZE,
  generateMap,
  islandRadius,
  mulberry32,
  stepBoat,
  clamp,
  wrapAngle,
  aimAngles,
  slewTurret,
  WEAPONS,
  ABILITIES,
} from "../shared/sim.js";
import * as radar from "./radar.js";
import { drawGepard, GEPARD_EXHAUSTS } from "./gepard.js";
import * as combat from "./combat.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const map = generateMap();
const DEF = BOATS.gepard;

// ---------------- Zustand ----------------
const state = {
  ws: null,
  myId: 0,
  names: new Map(),
  snapshots: [], // { time, players: Map(id -> arr) }
  pred: null, // vorhergesagter eigener Zustand
  prevPred: null,
  history: [], // unbestätigte Eingaben
  seq: 0,
  acc: 0,
  errX: 0,
  errY: 0,
  errH: 0,
  throttle: 0,
  rudder: 0,
  zoom: 4.6,
  playing: false,
  ping: 0,
  mouse: null, // Mausposition in Bildschirmpixeln
  mouseWorld: { x: 0, y: 0 },
  aimInfo: null, // { gun, gunOk, ram, ramOk }
  weapon: "gun",
  meInfo: null, // Waffen-/Lockstatus vom Server
  kills: new Map(),
  dead: null, // { by, x, y, h, time }
  lockMsg: "",
  lockMsgT: 0,
  lastFire: 0,
  radarK: 0, // Einblendung der Radaransicht 0..1
  radarStart: -10, // Zeitpunkt der Aktivierung (s)
  radarWasOn: false,
  radarView: null, // Geometrie der Radaransicht (für Klick-Lock)
};
const WEAPON_KEYS = { 1: "gun", 2: "exocet", 3: "ram" };

const keys = new Set();
const fx = new Map(); // id -> { trail: [], smoke: [], lastTrail: 0 }

// ---------------- Inseln vorbereiten ----------------
function islandPath(isl, offset, n = 160) {
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = Math.max(4, islandRadius(isl, a) + offset);
    const x = isl.x + Math.cos(a) * r;
    const y = isl.y + Math.sin(a) * r;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

const islandGfx = map.islands.map((isl) => {
  const rnd = mulberry32(isl.seed);
  const trees = [];
  const rocks = [];
  const nTrees = Math.floor(isl.r * 0.35);
  for (let i = 0; i < nTrees * 3 && trees.length < nTrees; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * isl.r;
    if (d > islandRadius(isl, a) - 28) continue;
    trees.push({ x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d, r: 4 + rnd() * 6, s: rnd() });
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = islandRadius(isl, a) + 4 + rnd() * 14;
    rocks.push({ x: isl.x + Math.cos(a) * d, y: isl.y + Math.sin(a) * d, r: 1.5 + rnd() * 3.5 });
  }
  // Maisfeld auf großen Inseln (Maiskolbistan!)
  let corn = null;
  if (isl.r > 170) {
    const ang = rnd() * Math.PI;
    const w = isl.r * 0.7;
    const h = isl.r * 0.45;
    const rows = new Path2D();
    for (let y = -h / 2; y <= h / 2; y += 3.2) {
      rows.moveTo(-w / 2, y);
      rows.lineTo(w / 2, y);
    }
    corn = { ang, w, h, rows, cx: isl.x + (rnd() - 0.5) * isl.r * 0.2, cy: isl.y + (rnd() - 0.5) * isl.r * 0.2 };
  }
  return {
    isl,
    deep: islandPath(isl, 90),
    shallow: islandPath(isl, 38),
    surf: islandPath(isl, 4),
    sand: islandPath(isl, 0),
    grass: islandPath(isl, -16),
    trees,
    rocks,
    corn,
  };
});

// ---------------- Wassertextur ----------------
function makeWaterTile() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const rnd = mulberry32(7);
  g.lineCap = "round";
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const len = 10 + rnd() * 40;
    g.strokeStyle = `rgba(255,255,255,${0.025 + rnd() * 0.05})`;
    g.lineWidth = 1 + rnd() * 2;
    for (const dx of [-512, 0, 512]) {
      for (const dy of [-512, 0, 512]) {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.quadraticCurveTo(x + dx + len / 2, y + dy - 4, x + dx + len, y + dy);
        g.stroke();
      }
    }
  }
  return c;
}
const waterTile = makeWaterTile();
const waterPattern = ctx.createPattern(waterTile, "repeat");

// ---------------- Eingabe ----------------
addEventListener("keydown", (e) => {
  if (!state.playing) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === " " || k === "x") state.throttle = 0;
  if (WEAPON_KEYS[k]) selectWeapon(WEAPON_KEYS[k]);
  if (!e.repeat && k === "f" && state.weapon !== "gun") send({ t: "fire", w: state.weapon });
  if (!e.repeat && k === "r" && state.pred) sendLock();
  if (!e.repeat && k === "e") activateRadar();
  if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
addEventListener("mousemove", (e) => (state.mouse = { x: e.clientX, y: e.clientY }));
document.addEventListener("mouseleave", () => (state.mouse = null));
addEventListener(
  "wheel",
  (e) => {
    if (!state.playing || state.radarK > 0) return;
    state.zoom = clamp(state.zoom * Math.pow(1.0015, -e.deltaY), 0.6, 9);
  },
  { passive: true }
);

function send(obj) {
  if (state.ws && state.ws.readyState === 1 && state.pred && !state.dead) state.ws.send(JSON.stringify(obj));
}

function sendLock() {
  // In der Radaransicht auf den Kontakt unter dem Zeiger einrasten
  const rv = state.radarView;
  const hov = rv && state.radarK > 0.5 ? radar.hoveredContact(rv, state.mouse) : null;
  const target = hov || state.mouseWorld;
  send({ t: "lock", x: Math.round(target.x), y: Math.round(target.y) });
}

function activateRadar() {
  const info = state.meInfo;
  if (info && (info.ra > 0 || info.rc > 0)) return;
  send({ t: "ability", a: "radar" });
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0 && state.radarK > 0.5 && state.pred) sendLock();
});
$("abRadar").addEventListener("click", activateRadar);

function selectWeapon(w) {
  state.weapon = w;
  for (const el of document.querySelectorAll(".wslot")) el.classList.toggle("sel", el.dataset.w === w);
}
for (const el of document.querySelectorAll(".wslot")) el.addEventListener("click", () => selectWeapon(el.dataset.w));

function updateControls(dt) {
  // Geschütz: Dauerfeuer solange F gedrückt (Server prüft Nachladezeit)
  if (keys.has("f") && state.weapon === "gun" && performance.now() - state.lastFire > 100) {
    state.lastFire = performance.now();
    send({ t: "fire", w: "gun" });
  }
  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  if (up) state.throttle = Math.min(1, state.throttle + dt * 0.6);
  if (down) state.throttle = Math.max(-DEF.maxReverse, state.throttle - dt * 0.6);
  // Einrasten auf Stopp beim Durchfahren
  if (Math.abs(state.throttle) < 0.02 && !up && !down) state.throttle = 0;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rs = target === 0 ? 3 : 2;
  state.rudder += clamp(target - state.rudder, -rs * dt, rs * dt);
}

// ---------------- Netzwerk ----------------
function connect(name) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws = ws;
  $("status").textContent = "Verbinde …";
  $("play").disabled = true;

  ws.onopen = () => ws.send(JSON.stringify({ t: "join", name }));
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    if (state.ws !== ws) return;
    state.ws = null;
    const dead = state.dead;
    const showMenu = () => {
      state.playing = false;
      state.dead = null;
      $("hud").hidden = true;
      $("menu").hidden = false;
      $("play").disabled = false;
      $("play").textContent = dead ? "Neu ablegen!" : "Ablegen!";
      $("status").textContent = dead
        ? dead.by
          ? `Versenkt von ${dead.by}. Neues Boot gefällig?`
          : "Dein Boot wurde versenkt. Neues Boot gefällig?"
        : "Verbindung zum Hafen verloren. Erneut ablegen?";
    };
    if (dead) setTimeout(showMenu, Math.max(0, 3200 - (performance.now() - dead.time)));
    else showMenu();
  };
}

function onMessage(m) {
  switch (m.t) {
    case "welcome":
      state.myId = m.id;
      state.names.clear();
      for (const p of m.players) state.names.set(p.id, p.name);
      state.snapshots = [];
      state.pred = null;
      state.history = [];
      state.seq = 0;
      state.throttle = 0;
      state.rudder = 0;
      state.dead = null;
      state.meInfo = null;
      state.kills.clear();
      state.playing = true;
      $("menu").hidden = true;
      $("hud").hidden = false;
      $("status").textContent = "";
      renderPlayerList();
      break;
    case "join":
      state.names.set(m.id, m.name);
      renderPlayerList();
      break;
    case "dead":
      state.dead = { by: m.by, x: m.x, y: m.y, h: m.h, time: performance.now() };
      state.pred = null;
      combat.sinkAt(m.x, m.y, m.h);
      $("hpFill").style.width = "0%";
      $("hpText").textContent = `0 / ${DEF.hp}`;
      break;
    case "lockmsg":
      state.lockMsg = m.m;
      state.lockMsgT = performance.now();
      break;
    case "leave":
      state.names.delete(m.id);
      state.kills.delete(m.id);
      fx.delete(m.id);
      renderPlayerList();
      break;
    case "full":
      $("status").textContent = "Der Ozean ist voll. Bitte später erneut versuchen.";
      break;
    case "pong":
      state.ping = performance.now() - m.c;
      break;
    case "s":
      onSnapshot(m);
      break;
  }
}

function onSnapshot(m) {
  const players = new Map();
  let killsChanged = false;
  for (const p of m.p) {
    players.set(p[0], p);
    if (state.kills.get(p[0]) !== p[10]) {
      state.kills.set(p[0], p[10]);
      killsChanged = true;
    }
  }
  const projs = new Map();
  for (const q of m.q || []) projs.set(q[0], q);
  state.snapshots.push({ time: performance.now(), players, projs });
  if (state.snapshots.length > 30) state.snapshots.shift();
  for (const e of m.e || []) combat.spawnEvent(e);
  if (m.me) state.meInfo = m.me;
  if (killsChanged) renderPlayerList();
  if (state.dead) return;

  const me = players.get(state.myId);
  if (!me) return;
  state.myHp = me[11];
  state.myProt = me[12] === 1;
  const server = { x: me[1], y: me[2], h: me[3], v: me[4], w: me[5] };
  if (!state.pred) {
    state.pred = { ...server };
    state.prevPred = { ...server };
    return;
  }
  // Abgleich: Serverzustand übernehmen und unbestätigte Eingaben erneut abspielen
  const old = { ...state.pred };
  state.history = state.history.filter((h) => h.s > m.a);
  const p = { ...server };
  for (const h of state.history) stepBoat(p, h, DEF, map);
  state.pred = p;
  // Fehler weich ausblenden statt springen
  const dx = old.x - p.x;
  const dy = old.y - p.y;
  if (dx * dx + dy * dy > 60 * 60) {
    state.errX = state.errY = state.errH = 0;
    state.prevPred = { ...p };
  } else {
    state.errX += dx;
    state.errY += dy;
    state.errH += wrapAngle(old.h - p.h);
  }
}

setInterval(() => {
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ t: "ping", c: performance.now() }));
}, 2000);

function fixedStep() {
  if (!state.pred) return;
  const input = { s: ++state.seq, th: Math.round(state.throttle * 100) / 100, ru: Math.round(state.rudder * 100) / 100 };
  state.history.push(input);
  if (state.history.length > 120) state.history.shift();
  state.prevPred = { ...state.pred };
  stepBoat(state.pred, input, DEF, map);
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ t: "in", ...input, mx: Math.round(state.mouseWorld.x), my: Math.round(state.mouseWorld.y) }));
}

// ---------------- Interpolation der anderen Boote ----------------
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

function bracket(now) {
  const renderTime = now - 110;
  const snaps = state.snapshots;
  if (snaps.length === 0) return null;
  let a = snaps[0];
  let b = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].time <= renderTime) {
      a = snaps[i - 1];
      b = snaps[i];
      break;
    }
  }
  const span = b.time - a.time;
  const t = span > 0 ? clamp((renderTime - a.time) / span, 0, 1.2) : 1;
  return { a, b, t };
}

function interpolatedBoats(br) {
  const out = [];
  if (!br) return out;
  const { a, b, t } = br;
  for (const [id, pb] of b.players) {
    if (id === state.myId) continue;
    const pa = a.players.get(id) || pb;
    out.push({
      id,
      x: lerp(pa[1], pb[1], t),
      y: lerp(pa[2], pb[2], t),
      h: lerpAngle(pa[3], pb[3], t),
      v: lerp(pa[4], pb[4], t),
      th: pb[6],
      aim: pb[8] ?? 0,
      ramAim: pb[9] ?? 0,
      radar: pb[13] === 1,
      hp: pb[11] ?? 100,
      prot: pb[12] === 1,
    });
  }
  return out;
}

function interpolatedProjectiles(br) {
  const out = [];
  if (!br) return out;
  const { a, b, t } = br;
  for (const [id, qb] of b.projs) {
    const qa = a.projs.get(id);
    if (!qa) {
      out.push({ id, type: qb[1], x: qb[2], y: qb[3], h: qb[4] });
      continue;
    }
    out.push({ id, type: qb[1], x: lerp(qa[2], qb[2], t), y: lerp(qa[3], qb[3], t), h: lerpAngle(qa[4], qb[4], t) });
  }
  return out;
}

// ---------------- Geschützturm ----------------
// Schwenkt mit begrenzter Geschwindigkeit zum Zielwinkel. Winkel bleiben im Bereich ±arc,
// daher dreht der Turm nie durch den gesperrten Sektor hinter der Brücke.
function turretAngles(b, now) {
  const f = fxFor(b.id);
  const dt = f.gunT ? Math.min(0.1, (now - f.gunT) / 1000) : 0;
  f.gunT = now;
  f.gun = slewTurret(f.gun, clamp(b.aim ?? 0, -DEF.gun.arc, DEF.gun.arc), DEF.gun, dt);
  f.ram = slewTurret(f.ram, clamp(b.ramAim ?? 0, -DEF.ram.arc, DEF.ram.arc), DEF.ram, dt);
  return f;
}

// ---------------- Effekte: Kielwasser, Rauch ----------------
function fxFor(id) {
  let f = fx.get(id);
  if (!f) {
    f = { trail: [], smoke: [], lastTrail: 0, lastSmoke: 0, gun: 0, ram: 0, gunT: 0 };
    fx.set(id, f);
  }
  return f;
}

function updateFx(boat, now) {
  const f = fxFor(boat.id);
  const c = Math.cos(boat.h);
  const s = Math.sin(boat.h);
  if (now - f.lastTrail > 70) {
    f.lastTrail = now;
    const sx = boat.x - c * (DEF.length / 2 - 1);
    const sy = boat.y - s * (DEF.length / 2 - 1);
    f.trail.push({ x: sx, y: sy, nx: -s, ny: c, v: Math.abs(boat.v), t: now });
  }
  while (f.trail.length && now - f.trail[0].t > 9000) f.trail.shift();

  const load = clamp(Math.abs(boat.th ?? 0), 0.15, 1);
  if (now - f.lastSmoke > 140 / load) {
    f.lastSmoke = now;
    for (const [ex, ey] of GEPARD_EXHAUSTS) {
      f.smoke.push({
        x: boat.x + ex * c - ey * s,
        y: boat.y + ex * s + ey * c,
        vx: -c * 1.5 + 2.2 + (Math.random() - 0.5),
        vy: -s * 1.5 + 0.8 + (Math.random() - 0.5),
        t: now,
        life: 2200 + Math.random() * 1200,
        r: 0.9,
      });
    }
  }
  for (const p of f.smoke) {
    p.x += p.vx * (1 / 60);
    p.y += p.vy * (1 / 60);
  }
  f.smoke = f.smoke.filter((p) => now - p.t < p.life);
}

function drawWake(f, now) {
  const tr = f.trail;
  if (tr.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Schraubenwasser (Mitte)
  for (let i = 1; i < tr.length; i++) {
    const p = tr[i];
    const q = tr[i - 1];
    const age = (now - p.t) / 1000;
    const strength = clamp(p.v / 12, 0, 1);
    if (strength < 0.03) continue;
    const alpha = Math.max(0, 0.42 - age * 0.05) * strength;
    if (alpha <= 0) continue;
    ctx.strokeStyle = `rgba(235,248,255,${alpha})`;
    ctx.lineWidth = 3 + age * 1.1;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  // Kelvin-Heckwellen (Halbwinkel ~19,5°)
  for (const side of [-1, 1]) {
    ctx.beginPath();
    let started = false;
    for (let i = tr.length - 1; i >= 0; i--) {
      const p = tr[i];
      const age = (now - p.t) / 1000;
      const off = 3.5 + age * p.v * 0.36;
      const x = p.x + p.nx * off * side;
      const y = p.y + p.ny * off * side;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    const g = Math.min(1, (tr[tr.length - 1].v || 0) / 8);
    ctx.strokeStyle = `rgba(220,240,255,${0.22 * g})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function drawBowWave(boat, t) {
  const v = Math.abs(boat.v);
  if (v < 1.5) return;
  const k = clamp(v / DEF.maxSpeed, 0, 1);
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.h);
  ctx.strokeStyle = `rgba(240,250,255,${0.25 + k * 0.35})`;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const sp = 0.4 + j * 0.35 + Math.sin(t * 6 + j) * 0.05;
      ctx.lineWidth = 0.9 - j * 0.2;
      ctx.beginPath();
      ctx.moveTo(DEF.length / 2 + 0.3, 0);
      ctx.quadraticCurveTo(
        DEF.length / 2 - 5,
        side * (3.9 + sp * k * 1.2),
        DEF.length / 2 - 12 - j * 7,
        side * (4.2 + sp * k * 2.6)
      );
      ctx.stroke();
    }
  }
  // Gischt am Heck bei hoher Fahrt
  if (k > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 * k})`;
    for (let i = 0; i < 6; i++) {
      const jx = -DEF.length / 2 - 1 - Math.random() * 4 * k;
      const jy = (Math.random() - 0.5) * 6;
      ctx.beginPath();
      ctx.arc(jx, jy, 0.6 + Math.random() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSmoke(f, now) {
  for (const p of f.smoke) {
    const a = (now - p.t) / p.life;
    ctx.fillStyle = `rgba(70,75,80,${0.13 * (1 - a)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + a * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------- Welt zeichnen ----------------
function drawIslands(view, t) {
  for (const g of islandGfx) {
    const { isl } = g;
    const R = isl.r * 1.6 + 100;
    if (isl.x + R < view.x0 || isl.x - R > view.x1 || isl.y + R < view.y0 || isl.y - R > view.y1) continue;
    ctx.fillStyle = "rgba(40,120,160,0.35)";
    ctx.fill(g.deep);
    ctx.fillStyle = "rgba(70,170,190,0.55)";
    ctx.fill(g.shallow);
    // Brandung
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + Math.sin(t * 1.3 + isl.id) * 0.15})`;
    ctx.lineWidth = 2.5;
    ctx.stroke(g.surf);
    for (const r of g.rocks) {
      ctx.fillStyle = "#6d6a63";
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e3d39a";
    ctx.fill(g.sand);
    ctx.fillStyle = "#5e9a4a";
    ctx.fill(g.grass);
    ctx.strokeStyle = "rgba(40,80,30,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke(g.grass);

    if (g.corn) {
      ctx.save();
      ctx.clip(g.grass);
      ctx.translate(g.corn.cx, g.corn.cy);
      ctx.rotate(g.corn.ang);
      ctx.fillStyle = "#9fae3c";
      ctx.fillRect(-g.corn.w / 2, -g.corn.h / 2, g.corn.w, g.corn.h);
      ctx.strokeStyle = "#e8c53a";
      ctx.lineWidth = 1.4;
      ctx.stroke(g.corn.rows);
      ctx.strokeStyle = "rgba(60,90,30,0.6)";
      ctx.lineWidth = 0.5;
      ctx.translate(0, 1.6);
      ctx.stroke(g.corn.rows);
      ctx.restore();
    }

    for (const tr of g.trees) {
      ctx.fillStyle = "rgba(20,40,15,0.35)";
      ctx.beginPath();
      ctx.arc(tr.x + 2, tr.y + 2.5, tr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tr.s > 0.5 ? "#2f6b2c" : "#3b7a33";
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,210,110,0.35)";
      ctx.beginPath();
      ctx.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawNameTag(name, x, y, isMe) {
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(name, x, y);
  ctx.fillStyle = isMe ? "#ffd75e" : "#ffffff";
  ctx.fillText(name, x, y);
}

function render(now) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const t = now / 1000;

  // Eigene Position (interpoliert zwischen festen Schritten + weicher Fehlerausgleich)
  let me = null;
  if (state.pred) {
    const a = clamp(state.acc / DT, 0, 1);
    const pp = state.prevPred || state.pred;
    me = {
      id: state.myId,
      x: lerp(pp.x, state.pred.x, a) + state.errX,
      y: lerp(pp.y, state.pred.y, a) + state.errY,
      h: lerpAngle(pp.h, state.pred.h, a) + state.errH,
      v: lerp(pp.v, state.pred.v, a),
      th: state.throttle,
      hp: state.myHp ?? 100,
      prot: state.myProt,
      radar: !!(state.meInfo && state.meInfo.ra > 0),
    };
  }
  const br = bracket(now);
  const others = interpolatedBoats(br);
  const projs = interpolatedProjectiles(br);
  const boats = me ? [...others, me] : others;
  const dtFx = state.lastRender ? Math.min(0.1, (now - state.lastRender) / 1000) : 0;
  state.lastRender = now;

  const cam = me || state.dead || { x: 0, y: 0 };
  // Radar-Rundumsuche: weich weit herauszoomen
  const radarOn = !!(me && state.meInfo && state.meInfo.ra > 0);
  if (radarOn && !state.radarWasOn) {
    state.radarStart = t;
    radar.resetContacts();
  }
  state.radarWasOn = radarOn;
  state.radarK = clamp(state.radarK + (radarOn ? 1 : -1) * (dtFx / 0.9), 0, 1);
  const rk = state.radarK * state.radarK * (3 - 2 * state.radarK); // smoothstep
  const normalZoom = state.zoom * Math.min(1.25, Math.max(0.7, Math.min(w, h) / 900));
  const radarZoom = (Math.min(w, h) * 0.5 - 50) / ABILITIES.radar.lockRange;
  const zoom = Math.exp(lerp(Math.log(normalZoom), Math.log(radarZoom), rk));
  const scale = zoom * dpr;
  const view = {
    x0: cam.x - w / 2 / zoom,
    x1: cam.x + w / 2 / zoom,
    y0: cam.y - h / 2 / zoom,
    y1: cam.y + h / 2 / zoom,
  };

  // Mauszeiger in Weltkoordinaten; Geschütz und RAM-Starter darauf richten.
  // Liegt das Ziel im toten Winkel, gehen sie in Ruhestellung (Geschütz nach vorne).
  if (state.mouse) {
    state.mouseWorld = { x: cam.x + (state.mouse.x - w / 2) / zoom, y: cam.y + (state.mouse.y - h / 2) / zoom };
  }
  if (me) {
    const ai = state.mouse ? aimAngles(me, DEF, state.mouseWorld.x, state.mouseWorld.y) : { gun: 0, gunOk: false, ram: 0, ramOk: false };
    state.aimInfo = ai;
    me.aim = ai.gun;
    me.ramAim = ai.ram;
  }
  combat.updateEffects(dtFx);
  combat.emitTrails(projs, dtFx);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14507e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(scale, 0, 0, scale, (w / 2 - cam.x * zoom) * dpr, (h / 2 - cam.y * zoom) * dpr);

  // Wasser mit zwei driftenden Wellenlagen
  for (const [sc, dx, dy] of [
    [0.5, t * 1.2, t * 0.4],
    [0.32, -t * 0.7, t * 0.9],
  ]) {
    waterPattern.setTransform(new DOMMatrix().translate(dx, dy).scale(sc));
    ctx.fillStyle = waterPattern;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  }

  // Kartenrand
  const half = WORLD_SIZE / 2;
  ctx.fillStyle = "rgba(5,20,35,0.55)";
  ctx.beginPath();
  ctx.rect(view.x0 - 10, view.y0 - 10, view.x1 - view.x0 + 20, view.y1 - view.y0 + 20);
  ctx.rect(half, -half, -WORLD_SIZE, WORLD_SIZE);
  ctx.fill("evenodd");
  ctx.strokeStyle = "rgba(255,90,70,0.6)";
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 14]);
  ctx.strokeRect(-half, -half, WORLD_SIZE, WORLD_SIZE);
  ctx.setLineDash([]);

  for (const b of boats) {
    updateFx(b, now);
    drawWake(fxFor(b.id), now);
  }

  drawIslands(view, t);
  combat.drawEffectsBelow(ctx, t);

  const info = state.meInfo;
  for (const b of boats) {
    drawBowWave(b, t);
    const tu = turretAngles(b, now);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.h);
    // Spawnschutz: Boot blinkt
    if (b.prot) ctx.globalAlpha = 0.55 + Math.sin(t * 10) * 0.25;
    const exo = b.id === state.myId && info ? info.x.map((v) => v <= 0) : undefined;
    // Navigationsradar dreht bei Rundumsuche schneller
    const fb = fxFor(b.id);
    fb.navAng = (fb.navAng ?? (b.id * 1.7) % 6.28) + dtFx * (b.radar ? 9 : 2.6);
    fb.domeAng = (fb.domeAng ?? 0) + dtFx * (b.radar ? 3 : 0.45);
    drawGepard(ctx, { t, seed: b.id * 7919, gun: tu.gun, ram: tu.ram, exo, radarAngle: fb.navAng, domeAngle: fb.domeAng });
    ctx.restore();
    combat.damageFx(b, dtFx);
  }
  for (const b of boats) drawSmoke(fxFor(b.id), now);
  combat.drawProjectiles(ctx, projs, t, zoom);
  combat.drawEffectsAbove(ctx);

  // AGIS-Lock
  if (me && info && info.l && rk < 0.5) {
    const tgt = others.find((o) => o.id === info.l);
    if (tgt) combat.drawLock(ctx, me, tgt, info.lt, t);
  }

  // Namen (Bildschirmkoordinaten)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (me) radar.updateContacts(me, others, t);
  state.radarView = null;
  if (me && rk > 0.01) {
    state.radarView = {
      w, h, cx: w / 2, cy: h / 2, zoom, k: rk, t, startT: state.radarStart, me, others,
      lockId: info ? info.l : 0, lockT: info ? info.lt : 0, names: state.names,
      lockRange: ABILITIES.radar.lockRange, mouse: state.mouse,
    };
    radar.drawRadar(ctx, state.radarView);
  }
  if (rk < 0.6) for (const b of boats) {
    const sx = w / 2 + (b.x - cam.x) * zoom;
    const sy = h / 2 + (b.y - cam.y) * zoom - Math.max(24, DEF.length * 0.55 * zoom);
    drawNameTag(state.names.get(b.id) || "?", sx, sy - 8, b.id === state.myId);
    drawHpBar(sx, sy - 4, b.hp);
  }
  // Zeiger-Hinweis: Geschütz kann dort nicht hin
  if (me && state.mouse && state.weapon === "gun" && state.aimInfo && !state.aimInfo.gunOk) {
    ctx.strokeStyle = "rgba(255,80,70,0.9)";
    ctx.lineWidth = 2;
    const { x, y } = state.mouse;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + 16, y + 16);
    ctx.moveTo(x + 16, y + 8);
    ctx.lineTo(x + 8, y + 16);
    ctx.stroke();
  }

  if (state.dead) {
    const k = Math.min(1, (now - state.dead.time) / 600);
    ctx.globalAlpha = k;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 54px system-ui, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText("VERSENKT", w / 2, h * 0.3);
    ctx.fillStyle = "#ff5a4e";
    ctx.fillText("VERSENKT", w / 2, h * 0.3);
    if (state.dead.by) {
      ctx.font = "600 20px system-ui, sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeText(`von ${state.dead.by}`, w / 2, h * 0.3 + 44);
      ctx.fillStyle = "#fff";
      ctx.fillText(`von ${state.dead.by}`, w / 2, h * 0.3 + 44);
    }
    ctx.globalAlpha = 1;
  }

  if (me) updateHud(me);
  drawMinimap(me, others);
}

function drawHpBar(x, y, hp) {
  const W = 56;
  const k = clamp(hp / DEF.hp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - W / 2 - 1, y - 1, W + 2, 6);
  ctx.fillStyle = k > 0.6 ? "#5fd35f" : k > 0.3 ? "#f0c330" : "#ef4b3a";
  ctx.fillRect(x - W / 2, y, W * k, 4);
}

// ---------------- HUD ----------------
let hudTick = 0;
function updateHud(me) {
  if (++hudTick % 4) return;
  updateWeaponBar();
  updateRadarHud();
  $("hpFill").style.width = `${clamp(me.hp / DEF.hp, 0, 1) * 100}%`;
  $("hpText").textContent = `${Math.max(0, Math.ceil(me.hp))} / ${DEF.hp}`;
  $("speed").textContent = `${(me.v * MS_TO_KN).toFixed(1)} kn`;
  const deg = Math.round(((me.h * 180) / Math.PI + 90 + 360) % 360);
  $("heading").textContent = `${String(deg).padStart(3, "0")}°`;
  $("pos").textContent = `${Math.round(me.x)} / ${Math.round(-me.y)}`;
  $("ping").textContent = state.ping ? `${Math.round(state.ping)} ms` : "–";
  const span = 1 + DEF.maxReverse;
  const zeroPct = (1 / span) * 100;
  const thPct = ((1 - state.throttle) / span) * 100;
  $("tgZero").style.top = `${zeroPct}%`;
  const fill = $("tgFill");
  fill.style.top = `${Math.min(zeroPct, thPct)}%`;
  fill.style.height = `${Math.abs(thPct - zeroPct)}%`;
  const actual = me.v / DEF.maxSpeed;
  $("tgActual").style.top = `calc(${((1 - actual) / span) * 100}% - 1px)`;
  $("rudderNeedle").style.left = `${50 + state.rudder * 45}%`;
}

function updateWeaponBar() {
  const info = state.meInfo;
  if (!info) return;
  const setBar = (id, k) => ($(id).style.width = `${clamp(k, 0, 1) * 100}%`);
  setBar("gunReload", 1 - info.g);
  $("gunState").textContent = info.g > 0 ? "lädt" : state.aimInfo && !state.aimInfo.gunOk ? "toter Winkel" : "bereit";
  const cells = document.querySelectorAll("#exoCells i");
  let ready = 0;
  info.x.forEach((v, i) => {
    if (v <= 0) ready++;
    cells[i].style.setProperty("--k", `${(1 - v) * 100}%`);
    cells[i].classList.toggle("ready", v <= 0);
  });
  $("exoCount").textContent = `${ready}/4`;
  $("ramCount").textContent = `${info.r}/${WEAPONS.ram.magazine}`;
  setBar("ramReload", info.r >= WEAPONS.ram.magazine ? 1 : info.rr);
  const lock = $("lockState");
  const tName = info.l ? state.names.get(info.l) || "?" : "";
  const recent = performance.now() - state.lockMsgT < 2500;
  if (info.l && info.lt >= 1) {
    lock.textContent = `LOCK: ${tName}`;
    lock.className = "locked";
  } else if (info.l) {
    lock.textContent = `Erfasse ${tName} … ${Math.round(info.lt * 100)}%`;
    lock.className = "acquiring";
  } else {
    lock.textContent = recent ? state.lockMsg : "kein Ziel";
    lock.className = recent ? "msg" : "";
  }
  $("exoMode").textContent = info.l && info.lt >= 1 ? "→ Lock-Ziel" : "→ Mauszeiger";
}

function updateRadarHud() {
  const info = state.meInfo;
  if (!info) return;
  const A = ABILITIES.radar;
  const slot = $("abRadar");
  const banner = $("radarBanner");
  if (info.ra > 0) {
    $("radarState").textContent = `aktiv ${info.ra.toFixed(1)} s`;
    $("radarBar").style.width = `${(info.ra / A.duration) * 100}%`;
    slot.className = "aslot active";
    banner.hidden = false;
    $("radarTime").textContent = `${info.ra.toFixed(1)} s`;
    $("radarBannerBar").style.width = `${(info.ra / A.duration) * 100}%`;
  } else {
    banner.hidden = true;
    if (info.rc > 0) {
      $("radarState").textContent = `lädt ${Math.ceil(info.rc)} s`;
      $("radarBar").style.width = `${(1 - info.rc / A.cooldown) * 100}%`;
      slot.className = "aslot cooldown";
    } else {
      $("radarState").textContent = "bereit";
      $("radarBar").style.width = "100%";
      slot.className = "aslot ready";
    }
  }
}

function renderPlayerList() {
  const ol = $("plist");
  ol.replaceChildren();
  const ids = [...state.names.keys()].sort((a, b) => (state.kills.get(b) || 0) - (state.kills.get(a) || 0) || a - b);
  for (const id of ids.slice(0, 15)) {
    const li = document.createElement("li");
    li.textContent = state.names.get(id);
    const k = document.createElement("span");
    k.className = "kills";
    k.textContent = `${state.kills.get(id) || 0} ⚓`;
    li.appendChild(k);
    if (id === state.myId) li.className = "me";
    ol.appendChild(li);
  }
  $("pcount").textContent = state.names.size;
}

const mm = $("minimap");
const mctx = mm.getContext("2d");
const mmBase = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 400;
  const g = c.getContext("2d");
  const s = 400 / WORLD_SIZE;
  g.fillStyle = "rgba(20,80,126,0.6)";
  g.fillRect(0, 0, 400, 400);
  g.setTransform(s, 0, 0, s, 200, 200);
  for (const ig of islandGfx) {
    g.fillStyle = "rgba(120,200,210,0.5)";
    g.fill(ig.shallow);
    g.fillStyle = "#d9c98e";
    g.fill(ig.sand);
    g.fillStyle = "#5e9a4a";
    g.fill(ig.grass);
  }
  return c;
})();

let mmTick = 0;
function drawMinimap(me, others) {
  if (++mmTick % 3) return;
  const W = mm.width;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, W, W);
  mctx.drawImage(mmBase, 0, 0, W, W);
  const s = W / WORLD_SIZE;
  const toM = (x) => W / 2 + x * s;
  const info = state.meInfo;
  const t = performance.now() / 1000;
  // Radar-Rundumsuche: Reichweitenkreis und Strahl
  if (me && info && info.ra > 0) {
    const R = ABILITIES.radar.lockRange * s;
    const a = radar.sweepAngle(t);
    mctx.fillStyle = "rgba(0,40,20,0.35)";
    mctx.strokeStyle = "rgba(90,255,150,0.7)";
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(toM(me.x), toM(me.y), R, 0, Math.PI * 2);
    mctx.fill();
    mctx.stroke();
    mctx.strokeStyle = "rgba(140,255,180,0.95)";
    mctx.beginPath();
    mctx.moveTo(toM(me.x), toM(me.y));
    mctx.lineTo(toM(me.x) + Math.cos(a) * R, toM(me.y) + Math.sin(a) * R);
    mctx.stroke();
  }
  const lockId = info ? info.l : 0;
  for (const o of others) {
    if (o.id === lockId) continue;
    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.arc(toM(o.x), toM(o.y), 2.5, 0, Math.PI * 2);
    mctx.fill();
  }
  // Gelocktes Ziel: rot mit Klammern und Peillinie (gelb während der Aufschaltung)
  const lt = lockId ? others.find((o) => o.id === lockId) : null;
  if (lt) {
    const locked = info.lt >= 1;
    const col = locked ? "#ff4b3e" : "#ffd75e";
    const x = toM(lt.x);
    const y = toM(lt.y);
    if (me) {
      mctx.strokeStyle = locked ? "rgba(255,75,62,0.6)" : "rgba(255,215,94,0.6)";
      mctx.setLineDash([3, 3]);
      mctx.lineWidth = 1;
      mctx.beginPath();
      mctx.moveTo(toM(me.x), toM(me.y));
      mctx.lineTo(x, y);
      mctx.stroke();
      mctx.setLineDash([]);
    }
    mctx.fillStyle = col;
    mctx.beginPath();
    mctx.arc(x, y, 3.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = col;
    mctx.lineWidth = 1.5;
    const r = 8 + (locked ? Math.sin(t * 8) : 0) * 1.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      mctx.beginPath();
      mctx.moveTo(x + sx * r, y + sy * (r - 4));
      mctx.lineTo(x + sx * r, y + sy * r);
      mctx.lineTo(x + sx * (r - 4), y + sy * r);
      mctx.stroke();
    }
    mctx.font = "700 10px system-ui, sans-serif";
    mctx.textAlign = x > W - 70 ? "right" : "left";
    mctx.textBaseline = "middle";
    mctx.fillText(state.names.get(lt.id) || "?", x + (x > W - 70 ? -12 : 12), y);
  }
  if (me) {
    mctx.save();
    mctx.translate(toM(me.x), toM(me.y));
    mctx.rotate(me.h);
    mctx.fillStyle = "#ffd75e";
    mctx.beginPath();
    mctx.moveTo(6, 0);
    mctx.lineTo(-4, -3.5);
    mctx.lineTo(-4, 3.5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }
}

// ---------------- Hauptschleife ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    updateControls(dt);
    state.acc += dt;
    let n = 0;
    while (state.acc >= DT && n++ < 5) {
      state.acc -= DT;
      fixedStep();
    }
    if (n >= 5) state.acc = 0;
    // Korrekturfehler abklingen lassen
    const decay = Math.exp(-dt * 6);
    state.errX *= decay;
    state.errY *= decay;
    state.errH *= decay;
    render(now);
  } else {
    renderMenuBackground(now);
  }
  drawPreview(now);
  requestAnimationFrame(frame);
}

function renderMenuBackground(now) {
  // Langsamer Kameraflug über die Karte hinter dem Menü
  const t = now / 1000;
  const keep = state.pred;
  state.pred = null;
  const fakeCam = { x: Math.cos(t * 0.03) * 1400, y: Math.sin(t * 0.04) * 1100 };
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const zoom = 0.9;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14507e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, (w / 2 - fakeCam.x * zoom) * dpr, (h / 2 - fakeCam.y * zoom) * dpr);
  const view = { x0: fakeCam.x - w / zoom, x1: fakeCam.x + w / zoom, y0: fakeCam.y - h / zoom, y1: fakeCam.y + h / zoom };
  waterPattern.setTransform(new DOMMatrix().translate(t, t * 0.3).scale(0.5));
  ctx.fillStyle = waterPattern;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  drawIslands(view, t);
  state.pred = keep;
}

// ---------------- Menü + Vorschau ----------------
const pv = $("preview");
const pctx = pv.getContext("2d");
const previewPattern = pctx.createPattern(waterTile, "repeat");
function drawPreview(now) {
  if ($("menu").hidden) return;
  const t = now / 1000;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = 560 * dpr;
  const H = 150 * dpr;
  if (pv.width !== W) {
    pv.width = W;
    pv.height = H;
  }
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = pctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b5f92");
  g.addColorStop(1, "#124a74");
  pctx.fillStyle = g;
  pctx.fillRect(0, 0, W, H);
  const s = 8.4 * dpr;
  pctx.setTransform(s, 0, 0, s, W / 2, H / 2);
  previewPattern.setTransform(new DOMMatrix().translate(-t * 12, 0).scale(0.06));
  pctx.fillStyle = previewPattern;
  pctx.fillRect(-40, -12, 80, 24);
  // stilisierte Bugwelle/Kielwasser in der Vorschau
  pctx.strokeStyle = "rgba(240,250,255,0.5)";
  pctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    pctx.beginPath();
    pctx.moveTo(29, 0);
    pctx.quadraticCurveTo(22, side * 4.6, 10, side * 6.5);
    pctx.stroke();
  }
  pctx.fillStyle = "rgba(235,248,255,0.35)";
  pctx.fillRect(-40, -2.2, 11.5, 4.4);
  drawGepard(pctx, { t, seed: 4242 });
}

const nameInput = $("name");
try {
  nameInput.value = localStorage.getItem("mkn-name") || "";
} catch {}
$("joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim() || "Matrose";
  try {
    localStorage.setItem("mkn-name", name);
  } catch {}
  if (state.ws) state.ws.close();
  fx.clear();
  connect(name);
  nameInput.blur();
});

requestAnimationFrame(frame);
