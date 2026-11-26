// Zeichnet jedes Fahrzeug nach Typ (Ursprung = Fahrzeugmitte, Bug/Nase = +x).
import { BOATS, WEAPONS } from "../shared/sim.js";
import { drawGepard, GEPARD_EXHAUSTS } from "./gepard.js";
import { drawCarrier, CARRIER_EXHAUSTS } from "./carrier.js";
import { drawBlackhawk, drawBlackhawkShadow } from "./heli.js";
import { drawK130, drawF124, drawCyclone, drawLCS, drawBurke, EXHAUSTS } from "./warships.js";
import { drawNH90, drawNH90Shadow, drawHeron, drawReaper, drawDroneShadow } from "./aircraft.js";

/**
 * anim: { t, seed, gun, ram, flag, radarAngle, domeAngle, ammo (Waffenstatus vom Server, nur eigenes Fahrzeug), gunner }
 */
export function drawVehicle(ctx, type, anim) {
  const def = BOATS[type];
  // Seezielflugkörper-Zellen (leer = abgefeuert) aus dem Waffenstatus
  const ssmIdx = def.weapons.findIndex((w) => WEAPONS[w].kind === "ssm");
  const exo = anim.ammo && ssmIdx >= 0 ? anim.ammo[ssmIdx].map((v) => v <= 0) : undefined;
  const air = def.weapons.findIndex((w) => ["agm", "arm"].includes(WEAPONS[w].kind));
  const n = anim.ammo && air >= 0 ? anim.ammo[air][0] : undefined;
  const a = { ...anim, exo, n, ssmCells: def.ssm };
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
      return drawBlackhawk(ctx, { ...a, hf: n });
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
