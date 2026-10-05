/* Modèle d'une note du rucher. C'est la donnée qui sera transmise à Mes
   Abeilles (métadonnées), l'audio restant gardé par le compagnon. Chaque
   champ exigé par le cahier des charges (§22) est présent. */

export const Statut = { A_TRAITER: "a_traiter", TRAITEE: "traitee" };
export const Transfert = { LOCAL: "local", TRANSFEREE: "transferee" };

/* Crée la note à la FIN d'une ruche, à partir de l'enregistrement en cours.
   `enr` = { ruche, audio_ref, debut } posé au démarrage de l'enregistrement. */
export function finaliserNote({ sessionId, enr, fin, idgen }){
  const debut = enr.debut;
  const dureeS = Math.max(0, Math.round((Date.parse(fin) - Date.parse(debut)) / 1000));
  return {
    note_id:    idgen.nouveau(),
    session_id: sessionId,
    rucher_id:  enr.ruche.rucher || "",      // = nom du rucher (clé actuelle)
    ruche_id:   enr.ruche.code,              // = code de la ruche (clé actuelle)
    ruche_nom:  enr.ruche.nom_vocal || enr.ruche.nom || enr.ruche.code,
    debut,
    fin,
    duree_s:    dureeS,
    audio_ref:  enr.audio_ref,               // chemin privé dans le compagnon
    statut:     Statut.A_TRAITER,
    transfert:  Transfert.LOCAL,
    recuperee:  !!enr.recuperee              // vrai si reconstruite après un crash
  };
}

/* Validation défensive avant d'exporter/importer une note (sécurité §10). */
export function noteValide(n){
  if(!n || typeof n !== "object") return false;
  for(const champ of ["note_id","session_id","ruche_id","ruche_nom","debut","audio_ref"]){
    if(typeof n[champ] !== "string" || !n[champ]) return false;
  }
  if(typeof n.duree_s !== "number" || n.duree_s < 0) return false;
  if(![Statut.A_TRAITER, Statut.TRAITEE].includes(n.statut)) return false;
  return true;
}
