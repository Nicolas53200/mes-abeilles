# Tests de Mes Abeilles

Ces suites pilotent l'application dans un vrai navigateur : elles cliquent,
tapent au clavier, rechargent la page et vérifient ce qui s'affiche
réellement. Rien n'est simulé côté logique métier.

## Lancer

```bash
npm install          # une seule fois
npm test             # toutes les suites
node tests/run.mjs securite   # seulement les suites dont le nom correspond
```

Il faut un Chromium. Si aucun n'est trouvé :

```bash
npx playwright install chromium
# ou, si tu en as déjà un :
CHROMIUM_PATH=/usr/bin/chromium npm test
```

Rien n'est installé dans le dépôt : `playwright-core` ne télécharge aucun
navigateur, il pilote celui que tu as déjà.

## Les suites

| Fichier | Ce qui est vérifié |
|---|---|
| `01-securite-xss` | Aucune donnée saisie ne peut exécuter de code, sur les 21 vues |
| `02-libelles-sections` | Le bouton retour nomme la section ; le toast reste au singulier |
| `03-performance` | Librairies différées disponibles, scan bridé, météo parallèle |
| `04-accessibilite` | Tab, Entrée, Espace, Échap, intitulés ARIA, focus visible |
| `05-migrations-donnees` | Le crochet de migration convertit, n'écrase rien, ne rejoue pas |
| `06-mise-a-jour` | Les données de l'utilisateur survivent à une nouvelle version |

## Pourquoi ces tests existent

Ils ont intercepté de vrais bugs avant publication :

- un `ReferenceError` au démarrage qui **vidait l'écran sans charger les
  données**, alors qu'elles étaient bien en localStorage (zone morte
  temporelle sur un `const` déclaré après son utilisation) ;
- un échappement `onclick` inefficace : `escapeHtml()` transforme `'` en
  `&#39;`, que le parseur HTML **redécode avant** l'évaluation du JS — la
  faille restait ouverte ;
- une migration écrivant une propriété nommée sur un tableau :
  `JSON.stringify` ignore ces propriétés, la valeur disparaissait à la
  sauvegarde **sans lever d'erreur**.

## Écrire une suite

Le harnais (`lib/harness.mjs`) fournit la copie de l'app, le serveur, le
navigateur, les doublures de CDN et le collecteur de résultats :

```js
import { executerSuite, amorcer, RUCHER_TYPE } from '../lib/harness.mjs';

export default () => executerSuite('Mon sujet', async ({ page, origine, rapport }) => {
  await amorcer(page, RUCHER_TYPE);
  await page.goto(origine);
  await page.waitForTimeout(1000);

  rapport.section('Ce que je vérifie');
  rapport.verifier('libellé du contrôle', condition === attendue, 'détail affiché');
});
```

Retourne le nombre d'échecs ; le lanceur s'occupe du reste.

## Deux pièges déjà rencontrés

**Isolation.** Chaque suite reçoit sa propre copie de l'application. Deux
d'entre elles réécrivent `index.html` pour simuler une publication : sans
copie séparée, elles se contaminaient et faisaient échouer la suivante.

**Transitions CSS.** Attends la fin d'une animation avant de mesurer une
position. Le test du lien d'évitement échouait parce qu'il mesurait pendant
la transition de 0,16 s.
