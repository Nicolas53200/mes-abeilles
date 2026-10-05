/* Récupération d'un enregistrement interrompu (§23).

   Au démarrage du compagnon, si un marqueur « enregistrement en cours »
   subsiste (crash, batterie, appel entrant, fermeture brutale) ET que le
   fichier audio correspondant existe réellement, on reconstruit une note
   « à traiter » plutôt que de perdre l'observation. La note est marquée
   récupérée, et sa durée est estimée depuis la taille/horodatage quand c'est
   possible — sinon laissée à 0, jamais inventée.

   `audioExiste` et `dureeAudio` sont fournis par la plateforme (Filesystem) ;
   des mocks les remplacent dans les tests. */

import { Statut, Transfert } from "./notes.js";

export async function recupererSiBesoin({ store, audioExiste, dureeAudio = async () => 0, now = () => Date.now() }){
  const actif = await store.lireActif();
  if(!actif) return null;

  // Le marqueur existe. Le fichier est-il réellement là ?
  const present = await audioExiste(actif.audio_ref);
  if(!present){
    // Rien à récupérer : on nettoie le marqueur orphelin.
    await store.effacerActif();
    return null;
  }

  // On ne recrée pas une note si elle a déjà été finalisée (même id déjà en base).
  const deja = (await store.toutesNotes()).some(n => n.note_id === actif.id);
  if(deja){ await store.effacerActif(); return null; }

  const duree = Math.max(0, Math.round((await dureeAudio(actif.audio_ref)) || 0));
  const note = {
    note_id: actif.id,
    session_id: actif.session_id || "session-recuperee",
    rucher_id: actif.ruche?.rucher || "",
    ruche_id: actif.ruche?.code || "",
    ruche_nom: actif.ruche?.nom_vocal || actif.ruche?.nom || actif.ruche?.code || "Ruche inconnue",
    debut: actif.debut || new Date(now()).toISOString(),
    fin: new Date(now()).toISOString(),
    duree_s: duree,
    audio_ref: actif.audio_ref,
    statut: Statut.A_TRAITER,
    transfert: Transfert.LOCAL,
    recuperee: true
  };
  await store.enregistrerNote(note);
  await store.effacerActif();
  return note;
}
