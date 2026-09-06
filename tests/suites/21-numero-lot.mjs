/* Numéro de lot des récoltes.

   CE QUI MANQUAIT : dès qu'un pot de miel est vendu, son étiquette doit
   porter un numéro de lot, et ce numéro doit relier le pot à une récolte
   identifiée — date, rucher, nombre de hausses. C'est le lien entre
   l'étagère du marché et le registre d'élevage.

   La section Miel enregistrait la date, les kilos, le type et le
   butinage. Rien qui ressemblait à un lot. L'apiculteur en vente directe
   ne pouvait donc pas remonter d'un pot à sa récolte, alors que
   l'application détenait toute l'information.

   Le format est libre à condition d'être univoque ; l'usage courant est
   « L 2026-09-A ». Deux récoltes du même mois, même sur des ruches
   différentes, ne doivent jamais porter le même numéro. */

import { executerSuite, amorcer, doublerCdn } from '../lib/harness.mjs';

const RUCHER = {
  hives: [
    { code:'RUCHE-001', name:'Lavande', apiary:'Prairie Haute', type:'ruche', honey:18, alerts:0,
      recoltes:[{ id:'recolte_1', date:'2026-07-10', type:'Toutes fleurs', kilos:18, butinage:'Tilleul', notes:'' }],
      hausses:[{ id:'h1', date:'2026-07-10', action:'Hausse retirée', nombre:3, notes:'' }] },
    { code:'RUCHE-002', name:'Tilleul', apiary:'Prairie Haute', type:'ruche', honey:0, alerts:0 }
  ],
  profil: { prenom:'Nicolas', nom:'Morel', napi:'53-12345', siret:'12345678900011', type:'pro' },
  apiaries: [{ name:'Prairie Haute' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v0-tests'
};

export default () => executerSuite('Numéro de lot', async ({ page, origine, rapport, erreurs }) => {

  await amorcer(page, RUCHER);
  await doublerCdn(page);
  await page.goto(origine);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  rapport.section('La suite des lettres, jusque après Z');
  const seq = await page.evaluate(() => ({
    a: lettreLot(0), z: lettreLot(25), aa: lettreLot(26), ab: lettreLot(27),
    i0: indiceLettre('A'), i25: indiceLettre('Z'), i26: indiceLettre('AA')
  }));
  rapport.verifier('A puis Z', seq.a === 'A' && seq.z === 'Z');
  rapport.verifier('puis AA, AB — pas de blocage à la 27e récolte',
    seq.aa === 'AA' && seq.ab === 'AB', seq.aa + ' ' + seq.ab);
  rapport.verifier('lecture inverse cohérente',
    seq.i0 === 0 && seq.i25 === 25 && seq.i26 === 26);

  rapport.section("LE PIÈGE : deux récoltes du même mois ne partagent jamais un lot");
  const suite = await page.evaluate(() => {
    const premier = lotSuivant('2026-07-05');
    state.hives[1].recoltes = [{ id:'r2', date:'2026-07-20', type:'Acacia', kilos:5, butinage:'Acacia', lot:premier }];
    return { premier, second: lotSuivant('2026-07-28'), autreMois: lotSuivant('2026-08-01') };
  });
  rapport.verifier('premier lot du mois', suite.premier === 'L 2026-07-A', suite.premier);
  rapport.verifier("la ruche suivante reçoit la lettre d'après, pas la même",
    suite.second === 'L 2026-07-B', suite.second);
  rapport.verifier('un autre mois repart à A', suite.autreMois === 'L 2026-08-A', suite.autreMois);

  rapport.section('Une nouvelle récolte reçoit son lot');
  await page.evaluate(() => { openHive('RUCHE-001'); setHiveSection('miel'); openModuleForm('miel'); });
  await page.waitForTimeout(450);
  const propose = await page.evaluate(() => document.getElementById('mielLot')?.value || '');
  rapport.verifier('le formulaire le pré-remplit', /^L \d{4}-\d{2}-[A-Z]+$/.test(propose), propose);
  const aide = await page.evaluate(() => document.getElementById('hiveDetailContent')?.innerText || '');
  rapport.verifier("il est présenté comme à reporter sur l'étiquette", /étiquette/i.test(aide));

  await page.evaluate(() => { document.getElementById('mielKilos').value = '12'; saveModule('miel'); });
  await page.waitForTimeout(450);
  const enregistre = await page.evaluate(() => state.hives[0].recoltes[0]);
  rapport.verifier('le lot est enregistré avec la récolte', !!enregistre.lot, enregistre.lot);
  rapport.verifier('la récolte reste intacte', Number(enregistre.kilos) === 12);

  rapport.section("Rattrapage : les récoltes saisies avant cette version");
  // Aucune entrée d'historique n'est modifiable dans l'application : sans
  // ce rattrapage, tout l'existant resterait sans traçabilité.
  const avant = await page.evaluate(() => document.getElementById('hiveDetailContent')?.innerText || '');
  rapport.verifier("l'ancienne récolte propose d'attribuer un lot", /Attribuer un lot/.test(avant));
  await page.evaluate(() => attribuerLot('RUCHE-001', 'recolte_1'));
  await page.waitForTimeout(450);
  const apres = await page.evaluate(() => ({
    texte: document.getElementById('hiveDetailContent')?.innerText || '',
    lot: (state.hives[0].recoltes.find(r => r.id === 'recolte_1') || {}).lot
  }));
  rapport.verifier('le lot est attribué', apres.lot === 'L 2026-07-B' || /^L 2026-07-[A-Z]+$/.test(apres.lot || ''), apres.lot);
  rapport.verifier('et affiché sur la récolte', /Lot L 2026-07/.test(apres.texte));
  rapport.verifier('le bouton disparaît une fois le lot posé', !/Attribuer un lot/.test(apres.texte));

  const rejeu = await page.evaluate(() => {
    const avantLot = (state.hives[0].recoltes.find(r => r.id === 'recolte_1') || {}).lot;
    attribuerLot('RUCHE-001', 'recolte_1');
    return { avantLot, apresLot: (state.hives[0].recoltes.find(r => r.id === 'recolte_1') || {}).lot };
  });
  rapport.verifier('un second appui ne réécrit pas le lot',
    rejeu.avantLot === rejeu.apresLot, rejeu.apresLot);

  rapport.section('Le registre relie le pot à sa récolte');
  await page.evaluate(() => { showPage('registre'); registreChangerPeriode('tout'); });
  await page.waitForTimeout(550);
  const reg = await page.evaluate(() => document.getElementById('registreDoc')?.innerText || '');
  rapport.verifier('une section de traçabilité existe',
    /tra[çc]abilit[ée] des lots de miel/i.test(reg));
  const bloc = reg.split(/tra[çc]abilit[ée] des lots de miel/i)[1] || '';
  rapport.verifier('le lot y figure', /L 2026-07-/.test(bloc));
  rapport.verifier('avec sa date', /10\/07\/2026/.test(bloc));
  rapport.verifier('son rucher', /Prairie Haute/.test(bloc));
  rapport.verifier('et le nombre de hausses retirées ce jour-là',
    /\b3\b/.test(bloc.split('\n').slice(0, 8).join(' ')));
  rapport.verifier("une récolte sans hausse notée affiche un tiret, pas un chiffre faux",
    /—/.test(bloc));

  const sansLot = await page.evaluate(() => {
    state.hives.forEach(h => (h.recoltes || []).forEach(r => { delete r.lot; }));
    registreChangerPeriode('tout');
    const t = document.getElementById('registreDoc')?.innerText || '';
    return (t.split(/tra[çc]abilit[ée] des lots de miel/i)[1] || '').slice(0, 120);
  });
  rapport.verifier("aucun lot attribué : le registre le dit au lieu d'un tableau vide",
    /aucun lot attribué/i.test(sansLot), sansLot.split('\n').filter(Boolean)[0]);

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
