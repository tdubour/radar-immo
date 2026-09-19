# Berry Multi-Source Connector 1.2.1

Extension Chrome Manifest V3 commune à plusieurs applications. Une application possède son endpoint, son espace et son jeton. Une recherche peut livrer ses résultats à une ou plusieurs applications sans relancer l'extraction de la page.

## Sources V1

- Leboncoin ;
- SeLoger ;
- Bien'ici ;
- PAP ;
- Logic-Immo.

Le collecteur lit les données visibles et les balises JSON-LD de la page dans la session normale de l'utilisateur. Il ne tente pas de résoudre un CAPTCHA, de modifier l'empreinte du navigateur, de récupérer les cookies ou d'extraire les coordonnées des vendeurs.

La V1 BerryPilot LBC Safe est intégrée sans supprimer le mode multi-source : le popup permet d'appairer BerryPilot avec son code à usage unique, tandis que la page de configuration conserve les destinations Radar Immo et futures applications. Les deux moteurs partagent un verrou de navigation afin de ne jamais parcourir deux portails en parallèle dans le même profil Chrome.

Radar Immo est préconfiguré comme destination locale dès la mise à jour : vingt-deux recherches couvrant les cinq portails sont créées sans effacer les réglages personnalisés. Leboncoin utilise le cercle de 100 km centré sur Chaumont-sur-Tharonne. SeLoger, Bien'ici et Logic-Immo couvrent les six départements traversés par la zone, puis Radar applique son filtre géographique : toutes les communes jusqu'à 100 km, puis les villes d'au moins 10 000 habitants jusqu'à 150 km. PAP couvre en priorité le Loir-et-Cher, le Loiret et le Cher. Les annonces sont conservées dans Chrome et transmises à `radar-immo-blond.vercel.app` par un pont local. Aucun jeton Vercel ou GitHub n'est nécessaire pour cette destination. PAP peut demander une validation humaine au premier passage ; le connecteur s'arrête alors sans essayer de contourner la protection.

## Installation locale

```bash
npm ci
npm run build:extension
```

Dans `chrome://extensions`, activer le mode développeur puis charger le dossier `extension/` comme extension non empaquetée.

Pour BerryPilot, ouvrir ensuite **Prospection > LBC Safe > Connexion LBC**, générer un code, puis le saisir dans la section BerryPilot du popup. L'ancien connecteur LBC autonome peut rester installé pendant la vérification, mais il faut le désactiver après l'appairage pour éviter deux synchronisations identiques.

## Modèle multi-application

- `appId` : application destinataire (`radar-immo`, `berrypilot`, etc.) ;
- `workspaceId` : organisation ou espace dans cette application ;
- `searchId` : recherche indépendante ;
- `runId` : passage précis du collecteur ;
- `sourceId` : portail immobilier.

Les jetons des applications distantes sont enregistrés dans `chrome.storage.local`, jamais dans le dépôt. L'extension demande uniquement la permission du domaine backend lors de l'ajout d'une application. Radar Immo n'utilise aucun jeton dans ce mode.

Les recherches planifiées passent dans une file unique : un seul onglet de collecte est ouvert à la fois, dans une fenêtre dédiée non focalisée et minimisée. La fenêtre est fermée après le passage. Si Chrome refuse ce mode, le connecteur revient automatiquement à un onglet inactif. Les passages initiaux sont décalés et un onglet sans réponse est fermé après deux minutes avant de poursuivre la file.

Le connecteur BerryPilot conserve sa synchronisation horaire, son filtrage anti-démarchage, ses limites de 40 fiches par recherche et ses endpoints d'appairage/import existants. Les réglages génériques et le jeton BerryPilot sont stockés dans deux espaces séparés de `chrome.storage.local`.
