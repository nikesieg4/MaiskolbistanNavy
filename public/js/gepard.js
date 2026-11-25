// Schnellboot Klasse 143A "Gepard" – Draufsicht, gezeichnet in Metern.
// Ursprung = Schiffsmitte, Bug zeigt nach +x, Steuerbord = +y.
// Bewegliche Teile: Navigationsradar (rotiert), WM-27-Feuerleitradom,
// 76-mm-Turm (sucht), RAM-Starter (schwenkt), Flagge (weht), Rettungsboot-Davit.

const L = 57.6;
const HL = L / 2;

const C = {
  hullDark: "#4a545c",
  hull: "#68737b",
  deck: "#7c878f",
  deckDark: "#6b757d",
  superstructure: "#a7b0b6",
  superLight: "#c3cacf",
  superShadow: "#8c959b",
  metal: "#5d666d",
  black: "#1d2226",
  glass: "#1f3b52",
  glassHi: "#4f7c9c",
  white: "#e9eef0",
  rail: "rgba(220,228,232,0.85)",
  rubber: "#2b2f33",
  orange: "#e46b1f",
};

function hullPath(ctx, inset = 0) {
  const b = 3.9 - inset;
  const st = -HL + inset;
  const bow = HL - inset * 1.6;
  ctx.beginPath();
  ctx.moveTo(st, -b * 0.9);
  ctx.lineTo(-12, -b);
  ctx.bezierCurveTo(6, -b, 18, -b * 0.82, bow, 0);
  ctx.bezierCurveTo(18, b * 0.82, 6, b, -12, b);
  ctx.lineTo(st, b * 0.9);
  ctx.closePath();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// ---------- Einzelteile ----------

function drawDeckFittings(ctx) {
  // Plankenfugen / Rutschfest-Felder
  ctx.save();
  hullPath(ctx, 0.45);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.06;
  for (let x = -HL; x < HL; x += 1.2) {
    ctx.beginPath();
    ctx.moveTo(x, -4);
    ctx.lineTo(x, 4);
    ctx.stroke();
  }
  // Gangbord-Markierungen
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 0.08;
  ctx.setLineDash([0.8, 0.6]);
  ctx.beginPath();
  ctx.moveTo(-HL + 1, -3.1);
  ctx.lineTo(10, -3.1);
  ctx.moveTo(-HL + 1, 3.1);
  ctx.lineTo(10, 3.1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Ankerspill + Ketten
  ctx.fillStyle = C.metal;
  rr(ctx, 22.2, -1.2, 1.4, 2.4, 0.3);
  ctx.fill();
  ctx.fillStyle = C.black;
  circle(ctx, 22.9, -0.6, 0.35);
  ctx.fill();
  circle(ctx, 22.9, 0.6, 0.35);
  ctx.fill();
  ctx.strokeStyle = "#2a2e31";
  ctx.lineWidth = 0.18;
  ctx.setLineDash([0.22, 0.12]);
  ctx.beginPath();
  ctx.moveTo(23.3, -0.6);
  ctx.lineTo(25.6, -1.45);
  ctx.moveTo(23.3, 0.6);
  ctx.lineTo(25.6, 1.45);
  ctx.stroke();
  ctx.setLineDash([]);
  // Klüsen
  ctx.fillStyle = C.black;
  circle(ctx, 25.8, -1.5, 0.28);
  ctx.fill();
  circle(ctx, 25.8, 1.5, 0.28);
  ctx.fill();

  // Poller (Doppelpoller) an Bug und Heck
  const bollards = [
    [19.5, -2.7], [19.5, 2.7], [-6, -3.2], [-6, 3.2],
    [-24, -3.0], [-24, 3.0], [-27.2, -2.0], [-27.2, 2.0],
  ];
  ctx.fillStyle = "#3c4348";
  for (const [x, y] of bollards) {
    circle(ctx, x - 0.35, y, 0.22);
    ctx.fill();
    circle(ctx, x + 0.35, y, 0.22);
    ctx.fill();
  }

  // Lukendeckel
  ctx.fillStyle = C.deckDark;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.08;
  for (const [x, y, w, h] of [
    [12.2, -1.6, 1.4, 1.1],
    [-15.5, 1.0, 1.6, 1.3],
    [-26, -0.7, 1.3, 1.4],
  ]) {
    rr(ctx, x, y, w, h, 0.15);
    ctx.fill();
    ctx.stroke();
  }

  // Maschinenraum-Lüftergitter
  ctx.fillStyle = "#555e65";
  rr(ctx, -13.5, -2.6, 3.2, 1.2, 0.15);
  ctx.fill();
  rr(ctx, -13.5, 1.4, 3.2, 1.2, 0.15);
  ctx.fill();
  ctx.strokeStyle = "#353b40";
  ctx.lineWidth = 0.07;
  for (let i = 0; i < 9; i++) {
    const x = -13.3 + i * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, -2.5);
    ctx.lineTo(x, -1.5);
    ctx.moveTo(x, 1.5);
    ctx.lineTo(x, 2.5);
    ctx.stroke();
  }
}

function drawRailing(ctx) {
  ctx.save();
  ctx.strokeStyle = C.rail;
  ctx.lineWidth = 0.07;
  hullPath(ctx, 0.25);
  ctx.stroke();
  // Relingsstützen
  ctx.fillStyle = C.rail;
  const pts = [];
  for (let x = -HL + 0.6; x < 24; x += 1.6) {
    const t = x < -12 ? 3.65 : 3.65 * Math.max(0.15, 1 - Math.pow(Math.max(0, x + 12) / 40.5, 2.2));
    pts.push([x, t], [x, -t]);
  }
  for (const [x, y] of pts) {
    circle(ctx, x, y, 0.09);
    ctx.fill();
  }
  ctx.restore();
}

function drawGun(ctx, angle, recoil) {
  // OTO Melara 76/62 Compact
  ctx.save();
  ctx.translate(16.5, 0);
  // Barbette-Ring
  ctx.fillStyle = C.deckDark;
  circle(ctx, 0, 0, 2.15);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.rotate(angle);
  // Schatten
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0.25, 0.3, 2.2, 1.75, 0, 0, Math.PI * 2);
  ctx.fill();
  // Rohr
  const rx = -recoil * 0.6;
  ctx.fillStyle = "#3f474d";
  rr(ctx, 1.4 + rx, -0.17, 4.7, 0.34, 0.12);
  ctx.fill();
  ctx.fillStyle = "#2c3236";
  rr(ctx, 5.6 + rx, -0.22, 0.65, 0.44, 0.12); // Mündungsbremse
  ctx.fill();
  ctx.fillStyle = "#4d565c";
  rr(ctx, 1.2 + rx, -0.3, 1.1, 0.6, 0.15); // Rohrwiege
  ctx.fill();
  // Turmhaube (charakteristische Kuppelform)
  const g = ctx.createLinearGradient(-2, -1.7, 1.5, 1.7);
  g.addColorStop(0, "#c8d0d5");
  g.addColorStop(0.55, "#a2acb2");
  g.addColorStop(1, "#7f898f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(1.9, -0.75);
  ctx.quadraticCurveTo(2.1, 0, 1.9, 0.75);
  ctx.lineTo(0.6, 1.55);
  ctx.quadraticCurveTo(-1.4, 1.75, -2.1, 1.0);
  ctx.quadraticCurveTo(-2.45, 0, -2.1, -1.0);
  ctx.quadraticCurveTo(-1.4, -1.75, 0.6, -1.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.07;
  ctx.stroke();
  // Nähte und Lüfter auf der Haube
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.moveTo(-1.7, -1.1);
  ctx.quadraticCurveTo(-0.4, 0, -1.7, 1.1);
  ctx.moveTo(0.4, -1.4);
  ctx.lineTo(0.4, 1.4);
  ctx.stroke();
  ctx.fillStyle = "#6f797f";
  circle(ctx, -1.1, -0.55, 0.22);
  ctx.fill();
  circle(ctx, -1.1, 0.55, 0.22);
  ctx.fill();
  ctx.restore();
}

function drawSuperstructure(ctx) {
  // Schatten des Aufbaus
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  rr(ctx, -4.6, -2.75, 15.2, 6.1, 0.6);
  ctx.fill();

  // Hauptaufbau mit angeschrägter Brückenfront
  const g = ctx.createLinearGradient(0, -3, 0, 3);
  g.addColorStop(0, C.superLight);
  g.addColorStop(0.5, C.superstructure);
  g.addColorStop(1, C.superShadow);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-5, -2.9);
  ctx.lineTo(7.4, -2.9);
  ctx.lineTo(10.2, -1.6);
  ctx.lineTo(10.2, 1.6);
  ctx.lineTo(7.4, 2.9);
  ctx.lineTo(-5, 2.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.09;
  ctx.stroke();

  // Brückennocken
  ctx.fillStyle = C.superstructure;
  rr(ctx, 5.4, -3.55, 2.0, 0.75, 0.15);
  ctx.fill();
  ctx.stroke();
  rr(ctx, 5.4, 2.8, 2.0, 0.75, 0.15);
  ctx.fill();
  ctx.stroke();
  // Positionslaternen (Bb rot, Stb grün)
  ctx.fillStyle = "#ff3b30";
  circle(ctx, 6.4, -3.45, 0.2);
  ctx.fill();
  ctx.fillStyle = "#34e35a";
  circle(ctx, 6.4, 3.45, 0.2);
  ctx.fill();

  // Brückenfenster
  ctx.fillStyle = C.glass;
  ctx.beginPath();
  ctx.moveTo(7.6, -2.55);
  ctx.lineTo(9.85, -1.45);
  ctx.lineTo(9.85, 1.45);
  ctx.lineTo(7.6, 2.55);
  ctx.lineTo(7.2, 2.55);
  ctx.lineTo(9.35, 1.4);
  ctx.lineTo(9.35, -1.4);
  ctx.lineTo(7.2, -2.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.glassHi;
  ctx.lineWidth = 0.05;
  for (let i = -1.2; i <= 1.21; i += 0.6) {
    ctx.beginPath();
    ctx.moveTo(9.35, i);
    ctx.lineTo(9.85, i);
    ctx.stroke();
  }

  // Oberes Brückendeck (Peildeck)
  ctx.fillStyle = "#b5bdc2";
  ctx.beginPath();
  ctx.moveTo(-0.5, -2.2);
  ctx.lineTo(7.0, -2.2);
  ctx.lineTo(8.8, -1.2);
  ctx.lineTo(8.8, 1.2);
  ctx.lineTo(7.0, 2.2);
  ctx.lineTo(-0.5, 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();
  // Peilkompass und Optik
  ctx.fillStyle = "#3a4247";
  circle(ctx, 7.3, -1.3, 0.3);
  ctx.fill();
  circle(ctx, 7.3, 1.3, 0.3);
  ctx.fill();
  ctx.fillStyle = "#2a3034";
  rr(ctx, 7.6, -0.35, 0.8, 0.7, 0.15); // optischer Zielgeber
  ctx.fill();

  // Rettungsinseln (weiße Container) an den Seiten
  for (const y of [-2.55, 2.55]) {
    for (const x of [-4.2, -2.8, -1.4]) {
      ctx.fillStyle = "#d9dfe2";
      rr(ctx, x, y - 0.35, 1.15, 0.7, 0.33);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.strokeStyle = C.orange;
      ctx.beginPath();
      ctx.moveTo(x + 0.57, y - 0.35);
      ctx.lineTo(x + 0.57, y + 0.35);
      ctx.stroke();
    }
  }

  // Abgas-Schächte der Diesel
  for (const y of [-1.5, 1.5]) {
    ctx.fillStyle = "#3a4045";
    rr(ctx, -4.6, y - 0.55, 1.6, 1.1, 0.25);
    ctx.fill();
    ctx.fillStyle = "#141719";
    rr(ctx, -4.4, y - 0.35, 1.2, 0.7, 0.2);
    ctx.fill();
  }
}

function drawMast(ctx, t, radarAngle, domeAngle) {
  // Gittermast
  ctx.save();
  ctx.translate(2.6, 0);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  rr(ctx, -1.0, -1.0, 2.4, 2.4, 0.2);
  ctx.fill();
  ctx.strokeStyle = "#4b5459";
  ctx.lineWidth = 0.12;
  ctx.strokeRect(-1.1, -1.1, 2.2, 2.2);
  ctx.beginPath();
  ctx.moveTo(-1.1, -1.1);
  ctx.lineTo(1.1, 1.1);
  ctx.moveTo(1.1, -1.1);
  ctx.lineTo(-1.1, 1.1);
  ctx.stroke();
  // Rah mit Antennen
  ctx.fillStyle = "#59636a";
  rr(ctx, -0.2, -3.0, 0.4, 6.0, 0.15);
  ctx.fill();
  ctx.fillStyle = "#2c3236";
  for (const y of [-2.75, -1.9, 1.9, 2.75]) {
    circle(ctx, 0, y, 0.14);
    ctx.fill();
  }
  // Signalleinen zur Rah (fein)
  ctx.strokeStyle = "rgba(30,30,30,0.45)";
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(-6, -2.6);
  ctx.moveTo(0, 3);
  ctx.lineTo(-6, 2.6);
  ctx.stroke();
  // Topplicht
  ctx.fillStyle = "#fffbe0";
  circle(ctx, 0.8, 0, 0.17);
  ctx.fill();
  ctx.restore();

  // WM-27 Feuerleitradar im Radom (Kuppel rotiert langsam – sichtbare Nähte)
  ctx.save();
  ctx.translate(2.6, 0);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  circle(ctx, 0.35, 0.45, 1.55);
  ctx.fill();
  const rg = ctx.createRadialGradient(-0.5, -0.5, 0.2, 0, 0, 1.55);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.6, "#e3e8ea");
  rg.addColorStop(1, "#aeb6bb");
  ctx.fillStyle = rg;
  circle(ctx, 0, 0, 1.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.06;
  ctx.stroke();
  ctx.rotate(domeAngle);
  ctx.strokeStyle = "rgba(90,100,108,0.45)";
  ctx.lineWidth = 0.05;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // innenliegende Antenne schimmert durch
  ctx.fillStyle = "rgba(60,70,80,0.18)";
  rr(ctx, -0.15, -1.0, 0.3, 2.0, 0.1);
  ctx.fill();
  ctx.restore();

  // 3RM-20 Navigationsradar – schnell rotierende Balkenantenne auf Plattform
  ctx.save();
  ctx.translate(-0.4, 0);
  ctx.fillStyle = "#59636a";
  circle(ctx, 0, 0, 0.55);
  ctx.fill();
  ctx.rotate(radarAngle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  rr(ctx, -0.12, -2.0, 0.55, 4.1, 0.2);
  ctx.fill();
  ctx.fillStyle = "#dfe5e8";
  rr(ctx, -0.25, -1.95, 0.5, 3.9, 0.2);
  ctx.fill();
  ctx.fillStyle = "#9aa4aa";
  rr(ctx, -0.25, -1.95, 0.18, 3.9, 0.1);
  ctx.fill();
  ctx.fillStyle = "#3d454a";
  circle(ctx, 0, 0, 0.3);
  ctx.fill();
  ctx.restore();
}

function drawExocet(ctx) {
  // 4 MM38-Starter in zwei gekreuzten Paaren hinter dem Aufbau
  const pairs = [
    { x: -9.2, y: -0.2, a: -0.32 },
    { x: -9.2, y: 0.2, a: 0.32 },
  ];
  for (const pr of pairs) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(pr.a);
    for (const off of [-0.55, 0.55]) {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      rr(ctx, -2.75, off - 0.42, 6.0, 0.95, 0.2);
      ctx.fill();
      const g = ctx.createLinearGradient(0, off - 0.45, 0, off + 0.45);
      g.addColorStop(0, "#9aa3a9");
      g.addColorStop(0.5, "#848d93");
      g.addColorStop(1, "#666f75");
      ctx.fillStyle = g;
      rr(ctx, -3.0, off - 0.45, 6.0, 0.9, 0.18);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 0.05;
      ctx.stroke();
      // Verstärkungsringe
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      for (const rx of [-2.2, -0.6, 1.0, 2.4]) {
        ctx.beginPath();
        ctx.moveTo(rx, off - 0.45);
        ctx.lineTo(rx, off + 0.45);
        ctx.stroke();
      }
      // Frontdeckel
      ctx.fillStyle = "#3f474c";
      rr(ctx, 2.8, off - 0.38, 0.25, 0.76, 0.08);
      ctx.fill();
    }
    ctx.restore();
  }
  // Startgestell
  ctx.fillStyle = "#4f585e";
  rr(ctx, -10.0, -0.6, 1.6, 1.2, 0.2);
  ctx.fill();
}

function drawRhib(ctx, swing) {
  // Festrumpfschlauchboot im Davit (Steuerbord achtern), schwingt leicht
  ctx.save();
  ctx.translate(-17.2, 2.2);
  ctx.rotate(swing * 0.03);
  // Davitarm
  ctx.strokeStyle = "#42494e";
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  ctx.moveTo(-1.6, 1.2);
  ctx.lineTo(-1.6, -0.2);
  ctx.moveTo(1.6, 1.2);
  ctx.lineTo(1.6, -0.2);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0.2, 0.25, 2.6, 0.95, 0, 0, Math.PI * 2);
  ctx.fill();
  // Schlauch
  ctx.fillStyle = "#2f3438";
  ctx.beginPath();
  ctx.moveTo(-2.4, -0.8);
  ctx.lineTo(1.4, -0.8);
  ctx.quadraticCurveTo(2.7, -0.6, 2.7, 0);
  ctx.quadraticCurveTo(2.7, 0.6, 1.4, 0.8);
  ctx.lineTo(-2.4, 0.8);
  ctx.quadraticCurveTo(-2.6, 0, -2.4, -0.8);
  ctx.fill();
  // Innenraum
  ctx.fillStyle = "#5b646a";
  rr(ctx, -2.1, -0.45, 3.6, 0.9, 0.3);
  ctx.fill();
  ctx.fillStyle = "#1a1d20";
  rr(ctx, -2.5, -0.25, 0.4, 0.5, 0.08); // Außenborder
  ctx.fill();
  ctx.fillStyle = C.orange;
  rr(ctx, -0.4, -0.25, 0.6, 0.5, 0.1); // Konsole
  ctx.fill();
  ctx.restore();
}

function drawRam(ctx, angle) {
  // RAM-Starter Mk 49 (21 Zellen) am Heck
  ctx.save();
  ctx.translate(-21.5, 0);
  ctx.fillStyle = C.deckDark;
  circle(ctx, 0, 0, 1.75);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.fillStyle = "#4c555b";
  circle(ctx, 0, 0, 1.2);
  ctx.fill();
  ctx.rotate(angle);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  rr(ctx, -1.0, -1.05, 2.6, 2.3, 0.25);
  ctx.fill();
  // Seitliche Elektronikboxen
  ctx.fillStyle = "#8d969c";
  rr(ctx, -0.9, -1.45, 1.4, 0.4, 0.1);
  ctx.fill();
  rr(ctx, -0.9, 1.05, 1.4, 0.4, 0.1);
  ctx.fill();
  // Werferkasten
  const g = ctx.createLinearGradient(-1.2, 0, 1.4, 0);
  g.addColorStop(0, "#7c868c");
  g.addColorStop(1, "#b4bcc1");
  ctx.fillStyle = g;
  rr(ctx, -1.2, -1.05, 2.6, 2.1, 0.25);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // Zellenmündungen (3 x 7 versetzt)
  ctx.fillStyle = "#23282b";
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const y = -0.8 + col * 0.27 + (row % 2 ? 0.13 : 0);
      if (y > 0.85) continue;
      circle(ctx, 0.75 + row * 0.18, y, 0.1);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawFlag(ctx, t, phase) {
  // Bundesdienstflagge (Schwarz-Rot-Gold) am Heckflaggenstock, weht im Wind
  ctx.save();
  ctx.translate(-HL + 0.4, 0);
  ctx.fillStyle = "#c0c6ca";
  circle(ctx, 0, 0, 0.14);
  ctx.fill();
  const len = 2.4;
  const wid = 1.5;
  const segs = 8;
  const cols = ["#111111", "#dd0000", "#ffce00"];
  for (let band = 0; band < 3; band++) {
    ctx.fillStyle = cols[band];
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = -u * len;
      const wave = Math.sin(t * 7 + phase - u * 5) * 0.28 * u;
      const y0 = -wid / 2 + (band * wid) / 3 + wave;
      if (i === 0) ctx.moveTo(x, y0);
      else ctx.lineTo(x, y0);
    }
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const x = -u * len;
      const wave = Math.sin(t * 7 + phase - u * 5) * 0.28 * u;
      ctx.lineTo(x, -wid / 2 + ((band + 1) * wid) / 3 + wave);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Öffentliche API ----------

/**
 * Zeichnet das Boot. ctx muss auf Bootsmittelpunkt transformiert sein (Meter, Bug = +x).
 * anim: { t: Zeit (s), seed: Zahl pro Boot, speed: 0..1 }
 */
export function drawGepard(ctx, anim) {
  const t = anim.t;
  const s = anim.seed || 0;
  const ph = (s % 1000) / 159;

  // Bewegungen der Teile
  const radarAngle = t * 2.6 + ph; // ~25 U/min
  const domeAngle = t * 0.45 + ph * 2;
  const gunAngle =
    Math.sin(t * 0.21 + ph) * 1.25 + Math.sin(t * 0.53 + ph * 1.7) * 0.35; // Suchbewegung
  const ramAngle = Math.PI + Math.sin(t * 0.17 + ph * 3) * 1.4;
  const swing = Math.sin(t * 1.7 + ph);

  // Wasserlinien-Schatten
  ctx.save();
  ctx.translate(0.5, 0.8);
  ctx.fillStyle = "rgba(0,20,40,0.35)";
  hullPath(ctx, -0.2);
  ctx.fill();
  ctx.restore();

  // Rumpf (Bordwand sichtbar als dunkler Rand)
  ctx.fillStyle = C.hullDark;
  hullPath(ctx, 0);
  ctx.fill();
  // Deck
  const dg = ctx.createLinearGradient(0, -4, 0, 4);
  dg.addColorStop(0, "#86919a");
  dg.addColorStop(0.5, C.deck);
  dg.addColorStop(1, "#6c767e");
  ctx.fillStyle = dg;
  hullPath(ctx, 0.45);
  ctx.fill();
  // Kennung S 74 auf dem Vorschiff
  ctx.save();
  ctx.translate(20.2, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = "rgba(240,244,246,0.55)";
  ctx.font = "bold 1.5px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("74", 0, 0);
  ctx.restore();

  drawDeckFittings(ctx);
  drawRailing(ctx);
  drawRam(ctx, ramAngle);
  drawRhib(ctx, swing);
  drawExocet(ctx);
  drawSuperstructure(ctx);
  drawMast(ctx, t, radarAngle, domeAngle);
  drawGun(ctx, gunAngle, 0);
  drawFlag(ctx, t, ph);

  // Gösch / Bugflaggenstock
  ctx.fillStyle = "#c0c6ca";
  circle(ctx, HL - 1.0, 0, 0.12);
  ctx.fill();
}

// Abgas-Austrittspunkte (für Rauchpartikel), Bootskoordinaten
export const GEPARD_EXHAUSTS = [
  [-4.0, -1.5],
  [-4.0, 1.5],
];
export const GEPARD_LENGTH = L;
