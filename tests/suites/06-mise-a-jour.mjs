/* La question centrale du modèle de l'app : les données restent sur
   l'appareil de l'utilisateur et doivent survivre à chaque publication
   d'une nouvelle version. */

import { executerSuite, publierVersion } from '../lib/harness.mjs';

export default () => executerSuite('Survie des données à une mise à jour', async ({ page, origine, dossier, rapport }) => {
  await page.goto(origine);
  await page.waitForTimeout(1200);

  rapport.section('L\'utilisateur saisit ses données en v36.2');
  await page.evaluate(() => {
    state.hives = [{
      code:'RUCHE-042', name:'Rucher du Chêne', apiary:'Prairie Haute', type:'ruche', honey:23, alerts:0,
      visites:[{ date:'2026-03-14', notes:'Colonie vigoureuse' }],
      traitements:[{ date:'2026-04-02', type:'Apivar', quantite:'2 lanières' }],
      pesees:[{ date:'2026-05-01', total:'41', gauche:'20', droite:'21' }]
    }];
    state.profil = { prenom:'Nicolas', nom:'Morel', napi:'53-12345', type:'pro' };
    state.apiaries = [{ name:'Prairie Haute' }];
    state.onboardingDone = true;
    saveState();
  });
  const avant = await page.evaluate(() => ({
    ruches: state.hives.length, nom: state.hives[0].name,
    visites: state.hives[0].visites.length, traitements: state.hives[0].traitements.length,
    pesees: state.hives[0].pesees.length, napi: state.profil.napi
  }));
  console.log(`     ${avant.ruches} ruche « ${avant.nom} », NAPI ${avant.napi}`);
  console.log(`     ${avant.visites} visite, ${avant.traitements} traitement, ${avant.pesees} pesée`);

  rapport.section('Publication d\'une v37.0 ajoutant un nouveau réglage');
  let html = (await import('node:fs')).readFileSync(dossier + '/index.html', 'utf-8');
  publierVersion(dossier, 'v37.0', null);
  const fs = await import('node:fs');
  // Ancrage sur l'ouverture de l'objet state : stable quand de nouvelles
  // clés y sont ajoutées, contrairement à un ancrage sur la dernière ligne.
  const source = fs.readFileSync(dossier + '/index.html', 'utf-8');
  const ancre = 'const state = {';
  if(!source.includes(ancre)) throw new Error("objet state introuvable");
  html = source.replace(ancre, ancre + '\n  nouvelleOptionV37: "valeur par défaut",');
  fs.writeFileSync(dossier + '/index.html', html);

  await page.reload();
  await page.waitForTimeout(1400);

  const apres = await page.evaluate(() => ({
    version: APP_VERSION, ruches: state.hives.length, nom: state.hives[0]?.name,
    visites: state.hives[0]?.visites?.length ?? 0,
    traitements: state.hives[0]?.traitements?.length ?? 0,
    pesees: state.hives[0]?.pesees?.length ?? 0,
    napi: state.profil?.napi, champNeuf: state.nouvelleOptionV37,
    versionStockee: JSON.parse(localStorage.getItem('mesAbeilles_data_v1') || '{}').appVersion
  }));

  rapport.section('Après mise à jour');
  rapport.verifier('ruche conservée', apres.ruches === avant.ruches && apres.nom === avant.nom);
  rapport.verifier('historique des visites', apres.visites === avant.visites);
  rapport.verifier('historique des traitements', apres.traitements === avant.traitements);
  rapport.verifier('historique des pesées', apres.pesees === avant.pesees);
  rapport.verifier('profil conservé', apres.napi === avant.napi);
  rapport.verifier('code applicatif à jour', apres.version === 'v37.0', apres.version);
  rapport.verifier('nouveau réglage initialisé par défaut',
    apres.champNeuf === 'valeur par défaut', `« ${apres.champNeuf} »`);
  rapport.verifier('version réécrite dans la sauvegarde', apres.versionStockee === 'v37.0');
});
