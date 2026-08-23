/* Vérifie que les optimisations sont actives ET qu'elles n'ont rien cassé :
   les librairies différées doivent rester disponibles, toutes les vues
   doivent continuer à se rendre. */

import { executerSuite, amorcer } from '../lib/harness.mjs';

const DONNEES = {
  hives: [{ code:'R-1', name:'Chêne', apiary:'Prairie', type:'ruche', honey:12, gps:'48.85,2.35' }],
  profil: { type:'amateur' }, apiaries: [{ name:'Prairie' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true
};

export default () => executerSuite('Performance', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, DONNEES);
  await page.goto(origine);
  await page.waitForTimeout(1500);

  rapport.section('Librairies : différées mais bien disponibles');
  const libs = await page.evaluate(() => ({
    qr: !!window.QRCode, leaflet: typeof L !== 'undefined', jsqr: !!window.jsQR
  }));
  rapport.verifier('QRCode synchrone (utilisé au chargement)', libs.qr);
  rapport.verifier('Leaflet disponible après différé', libs.leaflet);
  rapport.verifier('jsQR disponible après différé', libs.jsqr);
  rapport.verifier('données chargées', await page.evaluate(() => state.hives.length === 1));

  rapport.section('Aucune vue cassée par le différé');
  for(const p of ['home','ruchers','alerts','admin','scan','newHive','mapGlobal']){
    await page.evaluate(n => showPage(n), p);
    await page.waitForTimeout(220);
    const n = await page.evaluate(() => document.getElementById('content')?.innerText.trim().length || 0);
    rapport.verifier('page ' + p.padEnd(10), n > 0, `${n} car.`);
  }

  await page.evaluate(() => openHive('R-1'));
  await page.waitForTimeout(300);
  let vides = 0;
  for(const s of ['resume','visites','materiel','traitements','pesees','photos','documents','conformite','qrcode','actions']){
    await page.evaluate(x => setHiveSection(x), s);
    await page.waitForTimeout(140);
    if((await page.evaluate(() => document.getElementById('content')?.innerText.trim().length || 0)) === 0) vides++;
  }
  rapport.verifier('10 sous-sections rendues', vides === 0, `${vides} vide(s)`);

  rapport.section('Scan QR bridé');
  const intervalle = await page.evaluate(() =>
    typeof QR_SCAN_INTERVAL_MS !== 'undefined' ? QR_SCAN_INTERVAL_MS : null);
  rapport.verifier('intervalle de décodage défini', intervalle === 66,
    `${intervalle} ms ≈ ${intervalle ? Math.round(1000 / intervalle) : 0} img/s`);

  rapport.section('Météo lancée en parallèle');
  const meteo = await page.evaluate(async () => {
    let encours = 0, max = 0;
    const vrai = window.fetch;
    window.fetch = async () => {
      encours++; max = Math.max(max, encours);
      await new Promise(r => setTimeout(r, 60));
      encours--;
      return { ok:true, json: async () => ({ hourly:{ temperature_2m:[10], precipitation:[0], wind_gusts_10m:[5] } }) };
    };
    state.hives = ['A','B','C','D'].map(c => ({ code:c, name:c, apiary:'P', type:'ruche', gps:'48.85,2.35' }));
    const t0 = Date.now();
    await refreshWeatherAlerts(true);
    const duree = Date.now() - t0;
    window.fetch = vrai;
    return { max, duree };
  });
  rapport.verifier('4 requêtes simultanées', meteo.max === 4, `max ${meteo.max}`);
  rapport.verifier('durée ≈ 1 requête, pas 4', meteo.duree < 200, `${meteo.duree} ms`);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
