// Tageszeit und Wetter (nur Darstellung): Wolkenschatten, Nacht mit Lichtquellen, Nebel, Regen, Gewitter.
import { WEATHER, dayLight } from "../shared/sim.js";

const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Wolkenschatten auf dem Wasser (Weltkoordinaten), treiben mit dem Wind nach Osten
export function drawCloudShadows(ctx, view, F, t) {
  if (!F || F.cloud < 0.2) return;
  const cell = 1400;
  const drift = t * 6;
  const x0 = Math.floor((view.x0 - drift) / cell) - 1;
  const x1 = Math.floor((view.x1 - drift) / cell) + 1;
  const y0 = Math.floor(view.y0 / cell) - 1;
  const y1 = Math.floor(view.y1 / cell) + 1;
  const a = 0.16 * (F.cloud - 0.15);
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      const id = gx * 7349 + gy * 3571;
      if (rnd(id) > F.cloud) continue;
      const cx = gx * cell + rnd(id + 1) * cell + drift;
      const cy = gy * cell + rnd(id + 2) * cell;
      const r = 300 + rnd(id + 3) * 500;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(5,15,30,${a})`);
      g.addColorStop(1, "rgba(5,15,30,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
}

// Seegang: zusätzliche Schaumkronen bei Sturm (Weltkoordinaten)
export function drawWhitecaps(ctx, view, F, t) {
  if (!F || F.sea >= 0.99) return;
  const k = Math.min(1, (1 - F.sea) * 5);
  const cell = 55;
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  const x0 = Math.floor(view.x0 / cell);
  const y0 = Math.floor(view.y0 / cell);
  const nx = Math.min(80, Math.ceil((view.x1 - view.x0) / cell) + 1);
  const ny = Math.min(80, Math.ceil((view.y1 - view.y0) / cell) + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const id = (x0 + i) * 9173 + (y0 + j) * 1237;
      const life = (t * 0.5 + rnd(id)) % 1;
      if (rnd(id + 5) > 0.35 * k + 0.05 || life > 0.6) continue;
      const x = (x0 + i) * cell + rnd(id + 1) * cell + t * 3;
      const y = (y0 + j) * cell + rnd(id + 2) * cell;
      const L = 8 + rnd(id + 3) * 14;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + L / 2, y - 3, x + L, y);
    }
  }
  ctx.stroke();
}

let lightCanvas = null;
// Bildschirm-Überlagerung: Nacht (mit ausgestanzten Lichtern), Nebel, Regen, Blitze.
// lights: [{ sx, sy, r }] in Bildschirmpixeln
export function drawAtmosphere(ctx, w, h, dpr, F, t, lights) {
  if (!F) return;
  const night = F.night;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Nacht: dunkelblaue Ebene, Lichter schneiden Löcher hinein
  const dark = night * 0.68 + F.cloud * 0.08 + (F.rain > 0.8 ? 0.08 : 0);
  if (dark > 0.02) {
    if (!lightCanvas) lightCanvas = document.createElement("canvas");
    if (lightCanvas.width !== Math.round(w) || lightCanvas.height !== Math.round(h)) {
      lightCanvas.width = Math.round(w);
      lightCanvas.height = Math.round(h);
    }
    const g = lightCanvas.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(4,10,28,${Math.min(0.85, dark)})`;
    g.fillRect(0, 0, w, h);
    if (night > 0.05) {
      g.globalCompositeOperation = "destination-out";
      for (const L of lights) {
        const rg = g.createRadialGradient(L.sx, L.sy, 0, L.sx, L.sy, L.r);
        rg.addColorStop(0, `rgba(0,0,0,${(L.a ?? 0.9) * night})`);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg;
        g.fillRect(L.sx - L.r, L.sy - L.r, L.r * 2, L.r * 2);
      }
    }
    ctx.drawImage(lightCanvas, 0, 0, w, h);
    // warmer Schein der Lichter
    if (night > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      for (const L of lights) {
        if (!L.glow) continue;
        const rg = ctx.createRadialGradient(L.sx, L.sy, 0, L.sx, L.sy, L.r * 0.5);
        rg.addColorStop(0, `rgba(255,190,110,${0.18 * night})`);
        rg.addColorStop(1, "rgba(255,190,110,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(L.sx - L.r, L.sy - L.r, L.r * 2, L.r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }
  // Nebel: zur Mitte hin klar, außen milchig
  if (F.fog > 0.05) {
    const R = Math.max(w, h) * (0.75 - F.fog * 0.45);
    const fg = ctx.createRadialGradient(w / 2, h / 2, R * 0.25, w / 2, h / 2, R);
    const c = night > 0.5 ? "120,130,150" : "205,212,218";
    fg.addColorStop(0, `rgba(${c},${F.fog * 0.15})`);
    fg.addColorStop(1, `rgba(${c},${Math.min(0.85, F.fog * 0.9)})`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, w, h);
  }
  // Regen: schräge Striche
  if (F.rain > 0.05) {
    const n = Math.round(260 * F.rain);
    ctx.strokeStyle = `rgba(200,215,230,${0.22 + F.rain * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 0.7 + rnd(i) * 0.6;
      const x = (rnd(i + 0.3) * (w + 200) + t * 120 * sp) % (w + 200) - 100;
      const y = (rnd(i + 0.7) * (h + 200) + t * 900 * sp) % (h + 200) - 100;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5 - F.rain * 6, y - 18 - F.rain * 10);
    }
    ctx.stroke();
  }
  // Gewitter: seltene Blitze
  if (F.rain > 0.8) {
    const slot = Math.floor(t / 7);
    const ph = t - slot * 7;
    if (rnd(slot * 3.7) > 0.45 && ph < 0.35 && (ph < 0.08 || (ph > 0.18 && ph < 0.24))) {
      ctx.fillStyle = "rgba(230,235,255,0.35)";
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

// Uhrzeit und Wetter als Text, z. B. "14:20 · Regen"
export function envLabel(env) {
  if (!env) return "";
  const hh = Math.floor(env.h);
  const mm = Math.floor((env.h - hh) * 60);
  const w = WEATHER[env.k < 0.5 ? env.p : env.w];
  const dl = dayLight(env.h);
  const icon = dl < 0.3 ? "🌙" : w.key === "klar" ? "☀" : w.key === "wolkig" ? "☁" : w.key === "regen" ? "🌧" : w.key === "nebel" ? "🌫" : "⛈";
  return `${icon} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${w.label}`;
}
