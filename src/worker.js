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
  isSub,
  isBuyable,
  DEPTH,
  sonarRange,
  noiseLevel,
  envAt,
  envFactors,
  RANKS,
  rankOf,
  XP_PER_TALER,
  SEASON,
  seasonOf,
  seasonEnd,
} from "../public/shared/sim.js";
import ASSETS from "./assets.gen.js";

const MAX_PLAYERS = 64;
const MAX_QUEUE = 6;
const SPAWN_PROTECTION = 4; // s
// Bei Protokolländerungen erhöhen: Laufende Durable Objects behalten nach einem Deploy
// ihren alten Code, solange Spieler verbunden sind. Neue Verbindungen landen so in einer frischen Welt.
// Konten und Frontkarte liegen in eigenen, versionsunabhängigen Durable Objects ("konten", "front").
const WORLD_VERSION = 12;
const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

// ---------- Konten: Anmeldung ----------
// Passwörter werden nur als PBKDF2-SHA-256-Hash (100.000 Runden, zufälliges Salz je Konto) gespeichert.
// Angemeldet wird mit einem zufälligen Sitzungsschlüssel (256 Bit), den nur der Server erzeugt.
// Speicher (Instanz "konten"): a:<id> Kontodaten, u:<name klein> Zugang, s:<schlüssel> Sitzung.
// Gäste: id = zufälliger Schlüssel aus dem Browser (wie bisher); nach der Registrierung ist er wertlos.
const NAME_RE = /^[A-Za-z0-9ÄÖÜäöüß_-]{3,16}$/;
const PW_MIN = 8;
const PW_MAX = 128;
const PBKDF2_ITER = 100000;
const SESSION_LIFE = 180 * 24 * 3600 * 1000;
const AUTH_WINDOW = 15 * 60 * 1000;
const AUTH_MAX_FAILS = 8;
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}
async function pbkdf2(password, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return toHex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (obj, status = 200) => Response.json(obj, { status, headers: { "cache-control": "no-store" } });
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
    // Konto-Schnittstelle (Anmelden, Registrieren, Abmelden, Kaufen im Menü)
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "POST") return json({ ok: false, m: "POST erwartet" }, 405);
      const body = await request.text();
      if (body.length > 2048) return json({ ok: false, m: "Anfrage zu groß" }, 413);
      return worldStub(env).fetch(
        new Request(`https://welt${url.pathname}`, {
          method: "POST",
          body,
          headers: { "content-type": "application/json", "x-ip": request.headers.get("cf-connecting-ip") || "" },
        })
      );
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

const defaultAccount = () => ({ money: 0, owned: [...START_SHIP], loadout: {}, xp: 0, stats: {}, sp: null, medals: [] });
// Felder, die die Spielwelt verwaltet (Rest wie reg/name gehört der Anmeldung)
function cleanAccount(body) {
  const stats = {};
  if (body.stats && typeof body.stats === "object") for (const k of ["kills", "deaths", "caps", "rescues"]) stats[k] = Math.max(0, Math.floor(+body.stats[k] || 0));
  const sp = body.sp && typeof body.sp === "object" && Number.isFinite(+body.sp.id) && Array.isArray(body.sp.pts) ? { id: +body.sp.id, pts: [Math.max(0, +body.sp.pts[0] || 0), Math.max(0, +body.sp.pts[1] || 0)] } : null;
  const medals = (Array.isArray(body.medals) ? body.medals : []).filter((m) => m && Number.isFinite(+m.s)).slice(-100).map((m) => ({ s: +m.s, t: +m.t ? 1 : 0 }));
  const acct = {
    money: Math.max(0, Math.floor(+body.money || 0)),
    owned: (Array.isArray(body.owned) ? body.owned : []).filter((t) => BOATS[t]),
    loadout: body.loadout && typeof body.loadout === "object" ? body.loadout : {},
    xp: Math.max(0, Math.floor(+body.xp || 0)),
    stats,
    sp,
    medals,
  };
  for (const s of START_SHIP) if (!acct.owned.includes(s)) acct.owned.push(s);
  return acct;
}

export class World {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.map = generateMap();
    this.players = new Map(); // id -> player
    this.projectiles = [];
    this.rafts = []; // Schiffbrüchige: { id, x, y, t }
    this.events = []; // Effekte dieses Ticks: [typ, x, y, ...]
    this.accounts = new Map(); // Konto-ID -> { id, money, owned, xp, …, dirty }
    this.tokenIds = new Map(); // Schlüssel -> Konto-ID (Zwischenspeicher)
    this.authFails = new Map(); // nur Instanz "konten": Fehlversuche je Name/IP
    this.nameCache = new Map(); // registrierte Namen (für Gäste gesperrt)
    this.wx = envAt(Date.now()); // Tageszeit und Wetter
    this.wxF = envFactors(this.wx);
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
    // ---- Kontenspeicher (Instanz "konten", nur intern über Durable-Object-Stub erreichbar) ----
    if (url.pathname === "/acct") {
      const st = this.state.storage;
      if (request.method === "POST") {
        const id = url.searchParams.get("id") || "";
        if (!TOKEN_RE.test(id)) return new Response("bad id", { status: 400 });
        const old = (await st.get(`a:${id}`)) || {};
        if (old.moved) return new Response("moved", { status: 410 }); // Gastkonto wurde registriert
        await st.put(`a:${id}`, { ...cleanAccount(await request.json()), reg: !!old.reg, name: old.name });
        return new Response("ok");
      }
      const token = url.searchParams.get("token") || "";
      const id = await this.resolveToken(token);
      if (!id) return json({ error: "session" }, 401);
      const a = (await st.get(`a:${id}`)) || defaultAccount();
      return json({ ...a, id });
    }
    if (url.pathname.startsWith("/auth/")) return this.authRequest(url.pathname.slice(6), request);
    if (url.pathname === "/name") {
      const n = (url.searchParams.get("n") || "").toLowerCase();
      return json({ taken: !!(await this.state.storage.get(`u:${n}`)) });
    }
    // ---- Öffentliche Konto-Schnittstelle (Spielwelt) ----
    if (url.pathname.startsWith("/api/")) return this.apiRequest(url.pathname.slice(5), request);
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
      return json({
        teams,
        front: this.front,
        season: this.seasonInfo(),
        env: this.envRow(),
        account: account ? this.accountSummary(account) : null,
        auth: token && !account ? "invalid" : undefined,
      });
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

  // Schlüssel → Konto-ID (nur Instanz "konten"): Sitzung eines registrierten Kontos oder Gast
  async resolveToken(token) {
    if (!TOKEN_RE.test(token)) return null;
    const st = this.state.storage;
    const sess = await st.get(`s:${token}`);
    if (sess) {
      if (Date.now() - sess.c > SESSION_LIFE) {
        await st.delete(`s:${token}`);
        return null;
      }
      return sess.id;
    }
    // 64-stellige Hex-Schlüssel sind nur als Sitzung gültig (abgemeldet/abgelaufen → kein Gastzugang)
    if (/^[0-9a-f]{64}$/.test(token)) return null;
    const a = await st.get(`a:${token}`);
    if (a && (a.reg || a.moved)) return null; // Konto-ID oder alter Gastschlüssel eines registrierten Kontos: kein Zugang
    return token;
  }

  // Anmeldung (nur Instanz "konten")
  async authRequest(action, request) {
    const st = this.state.storage;
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, m: "Ungültige Anfrage" }, 400);
    }
    const name = String(body.name || "").trim();
    const lower = name.toLowerCase();
    const password = String(body.password || "");
    if (action === "logout") {
      if (TOKEN_RE.test(body.token || "")) await st.delete(`s:${body.token}`);
      return json({ ok: true });
    }
    if (action === "register") {
      if (!NAME_RE.test(name)) return json({ ok: false, m: "Name: 3–16 Zeichen, nur Buchstaben, Ziffern, _ und -" }, 400);
      if (password.length < PW_MIN || password.length > PW_MAX) return json({ ok: false, m: `Passwort: mindestens ${PW_MIN} Zeichen` }, 400);
      if (password.toLowerCase() === lower) return json({ ok: false, m: "Passwort darf nicht der Name sein" }, 400);
      if (await st.get(`u:${lower}`)) return json({ ok: false, m: "Dieser Name ist schon vergeben" }, 409);
      const salt = randomHex(16);
      const hash = await pbkdf2(password, salt, PBKDF2_ITER);
      if (await st.get(`u:${lower}`)) return json({ ok: false, m: "Dieser Name ist schon vergeben" }, 409);
      // Fortschritt des bisherigen Gastkontos übernehmen
      const oldId = TOKEN_RE.test(body.token || "") ? await this.resolveToken(body.token) : null;
      const old = oldId ? await st.get(`a:${oldId}`) : null;
      const migrate = old && !old.reg && !old.moved;
      const id = randomHex(32);
      await st.put(`a:${id}`, { ...(migrate ? cleanAccount(old) : defaultAccount()), reg: true, name });
      if (migrate) await st.put(`a:${oldId}`, { moved: true });
      // Platz für weitere Anmeldewege (z. B. Google: google = Konto-Kennung von Google)
      await st.put(`u:${lower}`, { id, name, salt, hash, iter: PBKDF2_ITER, created: Date.now() });
      const token = randomHex(32);
      await st.put(`s:${token}`, { id, c: Date.now() });
      return json({ ok: true, token, id, oldId: migrate ? oldId : null, name });
    }
    if (action === "login") {
      const now = Date.now();
      const keys = [`n:${lower}`, `ip:${String(body.ip || "")}`];
      for (const k of keys) {
        const f = this.authFails.get(k);
        if (f && now - f.t < AUTH_WINDOW && f.n >= AUTH_MAX_FAILS) return json({ ok: false, m: "Zu viele Fehlversuche – bitte in 15 Minuten erneut versuchen" }, 429);
      }
      const rec = NAME_RE.test(name) ? await st.get(`u:${lower}`) : null;
      // Auch ohne Konto rechnen, damit die Antwortzeit nichts verrät
      const hash = await pbkdf2(password.slice(0, PW_MAX), rec ? rec.salt : "00112233445566778899aabbccddeeff", rec ? rec.iter : PBKDF2_ITER);
      if (!rec || !safeEqual(hash, rec.hash)) {
        for (const k of keys) {
          const f = this.authFails.get(k);
          this.authFails.set(k, f && now - f.t < AUTH_WINDOW ? { n: f.n + 1, t: f.t } : { n: 1, t: now });
        }
        if (this.authFails.size > 5000) this.authFails.clear();
        return json({ ok: false, m: "Name oder Passwort falsch" }, 401);
      }
      this.authFails.delete(keys[0]);
      const token = randomHex(32);
      await st.put(`s:${token}`, { id: rec.id, c: now });
      return json({ ok: true, token, id: rec.id, name: rec.name });
    }
    return json({ ok: false, m: "Unbekannt" }, 404);
  }

  // Öffentliche Schnittstelle der Spielwelt: leitet Anmeldungen an "konten" weiter und hält den Zwischenspeicher aktuell
  async apiRequest(action, request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, m: "Ungültige Anfrage" }, 400);
    }
    const ip = request.headers.get("x-ip") || "";
    const auth = async (a, payload) => {
      const r = await this.kontenStub().fetch(`https://konten/auth/${a}`, { method: "POST", body: JSON.stringify(payload) });
      return { status: r.status, data: await r.json() };
    };
    if (action === "register") {
      // Ungespeicherten Spielstand des Gastkontos vorher sichern
      const oldToken = TOKEN_RE.test(body.token || "") ? body.token : null;
      const oldId = oldToken ? this.tokenIds.get(oldToken) : null;
      if (oldId) await this.flushAccounts(true);
      const { status, data } = await auth("register", { name: body.name, password: body.password, token: oldToken });
      if (data.ok) {
        if (data.oldId && this.accounts.has(data.oldId)) {
          const a = this.accounts.get(data.oldId);
          this.accounts.delete(data.oldId);
          Object.assign(a, { id: data.id, reg: true, name: data.name });
          this.accounts.set(data.id, a);
        }
        if (oldToken) this.tokenIds.delete(oldToken);
        this.tokenIds.set(data.token, data.id);
        this.nameCache.set(data.name.toLowerCase(), { taken: true, t: Date.now() });
      }
      return json({ ok: data.ok, m: data.m, token: data.token, name: data.name }, status);
    }
    if (action === "login") {
      const { status, data } = await auth("login", { name: body.name, password: body.password, ip });
      if (data.ok) this.tokenIds.set(data.token, data.id);
      return json({ ok: data.ok, m: data.m, token: data.token, name: data.name }, status);
    }
    if (action === "logout") {
      if (TOKEN_RE.test(body.token || "")) {
        this.tokenIds.delete(body.token);
        await auth("logout", { token: body.token });
      }
      return json({ ok: true });
    }
    if (action === "buy") {
      await this.ensureFront();
      const acct = await this.getAccount(String(body.token || ""));
      if (!acct) return json({ ok: false, m: "Bitte neu anmelden" }, 401);
      const r = this.purchase(acct, String(body.item || ""), null);
      if (r.ok) await this.flushAccounts(true);
      return json({ ...r, account: this.accountSummary(acct) });
    }
    return json({ ok: false, m: "Unbekannt" }, 404);
  }

  async getAccount(token) {
    if (!TOKEN_RE.test(token)) return null;
    const known = this.tokenIds.get(token);
    if (known && this.accounts.has(known)) {
      const a = this.accounts.get(known);
      a.seen = Date.now();
      return a;
    }
    let a;
    try {
      const r = await this.kontenStub().fetch(`https://konten/acct?token=${token}`);
      if (r.status === 401) {
        this.tokenIds.delete(token);
        return null; // Sitzung abgelaufen oder ungültig
      }
      const data = await r.json();
      const clean = cleanAccount(data);
      a = { id: data.id, ...clean, reg: !!data.reg, name: data.name || null, dirty: false };
    } catch {
      return { id: null, ...defaultAccount(), dirty: false, temp: true };
    }
    this.tokenIds.set(token, a.id);
    // Wer den Träger vor der Aufteilung in Nationen gekauft hat, bekommt auch das Gegenstück
    if (a.owned.includes("carrier") && !a.owned.includes("america")) {
      a.owned.push("america");
      a.dirty = true;
    }
    // Nur für lokale Tests (wrangler dev --var DEV_START_MONEY:…): neue Konten mit Startguthaben
    if (this.env.DEV_START_MONEY && a.money === 0 && a.owned.length <= START_SHIP.length) a.money = +this.env.DEV_START_MONEY || 0;
    if (this.env.DEV_START_XP && !a.xp) a.xp = +this.env.DEV_START_XP || 0;
    if (!this.accounts.has(a.id)) this.accounts.set(a.id, a);
    a = this.accounts.get(a.id);
    this.applySeason(a);
    a.seen = Date.now();
    return a;
  }

  accountSummary(a) {
    return {
      money: a.money,
      owned: a.owned,
      xp: a.xp,
      rank: rankOf(a.xp),
      reg: !!a.reg,
      name: a.name,
      medals: a.medals,
      stats: a.stats,
      sp: a.sp && this.front && a.sp.id === this.front.season ? a.sp.pts : [0, 0],
      notice: a.notice,
    };
  }

  async flushAccounts(force) {
    const inUse = new Set([...this.players.values()].map((p) => p.acct && p.acct.id));
    for (const [id, a] of this.accounts) {
      if (a.dirty && !a.temp && id) {
        a.dirty = false;
        try {
          const r = await this.kontenStub().fetch(`https://konten/acct?id=${id}`, {
            method: "POST",
            body: JSON.stringify({ money: a.money, owned: a.owned, loadout: a.loadout || {}, xp: a.xp, stats: a.stats, sp: a.sp, medals: a.medals }),
          });
          if (r.status === 410) a.temp = true; // Gastkonto inzwischen registriert: nicht mehr hierhin speichern
        } catch {
          a.dirty = true;
        }
      }
      // Erst nach einer Minute ohne Benutzung aus dem Zwischenspeicher nehmen (sonst kann ein
      // gerade beitretender Spieler ein Konto halten, das nicht mehr gespeichert wird)
      if (!force && !a.dirty && !inUse.has(id) && Date.now() - (a.seen || 0) > 60000) {
        this.accounts.delete(id);
        for (const [t, i] of this.tokenIds) if (i === id) this.tokenIds.delete(t);
      }
    }
  }

  // Für Gäste gesperrte Namen (registriert)
  async nameTaken(name) {
    const lower = name.toLowerCase();
    const c = this.nameCache.get(lower);
    if (c && Date.now() - c.t < 300000) return c.taken;
    let taken = false;
    try {
      const r = await this.kontenStub().fetch(`https://konten/name?n=${encodeURIComponent(lower)}`);
      taken = !!(await r.json()).taken;
    } catch {}
    if (this.nameCache.size > 2000) this.nameCache.clear();
    this.nameCache.set(lower, { taken, t: Date.now() });
    return taken;
  }

  // ---------- Erfahrung, Dienstgrade, Saison ----------
  addXp(p, amount) {
    const a = p && p.acct;
    if (!a || amount <= 0) return;
    const before = rankOf(a.xp);
    a.xpFrac = (a.xpFrac || 0) + amount;
    const whole = Math.floor(a.xpFrac);
    if (whole <= 0) return;
    a.xpFrac -= whole;
    a.xp = (a.xp || 0) + whole;
    const sid = this.front ? this.front.season : seasonOf(Date.now());
    if (!a.sp || a.sp.id !== sid) a.sp = { id: sid, pts: [0, 0] };
    a.sp.pts[p.team] += whole;
    a.dirty = true;
    const after = rankOf(a.xp);
    if (after > before) {
      this.send(p.ws, { t: "rank", r: after, name: RANKS[after].name });
      p.rank = after;
    }
  }

  stat(p, key) {
    if (!p || !p.acct) return;
    p.acct.stats = p.acct.stats || {};
    p.acct.stats[key] = (p.acct.stats[key] || 0) + 1;
    p.acct.dirty = true;
  }

  // Medaille vergeben, wenn die Saison des Kontos vorbei ist und sein Team gewonnen hat
  applySeason(a) {
    if (!this.front || !a.sp || a.sp.id >= this.front.season) return;
    const h = (this.front.hist || []).find((e) => e.id === a.sp.id);
    if (h && h.winner >= 0 && a.sp.pts[h.winner] >= SEASON.minPoints) {
      a.medals = [...(a.medals || []), { s: h.id, t: h.winner }];
      a.money += SEASON.medalBonus;
      a.notice = `Saison ${h.id} gewonnen – Medaille und ${SEASON.medalBonus.toLocaleString("de-DE")} Taler!`;
    }
    a.sp = null;
    a.dirty = true;
  }

  seasonInfo() {
    const id = this.front ? this.front.season : seasonOf(Date.now());
    return { id, end: seasonEnd(id), hist: this.front ? (this.front.hist || []).slice(-5) : [] };
  }

  // Saisonwechsel: Sieger festhalten, Frontkarte zurücksetzen, Medaillen der anwesenden Konten vergeben
  checkSeason() {
    const f = this.front;
    if (!f) return;
    const cur = seasonOf(Date.now());
    if (f.season === cur) return;
    if (f.season) {
      const c = [f.own.filter((o) => o === 0).length, f.own.filter((o) => o === 1).length];
      const winner = c[0] > c[1] ? 0 : c[1] > c[0] ? 1 : -1;
      f.hist = [...(f.hist || []), { id: f.season, winner, c }].slice(-30);
      f.own = f.own.map(() => -1);
      f.prog = f.prog.map(() => 0);
      this.broadcast({ t: "season", ended: f.season, winner, next: cur });
    }
    f.season = cur;
    this.frontDirty = true;
    this.flushFront();
    for (const a of this.accounts.values()) {
      const before = a.notice;
      this.applySeason(a);
      if (a.notice && a.notice !== before) {
        for (const p of this.players.values()) if (p.acct === a) this.send(p.ws, { t: "reward", a: SEASON.medalBonus, m: a.notice });
      }
    }
  }

  // ---------- Tageszeit und Wetter ----------
  envRow() {
    const e = this.wx;
    return [Math.round(e.h * 100) / 100, e.w, e.p, Math.round(e.k * 100) / 100];
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

  // Gefechtsbelohnung: Taler und Erfahrung (ein Zehntel)
  addMoney(p, amount, why) {
    if (!p || !p.acct || amount <= 0) return;
    p.acct.money += Math.round(amount);
    p.acct.dirty = true;
    this.addXp(p, amount * XP_PER_TALER);
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
    if (!f || !Array.isArray(f.own) || f.own.length !== n) f = { ...(f || {}), own: Array(n).fill(-1), prog: Array(n).fill(0) };
    this.front = f;
    this.checkSeason();
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
        if (def.kind === "drone" || def.kind === "jet") continue;
        if (def.kind === "heli" && (p.b.z || 0) > ALTITUDE.captureHeli) continue;
        if (isSub(def) && (p.b.z || 0) < DEPTH.periscope) continue;
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
          if (own === team) {
            this.addMoney(p, ECONOMY.capture, `Stützpunkt ${o.name} erobert`);
            this.stat(p, "caps");
          } else this.addMoney(p, ECONOMY.neutralize, `Stützpunkt ${o.name} neutralisiert`);
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
        let acct = token ? await this.getAccount(token) : null;
        if (!acct) {
          // Ungültige oder abgelaufene Sitzung: als Gast ohne Speicherung spielen, Client meldet neu an
          if (token) this.send(ws, { t: "auth", m: "Sitzung abgelaufen – bitte neu anmelden." });
          acct = { id: null, ...defaultAccount(), dirty: false, temp: true };
        }
        // Registrierte Spieler heißen wie ihr Konto, Gäste dürfen keinen registrierten Namen tragen
        let name = sanitizeName(msg.name);
        if (acct.reg && acct.name) name = acct.name;
        else if (await this.nameTaken(name)) name = `Gast-${100 + Math.floor(Math.random() * 900)}`;
        const team = msg.team === 1 ? 1 : 0;
        const { type, spawn, carrierId, note } = this.chooseSpawn(team, String(msg.spawn || ""), String(msg.loc || ""), acct);
        player = this.createPlayer(ws, name, team, type, spawn, () => {
          player = null;
        });
        player.token = token;
        player.acct = acct;
        player.reg = !!acct.reg;
        player.rank = rankOf(acct.xp);
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
          name: player.name,
          acct: this.accountSummary(acct),
          players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, type: p.type, team: p.team, reg: p.reg })),
        });
        if (acct.notice) acct.notice = null;
        this.broadcast({ t: "join", id: player.id, name: player.name, type: player.type, team: player.team, reg: player.reg }, player.id);
        this.ensureLoop();
        return;
      }
      if (!player) return;
      if (msg.t === "in") {
        const seq = msg.s | 0;
        if (seq <= player.ack) return;
        player.queue.push({ s: seq, th: +msg.th || 0, ru: +msg.ru || 0, up: +msg.up || 0, ab: msg.ab ? 1 : 0 });
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
    if (want.startsWith("jet:")) {
      // "jet:<typ>:af" (Startbahn) oder "jet:<typ>:<trägerId>" (Senkrechtstarter auf dem Trägerdeck)
      const [, jt, where] = want.split(":");
      const jd = BOATS[jt];
      if (!jd || jd.kind !== "jet" || jd.team !== team) return fallback();
      if (!acct.owned.includes(jt)) return fallback(`${jd.short} noch nicht gekauft – Start mit dem Standardschiff.`);
      if (where && where !== "af" && jd.vtol) {
        const c = this.players.get(+where);
        if (c && c.team === team && BOATS[c.type].carrier && this.freeHeliSpots(c) > 0) {
          const spot = this.freeSpot(c);
          const s = heliSpotWorld(c.b, spot, BOATS[c.type]);
          return { type: jt, spawn: { ...s, spot }, carrierId: c.id };
        }
        return { type: jt, spawn: this.runwaySpawn(team, jd), note: "Trägerdeck nicht mehr frei – Start von der Bahn." };
      }
      return { type: jt, spawn: this.runwaySpawn(team, jd) };
    }
    if (want.startsWith("heli")) {
      const wantedId = +want.split(":")[1] || 0;
      const c = this.players.get(wantedId);
      if (!c || c.team !== team || !BOATS[c.type].heliSpots || this.freeHeliSpots(c) <= 0) {
        const r = this.chooseSpawn(team, "heli:af", loc, acct);
        return { ...r, note: "Landedeck nicht mehr frei – Start vom Flugfeld." };
      }
      const cdef = BOATS[c.type];
      const spot = this.freeSpot(c);
      const s = heliSpotWorld(c.b, spot, cdef);
      return { type: cdef.heliType, spawn: { ...s, spot }, carrierId: c.id };
    }
    const def = BOATS[want];
    if (!def || (def.kind !== "ship" && def.kind !== "sub") || def.team !== team) return fallback();
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

  // Jeder Landeplatz trägt genau ein Luftfahrzeug, bis dieses zerstört ist
  freeSpot(c) {
    const cdef = BOATS[c.type];
    const reserved = new Set([...this.players.values()].filter((p) => p.carrierId === c.id).map((p) => p.spot));
    const landed = new Set([...this.players.values()].filter((p) => p.landed && p.landed.carrierId === c.id).map((p) => p.landed.spot));
    let spot = cdef.heliSpots.findIndex((_, i) => !reserved.has(i) && !landed.has(i));
    if (spot < 0) spot = cdef.heliSpots.findIndex((_, i) => !reserved.has(i));
    return spot;
  }

  // Jets rollen am Südende der Bahn an (wie Drohnen)
  runwaySpawn(team, def) {
    return { ...runwayStart(team), v: def.minSpeed || 60, zt: 800 };
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
      b: { x: spawn.x, y: spawn.y, h: spawn.h, v: spawn.v || 0, w: 0, z: 0, zt: spawn.zt || 0 },
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
    if (def.fuel) p.b.fuel = def.fuel;
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
      else if (W.kind === "gun" || W.kind === "mg" || W.kind === "jgun") p.ws_[w] = { cd: 0 };
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
    // Bahnlandung: Drohnen und Jets langsam und tief über der eigenen Bahn
    const slowEnough = def.kind === "drone" ? Math.abs(p.b.v) <= def.minSpeed + 4 : def.kind === "jet" && Math.abs(p.b.v) <= def.landSpeed;
    if (def.kind === "drone" || (def.kind === "jet" && (!def.vtol || Math.abs(p.b.v) > 8))) {
      if (slowEnough && (p.b.z || 0) <= ALTITUDE.landDrone && inRect(runwayRect(p.team), p.b.x, p.b.y)) {
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
    // Schwebend landen: Hubschrauber und Senkrechtstarter (Jets nur auf Trägern)
    if (Math.abs(p.b.v) > (def.kind === "jet" ? 8 : 6) || (p.b.z || 0) > ALTITUDE.landHeli) return;
    for (const c of this.players.values()) {
      const cd = BOATS[c.type];
      if (!cd.heliSpots || c.team !== p.team) continue;
      if (def.kind === "jet" && !cd.carrier) continue;
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
      p.landed = { kind: "airfield", pad: true };
      this.send(p.ws, { t: "landed", where: "Flugfeld" });
    }
  }

  takeOff(p) {
    const def = BOATS[p.type];
    const hover = p.landed && (p.landed.kind === "carrier" || p.landed.pad);
    if (def.kind === "drone" || (def.kind === "jet" && !(def.vtol && hover))) {
      const s = runwayStart(p.team);
      Object.assign(p.b, { x: s.x, y: s.y, h: s.h, v: def.kind === "jet" ? Math.max(60, def.minSpeed) : def.minSpeed, w: 0, z: 0, zt: def.kind === "jet" ? 800 : 900 });
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
    const k = BOATS[p.type].kind;
    return (k === "ship" || k === "sub") && inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y);
  }

  // Kauf eines Fahrzeugs (Schiff, U-Boot, Jet): genug Taler und Dienstgrad
  purchase(acct, item, team) {
    const def = BOATS[item];
    if (!def || !isBuyable(def) || (team !== null && def.team !== team) || !acct || acct.temp) return { ok: false, m: "Nicht verfügbar." };
    if (acct.owned.includes(item)) return { ok: false, m: "Bereits gekauft." };
    const need = def.rank || 0;
    if (rankOf(acct.xp) < need) return { ok: false, m: `Dienstgrad ${RANKS[need].name} nötig.` };
    if (acct.money < def.price) return { ok: false, m: "Nicht genug Taler." };
    acct.money -= def.price;
    acct.owned.push(item);
    acct.dirty = true;
    return { ok: true, m: `${def.short} gekauft!` };
  }

  buy(p, ship) {
    if (!p.acct) return;
    const atBase = this.inOwnHarbor(p) || (p.landed && p.landed.kind === "airfield");
    if (!atBase) return this.send(p.ws, { t: "shop", ok: false, m: "Der Laden ist nur im eigenen Hafen oder auf dem Flugfeld geöffnet." });
    const r = this.purchase(p.acct, ship, p.team);
    if (r.ok) this.flushAccounts();
    this.send(p.ws, { t: "shop", ok: r.ok, m: r.m, owned: p.acct.owned });
  }

  switchShip(p, ship) {
    const def = BOATS[ship];
    if (!def || (def.kind !== "ship" && def.kind !== "sub") || def.team !== p.team || !p.acct || !p.acct.owned.includes(ship) || ship === p.type) return;
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

  flaresOn(p) {
    return BOATS[p.type].ability === "flares" && p.abT > 0;
  }

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

  // Welche Gegner erfasst jedes Team? Radar/Sicht (r) und Sonar (sr) von Fahrzeugen, Basis und Stützpunkten.
  // Getauchte U-Boote hört nur Sonar (leise = schwer), Luftfahrzeuge sieht nur Radar/Sicht. Wetter und Nacht wirken mit.
  computeDetection() {
    const list = [...this.players.values()];
    const F = this.wxF;
    const sources = [[], []];
    for (const p of list) {
      const def = BOATS[p.type];
      const abilityRadar = p.abT > 0 && def.ability === "radar";
      const jam = this.jammedAt(p.b.x, p.b.y, p.team) ? WEAPONS.jammer.sensorFactor : 1;
      sources[p.team].push({ x: p.b.x, y: p.b.y, r: sensorRange(def, p.radarOn, abilityRadar, p.b.z || 0, F) * jam, sr: sonarRange(def, p.b, F) });
    }
    for (const t of [0, 1]) {
      const hr = harborRect(teamBase(t));
      sources[t].push({ x: (hr.x0 + hr.x1) / 2, y: 0, r: SENSORS.base * F.radar, sr: 1500 * F.sonar });
    }
    if (this.front) {
      for (const o of this.map.outposts) {
        const own = this.front.own[o.id];
        if (own >= 0) sources[own].push({ x: o.x, y: o.y, r: SENSORS.outpost * F.radar, sr: 1200 * F.sonar });
      }
    }
    const minVis = 450 * F.vis;
    const det = [new Set(), new Set()];
    for (const e of list) {
      const t = 1 - e.team;
      const ed = BOATS[e.type];
      const z = e.b.z || 0;
      const sub = isSub(ed);
      const deep = sub && z < DEPTH.periscope;
      const sig = signature(ed, this.emitting(e), z);
      const naval = ed.kind === "ship" || sub;
      const loud = naval ? noiseLevel(ed, e.b) : 0;
      const minD = sub && z < DEPTH.surface ? 0 : minVis;
      for (const s of sources[t]) {
        const d = Math.hypot(e.b.x - s.x, e.b.y - s.y);
        if ((!deep && s.r > 0 && d < Math.max(minD, s.r * sig)) || (naval && s.sr > 0 && d < s.sr * loud)) {
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
  // want: "ship" (Überwasser inkl. aufgetauchter U-Boote), "naval" (auch getauchte U-Boote), "air" oder null
  guidedTarget(p, range, want = "ship") {
    if (want === true) want = "ship";
    const kindOk = (t) => {
      const d = BOATS[t.type];
      if (want === "ship") return d.kind === "ship" || (isSub(d) && (t.b.z || 0) > DEPTH.surface);
      if (want === "naval") return d.kind === "ship" || isSub(d);
      if (want === "air") return isAir(d) && !t.landed;
      return true;
    };
    const ok = (t) => t && kindOk(t) && this.det[p.team].has(t.id) && Math.hypot(t.b.x - p.b.x, t.b.y - p.b.y) < range;
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
    // U-Boote: Flugkörper nur auf Sehrohrtiefe oder aufgetaucht, Torpedos in jeder Tiefe
    if (isSub(def) && W.kind !== "torp" && (p.b.z || 0) < DEPTH.periscope) {
      if (!p.depthMsg || this.tick - p.depthMsg > 40) {
        p.depthMsg = this.tick;
        this.send(p.ws, { t: "lockmsg", m: "Flugkörper nur auf Sehrohrtiefe (Q)" });
      }
      return;
    }
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
    } else if (W.kind === "jgun") {
      // Bordkanone: starr in Flugrichtung
      st.cd = W.reload;
      const a = b.h + (Math.random() - 0.5) * 2 * W.spread;
      const x = b.x + c * (def.length / 2 + 1);
      const y = b.y + s * (def.length / 2 + 1);
      this.spawnProj(p, w, x, y, a, W.speed + Math.max(0, b.v));
      this.events.push(["muzzle", x, y, a]);
    } else if (W.kind === "aam") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      const R = W.rails[st.rail++ % W.rails.length];
      const x = b.x + R.x * c - R.y * s;
      const y = b.y + R.x * s + R.y * c;
      const pr = this.spawnProj(p, w, x, y, b.h, Math.max(80, b.v + 30));
      // Radar-Flugkörper: gelocktes Luftziel; sonst (und bei IR) Suchkopf Richtung Mauszeiger
      let t = W.ir ? null : this.guidedTarget(p, W.range, "air");
      if (!t) t = this.seekAir(pr, Math.atan2(p.my - y, p.mx - x), W.seekerRange, W.seekerCone);
      if (t) pr.air = t.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["hflaunch", x, y, b.h]);
    } else if (W.kind === "bomb") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      const R = W.rails[st.rail++ % W.rails.length];
      const x = b.x + R.x * c - R.y * s;
      const y = b.y + R.x * s + R.y * c;
      const pr = this.spawnProj(p, w, x, y, b.h, Math.max(60, b.v));
      pr.vz = 0;
      const t = this.guidedTarget(p, W.range, "ship");
      if (t) pr.target = t.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
    } else if (W.kind === "torp") {
      if (st.n <= 0) return;
      st.n--;
      st.cd = W.interval;
      let x = b.x;
      let y = b.y;
      if (def.kind === "ship") {
        // Torpedorohr an der Bordwand Richtung Ziel
        const side = Math.sin(toMouse - b.h) >= 0 ? 1 : -1;
        x = b.x - s * side * (def.beam / 2 + 2);
        y = b.y + c * side * (def.beam / 2 + 2);
      } else if (isSub(def)) {
        x = b.x + c * (def.length / 2);
        y = b.y + s * (def.length / 2);
      }
      const pr = this.spawnProj(p, w, x, y, isAir(def) ? b.h : toMouse, W.speed * 0.6);
      pr.z = isSub(def) ? Math.min(-8, b.z || 0) : -20;
      const t = this.guidedTarget(p, W.range, "naval");
      if (t) pr.target = t.id;
      else {
        pr.tx = p.mx;
        pr.ty = p.my;
      }
      this.events.push(["torp", x, y, pr.h]);
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
      z: isAir(BOATS[p.type]) ? p.b.z || 0 : isSub(BOATS[p.type]) ? Math.max(ALTITUDE.shipZ, p.b.z || 0) : ALTITUDE.shipZ,
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
      // Infrarot und Flugabwehr lassen sich sicher täuschen, Radar-Luft-Luft nur zur Hälfte
      for (const q of this.projectiles) {
        if (q.air !== p.id) continue;
        if (q.k === "aam" && !WEAPONS[q.w].ir && Math.random() < 0.5) continue;
        q.air = 0;
      }
    } else if (key === "decoy") {
      for (const q of this.projectiles) {
        if (q.k === "torp" && q.target === p.id && Math.random() < A.breakChance) {
          q.target = 0;
          q.tx = p.b.x + (Math.random() - 0.5) * 600;
          q.ty = p.b.y + (Math.random() - 0.5) * 600;
          q.decoy = true;
        }
      }
      this.events.push(["decoy", p.b.x, p.b.y]);
    }
  }

  lock(p, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const L = WEAPONS.lock;
    const def = BOATS[p.type];
    const radar = p.abT > 0 && def.ability === "radar";
    const range = Math.max(radar ? ABILITIES.radar.lockRange : L.range, def.kind === "drone" || def.kind === "jet" ? def.sensor : 0, isSub(def) ? def.sonar : 0);
    let best = null;
    let bestD = radar || def.kind === "drone" || def.kind === "jet" || isSub(def) ? ABILITIES.radar.pick : L.pick;
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
    if (this.tick % 20 === 0) {
      this.wx = envAt(Date.now());
      this.wxF = envFactors(this.wx);
    }
    if (this.tick % 1200 === 0) this.checkSeason();
    const list = [...this.players.values()];

    for (const p of list) {
      const def = BOATS[p.type];
      let steps = p.queue.length > 3 ? 2 : 1;
      while (steps-- > 0) {
        const inp = p.queue.shift();
        if (inp) {
          p.last = inp;
          p.ack = inp.s;
          if (!p.landed) stepEntity(p.b, inp, def, this.map, this.wxF);
        } else if (steps === 0 && !p.landed) {
          stepEntity(p.b, p.last, def, this.map, this.wxF);
        }
      }
      // Treibstoff der Jets: Schub kostet, Nachbrenner dreifach, Schweben (Senkrechtstarter) mehr
      if (def.fuel && !p.landed) {
        const th = Math.max(0, p.last.th || 0);
        const ab = p.last.ab && def.abSpeed && th > 0.9 ? 3 : 1;
        const hover = def.vtol && Math.abs(p.b.v) < 60 ? 1.4 : 1;
        const before = p.b.fuel;
        p.b.fuel = Math.max(0, p.b.fuel - DT * (0.35 + 0.65 * th) * ab * hover);
        if (before > def.fuel * 0.2 && p.b.fuel <= def.fuel * 0.2) this.send(p.ws, { t: "lockmsg", m: "BINGO FUEL – zurück zur Basis!" });
        if (before > 0 && p.b.fuel <= 0) this.send(p.ws, { t: "lockmsg", m: "Treibstoff leer – Triebwerk aus!" });
        if (p.b.fuel <= 0 && (p.b.z || 0) <= 1) {
          this.damage(p, 9999, null, true); // Absturz
          continue;
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
          if (def.fuel) p.b.fuel = Math.min(def.fuel, p.b.fuel + def.fuel * 0.15 * DT);
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
            this.stat(p, "rescues");
          }
        }
      }
    }
    this.rafts = this.rafts.filter((r) => !r.done && this.tick - r.t < RAFT_LIFE * TICK_RATE);

    // Schiffe kollidieren (Luftfahrzeuge fliegen darüber)
    // Getauchte U-Boote tauchen unter Schiffen hindurch
    const ships = list.filter((p) => this.players.has(p.id) && (BOATS[p.type].kind === "ship" || (isSub(BOATS[p.type]) && (p.b.z || 0) > -12)));
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
      // Nachbrenner an, Dienstgrad, registriert
      p.last.ab && BOATS[p.type].abSpeed && (p.last.th || 0) > 0.9 && p.b.fuel > 0 ? 1 : 0,
      p.rank || 0,
      p.reg ? 1 : 0,
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
      // Torpedos hört nur Sonar, alles andere sieht Radar/Sicht
      const near = (q) => {
        if (q.team === team) return true;
        for (const s of this.sources[team]) if (Math.hypot(q.x - s.x, q.y - s.y) < (q.k === "torp" ? s.sr : s.r)) return true;
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
          env: this.envRow(),
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
            xp: p.acct ? p.acct.xp : 0,
            fu: def.fuel ? Math.round((p.b.fuel / def.fuel) * 1000) / 1000 : undefined,
            so: Math.round(sonarRange(def, p.b, this.wxF)),
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
    const radarAam = q.k === "aam" && !W.ir;
    if ((q.k === "ssm" || q.k === "agm" || q.k === "sam" || radarAam) && (q.target || q.air) && this.jammedAt(q.x, q.y, q.team, "lockRadius")) {
      if (Math.random() < WEAPONS.jammer.breakChance) {
        q.target = 0;
        q.air = 0;
        q.tx = q.ty = null;
        q.jamUntil = this.tick + 40;
      }
    }
    if (q.jamUntil && this.tick < q.jamUntil && q.k !== "arm") {
      // gestört: fliegt geradeaus weiter
    } else if (q.k === "aam") {
      q.v = Math.min(W.speed, q.v + 260 * DT);
      let t = q.air ? this.players.get(q.air) : null;
      if (t && (t.landed || (W.ir && this.flaresOn(t) && Math.random() < 0.2))) t = null;
      if (!t && q.air) q.air = 0;
      if (!t && q.tx === null) {
        t = this.seekAir(q, q.h, W.seekerRange, W.seekerCone);
        if (t) q.air = t.id;
      }
      if (t) {
        const g = this.leadPoint(q, t.b);
        this.turnTowards(q, g.x, g.y, W.turn);
      } else if (q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < 200) q.tx = q.ty = null;
        else this.turnTowards(q, q.tx, q.ty, W.turn);
      }
    } else if (q.k === "torp") {
      q.v = Math.min(W.speed, q.v + 8 * DT);
      let goal = null;
      if (q.target) {
        const t = this.players.get(q.target);
        if (t) goal = this.leadPoint(q, t.b);
        else q.target = 0;
      }
      if (!goal && q.tx !== null) {
        if (Math.hypot(q.tx - q.x, q.ty - q.y) < 120) q.tx = q.ty = null;
        else goal = { x: q.tx, y: q.ty };
      }
      if (!goal && q.tx === null && !q.target && !q.decoy) {
        const t = this.seekNaval(q, W.seekerRange, W.seekerCone);
        if (t) {
          q.target = t.id;
          goal = this.leadPoint(q, t.b);
        }
      }
      if (goal) this.turnTowards(q, goal.x, goal.y, W.turn);
      // Tiefe: auf die Tiefe des Ziels (U-Boot) oder 20 m
      const tz = q.target ? Math.min(-8, this.players.get(q.target)?.b.z ?? -20) : -20;
      q.z += clamp(tz - q.z, -6 * DT, 6 * DT);
    } else if (q.k === "bomb") {
      // Lenkbombe: fällt (verstärkte Schwerkraft), gleitet zum Ziel
      const g = 29;
      q.vz += g * DT;
      q.z -= q.vz * DT;
      const t = q.target ? this.players.get(q.target) : null;
      const goal = t ? t.b : q.tx !== null ? { x: q.tx, y: q.ty } : null;
      if (goal) {
        this.turnTowards(q, goal.x, goal.y, W.turn * 2);
        // Gleitsteuerung: Vorwärtsfahrt so anpassen, dass die Bombe beim Aufschlag am Ziel ist
        const tImp = (-q.vz + Math.sqrt(q.vz * q.vz + 2 * g * Math.max(0, q.z))) / g;
        const want = clamp(Math.hypot(goal.x - q.x, goal.y - q.y) / Math.max(0.3, tImp), 0, 260);
        q.v += clamp(want - q.v, -40 * DT, 25 * DT);
      }
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
        tgt = h && !this.flaresOn(h) && !h.landed ? h.b : null;
        if (!tgt) q.air = 0;
      }
      if (!tgt) {
        q.target = 0;
        q.air = 0;
        let bestD = W.seekerRange;
        for (const o of this.projectiles) {
          if (W.airOnly || !INTERCEPTABLE.has(o.type) || o.team === q.team || o.dead || o.z > W.ceiling) continue;
          const d = Math.hypot(o.x - q.x, o.y - q.y);
          if (d < bestD) {
            bestD = d;
            tgt = o;
            q.target = o.id;
          }
        }
        for (const p of this.players.values()) {
          const pd = BOATS[p.type];
          if (p.team === q.team || !isAir(pd) || this.flaresOn(p) || (p.b.z || 0) > W.ceiling || p.landed) continue;
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
    if (q.k === "sam" || q.k === "aam") {
      let tz = q.k === "aam" ? q.z : ALTITUDE.seaSkim;
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

    // Luft-Luft-Treffer
    if (q.k === "aam" && q.air) {
      const h = this.players.get(q.air);
      if (h && segDist(h.b.x, h.b.y, px, py, q.x, q.y) < BOATS[h.type].hitRadius + 4 && Math.abs((h.b.z || 0) - q.z) < 60) {
        this.events.push(["intercept", h.b.x, h.b.y]);
        this.damage(h, W.damage, owner);
        return false;
      }
    }
    // Torpedos: Schiffe und U-Boote (in passender Tiefe)
    if (q.k === "torp") {
      for (const p of this.players.values()) {
        if (p.team === q.team) continue;
        const def = BOATS[p.type];
        if (def.kind !== "ship" && !isSub(def)) continue;
        if (isSub(def) && Math.abs((p.b.z || 0) - q.z) > 80) continue;
        if (Math.abs(p.b.x - q.x) > def.length + step || Math.abs(p.b.y - q.y) > def.length + step) continue;
        for (const cc of boatCircles(p.b, def)) {
          if (segDist(cc.x, cc.y, px, py, q.x, q.y) < cc.r + 1) {
            this.events.push(["torphit", q.x, q.y]);
            this.damage(p, W.damage, owner);
            return false;
          }
        }
      }
      if (isOnLand(this.map, q.x, q.y)) {
        this.events.push(["hit", q.x, q.y]);
        return false;
      }
    }
    // Lenkbombe: Einschlag auf dem Wasser/an Land, Wirkung im Umkreis
    if (q.k === "bomb" && q.z <= 0) {
      let hitAny = false;
      for (const p of this.players.values()) {
        if (p.team === q.team) continue;
        const def = BOATS[p.type];
        if (def.kind !== "ship" && !(isSub(def) && (p.b.z || 0) > DEPTH.surface)) continue;
        let d = Infinity;
        for (const cc of boatCircles(p.b, def)) d = Math.min(d, Math.hypot(cc.x - q.x, cc.y - q.y) - cc.r);
        if (d < W.radius) {
          this.damage(p, W.damage * (d < 5 ? 1 : 0.6), owner);
          hitAny = true;
        }
      }
      this.events.push([hitAny || isOnLand(this.map, q.x, q.y) ? "bighit" : "splash", q.x, q.y]);
      return false;
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
    if (q.k === "gun" || q.k === "mg" || q.k === "jgun") {
      for (const p of this.players.values()) {
        const def = BOATS[p.type];
        if (p.team === q.team || !isAir(def) || p.landed) continue;
        // Schussweite nach oben: Gipfelhöhe der Waffe (vom Hubschrauber aus zählt der Höhenunterschied)
        const dz = Math.abs((p.b.z || 0) - (q.z || 0));
        if (dz > (W.ceiling || 1000)) continue;
        if (segDist(p.b.x, p.b.y, px, py, q.x, q.y) < def.hitRadius) {
          this.events.push(["hit", q.x, q.y]);
          this.damage(p, q.k === "gun" ? W.damage * 1.5 : q.k === "jgun" ? W.airDamage : W.heliDamage, owner);
          return false;
        }
      }
    }

    // Treffer an Schiffen (Flugabwehr fliegt über Schiffe hinweg, wenn sie ein Luftziel jagt)
    if (!(q.k === "sam" && (q.target || q.air)) && q.k !== "aam" && q.k !== "torp" && q.k !== "bomb" && ((q.z || 0) < ALTITUDE.hitShip || q.k === "gun" || q.k === "mg" || (q.k === "jgun" && q.z < 800))) {
      for (const p of this.players.values()) {
        if (p.team === q.team) continue;
        const def = BOATS[p.type];
        // Überwasser: Schiffe und aufgetauchte U-Boote
        if (def.kind !== "ship" && !(isSub(def) && (p.b.z || 0) > DEPTH.surface)) continue;
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

    if ((q.k === "gun" || q.k === "mg" || q.k === "jgun" || q.k === "ssm" || q.k === "rkt") && (q.k !== "jgun" || q.z < 50) && isOnLand(this.map, q.x, q.y)) {
      this.events.push([q.k === "gun" || q.k === "mg" || q.k === "jgun" ? "dirt" : q.k === "rkt" ? "hit" : "bighit", q.x, q.y]);
      return false;
    }
    const half = WORLD_SIZE / 2;
    if (q.dist >= q.range || Math.abs(q.x) > half || Math.abs(q.y) > half) {
      this.events.push([q.k === "sam" || q.k === "aam" ? "air" : q.k === "mg" || q.k === "jgun" ? "spray" : q.k === "torp" ? "torpend" : "splash", q.x, q.y]);
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

  // Suchkopf für Luft-Luft: nächstes gegnerisches Luftfahrzeug im Kegel um Richtung dir
  seekAir(q, dir, range, cone) {
    let best = null;
    let bestD = range;
    for (const p of this.players.values()) {
      if (p.team === q.team || !isAir(BOATS[p.type]) || p.landed) continue;
      const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
      if (d > bestD) continue;
      if (Math.abs(wrapAngle(Math.atan2(p.b.y - q.y, p.b.x - q.x) - dir)) > cone) continue;
      bestD = d;
      best = p;
    }
    return best;
  }

  // Suchkopf für Torpedos: Schiffe und U-Boote
  seekNaval(q, range, cone) {
    let best = null;
    let bestD = range;
    for (const p of this.players.values()) {
      const k = BOATS[p.type].kind;
      if (p.team === q.team || (k !== "ship" && k !== "sub")) continue;
      const d = Math.hypot(p.b.x - q.x, p.b.y - q.y);
      if (d > bestD) continue;
      if (Math.abs(wrapAngle(Math.atan2(p.b.y - q.y, p.b.x - q.x) - q.h)) > cone) continue;
      bestD = d;
      best = p;
    }
    return best;
  }

  // Suchkopf für Seezielflugkörper: Schiffe und aufgetauchte U-Boote
  seekShip(q, range, cone) {
    let best = null;
    let bestD = range;
    for (const p of this.players.values()) {
      const pd = BOATS[p.type];
      if (p.team === q.team || !(pd.kind === "ship" || (isSub(pd) && (p.b.z || 0) > DEPTH.surface))) continue;
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

  damage(p, dmg, attacker, force = false) {
    if (p.hp <= 0) return;
    if (!force) {
      if (p.protect > 0) return;
      if (inRect(harborRect(teamBase(p.team)), p.b.x, p.b.y)) return; // sicherer Hafen
      if (inRect(airfieldRect(p.team), p.b.x, p.b.y)) return; // eigenes Flugfeld
    }
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
    this.stat(p, "deaths");
    if (by) {
      by.kills++;
      this.stat(by, "kills");
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
