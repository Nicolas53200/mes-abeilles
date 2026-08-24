/* Harnais partagé des tests Mes Abeilles.
   Chaque suite reçoit une COPIE neuve de l'application, servie en HTTP
   local. C'est indispensable : deux suites réécrivent index.html pour
   simuler la publication d'une nouvelle version, et sans isolation elles
   se contaminaient l'une l'autre. */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FICHIERS_APP = ['index.html', 'sw.js', 'manifest.json', 'icon192.png', 'icon512.png'];

/* Chromium : Playwright ne télécharge rien ici, on cherche un binaire
   déjà présent. CHROMIUM_PATH permet de forcer un chemin. */
export function trouverChromium(){
  const candidats = [
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      && path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium', 'chrome-linux', 'chrome'),
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);

  for(const c of candidats) if(fs.existsSync(c)) return c;

  // Chemins versionnés : /opt/pw-browsers/chromium-1194/chrome-linux/chrome
  for(const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)){
    if(!fs.existsSync(base)) continue;
    for(const d of fs.readdirSync(base).filter(x => x.startsWith('chromium'))){
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if(fs.existsSync(p)) return p;
    }
  }
  throw new Error(
    "Chromium introuvable. Renseigne CHROMIUM_PATH, ou installe-le :\n" +
    "  npx playwright install chromium");
}

/* Copie l'app dans un dossier temporaire jetable. */
export function creerCopieApp(){
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mes-abeilles-test-'));
  for(const f of FICHIERS_APP){
    const src = path.join(RACINE, f);
    if(fs.existsSync(src)) fs.copyFileSync(src, path.join(dossier, f));
  }
  return dossier;
}

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png' };

/* Sert la copie. Une origine http:// stable est nécessaire :
   le localStorage doit survivre aux rechargements. */
export async function servir(dossier){
  const serveur = http.createServer((req, res) => {
    const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
    const fichier = path.join(dossier, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(fichier, (err, data) => {
      if(err){ res.writeHead(404); return res.end('introuvable'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(r => serveur.listen(0, r));
  return { serveur, origine: `http://localhost:${serveur.address().port}` };
}

/* Les CDN sont injoignables dans un environnement de test isolé.
   On sert des doublures minimales : les tests portent sur l'application,
   pas sur Leaflet ni jsQR. */
export async function doublerCdn(page){
  const doublures = [
    [/leaflet.*\.js($|\?)/, 'text/javascript',
     'window.L={map:()=>({setView(){return this},remove(){},invalidateSize(){},fitBounds(){},on(){return this}}),' +
     'tileLayer:()=>({addTo(){return this}}),marker:()=>({addTo(){return this},bindPopup(){return this},' +
     'getLatLng:()=>({lat:0,lng:0})}),divIcon:()=>({}),featureGroup:()=>({getBounds:()=>({}),addTo(){return this}}),' +
     'latLngBounds:()=>({})};'],
    [/leaflet.*\.css($|\?)/, 'text/css', ''],
    [/qrcode.*\.js($|\?)/, 'text/javascript', 'window.QRCode={toCanvas:(c,v,o,cb)=>{ if(typeof o==="function") o(null); else if(cb) cb(null); }};'],
    [/jsqr.*\.js($|\?)/i, 'text/javascript', 'window.jsQR=function(){return null;};']
  ];
  await page.route(url => /unpkg\.com|jsdelivr\.net/.test(url.href), route => {
    const href = route.request().url();
    for(const [motif, type, corps] of doublures){
      if(motif.test(href)) return route.fulfill({ contentType: type, body: corps });
    }
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
}

/* Données de départ écrites avant le premier script de la page. */
export async function amorcer(page, donnees){
  await page.addInitScript(d => {
    try{ localStorage.setItem('mesAbeilles_data_v1', JSON.stringify(d)); }catch(e){}
  }, donnees);
}

export const RUCHER_TYPE = {
  hives: [
    { code:'RUCHE-001', name:'Lavande', apiary:'Prairie Haute', type:'ruche', honey:23, alerts:0 },
    { code:'RUCHE-002', name:'Tilleul', apiary:'Prairie Haute', type:'ruchette', honey:0, alerts:0 }
  ],
  profil: { type:'amateur' },
  apiaries: [{ name:'Prairie Haute' }],
  onboardingDone: true, hiveTourDone: true, calendarPromptDone: true
};

/* Petit collecteur de résultats, sans dépendance externe. */
export function creerRapport(){
  const lignes = [];
  return {
    verifier(libelle, ok, detail){
      lignes.push({ libelle, ok: !!ok, detail });
      console.log(`  ${ok ? '✅' : '❌'} ${libelle}${detail ? '  → ' + detail : ''}`);
    },
    section(titre){ console.log(`\n  ${titre}`); },
    bilan(){
      const echecs = lignes.filter(l => !l.ok);
      console.log(`\n  ${'─'.repeat(58)}`);
      console.log(echecs.length === 0
        ? `  ✅ ${lignes.length} contrôles passés.\n`
        : `  ❌ ${echecs.length} échec(s) sur ${lignes.length}.\n`);
      return echecs.length;
    }
  };
}

/* Enveloppe commune : copie neuve, serveur, navigateur, nettoyage garanti. */
export async function executerSuite(nom, corps){
  const { chromium } = await import('playwright-core');
  const dossier = creerCopieApp();
  const { serveur, origine } = await servir(dossier);
  const navigateur = await chromium.launch({ executablePath: trouverChromium() });
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e).split('\n')[0]));
  await doublerCdn(page);

  const rapport = creerRapport();
  console.log(`\n━━ ${nom} ━━`);
  let echecs = 1;
  try{
    await corps({ page, contexte, navigateur, origine, dossier, rapport, erreurs });
    echecs = rapport.bilan();
  } finally {
    await navigateur.close().catch(() => {});
    serveur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  return echecs;
}

/* Réécrit index.html dans la copie, pour simuler la publication
   d'une nouvelle version de l'application. */
export function publierVersion(dossier, version, migration){
  const PLACEHOLDER = '  // Aucune migration nécessaire à ce jour.';
  let html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf-8');
  // Motif générique : ne pas coupler le harnais au numéro de version courant.
  // Avec une valeur en dur, un bump d'APP_VERSION faisait échouer ce
  // remplacement en silence, et les suites testaient la mauvaise version.
  const motif = /const APP_VERSION = "[^"]+";/;
  // On vérifie la PRÉSENCE du motif, pas que le texte change : publier la
  // version déjà en place est légitime et ne modifie rien.
  if(!motif.test(html)) throw new Error("publierVersion : APP_VERSION introuvable dans index.html");
  html = html.replace(motif, `const APP_VERSION = "${version}";`);
  if(migration) html = html.replace(PLACEHOLDER, migration);
  fs.writeFileSync(path.join(dossier, 'index.html'), html);
}
