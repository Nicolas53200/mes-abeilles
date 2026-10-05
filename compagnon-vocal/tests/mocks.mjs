/* Adaptateurs simulés pour les tests : ils enregistrent ce qu'on leur demande
   au lieu de toucher au vrai matériel. Permettent de vérifier la logique de
   bout en bout (effets → audio/tts/micro/stockage) sans appareil. */

export function creerAudioMock(){
  const fichiers = new Map();   // audio_ref -> { ouvert, octets }
  const actions = [];
  return {
    actions, fichiers,
    async demarrer(ref){ fichiers.set(ref, { ouvert:true, octets: 0 }); actions.push(["demarrer", ref]); },
    async arreter(ref){ const f = fichiers.get(ref); if(f){ f.ouvert = false; f.octets = 128000; } actions.push(["arreter", ref]); },
    async annuler(ref){ fichiers.delete(ref); actions.push(["annuler", ref]); },
    // utilitaires pour la récupération
    async existe(ref){ return fichiers.has(ref); },
    async duree(ref){ const f = fichiers.get(ref); return f && f.octets ? Math.round(f.octets / 16000) : 0; }
  };
}

export function creerTtsMock(){
  const dits = [];
  return { dits, async parler(t){ dits.push(t); }, dernier(){ return dits[dits.length-1]; } };
}

export function creerSonsMock(){
  const joues = [];
  return { joues, async jouer(nom){ joues.push(nom); } };
}

export function creerMicMock(){
  const modes = [];
  return { modes, async ecouter(mode){ modes.push(mode); }, dernier(){ return modes[modes.length-1]; } };
}

/* Horloge contrôlable : avance(ms) pour simuler le temps qui passe. */
export function creerHorloge(depart = Date.parse("2026-10-04T15:00:00.000Z")){
  let t = depart;
  return { maintenant: () => t, avance: (ms) => { t += ms; return t; } };
}

/* Générateur d'identifiants déterministe : id-1, id-2, … */
export function creerIdsSeq(prefixe = "id"){
  let n = 0;
  return { nouveau: () => prefixe + "-" + (++n) };
}
