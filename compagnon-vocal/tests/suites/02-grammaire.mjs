import { executerSuite } from "../harness.mjs";
import { RUCHES_TEST } from "../outils.mjs";
import { analyser, Intention, construireGrammaire, WAKE } from "../../src/grammar.js";
import { resoudreRuche } from "../../src/hives.js";
import { motsNombre, normaliser } from "../../src/texte.js";

export default () => executerSuite("Grammaire & reconnaissance", async ({ rapport }) => {

  rapport.section("Nombres en lettres → chiffres");
  rapport.verifier("« douze » → 12", motsNombre("ruche douze") === "ruche 12", motsNombre("ruche douze"));
  rapport.verifier("« vingt deux » → 22", motsNombre("ruche vingt deux") === "ruche 22", motsNombre("ruche vingt deux"));
  rapport.verifier("« trente et un » → 31", motsNombre("ruche trente et un") === "ruche 31", motsNombre("ruche trente et un"));

  rapport.section("Résolution d'une ruche (toujours vers un code)");
  rapport.verifier("« ruche 12 » → RUCHE-012", resoudreRuche("ruche 12", RUCHES_TEST)?.code === "RUCHE-012");
  rapport.verifier("« ruche douze » → RUCHE-012", resoudreRuche("ruche douze", RUCHES_TEST)?.code === "RUCHE-012");
  rapport.verifier("« ruche du chêne » → CGM-01", resoudreRuche("Ruche du Chêne", RUCHES_TEST)?.code === "CGM-01");
  rapport.verifier("« la ruche du chêne » (phrase) → CGM-01", resoudreRuche("la ruche du chêne", RUCHES_TEST)?.code === "CGM-01");
  rapport.verifier("texte inconnu → null", resoudreRuche("ruche violette", RUCHES_TEST) === null);

  rapport.section("Analyse des commandes");
  rapport.verifier("« mes abeilles » seul → WAKE", analyser("Mes Abeilles", RUCHES_TEST).intention === Intention.WAKE);
  rapport.verifier("« terminer cette ruche » → END_HIVE (sans wake)", (() => {
    const a = analyser("terminer cette ruche", RUCHES_TEST); return a.intention === Intention.END_HIVE && a.wake === false;
  })());
  rapport.verifier("« mes abeilles, pause » → PAUSE + wake", (() => {
    const a = analyser("mes abeilles pause", RUCHES_TEST); return a.intention === Intention.PAUSE && a.wake === true;
  })());
  rapport.verifier("« mes abeilles, terminer la tournée » → END_TOUR + wake", (() => {
    const a = analyser("mes abeilles terminer la tournee", RUCHES_TEST); return a.intention === Intention.END_TOUR && a.wake;
  })());
  rapport.verifier("« ruche 13 » → START_HIVE avec la bonne ruche",(() => {
    const a = analyser("ruche 13", RUCHES_TEST); return a.intention === Intention.START_HIVE && a.ruche.code === "RUCHE-013";
  })());
  rapport.verifier("« mauvaise ruche » → CANCEL", analyser("mauvaise ruche", RUCHES_TEST).intention === Intention.CANCEL);
  rapport.verifier("« oui » / « non »", analyser("oui", RUCHES_TEST).intention === Intention.YES && analyser("non", RUCHES_TEST).intention === Intention.NO);
  rapport.verifier("bruit non reconnu → INCONNU", analyser("il fait beau aujourd'hui", RUCHES_TEST).intention === Intention.INCONNU);

  rapport.section("Grammaire fournie au moteur vocal");
  const g = construireGrammaire(RUCHES_TEST);
  rapport.verifier("contient le wake-word", g.includes(WAKE));
  rapport.verifier("contient les commandes fixes", g.includes("terminer cette ruche") && g.includes("pause"));
  rapport.verifier("contient les variantes préfixées du wake-word", g.includes("mes abeilles terminer la tournee"));
  rapport.verifier("contient les noms de ruches", g.includes("Ruche du Chêne") && g.includes("ruche RUCHE-012".replace("RUCHE-0","")) || g.some(x => normaliser(x) === "ruche 12"));
  rapport.verifier("pas de doublon", g.length === new Set(g).size);
});
