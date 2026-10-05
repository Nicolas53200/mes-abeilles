/* Utilitaires de texte pour la reconnaissance : normalisation (minuscules,
   sans accents, espaces réduits) et conversion des nombres écrits en lettres
   vers leur chiffre, pour les petits nombres de ruches courants. */

export function normaliser(s){
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // enlève les accents
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNITES = {
  "zero":0,"un":1,"une":1,"deux":2,"trois":3,"quatre":4,"cinq":5,"six":6,
  "sept":7,"huit":8,"neuf":9,"dix":10,"onze":11,"douze":12,"treize":13,
  "quatorze":14,"quinze":15,"seize":16,"dix sept":17,"dix huit":18,
  "dix neuf":19,"vingt":20,"trente":30,"quarante":40,"cinquante":50
};

/* Remplace les nombres en lettres par des chiffres, dans un texte déjà
   normalisé. Gère « vingt deux » -> « 22 », « trente et un » -> « 31 ».
   Volontairement limité aux dizaines : les ruches dépassent rarement 99,
   et une grammaire fermée n'a pas besoin de plus. */
export function motsNombre(tNormalise){
  let t = " " + tNormalise + " ";
  // composés dizaine + unité (vingt et un, trente deux…)
  const dizaines = { "vingt":20,"trente":30,"quarante":40,"cinquante":50,
    "soixante":60,"quatre vingt":80 };
  for(const [mot, val] of Object.entries(dizaines)){
    const re = new RegExp(" " + mot + "(?: et)? (un|une|deux|trois|quatre|cinq|six|sept|huit|neuf) ", "g");
    t = t.replace(re, (m, u) => " " + (val + UNITES[u]) + " ");
    t = t.replace(new RegExp(" " + mot + " ", "g"), " " + val + " ");
  }
  // nombres composés « dix sept/huit/neuf » déjà dans UNITES
  for(const [mot, val] of Object.entries(UNITES)){
    t = t.replace(new RegExp(" " + mot + " ", "g"), " " + val + " ");
  }
  return t.trim();
}
