# Licences des composants — Mes Abeilles Vocal

Toutes les dépendances du prototype sont **libres** et **compatibles avec une
distribution commerciale** de Mes Abeilles. Aucune n'est payante, aucune
n'impose d'abonnement, aucune n'envoie de données vers un service tiers.

| Composant | Rôle | Licence | Coût | Hors ligne |
|---|---|---|---|---|
| Capacitor (`@capacitor/core`, `/android`, `/cli`) | Habillage natif | **MIT** | Gratuit | — |
| `@capacitor/filesystem` | Stockage privé de l'audio | **MIT** | Gratuit | ✅ |
| `@capacitor/preferences` | Métadonnées des notes | **MIT** | Gratuit | ✅ |
| `@capacitor-community/text-to-speech` | Confirmations vocales | **MIT** | Gratuit | ✅ si voix FR installée |
| `capacitor-voice-recorder` | Enregistrement audio | **MIT** | Gratuit | ✅ |
| Plugin Capacitor-Vosk | Wake-word + commandes | **MIT** (plugin) | Gratuit | ✅ |
| Modèle `vosk-model-small-fr` | Reconnaissance FR locale | **Apache 2.0** | Gratuit | ✅ (embarqué) |

## Points de vigilance à confirmer avant intégration définitive (§2 de la demande)

- **Plugin Vosk** : plusieurs plugins Capacitor existent (projets
  communautaires). Avant de figer, vérifier sur le dépôt retenu : licence MIT
  effective, compatibilité Capacitor 6, maintenance récente. Si aucun ne
  convient, une fine couche native maison au-dessus de `vosk-android`
  (Apache 2.0) reste possible — toujours libre.
- **Versions verrouillées** : voir `package.json` (versions exactes épinglées).
- **Aucune dépendance publicitaire / analytics / tracker** n'est incluse.
- **Picovoice Porcupine a été écarté** : son offre gratuite est plafonnée
  (≤ 3 utilisateurs) et le produit est propriétaire — incompatible avec une
  distribution commerciale libre. Vosk le remplace sans contrainte.

> Les versions exactes des plugins communautaires devront être confirmées au
> moment du `npm install` sur votre PC (l'environnement de préparation ne
> compile pas d'APK). Les licences ci-dessus sont celles annoncées par les
> projets ; à revérifier à l'installation, comme demandé.
