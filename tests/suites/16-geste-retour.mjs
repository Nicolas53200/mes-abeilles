/* Geste de retour du téléphone.

   LE BUG : sur mobile, le balayage du bord gauche vers la droite (et le
   bouton retour d'Android) déclenchent le retour arrière du navigateur.
   L'application ne déposant aucune étape dans l'historique, ce geste
   faisait QUITTER le site — l'apiculteur perdait la fiche qu'il était en
   train de remplir, souvent debout devant sa ruche.

   Deux pièges surveillés ici :
   · l'étape d'historique doit être déposée DÈS LE DÉMARRAGE. Elle l'était
     dans une fonction placée après l'appel à initApp(), et la constante
     qu'elle lisait n'était pas encore initialisée : l'erreur de zone morte
     était avalée par un try/catch et le geste quittait le site comme avant.
   · on ne doit jamais enfermer l'utilisateur : depuis l'accueil, il faut
     toujours pouvoir sortir. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Geste de retour', async ({ page, origine, rapport, erreurs }) => {

  rapport.section("LE PIÈGE : l'étape d'historique est posée dès le démarrage");
  await amorcer(page, { ...RUCHER_TYPE, derniereVersionVue: 'v0-tests' });
  await page.goto('about:blank');            // une page derrière, pour voir si on sort
  await page.goto(origine);
  await page.waitForTimeout(1400);

  const amorce = await page.evaluate(() => ({
    marque: history.state && history.state.mesAbeillesRetour === true,
    longueur: history.length
  }));
  rapport.verifier("une étape d'avance existe avant toute navigation",
    amorce.marque === true, `marque=${amorce.marque} · ${amorce.longueur} entrées`);

  const ou = () => page.evaluate(() => ({
    page: state.page,
    fiche: (() => { const b = document.getElementById('hiveHelpBtn');
                    return !!(state.currentHive && b && b.classList.contains('visible')); })(),
    section: state.hiveSection,
    form: state.moduleFormOpen,
    surcouche: !!document.getElementById('nouveautesModal')?.classList.contains('open'),
    dansLApp: /Mes Abeilles/.test(document.title)
  }));
  const geste = async () => { await page.goBack(); await page.waitForTimeout(420); };

  rapport.section("Le geste remonte d'un niveau au lieu de quitter");
  // La bienvenue peut être à l'écran : on la referme d'abord.
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });
  await page.evaluate(() => showPage('ruchers'));      await page.waitForTimeout(250);
  await page.evaluate(() => openHive('RUCHE-001'));    await page.waitForTimeout(350);
  await page.evaluate(() => setHiveSection('traitements')); await page.waitForTimeout(250);
  await page.evaluate(() => openModuleForm('traitements')); await page.waitForTimeout(250);
  rapport.verifier('départ : formulaire de traitement ouvert', (await ou()).form === 'traitements');

  await geste(); let e = await ou();
  rapport.verifier('1er geste ferme le formulaire', !e.form && e.fiche, e.section);
  await geste(); e = await ou();
  rapport.verifier('2e geste revient à la grille des sections', e.fiche && e.section === 'grid', e.section);
  await geste(); e = await ou();
  rapport.verifier('3e geste revient à la liste des ruches', !e.fiche && e.page === 'ruchers', e.page);
  await geste(); e = await ou();
  rapport.verifier("4e geste revient à l'accueil", e.page === 'home', e.page);
  rapport.verifier("le site n'a jamais été quitté", e.dansLApp === true);

  rapport.section("Une surcouche se referme aussi par le geste");
  await page.evaluate(() => ouvrirNouveautes(true)); await page.waitForTimeout(350);
  rapport.verifier('panneau ouvert', (await ou()).surcouche === true);
  await geste(); e = await ou();
  rapport.verifier('le geste referme le panneau, sans quitter', !e.surcouche && e.dansLApp);

  rapport.section("PERSONNE N'EST ENFERMÉ : depuis l'accueil on peut sortir");
  await geste();
  const prevenu = await page.evaluate(() => ({
    dansLApp: /Mes Abeilles/.test(document.title),
    message: document.getElementById('toast')?.innerText || ''
  }));
  rapport.verifier('le 1er geste à l\'accueil prévient sans quitter', prevenu.dansLApp);
  rapport.verifier('un message dit comment quitter', /quitter/i.test(prevenu.message), prevenu.message);
  await page.goBack(); await page.waitForTimeout(700);
  const titre = await page.title();
  rapport.verifier('le geste suivant quitte réellement le site', !/Mes Abeilles/.test(titre), titre || 'about:blank');

  rapport.section("Le lien d'un QR code reste intact");
  await page.goto(origine + '/?code=RUCHE-002');
  await page.waitForTimeout(1400);
  const qr = await page.evaluate(() => ({
    adresse: location.search,
    ouverte: state.currentHive && state.currentHive.code,
    marque: history.state && history.state.mesAbeillesRetour === true
  }));
  rapport.verifier('la ruche du QR est bien ouverte', qr.ouverte === 'RUCHE-002', qr.ouverte);
  rapport.verifier("l'adresse n'est pas réécrite", qr.adresse === '?code=RUCHE-002', qr.adresse);
  rapport.verifier("l'étape d'avance est posée là aussi", qr.marque === true);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));
});
