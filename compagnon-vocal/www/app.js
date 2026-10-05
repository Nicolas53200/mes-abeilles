/* Point d'entrée de la WebView. Branche la logique (src/) sur les
   adaptateurs réels (platform/) quand Capacitor est présent, sinon sur un
   mode démonstration clavier pour un aperçu grossier dans un navigateur.

   src/ et platform/ sont copiés dans www/ par le script « build:web »
   (voir package.json / README), d'où les imports « ./src/… ». */
import { MachineRucher, Etat } from "./src/machine.js";
import { analyser, construireGrammaire } from "./src/grammar.js";
import { chargerRuches } from "./src/hives.js";
import { creerOrchestrateur } from "./src/orchestrator.js";
import { recupererSiBesoin } from "./src/recovery.js";
import { uuidReel, creerIds } from "./src/ids.js";

const estNatif = !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());

// Jeu de ruches de test (le vrai import viendra de Mes Abeilles, phase B).
const RUCHES_DEMO = chargerRuches([
  { code:"RUCHE-012", nom:"Ruche 12", rucher:"Prairie Haute" },
  { code:"RUCHE-013", nom:"Ruche 13", rucher:"Prairie Haute" },
  { code:"CGM-01", nom:"Ruche du Chêne", nom_vocal:"Ruche du Chêne", rucher:"Verger" },
  { code:"BLEUE", nom:"Ruche Bleue", rucher:"Verger" }
]);

let store, audio, tts, sons, mic, machine, orch, ruches = RUCHES_DEMO, grammaire = [];
let chrono = null, reassure = null;

const $ = id => document.getElementById(id);
function journal(msg){ const j = $("journal"); j.textContent = (new Date().toLocaleTimeString("fr-FR") + " · " + msg + "\n" + j.textContent).slice(0, 2000); }

/* --- Adaptateurs : réels (Capacitor) ou démo (navigateur) --- */
async function construireAdaptateurs(){
  if(estNatif){
    const A = await import("./platform/adapters.js");
    const S = await import("./platform/store-capacitor.js");
    store = S.creerStoreCapacitor();
    audio = A.creerAudio();
    tts = A.creerTts();
    sons = A.creerSons();
    const vosk = A.creerVosk({ grammaire, onTexte: traiterTexte });
    mic = { async ecouter(mode){ await vosk.ecouter(mode); } };
    await vosk.charger();
    return { recupAudioExiste: S.audioExiste };
  }
  // Démo navigateur : pas de vrai micro. On tape les phrases au clavier.
  const { creerStoreMemoire } = await import("./src/store.js");
  store = creerStoreMemoire();
  const parle = t => journal("🔊 " + t);
  audio = { async demarrer(){}, async arreter(){}, async annuler(){} };
  tts = { async parler(t){ parle(t); } };
  sons = { async jouer(n){ journal("🔔 " + n); } };
  mic = { async ecouter(mode){ journal("🎙️ micro: " + mode); } };
  return { recupAudioExiste: async () => false };
}

function traiterTexte(texte){
  const intent = analyser(texte, ruches);
  appliquer(machine.commande(intent));
  rendre();
}

async function appliquer(effets){ await orch.appliquer(effets); rendre(); }

/* --- Rendu de l'état --- */
function rendre(){
  const e = machine.etat;
  const ecran = $("ecran");
  ecran.className = "etat-" + e.toLowerCase();
  const map = {
    EN_ATTENTE: ["🟢 EN ATTENTE", "Dites « Mes Abeilles » pour commencer une ruche."],
    ENREGISTREMENT: ["🔴 ENREGISTREMENT", machine.enr ? (machine.enr.ruche.nom_vocal || machine.enr.ruche.nom) : ""],
    PAUSE: ["🟡 MODE VOCAL EN PAUSE", "Dites « Mes Abeilles, reprendre »."],
    TERMINE: ["⚫ TOURNÉE TERMINÉE", "Vos notes sont enregistrées."]
  };
  const [lib, sous] = map[e] || ["Prêt",""];
  $("libelle").textContent = lib; $("sous").textContent = sous;
  $("chrono").hidden = (e !== Etat.ENREGISTREMENT);
  $("btnDemarrer").hidden = (e !== Etat.TERMINE);
  $("btnCharger").hidden = (e !== Etat.TERMINE);
  $("btnTerminer").hidden = (e === Etat.TERMINE);
  gererTimers();
}

/* Chrono d'enregistrement + petit signal périodique de réassurance (§14). */
function gererTimers(){
  clearInterval(chrono); clearInterval(reassure); chrono = reassure = null;
  if(machine.etat === Etat.ENREGISTREMENT && machine.enr){
    const t0 = Date.parse(machine.enr.debut);
    const tic = () => { const s = Math.floor((Date.now()-t0)/1000); $("chrono").textContent =
      String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); };
    tic(); chrono = setInterval(tic, 1000);
    reassure = setInterval(() => sons.jouer("rec"), 30000);   // configurable/désactivable (réglage à venir)
  }
}

/* --- Démarrage de l'application --- */
async function initialiser(){
  const idgen = creerIds(uuidReel);
  grammaire = construireGrammaire(ruches);
  const infos = await construireAdaptateurs();
  machine = new MachineRucher({ sessionId: uuidReel(), idgen, now: () => Date.now(), ruches });
  orch = creerOrchestrateur({ store, audio, tts, sons, mic });

  // Récupération d'un éventuel enregistrement interrompu.
  try{
    const rec = await recupererSiBesoin({ store, audioExiste: infos.recupAudioExiste });
    if(rec) journal("↩️ Note récupérée après interruption : " + rec.ruche_nom);
  }catch(e){ console.warn("recup", e); }

  $("btnCharger").onclick = () => { ruches = RUCHES_DEMO; grammaire = construireGrammaire(ruches);
    $("btnDemarrer").disabled = false; journal("Ruches de test chargées (" + ruches.length + ")."); };
  $("btnDemarrer").onclick = async () => { await appliquer(machine.demarrer());
    if(!estNatif) activerSaisieDemo(); };
  $("btnTerminer").onclick = () => traiterTexte("mes abeilles terminer la tournee");

  rendre();
  journal(estNatif ? "Prêt (appareil)." : "Mode démonstration navigateur : tapez les phrases.");
}

/* En démo navigateur, on saisit les phrases au clavier. */
function activerSaisieDemo(){
  if(document.getElementById("saisieDemo")) return;
  const i = document.createElement("input");
  i.id = "saisieDemo"; i.placeholder = "Tapez : mes abeilles / ruche 12 / terminer cette ruche…";
  i.style.cssText = "margin-top:10px;width:100%;min-height:52px;border-radius:14px;border:0;padding:0 14px;font-size:16px";
  i.addEventListener("keydown", ev => { if(ev.key === "Enter" && i.value.trim()){ traiterTexte(i.value.trim()); i.value=""; } });
  $("zoneActions").appendChild(i);
}

initialiser();
