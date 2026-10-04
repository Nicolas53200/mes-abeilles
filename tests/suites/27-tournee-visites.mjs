/* La tournée du jour : voir d'un coup d'œil les ruches déjà faites.

   RETOUR D'USAGE : « il s'y perd quand il doit remplir les informations.
   Quand un apiculteur fait une visite, il peut faire plusieurs ruches. »
   Décision prise avec lui : les ruches faites aujourd'hui le disent (coche
   verte), s'estompent, et passent en bas de la liste — on ne MASQUE pas,
   pour qu'une ruche ne disparaisse jamais en silence.

   RÈGLE QUI ÉVITE LE PIÈGE : le réordonnancement ne s'applique QUE pendant
   une tournée (au moins une ruche faite dans la journée). Hors tournée,
   l'ordre normal revient de lui-même — la liste sert aussi à retrouver une
   ruche pour noter une récolte le soir.

   « Visitée aujourd'hui » se DÉDUIT des visites : aucune donnée stockée,
   aucune liste blanche, aucune migration. */

import { executerSuite } from '../lib/harness.mjs';

export default () => executerSuite('Tournée du jour',
  async ({ page, origine, rapport, erreurs }) => {

  const today = new Date().toISOString().slice(0, 10);
  const hier  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const fr = iso => iso.split('-').reverse().join('/');

  const ruche = (code, name, dates) => ({
    code, name, apiary:'Prairie', type:'ruche', honey:0, alerts:0,
    date: dates && dates.length ? fr(dates[0]) : '—',
    visites: (dates || []).map(d => ({ date:d, score:80 }))
  });

  await page.addInitScript(d => {
    try{
      localStorage.setItem('mesAbeilles_data_v1', JSON.stringify({
        hives: d.hives, profil:{ type:'amateur' }, apiaries:[{ name:'Prairie' }],
        onboardingDone:true, hiveTourDone:true, calendarPromptDone:true,
        derniereVersionVue:'v0-tests', derniereSauvegarde:'2026-09-01'
      }));
    }catch(e){}
  }, { hives: [
    ruche('R-1', 'Alpha',   []),            // jamais visitée
    ruche('R-2', 'Bravo',   [today]),       // faite aujourd'hui
    ruche('R-3', 'Charlie', [hier]),        // faite hier
    ruche('R-4', 'Delta',   [today]),       // faite aujourd'hui
    ruche('R-5', 'Echo',    [today, hier])  // faite aujourd'hui ET hier
  ]});
  await page.goto(origine);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  // ── La déduction ────────────────────────────────────────────────
  rapport.section("« Visitée aujourd'hui » se déduit des visites, rien n'est stocké");
  const dedu = await page.evaluate(() => {
    const t = new Date().toISOString().slice(0,10);
    const h = new Date(Date.now()-86400000).toISOString().slice(0,10);
    return {
      jamais:    visiteeAujourdhui({ visites:[] }),
      aujourdhui:visiteeAujourdhui({ visites:[{date:t}] }),
      hier:      visiteeAujourdhui({ visites:[{date:h}] }),
      // Une visite d'aujourd'hui compte même si elle n'est pas la première.
      pasPremiere:visiteeAujourdhui({ visites:[{date:h},{date:t}] }),
      sansTableau:visiteeAujourdhui({}),
      nul:       visiteeAujourdhui(null)
    };
  });
  rapport.verifier('jamais visitée → non', dedu.jamais === false);
  rapport.verifier('visite du jour → oui', dedu.aujourdhui === true);
  rapport.verifier('visite d’hier → non', dedu.hier === false);
  rapport.verifier('une visite du jour compte même si ce n’est pas la première',
    dedu.pasPremiere === true);
  rapport.verifier('une ruche sans tableau de visites ne plante pas',
    dedu.sansTableau === false);
  rapport.verifier('un objet nul ne plante pas', dedu.nul === false);

  // ── L'ordre ─────────────────────────────────────────────────────
  rapport.section("Les ruches faites passent en bas, les autres gardent leur ordre");
  await page.evaluate(() => showPage('ruchers'));
  await page.waitForTimeout(400);
  const ordre = await page.evaluate(() =>
    [...document.querySelectorAll('#ruchersGrid .hive-card .hive-title')].map(e => e.textContent));
  rapport.verifier('les non faites d’abord, dans l’ordre d’origine (Alpha, Charlie)',
    ordre[0].includes('Alpha') && ordre[1].includes('Charlie'), ordre.join(' · '));
  rapport.verifier('les faites ensuite, dans l’ordre d’origine (Bravo, Delta, Echo)',
    ordre[2].includes('Bravo') && ordre[3].includes('Delta') && ordre[4].includes('Echo'),
    ordre.slice(2).join(' · '));

  rapport.section("Hors tournée, l'ordre ne bouge pas");
  const sansTournee = await page.evaluate(() => {
    const h = new Date(Date.now()-86400000).toISOString().slice(0,10);
    // Personne de fait aujourd'hui : l'ordre doit être rendu tel quel.
    const liste = [{visites:[]}, {visites:[{date:h}]}, {visites:[]}];
    const avant = liste.map((_,i)=>i);
    const apres = ordonnerPourTournee(liste).map(x => liste.indexOf(x));
    return JSON.stringify(avant) === JSON.stringify(apres);
  });
  rapport.verifier('aucune ruche faite aujourd’hui → ordre inchangé', sansTournee);

  rapport.section("Le tri est stable : rien ne se mélange d'un rendu à l'autre");
  const stable = await page.evaluate(() => {
    const t = new Date().toISOString().slice(0,10);
    const liste = [
      {code:'A',visites:[]}, {code:'B',visites:[{date:t}]},
      {code:'C',visites:[]}, {code:'D',visites:[{date:t}]}, {code:'E',visites:[]}
    ];
    const r1 = ordonnerPourTournee(liste).map(x=>x.code).join('');
    const r2 = ordonnerPourTournee(liste).map(x=>x.code).join('');
    return { r1, r2, egal: r1===r2, attendu: r1==='ACEBD' };
  });
  rapport.verifier('deux rendus donnent le même ordre', stable.egal, `${stable.r1} / ${stable.r2}`);
  rapport.verifier('non faites puis faites, chacune dans l’ordre d’origine',
    stable.attendu, stable.r1);

  // ── La carte ────────────────────────────────────────────────────
  rapport.section("La carte d'une ruche faite le dit, en vert, à la place de la date");
  const cartes = await page.evaluate(() =>
    [...document.querySelectorAll('#ruchersGrid .hive-card')].map(c => ({
      nom: c.querySelector('.hive-title').textContent,
      estompee: c.classList.contains('hc-done'),
      vert: !!c.querySelector('.visit-done'),
      texteVert: c.querySelector('.visit-done')?.textContent.trim() || '',
      date: c.querySelector('.visit-date')?.textContent.trim() || ''
    })));
  const bravo = cartes.find(c => c.nom.includes('Bravo'));
  const alpha = cartes.find(c => c.nom.includes('Alpha'));
  rapport.verifier('la ruche faite affiche « Visite faite aujourd’hui »',
    bravo.vert && /aujourd'hui/.test(bravo.texteVert), bravo.texteVert);
  rapport.verifier('elle n’affiche plus la ligne de date', bravo.date === '');
  rapport.verifier('elle est estompée', bravo.estompee);
  rapport.verifier('la ruche non faite garde sa date et n’est pas estompée',
    !alpha.vert && !alpha.estompee && alpha.date !== '', alpha.date);

  // ── Le compteur ─────────────────────────────────────────────────
  rapport.section("Le compteur loge dans le libellé déjà présent, sans rien ajouter");
  const compteurInitial = await page.evaluate(() =>
    document.getElementById('apiaryFilterLabel')?.textContent || '');
  rapport.verifier('dès l’ouverture : « 3 faites aujourd’hui »',
    /3 faites aujourd'hui/.test(compteurInitial), compteurInitial);

  // Il doit être identique après un re-rendu (recherche vide).
  const compteurApres = await page.evaluate(() => {
    renderRuchers();
    return document.getElementById('apiaryFilterLabel')?.textContent || '';
  });
  rapport.verifier('le libellé initial et le re-rendu disent la même chose',
    compteurInitial === compteurApres, `${compteurInitial} // ${compteurApres}`);

  /* On vérifie seulement que la recherche N'EST PAS CASSÉE par le tri — le
     tri sur liste filtrée est déjà prouvé, stable, par les contrôles
     unitaires plus haut. « lph » ne touche que le nom d'Alpha (le statut
     calculé « Bonne activité » contaminerait une lettre comme « o »). */
  rapport.section("La recherche filtre toujours");
  await page.fill('#ruchersSearch', 'lph');
  await page.waitForTimeout(250);
  const filtre = await page.evaluate(() =>
    [...document.querySelectorAll('#ruchersGrid .hive-card .hive-title')].map(e => e.textContent));
  rapport.verifier('le filtre réduit bien la liste à la seule ruche Alpha',
    filtre.length === 1 && filtre[0].includes('Alpha'), filtre.join(' · '));
  await page.fill('#ruchersSearch', '');
  await page.waitForTimeout(200);

  // ── Le panneau de la ruche ──────────────────────────────────────
  rapport.section("La fiche de la ruche l'affiche aussi, pour le chemin du QR code");
  const ficheFaite = await page.evaluate(() => {
    openHive('R-2'); setHiveSection('grid');
    const b = document.querySelector('.hive-done-banner');
    return b ? b.textContent.trim() : '';
  });
  rapport.verifier('ruche faite : un bandeau vert en tête de la grille',
    /Visite faite aujourd'hui/.test(ficheFaite), ficheFaite);
  const ficheNonFaite = await page.evaluate(() => {
    openHive('R-1'); setHiveSection('grid');
    return !!document.querySelector('.hive-done-banner');
  });
  rapport.verifier('ruche non faite : aucun bandeau', ficheNonFaite === false);

  rapport.section("Rien d'autre ne doit avoir bougé");
  rapport.verifier('aucune erreur JavaScript sur tout le parcours',
    erreurs.length === 0, erreurs.join(' | '));
});
