/* Échange avec Mes Abeilles, local et hors ligne (§25).

   Mes Abeilles → compagnon : un fichier ruches.json (code, nom, nom_vocal?,
   rucher). On le valide à l'import (chargerRuches).

   Compagnon → Mes Abeilles : un paquet de MÉTADONNÉES uniquement. L'audio
   reste chez le compagnon (gardien), jamais dupliqué. Mes Abeilles reçoit de
   quoi lister et retrouver chaque note ; l'écoute passe par le compagnon via
   son note_id. Le paquet est versionné pour rester compatible dans le temps. */

import { noteValide } from "./notes.js";

export const VERSION_ECHANGE = 1;

/* Construit le paquet à remettre à Mes Abeilles. On n'inclut que les champs
   de métadonnées — jamais l'audio lui-même. */
export function construirePaquet(notes, { appareil = "android" } = {}){
  const propres = notes.filter(noteValide).map(n => ({
    note_id: n.note_id,
    session_id: n.session_id,
    rucher_id: n.rucher_id,
    ruche_id: n.ruche_id,
    ruche_nom: n.ruche_nom,
    debut: n.debut,
    fin: n.fin || "",
    duree_s: n.duree_s,
    statut: n.statut,
    transfert: n.transfert,
    // Référence pour retrouver l'audio CHEZ LE COMPAGNON (pas un chemin de
    // fichier privé que Mes Abeilles ne pourrait pas ouvrir) : on désigne la
    // note par son id, le compagnon sait la jouer.
    audio_source: "compagnon",
    audio_note_id: n.note_id
  }));
  return {
    format: "mes-abeilles-vocal",
    version: VERSION_ECHANGE,
    genere_le: new Date().toISOString(),
    appareil,
    notes: propres
  };
}

/* Lit un paquet reçu (côté Mes Abeilles, plus tard). Validation stricte :
   on rejette un paquet d'une version inconnue ou mal formé plutôt que de
   l'ingérer à l'aveugle. */
export function lirePaquet(paquet){
  if(!paquet || paquet.format !== "mes-abeilles-vocal") throw new Error("Paquet non reconnu");
  if(paquet.version > VERSION_ECHANGE) throw new Error("Paquet d'une version plus récente que l'application");
  if(!Array.isArray(paquet.notes)) throw new Error("Paquet sans liste de notes");
  return paquet.notes.filter(n => n && typeof n.note_id === "string" && n.note_id);
}

/* Fusionne un paquet dans un ensemble de notes déjà connues de Mes Abeilles,
   SANS double intégration : une note déjà présente (même note_id) n'est pas
   réimportée (§anti-doublon). Retourne les notes réellement ajoutées. */
export function fusionnerSansDoublon(existantes, recues){
  const connus = new Set(existantes.map(n => n.note_id));
  const ajoutees = recues.filter(n => !connus.has(n.note_id));
  return ajoutees;
}
