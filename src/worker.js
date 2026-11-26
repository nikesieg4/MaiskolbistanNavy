import {
  TICK_RATE,
  BOATS,
  generateMap,
  findSpawn,
  stepBoat,
  resolveBoatCollision,
  sanitizeName,
  isOnLand,
  WORLD_SIZE,
} from "../public/shared/sim.js";
import ASSETS from "./assets.gen.js";

const MAX_PLAYERS = 64;
const MAX_QUEUE = 6;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket erwartet", { status: 426 });
      }
      const id = env.WORLD.idFromName("haupt-ozean");
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
    this.nextId = 1;
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
      if (msg.t === "join" && !player) {
        if (this.players.size >= MAX_PLAYERS) {
          this.send(ws, { t: "full" });
          ws.close(1013, "Server voll");
          return;
        }
        const spawn = this.spawnNearOthers();
        player = {
          id: this.nextId++,
          name: sanitizeName(msg.name),
          type: "gepard",
          ws,
          b: { x: spawn.x, y: spawn.y, h: spawn.h, v: 0, w: 0 },
          queue: [],
          last: { th: 0, ru: 0 },
          ack: 0,
          aim: 0,
        };
        this.players.set(player.id, player);
        this.send(ws, {
          t: "welcome",
          id: player.id,
          tickRate: TICK_RATE,
          players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, type: p.type })),
        });
        this.broadcast({ t: "join", id: player.id, name: player.name, type: player.type }, player.id);
        this.ensureLoop();
      } else if (msg.t === "in" && player) {
        const seq = msg.s | 0;
        if (seq <= player.ack) return;
        player.queue.push({ s: seq, th: +msg.th || 0, ru: +msg.ru || 0 });
        const arc = BOATS[player.type].gun.arc;
        const aim = +msg.aim;
        player.aim = Number.isFinite(aim) && Math.abs(aim) <= arc ? aim : 0;
        if (player.queue.length > MAX_QUEUE) player.queue.splice(0, player.queue.length - MAX_QUEUE);
      } else if (msg.t === "ping") {
        this.send(ws, { t: "pong", c: msg.c });
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

  // Neue Spieler in Sichtweite eines anderen Bootes starten lassen
  spawnNearOthers() {
    const others = [...this.players.values()];
    const lim = WORLD_SIZE / 2 - 300;
    for (let i = 0; i < 40 && others.length; i++) {
      const o = others[Math.floor(Math.random() * others.length)].b;
      const a = Math.random() * Math.PI * 2;
      const d = 180 + Math.random() * 220;
      const x = o.x + Math.cos(a) * d;
      const y = o.y + Math.sin(a) * d;
      if (Math.abs(x) > lim || Math.abs(y) > lim || isOnLand(this.map, x, y, 90)) continue;
      if (others.some((p) => Math.hypot(p.b.x - x, p.b.y - y) < 90)) continue;
      return { x, y, h: Math.random() * Math.PI * 2 };
    }
    return findSpawn(this.map);
  }

  ensureLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => this.update(), 1000 / TICK_RATE);
  }

  update() {
    if (this.players.size === 0) {
      clearInterval(this.timer);
      this.timer = null;
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
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        resolveBoatCollision(list[i].b, list[j].b, BOATS.gepard, this.map);
      }
    }

    const r = (n, f = 100) => Math.round(n * f) / f;
    const snap = list.map((p) => [p.id, r(p.b.x), r(p.b.y), r(p.b.h, 1000), r(p.b.v), r(p.b.w, 1000), r(p.last.th), r(p.last.ru), r(p.aim, 1000)]);
    for (const p of list) {
      this.send(p.ws, { t: "s", k: this.tick, a: p.ack, p: snap });
    }
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
