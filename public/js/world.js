// Kontinente links (Maiskolbistan) und rechts (Paprikistan), Stützpunkte der Frontkarte, Frontkarte im Menü.
import { WORLD_SIZE, CONTINENT, BASE_LAYOUT, TEAMS, teamBase, coastX, coastLocal, mulberry32, islandRadius } from "../shared/sim.js";

const HALF = WORLD_SIZE / 2;
const EXT = 4000; // über den Kartenrand hinaus zeichnen
const NEUTRAL = "#dfe6ea";
const ownColor = (own) => (own === 0 ? TEAMS[0].color : own === 1 ? TEAMS[1].color : NEUTRAL);

// ---------- Kontinente ----------

function coastPath(team, offset) {
  const p = new Path2D();
  const dir = teamBase(team).dir;
  const back = team === 0 ? -HALF - EXT : HALF + EXT;
  p.moveTo(back, -HALF - EXT);
  for (let y = -HALF - EXT; y <= HALF + EXT; y += 20) p.lineTo(coastX(team, y) + dir * offset, y);
  p.lineTo(back, HALF + EXT);
  p.closePath();
  return p;
}

const LAYERS = [0, 1].map((team) => ({
  deep: coastPath(team, 150),
  shallow: coastPath(team, 55),
  surf: coastPath(team, 5),
  sand: coastPath(team, 0),
  grass: coastPath(team, -28),
}));

// Deko auf dem Land (deterministisch): Felder, Wälder, Orte
function onContinent(team, x, y, inset = 40) {
  const b = teamBase(team);
  const local = (x - b.edge) * b.dir;
  if (local > coastLocal(team, y) - inset) return false;
  // Basisgelände frei lassen
  if (local > -40 && Math.abs(y) < BASE_LAYOUT.landHalf + 40) return false;
  return true;
}

const DECOR = [0, 1].map((team) => {
  const rnd = mulberry32(900 + team);
  const b = teamBase(team);
  const pos = () => {
    for (let i = 0; i < 50; i++) {
      const local = -CONTINENT.depth + rnd() * (CONTINENT.depth + 650);
      const y = (rnd() * 2 - 1) * (HALF + 600);
      const x = b.edge + b.dir * local;
      if (onContinent(team, x, y)) return { x, y };
    }
    return null;
  };
  const fields = [];
  for (let i = 0; i < 70; i++) {
    const p = pos();
    if (p) fields.push({ ...p, w: 120 + rnd() * 180, h: 70 + rnd() * 120, a: (rnd() - 0.5) * 0.6, k: rnd() });
  }
  const trees = [];
  for (let c = 0; c < 45; c++) {
    const p = pos();
    if (!p) continue;
    const n = 8 + Math.floor(rnd() * 18);
    for (let i = 0; i < n; i++) {
      const x = p.x + (rnd() - 0.5) * 220;
      const y = p.y + (rnd() - 0.5) * 220;
      if (onContinent(team, x, y)) trees.push({ x, y, r: 6 + rnd() * 9, s: rnd() });
    }
  }
  const towns = [];
  for (let i = 0; i < 9; i++) {
    const p = pos();
    if (!p) continue;
    const houses = [];
    const n = 14 + Math.floor(rnd() * 20);
    for (let k = 0; k < n; k++) {
      const x = p.x + (rnd() - 0.5) * 260;
      const y = p.y + (rnd() - 0.5) * 260;
      if (onContinent(team, x, y)) houses.push({ x, y, w: 10 + rnd() * 14, h: 8 + rnd() * 10, a: rnd() < 0.5 ? 0 : Math.PI / 2, c: rnd() });
    }
    towns.push({ ...p, houses });
  }
  return { fields, trees, towns };
});

function visible(view, x, y, r) {
  return x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;
}

export function drawContinents(ctx, view, t) {
  for (const team of [0, 1]) {
    // Sichtprüfung: Küste in der Nähe?
    const cx = coastX(team, (view.y0 + view.y1) / 2);
    if (team === 0 && view.x0 > cx + 600) continue;
    if (team === 1 && view.x1 < cx - 600) continue;
    const L = LAYERS[team];
    ctx.fillStyle = "rgba(40,120,160,0.35)";
    ctx.fill(L.deep);
    ctx.fillStyle = "rgba(70,170,190,0.55)";
    ctx.fill(L.shallow);
    ctx.strokeStyle = `rgba(255,255,255,${0.45 + Math.sin(t * 1.3 + team) * 0.15})`;
    ctx.lineWidth = 3;
    ctx.stroke(L.surf);
    ctx.fillStyle = "#e3d39a";
    ctx.fill(L.sand);
    ctx.fillStyle = team === 0 ? "#6c9c4c" : "#7a9a4a";
    ctx.fill(L.grass);
    const D = DECOR[team];
    // Felder: Mais (Maiskolbistan) bzw. Paprika (Paprikistan)
    for (const f of D.fields) {
      if (!visible(view, f.x, f.y, 260)) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.a);
      if (team === 0) {
        ctx.fillStyle = f.k < 0.7 ? "#a3b03e" : "#c7b35a";
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        ctx.strokeStyle = "#e8c53a";
        ctx.lineWidth = 2.2;
        for (let y = -f.h / 2 + 3; y < f.h / 2; y += 6) {
          ctx.beginPath();
          ctx.moveTo(-f.w / 2, y);
          ctx.lineTo(f.w / 2, y);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = f.k < 0.6 ? "#557f37" : "#7b8b3d";
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
        for (let y = -f.h / 2 + 3; y < f.h / 2; y += 7) {
          ctx.strokeStyle = "#3f6b2a";
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-f.w / 2, y);
          ctx.lineTo(f.w / 2, y);
          ctx.stroke();
          // reife Schoten: rote, orange und gelbe Punkte
          ctx.fillStyle = ["#d7261e", "#f28c1b", "#e8c42a"][Math.floor(Math.abs(y * 7 + f.k * 10)) % 3];
          for (let x = -f.w / 2 + 4; x < f.w / 2; x += 9) ctx.fillRect(x, y - 1, 2.2, 2.2);
        }
      }
      ctx.strokeStyle = "rgba(60,50,30,0.35)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
    }
    // Orte
    for (const town of D.towns) {
      if (!visible(view, town.x, town.y, 200)) continue;
      ctx.strokeStyle = "#8d8f8c";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(town.x - 150, town.y);
      ctx.lineTo(town.x + 150, town.y);
      ctx.moveTo(town.x, town.y - 150);
      ctx.lineTo(town.x, town.y + 150);
      ctx.stroke();
      for (const hs of town.houses) {
        ctx.save();
        ctx.translate(hs.x, hs.y);
        ctx.rotate(hs.a);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(-hs.w / 2 + 2, -hs.h / 2 + 2, hs.w, hs.h);
        ctx.fillStyle = team === 0 ? (hs.c < 0.6 ? "#b5523f" : "#8e3b2f") : hs.c < 0.6 ? "#9a9fa5" : "#c7b9a0";
        ctx.fillRect(-hs.w / 2, -hs.h / 2, hs.w, hs.h);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-hs.w / 2, 0);
        ctx.lineTo(hs.w / 2, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (const tr of D.trees) {
      if (!visible(view, tr.x, tr.y, 20)) continue;
      ctx.fillStyle = "rgba(20,40,15,0.35)";
      ctx.beginPath();
      ctx.arc(tr.x + 2.5, tr.y + 3, tr.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tr.s > 0.5 ? "#2f6b2c" : "#3b7a33";
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawContinentsMinimap(g, toM, s) {
  for (const team of [0, 1]) {
    g.save();
    g.setTransform(s, 0, 0, s, toM(0), toM(0));
    g.fillStyle = "rgba(120,200,210,0.45)";
    g.fill(LAYERS[team].shallow);
    g.fillStyle = "#d9c98e";
    g.fill(LAYERS[team].sand);
    g.fillStyle = team === 0 ? "#6c9c4c" : "#7a9a4a";
    g.fill(LAYERS[team].grass);
    g.restore();
  }
}

// ---------- Stützpunkte ----------

export function drawOutposts(ctx, view, t, map, front, zoom) {
  for (const o of map.outposts) {
    if (!visible(view, o.x, o.y, o.r + 40)) continue;
    const own = front ? front[0][o.id] : -1;
    const prog = front ? front[1][o.id] : 0;
    const col = ownColor(own);
    // Zone
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 4;
    ctx.setLineDash([24, 18]);
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Eroberungsfortschritt als Ring
    if (Math.abs(prog) > 0 && Math.abs(prog) < 100) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = prog < 0 ? TEAMS[0].color : TEAMS[1].color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r + 14, -Math.PI / 2, -Math.PI / 2 + (Math.abs(prog) / 100) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Radarstation auf der Insel
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-14, -10, 34, 26);
    ctx.fillStyle = "#b9b4a6";
    ctx.fillRect(-18, -14, 34, 26);
    ctx.strokeStyle = "#6d685e";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-18, -14, 34, 26);
    ctx.fillStyle = "#7d8287";
    ctx.beginPath();
    ctx.arc(-1, -1, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(-1, -1);
    ctx.rotate(own >= 0 ? t * 1.8 + o.id : 0.6);
    ctx.fillStyle = "#e9eef0";
    ctx.fillRect(-2, -12, 4, 24);
    ctx.restore();
    // Flagge des Besitzers (neutral: weiß)
    ctx.translate(26, -18);
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    const f = own >= 0 ? TEAMS[own].flag : { dir: "vertical", colors: ["#f2f2f2", "#f2f2f2", "#f2f2f2"] };
    const L = 22;
    const W = 13;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = f.colors[i];
      for (let k = 0; k < 8; k++) {
        const u0 = k / 8;
        const wv = Math.sin(t * 4 + o.id - u0 * 4) * 2 * u0;
        if (f.dir === "vertical") {
          if (u0 < i / 3 || u0 >= (i + 1) / 3) continue;
          ctx.fillRect(-u0 * L - L / 8, -W / 2 + wv, L / 8 + 0.5, W);
        } else ctx.fillRect(-u0 * L - L / 8, -W / 2 + (i * W) / 3 + wv, L / 8 + 0.5, W / 3 + 0.5);
      }
    }
    ctx.restore();
    // Name (gleich groß auf dem Bildschirm)
    ctx.save();
    ctx.translate(o.x, o.y + 34 + 6 / zoom);
    ctx.scale(1 / zoom, 1 / zoom);
    ctx.font = "800 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    const label = `⚑ ${o.name}`;
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = col;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

export function drawOutpostsMinimap(g, toM, map, front, t) {
  for (const o of map.outposts) {
    const own = front ? front[0][o.id] : -1;
    const prog = front ? front[1][o.id] : 0;
    const x = toM(o.x);
    const y = toM(o.y);
    g.fillStyle = ownColor(own);
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y - 5);
    g.lineTo(x + 5, y);
    g.lineTo(x, y + 5);
    g.lineTo(x - 5, y);
    g.closePath();
    g.fill();
    g.stroke();
    if (Math.abs(prog) > 0 && Math.abs(prog) < 100 && Math.sin(t * 6) > 0) {
      g.strokeStyle = prog < 0 ? TEAMS[0].color : TEAMS[1].color;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

// ---------- Frontkarte (Menü) ----------

export function drawFrontMap(c, map, front, myTeam) {
  const g = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#14507e";
  g.fillRect(0, 0, W, H);
  const s = Math.min(W, H) / WORLD_SIZE;
  const ox = W / 2;
  const oy = H / 2;
  g.save();
  g.translate(ox, oy);
  g.scale(s, s);
  for (const team of [0, 1]) {
    g.fillStyle = team === 0 ? "#6c9c4c" : "#7a9a4a";
    g.fill(LAYERS[team].sand);
  }
  g.fillStyle = "#5e9a4a";
  for (const isl of map.islands) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = islandRadius(isl, a);
      g.lineTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r);
    }
    g.fill();
  }
  // Basen
  for (const team of [0, 1]) {
    const b = teamBase(team);
    g.fillStyle = TEAMS[team].color;
    g.beginPath();
    g.arc(b.edge + b.dir * 500, 0, 180, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  for (const team of [0, 1]) {
    const b = teamBase(team);
    const x = ox + (b.edge + b.dir * 500) * s;
    g.font = "700 10px system-ui, sans-serif";
    g.textAlign = team === 0 ? "left" : "right";
    g.fillStyle = "#fff";
    g.fillText(team === myTeam ? "Heimathafen" : "Feindbasis", x + (team === 0 ? 10 : -10), oy + 3);
  }
  // Stützpunkte
  for (const o of map.outposts) {
    const own = front ? front[0][o.id] : -1;
    const x = ox + o.x * s;
    const y = oy + o.y * s;
    g.fillStyle = ownColor(own);
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y - 7);
    g.lineTo(x + 7, y);
    g.lineTo(x, y + 7);
    g.lineTo(x - 7, y);
    g.closePath();
    g.fill();
    g.stroke();
    g.font = "600 9px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.fillText(o.name, x, y + 17);
  }
}

export function frontCounts(front, n) {
  const c = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const own = front ? front[0][i] : -1;
    c[own === 0 ? 0 : own === 1 ? 1 : 2]++;
  }
  return c;
}
