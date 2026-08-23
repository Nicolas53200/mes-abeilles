/* getHiveGps() était défini deux fois, la seconde masquant la première.
   Les deux ne renvoyaient PAS la même chose : la version masquée omettait
   la clé .lng, dont dépend l'appel météo. Cette suite verrouille la forme
   de retour et la couverture des champs après fusion. */

import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Coordonnées GPS des ruches', async ({ page, origine, rapport, erreurs }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1000);

  rapport.verifier('une seule définition de getHiveGps',
    await page.evaluate(() => typeof getHiveGps === 'function'));

  rapport.section('Les trois clés sont présentes — la météo lit .lng, la carte lit .lon');
  const clefs = await page.evaluate(() => getHiveGps({ gps:'48.8566, 2.3522' }));
  rapport.verifier('lat', clefs?.lat === 48.8566, String(clefs?.lat));
  rapport.verifier('lng (utilisée par la météo)', clefs?.lng === 2.3522, String(clefs?.lng));
  rapport.verifier('lon (utilisée par la carte)', clefs?.lon === 2.3522, String(clefs?.lon));

  rapport.section('Champs reconnus');
  for(const champ of ['gps','coords','locationGps','location','position','geo','geolocation','apiaryGps','apiaryLocation']){
    const r = await page.evaluate(c => getHiveGps({ [c]: '48.85, 2.35' }), champ);
    rapport.verifier(`h.${champ}`.padEnd(18), r?.lat === 48.85 && r?.lng === 2.35);
  }

  rapport.section('Formats acceptés');
  for(const [valeur, ok, note] of [
    ['48.85, 2.35',          true,  'virgule'],
    ['48.85; 2.35',          true,  'point-virgule'],
    ['48.85 2.35',           true,  'espace'],
    ['-33.87, 151.21',       true,  'latitude négative'],
    [{ lat:48.85, lng:2.35 }, true, 'objet lat/lng'],
    [{ latitude:48.85, longitude:2.35 }, true, 'objet latitude/longitude'],
    [{ coords:{ latitude:48.85, longitude:2.35 } }, true, 'objet Geolocation'],
    ['',                     false, 'vide'],
    ['pas de coordonnées',   false, 'texte libre'],
    ['48.85',                false, 'une seule valeur'],
    ['200, 400',             false, 'hors des bornes terrestres']
  ]){
    const r = await page.evaluate(v => getHiveGps({ gps:v }), valeur);
    const detecte = r !== null;
    rapport.verifier(note.padEnd(26), detecte === ok, detecte ? `${r.lat}, ${r.lng}` : 'aucune');
  }

  rapport.section('Cas dégradés');
  for(const [entree, note] of [[null,'ruche nulle'], [undefined,'ruche absente'], [{}, 'ruche sans GPS']]){
    const r = await page.evaluate(x => { try{ return getHiveGps(x); }catch(e){ return 'EXCEPTION'; } }, entree);
    rapport.verifier(note.padEnd(20), r === null, r === 'EXCEPTION' ? 'a levé une exception' : 'null');
  }

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
