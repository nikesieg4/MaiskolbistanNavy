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
