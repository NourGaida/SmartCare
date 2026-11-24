# Guide du portail de supervision

Démarrer le [profil connecté](../../docs/connected-care.md) puis ouvrir
[la supervision locale](http://localhost:8085/smartcare/frontends/backoffice/).
Dans les deux parcours, **Sign out** ferme la session. L'accès HTTPS et
l'installation de la PWA sont décrits dans le [guide HTTPS](../../docs/https-pwa/README.md).

## Professionnel

1. Se connecter avec **Sign in**, par exemple avec `ali.benali@smartcare.local`.
   **Assigned patients** liste les patients affectés à ce compte.
2. Cliquer sur **View details**. **Measurement history** affiche les mesures
   récentes et **Rule alerts** affiche les alertes confirmées pour ce patient.
3. Sous **Rule alerts**, saisir une **Acknowledgement note** et cliquer sur
   **Acknowledge**. La note et l'heure d'acquittement restent visibles après
   rechargement. Acquitter enregistre la prise en compte de l'alerte. La
   résolution clôt l'épisode lorsque le détecteur constate le retour à la normale.
4. Cliquer sur **Simulation des capteurs**, choisir **Patient and device**, puis
   cliquer sur **normal**, **spike**, **sustained** ou **invalid**. Les courbes
   suivent les mesures réellement sauvegardées. **sustained** déclenche une
   alerte de règle confirmée, visible aussi dans le portail du patient concerné.

## Administrateur et état du modèle

1. Cliquer sur **Sign out** si une session professionnelle est ouverte.
2. Revenir sur [la supervision](http://localhost:8085/smartcare/frontends/backoffice/)
   et cliquer sur **Sign in** avec un compte administrateur provisionné,
   par exemple `admin@smartcare.local`. L'initialisation des comptes de soins
   crée des comptes patient et médecin. Le compte administrateur de développement
   peut être provisionné séparément via [seed-dev-users.ps1](../../scripts/seed-dev-users.ps1).
3. Ouvrir **État du modèle**. Ce menu est sélectionné à l'ouverture de la
   session administrateur. L'écran utilise la session de supervision et demande
   les métadonnées à `GET /api/admin/model` sur la même origine.
4. Avec le WAR actuel, l'API est encore à implémenter. Attendre **Analyse
   indisponible**, puis cliquer sur **Réessayer** pour renouveler la demande.
   Les réponses de test couvrent l'absence de métadonnées, l'état
   disponible, la version et le mode **shadow**. Dans ce mode, les scores sont
   observés et les règles continuent de générer les alertes.

Le rôle administrateur de ce parcours voit l'état technique du modèle. Les
parcours de soins et de simulation restent dans l'espace professionnel affecté.
La version de FastAPI n'est pas la version du modèle. Le contrat proposé du
portail ne fournit pas de métriques ni de date de mise à jour.
Voir le [contrat API](../../docs/api/contract.md#get-apiadminmodel--planned) et la
[matrice O1–O10](../../docs/iot/mlops-validation.md).

## Tests

Depuis la racine, exécuter `node --test frontends/tests/model-status.test.mjs`
pour la page administrateur avec des réponses simulées. Le
[guide du parcours connecté](../../docs/connected-care.md#vérifications)
donne les commandes de vérification des affectations, des alertes et du simulateur
sur le vrai serveur.
