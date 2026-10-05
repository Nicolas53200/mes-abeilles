# Mes Abeilles Vocal — prototype Android (Phase A)

Compagnon natif léger pour la prise de notes vocales au rucher, **mains
libres**. Isolé de Mes Abeilles : ce dossier peut être supprimé entièrement
sans aucun effet sur l'application principale.

- **Mes Abeilles** (la PWA, à la racine du dépôt) : **non modifiée**, baseline
  27 suites / 799 contrôles verts.
- **Mes Abeilles Vocal** (ce dossier) : logique testée ici, APK à construire
  chez vous.

---

## 1. Lancer les tests de la logique (ici ou sur votre PC)

Aucune dépendance nécessaire, Node seul suffit :

```bash
cd compagnon-vocal
node tests/run.mjs
```

→ 10 suites, 133 contrôles (machine à états, grammaire, rattachement,
pause/reprise, changement de ruche, persistance, récupération, sécurité,
hors-ligne, activation).

---

## 2. Compiler l'APK avec Android Studio

**Pré-requis sur votre PC :** Node.js, Android Studio (avec un SDK Android
récent), et un câble pour votre téléphone.

```bash
cd compagnon-vocal

# a) installer les dépendances (plugins Capacitor)
npm install

# b) créer le projet Android natif (une seule fois)
npx cap add android

# c) copier la logique web + synchroniser les plugins
npm run sync        # = copie src/ et platform/ dans www/, puis « cap sync android »
```

**Puis, manuellement (une fois) :**

1. Intégrer les extraits de `android-glue/AndroidManifest.extraits.xml` dans
   `android/app/src/main/AndroidManifest.xml` (permissions micro + service de
   premier plan « microphone », retrait d'INTERNET).
2. Placer le modèle Vosk français selon `android-glue/modele-vosk.md`
   (dossier `assets/models/vosk-model-small-fr`).

**Ouvrir et construire :**

```bash
npx cap open android      # ouvre Android Studio
```

Dans Android Studio : brancher le téléphone, choisir « Run » (ou
`Build > Build APK(s)` pour obtenir un fichier `.apk`).

> Après chaque modification du code web (`src/`, `platform/`, `www/`), relancer
> `npm run sync` avant de reconstruire.

---

## 3. Installer l'APK sur votre téléphone Android

**Option simple — via le câble (Run) :**
1. Sur le téléphone : Réglages → À propos → taper 7 fois sur « Numéro de
   build » pour activer le mode développeur.
2. Réglages → Options pour développeurs → activer « Débogage USB ».
3. Brancher le téléphone, l'autoriser, puis « Run » dans Android Studio :
   l'app s'installe et se lance.

**Option fichier — APK autonome :**
1. `Build > Build APK(s)` dans Android Studio → récupérer
   `android/app/build/outputs/apk/debug/app-debug.apk`.
2. Copier ce fichier sur le téléphone, l'ouvrir, autoriser « installer des
   applications inconnues » si demandé.

Au premier lancement, l'app demandera l'autorisation **micro** : l'accorder.

---

## 4. Test terrain décisif (hors ligne)

Voir le protocole détaillé dans le compte rendu de Phase A. En résumé :
charger les ruches de test → **activer le mode avion** → démarrer le Mode
Rucher → verrouiller → poche → « Mes Abeilles » / « Ruche 12 » / dicter /
« Terminer cette ruche » → attendre 10 min → ruche suivante → pause / reprise
→ « Mes Abeilles, terminer la tournée ». Vérifier que chaque audio existe et
est rattaché à la bonne ruche.

---

## Structure

```
compagnon-vocal/
  src/          logique pure, testée (machine, grammaire, notes, stockage, récupération, échange)
  platform/     adaptateurs natifs (Capacitor) — non testés ici, tournent dans la WebView
  www/          interface terrain (gros boutons, 4 états)
  tests/        10 suites Node (133 contrôles)
  android-glue/ extraits de manifeste + placement du modèle Vosk
  package.json  dépendances épinglées + scripts
  LICENCES.md   toutes libres (MIT / Apache 2.0)
```
