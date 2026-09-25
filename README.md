# Tester la démo avec bots

La démo autonome se trouve dans `demo/index.html`. GitHub Pages publie uniquement ce dossier. Les produits de cette démo sont fixes; le chargement de produits live n’est pas encore branché.

# Low Ball / High Ball

Un jeu de prix multijoueur, navigateur, mobile d’abord. Prototype pour jouer entre amis : https://lowhigh-multiplayer.onrender.com.

**Ce dépôt est l’unique source du projet : code, catalogue, documentation et tests. Aucun projet ChatGPT Sites.**

## Jouer entre amis

Ouvrir https://lowhigh-multiplayer.onrender.com, créer un salon et partager le lien. Le serveur Render Free peut prendre un moment à se réveiller. Salons temporaires en mémoire : un redémarrage du service efface les parties en cours.

## Lancer localement ou avec Codespaces

1. Dans ce dépôt, cliquer **Code → Codespaces → Create codespace on main**.
2. Le serveur démarre automatiquement sur le port **3000**. Sinon : `npm start` dans le terminal.
3. Dans l’onglet **Ports**, clic droit sur **3000 → Port Visibility → Public** pour permettre aux amis de jouer sans compte GitHub. Seul le jeu est exposé, pas les fichiers privés du dépôt.
4. Ouvrir l’adresse transférée du port 3000. Créer un salon et partager l’invitation.
5. Garder le Codespace actif pendant la partie; l’arrêter après le test. Codespaces utilise le quota de ton compte et peut être facturé au-delà. La configuration ne crée aucun Codespace automatiquement.

GitHub Pages héberge la démo avec bots; Render héberge le vrai multijoueur.

Pour deux joueurs sur le même ordinateur, utiliser deux onglets ouverts séparément (pas « dupliquer l’onglet », qui peut copier la session) ou une fenêtre privée. Pour une soirée sur le réseau local : `npm start`, puis accéder à `http://ADRESSE_IP_DE_L_ORDINATEUR:3000` sur chaque téléphone.

## Règles V1

- 2 à 8 joueurs, pseudonyme sans compte, salon à code de 5 caractères.
- 5 produits mélangés sans répétition dans une partie; 45 secondes par manche.
- Chaque personne verrouille un prix; les autres estimations restent cachées jusqu’à la révélation.
- Révélation lorsque tous ont répondu ou lorsque le délai expire.
- Dollars canadiens, **avant taxes et livraison**, variante exacte décrite sur la fiche.
- Précision : `max(0, arrondi(100 × (1 − écart absolu / prix réel)))`.
- Bonus de **50** au plus proche. En cas d’égalité, chaque joueur à égalité reçoit le bonus.
- Aucune réponse = 0 point, aucun bonus. Dépasser le prix est permis et pénalisé comme une sous-estimation équivalente.
- L’hôte passe au produit suivant. Classement final, égalité possible, revanche avec scores remis à zéro.

## Catalogue

`data/products.json` contient cinq produits IKEA Canada du catalogue initial. `data/open-prices.json` contient les relevés de prix canadiens d’[Open Prices](https://prices.openfoodfacts.org/), une base collaborative d’Open Food Facts. Le jeu mélange les deux sources à chaque partie. Les prix Open Prices sont des relevés datés chez un magasin précis, pas des prix garantis au moment où l’on joue.

### Actualiser les produits

Dans GitHub, ouvrir **Actions → Actualiser les produits → Run workflow** sur `main`. La commande récupère les derniers relevés en CAD, conserve les produits canadiens avec nom, photo et date des six derniers mois, puis publie `data/open-prices.json` si le catalogue change. Render redéploie automatiquement le commit. **Lancer entre deux parties**, car un redéploiement efface les salons actifs sur l’offre gratuite. Si la source échoue ou fournit moins de cinq produits, l’ancien catalogue est conservé.

En local : `npm run update:products`. Aucun compte ni clé API requis. La commande est manuelle; aucune mise à jour périodique n’est programmée.

Les prix et informations Open Prices sont attribués dans le jeu et publiés séparément sous [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). Les photos sont servies par Open Food Facts et créditées dans le jeu. Le vendeur, la date et le lien du relevé apparaissent à la révélation.

Prix, notes et photos proviennent des fiches officielles référencées dans chaque entrée, consultées le **21 septembre 2026**. Les prix sont des instantanés de jeu, pas des prix en direct. Les descriptions françaises sont reformulées. Les notes agrégées sont affichées, pas des avis inventés. Trois photos par produit sont chargées depuis IKEA; leur disponibilité dépend du marchand. La source et le prix sont dévoilés après la manche.

Champ `video` optionnel pris en charge (URL HTTPS directe IKEA, controls/playsinline), mais aucun clip n’est inclus dans ce premier catalogue. Les photos appartiennent au marchand; le prototype n’est ni affilié ni commandité par IKEA. Prévoir des médias autorisés avant une diffusion commerciale.

Pour ajouter un produit : identifiant unique, nom, description de la variante, `priceCents` entier positif, `currency: CAD`, tableau `images`, note et nombre d’avis facultatifs, URL `source`, date `checkedAt`. Ne pas placer le catalogue dans `public/` : les prix doivent rester côté serveur. Le petit catalogue sera connu après une partie; élargir avant des tests répétés.

## Architecture

Node 22+, sans dépendance. HTML/CSS/JS natifs. Pas de base de données ni de clé secrète à configurer.

- `server.js` : HTTP, fichiers publics explicitement autorisés, API JSON, limites de requêtes.
- `game.js` : machine à états, identité, scores, droits de l’hôte et expiration.
- `public/` : interface, saisie mobile, galerie, sons activables, vibrations disponibles et confettis respectant la réduction des animations.
- `data/products.json` et `data/open-prices.json` : catalogues côté serveur; les prix ne sont pas envoyés avant la révélation.
- `scripts/update-products.js` : filtre et renouvelle les relevés Open Prices.
- `test/game.test.js` : tests métier et intégration HTTP multijoueur.
- `.github/workflows/tests.yml` : vérifications à chaque push/PR et à la demande dans Actions.
- `.devcontainer/devcontainer.json` : lancement du playtest Codespaces.

Les clients interrogent le serveur une fois par seconde. Chronomètre et points sont calculés côté serveur. L’API ne transmet ni le prix ni les réponses des autres avant révélation. Jeton joueur aléatoire en `sessionStorage`, envoyé par en-tête Authorization, jamais dans le lien d’invitation. Un rafraîchissement du même onglet reprend la session. La fermeture de l’onglet peut perdre cette session.

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
