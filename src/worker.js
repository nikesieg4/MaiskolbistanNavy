import {
  TICK_RATE,
  DT,
  BOATS,
  WEAPONS,
  PROJ,
  WORLD_SIZE,
  generateMap,
  findSpawn,
  stepBoat,
  resolveBoatCollision,
  boatCircles,
  sanitizeName,
  isOnLand,
  aimAngles,
  slewTurret,
  segDist,
  clamp,
  wrapAngle,
} from "../public/shared/sim.js";
import ASSETS from "./assets.gen.js";

const MAX_PLAYERS = 64;
const MAX_QUEUE = 6;
const SPAWN_PROTECTION = 4; // s
// Bei Protokolländerungen erhöhen: Laufende Durable Objects behalten nach einem Deploy
// ihren alten Code, solange Spieler verbunden sind. Neue Verbindungen landen so in einer frischen Welt.
const WORLD_VERSION = 3;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket erwartet", { status: 426 });
      }
      const id = env.WORLD.idFromName(`haupt-ozean-v${WORLD_VERSION}`);
      return env.WORLD.get(id).fetch(request);
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Object.hasOwn(ASSETS, path) ? ASSETS[path] : null;
    if (!file || request.method !== "GET") return new Response("Nicht gefunden", { status: 404 });
    return new Response(file.body, {
      headers: { "content-type": file.type, "cache-control": "public, max-age=60" },
    });
  },
};

export class World {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.map = generateMap();
    this.players = new Map(); // id -> player
    this.projectiles = [];
    this.events = []; // Effekte dieses Ticks: [typ, x, y, ...]
    this.nextId = 1;
    this.nextProj = 1;
    this.tick = 0;
    this.timer = null;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.handleSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSocket(ws) {
    let player = null;

    ws.addEventListener("message", (ev) => {
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
      if (msg.t === "join" && !player) {
        if (this.players.size >= MAX_PLAYERS) {
          this.send(ws, { t: "full" });
          ws.close(1013, "Server voll");
          return;
        }
        player = this.createPlayer(ws, msg.name, () => {
          player = null;
        });
        this.players.set(player.id, player);
        this.send(ws, {
          t: "welcome",
          id: player.id,
          tickRate: TICK_RATE,
          players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, type: p.type })),
        });
        this.broadcast({ t: "join", id: player.id, name: player.name, type: player.type }, player.id);
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
      } else if (msg.t === "lock") {
        this.lock(player, +msg.x, +msg.y);
      }
    });

    const drop = () => {
      if (player && this.players.get(player.id) === player) {
        this.players.delete(player.id);
        this.broadcast({ t: "leave", id: player.id });
      }
      player = null;
    };
    ws.addEventListener("close", drop);
    ws.addEventListener("error", drop);
  }

  createPlayer(ws, name, onDeath) {
    const spawn = this.spawnNearOthers();
    const def = BOATS.gepard;
    return {
      id: this.nextId++,
      name: sanitizeName(name),
      type: "gepard",
      ws,
      onDeath,
      b: { x: spawn.x, y: spawn.y, h: spawn.h, v: 0, w: 0 },
      queue: [],
      last: { th: 0, ru: 0 },
      ack: 0,
      mx: spawn.x + Math.cos(spawn.h) * 100,
      my: spawn.y + Math.sin(spawn.h) * 100,
      gunAim: 0,
      gunOk: false,
      gunAng: 0,
      ramAim: 0,
      ramAng: 0,
      hp: def.hp,
      kills: 0,
      protect: SPAWN_PROTECTION,
      gunCd: 0,
      exo: WEAPONS.exocet.launchers.map(() => 0), // Nachladezeit je Zelle (0 = geladen)
      exoCd: 0,
      ram: WEAPONS.ram.magazine,
      ramReload: 0,
      ramCd: 0,
      lockId: 0,
      lockT: 0,
    };
  }

  // Neue Spieler in Sichtweite eines anderen Bootes starten lassen
  spawnNearOthers() {
    const others = [...this.players.values()];
    const lim = WORLD_SIZE / 2 - 300;
    for (let i = 0; i < 40 && others.length; i++) {
      const o = others[Math.floor(Math.random() * others.length)].b;
      const a = Math.random() * Math.PI * 2;
      const d = 450 + Math.random() * 400;
      const x = o.x + Math.cos(a) * d;
      const y = o.y + Math.sin(a) * d;
      if (Math.abs(x) > lim || Math.abs(y) > lim || isOnLand(this.map, x, y, 90)) continue;
      if (others.some((p) => Math.hypot(p.b.x - x, p.b.y - y) < 300)) continue;
      return { x, y, h: Math.random() * Math.PI * 2 };
    }
    return findSpawn(this.map);
  }

  // ---------- Waffen ----------

  fire(p, w) {
    const b = p.b;
    const c = Math.cos(b.h);
    const s = Math.sin(b.h);
    const def = BOATS[p.type];
    if (w === "gun") {
      const W = WEAPONS.gun;
      if (p.gunCd > 0 || !p.gunOk || Math.abs(p.gunAng - p.gunAim) > 0.06) return;
      p.gunCd = W.reload;
      const a = b.h + p.gunAng + (Math.random() - 0.5) * 2 * W.spread;
      const gx = b.x + c * def.gun.x + Math.cos(a) * 6.3;
      const gy = b.y + s * def.gun.x + Math.sin(a) * 6.3;
      this.spawnProj(p, PROJ.SHELL, gx, gy, a, W.speed, W.range);
      this.events.push(["muzzle", gx, gy, a]);
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
      // Mit AGIS-Lock: direkt ins Ziel. Ohne: zum Zielpunkt fliegen, dann Suchkopf aktivieren.
      if (p.lockId && p.lockT >= WEAPONS.lock.time && this.players.has(p.lockId)) pr.target = p.lockId;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["launch", x, y, b.h + L.a]);
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
    const pr = { id: this.nextProj++, type, owner: p.id, x, y, h, v, dist: 0, range, target: 0, tx: null, ty: null };
    this.projectiles.push(pr);
    return pr;
  }

  lock(p, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const L = WEAPONS.lock;
    let best = null;
    let bestD = L.pick;
    for (const o of this.players.values()) {
      if (o === p) continue;
      let d = Infinity;
      for (const cc of boatCircles(o.b, BOATS[o.type])) d = Math.min(d, Math.hypot(cc.x - x, cc.y - y) - cc.r);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best || best.id === p.lockId) {
      // Kein Schiff am Mauszeiger oder erneut auf dasselbe Ziel → Lock lösen
      const had = p.lockId;
      p.lockId = 0;
      p.lockT = 0;
      this.send(p.ws, { t: "lockmsg", m: had ? "AGIS: Ziel freigegeben" : "AGIS: kein Schiff am Zeiger" });
      return;
    }
    if (Math.hypot(best.b.x - p.b.x, best.b.y - p.b.y) > L.range) {
      this.send(p.ws, { t: "lockmsg", m: "AGIS: Ziel außerhalb der Radarreichweite" });
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
          stepBoat(p.b, inp, def, this.map);
        } else if (steps === 0) {
          stepBoat(p.b, p.last, def, this.map);
        }
      }
      // Türme nachführen
      const aim = aimAngles(p.b, def, p.mx, p.my);
      p.gunAim = aim.gun;
      p.gunOk = aim.gunOk;
      p.ramAim = aim.ram;
      p.gunAng = slewTurret(p.gunAng, aim.gun, def.gun, DT);
      p.ramAng = slewTurret(p.ramAng, aim.ram, def.ram, DT);
      // Nachladen
      p.gunCd = Math.max(0, p.gunCd - DT);
      p.exoCd = Math.max(0, p.exoCd - DT);
      p.ramCd = Math.max(0, p.ramCd - DT);
      for (let i = 0; i < p.exo.length; i++) p.exo[i] = Math.max(0, p.exo[i] - DT);
      if (p.ram < WEAPONS.ram.magazine) {
        p.ramReload += DT;
        if (p.ramReload >= WEAPONS.ram.reload) {
          p.ramReload = 0;
          p.ram++;
        }
      } else p.ramReload = 0;
      p.protect = Math.max(0, p.protect - DT);
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

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        resolveBoatCollision(list[i].b, list[j].b, BOATS.gepard, this.map);
      }
    }

    const keep = [];
    for (const q of this.projectiles) if (!q.dead && this.stepProjectile(q)) keep.push(q);
    this.projectiles = keep.filter((q) => !q.dead);

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
          rr: r(p.ramReload / WEAPONS.ram.reload),
          l: p.lockId,
          lt: r(p.lockT / WEAPONS.lock.time),
        },
      });
    }
  }

  // Gibt false zurück, wenn der Flugkörper verschwindet.
  stepProjectile(q) {
    const owner = this.players.get(q.owner);
    if (q.type === PROJ.EXOCET) {
      const W = WEAPONS.exocet;
      q.v = Math.min(W.speed, q.v + 110 * DT); // Booster
      let goal = null;
      if (q.target) {
        const t = this.players.get(q.target);
        if (t) goal = this.leadPoint(q, t.b);
        else q.target = 0;
      }
      if (!goal && q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < 250) q.tx = q.ty = null; // Zielpunkt erreicht → Suchkopf an
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
      // Suchkopf: nächstgelegener gegnerischer Flugkörper
      let tgt = q.target ? this.projectiles.find((o) => o.id === q.target && !o.dead) : null;
      if (!tgt) {
        q.target = 0;
        let bestD = W.seekerRange;
        for (const o of this.projectiles) {
          if (o.type === PROJ.SHELL || o.owner === q.owner || o === q || o.dead) continue;
          const d = Math.hypot(o.x - q.x, o.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = o;
          }
        }
        if (tgt) q.target = tgt.id;
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

    // Abfangen: RAM trifft gegnerischen Flugkörper
    if (q.type === PROJ.RAM && q.target) {
      const t = this.projectiles.find((o) => o.id === q.target);
      if (t && segDist(t.x, t.y, px, py, q.x, q.y) < 14) {
        // Abfangwahrscheinlichkeit: nicht jede RAM trifft
        if (Math.random() < WEAPONS.ram.pk) {
          t.dead = true;
          this.events.push(["intercept", t.x, t.y]);
        } else this.events.push(["air", q.x, q.y]);
        return false;
      }
    }

    // Treffer an Schiffen
    for (const p of this.players.values()) {
      if (p.id === q.owner && q.dist < 400) continue;
      const def = BOATS[p.type];
      if (Math.abs(p.b.x - q.x) > def.length + step || Math.abs(p.b.y - q.y) > def.length + step) continue;
      for (const cc of boatCircles(p.b, def)) {
        if (segDist(cc.x, cc.y, px, py, q.x, q.y) < cc.r + 0.5) {
          const dmg =
            q.type === PROJ.SHELL ? WEAPONS.gun.damage : q.type === PROJ.EXOCET ? WEAPONS.exocet.damage : WEAPONS.ram.damage;
          this.events.push([q.type === PROJ.EXOCET ? "bighit" : "hit", q.x, q.y]);
          this.damage(p, dmg, owner);
          return false;
        }
      }
    }

    if (isOnLand(this.map, q.x, q.y)) {
      this.events.push([q.type === PROJ.SHELL ? "dirt" : "bighit", q.x, q.y]);
      return false;
    }
    const half = WORLD_SIZE / 2;
    if (q.dist >= q.range || Math.abs(q.x) > half || Math.abs(q.y) > half) {
      this.events.push([q.type === PROJ.RAM ? "air" : "splash", q.x, q.y]);
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

  seekShip(q, range, cone) {
    let best = null;
    let bestD = range;
    for (const p of this.players.values()) {
      if (p.id === q.owner) continue;
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
    p.hp -= dmg;
    if (p.hp > 0) return;
    // Versenkt
    this.events.push(["sink", p.b.x, p.b.y, p.b.h]);
    const by = attacker && attacker !== p ? attacker : null;
    if (by) by.kills++;
    for (const o of this.players.values()) {
      if (o.lockId === p.id) {
        o.lockId = 0;
        o.lockT = 0;
      }
    }
    this.players.delete(p.id);
    this.send(p.ws, { t: "dead", by: by ? by.name : null, x: p.b.x, y: p.b.y, h: p.b.h });
    this.broadcast({ t: "leave", id: p.id, sunkBy: by ? by.id : 0 });
    p.onDeath();
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
