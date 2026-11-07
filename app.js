import {  } from "https://gstatic.com";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://gstatic.com";

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
} from "https://gstatic.com";

import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const status = $("status");

let app, auth, db;
let materials = [];
let movements = [];
let unsubM, unsubH;
let selectedContainer = "";
let currentView = "home"; 

// Configurazione Extra CSS per i Container 3D Dinamici e i Listini
const extraStyle = document.createElement("style");
extraStyle.textContent = `
  .container-card-3d {
    min-height: 140px;
    padding: 12px;
    border: 3px solid #1f2712;
    border-radius: 16px;
    background: repeating-linear-gradient(90deg, #596b3b 0px, #596b3b 12px, #3c4b26 13px, #6e824a 14px, #313d1e 15px);
    color: white;
    text-align: center;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: inset 0 6px 10px rgba(255,255,255,0.2), inset 0 -8px 12px rgba(0,0,0,0.3), 0 6px 0 #1f2712, 0 10px 15px rgba(0,0,0,0.4);
    transition: transform 0.1s ease, box-shadow 0.1s ease;
    transform: perspective(300px) rotateX(8deg) rotateY(-5deg);
  }

  .container-card-3d:active {
    transform: perspective(300px) rotateX(8deg) rotateY(-5deg) translateY(4px);
    box-shadow: inset 0 6px 10px rgba(255,255,255,0.2), inset 0 -8px 12px rgba(0,0,0,0.3), 0 2px 0 #1f2712, 0 4px 8px rgba(0,0,0,0.4);
  }

  .container-card-3d b {
    font-size: 26px;
    color: #ffffff;
    text-shadow: 2px 2px 0px #1f2712;
    letter-spacing: 1.5px;
  }

  .container-card-3d .weight-indicator {
    background: rgba(0,0,0,0.4);
    padding: 3px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: bold;
    border: 1px solid #4a5c2d;
    color: #fff4b8;
  }

  .material-row-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #232d16;
    border: 2px solid #3d4f2b;
    border-radius: 12px;
    padding: 12px 16px;
    margin-bottom: 8px;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);
  }

  .material-row-title {
    font-weight: bold;
    font-size: 16px;
    color: #ffffff;
  }

  .material-row-weight {
    font-size: 18px;
    font-weight: 900;
    color: #fff4b8;
  }
`;
document.head.appendChild(extraStyle);

const configured = !firebaseConfig.apiKey.startsWith("INSERISCI");

if (!configured) {
  status.textContent = "Configura prima firebase-config.js";
  $("authmsg").textContent = "Il file firebase-config.js contiene ancora i valori segnaposto.";
} else {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  enableIndexedDbPersistence(db).catch(() => {});

  onAuthStateChanged(auth, user => {
    if (user) {
      status.textContent = "🟢 Collegato a Firebase";
      startPin();
    } else {
      status.textContent = "🔴 Non collegato";
      showSection("auth");
    }
  });
}

$("login").onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    $("authmsg").textContent = "Accesso riuscito.";
  } catch (e) {
    $("authmsg").textContent = "Accesso non riuscito: controlla email e password.";
  }
};

function startPin() {
  const saved = localStorage.getItem("magazzino_pin_v1");
  $("pin2").classList.toggle("hidden", !!saved);
  $("pintitle").textContent = saved ? "Inserisci il PIN" : "Crea il PIN del magazzino";
  $("pinhelp").textContent = saved ? "Inserisci il PIN di 6 cifre per aprire il magazzino." : "Scegli un PIN di 6 cifre per questo dispositivo.";
  $("pinmsg").textContent = "";
  $("pin1").value = "";
  $("pin2").value = "";
  showSection("pin");
}

$("pinbtn").onclick = () => {
  const a = $("pin1").value;
  const b = $("pin2").value;
  const saved = localStorage.getItem("magazzino_pin_v1");

  if (!/^\d{6}$/.test(a)) {
    $("pinmsg").textContent = "Il PIN deve contenere esattamente 6 cifre.";
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
  showSection("app");
  $("bottomNavBar").classList.remove("hidden");
  listen();
  navigateTo("home");
}

function listen() {
  if (unsubM) unsubM();
  if (unsubH) unsubH();

  unsubM = onSnapshot(collection(db, "materials"), s => {
    materials = s.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, e => status.textContent = "Errore materiali: " + e.message);

  const q = query(collection(db, "movements"), orderBy("createdAt", "desc"), limit(50));
  unsubH = onSnapshot(q, s => {
    movements = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMovements();
  }, () => {});
}

function navigateTo(view) {
  currentView = view;
  selectedContainer = ""; 
  
  $("navHome").className = view === "home" ? "nav-item active" : "nav-item";
  $("navAdd").className = view === "add" ? "nav-item active" : "nav-item";
  $("navHistory").className = view === "history" ? "nav-item active" : "nav-item";
  $("navSettings").className = view === "backup" ? "nav-item active" : "nav-item";

  $("containerDetailView").classList.add("hidden");
  $("globalBackBtn").classList.add("hidden");
  $("mainTitle").textContent = "MAGAZZINO";

  $("containers").parentElement.classList.toggle("hidden", view !== "home");
  $("formMaterialSection").classList.toggle("hidden", view !== "add");
  $("movementsSection").classList.toggle("hidden", view !== "history");
  $("backupSection").classList.toggle("hidden", view !== "backup");
  $("materialsListSection").classList.toggle("hidden", view !== "home");

  if (view === "add") {
    $("formtitle").textContent = "Aggiungi materiale";
    clearForm();
  }
  render();
}

$("navHome").onclick = () => navigateTo("home");
$("navAdd").onclick = () => navigateTo("add");
$("navHistory").onclick = () => navigateTo("history");
$("navSettings").onclick = () => navigateTo("backup");

$("btnActionCarico").onclick = () => {
  navigateTo("add");
  if (selectedContainer) $("container").value = selectedContainer;
  $("formtitle").textContent = "Effettua Carico";
};

$("btnActionSale").onclick = () => {
  navigateTo("add");
  if (selectedContainer) $("container").value = selectedContainer;
  $("formtitle").textContent = "Effettua Scarico (Riduci)";
};

$("btnActionStoricoLocal").onclick = () => navigateTo("history");
$("globalBackBtn").onclick = () => navigateTo("home");

function selectContainer(cId) {
  selectedContainer = cId;
  $("mainTitle").textContent = `CONTAINER ${cId}`;
  $("globalBackBtn").classList.remove("hidden");
  $("containers").parentElement.classList.add("hidden");
  $("containerDetailView").classList.remove("hidden");
  $("containerBigLabel").textContent = cId;
  
  const cMaterials = materials.filter(m => m.container === cId);
  const totalWeight = cMaterials.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
  $("containerCurrentWeight").textContent = `${totalWeight} kg`;
  
  const firstMat = cMaterials[0];
  $("containerCurrentPosition").textContent = firstMat ? `Z:${firstMat.zone || '--'} S:${firstMat.box || '--'}` : "A1-01";
  render();
}

function render() {
  const containerList = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"];
  const grid = $("containers");
  grid.innerHTML = "";

  if (currentView === "home" && !selectedContainer) {
    containerList.forEach(cId => {
      const cMaterials = materials.filter(m => m.container === cId);
      const totalWeight = cMaterials.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
      
      const card = document.createElement("div");
      card.className = "container-card-3d";
      card.innerHTML = `
        <b>${cId}</b>
        <div class="weight-indicator">${totalWeight} kg</div>
      `;
      card.onclick = () => selectContainer(cId);
      grid.appendChild(card);
    });
  }

  const matDiv = $("materials");
  matDiv.innerHTML = "";
  
  const filtered = selectedContainer ? materials.filter(m => m.container === selectedContainer) : materials;
  $("resultcount").textContent = `${filtered.length} materiali trovati`;

  filtered.forEach(m => {
    const row = document.createElement("div");
    row.className = "material-row-item";
    row.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px;">
        <span class="material-row-title">${m.name}</span>
        <span style="font-size:12px; color:#8da372; font-family:Arial,sans-serif;">Codice: ${m.code || '--'} | Container: ${m.container}</span>
      </div>
      <div style="display:flex; align-items:center; gap:15px;">
        <span class="material-row-weight">${m.quantity} ${m.unit || 'kg'}</span>
        <button class="secondary" style="min-height:35px; padding:4px 10px; font-size:12px;" id="edit-${m.id}">MODIFICA</button>
      </div>
    `;
    matDiv.appendChild(row);
    row.querySelector(`#edit-${m.id}`).onclick = (e) => {
      e.stopPropagation();
      editMaterial(m);
    };
  });
}

function editMaterial(m) {
  navigateTo("add");
  $("formtitle").textContent = "Modifica materiale";
  $("docid").value = m.id;
  $("name").value = m.name || "";
  $("code").value = m.code || "";
  $("qty").value = m.quantity || 0;
  $("unit").value = m.unit || "";
  $("container").value = m.container || "C01";
  $("zone").value = m.zone || "";
  $("box").value = m.box || "";
  $("shelf").value = m.shelf || "";
  $("rack").value = m.rack || "";
