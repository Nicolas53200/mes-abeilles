/* La prochaine visite, et le sens des pastilles.

   RETOUR D'USAGE, capture à l'appui : « j'ai bien un petit 1 sur Visites,
   mais quand je clique sur Visites je ne vois pas la prochaine visite
   prévue, alors qu'elle apparaît dans Alertes ».

   Deux défauts distincts derrière cette phrase :

   1. La date de prochaine visite était calculée et affichée sur la page
      Alertes et sur le Résumé de la ruche — mais pas dans la section
      Visites, c'est-à-dire précisément là où on la cherche.

   2. La pastille de la grille servait à deux choses opposées avec la
      même couleur d'alerte. Sur Actions elle compte ce qu'il y a À
      TRAITER ; sur Visites, Traitements, Frelons, Hausses et Photos elle
      ne compte que des enregistrements DÉJÀ FAITS. Un « 1 » rouge sur
      Visites se lisait donc comme un rappel en attente — c'est
      exactement l'interprétation qu'en a faite l'apiculteur. */

import { executerSuite, doublerCdn } from '../lib/harness.mjs';

export default () => executerSuite('Prochaine visite et pastilles',
  async ({ page, origine, rapport, erreurs }) => {

  // Une seule visite, faite hier : la situation de la capture.
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await page.addInitScript(d => {
    try{
      localStorage.setItem('mesAbeilles_data_v1', JSON.stringify({
        hives: [{ code:'RUCHE-001', name:'Essai', type:'ruche', honey:0, alerts:1,
          visites:[{ date:d, reine:'Oui', ponte:'Normale', couvain:'Normal',
                     reserves:'Bonnes', varroa:'Non contrôlé', frelons:'Non', score:90 }] }],
        profil:{ type:'amateur' }, apiaries:[],
        onboardingDone:true, hiveTourDone:true, calendarPromptDone:true,
        derniereVersionVue:'v0-tests', derniereSauvegarde:new Date().toISOString().slice(0,10)
      }));
    }catch(e){}
  }, hier);
  await doublerCdn(page);
  await page.goto(origine);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  rapport.section("LE BUG : la prochaine visite manquait dans Visites");
  await page.evaluate(() => { openHive('RUCHE-001'); setHiveSection('visites'); });
  await page.waitForTimeout(500);
  const v = await page.evaluate(() => ({
    carte: !!document.querySelector('.resume-next-visit'),
    titre: document.querySelector('.resume-next-visit-title')?.innerText || '',
    bouton: !!document.querySelector('.resume-next-visit button'),
    texte: document.getElementById('hiveDetailContent')?.innerText || ''
  }));
  rapport.verifier('la carte est affichée dans la section Visites', v.carte, v.titre);
  rapport.verifier('elle porte une date', /\d{2}\/\d{2}\/\d{4}/.test(v.titre), v.titre);
  rapport.verifier("elle permet d'en faire un rappel", v.bouton);
  rapport.verifier("l'historique et « Nouvelle visite » restent en place",
    /Nouvelle visite/.test(v.texte) && /90/.test(v.texte));

  rapport.section("Visites et Alertes doivent annoncer la MÊME date");
  const alertes = await page.evaluate(() => {
    showPage('alerts');
    return document.getElementById('content')?.innerText || '';
  });
  const dateAlerte = (alertes.match(/Prochaine visite\s*:?\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
  const dateVisite = (v.titre.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1];
  rapport.verifier('les deux écrans concordent', !!dateVisite && dateAlerte === dateVisite,
    `Alertes ${dateAlerte} · Visites ${dateVisite}`);

  rapport.section("LE PIÈGE : une pastille rouge annonce quelque chose à faire");
  await page.evaluate(() => { openHive('RUCHE-001'); setHiveSection('grid'); });
  await page.waitForTimeout(400);
  const past = await page.evaluate(() => {
    const lire = label => {
      const b = [...document.querySelectorAll('.hive-grid-btn')].find(x => x.innerText.includes(label));
      const p = b?.querySelector('.hgb-badge');
      return p ? { texte: p.innerText, alerte: p.classList.contains('hgb-badge-alerte'),
                   fond: getComputedStyle(p).backgroundColor } : null;
    };
    return { visites: lire('Visites'), actions: lire('Actions') };
  });
  rapport.verifier('la pastille de Visites reste : le décompte est utile',
    !!past.visites, past.visites?.texte);
  rapport.verifier("mais elle n'a plus la couleur d'alerte",
    past.visites && past.visites.alerte === false, past.visites?.fond);
  rapport.verifier("celle d'Actions garde le rouge : il y a à traiter",
    past.actions?.alerte === true, past.actions?.fond);
  rapport.verifier('les deux se distinguent bien à l\'œil',
    past.visites && past.actions && past.visites.fond !== past.actions.fond);

  rapport.section('Une ruche sans visite ne promet rien');
  const sansVisite = await page.evaluate(() => {
    state.hives[0].visites = [];
    setHiveSection('visites');
    return { carte: !!document.querySelector('.resume-next-visit'),
             texte: document.querySelector('.resume-next-visit')?.innerText || '' };
  });
  rapport.verifier("elle affiche l'encart sans inventer de date",
    sansVisite.carte && /Aucune visite enregistrée/.test(sansVisite.texte),
    sansVisite.texte.split('\n').filter(Boolean).slice(0,2).join(' · '));

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
