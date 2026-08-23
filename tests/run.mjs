#!/usr/bin/env node
/* Lance les suites de test de Mes Abeilles.
     node tests/run.mjs              toutes les suites
     node tests/run.mjs securite     seulement celles dont le nom correspond

   Chaque suite travaille sur sa propre copie de l'application : deux
   d'entre elles réécrivent index.html pour simuler une publication. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const filtre = process.argv[2];

try{
  await import('playwright-core');
}catch(e){
  console.error("\n  playwright-core est absent. Installe-le :\n    npm install\n");
  process.exit(1);
}

const suites = fs.readdirSync(path.join(ICI, 'suites'))
  .filter(f => f.endsWith('.mjs'))
  .filter(f => !filtre || f.includes(filtre))
  .sort();

if(!suites.length){
  console.error(`  Aucune suite ne correspond à « ${filtre} ».`);
  process.exit(1);
}

console.log(`\n  Mes Abeilles — ${suites.length} suite(s)\n  ${'═'.repeat(58)}`);

let total = 0;
const echoues = [];
const t0 = Date.now();

for(const fichier of suites){
  const module = await import(path.join(ICI, 'suites', fichier));
  let echecs;
  try{
    echecs = await module.default();
  }catch(e){
    console.error(`\n  ❌ ${fichier} a levé une exception : ${e.message}`);
    echecs = 1;
  }
  total += echecs;
  if(echecs > 0) echoues.push(fichier);
}

const duree = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`  ${'═'.repeat(58)}`);
if(total === 0){
  console.log(`  ✅ Toutes les suites passent. (${duree} s)\n`);
}else{
  console.log(`  ❌ ${total} contrôle(s) en échec dans : ${echoues.join(', ')}  (${duree} s)\n`);
}
process.exit(total === 0 ? 0 : 1);
