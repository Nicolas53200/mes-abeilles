/* QR code d'une ruche : de sa génération à l'ouverture de la fiche.

   Bug remonté par un apiculteur : son QR ne le renvoyait pas sur sa
   ruche. Deux causes distinctes, toutes deux couvertes ici.
     1. Le scan forçait le code en MAJUSCULES et la recherche était
        stricte : « Ruche-001 » saisi devenait introuvable.
     2. Le QR n'encodait que le code brut : scanné avec l'appareil photo
        du téléphone, il n'affichait qu'un texte, sans lien. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

const CODES = ['RUCHE-001', 'Ruche-002', 'ruche-12', 'Lavande-1', 'R1', 'Rucher Nord 3'];

const DONNEES = {
  hives: CODES.map((c, i) => ({ code:c, name:'Ruche ' + (i+1), apiary:'Prairie',
                                type:'ruche', honey:0, alerts:0 })),
  profil:{ type:'amateur' }, apiaries:[{ name:'Prairie' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v37.0'
};

export default () => executerSuite('QR code des ruches', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, DONNEES);
  await page.goto(origine);
  await page.waitForTimeout(1300);

  rapport.section('LE BUG : un code retouché rendait la ruche introuvable');
  for(const code of CODES){
    const r = await page.evaluate(c => {
      const lu = normalizeScannedCode(c);          // ce que produit le scanner
      const trouvee = trouverRucheParCode(lu);     // ce que fait l'ouverture
      return { lu, code: trouvee?.code || null };
    }, code);
    rapport.verifier(`« ${code} » retrouvé`.padEnd(30), r.code === code, `scan → ${r.lu}`);
  }

  rapport.section('Recherche tolérante, sans confusion possible');
  const t = await page.evaluate(() => ({
    majuscules: trouverRucheParCode('RUCHE-002')?.code,
    minuscules: trouverRucheParCode('ruche-002')?.code,
    sansTiret:  trouverRucheParCode('RUCHE002')?.code,
    espaces:    trouverRucheParCode('  Ruche-002  ')?.code,
    espacesInternes: trouverRucheParCode('ruchernord3')?.code,
    inconnu:    trouverRucheParCode('RUCHE-999'),
    vide:       trouverRucheParCode(''),
    nul:        trouverRucheParCode(null)
  }));
  rapport.verifier('casse différente', t.majuscules === 'Ruche-002' && t.minuscules === 'Ruche-002');
  rapport.verifier('séparateur absent', t.sansTiret === 'Ruche-002', String(t.sansTiret));
  rapport.verifier('espaces autour', t.espaces === 'Ruche-002');
  rapport.verifier('espaces internes', t.espacesInternes === 'Rucher Nord 3', String(t.espacesInternes));
  rapport.verifier('code inconnu → rien', t.inconnu === null);
  rapport.verifier('vide ou nul → rien', t.vide === null && t.nul === null);

  // La correspondance exacte doit primer : deux codes proches restent distincts.
  const distincts = await page.evaluate(() => {
    state.hives = [{ code:'RUCHE-1', name:'A', apiary:'P', type:'ruche' },
                   { code:'ruche-1', name:'B', apiary:'P', type:'ruche' }];
    return { a: trouverRucheParCode('RUCHE-1')?.name, b: trouverRucheParCode('ruche-1')?.name };
  });
  rapport.verifier('deux codes proches restent distincts',
    distincts.a === 'A' && distincts.b === 'B', `${distincts.a} / ${distincts.b}`);

  rapport.section('Le QR contient un lien, pas un simple texte');
  await page.evaluate(d => { state.hives = d.hives; }, DONNEES);
  const lien = await page.evaluate(() => ({
    genere: lienRuche('Ruche-002'),
    estUrl: /^https?:\/\//.test(lienRuche('Ruche-002')),
    contientCode: lienRuche('Ruche-002').includes('code=')
  }));
  rapport.verifier('le QR encode une URL', lien.estUrl, lien.genere);
  rapport.verifier('l\'URL porte le code', lien.contientCode);

  const encode = await page.evaluate(() => lienRuche('Rucher Nord 3'));
  rapport.verifier('code avec espaces correctement encodé',
    encode.includes('Rucher%20Nord%203') || encode.includes('Rucher+Nord+3'), encode);

  rapport.section('Scanner l\'URL du QR ramène bien au code');
  for(const code of ['RUCHE-001', 'Ruche-002', 'Rucher Nord 3']){
    const r = await page.evaluate(c => {
      const url = lienRuche(c);                    // ce que contient le QR
      const lu = normalizeScannedCode(url);        // ce que lit le scanner
      return trouverRucheParCode(lu)?.code || null;
    }, code);
    rapport.verifier(`aller-retour « ${code} »`.padEnd(32), r === code, String(r));
  }

  rapport.section('Compatibilité : les QR déjà imprimés restent valides');
  for(const code of ['RUCHE-001', 'Ruche-002']){
    const r = await page.evaluate(c => trouverRucheParCode(normalizeScannedCode(c))?.code || null, code);
    rapport.verifier(`ancien QR (code brut) « ${code} »`.padEnd(36), r === code);
  }

  rapport.section('Ouverture depuis l\'URL du QR');
  await page.goto(origine + '/index.html?code=' + encodeURIComponent('Ruche-002'));
  await page.waitForTimeout(1500);
  const ouvert = await page.evaluate(() => ({
    ruche: state.currentHive?.code, page: state.page
  }));
  rapport.verifier('le scan ouvre la bonne fiche', ouvert.ruche === 'Ruche-002', String(ouvert.ruche));

  await page.goto(origine + '/index.html?code=RUCHE-999');
  await page.waitForTimeout(1400);
  const inconnu = await page.evaluate(() => state.page);
  rapport.verifier('code inconnu → accueil, sans plantage', inconnu === 'home', String(inconnu));

  await page.goto(origine);
  await page.waitForTimeout(1300);
  rapport.verifier('sans paramètre → accueil',
    (await page.evaluate(() => state.page)) === 'home');

  rapport.section('QR de secours, quand la librairie CDN manque');
  // Le repli local n'encode que 25 caractères alphanumériques majuscules.
  // Lui passer une URL le faisait échouer, et l'échec dessinait un motif
  // ressemblant à un QR mais totalement vide.
  await page.goto(origine);
  await page.waitForTimeout(1200);
  const secours = await page.evaluate(() => {
    const vraiQR = window.QRCode;
    window.QRCode = undefined;                 // simule le CDN injoignable
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    document.body.appendChild(c);
    const r = {};
    // Code simple : le repli doit produire un vrai QR
    r.simpleOk = drawFallbackQr(c, 'RUCHE-001');
    r.simpleValeur = c.dataset.qrValue || null;
    // Une URL dépasse ses capacités : il doit refuser proprement
    r.urlOk = drawFallbackQr(c, 'https://exemple.fr/app/?code=RUCHE-001');
    r.urlValeur = c.dataset.qrValue || null;
    c.remove();
    window.QRCode = vraiQR;
    return r;
  });
  rapport.verifier('code simple → vrai QR produit', secours.simpleOk === true, String(secours.simpleValeur));
  rapport.verifier('URL trop longue → refus explicite', secours.urlOk === false);
  rapport.verifier('aucune valeur trompeuse enregistrée', secours.urlValeur === null, String(secours.urlValeur));

  const passeLeCode = await page.evaluate(() => {
    const vraiQR = window.QRCode;
    window.QRCode = undefined;
    const c = document.createElement('canvas');
    c.id = 'bigQr'; c.width = c.height = 180;
    document.body.appendChild(c);
    state.hives = [{ code:'RUCHE-007', name:'T', apiary:'P', type:'ruche' }];
    drawAllQr('RUCHE-007');
    const v = c.dataset.qrValue || null;
    c.remove();
    window.QRCode = vraiQR;
    return v;
  });
  rapport.verifier('sans CDN, le repli reçoit le code brut et non l\'URL',
    passeLeCode === 'RUCHE-007', String(passeLeCode));

  rapport.section('Le QR de secours est vraiment décodable');
  // Décodage structurel : repères, module de calage, zone silencieuse.
  const structure = await page.evaluate(() => {
    const m = makeLocalQrV1L('RUCHE-001');
    const taille = m.length;
    const repere = (x, y) => {
      for(let dy = 0; dy < 7; dy++) for(let dx = 0; dx < 7; dx++){
        const bord = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const centre = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        const attendu = bord || centre;
        if(!!m[y + dy][x + dx] !== attendu) return false;
      }
      return true;
    };
    let calage = true;
    for(let i = 8; i <= 12; i++){
      if(!!m[6][i] !== (i % 2 === 0)) calage = false;
      if(!!m[i][6] !== (i % 2 === 0)) calage = false;
    }
    return { taille, hg: repere(0,0), hd: repere(taille-7,0), bg: repere(0,taille-7),
             calage, sombre: !!m[taille-8][8] };
  });
  rapport.verifier('taille version 1 (21×21)', structure.taille === 21, String(structure.taille));
  rapport.verifier('repère haut-gauche conforme', structure.hg);
  rapport.verifier('repère haut-droit conforme', structure.hd);
  rapport.verifier('repère bas-gauche conforme', structure.bg);
  rapport.verifier('motifs de calage alternés', structure.calage);
  rapport.verifier('module sombre obligatoire présent', structure.sombre);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
