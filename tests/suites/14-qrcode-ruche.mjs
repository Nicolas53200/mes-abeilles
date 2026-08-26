/* QR code d'une ruche : de sa génération à l'ouverture de la fiche.

   Bug remonté par un apiculteur : son QR ne le renvoyait pas sur sa
   ruche. Deux causes distinctes, toutes deux couvertes ici.
     1. Le scan forçait le code en MAJUSCULES et la recherche était
        stricte : « Ruche-001 » saisi devenait introuvable.
     2. Le QR n'encodait que le code brut : scanné avec l'appareil photo
        du téléphone, il n'affichait qu'un texte, sans lien. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

const CODES = ['RUCHE-001', 'Ruche-002', 'ruche-12', 'Lavande-1', 'R1', 'Rucher Nord 3'];

const DONNEES = {
  hives: CODES.map((c, i) => ({ code:c, name:'Ruche ' + (i+1), apiary:'Prairie',
                                type:'ruche', honey:0, alerts:0 })),
  profil:{ type:'amateur' }, apiaries:[{ name:'Prairie' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v37.0'
};

export default () => executerSuite('QR code des ruches', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, DONNEES);
  await page.goto(origine);
  await page.waitForTimeout(1300);

  rapport.section('LE BUG : un code retouché rendait la ruche introuvable');
  for(const code of CODES){
    const r = await page.evaluate(c => {
      const lu = normalizeScannedCode(c);          // ce que produit le scanner
      const trouvee = trouverRucheParCode(lu);     // ce que fait l'ouverture
      return { lu, code: trouvee?.code || null };
    }, code);
    rapport.verifier(`« ${code} » retrouvé`.padEnd(30), r.code === code, `scan → ${r.lu}`);
  }

  rapport.section('Recherche tolérante, sans confusion possible');
  const t = await page.evaluate(() => ({
    majuscules: trouverRucheParCode('RUCHE-002')?.code,
    minuscules: trouverRucheParCode('ruche-002')?.code,
    sansTiret:  trouverRucheParCode('RUCHE002')?.code,
    espaces:    trouverRucheParCode('  Ruche-002  ')?.code,
    espacesInternes: trouverRucheParCode('ruchernord3')?.code,
    inconnu:    trouverRucheParCode('RUCHE-999'),
    vide:       trouverRucheParCode(''),
    nul:        trouverRucheParCode(null)
  }));
  rapport.verifier('casse différente', t.majuscules === 'Ruche-002' && t.minuscules === 'Ruche-002');
  rapport.verifier('séparateur absent', t.sansTiret === 'Ruche-002', String(t.sansTiret));
  rapport.verifier('espaces autour', t.espaces === 'Ruche-002');
  rapport.verifier('espaces internes', t.espacesInternes === 'Rucher Nord 3', String(t.espacesInternes));
  rapport.verifier('code inconnu → rien', t.inconnu === null);
  rapport.verifier('vide ou nul → rien', t.vide === null && t.nul === null);

  // La correspondance exacte doit primer : deux codes proches restent distincts.
  const distincts = await page.evaluate(() => {
    state.hives = [{ code:'RUCHE-1', name:'A', apiary:'P', type:'ruche' },
                   { code:'ruche-1', name:'B', apiary:'P', type:'ruche' }];
    return { a: trouverRucheParCode('RUCHE-1')?.name, b: trouverRucheParCode('ruche-1')?.name };
  });
  rapport.verifier('deux codes proches restent distincts',
    distincts.a === 'A' && distincts.b === 'B', `${distincts.a} / ${distincts.b}`);

  rapport.section('Le QR contient un lien, pas un simple texte');
  await page.evaluate(d => { state.hives = d.hives; }, DONNEES);
  const lien = await page.evaluate(() => ({
    genere: lienRuche('Ruche-002'),
    estUrl: /^https?:\/\//.test(lienRuche('Ruche-002')),
    contientCode: lienRuche('Ruche-002').includes('code=')
  }));
  rapport.verifier('le QR encode une URL', lien.estUrl, lien.genere);
  rapport.verifier('l\'URL porte le code', lien.contientCode);

  const encode = await page.evaluate(() => lienRuche('Rucher Nord 3'));
  rapport.verifier('code avec espaces correctement encodé',
    encode.includes('Rucher%20Nord%203') || encode.includes('Rucher+Nord+3'), encode);

  rapport.section('Scanner l\'URL du QR ramène bien au code');
  for(const code of ['RUCHE-001', 'Ruche-002', 'Rucher Nord 3']){
    const r = await page.evaluate(c => {
      const url = lienRuche(c);                    // ce que contient le QR
      const lu = normalizeScannedCode(url);        // ce que lit le scanner
      return trouverRucheParCode(lu)?.code || null;
    }, code);
    rapport.verifier(`aller-retour « ${code} »`.padEnd(32), r === code, String(r));
  }

  rapport.section('Compatibilité : les QR déjà imprimés restent valides');
  for(const code of ['RUCHE-001', 'Ruche-002']){
    const r = await page.evaluate(c => trouverRucheParCode(normalizeScannedCode(c))?.code || null, code);
    rapport.verifier(`ancien QR (code brut) « ${code} »`.padEnd(36), r === code);
  }

  rapport.section('Ouverture depuis l\'URL du QR');
  await page.goto(origine + '/index.html?code=' + encodeURIComponent('Ruche-002'));
  await page.waitForTimeout(1500);
  const ouvert = await page.evaluate(() => ({
    ruche: state.currentHive?.code, page: state.page
  }));
  rapport.verifier('le scan ouvre la bonne fiche', ouvert.ruche === 'Ruche-002', String(ouvert.ruche));

  await page.goto(origine + '/index.html?code=RUCHE-999');
  await page.waitForTimeout(1400);
  const inconnu = await page.evaluate(() => state.page);
  rapport.verifier('code inconnu → accueil, sans plantage', inconnu === 'home', String(inconnu));

  await page.goto(origine);
  await page.waitForTimeout(1300);
  rapport.verifier('sans paramètre → accueil',
    (await page.evaluate(() => state.page)) === 'home');

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
