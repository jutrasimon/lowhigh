# Low Ball / High Ball

Un jeu de prix multijoueur, navigateur, mobile d’abord. Prototype pour jouer entre amis : https://lowhigh-multiplayer.onrender.com.

**Ce dépôt est l’unique source du projet : code, catalogue, documentation et tests. Aucun projet ChatGPT Sites.**

## Tester seul ou entre amis

Ouvrir https://lowhigh-multiplayer.onrender.com et créer un salon. Pour tester seul, choisir le mode, cliquer **Ajouter 3 bots pour jouer solo**, puis **C’est parti**. Les bots répondent dans les quatre modes et misent avec leur propre budget en enchères. On peut les retirer au lobby pour inviter des amis et partager le lien. Le serveur Render Free peut prendre un moment à se réveiller. Salons temporaires en mémoire : un redémarrage du service efface les parties en cours.

L’ancienne démo statique avec bots (`demo/index.html`) montre seulement le jeu d’estimation initial; le jeu en ligne ci-dessus inclut les quatre modes et les catalogues datés.

## Lancer localement ou avec Codespaces

1. Dans ce dépôt, cliquer **Code → Codespaces → Create codespace on main**.
2. Le serveur démarre automatiquement sur le port **3000**. Sinon : `npm start` dans le terminal.
3. Dans l’onglet **Ports**, clic droit sur **3000 → Port Visibility → Public** pour permettre aux amis de jouer sans compte GitHub. Seul le jeu est exposé, pas les fichiers privés du dépôt.
4. Ouvrir l’adresse transférée du port 3000. Créer un salon et partager l’invitation.
5. Garder le Codespace actif pendant la partie; l’arrêter après le test. Codespaces utilise le quota de ton compte et peut être facturé au-delà. La configuration ne crée aucun Codespace automatiquement.

GitHub Pages héberge la démo avec bots; Render héberge le vrai multijoueur.

Pour deux joueurs sur le même ordinateur, utiliser deux onglets ouverts séparément (pas « dupliquer l’onglet », qui peut copier la session) ou une fenêtre privée. Pour une soirée sur le réseau local : `npm start`, puis accéder à `http://ADRESSE_IP_DE_L_ORDINATEUR:3000` sur chaque téléphone.

## Modes de jeu

L’hôte choisit le mode dans le salon, et peut en changer après une partie. De 2 à 8 participants (une personne et des bots suffisent), cinq manches de 45 secondes. Le prix ou la valeur de référence reste côté serveur jusqu’au moment prévu par le mode.

| Mode | Questions | Réponse et résultat |
| --- | --- | --- |
| Vrai prix | Produits courants de détaillants canadiens, dont l’épicerie | Prix affiché en CAD. Score `max(0, arrondi(100 × (1 − écart absolu / prix)))`, plus 50 au plus proche. Égalité : chacun reçoit le bonus. |
| Expert | Objets rares et de collection issus de ventes terminées | Estimation du prix réalisé en USD, mêmes points. |
| Enchères | Objets de collection | Chacun reçoit 25 000 $ US. Mises secrètes simultanées, limitées à l’argent restant. La mise positive la plus haute gagne et est payée; une égalité au premier rang est départagée au hasard. Une manche sans mise positive reste invendue. La valeur réalisée reste secrète pendant les manches. À la fin : fortune = argent restant + valeurs réalisées de tous les objets remportés. |
| Historique | Moyennes mensuelles nationales de Statistique Canada | Estimer en CAD un produit de septembre 1995, 2000, 2010 ou 2020. L’hôte choisit une année ou un mélange. Mêmes points que le vrai prix. |

Dans les modes d’estimation, aucune réponse rapporte 0. Une réponse exacte rapporte 100 points, plus 50 si elle est au plus proche. Le vendeur ou la provenance du prix apparaît dans la question; date et lien de source apparaissent après la réponse. Les enchères montrent les mises et l’acquéreur après chaque manche, puis les vrais prix et sources à la fin.

## Catalogue et photos

Les données sont des **instantanés datés**, pas des demandes en direct à chaque question. Les prix sont conservés sur le serveur et les images sont servies à partir des URL de leurs sources. Chaque entrée indique son type de prix, sa devise, sa date et son lien de vérification.

- `data/products.json` : cinq articles IKEA Canada avec trois photos par produit.
- `data/open-prices.json` : relevés canadiens d’[Open Prices](https://prices.openfoodfacts.org/) (ODbL), avec magasin et photo d’Open Food Facts.
- `data/grocery.json` : échantillon manuel de vingt catégories d’[épiceries.ca](https://www.epiceries.ca/), avec magasin, lien marchand, date et photo. Le prix affiché peut être promotionnel; la variante et l’unité doivent correspondre à la fiche. Données issues d’un agrégateur, sujettes à ses conditions.
- `data/collectibles.json` : quinze lots vendus par [Christie’s](https://www.christies.com/), objets physiques de plusieurs catégories. Le prix réalisé en USD est la référence ludique, sans simulation des frais, taxes ou coûts de transport. Une à trois photos du lot quand elles figurent sur la fiche.
- `data/history.json` : 40 prix moyens mensuels canadiens en septembre, dérivés de la [table 18-10-0002-01 de Statistique Canada](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000201). Les images sont des illustrations actuelles, clairement marquées, et ne montrent pas un produit de l’époque. Les moyennes nationales ne représentent pas un prix du Québec ni un magasin précis.

### Actualiser les instantanés

`npm run update:grocery` interroge l’API publique épiceries.ca et reconstruit manuellement l’instantané avec des produits récents et photographiés. `npm run update:collectibles` revérifie les lots Christie’s présélectionnés et leurs photos. `npm run update:history` régénère les moyennes depuis le CSV officiel de Statistique Canada. Ces scripts ne sont **pas planifiés**. Un changement de source ou d’URL peut nécessiter une révision humaine; aucune clé payante n’est requise.

L’hôte peut aussi cliquer **Actualiser les produits du quotidien** dans le salon : cela récupère les relevés récents d’Open Prices, sans changer les autres banques. Limite globale de 15 minutes. Les parties en cours gardent leur sélection. L’actualisation faite dans le jeu est en mémoire seulement. Pour conserver les relevés Open Prices après redémarrage : `npm run update:products` ou **Actions → Actualiser les produits** sur GitHub, puis déployer le nouveau commit.

Les photos restent hébergées par les fournisseurs et peuvent cesser de fonctionner. Les photos et fiches Christie’s, IKEA et des marchands appartiennent à leurs titulaires; ce prototype n’est affilié à aucun d’eux. Vérifier les droits média et les conditions des données avant une diffusion commerciale. Ne jamais placer les fichiers `data/` dans `public/`, car ils contiennent les réponses.

## Architecture

Node 22+, sans dépendance. HTML/CSS/JS natifs. Pas de base de données ni de clé secrète à configurer.

- `server.js` : HTTP, fichiers publics explicitement autorisés, API JSON, limites de requêtes.
- `game.js` : machine à états, identité, scores, droits de l’hôte et expiration.
- `public/` : interface, saisie mobile, galerie, sons activables, vibrations disponibles et confettis respectant la réduction des animations.
- `data/*.json` : catalogues côté serveur; les prix ne sont pas envoyés avant la révélation prévue.
- `scripts/` : mise à jour manuelle des instantanés avec validation des sources.
- `test/game.test.js` : tests métier et intégration HTTP multijoueur.
- `.github/workflows/tests.yml` : vérifications à chaque push/PR et à la demande dans Actions.
- `.devcontainer/devcontainer.json` : lancement du playtest Codespaces.

Les clients interrogent le serveur une fois par seconde. Chronomètre, bots, points, mises et fortune sont calculés côté serveur. Les bots sont simulés autour du prix de référence avec des variations; ils servent à tester, sans prétendre reproduire de vrais joueurs. L’API ne transmet ni le prix ni les réponses des autres avant leur révélation. Jeton joueur aléatoire en `sessionStorage`, envoyé par en-tête Authorization, jamais dans le lien d’invitation. Un rafraîchissement du même onglet reprend la session. La fermeture de l’onglet peut perdre cette session.

Un salon est supprimé après 2 h sans activité; un redémarrage supprime tous les salons. L’hôte peut quitter explicitement et passe la main au prochain joueur. Après 60 s sans nouvelles de l’hôte, le prochain joueur actif prend le relais. Les joueurs absents restent dans la partie jusqu’à leur départ explicite; leur manche expire avec 0 point. Nouvelle arrivée seulement au lobby.

Prototype monoprocessus pour petit groupe de confiance, pas un service public à grande échelle. Les personnes ayant accès au dépôt peuvent consulter les prix. Le nom du produit et les images permettent aussi de le rechercher : on joue sans magasiner en parallèle.

## Tests

```sh
npm run check
npm test
```

Aucune installation npm requise. Les tests couvrent la partie complète, l’absence de fuite des réponses, les réponses en double/tardives, les égalités, le chronomètre, l’identité, l’hôte, les départs, les salons expirés, les limites et les routes HTTP. Dans GitHub, consulter **Actions → Tests du jeu**.

### Vérification humaine avant la soirée

- Deux téléphones : invitation, pseudonymes, démarrage, photos et clavier décimal.
- Estimations au-dessus/au-dessous, expiration et classement.
- Rafraîchir pendant la manche : retrouver sa réponse verrouillée.
- Couper/reprendre le réseau et vérifier la reprise.
- Quitter avec l’hôte, terminer les cinq manches, relancer une revanche.
