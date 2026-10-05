/* Petit harnais de test, sans dépendance. Même esprit que celui de Mes
   Abeilles (rapport.verifier / rapport.section), mais purement Node : la
   logique du compagnon ne nécessite pas de navigateur. */

export function creerRapport(){
  const lignes = [];
  return {
    verifier(libelle, ok, detail){
      lignes.push({ libelle, ok: !!ok, detail });
      console.log(`  ${ok ? "✅" : "❌"} ${libelle}${detail != null && detail !== "" ? "  → " + detail : ""}`);
    },
    section(titre){ console.log(`\n  ${titre}`); },
    bilan(){
      const echecs = lignes.filter(l => !l.ok).length;
      console.log(`\n  ${"─".repeat(56)}`);
      console.log(echecs === 0 ? `  ✅ ${lignes.length} contrôles passés.` : `  ❌ ${echecs} échec(s) sur ${lignes.length}.`);
      return echecs;
    }
  };
}

export async function executerSuite(nom, corps){
  console.log(`\n━━ ${nom} ━━`);
  const rapport = creerRapport();
  try{
    await corps({ rapport });
  }catch(e){
    rapport.verifier("la suite s'exécute sans exception", false, String(e && e.stack || e).split("\n").slice(0,3).join(" | "));
  }
  return rapport.bilan();
}
