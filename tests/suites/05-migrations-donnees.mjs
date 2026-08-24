/* Crochet de migration : convertit les sauvegardes existantes quand une
   nouvelle version change la FORME des données. Vérifie surtout qu'il est
   inerte tant que le registre est vide, et qu'un échec ne perd rien. */

import { executerSuite, publierVersion } from '../lib/harness.mjs';

const MIGRATION_REELLE = `  { version: "v37.0",
    description: "honey renommé en mielRecolteKg",
    migrate(data){
      (data.hives || []).forEach(h => {
        if(h.honey !== undefined){
          h.mielRecolteKg = h.honey;
          delete h.honey;
        }
      });
    } },`;

const MIGRATION_CASSEE = `  { version: "v38.0", description: "migration volontairement défaillante",
    migrate(data){
      data.hives[0].name = "ÉCRASÉ AVANT PLANTAGE";
      throw new Error("panne simulée");
    } },`;

const semer = () => {
  state.hives = [{ code:'R-1', name:'Chêne', apiary:'Prairie', type:'ruche', honey:23,
                   visites:[{ date:'2026-03-14', notes:'OK' }] }];
  state.profil = { prenom:'Nicolas', napi:'53-12345' };
  saveState();
};

export default () => executerSuite('Migrations de données', async ({ page, origine, dossier, rapport, contexte }) => {

  rapport.section('Comparaison de versions');
  await page.goto(origine);
  await page.waitForTimeout(900);
  for(const [a, b, attendu] of [['v36.2','v37.0',-1], ['v37.0','v36.2',1], ['v36.2','v36.2',0],
                                ['v36.2','v36.10',-1], ['v9','v10',-1], ['v0','v36.2',-1],
                                ['36.2','v36.2',0], ['v37','v37.0',0], ['','v1',-1]]){
    const obtenu = await page.evaluate(([x,y]) => compareAppVersions(x,y), [a,b]);
    rapport.verifier(`${(a||'(vide)').padEnd(7)} vs ${b.padEnd(7)} = ${String(attendu).padStart(2)}`,
      obtenu === attendu, obtenu !== attendu ? `obtenu ${obtenu}` : '');
  }

  rapport.section('Registre vide : strictement aucun effet');
  await page.evaluate(semer);
  const inertie = await page.evaluate(() => {
    const sauvegarde = JSON.parse(localStorage.getItem('mesAbeilles_data_v1'));
    return { memeObjet: runDataMigrations(sauvegarde, 'test') === sauvegarde, taille: DATA_MIGRATIONS.length };
  });
  rapport.verifier('registre vide', inertie.taille === 0, `${inertie.taille} entrée(s)`);
  rapport.verifier('renvoie l\'objet reçu, sans copie', inertie.memeObjet);
  await page.reload();
  await page.waitForTimeout(1100);
  const intact = await page.evaluate(() => ({
    ruches: state.hives.length, nom: state.hives[0]?.name, honey: state.hives[0]?.honey,
    visites: state.hives[0]?.visites?.length, napi: state.profil?.napi,
    instantane: localStorage.getItem('mesAbeilles_data_avant_migration')
  }));
  rapport.verifier('données intactes au rechargement',
    intact.ruches === 1 && intact.nom === 'Chêne' && intact.honey === 23
    && intact.visites === 1 && intact.napi === '53-12345');
  rapport.verifier('aucun instantané écrit inutilement', intact.instantane === null);

  rapport.section('Migration réelle : honey → mielRecolteKg');
  // Amorcer sur une version ANTÉRIEURE à la migration testée : sinon la
  // sauvegarde porte déjà la version cible et il n'y a rien à convertir.
  publierVersion(dossier, 'v36.2', null);
  const page2 = await contexte.newPage();
  await page2.goto(origine); await page2.waitForTimeout(800);
  await page2.evaluate(semer);
  publierVersion(dossier, 'v37.0', MIGRATION_REELLE);
  await page2.reload();
  await page2.waitForTimeout(1300);
  const migre = await page2.evaluate(() => ({
    valeur: state.hives[0]?.mielRecolteKg, honey: state.hives[0]?.honey,
    nom: state.hives[0]?.name, visites: state.hives[0]?.visites?.length, napi: state.profil?.napi,
    instantane: JSON.parse(localStorage.getItem('mesAbeilles_data_avant_migration') || '{}')?.hives?.[0]?.honey,
    versionEcrite: JSON.parse(localStorage.getItem('mesAbeilles_data_v1') || '{}').appVersion
  }));
  rapport.verifier('valeur reprise', migre.valeur === 23, `mielRecolteKg=${migre.valeur}`);
  rapport.verifier('ancien champ supprimé', migre.honey === undefined);
  rapport.verifier('reste des données préservé',
    migre.nom === 'Chêne' && migre.visites === 1 && migre.napi === '53-12345');
  rapport.verifier('instantané d\'avant migration gardé', migre.instantane === 23, `honey=${migre.instantane}`);
  rapport.verifier('version réécrite', migre.versionEcrite === 'v37.0', migre.versionEcrite);

  rapport.section('Idempotence');
  await page2.reload();
  await page2.waitForTimeout(1300);
  const stable = await page2.evaluate(() => ({ valeur: state.hives[0]?.mielRecolteKg, honey: state.hives[0]?.honey }));
  rapport.verifier('pas de second passage', stable.valeur === 23 && stable.honey === undefined);
  await page2.close();

  rapport.section('Migration défaillante : rien n\'est perdu');
  const page3 = await contexte.newPage();
  publierVersion(dossier, 'v36.2', null);
  await page3.goto(origine); await page3.waitForTimeout(800);
  await page3.evaluate(semer);
  publierVersion(dossier, 'v38.0', MIGRATION_CASSEE);
  await page3.reload();
  await page3.waitForTimeout(1300);
  const rescape = await page3.evaluate(() => ({
    nom: state.hives[0]?.name, honey: state.hives[0]?.honey, napi: state.profil?.napi
  }));
  rapport.verifier('nom d\'origine conservé', rescape.nom === 'Chêne', `« ${rescape.nom} »`);
  rapport.verifier('données non corrompues', rescape.honey === 23 && rescape.napi === '53-12345');
  await page3.close();
});
