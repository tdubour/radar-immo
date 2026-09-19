# Radar Immo — application privée

Application web statique d’analyse immobilière, sans compte et sans backend. Toutes les données sont conservées dans le `localStorage` du navigateur utilisé.

## Fonctions incluses

- coût complet d’acquisition ;
- prêt amortissable, assurance et tableau de remboursement interne ;
- location longue durée ;
- location courte durée ;
- achat-revente ;
- estimation pédagogique SCI à l’IS et amortissements ;
- scénarios prudent, central et optimiste ;
- courbes de sensibilité au prix, au taux et au taux d’occupation ;
- projection patrimoniale sur vingt ans ;
- sauvegarde locale et export/import JSON ;
- radar quotidien persistant, dédoublonnage et historique des prix ;
- mode clair/sombre ;
- curseurs avec valeur, unité, minimum, maximum, pas et champ numérique direct.

## Exécution locale

Aucune dépendance n’est nécessaire.

```bash
python -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Déploiement Vercel

1. Créer un dépôt GitHub privé et y pousser le contenu de ce dossier.
2. Dans Vercel, importer le dépôt.
3. Laisser **Framework Preset** sur `Other`.
4. Ne renseigner ni commande de build ni répertoire de sortie.
5. Déployer.

`vercel.json` configure les routes et plusieurs en-têtes de sécurité. Le fichier `index.html` contient également une directive `noindex`.

### Collecte Radar sans service payant

Le workflow GitHub Actions `radar-collect.yml` lance notre collecteur Playwright chaque jour à 05:15 UTC. Il visite uniquement les pages de recherche configurées dans `config/radar-sources.json`, dédoublonne les annonces et écrit :

- `data/listings.json` : base active consommée directement par l’application ;
- `data/history.json` : historique des prix par annonce ;
- `data/status.json` : résultat et erreurs de chaque source.

Les communes, populations et distances sont vérifiées avec l’API publique française `geo.api.gouv.fr`. Aucun Supabase, Apify ou autre service payant n’est nécessaire. Si un portail bloque GitHub Actions, son échec est journalisé sans fabriquer de donnée.

### Préparation de l’extension multi-plateformes

Le registre public `config/extension-sources.json` décrit les portails, leurs liens de départ, leur priorité et la méthode de collecte prévue. Il est également disponible via `GET /api/extension-config` afin que l’extension puisse recevoir les mises à jour sans nouvelle publication dans le Chrome Web Store.

L’extension enverra des lots de 1 à 100 annonces vers `POST /api/extension-ingest`. Le serveur supprime les champs non autorisés, normalise les nombres, contrôle les URL, calcule une empreinte stable et refuse les lots incomplets. Aucun numéro de téléphone, e-mail, cookie ou donnée de session n’est accepté dans le contrat.

La première version de l’extension se trouve dans `extension/`. Elle prend en charge Leboncoin, SeLoger, Bien’ici, PAP et Logic-Immo. Son modèle `appId` / `workspaceId` / `searchId` permet à une seule installation de servir plusieurs applications et plusieurs recherches indépendantes. Une recherche peut également alimenter plusieurs applications après une seule lecture de la page.

Depuis la version 1.2.1, Radar Immo est une destination locale intégrée : l’extension précharge cinq portails et vingt-deux recherches géographiques, conserve les annonces dans `chrome.storage.local` et les expose uniquement à `radar-immo-blond.vercel.app` dans le même profil Chrome. Leboncoin utilise un rayon natif de 100 km. SeLoger, Bien’ici et Logic-Immo ratissent les départements traversés par la zone ; le radar conserve toutes les communes jusqu’à 100 km, puis seulement les villes d’au moins 10 000 habitants jusqu’à 150 km. Ce mode fonctionne sans secret Vercel/GitHub et coexiste avec BerryPilot LBC Safe sans mélanger leurs données.

```bash
npm run build:extension
npm run check:extension
```

L’ingestion distante destinée à d’autres applications restera inactive tant que les variables suivantes ne seront pas configurées :

- `EXTENSION_INGEST_TOKEN` : secret partagé avec l’extension ;
- `EXTENSION_INGEST_TOKENS` : variante JSON par application, par exemple `{\"radar-immo\":\"…\",\"berrypilot\":\"…\"}` ;
- `EXTENSION_ALLOWED_ORIGINS` : identifiant(s) `chrome-extension://…` autorisé(s) ;
- `RADAR_GITHUB_TOKEN` : jeton GitHub limité au dépôt de données ;
- `RADAR_DATA_REPOSITORY` : dépôt cible, idéalement privé et distinct du code ;
- `RADAR_DATA_REPOSITORIES` : variante JSON permettant de choisir un dépôt différent selon `appId` ;
- `RADAR_DATA_BRANCH` : branche cible, `main` par défaut.

`POST /api/extension-ingest?validateOnly=1` permet de valider un lot sans l’enregistrer une fois l’authentification configurée.

## Tests

```bash
npm test
npm run check
```

## Avertissement

Les résultats sont des estimations de travail. Les hypothèses fiscales, réglementaires, techniques, bancaires et comptables doivent être validées par les professionnels compétents avant toute décision d’investissement.

## Publication GitHub en un clic sous Windows

Le fichier `PUBLIER_SUR_GITHUB.bat` initialise le dépôt, lance les tests si Node.js est présent, puis pousse le projet vers `tdubour/radar-immo`. Une authentification GitHub dans le navigateur peut être demandée par Git Credential Manager.
