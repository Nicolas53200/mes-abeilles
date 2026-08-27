/* Petits écrans, iPhone en tête.

   LE BUG : sur l'écran d'accueil, le bouton « Découvrir l'application »
   tombait sous le bas de l'écran de tout iPhone en dessous du 14 Pro Max.
   L'accueil est en position:fixed et ne défilait pas : l'apiculteur
   voyait la page de bienvenue et ne pouvait jamais entrer dans
   l'application. Sur Android (412×915) le bouton tenait de justesse,
   d'où un « ça ne marche que sur iPhone » difficile à comprendre.

   Cette suite mesure de vrais gabarits d'écran, barre Safari comprise
   (elle mange une centaine de pixels de hauteur utile), et vérifie
   qu'aucun bouton ne se retrouve hors d'atteinte. */

import { executerSuite, amorcer, RUCHER_TYPE, RACINE } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

/* Hauteurs utiles réelles : un iPhone SE affiche 667px sans la barre
   d'adresse, environ 560 avec. */
const GABARITS = [
  ['iPhone SE',                375, 667],
  ['iPhone SE + barre Safari', 375, 560],
  ['iPhone 12 mini',           360, 780],
  ['iPhone 13',                390, 844],
  ['iPhone 13 + barre Safari', 390, 750],
  ['iPhone 14 Pro Max',        430, 932],
  ['Android courant',          412, 915]
];

const SECTIONS = ["resume","visites","reine","materiel","traitements","frelons","nourrissement",
                  "hausses","miel","divisions","transhumance","pesees","photos","documents",
                  "conformite","qrcode","actions"];

/* Un élément est « piégé » s'il dépasse par le BAS de l'écran alors
   qu'aucun ancêtre défilant ne permet d'aller le chercher.
   Ce qui est entièrement AU-DESSUS de l'écran est ignoré : c'est le
   rangement volontaire des panneaux escamotés (le bandeau de mise à
   jour attend en translateY(-130%)), pas un bouton hors d'atteinte. */
const AUDIT = () => {
  const piegees = [];
  const atteignable = el => {
    for(let p = el.parentElement; p; p = p.parentElement){
      const st = getComputedStyle(p);
      if(/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 2) return true;
      if(st.position === 'fixed') return false;   // conteneur fixe qui ne défile pas
    }
    const de = document.scrollingElement;
    return de.scrollHeight > de.clientHeight + 2;
  };
  document.querySelectorAll('button,a[href],input,select,textarea,[onclick]').forEach(el => {
    const r = el.getBoundingClientRect();
    if(r.width === 0 || r.height === 0) return;
    const st = getComputedStyle(el);
    if(st.visibility === 'hidden' || st.display === 'none') return;
    const range = r.bottom <= 0 || r.top >= window.innerHeight ||
                  r.right <= 0 || r.left >= window.innerWidth;
    if(range) return;
    if((r.bottom > window.innerHeight + 1 || r.top < -1) && !atteignable(el)){
      piegees.push((el.id || el.className || el.tagName) + ' · ' +
                   (el.innerText || '').slice(0, 30).replace(/\n/g, ' '));
    }
  });
  return piegees;
};

export default () => executerSuite('Petits écrans (iPhone)', async ({ navigateur, origine, rapport, erreurs }) => {

  rapport.section("LE BUG : entrer dans l'application depuis l'écran d'accueil");
  for(const [nom, w, h] of GABARITS){
    const ctx = await navigateur.newContext({ viewport:{width:w,height:h}, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
    await page.goto(origine);
    await page.waitForTimeout(900);

    const m = await page.evaluate(() => {
      const b = document.getElementById('splashDiscoverBtn').getBoundingClientRect();
      return { haut: Math.round(b.top), bas: Math.round(b.bottom), vue: window.innerHeight };
    });
    rapport.verifier(`bouton visible — ${nom}`,
      m.bas <= m.vue + 1 && m.haut >= -1,
      `${m.haut}→${m.bas}px sur ${m.vue}px`);

    // Il ne suffit pas qu'il soit visible : il doit répondre au doigt.
    let entre = false;
    try{
      await page.click('#splashDiscoverBtn', { timeout: 2500 });
      await page.waitForTimeout(700);
      entre = await page.evaluate(() =>
        getComputedStyle(document.getElementById('splash')).display === 'none');
    }catch(e){}
    rapport.verifier(`l'appui fait entrer dans l'application — ${nom}`, entre);

    // Le haut de l'accueil ne doit pas être coupé hors d'atteinte.
    await ctx.close();
  }

  rapport.section("Le logo de bienvenue reste visible, jamais rogné vers le haut");
  for(const [nom, w, h] of [GABARITS[1], GABARITS[4]]){
    const ctx = await navigateur.newContext({ viewport:{width:w,height:h}, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    await page.goto(origine);
    await page.waitForTimeout(800);
    const haut = await page.evaluate(() =>
      Math.round(document.querySelector('.splash-glow').getBoundingClientRect().top));
    rapport.verifier(`haut de l'accueil accessible — ${nom}`, haut >= -1, haut + 'px');
    await ctx.close();
  }

  rapport.section("Aucun bouton hors d'atteinte dans le reste de l'application");
  for(const [nom, w, h] of [GABARITS[1], GABARITS[4]]){
    const ctx = await navigateur.newContext({ viewport:{width:w,height:h}, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
    await amorcer(page, { ...RUCHER_TYPE, derniereVersionVue: 'v0-tests' });
    await page.route(u => /unpkg\.com|jsdelivr\.net/.test(u.href), r => r.fulfill({
      contentType: 'text/javascript',
      body: 'window.L={};window.jsQR=()=>null;window.QRCode={toCanvas:(c,v,o,cb)=>{const f=typeof o==="function"?o:cb;if(f)f(null);}};' }));
    await page.goto(origine);
    await page.waitForTimeout(1200);

    let piegees = [];
    for(const p of ['home','ruchers','alerts','admin']){
      await page.evaluate(n => showPage(n), p);
      await page.waitForTimeout(160);
      piegees = piegees.concat(await page.evaluate(AUDIT));
    }
    await page.evaluate(() => openHive('RUCHE-001'));
    await page.waitForTimeout(250);
    for(const sec of SECTIONS){
      await page.evaluate(s => setHiveSection(s), sec);
      await page.waitForTimeout(130);
      piegees = piegees.concat(await page.evaluate(AUDIT));
    }
    await page.evaluate(() => ouvrirNouveautes(true));
    await page.waitForTimeout(400);
    piegees = piegees.concat(await page.evaluate(AUDIT));

    rapport.verifier(`toutes les vues restent utilisables — ${nom}`,
      piegees.length === 0, piegees.slice(0, 3).join(' | ') || 'aucun');
    await ctx.close();
  }

  rapport.section("Rien ne vient s'écrire par-dessus l'écran de bienvenue");
  {
    const ctxT = await navigateur.newContext({ viewport:{width:375,height:560}, isMobile:true });
    const pageT = await ctxT.newPage();
    await pageT.goto(origine);
    await pageT.waitForTimeout(1400);
    const t = await pageT.evaluate(() => {
      const el = document.getElementById('toast');
      return { visible: !!el && el.classList.contains('show'), texte: (el?.innerText || '').slice(0, 40) };
    });
    rapport.verifier('aucun message fugace sur la bienvenue', !t.visible, t.texte || 'aucun');
    // Une fois entré, les messages doivent de nouveau fonctionner.
    await pageT.click('#splashDiscoverBtn').catch(() => {});
    await pageT.waitForTimeout(700);
    const apres = await pageT.evaluate(() => {
      showToast('essai');
      return document.getElementById('toast').classList.contains('show');
    });
    rapport.verifier("les messages refonctionnent une fois dans l'application", apres);
    await ctxT.close();
  }

  rapport.section("Règles CSS que Safari exige");
  // Chromium n'expose pas la propriété préfixée : on contrôle la source,
  // seul endroit où l'absence du préfixe se voit de façon fiable.
  const css = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf-8');
  rapport.verifier('-webkit-backdrop-filter accompagne backdrop-filter',
    (css.match(/-webkit-backdrop-filter/g) || []).length >=
    (css.match(/(?<!-webkit-)backdrop-filter/g) || []).length);
  rapport.verifier("l'accueil peut défiler s'il ne tient pas",
    /\.splash\{[^}]*overflow-y:\s*auto/s.test(css));
  rapport.verifier("le bouton d'entrée reste collé en bas",
    /\.splash-btn\{[^}]*position:\s*sticky/s.test(css));

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2).join(' | '));
});
