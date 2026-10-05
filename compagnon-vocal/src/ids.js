/* Identifiants techniques uniques pour les données du compagnon.
   note_id et session_id sont des UUID v4 ; les ruches/ruchers gardent les
   clés de Mes Abeilles (code / nom), comme demandé — on n'introduit pas
   d'UUID sur l'historique existant.

   randomUUID() existe dans Node 16+ et dans la WebView Android moderne.
   On passe par une fabrique injectable pour que les tests soient
   déterministes (pas d'aléa non maîtrisé dans les assertions). */

export function uuidReel(){
  if(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"){
    return crypto.randomUUID();
  }
  // Repli très improbable (WebView ancienne) : UUID v4 à partir de getRandomValues.
  const b = new Uint8Array(16);
  (typeof crypto !== "undefined" ? crypto : { getRandomValues: a => {
    for(let i=0;i<a.length;i++) a[i] = Math.floor(Math.random()*256); return a;
  }}).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0"));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/* Fabrique par défaut, remplaçable dans les tests via creerIds(). */
export function creerIds(generateur = uuidReel){
  return { nouveau: () => generateur() };
}
