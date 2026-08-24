/* Les données de l'apiculteur restent-elles sur son appareil ?

   Ce test ne se contente pas de lire le code : il intercepte TOUTES les
   requêtes réseau pendant une utilisation réelle et vérifie qu'aucune ne
   transporte les données saisies. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

// Marqueurs improbables : s'ils apparaissent dans une requête, la donnée fuit.
const M = {
  nom:     'RucheTemoinXQ7',
  rucher:  'RucherTemoinXQ7',
  notes:   'NoteConfidentielleXQ7',
  napi:    'NAPI-TEMOIN-XQ7',
  siret:   '73282932000074',
  tel:     '0612345678',
  email:   'temoin-xq7@exemple.fr',
  adresse: 'AdresseTemoinXQ7'
};

const DONNEES = {
  hives: [{
    code:'RUCHE-XQ7', name:M.nom, apiary:M.rucher, type:'ruche', honey:23, alerts:0,
    gps:'48.8566, 2.3522',
    visites:[{ date:'2026-08-01', reine:'Oui', ponte:'Normale', couvain:'Normal',
               force:'Forte', reserves:'Bonnes', cellules:'Non', varroa:'Comptage OK',
               frelons:'Non', pollen:'Normal', notes:M.notes }],
    traitements:[{ date:'2026-08-05', type:'Apivar', quantite:'2 lanières', notes:M.notes }],
    pesees:[{ date:'2026-08-10', total:'41', notes:M.notes }]
  }],
  profil:{ prenom:'Nicolas', nom:'Morel', napi:M.napi, siret:M.siret,
           telephone:M.tel, email:M.email, adresse:M.adresse,
           entreprise:'RucherTemoinXQ7', type:'pro', zone:'centre' },
  apiaries:[{ name:M.rucher }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true
};

export default () => executerSuite('Données locales à l\'appareil', async ({ page, origine, rapport, erreurs }) => {

  // Tout ce qui part sur le réseau est consigné, méthode, URL et corps.
  const requetes = [];
  page.on('request', r => {
    let corps = '';
    try { corps = r.postData() || ''; } catch(e) {}
    requetes.push({ methode: r.method(), url: r.url(), corps });
  });

  await amorcer(page, DONNEES);
  await page.goto(origine);
  await page.waitForTimeout(1400);

  rapport.section('Utilisation réelle de l\'application');
  for(const p of ['home','ruchers','alerts','admin','scan','newHive']){
    await page.evaluate(n => showPage(n), p);
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => openHive('RUCHE-XQ7'));
  await page.waitForTimeout(300);
  for(const s of ['resume','visites','traitements','pesees','conformite','qrcode','actions']){
    await page.evaluate(x => setHiveSection(x), s);
    await page.waitForTimeout(160);
  }
  // Saisie et enregistrement d'une donnée neuve
  await page.evaluate(() => {
    showPage('admin');
    const e = document.getElementById('adminAdresse');
    if(e) e.value = 'AdresseTemoinXQ7-modifiee';
    saveAdmin();
  });
  await page.waitForTimeout(600);
  rapport.verifier('parcours effectué', requetes.length > 0, `${requetes.length} requêtes observées`);

  rapport.section('Aucune donnée saisie ne part sur le réseau');
  const externes = requetes.filter(r => !r.url.startsWith(origine) && !r.url.startsWith('data:'));
  for(const [libelle, valeur] of Object.entries(M)){
    const fuites = requetes.filter(r =>
      r.url.includes(valeur) || r.url.includes(encodeURIComponent(valeur)) || r.corps.includes(valeur));
    rapport.verifier(`${libelle} jamais transmis`.padEnd(30), fuites.length === 0,
      fuites.length ? fuites[0].url.slice(0, 80) : 'aucune requête ne le contient');
  }
  const corpsEnvoyes = requetes.filter(r => r.corps && r.corps.length > 0);
  rapport.verifier('aucun envoi de données (POST/PUT)', corpsEnvoyes.length === 0,
    corpsEnvoyes.length ? corpsEnvoyes[0].url.slice(0, 70) : 'aucun corps de requête');

  rapport.section('Les seuls domaines externes contactés');
  const domaines = [...new Set(externes.map(r => { try { return new URL(r.url).hostname; } catch(e) { return r.url; } }))];
  const attendus = ['unpkg.com', 'cdn.jsdelivr.net', 'api.open-meteo.com', 'api.maptiler.com', 'fonts.googleapis.com'];
  for(const d of domaines){
    rapport.verifier(`${d} connu et justifié`.padEnd(34), attendus.includes(d), d);
  }
  rapport.verifier('aucun serveur de l\'application', !domaines.some(d => /abeille/i.test(d)),
    domaines.join(', ') || 'aucun domaine externe');

  rapport.section('Où les données sont réellement écrites');
  const stockage = await page.evaluate(() => ({
    cles: Object.keys(localStorage),
    octets: (localStorage.getItem('mesAbeilles_data_v1') || '').length,
    contientNom: (localStorage.getItem('mesAbeilles_data_v1') || '').includes('RucheTemoinXQ7'),
    cookies: document.cookie
  }));
  rapport.verifier('écrites dans le stockage local', stockage.contientNom, `${stockage.octets} octets`);
  rapport.verifier('uniquement des clés mesAbeilles_*',
    stockage.cles.every(c => c.startsWith('mesAbeilles')), stockage.cles.join(', '));
  rapport.verifier('aucun cookie posé', stockage.cookies === '', stockage.cookies || 'aucun');

  rapport.section('Aucun compte, aucune synchronisation');
  const html = await page.evaluate(() => document.documentElement.outerHTML.length);
  rapport.verifier('page chargée', html > 1000);
  const sync = await page.evaluate(() => ({
    fetchs: typeof fetch,
    aucunToken: !Object.keys(localStorage).some(k => /token|auth|session|jwt/i.test(k))
  }));
  rapport.verifier('aucun jeton d\'authentification stocké', sync.aucunToken);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
