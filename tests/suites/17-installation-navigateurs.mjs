/* Proposer l'installation, quel que soit le navigateur.

   LE BUG : un apiculteur reçoit le lien et l'ouvre. Si son navigateur ne
   déclenche pas l'invite automatique « beforeinstallprompt », l'accueil
   ne disait RIEN sur l'installation — il repartait en pensant que
   l'application ne s'installe pas.

   Trois situations étaient muettes :
   · lien ouvert depuis Messenger, Instagram, TikTok… : le navigateur
     intégré ne peut ni installer ni ouvrir la caméra. Il faut dire de
     rouvrir le lien dans le vrai navigateur ;
   · Chrome ou Firefox sur iPhone : seul Safari sait ajouter à l'écran
     d'accueil ;
   · Firefox ou Samsung Internet sur Android : installation possible,
     mais uniquement depuis le menu du navigateur.

   Ces suites lisent le contexte détecté ET la bannière réellement
   affichée : c'est elle que voit l'apiculteur. */

import { executerSuite, doublerCdn } from '../lib/harness.mjs';

const NAVIGATEURS = [
  { nom: 'iPhone · Safari',       attendu: 'ios',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    titre: /installer/i },
  { nom: 'iPhone · Chrome',       attendu: 'ios-autre',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
    titre: /safari/i },
  { nom: 'Android · Messenger',   attendu: 'navigateur-integre',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.35.108;]',
    titre: /navigateur/i },
  { nom: 'iPhone · Instagram',    attendu: 'navigateur-integre',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0',
    titre: /navigateur/i },
  { nom: 'Android · Firefox',     attendu: 'manuel',
    ua: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
    titre: /installer/i }
];

export default () => executerSuite('Installation selon le navigateur', async ({ navigateur, origine, rapport, erreurs }) => {

  rapport.section("LE BUG : chaque navigateur reçoit une explication, aucun n'est laissé muet");
  for(const n of NAVIGATEURS){
    const ctx = await navigateur.newContext({ userAgent: n.ua, viewport:{width:390,height:750}, isMobile:true });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
    await doublerCdn(page);
    await page.goto(origine);
    await page.waitForTimeout(1100);
    await page.click('#splashDiscoverBtn').catch(() => {});
    await page.waitForTimeout(700);

    const vu = await page.evaluate(() => ({
      contexte: contexteInstallation(),
      titres: [...document.querySelectorAll('.guide-title')].map(x => x.innerText),
      sous: [...document.querySelectorAll('.guide-sub')].map(x => x.innerText)
    }));
    rapport.verifier(`contexte reconnu — ${n.nom}`, vu.contexte === n.attendu, vu.contexte);
    rapport.verifier(`une explication est affichée — ${n.nom}`,
      vu.titres.some(t => n.titre.test(t)), vu.titres.join(' | ') || 'rien');
    rapport.verifier(`elle dit quoi faire — ${n.nom}`,
      vu.sous.some(t => t.trim().length > 20));
    await ctx.close();
  }

  rapport.section("Une application déjà installée ne se voit plus rien proposer");
  const ctxI = await navigateur.newContext({ viewport:{width:390,height:750}, isMobile:true });
  const pageI = await ctxI.newPage();
  await doublerCdn(pageI);
  await pageI.addInitScript(() => {
    // Simule un lancement depuis l'écran d'accueil.
    const vrai = window.matchMedia.bind(window);
    window.matchMedia = q => /standalone/.test(q) ? { matches:true, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} } : vrai(q);
  });
  await pageI.goto(origine);
  await pageI.waitForTimeout(1100);
  await pageI.click('#splashDiscoverBtn').catch(() => {});
  await pageI.waitForTimeout(700);
  const installee = await pageI.evaluate(() => ({
    contexte: contexteInstallation(),
    propose: peutProposerInstallation(),
    explique: peutExpliquerInstallation(),
    titres: [...document.querySelectorAll('.guide-title')].map(x => x.innerText)
  }));
  rapport.verifier('contexte « installee »', installee.contexte === 'installee', installee.contexte);
  rapport.verifier('plus aucune invite', !installee.propose && !installee.explique);
  rapport.verifier("l'accueil revient à ses conseils habituels",
    !installee.titres.some(t => /installer|navigateur|safari/i.test(t)), installee.titres.join(' | '));
  await ctxI.close();

  rapport.section("L'invite native du navigateur reste prioritaire");
  const ctxN = await navigateur.newContext({ viewport:{width:390,height:750}, isMobile:true });
  const pageN = await ctxN.newPage();
  await doublerCdn(pageN);
  await pageN.goto(origine);
  await pageN.waitForTimeout(1100);
  // Chromium automatisé ne déclenche jamais beforeinstallprompt : on le
  // simule, c'est le chemin qu'emprunte un vrai téléphone Android.
  const natif = await pageN.evaluate(() => {
    const ev = new Event('beforeinstallprompt');
    ev.prompt = () => {}; ev.userChoice = Promise.resolve({outcome:'accepted'});
    window.dispatchEvent(ev);
    return { contexte: contexteInstallation(), propose: peutProposerInstallation() };
  });
  rapport.verifier('contexte « invite » quand le navigateur le permet', natif.contexte === 'invite', natif.contexte);
  rapport.verifier('installation proposée en tête', natif.propose === true);
  await pageN.click('#splashDiscoverBtn').catch(() => {});
  await pageN.waitForTimeout(600);
  const bouton = await pageN.evaluate(() =>
    [...document.querySelectorAll('.guide-btn')].map(b => b.innerText));
  rapport.verifier('le bouton propose bien d\'installer', bouton.some(b => /installer/i.test(b)), bouton.join(' | '));
  await ctxN.close();

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
