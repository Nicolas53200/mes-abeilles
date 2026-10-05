import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { Etat } from "../../src/machine.js";

export default () => executerSuite("Changement de ruche & annulation", async ({ rapport }) => {

  rapport.section("Jamais de bascule silencieuse (§19)");
  const b = creerBanc();
  await b.demarrer();
  await b.dire("mes abeilles"); await b.dire("ruche 12");
  const notesAvant = (await b.store.toutesNotes()).length;
  const r = await b.dire("mes abeilles ruche 13");   // une autre ruche pendant l'enregistrement
  rapport.verifier("aucune bascule immédiate", b.machine.etat === Etat.ENREGISTREMENT);
  rapport.verifier("l'enregistrement de la 12 continue", b.machine.enr && b.machine.enr.ruche.code === "RUCHE-012");
  rapport.verifier("aucune note créée en silence", (await b.store.toutesNotes()).length === notesAvant);
  rapport.verifier("une question de confirmation est posée",
    r.effets.some(e => e.type === "ASK" && /Terminer la .*commencer/.test(e.texte)), r.effets.find(e=>e.type==="ASK")?.texte);

  rapport.section("Confirmation « oui » : termine la 12, démarre la 13");
  await b.dire("oui");
  const notes = await b.store.toutesNotes();
  rapport.verifier("la ruche 12 est sauvegardée", notes.length === 1 && notes[0].ruche_id === "RUCHE-012");
  rapport.verifier("la 13 est maintenant active", b.machine.enr && b.machine.enr.ruche.code === "RUCHE-013");
  rapport.verifier("toujours en ENREGISTREMENT", b.machine.etat === Etat.ENREGISTREMENT);

  rapport.section("Confirmation « non » : on continue la ruche courante");
  const c = creerBanc();
  await c.demarrer();
  await c.dire("mes abeilles"); await c.dire("ruche 12");
  await c.dire("mes abeilles ruche 13");
  await c.dire("non");
  rapport.verifier("aucune note créée", (await c.store.toutesNotes()).length === 0);
  rapport.verifier("la 12 reste active", c.machine.enr && c.machine.enr.ruche.code === "RUCHE-012");
  rapport.verifier("message « on continue »", /on continue/.test(c.tts.dernier()), c.tts.dernier());

  rapport.section("« Annuler / mauvaise ruche » jette l'enregistrement en cours sans le sauvegarder");
  const d = creerBanc();
  await d.demarrer();
  await d.dire("mes abeilles"); await d.dire("ruche 12");
  const ref = d.machine.enr.audio_ref;
  await d.dire("mauvaise ruche");
  rapport.verifier("retour en ATTENTE", d.machine.etat === Etat.EN_ATTENTE);
  rapport.verifier("aucune note sauvegardée", (await d.store.toutesNotes()).length === 0);
  rapport.verifier("le fichier audio en cours est supprimé", d.audio.actions.some(a => a[0] === "annuler" && a[1] === ref));
  rapport.verifier("marqueur d'enregistrement effacé", (await d.store.lireActif()) === null);
  rapport.verifier("annonce « Enregistrement annulé »", d.tts.dernier() === "Enregistrement annulé.");
});
