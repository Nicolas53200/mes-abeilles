/* Applique les EFFETS émis par la machine aux adaptateurs (audio, synthèse
   vocale, sons, micro) et au stockage. C'est ici — et seulement ici — que le
   marqueur de récupération est posé/effacé, de façon à ne jamais perdre une
   note :
     START_RECORDING  → marque l'enregistrement actif + démarre l'audio
     STOP_RECORDING   → arrête l'audio (fichier finalisé)
     SAVE_NOTE        → écrit la note PUIS efface le marqueur (ordre sûr)
     DISCARD_RECORDING→ annule l'audio + efface le marqueur (aucune note)

   Les adaptateurs sont injectés : réels sur l'appareil, simulés dans les
   tests. L'orchestrateur reste donc entièrement testable. */

export function creerOrchestrateur({ store, audio, tts, sons, mic, journal = null }){
  async function appliquer(effets){
    for(const e of (effets || [])){
      switch(e.type){
        case "SOUND":            await sons?.jouer?.(e.nom); break;
        case "SPEAK":
        case "ASK":              await tts?.parler?.(e.texte); break;
        case "START_RECORDING":
          await store.marquerActif({ id:e.note_id, audio_ref:e.audio_ref, debut:e.debut, ruche:e.ruche, session_id:e.session_id });
          await audio?.demarrer?.(e.audio_ref);
          break;
        case "STOP_RECORDING":   await audio?.arreter?.(e.audio_ref); break;
        case "SAVE_NOTE":
          await store.enregistrerNote(e.note);
          await store.effacerActif();
          break;
        case "DISCARD_RECORDING":
          await audio?.annuler?.(e.audio_ref);
          await store.effacerActif();
          break;
        case "MIC_LISTEN":       await mic?.ecouter?.(e.mode); break;
        default: break;
      }
      if(journal) journal.push(e);
    }
    return effets;
  }
  return { appliquer };
}
