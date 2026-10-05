/* Liste des ruches, fournie par Mes Abeilles (fichier ruches.json).
   Chaque ruche garde les clés de Mes Abeilles : `code` (identifiant de la
   ruche) et `rucher` (= nom du rucher). Un `nom_vocal` facultatif permet de
   dire « Ruche Château Gontier 1 » pour un code affiché « CGM-01 ».

   Le rattachement d'une note se fait TOUJOURS par le code, jamais par le
   seul texte reconnu. */

import { normaliser, motsNombre } from "./texte.js";

/* Valide et nettoie la liste importée. Rejette tout ce qui n'est pas
   conforme plutôt que d'accepter des données douteuses (sécurité §10). */
export function chargerRuches(brut){
  if(!Array.isArray(brut)) throw new Error("Liste de ruches invalide : tableau attendu");
  const ruches = [];
  for(const r of brut){
    if(!r || typeof r !== "object") continue;
    const code = String(r.code ?? "").trim();
    if(!code) continue;                         // une ruche sans code est inexploitable
    ruches.push({
      code: code.slice(0, 64),
      nom: String(r.nom ?? code).trim().slice(0, 120),
      nom_vocal: r.nom_vocal != null ? String(r.nom_vocal).trim().slice(0, 120) : "",
      rucher: String(r.rucher ?? "").trim().slice(0, 120)   // = rucher_id (nom)
    });
  }
  // Dédoublonnage par code : deux ruches de même code sont une erreur de source.
  const vus = new Set();
  return ruches.filter(r => (vus.has(r.code) ? false : vus.add(r.code)));
}

/* Construit la liste des phrases que le moteur vocal doit reconnaître pour
   désigner une ruche : nom affiché, nom vocal, et « ruche <code> ». */
export function phrasesRuches(ruches){
  const out = [];
  for(const r of ruches){
    if(r.nom) out.push(r.nom);
    if(r.nom_vocal) out.push(r.nom_vocal);
    if(/^\d+$/.test(r.code)) out.push("ruche " + r.code);
  }
  return out;
}

/* Résout un texte reconnu vers UNE ruche (par son code), ou null.
   Ordre de préférence : nom_vocal exact → nom exact → « ruche N » /
   numéro → correspondance par code. Tout est normalisé (minuscules, sans
   accents) et « douze » est ramené à « 12 ». */
export function resoudreRuche(texte, ruches){
  const t = normaliser(texte);
  if(!t) return null;
  const tNum = motsNombre(t);   // « ruche douze » -> « ruche 12 »
  // On compare toujours le texte brut ET sa version en chiffres, car le nom
  // d'une ruche peut lui-même contenir un nombre (« Ruche 12 »).
  const eq = (valeur) => { const v = normaliser(valeur); return v === t || v === tNum; };
  const contient = (valeur) => { const v = normaliser(valeur); return !!v && (t.includes(v) || tNum.includes(v)); };

  const essais = [
    r => r.nom_vocal && eq(r.nom_vocal),
    r => r.nom && eq(r.nom),
    r => /^\d+$/.test(r.code) && (tNum === "ruche " + r.code || tNum === r.code),
    r => eq(r.code),
    // tolérance : le texte CONTIENT le nom (ex. « la ruche du chêne »)
    r => r.nom && contient(r.nom),
    r => r.nom_vocal && contient(r.nom_vocal),
    r => /^\d+$/.test(r.code) && tNum.includes("ruche " + r.code)
  ];
  for(const test of essais){
    const trouve = ruches.filter(test);
    if(trouve.length === 1) return trouve[0];   // ambiguïté => on ne devine pas
  }
  return null;
}
