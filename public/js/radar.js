// Radar-Rundumsuche: PPI-Radarbild (Bildschirmkoordinaten) mit rotierendem Strahl,
// nachleuchtenden Kontakten, Entfernungsringen, Peilskala und Lock-Markierung.

export const SWEEP_PERIOD = 2.4; // s pro Umdrehung
const TAU = Math.PI * 2;
const painted = new Map(); // id -> { x, y, t } Weltposition beim letzten Überstreichen
let lastSweep = null;

// Strahlwinkel in Bildschirmkoordinaten (0 = rechts, im Uhrzeigersinn), Start bei Nord
export function sweepAngle(t) {
  return ((t / SWEEP_PERIOD) * TAU - Math.PI / 2) % TAU;
}

const norm = (a) => ((a % TAU) + TAU) % TAU;

// Kontakte „malen“, wenn der Strahl über sie hinwegstreicht
export function updateContacts(me, others, t) {
  const a1 = norm(sweepAngle(t));
  if (lastSweep === null || !me) {
    lastSweep = a1;
    return;
  }
  const a0 = lastSweep;
  const span = norm(a1 - a0);
  for (const o of others) {
    const b = norm(Math.atan2(o.y - me.y, o.x - me.x));
    if (norm(b - a0) <= span) painted.set(o.id, { x: o.x, y: o.y, t });
  }
  lastSweep = a1;
  for (const [id, p] of painted) if (t - p.t > SWEEP_PERIOD * 2) painted.delete(id);
}

export function resetContacts() {
  painted.clear();
  lastSweep = null;
}

// Kontakt in der Nähe des Mauszeigers (für Hover-Hinweis)
export function hoveredContact(o, mouse) {
  if (!mouse) return null;
  let best = null;
  let bestD = 28;
  for (const c of o.others) {
    if (o.isFriend && o.isFriend(c.id)) continue;
    const sx = o.cx + (c.x - o.me.x) * o.zoom;
    const sy = o.cy + (c.y - o.me.y) * o.zoom;
    const d = Math.hypot(sx - mouse.x, sy - mouse.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * o: { w, h, cx, cy, zoom, k (0..1 Einblendung), t, startT, me, others, lockId, lockT, names, lockRange, mouse }
 */
export function drawRadar(ctx, o) {
  const { w, h, cx, cy, zoom, k, t } = o;
  const G = (a) => `rgba(90,255,150,${a * k})`;
  const R = o.lockRange * zoom;

  ctx.save();
  // Grüner Schleier über der Welt, außerhalb des Radarkreises dunkler
  ctx.fillStyle = `rgba(0,22,12,${0.62 * k})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.arc(cx, cy, R + 30, 0, TAU, true);
  ctx.fill("evenodd");

  // Scanlinien
  ctx.fillStyle = `rgba(120,255,170,${0.035 * k})`;
  for (let y = (t * 40) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);

  // Entfernungsringe (1 km) und Achsen
  ctx.lineWidth = 1;
  ctx.font = "600 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (let km = 1; km <= o.lockRange / 1000; km++) {
    const r = km * 1000 * zoom;
    const outer = km * 1000 === o.lockRange;
    ctx.strokeStyle = outer ? `rgba(255,90,80,${0.65 * k})` : G(0.28);
    ctx.setLineDash(outer ? [8, 6] : []);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = outer ? `rgba(255,120,110,${0.9 * k})` : G(0.6);
    // Beschriftung am Ring, leicht oberhalb der Ostachse
    const la = -0.22;
    ctx.fillText(outer ? `${km} km Lock` : `${km} km`, cx + Math.cos(la) * r + 3, cy + Math.sin(la) * r - 2);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = G(0.18);
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // Peilskala (0° = Nord)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let deg = 0; deg < 360; deg += 5) {
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    const long = deg % 30 === 0;
    const r0 = R + 6;
    const r1 = R + (long ? 16 : deg % 10 === 0 ? 11 : 8);
    ctx.strokeStyle = G(long ? 0.8 : 0.4);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
    if (long) {
      ctx.fillStyle = G(0.85);
      ctx.fillText(String(deg).padStart(3, "0"), cx + Math.cos(a) * (R + 30), cy + Math.sin(a) * (R + 30));
    }
  }

  // Strahl mit nachleuchtendem Fächer
  const a = sweepAngle(t);
  const wedge = 1.1;
  const cg = ctx.createConicGradient(a - wedge, cx, cy);
  const f = wedge / TAU;
  cg.addColorStop(0, "rgba(90,255,150,0)");
  cg.addColorStop(f * 0.98, `rgba(90,255,150,${0.32 * k})`);
  cg.addColorStop(f, "rgba(90,255,150,0)");
  cg.addColorStop(1, "rgba(90,255,150,0)");
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = G(0.95);
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(90,255,150,0.9)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Einschalt-Impuls
  const since = t - o.startT;
  if (since >= 0 && since < 1.0) {
    const p = since / 1.0;
    ctx.strokeStyle = `rgba(170,255,200,${(1 - p) * k})`;
    ctx.lineWidth = 3 + (1 - p) * 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R * Math.sqrt(p) * 1.05, 0, TAU);
    ctx.stroke();
  }

  // Kontakte (nachleuchtend)
  const toS = (x, y) => [cx + (x - o.me.x) * zoom, cy + (y - o.me.y) * zoom];
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 11px ui-monospace, Menlo, monospace";
  for (const c of o.others) {
    const p = painted.get(c.id);
    if (!p) continue;
    const age = t - p.t;
    const glow = Math.max(0, 1 - age / (SWEEP_PERIOD * 1.15));
    if (glow <= 0) continue;
    const [sx, sy] = toS(p.x, p.y);
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
    // Eigene Schiffe blau, Gegner grün
    const friend = o.isFriend && o.isFriend(c.id);
    const rgb = friend ? "110,190,255" : "90,255,150";
    gr.addColorStop(0, `rgba(${friend ? "210,235,255" : "200,255,215"},${glow * k})`);
    gr.addColorStop(0.3, `rgba(${rgb},${0.7 * glow * k})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, TAU);
    ctx.fill();
    const dist = Math.hypot(c.x - o.me.x, c.y - o.me.y);
    ctx.fillStyle = friend ? `rgba(150,210,255,${(0.4 + 0.6 * glow) * k})` : G(0.4 + 0.6 * glow);
    ctx.fillText(`${friend ? "◆ " : ""}${o.names.get(c.id) || "?"}  ${(dist / 1000).toFixed(1)} km`, sx + 12, sy - 10);
  }

  // Eigenes Boot
  ctx.fillStyle = `rgba(255,215,94,${k})`;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(o.me.h);
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-6, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Hover-Hinweis
  const hov = hoveredContact(o, o.mouse);
  if (hov && hov.id !== o.lockId) {
    const [sx, sy] = toS(hov.x, hov.y);
    ctx.strokeStyle = G(0.9);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = G(1);
    ctx.fillText("R / Klick: Lock", sx + 22, sy + 12);
  }

  // Lock-Ziel
  const lt = o.others.find((c) => c.id === o.lockId);
  if (lt) {
    const [sx, sy] = toS(lt.x, lt.y);
    const locked = o.lockT >= 1;
    ctx.strokeStyle = locked ? `rgba(255,70,60,${k})` : `rgba(255,215,94,${k})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(sx, sy);
    if (locked) {
      const r = 16 + Math.sin(t * 8) * 1.5;
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(ax * r, ay * (r - 7));
        ctx.lineTo(ax * r, ay * r);
        ctx.lineTo(ax * (r - 7), ay * r);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,90,80,${k})`;
      ctx.font = "800 12px ui-monospace, Menlo, monospace";
      ctx.fillText("LOCK", 22, 14);
    } else {
      ctx.rotate(t * 3);
      const r = 16 + (1 - o.lockT) * 22;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(0, 0, r, -0.4, 0.4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
