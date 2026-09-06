/* Registre d'élevage apicole.

   CE QUI MANQUAIT : l'application saisissait déjà tout ce que l'arrêté du
   5 juin 2000 exige — identité et NAPI, emplacement des ruchers, cheptel,
   traitements, mouvements de colonies, soins — mais n'en sortait aucun
   document. La section Conformité n'était qu'une liste de cases à cocher
   et le seul export, un fichier JSON, est illisible pour un contrôle.
   L'écart n'était pas dans la donnée, il était dans le document.

   Cette suite vérifie que chaque élément exigé figure au registre, que le
   filtrage par année est juste, et que l'impression ne traîne pas le
   décor de l'application. */

import { executerSuite, amorcer, doublerCdn } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { RACINE } from '../lib/harness.mjs';

const EXPLOITATION = {
  hives: [
    { code:'RUCHE-001', name:'Lavande', apiary:'Prairie Haute', type:'ruche', honey:23, alerts:0,
      gps:{ lat:48.1173, lon:-1.6778 }, material:{ type:'Dadant', frames:'10' },
      visites:[
        { date:'2026-04-12', reine:'Oui', couvain:'Beau', force:'Forte', reserves:'Bonnes', varroa:'Absence', notes:'Colonie vigoureuse' },
        { date:'2026-08-20', reine:'Oui', couvain:'Moyen', force:'Moyenne', reserves:'Moyennes', varroa:'Présence faible', notes:'' }],
      traitements:[
        { date:'2026-08-01', type:'Apivar', quantite:'2 lanières', retrait:'2026-09-15', notes:'Pose lanières' },
        { date:'2025-08-05', type:'Apivar', quantite:'2 lanières', retrait:'2025-09-20', notes:'Année précédente' }],
      nourrissements:[{ date:'2026-09-01', type:'Sirop 50/50', quantite:'2 L', notes:'' }],
      frelons:[{ date:'2026-08-25', observation:'Pression forte', piege:'2 pièges', captures:'34' }],
      recoltes:[{ date:'2026-07-10', type:'Toutes fleurs', kilos:'18', butinage:'Tilleul' }],
      transhumances:[{ date:'2026-05-02', depart:'Prairie Haute', arrivee:'Colza Nord', nb:'1', floraison:'Colza' }],
      divisions:[{ date:'2026-06-01', newName:'Tilleul', newCode:'RUCHE-002', couvain:'3', miel:'2', cellule:'Oui', reine:'Non' }] },
    { code:'RUCHE-002', name:'Tilleul', apiary:'Prairie Haute', type:'ruchette', honey:0, alerts:0,
      visites:[{ date:'2026-06-20', reine:'Incertain', couvain:'Faible', force:'Faible', reserves:'Faibles', varroa:'Absence', notes:'À surveiller' }] }
  ],
  profil: { prenom:'Nicolas', nom:'Morel', entreprise:'Rucher du Chêne', napi:'53-12345',
            siret:'12345678900011', adresse:'12 chemin des Ruches, 53000 Laval',
            telephone:'0600000000', email:'n@example.fr', type:'pro' },
  apiaries: [{ name:'Prairie Haute' }],
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v0-tests'
};

export default () => executerSuite("Registre d'élevage", async ({ page, origine, rapport, erreurs }) => {

  await amorcer(page, EXPLOITATION);
  await doublerCdn(page);
  await page.goto(origine);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });
  await page.evaluate(() => showPage('registre'));
  await page.waitForTimeout(600);

  const lire = () => page.evaluate(() => document.getElementById('registreDoc')?.innerText || '');
  let doc = await lire();

  rapport.section("Les éléments exigés par l'arrêté du 5 juin 2000");
  rapport.verifier('le document se génère', doc.length > 500, doc.length + ' caractères');
  rapport.verifier("intitulé « Registre d'élevage apicole »", /Registre d'élevage apicole/.test(doc));
  rapport.verifier('identité de l\'apiculteur', /Nicolas Morel/.test(doc));
  rapport.verifier('numéro NAPI', /53-12345/.test(doc));
  rapport.verifier('numéro SIRET', /12345678900011/.test(doc));
  rapport.verifier('adresse de l\'exploitation', /chemin des Ruches/.test(doc));
  rapport.verifier('cheptel dénombré', /1 ruche · 1 ruchette/.test(doc));
  rapport.verifier('emplacement des ruchers avec coordonnées', /Prairie Haute/.test(doc) && /48\.11730/.test(doc));
  rapport.verifier('recensement des colonies', /RUCHE-001/.test(doc) && /RUCHE-002/.test(doc));
  rapport.verifier('traitements vétérinaires', /Apivar/.test(doc));
  rapport.verifier("fin de délai d'attente reportée", /15\/09\/2026/.test(doc));
  rapport.verifier('mouvements — transhumance', /Colza Nord/.test(doc));
  rapport.verifier('mouvements — division', /Cadres couvain/.test(doc));
  rapport.verifier('suivi zootechnique', /Colonie vigoureuse/.test(doc));
  rapport.verifier('nourrissement', /Sirop 50\/50/.test(doc));
  rapport.verifier('surveillance du frelon', /Pression forte/.test(doc));
  rapport.verifier('récoltes', /Toutes fleurs/.test(doc));
  rapport.verifier("référence à l'arrêté", /arrêté du 5 juin 2000/.test(doc));
  rapport.verifier('conservation cinq ans rappelée', /cinq ans/.test(doc));
  rapport.verifier('emplacement de signature', /Signature/.test(doc));
  rapport.verifier("l'application ne se prétend pas certifiée",
    /Aucun modèle officiel n'existe/.test(doc));

  rapport.section('Le filtrage par période est juste');
  const bloc = t => (doc.split(t)[1] || '').split('MOUVEMENTS')[0];
  rapport.verifier("l'année en cours écarte le traitement de 2025",
    !/2025/.test(bloc('TRAITEMENTS')), '');

  await page.evaluate(() => registreChangerPeriode('2025'));
  await page.waitForTimeout(350);
  doc = await lire();
  rapport.verifier("l'année 2025 montre son traitement", /Année précédente/.test(doc));
  rapport.verifier('et masque celui de 2026', !/Pose lanières/.test(doc));

  await page.evaluate(() => registreChangerPeriode('tout'));
  await page.waitForTimeout(350);
  doc = await lire();
  rapport.verifier("« tout l'historique » réunit les deux années",
    /Pose lanières/.test(doc) && /Année précédente/.test(doc));

  rapport.section('Un registre se lit par date');
  const ordre = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.reg-table')].find(x => x.innerText.includes('Apivar'));
    return [...t.querySelectorAll('tbody tr')].map(r => r.cells[0].innerText);
  });
  const attendu = [...ordre].sort((a,b) => {
    const k = x => x.split('/').reverse().join('');
    return k(a).localeCompare(k(b));
  });
  rapport.verifier('les traitements sont classés chronologiquement',
    ordre.join(' ') === attendu.join(' '), ordre.join(' → '));

  rapport.section("Un rucher vide ou incomplet ne casse rien");
  const vide = await page.evaluate(() => {
    state.hives = []; state.profil = {};
    registreChangerPeriode('tout');
    return document.getElementById('registreDoc')?.innerText || '';
  });
  rapport.verifier('aucune colonie : message clair, pas de plantage',
    /Aucune colonie enregistrée/.test(vide));
  rapport.verifier('les champs vides deviennent un tiret', /—/.test(vide));

  rapport.section("L'impression ne traîne pas le décor de l'application");
  // Masquer par visibility laissait le fond sombre et la hauteur du décor
  // s'imprimer en bandeau au-dessus du registre.
  const css = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf-8');
  rapport.verifier("le fond de l'application est neutralisé",
    /body\.impression-registre\{background:#fff/.test(css));
  rapport.verifier("l'en-tête et la barre du bas sortent du flux",
    /body\.impression-registre #pageHero[\s\S]{0,200}display:none/.test(css));
  rapport.verifier("l'étiquette QR ne s'imprime pas avec le registre",
    /body\.impression-registre \.print-only/.test(css));
  rapport.verifier('les lignes de tableau ne se coupent pas entre deux pages',
    /impression-registre \.reg-table tr\{break-inside:avoid/.test(css));

  const nettoyage = await page.evaluate(() => {
    imprimerRegistre();
    const pose = document.body.classList.contains('impression-registre');
    window.dispatchEvent(new Event('afterprint'));
    return { pose, retire: !document.body.classList.contains('impression-registre') };
  });
  rapport.verifier("le mode impression s'active", nettoyage.pose);
  rapport.verifier("et se retire une fois l'impression finie", nettoyage.retire);

  rapport.section('On peut y accéder');
  await page.evaluate(() => { state.hives = JSON.parse(localStorage.getItem('mesAbeilles_data_v1')).hives; });
  await page.evaluate(() => showPage('menu'));
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => [...document.querySelectorAll('#content button')].map(b => b.innerText.trim()));
  rapport.verifier('depuis le menu', menu.some(t => /registre/i.test(t)),
    menu.filter(t => /registre/i.test(t)).join(''));
  await page.evaluate(() => showPage('admin'));
  await page.waitForTimeout(300);
  const admin = await page.evaluate(() => [...document.querySelectorAll('#content button')].map(b => b.innerText.trim()));
  rapport.verifier("depuis l'Administration", admin.some(t => /registre/i.test(t)));

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
