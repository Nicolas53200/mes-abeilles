/* La récolte : poids brut moins la tare des hausses.

   L'apiculteur pèse ses hausses pleines et soustrait de tête le poids des
   hausses vides — un calcul fait debout au rucher, les mains prises.

   LA CONTRAINTE POSÉE PAR L'APICULTEUR : « on peut garder ce que l'on a
   déjà et proposer l'option ? ». La saisie directe en kilos doit donc
   rester intacte, mode par défaut compris. La moitié de cette suite ne
   vérifie rien d'autre que ça.

   LE POINT DÉLICAT : « kilos » reste le miel NET quel que soit le mode.
   C'est ce que lisent le total de la ruche, le registre d'élevage et la
   traçabilité du lot. Le détail de la pesée s'ajoute à côté, il ne le
   remplace jamais. */

import { executerSuite } from '../lib/harness.mjs';

export default () => executerSuite('Récolte : poids brut moins tare',
  async ({ page, origine, rapport, erreurs }) => {

  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  await page.addInitScript(d => {
    try{
      localStorage.setItem('mesAbeilles_data_v1', JSON.stringify({
        hives:[{ code:'R-1', name:'Lavande', apiary:'Verger', type:'ruche',
          hausses:[{ id:'h1', date:d, action:'Hausse retirée', nombre:4 }],
          /* Une récolte d'AVANT cette version : aucun champ de pesée. Elle
             doit continuer de s'afficher et de compter comme avant. */
          recoltes:[{ id:'ancienne', date:d, lot:'L 2026-08-A', kilos:9,
                      type:'Miel de printemps', butinage:'Acacia', notes:'' }] }],
        profil:{ type:'amateur', nom:'Test', napi:'NAPI-1' }, apiaries:[{ name:'Verger' }],
        onboardingDone:true, hiveTourDone:true, calendarPromptDone:true,
        derniereVersionVue:'v0-tests', derniereSauvegarde:'2026-09-01'
      }));
    }catch(e){}
  }, hier);
  await page.goto(origine);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  const ouvrirFormulaire = async () => {
    await page.evaluate(() => { openHive('R-1'); setHiveSection('miel'); openModuleForm('miel'); });
    await page.waitForTimeout(350);
  };

  // ── Ce qui existait ne doit pas bouger ──────────────────────────
  rapport.section("RIEN N'EST RETIRÉ : la saisie directe reste le mode par défaut");
  await ouvrirFormulaire();

  const depart = await page.evaluate(() => ({
    mode: document.getElementById('mielMode')?.value,
    direct: getComputedStyle(document.getElementById('mielChampsDirect')).display !== 'none',
    tare: getComputedStyle(document.getElementById('mielChampsTare')).display !== 'none',
    champKilos: !!document.getElementById('mielKilos'),
    lot: document.getElementById('mielLot')?.value
  }));
  rapport.verifier('le mode « kilos directement » est celui proposé', depart.mode === 'direct', depart.mode);
  rapport.verifier('le champ « Kilos récoltés » est visible d’emblée',
    depart.champKilos && depart.direct);
  rapport.verifier('les champs de pesée restent repliés', !depart.tare);
  rapport.verifier('le numéro de lot est toujours proposé',
    /^L \d{4}-\d{2}-/.test(depart.lot || ''), depart.lot);

  const ancienne = await page.evaluate(() => {
    const r = state.currentHive.recoltes.find(x => x.id === 'ancienne');
    const txt = document.getElementById('hiveDetailContent')?.innerText || '';
    return { existe: !!r, kilos: r?.kilos, total: state.currentHive.honey,
             affichee: /9 kg/.test(txt), sansPesee: !/Pesée/.test(txt) };
  });
  rapport.verifier('une récolte saisie AVANT cette version s’affiche toujours',
    ancienne.existe && ancienne.affichee, `${ancienne.kilos} kg`);
  rapport.verifier('elle ne se voit pas inventer un détail de pesée', ancienne.sansPesee);

  await page.fill('#mielKilos', '12.5');
  await page.evaluate(() => saveModule('miel'));
  await page.waitForTimeout(300);
  const directe = await page.evaluate(() => {
    const r = state.currentHive.recoltes[0];
    return { kilos:r.kilos, mode:r.mode, brut:r.brut, tare:r.tare, hausses:r.hausses,
             total:state.currentHive.honey, lot:r.lot };
  });
  rapport.verifier('la saisie directe enregistre exactement ce qui est tapé',
    directe.kilos === 12.5, `${directe.kilos} kg`);
  rapport.verifier('elle n’écrit AUCUN champ de pesée',
    directe.mode === undefined && directe.brut === undefined
    && directe.tare === undefined && directe.hausses === undefined);
  rapport.verifier('le total de la ruche s’additionne comme avant',
    directe.total === 21.5, `${directe.total} kg (9 + 12,5)`);
  rapport.verifier('le lot est attribué comme avant', !!directe.lot, directe.lot);

  // ── Le nouveau mode ─────────────────────────────────────────────
  rapport.section("Le calcul que l'apiculteur faisait de tête");
  const arith = await page.evaluate(() => ({
    normal: poidsNetRecolte(46.5, 7, 4),
    zeroHausse: poidsNetRecolte(20, 7, 0),
    zeroTare: poidsNetRecolte(20, 0, 3),
    negatif: poidsNetRecolte(10, 7, 4),
    // L'arithmétique à virgule flottante produit 12.299999999999999 sans arrondi.
    flottant: poidsNetRecolte(19.4, 7.1, 1),
    vide: poidsNetRecolte('', '', '')
  }));
  rapport.verifier('46,5 kg moins 4 hausses de 7 kg font 18,5 kg',
    arith.normal === 18.5, String(arith.normal));
  rapport.verifier('sans hausse renseignée, le brut passe tel quel', arith.zeroHausse === 20);
  rapport.verifier('sans tare, rien n’est soustrait', arith.zeroTare === 20);
  rapport.verifier('un poids négatif est calculé, pas masqué', arith.negatif === -18);
  rapport.verifier('pas de 12,299999999999999 : le résultat est arrondi au dixième',
    arith.flottant === 12.3, String(arith.flottant));
  rapport.verifier('des champs vides ne donnent pas NaN', arith.vide === 0, String(arith.vide));

  rapport.section("Le nombre de hausses vient de ce qui est déjà enregistré");
  await ouvrirFormulaire();
  await page.selectOption('#mielMode', 'brut-tare');
  await page.waitForTimeout(200);
  const aujourdHuiVide = await page.evaluate(() => document.getElementById('mielHausses').value);
  rapport.verifier('aucun retrait ce jour-là : le champ reste vide, rien n’est inventé',
    aujourdHuiVide === '', `« ${aujourdHuiVide} »`);

  await page.fill('#mielDate', hier);
  await page.dispatchEvent('#mielDate', 'change');
  await page.waitForTimeout(250);
  rapport.verifier('à la date du retrait, les 4 hausses se pré-remplissent',
    await page.evaluate(() => document.getElementById('mielHausses').value) === '4');

  await page.fill('#mielHausses', '6');
  await page.fill('#mielDate', aujourdhui);
  await page.dispatchEvent('#mielDate', 'change');
  await page.waitForTimeout(250);
  rapport.verifier('une valeur saisie à la main n’est jamais écrasée',
    await page.evaluate(() => document.getElementById('mielHausses').value) === '6');

  rapport.section("Le résultat s'affiche pendant la saisie");
  await page.fill('#mielDate', hier);
  await page.dispatchEvent('#mielDate', 'change');
  await page.waitForTimeout(200);
  await page.fill('#mielHausses', '4');
  await page.fill('#mielBrut', '46.5');
  await page.fill('#mielTare', '7');
  await page.waitForTimeout(250);
  const direct = await page.evaluate(() => ({
    texte: document.getElementById('mielNet').textContent,
    rouge: document.getElementById('mielNet').classList.contains('miel-net-alerte')
  }));
  rapport.verifier('le miel net est annoncé avant d’enregistrer',
    /18\.5 kg/.test(direct.texte), direct.texte);
  rapport.verifier('et il n’est pas signalé comme une erreur', !direct.rouge);

  await page.evaluate(() => saveModule('miel'));
  await page.waitForTimeout(300);
  const pesee = await page.evaluate(() => {
    const r = state.currentHive.recoltes[0];
    return { kilos:r.kilos, mode:r.mode, brut:r.brut, tare:r.tare, hausses:r.hausses,
             lot:r.lot, total:state.currentHive.honey, memorisee:state.profil.tareHausse };
  });
  rapport.verifier('« kilos » contient le miel NET, pas le brut',
    pesee.kilos === 18.5, `${pesee.kilos} kg`);
  rapport.verifier('le détail de la pesée est conservé à côté',
    pesee.mode === 'brut-tare' && pesee.brut === 46.5 && pesee.tare === 7 && pesee.hausses === 4,
    JSON.stringify({ b:pesee.brut, t:pesee.tare, h:pesee.hausses }));
  rapport.verifier('le total de la ruche additionne bien le NET',
    pesee.total === 40, `${pesee.total} kg (9 + 12,5 + 18,5)`);
  rapport.verifier('le lot est attribué comme pour toute récolte', !!pesee.lot, pesee.lot);

  rapport.section("On ne pèse une hausse vide qu'une fois");
  rapport.verifier('la tare est mémorisée', pesee.memorisee === 7, String(pesee.memorisee));
  await ouvrirFormulaire();
  rapport.verifier('elle est proposée à la récolte suivante',
    await page.evaluate(() => document.getElementById('mielTare').value) === '7');

  const voyage = await page.evaluate(() => {
    /* La tare vit dans le profil, déjà présent dans les trois listes
       blanches : elle doit donc survivre à un export puis un import. */
    const copie = JSON.parse(JSON.stringify(state.profil));
    state.profil = { type:'amateur' };
    mergeLoadedState({ hives: state.hives, profil: copie });
    return state.profil.tareHausse;
  });
  rapport.verifier('elle voyage avec le fichier de sauvegarde', voyage === 7, String(voyage));

  // ── Ce qui ne doit jamais entrer dans le registre ────────────────
  rapport.section("Une saisie aberrante ne doit pas devenir une récolte");
  await ouvrirFormulaire();
  const avant = await page.evaluate(() => state.currentHive.recoltes.length);
  await page.selectOption('#mielMode', 'brut-tare');
  await page.waitForTimeout(150);
  await page.fill('#mielBrut', '10');
  await page.fill('#mielHausses', '4');
  await page.fill('#mielTare', '7');
  await page.waitForTimeout(250);
  const alerte = await page.evaluate(() => ({
    texte: document.getElementById('mielNet').textContent,
    rouge: document.getElementById('mielNet').classList.contains('miel-net-alerte')
  }));
  rapport.verifier('l’erreur est signalée pendant la saisie',
    alerte.rouge && /vérifie/.test(alerte.texte), alerte.texte);

  await page.evaluate(() => { document.getElementById('toast').textContent = ''; saveModule('miel'); });
  await page.waitForTimeout(300);
  const apres = await page.evaluate(() => ({
    nombre: state.currentHive.recoltes.length,
    total: state.currentHive.honey,
    message: document.getElementById('toast').textContent,
    saisieGardee: document.getElementById('mielBrut')?.value
  }));
  rapport.verifier('rien n’est enregistré : le registre reste propre',
    apres.nombre === avant, `${avant} → ${apres.nombre}`);
  rapport.verifier('aucune récolte à 0 kg avec un numéro de lot',
    apres.total === 40, `${apres.total} kg`);
  rapport.verifier('l’apiculteur est prévenu de la raison',
    /tare/.test(apres.message), apres.message);
  rapport.verifier('sa saisie reste sous ses yeux, il n’a rien à retaper',
    apres.saisieGardee === '10', apres.saisieGardee);

  // ── Ce que voient l'historique et le registre ────────────────────
  rapport.section("La pesée se lit dans l'historique et dans le registre");
  const texte = await page.evaluate(() => {
    state.moduleFormOpen = null; setHiveSection('miel');
    return document.getElementById('hiveDetailContent').innerText;
  });
  rapport.verifier('le détail de la pesée apparaît pour la récolte concernée',
    /46\.5 kg brut − 4 hausses × 7 kg/.test(texte),
    (texte.match(/Pesée[^\n]*/) || [''])[0]);
  rapport.verifier('les récoltes saisies en direct n’en affichent pas',
    (texte.match(/Pesée/g) || []).length === 1);

  /* La page Registre n'affiche que l'en-tête et le bouton d'impression :
     le document lui-même est produit par registreDocumentHTML(). Chercher
     les tableaux dans la page aurait fait passer ces contrôles À VIDE. */
  const registre = await page.evaluate(() => registreDocumentHTML('tout'));
  rapport.verifier('le document contient bien la traçabilité des lots',
    /Traçabilité des lots/.test(registre), `${registre.length} caractères`);
  rapport.verifier('il reprend le miel NET, jamais le poids brut',
    /18\.5/.test(registre) && !/46\.5/.test(registre));
  const ligneLot = (registre.match(/<tr>(?:(?!<\/tr>).)*L 2026-09-B(?:(?!<\/tr>).)*<\/tr>/s) || [''])[0];
  rapport.verifier('la ligne du lot pesé porte ses 4 hausses',
    />4</.test(ligneLot), ligneLot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

  const hausseDuLot = await page.evaluate(() => {
    /* Le nombre de hausses doit venir de la pesée quand elle existe, et
       retomber sur le retrait noté dans la section Hausses sinon. */
    const avecPesee = { hausses:4, date:'2026-01-01' };
    const sansPesee = { hausses:undefined, date:'2026-01-01' };
    const h = { hausses:[{ date:'2026-01-01', action:'Hausse retirée', nombre:2 }] };
    return { pesee: avecPesee.hausses || haussesRetirees(h, avecPesee.date),
             repli: sansPesee.hausses || haussesRetirees(h, sansPesee.date) };
  });
  rapport.verifier('la pesée prime sur le retrait noté', hausseDuLot.pesee === 4);
  rapport.verifier('sans pesée, le retrait noté prend le relais', hausseDuLot.repli === '2');

  rapport.section("Rien d'autre ne doit avoir bougé");
  rapport.verifier('aucune erreur JavaScript sur tout le parcours',
    erreurs.length === 0, erreurs.join(' | '));
});
