/* Banc d'essai : assemble la machine, le stockage mémoire, les adaptateurs
   simulés et l'orchestrateur, exactement comme sur l'appareil — mais sans
   matériel. `dire(texte)` simule une phrase reconnue : texte → intention →
   machine → effets appliqués. C'est le vrai chemin de données. */

import { MachineRucher } from "../src/machine.js";
import { analyser } from "../src/grammar.js";
import { creerStoreMemoire } from "../src/store.js";
import { creerOrchestrateur } from "../src/orchestrator.js";
import { chargerRuches } from "../src/hives.js";
import { creerAudioMock, creerTtsMock, creerSonsMock, creerMicMock, creerHorloge, creerIdsSeq } from "./mocks.mjs";

export const RUCHES_TEST = chargerRuches([
  { code:"RUCHE-012", nom:"Ruche 12", rucher:"Prairie Haute" },
  { code:"RUCHE-013", nom:"Ruche 13", rucher:"Prairie Haute" },
  { code:"CGM-01", nom:"Ruche du Chêne", nom_vocal:"Ruche du Chêne", rucher:"Verger" },
  { code:"BLEUE", nom:"Ruche Bleue", rucher:"Verger" }
]);

export function creerBanc({ ruches = RUCHES_TEST } = {}){
  const horloge = creerHorloge();
  const ids = creerIdsSeq();
  const store = creerStoreMemoire();
  const audio = creerAudioMock(), tts = creerTtsMock(), sons = creerSonsMock(), mic = creerMicMock();
  const machine = new MachineRucher({ sessionId:"session-test", idgen:ids, now:horloge.maintenant, ruches });
  const orch = creerOrchestrateur({ store, audio, tts, sons, mic });

  async function demarrer(){ return orch.appliquer(machine.demarrer()); }
  async function dire(texte){
    const intent = analyser(texte, ruches);
    const effets = machine.commande(intent);
    await orch.appliquer(effets);
    return { intent, effets };
  }
  return { horloge, ids, store, audio, tts, sons, mic, machine, orch, demarrer, dire, ruches };
}
