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

### Backend Radar

La migration `supabase/migrations/20260811030000_radar_listings.sql` crée les annonces, l’historique des prix et le journal des collectes. Variables Vercel nécessaires :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)
- `CRON_SECRET`
- `APIFY_TOKEN`, `APIFY_START_URLS_JSON` et éventuellement `APIFY_MAX_ITEMS` pour le collecteur multi-source

Le cron appelle `/api/cron/collect` chaque jour à 05:15 UTC. Les tables sont protégées par RLS et ne sont jamais ouvertes directement au navigateur.

## Tests

```bash
npm test
npm run check
```

## Avertissement

Les résultats sont des estimations de travail. Les hypothèses fiscales, réglementaires, techniques, bancaires et comptables doivent être validées par les professionnels compétents avant toute décision d’investissement.

## Publication GitHub en un clic sous Windows

Le fichier `PUBLIER_SUR_GITHUB.bat` initialise le dépôt, lance les tests si Node.js est présent, puis pousse le projet vers `tdubour/radar-immo`. Une authentification GitHub dans le navigateur peut être demandée par Git Credential Manager.
