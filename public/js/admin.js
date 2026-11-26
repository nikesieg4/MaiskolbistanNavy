// Admin-Menü (öffnet sich nach ":DEV" im Chat und richtigem Passwort). Jede Aktion prüft der Server.
import { RANKS, WEATHER, TEAMS, BOATS } from "../shared/sim.js";

const $ = (id) => document.getElementById(id);
let api = null;
let last = null;

export function initAdmin(o) {
  api = o; // { send, mouseWorld(), outposts, toast }
  $("admPwForm").addEventListener("submit", (e) => {
    e.preventDefault();
    api.send({ t: "adminlogin", pw: $("admPw").value });
    $("admPw").value = "";
  });
  $("admPwCancel").onclick = () => ($("admPwBox").hidden = true);
  $("admClose").onclick = () => closeAdmin();
}

export function closeAdmin() {
  $("admPanel").hidden = true;
  $("admPwBox").hidden = true;
}
export const adminOpen = () => !$("admPanel").hidden || !$("admPwBox").hidden;

export function onAdminMessage(m) {
  if (m.t === "admin") {
    if (m.ask) {
      $("admPwBox").hidden = false;
      $("admPwMsg").textContent = "";
      $("admPw").focus();
    } else if (m.ok) {
      $("admPwBox").hidden = true;
      $("admPanel").hidden = false;
    } else {
      $("admPwMsg").textContent = m.m || "Abgelehnt";
    }
  } else if (m.t === "adminstate") {
    last = m;
    render();
  }
}

const act = (a, extra = {}) => api.send({ t: "adm", a, ...extra });
function btn(label, fn, cls = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (cls) b.className = cls;
  b.onclick = fn;
  return b;
}
function sel(options, value, onChange) {
  const s = document.createElement("select");
  for (const [v, l] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    if (String(v) === String(value)) o.selected = true;
    s.appendChild(o);
  }
  s.onchange = () => onChange(s.value);
  return s;
}
function section(title) {
  const d = document.createElement("div");
  d.className = "admsec";
  const h = document.createElement("h3");
  h.textContent = title;
  d.appendChild(h);
  return d;
}
function row(...els) {
  const r = document.createElement("div");
  r.className = "admrow";
  r.append(...els);
  return r;
}
function numInput(ph) {
  const i = document.createElement("input");
  i.type = "number";
  i.placeholder = ph;
  return i;
}

function render() {
  const box = $("admBody");
  if (!box || !last) return;
  box.replaceChildren();
  // ---- Ich selbst ----
  const me = section("Ich selbst");
  const amt = numInput("Taler");
  me.append(
    row(
      btn("+10.000 Taler", () => act("money", { n: 10000 })),
      btn("+100.000 Taler", () => act("money", { n: 100000 })),
      amt,
      btn("Geben", () => act("money", { n: +amt.value || 0 }))
    ),
    row(
      sel(RANKS.map((r, i) => [i, r.name]), "", (v) => act("rank", { n: +v })),
      btn("Alles freischalten", () => act("unlock")),
      btn("Reparieren + Munition", () => act("heal")),
      btn("Unverwundbar an/aus", () => act("god"))
    ),
    row(
      btn("Teleport: nächster Klick auf die Karte", () => {
        api.armTeleport();
        closeAdmin();
        api.toast("Teleport: auf die Karte klicken", "ok");
      })
    )
  );
  me.querySelector("select").insertAdjacentHTML("afterbegin", '<option value="" selected>Dienstgrad setzen …</option>');
  // ---- Spieler ----
  const pl = section(`Spieler (${last.players.length})`);
  const table = document.createElement("div");
  table.className = "admplayers";
  for (const p of last.players) {
    const r = document.createElement("div");
    r.className = "admplayer";
    const n = document.createElement("span");
    n.style.color = TEAMS[p.team].color;
    n.textContent = `${p.name}${p.reg ? " ✓" : ""}${p.admin ? " (Admin)" : ""} · ${BOATS[p.type]?.short || p.type} · ${p.hp} HP${p.god ? " · unverwundbar" : ""}${p.muted ? " · stumm" : ""}`;
    r.append(
      n,
      btn("+10k", () => act("money", { id: p.id, n: 10000 })),
      btn("Heilen", () => act("heal", { id: p.id })),
      btn("Gott", () => act("god", { id: p.id })),
      btn(p.muted ? "Laut" : "Stumm", () => act("mute", { id: p.id })),
      btn("Zerstören", () => confirm(`${p.name} zerstören?`) && act("kill", { id: p.id }), "warn"),
      btn("Entfernen", () => confirm(`${p.name} vom Server entfernen?`) && act("kick", { id: p.id }), "warn")
    );
    table.appendChild(r);
  }
  pl.appendChild(table);
  // ---- Welt ----
  const wd = section("Welt");
  const wx = last.wx || {};
  const ann = document.createElement("input");
  ann.placeholder = "Ansage an alle …";
  ann.maxLength = 200;
  wd.append(
    row(
      document.createTextNode("Wetter"),
      sel([["", "automatisch"], ...WEATHER.map((w, i) => [i, w.label])], wx.w ?? "", (v) => act("weather", { w: v === "" ? null : +v, h: wx.h ?? null })),
      document.createTextNode("Uhrzeit"),
      sel([["", "automatisch"], [6, "06:00 Dämmerung"], [12, "12:00 Mittag"], [19.5, "19:30 Abend"], [0, "00:00 Nacht"]], wx.h ?? "", (v) => act("weather", { w: wx.w ?? null, h: v === "" ? null : +v }))
    ),
    row(ann, btn("Senden", () => ann.value.trim() && (act("announce", { text: ann.value }), (ann.value = "")))),
    row(btn("Frontkarte zurücksetzen", () => confirm("Alle Stützpunkte neutral setzen?") && act("resetfront"), "warn"), btn("Alle Geschosse löschen", () => act("clearproj")))
  );
  const ops = document.createElement("div");
  ops.className = "admops";
  api.outposts.forEach((o, i) => {
    const own = last.front[i] ?? -1;
    ops.appendChild(row(document.createTextNode(o.name), sel([[-1, "neutral"], [0, TEAMS[0].name], [1, TEAMS[1].name]], own, (v) => act("outpost", { i, own: +v }))));
  });
  wd.appendChild(ops);
  box.append(me, pl, wd);
}
