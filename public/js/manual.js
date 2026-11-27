// Handbuch im Spiel: Waffen, Fahrzeuge, Steuerung und Spielregeln – die Werte kommen direkt aus sim.js.
import { WEAPONS, BOATS, TEAMS, RANKS, MS_TO_KN, ALTITUDE, DEPTH } from "../shared/sim.js";

const KIND = {
  gun: "Geschütz",
  mg: "Maschinengewehr",
  jgun: "Bordkanone",
  ssm: "Seezielflugkörper",
  sam: "Flugabwehrrakete",
  aam: "Luft-Luft-Rakete",
  agm: "Luft-Boden-Flugkörper",
  arm: "Anti-Radar-Flugkörper",
  rkt: "Ungelenkte Raketen",
  bomb: "Lenkbombe",
  torp: "Torpedo",
  jam: "Störsender",
  buoy: "Sonarbojen",
};
const GUIDE = {
  gun: "ballistisch, Turm folgt dem Mauszeiger",
  mg: "ballistisch zum Mauszeiger",
  jgun: "starr nach vorn",
  ssm: "Lock oder Team-Markierung, sonst Zeiger; aktiver Radarsuchkopf",
  sam: "Suchkopf fängt Flugkörper und Luftfahrzeuge ab",
  agm: "Lock oder Team-Markierung, sonst Zeiger",
  arm: "jagt eingeschaltete Radare (Strahler)",
  rkt: "ungelenkt zum Zeiger",
  bomb: "gleitet auf Lock-Ziel oder Zeiger",
  torp: "Lock oder Zeiger, danach aktiver Sonarsuchkopf",
  jam: "stört Sensoren, Locks und Lenkwaffen in der Nähe",
  buoy: "hört U-Boote für das ganze Team",
};
const fmt = (n, d = 0) => (n === undefined || n === null ? "–" : Number(n).toLocaleString("de-DE", { maximumFractionDigits: d }));
const km = (m) => (m >= 1000 ? `${fmt(m / 1000, 1)} km` : `${fmt(m)} m`);

// Welche Fahrzeuge tragen eine Waffe (fest oder im Hangar wählbar)?
function carriers(w) {
  const out = [];
  for (const d of Object.values(BOATS)) {
    const fixed = d.weapons.includes(w);
    const slot = d.slots && Object.values(d.slots).some((o) => o.includes(w));
    if (fixed || slot) out.push(d.short + (fixed ? "" : " (Hangar)"));
  }
  return [...new Set(out)].join(", ");
}

function maxAlt(W, key) {
  if (W.ceiling) return km(W.ceiling);
  if (W.kind === "aam") return "ganzer Luftraum";
  if (W.kind === "ssm") return `Tiefflug (${ALTITUDE.seaSkim} m) – nur Seeziele`;
  if (W.kind === "agm" || W.kind === "arm" || W.kind === "bomb") return "Abwurfhöhe → Ziel";
  if (W.kind === "torp") return "unter Wasser";
  if (W.kind === "rkt") return "Abschusshöhe → Ziel";
  return "–";
}

function weaponRows() {
  const rows = [];
  for (const [key, W] of Object.entries(WEAPONS)) {
    if (key === "lock" || key === "gun") continue;
    const mag = W.magazine || W.count;
    rows.push({
      kind: W.kind,
      cells: [
        W.label,
        KIND[W.kind] || W.kind,
        W.range ? km(W.range) : W.radius && W.kind === "jam" ? km(W.radius) : W.sonar ? km(W.sonar) : "–",
        W.speed ? `${fmt(W.speed)} m/s` : "–",
        maxAlt(W, key),
        W.damage ? fmt(W.damage, 1) + (W.airDamage ? ` (Luft ${W.airDamage})` : W.heliDamage ? ` (Luft ${W.heliDamage})` : "") : "–",
        mag ? `${mag} Schuss, ${fmt(W.reload, 1)} s je Nachladung` : `${fmt(W.reload, 2)} s Feuerpause`,
        W.burn ? `${W.burn} s Brenndauer, min. ${W.minV} m/s` : W.kind === "aam" && !W.burn ? "Staustrahl – hält Tempo" : "–",
        GUIDE[W.kind] + (W.ir ? " · Infrarot (Täuschkörper wirken)" : W.kind === "aam" ? " · Radar (Lock für volle Reichweite)" : "") + (W.airOnly ? " · nur Luftziele" : ""),
        carriers(key),
      ],
    });
  }
  const order = ["gun", "mg", "jgun", "ssm", "sam", "aam", "agm", "arm", "bomb", "rkt", "torp", "jam", "buoy"];
  rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return rows.map((r) => r.cells);
}

function vehicleRows() {
  const kindName = { ship: "Schiff", sub: "U-Boot", heli: "Hubschrauber", drone: "Drohne", jet: "Kampfflugzeug" };
  return Object.values(BOATS).map((d) => [
    d.label,
    TEAMS[d.team].name,
    kindName[d.kind] + (d.airCarrier ? " (Flugzeugträger)" : d.carrier ? " (Träger)" : d.vtol ? " (Senkrechtstarter)" : ""),
    d.rank ? RANKS[d.rank].name : "–",
    d.price ? `${fmt(d.price)} Taler` : "frei",
    fmt(d.hp),
    `${fmt(d.maxSpeed * MS_TO_KN)} kn${d.abSpeed ? ` (NB ${fmt(d.abSpeed * MS_TO_KN)})` : ""}`,
    km(d.sensor) + (d.sonar ? ` · Sonar ${km(d.sonar)}` : ""),
    fmt(d.sig, 2),
    d.alt ? `${fmt(d.alt.min)}–${fmt(d.alt.max)} m` : d.depth ? `bis ${fmt(-d.depth.min)} m tief` : "–",
    d.weapons.map((w) => WEAPONS[w].label).join(", "),
  ]);
}

function table(head, rows) {
  const t = document.createElement("table");
  t.className = "mantable";
  const tr = document.createElement("tr");
  for (const h of head) {
    const th = document.createElement("th");
    th.textContent = h;
    tr.appendChild(th);
  }
  t.appendChild(tr);
  for (const r of rows) {
    const row = document.createElement("tr");
    for (const c of r) {
      const td = document.createElement("td");
      td.textContent = c;
      row.appendChild(td);
    }
    t.appendChild(row);
  }
  const wrap = document.createElement("div");
  wrap.className = "mantablewrap";
  wrap.appendChild(t);
  return wrap;
}

function textBlock(items) {
  const d = document.createElement("div");
  d.className = "mantext";
  for (const [h, p] of items) {
    const b = document.createElement("h4");
    b.textContent = h;
    const x = document.createElement("p");
    x.textContent = p;
    d.append(b, x);
  }
  return d;
}

const TABS = {
  Waffen: () =>
    table(["Waffe", "Art", "Reichweite", "Geschw.", "Max. Höhe / Ziel", "Schaden", "Magazin", "Antrieb", "Lenkung", "Getragen von"], weaponRows()),
  Fahrzeuge: () => table(["Fahrzeug", "Nation", "Art", "Dienstgrad", "Preis", "HP", "Höchstfahrt", "Sensor", "Signatur", "Höhe/Tiefe", "Bewaffnung"], vehicleRows()),
  Steuerung: () =>
    table(
      ["Taste", "Wirkung"],
      [
        ["W / S", "Schiff: Fahrstufe · Hubschrauber: vor/zurück · Jet/Drohne: Vollschub/Leerlauf"],
        ["A / D", "Ruder / Kurve"],
        ["Leertaste", "Maschine stopp"],
        ["Q / C", "Höhe steigen/sinken (Luftfahrzeuge) · U-Boot: auftauchen/tiefer"],
        ["Shift", "Nachbrenner (Jets, bei Vollschub)"],
        ["1 – 9", "Waffe wählen"],
        ["F", "Feuer (Dauerfeuer bei Rohrwaffen solange gedrückt)"],
        ["R", "Lock auf das Ziel unter dem Mauszeiger"],
        ["E", "Fähigkeit: Radar-Rundumsuche, Täuschkörper oder Torpedotäuscher"],
        ["T", "Radar ein/aus (Schiffe)"],
        ["H", "Hangar (gelandet)"],
        ["B", "Laden (Hafen oder Flugfeld)"],
        ["Enter", "Chat (Tab: Alle/Team)"],
        ["Esc", "Menü"],
        ["Mausrad, + / −", "Zoom"],
      ]
    ),
  Regeln: () =>
    textBlock([
      ["Sensoren", "Jedes Team sieht nur, was seine Einheiten, die Basis und gehaltene Stützpunkte erfassen. Eingeschaltetes Radar sieht weiter, wird aber selbst leichter entdeckt und lockt Anti-Radar-Flugkörper an."],
      ["Höhe", `Unter ${ALTITUDE.lowFly} m fliegt man unter dem Radar. Flugabwehr erreicht nur Ziele bis zu ihrer Gipfelhöhe (siehe Waffen). Landen und Retten unter ${ALTITUDE.landHeli} m.`],
      ["Raketen-Energie", "Feststoff-Raketen haben nur wenige Sekunden Schub. Danach werden sie langsamer, lenken schlechter und zerstören sich unter ihrer Mindestgeschwindigkeit. Auf große Entfernung kann ein Ziel durch Kurven oder Davonfliegen entkommen."],
      ["U-Boote", `Bis ${-DEPTH.surface} m aufgetaucht, bis ${-DEPTH.periscope} m Sehrohrtiefe (Flugkörper frei), darunter nur per Sonar zu orten. Langsam = leise.`],
      ["Wetter und Tageszeit", "Ein Tag dauert 24 Minuten, das Wetter wechselt alle 8 Minuten. Nacht und Nebel verkürzen die Sicht, Regen und Sturm schwächen Radar, Sturm auch Sonar und bremst Schiffe."],
      ["Träger", "Jedes Landedeck trägt ein Luftfahrzeug, bis es zerstört ist. Auf Flugzeugträgern starten alle Jets per Katapult und landen am Fangseil (langsam unter 60 m)."],
      ["Dienstgrade und Saison", "Erfahrung = ein Zehntel der verdienten Taler. Höhere Dienstgrade schalten Fahrzeuge frei. Am Ende jeder Woche gewinnt das Team mit mehr Stützpunkten; Beitragende bekommen eine Medaille."],
      ["Friendly Fire", "Ist es eingeschaltet (Anzeige im HUD), treffen Granaten, Raketen, Bomben und Torpedos auch eigene Einheiten, die im Weg sind. Gelenkte Waffen suchen trotzdem nur Gegner. Eigenbeschuss bringt kein Kopfgeld."],
    ]),
};

let current = "Waffen";
export function renderManual(box, tabsBox) {
  tabsBox.replaceChildren();
  for (const name of Object.keys(TABS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.className = name === current ? "sel" : "";
    b.onclick = () => {
      current = name;
      renderManual(box, tabsBox);
    };
    tabsBox.appendChild(b);
  }
  box.replaceChildren(TABS[current]());
}
