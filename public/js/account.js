// Konto im Menü: Anmelden, Registrieren, Abmelden, Dienstgrad, Medaillen, Saison.
// Das Passwort geht nur per HTTPS-POST an /api/… und wird nirgends im Browser gespeichert.
import { RANKS, rankOf, TEAMS } from "../shared/sim.js";

const $ = (id) => document.getElementById(id);
let opts = null;
let mode = "login";

export function initAccount(o) {
  opts = o;
  $("btnLogin").onclick = () => openForm("login");
  $("btnRegister").onclick = () => openForm("register");
  $("authCancel").onclick = () => closeForm();
  $("btnLogout").onclick = async () => {
    const token = opts.getToken();
    try {
      await fetch("/api/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    } catch {}
    opts.setToken(null);
    opts.refresh();
  };
  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("authName").value.trim();
    const password = $("authPw").value;
    const msg = $("authMsg");
    if (mode === "register" && password !== $("authPw2").value) {
      msg.textContent = "Die Passwörter stimmen nicht überein.";
      return;
    }
    $("authSubmit").disabled = true;
    msg.textContent = mode === "register" ? "Konto wird angelegt …" : "Anmelden …";
    try {
      const r = await fetch(`/api/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Beim Registrieren wird der Fortschritt des Gastkontos übernommen
        body: JSON.stringify({ name, password, token: mode === "register" ? opts.getToken() : undefined }),
      });
      const d = await r.json();
      if (!d.ok) {
        msg.textContent = d.m || "Fehlgeschlagen";
      } else {
        opts.setToken(d.token);
        $("authPw").value = "";
        $("authPw2").value = "";
        closeForm();
        opts.refresh();
      }
    } catch {
      msg.textContent = "Keine Verbindung – bitte erneut versuchen.";
    }
    $("authSubmit").disabled = false;
  });
}

function openForm(m) {
  mode = m;
  $("authForm").hidden = false;
  $("acctBtns").hidden = true;
  $("authTitle").textContent = m === "register" ? "Konto erstellen" : "Anmelden";
  $("authSubmit").textContent = m === "register" ? "Registrieren" : "Anmelden";
  $("authPw2").hidden = m !== "register";
  $("authPw2").required = m === "register";
  $("authPw").autocomplete = m === "register" ? "new-password" : "current-password";
  $("authMsg").textContent = m === "register" ? "Dein bisheriger Fortschritt (Taler, Schiffe) wird übernommen." : "";
  $("authName").focus();
}
function closeForm() {
  $("authForm").hidden = true;
  $("acctBtns").hidden = false;
}

const fmt = (n) => Math.floor(n).toLocaleString("de-DE");

function rankBadge(r) {
  // Ärmelabzeichen: Streifen je nach Dienstgradgruppe
  const el = document.createElement("span");
  el.className = "rankbadge r" + Math.min(4, Math.floor(r / 4));
  el.textContent = RANKS[r].short;
  return el;
}

export function renderAccount(st) {
  const box = $("acctInfo");
  if (!box) return;
  const a = st && st.account;
  box.replaceChildren();
  const reg = !!(a && a.reg);
  $("btnLogin").hidden = reg;
  $("btnRegister").hidden = reg;
  $("btnLogout").hidden = !reg;
  // Registrierte spielen unter ihrem Kontonamen
  const nameInput = $("name");
  if (reg && a.name) {
    nameInput.value = a.name;
    nameInput.disabled = true;
    nameInput.title = "Du spielst unter deinem Kontonamen";
  } else {
    nameInput.disabled = false;
    nameInput.title = "";
  }
  if (!a) {
    box.textContent = "Konto wird geladen …";
    return;
  }
  const r = rankOf(a.xp);
  const next = RANKS[r + 1];
  const head = document.createElement("div");
  head.className = "acctHead";
  const who = document.createElement("b");
  who.textContent = reg ? a.name : "Gast";
  head.append(rankBadge(r), who, document.createTextNode(` · ${RANKS[r].name}`));
  const bar = document.createElement("div");
  bar.className = "xpbar";
  const fill = document.createElement("div");
  const k = next ? (a.xp - RANKS[r].xp) / (next.xp - RANKS[r].xp) : 1;
  fill.style.width = `${Math.round(k * 100)}%`;
  bar.appendChild(fill);
  const line = document.createElement("small");
  line.textContent = next ? `${fmt(a.xp)} / ${fmt(next.xp)} EP bis ${next.name}` : `${fmt(a.xp)} EP – höchster Dienstgrad`;
  const stats = document.createElement("small");
  const s = a.stats || {};
  const medals = (a.medals || []).length;
  stats.textContent = `${fmt(a.money)} Taler · ${s.kills || 0} Abschüsse · ${s.caps || 0} Eroberungen · ${medals} ${medals === 1 ? "Medaille" : "Medaillen"}`;
  box.append(head, bar, line, stats);
  if (medals) {
    const row = document.createElement("div");
    row.className = "medals";
    for (const m of a.medals.slice(-12)) {
      const md = document.createElement("span");
      md.className = "medal";
      md.title = `Saison ${m.s} – Sieg ${TEAMS[m.t].name}`;
      md.style.background = TEAMS[m.t].color;
      md.textContent = m.s;
      row.appendChild(md);
    }
    box.appendChild(row);
  }
  if (!reg) {
    const hint = document.createElement("small");
    hint.className = "guesthint";
    hint.textContent = "Als Gast gilt dein Fortschritt nur in diesem Browser. Registriere dich, um ihn zu sichern und überall zu spielen.";
    box.appendChild(hint);
  }
  if (a.notice) opts && opts.toast && opts.toast(a.notice);
  renderSeason(st);
}

function renderSeason(st) {
  const box = $("seasonBox");
  if (!box || !st || !st.season) return;
  const s = st.season;
  const left = Math.max(0, s.end - Date.now());
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  box.replaceChildren();
  const t = document.createElement("b");
  t.textContent = `🏆 Saison ${s.id}`;
  const end = document.createElement("small");
  end.textContent = ` · endet in ${d > 0 ? `${d} T ` : ""}${h} Std`;
  box.append(t, end);
  const info = document.createElement("small");
  info.className = "seasoninfo";
  const pts = st.account ? st.account.sp || [0, 0] : [0, 0];
  const mine = pts[0] + pts[1];
  info.textContent = `Das Team mit mehr Stützpunkten am Saisonende gewinnt. Sieger mit mindestens 20 EP Beitrag erhalten eine Medaille und 5.000 Taler. Dein Beitrag: ${fmt(mine)} EP.`;
  box.appendChild(info);
  if (s.hist && s.hist.length) {
    const h2 = document.createElement("small");
    h2.className = "seasoninfo";
    h2.textContent = "Letzte Saisons: " + s.hist.slice(-3).reverse().map((e) => `${e.id}: ${e.winner >= 0 ? TEAMS[e.winner].name : "unentschieden"}`).join(" · ");
    box.appendChild(h2);
  }
}
