/* Le guide et les aides de l'application.

   DEUX BUGS, trouvés en cherchant pourquoi l'apiculteur « ne voit plus »
   le guide :

   1. Le tour guidé ne se lançait qu'UNE FOIS, juste après « Découvrir
      l'application », et aucun bouton nulle part ne permettait de le
      rouvrir. Seul le tour d'une ruche avait son bouton « ? ».

   2. Pire : au premier démarrage, l'invite « Rappels calendrier »
      s'ouvrait 500 ms après le guide et lui passait au-dessus dans
      l'empilement (z-index 340 contre 210). Elle recouvrait tout, bouton
      « Suivant » compris. Le guide était donc inutilisable la seule fois
      où il se lançait. */

import { executerSuite, amorcer, RUCHER_TYPE, doublerCdn } from '../lib/harness.mjs';

const INSTALLE = {
  ...RUCHER_TYPE,
  profil: { type:'amateur', nom:'Morel', napi:'53-1' },
  derniereVersionVue: 'v0-tests'
};

export default () => executerSuite('Guide et aides', async ({ page, navigateur, origine, rapport, erreurs }) => {

  rapport.section("LE BUG 1 : retrouver le guide quand on l'a déjà vu");
  await amorcer(page, INSTALLE);
  await page.goto(origine);
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  await page.evaluate(() => showPage('menu'));
  await page.waitForTimeout(350);
  const entrees = await page.evaluate(() =>
    [...document.querySelectorAll('#content button')].map(b => b.innerText.trim()));
  rapport.verifier('le menu propose de revoir le guide',
    entrees.some(t => /revoir le guide/i.test(t)), entrees.join(' · '));

  await page.evaluate(() => revoirGuide());
  await page.waitForTimeout(800);
  const ouvert = await page.evaluate(() => ({
    bulle: getComputedStyle(document.getElementById('coachBubble')).display !== 'none',
    etape: document.getElementById('coachStep')?.textContent || '',
    page: state.page,
    cible: !!document.getElementById('homeHero')
  }));
  rapport.verifier('le guide se rouvre', ouvert.bulle, ouvert.etape);
  rapport.verifier("il ramène à l'accueil, où sont ses repères",
    ouvert.page === 'home' && ouvert.cible);

  // On le déroule en entier, en cliquant réellement.
  let etapes = 0, dernierTexte = '';
  for(let i = 0; i < 12; i++){
    const fini = await page.evaluate(() =>
      getComputedStyle(document.getElementById('coachBubble')).display === 'none');
    if(fini) break;
    const libelle = await page.evaluate(() => document.getElementById('coachNextBtn')?.textContent || '');
    if(/terminer/i.test(libelle)){
      dernierTexte = await page.evaluate(() => document.getElementById('coachBody')?.textContent || '');
    }
    await page.click('#coachNextBtn', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
    etapes++;
  }
  rapport.verifier('il se déroule en entier', etapes >= 7, etapes + ' étapes');
  rapport.verifier("le dernier écran parle à quelqu'un qui le rejoue",
    /rouvrir ce guide/i.test(dernierTexte), dernierTexte.slice(0, 50) + '…');

  const apres = await page.evaluate(() => ({
    page: state.page,
    bulle: getComputedStyle(document.getElementById('coachBubble')).display !== 'none'
  }));
  rapport.verifier('il se referme', !apres.bulle);
  rapport.verifier("rejoué, il ne déporte plus vers le profil", apres.page === 'home', apres.page);

  rapport.section("LE BUG 2 : au premier démarrage, le guide doit être utilisable");
  const ctx = await navigateur.newContext({ viewport:{width:390,height:750}, isMobile:true, hasTouch:true });
  const neuf = await ctx.newPage();
  neuf.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
  await doublerCdn(neuf);
  await neuf.goto(origine);
  await neuf.waitForTimeout(1300);
  await neuf.click('#splashDiscoverBtn');
  await neuf.waitForTimeout(1600);

  const debut = await neuf.evaluate(() => {
    const btn = document.getElementById('coachNextBtn');
    const r = btn.getBoundingClientRect();
    const dessus = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    const cal = document.getElementById('calendarOnboarding');
    return {
      guide: getComputedStyle(document.getElementById('coachBubble')).display !== 'none',
      calendrier: !!cal && cal.classList.contains('open'),
      recouvert: !!(dessus && dessus !== btn && !btn.contains(dessus))
    };
  });
  rapport.verifier('le guide se lance tout seul', debut.guide);
  rapport.verifier("l'invite calendrier ne s'ouvre pas par-dessus", !debut.calendrier);
  rapport.verifier('le bouton « Suivant » est réellement cliquable', !debut.recouvert);

  let pas = 0;
  for(let i = 0; i < 12; i++){
    const fini = await neuf.evaluate(() =>
      getComputedStyle(document.getElementById('coachBubble')).display === 'none');
    if(fini) break;
    await neuf.click('#coachNextBtn', { timeout: 4000 }).catch(() => {});
    await neuf.waitForTimeout(280);
    pas++;
  }
  rapport.verifier('le tour se termine en cliquant', pas >= 7, pas + ' étapes');
  await neuf.waitForTimeout(1400);

  const fin = await neuf.evaluate(() => {
    const cal = document.getElementById('calendarOnboarding');
    return { page: state.page, calendrier: !!cal && cal.classList.contains('open') };
  });
  rapport.verifier('premier passage : il conduit au profil', fin.page === 'admin', fin.page);
  rapport.verifier("l'invite calendrier arrive après le guide, pas pendant", fin.calendrier === true);
  await ctx.close();

  rapport.section("L'aide d'une ruche reste accessible par son bouton « ? »");
  await page.evaluate(() => openHive('RUCHE-001'));
  await page.waitForTimeout(400);
  const aide = await page.evaluate(() => {
    const b = document.getElementById('hiveHelpBtn');
    return { visible: !!b && b.classList.contains('visible'), action: b?.getAttribute('onclick') || '' };
  });
  rapport.verifier('le bouton « ? » est affiché sur une fiche de ruche', aide.visible);
  rapport.verifier('il lance le tour de la ruche', /hiveCoachStart/.test(aide.action), aide.action);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
