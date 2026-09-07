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

  /* ── LE DÉFAUT SIGNALÉ APRÈS PUBLICATION ────────────────────────
     « je ne vois pas le bouton voir la zone de butinage ». Il était bien
     rendu, mais SOUS la carte — laquelle occupe presque toute la hauteur
     utile. Mesuré sur iPhone 13 : carte de 218 à 802 px, barre du bas à
     744, bouton commençant à 861 sur un écran de 844. Hors de l'écran sur
     les quatre téléphones testés, et le faire défiler n'était pas une
     réponse : poser le doigt sur la carte fait glisser la carte.

     Une fonctionnalité que personne ne peut atteindre n'existe pas. Ces
     contrôles auraient dû être écrits avant la publication. */
  rapport.section("LE BUG SIGNALÉ : un bouton hors de l'écran n'existe pas");

  await page.evaluate(d => {
    state.hives = d.hives; state.zonesButinage = false; saveState();
  }, donnees);

  for(const [nom, w, h] of [['iPhone SE', 375, 667], ['iPhone 13', 390, 844],
                            ['iPhone 14 Pro Max', 430, 932], ['Android', 412, 915],
                            ['iPad', 768, 1024]]){
    await page.setViewportSize({ width:w, height:h });
    await page.evaluate(() => showPage('mapGlobal'));
    await page.waitForTimeout(350);

    const vu = await page.evaluate(() => {
      /* Un apiculteur qui ouvre la page Carte arrive EN HAUT. Mesurer sans
         remettre le défilement à zéro donnait un faux vert : les clics des
         sections précédentes avaient descendu la page, et le bouton
         paraissait à l'écran alors qu'il était sous le pli. */
      window.scrollTo(0, 0);
      const b = document.getElementById('btnZoneVol');
      if(!b) return { absent:true };
      const r = b.getBoundingClientRect();
      const barre = document.querySelector('.bottom')?.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return {
        entier: r.top >= 0 && r.bottom <= window.innerHeight,
        souslaBarre: barre ? r.bottom > barre.top : false,
        // Ce qui compte vraiment : le doigt tombe-t-il SUR le bouton ?
        atteignable: !!dessus && (dessus.id === 'btnZoneVol' || b.contains(dessus)),
        bas: Math.round(r.bottom), ecran: window.innerHeight
      };
    });
    rapport.verifier(`${nom.padEnd(18)} le bouton est visible sans défiler`,
      !vu.absent && vu.entier && !vu.souslaBarre, `bas ${vu.bas} / écran ${vu.ecran}`);
    rapport.verifier(`${nom.padEnd(18)} le doigt tombe bien dessus`, vu.atteignable);
  }

  await page.setViewportSize({ width:390, height:844 });
  await page.evaluate(() => showPage('mapGlobal'));
  await page.waitForTimeout(350);

  const ordre = await page.evaluate(() => {
    const p = document.querySelector('.panel');
    const rang = sel => [...p.children].findIndex(e => e.matches(sel) || e.querySelector?.(sel));
    const bouton = [...p.children].findIndex(e => e.id === 'btnZoneVol');
    const carte  = [...p.children].findIndex(e => e.classList.contains('map-global-wrap'));
    return { bouton, carte, avant: bouton >= 0 && bouton < carte };
  });
  rapport.verifier('le bouton est placé AVANT la carte, pas après', ordre.avant,
    `bouton ${ordre.bouton} · carte ${ordre.carte}`);

  const carteUtile = await page.evaluate(() => {
    const c = document.getElementById('globalMap').getBoundingClientRect();
    const barre = document.querySelector('.bottom').getBoundingClientRect();
    return { hauteur: Math.round(c.height), depasse: Math.round(Math.max(0, c.bottom - barre.top)) };
  });
  rapport.verifier('la carte reste assez grande pour être utile',
    carteUtile.hauteur >= 300, `${carteUtile.hauteur} px`);
  rapport.verifier('elle ne passe plus sous la barre du bas',
    carteUtile.depasse <= 15, `${carteUtile.depasse} px de dépassement`);

  rapport.section("Le recouvrement doit être dit tout de suite, pas seulement plus bas");
  const alerteImmediate = await page.evaluate(() => {
    state.zonesButinage = false;
    showPage('mapGlobal');
    document.getElementById('toast').textContent = '';
    basculerZonesButinage();
    const t = document.getElementById('toast');
    return { texte: t.textContent, affiche: t.classList.contains('show') };
  });
  rapport.verifier('un message annonce le recouvrement dès l’activation',
    /se partagent une zone/.test(alerteImmediate.texte), alerteImmediate.texte);
  rapport.verifier('il nomme les deux ruchers et donne la distance',
    /Prairie/.test(alerteImmediate.texte) && /Verger/.test(alerteImmediate.texte)
    && /km/.test(alerteImmediate.texte));

  const tronque = await page.evaluate(() => {
    const t = document.getElementById('toast');
    const r = t.getBoundingClientRect();
    return { deborde: r.left < 0 || r.right > window.innerWidth,
             coupe: t.scrollWidth > t.clientWidth + 1,
             largeur: Math.round(r.width), ecran: window.innerWidth };
  });
  rapport.verifier('le message ne déborde pas de l’écran',
    !tronque.deborde, `${tronque.largeur} px sur ${tronque.ecran}`);
  rapport.verifier('il n’est pas tronqué', !tronque.coupe);

  const sansRecouvrement = await page.evaluate(() => {
    state.hives = [{ code:'A', name:'A', apiary:'Loin', type:'ruche', gps:{lat:48, lon:2} }];
    state.zonesButinage = false;
    showPage('mapGlobal');
    document.getElementById('toast').textContent = '';
    basculerZonesButinage();
    return document.getElementById('toast').textContent;
  });
  rapport.verifier('aucun message quand il n’y a rien à signaler',
    sansRecouvrement === '', sansRecouvrement);

  await page.evaluate(d => { state.hives = d.hives; }, donnees);

  /* ── SECOND DÉFAUT SIGNALÉ, CAPTURE À L'APPUI ───────────────────
     « la zone ne sélectionne pas une ruche ». Sur la carte, les anneaux
     étaient tracés entre Laval et Château-Gontier, sur AUCUNE des deux
     ruches. Le regroupement se faisait sur le seul nom du rucher : deux
     ruches sans rucher renseigné — donc toutes deux « Sans rucher » — mais
     distantes de 30 km étaient moyennées, et le cercle naissait à
     mi-chemin, au milieu de la campagne.

     Le butinage est une affaire de lieu, pas d'étiquette. */
  rapport.section("LE BUG SIGNALÉ : un cercle posé où il n'y a aucune ruche");

  const loin = await page.evaluate(() => {
    state.hives = [
      { code:'R-1', name:'Ruche de Laval',           type:'ruche', gps:{ lat:48.07, lon:-0.77 } },
      { code:'R-2', name:'Ruche de Château-Gontier', type:'ruche', gps:{ lat:47.83, lon:-0.70 } }
    ];
    const centres = centresRuchers();
    return {
      sites: centres.length,
      // Chaque centre doit coïncider avec une ruche réelle, pas un milieu.
      surUneRuche: centres.every(c => state.hives.some(h => {
        const g = getHiveGps(h);
        return distanceMetres({ lat:c.lat, lon:c.lon }, { lat:g.lat, lon:g.lon }) < 300;
      })),
      ecart: Math.round(distanceMetres(
        { lat:48.07, lon:-0.77 }, { lat:47.83, lon:-0.70 }) / 1000),
      paires: ruchersQuiSeRecouvrent().length
    };
  });
  rapport.verifier('deux ruches éloignées font deux sites, pas un',
    loin.sites === 2, `${loin.sites} site(s) pour ${loin.ecart} km d'écart`);
  rapport.verifier('chaque cercle est posé SUR une ruche', loin.surUneRuche);
  rapport.verifier('à 30 km, aucun recouvrement inventé', loin.paires === 0);

  rapport.section("Sans casser ce que le regroupement servait à faire");
  const memeSite = await page.evaluate(() => {
    // Vingt ruches d'un même rucher, étalées sur une centaine de mètres.
    state.hives = Array.from({ length:20 }, (_, i) => ({
      code:'H'+i, name:'H'+i, apiary:'Verger', type:'ruche',
      gps:{ lat:48.07 + i*0.00015, lon:-0.77 + i*0.00015 } }));
    const c = centresRuchers();
    return { sites:c.length, ruches:c[0]?.ruches, nom:c[0]?.nom };
  });
  rapport.verifier('vingt ruches au même endroit ne font toujours qu’un cercle',
    memeSite.sites === 1 && memeSite.ruches === 20, `${memeSite.sites} site(s)`);
  rapport.verifier('le site garde le nom du rucher', memeSite.nom === 'Verger', memeSite.nom);

  rapport.section("Deux ruchers différents restent séparés, même côte à côte");
  const voisins = await page.evaluate(() => {
    state.hives = [
      { code:'A', name:'A', apiary:'Verger',  type:'ruche', gps:{ lat:48.07,   lon:-0.77 } },
      { code:'B', name:'B', apiary:'Prairie', type:'ruche', gps:{ lat:48.0727, lon:-0.77 } }
    ];
    return { sites: centresRuchers().map(c => c.nom),
             alerte: ruchersQuiSeRecouvrent().map(p => `${p.a}+${p.b}`) };
  });
  rapport.verifier('à 300 m, ils ne sont pas fusionnés',
    voisins.sites.length === 2, voisins.sites.join(' · '));
  rapport.verifier('et l’apiculteur est averti qu’ils se concurrencent',
    voisins.alerte.length === 1, voisins.alerte.join(' '));

  rapport.section("Un même rucher sur deux sites doit rester lisible");
  const deuxSites = await page.evaluate(() => {
    state.hives = [
      { code:'A', name:'Lavande', apiary:'Verger', type:'ruche', gps:{ lat:48.07, lon:-0.77 } },
      { code:'B', name:'Tilleul', apiary:'Verger', type:'ruche', gps:{ lat:47.83, lon:-0.70 } }
    ];
    return centresRuchers().map(c => c.nom);
  });
  rapport.verifier('les deux sites portent des noms distincts',
    deuxSites.length === 2 && deuxSites[0] !== deuxSites[1], deuxSites.join(' · '));
  rapport.verifier('le nom du rucher reste reconnaissable',
    deuxSites.every(n => n.startsWith('Verger')), deuxSites.join(' · '));

  await page.evaluate(d => { state.hives = d.hives; }, donnees);

  /* ── LA LÉGENDE SUR LA CARTE ────────────────────────────────────
     « cela fonctionne, peut-être mettre une légende ? » Trois anneaux se
     dessinaient sans que rien, sur la carte, ne dise lequel était lequel :
     l'explication existait, mais dans le panneau SOUS la carte, donc hors
     de l'écran au moment précis où l'apiculteur regarde les cercles. */
  rapport.section("Une légende là où on regarde les cercles");

  await page.evaluate(d => { state.hives = d.hives; state.zonesButinage = false; saveState(); }, donnees);
  await page.evaluate(() => showPage('mapGlobal'));
  await page.waitForTimeout(400);

  const eteinte = await page.evaluate(() => {
    const l = document.getElementById('zoneLegende');
    return { existe: !!l, visible: l && getComputedStyle(l).display !== 'none' };
  });
  rapport.verifier('elle reste cachée tant que les cercles ne sont pas tracés',
    eteinte.existe && !eteinte.visible);

  await page.click('#btnZoneVol');
  await page.waitForTimeout(400);

  const leg = await page.evaluate(() => {
    const l = document.getElementById('zoneLegende');
    const r = l.getBoundingClientRect();
    const carte = document.getElementById('globalMap').getBoundingClientRect();
    return {
      visible: getComputedStyle(l).display !== 'none',
      texte: l.innerText,
      dansLaCarte: r.left >= carte.left - 1 && r.right <= carte.right + 1
                   && r.top >= carte.top - 1 && r.bottom <= carte.bottom + 1,
      partDeLaCarte: Math.round(100 * (r.width * r.height) / (carte.width * carte.height)),
      laisseLeDoigtPasser: getComputedStyle(l).pointerEvents === 'none',
      /* Leaflet place son zoom en haut-gauche et ses mentions de source en
         bas-droite. La légende doit donc tenir dans le quart BAS-GAUCHE.
         Chercher « .leaflet-control-zoom » n'aurait rien prouvé ici : la
         doublure des tests ne crée aucun contrôle, et l'absence d'élément
         aurait fait passer le contrôle à vide. La position, elle, se
         vérifie vraiment. */
      quartBasGauche: (r.left + r.width/2) < carte.left + carte.width/2
                   && (r.top + r.height/2) > carte.top + carte.height/2
    };
  });

  rapport.verifier('elle apparaît avec les cercles', leg.visible);
  rapport.verifier('les trois rayons y figurent',
    /1 km/.test(leg.texte) && /3 km/.test(leg.texte) && /5 km/.test(leg.texte),
    leg.texte.replace(/\n/g, ' · '));
  rapport.verifier('chacun est qualifié, pas seulement chiffré',
    /principal/.test(leg.texte) && /habituel/.test(leg.texte) && /maximum/.test(leg.texte));
  rapport.verifier('elle est posée dans le cadre de la carte', leg.dansLaCarte);
  rapport.verifier('elle reste discrète', leg.partDeLaCarte <= 15, `${leg.partDeLaCarte} % de la carte`);
  rapport.verifier('le doigt la traverse : elle ne bloque pas la carte',
    leg.laisseLeDoigtPasser);
  rapport.verifier('elle occupe le coin bas-gauche, le seul que Leaflet laisse libre',
    leg.quartBasGauche);

  /* Une légende qui contredit les cercles serait pire que pas de légende :
     les deux doivent naître de la même source. */
  const accord = await page.evaluate(() => {
    const surCarte = [...document.querySelectorAll('#zoneLegende .zl-km')].map(e => e.textContent.trim());
    const rayons = [...new Set(window.__cercles.map(c => c.options.radius))].sort((a, b) => a - b);
    return { surCarte, rayons, attendus: rayons.map(r => (r / 1000) + ' km') };
  });
  rapport.verifier('la légende annonce exactement les rayons dessinés',
    JSON.stringify(accord.surCarte) === JSON.stringify(accord.attendus),
    `${accord.surCarte.join('/')} vs ${accord.attendus.join('/')}`);

  const styles = await page.evaluate(() => {
    const l = [...document.querySelectorAll('#zoneLegende .zone-ring-line')];
    return l.map(e => getComputedStyle(e).borderTopStyle);
  });
  rapport.verifier('le trait plein distingue le rayon de référence',
    styles[1] === 'solid' && styles[0] === 'dashed' && styles[2] === 'dashed',
    styles.join(' · '));

  await page.click('#btnZoneVol');
  await page.waitForTimeout(300);
  rapport.verifier('elle disparaît avec les cercles',
    await page.evaluate(() => getComputedStyle(document.getElementById('zoneLegende')).display === 'none'));

  rapport.section("Rien d'autre ne doit avoir bougé");
  rapport.verifier('aucune erreur JavaScript sur tout le parcours',
    erreurs.length === 0, erreurs.join(' | '));
});
