/* Deux fonctions sectionLabel() homonymes coexistaient, la seconde
   masquant la première : le bouton retour affichait "Élément" sur
   9 sections. Cette suite verrouille la séparation des deux rôles. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

const SECTIONS = ['resume','visites','reine','materiel','traitements','frelons','nourrissement',
                  'hausses','miel','divisions','transhumance','pesees','photos','documents',
                  'conformite','qrcode','actions','ruchette'];

const MODULES = ['divisions','hausses','miel','traitements','frelons','nourrissement',
                 'pesees','transhumance','materiel'];

export default () => executerSuite('Libellés de section', async ({ page, origine, rapport }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1000);
  await page.evaluate(() => openHive('RUCHE-001'));
  await page.waitForTimeout(300);

  rapport.section('Bouton retour : nomme la section, jamais "Élément"');
  for(const s of SECTIONS){
    await page.evaluate(x => setHiveSection(x), s);
    await page.waitForTimeout(110);
    const libelle = await page.evaluate(() =>
      document.querySelector('.hive-section-back')?.innerText.replace(/^←\s*/, '').trim() || '(absent)');
    rapport.verifier(s.padEnd(14), libelle !== 'Élément' && libelle !== '(absent)' && libelle !== s, `« ${libelle} »`);
  }

  rapport.section('Toast d\'enregistrement : reste au singulier');
  for(const m of MODULES){
    const libelle = await page.evaluate(x => moduleItemLabel(x), m);
    rapport.verifier(m.padEnd(14), libelle !== 'Élément', `« ✓ ${libelle} … »`);
  }

  const repli = await page.evaluate(() => moduleItemLabel('section-inconnue'));
  rapport.verifier('repli conservé sur section inconnue', repli === 'Élément', `« ${repli} »`);
});
