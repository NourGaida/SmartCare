# Frontend / backend — à valider avec la personne B

## Route réellement présente

Vérification des sources au 10 novembre 2026 :
SmartCareApplication déclare /api ; HealthSource expose **GET /api/health**,
réponse {"status":"ok"}. DatabaseHealthSource expose **GET /api/health/database**,
avec réponse 200 si MongoDB et le schéma sont prêts, 503 sinon.
Ces classes se trouvent dans MiddleWare/src/main/java/com/smartcare/api.
Le contexte du WAR ajoute généralement /smartcare.
Aucune route d'authentification, patient, mesure, alerte ou administration n'est
encore implémentée ici. La démonstration ne prétend pas les appeler.
Il n'y a pas de point d'entrée WebSocket ni de mécanisme de session de test dans
les sources examinées. Il s'agit d'un constat sur le code, pas d'une validation
d'un serveur déployé. Les tests de persistance MongoDB ne testent pas ces accès.
Les chemins génériques /users, /devices, /measurements, /scores, /alerts et
/configuration annoncés dans le README racine n'ont pas de ressource REST
correspondante dans le code à cette date.

Les scénarios d'accès et les dépendances précises de la personne A envers la
personne B sont dans [access-verification.md](access-verification.md).

## Routes proposées, non implémentées

Toutes les lignes suivantes sont **à valider avec la personne B**, y compris
DTO, erreurs, paramètres, pagination et transport.

| Méthode / chemin proposé | Usage / adaptateur |
| --- | --- |
| POST /api/auth/login | login(email,password), session serveur. |
| POST /api/auth/logout | logout(), invalider session et flux ouverts. |
| GET /api/session | Identité, rôle et expiration. |
| GET /api/me/device | Appareil et fraîcheur du patient de la session. |
| GET /api/me/measurements | Mesures/historique patient, période, qualité et curseur. |
| GET /api/me/measurements/export | CSV des mêmes filtres, autorisé côté serveur. |
| GET /api/me/alerts | Épisodes du patient de la session. |
| GET /api/patients | getAssignedPatients(), uniquement les patients affectés. |
| GET /api/patients/{id} | getPatient(id), contrôle d'affectation. |
| GET /api/patients/{id}/measurements | getMeasurements/getHistory, période, qualité et pagination. |
| GET /api/patients/{id}/measurements/export | Export de la sélection, après autorisation. |
| GET /api/alerts | getAlerts(patientId,state), limité aux patients autorisés. |
| POST /api/alerts/{id}/acknowledgements | acknowledgeAlert(id,note), auteur et heure côté serveur ; aucune résolution implicite. |
| GET / POST /api/admin/accounts | Liste et création de compte. |
| PATCH /api/admin/accounts/{id} | Rôle et activation. |
| GET / POST /api/admin/assignments | Liste et association patient-professionnel. |
| DELETE /api/admin/assignments/{professionalId}/{patientId} | Retrait et révocation des accès concernés. |
| GET / POST /api/admin/devices | Liste et enregistrement. |
| PATCH /api/admin/devices/{id}/assignment | Association avec historique d'affectation. |
| POST /api/admin/devices/{id}/revocation | Révocation. |
| GET /api/admin/services | État opérationnel réel et dernière vérification. |
| GET /api/admin/model | Disponibilité, version, mode, sans données physiologiques. |
| WebSocket /api/events | Abonnements autorisés aux mesures, états et épisodes. |

Chaque API, export et abonnement WebSocket exige une autorisation serveur,
réévaluée après changement de rôle ou d'affectation. Le patient est déduit de la
session. L'administrateur reste limité aux métadonnées, même si un identifiant ou
une URL est modifié. Prévoir cookies HttpOnly/Secure, CSRF, expiration et révocation.

À convenir : formats UTC, unités, qualité et états d'épisode, identifiants, versions
de règle/modèle, preuves facultatives, réponse d'acquittement, enveloppes d'événement,
reprise après reconnexion et erreurs ne révélant pas un autre patient.
