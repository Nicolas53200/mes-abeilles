/* Grammaire fermée des commandes. Volontairement peu de commandes (§6/§10).
   Deux rôles :
     1) construire la liste de phrases attendues, donnée à Vosk pour une
        reconnaissance restreinte (légère, fiable, hors ligne) ;
     2) transformer un texte reconnu en INTENTION, que la machine à états
        consomme. La couche vocale n'écrit jamais directement dans l'état. */

import { normaliser } from "./texte.js";
import { phrasesRuches, resoudreRuche } from "./hives.js";

export const WAKE = "mes abeilles";

/* Intentions possibles. START_HIVE porte la ruche résolue (par code). */
export const Intention = {
  WAKE: "WAKE",
  START_HIVE: "START_HIVE",
  END_HIVE: "END_HIVE",
  END_TOUR: "END_TOUR",
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  CANCEL: "CANCEL",
  YES: "YES",
  NO: "NO",
  INCONNU: "INCONNU"
};

/* Phrases fixes → intention. Clés normalisées. */
const FIXES = [
  ["terminer cette ruche", Intention.END_HIVE],
  ["terminer la ruche", Intention.END_HIVE],
  ["terminer la tournee", Intention.END_TOUR],
  ["terminer la tournee de ruches", Intention.END_TOUR],
  ["pause", Intention.PAUSE],
  ["mettre en pause", Intention.PAUSE],
  ["reprendre", Intention.RESUME],
  ["mauvaise ruche", Intention.CANCEL],
  ["annuler", Intention.CANCEL],
  ["annuler la derniere note", Intention.CANCEL],
  ["oui", Intention.YES],
  ["non", Intention.NO]
];

/* Liste complète des phrases pour la grammaire Vosk. */
export function construireGrammaire(ruches){
  const fixes = FIXES.map(([p]) => p);
  // On fournit aussi les variantes préfixées par le wake-word, car l'énoncé
  // réel est souvent « mes abeilles, pause » / « mes abeilles, terminer la tournée ».
  const avecWake = fixes.map(p => WAKE + " " + p);
  return Array.from(new Set([
    WAKE,
    ...fixes,
    ...avecWake,
    ...phrasesRuches(ruches)
  ]));
}

/* Analyse un texte reconnu → { intention, ruche? , wake } .
   `wake` indique que l'énoncé commençait par le mot d'activation. */
export function analyser(texte, ruches){
  let t = normaliser(texte);
  if(!t) return { intention: Intention.INCONNU, wake: false };

  let wake = false;
  if(t === WAKE){ return { intention: Intention.WAKE, wake: true }; }
  if(t.startsWith(WAKE + " ")){ wake = true; t = t.slice(WAKE.length + 1).trim(); }

  for(const [phrase, intention] of FIXES){
    if(t === phrase){ return { intention, wake }; }
  }

  // Sinon : est-ce un nom de ruche ?
  const ruche = resoudreRuche(t, ruches);
  if(ruche){ return { intention: Intention.START_HIVE, ruche, wake }; }

  return { intention: Intention.INCONNU, wake };
}
