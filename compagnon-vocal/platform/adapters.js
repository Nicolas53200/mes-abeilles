/* Adaptateurs RÉELS, branchés sur les plugins Capacitor via les globales
   (window.Capacitor.Plugins.*) — pas de bundler nécessaire, comme Mes
   Abeilles. Ces fichiers NE SONT PAS exercés par les tests Node : la logique
   l'est avec des mocks. Ils ne tournent que dans la WebView Android.

   Détection de capacités systématique (§14) : on ne suppose jamais qu'une
   API existe. */

const P = () => (globalThis.Capacitor && globalThis.Capacitor.Plugins) || {};

/* ---- Enregistrement audio ----
   capacitor-voice-recorder : gère les interruptions (appel entrant). Le mode
   arrière-plan / écran verrouillé est assuré par le service de premier plan
   déclaré côté Android (voir android-glue/). */
export function creerAudio(){
  const VR = () => P().VoiceRecorder;
  return {
    async disponible(){
      try{ const r = await VR()?.canDeviceVoiceRecord?.(); return !!(r && r.value); }catch{ return false; }
    },
    async demarrer(){ try{ await VR()?.startRecording?.(); }catch(e){ console.warn("[audio] start", e); } },
    async arreter(){
      // Renvoie le contenu enregistré ; la couche appelante l'écrit sur le
      // disque privé via Filesystem sous le nom audio_ref.
      try{ return await VR()?.stopRecording?.(); }catch(e){ console.warn("[audio] stop", e); return null; }
    },
    async annuler(){ try{ await VR()?.stopRecording?.(); }catch{} }
  };
}

/* ---- Synthèse vocale (confirmations) ----
   @capacitor-community/text-to-speech : voix système, hors ligne SI la voix
   française est installée. On vérifie au démarrage (voixFrancaiseDisponible). */
export function creerTts(){
  const T = () => P().TextToSpeech;
  return {
    async parler(texte){
      try{ await T()?.speak?.({ text: texte, lang: "fr-FR", rate: 1.0 }); }
      catch(e){ console.warn("[tts]", e); }
    },
    async voixFrancaiseDisponible(){
      try{
        const r = await T()?.getSupportedVoices?.();
        const voix = (r && r.voices) || [];
        return voix.some(v => (v.lang || "").toLowerCase().startsWith("fr"));
      }catch{ return false; }
    }
  };
}

/* ---- Reconnaissance locale (Vosk) ----
   Grammaire restreinte, hors ligne, modèle FR embarqué. On expose un flux
   d'énoncés reconnus via un callback ; la logique les transforme en
   intentions. Les modes « commandes » / « pause-min » / « off » règlent ce
   que l'on écoute pour économiser la batterie. */
export function creerVosk({ grammaire, onTexte }){
  const V = () => P().Vosk;
  let actif = false;
  return {
    async disponible(){ try{ return !!V(); }catch{ return false; } },
    async charger(){
      try{
        await V()?.loadModel?.({ path: "models/vosk-model-small-fr" });
      }catch(e){ console.warn("[vosk] loadModel", e); }
    },
    async ecouter(mode){
      try{
        if(mode === "off"){ actif = false; await V()?.stop?.(); return; }
        // En pause, on restreint la grammaire au strict « reprendre » pour
        // alléger la détection (§11/§32).
        const g = mode === "pause-min" ? ["mes abeilles reprendre", "reprendre", "mes abeilles"] : grammaire;
        await V()?.setGrammar?.({ phrases: g });
        if(!actif){ actif = true; await V()?.start?.(); }
        V()?.addListener?.("result", ev => { if(ev && ev.text) onTexte(ev.text); });
      }catch(e){ console.warn("[vosk] ecouter", e); }
    }
  };
}

/* ---- Sons courts de confirmation d'état (§13) ----
   Petits bips encodés en data-URI (aucun fichier réseau). Jouables même
   quand le TTS est occupé. */
export function creerSons(){
  const freqs = { wake:880, rec:660, end:440, pause:330, resume:770, start:550 };
  let ctx = null;
  return {
    async jouer(nom){
      try{
        ctx = ctx || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = freqs[nom] || 600; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        o.start(); o.stop(ctx.currentTime + 0.18);
      }catch(e){ /* le son est un confort, jamais bloquant */ }
    }
  };
}
