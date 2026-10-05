# Modèle Vosk français — placement

Le compagnon reconnaît une **grammaire fermée** (peu de commandes + noms de
ruches), hors ligne. Il lui faut le petit modèle français de Vosk.

## Modèle recommandé

- **`vosk-model-small-fr-0.22`** — ~41 Mo décompressé.
- Licence : **Apache 2.0** (compatible distribution commerciale).
- Source : site Alpha Cephei (page « Models » de Vosk).

Le petit modèle suffit largement : on ne fait pas de dictée, seulement de la
détection de commandes dans une liste connue. Il est plus léger et plus rapide
que le grand modèle (1,8 Go), et c'est ce qu'on veut pour la batterie.

## Où le placer

1. Télécharger et décompresser le modèle.
2. Le copier dans les assets de l'app, à un emplacement que le plugin Vosk
   lit. Avec les plugins Capacitor-Vosk courants, on place le dossier sous :

   ```
   android/app/src/main/assets/models/vosk-model-small-fr
   ```

   (le chemin exact dépend du plugin retenu — voir son README ; c'est celui
   passé à `loadModel({ path: "models/vosk-model-small-fr" })` dans
   `platform/adapters.js`).

3. Le modèle est **embarqué dans l'APK** : aucune connexion n'est nécessaire
   au rucher. L'APK pèsera ~45–50 Mo de plus — acceptable pour un prototype.

## Pourquoi pas le téléchargement à la première ouverture ?

Pour garantir le fonctionnement **hors ligne dès la première tournée** : un
modèle téléchargé à la demande échouerait en mode avion. On l'embarque donc.
