// Marinebasen der beiden Teams: Hafenbecken, Molen, Piers, Hauptquartier, Flaggenmast,
// Radarturm, Hafenkräne, Tanklager und drei Werften – mit beweglichen Teilen.
// Gezeichnet in lokalen Koordinaten (x = Abstand vom Kartenrand Richtung See), gespiegelt für Osten.
import { BASE_LAYOUT, TEAMS, teamBase, AIRFIELD } from "../shared/sim.js";
import { drawGepard } from "./gepard.js";

const L = BASE_LAYOUT;

function rect(ctx, [x0, x1, y0, y1]) {
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
}

function box(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  }
}

function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Große wehende Flagge (lokal, Mast bei 0,0, weht nach -x)
function bigFlag(ctx, flag, t, len, ph) {
  const wid = len * 0.6;
  const segs = 12;
  const wave = (u) => Math.sin(t * 3 + ph - u * 4.5) * wid * 0.12 * u;
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
    if (flag.dir === "vertical") band(i / 3, (i + 1) / 3, 0, 1, flag.colors[i]);
    else band(0, 1, i / 3, (i + 1) / 3, flag.colors[i]);
  }
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < segs; i++) {
    const u = i / segs;
    if (Math.cos(t * 3 + ph - u * 4.5) > 0.3) band(u, u + 1 / segs, 0, 1, "#000");
  }
  ctx.restore();
}

function jibCrane(ctx, x, y, ang, len, color) {
  ctx.save();
  ctx.translate(x, y);
  box(ctx, -5, -5, 10, 10, "#55595c", "#2e3133");
  ctx.rotate(ang);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(2, -1, len, 4);
  ctx.fillStyle = color;
  ctx.fillRect(-10, -1.6, len + 10, 3.2);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 0.4;
  for (let i = -8; i < len; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, -1.6);
    ctx.lineTo(i + 3, 1.6);
    ctx.stroke();
  }
  box(ctx, -14, -3, 6, 6, "#3c4043"); // Gegengewicht
  box(ctx, -3, -3, 6, 6, "#e6e8e9", "#555"); // Führerhaus
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(len - 2, 0);
  ctx.lineTo(len - 2, 4);
  ctx.stroke();
  box(ctx, len - 4, 3.5, 4, 2, "#f0b429"); // Haken
  ctx.restore();
}

function label(ctx, base, lx, ly, text, size, color, alpha = 0.85) {
  // Bodenbeschriftung (nicht gespiegelt)
  ctx.save();
  ctx.translate(base.edge + base.dir * lx, ly);
  ctx.globalAlpha = alpha;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---------- Flugfeld (lokal, landeinwärts hinter der Basis) ----------
function drawAirfield(ctx, base, t) {
  const A = AIRFIELD;
  const [x0, x1, y0, y1] = A.area;
  // Gelände mit Zaun
  ctx.fillStyle = "rgba(120,150,90,0.35)";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = "rgba(60,60,60,0.6)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
  // Zufahrt zur Basis
  ctx.fillStyle = "#6b6e6c";
  ctx.fillRect(x1, -20, 190, 12);
  // Startbahn
  const R = A.runway;
  ctx.fillStyle = "#3b4044";
  ctx.fillRect(R.x - R.w / 2 - 6, R.y0 - 30, R.w + 12, R.y1 - R.y0 + 60);
  ctx.fillStyle = "#454a4e";
  ctx.fillRect(R.x - R.w / 2, R.y0, R.w, R.y1 - R.y0);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  // Mittellinie
  for (let y = R.y0 + 60; y < R.y1 - 60; y += 40) ctx.fillRect(R.x - 0.8, y, 1.6, 22);
  // Schwellen (Klaviertasten) und Aufsetzzonen
  for (const yEnd of [R.y0 + 6, R.y1 - 26]) {
    for (let i = -4; i <= 4; i++) if (i !== 0) ctx.fillRect(R.x + i * 4.6 - 1.2, yEnd, 2.4, 20);
  }
  for (const yz of [R.y0 + 120, R.y1 - 140]) {
    ctx.fillRect(R.x - 14, yz, 5, 20);
    ctx.fillRect(R.x + 9, yz, 5, 20);
  }
  // Randbefeuerung (blinkt leicht)
  const on = 0.6 + 0.4 * Math.sin(t * 3);
  ctx.fillStyle = `rgba(255,240,180,${on})`;
  for (let y = R.y0; y <= R.y1; y += 60) {
    ctx.fillRect(R.x - R.w / 2 - 3, y, 2, 2);
    ctx.fillRect(R.x + R.w / 2 + 1, y, 2, 2);
  }
  ctx.fillStyle = `rgba(80,255,120,${on})`;
  for (let i = -5; i <= 5; i++) ctx.fillRect(R.x + i * 4.2 - 1, R.y1 + 8, 2, 2);
  ctx.fillStyle = `rgba(255,70,60,${on})`;
  for (let i = -5; i <= 5; i++) ctx.fillRect(R.x + i * 4.2 - 1, R.y0 - 10, 2, 2);
  // Rollwege
  ctx.fillStyle = "#50565a";
  ctx.fillRect(R.x + R.w / 2, R.y1 - 360, 140, 22);
  ctx.fillRect(R.x + R.w / 2, R.y0 + 140, 140, 22);
  ctx.fillRect(-382, R.y0 + 140, 22, R.y1 - R.y0 - 280 + 22);
  ctx.strokeStyle = "rgba(240,200,60,0.8)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-371, R.y0 + 150);
  ctx.lineTo(-371, R.y1 - 340);
  ctx.stroke();
  // Vorfeld mit Abstellpositionen
  ctx.fillStyle = "#8f9290";
  ctx.fillRect(-370, 470, 140, 460);
  ctx.strokeStyle = "rgba(240,200,60,0.8)";
  ctx.lineWidth = 0.8;
  for (const a of A.apron) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Hangars (Bogendach)
  for (const h of A.hangars) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(h.x - h.w / 2 + 4, h.y - h.h / 2 + 5, h.w, h.h);
    const g = ctx.createLinearGradient(h.x - h.w / 2, 0, h.x + h.w / 2, 0);
    g.addColorStop(0, "#8b949a");
    g.addColorStop(0.5, "#c3cacf");
    g.addColorStop(1, "#7d868c");
    ctx.fillStyle = g;
    ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    for (let y = h.y - h.h / 2 + 10; y < h.y + h.h / 2; y += 10) {
      ctx.beginPath();
      ctx.moveTo(h.x - h.w / 2, y);
      ctx.lineTo(h.x + h.w / 2, y);
      ctx.stroke();
    }
    // Tor zur Bahn hin
    ctx.fillStyle = "#3f474d";
    ctx.fillRect(h.x - h.w / 2 - 2, h.y - h.h / 2 + 15, 4, h.h - 30);
    ctx.fillStyle = "#50565a";
    ctx.fillRect(-370, h.y - 10, h.x - h.w / 2 + 370, 20);
  }
  // Tower mit drehendem Radar
  const T = A.tower;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(T.x - 14 + 4, T.y - 14 + 5, 28, 28);
  ctx.fillStyle = "#d9d4c7";
  ctx.fillRect(T.x - 14, T.y - 14, 28, 28);
  ctx.fillStyle = "#24445e";
  ctx.fillRect(T.x - 11, T.y - 11, 22, 22);
  ctx.fillStyle = "#b9b4a6";
  ctx.fillRect(T.x - 7, T.y - 7, 14, 14);
  ctx.save();
  ctx.translate(T.x, T.y);
  ctx.rotate(t * 2.2);
  ctx.fillStyle = "#eef1f2";
  ctx.fillRect(-2, -13, 4, 26);
  ctx.restore();
  // Hubschrauberlandeplätze
  for (const hp of A.helipads) {
    ctx.fillStyle = "#5d605e";
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(240,200,60,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(hp.x - 8, hp.y - 9, 3, 18);
    ctx.fillRect(hp.x + 5, hp.y - 9, 3, 18);
    ctx.fillRect(hp.x - 8, hp.y - 1.5, 16, 3);
  }
  // Windsack (weht)
  ctx.save();
  ctx.translate(R.x - 60, R.y0 + 40);
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(0.9 + Math.sin(t * 0.7) * 0.25);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? "#f2f2f2" : "#e8551e";
    ctx.fillRect(i * 3.4, -1.6 + i * 0.15, 3.4, 3.2 - i * 0.3);
  }
  ctx.restore();
}

function drawBaseLocal(ctx, base, t) {
  drawAirfield(ctx, base, t);
  const team = TEAMS[base.team];
  const [hx0, hx1, hy0, hy1] = L.harbor;

  // Sicherer Hafen
  ctx.fillStyle = "rgba(40,120,170,0.3)";
  rect(ctx, L.harbor);
  ctx.fill();
  ctx.strokeStyle = team.color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(hx0 + 4, hy0 + 4, hx1 - hx0 - 8, hy1 - hy0 - 8);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Festland
  const land = [0, L.landDepth, -L.landHalf, L.landHalf];
  ctx.fillStyle = "rgba(0,20,40,0.35)";
  ctx.fillRect(0, -L.landHalf - 6, L.landDepth + 6, L.landHalf * 2 + 12);
  ctx.fillStyle = "#a3a59f";
  rect(ctx, land);
  ctx.fill();
  // Grünstreifen hinten
  box(ctx, 0, -L.landHalf, 40, L.landHalf * 2, "#6f9a55");
  for (let y = -L.landHalf + 20; y < L.landHalf; y += 34) {
    circle(ctx, 18 + ((y * 7) % 13), y, 7, "#3f7a35");
  }
  // Betonplatten-Raster
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 0.6;
  for (let x = 40; x < L.landDepth; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, -L.landHalf);
    ctx.lineTo(x, L.landHalf);
    ctx.stroke();
  }
  for (let y = -L.landHalf; y < L.landHalf; y += 20) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(L.landDepth, y);
    ctx.stroke();
  }
  // Straßen
  ctx.fillStyle = "#6b6e6c";
  ctx.fillRect(195, -L.landHalf, 14, L.landHalf * 2);
  ctx.fillRect(40, -20, 310, 12);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(202, -L.landHalf);
  ctx.lineTo(202, L.landHalf);
  ctx.stroke();
  ctx.setLineDash([]);
  // Hafenbahn mit fahrendem Güterzug
  ctx.fillStyle = "#8a7a68";
  for (let y = -L.landHalf; y < L.landHalf; y += 3) ctx.fillRect(248, y, 14, 1.2);
  ctx.fillStyle = "#4b4f52";
  ctx.fillRect(250, -L.landHalf, 1.4, L.landHalf * 2);
  ctx.fillRect(258.6, -L.landHalf, 1.4, L.landHalf * 2);
  const trainY = Math.sin(t * 0.05) * 1000;
  const wcol = ["#a3402e", "#2f6db8", "#a3402e", "#3f8f4d", "#d8d8d8"];
  for (let i = 0; i < 6; i++) {
    const y = trainY + i * 17;
    box(ctx, 249.5, y, 11, 15, i === 0 ? "#d6a21e" : wcol[i % wcol.length], "rgba(0,0,0,0.5)");
  }
  box(ctx, 251.5, trainY + 2, 7, 5, "#3a3f42");

  // Kasernen
  for (const [y, n] of [[-940, 3], [-860, 3], [-780, 3]]) {
    for (let i = 0; i < n; i++) {
      const x = 55 + i * 45;
      box(ctx, x + 2, y + 3, 38, 58, "rgba(0,0,0,0.2)");
      box(ctx, x, y, 38, 58, "#b5675a", "#6e3a32");
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(x + 19, y);
      ctx.lineTo(x + 19, y + 58);
      ctx.stroke();
    }
  }
  // Parkplatz mit Fahrzeugen
  box(ctx, 50, 170, 130, 200, "#5f6261");
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.5;
  const carCols = ["#d9d9d9", "#2c2c2c", "#4d6b3c", "#4d6b3c", "#8a2a22", "#2f5b8f", "#4d6b3c"];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 12; i++) {
      const x = 56 + i * 10;
      const y = 178 + row * 48;
      ctx.strokeRect(x, y, 10, 18);
      if ((i * 7 + row * 3) % 5 !== 0) box(ctx, x + 2, y + 3, 6, 12, carCols[(i + row * 5) % carCols.length]);
    }
  }
  // Baumreihen
  for (let y = -L.landHalf + 30; y < L.landHalf - 20; y += 60) {
    if (y > -1220 && y < -960) continue;
    circle(ctx, 190, y, 5, "#3f7a35");
  }

  // Kaikante mit gelber Sicherheitslinie
  ctx.fillStyle = "#7b7e7a";
  ctx.fillRect(L.landDepth - 4, -L.landHalf, 4, L.landHalf * 2);
  ctx.strokeStyle = "#e8c33a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(L.landDepth - 7, -L.landHalf);
  ctx.lineTo(L.landDepth - 7, L.landHalf);
  ctx.stroke();

  // Molen mit Tetrapoden
  for (const m of L.moles) {
    ctx.fillStyle = "#8d8f8a";
    rect(ctx, m);
    ctx.fill();
    ctx.strokeStyle = "#5e605c";
    ctx.lineWidth = 1;
    ctx.stroke();
    const [x0, x1, y0, y1] = m;
    ctx.fillStyle = "#b3b4ae";
    const horiz = x1 - x0 > y1 - y0;
    const n = Math.floor((horiz ? x1 - x0 : y1 - y0) / 9);
    for (let i = 0; i < n; i++) {
      const px = horiz ? x0 + 4 + i * 9 : (y0 < 0 ? x1 : x1) + 3;
      const py = horiz ? (y0 < 0 ? y0 - 3 : y1 + 3) : y0 + 4 + i * 9;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(i * 1.3);
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }
  }
  // Molenfeuer (Bb rot / Stb grün) blinkend
  const blink = Math.sin(t * 3) > 0;
  circle(ctx, 680, -700, 6, "#e8e8e8");
  circle(ctx, 680, -700, 3.5, blink ? "#ff3b30" : "#5a1612");
  circle(ctx, 680, 700, 6, "#e8e8e8");
  circle(ctx, 680, 700, 3.5, !blink ? "#34e35a" : "#14501f");

  // Piers mit Pollern
  for (const pr of L.piers) {
    box(ctx, pr[0], pr[2], pr[1] - pr[0], pr[3] - pr[2], "#8a7b66", "#5d5245");
    for (let x = pr[0] + 10; x < pr[1]; x += 20) {
      circle(ctx, x, pr[2] + 2, 1.2, "#333");
      circle(ctx, x, pr[3] - 2, 1.2, "#333");
    }
  }

  // Hauptquartier
  box(ctx, 70, -170, 110, 140, "#c9c3b5", "#6d685e");
  box(ctx, 80, -160, 90, 120, "#b9b2a2");
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  for (let y = -150; y < -40; y += 12) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(170, y);
    ctx.stroke();
  }
  box(ctx, 100, -130, 30, 30, "#8b8577"); // Dachaufbau
  // Hubschrauberlandeplatz
  circle(ctx, 120, 90, 30, "#5d605e");
  ctx.strokeStyle = "#f2f2f2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(120, 90, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(110, 78, 4, 24);
  ctx.fillRect(126, 78, 4, 24);
  ctx.fillRect(110, 88, 20, 4);

  // Radarturm mit drehender Antenne
  ctx.save();
  ctx.translate(150, -300);
  box(ctx, -10, -10, 20, 20, "#7a7f82", "#444");
  ctx.strokeStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(10, 10);
  ctx.moveTo(10, -10);
  ctx.lineTo(-10, 10);
  ctx.stroke();
  ctx.rotate(t * 1.6);
  box(ctx, -2, -16, 4, 32, "#e9eef0", "#777");
  circle(ctx, 0, 0, 3, "#3d4448");
  ctx.restore();

  // Tanklager
  for (const [x, y] of [[80, 430], [130, 430], [80, 480], [130, 480]]) {
    circle(ctx, x + 2, y + 3, 20, "rgba(0,0,0,0.25)");
    circle(ctx, x, y, 20, "#d9dcd8");
    ctx.strokeStyle = "#8f938f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Lagerhallen
  for (const y of [-620, -540]) {
    box(ctx, 60, y, 120, 60, "#9aa0a6", "#5e6368");
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    for (let x = 64; x < 180; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 60);
      ctx.stroke();
    }
  }
  // Container
  const cc = ["#b8442f", "#2f6db8", "#e0a526", "#3f8f4d", "#8a3fb8", "#d8d8d8"];
  for (let i = 0; i < 18; i++) {
    const x = 230 + (i % 3) * 32;
    const y = 520 + Math.floor(i / 3) * 14;
    box(ctx, x, y, 28, 11, cc[(i * 7) % cc.length], "rgba(0,0,0,0.4)");
  }

  // Hafenkräne an der Kaikante (schwenken langsam)
  jibCrane(ctx, 330, -320, Math.PI * 0.05 + Math.sin(t * 0.25) * 0.5, 42, "#e0a526");
  jibCrane(ctx, 330, 290, -0.1 + Math.sin(t * 0.21 + 2) * 0.6, 42, "#e0a526");
  jibCrane(ctx, 330, -620, Math.sin(t * 0.18 + 4) * 0.5, 38, "#e0a526");

  // Flaggenmast mit großer Teamflagge
  ctx.save();
  ctx.translate(300, -60);
  circle(ctx, 0, 0, 4, "#555");
  bigFlag(ctx, team.flag, t, 40, base.team * 2);
  circle(ctx, 0, 0, 2.2, "#ddd");
  ctx.restore();

  // ---------- Werft 1: Schnellboote (Trockendock mit Portalkran) ----------
  box(ctx, 20, -1200, 150, 230, "#8e959b", "#585e63"); // Werfthalle
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  for (let y = -1196; y < -970; y += 10) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(170, y);
    ctx.stroke();
  }
  // Dock (Wasser, mit Docktor zur See)
  box(ctx, 175, -1110, 175, 48, "#2e6a92", "#3d4245");
  ctx.fillStyle = "#4d5357";
  ctx.fillRect(346, -1110, 4, 48);
  ctx.save();
  ctx.translate(268, -1086);
  drawGepard(ctx, { t, seed: 11 + base.team, gun: 0, ram: 0, flag: team.flag });
  ctx.restore();
  // Kranschienen und fahrender Portalkran
  ctx.fillStyle = "#3b3f42";
  ctx.fillRect(175, -1120, 175, 3);
  ctx.fillRect(175, -1055, 175, 3);
  const gx = 230 + Math.sin(t * 0.3) * 80;
  box(ctx, gx - 6, -1126, 12, 78, "rgba(224,165,38,0.92)", "#6b4f12");
  box(ctx, gx - 4, -1092 + Math.sin(t * 0.7) * 20, 8, 8, "#2f3336");

  // ---------- Werft 2: Fregatten (Helling mit Rohbau) ----------
  box(ctx, 50, 760, 300, 70, "#8b8d88", "#5a5c58"); // Helling
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  for (let x = 60; x < 350; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 760);
    ctx.lineTo(x, 830);
    ctx.stroke();
  }
  // Rohbau: Kiel, Spanten, Bordwand teilweise
  ctx.save();
  ctx.translate(200, 795);
  ctx.strokeStyle = "#4a5359";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-60, -8);
  ctx.lineTo(50, -8);
  ctx.quadraticCurveTo(75, -6, 80, 0);
  ctx.quadraticCurveTo(75, 6, 50, 8);
  ctx.lineTo(-60, 8);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 0.8;
  for (let x = -56; x < 74; x += 5) {
    const half = x > 50 ? 8 * (1 - (x - 50) / 30) : 8;
    ctx.beginPath();
    ctx.moveTo(x, -half);
    ctx.lineTo(x, half);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(110,118,124,0.85)";
  ctx.fillRect(-60, -8, 60, 16);
  ctx.fillStyle = "rgba(255,190,60,0.9)"; // Schweißfunken
  for (let i = 0; i < 4; i++) {
    if (Math.sin(t * 17 + i * 3) > 0.6) {
      ctx.beginPath();
      ctx.arc(2 + i * 9, (i % 2 ? -1 : 1) * 7, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // Gerüst
  ctx.strokeStyle = "rgba(200,200,200,0.6)";
  ctx.lineWidth = 0.6;
  ctx.strokeRect(138, 783, 146, 24);
  jibCrane(ctx, 120, 850, -0.4 + Math.sin(t * 0.22) * 0.7, 70, "#c9392b");

  // ---------- Werft 3: U-Boote (überdachte Halle) ----------
  box(ctx, 30, 1050, 230, 200, "#6f7880", "#3f454a");
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  for (let y = 1060; y < 1250; y += 16) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(260, y);
    ctx.stroke();
  }
  box(ctx, 255, 1125, 95, 50, "#2e6a92"); // Wasserrinne
  ctx.save();
  ctx.translate(280, 1150);
  ctx.fillStyle = "#15191c";
  ctx.beginPath();
  ctx.moveTo(-30, -6);
  ctx.lineTo(30, -6);
  ctx.quadraticCurveTo(46, 0, 30, 6);
  ctx.lineTo(-30, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#23292d";
  ctx.beginPath();
  ctx.ellipse(10, 0, 7, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBases(ctx, view, t) {
  for (const team of [0, 1]) {
    const base = teamBase(team);
    const xNear = base.edge - base.dir * 820; // inklusive Flugfeld
    const xFar = base.edge + base.dir * 720;
    if (Math.max(xNear, xFar) < view.x0 || Math.min(xNear, xFar) > view.x1) continue;
    ctx.save();
    ctx.translate(base.edge, 0);
    ctx.scale(base.dir, 1);
    drawBaseLocal(ctx, base, t);
    ctx.restore();
    const tm = TEAMS[team];
    label(ctx, base, 125, -100, "MARINEBASIS", 11, "#2f3336", 0.75);
    label(ctx, base, 125, -82, tm.name.toUpperCase(), 13, tm.dark, 0.9);
    label(ctx, base, 95, -1085, "WERFT 1 · SCHNELLBOOTE", 9, "#1e2326", 0.85);
    label(ctx, base, 200, 745, "WERFT 2 · FREGATTEN (in Planung)", 9, "#1e2326", 0.85);
    label(ctx, base, 145, 1150, "WERFT 3 · U-BOOTE (in Planung)", 9, "#e6e9eb", 0.85);
    label(ctx, base, 505, -660, "SICHERER HAFEN", 12, tm.color, 0.55);
    label(ctx, base, -300, -960, "FLUGFELD", 16, "#1e2326", 0.75);
    label(ctx, base, -300, -935, "Landen: langsam über die Bahn (Drohne) · schweben (Hubschrauber)", 7, "#1e2326", 0.7);
  }
}

// Basen auf der Minimap
export function drawBasesMinimap(g, toM, s) {
  for (const team of [0, 1]) {
    const base = teamBase(team);
    const tm = TEAMS[team];
    // Startbahn des Flugfelds
    const R = AIRFIELD.runway;
    g.fillStyle = "#3b4044";
    g.fillRect(toM(base.edge + base.dir * R.x) - 1.5, toM(R.y0), 3, (R.y1 - R.y0) * s);
    const lx = (x) => toM(base.edge + base.dir * x);
    g.fillStyle = "#a3a59f";
    const x0 = Math.min(lx(0), lx(L.landDepth));
    g.fillRect(x0, toM(-L.landHalf), L.landDepth * s, L.landHalf * 2 * s);
    g.fillStyle = tm.color;
    g.globalAlpha = 0.45;
    const hx = Math.min(lx(L.harbor[0]), lx(L.harbor[1]));
    g.fillRect(hx, toM(L.harbor[2]), (L.harbor[1] - L.harbor[0]) * s, (L.harbor[3] - L.harbor[2]) * s);
    g.globalAlpha = 1;
    // Mini-Flagge
    const fx = lx(L.landDepth / 2) - 7;
    const fy = toM(0) - 5;
    for (let i = 0; i < 3; i++) {
      g.fillStyle = tm.flag.colors[i];
      if (tm.flag.dir === "vertical") g.fillRect(fx + (i * 14) / 3, fy, 14 / 3 + 0.3, 9);
      else g.fillRect(fx, fy + i * 3, 14, 3.3);
    }
  }
}
