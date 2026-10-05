import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { Etat } from "../../src/machine.js";

/* Politique d'activation (wake-word) : les commandes « lourdes » (démarrer une
   ruche, pause, reprise, fin de tournée) exigent le mot d'activation OU une
   fenêtre armée. Les gestes de sécurité (terminer cette ruche, annuler,
   oui/non) passent directement. */

export default () => executerSuite("Activation (wake-word)", async ({ rapport }) => {

  rapport.section("Sans activation, démarrer une ruche est ignoré");
  const b = creerBanc();
  await b.demarrer();
  await b.dire("ruche 12");             // sans « mes abeilles » avant
  rapport.verifier("l'état reste EN ATTENTE", b.machine.etat === Etat.EN_ATTENTE);
  rapport.verifier("aucun enregistrement démarré", !b.audio.actions.some(a => a[0] === "demarrer"));

  rapport.section("Le wake-word ouvre une fenêtre, la commande suivante passe");
  await b.dire("mes abeilles");
  await b.dire("ruche 12");
  rapport.verifier("passage en ENREGISTREMENT", b.machine.etat === Etat.ENREGISTREMENT);

  rapport.section("La fenêtre se referme après une commande");
  await b.dire("terminer cette ruche");   // revient en attente
  await b.dire("ruche 13");               // sans nouvelle activation
  rapport.verifier("« ruche 13 » ignorée faute d'activation", b.machine.etat === Etat.EN_ATTENTE);
  rapport.verifier("une seule note jusque-là", (await b.store.toutesNotes()).length === 1);

  rapport.section("Commande préfixée « mes abeilles, … » : activation en un énoncé");
  const c = creerBanc();
  await c.demarrer();
  await c.dire("mes abeilles"); await c.dire("ruche 12");
  await c.dire("mes abeilles pause");     // wake inline
  rapport.verifier("pause acceptée directement", c.machine.etat === Etat.PAUSE);

  rapport.section("« Terminer cette ruche » ne nécessite pas d'activation");
  const d = creerBanc();
  await d.demarrer();
  await d.dire("mes abeilles"); await d.dire("ruche 12");
  await d.dire("terminer cette ruche");   // sans wake
  rapport.verifier("la ruche est bien terminée", d.machine.etat === Etat.EN_ATTENTE && (await d.store.toutesNotes()).length === 1);
});
