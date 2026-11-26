// Zeichnet jedes Fahrzeug nach Typ (Ursprung = Fahrzeugmitte, Bug/Nase = +x).
import { BOATS, WEAPONS } from "../shared/sim.js";
import { drawGepard, GEPARD_EXHAUSTS, hullPath as gepardHull } from "./gepard.js";
import { drawCarrier, CARRIER_EXHAUSTS, hullPath as carrierHull } from "./carrier.js";
import { drawBlackhawk, drawBlackhawkShadow, fuselagePath } from "./heli.js";
import { drawK130, drawF124, drawCyclone, drawLCS, drawBurke, EXHAUSTS, hullPath, lcsOutline } from "./warships.js";
import { drawNH90, drawNH90Shadow, drawHeron, drawReaper, drawDroneShadow, nhPath } from "./aircraft.js";
import { finish, pathFrom } from "./shade.js";

// Umrisse für Licht und Gebrauchsspuren (einmal erzeugt)
const OUTLINES = {
  gepard: pathFrom((c) => gepardHull(c, 0)),
  carrier: pathFrom((c) => carrierHull(c, 0)),
  k130: pathFrom((c) => hullPath(c, 89, 13.3, 0, 0.6)),
  f124: pathFrom((c) => hullPath(c, 143, 17.4, 0, 0.6)),
  cyclone: pathFrom((c) => hullPath(c, 54.6, 7.9, 0, 0.55)),
  burke: pathFrom((c) => hullPath(c, 155, 20, 0, 0.55, 0.85)),
  lcs: pathFrom((c) => lcsOutline(c)),
  blackhawk: pathFrom((c) => fuselagePath(c)),
  nh90: pathFrom((c) => nhPath(c)),
};
const WEAR = { blackhawk: 0.6, nh90: 0.6 };

function shadeVehicle(ctx, type, def, heading) {
  const o = OUTLINES[type];
  if (!o) return;
  const halfL = type === "blackhawk" || type === "nh90" ? 11 : def.length / 2;
  const halfB = type === "blackhawk" || type === "nh90" ? 2 : def.beam / 2;
  finish(ctx, o, halfL, halfB, heading || 0, WEAR[type] ?? 1);
}

/**
 * anim: { t, seed, gun, ram, flag, radarAngle, domeAngle, ammo (Waffenstatus vom Server, nur eigenes Fahrzeug), gunner }
 */
export function drawVehicle(ctx, type, anim) {
  const def = BOATS[type];
  // Bewaffnung: eigene (vom Server) oder Standard; bei Luftfahrzeugen bestimmt der letzte Platz die Außenlast
  const weapons = anim.weapons || (anim.pod ? [...def.weapons.slice(0, -1), anim.pod] : def.weapons);
  // Seezielflugkörper-Zellen (leer = abgefeuert) aus dem Waffenstatus
  const ssmIdx = weapons.findIndex((w) => WEAPONS[w]?.kind === "ssm");
  const exo = anim.ammo && ssmIdx >= 0 && Array.isArray(anim.ammo[ssmIdx]) ? anim.ammo[ssmIdx].map((v) => v <= 0) : undefined;
  const air = weapons.findIndex((w) => ["agm", "arm", "sam", "rkt", "jam"].includes(WEAPONS[w]?.kind) && def.kind !== "ship");
  const n = anim.ammo && air >= 0 && anim.ammo[air] ? anim.ammo[air][0] : undefined;
  const pod = def.kind !== "ship" ? weapons[weapons.length - 1] : undefined;
  const a = { ...anim, exo, n: pod === "jammer" ? undefined : n, pod, ssmCells: def.ssm };
  drawBody(ctx, type, def, a);
  if (type === "america") {
    ctx.save();
    ctx.scale(def.drawScale[0], def.drawScale[1]);
    finish(ctx, OUTLINES.carrier, 91, 15, anim.h || 0, 1);
    ctx.restore();
  } else shadeVehicle(ctx, type, def, anim.h);
}

function drawBody(ctx, type, def, a) {
  switch (type) {
    case "gepard":
      return drawGepard(ctx, a);
    case "carrier":
      return drawCarrier(ctx, a);
    case "america":
      ctx.save();
      ctx.scale(def.drawScale[0], def.drawScale[1]);
      drawCarrier(ctx, { ...a, hullNo: "LHA 6" });
      ctx.restore();
      return;
    case "k130":
      return drawK130(ctx, a);
    case "f124":
      return drawF124(ctx, a);
    case "cyclone":
      return drawCyclone(ctx, a);
    case "lcs":
      return drawLCS(ctx, a);
    case "burke":
      return drawBurke(ctx, a);
    case "blackhawk":
      return drawBlackhawk(ctx, { ...a, hf: a.n });
    case "nh90":
      return drawNH90(ctx, a);
    case "heron":
      return drawHeron(ctx, a);
    case "reaper":
      return drawReaper(ctx, a);
  }
}

export function drawAirShadow(ctx, type) {
  if (type === "blackhawk") drawBlackhawkShadow(ctx);
  else if (type === "nh90") drawNH90Shadow(ctx);
  else drawDroneShadow(ctx, type);
}

export function exhaustsOf(type) {
  if (type === "gepard") return GEPARD_EXHAUSTS;
  if (type === "carrier") return CARRIER_EXHAUSTS;
  if (type === "america") return CARRIER_EXHAUSTS.map(([x, y]) => [x * 1.4, y * 1.2]);
  return EXHAUSTS[type] || [];
}
