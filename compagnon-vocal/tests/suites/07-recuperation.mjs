import { executerSuite } from "../harness.mjs";
import { creerStoreMemoire } from "../../src/store.js";
import { recupererSiBesoin } from "../../src/recovery.js";
import { creerAudioMock } from "../mocks.mjs";

export default () => executerSuite("Récupération après interruption/crash", async ({ rapport }) => {

  rapport.section("Crash pendant un enregistrement, fichier présent → note récupérée");
  const audio = creerAudioMock();
  // On simule : un enregistrement a démarré, le fichier existe, puis crash.
  await audio.demarrer("notes/id-1.m4a");
  await audio.arreter("notes/id-1.m4a");   // le fichier a été flushé sur le disque
  const store = creerStoreMemoire();
  await store.marquerActif({ id:"id-1", audio_ref:"notes/id-1.m4a", debut:"2026-10-04T15:00:00.000Z",
                             ruche:{ code:"RUCHE-012", nom:"Ruche 12", rucher:"Prairie Haute" }, session_id:"s1" });

  const note = await recupererSiBesoin({ store, audioExiste:(r)=>audio.existe(r), dureeAudio:(r)=>audio.duree(r),
                                         now:()=>Date.parse("2026-10-04T15:05:00.000Z") });
  rapport.verifier("une note est récupérée", !!note);
  rapport.verifier("elle est marquée « récupérée »", note.recuperee === true);
  rapport.verifier("rattachée à la bonne ruche", note.ruche_id === "RUCHE-012");
  rapport.verifier("statut « à traiter »", note.statut === "a_traiter");
  rapport.verifier("elle est en base", (await store.toutesNotes()).length === 1);
  rapport.verifier("le marqueur est nettoyé", (await store.lireActif()) === null);
  rapport.verifier("durée estimée depuis le fichier, jamais inventée", typeof note.duree_s === "number" && note.duree_s >= 0);

  rapport.section("Marqueur orphelin sans fichier → rien de fabriqué");
  const store2 = creerStoreMemoire();
  await store2.marquerActif({ id:"id-9", audio_ref:"notes/id-9.m4a", debut:"x", ruche:{ code:"X" }, session_id:"s" });
  const note2 = await recupererSiBesoin({ store:store2, audioExiste: async () => false });
  rapport.verifier("aucune note créée", note2 === null && (await store2.toutesNotes()).length === 0);
  rapport.verifier("le marqueur orphelin est nettoyé", (await store2.lireActif()) === null);

  rapport.section("Note déjà finalisée → pas de doublon à la récupération");
  const store3 = creerStoreMemoire();
  await store3.enregistrerNote({ note_id:"id-1", session_id:"s", ruche_id:"RUCHE-012", ruche_nom:"Ruche 12",
    debut:"x", audio_ref:"notes/id-1.m4a", duree_s:10, statut:"a_traiter" });
  await store3.marquerActif({ id:"id-1", audio_ref:"notes/id-1.m4a", debut:"x", ruche:{ code:"RUCHE-012" }, session_id:"s" });
  const note3 = await recupererSiBesoin({ store:store3, audioExiste: async () => true });
  rapport.verifier("pas de seconde note", note3 === null && (await store3.toutesNotes()).length === 1);
  rapport.verifier("marqueur nettoyé", (await store3.lireActif()) === null);

  rapport.section("Rien en cours → rien à faire");
  const store4 = creerStoreMemoire();
  rapport.verifier("retour null sans marqueur", (await recupererSiBesoin({ store:store4, audioExiste: async () => true })) === null);
});
