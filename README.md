# HEARTDRIVE 💖🏎️

Jeu de questions/réponses à deux pour faire connaissance à distance.
Design inspiré de **Hearthstone** (cartes à cadre doré, bois, parchemin, gemmes) et **Need for Speed Underground 2** (ville de nuit, néons, HUD italique, « PERFECT MATCH »).

## Fonctionnalités

- **Comptes** : pseudo + code secret.
- **Lien entre deux joueurs** : sur l’accueil (le « Garage »), tu entres le pseudo de l’autre. Elle/il accepte l’invitation, et le lien devient actif. Si vous vous invitez tous les deux, il s’active directement.
- **Parties de 5 / 10 / 20 questions** (Sprint / Circuit / Underground), avec choix des thèmes parmi 24 (musique, films, séries, livres, BD, mangas, jeux vidéo, voitures, motos, voyages, sports, nourriture, restaurants, anecdotes, animaux, balades, randonnée, urbex, ski, skate, fleurs, montagne, mer, tatouages). 188 questions, à réponse libre ou oui/non. Le jeu évite de reposer des questions déjà jouées par le même duo.
- **Tour par tour synchronisé** : tu ne vois la question suivante qu’une fois que les deux ont répondu. La réponse de l’autre reste cachée tant que tu n’as pas répondu toi-même. Ensuite, les deux cartes se retournent côte à côte.
- **Image automatique** pour chaque réponse : recherche sur Openverse (images libres, sans clé API), puis Wikimedia Commons en secours. Si rien n’est trouvé, la carte prend l’illustration du thème.
- **Rapport de partie** : score de synergie avec un rang à la Hearthstone (Commune → Légendaire), synergie par thème, faits marquants, sujets d’accord et de désaccord, temps de réponse moyen, et toutes les manches avec leurs images. Il s’imprime ou s’exporte en PDF.
- **Historique** de toutes tes parties. Il est conservé même si un lien est rompu.
- **Messagerie** temps réel : texte, **message vocal de 10 s max**, **envoi de photo** (redimensionnée côté navigateur), indicateur « en train d’écrire » et présence en ligne. L’historique est gardé tant que le lien est actif. **Rompre le lien** efface définitivement messages, vocaux et photos.

## Lancer en local

Il faut **Node.js 20 ou plus**.

```bash
npm install
npm start
# → http://localhost:3000
```

Pour tester seul, ouvre deux navigateurs (ou une fenêtre privée) et crée deux comptes.

> ⚠️ Le micro (messages vocaux) n’est autorisé par les navigateurs qu’en **HTTPS** ou sur `localhost`. En production, utilise donc un hébergement en HTTPS (Render le fournit automatiquement).

## Mettre en ligne (Render)

Le fichier `render.yaml` déploie le site sur l’**offre gratuite** de Render : sur Render, choisis **New → Blueprint** et sélectionne ce dépôt.

⚠️ Sur l’offre gratuite, le site se met en veille après 15 min sans visite, et les données (comptes, parties, messages) sont effacées à chaque réveil ou redéploiement. Pour les conserver : passe le service en **Starter**, ajoute un disque persistant monté sur `/var/data` et la variable `DATA_DIR=/var/data`.

## Variables d’environnement

| Variable   | Défaut   | Rôle                                          |
|------------|----------|-----------------------------------------------|
| `PORT`     | `3000`   | Port HTTP                                     |
| `DATA_DIR` | `./data` | Dossier de la base SQLite et des médias       |
| `NODE_ENV` | –        | `production` pour un cookie de session sécurisé (HTTPS) |

## Structure

```
server.js            API REST + Socket.io (temps réel) + envoi de fichiers
src/db.js            Schéma SQLite (users, sessions, links, games, answers, messages)
src/questions.js     Thèmes et banque de questions : ajoute les tiennes ici
src/images.js        Recherche d’image automatique (Openverse → Wikimedia)
src/report.js        Calcul du rapport et du score de synergie
public/index.html    Page unique
public/style.css     Thème Hearthstone × NFSU2
public/app.js        Application côté navigateur (routeur, jeu, rapport, messagerie)
```

### Ajouter des questions

Dans `src/questions.js` :

```js
Q('voyages', 'open',  "Ta question libre ?", 'mots-clés anglais pour l’image'),
Q('mer',     'yesno', "Ta question oui/non ?", 'beach sunset'),
```
