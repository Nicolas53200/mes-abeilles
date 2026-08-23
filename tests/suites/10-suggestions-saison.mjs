/* Suggestions saisonnières de la section « Actions ».
   Points critiques : elles ne doivent JAMAIS alimenter le compteur
   d'alertes, la zone doit réellement décaler les repères biologiques,
   et l'échéance réglementaire ne doit PAS être décalée par la zone. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

const RUCHE = {
  hives: [
    { code:'R-1', name:'Chêne', apiary:'Prairie', type:'ruche', honey:12, alerts:0,
      visites:[], hausses:[], traitements:[] },
    { code:'R-2', name:'Jeune', apiary:'Prairie', type:'ruchette', honey:0, alerts:0 }
  ],
  profil:{ type:'amateur', zone:'centre' },
  apiaries:[{ name:'Prairie' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true
};

// Les clés attendues sont stables, contrairement aux libellés.
const cles = (page, mois, jour, zone, ruche) => page.evaluate(([m,j,z,r]) => {
  state.profil.zone = z;
  const h = r === 'ruchette' ? state.hives[1] : state.hives[0];
  return suggestionsSaison(h, new Date(2026, m - 1, j)).map(x => x.cle);
}, [mois, jour, zone, ruche]);

// Pose une visite sur R-1, puis renvoie les clés au mois voulu.
const avecVisite = (page, visite, mois, jour, zone) => page.evaluate(([v,m,j,z]) => {
  state.profil.zone = z || 'centre';   // sinon on hérite de la zone du test précédent
  state.hives[0].visites = [{ date:'2026-01-01', reine:'Oui', ponte:'Normale',
    couvain:'Normal', force:'Forte', reserves:'Bonnes', cellules:'Non',
    varroa:'Comptage OK', frelons:'Non', pollen:'Normal', ...v }];
  return suggestionsSaison(state.hives[0], new Date(2026, m - 1, j)).map(x => x.cle);
}, [visite, mois, jour, zone]);

export default () => executerSuite('Suggestions saisonnières', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, RUCHE);
  await page.goto(origine);
  await page.waitForTimeout(1200);

  rapport.section('Le module se charge sans casser le démarrage');
  rapport.verifier('données chargées', await page.evaluate(() => state.hives.length === 2));
  rapport.verifier('ZONES_APICOLES accessible', await page.evaluate(() => Object.keys(ZONES_APICOLES).length === 4));

  rapport.section('Repères cohérents avec le mois, sur une colonie saine');
  for(const [mois, attendue, note] of [
    [1,  'hiver-ouverture',       'janvier — ne pas ouvrir'],
    [3,  'printemps-visite',      'mars — sortie d\'hivernage'],
    [5,  'essaimage-surveillance','mai — essaimage'],
    [7,  'recolte',               'juillet — récolte'],
    [8,  'varroa-periode',        'août — traitement varroa'],
    [9,  'nourrissement',         'septembre — réserves'],
    [10, 'hivernage-prep',        'octobre — préparation'],
    [12, 'repos',                 'décembre — repos']
  ]){
    const k = await avecVisite(page, { force:'Forte' }, mois, 15, 'centre');
    rapport.verifier(note.padEnd(30), k.includes(attendue), k.join(', ').slice(0, 60));
  }
  await page.evaluate(() => { state.hives[0].visites = []; });

  rapport.section('La zone décale réellement les repères biologiques');
  // Le 25 février : le Sud est déjà en sortie d'hivernage, la Montagne non.
  const sud      = await cles(page, 2, 25, 'sud', 'ruche');
  const centre   = await cles(page, 2, 25, 'centre', 'ruche');
  const montagne = await cles(page, 2, 25, 'montagne', 'ruche');
  rapport.verifier('Sud le 25/02 → déjà au printemps', sud.includes('printemps-visite'), sud.join(', ').slice(0,50));
  rapport.verifier('Centre le 25/02 → encore en hivernage', centre.includes('hiver-ouverture'));
  rapport.verifier('Montagne le 25/02 → encore en hivernage', montagne.includes('hiver-ouverture'));
  // Le 20 avril : la Montagne est en retard sur le Centre.
  const mAvr = await avecVisite(page, { force:'Forte' }, 4, 20, 'montagne');
  const cAvr = await avecVisite(page, { force:'Forte' }, 4, 20, 'centre');
  rapport.verifier('Centre le 20/04 → essaimage', cAvr.some(k => k.startsWith('essaimage')));
  rapport.verifier('Montagne le 20/04 → encore sortie d\'hivernage', mAvr.includes('printemps-visite'));
  await page.evaluate(() => { state.hives[0].visites = []; });

  rapport.section('L\'échéance réglementaire ne suit PAS la zone');
  for(const z of ['sud','centre','nord','montagne']){
    const oct = await cles(page, 10, 15, z, 'ruche');
    rapport.verifier(`déclaration présente en octobre — ${z}`.padEnd(40), oct.includes('declaration'));
  }
  const juin = await cles(page, 6, 15, 'sud', 'ruche');
  rapport.verifier('absente en juin', !juin.includes('declaration'));
  // Fin août en zone Sud : saison décalée en septembre, mais pas la déclaration.
  const aout = await cles(page, 8, 25, 'sud', 'ruche');
  rapport.verifier('Sud fin août : repères de septembre…', aout.includes('nourrissement'));
  rapport.verifier('…mais pas encore la déclaration', !aout.includes('declaration'));

  rapport.section('LE POINT DEMANDÉ : pas de hausse sur une colonie faible');
  await page.evaluate(() => { state.hives[0].hausses = []; });

  const forte = await avecVisite(page, { force:'Forte' }, 5, 10);
  rapport.verifier('colonie forte en mai → propose la hausse', forte.includes('hausse-pose'));

  const faible = await avecVisite(page, { force:'Faible' }, 5, 10);
  rapport.verifier('population faible → NE propose PAS la hausse', !faible.includes('hausse-pose'));
  rapport.verifier('…et explique pourquoi la différer', faible.includes('hausse-differee'));
  rapport.verifier('…et propose d\'aider la colonie', faible.includes('printemps-renforcer'));

  const couvainFaible = await avecVisite(page, { force:'Forte', couvain:'Faible' }, 5, 10);
  rapport.verifier('couvain faible → pas de hausse non plus', !couvainFaible.includes('hausse-pose'));

  const ponteAbsente = await avecVisite(page, { ponte:'Absente' }, 5, 10);
  rapport.verifier('ponte absente → pas de hausse', !ponteAbsente.includes('hausse-pose'));

  const orpheline = await avecVisite(page, { reine:'Non' }, 5, 10);
  rapport.verifier('colonie orpheline → signalée en priorité', orpheline.includes('colonie-orpheline'));
  rapport.verifier('…pas de hausse', !orpheline.includes('hausse-pose'));
  rapport.verifier('…et l\'orphelinage passe en tête', orpheline[0] === 'colonie-orpheline');

  rapport.section('Une colonie faible n\'essaime pas et ne se récolte pas');
  rapport.verifier('faible → pas de surveillance d\'essaimage', !faible.includes('essaimage-surveillance'));
  rapport.verifier('forte → surveillance d\'essaimage', forte.includes('essaimage-surveillance'));

  await page.evaluate(() => { state.hives[0].hausses = [{ date:'2026-05-01', action:'Pose', nombre:'2' }]; });
  const recolteForte = await avecVisite(page, { force:'Forte' }, 7, 10);
  rapport.verifier('juillet, colonie forte → récolte', recolteForte.includes('recolte'));
  const recolteFaible = await avecVisite(page, { force:'Faible' }, 7, 10);
  rapport.verifier('juillet, colonie faible → récolte déconseillée', recolteFaible.includes('recolte-faible'));
  rapport.verifier('…et pas de suggestion de récolte', !recolteFaible.includes('recolte'));

  const juinFaible = await avecVisite(page, { force:'Faible' }, 6, 10);
  rapport.verifier('juin, faible avec hausse → contrôler quand même', juinFaible.includes('miellee-hausses'));
  await page.evaluate(() => { state.hives[0].hausses = []; });
  const juinFaibleSansH = await avecVisite(page, { force:'Faible' }, 6, 10);
  rapport.verifier('juin, faible sans hausse → non prête pour la miellée', juinFaibleSansH.includes('miellee-faible'));

  rapport.section('État inconnu : prudence, pas de développement à l\'aveugle');
  await page.evaluate(() => { state.hives[0].visites = []; state.hives[0].hausses = []; });
  const inconnu = await cles(page, 5, 10, 'centre', 'ruche');
  rapport.verifier('sans visite → état signalé inconnu', inconnu.includes('etat-inconnu'));
  rapport.verifier('…pas de hausse proposée à l\'aveugle', !inconnu.includes('hausse-pose'));
  rapport.verifier('…ni de hausse à différer (rien à affirmer)', !inconnu.includes('hausse-differee'));

  rapport.section('Hausse déjà posée');
  await page.evaluate(() => { state.hives[0].hausses = [{ date:'2026-05-01', action:'Pose', nombre:'2' }]; });
  const dejaPosee = await avecVisite(page, { force:'Forte' }, 5, 10);
  rapport.verifier('ne propose pas d\'en ajouter', !dejaPosee.includes('hausse-pose'));
  rapport.verifier('invite à contrôler le remplissage', dejaPosee.includes('hausse-en-place'));
  const juinHausse = await avecVisite(page, { force:'Forte' }, 6, 10);
  rapport.verifier('juin avec hausses → contrôler le remplissage', juinHausse.includes('miellee-hausses'));

  rapport.section('Autres croisements');
  await page.evaluate(() => { state.hives[0].hausses = []; });
  const cellules = await avecVisite(page, { force:'Forte', cellules:'Oui' }, 5, 10);
  rapport.verifier('cellules royales vues → message ciblé', cellules.includes('essaimage-cellules'));
  rapport.verifier('remplace le message générique', !cellules.includes('essaimage-surveillance'));

  const reserves = await avecVisite(page, { reserves:'Faibles' }, 9, 10);
  rapport.verifier('réserves faibles en septembre', reserves.includes('nourrissement-reserves'));
  const faibleSept = await avecVisite(page, { force:'Faible' }, 9, 10);
  rapport.verifier('colonie faible en septembre → réunion évoquée', faibleSept.includes('hivernage-faible'));
  const varroa = await avecVisite(page, { varroa:'Présence forte' }, 8, 10);
  rapport.verifier('varroa fort signalé en août', varroa.includes('varroa-signale'));
  const hiverFaible = await avecVisite(page, { reserves:'Faibles' }, 1, 15);
  rapport.verifier('réserves faibles en janvier', hiverFaible.includes('hiver-reserves'));

  await page.evaluate(() => { state.hives[0].visites = []; state.hives[0].traitements = []; });
  const aoutSansTraitement = await cles(page, 8, 10, 'centre', 'ruche');
  rapport.verifier('août sans traitement enregistré', aoutSansTraitement.includes('varroa-aucun'));
  await page.evaluate(() => { state.hives[0].traitements = [{ date:'2026-08-05', type:'Apivar' }]; });
  const aoutAvec = await cles(page, 8, 10, 'centre', 'ruche');
  rapport.verifier('traitement enregistré → ne le signale plus', !aoutAvec.includes('varroa-aucun'));

  const ruchette = await cles(page, 5, 10, 'centre', 'ruchette');
  rapport.verifier('ruchette → repère spécifique', ruchette.includes('ruchette-dev'));
  rapport.verifier('ruchette → pas de pose de hausse', !ruchette.includes('hausse-pose'));

  rapport.section('LE POINT CRITIQUE : le compteur d\'alertes est intact');
  const badge = await page.evaluate(() => {
    state.hives[0].visites = []; state.hives[0].hausses = []; state.hives[0].traitements = [];
    recomputeAutomaticAlerts(false);
    const avant = { n: state.hives[0].alerts, liste: [...(state.hives[0].alertList || [])] };
    const sugg = suggestionsSaison(state.hives[0], new Date(2026, 4, 15));
    recomputeAutomaticAlerts(false);
    const apres = { n: state.hives[0].alerts, liste: [...(state.hives[0].alertList || [])] };
    const cles = sugg.map(s => s.cle);
    const fuite = apres.liste.filter(a =>
      /essaimage|hausse|varroa-periode|nourrissement|hivernage|repos|declaration|recolte|printemps/i.test(a)
      && !avant.liste.includes(a));
    return { avant: avant.n, apres: apres.n, nbSuggestions: cles.length, fuite };
  });
  rapport.verifier('des suggestions sont bien produites', badge.nbSuggestions > 0, `${badge.nbSuggestions}`);
  rapport.verifier('le nombre d\'alertes ne bouge pas', badge.avant === badge.apres, `${badge.avant} → ${badge.apres}`);
  rapport.verifier('aucune suggestion dans alertList', badge.fuite.length === 0, badge.fuite.join(' | ') || 'aucune');

  rapport.section('Réglage de zone dans le profil');
  const zone = await page.evaluate(() => {
    showPage('admin');
    const sel = document.getElementById('adminZone');
    if(!sel) return { present:false };
    sel.value = 'montagne';
    saveAdmin();
    const stockee = JSON.parse(localStorage.getItem('mesAbeilles_data_v1') || '{}').profil?.zone;
    return { present:true, options:sel.options.length, enregistree:stockee, active:zoneApicole().label };
  });
  rapport.verifier('sélecteur présent', zone.present);
  rapport.verifier('4 zones proposées', zone.options === 4, `${zone.options}`);
  rapport.verifier('choix enregistré', zone.enregistree === 'montagne', String(zone.enregistree));
  rapport.verifier('pris en compte immédiatement', zone.active === 'Montagne', zone.active);

  rapport.section('Rendu de la section Actions');
  const rendu = await page.evaluate(() => {
    openHive('R-1'); setHiveSection('actions');
    const t = document.getElementById('content')?.innerText || '';
    return { longueur: t.trim().length, zone: t.includes('Montagne'),
             ancien: t.includes('Contrôler chute naturelle') };
  });
  rapport.verifier('section rendue', rendu.longueur > 80, `${rendu.longueur} car.`);
  rapport.verifier('la zone est affichée', rendu.zone);
  rapport.verifier('les deux lignes figées ont disparu', !rendu.ancien);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
