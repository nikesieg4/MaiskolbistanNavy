// Weitere Kriegsschiffe in Draufsicht (Meter, Bug = +x, Steuerbord = +y).
// Maiskolbistan (deutsch/europäisch): Korvette Braunschweig (K130), Fregatte Sachsen (F124).
// Paprikistan (amerikanisch): Patrouillenboot Cyclone (PC-1), LCS Independence (Trimaran), Zerstörer Arleigh Burke.
// Bewegliche Teile: drehende Radarantennen, Geschütz folgt dem Ziel, Flugabwehrstarter schwenken,
// abgefeuerte Starter sind leer, Flagge weht.

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

// ---------- Baukasten ----------

// Rumpf: spitzer Bug, gerades Heck. bowStart = ab wo der Rumpf zuläuft (Anteil der Länge vom Heck)
export function hullPath(ctx, L, B, inset = 0, bowStart = 0.62, sternW = 0.9) {
  const hl = L / 2 - inset;
  const b = B / 2 - inset;
  const xs = -L / 2 + L * bowStart;
  ctx.beginPath();
  ctx.moveTo(-hl, -b * sternW);
  ctx.lineTo(xs, -b);
  ctx.bezierCurveTo(xs + (hl - xs) * 0.55, -b, hl - (hl - xs) * 0.12, -b * 0.35, hl, 0);
  ctx.bezierCurveTo(hl - (hl - xs) * 0.12, b * 0.35, xs + (hl - xs) * 0.55, b, xs, b);
  ctx.lineTo(-hl, b * sternW);
  ctx.closePath();
}

function drawHull(ctx, L, B, o = {}) {
  ctx.save();
  ctx.translate(L * 0.008, B * 0.1);
  ctx.fillStyle = "rgba(0,20,40,0.35)";
  hullPath(ctx, L, B, -0.3, o.bowStart, o.sternW);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = o.side || "#4c565e";
  hullPath(ctx, L, B, 0, o.bowStart, o.sternW);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -B / 2, 0, B / 2);
  g.addColorStop(0, o.deckHi || "#8a949c");
  g.addColorStop(0.5, o.deck || "#7b858d");
  g.addColorStop(1, o.deckLo || "#6b757d");
  ctx.fillStyle = g;
  hullPath(ctx, L, B, Math.max(0.35, B * 0.04), o.bowStart, o.sternW);
  ctx.fill();
  // Plattenfugen und rutschfeste Decksfelder
  ctx.save();
  hullPath(ctx, L, B, 0.4, o.bowStart, o.sternW);
  ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.07)";
  ctx.fillRect(-L / 2, -B * 0.32, L, B * 0.64);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-L / 2, -B * 0.36);
  ctx.lineTo(L / 2, -B * 0.36);
  ctx.moveTo(-L / 2, B * 0.36);
  ctx.lineTo(L / 2, B * 0.36);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 0.08;
  for (let x = -L / 2; x < L / 2; x += 2) {
    ctx.beginPath();
    ctx.moveTo(x, -B);
    ctx.lineTo(x, B);
    ctx.stroke();
  }
  ctx.restore();
  // Reling
  ctx.strokeStyle = "rgba(220,228,232,0.6)";
  ctx.lineWidth = 0.08;
  hullPath(ctx, L, B, 0.25, o.bowStart, o.sternW);
  ctx.stroke();
}

// Aufbau-Block mit Schatten und Dachdetails
function block(ctx, x0, x1, hw, o = {}) {
  const c = o.color || "#a9b2b8";
  const tf = o.taperFront ?? 0.3; // Schräge vorn (Anteil der Breite)
  const tb = o.taperBack ?? 0;
  // Schattenwurf: Länge nach Höhe des Aufbaus, weich in zwei Stufen
  const sh = o.height ?? Math.min(4, 1 + hw * 0.4);
  for (const [k, al] of [[1, 0.16], [0.6, 0.14]]) {
    const dx = sh * 0.5 * k;
    const dy = sh * 0.8 * k;
    ctx.fillStyle = `rgba(0,10,20,${al})`;
    ctx.beginPath();
    ctx.moveTo(x0 + dx, -hw + dy);
    ctx.lineTo(x1 - hw * tf + dx, -hw + dy);
    ctx.lineTo(x1 + dx, dy);
    ctx.lineTo(x1 - hw * tf + dx, hw + dy);
    ctx.lineTo(x0 + dx, hw + dy);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, -hw, 0, hw);
  g.addColorStop(0, o.hi || "#c6cdd2");
  g.addColorStop(0.5, c);
  g.addColorStop(1, o.lo || "#8b949a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0 + hw * tb, -hw);
  ctx.lineTo(x1 - hw * tf, -hw);
  ctx.lineTo(x1, -hw * (1 - tf * 1.4 < 0 ? 0 : 1 - tf * 1.4));
  ctx.lineTo(x1, hw * (1 - tf * 1.4 < 0 ? 0 : 1 - tf * 1.4));
  ctx.lineTo(x1 - hw * tf, hw);
  ctx.lineTo(x0 + hw * tb, hw);
  ctx.lineTo(x0, hw * (tb ? 0.6 : 1));
  ctx.lineTo(x0, -hw * (tb ? 0.6 : 1));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.1;
  ctx.stroke();
  // Kantenlicht (Steuerbord oben = Lichtseite) und Schattenkante
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  ctx.moveTo(x0 + hw * tb, -hw + 0.12);
  ctx.lineTo(x1 - hw * tf, -hw + 0.12);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(x0 + hw * tb, hw - 0.12);
  ctx.lineTo(x1 - hw * tf, hw - 0.12);
  ctx.stroke();
  if (o.plain) return;
  roofDetails(ctx, x0, x1 - hw * tf, hw);
}

// Dachausrüstung: Lüftergitter, Luken, Antennenfüße, Rettungsinseln (deterministisch je Block)
function roofDetails(ctx, x0, x1, hw) {
  let seed = Math.floor((x0 * 7.31 + x1 * 3.17 + hw * 11.7) * 1000) >>> 0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const len = x1 - x0;
  const n = Math.max(2, Math.floor(len / 4));
  for (let i = 0; i < n; i++) {
    const x = x0 + 1 + rnd() * (len - 2.5);
    const y = (rnd() * 2 - 1) * (hw - 1.4);
    const k = rnd();
    if (k < 0.35) {
      // Lüftergitter
      ctx.fillStyle = "#5c656b";
      ctx.fillRect(x, y - 0.5, 1.4, 1.0);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 0.05;
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.moveTo(x + 0.2 + j * 0.3, y - 0.45);
        ctx.lineTo(x + 0.2 + j * 0.3, y + 0.45);
        ctx.stroke();
      }
    } else if (k < 0.6) {
      // Luke
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.roundRect(x + 0.08, y - 0.42, 1.0, 0.9, 0.15);
      ctx.fill();
      ctx.fillStyle = "#9aa3a9";
      ctx.beginPath();
      ctx.roundRect(x, y - 0.5, 1.0, 0.9, 0.15);
      ctx.fill();
    } else if (k < 0.8) {
      // Peitschenantenne / Antennenfuß mit Schattenstrich
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1.6, y + 1.2);
      ctx.stroke();
      ctx.fillStyle = "#30363a";
      ctx.beginPath();
      ctx.arc(x, y, 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Kabelkanal
      ctx.fillStyle = "rgba(60,66,70,0.6)";
      ctx.fillRect(x, y - 0.12, Math.min(3.5, len * 0.3), 0.24);
    }
  }
}

function windows(ctx, x, hw, n = 6) {
  ctx.fillStyle = "#1f3b52";
  ctx.fillRect(x - 0.5, -hw * 0.8, 0.5, hw * 1.6);
  ctx.strokeStyle = "rgba(120,170,200,0.6)";
  ctx.lineWidth = 0.05;
  for (let i = 1; i < n; i++) {
    const y = -hw * 0.8 + (hw * 1.6 * i) / n;
    ctx.beginPath();
    ctx.moveTo(x - 0.5, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

// Geschütztürme. kind: "76" Kuppel, "57" Tarnkappe, "127" Mk 45 Mod 4, "25" offene Lafette
function gun(ctx, x, y, angle, kind) {
  ctx.save();
  ctx.translate(x, y);
  const s = kind === "127" ? 1.35 : kind === "57" ? 0.95 : kind === "25" ? 0.55 : 1;
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  circle(ctx, 0.3, 0.35, 2.3);
  ctx.fill();
  ctx.fillStyle = "#6b757d";
  circle(ctx, 0, 0, 2.1);
  ctx.fill();
  ctx.rotate(angle);
  const len = kind === "127" ? 6.2 : kind === "25" ? 4 : 4.8;
  const bg = ctx.createLinearGradient(0, -0.17, 0, 0.17);
  bg.addColorStop(0, "#6b747a");
  bg.addColorStop(0.5, "#3f474d");
  bg.addColorStop(1, "#2a3034");
  ctx.fillStyle = bg;
  rr(ctx, 1.2, -0.17, len, 0.34, 0.12);
  ctx.fill();
  ctx.fillStyle = "#2c3236";
  rr(ctx, 1.2 + len - 0.6, -0.22, 0.6, 0.44, 0.12);
  ctx.fill();
  const g = ctx.createLinearGradient(-2, -1.7, 1.5, 1.7);
  g.addColorStop(0, "#c8d0d5");
  g.addColorStop(1, "#7f898f");
  ctx.fillStyle = g;
  ctx.beginPath();
  if (kind === "57" || kind === "127") {
    // facettierte Tarnkappenhaube
    ctx.moveTo(2.3, -0.7);
    ctx.lineTo(2.3, 0.7);
    ctx.lineTo(0.6, 1.6);
    ctx.lineTo(-2.0, 1.6);
    ctx.lineTo(-2.3, 0);
    ctx.lineTo(-2.0, -1.6);
    ctx.lineTo(0.6, -1.6);
  } else if (kind === "25") {
    ctx.roundRect(-1.4, -1.2, 2.6, 2.4, 0.4);
  } else {
    ctx.moveTo(1.9, -0.75);
    ctx.quadraticCurveTo(2.1, 0, 1.9, 0.75);
    ctx.lineTo(0.6, 1.55);
    ctx.quadraticCurveTo(-1.4, 1.75, -2.1, 1.0);
    ctx.quadraticCurveTo(-2.45, 0, -2.1, -1.0);
    ctx.quadraticCurveTo(-1.4, -1.75, 0.6, -1.55);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.moveTo(0.3, -1.4);
  ctx.lineTo(0.3, 1.4);
  ctx.stroke();
  // Glanzlicht
  const hl = ctx.createRadialGradient(-0.8, -0.7, 0, -0.8, -0.7, 1.3);
  hl.addColorStop(0, "rgba(255,255,255,0.45)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.arc(-0.8, -0.7, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Drehende Radarantenne (Balken)
function radarBar(ctx, x, y, len, angle, w = 0.6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#59636a";
  circle(ctx, 0, 0, w * 1.1);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, -w / 2 + 0.25, -len / 2 + 0.25, w, len, w / 2);
  ctx.fill();
  ctx.fillStyle = "#e1e6e9";
  rr(ctx, -w / 2, -len / 2, w, len, w / 2);
  ctx.fill();
  ctx.fillStyle = "#9aa4aa";
  rr(ctx, -w / 2, -len / 2, w * 0.35, len, w / 4);
  ctx.fill();
  // Strahlerelemente
  ctx.strokeStyle = "rgba(60,70,78,0.45)";
  ctx.lineWidth = 0.04;
  for (let yy = -len / 2 + 0.3; yy < len / 2; yy += 0.3) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, yy);
    ctx.lineTo(w / 2, yy);
    ctx.stroke();
  }
  ctx.fillStyle = "#3d454a";
  circle(ctx, 0, 0, w * 0.5);
  ctx.fill();
  ctx.restore();
}

// Feste Radarflächen (Phased Array) an den vier Ecken eines Deckhauses
function arrayFaces(ctx, x, hw, color = "#30383d") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 1.6, -hw);
  ctx.lineTo(x + 3.2, -hw + 1.6);
  ctx.moveTo(x + 1.6, hw);
  ctx.lineTo(x + 3.2, hw - 1.6);
  ctx.moveTo(x - 1.6, -hw);
  ctx.lineTo(x - 3.2, -hw + 1.6);
  ctx.moveTo(x - 1.6, hw);
  ctx.lineTo(x - 3.2, hw - 1.6);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// Gittermast
function mast(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  // Schatten des Mastes
  ctx.strokeStyle = "rgba(0,10,20,0.18)";
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(4 * s, 6.5 * s);
  ctx.stroke();
  ctx.strokeStyle = "#4b5459";
  ctx.lineWidth = 0.12 * s;
  ctx.strokeRect(-1 * s, -1 * s, 2 * s, 2 * s);
  ctx.beginPath();
  ctx.moveTo(-1 * s, -1 * s);
  ctx.lineTo(1 * s, 1 * s);
  ctx.moveTo(1 * s, -1 * s);
  ctx.lineTo(-1 * s, 1 * s);
  ctx.stroke();
  ctx.fillStyle = "#59636a";
  rr(ctx, -0.2 * s, -3 * s, 0.4 * s, 6 * s, 0.15);
  ctx.fill();
  ctx.restore();
}

// VLS-Deckel-Raster
function vls(ctx, x, y, cols, rows, cell = 1.25) {
  const w = cols * cell;
  const h = rows * cell;
  ctx.fillStyle = "#5d666c";
  rr(ctx, x - w / 2 - 0.3, y - h / 2 - 0.3, w + 0.6, h + 0.6, 0.3);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.06;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#717b81" : "#6a747a";
      ctx.fillRect(x - w / 2 + i * cell + 0.08, y - h / 2 + j * cell + 0.08, cell - 0.16, cell - 0.16);
      ctx.strokeRect(x - w / 2 + i * cell + 0.08, y - h / 2 + j * cell + 0.08, cell - 0.16, cell - 0.16);
    }
  }
}

// Seezielflugkörper-Starter (Behälter). cells: [{x,y,a}], loaded: Bool-Liste
function canisters(ctx, cells, loaded, len = 5.2, wid = 0.75) {
  cells.forEach((c, i) => {
    const full = !loaded || loaded[i];
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    rr(ctx, -len + 0.2, -wid / 2 + 0.25, len, wid, 0.15);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
    g.addColorStop(0, "#9aa3a9");
    g.addColorStop(1, "#666f75");
    ctx.fillStyle = g;
    rr(ctx, -len, -wid / 2, len, wid, 0.15);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    for (const bx of [-len * 0.75, -len * 0.45, -len * 0.15]) {
      ctx.beginPath();
      ctx.moveTo(bx, -wid / 2);
      ctx.lineTo(bx, wid / 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-len, -wid / 2 + 0.05, len, wid * 0.18);
    ctx.fillStyle = full ? "#3f474c" : "#121416";
    rr(ctx, -0.35, -wid / 2 + 0.06, 0.35, wid - 0.12, 0.08);
    ctx.fill();
    ctx.restore();
  });
}

// RAM/SeaRAM/Stinger-Starter (schwenkt)
function samLauncher(ctx, x, y, angle, s = 1, sea = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#6c757b";
  circle(ctx, 0, 0, 1.7);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, -1.0, -0.95, 2.6, 2.1, 0.25);
  ctx.fill();
  ctx.fillStyle = "#b4bcc1";
  rr(ctx, -1.2, -1.05, 2.6, 2.1, 0.25);
  ctx.fill();
  if (sea) {
    // SeaRAM: eigenes Radar-Kuppelchen oben auf dem Starter
    ctx.fillStyle = "#eef1f2";
    circle(ctx, -0.5, 0, 0.75);
    ctx.fill();
  }
  ctx.fillStyle = "#23282b";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    ctx.beginPath();
    ctx.arc(0.75 + r * 0.18, -0.75 + c * 0.36 + (r % 2 ? 0.18 : 0), 0.1, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function helideck(ctx, x0, x1, hw) {
  ctx.fillStyle = "#59636a";
  ctx.fillRect(x0, -hw, x1 - x0, hw * 2);
  ctx.strokeStyle = "rgba(240,240,240,0.8)";
  ctx.lineWidth = 0.25;
  ctx.strokeRect(x0 + 0.6, -hw + 0.6, x1 - x0 - 1.2, hw * 2 - 1.2);
  const cx = (x0 + x1) / 2;
  const r = Math.min((x1 - x0) / 2, hw) * 0.65;
  ctx.strokeStyle = "rgba(240,200,60,0.9)";
  ctx.lineWidth = 0.3;
  circle(ctx, cx, 0, r);
  ctx.stroke();
  ctx.fillStyle = "rgba(240,240,240,0.85)";
  const h = r * 0.6;
  ctx.fillRect(cx - h * 0.5, -h * 0.5, h * 0.18, h);
  ctx.fillRect(cx + h * 0.32, -h * 0.5, h * 0.18, h);
  ctx.fillRect(cx - h * 0.5, -0.09 * h, h, 0.18 * h);
}

function funnel(ctx, x, y, w, h) {
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  rr(ctx, x - w / 2 + 0.4, y - h / 2 + 0.6, w, h, 0.6);
  ctx.fill();
  ctx.fillStyle = "#7d868c";
  rr(ctx, x - w / 2, y - h / 2, w, h, 0.6);
  ctx.fill();
  ctx.fillStyle = "#1a1d1f";
  rr(ctx, x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1, 0.4);
  ctx.fill();
}

function rhib(ctx, x, y, a = 0, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(s, s);
  ctx.fillStyle = "#2f3438";
  rr(ctx, -2.4, -0.8, 5, 1.6, 0.7);
  ctx.fill();
  ctx.fillStyle = "#5b646a";
  rr(ctx, -2, -0.45, 3.6, 0.9, 0.3);
  ctx.fill();
  ctx.fillStyle = "#e46b1f";
  ctx.fillRect(-0.3, -0.25, 0.6, 0.5);
  ctx.restore();
}

export function waveFlag(ctx, x, y, t, ph, f, len = 2.5) {
  if (!f) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#c0c6ca";
  circle(ctx, 0, 0, 0.15);
  ctx.fill();
  const wid = len * 0.6;
  const segs = 8;
  const wave = (u) => Math.sin(t * 7 + ph - u * 5) * 0.11 * len * u;
  const band = (u0, u1, v0, v1, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = u0 + ((u1 - u0) * i) / segs;
      ctx.lineTo(-u * len, -wid / 2 + v0 * wid + wave(u));
    }
    for (let i = segs; i >= 0; i--) {
      const u = u0 + ((u1 - u0) * i) / segs;
      ctx.lineTo(-u * len, -wid / 2 + v1 * wid + wave(u));
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 3; i++) {
    if (f.dir === "vertical") band(i / 3, (i + 1) / 3, 0, 1, f.colors[i]);
    else band(0, 1, i / 3, (i + 1) / 3, f.colors[i]);
  }
  ctx.restore();
}

function hullNumber(ctx, x, txt, size) {
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "rgba(240,244,246,0.6)";
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

const ph = (a) => ((a.seed || 0) % 1000) / 159;
const radarA = (a, mul = 1) => (a.radarAngle ?? a.t * 2.6 + ph(a)) * mul;

// ---------- Maiskolbistan ----------

// Korvette Braunschweig (Kl. 130): 89 × 13,3 m
export function drawK130(ctx, a) {
  const L = 89;
  const B = 13.3;
  drawHull(ctx, L, B, { bowStart: 0.6 });
  hullNumber(ctx, 37, "F 260", 2.4);
  // Ankerspill
  ctx.fillStyle = "#3c4348";
  rr(ctx, 33, -1.2, 1.6, 2.4, 0.3);
  ctx.fill();
  // Aufbau mit Brücke und Mast
  block(ctx, -22, 21, 5.4, { taperFront: 0.35 });
  windows(ctx, 19.5, 4.6, 8);
  block(ctx, -4, 14, 3.8, { color: "#b6bec3", taperFront: 0.25 });
  // Stealth-Mast mit TRS-3D (dreht)
  ctx.fillStyle = "#99a2a8";
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(4, -2.4);
  ctx.lineTo(0, -2.4);
  ctx.lineTo(0, 2.4);
  ctx.lineTo(4, 2.4);
  ctx.closePath();
  ctx.fill();
  radarBar(ctx, 4.5, 0, 4.2, radarA(a), 0.8);
  // Hangar für Drohnen + Flugdeck
  block(ctx, -34, -22, 5.6, { color: "#9fa8ae", taperFront: 0 });
  helideck(ctx, -44.5, -34, 5.8);
  // RBS 15 Starter (2 × 2) mittschiffs, nach außen gerichtet
  canisters(ctx, a.ssmCells || [], a.exo, 5.4, 0.9);
  // RAM vorn auf dem Aufbau und achtern auf dem Hangar
  samLauncher(ctx, 17.5, 0, Math.PI + (a.ram ?? 0), 0.9);
  samLauncher(ctx, -30, 0, Math.PI + (a.ram ?? 0), 0.9);
  // Beiboote
  rhib(ctx, -14, 5.2, 0, 0.9);
  rhib(ctx, -14, -5.2, 0, 0.9);
  gun(ctx, 28, 0, a.gun ?? 0, "76");
  waveFlag(ctx, -L / 2 + 0.4, 0, a.t, ph(a), a.flag, 2.6);
}

// Fregatte Sachsen (F124): 143 × 17,4 m
export function drawF124(ctx, a) {
  const L = 143;
  const B = 17.4;
  drawHull(ctx, L, B, { bowStart: 0.6 });
  hullNumber(ctx, 61, "F 219", 3.4);
  vls(ctx, 38, 0, 8, 4, 1.35);
  // Brücke mit APAR-Turm (4 feste Antennenflächen)
  block(ctx, -16, 33, 6.8, { taperFront: 0.35 });
  windows(ctx, 30.6, 5.8, 10);
  block(ctx, 15, 27, 4.4, { color: "#b9c1c6", taperFront: 0.15, taperBack: 0.15 });
  ctx.fillStyle = "#c9d0d4";
  rr(ctx, 18, -3.2, 6.4, 6.4, 0.6);
  ctx.fill();
  arrayFaces(ctx, 21.2, 3.2, "#2c3337");
  // Achterer Mast mit SMART-L (große drehende Antenne)
  block(ctx, -32, -12, 6.2, { color: "#a2abb1", taperFront: 0.2 });
  mast(ctx, -6, 0, 1.2);
  radarBar(ctx, -6, 0, 8.4, radarA(a, 0.5), 1.2);
  funnel(ctx, -18, -2.4, 4.6, 3.2);
  funnel(ctx, -18, 2.4, 4.6, 3.2);
  // Harpoon (2 × 4) mittschiffs
  canisters(ctx, a.ssmCells || [], a.exo, 4.4, 0.8);
  // Hangar, RAM, Flugdeck
  block(ctx, -52, -32, 7.6, { color: "#9fa8ae", taperFront: 0 });
  samLauncher(ctx, -40, 0, Math.PI + (a.ram ?? 0), 1);
  helideck(ctx, -71, -52, 7.6);
  rhib(ctx, -24, 7.6, 0, 1);
  rhib(ctx, -24, -7.6, 0, 1);
  gun(ctx, 52, 0, a.gun ?? 0, "76");
  waveFlag(ctx, -L / 2 + 0.4, 0, a.t, ph(a), a.flag, 3);
}

// ---------- Paprikistan ----------

// Patrouillenboot Cyclone (PC-1): 54,6 × 7,9 m
export function drawCyclone(ctx, a) {
  const L = 54.6;
  const B = 7.9;
  drawHull(ctx, L, B, { bowStart: 0.55, deck: "#828b91", deckHi: "#8f989e", deckLo: "#727b81" });
  hullNumber(ctx, 21, "PC 1", 1.6);
  block(ctx, -6, 10, 3.2, { taperFront: 0.4 });
  windows(ctx, 8.8, 2.6, 6);
  mast(ctx, 2, 0, 0.8);
  radarBar(ctx, 2, 0, 3.2, radarA(a), 0.5);
  // Griffin-Startrohre (2 × 3) an beiden Seiten
  canisters(ctx, a.ssmCells || [], a.exo, 2.6, 0.45);
  // Stinger-Stand achtern (schwenkt)
  samLauncher(ctx, -16, 0, Math.PI + (a.ram ?? 0), 0.6);
  // Heckrampe mit Beiboot
  ctx.fillStyle = "#3d454b";
  ctx.fillRect(-27.3, -2.2, 5, 4.4);
  rhib(ctx, -24, 0, 0, 0.85);
  // MG-Stände
  ctx.fillStyle = "#3a3f42";
  for (const y of [-3.2, 3.2]) {
    ctx.beginPath();
    ctx.arc(-4, y, 0.5, 0, TAU);
    ctx.fill();
  }
  gun(ctx, 14, 0, a.gun ?? 0, "25");
  waveFlag(ctx, -L / 2 + 0.4, 0, a.t, ph(a), a.flag, 2.2);
}

export function lcsOutline(ctx) {
  const hl = 127 / 2;
  ctx.beginPath();
  ctx.moveTo(hl, 0);
  ctx.lineTo(30, -6);
  ctx.lineTo(8, -15.8);
  ctx.lineTo(-hl, -15.8);
  ctx.lineTo(-hl, 15.8);
  ctx.lineTo(8, 15.8);
  ctx.lineTo(30, 6);
  ctx.closePath();
}

// LCS Independence: Trimaran, 127 × 31,6 m, riesiges Flugdeck
export function drawLCS(ctx, a) {
  const L = 127;
  const hl = L / 2;
  // Schatten
  ctx.fillStyle = "rgba(0,20,40,0.35)";
  ctx.beginPath();
  ctx.moveTo(hl + 1, 1.5);
  ctx.lineTo(10, 17.3);
  ctx.lineTo(-hl + 1, 17.3);
  ctx.lineTo(-hl + 1, -14);
  ctx.lineTo(10, -14);
  ctx.fill();
  // Rumpf: schmaler Mittelrumpf vorn, breites Deck achtern (Rauten-Form)
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(hl, 0);
    ctx.lineTo(30, -6);
    ctx.lineTo(8, -15.8);
    ctx.lineTo(-hl, -15.8);
    ctx.lineTo(-hl, 15.8);
    ctx.lineTo(8, 15.8);
    ctx.lineTo(30, 6);
    ctx.closePath();
  };
  ctx.fillStyle = "#4a545b";
  outline();
  ctx.fill();
  ctx.save();
  ctx.scale(0.985, 0.95);
  const g = ctx.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, "#858f96");
  g.addColorStop(1, "#6c767d");
  ctx.fillStyle = g;
  outline();
  ctx.fill();
  ctx.restore();
  // Facettenkanten
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 0.15;
  ctx.beginPath();
  ctx.moveTo(hl - 4, 0);
  ctx.lineTo(8, 0);
  ctx.moveTo(30, -6);
  ctx.lineTo(30, 6);
  ctx.stroke();
  hullNumber(ctx, 52, "LCS 2", 2.6);
  // Flugdeck (für zwei Hubschrauber)
  helideck(ctx, -62, -16, 15);
  // Facettierter Aufbau
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.moveTo(33, 1);
  ctx.lineTo(24, -7);
  ctx.lineTo(-15, -7);
  ctx.lineTo(-15, 9);
  ctx.lineTo(24, 9);
  ctx.fill();
  const sg = ctx.createLinearGradient(0, -8, 0, 8);
  sg.addColorStop(0, "#c3cacf");
  sg.addColorStop(1, "#8f989e");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.lineTo(23, -8);
  ctx.lineTo(-16, -8);
  ctx.lineTo(-16, 8);
  ctx.lineTo(23, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.fillStyle = "#1f3b52";
  ctx.beginPath();
  ctx.moveTo(31, 0);
  ctx.lineTo(23, -7);
  ctx.lineTo(22.2, -7);
  ctx.lineTo(29.8, 0);
  ctx.lineTo(22.2, 7);
  ctx.lineTo(23, 7);
  ctx.closePath();
  ctx.fill();
  // Mast mit Sea Giraffe (dreht)
  ctx.fillStyle = "#a9b1b6";
  rr(ctx, 4, -3, 8, 6, 1);
  ctx.fill();
  radarBar(ctx, 8, 0, 4.6, radarA(a), 0.8);
  // Abgasöffnungen am Heck des Aufbaus
  ctx.fillStyle = "#1a1d1f";
  rr(ctx, -15.5, -6, 2, 3, 0.4);
  ctx.fill();
  rr(ctx, -15.5, 3, 2, 3, 0.4);
  ctx.fill();
  // SeaRAM auf dem Hangar
  samLauncher(ctx, -8, 0, Math.PI + (a.ram ?? 0), 1.05, true);
  // NSM-Starter (2 × 4) auf dem Vordeck
  canisters(ctx, a.ssmCells || [], a.exo, 3.6, 0.7);
  gun(ctx, 44, 0, a.gun ?? 0, "57");
  waveFlag(ctx, -hl + 0.4, 10, a.t, ph(a), a.flag, 3);
}

// Zerstörer Arleigh Burke (DDG-51): 155 × 20 m
export function drawBurke(ctx, a) {
  const L = 155;
  const B = 20;
  drawHull(ctx, L, B, { bowStart: 0.55, sternW: 0.85, deck: "#7a848b", deckHi: "#88929a", deckLo: "#6a747b" });
  hullNumber(ctx, 66, "DDG 51", 3.6);
  // Vorderes VLS (29 Zellen) und 5"-Geschütz
  vls(ctx, 44, 0, 8, 4, 1.4);
  // Hauptaufbau mit SPY-1-Flächen
  block(ctx, -6, 36, 7.6, { taperFront: 0.3 });
  windows(ctx, 33.8, 6.6, 10);
  block(ctx, 16, 31, 5.6, { color: "#b9c1c6", taperFront: 0.2 });
  arrayFaces(ctx, 23.5, 5.6, "#2a3135");
  // Mast mit Navigationsradar
  mast(ctx, 14, 0, 1.1);
  radarBar(ctx, 14, 0, 4.4, radarA(a), 0.7);
  // Phalanx-Kuppeln (Deko)
  ctx.fillStyle = "#f1f3f4";
  circle(ctx, 30, -6.2, 1.1);
  ctx.fill();
  circle(ctx, -56, 6, 1.1);
  ctx.fill();
  // Zwei Schornsteine
  funnel(ctx, 2, 0, 7, 4.4);
  funnel(ctx, -24, 0, 7, 4.4);
  block(ctx, -32, -6, 6.4, { color: "#a2abb1", taperFront: 0.1 });
  // Harpoon (2 × 4) achtern
  canisters(ctx, a.ssmCells || [], a.exo, 4.2, 0.8);
  // Achteres VLS (61 Zellen)
  vls(ctx, -50, 0, 8, 8, 1.4);
  // Hangar und Flugdeck
  block(ctx, -62, -58, 7.2, { color: "#9fa8ae", taperFront: 0 });
  helideck(ctx, -77, -62, 8);
  rhib(ctx, -14, 8.3, 0, 1);
  gun(ctx, 58, 0, a.gun ?? 0, "127");
  waveFlag(ctx, -L / 2 + 0.4, 0, a.t, ph(a), a.flag, 3.2);
}

export const EXHAUSTS = {
  k130: [[-8, -2], [-8, 2]],
  f124: [[-18, -2.4], [-18, 2.4]],
  cyclone: [[-8, -1.5], [-8, 1.5]],
  lcs: [[-15, -4.5], [-15, 4.5]],
  burke: [[2, 0], [-24, 0]],
};
