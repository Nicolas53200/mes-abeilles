import { executerSuite } from "../harness.mjs";
import { creerBanc } from "../outils.mjs";
import { construirePaquet, lirePaquet, fusionnerSansDoublon } from "../../src/echange.js";

export default () => executerSuite("Persistance, sauvegarde immédiate & anti-doublon", async ({ rapport }) => {
  const b = creerBanc();
  await b.demarrer();

  rapport.section("Sauvegarde immédiate à la fin d'une ruche (§23)");
  await b.dire("mes abeilles"); await b.dire("ruche 12");
  rapport.verifier("pendant l'enregistrement, un marqueur « actif » existe", (await b.store.lireActif()) !== null);
  await b.dire("terminer cette ruche");
  rapport.verifier("la note est écrite dès la fin (pas seulement en mémoire)", (await b.store.toutesNotes()).length === 1);
  rapport.verifier("le marqueur « actif » est effacé après sauvegarde", (await b.store.lireActif()) === null);

  rapport.section("Finaliser deux fois ne crée pas de doublon");
  const note = (await b.store.toutesNotes())[0];
  await b.store.enregistrerNote(note);   // ré-écriture du même note_id
  rapport.verifier("toujours une seule note", (await b.store.toutesNotes()).length === 1);

  rapport.section("Paquet d'échange vers Mes Abeilles : métadonnées seules, pas d'audio");
  await b.dire("mes abeilles"); await b.dire("ruche 13");
  await b.dire("terminer cette ruche");
  const paquet = construirePaquet(await b.store.toutesNotes());
  rapport.verifier("le paquet est versionné", paquet.version === 1 && paquet.format === "mes-abeilles-vocal");
  rapport.verifier("deux notes dans le paquet", paquet.notes.length === 2);
  rapport.verifier("aucun chemin de fichier privé exposé", paquet.notes.every(n => !("audio_ref" in n)));
  rapport.verifier("l'audio est désigné par note_id (le compagnon le joue)",
    paquet.notes.every(n => n.audio_source === "compagnon" && n.audio_note_id === n.note_id));

  rapport.section("Import côté Mes Abeilles : pas de double intégration");
  const recues = lirePaquet(paquet);
  const dejaConnues = [{ note_id: recues[0].note_id }];   // la 1re a déjà été importée
  const ajout = fusionnerSansDoublon(dejaConnues, recues);
  rapport.verifier("une seule note réellement ajoutée (l'autre est déjà connue)", ajout.length === 1);
  rapport.verifier("c'est bien la note non encore importée", ajout[0].note_id === recues[1].note_id);
  // Rejouer le même paquet : rien ne doit entrer deux fois.
  const ajout2 = fusionnerSansDoublon([...dejaConnues, ...ajout], recues);
  rapport.verifier("rejouer le paquet n'ajoute plus rien", ajout2.length === 0);
});
