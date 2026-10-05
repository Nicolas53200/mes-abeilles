import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { Etat } from "../../src/machine.js";

export default () => executerSuite("Machine à états", async ({ rapport }) => {
  const b = creerBanc();

  rapport.section("Démarrage de session");
  await b.demarrer();
  rapport.verifier("état initial : EN ATTENTE", b.machine.etat === Etat.EN_ATTENTE, b.machine.etat);
  rapport.verifier("annonce « Mode Rucher actif »", b.tts.dits.includes("Mode Rucher actif."));
  rapport.verifier("micro en écoute de commandes", b.mic.dernier() === "commandes");

  rapport.section("Démarrer une ruche");
  await b.dire("mes abeilles");
  rapport.verifier("le wake-word produit un bip", b.sons.joues.includes("wake"));
  const r = await b.dire("ruche 12");
  rapport.verifier("passage en ENREGISTREMENT", b.machine.etat === Etat.ENREGISTREMENT);
  rapport.verifier("l'enregistrement audio démarre", b.audio.actions.some(a => a[0] === "demarrer"));
  rapport.verifier("confirmation du nom de la ruche", b.tts.dernier() === "Ruche 12. Enregistrement démarré.");
  rapport.verifier("un son distinct d'enregistrement est joué", b.sons.joues.includes("rec"));

  rapport.section("Terminer la ruche");
  await b.dire("terminer cette ruche");
  rapport.verifier("retour en ATTENTE", b.machine.etat === Etat.EN_ATTENTE);
  rapport.verifier("l'audio est arrêté (fichier finalisé)", b.audio.actions.some(a => a[0] === "arreter"));
  rapport.verifier("une note est sauvegardée", (await b.store.toutesNotes()).length === 1);
  rapport.verifier("confirmation « Ruche 12 enregistrée »", b.tts.dernier() === "Ruche 12 enregistrée.");

  rapport.section("Fin de tournée");
  await b.dire("mes abeilles terminer la tournee");
  rapport.verifier("état TERMINÉ", b.machine.etat === Etat.TERMINE);
  rapport.verifier("micro coupé", b.mic.dernier() === "off");
  rapport.verifier("bilan parlé avec le bon compte",
    b.tts.dernier() === "Tournée terminée. 1 ruche enregistrée.", b.tts.dernier());

  rapport.section("Après la fin, plus rien ne s'enregistre");
  const avant = (await b.store.toutesNotes()).length;
  await b.dire("mes abeilles"); await b.dire("ruche 13");
  rapport.verifier("aucune nouvelle note après TERMINÉ", (await b.store.toutesNotes()).length === avant);
  rapport.verifier("l'état reste TERMINÉ", b.machine.etat === Etat.TERMINE);
});
