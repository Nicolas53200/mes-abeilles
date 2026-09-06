/* Sauvegarde et changement de téléphone.

   LE RISQUE : les données ne vivent que sur cet appareil. Aucun compte,
   aucun serveur — c'est la force revendiquée de l'application, et elle
   tient. Mais les copies de secours internes (backup, avant-migration)
   sont dans le MÊME stockage : elles protègent d'une corruption, pas
   d'un téléphone perdu, réinitialisé, ou dont on efface les données de
   navigation. Le fichier exporté est la seule copie qui survit.

   Or l'application ne savait même pas si l'apiculteur en avait fait un :
   exportData() ne laissait aucune trace. Elle ne pouvait donc ni le lui
   rappeler, ni l'alerter.

   Cette suite couvre la trace, le rappel, et le scénario complet du
   changement de téléphone — export d'un côté, import de l'autre. */

import { executerSuite, amorcer, doublerCdn, RACINE } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RUCHER = {
  hives: [{ code:'RUCHE-001', name:'Lavande', apiary:'Prairie Haute', type:'ruche', honey:18, alerts:0,
    visites:[{ date:'2026-08-20', reine:'Oui', couvain:'Beau', force:'Forte', reserves:'Bonnes', varroa:'Absence', notes:'Colonie vigoureuse' }],
    traitements:[{ date:'2026-08-01', type:'Apivar', quantite:'2 lanières', retrait:'2026-09-15' }],
    recoltes:[{ id:'r1', date:'2026-07-10', type:'Toutes fleurs', kilos:18, butinage:'Tilleul', lot:'L 2026-07-A' }] }],
  profil: { prenom:'Nicolas', nom:'Morel', napi:'53-12345', siret:'12345678900011', type:'pro' },
  apiaries: [{ name:'Prairie Haute' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v0-tests'
};

export default () => executerSuite('Sauvegarde et changement de téléphone',
  async ({ navigateur, origine, rapport, erreurs }) => {

  const ouvrir = async () => {
    const ctx = await navigateur.newContext({ viewport:{width:390,height:820}, isMobile:true, acceptDownloads:true });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
    await doublerCdn(page);
    return { ctx, page };
  };

  rapport.section("LE MANQUE : l'application ignorait si une copie existait");
  const { ctx, page } = await ouvrir();
  await amorcer(page, RUCHER);
  await page.goto(origine);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  const jamais = await page.evaluate(() => ({
    jours: joursDepuisSauvegarde(),
    rappel: sauvegardeARappeler(),
    libelle: libelleDerniereSauvegarde(),
    titres: [...document.querySelectorAll('.guide-title')].map(x => x.innerText)
  }));
  rapport.verifier('jamais sauvegardé : le rappel se déclenche',
    jamais.rappel === true && jamais.jours === null, jamais.libelle);
  rapport.verifier("il passe devant l'installation — perdre son rucher est pire",
    /abri|sauvegarde/i.test(jamais.titres[0] || ''), jamais.titres.join(' | '));

  rapport.section("Un rucher encore vide n'est pas harcelé");
  const calme = await page.evaluate(() => {
    const garde = state.hives;
    state.hives = [];
    const sansRuche = sauvegardeARappeler();
    state.hives = [{ code:'X', name:'X', type:'ruche', honey:0, alerts:0 }];
    const uneRucheVide = sauvegardeARappeler();
    state.hives = garde;
    return { sansRuche, uneRucheVide };
  });
  rapport.verifier('aucune ruche : pas de rappel', calme.sansRuche === false);
  rapport.verifier('une ruche sans aucune saisie : pas encore de rappel', calme.uneRucheVide === false);

  rapport.section("L'export laisse enfin une trace");
  let fichier = null;
  try{
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.evaluate(() => exportData())
    ]);
    const chemin = await dl.path();
    fichier = { nom: dl.suggestedFilename(), contenu: chemin ? fs.readFileSync(chemin, 'utf-8') : '' };
  }catch(e){}
  rapport.verifier('un fichier est produit', !!fichier, fichier?.nom);
  await page.waitForTimeout(400);
  const trace = await page.evaluate(() => ({
    date: state.derniereSauvegarde, rappel: sauvegardeARappeler(), libelle: libelleDerniereSauvegarde()
  }));
  rapport.verifier('la date du jour est mémorisée', /^\d{4}-\d{2}-\d{2}$/.test(trace.date || ''), trace.date);
  rapport.verifier('le rappel se tait', trace.rappel === false, trace.libelle);
  rapport.verifier("le fichier porte la date du jour où il est fait, pas la précédente",
    new RegExp('"derniereSauvegarde":\\s*"' + trace.date + '"').test(fichier?.contenu || ''));

  rapport.section('Le rappel revient au bout d\'un mois, pas avant');
  const seuil = await page.evaluate(() => {
    const poser = n => { const d = new Date(); d.setDate(d.getDate() - n);
                         state.derniereSauvegarde = d.toISOString().slice(0,10); return sauvegardeARappeler(); };
    return { j29: poser(29), j31: poser(31) };
  });
  rapport.verifier('29 jours : silence', seuil.j29 === false);
  rapport.verifier('31 jours : rappel', seuil.j31 === true);

  rapport.section('La date survit au rechargement');
  await page.evaluate(() => { state.derniereSauvegarde = '2026-09-01'; saveState(); });
  await page.reload();
  await page.waitForTimeout(1400);
  rapport.verifier('relue au chargement (liste blanche de mergeLoadedState)',
    await page.evaluate(() => state.derniereSauvegarde) === '2026-09-01');
  await ctx.close();

  rapport.section("LE SCÉNARIO RÉEL : changer de téléphone");
  const ancien = await ouvrir();
  await amorcer(ancien.page, RUCHER);
  await ancien.page.goto(origine);
  await ancien.page.waitForTimeout(1500);
  let sauvegarde = null;
  try{
    const [dl] = await Promise.all([
      ancien.page.waitForEvent('download', { timeout: 8000 }),
      ancien.page.evaluate(() => exportData())
    ]);
    const c = await dl.path();
    sauvegarde = path.join(os.tmpdir(), 'mes-abeilles-sauvegarde-test.json');
    fs.writeFileSync(sauvegarde, fs.readFileSync(c, 'utf-8'));
  }catch(e){}
  rapport.verifier("l'ancien téléphone produit sa sauvegarde", !!sauvegarde);
  await ancien.ctx.close();

  const neuf = await ouvrir();
  await neuf.page.goto(origine);
  await neuf.page.waitForTimeout(1500);
  const vierge = await neuf.page.evaluate(() => ({
    ruches: state.hives.length, napi: state.profil?.napi || '' }));
  rapport.verifier('le nouveau téléphone démarre vide : rien ne se récupère tout seul',
    vierge.ruches === 0 && !vierge.napi, vierge.ruches + ' ruche');

  await neuf.page.evaluate(() => { if(typeof splashFinish === 'function') splashFinish(); });
  await neuf.page.waitForTimeout(700);
  await neuf.page.evaluate(() => showPage('admin'));
  await neuf.page.waitForTimeout(400);
  const aide = await neuf.page.evaluate(() => document.getElementById('content')?.innerText || '');
  rapport.verifier("l'Administration explique le changement de téléphone", /Changer de téléphone/.test(aide));
  rapport.verifier("elle dit franchement que rien n'est récupérable sans fichier",
    /rien ne pourra être récupéré/i.test(aide));
  rapport.verifier("elle affiche l'état de la sauvegarde",
    /sauvegard/i.test(aide));

  await neuf.page.setInputFiles('input[type=file][accept=".json"]', sauvegarde);
  await neuf.page.waitForTimeout(1200);
  const restaure = await neuf.page.evaluate(() => ({
    ruches: state.hives.length, nom: state.hives[0]?.name,
    visites: state.hives[0]?.visites?.length ?? 0,
    traitements: state.hives[0]?.traitements?.length ?? 0,
    lot: state.hives[0]?.recoltes?.[0]?.lot,
    napi: state.profil?.napi, sauvegarde: state.derniereSauvegarde
  }));
  rapport.verifier('la ruche est restaurée', restaure.ruches === 1 && restaure.nom === 'Lavande');
  rapport.verifier('les visites', restaure.visites === 1);
  rapport.verifier('les traitements', restaure.traitements === 1);
  rapport.verifier('le numéro de lot', restaure.lot === 'L 2026-07-A', restaure.lot);
  rapport.verifier('le profil et le NAPI', restaure.napi === '53-12345');
  rapport.verifier('la date de sauvegarde a voyagé avec le fichier',
    /^\d{4}-\d{2}-\d{2}$/.test(restaure.sauvegarde || ''), restaure.sauvegarde);

  await neuf.page.evaluate(() => { showPage('registre'); registreChangerPeriode('tout'); });
  await neuf.page.waitForTimeout(600);
  const reg = await neuf.page.evaluate(() => document.getElementById('registreDoc')?.innerText || '');
  rapport.verifier('le registre réglementaire est reconstitué à l\'identique',
    /53-12345/.test(reg) && /Apivar/.test(reg) && /L 2026-07-A/.test(reg));
  await neuf.ctx.close();

  rapport.section("Rappel mensuel : le seul qui prévient application fermée");
  const dernier = await ouvrir();
  await amorcer(dernier.page, RUCHER);
  await dernier.page.goto(origine);
  await dernier.page.waitForTimeout(1500);
  await dernier.page.evaluate(() => rappelSauvegardeAgenda());
  await dernier.page.waitForTimeout(400);
  rapport.verifier('le panneau de choix propose le rappel',
    await dernier.page.evaluate(() =>
      !!document.getElementById('choixCalendrier')?.classList.contains('open')));
  const url = await dernier.page.evaluate(() => lienGoogleAgenda({
    start:'2026-10-06', title:'Sauvegarder Mes Abeilles', desc:'x', repetition:'FREQ=MONTHLY' }));
  rapport.verifier('Google Agenda reçoit la répétition mensuelle',
    /recur=RRULE%3AFREQ%3DMONTHLY/.test(url));
  let ics = null;
  try{
    const [dl] = await Promise.all([
      dernier.page.waitForEvent('download', { timeout: 8000 }),
      dernier.page.evaluate(() => rappelVersFichier())
    ]);
    const c = await dl.path();
    ics = c ? fs.readFileSync(c, 'utf-8') : '';
  }catch(e){}
  rapport.verifier('le fichier .ics porte la répétition', /RRULE:FREQ=MONTHLY/.test(ics || ''));
  rapport.verifier("un rappel ordinaire n'en porte pas",
    await dernier.page.evaluate(() => !/recur=/.test(lienGoogleAgenda({ start:'2026-10-06', title:'x', desc:'y' }))));
  await dernier.ctx.close();

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
