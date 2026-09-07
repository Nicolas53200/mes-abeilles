/* La zone de butinage sur la carte.

   DEMANDE : « est-il possible d'ajouter un rayon de zones de vol des
   abeilles ? un rayon pour visualiser le butinage des ruches ? cela
   pourrait être sur la carte en cliquant sur un bouton visualiser zone
   de vol ». Décision prise avec l'apiculteur : les cercles ET l'alerte
   quand deux de ses ruchers se recouvrent.

   CE QUI SE VÉRIFIE ICI, ET CE QUI NE SE VÉRIFIE PAS. Leaflet n'est pas
   joignable depuis l'environnement de test : le vrai tracé des cercles
   sur les tuiles ne peut pas être observé. Ce qui est vérifiable, et
   vérifié, c'est ce que l'application DEMANDE à Leaflet — un centre, un
   rayon en mètres, une couleur — plus toute la partie qui lui échappe :
   la géométrie, le recouvrement entre ruchers, le bouton, le texte.

   Deux pièges sont surveillés en particulier :
   · un cercle par RUCHE et non par rucher : vingt ruches au même
     emplacement donneraient vingt cercles superposés illisibles ;
   · l'absence de recadrage : au zoom d'un rucher, un cercle de 5 km naît
     entièrement hors de l'écran et l'apiculteur ne voit rien changer. */

import { executerSuite } from '../lib/harness.mjs';

/* 1° de latitude ≈ 111 195 m sur la sphère de rayon 6 371 km.
   Sert à placer des ruchers à une distance connue. */
const DEG = m => m / 111195;

export default () => executerSuite('Zone de butinage',
  async ({ page, origine, rapport, erreurs }) => {

  const rucher = (code, nom, apiary, lat, lon) =>
    ({ code, name:nom, apiary, type:'ruche', honey:0, alerts:0, gps:{ lat, lon } });

  const donnees = {
    hives: [
      // Verger : deux ruches distantes de ~130 m — un seul cercle attendu.
      rucher('R-001','Lavande','Verger',  48.8566, 2.3522),
      rucher('R-002','Tilleul','Verger',  48.8576, 2.3532),
      // Prairie : 2,2 km du Verger → les zones se recouvrent.
      rucher('R-003','Acacia','Prairie',  48.8760, 2.3620),
      // Montagne : 38 km → aucun recouvrement.
      rucher('R-004','Bruyère','Montagne',49.2000, 2.3600)
    ],
    profil:{ type:'amateur' },
    apiaries:[{name:'Verger'},{name:'Prairie'},{name:'Montagne'}],
    onboardingDone:true, hiveTourDone:true, calendarPromptDone:true,
    derniereVersionVue:'v0-tests', derniereSauvegarde:'2026-09-01'
  };

  await page.addInitScript(d => {
    try{ localStorage.setItem('mesAbeilles_data_v1', JSON.stringify(d)); }catch(e){}
  }, donnees);
  await page.goto(origine);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  // ── La géométrie ────────────────────────────────────────────────
  rapport.section("Les distances doivent être justes, pas approchées");
  const geo = await page.evaluate(() => ({
    unDegre:   distanceMetres({lat:0,lon:0}, {lat:1,lon:0}),
    parisLyon: distanceMetres({lat:48.8566,lon:2.3522}, {lat:45.7640,lon:4.8357}),
    identique: distanceMetres({lat:48.8566,lon:2.3522}, {lat:48.8566,lon:2.3522}),
    manquant:  distanceMetres(null, {lat:0,lon:0})
  }));
  rapport.verifier('1° de latitude vaut bien ~111,2 km',
    Math.abs(geo.unDegre - 111195) < 60, `${Math.round(geo.unDegre)} m`);
  rapport.verifier('Paris–Lyon tombe à ~392 km',
    Math.abs(geo.parisLyon/1000 - 392) < 3, `${(geo.parisLyon/1000).toFixed(1)} km`);
  rapport.verifier('deux fois le même point donnent zéro', geo.identique === 0);
  rapport.verifier('un point manquant ne renvoie pas NaN',
    geo.manquant === Infinity, String(geo.manquant));

  const lisible = await page.evaluate(() =>
    [distanceMetres, 0].length && [900, 1000, 2240, 38000].map(m => distanceLisible(m)));
  rapport.verifier('sous 1 km la distance reste en mètres', lisible[0] === '900 m', lisible[0]);
  rapport.verifier('au-delà elle passe en km, virgule française',
    lisible[2] === '2,2 km' && lisible[3] === '38,0 km', lisible.join(' · '));

  // ── Un cercle par rucher, pas par ruche ─────────────────────────
  rapport.section("Un cercle par RUCHER : deux ruches côte à côte n'en font qu'un");
  const centres = await page.evaluate(() => centresRuchers());
  rapport.verifier('trois ruchers pour quatre ruches',
    centres.length === 3, centres.map(c => `${c.nom}(${c.ruches})`).join(' '));
  const verger = centres.find(c => c.nom === 'Verger');
  rapport.verifier('le Verger regroupe bien ses deux ruches', verger && verger.ruches === 2);
  rapport.verifier('son centre est le milieu des deux',
    verger && Math.abs(verger.lat - 48.8571) < 1e-4 && Math.abs(verger.lon - 2.3527) < 1e-4,
    verger && `${verger.lat.toFixed(5)} ${verger.lon.toFixed(5)}`);
  rapport.verifier('chaque rucher garde la couleur de la légende',
    new Set(centres.map(c => c.couleur)).size === 3,
    centres.map(c => c.couleur).join(' '));

  // ── Le bouton ───────────────────────────────────────────────────
  rapport.section("Le bouton demandé, et ce qu'il change");
  await page.evaluate(() => showPage('mapGlobal'));
  await page.waitForTimeout(600);

  const avant = await page.evaluate(() => ({
    bouton:  document.getElementById('btnZoneVol')?.textContent.trim(),
    presse:  document.getElementById('btnZoneVol')?.getAttribute('aria-pressed'),
    panneau: getComputedStyle(document.getElementById('zoneVolInfo')).display !== 'none',
    cercles: window.__cercles.length,
    marqueurs: document.querySelectorAll('.map-legend-item').length
  }));
  rapport.verifier('le bouton est présent sur la carte',
    /Voir la zone de butinage/.test(avant.bouton || ''), avant.bouton);
  rapport.verifier('rien n’est dessiné tant qu’on n’appuie pas',
    avant.cercles === 0 && !avant.panneau);
  rapport.verifier('la légende des ruchers reste au contact de la carte',
    avant.marqueurs >= 3, `${avant.marqueurs} entrées`);

  await page.evaluate(() => { window.__cercles = []; window.__recadrages = 0; });
  await page.click('#btnZoneVol');
  await page.waitForTimeout(400);

  const apres = await page.evaluate(() => ({
    bouton:  document.getElementById('btnZoneVol')?.textContent.trim(),
    presse:  document.getElementById('btnZoneVol')?.getAttribute('aria-pressed'),
    panneau: getComputedStyle(document.getElementById('zoneVolInfo')).display !== 'none',
    cercles: window.__cercles.map(c => ({
      lat: +c.latlng[0].toFixed(4), lon: +c.latlng[1].toFixed(4),
      rayon: c.options.radius, couleur: c.options.color
    })),
    recadrages: window.__recadrages,
    enregistre: JSON.parse(localStorage.getItem('mesAbeilles_data_v1')).zonesButinage
  }));

  rapport.verifier('le libellé bascule sur « Masquer »',
    /Masquer la zone de butinage/.test(apres.bouton || ''), apres.bouton);
  rapport.verifier('l’état est annoncé aux lecteurs d’écran',
    apres.presse === 'true', apres.presse);
  rapport.verifier('le panneau d’explication s’ouvre', apres.panneau);
  rapport.verifier('neuf cercles : trois ruchers × trois rayons',
    apres.cercles.length === 9, `${apres.cercles.length} cercles`);

  // ── Les rayons ──────────────────────────────────────────────────
  rapport.section("Trois anneaux, parce qu'un seul laisserait croire à une limite");
  const parCentre = {};
  apres.cercles.forEach(c => {
    const k = `${c.lat},${c.lon}`;
    (parCentre[k] = parCentre[k] || []).push(c);
  });
  rapport.verifier('trois centres distincts, un par rucher',
    Object.keys(parCentre).length === 3, Object.keys(parCentre).join(' | '));
  const rayonsOk = Object.values(parCentre).every(g =>
    JSON.stringify(g.map(c => c.rayon).sort((a, b) => a - b)) === '[1000,3000,5000]');
  rapport.verifier('chaque rucher reçoit 1 km, 3 km et 5 km', rayonsOk,
    Object.values(parCentre).map(g => g.map(c => c.rayon).join('/')).join(' | '));
  const unifois = Object.values(parCentre).every(g => new Set(g.map(c => c.couleur)).size === 1);
  rapport.verifier('les trois anneaux d’un rucher partagent sa couleur', unifois);

  const centreVerger = apres.cercles.find(c => Math.abs(c.lat - 48.8571) < 1e-3);
  rapport.verifier('le cercle du Verger est bien centré sur le rucher, pas sur une ruche',
    !!centreVerger && Math.abs(centreVerger.lon - 2.3527) < 1e-3,
    centreVerger && `${centreVerger.lat} ${centreVerger.lon}`);

  rapport.section("LE PIÈGE : un cercle de 5 km naît hors de l'écran");
  rapport.verifier('la carte se recadre sur les zones dessinées',
    apres.recadrages >= 1, `${apres.recadrages} recadrage(s)`);

  // ── Le recouvrement ─────────────────────────────────────────────
  rapport.section("Deux ruchers proches puisent dans la même ressource");
  const paires = await page.evaluate(() => ruchersQuiSeRecouvrent().map(p =>
    ({ a:p.a, b:p.b, texte: distanceLisible(p.distance) })));
  rapport.verifier('une seule paire signalée',
    paires.length === 1, JSON.stringify(paires));
  rapport.verifier('c’est bien Prairie et Verger',
    paires[0] && [paires[0].a, paires[0].b].sort().join('+') === 'Prairie+Verger');
  rapport.verifier('la distance est donnée à l’apiculteur',
    paires[0] && paires[0].texte === '2,2 km', paires[0] && paires[0].texte);
  rapport.verifier('le rucher lointain n’est pas signalé',
    !paires.some(p => p.a === 'Montagne' || p.b === 'Montagne'));

  const texte = await page.evaluate(() => document.getElementById('zoneVolInfo').innerText);
  rapport.verifier('le panneau nomme les deux ruchers concernés',
    /Prairie/.test(texte) && /Verger/.test(texte));
  rapport.verifier('il explique la conséquence sur la récolte',
    /ressource/.test(texte) && /récolte/.test(texte));

  rapport.section("Le seuil : deux fois 3 km, ni plus ni moins");
  const seuil = await page.evaluate(d => {
    const essai = metres => {
      state.hives = [
        { code:'A', name:'A', apiary:'Un',   type:'ruche', gps:{lat:48, lon:2} },
        { code:'B', name:'B', apiary:'Deux', type:'ruche', gps:{lat:48 + metres/111195, lon:2} }
      ];
      return ruchersQuiSeRecouvrent().length;
    };
    const r = { dedans: essai(5900), dehors: essai(6100), pile: essai(5999) };
    state.hives = d.hives;   // on remet le rucher de test en place
    return r;
  }, donnees);
  rapport.verifier('5,9 km : recouvrement signalé', seuil.dedans === 1);
  rapport.verifier('6,1 km : rien signalé', seuil.dehors === 0);
  rapport.verifier('juste sous la limite : signalé', seuil.pile === 1);

  // ── Honnêteté du propos ─────────────────────────────────────────
  rapport.section("L'application ne doit pas faire passer une estimation pour une mesure");
  rapport.verifier('le panneau dit que les distances sont indicatives',
    /indicatives/.test(texte), texte.slice(-140));
  rapport.verifier('il dit que le butinage n’a pas de frontière nette',
    /frontière/.test(texte));
  rapport.verifier('les trois rayons sont expliqués, pas seulement chiffrés',
    /butinage principal/.test(texte) && /rayon habituel/.test(texte)
    && /portée maximale/.test(texte));

  // ── Extinction ──────────────────────────────────────────────────
  rapport.section("Le bouton doit aussi savoir éteindre");
  await page.evaluate(() => { window.__cercles = []; });
  await page.click('#btnZoneVol');
  await page.waitForTimeout(300);
  const eteint = await page.evaluate(() => ({
    bouton:  document.getElementById('btnZoneVol')?.textContent.trim(),
    panneau: getComputedStyle(document.getElementById('zoneVolInfo')).display !== 'none',
    nouveaux: window.__cercles.length,
    enregistre: JSON.parse(localStorage.getItem('mesAbeilles_data_v1')).zonesButinage
  }));
  rapport.verifier('le libellé revient à « Voir »',
    /Voir la zone de butinage/.test(eteint.bouton || ''), eteint.bouton);
  rapport.verifier('le panneau se referme', !eteint.panneau);
  rapport.verifier('aucun cercle n’est redessiné', eteint.nouveaux === 0);

  // ── La préférence suit l'apiculteur ─────────────────────────────
  rapport.section("Le réglage doit survivre à la fermeture et au changement de téléphone");
  rapport.verifier('éteint, il est enregistré comme tel', eteint.enregistre === false);
  rapport.verifier('allumé, il était enregistré', apres.enregistre === true);

  await page.evaluate(() => { state.zonesButinage = true; saveState(); });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });
  const apresRechargement = await page.evaluate(() => {
    showPage('mapGlobal');
    return { actif: state.zonesButinage,
             bouton: document.getElementById('btnZoneVol')?.textContent.trim() };
  });
  rapport.verifier('après rechargement, la zone est toujours affichée',
    apresRechargement.actif === true
    && /Masquer/.test(apresRechargement.bouton || ''), apresRechargement.bouton);

  const voyage = await page.evaluate(() => {
    /* Les trois listes blanches : sans l'une des trois, le réglage se
       perd au passage par un fichier de sauvegarde. */
    const copie = JSON.parse(JSON.stringify(state));
    const relu = {};
    ["hives","profil","complianceDocs","alertSettings","apiaries","onboardingDone",
     "calendarPromptDone","hiveTourDone","derniereVersionVue","derniereSauvegarde",
     "zonesButinage"].forEach(k => { if(k in copie) relu[k] = copie[k]; });
    state.zonesButinage = false;
    const repris = mergeLoadedState(relu);
    return { present: 'zonesButinage' in relu, repris: state.zonesButinage, ok: repris };
  });
  rapport.verifier('le réglage entre dans le fichier exporté', voyage.present);
  rapport.verifier('il est relu au chargement', voyage.repris === true);

  // ── Cas limites ─────────────────────────────────────────────────
  rapport.section("Un rucher unique, et un rucher sans GPS");
  const seul = await page.evaluate(() => {
    state.hives = [{ code:'S', name:'Seule', apiary:'Unique', type:'ruche', gps:{lat:48, lon:2} }];
    showPage('mapGlobal');
    const t = document.getElementById('zoneVolInfo')?.innerText || '';
    return { bouton: !!document.getElementById('btnZoneVol'),
             paires: ruchersQuiSeRecouvrent().length,
             alerte: /se partagent/.test(t), anneaux: /rayon habituel/.test(t) };
  });
  rapport.verifier('un seul rucher : le bouton reste proposé', seul.bouton);
  rapport.verifier('aucun recouvrement inventé', seul.paires === 0 && !seul.alerte);
  rapport.verifier('les trois anneaux restent expliqués', seul.anneaux);

  const sansGps = await page.evaluate(() => {
    state.hives = [{ code:'N', name:'Sans', apiary:'Nulle part', type:'ruche' }];
    showPage('mapGlobal');
    return { bouton: !!document.getElementById('btnZoneVol'),
             centres: centresRuchers().length,
             message: /sans coordonnées GPS/.test(document.getElementById('content').innerText) };
  });
  rapport.verifier('sans GPS, aucun bouton : il n’y aurait rien à tracer',
    !sansGps.bouton && sansGps.centres === 0);
  rapport.verifier('le message habituel sur les coordonnées reste affiché', sansGps.message);

  rapport.section("Rien d'autre ne doit avoir bougé");
  rapport.verifier('aucune erreur JavaScript sur tout le parcours',
    erreurs.length === 0, erreurs.join(' | '));
});
