/* Stockage RÉEL sur l'appareil : métadonnées dans Preferences (petit JSON),
   audio dans le dossier privé de l'app via Filesystem. Même interface que
   creerStoreMemoire() — la logique ne voit aucune différence.

   Non exercé par les tests Node (c'est le store mémoire qui l'est). */

const P = () => (globalThis.Capacitor && globalThis.Capacitor.Plugins) || {};
const CLE_NOTES = "notes";
const CLE_ACTIF = "actif";

async function lireJSON(cle, defaut){
  try{
    const r = await P().Preferences?.get?.({ key: cle });
    return r && r.value ? JSON.parse(r.value) : defaut;
  }catch{ return defaut; }
}
async function ecrireJSON(cle, valeur){
  try{ await P().Preferences?.set?.({ key: cle, value: JSON.stringify(valeur) }); }catch(e){ console.warn("[store]", e); }
}

export function creerStoreCapacitor(){
  return {
    async toutesNotes(){ return await lireJSON(CLE_NOTES, []); },

    async enregistrerNote(note){
      const notes = await lireJSON(CLE_NOTES, []);
      const i = notes.findIndex(n => n.note_id === note.note_id);
      if(i >= 0) notes[i] = note; else notes.push(note);
      await ecrireJSON(CLE_NOTES, notes);
      return note;
    },

    async definirStatut(noteId, statut){
      const notes = await lireJSON(CLE_NOTES, []);
      const n = notes.find(x => x.note_id === noteId);
      if(n){ n.statut = statut; await ecrireJSON(CLE_NOTES, notes); }
      return n || null;
    },

    async supprimerNote(noteId){
      // Ne supprime QUE sur demande explicite (§10) ; n'efface jamais l'audio
      // automatiquement d'une note non traitée.
      const notes = await lireJSON(CLE_NOTES, []);
      const reste = notes.filter(n => n.note_id !== noteId);
      await ecrireJSON(CLE_NOTES, reste);
      return reste.length < notes.length;
    },

    async marquerActif(enr){ await ecrireJSON(CLE_ACTIF, enr || null); },
    async effacerActif(){ await ecrireJSON(CLE_ACTIF, null); },
    async lireActif(){ return await lireJSON(CLE_ACTIF, null); }
  };
}

/* Existence et durée d'un fichier audio privé, pour la récupération. */
export async function audioExiste(ref){
  try{ await P().Filesystem?.stat?.({ path: ref, directory: "DATA" }); return true; }catch{ return false; }
}
