import {
  TICK_RATE,
  DT,
  BOATS,
  TYPE_BY_ID,
  WEAPONS,
  ABILITIES,
  ECONOMY,
  PROJ,
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
  heliSpotWorld,
  harborRect,
  teamBase,
  inRect,
} from "../public/shared/sim.js";
import ASSETS from "./assets.gen.js";

const MAX_PLAYERS = 64;
const MAX_QUEUE = 6;
const SPAWN_PROTECTION = 4; // s
// Bei Protokolländerungen erhöhen: Laufende Durable Objects behalten nach einem Deploy
// ihren alten Code, solange Spieler verbunden sind. Neue Verbindungen landen so in einer frischen Welt.
// Konten (Geld, gekaufte Schiffe) liegen in einem eigenen, versionsunabhängigen Durable Object.
const WORLD_VERSION = 6;
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

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
      // Spielerzahlen, Träger je Team und Kontostand für das Startmenü
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

const defaultAccount = () => ({ money: 0, owned: ["gepard"] });

export class World {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.map = generateMap();
    this.players = new Map(); // id -> player
    this.projectiles = [];
    this.events = []; // Effekte dieses Ticks: [typ, x, y, ...]
    this.accounts = new Map(); // token -> { money, owned, dirty }
    this.nextId = 1;
    this.nextProj = 1;
    this.tick = 0;
    this.timer = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    // ---- Kontenspeicher (nur in der Instanz "konten", nur intern erreichbar) ----
    if (url.pathname === "/acct") {
      const token = url.searchParams.get("token") || "";
      if (!TOKEN_RE.test(token)) return new Response("bad token", { status: 400 });
      if (request.method === "POST") {
        const body = await request.json();
        const acct = {
          money: Math.max(0, Math.floor(+body.money || 0)),
          owned: (Array.isArray(body.owned) ? body.owned : []).filter((t) => BOATS[t]),
        };
        if (!acct.owned.includes("gepard")) acct.owned.unshift("gepard");
        await this.state.storage.put(`a:${token}`, acct);
        return new Response("ok");
      }
      return Response.json((await this.state.storage.get(`a:${token}`)) || defaultAccount());
    }
    if (url.pathname === "/status") {
      const teams = TEAMS.map(() => ({ players: 0, kills: 0, carriers: [] }));
      for (const p of this.players.values()) {
        teams[p.team].players++;
        teams[p.team].kills += p.kills;
        if (p.type === "carrier") teams[p.team].carriers.push({ id: p.id, name: p.name, free: this.freeHeliSpots(p) });
      }
      const token = url.searchParams.get("token");
      const account = token ? await this.getAccount(token) : null;
      return Response.json(
        { teams, account: account && { money: account.money, owned: account.owned } },
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
    if (a) return a;
    try {
      const r = await this.kontenStub().fetch(`https://konten/acct?token=${token}`);
      const data = await r.json();
      a = { money: data.money | 0, owned: data.owned || ["gepard"], dirty: false };
    } catch {
      a = { ...defaultAccount(), dirty: false };
    }
    // Nur für lokale Tests (wrangler dev --var DEV_START_MONEY:…): neue Konten mit Startguthaben
    if (this.env.DEV_START_MONEY && a.money === 0 && a.owned.length === 1) a.money = +this.env.DEV_START_MONEY || 0;
    // Während des Ladens könnte ein anderer Aufruf schon eingetragen haben
    if (!this.accounts.has(token)) this.accounts.set(token, a);
    return this.accounts.get(token);
  }

  async flushAccounts() {
    const inUse = new Set([...this.players.values()].map((p) => p.token));
    for (const [token, a] of this.accounts) {
      if (a.dirty) {
        a.dirty = false;
        try {
          await this.kontenStub().fetch(`https://konten/acct?token=${token}`, {
            method: "POST",
            body: JSON.stringify({ money: a.money, owned: a.owned }),
          });
        } catch {
          a.dirty = true;
        }
      }
      if (!a.dirty && !inUse.has(token)) this.accounts.delete(token);
    }
  }

  addMoney(p, amount, why) {
    if (!p || !p.acct || amount <= 0) return;
    p.acct.money += Math.round(amount);
    p.acct.dirty = true;
    if (why) this.send(p.ws, { t: "reward", a: Math.round(amount), m: why });
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
        const token = TOKEN_RE.test(msg.token || "") ? msg.token : null;
        const acct = token ? await this.getAccount(token) : { ...defaultAccount(), dirty: false };
        const team = msg.team === 1 ? 1 : 0;
        const { type, spawn, carrierId, note } = this.chooseSpawn(team, msg.spawn, acct);
        player = this.createPlayer(ws, msg.name, team, type, spawn, () => {
          player = null;
        });
        player.token = token;
        player.acct = acct;
        player.carrierId = carrierId;
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
        player.queue.push({ s: seq, th: +msg.th || 0, ru: +msg.ru || 0 });
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
      } else if (msg.t === "buy") {
        this.buy(player, msg.ship);
      } else if (msg.t === "switch") {
        this.switchShip(player, msg.ship);
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

  // Welcher Typ und wo? Träger nur, wenn gekauft; Hubschrauber nur auf einem Träger des Teams mit freiem Landepunkt.
  chooseSpawn(team, want, acct) {
    if (want === "carrier") {
      if (acct.owned.includes("carrier")) {
        return { type: "carrier", spawn: this.spawnCarrier(team) };
      }
      return { type: "gepard", spawn: this.spawnInHarbor(team), note: "Hubschrauberträger noch nicht gekauft – Start als Schnellboot." };
    }
    if (typeof want === "string" && want.startsWith("heli")) {
      const wantedId = +want.split(":")[1] || 0;
      const carriers = [...this.players.values()].filter((p) => p.type === "carrier" && p.team === team && this.freeHeliSpots(p) > 0);
      const c = carriers.find((p) => p.id === wantedId) || carriers[0];
      if (c) {
        const used = new Set([...this.players.values()].filter((p) => p.carrierId === c.id).map((p) => p.spot));
        const spot = BOATS.carrier.heliSpots.findIndex((_, i) => !used.has(i));
        const s = heliSpotWorld(c.b, spot);
        return { type: "blackhawk", spawn: { ...s, spot }, carrierId: c.id };
      }
      return { type: "gepard", spawn: this.spawnInHarbor(team), note: "Kein Träger deines Teams mit freiem Landeplatz – Start als Schnellboot." };
    }
    return { type: "gepard", spawn: this.spawnInHarbor(team) };
  }

  freeHeliSpots(carrier) {
    let used = 0;
    for (const p of this.players.values()) if (p.carrierId === carrier.id) used++;
    return BOATS.carrier.heliSpots.length - used;
  }

  createPlayer(ws, name, team, type, spawn, onDeath) {
    const p = {
      id: this.nextId++,
      name: sanitizeName(name),
      team,
      type,
      ws,
      onDeath,
      b: { x: spawn.x, y: spawn.y, h: spawn.h, v: 0, w: 0 },
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
      abT: 0, // Fähigkeit aktiv (s)
      abCd: 0, // Abklingzeit (s)
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
    p.gunCd = 0;
    p.mgCd = 0;
    p.exo = WEAPONS.exocet.launchers.map(() => 0);
    p.exoCd = 0;
    p.ram = WEAPONS.ram.magazine * (p.type === "carrier" ? 2 : 1);
    p.ramMax = p.ram;
    p.ramReload = 0;
    p.ramCd = 0;
    p.hf = WEAPONS.hellfire.count;
    p.hfReload = 0;
    p.hfCd = 0;
    p.hfRail = 0;
    p.abT = 0;
    p.abCd = 0;
  }

  // Start im Hafenbecken der eigenen Marinebasis (freien Liegeplatz suchen)
  spawnInHarbor(team) {
    const others = [...this.players.values()];
    const n = 8;
    const start = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i++) {
      const s = baseSpawn(team, start + i);
      if (!others.some((p) => BOATS[p.type].kind === "ship" && Math.hypot(p.b.x - s.x, p.b.y - s.y) < 70 + BOATS[p.type].length / 2)) return s;
    }
    return this.spawnOutside(team);
  }

  spawnCarrier(team) {
    const s = carrierSpawn(team);
    const blocked = [...this.players.values()].some(
      (p) => BOATS[p.type].kind === "ship" && Math.abs(p.b.y - s.y) < 40 && Math.abs(p.b.x - s.x) < 110
    );
    return blocked ? this.spawnOutside(team, 300) : s;
  }

  // Vor der Hafeneinfahrt starten
  spawnOutside(team, extra = 0) {
    const base = teamBase(team);
    const s = {
      x: base.edge + base.dir * (820 + extra + Math.random() * 200),
      y: (Math.random() - 0.5) * 600,
      h: base.dir === 1 ? 0 : Math.PI,
    };
    return isOnLand(this.map, s.x, s.y, 120) ? findSpawn(this.map) : s;
  }

  // ---------- Laden ----------

  inOwnHarbor(p) {
    return BOATS[p.type].kind === "ship" && inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y);
  }

  buy(p, ship) {
    const def = BOATS[ship];
    if (!def || def.kind !== "ship" || !p.acct) return;
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
    if (!def || def.kind !== "ship" || !p.acct || !p.acct.owned.includes(ship) || ship === p.type) return;
    if (!this.inOwnHarbor(p)) return this.send(p.ws, { t: "shop", ok: false, m: "Schiffswechsel nur im eigenen Hafen." });
    // Bisherige Hubschrauber eines Trägers verlieren ihren Träger
    for (const o of this.players.values()) if (o.carrierId === p.id) o.carrierId = 0;
    p.type = ship;
    const s = ship === "carrier" ? this.spawnCarrier(p.team) : this.spawnInHarbor(p.team);
    Object.assign(p.b, { x: s.x, y: s.y, h: s.h, v: 0, w: 0 });
    p.queue = [];
    p.last = { th: 0, ru: 0 };
    p.lockId = 0;
    p.lockT = 0;
    this.resetLoadout(p);
    this.send(p.ws, { t: "retype", type: ship });
    this.broadcast({ t: "retype", id: p.id, type: ship }, p.id);
  }

  // ---------- Waffen ----------

  fire(p, w) {
    const def = BOATS[p.type];
    if (!def.weapons.includes(w)) return;
    const b = p.b;
    const c = Math.cos(b.h);
    const s = Math.sin(b.h);
    const locked = p.lockId && p.lockT >= WEAPONS.lock.time ? this.players.get(p.lockId) : null;
    if (w === "gun") {
      const W = WEAPONS.gun;
      if (p.gunCd > 0 || !p.gunOk || Math.abs(p.gunAng - p.gunAim) > 0.06) return;
      p.gunCd = W.reload;
      const a = b.h + p.gunAng + (Math.random() - 0.5) * 2 * W.spread;
      const gx = b.x + c * def.gun.x + Math.cos(a) * 6.3;
      const gy = b.y + s * def.gun.x + Math.sin(a) * 6.3;
      this.spawnProj(p, PROJ.SHELL, gx, gy, a, W.speed, W.range);
      this.events.push(["muzzle", gx, gy, a]);
    } else if (w === "mg") {
      const W = WEAPONS.mg;
      if (p.mgCd > 0) return;
      p.mgCd = W.reload;
      const a = Math.atan2(p.my - b.y, p.mx - b.x) + (Math.random() - 0.5) * 2 * W.spread;
      this.spawnProj(p, PROJ.BULLET, b.x + Math.cos(a) * 3, b.y + Math.sin(a) * 3, a, W.speed, W.range);
    } else if (w === "exocet") {
      const W = WEAPONS.exocet;
      if (p.exoCd > 0) return;
      const cell = p.exo.findIndex((t) => t <= 0);
      if (cell < 0) return;
      p.exo[cell] = W.reload;
      p.exoCd = W.interval;
      const L = W.launchers[cell];
      const x = b.x + L.x * c - L.y * s;
      const y = b.y + L.x * s + L.y * c;
      const pr = this.spawnProj(p, PROJ.EXOCET, x, y, b.h + L.a, W.speed * 0.4, W.range);
      // Mit AGIS-Lock auf ein Schiff: direkt ins Ziel. Sonst zum Mauszeiger, dann Suchkopf.
      if (locked && BOATS[locked.type].kind === "ship") pr.target = locked.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["launch", x, y, b.h + L.a]);
    } else if (w === "hellfire") {
      const W = WEAPONS.hellfire;
      if (p.hfCd > 0 || p.hf <= 0) return;
      p.hf--;
      p.hfCd = W.interval;
      const R = W.rails[p.hfRail++ % W.rails.length];
      const x = b.x + R.x * c - R.y * s;
      const y = b.y + R.x * s + R.y * c;
      const pr = this.spawnProj(p, PROJ.HELLFIRE, x, y, b.h, Math.max(60, b.v + 40), W.range);
      if (locked && BOATS[locked.type].kind === "ship") pr.target = locked.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["hflaunch", x, y, b.h]);
    } else if (w === "ram") {
      const W = WEAPONS.ram;
      if (p.ramCd > 0 || p.ram <= 0) return;
      p.ram--;
      p.ramCd = W.interval;
      const a = b.h + Math.PI + p.ramAng;
      const x = b.x + c * def.ram.x;
      const y = b.y + s * def.ram.x;
      const pr = this.spawnProj(p, PROJ.RAM, x, y, a, W.speed * 0.5, W.range);
      pr.tx = p.mx;
      pr.ty = p.my;
      this.events.push(["launch", x, y, a]);
    } else return;
    p.protect = 0; // Wer schießt, verliert den Spawnschutz
  }

  spawnProj(p, type, x, y, h, v, range) {
    const pr = { id: this.nextProj++, type, owner: p.id, team: p.team, x, y, h, v, dist: 0, range, target: 0, heli: 0, tx: null, ty: null };
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
      // RAM-Flugkörper, die diesen Hubschrauber jagen, verlieren ihr Ziel
      for (const q of this.projectiles) if (q.heli === p.id) q.heli = 0;
    }
  }

  lock(p, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const L = WEAPONS.lock;
    const radar = p.abT > 0 && BOATS[p.type].ability === "radar";
    const range = radar ? ABILITIES.radar.lockRange : L.range;
    let best = null;
    let bestD = radar ? ABILITIES.radar.pick : L.pick;
    for (const o of this.players.values()) {
      if (o === p || o.team === p.team) continue;
      const od = BOATS[o.type];
      let d = Infinity;
      if (od.kind === "heli") d = Math.hypot(o.b.x - x, o.b.y - y) - od.hitRadius;
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
      this.send(p.ws, { t: "lockmsg", m: had ? "AGIS: Ziel freigegeben" : "AGIS: kein Ziel am Zeiger" });
      return;
    }
    if (Math.hypot(best.b.x - p.b.x, best.b.y - p.b.y) > range) {
      const hint = BOATS[p.type].ability === "radar" ? " – Radar (E) nutzen" : "";
      this.send(p.ws, { t: "lockmsg", m: radar ? "AGIS: Ziel außerhalb 5 km" : `AGIS: außer Reichweite${hint}` });
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
      return;
    }
    this.tick++;
    const list = [...this.players.values()];

    for (const p of list) {
      const def = BOATS[p.type];
      // Pro Tick eine Eingabe; bei Rückstau etwas aufholen
      let steps = p.queue.length > 3 ? 2 : 1;
      while (steps-- > 0) {
        const inp = p.queue.shift();
        if (inp) {
          p.last = inp;
          p.ack = inp.s;
          stepEntity(p.b, inp, def, this.map);
        } else if (steps === 0) {
          stepEntity(p.b, p.last, def, this.map);
        }
      }
      // Türme nachführen
      const aim = aimAngles(p.b, def, p.mx, p.my);
      p.gunAim = aim.gun;
      p.gunOk = aim.gunOk;
      p.ramAim = aim.ram;
      if (def.gun) p.gunAng = slewTurret(p.gunAng, aim.gun, def.gun, DT);
      if (def.ram) p.ramAng = slewTurret(p.ramAng, aim.ram, def.ram, DT);
      // Nachladen
      p.gunCd = Math.max(0, p.gunCd - DT);
      p.mgCd = Math.max(0, p.mgCd - DT);
      p.exoCd = Math.max(0, p.exoCd - DT);
      p.ramCd = Math.max(0, p.ramCd - DT);
      p.hfCd = Math.max(0, p.hfCd - DT);
      for (let i = 0; i < p.exo.length; i++) p.exo[i] = Math.max(0, p.exo[i] - DT);
      if (p.ram < p.ramMax) {
        p.ramReload += DT;
        if (p.ramReload >= WEAPONS.ram.reload) {
          p.ramReload = 0;
          p.ram++;
        }
      } else p.ramReload = 0;
      if (p.hf < WEAPONS.hellfire.count) {
        p.hfReload += DT;
        if (p.hfReload >= WEAPONS.hellfire.reload) {
          p.hfReload = 0;
          p.hf++;
        }
      } else p.hfReload = 0;
      p.protect = Math.max(0, p.protect - DT);
      p.abT = Math.max(0, p.abT - DT);
      p.abCd = Math.max(0, p.abCd - DT);
      if (def.ability === "flares" && p.abT > 0 && this.tick % 4 === 0) this.events.push(["flare", p.b.x, p.b.y, p.b.h]);
      // AGIS-Lock
      if (p.lockId) {
        const t = this.players.get(p.lockId);
        if (!t || Math.hypot(t.b.x - p.b.x, t.b.y - p.b.y) > WEAPONS.lock.breakRange) {
          p.lockId = 0;
          p.lockT = 0;
          this.send(p.ws, { t: "lockmsg", m: "AGIS: Ziel verloren" });
        } else p.lockT = Math.min(WEAPONS.lock.time, p.lockT + DT);
      }
    }

    // Schiffe kollidieren (Hubschrauber fliegen darüber)
    const ships = list.filter((p) => BOATS[p.type].kind === "ship");
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        resolveBoatCollision(ships[i].b, BOATS[ships[i].type], ships[j].b, BOATS[ships[j].type], this.map);
      }
    }

    const keep = [];
    for (const q of this.projectiles) if (!q.dead && this.stepProjectile(q)) keep.push(q);
    this.projectiles = keep.filter((q) => !q.dead);

    if (this.tick % 40 === 0) this.flushAccounts();

    const r = (n, f = 100) => Math.round(n * f) / f;
    const alive = [...this.players.values()];
    const snap = alive.map((p) => [
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
    ]);
    const proj = this.projectiles.map((q) => [q.id, q.type, r(q.x, 10), r(q.y, 10), r(q.h)]);
    const ev = this.events.map((e) => e.map((v) => (typeof v === "number" ? r(v, 10) : v)));
    this.events = [];
    for (const p of alive) {
      this.send(p.ws, {
        t: "s",
        k: this.tick,
        a: p.ack,
        p: snap,
        q: proj,
        e: ev,
        me: {
          g: r(p.gunCd / WEAPONS.gun.reload),
          x: p.exo.map((v) => r(v / WEAPONS.exocet.reload)),
          r: p.ram,
          rm: p.ramMax,
          rr: r(p.ramReload / WEAPONS.ram.reload),
          mg: r(p.mgCd / WEAPONS.mg.reload),
          hf: p.hf,
          hr: r(p.hfReload / WEAPONS.hellfire.reload),
          l: p.lockId,
          lt: r(p.lockT / WEAPONS.lock.time),
          ra: r(p.abT, 10),
          rc: r(p.abCd, 10),
          $: p.acct ? p.acct.money : 0,
          own: p.acct ? p.acct.owned : ["gepard"],
        },
      });
    }
  }

  // Gibt false zurück, wenn der Flugkörper verschwindet.
  stepProjectile(q) {
    const owner = this.players.get(q.owner);
    if (q.type === PROJ.EXOCET || q.type === PROJ.HELLFIRE) {
      const W = q.type === PROJ.EXOCET ? WEAPONS.exocet : WEAPONS.hellfire;
      q.v = Math.min(W.speed, q.v + (q.type === PROJ.EXOCET ? 110 : 160) * DT); // Booster
      let goal = null;
      if (q.target) {
        const t = this.players.get(q.target);
        if (t) goal = this.leadPoint(q, t.b);
        else q.target = 0;
      }
      if (!goal && q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < (q.type === PROJ.EXOCET ? 250 : 120)) q.tx = q.ty = null; // Suchkopf an
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
    } else if (q.type === PROJ.RAM) {
      const W = WEAPONS.ram;
      q.v = Math.min(W.speed, q.v + 220 * DT);
      // Suchkopf: nächster gegnerischer Flugkörper oder Hubschrauber (ohne aktive Täuschkörper)
      let tgt = null;
      if (q.target) tgt = this.projectiles.find((o) => o.id === q.target && !o.dead) || null;
      else if (q.heli) {
        const h = this.players.get(q.heli);
        tgt = h && h.abT <= 0 ? h.b : null;
        if (!tgt) q.heli = 0;
      }
      if (!tgt) {
        q.target = 0;
        q.heli = 0;
        let bestD = W.seekerRange;
        for (const o of this.projectiles) {
          if ((o.type !== PROJ.EXOCET && o.type !== PROJ.HELLFIRE) || o.team === q.team || o.dead) continue;
          const d = Math.hypot(o.x - q.x, o.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = o;
            q.target = o.id;
          }
        }
        for (const p of this.players.values()) {
          if (p.team === q.team || BOATS[p.type].kind !== "heli" || p.abT > 0) continue;
          const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = p.b;
            q.target = 0;
            q.heli = p.id;
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

    const px = q.x;
    const py = q.y;
    const step = q.v * DT;
    q.x += Math.cos(q.h) * step;
    q.y += Math.sin(q.h) * step;
    q.dist += step;

    // Abfangen: RAM trifft gegnerischen Flugkörper oder Hubschrauber
    if (q.type === PROJ.RAM && q.target) {
      const t = this.projectiles.find((o) => o.id === q.target);
      if (t && segDist(t.x, t.y, px, py, q.x, q.y) < 14) {
        if (Math.random() < WEAPONS.ram.pk) {
          t.dead = true;
          this.events.push(["intercept", t.x, t.y]);
        } else this.events.push(["air", q.x, q.y]);
        return false;
      }
    }
    if (q.type === PROJ.RAM && q.heli) {
      const h = this.players.get(q.heli);
      if (h && segDist(h.b.x, h.b.y, px, py, q.x, q.y) < 12) {
        this.events.push(["intercept", h.b.x, h.b.y]);
        if (Math.random() < WEAPONS.ram.pk) this.damage(h, 25, owner);
        return false;
      }
    }

    // Treffer an Hubschraubern (Geschütz, MG)
    if (q.type === PROJ.SHELL || q.type === PROJ.BULLET) {
      for (const p of this.players.values()) {
        const def = BOATS[p.type];
        if (p.team === q.team || def.kind !== "heli") continue;
        if (segDist(p.b.x, p.b.y, px, py, q.x, q.y) < def.hitRadius) {
          this.events.push(["hit", q.x, q.y]);
          this.damage(p, q.type === PROJ.SHELL ? WEAPONS.gun.damage * 1.5 : WEAPONS.mg.heliDamage, owner);
          return false;
        }
      }
    }

    // Treffer an Schiffen (RAM fliegt über Schiffe hinweg, wenn er ein Luftziel jagt)
    if (!(q.type === PROJ.RAM && (q.target || q.heli))) {
      for (const p of this.players.values()) {
        if (p.team === q.team) continue; // kein Eigenbeschuss
        const def = BOATS[p.type];
        if (def.kind !== "ship") continue;
        if (Math.abs(p.b.x - q.x) > def.length + step || Math.abs(p.b.y - q.y) > def.length + step) continue;
        for (const cc of boatCircles(p.b, def)) {
          if (segDist(cc.x, cc.y, px, py, q.x, q.y) < cc.r + 0.5) {
            const dmg =
              q.type === PROJ.SHELL
                ? WEAPONS.gun.damage
                : q.type === PROJ.EXOCET
                  ? WEAPONS.exocet.damage
                  : q.type === PROJ.HELLFIRE
                    ? WEAPONS.hellfire.damage
                    : q.type === PROJ.BULLET
                      ? WEAPONS.mg.damage
                      : WEAPONS.ram.damage;
            this.events.push([q.type === PROJ.EXOCET ? "bighit" : q.type === PROJ.BULLET ? "spark" : "hit", q.x, q.y]);
            this.damage(p, dmg, owner);
            return false;
          }
        }
      }
    }

    // Granaten, Projektile und Seezielflugkörper prallen an Land; RAM fliegt darüber
    if (q.type !== PROJ.RAM && isOnLand(this.map, q.x, q.y)) {
      this.events.push([q.type === PROJ.SHELL || q.type === PROJ.BULLET ? "dirt" : "bighit", q.x, q.y]);
      return false;
    }
    const half = WORLD_SIZE / 2;
    if (q.dist >= q.range || Math.abs(q.x) > half || Math.abs(q.y) > half) {
      this.events.push([q.type === PROJ.RAM ? "air" : q.type === PROJ.BULLET ? "spray" : "splash", q.x, q.y]);
      return false;
    }
    return true;
  }

  // Vorhalt: auf die voraussichtliche Position des Ziels zielen
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

  damage(p, dmg, attacker) {
    if (p.protect > 0 || p.hp <= 0) return;
    // Sicherer Hafen: im eigenen Hafenbecken kein Schaden
    if (inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y)) return;
    const real = Math.min(dmg, p.hp);
    p.hp -= dmg;
    if (attacker && attacker !== p && attacker.team !== p.team) {
      const d = p.damagers.get(attacker.id) || { dmg: 0, t: 0 };
      d.dmg += real;
      d.t = this.tick;
      p.damagers.set(attacker.id, d);
      this.addMoney(attacker, real * ECONOMY.perDamage); // still, ohne Meldung
    }
    if (p.hp > 0) return;
    // Versenkt / abgeschossen
    const heli = BOATS[p.type].kind === "heli";
    this.events.push([heli ? "crash" : "sink", p.b.x, p.b.y, p.b.h, p.team, BOATS[p.type].typeId]);
    const by = attacker && attacker !== p ? attacker : null;
    const bounty = ECONOMY.kill[p.type] || 500;
    if (by) {
      by.kills++;
      this.addMoney(by, bounty, `${heli ? "Abschuss" : "Versenkt"}: ${p.name}`);
    }
    // Assists: alle anderen, die in den letzten 30 s Schaden gemacht haben
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
