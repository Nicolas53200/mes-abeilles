import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";

export default () => executerSuite("Session & rattachement des notes", async ({ rapport }) => {
  const b = creerBanc();
  await b.demarrer();

  // Tournée : Ruche 12, attente, Ruche du Chêne
  await b.dire("mes abeilles"); await b.dire("ruche 12");
  b.horloge.avance(3 * 60000);                    // 3 min d'observation
  await b.dire("terminer cette ruche");
  b.horloge.avance(10 * 60000);                   // 10 min d'attente
  await b.dire("mes abeilles"); await b.dire("ruche du chêne");
  b.horloge.avance(2 * 60000);
  await b.dire("terminer cette ruche");

  const notes = await b.store.toutesNotes();
  rapport.section("Deux notes, rattachées à la bonne ruche par identifiant");
  rapport.verifier("deux notes enregistrées", notes.length === 2, String(notes.length));
  rapport.verifier("note 1 → code RUCHE-012", notes[0].ruche_id === "RUCHE-012", notes[0].ruche_id);
  rapport.verifier("note 2 → code CGM-01 (pas le texte)", notes[1].ruche_id === "CGM-01", notes[1].ruche_id);
  rapport.verifier("le rucher est rattaché", notes[0].rucher_id === "Prairie Haute" && notes[1].rucher_id === "Verger");
  rapport.verifier("le nom affiché est conservé", notes[1].ruche_nom === "Ruche du Chêne");

  rapport.section("Identifiants techniques uniques");
  rapport.verifier("chaque note a un note_id", notes.every(n => !!n.note_id));
  rapport.verifier("les note_id sont distincts", notes[0].note_id !== notes[1].note_id);
  rapport.verifier("même session_id pour la tournée", notes[0].session_id === notes[1].session_id && notes[0].session_id === "session-test");
  rapport.verifier("l'audio_ref dérive du note_id", notes[0].audio_ref === "notes/" + notes[0].note_id + ".m4a");

  rapport.section("Durées et statut");
  rapport.verifier("durée note 1 ≈ 180 s", notes[0].duree_s === 180, String(notes[0].duree_s));
  rapport.verifier("durée note 2 ≈ 120 s", notes[1].duree_s === 120, String(notes[1].duree_s));
  rapport.verifier("statut initial « à traiter »", notes.every(n => n.statut === "a_traiter"));

  rapport.section("Métriques de batterie instrumentées");
  const m = b.machine.metriques;
  rapport.verifier("temps d'enregistrement cumulé ≈ 5 min", m.enregistrementMs === 5*60000, String(m.enregistrementMs));
  rapport.verifier("temps d'attente cumulé ≈ 10 min", m.attenteMs === 10*60000, String(m.attenteMs));

  rapport.section("Fin de tournée : le compte est juste");
  await b.dire("mes abeilles terminer la tournee");
  rapport.verifier("bilan « 2 ruches enregistrées »", b.tts.dernier() === "Tournée terminée. 2 ruches enregistrées.", b.tts.dernier());
});
