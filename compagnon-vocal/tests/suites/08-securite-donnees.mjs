import { executerSuite } from "../harness.mjs";
import { chargerRuches, resoudreRuche } from "../../src/hives.js";
import { noteValide, Statut } from "../../src/notes.js";
import { lirePaquet } from "../../src/echange.js";

export default () => executerSuite("Validation & sécurité des données", async ({ rapport }) => {

  rapport.section("Import de la liste de ruches : on rejette le douteux (§10)");
  rapport.verifier("un non-tableau est refusé", (() => {
    try{ chargerRuches({ pas:"un tableau" }); return false; }catch{ return true; }
  })());
  const ruches = chargerRuches([
    { code:"RUCHE-012", nom:"Ruche 12", rucher:"Prairie" },
    { nom:"Sans code" },                       // ignorée : pas de code
    { code:"  BLEUE  ", nom:"  Ruche Bleue  " }, // nettoyée (trim)
    { code:"RUCHE-012", nom:"Doublon" },        // dédoublonnée
    null, 42, "texte"                           // ignorés
  ]);
  rapport.verifier("les entrées invalides sont écartées", ruches.length === 2, String(ruches.length));
  rapport.verifier("les champs sont nettoyés (trim)", ruches.find(r => r.code === "BLEUE")?.nom === "Ruche Bleue");
  rapport.verifier("pas de doublon de code", ruches.filter(r => r.code === "RUCHE-012").length === 1);

  rapport.section("Les champs trop longs sont bornés");
  const long = chargerRuches([{ code:"X".repeat(500), nom:"Y".repeat(500) }]);
  rapport.verifier("code borné à 64", long[0].code.length === 64);
  rapport.verifier("nom borné à 120", long[0].nom.length === 120);

  rapport.section("Pas d'injection : un faux nom ne devient pas une autre ruche");
  rapport.verifier("texte avec caractères spéciaux → null sans planter",
    resoudreRuche("<script>ruche</script>", ruches) === null);

  rapport.section("Validation d'une note");
  const bonne = { note_id:"n1", session_id:"s1", ruche_id:"RUCHE-012", ruche_nom:"Ruche 12",
                  debut:"2026-10-04T15:00:00Z", audio_ref:"notes/n1.m4a", duree_s:10, statut:Statut.A_TRAITER };
  rapport.verifier("une note complète est valide", noteValide(bonne));
  rapport.verifier("une note sans audio_ref est invalide", !noteValide({ ...bonne, audio_ref:"" }));
  rapport.verifier("une durée négative est invalide", !noteValide({ ...bonne, duree_s:-1 }));
  rapport.verifier("un statut inconnu est invalide", !noteValide({ ...bonne, statut:"bizarre" }));

  rapport.section("Lecture d'un paquet d'échange : strict sur la version/forme");
  rapport.verifier("format inconnu refusé", (() => { try{ lirePaquet({ format:"autre" }); return false; }catch{ return true; } })());
  rapport.verifier("version future refusée", (() => {
    try{ lirePaquet({ format:"mes-abeilles-vocal", version:999, notes:[] }); return false; }catch{ return true; }
  })());
  rapport.verifier("paquet sans notes refusé", (() => {
    try{ lirePaquet({ format:"mes-abeilles-vocal", version:1 }); return false; }catch{ return true; }
  })());
  rapport.verifier("paquet valide accepté", lirePaquet({ format:"mes-abeilles-vocal", version:1, notes:[{ note_id:"a" }] }).length === 1);
});
