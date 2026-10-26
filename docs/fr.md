# Habitica

Retrouvez votre personnage [Habitica](https://habitica.com) dans Gladys :
points de vie, niveau, expérience, or, quotidiennes restantes du jour et
tâches à faire en retard. Une scène vous rappelle le soir les quotidiennes pas
encore cochées, fête un niveau gagné ou prévient quand les points de vie
baissent ; un tag NFC sur la gourde compte une habitude, un appui sur le
tableau de bord coche une quotidienne, et Gladys peut lire chaque soir ce
qu'il reste à faire.

Fonctionne avec habitica.com et avec un Habitica auto-hébergé.

> **Vos retours sont bienvenus.** Cette intégration a été testée contre un
> vrai serveur Habitica auto-hébergé (Habitica 5.51.0 en Docker, octobre
> 2026), pas encore au quotidien, ni contre habitica.com. Si quelque chose ne
> fonctionne pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-habitica/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un compte Habitica, sur habitica.com ou sur votre propre serveur.
- Son **ID utilisateur** et son **jeton d'API** : dans Habitica,
  **Paramètres** → **Données du site** → **API** (sur l'application mobile :
  **Paramètres** → **API**), puis **Afficher le jeton d'API**. Le jeton donne
  un accès complet au compte : gardez-le pour vous, et réinitialisez-le au
  même endroit s'il fuite.

## Configuration

1. Installez l'intégration depuis le store (**Intégrations** → **Habitica**).
2. Dans **Configuration** :
   - **Adresse** : gardez `https://habitica.com`, ou saisissez l'adresse de
     votre serveur (ex. `http://192.168.1.20:3000`).
   - **Identifiant utilisateur** et **Jeton d'API** : copiés depuis Habitica.
   - **Accepter les certificats auto-signés** : seulement pour une adresse en
     `https://` de votre propre serveur au certificat auto-signé.
   - **Seuil de points de vie bas** (15 par défaut, sur 50) : le seuil de
     l'événement « Points de vie Habitica bas ».
   - **Rappel des quotidiennes restantes** : combien d'heures avant la fin de
     la journée Habitica se déclenche l'événement « Quotidienne Habitica
     encore à faire » (2 par défaut).
   - **Intervalle de rafraîchissement** : 5 minutes par défaut, jusqu'à 30.
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout de l'appareil, et les phrases envoyées aux
     scènes.
3. Utilisez **Tester la connexion** : elle affiche le nom de votre
   personnage, son niveau et les quotidiennes restantes du jour.
4. Dans **Découverte**, ajoutez l'appareil **Habitica <nom>**.

La journée Habitica commence à l'heure du **début de journée personnalisé**
de votre compte (Paramètres → Données du site dans Habitica), dans le fuseau
horaire de Gladys.

## Appareils

Un appareil, **Habitica <nom du personnage>**, avec ces fonctionnalités :

| Fonctionnalité         | Ce qu'elle compte                                                 |
| ---------------------- | ----------------------------------------------------------------- |
| Points de vie          | de 0 à 50, arrondis au-dessus comme dans Habitica                 |
| Niveau                 | le niveau du personnage                                           |
| Expérience             | les points d'expérience dans le niveau                            |
| Or                     | l'or, arrondi en dessous                                          |
| Quotidiennes restantes | les quotidiennes à faire aujourd'hui et pas encore cochées        |
| À faire en retard      | les tâches à faire ouvertes dont l'échéance est avant aujourd'hui |

Tant que vous n'avez pas ouvert Habitica un nouveau jour (ou utilisé
« Commencer la journée Habitica »), la nouvelle journée n'a pas commencé dans
Habitica : toutes les quotidiennes du jour comptent alors comme restantes,
puisque Habitica va toutes les décocher.

Les valeurs suivent l'intervalle de rafraîchissement, et chaque action depuis
Gladys les met à jour aussitôt.

## Tableau de bord

Le widget **Quotidiennes Habitica** montre les quotidiennes restantes et vos
points de vie, la liste des quotidiennes restantes puis des tâches à faire en
retard, et un bouton pour cocher chacune des quatre premières quotidiennes
restantes. Quand la nouvelle journée n'a pas encore commencé dans Habitica,
il le dit et propose à la place un bouton **Commencer ma journée** : sinon une
quotidienne cochée compterait pour la veille.

## Scènes

### Déclencheurs

- **Quotidienne Habitica encore à faire** : se déclenche pour chaque
  quotidienne pas encore cochée, le nombre d'heures choisi avant la fin de la
  journée Habitica. Filtre : le titre de la quotidienne (vide : toutes).
  Variables : la quotidienne, son identifiant, le nombre de quotidiennes
  restantes, les heures avant la fin de journée.
- **Niveau Habitica gagné** : le personnage a atteint un nouveau niveau.
  Variables : le niveau, le niveau précédent, la classe.
- **Points de vie Habitica bas** : les points de vie sont passés sous le seuil
  de la configuration. Une fois par passage. Variables : points de vie, seuil,
  niveau.
- **Toutes les quotidiennes Habitica faites** : la dernière quotidienne du
  jour vient d'être cochée, dans Habitica ou depuis Gladys. Variable : le
  nombre de quotidiennes du jour.

Les événements sont détectés à chaque lecture : jusqu'à l'intervalle de
rafraîchissement plus tard pour un niveau, les points de vie ou la dernière
quotidienne ; le rappel est toujours à l'heure.

### Actions

- **Cocher une tâche Habitica** : par son titre exact (majuscules et accents
  ignorés) ou son identifiant : une habitude + ou −, une quotidienne, une
  tâche à faire. Le sens « − » compte une mauvaise habitude, ou décoche une quotidienne cochée. Si la nouvelle journée n'a pas encore
  commencé dans Habitica, elle est d'abord commencée. Sorties : la tâche, son
  type, les points de vie, le niveau et l'or après coup.
- **Créer une tâche à faire Habitica** : ajoute une tâche à faire au compte.
  Sorties : la tâche et son identifiant.
- **Commencer la journée Habitica** : ce que fait Habitica quand vous
  l'ouvrez un nouveau jour : les quotidiennes manquées la veille infligent
  leurs dégâts, puis toutes les quotidiennes sont décochées.
- **Lire Habitica** : les quotidiennes restantes, les tâches à faire en retard
  et les points de vie en une phrase, pour un message ou une annonce vocale.
  Sorties : la phrase, les quotidiennes restantes, les tâches en retard, les
  points de vie et le niveau.

### Idées de scènes

- **Quotidienne Habitica encore à faire** (à 22 h : 2 heures avant minuit) →
  envoyer « {{triggerEvent.data.task}} reste à faire » sur Telegram.
- Un tag NFC sur la gourde → **Cocher une tâche Habitica** « Boire un verre
  d'eau ».
- **Toutes les quotidiennes Habitica faites** → la lumière du salon passe au
  vert une minute.
- Chaque matin à 7 h → **Commencer la journée Habitica**, puis **Lire
  Habitica** et dire la phrase sur l'enceinte.

## Dépannage

- **« identifiant utilisateur ou jeton d'API refusé »** : recopiez-les depuis
  Paramètres → Données du site → API. Un jeton réinitialisé doit être saisi à
  nouveau.
- **« Habitica ne répond pas »** : pour votre propre serveur, vérifiez
  l'adresse et le port, joignables depuis Gladys.
- **« aucune API Habitica à cette adresse »** : l'adresse pointe vers autre
  chose, ou il manque le préfixe de chemin de votre proxy inverse.
- **« trop de requêtes »** : habitica.com accepte 30 requêtes par minute et
  par compte, partagées entre tous les outils que vous utilisez.
  L'intégration attend et réessaie.
- **Les quotidiennes restantes ressemblent à celles de la veille** : la
  nouvelle journée n'a pas encore commencé dans Habitica ; ouvrez Habitica ou
  utilisez « Commencer ma journée ».
- Plus de détails avec le niveau de log `debug` dans les réglages de
  l'intégration.

## Limites

- Un seul compte Habitica par installation.
- Les récompenses ne sont ni affichées ni achetées, et les éléments de liste
  d'une tâche ne sont pas affichés.
- Deux tâches au même titre ne se distinguent pas par le titre : utilisez
  l'identifiant de la tâche (écran de modification de la tâche dans Habitica)
  ou renommez-en une.
- La journée Habitica suit le fuseau horaire de Gladys : si votre compte
  Habitica est réglé sur un autre, le début de journée et le rappel suivent
  Gladys.
- Les conditions de Habitica demandent aux outils de rester bien en dessous
  de 30 requêtes par minute : l'intégration fait 2 requêtes par
  rafraîchissement (toutes les 5 minutes au plus souvent), plus 5 environ par action.
- Sans lien avec HabitRPG, Inc.
