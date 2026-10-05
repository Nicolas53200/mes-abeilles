#!/usr/bin/env node
/* Lance les suites de test du compagnon vocal.
   Isolé de Mes Abeilles : n'exécute que compagnon-vocal/tests/suites. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const filtre = process.argv[2];

const suites = fs.readdirSync(path.join(ICI, "suites"))
  .filter(f => f.endsWith(".mjs"))
  .filter(f => !filtre || f.includes(filtre))
  .sort();

console.log(`\n  Mes Abeilles Vocal — ${suites.length} suite(s)\n  ${"═".repeat(56)}`);

let total = 0; const echoues = [];
for(const fichier of suites){
  const mod = await import(path.join(ICI, "suites", fichier));
  let echecs;
  try{ echecs = await mod.default(); }
  catch(e){ console.error(`\n  ❌ ${fichier} : ${e.message}`); echecs = 1; }
  total += echecs;
  if(echecs > 0) echoues.push(fichier);
}

console.log(`  ${"═".repeat(56)}`);
console.log(total === 0 ? `  ✅ Toutes les suites passent.\n` : `  ❌ ${total} contrôle(s) en échec dans : ${echoues.join(", ")}\n`);
process.exit(total === 0 ? 0 : 1);
