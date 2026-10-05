import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { Etat } from "../../src/machine.js";

/* Rien dans la logique du compagnon ne dépend du réseau : aucun module de
   src/ n'importe fetch/XHR. Ce test rejoue la séquence terrain complète du
   §31 de bout en bout et vérifie qu'elle aboutit sans jamais rien attendre
   du réseau — et que le micro est bien coupé à la fin. */

export default () => executerSuite("Séquence terrain complète (hors ligne)", async ({ rapport }) => {
  const b = creerBanc();

  rapport.section("Aucun accès réseau dans le code de logique");
  const fetchGlobal = globalThis.fetch;
  let reseauAppele = false;
  globalThis.fetch = () => { reseauAppele = true; throw new Error("réseau interdit au rucher"); };
  try{
    await b.demarrer();

    // Ruche 12
    await b.dire("mes abeilles"); await b.dire("ruche 12");
    b.horloge.avance(3*60000);
    await b.dire("terminer cette ruche");
    // Attente 10 min
    b.horloge.avance(10*60000);
    // Ruche du Chêne
    await b.dire("mes abeilles"); await b.dire("ruche du chêne");
    b.horloge.avance(2*60000);
    await b.dire("terminer cette ruche");
    // Pause / reprise
    await b.dire("mes abeilles pause");
    await b.dire("mes abeilles reprendre");
    // Fin de tournée
    await b.dire("mes abeilles terminer la tournee");
  } finally {
    globalThis.fetch = fetchGlobal;
  }

  rapport.verifier("aucun appel réseau pendant toute la séquence", reseauAppele === false);
  rapport.verifier("deux notes capturées", (await b.store.toutesNotes()).length === 2);
  rapport.verifier("chaque note a bien un audio (fichier simulé présent)",
    (await b.store.toutesNotes()).every(n => b.audio.fichiers.has(n.audio_ref)));
  rapport.verifier("tournée terminée", b.machine.etat === Etat.TERMINE);
  rapport.verifier("micro coupé en fin de tournée", b.mic.dernier() === "off");
  rapport.verifier("bilan correct", b.tts.dernier() === "Tournée terminée. 2 ruches enregistrées.", b.tts.dernier());
});
