/* Accessibilité clavier et lecteurs d'écran.
   Les contrôles utilisent de VRAIES frappes (Tab, Entrée, Espace, Échap),
   pas la simple présence d'attributs : c'est le comportement qui compte. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Accessibilité', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1200);

  rapport.section('Lien d\'évitement');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300); // laisse la transition CSS se terminer
  const evitement = await page.evaluate(() => {
    const a = document.activeElement;
    return { classe: a?.className, texte: a?.innerText?.trim(), visible: a?.getBoundingClientRect().top > 0 };
  });
  rapport.verifier('atteint au premier Tab', evitement.classe === 'skip-link', `« ${evitement.texte} »`);
  rapport.verifier('devient visible au focus', evitement.visible === true);

  rapport.section('Cartes de ruche actionnables au clavier');
  const carte = await page.evaluate(() => {
    const c = document.querySelector('.hive-card');
    return { role: c?.getAttribute('role'), tab: c?.getAttribute('tabindex'), label: c?.getAttribute('aria-label') };
  });
  rapport.verifier('role="button"', carte.role === 'button');
  rapport.verifier('tabindex="0"', carte.tab === '0');
  rapport.verifier('intitulé nommant la ruche', !!carte.label && carte.label.includes('Lavande'), `« ${carte.label} »`);

  await page.evaluate(() => document.querySelector('.hive-card').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  rapport.verifier('Entrée ouvre la ruche',
    (await page.evaluate(() => state.currentHive?.code)) === 'RUCHE-001');

  await page.evaluate(() => showPage('home'));
  await page.waitForTimeout(350);
  await page.evaluate(() => document.querySelectorAll('.hive-card')[1]?.focus());
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  rapport.verifier('Espace ouvre la ruche',
    (await page.evaluate(() => state.currentHive?.code)) === 'RUCHE-002');

  rapport.section('Échap ferme les surcouches');
  await page.evaluate(() => showPage('home'));
  await page.waitForTimeout(300);
  await page.evaluate(() => openScoreModal('RUCHE-001'));
  await page.waitForTimeout(250);
  rapport.verifier('modale ouverte',
    await page.evaluate(() => document.getElementById('scoreModal').classList.contains('open')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  rapport.verifier('Échap la referme',
    !(await page.evaluate(() => document.getElementById('scoreModal').classList.contains('open'))));

  rapport.section('Lecteurs d\'écran');
  const aria = await page.evaluate(() => ({
    toastRole: document.getElementById('toast')?.getAttribute('role'),
    toastLive: document.getElementById('toast')?.getAttribute('aria-live'),
    dialogue: document.getElementById('scoreModal')?.getAttribute('aria-modal'),
    boutonsIcone: [...document.querySelectorAll('.icon-btn')].every(b => b.getAttribute('aria-label')),
    boutonPlus: !!document.querySelector('.plus')?.getAttribute('aria-label'),
    mainFocusable: document.getElementById('content')?.getAttribute('tabindex')
  }));
  rapport.verifier('toast annoncé', aria.toastRole === 'status' && aria.toastLive === 'polite');
  rapport.verifier('modale en aria-modal', aria.dialogue === 'true');
  rapport.verifier('boutons icône intitulés', aria.boutonsIcone);
  rapport.verifier('bouton + intitulé', aria.boutonPlus);
  rapport.verifier('main focusable', aria.mainFocusable === '-1');

  rapport.section('aria-current suit la navigation');
  let coherent = true; const trace = [];
  for(const [p, nav] of [['home','home'],['ruchers','ruchers'],['alerts','alerts']]){
    await page.evaluate(x => showPage(x), p);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const c = document.querySelectorAll('[aria-current="page"]');
      return { n: c.length, nav: c[0]?.getAttribute('data-nav') };
    });
    if(r.n !== 1 || r.nav !== nav) coherent = false;
    trace.push(`${p}→${r.nav || 'aucun'}`);
  }
  rapport.verifier('un seul onglet marqué courant', coherent, trace.join(', '));

  rapport.section('Focus visible');
  await page.evaluate(() => showPage('home'));
  await page.waitForTimeout(300);
  const contour = await page.evaluate(() => {
    const el = document.querySelector('.hive-card');
    if(!el) return null;
    el.focus();
    return getComputedStyle(el).outlineWidth;
  });
  rapport.verifier('contour de focus défini', contour && contour !== '0px', contour);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
