/* L'ordinateur comme copie de secours, et le va-et-vient des fichiers.

   LE DANGER : importData() faisait « state.hives = imported.hives ».
   L'import REMPLACE tout, en silence, sans confirmation ni retour
   arrière. Tant que l'import ne servait qu'une fois, à l'installation
   sur un nouveau téléphone, le risque restait théorique. Dès que
   l'apiculteur fait des allers-retours avec son ordinateur — sauvegarde
   mensuelle, consultation depuis le PC — un fichier plus ancien choisi
   par erreur emporte la saison entière.

   Cette suite joue le parcours complet sur trois appareils : téléphone,
   ordinateur, nouveau téléphone. Puis elle provoque l'écrasement
   accidentel et vérifie qu'on peut revenir en arrière. */

import { executerSuite, doublerCdn } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SAISON = {
  hives: [
    { code:'RUCHE-001', name:'Lavande', apiary:'Prairie', type:'ruche', honey:18, alerts:0,
      visites:[{ date:'2026-08-20', reine:'Oui', couvain:'Beau', force:'Forte', reserves:'Bonnes', varroa:'Absence' }],
      recoltes:[{ id:'r1', date:'2026-07-10', type:'Toutes fleurs', kilos:18, butinage:'Tilleul', lot:'L 2026-07-A' }] },
    { code:'RUCHE-002', name:'Tilleul', apiary:'Prairie', type:'ruche', honey:9, alerts:0,
      visites:[{ date:'2026-08-22', reine:'Oui', couvain:'Moyen', force:'Moyenne', reserves:'Moyennes', varroa:'Absence' }] }
  ],
  profil: { prenom:'Nicolas', nom:'Morel', napi:'53-12345', type:'pro' },
  apiaries: [{ name:'Prairie' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v0-tests'
};

export default () => executerSuite("Ordinateur de secours et import",
  async ({ navigateur, origine, rapport, erreurs }) => {

  const appareil = async (opts = {}) => {
    const ctx = await navigateur.newContext({
      viewport: opts.pc ? { width:1280, height:900 } : { width:390, height:820 },
      isMobile: !opts.pc, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
    await doublerCdn(page);
    if(opts.seed){
      await page.addInitScript(d => {
        try{ localStorage.setItem('mesAbeilles_data_v1', JSON.stringify(d)); }catch(e){}
      }, opts.seed);
    }
    await page.goto(origine);
    await page.waitForTimeout(1400);
    await page.evaluate(() => {
      const m = document.getElementById('nouveautesModal');
      if(m && m.classList.contains('open')) fermerNouveautes();
      if(typeof splashFinish === 'function' && !state.onboardingDone) splashFinish();
    });
    await page.waitForTimeout(400);
    return { ctx, page };
  };

  const exporter = async (page, nom) => {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 8000 }),
      page.evaluate(() => exportData())
    ]);
    const brut = await dl.path();
    const cible = path.join(os.tmpdir(), nom);
    fs.writeFileSync(cible, fs.readFileSync(brut, 'utf-8'));
    return cible;
  };

  const versAdmin = async page => {
    await page.evaluate(() => showPage('admin'));
    await page.waitForTimeout(300);
  };

  rapport.section("Du téléphone vers l'ordinateur");
  const tel = await appareil({ seed: SAISON });
  const recent = await exporter(tel.page, 'mes-abeilles-recent.json');
  rapport.verifier("le téléphone produit sa sauvegarde", fs.existsSync(recent));
  await tel.ctx.close();

  const pc = await appareil({ pc:true });
  await versAdmin(pc.page);
  await pc.page.setInputFiles('input[type=file][accept=".json"]', recent);
  await pc.page.waitForTimeout(1200);
  const surPc = await pc.page.evaluate(() => ({
    ruches: state.hives.length, lot: state.hives[0]?.recoltes?.[0]?.lot }));
  rapport.verifier("l'ordinateur récupère le rucher entier",
    surPc.ruches === 2 && surPc.lot === 'L 2026-07-A', surPc.ruches + ' ruches');

  rapport.section("L'application est réellement utilisable sur un ordinateur");
  const largeur = await pc.page.evaluate(() =>
    Math.round(document.querySelector('.phone').getBoundingClientRect().width));
  rapport.verifier("la mise en page s'élargit au lieu de rester une colonne de téléphone",
    largeur > 800, largeur + 'px sur 1280');
  const colonnes = await pc.page.evaluate(() => {
    showPage('ruchers');
    const g = document.getElementById('ruchersGrid');
    return g ? getComputedStyle(g).gridTemplateColumns : '';
  });
  rapport.verifier('la liste des ruches passe sur plusieurs colonnes',
    /repeat\(([3-9]|\d\d)/.test(colonnes) || colonnes.split(' ').filter(Boolean).length >= 3, colonnes);

  // L'ordinateur prend du retard : on y fabrique une sauvegarde plus ancienne.
  await pc.page.evaluate(() => {
    state.hives = state.hives.slice(0, 1);
    state.hives[0].visites = [{ date:'2026-05-02', reine:'Oui', couvain:'Beau', force:'Forte', reserves:'Bonnes', varroa:'Absence' }];
    saveState();
  });
  await versAdmin(pc.page);
  const perime = await exporter(pc.page, 'mes-abeilles-perime.json');
  await pc.ctx.close();

  rapport.section("De l'ordinateur vers un nouveau téléphone");
  const neuf = await appareil({});
  await versAdmin(neuf.page);
  const aide = await neuf.page.evaluate(() => document.getElementById('content')?.innerText || '');
  rapport.verifier("l'Administration explique l'ordinateur de secours",
    /ordinateur comme copie de secours/i.test(aide));
  rapport.verifier("elle prévient qu'importer remplace tout",
    /importer remplace tout/i.test(aide));
  await neuf.page.setInputFiles('input[type=file][accept=".json"]', recent);
  await neuf.page.waitForTimeout(1200);
  const restaure = await neuf.page.evaluate(() => ({
    ruches: state.hives.length, napi: state.profil.napi }));
  rapport.verifier('tout revient sur le nouveau téléphone',
    restaure.ruches === 2 && restaure.napi === '53-12345');

  rapport.section("LE PIÈGE : importer un fichier plus ancien");
  let dialogue = '';
  const refuser = async d => { dialogue = d.message(); await d.dismiss(); };
  neuf.page.on('dialog', refuser);
  await versAdmin(neuf.page);
  await neuf.page.setInputFiles('input[type=file][accept=".json"]', perime);
  await neuf.page.waitForTimeout(1200);
  rapport.verifier('une confirmation arrête le geste', /REMPLACER/.test(dialogue),
    dialogue.split('\n').filter(Boolean)[0]);
  rapport.verifier("elle décrit ce qui est sur l'appareil",
    /Sur l'appareil : 2 ruches/.test(dialogue) && /dernière sauvegarde le/.test(dialogue));
  rapport.verifier('et ce que contient le fichier',
    /Dans le fichier : 1 ruche/.test(dialogue) && /02\/05\/2026/.test(dialogue));
  rapport.verifier('refuser laisse les données intactes',
    await neuf.page.evaluate(() => state.hives.length) === 2);

  rapport.section("Et si l'apiculteur accepte quand même");
  neuf.page.removeListener('dialog', refuser);
  neuf.page.on('dialog', async d => { await d.accept(); });
  await versAdmin(neuf.page);
  await neuf.page.setInputFiles('input[type=file][accept=".json"]', perime);
  await neuf.page.waitForTimeout(1300);
  const ecrase = await neuf.page.evaluate(() => ({
    ruches: state.hives.length, copie: !!copieAvantImport() }));
  rapport.verifier("l'import a bien lieu", ecrase.ruches === 1, ecrase.ruches + ' ruche');
  rapport.verifier("une copie d'avant a été prise", ecrase.copie === true);

  await versAdmin(neuf.page);
  const boutons = await neuf.page.evaluate(() =>
    [...document.querySelectorAll('#content button')].map(b => b.innerText.trim()));
  rapport.verifier("l'Administration propose de revenir en arrière",
    boutons.some(t => /annuler le dernier import/i.test(t)));
  await neuf.page.evaluate(() => annulerImport());
  await neuf.page.waitForTimeout(1000);
  const revenu = await neuf.page.evaluate(() => ({
    ruches: state.hives.length,
    visite: state.hives[0]?.visites?.[0]?.date,
    lot: state.hives[0]?.recoltes?.[0]?.lot,
    copie: !!copieAvantImport() }));
  rapport.verifier('la saison est récupérée',
    revenu.ruches === 2 && revenu.visite === '2026-08-20', revenu.ruches + ' ruches');
  rapport.verifier('avec son numéro de lot', revenu.lot === 'L 2026-07-A', revenu.lot);
  rapport.verifier("le filet est consommé, pas un historique infini", revenu.copie === false);
  await neuf.ctx.close();

  rapport.section("Un import sur un appareil n'en touche aucun autre");
  /* Question naturelle quand on découvre l'import : « si j'importe sur
     le PC, le téléphone perd-il ses données ? ». Chaque navigateur a son
     propre stockage, donc non — mais cela se prouve plutôt que cela ne
     s'affirme. Le téléphone reste ICI ouvert pendant tout l'import. */
  const telOuvert = await appareil({ seed: SAISON });
  const copie = await exporter(telOuvert.page, 'mes-abeilles-isolation.json');
  const avantPc = await telOuvert.page.evaluate(() => ({
    ruches: state.hives.length,
    noms: state.hives.map(h => h.name).join(','),
    visites: state.hives.reduce((s,h) => s + (h.visites || []).length, 0),
    lot: state.hives[0]?.recoltes?.[0]?.lot,
    octets: (localStorage.getItem('mesAbeilles_data_v1') || '').length
  }));

  const autrePc = await appareil({ pc:true, seed: {
    ...SAISON,
    hives: [{ code:'AUTRE-9', name:'Vieux essai', apiary:'X', type:'ruche', honey:0, alerts:0 }] } });
  autrePc.page.on('dialog', async d => { await d.accept(); });
  await versAdmin(autrePc.page);
  await autrePc.page.setInputFiles('input[type=file][accept=".json"]', copie);
  await autrePc.page.waitForTimeout(1400);
  rapport.verifier("l'ordinateur reçoit bien le rucher",
    await autrePc.page.evaluate(() => state.hives.map(h => h.name).join(',')) === 'Lavande,Tilleul');

  await telOuvert.page.waitForTimeout(500);
  const apresPc = await telOuvert.page.evaluate(() => ({
    ruches: state.hives.length,
    noms: state.hives.map(h => h.name).join(','),
    visites: state.hives.reduce((s,h) => s + (h.visites || []).length, 0),
    lot: state.hives[0]?.recoltes?.[0]?.lot,
    octets: (localStorage.getItem('mesAbeilles_data_v1') || '').length
  }));
  rapport.verifier('le téléphone garde ses ruches, ses visites et son lot',
    apresPc.ruches === avantPc.ruches && apresPc.noms === avantPc.noms
    && apresPc.visites === avantPc.visites && apresPc.lot === avantPc.lot,
    apresPc.noms);
  rapport.verifier("son stockage local est intact, à l'octet près",
    apresPc.octets === avantPc.octets, apresPc.octets + ' octets');

  await telOuvert.page.reload();
  await telOuvert.page.waitForTimeout(1400);
  const recharge = await telOuvert.page.evaluate(() => ({
    ruches: state.hives.length,
    visites: state.hives.reduce((s,h) => s + (h.visites || []).length, 0) }));
  rapport.verifier("rien n'a été écrit dans son dos : tout est là après rechargement",
    recharge.ruches === 2 && recharge.visites === 2);

  await autrePc.page.evaluate(() => { state.hives[0].name = 'Modifié sur PC'; saveState(); });
  await autrePc.page.waitForTimeout(400);
  await telOuvert.page.reload();
  await telOuvert.page.waitForTimeout(1400);
  rapport.verifier('et une modification faite sur le PC ne descend pas sur le téléphone',
    await telOuvert.page.evaluate(() => state.hives[0].name) === 'Lavande');
  await autrePc.ctx.close();
  await telOuvert.ctx.close();

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
