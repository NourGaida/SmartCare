# Semaine 2 — tests d'accès de la personne A

Hadil Karous, personne A. État du raccordement sur `feat/patient-measurement-history`.
Les autorisations et l'authentification serveur appartiennent à la personne B.

## Ce qui existe réellement

- GET /api/health : HealthSource.
- GET /api/health/database : DatabaseHealthSource, 200 ou 503.
- Préfixe /api : SmartCareApplication ; contexte du WAR généralement /smartcare.
- Les sources se trouvent dans middleware/api/src/main/java/com/smartcare/api.
- Le mode serveur utilise les routes de connexion, de session et de déconnexion.
- GET /api/me/measurements : PatientMeasurementsResource ; le rôle PATIENT est
  requis et le userId est déduit de la session validée par SecurityFilter.
- La requête MongoDB filtre le patientId stocké à l'ingestion, ignore tout
  identifiant client et exclut les mesures sans propriétaire. Elle ne filtre pas
  sur l'affectation actuelle d'un appareil.
- Les routes professionnel, export CSV et direct restent nécessaires à la matrice complète.

Sept tests Java PatientMeasurementsResourceTest passent avec deux connexions
fictives et MongoDB réel dans une base temporaire : isolement A/B, paramètres
forgés, liste vide, mesures invalides, sessions absentes/expirées/révoquées,
refus professionnel/admin et panne MongoDB. Le filtre et la ressource sont
appelés avec un contexte JAX-RS simulé, sans déploiement HTTP/WildFly.

Le parcours HTTP patient a aussi été vérifié après redéploiement WildFly sur
localhost:8080 : connexion existante, session 200, mesures 200, ligne 75 bpm / 98 %
présente et identifiants forgés ignorés. Le test dédié est
frontends/tests/integration/patient-history-http.test.mjs ; il ferme sa propre
session et ne modifie pas les données. Voir le guide frontoffice pour le relancer.
Le rendu et le cache du navigateur n'ont pas été vérifiés (navigateur indisponible).

Cela ne valide pas encore la matrice HTTP/WebSocket complète ci-dessous.
Un 404 sur une route inexistante n'est pas une preuve d'autorisation.

## Données et matrice communes

frontends/tests/fixtures/access.mjs crée patient-001 et patient-002, un professionnel pro-001
affecté uniquement à patient-001 et un administrateur admin-001. Chaque patient a
une mesure portant un deviceId marqueur différent. Ce sont des données fictives.
Un compte patient-002 supplémentaire sert de témoin de livraison live autorisée.

| Cas | Historique | CSV | Abonnement live |
| --- | --- | --- | --- |
| Patient A demande B en modifiant le patientId client | Refus, ou seulement A si route /me | Refus, ou seulement A | Refus, ou abonnement limité à A |
| Professionnel demande B non affecté | Refus sans données | Refus sans données | Refus, aucune mesure livrée |
| Administrateur demande les données de santé A | Refus sans données | Refus sans données | Refus, aucune mesure livrée |
| Patient A demande A | Données A, jamais B | Données A, jamais B | A livré, jamais B |
| Professionnel demande A affecté | Données A, jamais B | Données A, jamais B | A livré, jamais B |

## Tests frontend exécutables maintenant

~~~powershell
node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs
~~~

Les tests passent par les adaptateurs réellement utilisés par la démo, avec une
injection des deux fixtures. getHistory et exportCSV gardent le sujet de la session
patient. L'abonnement de démonstration ignore le patientId client pour le patient
et vérifie rôle/affectation pour la supervision avant l'enregistrement du listener.
Les deux canaux publient des mesures après chaque tentative ; aucun message
interdit ne doit parvenir au listener. Déconnexion et désabonnement arrêtent les flux.

Ces tests valident les contrôles de l'interface et de ses adaptateurs.
Le flux de shared/demo-updates.mjs est un transport en mémoire : **ce n'est pas
un WebSocket et ces tests ne prouvent pas la sécurité du serveur**.

## Tests d'intégration préparés, actuellement bloqués

~~~powershell
node --test frontends/tests/integration/access-server.test.mjs
~~~

Résultat attendu aujourd'hui : 15 SKIP/BLOCKED, avec la dépendance précise affichée
dans chaque scénario. Le CI les rapporte séparément des réussites frontend.

| Série bloquée | Éléments à fournir/valider par B |
| --- | --- |
| 5 historiques REST | /me/measurements et les sessions existent ; raccorder le driver HTTP et ses fixtures. Pour le professionnel autorisé, il manque /patients/{id}/measurements et son contrôle d'affectation. |
| 5 exports CSV | Route réelle, mêmes autorisations, paramètres, colonnes et marqueur appareil présent dans le CSV. |
| 5 mises à jour WebSocket | URL réelle, authentification de connexion, protocole subscribe, acquittement/refus explicite, fermeture et pipeline réel de diffusion. |
| Commun aux 15 | Quatre sessions réelles : A, B témoin live, professionnel et admin ; provisionnement/nettoyage isolé des fixtures ; cookies/token et CSRF selon contrat. |
| Témoins live | Injection déterministe de mesures A et B et livraison constatée aux deux abonnements autorisés ; le silence d'un serveur inactif ne doit pas faire réussir un refus. |

Le driver exemple est dans frontends/tests/integration/server-driver.example.mjs. Il expose
setup, login, history, csv, live, inject et cleanup ; ses méthodes sont volontairement
non implémentées et ne génèrent aucune fausse réponse. Les marqueurs doivent provenir
des octets REST/CSV et frames WebSocket reçus, pas être ajoutés par le driver.
Le driver devra faire les requêtes réelles avec cache: no-store.

Une fois le contrat et l'environnement B disponibles, implémenter ce driver dans
un fichier local, puis le sélectionner explicitement :

~~~powershell
$env:SMARTCARE_SERVER_DRIVER = 'C:\chemin\vers\server-driver.mjs'
node --test frontends/tests/integration/access-server.test.mjs
Remove-Item Env:\SMARTCARE_SERVER_DRIVER
~~~

Le driver doit mapper chaque opération sur les routes **réelles**, employer le
mécanisme réel de session et injecter le patientId dans les emplacements acceptés
par le client (path, query ou body). Sur une route /me, envoyer aussi un identifiant
forgé pour vérifier qu'il est ignoré ou refusé. Ne pas envoyer un rôle comme preuve
d'autorisation : l'identité doit provenir de la session validée par le serveur.

Pour chaque cas REST/CSV, une requête témoin autorisée doit d'abord retourner
réellement les données A. Un refus doit être explicite (403 ou 404 de masquage
après ce témoin), sans données ; 401/5xx ou 200 vide ne sont pas des réussites.
Pour un patient limité à /me, une réponse 200 ne peut contenir que A.
Si B retient un autre code de refus documenté, adapter l'assertion après validation.

Pour le live, les deux témoins autorisés doivent recevoir les mesures injectées.
La tentative interdite doit être refusée pendant la connexion ou subscribe,
sans accepter l'abonnement clinique. Toutes les frames sont observées, erreurs
comprises, jusqu'à une seconde après les livraisons témoins ; les délais positifs
sont bornés à cinq secondes. Une absence d'événements chez les témoins est un échec.
Un patient dont le sujet est déduit de la session peut être abonné à A seulement.
Les sockets, sessions et fixtures doivent être nettoyés même en cas d'échec.

## Vérifications encore externes

Le contrôle visuel desktop/360 px et les interactions DOM attendent un navigateur.
L'installation et le mode avion attendent un téléphone et une origine HTTPS
approuvée ; la procédure est dans README.md. Ces points sont distincts des 15
tests d'intégration bloqués par les éléments B ci-dessus.
