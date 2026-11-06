import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const status = $("status");
const extraStyle = document.createElement("style");
extraStyle.textContent = `
.container-card {
  min-height:120px;
  padding:18px 10px;
  border:2px solid #dce4ed;
  border-radius:14px;
  background:white;
  text-align:center;
  cursor:pointer;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:8px;
  font-size:17px;
}
.container-card b {
  font-size:23px;
  color:#123b68;
}
.container-card button {
  width:100%;
  min-height:42px;
}
  .hidden { display: none !important; }
  .row { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
  .row button { flex:1; min-width:100px; }
  .pill { display:inline-block; background:#e8eef5; color:#123b68; padding:4px 8px; border-radius:20px; margin-left:6px; }
  .muted { color:#65758a; font-size:14px; margin-top:6px; }
  .container-card.active { border-color:#1d5b96 !important; background:#eaf2fb !important; }
  .container-back { width:100%; margin-bottom:12px; }
  .container-heading { font-size:22px; font-weight:700; color:#123b68; margin:8px 0; }
`;
document.head.appendChild(extraStyle);
let app, auth, db;
let materials = [];
let movements = [];
let unsubM, unsubH;
let selectedContainer = "";
let containerView = false;

const show = id => {
  ["auth", "pin", "app"].forEach(x =>
    $(x).classList.toggle("hidden", x !== id)
  );
};
show("auth");
const configured = !firebaseConfig.apiKey.startsWith("INSERISCI");

if (!configured) {
  status.textContent = "Configura prima firebase-config.js";
  $("authmsg").textContent =
    "Il file firebase-config.js contiene ancora i valori segnaposto.";
} else {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  enableIndexedDbPersistence(db).catch(() => {});

  onAuthStateChanged(auth, user => {
    if (user) {
      status.textContent = "Collegato a Firebase";
      startPin();
    } else {
      status.textContent = "Non collegato";
      show("auth");
    }
  });
}

$("login").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      $("email").value.trim(),
      $("password").value
    );
    $("authmsg").textContent = "Accesso riuscito.";
  } catch (e) {
    $("authmsg").textContent =
      "Accesso non riuscito: controlla email e password.";
  }
};

function startPin() {
  const saved = localStorage.getItem("magazzino_pin_v1");

  $("pin2").classList.toggle("hidden", !!saved);
  $("pintitle").textContent = saved
    ? "Inserisci il PIN"
    : "Crea il PIN del magazzino";

  $("pinhelp").textContent = saved
    ? "Inserisci il PIN di 6 cifre per aprire il magazzino."
    : "Scegli un PIN di 6 cifre. Sarà memorizzato solo su questo dispositivo.";

  $("pinmsg").textContent = "";
  $("pin1").value = "";
  $("pin2").value = "";

  show("pin");
}

$("pinbtn").onclick = () => {
  const a = $("pin1").value;
  const b = $("pin2").value;
  const saved = localStorage.getItem("magazzino_pin_v1");

  if (!/^\d{6}$/.test(a)) {
    $("pinmsg").textContent =
      "Il PIN deve contenere esattamente 6 cifre.";
    return;
  }

  if (saved) {
    if (a !== saved) {
      $("pinmsg").textContent = "PIN non corretto.";
      return;
    }
  } else {
    if (a !== b) {
      $("pinmsg").textContent = "I due PIN non coincidono.";
      return;
    }

    localStorage.setItem("magazzino_pin_v1", a);
  }

  openApp();
};

function openApp() {
  show("app");
  listen();
  render();
}

function listen() {
  if (unsubM) unsubM();
  if (unsubH) unsubH();

  unsubM = onSnapshot(
    collection(db, "materials"),
    s => {
      materials = s.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      render();
    },
    e => status.textContent = "Errore materiali: " + e.message
  );

  const q = query(
    collection(db, "movements"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  unsubH = onSnapshot(q, s => {
    movements = s.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    renderMovements();
  }, () => {});
}

const val = id => $(id).value.trim();

$("save").onclick = async () => {
  if (!val("name")) {
    alert("Inserisci il nome del materiale.");
    return;
  }

  const data = {
    name: val("name"),
    code: val("code"),
    quantity: Number(val("qty") || 0),
    unit: val("unit"),
    container: val("container"),
    zone: val("zone"),
    box: val("box"),
    shelf: val("shelf"),
    rack: val("rack"),
    notes: val("notes"),
    updatedAt: serverTimestamp()
  };

  try {
    const id = val("docid");

    if (id) {
      await updateDoc(doc(db, "materials", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "materials"), data);
    }

    clearForm();
  } catch (e) {
    alert("Salvataggio non riuscito: " + e.message);
  }
};

function clearForm() {
  [
    "docid", "name", "code", "qty", "unit",
    "zone", "box", "shelf", "rack", "notes"
  ].forEach(x => $(x).value = "");

  $("formtitle").textContent = "Aggiungi materiale";
  $("cancel").classList.add("hidden");
}

$("cancel").onclick = clearForm;

function edit(m) {
  $("docid").value = m.id;

  [
    "name", "code", "qty", "unit", "container",
    "zone", "box", "shelf", "rack", "notes"
  ].forEach(k => $(k).value = m[k] ?? "");

  $("formtitle").textContent = "Modifica materiale";
  $("cancel").classList.remove("hidden");

  window.scrollTo(0, 0);
}

async function move(m, delta) {
  const amount = Number(
    prompt("Quantità da " + (delta > 0 ? "caricare" : "scaricare") + ":")
  );

  if (!Number.isFinite(amount) || amount <= 0) return;

  if (delta < 0 && amount > Number(m.quantity || 0)) {
    alert("Quantità insufficiente.");
    return;
  }

  try {
    await updateDoc(doc(db, "materials", m.id), {
      quantity: Number(m.quantity || 0) + delta * amount,
      updatedAt: serverTimestamp()
    });

    await addDoc(collection(db, "movements"), {
      materialId: m.id,
      name: m.name,
      code: m.code || "",
      type: delta > 0 ? "Carico" : "Scarico",
      amount,
      unit: m.unit || "",
      container: m.container || "",
      createdAt: serverTimestamp()
    });
  } catch (e) {
    alert("Movimento non riuscito: " + e.message);
  }
}

async function remove(m) {
  if (confirm("Eliminare " + m.name + "?")) {
    await deleteDoc(doc(db, "materials", m.id));
  }
}

function matchesTerm(m, term) {
  const searchable = [
    m.name,
    m.code,
    m.container,
    m.zone,
    m.box,
    m.shelf,
    m.rack,
    m.notes,
    m.unit
  ].join(" ").toLocaleLowerCase("it");

  return searchable.includes(term);
}

function render() {
  const term = val("search").toLocaleLowerCase("it");

  const list = materials.filter(m => {
    const matchesContainer =
      !selectedContainer || m.container === selectedContainer;

    return matchesContainer &&
      (!term || matchesTerm(m, term));
  });

  $("materials").innerHTML = list.length
    ? list.map(m => `
      <div class="item">
        <b>${esc(m.name)}</b>
        <span class="pill">${esc(m.container || "")}</span>
        <div>
          ${esc(m.code || "")} ·
          ${Number(m.quantity || 0)}
          ${esc(m.unit || "")}
        </div>
        <div class="muted">
          Zona ${esc(m.zone || "—")} ·
          Scatola ${esc(m.box || "—")} ·
          Scaffale ${esc(m.shelf || "—")} ·
          Ripiano ${esc(m.rack || "—")}
        </div>
        ${m.notes
          ? `<div class="muted">Note: ${esc(m.notes)}</div>`
          : ""}
        <div class="row">
          <button data-act="in" data-id="${esc(m.id)}">Carico</button>
          <button data-act="out" data-id="${esc(m.id)}">Scarico</button>
          <button class="secondary" data-act="edit" data-id="${esc(m.id)}">Modifica</button>
          <button class="danger" data-act="del" data-id="${esc(m.id)}">Elimina</button>
        </div>
      </div>
    `).join("")
    : "Nessun materiale trovato.";

  $("resultcount").textContent =
    `${list.length} material${list.length === 1 ? "e" : "i"} visualizzati`;

  $("containers").innerHTML = Array.from(
    { length: 8 },
    (_, i) => {
      const c = "C" + String(i + 1).padStart(2, "0");

      const n = materials.filter(
        m => m.container === c
      ).length;

      const foundCount = term
        ? materials.filter(
            m => m.container === c && matchesTerm(m, term)
          ).length
        : 0;

      const active =
        selectedContainer === c ? " active" : "";

      const highlight = foundCount > 0
        ? 'style="border:3px solid #16803c;background:#e8f7ec;box-shadow:0 0 0 2px rgba(22,128,60,.12);cursor:pointer;"'
        : 'style="cursor:pointer;"';

      return `
        <div
          class="card container-card${active}"
          data-container="${c}"
          role="button"
          tabindex="0"
          aria-label="Apri il contenuto del container ${c}"
          ${highlight}
        >
          <b>${c}</b>

          ${
            foundCount > 0
              ? `<div style="color:#126b32;font-weight:700;margin:4px 0;">
                   TROVATO · ${foundCount}
                 </div>`
              : ""
          }

          <div>${n} material${n === 1 ? "e" : "i"}</div>

          <button class="secondary" data-container="${c}">
            ${selectedContainer === c ? "Selezionato" : "Mostra"}
          </button>
        </div>
      `;
    }
  ).join("");
}

function openContainer(container) {
  selectedContainer = container;
  containerView = true;

  $("search").value = "";

  const searchSection = $("search").parentElement;
  const containersSection = $("containers").parentElement;
  const materialsSection = $("materials").parentElement;
const formSection = $("formtitle").parentElement;
formSection.classList.add("hidden");
  searchSection.classList.add("hidden");
  containersSection.classList.add("hidden");

  let back = $("containerBack");

  if (!back) {
    back = document.createElement("button");
    back.id = "containerBack";
    back.className = "secondary container-back";
    back.textContent = "← TORNA AI CONTAINER";
    back.onclick = closeContainer;
    materialsSection.insertBefore(back, materialsSection.firstChild);
  }

  materialsSection.querySelector("h2").textContent =
    "Container " + container;

  render();

  materialsSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function closeContainer() {
  containerView = false;
  $("formtitle").parentElement.classList.remove("hidden");
  if ($("containerBack")) $("containerBack").remove();
  selectedContainer = "";

  $("search").parentElement.classList.remove("hidden");
  $("containers").parentElement.classList.remove("hidden");

  $("materials").parentElement.querySelector("h2").textContent =
    "Materiali";

  render();

  $("containers").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function renderMovements() {
  $("movements").innerHTML = movements.length
    ? movements.map(m => `
      <div class="item">
        ${esc(m.type || "Movimento")} ·
        ${esc(m.name || "")} ·
        ${m.amount ?? ""}
        ${esc(m.unit || "")}
        <span class="muted">${esc(m.container || "")}</span>
      </div>
    `).join("")
    : "Nessun movimento registrato.";
}

$("materials").onclick = e => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;

  const m = materials.find(x => x.id === b.dataset.id);
  if (!m) return;

  const actions = {
    in: () => move(m, 1),
    out: () => move(m, -1),
    edit: () => edit(m),
    del: () => remove(m)
  };

  actions[b.dataset.act]?.();
};

$("containers").onclick = e => {
  const card = e.target.closest("[data-container]");
  if (!card) return;

  openContainer(card.dataset.container);
};

$("containers").onkeydown = e => {
  if (e.key !== "Enter" && e.key !== " ") return;

  const card = e.target.closest(".container-card");
  if (!card) return;

  e.preventDefault();
  openContainer(card.dataset.container);
};

function runSearch() {
  selectedContainer = "";
  render();

  $("materials").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

$("searchBtn").onclick = runSearch;

$("search").addEventListener("keydown", e => {
  if (e.key === "Enter") runSearch();
});

$("clearSearch").onclick = () => {
  $("search").value = "";
  selectedContainer = "";
  render();
};

$("search").oninput = render;

$("logout").onclick = async () => {
  if (confirm("Bloccare il magazzino su questo dispositivo?")) {
    show("pin");
    $("pin1").value = "";
    $("pinmsg").textContent = "Inserisci il PIN per rientrare.";
    $("pin2").classList.add("hidden");
    $("pintitle").textContent = "Inserisci il PIN";
  }
};

$("export").onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ materials, movements }, null, 2)],
    { type: "application/json" }
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "backup-magazzino.json";
  a.click();

  URL.revokeObjectURL(a.href);
};

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}
