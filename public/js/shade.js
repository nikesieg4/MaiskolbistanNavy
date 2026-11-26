// Gemeinsame Schattierung für realistischere Fahrzeuge:
// einheitliches Licht von oben links, Gebrauchsspuren (Schmutz, Rostschlieren, Salz), Kantenlicht.

let wearCanvas = null;
const patterns = new WeakMap(); // ctx -> CanvasPattern

function makeWear() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // feiner Schmutz
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const a = rnd() * 0.18;
    g.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
    g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // Flecken (Salz, Ölflecken)
  for (let i = 0; i < 40; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const r = 4 + rnd() * 16;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.6;
    gr.addColorStop(0, dark ? "rgba(30,25,20,0.16)" : "rgba(240,240,230,0.14)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rostschlieren (quer zur Längsachse, wie Abläufe von Speigatten)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    const len = 8 + rnd() * 24;
    const gr = g.createLinearGradient(x, y, x, y + len);
    gr.addColorStop(0, "rgba(120,60,25,0.22)");
    gr.addColorStop(1, "rgba(120,60,25,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, 1 + rnd() * 1.2, len);
  }
  return c;
}

function wearPattern(ctx) {
  let p = patterns.get(ctx);
  if (!p) {
    if (!wearCanvas) wearCanvas = makeWear();
    p = ctx.createPattern(wearCanvas, "repeat");
    patterns.set(ctx, p);
  }
  return p;
}

/**
 * Licht und Gebrauchsspuren über die Silhouette legen.
 * outline: Path2D in Fahrzeugkoordinaten; half: halbe Länge/Breite für den Lichtverlauf; heading: Kurs des
 * Fahrzeugs (damit das Licht in der Welt immer von oben links kommt); wear: Stärke der Gebrauchsspuren.
 */
export function finish(ctx, outline, halfL, halfB, heading = 0, wear = 1) {
  ctx.save();
  ctx.clip(outline);
  // Licht aus Weltrichtung oben links in Fahrzeugkoordinaten umrechnen
  const la = -2.36 - heading; // Richtung (−135°) relativ zum Fahrzeug
  const R = Math.hypot(halfL, halfB);
  const lx = Math.cos(la) * R;
  const ly = Math.sin(la) * R;
  const g = ctx.createLinearGradient(lx, ly, -lx, -ly);
  g.addColorStop(0, "rgba(255,255,255,0.13)");
  g.addColorStop(0.45, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = g;
  ctx.fillRect(-halfL - 2, -halfB - 2, halfL * 2 + 4, halfB * 2 + 4);
  if (wear > 0) {
    const p = wearPattern(ctx);
    p.setTransform(new DOMMatrix().scale(0.06));
    ctx.globalAlpha = 0.55 * wear;
    ctx.fillStyle = p;
    ctx.fillRect(-halfL - 2, -halfB - 2, halfL * 2 + 4, halfB * 2 + 4);
  }
  ctx.restore();
  // Kantenlicht oben links, Schattenkante unten rechts
  ctx.save();
  ctx.lineWidth = Math.max(0.12, halfB * 0.025);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.translate(Math.cos(la) * 0.12, Math.sin(la) * 0.12);
  ctx.stroke(outline);
  ctx.restore();
}

// Hilfsobjekt: zeichnet eine bestehende Pfadfunktion (ctx-basiert) in ein Path2D
export function pathFrom(fn) {
  const p = new Path2D();
  const proxy = {
    beginPath() {},
    moveTo: (...a) => p.moveTo(...a),
    lineTo: (...a) => p.lineTo(...a),
    bezierCurveTo: (...a) => p.bezierCurveTo(...a),
    quadraticCurveTo: (...a) => p.quadraticCurveTo(...a),
    arc: (...a) => p.arc(...a),
    ellipse: (...a) => p.ellipse(...a),
    roundRect: (...a) => p.roundRect(...a),
    rect: (...a) => p.rect(...a),
    closePath: () => p.closePath(),
  };
  fn(proxy);
  return p;
}

// Zylinder-Schattierung quer zur Längsachse (Rümpfe von Hubschraubern, Flugkörpern)
export function cylinder(ctx, y0, y1, base, light = 0.35, dark = 0.35) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(255,255,255,${light})`);
  g.addColorStop(0.35, "rgba(255,255,255,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0.05)");
  g.addColorStop(1, `rgba(0,0,0,${dark})`);
  return g;
}
