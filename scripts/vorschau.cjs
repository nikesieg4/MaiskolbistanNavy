// Erzeugt die Vorschaubilder für spiele.maiskolbistan.app aus den echten Spielgrafiken.
// Aufruf (lokaler Server muss laufen: npm run dev):
//   node scripts/vorschau.cjs [http://localhost:8787]
// Ergebnis: public/vorschau.jpg (1200 × 1200, Inhalt im Mittelband) und public/vorschau_breit.jpg (1200 × 600)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.argv[2] || "http://localhost:8787";

async function render(page, W, H) {
  return page.evaluate(
    async ([W, H]) => {
      const { drawGepard } = await import("/js/gepard.js");
      const { drawCarrier } = await import("/js/carrier.js");
      const { drawBlackhawk, drawBlackhawkShadow } = await import("/js/heli.js");
      const { TEAMS, mulberry32 } = await import("/shared/sim.js");
      const MAIS = TEAMS[0].flag;
      const PAPRIKA = TEAMS[1].flag;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");
      const rnd = mulberry32(12);
      const cx = W / 2;
      const cy = H / 2;
      const big = H >= 1000;
      const S = big ? 4.3 : 3.0; // Pixel pro Meter

      // ---------- Meer ----------
      const sea = g.createLinearGradient(0, 0, W, H);
      sea.addColorStop(0, "#1d6aa0");
      sea.addColorStop(1, "#124d7c");
      g.fillStyle = sea;
      g.fillRect(0, 0, W, H);
      g.lineCap = "round";
      for (let i = 0; i < 900; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        const l = 12 + rnd() * 34;
        g.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.06})`;
        g.lineWidth = 1.5 + rnd() * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + l / 2, y - 4, x + l, y);
        g.stroke();
      }

      // ---------- Insel unten rechts mit Maisfeld ----------
      const island = (ix, iy, r, seed) => {
        const rr = mulberry32(seed);
        const harm = [2, 3, 4, 5].map((k) => ({ k, a: (rr() * 0.2) / k, p: rr() * 6.28 }));
        const R = (a, off) => r * (1 + harm.reduce((s, h) => s + h.a * Math.sin(h.k * a + h.p), 0)) + off;
        const path = (off) => {
          g.beginPath();
          for (let i = 0; i <= 120; i++) {
            const a = (i / 120) * Math.PI * 2;
            g.lineTo(ix + Math.cos(a) * R(a, off), iy + Math.sin(a) * R(a, off));
          }
          g.closePath();
        };
        g.fillStyle = "rgba(40,120,160,0.4)";
        path(120);
        g.fill();
        g.fillStyle = "rgba(70,170,190,0.6)";
        path(50);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.55)";
        g.lineWidth = 5;
        path(6);
        g.stroke();
        g.fillStyle = "#e3d39a";
        path(0);
        g.fill();
        g.fillStyle = "#5e9a4a";
        path(-34);
        g.fill();
        g.save();
        path(-34);
        g.clip();
        g.translate(ix - r * 0.1, iy - r * 0.15);
        g.rotate(0.5);
        g.fillStyle = "#9fae3c";
        g.fillRect(-r * 0.45, -r * 0.25, r * 0.9, r * 0.5);
        g.strokeStyle = "#e8c53a";
        g.lineWidth = 4;
        for (let y = -r * 0.25; y < r * 0.25; y += 10) {
          g.beginPath();
          g.moveTo(-r * 0.45, y);
          g.lineTo(r * 0.45, y);
          g.stroke();
        }
        g.restore();
        for (let i = 0; i < 40; i++) {
          const a = rr() * 6.28;
          const d = Math.sqrt(rr()) * (r - 60);
          const tx = ix + Math.cos(a) * d;
          const ty = iy + Math.sin(a) * d;
          if (Math.abs(tx - (ix - r * 0.1)) < r * 0.4 && Math.abs(ty - (iy - r * 0.15)) < r * 0.3) continue;
          const tr = 10 + rr() * 14;
          g.fillStyle = "rgba(20,40,15,0.35)";
          g.beginPath();
          g.arc(tx + 5, ty + 6, tr, 0, 6.28);
          g.fill();
          g.fillStyle = rr() > 0.5 ? "#2f6b2c" : "#3b7a33";
          g.beginPath();
          g.arc(tx, ty, tr, 0, 6.28);
          g.fill();
        }
      };
      island(W * 0.93, H * 0.86, H * 0.3, 7);
      island(W * 0.04, H * 0.08, H * 0.2, 19);

      const at = (x, y, h, s, fn) => {
        g.save();
        g.translate(x, y);
        g.rotate(h);
        g.scale(s, s);
        fn();
        g.restore();
      };

      // ---------- Kielwasser ----------
      const wake = (x, y, h, len, width) => {
        const bx = x - Math.cos(h) * len;
        const by = y - Math.sin(h) * len;
        const grad = g.createLinearGradient(x, y, bx, by);
        grad.addColorStop(0, "rgba(240,250,255,0.65)");
        grad.addColorStop(1, "rgba(240,250,255,0)");
        g.strokeStyle = grad;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(bx, by);
        g.stroke();
        const nx = -Math.sin(h);
        const ny = Math.cos(h);
        g.lineWidth = 2.5;
        for (const sd of [-1, 1]) {
          g.strokeStyle = "rgba(220,240,255,0.25)";
          g.beginPath();
          g.moveTo(x + nx * sd * width * 0.6, y + ny * sd * width * 0.6);
          g.lineTo(x - Math.cos(h) * len * 0.55 + nx * sd * len * 0.2, y - Math.sin(h) * len * 0.55 + ny * sd * len * 0.2);
          g.stroke();
        }
      };

      // Träger (Maiskolbistan) quer durchs Bild
      const carH = -0.32;
      const carX = cx;
      const carY = cy + H * 0.03;
      const cs = Math.cos(carH);
      const sn = Math.sin(carH);
      wake(carX - cs * 91 * S, carY - sn * 91 * S, carH, 260 * S * 0.5, 22 * S * 0.5);
      // Gepard (Paprikistan) unten links, feuert
      const gpH = -1.05;
      const gpX = cx - W * 0.37;
      const gpY = cy + H * (big ? 0.1 : 0.13);
      wake(gpX - Math.cos(gpH) * 29 * S, gpY - Math.sin(gpH) * 29 * S, gpH, 120 * S, 7 * S);
      // Gepard (Maiskolbistan) oben rechts als Geleitschutz
      const g2H = -0.45;
      const g2X = cx + W * 0.37;
      const g2Y = cy - H * (big ? 0.03 : 0.07);
      wake(g2X - Math.cos(g2H) * 29 * S, g2Y - Math.sin(g2H) * 29 * S, g2H, 110 * S, 7 * S);

      at(carX, carY, carH, S, () => drawCarrier(g, { t: 2.2, seed: 5, ram: 0.6, flag: MAIS, spots: new Set([1, 3]) }));
      // Black Hawks auf Deck (Landepunkte 2 und 4)
      for (const sp of [{ x: 38, y: -4, t: 0.3 }, { x: -14, y: -4, t: 0.8 }]) {
        const hx = carX + (sp.x * cs - sp.y * sn) * S;
        const hy = carY + (sp.x * sn + sp.y * cs) * S;
        at(hx, hy, carH, S, () => drawBlackhawk(g, { t: sp.t, seed: 2, flag: MAIS }));
      }
      at(gpX, gpY, gpH, S, () => drawGepard(g, { t: 1.4, seed: 77, gun: 0.9, ram: 0.3, exo: [false, true, true, true], flag: PAPRIKA }));
      at(g2X, g2Y, g2H, S, () => drawGepard(g, { t: 3.1, seed: 31, gun: 2.3, ram: -0.5, flag: MAIS }));

      // ---------- Exocet (Paprika) auf dem Weg zum Träger, RAM fängt ab ----------
      const trail = (pts, w0, w1, a) => {
        for (let i = 1; i < pts.length; i++) {
          const k = i / pts.length;
          g.strokeStyle = `rgba(235,238,240,${a * (0.25 + 0.75 * k)})`;
          g.lineWidth = w1 + (w0 - w1) * (1 - k);
          g.beginPath();
          g.moveTo(pts[i - 1][0], pts[i - 1][1]);
          g.lineTo(pts[i][0], pts[i][1]);
          g.stroke();
        }
      };
      const ex0 = [gpX + 6 * S, gpY - 14 * S];
      const ex1 = [cx - W * 0.2, cy + H * 0.0];
      const exPts = [];
      for (let i = 0; i <= 30; i++) {
        const k = i / 30;
        exPts.push([ex0[0] + (ex1[0] - ex0[0]) * k + Math.sin(k * 3) * 14, ex0[1] + (ex1[1] - ex0[1]) * k - Math.sin(k * 3.1) * 30]);
      }
      trail(exPts, 26, 6, 0.55);
      const exH = Math.atan2(ex1[1] - exPts[28][1], ex1[0] - exPts[28][0]);
      // zweite Exocet wird gerade abgefangen
      const boom = [cx - W * 0.22, cy - H * (big ? 0.11 : 0.13)];
      const ex2 = [];
      for (let i = 0; i <= 24; i++) {
        const k = i / 24;
        ex2.push([ex0[0] + (boom[0] - ex0[0]) * k - Math.sin(k * 3) * 30, ex0[1] + (boom[1] - ex0[1]) * k]);
      }
      trail(ex2, 26, 6, 0.45);
      // RAM-Spur vom Heck des Trägers
      const ramStart = [carX + (-84 * cs - 9 * sn) * S, carY + (-84 * sn + 9 * cs) * S];
      const ramPts = [];
      for (let i = 0; i <= 24; i++) {
        const k = i / 24;
        ramPts.push([ramStart[0] + (boom[0] - ramStart[0]) * k, ramStart[1] + (boom[1] - ramStart[1]) * k - Math.sin(k * Math.PI) * 60]);
      }
      trail(ramPts, 14, 3, 0.5);

      const exocet = (x, y, h, s) =>
        at(x, y, h, s, () => {
          g.fillStyle = "rgba(255,190,70,0.9)";
          g.beginPath();
          g.moveTo(-2.5, -0.3);
          g.lineTo(-6.5, 0);
          g.lineTo(-2.5, 0.3);
          g.fill();
          g.fillStyle = "#9aa3a8";
          g.beginPath();
          g.moveTo(0.4, 0);
          g.lineTo(-0.9, -1);
          g.lineTo(-1.4, -1);
          g.lineTo(-1.1, 0);
          g.lineTo(-1.4, 1);
          g.lineTo(-0.9, 1);
          g.closePath();
          g.fill();
          g.fillStyle = "#eef1f2";
          g.beginPath();
          g.roundRect(-2.6, -0.22, 4.6, 0.44, 0.2);
          g.fill();
          g.fillStyle = "#3b4246";
          g.beginPath();
          g.moveTo(2, -0.22);
          g.quadraticCurveTo(2.8, 0, 2, 0.22);
          g.fill();
        });
      exocet(ex1[0], ex1[1], exH, S * 2.2);

      // Abfang-Explosion
      const fire = (x, y, r) => {
        const fg = g.createRadialGradient(x, y, 0, x, y, r);
        fg.addColorStop(0, "rgba(255,255,235,1)");
        fg.addColorStop(0.3, "rgba(255,210,90,0.95)");
        fg.addColorStop(0.65, "rgba(240,110,30,0.75)");
        fg.addColorStop(1, "rgba(200,60,20,0)");
        g.fillStyle = fg;
        g.beginPath();
        g.arc(x, y, r, 0, 6.28);
        g.fill();
      };
      for (let i = 0; i < 14; i++) {
        const a = rnd() * 6.28;
        const d = rnd() * 40;
        g.fillStyle = `rgba(40,40,40,${0.25 + rnd() * 0.25})`;
        g.beginPath();
        g.arc(boom[0] + Math.cos(a) * d + 20, boom[1] + Math.sin(a) * d + 10, 14 + rnd() * 18, 0, 6.28);
        g.fill();
      }
      fire(boom[0], boom[1], 70);
      g.strokeStyle = "rgba(255,240,210,0.6)";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(boom[0], boom[1], 95, 0, 6.28);
      g.stroke();
      // Mündungsfeuer des Geleit-Gepard
      const mz = [g2X + Math.cos(g2H) * 16.5 * S + Math.cos(g2H + 2.3) * 6.5 * S, g2Y + Math.sin(g2H) * 16.5 * S + Math.sin(g2H + 2.3) * 6.5 * S];
      fire(mz[0], mz[1], 26);

      // ---------- Black Hawk im Flug mit Hellfire-Start ----------
      const hkX = cx + W * 0.2;
      const hkY = cy - H * (big ? 0.13 : 0.17);
      const hkH = -2.55;
      at(hkX + 26, hkY + 40, hkH, S * 1.5, () => drawBlackhawkShadow(g, 0.28));
      const hfPts = [];
      for (let i = 0; i <= 16; i++) {
        const k = i / 16;
        hfPts.push([hkX + Math.cos(hkH) * k * 260, hkY + Math.sin(hkH) * k * 260 + Math.sin(k * 3) * 10]);
      }
      trail(hfPts, 4, 12, 0.5);
      at(hkX, hkY, hkH, S * 1.5, () => drawBlackhawk(g, { t: 0.55, seed: 9, hf: 6, gunner: 1.6, flag: MAIS }));

      // ---------- Titel ----------
      const titleY = big ? H * 0.235 : H * 0.15;
      const tag = big ? 30 : 24;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `800 ${tag}px system-ui, sans-serif`;
      const sub = "REPUBLIK MAISKOLBISTAN";
      const sw = g.measureText(sub).width;
      const fw = tag * 1.4;
      const fx = cx - sw / 2 - fw / 2 - 8;
      const fy = titleY - (big ? 86 : 64);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = MAIS.colors[i];
        g.fillRect(fx - fw / 2 + (i * fw) / 3, fy - fw * 0.3, fw / 3 + 0.5, fw * 0.6);
      }
      g.lineWidth = 6;
      g.strokeStyle = "rgba(20,12,8,0.7)";
      g.strokeText(sub, cx + fw / 2 + 4, fy);
      g.fillStyle = "#f1c94b";
      g.fillText(sub, cx + fw / 2 + 4, fy);
      g.font = `900 ${big ? 86 : 80}px system-ui, sans-serif`;
      g.lineJoin = "round";
      g.lineWidth = big ? 18 : 14;
      g.strokeStyle = "#1b1410";
      const title1 = "Multiplayer ";
      const title2 = "Seegefecht";
      const w1 = g.measureText(title1).width;
      const w2 = g.measureText(title2).width;
      const tx = cx - (w1 + w2) / 2;
      g.textAlign = "left";
      g.strokeText(title1 + title2, tx, titleY);
      g.fillStyle = "#ffffff";
      g.fillText(title1, tx, titleY);
      g.fillStyle = "#f1c94b";
      g.fillText(title2, tx + w1, titleY);

      // Schlagwortleiste
      const pill = "Frontkarte · Sensorkrieg · Träger · Drohnen";
      g.font = `800 ${big ? 34 : 26}px system-ui, sans-serif`;
      g.textAlign = "center";
      const pw = g.measureText(pill).width + 56;
      const ph = big ? 64 : 50;
      const py = big ? H * 0.79 : H * 0.87;
      g.fillStyle = "rgba(10,10,10,0.35)";
      g.beginPath();
      g.roundRect(cx - pw / 2 + 4, py - ph / 2 + 6, pw, ph, 12);
      g.fill();
      g.fillStyle = "#7A0F1A";
      g.strokeStyle = "#C9A227";
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(cx - pw / 2, py - ph / 2, pw, ph, 12);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.fillText(pill, cx, py + 2);
      return c.toDataURL("image/jpeg", 0.88);
    },
    [W, H]
  );
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL);
  const out = path.join(__dirname, "..", "public");
  for (const [name, W, H] of [
    ["vorschau.jpg", 1200, 1200],
    ["vorschau_breit.jpg", 1200, 600],
  ]) {
    const data = await render(page, W, H);
    fs.writeFileSync(path.join(out, name), Buffer.from(data.split(",")[1], "base64"));
    console.log("geschrieben:", name);
  }
  await browser.close();
})();
