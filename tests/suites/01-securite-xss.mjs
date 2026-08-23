/* Vérifie qu'aucune donnée saisie par l'utilisateur ne peut exécuter de
   code, sur toutes les pages et toutes les sous-sections de ruche.
   Sur la version d'avant correctif, cette suite relevait 45 exécutions. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

const IMG = `<img src=x onerror="window.__XSS__=(window.__XSS__||0)+1">`;
const JS  = `x'+(window.__XSS__=(window.__XSS__||0)+1)+'`;

const SECTIONS = ['resume','visites','reine','materiel','traitements','frelons','nourrissement',
                  'hausses','miel','divisions','transhumance','pesees','photos','documents',
                  'conformite','qrcode','actions'];

const PIEGE = {
  hives: [{
    code:'RUCHE-01', name:IMG, apiary:IMG, type:'ruche', honey:12, alerts:false,
    documents:[{ id:'d1', name:IMG, category:IMG, desc:IMG, size:'1 Ko', date:'2026-01-05', dataUrl:'' }],
    photos:  [{ id:'p1', name:IMG, desc:IMG, date:'2026-01-05' }],
    traitements:   [{ date:'2026-01-05', type:JS,  quantite:IMG, notes:IMG, followupDate:'2026-02-05' }],
    nourrissements:[{ date:'2026-01-05', type:IMG, quantite:IMG, notes:IMG, followupDate:'2026-02-05' }],
    frelons:       [{ date:'2026-01-05', observation:IMG, piege:IMG, captures:IMG, notes:IMG }],
    hausses:       [{ date:'2026-01-05', action:IMG, nombre:IMG, notes:IMG }],
    recoltes:      [{ date:'2026-01-05', type:IMG, kilos:IMG, butinage:IMG, notes:IMG }],
    divisions:     [{ date:'2026-01-05', newName:JS, newCode:JS, couvain:IMG, miel:IMG,
                      cellule:IMG, reine:IMG, followupDate:'2026-02-05' }],
    transhumances: [{ date:'2026-01-05', depart:IMG, arrivee:IMG, nb:IMG, floraison:IMG, gps:IMG, notes:IMG }],
    pesees:        [{ date:'2026-01-05', total:IMG, gauche:IMG, droite:IMG, notes:IMG }],
    material: { type:'Dadant', frames:'10', condition:IMG, notes:IMG }
  }],
  profil: { prenom:IMG, nom:IMG, entreprise:IMG, napi:IMG, siret:IMG,
            adresse:IMG, telephone:IMG, email:IMG, logoName:IMG, type:'pro' },
  apiaries: [{ name:IMG }],
  onboardingDone:true, calendarPromptDone:true, hiveTourDone:true
};

export default () => executerSuite('Sécurité — injection de code', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, PIEGE);
  await page.goto(origine);
  await page.waitForTimeout(1200);

  let vides = 0;
  const parcourir = async (etiquette) => {
    const texte = await page.evaluate(() => document.getElementById('content')?.innerText || '');
    if(texte.trim().length === 0){ vides++; console.log(`     ⚠️ vue vide : ${etiquette}`); }
  };

  rapport.section('Parcours de toutes les vues avec des données piégées');
  for(const p of ['home','ruchers','alerts','admin']){
    await page.evaluate(n => showPage(n), p);
    await page.waitForTimeout(220);
    await parcourir('page ' + p);
  }
  await page.evaluate(() => openHive('RUCHE-01'));
  await page.waitForTimeout(300);
  for(const s of SECTIONS){
    await page.evaluate(x => setHiveSection(x), s);
    await page.waitForTimeout(160);
    await parcourir('section ' + s);
  }
  await page.waitForTimeout(500);

  const executions = await page.evaluate(() => window.__XSS__ || 0);
  const balises    = await page.evaluate(() => document.querySelectorAll('img[src="x"]').length);
  const enTexte    = await page.evaluate(() => document.body.innerText.includes('<img src=x'));

  rapport.section('Résultat');
  rapport.verifier('aucun code exécuté', executions === 0, `${executions} exécution(s)`);
  rapport.verifier('aucune balise injectée dans le DOM', balises === 0, `${balises} balise(s)`);
  rapport.verifier('la charge s\'affiche comme du texte', enTexte);
  rapport.verifier('les 21 vues sont rendues', vides === 0, `${vides} vide(s)`);
  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
