/* Manifest PWA et raccourcis d'application.
   Un raccourci déclaré doit RÉELLEMENT ouvrir la page annoncée : sans
   routage au démarrage, les trois ouvraient l'accueil. */

import { executerSuite, amorcer, RUCHER_TYPE, RACINE } from '../lib/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

export default () => executerSuite('Manifest et raccourcis', async ({ page, origine, rapport, erreurs }) => {

  rapport.section('Intégrité du déploiement GitHub Pages');
  // Les fichiers dont dépend l'installation de la PWA doivent réellement
  // être publiés. Une directive « exclude » dans _config.yml les retirerait
  // du site — sans erreur, sans bruit.
  rapport.verifier('.nojekyll présent (Jekyll désactivé)',
    fs.existsSync(path.join(RACINE, '.nojekyll')));

  const config = fs.existsSync(path.join(RACINE, '_config.yml'))
    ? fs.readFileSync(path.join(RACINE, '_config.yml'), 'utf-8')
    : '';
  const lignesActives = config.split('\n').filter(l => !l.trim().startsWith('#'));
  rapport.verifier('aucune directive exclude dans _config.yml',
    !lignesActives.some(l => /^\s*exclude\s*:/.test(l)),
    'exclude retirerait des fichiers du site publié');

  for(const fichier of ['sw.js', 'manifest.json', 'index.html', 'icon192.png', 'icon512.png']){
    rapport.verifier(`${fichier} présent et publiable`.padEnd(34),
      fs.existsSync(path.join(RACINE, fichier))
      && !lignesActives.some(l => l.includes(fichier)));
  }

  rapport.section('Manifest');
  const manifest = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest.json'), 'utf-8'));
  for(const champ of ['name','short_name','start_url','scope','display','theme_color','background_color','lang','id']){
    rapport.verifier(`champ ${champ}`.padEnd(24), !!manifest[champ], String(manifest[champ]));
  }
  rapport.verifier('catégories déclarées', Array.isArray(manifest.categories) && manifest.categories.length > 0);

  const any = manifest.icons.filter(i => i.purpose === 'any');
  const maskable = manifest.icons.filter(i => i.purpose === 'maskable');
  rapport.verifier('icônes "any" et "maskable" séparées', any.length >= 2 && maskable.length >= 2,
    `${any.length} any, ${maskable.length} maskable`);

  for(const icone of manifest.icons){
    const chemin = path.join(RACINE, icone.src);
    rapport.verifier(`fichier ${icone.src} présent (${icone.purpose})`.padEnd(44), fs.existsSync(chemin));
  }

  rapport.section('Raccourcis déclarés');
  rapport.verifier('3 raccourcis', manifest.shortcuts?.length === 3, `${manifest.shortcuts?.length}`);
  for(const r of manifest.shortcuts || []){
    rapport.verifier(`« ${r.short_name} » a un nom, une URL et une icône`,
      !!r.name && !!r.url && Array.isArray(r.icons) && r.icons.length > 0);
  }

  rapport.section('Chaque raccourci ouvre RÉELLEMENT sa page');
  await amorcer(page, RUCHER_TYPE);
  for(const r of manifest.shortcuts || []){
    const attendue = new URL(r.url, 'http://x/').searchParams.get('page');
    await page.goto(origine + '/index.html?page=' + attendue);
    await page.waitForTimeout(1100);
    const obtenue = await page.evaluate(() => state.page);
    rapport.verifier(`« ${r.short_name} » → ${attendue}`.padEnd(34), obtenue === attendue, `page ouverte : ${obtenue}`);
  }

  rapport.section('Valeurs hors liste blanche ignorées');
  for(const valeur of ['nimportequoi', '../admin', '<script>', '']){
    await page.goto(origine + '/index.html?page=' + encodeURIComponent(valeur));
    await page.waitForTimeout(1000);
    const obtenue = await page.evaluate(() => state.page);
    rapport.verifier(`« ${valeur || '(vide)'} » → accueil`.padEnd(34), obtenue === 'home', `page : ${obtenue}`);
  }

  rapport.section('Sans paramètre, comportement inchangé');
  await page.goto(origine);
  await page.waitForTimeout(1100);
  rapport.verifier('ouvre l\'accueil', (await page.evaluate(() => state.page)) === 'home');

  rapport.verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs[0] || '');
});
