/* Machine à états du Mode Rucher. Cœur testable du compagnon.

   États (§7/§12) :
     EN_ATTENTE    🟢  aucune ruche en cours, on écoute les commandes
     ENREGISTREMENT 🔴  une ruche est active, l'observation est captée
     PAUSE         🟡  suspendu ; seule la détection « reprendre » survit
     TERMINE       ⚫  tournée close ; micro coupé

   Principe : la machine reçoit des INTENTIONS (déjà analysées depuis la voix)
   et émet des EFFETS (parler, biper, démarrer/arrêter l'enregistrement,
   sauvegarder, régler l'écoute micro). Elle ne touche jamais au matériel :
   l'application branche les effets sur les adaptateurs natifs. Horloge et
   générateur d'identifiants sont injectés pour des tests déterministes. */

import { Intention } from "./grammar.js";
import { finaliserNote, Statut } from "./notes.js";

export const Etat = {
  EN_ATTENTE: "EN_ATTENTE",
  ENREGISTREMENT: "ENREGISTREMENT",
  PAUSE: "PAUSE",
  TERMINE: "TERMINE"
};

/* Commandes qui exigent une activation préalable (wake-word « Mes Abeilles »
   ou fenêtre armée). « Terminer cette ruche », « annuler », « oui »/« non »
   restent acceptées directement : ce sont des gestes de sécurité immédiats. */
const EXIGE_ACTIVATION = new Set([
  Intention.START_HIVE, Intention.PAUSE, Intention.RESUME, Intention.END_TOUR
]);

export class MachineRucher {
  constructor({ sessionId, idgen, now, ruches = [] }){
    this.sessionId = sessionId;
    this.idgen = idgen;
    this.now = now;                 // () => epoch ms
    this.ruches = ruches;
    this.etat = Etat.TERMINE;       // pas encore démarrée
    this.enr = null;                // enregistrement en cours
    this.pending = null;            // confirmation de changement de ruche
    this.armed = false;             // fenêtre ouverte par le wake-word
    this.notes = [];                // notes sauvegardées cette session
    this._dernierInstant = this.now();
    this.metriques = { attenteMs:0, enregistrementMs:0, pauseMs:0, debutSession:null, finSession:null };
  }

  /* ---- utilitaires ---- */
  _iso(ms = this.now()){ return new Date(ms).toISOString(); }

  _comptabiliser(){
    const t = this.now();
    const delta = Math.max(0, t - this._dernierInstant);
    if(this.etat === Etat.EN_ATTENTE) this.metriques.attenteMs += delta;
    else if(this.etat === Etat.ENREGISTREMENT) this.metriques.enregistrementMs += delta;
    else if(this.etat === Etat.PAUSE) this.metriques.pauseMs += delta;
    this._dernierInstant = t;
  }

  _vers(etat){ this._comptabiliser(); this.etat = etat; }

  _nomRuche(ruche){ return ruche.nom_vocal || ruche.nom || ruche.code; }

  _demarrerEnr(ruche){
    const id = this.idgen.nouveau();
    this.enr = { id, ruche, audio_ref: "notes/" + id + ".m4a", debut: this._iso() };
    return this.enr;
  }

  _finaliserEnr(){
    const note = finaliserNote({ sessionId: this.sessionId, enr: this.enr, fin: this._iso(), idgen: { nouveau: () => this.enr.id } });
    this.notes.push(note);
    this.enr = null;
    return note;
  }

  /* ---- démarrage de session ---- */
  demarrer(){
    this.etat = Etat.EN_ATTENTE;
    this._dernierInstant = this.now();
    this.metriques.debutSession = this._iso();
    return [
      { type: "SOUND", nom: "start" },
      { type: "SPEAK", texte: "Mode Rucher actif." },
      { type: "MIC_LISTEN", mode: "commandes" }
    ];
  }

  /* ---- réception d'une intention ---- */
  commande(intent){
    if(this.etat === Etat.TERMINE) return [];   // tournée close : on ignore

    // Gestion de l'activation (wake-word).
    if(intent.intention === Intention.WAKE){
      this.armed = true;
      return [{ type: "SOUND", nom: "wake" }];   // bip court
    }
    const active = this.armed || intent.wake;
    if(EXIGE_ACTIVATION.has(intent.intention) && !active){
      return [];   // commande ignorée faute d'activation
    }
    // Toute commande traitée referme la fenêtre d'activation.
    const consommeArmed = () => { this.armed = false; };

    // Confirmation de changement de ruche en attente ?
    if(this.pending){
      if(intent.intention === Intention.YES){ consommeArmed(); return this._confirmerBascule(); }
      if(intent.intention === Intention.NO){ consommeArmed(); return this._annulerBascule(); }
      // toute autre commande pendant une confirmation est ignorée (on redemande)
      return [{ type: "ASK", texte: this._questionBascule() }];
    }

    switch(this.etat){
      case Etat.EN_ATTENTE: return this._enAttente(intent, consommeArmed);
      case Etat.ENREGISTREMENT: return this._enEnregistrement(intent, consommeArmed);
      case Etat.PAUSE: return this._enPause(intent, consommeArmed);
      default: return [];
    }
  }

  _enAttente(intent, consommeArmed){
    switch(intent.intention){
      case Intention.START_HIVE: {
        consommeArmed();
        const enr = this._demarrerEnr(intent.ruche);
        this._vers(Etat.ENREGISTREMENT);
        return [
          { type: "SOUND", nom: "rec" },
          { type: "START_RECORDING", audio_ref: enr.audio_ref, note_id: enr.id, ruche: enr.ruche, debut: enr.debut, session_id: this.sessionId },
          { type: "SPEAK", texte: this._nomRuche(intent.ruche) + ". Enregistrement démarré." }
        ];
      }
      case Intention.PAUSE: {
        consommeArmed(); this._vers(Etat.PAUSE);
        return [{ type:"SOUND", nom:"pause" }, { type:"SPEAK", texte:"Mode vocal en pause." }, { type:"MIC_LISTEN", mode:"pause-min" }];
      }
      case Intention.END_TOUR: { consommeArmed(); return this._terminerTournee([]); }
      default: return [];
    }
  }

  _enEnregistrement(intent, consommeArmed){
    switch(intent.intention){
      case Intention.END_HIVE: {
        const ref = this.enr.audio_ref, nom = this._nomRuche(this.enr.ruche);
        const note = this._finaliserEnr();
        this._vers(Etat.EN_ATTENTE);
        return [
          { type:"STOP_RECORDING", audio_ref: ref },
          { type:"SAVE_NOTE", note },
          { type:"SOUND", nom:"end" },
          { type:"SPEAK", texte: nom + " enregistrée." },
          { type:"MIC_LISTEN", mode:"commandes" }
        ];
      }
      case Intention.START_HIVE: {
        consommeArmed();
        if(intent.ruche.code === this.enr.ruche.code){
          return [{ type:"SPEAK", texte: this._nomRuche(this.enr.ruche) + " est déjà en cours." }];
        }
        this.pending = { versRuche: intent.ruche };
        return [{ type:"ASK", texte: this._questionBascule() }];
      }
      case Intention.CANCEL: {
        const ref = this.enr.audio_ref;
        this.enr = null;
        this._vers(Etat.EN_ATTENTE);
        return [
          { type:"DISCARD_RECORDING", audio_ref: ref },
          { type:"SPEAK", texte:"Enregistrement annulé." },
          { type:"MIC_LISTEN", mode:"commandes" }
        ];
      }
      case Intention.PAUSE: {
        // Décision de sûreté : on ne perd jamais la note en cours. On la
        // finalise AVANT de passer en pause.
        consommeArmed();
        const ref = this.enr.audio_ref, nom = this._nomRuche(this.enr.ruche);
        const note = this._finaliserEnr();
        this._vers(Etat.PAUSE);
        return [
          { type:"STOP_RECORDING", audio_ref: ref },
          { type:"SAVE_NOTE", note },
          { type:"SOUND", nom:"pause" },
          { type:"SPEAK", texte: nom + " enregistrée. Mode vocal en pause." },
          { type:"MIC_LISTEN", mode:"pause-min" }
        ];
      }
      case Intention.END_TOUR: {
        consommeArmed();
        const ref = this.enr.audio_ref, nom = this._nomRuche(this.enr.ruche);
        const note = this._finaliserEnr();
        return this._terminerTournee([
          { type:"STOP_RECORDING", audio_ref: ref },
          { type:"SAVE_NOTE", note },
          { type:"SPEAK", texte: nom + " enregistrée." }
        ]);
      }
      default: return [];
    }
  }

  _enPause(intent, consommeArmed){
    switch(intent.intention){
      case Intention.RESUME: {
        consommeArmed(); this._vers(Etat.EN_ATTENTE);
        return [{ type:"SOUND", nom:"resume" }, { type:"SPEAK", texte:"Mode vocal actif." }, { type:"MIC_LISTEN", mode:"commandes" }];
      }
      case Intention.END_TOUR: { consommeArmed(); return this._terminerTournee([]); }
      default: return [];   // en pause, on n'enregistre ni n'interprète rien d'autre
    }
  }

  _questionBascule(){
    return "La " + this._nomRuche(this.enr.ruche) + " est encore en cours. Terminer la " +
      this._nomRuche(this.enr.ruche) + " et commencer la " + this._nomRuche(this.pending.versRuche) + " ?";
  }

  _confirmerBascule(){
    const versRuche = this.pending.versRuche;
    this.pending = null;
    const refAncienne = this.enr.audio_ref, nomAncienne = this._nomRuche(this.enr.ruche);
    const note = this._finaliserEnr();
    const enr = this._demarrerEnr(versRuche);
    // l'état reste ENREGISTREMENT (nouvelle ruche)
    return [
      { type:"STOP_RECORDING", audio_ref: refAncienne },
      { type:"SAVE_NOTE", note },
      { type:"SPEAK", texte: nomAncienne + " enregistrée." },
      { type:"SOUND", nom:"rec" },
      { type:"START_RECORDING", audio_ref: enr.audio_ref, note_id: enr.id, ruche: enr.ruche, debut: enr.debut, session_id: this.sessionId },
      { type:"SPEAK", texte: this._nomRuche(versRuche) + ". Enregistrement démarré." }
    ];
  }

  _annulerBascule(){
    this.pending = null;
    return [{ type:"SPEAK", texte:"D'accord, on continue la " + this._nomRuche(this.enr.ruche) + "." }];
  }

  _terminerTournee(effetsAvant){
    this._vers(Etat.TERMINE);
    this.metriques.finSession = this._iso();
    const n = this.notes.length;
    const mot = n > 1 ? "ruches enregistrées" : "ruche enregistrée";
    return [
      ...effetsAvant,
      { type:"SOUND", nom:"end" },
      { type:"SPEAK", texte: "Tournée terminée. " + n + " " + mot + "." },
      { type:"MIC_LISTEN", mode:"off" }
    ];
  }
}
