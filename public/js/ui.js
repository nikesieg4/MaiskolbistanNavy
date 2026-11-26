// Beschriftungen und Symbole der Waffenleiste und Fähigkeiten
const svg = (inner) => `<svg viewBox="0 0 48 24" class="wicon">${inner}</svg>`;

export const WEAPON_UI = {
  gun: {
    name: "76 mm",
    sub: "bereit",
    icon: svg('<ellipse cx="14" cy="12" rx="10" ry="8" fill="#b9c2c7"/><rect x="22" y="10.5" width="22" height="3" rx="1.5" fill="#d9dee1"/><rect x="40" y="9.5" width="5" height="5" rx="1" fill="#8d969b"/>'),
  },
  exocet: {
    name: "Exocet",
    sub: "→ Mauszeiger",
    cells: 4,
    icon: svg('<path d="M4 12 L10 6 L12 6 L11 12 L12 18 L10 18 Z" fill="#9aa3a8"/><path d="M20 12 L26 4 L29 4 L27 12 L29 20 L26 20 Z" fill="#9aa3a8"/><rect x="6" y="10" width="34" height="4" rx="2" fill="#eef1f2"/><path d="M40 10 Q46 12 40 14 Z" fill="#3b4246"/>'),
  },
  ram: {
    name: "RAM",
    sub: "Abwehr: Flugkörper & Hubschrauber",
    icon: svg('<rect x="8" y="5" width="4" height="14" rx="1" fill="#a4adb2"/><rect x="8" y="10.5" width="32" height="3" rx="1.5" fill="#f2f4f5"/><circle cx="40" cy="12" r="1.6" fill="#2c3236"/>'),
  },
  mg: {
    name: "M240 MG",
    sub: "Dauerfeuer zum Mauszeiger",
    icon: svg('<rect x="6" y="10" width="26" height="4" rx="1" fill="#3a3f3a"/><rect x="30" y="11" width="14" height="2" fill="#2a2a2a"/><rect x="14" y="14" width="4" height="6" rx="1" fill="#3a3f3a"/><circle cx="44" cy="12" r="1.5" fill="#ffd75e"/>'),
  },
  hellfire: {
    name: "Hellfire",
    sub: "→ Mauszeiger",
    cells: 8,
    icon: svg('<rect x="6" y="9.5" width="30" height="5" rx="2.5" fill="#c9c9b8"/><path d="M36 9.5 Q44 12 36 14.5 Z" fill="#2b2b2b"/><rect x="6" y="7" width="3" height="10" fill="#a1a28d"/>'),
  },
};

export const ABILITY_UI = {
  radar: {
    name: "Radar",
    title: "Radar-Rundumsuche: 10 s weite Sicht, Lock bis 5 km",
    icon: svg('<circle cx="12" cy="12" r="10" fill="none" stroke="#5aff96" stroke-width="1.2" opacity=".6"/><circle cx="12" cy="12" r="5" fill="none" stroke="#5aff96" stroke-width="1" opacity=".5"/><path d="M12 12 L12 2 A10 10 0 0 1 21 8 Z" fill="#5aff96" opacity=".45"/><line x1="12" y1="12" x2="12" y2="2" stroke="#b6ffd0" stroke-width="1.5"/><circle cx="17" cy="7" r="1.4" fill="#c8ffd8"/>'),
  },
  flares: {
    name: "Täuschkörper",
    title: "Flares: 3 s lang können RAM-Flugkörper dich nicht verfolgen",
    icon: svg('<circle cx="12" cy="8" r="3" fill="#fff3c4"/><circle cx="20" cy="14" r="2.5" fill="#ffe08a"/><circle cx="8" cy="17" r="2" fill="#ffd060"/><path d="M12 8 Q24 2 36 10" stroke="#ddd" stroke-width="1.2" fill="none" opacity=".6"/><path d="M20 14 Q30 16 40 20" stroke="#ddd" stroke-width="1.2" fill="none" opacity=".5"/>'),
  },
};

// Weitere Waffen (gleiche Symbole je Waffenart)
const G = WEAPON_UI.gun;
const S = WEAPON_UI.exocet;
const R = WEAPON_UI.ram;
const H = WEAPON_UI.hellfire;
Object.assign(WEAPON_UI, {
  gun76: { ...G, name: "76 mm" },
  gun25: { ...G, name: "25 mm" },
  gun57: { ...G, name: "57 mm" },
  gun127: { ...G, name: "127 mm" },
  rbs15: { ...S, name: "RBS 15" },
  harpoon: { ...S, name: "Harpoon" },
  nsm: { ...S, name: "NSM" },
  griffin: { ...S, name: "Griffin" },
  searam: { ...R, name: "SeaRAM" },
  stinger: { ...R, name: "Stinger", sub: "Nahbereichs-Flugabwehr" },
  sm2: { ...R, name: "SM-2", sub: "Flugabwehr großer Reichweite" },
  marte: { ...H, name: "Marte ER" },
  armiger: {
    name: "ARMIGER",
    sub: "jagt sendende Radare",
    icon: svg('<rect x="4" y="10" width="34" height="4" rx="2" fill="#e4e6e2"/><path d="M38 10 Q46 12 38 14 Z" fill="#2b2b2b"/><path d="M10 12 L16 5 L18 5 L16 12 L18 19 L16 19 Z" fill="#9a9d98"/><path d="M40 4 Q44 12 40 20" stroke="#ff6b5a" stroke-width="1.4" fill="none"/><path d="M43 2 Q48 12 43 22" stroke="#ff6b5a" stroke-width="1.2" fill="none" opacity=".6"/>'),
  },
});
WEAPON_UI.harm = { ...WEAPON_UI.armiger, name: "AGM-88 HARM" };

// Hangar-Bewaffnung
WEAPON_UI.stinger_aa = { ...WEAPON_UI.ram, name: "Stinger", sub: "Luft-Luft zum Mauszeiger" };
WEAPON_UI.rkt70 = {
  name: "70-mm-Raketen",
  sub: "ungelenkt zum Mauszeiger",
  icon: svg('<rect x="6" y="6" width="22" height="12" rx="6" fill="#4d544b"/><circle cx="26" cy="9" r="1.2" fill="#111"/><circle cx="26" cy="12" r="1.2" fill="#111"/><circle cx="26" cy="15" r="1.2" fill="#111"/><rect x="30" y="11" width="12" height="2" fill="#ddd"/><path d="M42 10 L46 12 L42 14 Z" fill="#ffb347"/>'),
};
WEAPON_UI.jammer = {
  name: "Störpod",
  sub: "bereit (F)",
  icon: svg('<rect x="8" y="9" width="26" height="6" rx="3" fill="#c4c9c2"/><circle cx="32" cy="12" r="1.6" fill="#ff5a46"/><path d="M36 6 Q41 12 36 18" stroke="#ff8a6a" stroke-width="1.5" fill="none"/><path d="M40 3 Q47 12 40 21" stroke="#ff8a6a" stroke-width="1.2" fill="none" opacity=".6"/>'),
};

// Kampfflugzeuge: Bordkanonen, Luft-Luft, Luft-Boden
const JG = {
  sub: "starr nach vorn (F halten)",
  icon: svg('<path d="M4 12 L14 9 L30 10 L30 14 L14 15 Z" fill="#9aa3a8"/><rect x="30" y="11" width="12" height="2" fill="#555"/><circle cx="44" cy="12" r="1.6" fill="#ffd75e"/><circle cx="47" cy="12" r="1" fill="#ffd75e" opacity=".6"/>'),
};
const AAM = (name, sub) => ({
  name,
  sub,
  icon: svg('<rect x="6" y="10.5" width="32" height="3" rx="1.5" fill="#eef0ec"/><path d="M38 10.5 Q45 12 38 13.5 Z" fill="#6b706d"/><path d="M8 12 L4 7 L6 7 L11 12 L6 17 L4 17 Z" fill="#a9ada9"/><rect x="30" y="10.5" width="1.2" height="3" fill="#c9a227"/>'),
});
Object.assign(WEAPON_UI, {
  gun27: { ...JG, name: "BK-27" },
  m61: { ...JG, name: "M61 Vulcan" },
  gau12: { ...JG, name: "GAU-12" },
  gau22: { ...JG, name: "GAU-22" },
  iris_t: AAM("IRIS-T", "Infrarot · Luftziel am Zeiger"),
  aim9x: AAM("AIM-9X", "Infrarot · Luftziel am Zeiger"),
  meteor: AAM("Meteor", "Radar · Lock (R) für große Reichweite"),
  aim120: AAM("AIM-120", "Radar · Lock (R) für große Reichweite"),
  taurus: { ...WEAPON_UI.exocet, name: "Taurus", sub: "Marschflugkörper → Lock/Zeiger" },
  jsm: { ...WEAPON_UI.exocet, name: "JSM", sub: "Seeziel aus dem Waffenschacht" },
  gbu12: {
    name: "GBU-12",
    sub: "Lenkbombe – aus der Höhe abwerfen",
    icon: svg('<ellipse cx="22" cy="12" rx="15" ry="3.4" fill="#6f7344"/><rect x="6" y="6" width="3" height="12" fill="#8a8e58"/><rect x="31" y="9" width="3" height="6" fill="#9da19d"/><circle cx="38" cy="12" r="1.4" fill="#ccc"/><rect x="26" y="8.6" width="1.4" height="6.8" fill="#c9a227"/>'),
  },
  // Torpedos und U-Boot-Flugabwehr
  dm2a4: {
    name: "DM2A4",
    sub: "Schwergewichtstorpedo → Lock/Zeiger",
    icon: svg('<rect x="6" y="9" width="32" height="6" rx="3" fill="#3f4a4f"/><path d="M38 9 Q45 12 38 15 Z" fill="#2a3135"/><path d="M6 12 L2 7 L4 7 L8 12 L4 17 L2 17 Z" fill="#59656b"/><circle cx="10" cy="5" r="1.2" fill="#bfe6ff" opacity=".7"/><circle cx="5" cy="19" r="1" fill="#bfe6ff" opacity=".6"/>'),
  },
});
WEAPON_UI.mk48 = { ...WEAPON_UI.dm2a4, name: "Mk 48" };
WEAPON_UI.mu90 = { ...WEAPON_UI.dm2a4, name: "MU90", sub: "Leichttorpedo gegen U-Boote" };
WEAPON_UI.mk54 = { ...WEAPON_UI.dm2a4, name: "Mk 54", sub: "Leichttorpedo gegen U-Boote" };
WEAPON_UI.idas = { ...WEAPON_UI.ram, name: "IDAS", sub: "Flugabwehr – nur Sehrohrtiefe" };
ABILITY_UI.decoy = {
  name: "Täuscher",
  title: "Torpedotäuschkörper: lenkt anlaufende Torpedos mit 70 % Wahrscheinlichkeit ab",
  icon: svg('<circle cx="10" cy="12" r="4" fill="#bfe6ff" opacity=".8"/><circle cx="18" cy="7" r="2.5" fill="#bfe6ff" opacity=".6"/><circle cx="20" cy="16" r="3" fill="#bfe6ff" opacity=".5"/><circle cx="28" cy="11" r="2" fill="#bfe6ff" opacity=".4"/>'),
};
