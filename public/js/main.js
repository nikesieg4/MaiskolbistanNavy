import {
  DT,
  BOATS,
  MS_TO_KN,
  WORLD_SIZE,
  generateMap,
  islandRadius,
  mulberry32,
  stepEntity,
  TYPE_BY_ID,
  isOnLand,
  harborRect,
  teamBase,
  inRect,
  clamp,
  wrapAngle,
  aimAngles,
  slewTurret,
  WEAPONS,
  ABILITIES,
  TEAMS,
  isAir,
  START_SHIP,
  DRONE_OF,
  SENSORS,
  FRONT,
  envFactors,
  isSub,
  isBuyable,
  RANKS,
  rankOf,
  DEPTH,
  airfieldRect,
} from "../shared/sim.js";
import { drawCloudShadows, drawWhitecaps, drawAtmosphere, envLabel } from "./weather.js";
import { initAccount, renderAccount } from "./account.js";
import { drawBases, drawBasesMinimap } from "./base.js";
import * as radar from "./radar.js";
import { drawVehicle, drawAirShadow, exhaustsOf } from "./vehicles.js";
import { drawContinents, drawContinentsMinimap, drawOutposts, drawOutpostsMinimap, drawFrontMap } from "./world.js";
import { WEAPON_UI, ABILITY_UI } from "./ui.js";
import * as combat from "./combat.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
const map = generateMap();
let DEF = BOATS.gepard; // Typ des eigenen Fahrzeugs
const ghosts = new Map(); // zuletzt gesehene Gegner: id -> { x, y, h, type, t }

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
  team: 0, // gewähltes Team
  teams: new Map(), // Spieler-ID -> Team
  types: new Map(), // Spieler-ID -> Typ
  myType: "gepard",
  spawnChoice: "gepard", // Startauswahl im Menü: gepard | carrier | heli:<id>
  status: null, // letzter /status-Abruf
  shopOpen: false,
  front: null, // [besitzer[], fortschritt[]]
  marked: new Set(), // vom Team markierte Ziele
  rafts: [], // Schiffbrüchige
  spawnLoc: "", // "" = Heimathafen, "op:<id>" = Stützpunkt
  myWeapons: [], // aktuelle Bewaffnung (Hangar)
  landed: false,
  hangarOpen: false,
  env: null, // Tageszeit/Wetter vom Server
  envF: envFactors(null),
  ranks: new Map(), // Spieler-ID -> Dienstgrad
};
// Konto: Gast (zufälliger Schlüssel aus dem Browser) oder Sitzung eines registrierten Kontos (vom Server)
let TOKEN = "";
function setToken(t) {
  TOKEN = t || crypto.randomUUID();
  try {
    localStorage.setItem("mkn-token", TOKEN);
  } catch {}
}
try {
  TOKEN = localStorage.getItem("mkn-token") || "";
} catch {}
if (!TOKEN) setToken(null);
const typeOfId = (id) => (id === state.myId ? state.myType : state.types.get(id) || "gepard");
const fmtMoney = (n) => `${Math.floor(n).toLocaleString("de-DE")} Taler`;
try {
  state.team = localStorage.getItem("mkn-team") === "1" ? 1 : 0;
} catch {}
const teamOf = (id) => state.teams.get(id) ?? 0;
const isFriend = (id) => teamOf(id) === state.team;

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
  if (e.target && e.target.tagName === "INPUT") return; // Chat-Eingabe
  if (e.key === "Enter" && !e.repeat) {
    e.preventDefault();
    openChat();
    return;
  }
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === " " || k === "x") state.throttle = 0;
  if (!e.repeat && k === "t" && DEF.kind === "ship" && state.meInfo) {
    send({ t: "radar", on: !state.meInfo.ro });
    showToast(state.meInfo.ro ? "Radar AUS – schwerer zu entdecken, aber kurzsichtig" : "Radar EIN", state.meInfo.ro ? "warn" : "ok");
  }
  if (/^[1-9]$/.test(k) && state.myWeapons[+k - 1]) selectWeapon(state.myWeapons[+k - 1]);
  if (!e.repeat && k === "h") toggleHangar();
  if (k === "escape" && state.hangarOpen) toggleHangar(false);
  if (!e.repeat && k === "f" && state.weapon && !WEAPONS[state.weapon].auto) send({ t: "fire", w: state.weapon });
  if (!e.repeat && k === "r" && state.pred) sendLock();
  if (!e.repeat && k === "e") activateAbility();
  if (!e.repeat && k === "b") toggleShop();
  if (k === "escape" && state.shopOpen) toggleShop(false);
  if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) e.preventDefault();
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

// ---------------- Chat ----------------
const chat = { open: false, team: false, last: 0 };
function openChat() {
  if (!state.playing) return;
  chat.open = true;
  keys.clear(); // keine hängenden Steuertasten
  $("chat").classList.add("open");
  $("chatForm").hidden = false;
  $("chatInput").focus();
}
function closeChat() {
  chat.open = false;
  $("chat").classList.remove("open");
  $("chatForm").hidden = true;
  $("chatInput").value = "";
  $("chatInput").blur();
}
function setChatScope(team) {
  chat.team = team;
  $("chatScope").textContent = team ? "Team" : "Alle";
  $("chatScope").classList.toggle("team", team);
}
function addChatLine(m) {
  const log = $("chatLog");
  const el = document.createElement("div");
  el.className = "cl" + (m.sys ? " sys" : "");
  if (m.sys) {
    el.textContent = m.m;
  } else {
    if (m.to) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "[Team]";
      el.appendChild(tag);
    }
    const who = document.createElement("b");
    who.className = `t${m.tm}`;
    who.textContent = `${m.n}:`;
    el.append(who, document.createTextNode(m.m));
  }
  log.appendChild(el);
  while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => el.classList.add("old"), 12000);
}
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (text && state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ t: "chat", m: text, team: chat.team }));
  closeChat();
});
$("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeChat();
  if (e.key === "Tab") {
    e.preventDefault();
    setChatScope(!chat.team);
  }
  e.stopPropagation();
});
$("chatScope").addEventListener("click", () => {
  setChatScope(!chat.team);
  $("chatInput").focus();
});
$("chatBtn").addEventListener("click", () => (chat.open ? closeChat() : openChat()));

function zoomBy(f) {
  if (!state.playing || state.radarK > 0) return;
  state.zoom = clamp(state.zoom * f, 0.6, 9);
}
// Zoom-Knöpfe (iPad) – gedrückt halten zoomt weiter
for (const [id, f] of [["zoomIn", 1.25], ["zoomOut", 0.8]]) {
  const btn = document.getElementById(id);
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomBy(f);
    stop();
    timer = setInterval(() => zoomBy(Math.pow(f, 0.35)), 60);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, stop);
  btn.addEventListener("click", (e) => e.stopPropagation());
}
addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.key === "+" || e.key === "=") zoomBy(1.25);
  else if (e.key === "-" || e.key === "_") zoomBy(0.8);
});
// Pinch-Zoom mit zwei Fingern
let pinchD = 0;
const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinchD = touchDist(e.touches); }, { passive: true });
addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2 || !pinchD) return;
  const d = touchDist(e.touches);
  zoomBy(d / pinchD);
  pinchD = d;
}, { passive: true });
addEventListener("touchend", (e) => { if (e.touches.length < 2) pinchD = 0; }, { passive: true });

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

function activateAbility() {
  const info = state.meInfo;
  if (info && (info.ra > 0 || info.rc > 0)) return;
  send({ t: "ability" });
}

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0 && state.radarK > 0.5 && state.pred) sendLock();
});

function selectWeapon(w) {
  state.weapon = w;
  for (const el of document.querySelectorAll(".wslot")) el.classList.toggle("sel", el.dataset.w === w);
}

// Waffenleiste passend zum eigenen Fahrzeug aufbauen
function buildWeaponBar() {
  const bar = $("weapons");
  const parts = state.myWeapons.map((w, i) => {
    const u = WEAPON_UI[w];
    const W = WEAPONS[w];
    const cells = W.kind === "ssm" ? DEF.ssm.length : ["agm", "arm", "aam", "bomb", "torp"].includes(W.kind) ? (DEF.mags && DEF.mags[w]) || W.count : 0;
    const extra = cells ? `<div class="cells" id="w_${w}_c">${"<i></i>".repeat(cells)}</div>` : `<div class="wbar"><div id="w_${w}_b"></div></div>`;
    return `<div class="wslot" data-w="${w}"><kbd>${i + 1}</kbd>${u.icon}<div class="wname">${u.name} <span id="w_${w}_n"></span></div><div class="wsub" id="w_${w}_s">${u.sub}</div>${extra}</div>`;
  });
  parts.push(`<div class="agis"><kbd>R</kbd><div class="wname">AGIS</div><div id="lockState">kein Ziel</div></div>`);
  const ab = ABILITY_UI[DEF.ability];
  parts.push(
    `<div class="aslot ready" id="abSlot" title="${ab.title}"><kbd>E</kbd>${ab.icon}<div class="wname">${ab.name}</div><div class="wsub" id="abState">bereit</div><div class="wbar"><div id="abBar"></div></div></div>`
  );
  bar.innerHTML = parts.join("");
  for (const el of bar.querySelectorAll(".wslot")) el.addEventListener("click", () => selectWeapon(el.dataset.w));
  $("abSlot").addEventListener("click", activateAbility);
  if (state.myWeapons.length) selectWeapon(state.myWeapons.includes(state.weapon) ? state.weapon : state.myWeapons[0]);
  else state.weapon = null;
}

function setMyType(type) {
  state.myType = type;
  DEF = BOATS[type];
  state.myWeapons = [...DEF.weapons];
  state.landed = false;
  $("boatLabel").textContent = DEF.label;
  $("telegraph").hidden = DEF.kind !== "ship" && DEF.kind !== "sub";
  $("radarRow").hidden = DEF.kind !== "ship";
  $("altLabel").innerHTML = isSub(DEF) ? 'Tiefe <kbd class="inl">Q</kbd>↑<kbd class="inl">C</kbd>↓' : 'Höhe <kbd class="inl">Q</kbd><kbd class="inl">C</kbd>';
  $("fuelRow").hidden = $("fuelBarBox").hidden = !DEF.fuel;
  buildWeaponBar();
}

function updateControls(dt) {
  // Geschütz/MG: Dauerfeuer solange F gedrückt (Server prüft Nachladezeit)
  if (keys.has("f") && state.weapon && WEAPONS[state.weapon].auto && performance.now() - state.lastFire > 80) {
    state.lastFire = performance.now();
    send({ t: "fire", w: state.weapon });
  }
  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");
  if (DEF.kind === "jet") {
    // Jet: W = Vollschub (+ Shift = Nachbrenner), S = Leerlauf (Senkrechtstarter: schweben), sonst Marschfahrt
    state.throttle = up ? 1 : down ? 0 : 0.55;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    state.rudder += clamp(target - state.rudder, -4 * dt, 4 * dt);
    return;
  }
  if (DEF.kind === "drone") {
    // Drohne: W = Vollgas, S = Mindestgeschwindigkeit, sonst Marschfahrt
    state.throttle = up ? 1 : down ? 0 : 0.45;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    state.rudder += clamp(target - state.rudder, -4 * dt, 4 * dt);
    return;
  }
  if (DEF.kind === "heli") {
    // Hubschrauber: W vorwärts, S rückwärts, loslassen = schweben
    state.throttle = up ? 1 : down ? -DEF.maxReverse : 0;
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    state.rudder += clamp(target - state.rudder, -5 * dt, 5 * dt);
    return;
  }
  if (up) state.throttle = Math.min(1, state.throttle + dt * 0.6);
  if (down) state.throttle = Math.max(-DEF.maxReverse, state.throttle - dt * 0.6);
  // Einrasten auf Stopp beim Durchfahren
  if (Math.abs(state.throttle) < 0.02 && !up && !down) state.throttle = 0;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rs = target === 0 ? 3 : 2;
  state.rudder += clamp(target - state.rudder, -rs * dt, rs * dt);
}

// ---------------- Netzwerk ----------------
function connect(name, team, spawn, loc) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  state.ws = ws;
  $("status").textContent = "Verbinde …";
  $("play").disabled = true;

  ws.onopen = () => ws.send(JSON.stringify({ t: "join", name, team, spawn, loc, token: TOKEN }));
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
      const verb = dead && dead.heli ? "Abgeschossen" : "Versenkt";
      $("status").textContent = dead
        ? dead.by
          ? `${verb} von ${dead.by}. Neuer Einsatz gefällig?`
          : `${verb}. Neuer Einsatz gefällig?`
        : "Verbindung zum Hafen verloren. Erneut ablegen?";
      toggleShop(false);
      refreshTeamStatus(true);
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
      state.teams.clear();
      state.team = m.team;
      state.types.clear();
      for (const p of m.players) {
        state.names.set(p.id, p.name);
        state.teams.set(p.id, p.team);
        state.types.set(p.id, p.type);
      }
      setMyType(m.type);
      if (m.note) showToast(m.note, "warn");
      if (m.acct && m.acct.notice) showToast(m.acct.notice, "money");
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
      state.teams.set(m.id, m.team);
      state.types.set(m.id, m.type);
      renderPlayerList();
      break;
    case "dead":
      closeChat();
      state.dead = { by: m.by, x: m.x, y: m.y, h: m.h, time: performance.now(), heli: isAir(BOATS[m.type] || {}) };
      state.pred = null;
      if (state.dead.heli) combat.crashAt(m.x, m.y, m.h);
      else combat.sinkAt(m.x, m.y, m.h, m.team, BOATS[m.type]?.typeId ?? 0);
      $("hpFill").style.width = "0%";
      $("hpText").textContent = `0 / ${DEF.hp}`;
      break;
    case "retype":
      if (m.id) state.types.set(m.id, m.type);
      else {
        // Eigenes Schiff im Hafen gewechselt
        setMyType(m.type);
        state.pred = null;
        state.history = [];
        state.throttle = 0;
        state.rudder = 0;
        fx.delete(state.myId);
        toggleShop(false);
        showToast(`Du fährst jetzt: ${DEF.label}`, "ok");
      }
      break;
    case "chat":
      addChatLine(m);
      break;
    case "rank":
      showToast(`⭐ Befördert: ${m.name}!`, "money");
      break;
    case "season":
      showToast(`🏆 Saison ${m.ended} beendet – ${m.winner >= 0 ? `Sieg für ${TEAMS[m.winner].name}` : "unentschieden"}. Saison ${m.next} beginnt, die Frontkarte ist zurückgesetzt.`, "money");
      break;
    case "auth":
      // Sitzung abgelaufen: als Gast weiterspielen, im Menü neu anmelden
      setToken(null);
      showToast(m.m, "warn");
      break;
    case "reward":
      showToast(`+${m.a.toLocaleString("de-DE")} Taler · ${m.m}`, "money");
      break;
    case "shop":
      showToast(m.m, m.ok ? "ok" : "warn");
      if (m.owned && state.meInfo) state.meInfo.own = m.owned;
      renderShop();
      break;
    case "landed":
      if (m.where) {
        showToast(`Gelandet: ${m.where} – H für Hangar, W zum Starten`, "ok");
      } else {
        toggleHangar(false);
        showToast("Gestartet", "ok");
      }
      break;
    case "front": {
      const o = map.outposts[m.i];
      if (!o) break;
      const mine = m.by === state.team;
      const who = TEAMS[m.by].name;
      showToast(m.own === -1 ? `${who} hat ${o.name} neutralisiert` : `${who} hat ${o.name} erobert!`, mine ? "ok" : "warn");
      break;
    }
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
    if (p[15] !== undefined) state.types.set(p[0], TYPE_BY_ID[p[15]]);
    if (state.kills.get(p[0]) !== p[10]) {
      state.kills.set(p[0], p[10]);
      state.teams.set(p[0], p[14]);
      killsChanged = true;
    }
  }
  const projs = new Map();
  for (const q of m.q || []) projs.set(q[0], q);
  state.snapshots.push({ time: performance.now(), players, projs });
  if (state.snapshots.length > 30) state.snapshots.shift();
  for (const e of m.e || []) combat.spawnEvent(e);
  if (m.me) {
    state.meInfo = m.me;
    if (m.me.wl && m.me.wl.join() !== state.myWeapons.join()) {
      state.myWeapons = m.me.wl;
      buildWeaponBar();
      if (state.hangarOpen) renderHangar();
    }
    state.landed = !!m.me.ld;
  }
  if (m.fr) state.front = m.fr;
  if (m.env) {
    state.env = { h: m.env[0], w: m.env[1], p: m.env[2], k: m.env[3] };
    state.envF = envFactors(state.env);
  }
  for (const p of m.p) if (p[23] !== undefined) state.ranks.set(p[0], p[23]);
  state.marked = new Set(m.mk || []);
  state.rafts = m.rf || [];
  // Gegner, die nicht mehr erfasst sind, bleiben kurz als „zuletzt gesehen“ stehen
  const nowS = performance.now() / 1000;
  for (const p of m.p) {
    if (p[14] !== state.team) ghosts.set(p[0], { x: p[1], y: p[2], h: p[3], type: TYPE_BY_ID[p[15]], t: nowS, seen: true });
  }
  for (const [id, g] of ghosts) {
    if (!players.has(id) && g.seen) {
      g.seen = false;
      g.t = nowS;
    }
    if (!g.seen && nowS - g.t > SENSORS.ghost) ghosts.delete(id);
  }
  if (killsChanged) renderPlayerList();
  if (state.dead) return;

  const me = players.get(state.myId);
  if (!me) return;
  state.myHp = me[11];
  state.myProt = me[12] === 1;
  const server = { x: me[1], y: me[2], h: me[3], v: me[4], w: me[5], z: me[20] ?? 0, zt: me[21] ?? 0 };
  if (DEF.fuel && m.me && m.me.fu !== undefined) server.fuel = m.me.fu * DEF.fuel;
  if (!state.pred) {
    state.pred = { ...server };
    state.prevPred = { ...server };
    return;
  }
  if (state.landed) {
    // Am Boden bewegt der Server das Fahrzeug (z. B. mit dem Träger) – keine eigene Vorhersage
    state.pred = { ...server };
    state.prevPred = { ...server };
    state.history = [];
    state.errX = state.errY = state.errH = 0;
    return;
  }
  // Abgleich: Serverzustand übernehmen und unbestätigte Eingaben erneut abspielen
  const old = { ...state.pred };
  state.history = state.history.filter((h) => h.s > m.a);
  const p = { ...server };
  for (const h of state.history) stepEntity(p, h, DEF, map, state.envF);
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
  const upKey = keys.has("q") || keys.has("pageup");
  const downKey = keys.has("c") || keys.has("pagedown");
  const up = isAir(DEF) || isSub(DEF) ? (upKey ? 1 : 0) - (downKey ? 1 : 0) : 0;
  const ab = DEF.kind === "jet" && keys.has("shift") ? 1 : 0;
  const input = { s: ++state.seq, th: Math.round(state.throttle * 100) / 100, ru: Math.round(state.rudder * 100) / 100, up, ab };
  state.history.push(input);
  if (state.history.length > 120) state.history.shift();
  state.prevPred = { ...state.pred };
  if (!state.landed) stepEntity(state.pred, input, DEF, map, state.envF);
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
      type: TYPE_BY_ID[pb[15] ?? 0],
      aim: pb[8] ?? 0,
      ramAim: pb[9] ?? 0,
      radar: pb[13] === 1,
      radarOn: pb[16] === 1,
      pod: pb[17] || 0,
      z: lerp(pa[20] || 0, pb[20] || 0, t),
      jam: pb[18] === 1,
      ab: pb[22] === 1,
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
      out.push({ id, type: qb[1], x: qb[2], y: qb[3], h: qb[4], z: qb[5] || 0 });
      continue;
    }
    out.push({ id, type: qb[1], x: lerp(qa[2], qb[2], t), y: lerp(qa[3], qb[3], t), h: lerpAngle(qa[4], qb[4], t), z: lerp(qa[5] || 0, qb[5] || 0, t) });
  }
  return out;
}

// ---------------- Geschützturm ----------------
// Schwenkt mit begrenzter Geschwindigkeit zum Zielwinkel. Winkel bleiben im Bereich ±arc,
// daher dreht der Turm nie durch den gesperrten Sektor hinter der Brücke.
function turretAngles(b, now) {
  const f = fxFor(b.id);
  const def = BOATS[b.type];
  const dt = f.gunT ? Math.min(0.1, (now - f.gunT) / 1000) : 0;
  f.gunT = now;
  if (def.gun) f.gun = slewTurret(f.gun, clamp(b.aim ?? 0, -def.gun.arc, def.gun.arc), def.gun, dt);
  if (def.ram) f.ram = slewTurret(f.ram, clamp(b.ramAim ?? 0, -def.ram.arc, def.ram.arc), def.ram, dt);
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
  const def = BOATS[boat.type];
  const c = Math.cos(boat.h);
  const s = Math.sin(boat.h);
  if (def.kind === "drone" || def.kind === "jet") {
    f.trail.length = 0;
    return;
  }
  // Getauchte U-Boote ziehen kein Kielwasser (auf Sehrohrtiefe nur eine schmale Spur)
  if (def.kind === "sub" && (boat.z || 0) < -20) return;
  if (def.kind === "heli") {
    // Abwind des Rotors: Ringe und Gischt auf dem Wasser
    f.rings = f.rings || [];
    if (now - (f.lastRing || 0) > 160 && !isOnLand(map, boat.x, boat.y)) {
      f.lastRing = now;
      f.rings.push({ x: boat.x + 4, y: boat.y + 6, t: now });
    }
    f.rings = f.rings.filter((r) => now - r.t < 1400);
    f.trail.length = 0;
    return;
  }
  if (now - f.lastTrail > 70) {
    f.lastTrail = now;
    const sx = boat.x - c * (def.length / 2 - 1);
    const sy = boat.y - s * (def.length / 2 - 1);
    f.trail.push({ x: sx, y: sy, nx: -s, ny: c, v: Math.abs(boat.v), t: now, w: def.beam / 2.2 });
  }
  while (f.trail.length && now - f.trail[0].t > 9000) f.trail.shift();

  const load = clamp(Math.abs(boat.th ?? 0), 0.15, 1);
  if (now - f.lastSmoke > 140 / load) {
    f.lastSmoke = now;
    for (const [ex, ey] of exhaustsOf(boat.type)) {
      f.smoke.push({
        x: boat.x + ex * c - ey * s,
        y: boat.y + ex * s + ey * c,
        vx: -c * 1.5 + 2.2 + (Math.random() - 0.5),
        vy: -s * 1.5 + 0.8 + (Math.random() - 0.5),
        t: now,
        life: 2200 + Math.random() * 1200,
        r: def.length > 120 ? 1.8 : def.length > 80 ? 1.3 : 0.9,
      });
    }
  }
  for (const p of f.smoke) {
    p.x += p.vx * (1 / 60);
    p.y += p.vy * (1 / 60);
  }
  f.smoke = f.smoke.filter((p) => now - p.t < p.life);
}

function drawDownwash(f, now) {
  if (!f.rings) return;
  for (const r of f.rings) {
    const k = (now - r.t) / 1400;
    ctx.strokeStyle = `rgba(230,245,255,${0.35 * (1 - k)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 3 + k * 14, 0, Math.PI * 2);
    ctx.stroke();
  }
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
    ctx.lineWidth = (p.w || 3.5) * 0.85 + age * 1.1;
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
      const off = (p.w || 3.5) + age * p.v * 0.36;
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
  const def = BOATS[boat.type];
  const v = Math.abs(boat.v);
  if (v < 1.5 || def.kind !== "ship") return;
  const k = clamp(v / def.maxSpeed, 0, 1);
  const L = def.length / 2;
  const sc = def.beam / 7.8;
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.h);
  ctx.strokeStyle = `rgba(240,250,255,${0.25 + k * 0.35})`;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const sp = 0.4 + j * 0.35 + Math.sin(t * 6 + j) * 0.05;
      ctx.lineWidth = (0.9 - j * 0.2) * sc;
      ctx.beginPath();
      ctx.moveTo(L + 0.3, 0);
      ctx.quadraticCurveTo(L - 5 * sc, side * (3.9 + sp * k * 1.2) * sc, L - (12 + j * 7) * sc, side * (4.2 + sp * k * 2.6) * sc);
      ctx.stroke();
    }
  }
  // Gischt am Heck bei hoher Fahrt
  if (k > 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 * k})`;
    for (let i = 0; i < 6; i++) {
      const jx = -L - 1 - Math.random() * 4 * k * sc;
      const jy = (Math.random() - 0.5) * 6 * sc;
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

function miniFlag(c, x, y, w, team) {
  const f = TEAMS[team].flag;
  const h = w * 0.6;
  for (let i = 0; i < 3; i++) {
    c.fillStyle = f.colors[i];
    if (f.dir === "vertical") c.fillRect(x + (i * w) / 3, y, w / 3 + 0.4, h);
    else c.fillRect(x, y + (i * h) / 3, w, h / 3 + 0.4);
  }
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 1;
  c.strokeRect(x, y, w, h);
}

// Aktiver Störsender: pulsierende Ringe
function drawJamRings(b, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1;
    ctx.strokeStyle = `rgba(255,120,80,${0.45 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, 40 + k * 260, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// Radarwarnanlage: Peilmarken um das eigene Fahrzeug (Bildschirmkoordinaten)
function drawThreats(me, w, h, zoom, t) {
  const info = state.meInfo;
  if (!info || !me) return;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.max(70, Math.max(DEF.length, DEF.beam) * 0.6 * zoom + 34);
  for (const [a, k] of info.lk || []) {
    const locked = k >= 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = locked ? `rgba(255,60,50,${0.6 + 0.4 * Math.sin(t * 14)})` : "rgba(255,215,94,0.85)";
    ctx.beginPath();
    ctx.moveTo(R, -9);
    ctx.lineTo(R + 16, 0);
    ctx.lineTo(R, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, R - 4, -0.18, 0.18);
    ctx.stroke();
    ctx.restore();
  }
  for (const [a, d] of info.ms || []) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    const rr = R + 28;
    ctx.fillStyle = `rgba(255,40,40,${0.7 + 0.3 * Math.sin(t * 20)})`;
    ctx.beginPath();
    ctx.moveTo(rr + 22, 0);
    ctx.lineTo(rr, -11);
    ctx.lineTo(rr + 6, 0);
    ctx.lineTo(rr, 11);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-a);
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    const tx = Math.cos(a) * (rr + 40);
    const ty = Math.sin(a) * (rr + 40);
    const txt = `${(d / 1000).toFixed(1)} km`;
    ctx.strokeText(txt, tx, ty);
    ctx.fillStyle = "#ffb4a8";
    ctx.fillText(txt, tx, ty);
    ctx.restore();
  }
}

// Schiffbrüchige in Rettungsinseln (blinkendes Notlicht)
function drawRafts(t) {
  for (const [id, x, y] of state.rafts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(0.5, 0.8, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f26b1d";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7a35c";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(t * 5 + id) > 0.3) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(0, -1.6, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(t * 2 + id)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, 7 + ((t * 4 + id) % 6), 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Zuletzt gesehene Gegner: gestrichelter Umriss, der verblasst
function drawGhosts(t, others) {
  const nowS = performance.now() / 1000;
  const live = new Set(others.map((o) => o.id));
  for (const [id, g] of ghosts) {
    if (g.seen || live.has(id)) continue;
    const def = BOATS[g.type] || BOATS.gepard;
    const k = 1 - (nowS - g.t) / SENSORS.ghost;
    if (k <= 0) continue;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.h);
    ctx.globalAlpha = 0.6 * k;
    ctx.strokeStyle = "#ff8a7a";
    ctx.lineWidth = Math.max(1, def.beam * 0.08);
    ctx.setLineDash([def.length * 0.08, def.length * 0.06]);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(def.length, def.beam) / 2, Math.min(def.length, def.beam) / 2 + 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.8 * k;
    ctx.fillStyle = "#ff8a7a";
    ctx.font = `700 ${Math.max(10, def.length * 0.25)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", g.x, g.y);
    ctx.restore();
  }
}

// Vom Team markierte Ziele (z. B. durch eine Drohne): rote Raute über dem Ziel
function drawMarks(others, t) {
  for (const o of others) {
    if (!state.marked.has(o.id) || isFriend(o.id)) continue;
    const def = BOATS[o.type];
    const r = Math.max(def.length, def.beam) * 0.6 + 8;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(t * 0.8);
    ctx.strokeStyle = "rgba(255,70,60,0.85)";
    ctx.lineWidth = Math.max(1.2, r * 0.04);
    ctx.setLineDash([r * 0.3, r * 0.2]);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawNameTag(name, x, y, isMe, team) {
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const tw = ctx.measureText(name).width;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(name, x + 10, y);
  ctx.fillStyle = isMe ? "#ffffff" : TEAMS[team].color;
  ctx.fillText(name, x + 10, y);
  miniFlag(ctx, x + 10 - tw / 2 - 20, y - 13, 15, team);
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
      z: lerp(pp.z || 0, state.pred.z || 0, a),
      zt: state.pred.zt || 0,
      th: state.throttle,
      type: state.myType,
      hp: state.myHp ?? DEF.hp,
      prot: state.myProt,
      radar: !!(DEF.ability === "radar" && state.meInfo && state.meInfo.ra > 0),
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
  const radarOn = !!(me && DEF.ability === "radar" && state.meInfo && state.meInfo.ra > 0);
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
    me.gunner = Math.atan2(state.mouseWorld.y - me.y, state.mouseWorld.x - me.x) - me.h;
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
  const F = state.envF;
  drawWhitecaps(ctx, view, F, t);

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
    drawDownwash(fxFor(b.id), now);
  }

  drawContinents(ctx, view, t);
  drawIslands(view, t);
  drawOutposts(ctx, view, t, map, state.front, zoom);
  drawBases(ctx, view, t);
  drawCloudShadows(ctx, view, F, t);
  combat.drawEffectsBelow(ctx, t);
  drawRafts(t);

  const info = state.meInfo;
  // U-Boote zuerst (liegen unter Wasser), dann Schiffe
  const ships = boats.filter((b) => isSub(BOATS[b.type])).concat(boats.filter((b) => BOATS[b.type].kind === "ship"));
  const helis = boats.filter((b) => isAir(BOATS[b.type]));
  for (const b of ships) {
    drawBowWave(b, t);
    const tu = turretAngles(b, now);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.h);
    // Spawnschutz: Boot blinkt
    if (b.prot) ctx.globalAlpha = 0.55 + Math.sin(t * 10) * 0.25;
    const ammo = b.id === state.myId && info ? info.w : undefined;
    // Navigationsradar dreht bei Rundumsuche schneller und steht still, wenn das Radar aus ist
    const fb = fxFor(b.id);
    const radarSpeed = b.radar ? 9 : b.radarOn === false ? 0 : 2.6;
    fb.navAng = (fb.navAng ?? (b.id * 1.7) % 6.28) + dtFx * radarSpeed;
    fb.domeAng = (fb.domeAng ?? 0) + dtFx * (b.radar ? 3 : 0.45);
    const flag = TEAMS[teamOf(b.id)].flag;
    drawVehicle(ctx, b.type, { t, h: b.h, seed: b.id * 7919, gun: tu.gun, ram: tu.ram, ammo, radarAngle: fb.navAng, domeAngle: fb.domeAng, flag, z: b.z || 0, v: b.v });
    // Getauchtes gegnerisches U-Boot: nur Sonarkontakt
    if (isSub(BOATS[b.type]) && (b.z || 0) < DEPTH.periscope && b.id !== state.myId && !isFriend(b.id)) {
      ctx.strokeStyle = `rgba(120,220,255,${0.5 + Math.sin(t * 3) * 0.2})`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, BOATS[b.type].length * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    combat.damageFx({ ...b, hp: (b.hp / BOATS[b.type].hp) * 100 }, dtFx);
  }
  for (const b of ships) drawSmoke(fxFor(b.id), now);
  combat.drawProjectiles(ctx, projs, t, zoom);
  combat.drawEffectsAbove(ctx);

  // Luftfahrzeuge fliegen über allem: erst Schatten (Drohnen fliegen höher), dann das Fahrzeug
  // Schatten liegt auf dem Wasser: je höher, desto weiter versetzt, größer und blasser
  for (const b of helis) {
    const z = b.z || 0;
    const off = Math.min(90, 2 + Math.sqrt(z) * 1.6);
    ctx.save();
    ctx.translate(b.x + off * 0.55, b.y + off);
    ctx.rotate(b.h);
    const sc = 1 + Math.min(0.5, z / 4000);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.max(0.25, 1 - z / 5000);
    drawAirShadow(ctx, b.type);
    ctx.restore();
  }
  for (const b of helis) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.h);
    // Perspektive: Luftfahrzeuge wirken in der Höhe etwas größer
    const zs = 1 + Math.min(0.35, (b.z || 0) / 6000);
    ctx.scale(zs, zs);
    if (b.prot) ctx.globalAlpha = 0.55 + Math.sin(t * 10) * 0.25;
    const mine = b.id === state.myId;
    const ammo = mine && info ? info.w : undefined;
    const jamIdx = mine ? state.myWeapons.indexOf("jammer") : -1;
    const jamOn = mine ? jamIdx >= 0 && info && info.w[jamIdx] && info.w[jamIdx][1] > 0 : b.jam;
    if (jamOn) drawJamRings(b, t);
    drawVehicle(ctx, b.type, {
      t, h: b.h, seed: b.id * 7919, ammo, jamOn, v: b.v,
      ab: mine ? DEF.abSpeed && keys.has("shift") && state.throttle > 0.9 && !(info && info.fu <= 0) : b.ab,
      weapons: mine ? state.myWeapons : undefined,
      pod: mine ? undefined : b.pod || undefined,
      gunner: mine ? me.gunner : Math.PI / 2,
      flag: TEAMS[teamOf(b.id)].flag,
    });
    ctx.restore();
    combat.damageFx({ ...b, hp: (b.hp / BOATS[b.type].hp) * 100 }, dtFx);
  }

  drawGhosts(t, others);
  drawMarks(others, t);

  // AGIS-Lock
  if (me && info && info.l && rk < 0.5) {
    const tgt = others.find((o) => o.id === info.l);
    if (tgt) combat.drawLock(ctx, me, tgt, info.lt, t);
  }

  // Tageszeit und Wetter: Nacht mit Lichtquellen, Nebel, Regen
  if (F.night > 0.02 || F.fog > 0.05 || F.rain > 0.05 || F.cloud > 0.5) {
    const toS = (x, y) => ({ sx: w / 2 + (x - cam.x) * zoom, sy: h / 2 + (y - cam.y) * zoom });
    const lights = [];
    for (const b of boats) {
      const bd = BOATS[b.type];
      if (isSub(bd) && (b.z || 0) < DEPTH.periscope) continue;
      const p = toS(b.x, b.y);
      lights.push({ ...p, r: Math.max(40, (bd.length * 1.6 + 60) * zoom), a: b.id === state.myId ? 0.95 : 0.7, glow: bd.kind === "ship" });
      if (b.ab) lights.push({ ...toS(b.x - Math.cos(b.h) * 12, b.y - Math.sin(b.h) * 12), r: 90 * zoom + 30, a: 0.9, glow: true });
    }
    for (const q of projs) {
      if (q.type === 1 || q.type === 4 || q.type === 10 || q.type === 9) continue;
      lights.push({ ...toS(q.x, q.y), r: 60 * zoom + 20, a: 0.8, glow: true });
    }
    for (const t2 of [0, 1]) {
      const hr = harborRect(teamBase(t2));
      lights.push({ ...toS((hr.x0 + hr.x1) / 2, 0), r: 900 * zoom, a: 0.75, glow: true });
    }
    for (const o of map.outposts) if (state.front && state.front[0][o.id] >= 0) lights.push({ ...toS(o.x, o.y), r: 260 * zoom, a: 0.6, glow: true });
    for (const L of combat.lightSources()) lights.push({ ...toS(L.x, L.y), r: L.r * zoom + 20, a: 0.95, glow: true });
    drawAtmosphere(ctx, w, h, dpr, F, t, lights);
  }

  // Namen (Bildschirmkoordinaten)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (me) radar.updateContacts(me, others, t);
  state.radarView = null;
  if (me && rk > 0.01) {
    state.radarView = {
      w, h, cx: w / 2, cy: h / 2, zoom, k: rk, t, startT: state.radarStart, me, others,
      lockId: info ? info.l : 0, lockT: info ? info.lt : 0, names: state.names,
      lockRange: ABILITIES.radar.lockRange, mouse: state.mouse, isFriend,
    };
    radar.drawRadar(ctx, state.radarView);
  }
  if (rk < 0.6) for (const b of boats) {
    const sx = w / 2 + (b.x - cam.x) * zoom;
    const bdef = BOATS[b.type];
    const sy = h / 2 + (b.y - cam.y) * zoom - Math.max(24, Math.max(bdef.length * 0.55, bdef.beam * 0.6) * zoom);
    const altTxt = isAir(bdef) && !(b.id === state.myId && state.landed) ? `  ▲${Math.round(b.z || 0)} m` : isSub(bdef) && (b.z || 0) < -2 ? `  ▼${Math.round(-(b.z || 0))} m` : "";
    const rank = b.id === state.myId && state.meInfo ? rankOf(state.meInfo.xp) : state.ranks.get(b.id) || 0;
    drawNameTag(`${RANKS[rank].short} · ${state.names.get(b.id) || "?"}${altTxt}`, sx, sy - 8, b.id === state.myId, teamOf(b.id));
    drawHpBar(sx, sy - 4, b.hp / bdef.hp);
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

  if (me && rk < 0.6) drawThreats(me, w, h, zoom, t);

  if (state.dead) {
    const k = Math.min(1, (now - state.dead.time) / 600);
    ctx.globalAlpha = k;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 54px system-ui, sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    const word = state.dead.heli ? "ABGESCHOSSEN" : "VERSENKT";
    ctx.strokeText(word, w / 2, h * 0.3);
    ctx.fillStyle = "#ff5a4e";
    ctx.fillText(word, w / 2, h * 0.3);
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

function drawHpBar(x, y, frac) {
  const W = 56;
  const k = clamp(frac, 0, 1);
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
  updateAbilityHud();
  $("money").textContent = fmtMoney(state.meInfo ? state.meInfo.$ : 0);
  if (state.meInfo) {
    const r = rankOf(state.meInfo.xp);
    $("rankHud").textContent = `${RANKS[r].name} · ${Math.floor(state.meInfo.xp).toLocaleString("de-DE")} EP`;
  }
  $("envHud").textContent = envLabel(state.env);
  const F = state.envF;
  $("envNote").textContent = F.night > 0.5 ? "Nacht – Sicht kurz" : F.fog > 0.4 ? "Nebel – Sicht kurz" : F.sea < 0.9 ? "Seegang – langsamer" : F.rain > 0.3 ? "Regen – Radar schwächer" : "";
  // Treibstoff (Jets), Sonar (Schiffe/U-Boote)
  if (DEF.fuel && state.meInfo && state.meInfo.fu !== undefined) {
    const fu = state.meInfo.fu;
    $("fuel").textContent = fu <= 0 ? "LEER" : `${Math.round(fu * 100)} %`;
    $("fuel").style.color = fu < 0.2 ? "#ff6b5a" : "";
    $("fuelBar").style.width = `${Math.round(fu * 100)}%`;
    $("abNote").hidden = !(DEF.abSpeed && keys.has("shift") && state.throttle > 0.9 && fu > 0);
  } else $("abNote").hidden = true;
  const hasSonar = !!DEF.sonar && state.meInfo;
  $("sonarRow").hidden = !hasSonar;
  if (hasSonar) $("sonar").textContent = state.meInfo.so > 0 ? `${(state.meInfo.so / 1000).toFixed(1)} km` : DEF.dipping ? "nur im Schwebeflug tief" : "–";
  if (state.meInfo) {
    const ro = state.meInfo.ro;
    const rs = $("radarStatus");
    rs.textContent = ro ? "EIN" : "AUS";
    rs.className = ro ? "on" : "off";
    $("detWarn").hidden = !state.meInfo.det;
    const lk = state.meInfo.lk || [];
    const ms = state.meInfo.ms || [];
    const locked = lk.some(([, k]) => k >= 1);
    const warn = $("rwr");
    if (ms.length) {
      const near = Math.min(...ms.map(([, d]) => d));
      warn.textContent = `⚠ RAKETE${ms.length > 1 ? ` ×${ms.length}` : ""} – ${(near / 1000).toFixed(1)} km`;
      warn.className = "missile";
    } else if (lk.length) {
      warn.textContent = locked ? "⚠ LOCK – du bist aufgeschaltet" : "Gegner schaltet auf …";
      warn.className = locked ? "locked" : "acq";
    }
    warn.hidden = !ms.length && !lk.length;
    document.body.classList.toggle("missileAlert", ms.length > 0);
    $("jamWarn").hidden = !state.meInfo.jam;
    $("landedBanner").hidden = !state.landed;
    // Hangar-Knopf: sichtbar, solange ein Luftfahrzeug mit wählbarer Bewaffnung gelandet ist
    $("hangarBtn").hidden = !(state.landed && DEF.slots) || state.hangarOpen;
  }
  updateFrontHud(me);
  if (state.shopOpen && state.meInfo && state.meInfo.$ !== state.shopMoney) {
    state.shopMoney = state.meInfo.$;
    renderShop();
  }
  // Laden-Knopf im eigenen Hafen oder gelandet auf dem eigenen Flugfeld
  const inHarbor =
    ((DEF.kind === "ship" || DEF.kind === "sub") && inRect(harborRect(teamBase(state.team)), me.x, me.y)) ||
    (state.landed && isAir(DEF) && inRect(airfieldRect(state.team), me.x, me.y));
  $("shopBtn").hidden = !inHarbor;
  if (!inHarbor && state.shopOpen) toggleShop(false);
  $("hpFill").style.width = `${clamp(me.hp / DEF.hp, 0, 1) * 100}%`;
  $("hpText").textContent = `${Math.max(0, Math.ceil(me.hp))} / ${DEF.hp}`;
  $("speed").textContent = `${(me.v * MS_TO_KN).toFixed(1)} kn`;
  $("altRow").hidden = !isAir(DEF) && !isSub(DEF);
  if (isSub(DEF)) {
    const d = Math.round(-(me.z || 0));
    const dt2 = Math.round(-(me.zt || 0));
    $("alt").textContent = `${d} m${Math.abs(dt2 - d) > 2 ? ` → ${dt2} m` : ""}`;
    const z = me.z || 0;
    $("altNote").textContent = z > DEPTH.surface ? "aufgetaucht – sichtbar wie ein Schiff" : z > DEPTH.periscope ? "Sehrohrtiefe – Flugkörper frei, Mast sichtbar" : "getaucht – nur Sonar hört dich (langsam = leise)";
  } else if (isAir(DEF)) {
    const z = Math.round(me.z || 0);
    const zt = Math.round(me.zt || 0);
    const low = z < 60 && !state.landed;
    $("alt").textContent = state.landed ? "am Boden" : `${z} m${Math.abs(zt - z) > 5 ? ` → ${zt} m` : ""}`;
    $("altNote").textContent = low ? "Tiefflug – unter dem Radar" : z > 3500 ? "außer Reichweite von RAM/Stinger" : "";
  }
  const deg = Math.round(((me.h * 180) / Math.PI + 90 + 360) % 360);
  $("heading").textContent = `${String(deg).padStart(3, "0")}°`;
  $("pos").textContent = `${Math.round(me.x)} / ${Math.round(-me.y)}`;
  $("ping").textContent = state.ping ? `${Math.round(state.ping)} ms` : "–";
  if (DEF.kind !== "ship" && DEF.kind !== "sub") return;
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

function updateFrontHud(me) {
  const f = state.front;
  if (!f) return;
  const c = [0, 0, 0];
  f[0].forEach((o) => c[o === 0 ? 0 : o === 1 ? 1 : 2]++);
  $("frontMais").textContent = c[0];
  $("frontPaprika").textContent = c[1];
  $("frontNeutral").textContent = c[2] ? `· ${c[2]} neutral` : "";
  // Eroberungsanzeige, wenn man in einer Zone ist
  let txt = "";
  let pct = 0;
  let col = "";
  for (const o of map.outposts) {
    if (Math.hypot(me.x - o.x, me.y - o.y) > o.r) continue;
    const own = f[0][o.id];
    const prog = f[1][o.id];
    const mine = state.team === 0 ? -prog : prog;
    if (own === state.team && mine >= 100) txt = `${o.name}: gehalten`;
    else if (DEF.kind === "drone") txt = `${o.name}: Drohnen können nicht erobern`;
    else if (DEF.kind === "jet") txt = `${o.name}: Kampfflugzeuge können nicht erobern`;
    else if (isSub(DEF) && (me.z || 0) < DEPTH.periscope) txt = `${o.name}: auf Sehrohrtiefe gehen, um zu erobern`;
    else txt = `${o.name}: ${mine >= 0 ? "Eroberung" : "Neutralisieren"} ${Math.round(Math.abs(prog))}%`;
    pct = Math.abs(prog);
    col = prog < 0 ? TEAMS[0].color : TEAMS[1].color;
  }
  const cap = $("capture");
  cap.hidden = !txt;
  if (txt) {
    $("captureText").textContent = txt;
    $("captureBar").style.width = `${pct}%`;
    $("captureBar").style.background = col;
  }
}

function updateWeaponBar() {
  const info = state.meInfo;
  if (!info || !info.w) return;
  const setBar = (id, k) => {
    const el = $(id);
    if (el) el.style.width = `${clamp(k, 0, 1) * 100}%`;
  };
  const setText = (id, txt) => {
    const el = $(id);
    if (el && el.textContent !== txt) el.textContent = txt;
  };
  const setCells = (id, fn) => {
    document.querySelectorAll(`#${id} i`).forEach((c, i) => {
      const k = clamp(fn(i), 0, 1);
      c.style.setProperty("--k", `${k * 100}%`);
      c.classList.toggle("ready", k >= 1);
    });
  };
  const lockedShip = info.l && info.lt >= 1 && BOATS[typeOfId(info.l)]?.kind === "ship";
  const teamMark = state.marked.size > 0;
  state.myWeapons.forEach((w, i) => {
    const W = WEAPONS[w];
    const st = info.w[i];
    if (!st) return;
    if (W.kind === "gun" || W.kind === "mg" || W.kind === "jgun") {
      setBar(`w_${w}_b`, 1 - st[0]);
      if (W.kind === "gun") setText(`w_${w}_s`, st[0] > 0 ? "lädt" : state.aimInfo && !state.aimInfo.gunOk ? "toter Winkel" : "bereit");
    } else if (W.kind === "ssm") {
      setCells(`w_${w}_c`, (k) => 1 - st[k]);
      setText(`w_${w}_n`, `${st.filter((v) => v <= 0).length}/${st.length}`);
      setText(`w_${w}_s`, lockedShip ? "→ Lock-Ziel" : teamMark ? "→ Team-Markierung" : "→ Mauszeiger");
    } else {
      if (W.kind === "jam") {
        const [cd, act] = st;
        setBar(`w_${w}_b`, act > 0 ? act : 1 - cd);
        setText(`w_${w}_s`, act > 0 ? "STÖRT" : cd > 0 ? "lädt" : "bereit (F)");
        return;
      }
      const [n, max, rel] = st;
      setText(`w_${w}_n`, `${n}/${max}`);
      const lockedAir = info.l && info.lt >= 1 && isAir(BOATS[typeOfId(info.l)] || {});
      const lockedNaval = info.l && info.lt >= 1 && ["ship", "sub"].includes(BOATS[typeOfId(info.l)]?.kind);
      if (W.kind === "sam" || W.kind === "rkt") setBar(`w_${w}_b`, n >= max ? 1 : rel);
      else {
        setCells(`w_${w}_c`, (k) => (k < n ? 1 : k === n ? rel : 0));
        if (W.kind === "agm" || W.kind === "bomb") setText(`w_${w}_s`, lockedShip ? "→ Lock-Ziel" : teamMark && W.kind === "agm" ? "→ Team-Markierung" : "→ Mauszeiger");
        else if (W.kind === "aam") setText(`w_${w}_s`, W.ir ? "Infrarot · Ziel am Zeiger" : lockedAir ? "→ Lock-Ziel" : "Lock (R) für große Reichweite");
        else if (W.kind === "torp") setText(`w_${w}_s`, lockedNaval ? "→ Lock-Ziel" : "→ Mauszeiger, sucht selbst");
        else setText(`w_${w}_s`, "jagt sendende Radare");
      }
    }
  });
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
}

function updateAbilityHud() {
  const info = state.meInfo;
  if (!info) return;
  const A = ABILITIES[DEF.ability];
  const slot = $("abSlot");
  const banner = $("radarBanner");
  const isRadar = DEF.ability === "radar";
  if (info.ra > 0) {
    $("abState").textContent = `aktiv ${info.ra.toFixed(1)} s`;
    $("abBar").style.width = `${(info.ra / A.duration) * 100}%`;
    slot.className = "aslot active";
    banner.hidden = !isRadar;
    if (isRadar) {
      $("radarTime").textContent = `${info.ra.toFixed(1)} s`;
      $("radarBannerBar").style.width = `${(info.ra / A.duration) * 100}%`;
    }
  } else {
    banner.hidden = true;
    if (info.rc > 0) {
      $("abState").textContent = `lädt ${Math.ceil(info.rc)} s`;
      $("abBar").style.width = `${(1 - info.rc / A.cooldown) * 100}%`;
      slot.className = "aslot cooldown";
    } else {
      $("abState").textContent = "bereit";
      $("abBar").style.width = "100%";
      slot.className = "aslot ready";
    }
  }
}

// ---------------- Meldungen (Geld, Laden) ----------------
function showToast(text, kind = "ok") {
  const box = $("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3200);
}

// ---------------- Hangar (Bewaffnung von Luftfahrzeugen) ----------------
function toggleHangar(open = !state.hangarOpen) {
  if (open && (!state.landed || !DEF.slots)) {
    if (open && DEF.slots) showToast("Hangar nur nach der Landung (Flugfeld oder Träger)", "warn");
    return;
  }
  state.hangarOpen = open;
  $("hangar").hidden = !open;
  if (open) renderHangar();
}
$("hangarClose").addEventListener("click", () => toggleHangar(false));
$("hangarBtn").addEventListener("click", () => toggleHangar(true));

const LOADOUT_TEXT = {
  marte: "Seezielflugkörper mit großer Reichweite gegen Schiffe",
  hellfire: "Lenkflugkörper gegen Schiffe, folgt Lock oder Team-Markierung",
  stinger_aa: "Luft-Luft-Raketen gegen Hubschrauber, Drohnen und anfliegende Flugkörper",
  rkt70: "14 ungelenkte Raketen – schnelle Salven auf kurze Entfernung",
  armiger: "Anti-Radar-Flugkörper: jagt Schiffe mit eingeschaltetem Radar",
  harm: "Anti-Radar-Flugkörper: jagt Schiffe mit eingeschaltetem Radar",
  jammer: "Radarstörpod: 8 s Störung – gegnerische Sensoren halbiert, Locks und Lenkwaffen gestört; sendet selbst (ARM-Gefahr)",
};

function renderHangar() {
  const box = $("hangarSlots");
  box.replaceChildren();
  $("hangarTitle").textContent = `Hangar – ${DEF.label}`;
  for (const [slot, opts] of Object.entries(DEF.slots || {})) {
    const head = document.createElement("div");
    head.className = "spawnhead";
    head.textContent = `Waffenplatz ${+slot + 1}`;
    const row = document.createElement("div");
    row.className = "hangarRow";
    for (const w of opts) {
      const W = WEAPONS[w];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hangaropt" + (state.myWeapons[+slot] === w ? " sel" : "");
      const icon = document.createElement("span");
      icon.innerHTML = WEAPON_UI[w].icon; // feste Symbole aus ui.js
      const name = document.createElement("b");
      name.textContent = W.label;
      const desc = document.createElement("small");
      desc.textContent = LOADOUT_TEXT[w] || "";
      b.append(icon, name, desc);
      b.onclick = () => send({ t: "loadout", slot: +slot, w });
      row.appendChild(b);
    }
    box.append(head, row);
  }
}

// ---------------- Schiffsladen ----------------
function toggleShop(open = !state.shopOpen) {
  if (open && $("shopBtn").hidden) return;
  state.shopOpen = open;
  $("shop").hidden = !open;
  if (open) renderShop();
}
$("shopBtn").addEventListener("click", () => toggleShop());
$("shopClose").addEventListener("click", () => toggleShop(false));

function drawTypePreview(c, type, t) {
  const g = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1b5f92");
  bg.addColorStop(1, "#124a74");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const def = BOATS[type];
  const len = def.length * (Array.isArray(def.drawScale) ? def.drawScale[0] / 1.4 : 1);
  const s = Math.min((W * 0.86) / Math.max(len, def.beam), (H * 0.8) / Math.max(def.beam, 8));
  g.setTransform(s, 0, 0, s, W / 2, H / 2);
  const flag = TEAMS[def.team ?? state.team].flag;
  if (isAir(def)) {
    g.save();
    g.translate(2, 3);
    drawAirShadow(g, type);
    g.restore();
  }
  drawVehicle(g, type, { t, seed: 99, flag });
}

function renderShop() {
  if (!state.shopOpen) return;
  const info = state.meInfo;
  const money = info ? info.$ : 0;
  const owned = info ? info.own : START_SHIP;
  const myRank = info ? rankOf(info.xp) : 0;
  $("shopMoney").textContent = `${fmtMoney(money)} · ${RANKS[myRank].name}`;
  const box = $("shopItems");
  box.replaceChildren();
  for (const [type, def] of Object.entries(BOATS)) {
    if (def.team !== state.team) continue;
    const card = document.createElement("div");
    card.className = "shopitem";
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 110;
    c.dataset.type = type;
    const title = document.createElement("b");
    title.textContent = def.label;
    const stats = document.createElement("small");
    const kn = Math.round(def.maxSpeed * MS_TO_KN);
    const kinds = { ship: "Schiff", sub: "U-Boot", jet: def.vtol ? "Senkrechtstarter" : "Kampfflugzeug", heli: "Hubschrauber", drone: "Drohne" };
    stats.textContent = `${kinds[def.kind]} · Stufe ${def.level} · ${def.hp} HP · ${kn} kn · ${def.weapons.map((w) => WEAPON_UI[w].name).join(", ")}`;
    const btn = document.createElement("button");
    const need = def.rank || 0;
    if (def.kind === "heli") {
      btn.textContent = "Start im Startmenü";
      btn.disabled = true;
      stats.textContent += " · vom Flugfeld oder einem Landedeck";
    } else if (def.kind === "drone") {
      btn.textContent = "Start im Startmenü";
      btn.disabled = true;
      stats.textContent += " · Aufklärung und Zielmarkierung";
    } else if (type === state.myType) {
      btn.textContent = "Aktuell";
      btn.disabled = true;
    } else if (owned.includes(type)) {
      if (def.kind === "jet") {
        btn.textContent = "Gekauft · Start im Startmenü";
        btn.disabled = true;
      } else {
        btn.textContent = "Auswählen";
        btn.disabled = isAir(DEF);
        btn.onclick = () => send({ t: "switch", ship: type });
      }
    } else if (myRank < need) {
      btn.textContent = `ab ${RANKS[need].name} · ${fmtMoney(def.price)}`;
      btn.disabled = true;
    } else {
      btn.textContent = `Kaufen · ${fmtMoney(def.price)}`;
      btn.disabled = money < def.price;
      btn.onclick = () => send({ t: "buy", ship: type });
    }
    card.append(c, title, stats, btn);
    box.appendChild(card);
  }
}

function flagEl(team) {
  const f = TEAMS[team].flag;
  const el = document.createElement("span");
  el.className = "flag";
  el.style.background =
    f.dir === "vertical"
      ? `linear-gradient(90deg, ${f.colors[0]} 33.3%, ${f.colors[1]} 33.3% 66.6%, ${f.colors[2]} 66.6%)`
      : `linear-gradient(180deg, ${f.colors[0]} 33.3%, ${f.colors[1]} 33.3% 66.6%, ${f.colors[2]} 66.6%)`;
  return el;
}

function renderPlayerList() {
  const ol = $("plist");
  ol.replaceChildren();
  const byKills = (a, b) => (state.kills.get(b) || 0) - (state.kills.get(a) || 0) || a - b;
  const ids = [...state.names.keys()];
  const score = [0, 0];
  for (const id of ids) score[teamOf(id)] += state.kills.get(id) || 0;
  $("teamScore").replaceChildren(flagEl(0), ` ${score[0]} : ${score[1]} `, flagEl(1));
  // Eigenes Team zuerst
  for (const team of [state.team, 1 - state.team]) {
    const members = ids.filter((id) => teamOf(id) === team).sort(byKills);
    const head = document.createElement("li");
    head.className = "teamhead";
    head.style.color = TEAMS[team].color;
    head.append(flagEl(team), ` ${TEAMS[team].name} (${members.length})`);
    ol.appendChild(head);
    for (const id of members.slice(0, 8)) {
      const li = document.createElement("li");
      const r = id === state.myId && state.meInfo ? rankOf(state.meInfo.xp) : state.ranks.get(id) || 0;
      li.textContent = `${RANKS[r].short} ${state.names.get(id)}`;
      const k = document.createElement("span");
      k.className = "kills";
      k.textContent = `${state.kills.get(id) || 0} ⚓`;
      li.appendChild(k);
      if (id === state.myId) li.className = "me";
      ol.appendChild(li);
    }
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
  g.setTransform(1, 0, 0, 1, 0, 0);
  drawContinentsMinimap(g, (x) => 200 + x * s, s);
  drawBasesMinimap(g, (x) => 200 + x * s, s);
  return c;
})();

let mmTick = 0;
function drawMinimap(me, others) {
  if (++mmTick % 3) return;
  const helis = new Set(others.filter((o) => isAir(BOATS[o.type])).map((o) => o.id));
  const W = mm.width;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, W, W);
  mctx.drawImage(mmBase, 0, 0, W, W);
  const s = W / WORLD_SIZE;
  const toM = (x) => W / 2 + x * s;
  const info = state.meInfo;
  const t = performance.now() / 1000;
  // Radar-Rundumsuche: Reichweitenkreis und Strahl
  if (me && info && info.ra > 0 && DEF.ability === "radar") {
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
  drawOutpostsMinimap(mctx, toM, map, state.front, t);
  // Zuletzt gesehene Gegner
  const nowS = performance.now() / 1000;
  for (const [id, g] of ghosts) {
    if (g.seen) continue;
    const k = 1 - (nowS - g.t) / SENSORS.ghost;
    if (k <= 0) continue;
    mctx.strokeStyle = `rgba(255,138,122,${0.8 * k})`;
    mctx.lineWidth = 1;
    mctx.beginPath();
    mctx.arc(toM(g.x), toM(g.y), 3, 0, Math.PI * 2);
    mctx.stroke();
  }
  const lockId = info ? info.l : 0;
  for (const o of others) {
    if (o.id === lockId) continue;
    mctx.fillStyle = isFriend(o.id) ? "#8fe3ff" : "#ff5a4e";
    if (helis.has(o.id)) {
      // Hubschrauber als kleines Kreuz
      mctx.fillRect(toM(o.x) - 3, toM(o.y) - 0.8, 6, 1.6);
      mctx.fillRect(toM(o.x) - 0.8, toM(o.y) - 3, 1.6, 6);
    } else {
      mctx.beginPath();
      mctx.arc(toM(o.x), toM(o.y), o.type === "carrier" ? 3.8 : 2.5, 0, Math.PI * 2);
      mctx.fill();
    }
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
  drawContinents(ctx, view, t);
  drawIslands(view, t);
  drawOutposts(ctx, view, t, map, state.front, zoom);
  drawBases(ctx, view, t);
  state.pred = keep;
}

// ---------------- Menü + Vorschau ----------------
const pv = $("preview");
function choiceType() {
  const c = state.spawnChoice;
  if (c === "drone") return DRONE_OF[state.team];
  if (c.startsWith("jet:")) return BOATS[c.split(":")[1]] ? c.split(":")[1] : START_SHIP[state.team];
  if (c.startsWith("heli")) return state.team === 0 ? "nh90" : "blackhawk";
  return BOATS[c] && BOATS[c].team === state.team ? c : START_SHIP[state.team];
}

function drawPreview(now) {
  const t = now / 1000;
  if (state.shopOpen) for (const c of document.querySelectorAll("#shopItems canvas")) drawTypePreview(c, c.dataset.type, t);
  if ($("menu").hidden) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = 560 * dpr;
  const H = 150 * dpr;
  if (pv.width !== W) {
    pv.width = W;
    pv.height = H;
  }
  drawTypePreview(pv, choiceType(), t);
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
  try {
    localStorage.setItem("mkn-team", String(state.team));
  } catch {}
  if (state.ws) state.ws.close();
  fx.clear();
  connect(name, state.team, state.spawnChoice, state.spawnLoc);
  nameInput.blur();
});

// ---------------- Teamauswahl ----------------
function selectTeam(team) {
  state.team = team;
  for (const el of document.querySelectorAll(".teamcard")) el.classList.toggle("sel", +el.dataset.team === team);
  renderSpawnOptions();
}

// Startauswahl: Schnellboot, Hubschrauberträger (wenn gekauft), Black Hawk (wenn Träger im Team)
function optionButtons(box, opts, current, onPick) {
  box.replaceChildren();
  for (const o of opts) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "spawnopt" + (o.key === current ? " sel" : "") + (o.buy ? " buy" : "");
    b.disabled = !o.ok;
    const l = document.createElement("b");
    l.textContent = o.label;
    const sub = document.createElement("small");
    sub.textContent = o.sub;
    b.append(l, sub);
    b.onclick = () => onPick(o.key);
    box.appendChild(b);
  }
}

// Kauf im Menü (über die Konto-Schnittstelle)
async function buyFromMenu(type) {
  const def = BOATS[type];
  if (!confirm(`${def.label} für ${fmtMoney(def.price)} kaufen?`)) return;
  try {
    const r = await fetch("/api/buy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN, item: type }) });
    const d = await r.json();
    $("status").textContent = d.m || "";
    if (d.ok) {
      state.spawnChoice = def.kind === "jet" ? `jet:${type}:af` : type;
      refreshTeamStatus(true);
    }
  } catch {
    $("status").textContent = "Kauf fehlgeschlagen – keine Verbindung.";
  }
}

// Startauswahl: Schiffe/U-Boote, Kampfflugzeuge (Bahn oder Trägerdeck), Hubschrauber (Flugfeld/Landedeck), Drohne
function renderSpawnOptions() {
  const box = $("spawnOpts");
  if (!box) return;
  const st = state.status;
  const team = state.team;
  const acct = st && st.account;
  const owned = acct ? acct.owned : START_SHIP;
  const money = acct ? acct.money : 0;
  const myRank = acct ? rankOf(acct.xp) : 0;
  const carriers = st ? st.teams[team].carriers : [];
  const heli = team === 0 ? "nh90" : "blackhawk";
  const opts = [];
  const buyOpt = (key, def) => {
    const need = def.rank || 0;
    const rankOk = myRank >= need;
    opts.push({
      key: `buy:${key}`,
      label: def.short,
      sub: rankOk ? `kaufen · ${fmtMoney(def.price)}` : `ab ${RANKS[need].name}`,
      ok: rankOk && money >= def.price && !!acct,
      buy: true,
    });
  };
  for (const [key, def] of Object.entries(BOATS)) {
    if (def.team !== team || (def.kind !== "ship" && def.kind !== "sub")) continue;
    if (!owned.includes(key)) {
      buyOpt(key, def);
      continue;
    }
    const tag = def.kind === "sub" ? " · U-Boot" : def.carrier ? " · Träger" : def.heliSpots ? " · Landedeck" : "";
    opts.push({ key, label: def.short, sub: `Stufe ${def.level}${tag}`, ok: true });
  }
  // Kampfflugzeuge: von der Bahn, Senkrechtstarter auch vom Trägerdeck
  for (const [key, def] of Object.entries(BOATS)) {
    if (def.team !== team || def.kind !== "jet") continue;
    if (!owned.includes(key)) {
      buyOpt(key, def);
      continue;
    }
    opts.push({ key: `jet:${key}:af`, label: def.short, sub: "von der Startbahn", ok: true });
    if (def.vtol) {
      for (const c of carriers) {
        if (!BOATS[c.ship] || !BOATS[c.ship].carrier) continue;
        opts.push({ key: `jet:${key}:${c.id}`, label: `${def.short} · ${c.name}`, sub: `Trägerdeck · ${c.free > 0 ? `${c.free} frei` : "belegt"}`, ok: c.free > 0 });
      }
    }
  }
  opts.push({ key: "heli:af", label: BOATS[heli].short, sub: "vom Flugfeld", ok: true });
  // Jedes Schiff mit Landedeck: freie Plätze = Hubschrauber, die dort noch starten können
  for (const c of carriers) {
    const sd = BOATS[c.ship] || {};
    const total = c.total || (sd.heliSpots ? sd.heliSpots.length : 1);
    opts.push({
      key: `heli:${c.id}`,
      label: `${BOATS[sd.heliType || heli].short} · ${c.name}`,
      sub: `${sd.short || "Schiff"} · ${c.free > 0 ? `${c.free}/${total} frei` : `0/${total} – belegt`}`,
      ok: c.free > 0,
    });
  }
  opts.push({ key: "drone", label: BOATS[DRONE_OF[team]].short, sub: "vom Flugfeld · ARM/Störpod", ok: true });
  if (!opts.some((o) => o.key === state.spawnChoice && o.ok && !o.buy)) state.spawnChoice = START_SHIP[team];
  optionButtons(box, opts, state.spawnChoice, (k) => {
    if (k.startsWith("buy:")) return buyFromMenu(k.slice(4));
    state.spawnChoice = k;
    renderSpawnOptions();
  });
  // Startort: Heimathafen oder ein gehaltener Stützpunkt (nur kleine Schiffe)
  const def = BOATS[choiceType()];
  const small = (def.kind === "ship" || def.kind === "sub") && !def.carrier && def.level <= FRONT.maxSpawnLevel;
  const front = st && st.front ? st.front : null;
  const locs = [{ key: "", label: "Heimathafen", sub: "Marinebasis", ok: true }];
  if (def.kind === "ship" || def.kind === "sub") {
    for (const o of map.outposts) {
      if (!front || front.own[o.id] !== team) continue;
      locs.push({ key: `op:${o.id}`, label: `⚑ ${o.name}`, sub: small ? "Stützpunkt" : "nur Stufe 1–2", ok: small });
    }
  }
  if (!locs.some((l) => l.key === state.spawnLoc && l.ok)) state.spawnLoc = "";
  $("locRow").hidden = locs.length < 2;
  optionButtons($("spawnLocs"), locs, state.spawnLoc, (k) => {
    state.spawnLoc = k;
    renderSpawnOptions();
  });
  $("menuMoney").textContent = st && st.account ? `Konto: ${fmtMoney(st.account.money)}` : "";
  // Frontkarte
  const fm = $("frontMap");
  const fr = front ? [front.own, front.prog] : null;
  drawFrontMap(fm, map, fr, team);
  const c = [0, 0, 0];
  map.outposts.forEach((o) => {
    const own = front ? front.own[o.id] : -1;
    c[own === 0 ? 0 : own === 1 ? 1 : 2]++;
  });
  $("frontSummary").textContent = `Maiskolbistan ${c[0]} · Paprikistan ${c[1]} · neutral ${c[2]} von ${map.outposts.length} Stützpunkten`;
}
for (const el of document.querySelectorAll(".teamcard")) {
  const team = +el.dataset.team;
  const f = flagEl(team);
  f.className = "tflag";
  el.querySelector(".tflag").replaceWith(f);
  el.addEventListener("click", () => selectTeam(team));
}
selectTeam(state.team);

let statusTimer = 0;
async function refreshTeamStatus(once) {
  if (!$("menu").hidden || once) {
    try {
      const r = await fetch(`/status?token=${encodeURIComponent(TOKEN)}`, { cache: "no-store" });
      state.status = await r.json();
      if (state.status.auth === "invalid") {
        // Abgelaufene Sitzung: als Gast weiter, Anmelden im Menü
        setToken(null);
        $("status").textContent = "Deine Sitzung ist abgelaufen – bitte neu anmelden.";
        return refreshTeamStatus(true);
      }
      renderAccount(state.status);
      state.status.teams.forEach((tm, i) => {
        $(`tcount${i}`).textContent = `${tm.players} ${tm.players === 1 ? "Einheit" : "Einheiten"} · ${tm.kills} ⚓`;
      });
      renderSpawnOptions();
    } catch {}
  }
  if (!once) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(refreshTeamStatus, 3000);
  }
}
initAccount({
  getToken: () => TOKEN,
  setToken,
  refresh: () => refreshTeamStatus(true),
  toast: (m) => ($("status").textContent = m),
});
refreshTeamStatus();

requestAnimationFrame(frame);
