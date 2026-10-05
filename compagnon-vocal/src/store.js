/* Stockage des métadonnées de notes + marqueur d'enregistrement en cours
   (pour la récupération après interruption/crash).

   Ici : implémentation EN MÉMOIRE, utilisée par les tests et comme repli.
   Sur l'appareil, platform/store-capacitor.js fournit la même interface
   au-dessus de Preferences (métadonnées) et Filesystem (audio privé).

   Aucune note n'est jamais supprimée automatiquement (§10) : seul
   supprimerNote(), appelé explicitement, retire une entrée. */

export function creerStoreMemoire(initial = {}){
  let notes = Array.isArray(initial.notes) ? initial.notes.slice() : [];
  let actif = initial.actif || null;   // { id, audio_ref, debut, ruche } en cours

  return {
    async toutesNotes(){ return notes.slice(); },

    async enregistrerNote(note){
      // idempotent : un même note_id ne crée jamais de doublon (§anti double-intégration)
      const i = notes.findIndex(n => n.note_id === note.note_id);
      if(i >= 0) notes[i] = note; else notes.push(note);
      return note;
    },

    async definirStatut(noteId, statut){
      const n = notes.find(x => x.note_id === noteId);
      if(n) n.statut = statut;
      return n || null;
    },

    async supprimerNote(noteId){
      const avant = notes.length;
      notes = notes.filter(n => n.note_id !== noteId);
      return notes.length < avant;
    },

    /* Marqueur « un enregistrement est en cours » : posé au démarrage,
       effacé à la finalisation/annulation. Sert à la récupération. */
    async marquerActif(enr){ actif = enr ? { id:enr.id, audio_ref:enr.audio_ref, debut:enr.debut, ruche:enr.ruche } : null; },
    async effacerActif(){ actif = null; },
    async lireActif(){ return actif; },

    // Accès brut pour les tests/diagnostic.
    _etat(){ return { notes: notes.slice(), actif }; }
  };
}
