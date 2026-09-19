# Berry Multi-Source Connector

Extension Chrome Manifest V3 commune à plusieurs applications. Une application possède son endpoint, son espace et son jeton. Une recherche peut livrer ses résultats à une ou plusieurs applications sans relancer l'extraction de la page.

## Sources V1

- Leboncoin ;
- SeLoger ;
- Bien'ici ;
- PAP ;
- Logic-Immo.

Le collecteur lit les données visibles et les balises JSON-LD de la page dans la session normale de l'utilisateur. Il ne tente pas de résoudre un CAPTCHA, de modifier l'empreinte du navigateur, de récupérer les cookies ou d'extraire les coordonnées des vendeurs.

## Installation locale

```bash
npm ci
npm run build:extension
```

Dans `chrome://extensions`, activer le mode développeur puis charger le dossier `extension/` comme extension non empaquetée.

## Modèle multi-application

- `appId` : application destinataire (`radar-immo`, `berrypilot`, etc.) ;
- `workspaceId` : organisation ou espace dans cette application ;
- `searchId` : recherche indépendante ;
- `runId` : passage précis du collecteur ;
- `sourceId` : portail immobilier.

Les jetons sont enregistrés dans `chrome.storage.local`, jamais dans le dépôt. L'extension demande uniquement la permission du domaine backend lors de l'ajout d'une application.
