import {
  TICK_RATE,
  DT,
  BOATS,
  TYPE_BY_ID,
  START_SHIP,
  DRONE_OF,
  isAir,
  WEAPONS,
  ABILITIES,
  ECONOMY,
  PROJ_OF_KIND,
  INTERCEPTABLE,
  SENSORS,
  FRONT,
  sensorRange,
  signature,
  WORLD_SIZE,
  generateMap,
  findSpawn,
  stepEntity,
  resolveBoatCollision,
  boatCircles,
  sanitizeName,
  isOnLand,
  aimAngles,
  slewTurret,
  segDist,
  clamp,
  wrapAngle,
  TEAMS,
  baseSpawn,
  carrierSpawn,
  droneSpawn,
  heliSpotWorld,
  outpostSpawn,
  harborRect,
  teamBase,
  inRect,
  airfieldRect,
  runwayRect,
  runwayStart,
  helipadSpawn,
  apronSpot,
  slotOptions,
  ALTITUDE,
} from "../public/shared/sim.js";
import ASSETS from "./assets.gen.js";

const MAX_PLAYERS = 64;
const MAX_QUEUE = 6;
const SPAWN_PROTECTION = 4; // s
// Bei Protokolländerungen erhöhen: Laufende Durable Objects behalten nach einem Deploy
// ihren alten Code, solange Spieler verbunden sind. Neue Verbindungen landen so in einer frischen Welt.
// Konten und Frontkarte liegen in eigenen, versionsunabhängigen Durable Objects ("konten", "front").
const WORLD_VERSION = 11;
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;
const RAFT_LIFE = 90; // s

const worldStub = (env) => env.WORLD.get(env.WORLD.idFromName(`haupt-ozean-v${WORLD_VERSION}`));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket erwartet", { status: 426 });
      }
      return worldStub(env).fetch(request);
    }
    if (url.pathname === "/status") {
      const token = url.searchParams.get("token") || "";
      const q = TOKEN_RE.test(token) ? `?token=${token}` : "";
      return worldStub(env).fetch(new Request(`https://welt/status${q}`));
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Object.hasOwn(ASSETS, path) ? ASSETS[path] : null;
    const head = request.method === "HEAD";
    if (!file || (request.method !== "GET" && !head)) return new Response("Nicht gefunden", { status: 404 });
    const headers = { "content-type": file.type, "cache-control": "public, max-age=60" };
    // Einbettung nur auf der eigenen Seite und auf spiele.maiskolbistan.app
    if (file.type.startsWith("text/html")) {
      headers["content-security-policy"] = "frame-ancestors 'self' https://spiele.maiskolbistan.app";
    }
    if (file.b64) {
      headers["cache-control"] = "public, max-age=3600";
      return new Response(head ? null : Uint8Array.from(atob(file.b64), (ch) => ch.charCodeAt(0)), { headers });
    }
    return new Response(head ? null : file.body, { headers });
  },
};

const defaultAccount = () => ({ money: 0, owned: [...START_SHIP] });

export class World {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.map = generateMap();
    this.players = new Map(); // id -> player
    this.projectiles = [];
    this.rafts = []; // Schiffbrüchige: { id, x, y, t }
    this.events = []; // Effekte dieses Ticks: [typ, x, y, ...]
    this.accounts = new Map(); // token -> { money, owned, dirty }
    this.front = null; // { own: [], prog: [] }
    this.frontDirty = false;
    this.det = [new Set(), new Set()]; // vom Team erfasste Gegner
    this.nextId = 1;
    this.nextProj = 1;
    this.nextRaft = 1;
    this.tick = 0;
    this.timer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    // ---- Kontenspeicher (Instanz "konten", nur intern erreichbar) ----
    if (url.pathname === "/acct") {
      const token = url.searchParams.get("token") || "";
      if (!TOKEN_RE.test(token)) return new Response("bad token", { status: 400 });
      if (request.method === "POST") {
        const body = await request.json();
        const acct = {
          money: Math.max(0, Math.floor(+body.money || 0)),
          owned: (Array.isArray(body.owned) ? body.owned : []).filter((t) => BOATS[t]),
          loadout: body.loadout && typeof body.loadout === "object" ? body.loadout : {},
        };
        for (const s of START_SHIP) if (!acct.owned.includes(s)) acct.owned.push(s);
        await this.state.storage.put(`a:${token}`, acct);
        return new Response("ok");
      }
      return Response.json((await this.state.storage.get(`a:${token}`)) || defaultAccount());
    }
    // ---- Frontkarte (Instanz "front", nur intern erreichbar) ----
    if (url.pathname === "/front") {
      if (request.method === "POST") {
        await this.state.storage.put("front", await request.json());
        return new Response("ok");
      }
      return Response.json((await this.state.storage.get("front")) || null);
    }
    if (url.pathname === "/status") {
      await this.ensureFront();
      const teams = TEAMS.map(() => ({ players: 0, kills: 0, carriers: [] }));
      for (const p of this.players.values()) {
        teams[p.team].players++;
        teams[p.team].kills += p.kills;
        if (BOATS[p.type].heliSpots) teams[p.team].carriers.push({ id: p.id, name: p.name, ship: p.type, free: this.freeHeliSpots(p), total: BOATS[p.type].heliSpots.length });
      }
      const token = url.searchParams.get("token");
      const account = token ? await this.getAccount(token) : null;
      return Response.json(
        { teams, front: this.front, account: account && { money: account.money, owned: account.owned } },
        { headers: { "cache-control": "no-store" } }
      );
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.handleSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- Konten ----------

  kontenStub() {
    return this.env.WORLD.get(this.env.WORLD.idFromName("konten"));
  }

  async getAccount(token) {
    if (!TOKEN_RE.test(token)) return null;
    let a = this.accounts.get(token);
    if (a) {
      a.seen = Date.now();
      return a;
    }
    try {
      const r = await this.kontenStub().fetch(`https://konten/acct?token=${token}`);
      const data = await r.json();
      a = { money: data.money | 0, owned: data.owned || [...START_SHIP], loadout: data.loadout || {}, dirty: false };
    } catch {
      a = { ...defaultAccount(), dirty: false };
    }
    for (const s of START_SHIP) if (!a.owned.includes(s)) a.owned.push(s);
    // Wer den Träger vor der Aufteilung in Nationen gekauft hat, bekommt auch das Gegenstück
    if (a.owned.includes("carrier") && !a.owned.includes("america")) {
      a.owned.push("america");
      a.dirty = true;
    }
    // Nur für lokale Tests (wrangler dev --var DEV_START_MONEY:…): neue Konten mit Startguthaben
    if (this.env.DEV_START_MONEY && a.money === 0 && a.owned.length <= START_SHIP.length) a.money = +this.env.DEV_START_MONEY || 0;
    if (!this.accounts.has(token)) this.accounts.set(token, a);
    a = this.accounts.get(token);
    a.seen = Date.now();
    return a;
  }

  async flushAccounts() {
    const inUse = new Set([...this.players.values()].map((p) => p.token));
    for (const [token, a] of this.accounts) {
      if (a.dirty) {
        a.dirty = false;
        try {
          await this.kontenStub().fetch(`https://konten/acct?token=${token}`, {
            method: "POST",
            body: JSON.stringify({ money: a.money, owned: a.owned, loadout: a.loadout || {} }),
          });
        } catch {
          a.dirty = true;
        }
      }
      // Erst nach einer Minute ohne Benutzung aus dem Zwischenspeicher nehmen (sonst kann ein
      // gerade beitretender Spieler ein Konto halten, das nicht mehr gespeichert wird)
      if (!a.dirty && !inUse.has(token) && Date.now() - (a.seen || 0) > 60000) this.accounts.delete(token);
    }
  }

  // Chat: an alle oder nur ans eigene Team; ":DEV_GIVE_TALER_<Wert>" ist ein Entwickler-Befehl
  chat(p, msg) {
    const text = String(msg.m ?? "")
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, "")
      .trim()
      .slice(0, 140);
    if (!text) return;
    const dev = /^:DEV_GIVE_TALER_(\d{1,12})$/i.exec(text);
    if (dev) {
      const amount = Math.min(+dev[1], 1e9);
      if (amount > 0 && p.acct) {
        p.acct.money += amount;
        p.acct.dirty = true;
        this.flushAccounts();
      }
      this.send(p.ws, { t: "chat", sys: true, m: `Dev: +${amount.toLocaleString("de-DE")} Taler` });
      return;
    }
    const now = Date.now();
    if (now - (p.chatT || 0) < 700) return; // Spam-Bremse
    p.chatT = now;
    const toTeam = !!msg.team;
    const data = JSON.stringify({ t: "chat", id: p.id, n: p.name, tm: p.team, m: text, to: toTeam });
    for (const o of this.players.values()) {
      if (toTeam && o.team !== p.team) continue;
      try {
        o.ws.send(data);
      } catch {}
    }
  }

  addMoney(p, amount, why) {
    if (!p || !p.acct || amount <= 0) return;
    p.acct.money += Math.round(amount);
    p.acct.dirty = true;
    if (why) this.send(p.ws, { t: "reward", a: Math.round(amount), m: why });
  }

  // ---------- Frontkarte ----------

  frontStub() {
    return this.env.WORLD.get(this.env.WORLD.idFromName("front"));
  }

  async ensureFront() {
    if (this.front) return;
    const n = this.map.outposts.length;
    let f = null;
    try {
      const r = await this.frontStub().fetch("https://front/front");
      f = await r.json();
    } catch {}
    if (this.front) return;
    if (!f || !Array.isArray(f.own) || f.own.length !== n) f = { own: Array(n).fill(-1), prog: Array(n).fill(0) };
    this.front = f;
  }

  async flushFront() {
    if (!this.frontDirty || !this.front) return;
    this.frontDirty = false;
    try {
      await this.frontStub().fetch("https://front/front", { method: "POST", body: JSON.stringify(this.front) });
    } catch {
      this.frontDirty = true;
    }
  }

  // Eroberung: nur Schiffe und Hubschrauber eines Teams in der Zone → Fortschritt Richtung ±100
  captureTick() {
    const f = this.front;
    if (!f) return;
    for (const o of this.map.outposts) {
      const n = [0, 0];
      const present = [[], []];
      for (const p of this.players.values()) {
        const def = BOATS[p.type];
        if (def.kind === "drone") continue;
        if (def.kind === "heli" && (p.b.z || 0) > ALTITUDE.captureHeli) continue;
        if (Math.hypot(p.b.x - o.x, p.b.y - o.y) < o.r) {
          n[p.team]++;
          present[p.team].push(p);
        }
      }
      if ((n[0] > 0) === (n[1] > 0)) continue; // leer oder umkämpft
      const team = n[0] > 0 ? 0 : 1;
      const dir = team === 0 ? -1 : 1;
      const before = f.prog[o.id];
      const prevOwn = f.own[o.id];
      f.prog[o.id] = clamp(before + dir * FRONT.rate * Math.min(3, n[team]), -100, 100);
      if (f.prog[o.id] === before) continue;
      this.frontDirty = true;
      let own = prevOwn;
      if (f.prog[o.id] <= -100) own = 0;
      else if (f.prog[o.id] >= 100) own = 1;
      else if ((prevOwn === 0 && f.prog[o.id] > 0) || (prevOwn === 1 && f.prog[o.id] < 0)) own = -1;
      if (own !== prevOwn) {
        f.own[o.id] = own;
        this.broadcast({ t: "front", i: o.id, own, prev: prevOwn, by: team });
        for (const p of present[team]) {
          if (own === team) this.addMoney(p, ECONOMY.capture, `Stützpunkt ${o.name} erobert`);
          else this.addMoney(p, ECONOMY.neutralize, `Stützpunkt ${o.name} neutralisiert`);
        }
        this.flushFront();
      }
    }
  }

  // ---------- Verbindungen ----------

  handleSocket(ws) {
    let player = null;
    let joining = false;

    ws.addEventListener("message", async (ev) => {
      if (typeof ev.data !== "string" || ev.data.length > 512) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.t === "ping") {
        this.send(ws, { t: "pong", c: msg.c });
        return;
      }
      if (msg.t === "join" && !player && !joining) {
        joining = true;
        if (this.players.size >= MAX_PLAYERS) {
          this.send(ws, { t: "full" });
          ws.close(1013, "Server voll");
          return;
        }
        await this.ensureFront();
        const token = TOKEN_RE.test(msg.token || "") ? msg.token : null;
        const acct = token ? await this.getAccount(token) : { ...defaultAccount(), dirty: false };
        const team = msg.team === 1 ? 1 : 0;
        const { type, spawn, carrierId, note } = this.chooseSpawn(team, String(msg.spawn || ""), String(msg.loc || ""), acct);
        player = this.createPlayer(ws, msg.name, team, type, spawn, () => {
          player = null;
        });
        player.token = token;
        player.acct = acct;
        player.carrierId = carrierId || 0;
        this.resetLoadout(player); // jetzt mit der im Konto gespeicherten Hangar-Bewaffnung
        if (carrierId && player.spot !== undefined) player.landed = { kind: "carrier", carrierId, spot: player.spot };
        this.players.set(player.id, player);
        this.send(ws, {
          t: "welcome",
          id: player.id,
          tickRate: TICK_RATE,
          team: player.team,
          type: player.type,
          note,
          players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, type: p.type, team: p.team })),
        });
        this.broadcast({ t: "join", id: player.id, name: player.name, type: player.type, team: player.team }, player.id);
        this.ensureLoop();
        return;
      }
      if (!player) return;
      if (msg.t === "in") {
        const seq = msg.s | 0;
        if (seq <= player.ack) return;
        player.queue.push({ s: seq, th: +msg.th || 0, ru: +msg.ru || 0, up: +msg.up || 0 });
        if (player.queue.length > MAX_QUEUE) player.queue.splice(0, player.queue.length - MAX_QUEUE);
        const mx = +msg.mx;
        const my = +msg.my;
        if (Number.isFinite(mx) && Number.isFinite(my)) {
          player.mx = clamp(mx, -WORLD_SIZE, WORLD_SIZE);
          player.my = clamp(my, -WORLD_SIZE, WORLD_SIZE);
        }
      } else if (msg.t === "fire") {
        this.fire(player, msg.w);
      } else if (msg.t === "ability") {
        this.ability(player);
      } else if (msg.t === "lock") {
        this.lock(player, +msg.x, +msg.y);
      } else if (msg.t === "radar") {
        if (BOATS[player.type].kind === "ship") player.radarOn = !!msg.on;
      } else if (msg.t === "buy") {
        this.buy(player, msg.ship);
      } else if (msg.t === "switch") {
        this.switchShip(player, msg.ship);
      } else if (msg.t === "chat") {
        this.chat(player, msg);
      } else if (msg.t === "loadout") {
        this.setLoadout(player, msg.slot | 0, String(msg.w || ""));
      }
    });

    const drop = () => {
      if (player && this.players.get(player.id) === player) {
        this.players.delete(player.id);
        this.broadcast({ t: "leave", id: player.id });
        this.flushAccounts();
      }
      player = null;
    };
    ws.addEventListener("close", drop);
    ws.addEventListener("error", drop);
  }

  // Welcher Typ und wo?
  // want: Schiffsname | "heli:<trägerId>" | "drone"; loc: "" (Basis) | "op:<id>" (gehaltener Stützpunkt)
  chooseSpawn(team, want, loc, acct) {
    const start = START_SHIP[team];
    const fallback = (note) => ({ type: start, spawn: this.spawnInHarbor(team, BOATS[start]), note });
    if (want === "drone") {
      return { type: DRONE_OF[team], spawn: droneSpawn(team) };
    }
    if (want === "heli:af") {
      // Start vom Hubschrauberlandeplatz des Flugfelds
      const heliType = team === 0 ? "nh90" : "blackhawk";
      const others = [...this.players.values()];
      for (let i = 0; i < 3; i++) {
        const s = helipadSpawn(team, i);
        if (!others.some((p) => Math.hypot(p.b.x - s.x, p.b.y - s.y) < 30)) return { type: heliType, spawn: s };
      }
      return { type: heliType, spawn: helipadSpawn(team, Math.floor(Math.random() * 3)) };
    }
    if (want.startsWith("heli")) {
      const wantedId = +want.split(":")[1] || 0;
      const c = this.players.get(wantedId);
      if (!c || c.team !== team || !BOATS[c.type].heliSpots || this.freeHeliSpots(c) <= 0) {
        const r = this.chooseSpawn(team, "heli:af", loc, acct);
        return { ...r, note: "Landedeck nicht mehr frei – Start vom Flugfeld." };
      }
      const cdef = BOATS[c.type];
      // Jeder Landeplatz trägt genau einen Hubschrauber, bis dieser zerstört ist
      const reserved = new Set([...this.players.values()].filter((p) => p.carrierId === c.id).map((p) => p.spot));
      const landed = new Set([...this.players.values()].filter((p) => p.landed && p.landed.carrierId === c.id).map((p) => p.landed.spot));
      let spot = cdef.heliSpots.findIndex((_, i) => !reserved.has(i) && !landed.has(i));
      if (spot < 0) spot = cdef.heliSpots.findIndex((_, i) => !reserved.has(i));
      const s = heliSpotWorld(c.b, spot, cdef);
      return { type: cdef.heliType, spawn: { ...s, spot }, carrierId: c.id };
    }
    const def = BOATS[want];
    if (!def || def.kind !== "ship" || def.team !== team) return fallback();
    if (!acct.owned.includes(want)) return fallback(`${def.short} noch nicht gekauft – Start mit dem Standardschiff.`);
    if (loc.startsWith("op:") && (def.carrier || def.level > FRONT.maxSpawnLevel)) {
      return { type: want, spawn: this.spawnInHarbor(team, def), note: `${def.short} ist zu groß für den Stützpunkt – Start im Heimathafen.` };
    }
    if (loc.startsWith("op:")) {
      const o = this.map.outposts[+loc.slice(3)];
      if (o && this.front && this.front.own[o.id] === team) {
        const s = outpostSpawn(this.map, o, team, def);
        if (s) return { type: want, spawn: s };
      }
      return { type: want, spawn: this.spawnInHarbor(team, def), note: "Stützpunkt nicht mehr in eurer Hand – Start im Hafen." };
    }
    return { type: want, spawn: def.carrier ? this.spawnCarrier(team, def) : this.spawnInHarbor(team, def) };
  }

  freeHeliSpots(carrier) {
    let used = 0;
    for (const p of this.players.values()) if (p.carrierId === carrier.id) used++;
    return BOATS[carrier.type].heliSpots.length - used;
  }

  createPlayer(ws, name, team, type, spawn, onDeath) {
    const p = {
      id: this.nextId++,
      name: sanitizeName(name),
      team,
      type,
      ws,
      onDeath,
      b: { x: spawn.x, y: spawn.y, h: spawn.h, v: 0, w: 0, z: 0, zt: 0 },
      spot: spawn.spot,
      queue: [],
      last: { th: 0, ru: 0 },
      ack: 0,
      mx: spawn.x + Math.cos(spawn.h) * 100,
      my: spawn.y + Math.sin(spawn.h) * 100,
      kills: 0,
      damagers: new Map(), // Angreifer-ID -> { dmg, t }
      lockId: 0,
      lockT: 0,
      radarOn: true,
    };
    this.resetLoadout(p);
    return p;
  }

  // Waffen und Trefferpunkte für den aktuellen Typ
  resetLoadout(p) {
    const def = BOATS[p.type];
    p.hp = def.hp;
    p.protect = SPAWN_PROTECTION;
    p.gunAim = 0;
    p.gunOk = false;
    p.gunAng = 0;
    p.ramAim = 0;
    p.ramAng = 0;
    p.abT = 0;
    p.abCd = 0;
    p.radarOn = true;
    p.landed = null;
    // Bewaffnung: Standard des Typs, Hangar-Auswahl aus dem Konto
    p.weapons = [...def.weapons];
    const saved = p.acct && p.acct.loadout && p.acct.loadout[p.type];
    if (saved) {
      for (const [i, w] of Object.entries(saved)) {
        const opts = slotOptions(def, +i);
        if (opts && opts.includes(w)) p.weapons[+i] = w;
      }
    }
    p.ws_ = {};
    for (const w of p.weapons) this.initWeapon(p, w);
  }

  initWeapon(p, w) {
    const def = BOATS[p.type];
    {
      const W = WEAPONS[w];
      if (W.kind === "ssm") p.ws_[w] = { cd: 0, cells: def.ssm.map(() => 0) };
      else if (W.kind === "gun" || W.kind === "mg") p.ws_[w] = { cd: 0 };
      else if (W.kind === "jam") p.ws_[w] = { cd: 0, act: 0 };
      else {
        const max = (def.mags && def.mags[w]) || W.magazine || W.count;
        p.ws_[w] = { cd: 0, n: max, max, rel: 0, rail: 0 };
      }
    }
  }

  // Hangar: Bewaffnung eines Waffenplatzes ändern (nur gelandet)
  setLoadout(p, slot, w) {
    const def = BOATS[p.type];
    const opts = slotOptions(def, slot);
    if (!opts || !opts.includes(w)) return;
    if (!p.landed) return this.send(p.ws, { t: "shop", ok: false, m: "Bewaffnung nur nach der Landung im Hangar." });
    const old = p.weapons[slot];
    if (old === w) return;
    delete p.ws_[old];
    p.weapons[slot] = w;
    this.initWeapon(p, w);
    if (p.acct) {
      p.acct.loadout = p.acct.loadout || {};
      p.acct.loadout[p.type] = { ...(p.acct.loadout[p.type] || {}), [slot]: w };
      p.acct.dirty = true;
    }
    this.send(p.ws, { t: "shop", ok: true, m: `Neu bewaffnet: ${WEAPONS[w].label}` });
  }

  // Landung: Drohne langsam über der eigenen Bahn, Hubschrauber schwebend über Träger-Landepunkt oder Flugfeld
  checkLanding(p) {
    const def = BOATS[p.type];
    if (p.landed || !isAir(def) || p.ackLaunch > 0) return;
    if (def.kind === "drone") {
      if (Math.abs(p.b.v) <= def.minSpeed + 4 && (p.b.z || 0) <= ALTITUDE.landDrone && inRect(runwayRect(p.team), p.b.x, p.b.y)) {
        const others = [...this.players.values()];
        let spot = apronSpot(p.team, 0);
        for (let i = 0; i < 4; i++) {
          const s = apronSpot(p.team, i);
          if (!others.some((o) => o !== p && o.landed && Math.hypot(o.b.x - s.x, o.b.y - s.y) < 20)) {
            spot = s;
            break;
          }
        }
        Object.assign(p.b, { x: spot.x, y: spot.y, h: spot.h, v: 0, w: 0, z: 0, zt: 0 });
        p.landed = { kind: "airfield" };
        this.send(p.ws, { t: "landed", where: "Flugfeld" });
      }
      return;
    }
    if (Math.abs(p.b.v) > 6 || (p.b.z || 0) > ALTITUDE.landHeli) return;
    for (const c of this.players.values()) {
      const cd = BOATS[c.type];
      if (!cd.heliSpots || c.team !== p.team) continue;
      for (let i = 0; i < cd.heliSpots.length; i++) {
        const sp = heliSpotWorld(c.b, i, cd);
        if (Math.hypot(sp.x - p.b.x, sp.y - p.b.y) > 18) continue;
        const busy = [...this.players.values()].some((o) => o !== p && o.landed && o.landed.carrierId === c.id && o.landed.spot === i);
        if (busy) continue;
        p.landed = { kind: "carrier", carrierId: c.id, spot: i };
        p.b.z = p.b.zt = 0;
        this.send(p.ws, { t: "landed", where: `Träger von ${c.name}` });
        return;
      }
    }
    if (inRect(airfieldRect(p.team), p.b.x, p.b.y)) {
      p.b.v = 0;
      p.b.z = p.b.zt = 0;
      p.landed = { kind: "airfield" };
      this.send(p.ws, { t: "landed", where: "Flugfeld" });
    }
  }

  takeOff(p) {
    const def = BOATS[p.type];
    if (def.kind === "drone") {
      const s = runwayStart(p.team);
      Object.assign(p.b, { x: s.x, y: s.y, h: s.h, v: def.minSpeed, w: 0, z: 0, zt: 900 });
    } else {
      p.b.z = 0;
      p.b.zt = 60; // Hubschrauber steigt nach dem Abheben auf 60 m
    }
    p.landed = null;
    p.ackLaunch = 3; // s: nach dem Start nicht sofort wieder landen
    this.send(p.ws, { t: "landed", where: null });
  }

  spawnInHarbor(team, def) {
    const others = [...this.players.values()];
    const n = 8;
    const start = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i++) {
      const s = baseSpawn(team, start + i, def);
      if (!others.some((p) => BOATS[p.type].kind === "ship" && Math.hypot(p.b.x - s.x, p.b.y - s.y) < 40 + BOATS[p.type].length / 2 + def.length / 2)) return s;
    }
    return this.spawnOutside(team);
  }

  spawnCarrier(team, def) {
    const s = carrierSpawn(team);
    const blocked = [...this.players.values()].some(
      (p) => BOATS[p.type].kind === "ship" && Math.abs(p.b.y - s.y) < 45 && Math.abs(p.b.x - s.x) < def.length / 2 + 30
    );
    return blocked ? this.spawnOutside(team, 300) : s;
  }

  spawnOutside(team, extra = 0) {
    const base = teamBase(team);
    const s = {
      x: base.edge + base.dir * (840 + extra + Math.random() * 200),
      y: (Math.random() - 0.5) * 600,
      h: base.dir === 1 ? 0 : Math.PI,
    };
    return isOnLand(this.map, s.x, s.y, 150) ? findSpawn(this.map) : s;
  }

  // ---------- Laden ----------

  inOwnHarbor(p) {
    return BOATS[p.type].kind === "ship" && inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y);
  }

  buy(p, ship) {
    const def = BOATS[ship];
    if (!def || def.kind !== "ship" || def.team !== p.team || !p.acct) return;
    if (p.acct.owned.includes(ship)) return this.send(p.ws, { t: "shop", ok: false, m: "Bereits gekauft." });
    if (!this.inOwnHarbor(p)) return this.send(p.ws, { t: "shop", ok: false, m: "Der Laden ist nur im eigenen Hafen geöffnet." });
    if (p.acct.money < def.price) return this.send(p.ws, { t: "shop", ok: false, m: "Nicht genug Taler." });
    p.acct.money -= def.price;
    p.acct.owned.push(ship);
    p.acct.dirty = true;
    this.flushAccounts();
    this.send(p.ws, { t: "shop", ok: true, m: `${def.short} gekauft!`, owned: p.acct.owned });
  }

  switchShip(p, ship) {
    const def = BOATS[ship];
    if (!def || def.kind !== "ship" || def.team !== p.team || !p.acct || !p.acct.owned.includes(ship) || ship === p.type) return;
    if (!this.inOwnHarbor(p)) return this.send(p.ws, { t: "shop", ok: false, m: "Schiffswechsel nur im eigenen Hafen." });
    for (const o of this.players.values()) if (o.carrierId === p.id) o.carrierId = 0;
    p.type = ship;
    const s = def.carrier ? this.spawnCarrier(p.team, def) : this.spawnInHarbor(p.team, def);
    Object.assign(p.b, { x: s.x, y: s.y, h: s.h, v: 0, w: 0 });
    p.queue = [];
    p.last = { th: 0, ru: 0 };
    p.lockId = 0;
    p.lockT = 0;
    this.resetLoadout(p);
    this.send(p.ws, { t: "retype", type: ship });
    this.broadcast({ t: "retype", id: p.id, type: ship }, p.id);
  }

  // ---------- Sensoren ----------

  emitting(p) {
    const def = BOATS[p.type];
    if (this.jamming(p)) return true; // Störsender strahlt (Home-on-Jam)
    return def.kind === "ship" && (p.radarOn || (p.abT > 0 && def.ability === "radar"));
  }

  // Radarwarnanlage: wer hat mich im Lock (Peilung, Fortschritt) und welche Flugkörper fliegen auf mich zu
  threats(p) {
    const r = (n, f = 100) => Math.round(n * f) / f;
    const lk = [];
    for (const o of this.players.values()) {
      if (o.team === p.team || o.lockId !== p.id) continue;
      lk.push([r(Math.atan2(o.b.y - p.b.y, o.b.x - p.b.x)), r(o.lockT / WEAPONS.lock.time)]);
    }
    const ms = [];
    for (const q of this.projectiles) {
      if (q.team === p.team || q.dead) continue;
      if (q.target !== p.id && q.air !== p.id) continue;
      ms.push([r(Math.atan2(q.y - p.b.y, q.x - p.b.x)), Math.round(Math.hypot(q.x - p.b.x, q.y - p.b.y))]);
    }
    return { lk, ms };
  }

  jamming(p) {
    const st = p.ws_ && p.ws_.jammer;
    return !!(st && st.act > 0);
  }

  // Ist Position (x, y) im Wirkbereich eines aktiven gegnerischen Störers? (gegnerisch aus Sicht von team)
  jammedAt(x, y, team, radiusKey = "radius") {
    for (const j of this.players.values()) {
      if (j.team === team || !this.jamming(j)) continue;
      if (Math.hypot(j.b.x - x, j.b.y - y) < WEAPONS.jammer[radiusKey]) return j;
    }
    return null;
  }

  // Welche Gegner erfasst jedes Team? (eigene Fahrzeuge, Basis, gehaltene Stützpunkte)
  computeDetection() {
    const list = [...this.players.values()];
    const sources = [[], []];
    for (const p of list) {
      const def = BOATS[p.type];
      const abilityRadar = p.abT > 0 && def.ability === "radar";
      const jam = this.jammedAt(p.b.x, p.b.y, p.team) ? WEAPONS.jammer.sensorFactor : 1;
      sources[p.team].push({ x: p.b.x, y: p.b.y, r: sensorRange(def, p.radarOn, abilityRadar, p.b.z || 0) * jam });
    }
    for (const t of [0, 1]) {
      const hr = harborRect(teamBase(t));
      sources[t].push({ x: (hr.x0 + hr.x1) / 2, y: 0, r: SENSORS.base });
    }
    if (this.front) {
      for (const o of this.map.outposts) {
        const own = this.front.own[o.id];
        if (own >= 0) sources[own].push({ x: o.x, y: o.y, r: SENSORS.outpost });
      }
    }
    const det = [new Set(), new Set()];
    for (const e of list) {
      const t = 1 - e.team;
      const sig = signature(BOATS[e.type], this.emitting(e), e.b.z || 0);
      for (const s of sources[t]) {
        const d = Math.hypot(e.b.x - s.x, e.b.y - s.y);
        if (d < Math.max(450, s.r * sig)) {
          det[t].add(e.id);
          break;
        }
      }
    }
    this.det = det;
    this.sources = sources;
  }

  // ---------- Waffen ----------

  // Ziel für Lenkflugkörper: eigener Lock oder Markierung eines Teammitglieds (z. B. Drohne)
  guidedTarget(p, range, wantShip = true) {
    const ok = (t) => t && (!wantShip || BOATS[t.type].kind === "ship") && this.det[p.team].has(t.id) && Math.hypot(t.b.x - p.b.x, t.b.y - p.b.y) < range;
    if (p.lockId && p.lockT >= WEAPONS.lock.time) {
      const t = this.players.get(p.lockId);
      if (ok(t)) return t;
    }
    let best = null;
    let bestD = Infinity;
    for (const o of this.players.values()) {
      if (o.team !== p.team || o === p || !o.lockId || o.lockT < WEAPONS.lock.time) continue;
      const t = this.players.get(o.lockId);
      if (!ok(t)) continue;
      const d = Math.hypot(t.b.x - p.mx, t.b.y - p.my);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  fire(p, w) {
    const def = BOATS[p.type];
    if (!p.weapons.includes(w) || p.landed) return;
    const W = WEAPONS[w];
    const st = p.ws_[w];
    if (!st || st.cd > 0) return;
    const b = p.b;
    const c = Math.cos(b.h);
    const s = Math.sin(b.h);
    const toMouse = Math.atan2(p.my - b.y, p.mx - b.x);
    if (W.kind === "gun") {
      if (!p.gunOk || Math.abs(p.gunAng - p.gunAim) > 0.06) return;
      st.cd = W.reload;
      const a = b.h + p.gunAng + (Math.random() - 0.5) * 2 * W.spread;
      const gx = b.x + c * def.gun.x + Math.cos(a) * 5;
      const gy = b.y + s * def.gun.x + Math.sin(a) * 5;
      this.spawnProj(p, w, gx, gy, a, W.speed);
      this.events.push(["muzzle", gx, gy, a]);
    } else if (W.kind === "mg") {
      st.cd = W.reload;
      const a = toMouse + (Math.random() - 0.5) * 2 * W.spread;
      this.spawnProj(p, w, b.x + Math.cos(a) * 3, b.y + Math.sin(a) * 3, a, W.speed);
    } else if (W.kind === "ssm") {
      const cell = st.cells.findIndex((t) => t <= 0);
      if (cell < 0) return;
      st.cells[cell] = W.reload;
      st.cd = W.interval;
      const L = def.ssm[cell];
      const x = b.x + L.x * c - L.y * s;
      const y = b.y + L.x * s + L.y * c;
      const pr = this.spawnProj(p, w, x, y, b.h + L.a, W.speed * 0.4);
      const t = this.guidedTarget(p, W.range);
      if (t) pr.target = t.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["launch", x, y, b.h + L.a]);
    } else if (W.kind === "agm" || W.kind === "arm") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      const R = W.rails[st.rail++ % W.rails.length];
      const x = b.x + R.x * c - R.y * s;
      const y = b.y + R.x * s + R.y * c;
      const pr = this.spawnProj(p, w, x, y, b.h, Math.max(60, b.v + 40));
      if (W.kind === "agm") {
        const t = this.guidedTarget(p, W.range);
        if (t) pr.target = t.id;
        else {
          pr.tx = p.mx;
          pr.ty = p.my;
        }
      } else {
        // ARM: gelocktes Ziel mit aktivem Radar, sonst stärkster Strahler nahe der Mausrichtung
        let t = this.guidedTarget(p, W.range);
        if (t && !this.emitting(t)) t = null;
        if (!t) t = this.seekEmitter(pr, p.mx, p.my, W.seekerRange, Math.PI);
        if (t) {
          pr.target = t.id;
          pr.tx = t.b.x;
          pr.ty = t.b.y;
        } else {
          pr.tx = p.mx;
          pr.ty = p.my;
        }
      }
      this.events.push(["hflaunch", x, y, b.h]);
    } else if (W.kind === "jam") {
      st.act = W.duration;
      st.cd = W.duration + W.reload;
      this.events.push(["jam", b.x, b.y]);
    } else if (W.kind === "rkt") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      const R = W.rails[st.rail++ % W.rails.length];
      const x = b.x + R.x * c - R.y * s;
      const y = b.y + R.x * s + R.y * c;
      const a = toMouse + (Math.random() - 0.5) * 2 * W.spread;
      const pr = this.spawnProj(p, w, x, y, a, W.speed);
      pr.tx = p.mx; // nur für den Gleitweg (Höhe), Raketen fliegen ungelenkt
      pr.ty = p.my;
      this.events.push(["muzzle", x, y, a]);
    } else if (W.kind === "sam") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      let x;
      let y;
      let a;
      if (W.rails) {
        // Luft-Luft-Rakete vom Hubschrauber
        const R = W.rails[st.rail++ % W.rails.length];
        x = b.x + R.x * c - R.y * s;
        y = b.y + R.x * s + R.y * c;
        a = toMouse;
      } else if (def.vls && w === "sm2") {
        // Senkrechtstart aus dem VLS
        x = b.x + c * def.vls.x - s * def.vls.y;
        y = b.y + s * def.vls.x + c * def.vls.y;
        a = toMouse;
      } else {
        a = b.h + Math.PI + p.ramAng;
        x = b.x + c * def.ram.x;
        y = b.y + s * def.ram.x;
      }
      const pr = this.spawnProj(p, w, x, y, a, W.speed * 0.5);
      pr.tx = p.mx;
      pr.ty = p.my;
      this.events.push(["launch", x, y, a]);
    } else return;
    p.protect = 0; // Wer schießt, verliert den Spawnschutz
  }

  spawnProj(p, w, x, y, h, v) {
    const W = WEAPONS[w];
    const pr = {
      id: this.nextProj++,
      w,
      k: W.kind,
      type: PROJ_OF_KIND[W.kind],
      owner: p.id,
      team: p.team,
      x, y, h, v,
      z: isAir(BOATS[p.type]) ? p.b.z || 0 : ALTITUDE.shipZ,
      dist: 0,
      range: W.range,
      target: 0,
      air: 0,
      tx: null,
      ty: null,
    };
    this.projectiles.push(pr);
    return pr;
  }

  ability(p) {
    const key = BOATS[p.type].ability;
    const A = ABILITIES[key];
    if (!A || p.abCd > 0 || p.abT > 0) return;
    p.abT = A.duration;
    p.abCd = A.duration + A.cooldown;
    if (key === "flares") {
      for (const q of this.projectiles) if (q.air === p.id) q.air = 0;
    }
  }

  lock(p, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const L = WEAPONS.lock;
    const def = BOATS[p.type];
    const radar = p.abT > 0 && def.ability === "radar";
    const range = Math.max(radar ? ABILITIES.radar.lockRange : L.range, def.kind === "drone" ? def.sensor : 0);
    let best = null;
    let bestD = radar || def.kind === "drone" ? ABILITIES.radar.pick : L.pick;
    for (const o of this.players.values()) {
      if (o === p || o.team === p.team || !this.det[p.team].has(o.id)) continue;
      const od = BOATS[o.type];
      let d = Infinity;
      if (isAir(od)) d = Math.hypot(o.b.x - x, o.b.y - y) - od.hitRadius;
      else for (const cc of boatCircles(o.b, od)) d = Math.min(d, Math.hypot(cc.x - x, cc.y - y) - cc.r);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) {
      for (const o of this.players.values()) {
        if (o !== p && o.team === p.team && Math.hypot(o.b.x - x, o.b.y - y) < 40 + BOATS[o.type].length / 2) {
          this.send(p.ws, { t: "lockmsg", m: "AGIS: eigenes Fahrzeug – kein Lock" });
          return;
        }
      }
    }
    if (!best || best.id === p.lockId) {
      const had = p.lockId;
      p.lockId = 0;
      p.lockT = 0;
      this.send(p.ws, { t: "lockmsg", m: had ? "AGIS: Ziel freigegeben" : "AGIS: kein erfasstes Ziel am Zeiger" });
      return;
    }
    if (Math.hypot(best.b.x - p.b.x, best.b.y - p.b.y) > range) {
      const hint = def.ability === "radar" && !radar ? " – Radar (E) nutzen" : "";
      this.send(p.ws, { t: "lockmsg", m: `AGIS: außer Reichweite${hint}` });
      return;
    }
    p.lockId = best.id;
    p.lockT = 0;
  }

  // ---------- Simulation ----------

  ensureLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => this.update(), 1000 / TICK_RATE);
  }

  update() {
    if (this.players.size === 0) {
      clearInterval(this.timer);
      this.timer = null;
      this.projectiles = [];
      this.flushAccounts();
      this.flushFront();
      return;
    }
    this.tick++;
    const list = [...this.players.values()];

    for (const p of list) {
      const def = BOATS[p.type];
      let steps = p.queue.length > 3 ? 2 : 1;
      while (steps-- > 0) {
        const inp = p.queue.shift();
        if (inp) {
          p.last = inp;
          p.ack = inp.s;
          if (!p.landed) stepEntity(p.b, inp, def, this.map);
        } else if (steps === 0 && !p.landed) {
          stepEntity(p.b, p.last, def, this.map);
        }
      }
      p.ackLaunch = Math.max(0, (p.ackLaunch || 0) - DT);
      if (p.landed) {
        // Auf dem Träger mitfahren
        if (p.landed.kind === "carrier") {
          const c = this.players.get(p.landed.carrierId);
          if (!c) p.landed = null;
          else {
            const sp = heliSpotWorld(c.b, p.landed.spot, BOATS[c.type]);
            Object.assign(p.b, { x: sp.x, y: sp.y, h: sp.h, v: 0, w: 0, z: 0, zt: 0 });
          }
        }
        // Am Boden: reparieren und schnell aufmunitionieren; W = Start
        if (p.landed) {
          p.hp = Math.min(def.hp, p.hp + def.hp * 0.15 * DT);
          for (const w of p.weapons) {
            const st = p.ws_[w];
            if (st.max !== undefined) st.rel += DT * 5;
          }
          if ((p.last.th || 0) > 0.5) this.takeOff(p);
        }
      } else this.checkLanding(p);
      const aim = aimAngles(p.b, def, p.mx, p.my);
      p.gunAim = aim.gun;
      p.gunOk = aim.gunOk;
      p.ramAim = aim.ram;
      if (def.gun) p.gunAng = slewTurret(p.gunAng, aim.gun, def.gun, DT);
      if (def.ram) p.ramAng = slewTurret(p.ramAng, aim.ram, def.ram, DT);
      // Nachladen
      for (const w of p.weapons) {
        const st = p.ws_[w];
        const W = WEAPONS[w];
        st.cd = Math.max(0, st.cd - DT);
        if (st.act !== undefined) st.act = Math.max(0, st.act - DT);
        if (st.cells) for (let i = 0; i < st.cells.length; i++) st.cells[i] = Math.max(0, st.cells[i] - DT);
        if (st.max !== undefined) {
          if (st.n < st.max) {
            st.rel += DT;
            if (st.rel >= W.reload) {
              st.rel = 0;
              st.n++;
            }
          } else st.rel = 0;
        }
      }
      p.protect = Math.max(0, p.protect - DT);
      p.abT = Math.max(0, p.abT - DT);
      p.abCd = Math.max(0, p.abCd - DT);
      if (def.ability === "flares" && p.abT > 0 && this.tick % 4 === 0) this.events.push(["flare", p.b.x, p.b.y, p.b.h]);
      // Seenotrettung: Hubschrauber nimmt Schiffbrüchige auf (langsam darüber schweben)
      if (def.kind === "heli" && Math.abs(p.b.v) < 10 && (p.b.z || 0) <= ALTITUDE.landHeli) {
        for (const r of this.rafts) {
          if (!r.done && Math.hypot(r.x - p.b.x, r.y - p.b.y) < 24) {
            r.done = true;
            this.events.push(["rescue", r.x, r.y]);
            this.addMoney(p, ECONOMY.rescue, "Schiffbrüchige geborgen");
          }
        }
      }
    }
    this.rafts = this.rafts.filter((r) => !r.done && this.tick - r.t < RAFT_LIFE * TICK_RATE);

    // Schiffe kollidieren (Luftfahrzeuge fliegen darüber)
    const ships = list.filter((p) => BOATS[p.type].kind === "ship");
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        resolveBoatCollision(ships[i].b, BOATS[ships[i].type], ships[j].b, BOATS[ships[j].type], this.map);
      }
    }

    this.computeDetection();

    // AGIS-Lock: Ziel muss vom Team erfasst bleiben
    for (const p of list) {
      if (!p.lockId) continue;
      const t = this.players.get(p.lockId);
      if (!t || !this.det[p.team].has(t.id) || Math.hypot(t.b.x - p.b.x, t.b.y - p.b.y) > WEAPONS.lock.breakRange) {
        p.lockId = 0;
        p.lockT = 0;
        this.send(p.ws, { t: "lockmsg", m: "AGIS: Ziel verloren" });
      } else if (this.jammedAt(t.b.x, t.b.y, p.team, "lockRadius")) {
        // Ziel wird von einem Störer gedeckt: Lock zerfällt
        p.lockT = Math.max(0, p.lockT - DT);
      } else p.lockT = Math.min(WEAPONS.lock.time, p.lockT + DT);
    }

    const keep = [];
    for (const q of this.projectiles) if (!q.dead && this.stepProjectile(q)) keep.push(q);
    this.projectiles = keep.filter((q) => !q.dead);

    if (this.tick % 10 === 0) this.captureTick();
    if (this.tick % 40 === 0) this.flushAccounts();
    if (this.tick % 100 === 0) this.flushFront();

    this.sendSnapshots();
  }

  sendSnapshots() {
    const r = (n, f = 100) => Math.round(n * f) / f;
    const alive = [...this.players.values()];
    const row = (p) => [
      p.id,
      r(p.b.x),
      r(p.b.y),
      r(p.b.h, 1000),
      r(p.b.v),
      r(p.b.w, 1000),
      r(p.last.th),
      r(p.last.ru),
      r(p.gunAim, 1000),
      r(p.ramAim, 1000),
      p.kills,
      Math.ceil(p.hp),
      p.protect > 0 ? 1 : 0,
      p.abT > 0 ? 1 : 0,
      p.team,
      BOATS[p.type].typeId,
      this.emitting(p) ? 1 : 0,
      // Luftfahrzeuge: Hangar-Bewaffnung (für die Darstellung) und aktiver Störsender
      isAir(BOATS[p.type]) ? p.weapons[p.weapons.length - 1] : 0,
      this.jamming(p) ? 1 : 0,
      p.landed ? 1 : 0,
      Math.round(p.b.z || 0),
      Math.round(p.b.zt || 0),
    ];
    const rows = new Map(alive.map((p) => [p.id, row(p)]));
    const ev = this.events.map((e) => e.map((v) => (typeof v === "number" ? r(v, 10) : v)));
    this.events = [];
    const rafts = this.rafts.map((f) => [f.id, r(f.x, 10), r(f.y, 10)]);
    const fr = this.front ? [this.front.own, this.front.prog.map((v) => Math.round(v))] : null;
    for (const team of [0, 1]) {
      const members = alive.filter((p) => p.team === team);
      if (!members.length) continue;
      // Nebel des Krieges: nur eigene und vom Team erfasste Fahrzeuge
      const snap = alive.filter((p) => p.team === team || this.det[team].has(p.id)).map((p) => rows.get(p.id));
      const near = (q) => {
        if (q.team === team) return true;
        for (const s of this.sources[team]) if (Math.hypot(q.x - s.x, q.y - s.y) < s.r) return true;
        return false;
      };
      const proj = this.projectiles.filter(near).map((q) => [q.id, q.type, r(q.x, 10), r(q.y, 10), r(q.h), Math.round(q.z || 0)]);
      // Vom Team markierte Ziele (Locks aller Teammitglieder)
      const marked = [...new Set(members.filter((p) => p.lockId && p.lockT >= WEAPONS.lock.time).map((p) => p.lockId))];
      for (const p of members) {
        const def = BOATS[p.type];
        const w = p.weapons.map((k) => {
          const st = p.ws_[k];
          const W = WEAPONS[k];
          if (st.act !== undefined) return [r(st.cd / (W.duration + W.reload)), r(st.act / W.duration)];
          if (st.cells) return st.cells.map((v) => r(v / W.reload));
          if (st.max !== undefined) return [st.n, st.max, r(st.rel / W.reload)];
          return [r(st.cd / W.reload)];
        });
        this.send(p.ws, {
          t: "s",
          k: this.tick,
          a: p.ack,
          p: snap,
          q: proj,
          e: ev,
          rf: rafts,
          fr,
          mk: marked,
          me: {
            w,
            l: p.lockId,
            lt: r(p.lockT / WEAPONS.lock.time),
            ra: r(p.abT, 10),
            rc: r(p.abCd, 10),
            ro: p.radarOn ? 1 : 0,
            det: this.det[1 - team].has(p.id) ? 1 : 0,
            wl: p.weapons,
            ld: p.landed ? 1 : 0,
            jam: this.jammedAt(p.b.x, p.b.y, p.team) ? 1 : 0,
            ...this.threats(p),
            $: p.acct ? p.acct.money : 0,
            own: p.acct ? p.acct.owned : START_SHIP,
          },
        });
      }
    }
  }

  // Gibt false zurück, wenn der Flugkörper verschwindet.
  stepProjectile(q) {
    const owner = this.players.get(q.owner);
    const W = WEAPONS[q.w];
    // Störung: gelenkte Flugkörper in der Nähe eines gegnerischen Störers können ihr Ziel verlieren
    if ((q.k === "ssm" || q.k === "agm" || q.k === "sam") && (q.target || q.air) && this.jammedAt(q.x, q.y, q.team, "lockRadius")) {
      if (Math.random() < WEAPONS.jammer.breakChance) {
        q.target = 0;
        q.air = 0;
        q.tx = q.ty = null;
        q.jamUntil = this.tick + 40;
      }
    }
    if (q.jamUntil && this.tick < q.jamUntil && q.k !== "arm") {
      // gestört: fliegt geradeaus weiter
    } else if (q.k === "ssm" || q.k === "agm") {
      q.v = Math.min(W.speed, q.v + (q.k === "ssm" ? 110 : 160) * DT);
      let goal = null;
      if (q.target) {
        const t = this.players.get(q.target);
        if (t) goal = this.leadPoint(q, t.b);
        else q.target = 0;
      }
      if (!goal && q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < (q.k === "ssm" ? 250 : 120)) q.tx = q.ty = null;
        else goal = { x: q.tx, y: q.ty };
      }
      if (!goal && q.tx === null && !q.target) {
        const t = this.seekShip(q, W.seekerRange, W.seekerCone);
        if (t) {
          q.target = t.id;
          goal = this.leadPoint(q, t.b);
        }
      }
      if (goal) this.turnTowards(q, goal.x, goal.y, W.turn);
    } else if (q.k === "arm") {
      q.v = Math.min(W.speed, q.v + 180 * DT);
      // Führung nur, solange das Ziel sendet; sonst letzte bekannte Position
      const t = q.target ? this.players.get(q.target) : null;
      if (t && this.emitting(t)) {
        q.tx = t.b.x;
        q.ty = t.b.y;
      } else if (q.target && !t) q.target = 0;
      if (q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < 60 && !(t && this.emitting(t))) {
          // Ziel verloren: in der Nähe nach einem anderen Strahler suchen
          q.tx = q.ty = null;
          q.target = 0;
          const n = this.seekEmitter(q, q.x + Math.cos(q.h) * 800, q.y + Math.sin(q.h) * 800, 1500, 0.8);
          if (n) {
            q.target = n.id;
            q.tx = n.b.x;
            q.ty = n.b.y;
          }
        } else this.turnTowards(q, q.tx, q.ty, W.turn);
      }
    } else if (q.k === "sam") {
      q.v = Math.min(W.speed, q.v + 220 * DT);
      // Suchkopf: gegnerische Flugkörper oder Luftfahrzeuge (Hubschrauber mit Täuschkörpern nicht)
      let tgt = null;
      if (q.target) tgt = this.projectiles.find((o) => o.id === q.target && !o.dead) || null;
      else if (q.air) {
        const h = this.players.get(q.air);
        tgt = h && h.abT <= 0 ? h.b : h && BOATS[h.type].kind === "drone" ? h.b : null;
        if (!tgt) q.air = 0;
      }
      if (!tgt) {
        q.target = 0;
        q.air = 0;
        let bestD = W.seekerRange;
        for (const o of this.projectiles) {
          if (!INTERCEPTABLE.has(o.type) || o.team === q.team || o.dead || o.z > W.ceiling) continue;
          const d = Math.hypot(o.x - q.x, o.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = o;
            q.target = o.id;
          }
        }
        for (const p of this.players.values()) {
          const pd = BOATS[p.type];
          if (p.team === q.team || !isAir(pd) || (pd.kind === "heli" && p.abT > 0) || (p.b.z || 0) > W.ceiling || p.landed) continue;
          const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = p.b;
            q.target = 0;
            q.air = p.id;
          }
        }
      }
      if (tgt) this.turnTowards(q, tgt.x, tgt.y, W.turn);
      else if (q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < 30) {
          this.events.push(["air", q.x, q.y]);
          return false;
        }
        this.turnTowards(q, q.tx, q.ty, W.turn);
      }
    }

    // Höhenprofil: Seezielflugkörper im Tiefflug, Luft-Boden/ARM gleiten zum Ziel hinab,
    // Flugabwehr steigt auf Zielhöhe, Granaten/MG werden auf die Zielhöhe gerichtet
    if (q.k === "ssm") q.z += clamp(ALTITUDE.seaSkim - q.z, -40 * DT, 40 * DT);
    else if (q.k === "agm" || q.k === "arm" || q.k === "rkt") {
      const gx = q.target ? this.players.get(q.target)?.b : q.tx !== null ? { x: q.tx, y: q.ty } : null;
      const tz = q.target ? this.players.get(q.target)?.b.z || 0 : 0;
      const d = gx ? Math.hypot(gx.x - q.x, gx.y - q.y) : 1500;
      const desc = ((q.z - tz) * q.v * DT) / Math.max(50, d);
      q.z = Math.max(tz > 0 ? 0 : ALTITUDE.seaSkim, q.z - Math.max(desc, 2 * DT));
    }
    // Flugabwehr fliegt eine schräge Bahn: Anteil Steigen/Vorwärts nach Höhen- und Seitenabstand
    let hFactor = 1;
    if (q.k === "sam") {
      let tz = ALTITUDE.seaSkim;
      let tx = q.tx ?? q.x;
      let ty = q.ty ?? q.y;
      if (q.air) {
        const b = this.players.get(q.air)?.b;
        if (b) ({ x: tx, y: ty, z: tz } = { x: b.x, y: b.y, z: b.z || 0 });
      } else if (q.target) {
        const o = this.projectiles.find((x) => x.id === q.target);
        if (o) ({ x: tx, y: ty, z: tz } = o);
      }
      const dh = Math.hypot(tx - q.x, ty - q.y);
      const dz = tz - q.z;
      const pitch = Math.atan2(dz, Math.max(1, dh));
      hFactor = Math.cos(pitch);
      q.z += clamp(Math.sin(pitch) * q.v * DT, -Math.abs(dz), Math.abs(dz));
    }

    const px = q.x;
    const py = q.y;
    const step = q.v * DT * hFactor;
    q.x += Math.cos(q.h) * step;
    q.y += Math.sin(q.h) * step;
    q.dist += step;

    if (q.k === "sam" && q.target) {
      const t = this.projectiles.find((o) => o.id === q.target);
      if (t && segDist(t.x, t.y, px, py, q.x, q.y) < 14 && Math.abs((t.z || 0) - q.z) < 60) {
        if (Math.random() < W.pk) {
          t.dead = true;
          this.events.push(["intercept", t.x, t.y]);
        } else this.events.push(["air", q.x, q.y]);
        return false;
      }
    }
    if (q.k === "sam" && q.air) {
      const h = this.players.get(q.air);
      if (h && segDist(h.b.x, h.b.y, px, py, q.x, q.y) < 12 && Math.abs((h.b.z || 0) - q.z) < 60) {
        this.events.push(["intercept", h.b.x, h.b.y]);
        if (Math.random() < W.pk) this.damage(h, q.w === "sm2" ? 30 : 25, owner);
        return false;
      }
    }

    // ARM gegen einen Störsender in der Luft
    if (q.k === "arm" && q.target) {
      const t = this.players.get(q.target);
      if (t && isAir(BOATS[t.type]) && segDist(t.b.x, t.b.y, px, py, q.x, q.y) < 16 && Math.abs((t.b.z || 0) - q.z) < 80) {
        this.events.push(["bighit", t.b.x, t.b.y]);
        this.damage(t, W.damage, owner);
        return false;
      }
    }
    // Rohrwaffen und MG treffen auch Luftfahrzeuge
    if (q.k === "gun" || q.k === "mg") {
      for (const p of this.players.values()) {
        const def = BOATS[p.type];
        if (p.team === q.team || !isAir(def) || p.landed) continue;
        // Schussweite nach oben: Gipfelhöhe der Waffe (vom Hubschrauber aus zählt der Höhenunterschied)
        const dz = Math.abs((p.b.z || 0) - (q.z || 0));
        if (dz > (W.ceiling || 1000)) continue;
        if (segDist(p.b.x, p.b.y, px, py, q.x, q.y) < def.hitRadius) {
          this.events.push(["hit", q.x, q.y]);
          this.damage(p, q.k === "gun" ? W.damage * 1.5 : W.heliDamage, owner);
          return false;
        }
      }
    }

    // Treffer an Schiffen (Flugabwehr fliegt über Schiffe hinweg, wenn sie ein Luftziel jagt)
    if (!(q.k === "sam" && (q.target || q.air)) && ((q.z || 0) < ALTITUDE.hitShip || q.k === "gun" || q.k === "mg")) {
      for (const p of this.players.values()) {
        if (p.team === q.team) continue;
        const def = BOATS[p.type];
        if (def.kind !== "ship") continue;
        if (Math.abs(p.b.x - q.x) > def.length + step || Math.abs(p.b.y - q.y) > def.length + step) continue;
        for (const cc of boatCircles(p.b, def)) {
          if (segDist(cc.x, cc.y, px, py, q.x, q.y) < cc.r + 0.5) {
            const big = q.k === "ssm" || q.k === "arm";
            this.events.push([big ? "bighit" : q.k === "mg" ? "spark" : "hit", q.x, q.y]);
            this.damage(p, W.damage, owner);
            return false;
          }
        }
      }
    }

    if ((q.k === "gun" || q.k === "mg" || q.k === "ssm" || q.k === "rkt") && isOnLand(this.map, q.x, q.y)) {
      this.events.push([q.k === "gun" || q.k === "mg" ? "dirt" : q.k === "rkt" ? "hit" : "bighit", q.x, q.y]);
      return false;
    }
    const half = WORLD_SIZE / 2;
    if (q.dist >= q.range || Math.abs(q.x) > half || Math.abs(q.y) > half) {
      this.events.push([q.k === "sam" ? "air" : q.k === "mg" ? "spray" : "splash", q.x, q.y]);
      return false;
    }
    return true;
  }

  leadPoint(q, b) {
    const d = Math.hypot(b.x - q.x, b.y - q.y);
    const t = Math.min(4, d / Math.max(50, q.v));
    return { x: b.x + Math.cos(b.h) * b.v * t, y: b.y + Math.sin(b.h) * b.v * t };
  }

  turnTowards(q, x, y, rate) {
    const want = Math.atan2(y - q.y, x - q.x);
    q.h = wrapAngle(q.h + clamp(wrapAngle(want - q.h), -rate * DT, rate * DT));
  }

  // Suchkopf für Seezielflugkörper: nur Schiffe
  seekShip(q, range, cone) {
    let best = null;
    let bestD = range;
    for (const p of this.players.values()) {
      if (p.team === q.team || BOATS[p.type].kind !== "ship") continue;
      const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
      if (d > bestD) continue;
      const off = Math.abs(wrapAngle(Math.atan2(p.b.y - q.y, p.b.x - q.x) - q.h));
      if (off > cone) continue;
      bestD = d;
      best = p;
    }
    return best;
  }

  // Suchkopf für ARM: gegnerisches Schiff mit sendendem Radar, am nächsten zum Punkt (x, y)
  seekEmitter(q, x, y, range, cone) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.players.values()) {
      if (p.team === q.team || !this.emitting(p)) continue;
      const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
      if (d > range) continue;
      const off = Math.abs(wrapAngle(Math.atan2(p.b.y - q.y, p.b.x - q.x) - Math.atan2(y - q.y, x - q.x)));
      if (off > cone) continue;
      const dm = Math.hypot(p.b.x - x, p.b.y - y);
      if (dm < bestD) {
        bestD = dm;
        best = p;
      }
    }
    return best;
  }

  damage(p, dmg, attacker) {
    if (p.protect > 0 || p.hp <= 0) return;
    if (inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y)) return; // sicherer Hafen
    if (inRect(airfieldRect(p.team), p.b.x, p.b.y)) return; // eigenes Flugfeld
    const real = Math.min(dmg, p.hp);
    p.hp -= dmg;
    if (attacker && attacker !== p && attacker.team !== p.team) {
      const d = p.damagers.get(attacker.id) || { dmg: 0, t: 0 };
      d.dmg += real;
      d.t = this.tick;
      p.damagers.set(attacker.id, d);
      this.addMoney(attacker, real * ECONOMY.perDamage);
    }
    if (p.hp > 0) return;
    const def = BOATS[p.type];
    const air = isAir(def);
    this.events.push([air ? "crash" : "sink", p.b.x, p.b.y, p.b.h, p.team, def.typeId]);
    // Schiffbrüchige treiben im Wasser
    if (!air) {
      const n = 2 + def.level;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 15 + Math.random() * def.length * 0.4;
        const x = p.b.x + Math.cos(a) * d;
        const y = p.b.y + Math.sin(a) * d;
        if (!isOnLand(this.map, x, y)) this.rafts.push({ id: this.nextRaft++, x, y, t: this.tick });
      }
    }
    const by = attacker && attacker !== p ? attacker : null;
    const bounty = ECONOMY.bounty(def);
    if (by) {
      by.kills++;
      this.addMoney(by, bounty, `${air ? "Abschuss" : "Versenkt"}: ${p.name}`);
    }
    for (const [id, d] of p.damagers) {
      if (by && id === by.id) continue;
      if (this.tick - d.t > ECONOMY.assistWindow * TICK_RATE) continue;
      const a = this.players.get(id);
      if (a) this.addMoney(a, bounty * ECONOMY.assistShare, `Assist: ${p.name}`);
    }
    for (const o of this.players.values()) {
      if (o.lockId === p.id) {
        o.lockId = 0;
        o.lockT = 0;
      }
      if (o.carrierId === p.id) o.carrierId = 0;
    }
    this.players.delete(p.id);
    this.send(p.ws, { t: "dead", by: by ? by.name : null, x: p.b.x, y: p.b.y, h: p.b.h, team: p.team, type: p.type });
    this.broadcast({ t: "leave", id: p.id, sunkBy: by ? by.id : 0 });
    p.onDeath();
    this.flushAccounts();
    const ws = p.ws;
    setTimeout(() => {
      try {
        ws.close(4000, "versenkt");
      } catch {}
    }, 300);
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* Socket bereits zu */
    }
  }

  broadcast(obj, exceptId) {
    const data = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      try {
        p.ws.send(data);
      } catch {}
    }
  }
}
