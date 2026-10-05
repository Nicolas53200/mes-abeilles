import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { Etat } from "../../src/machine.js";

export default () => executerSuite("Pause & reprise", async ({ rapport }) => {

  rapport.section("Pause depuis l'attente (entre deux ruches)");
  const b = creerBanc();
  await b.demarrer();
  await b.dire("mes abeilles pause");
  rapport.verifier("état PAUSE", b.machine.etat === Etat.PAUSE);
  rapport.verifier("annonce « Mode vocal en pause »", b.tts.dernier() === "Mode vocal en pause.");
  rapport.verifier("micro réduit au minimum (détection reprise)", b.mic.dernier() === "pause-min");

  rapport.section("En pause, aucune observation n'est captée");
  const notesAvant = (await b.store.toutesNotes()).length;
  await b.dire("ruche 12");             // doit être ignoré en pause
  rapport.verifier("« ruche 12 » ignorée en pause", b.machine.etat === Etat.PAUSE);
  rapport.verifier("aucun enregistrement démarré", !b.audio.actions.some(a => a[0] === "demarrer"));
  rapport.verifier("aucune note créée", (await b.store.toutesNotes()).length === notesAvant);

  rapport.section("Reprise");
  await b.dire("mes abeilles reprendre");
  rapport.verifier("retour en ATTENTE", b.machine.etat === Etat.EN_ATTENTE);
  rapport.verifier("annonce « Mode vocal actif »", b.tts.dernier() === "Mode vocal actif.");
  rapport.verifier("micro de nouveau en écoute de commandes", b.mic.dernier() === "commandes");

  rapport.section("Pause PENDANT un enregistrement : la note est d'abord sauvegardée");
  const c = creerBanc();
  await c.demarrer();
  await c.dire("mes abeilles"); await c.dire("ruche 12");
  c.horloge.avance(60000);
  await c.dire("mes abeilles pause");
  rapport.verifier("la note en cours est finalisée (pas perdue)", (await c.store.toutesNotes()).length === 1);
  rapport.verifier("l'audio a été arrêté proprement", c.audio.actions.some(a => a[0] === "arreter"));
  rapport.verifier("état PAUSE après sauvegarde", c.machine.etat === Etat.PAUSE);
  rapport.verifier("annonce la sauvegarde ET la pause",
    c.tts.dernier() === "Ruche 12 enregistrée. Mode vocal en pause.", c.tts.dernier());
  rapport.verifier("plus aucun enregistrement actif (marqueur effacé)", (await c.store.lireActif()) === null);
});
