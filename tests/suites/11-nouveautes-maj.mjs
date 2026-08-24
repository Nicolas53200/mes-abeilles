/* Panneau des nouveautés et bandeau de mise à jour.
   Deux pièges surveillés : le panneau ne doit PAS se rouvrir à chaque
   lancement (la clé doit être relue par mergeLoadedState, pas seulement
   sauvegardée), et il ne doit rien annoncer à une première installation. */

import { executerSuite, amorcer, RUCHER_TYPE, RACINE } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

export default () => executerSuite('Nouveautés et mise à jour', async ({ page, origine, rapport, erreurs, navigateur }) => {

  rapport.section('Cohérence des versions');
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf-8');
  const sw   = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf-8');
  const appV = (html.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
  const cache = (sw.match(/const CACHE_NAME = "([^"]+)"/) || [])[1];
  rapport.verifier('APP_VERSION défini', !!appV, appV);
  rapport.verifier('CACHE_NAME reprend la version',
    cache === 'mes-abeilles-' + String(appV).replace(/^v/, 'v').replace('.', '-'),
    `${cache} vs ${appV}`);
  rapport.verifier('le titre affiche la version', html.includes(`Mes Abeilles 🐝 ${appV}`));
  rapport.verifier('le journal couvre la version courante',
    new RegExp(`version:\\s*"${appV.replace('.', '\\.')}"`).test(html));

  rapport.section('Première installation : rien à annoncer');
  await amorcer(page, { ...RUCHER_TYPE });   // aucune derniereVersionVue
  await page.goto(origine);
  await page.waitForTimeout(1400);
  const neuf = await page.evaluate(() => ({
    ouvert: document.getElementById('nouveautesModal')?.classList.contains('open'),
    versionEnregistree: state.derniereVersionVue,
    nonVues: nouveautesNonVues().length
  }));
  rapport.verifier('aucun panneau au premier lancement', !neuf.ouvert);
  rapport.verifier('la version est mémorisée pour la suite',
    neuf.versionEnregistree === await page.evaluate(() => APP_VERSION), neuf.versionEnregistree);
  rapport.verifier('rien de « non vu »', neuf.nonVues === 0);

  rapport.section('Après une mise à jour : le panneau se présente');
  // Contexte SANS script d'amorce : addInitScript se rejoue à chaque
  // navigation et réécraserait la sauvegarde qu'on vient de modifier.
  const ctx2 = await navigateur.newContext();
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
  await p2.route(u => /unpkg|jsdelivr/.test(u.href), r => r.fulfill({
    contentType: 'text/javascript',
    body: 'window.L={};window.QRCode={toCanvas:(c,v,o,cb)=>{if(typeof o==="function")o(null);else if(cb)cb(null);}};window.jsQR=()=>null;' }));
  await p2.goto(origine);
  await p2.waitForTimeout(1300);
  // Passer par l'état en mémoire, pas par le localStorage brut : l'app
  // sauvegarde sur pagehide, et réécrirait l'état courant par-dessus une
  // écriture directe juste avant que le rechargement ne la lise.
  await p2.evaluate(d => {
    state.hives = d.hives;
    state.profil = d.profil;
    state.apiaries = d.apiaries;
    state.onboardingDone = true;
    state.hiveTourDone = true;
    state.calendarPromptDone = true;
    state.derniereVersionVue = 'v36.2';      // l'utilisateur venait de l'ancienne
    saveState();
  }, RUCHER_TYPE);
  await p2.reload();
  await p2.waitForTimeout(1500);
  const apres = await p2.evaluate(() => ({
    ouvert: document.getElementById('nouveautesModal')?.classList.contains('open'),
    version: document.getElementById('nouveautesVersion')?.textContent || '',
    nb: document.querySelectorAll('#nouveautesListe .nouveaute').length,
    texte: document.getElementById('nouveautesListe')?.innerText || ''
  }));
  rapport.verifier('le panneau s\'ouvre', apres.ouvert);
  rapport.verifier('il annonce la version', /v37\.0/.test(apres.version), apres.version);
  rapport.verifier('il liste les nouveautés', apres.nb >= 5, `${apres.nb} entrées`);
  rapport.verifier('les suggestions de saison y figurent', apres.texte.includes('Suggestions de saison'));
  rapport.verifier('le hors-connexion y figure', apres.texte.includes('hors connexion'));

  rapport.section('LE PIÈGE : ne pas se rouvrir à chaque lancement');
  await p2.evaluate(() => fermerNouveautes());
  await p2.waitForTimeout(200);
  rapport.verifier('fermé après « J\'ai compris »',
    !(await p2.evaluate(() => document.getElementById('nouveautesModal').classList.contains('open'))));
  const memorise = await p2.evaluate(() =>
    JSON.parse(localStorage.getItem('mesAbeilles_data_v1')).derniereVersionVue);
  rapport.verifier('version écrite dans la sauvegarde', memorise === 'v37.0', String(memorise));

  await p2.reload();
  await p2.waitForTimeout(1500);
  const relance = await p2.evaluate(() => ({
    ouvert: document.getElementById('nouveautesModal')?.classList.contains('open'),
    relu: state.derniereVersionVue
  }));
  rapport.verifier('la clé est bien RELUE au chargement', relance.relu === 'v37.0', String(relance.relu));
  rapport.verifier('le panneau ne se rouvre pas', !relance.ouvert);
  await p2.reload();
  await p2.waitForTimeout(1400);
  rapport.verifier('ni au lancement suivant',
    !(await p2.evaluate(() => document.getElementById('nouveautesModal')?.classList.contains('open'))));

  rapport.section('Consultable à tout moment depuis le menu');
  const menu = await p2.evaluate(() => {
    showPage('menu');
    return document.getElementById('content')?.innerText || '';
  });
  rapport.verifier('entrée « Quoi de neuf » dans le menu', menu.includes('Quoi de neuf'));
  const rouvert = await p2.evaluate(() => {
    ouvrirNouveautes(true);
    return document.getElementById('nouveautesModal')?.classList.contains('open');
  });
  rapport.verifier('le menu le rouvre', rouvert);
  await p2.evaluate(() => fermerNouveautes());

  rapport.section('Échap ferme le panneau');
  await p2.evaluate(() => ouvrirNouveautes(true));
  await p2.waitForTimeout(150);
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(200);
  rapport.verifier('refermé par Échap',
    !(await p2.evaluate(() => document.getElementById('nouveautesModal').classList.contains('open'))));

  rapport.section('Bandeau de mise à jour');
  const bandeau = await p2.evaluate(() => {
    const b = document.getElementById('majBandeau');
    return { existe: !!b, cacheAuDepart: !b.classList.contains('open'),
             live: b.getAttribute('aria-live'),
             texte: b.innerText };
  });
  rapport.verifier('bandeau présent dans la page', bandeau.existe);
  rapport.verifier('masqué tant qu\'aucune mise à jour', bandeau.cacheAuDepart);
  rapport.verifier('annoncé aux lecteurs d\'écran', bandeau.live === 'polite');
  rapport.verifier('rassure sur les données', /données sont conservées/i.test(bandeau.texte));

  const affiche = await p2.evaluate(() => {
    afficherBandeauMaj(null);
    return document.getElementById('majBandeau').classList.contains('open');
  });
  rapport.verifier('s\'affiche quand une version arrive', affiche);
  const referme = await p2.evaluate(() => {
    masquerBandeauMaj();
    return !document.getElementById('majBandeau').classList.contains('open');
  });
  rapport.verifier('« Plus tard » le referme', referme);

  rapport.section('Le service worker attend l\'accord de l\'utilisateur');
  rapport.verifier('plus de skipWaiting automatique à l\'installation',
    !/\.then\(\(\) => self\.skipWaiting\(\)\)/.test(sw));
  rapport.verifier('skipWaiting déclenché par message',
    /addEventListener\("message"[\s\S]*SKIP_WAITING[\s\S]*skipWaiting/.test(sw));
  rapport.verifier('la page écoute controllerchange', html.includes("'controllerchange'"));
  rapport.verifier('vérification périodique branchée', html.includes('setInterval(verifier'));

  await ctx2.close();
  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
