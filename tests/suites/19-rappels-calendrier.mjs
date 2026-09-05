/* Rappels calendrier et pastille d'icône.

   LE BUG signalé : « j'accepte les rappels, je vais dans Google Agenda,
   je ne vois rien ». C'était le fonctionnement prévu, mais trompeur :

   · accepter l'invite ne créait AUCUN événement — cela activait
     seulement des boutons, alors que le message disait « ✓ Rappels
     calendrier activés » ;
   · le bouton « Ajouter au calendrier » téléchargeait un fichier .ics
     sans un mot. Il atterrissait dans les téléchargements du téléphone
     et n'arrivait jamais dans l'agenda ;
   · ce bouton n'existait ni sur le Résumé ni sur les visites : la carte
     « Prochaine visite » qui le portait était du code mort, jamais
     appelé — pourtant c'est le rappel le plus utile.

   Un panneau propose désormais les deux chemins, l'apiculteur choisit. */

import { executerSuite, amorcer, doublerCdn } from '../lib/harness.mjs';
import fs from 'node:fs';

const RUCHE = {
  hives: [{ code:'RUCHE-001', name:'Lavande', apiary:'Prairie', type:'ruche', honey:12, alerts:3,
            visites:[{date:'2026-08-20', force:'Moyenne', reine:'Oui', ponte:'Bonne', reserves:'Moyennes'}] }],
  profil: { type:'amateur', nom:'Morel', napi:'53-1' },
  apiaries: [{ name:'Prairie' }],
  alertSettings: { visitDays:21, notifications:false, weather:true, calendar:true, quietHours:true, lastWeatherCheck:'' },
  onboardingDone:true, hiveTourDone:true, calendarPromptDone:true, derniereVersionVue:'v0-tests'
};

export default () => executerSuite('Rappels calendrier', async ({ navigateur, origine, rapport, erreurs }) => {

  const ctx = await navigateur.newContext({ viewport:{width:390,height:800}, isMobile:true,
                                            hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
  await doublerCdn(page);
  await amorcer(page, RUCHE);
  // L'API de pastille n'existe pas dans un Chromium automatisé : on la
  // remplace par un mouchard pour observer ce que l'application demande.
  await page.addInitScript(() => {
    window.__badge = [];
    navigator.setAppBadge = n => { window.__badge.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__badge.push(0); return Promise.resolve(); };
  });
  await page.goto(origine);
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const m = document.getElementById('nouveautesModal');
                              if(m && m.classList.contains('open')) fermerNouveautes(); });

  rapport.section("Pastille chiffrée sur l'icône de l'application");
  const b1 = await page.evaluate(() => ({
    badge: window.__badge,
    alertes: state.hives.reduce((s,h) => s + Number(h.alerts || 0), 0)
  }));
  rapport.verifier("elle porte le total d'alertes calculé par l'application",
    b1.badge.length > 0 && b1.badge[b1.badge.length - 1] === b1.alertes,
    `pastille ${JSON.stringify(b1.badge)} · alertes ${b1.alertes}`);

  await page.evaluate(() => { window.__badge = []; state.hives.forEach(h => h.alerts = 0); updateStats(); });
  const b2 = await page.evaluate(() => window.__badge);
  rapport.verifier("elle s'efface quand il n'y a plus d'alerte", b2[b2.length - 1] === 0, JSON.stringify(b2));
  await page.evaluate(() => { recomputeAutomaticAlerts(false); updateStats(); });

  rapport.section("LE CODE MORT : la carte « Prochaine visite » est enfin affichée");
  await page.evaluate(() => { openHive('RUCHE-001'); setHiveSection('resume'); });
  await page.waitForTimeout(600);
  const resume = await page.evaluate(() => ({
    carte: !!document.querySelector('.resume-next-visit'),
    titre: document.querySelector('.resume-next-visit-title')?.innerText || '',
    boutons: [...document.querySelectorAll('.resume-next-visit button')].map(b => b.innerText.trim())
  }));
  rapport.verifier('la carte est présente sur le Résumé', resume.carte, resume.titre);
  rapport.verifier('elle porte le bouton calendrier',
    resume.boutons.some(t => /calendrier/i.test(t)), resume.boutons.join(' · '));

  rapport.section("Plus de téléchargement muet : l'apiculteur choisit");
  await page.click('.resume-next-visit button');
  await page.waitForTimeout(450);
  const choix = await page.evaluate(() => {
    const m = document.getElementById('choixCalendrier');
    return { ouvert: !!m && m.classList.contains('open'),
             resume: document.getElementById('choixCalendrierResume')?.innerText || '',
             boutons: [...m.querySelectorAll('button')].map(b => b.innerText.trim()),
             note: document.getElementById('choixCalendrierNote')?.innerText || '' };
  });
  rapport.verifier('le panneau de choix s\'ouvre', choix.ouvert);
  rapport.verifier("il rappelle de quel événement il s'agit", /Lavande/.test(choix.resume), choix.resume);
  rapport.verifier('il propose Google Agenda', choix.boutons.some(b => /google/i.test(b)));
  rapport.verifier('il propose le fichier .ics', choix.boutons.some(b => /\.ics/i.test(b)));
  rapport.verifier('il annonce que Google voit passer les données',
    /google/i.test(choix.note) && /donnée|passent|par Google/i.test(choix.note));

  rapport.section("L'adresse Google Agenda est celle de la création d'événement");
  const url = await page.evaluate(() => lienGoogleAgenda({
    start:'2026-09-10', title:'Visite ruche Lavande', desc:'Ruche : Lavande', location:'Prairie' }));
  rapport.verifier('adresse officielle',
    url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  rapport.verifier('journée entière, du jour au lendemain',
    /dates=20260910(%2F|\/)20260911/.test(url));
  rapport.verifier('le titre de la ruche est transmis', /Visite\+ruche\+Lavande/.test(url));
  const mauvaise = await page.evaluate(() => lienGoogleAgenda({ start:'pas-une-date', title:'x' }));
  rapport.verifier('une date invalide ne fabrique pas de lien', mauvaise === null, String(mauvaise));

  rapport.section("Le fichier .ics reste disponible, et on dit quoi en faire");
  await page.evaluate(() => fermerChoixCalendrier());
  await page.click('.resume-next-visit button');
  await page.waitForTimeout(400);
  let fichier = null;
  try{
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 6000 }),
      page.evaluate(() => rappelVersFichier())
    ]);
    const chemin = await dl.path();
    fichier = { nom: dl.suggestedFilename(), contenu: chemin ? fs.readFileSync(chemin, 'utf-8') : '' };
  }catch(e){}
  rapport.verifier('le téléchargement fonctionne toujours', !!fichier, fichier?.nom);
  rapport.verifier("l'alarme sonne 12 h avant, agenda fermé",
    /TRIGGER:-PT12H/.test(fichier?.contenu || ''));
  rapport.verifier("l'événement porte le nom de la ruche",
    /SUMMARY:.*Lavande/.test(fichier?.contenu || ''));
  const msg = await page.evaluate(() => document.getElementById('toast')?.innerText || '');
  rapport.verifier('le message dit où trouver le fichier', /ouvre-le/i.test(msg), msg);

  rapport.section("L'invite de départ ne promet plus ce qu'elle ne fait pas");
  const invite = await page.evaluate(() => {
    const el = document.getElementById('calendarOnboarding');
    return { texte: el?.innerText || '' };
  });
  rapport.verifier("elle dit qu'accepter ne remplit pas l'agenda",
    /ne remplit pas ton agenda/i.test(invite.texte));
  rapport.verifier("elle explique l'alerte 12 h avant", /12 h avant/i.test(invite.texte));

  rapport.section('Le panneau se ferme comme les autres surcouches');
  await page.click('.resume-next-visit button');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  rapport.verifier('Échap le referme',
    await page.evaluate(() => !document.getElementById('choixCalendrier').classList.contains('open')));

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
  await ctx.close();
});
