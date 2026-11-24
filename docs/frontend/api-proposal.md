# Frontend / backend — à valider avec la personne B

## Routes d’authentification intégrées à main

Le WAR préfixe les chemins par `/smartcare`. Les routes de santé sont `GET /api/health`,
`GET /api/health/database` et `GET /api/health/ingestion`.

| Méthode / chemin | Contrat utilisé par le frontend |
| --- | --- |
| `POST /api/auth/login` | JSON `{email,password}`. Le serveur renvoie un cookie de session HttpOnly. |
| `POST /api/auth/signup` | JSON `{name,email,password}`. Crée un PATIENT et renvoie 201. Entrée invalide 400, adresse déjà utilisée 409. |
| `GET /api/session` | Renvoie `userId`, `role`, `csrfToken`, `expiresAt` et `displayName` si disponible. Les portails vérifient cette réponse après la connexion. |
| `POST /api/auth/logout` | Invalide la session avec le cookie et l'en-tête `X-CSRF-Token`. |

L'historique patient et le parcours connecté décrit ci-dessous sont implémentés.
La connexion serveur est
ouverte depuis les portails servis par le WAR sur la même origine que l'API.

Les scénarios d'accès et les dépendances précises de la personne A envers la
personne B sont dans [access-verification.md](access-verification.md).

## Routes du parcours connecté

| Méthode / chemin | Accès et données |
| --- | --- |
| GET /api/me/devices | Appareils actuellement associés au patient de la session. |
| GET /api/me/alerts | Alertes de règle du patient de la session. |
| GET /api/me/latest-simulation | Dernière exécution du patient de la session ou `{"run":null}`. Le tableau de bord charge cet état toutes les secondes. |
| GET /api/patients | Patients actifs affectés au professionnel de la session, appareils et dernières mesures. |
| GET /api/patients/{id}/measurements | Mesures du patient, avec la même enveloppe que /me/measurements. Affectation obligatoire. |
| GET /api/patients/{id}/alerts | Épisodes de règle du patient affecté, avec l'acquittement et sa note. |
| POST /api/patients/{id}/alerts/{alertId}/acknowledgements | JSON `{note}`, cookie professionnel affecté et CSRF. Le premier acquittement est conservé. |
| POST /api/patients/{id}/simulations | JSON `{deviceId,scenario}`, cookie professionnel affecté et CSRF. État initial 202 et `{id}`. |
| GET /api/patients/{id}/simulations/{idExécution} | État et mesures enregistrées de l'exécution, avec contrôle de l'affectation. |
| GET /api/patients/{id}/latest-simulation | Même état que côté patient. Le paramètre facultatif `deviceId` restreint la sélection à un appareil. Affectation obligatoire. |

Les réponses de données sont `Cache-Control: no-store`. Une session absente ou
expirée donne 401. Un rôle ou une affectation insuffisants donnent 403. Les
listes vides sont renvoyées avec 200. Voir le [guide du parcours connecté](../connected-care.md).

Les exécutions et leurs mesures restent dans MongoDB. La réponse `run` contient
`id`, `deviceId`, `scenario`, `startedAt`, `status`, `expected` et `measurements`.
Le scénario `invalid` enregistre les valeurs nulles pour les trois mesures
indisponibles. Les alertes possèdent un `startedAt` lorsqu'il a été retrouvé
dans les mesures de l'épisode, et un `confirmedAt` distinct. Les alertes anciennes
sans heure de début gardent leur heure de confirmation.

## Routes proposées

Toutes les lignes suivantes sont **à valider avec la personne B**, y compris
DTO, erreurs, paramètres, pagination et transport.

| Méthode / chemin proposé | Usage / adaptateur |
| --- | --- |
| GET /api/me/measurements/export | CSV des mêmes filtres, autorisé côté serveur. |
| GET /api/patients/{id} | getPatient(id), contrôle d'affectation. |
| GET /api/patients/{id}/measurements/export | Export de la sélection, après autorisation. |
| GET /api/alerts | getAlerts(patientId,state), limité aux patients autorisés. |
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

## Historique patient implémenté — 17 novembre 2026

La branche feat/patient-measurement-history raccorde l'écran existant à
PatientMeasurementsResource et au dépôt MongoDB MeasurementRepository.

- Route implémentée : GET /smartcare/api/me/measurements, sans identifiant patient.
- Le filtre existant valide le cookie et fournit la session. Seul le rôle PATIENT
  est admis. Le userId de session correspond au patientId enregistré à l'ingestion.
- MongoDB est filtré sur ce patientId ; les paramètres client patientId/userId
  sont ignorés. Les mesures sans propriétaire sont exclues, même pour le même appareil.
- Cookie de session existant envoyé sur la même origine, cache: no-store.
- La conversion est isolée dans
  [normalizeMeasurements](../../frontends/frontoffice/measurements-adapter.mjs).
- Le [JSON fictif](../../frontends/frontoffice/fixtures/measurement-history.json)
  est utilisé par les tests et le mode démo, avec une origine fictive visible.
- Le serveur renvoie l'enveloppe measurements ; champs
  acquiredAtUtc, heartRate, spo2, quality, reason, deviceId et source.
- Dates normalisées en millisecondes et triées pour l'interface ; bpm et %
  conservés sans conversion d'échelle. Les valeurs invalides restent nulles.
- Liste vide : état vide. Réseau/HTTP/JSON invalide : erreur et Retry. HTTP 401 :
  effacement puis retour au formulaire de connexion. Aucun fallback fictif en serveur.

Le serveur trie par acquiredAt croissant puis deviceId/bootId/sequence, renvoie
200 avec une liste vide en l'absence de mesures, 401 pour une session absente,
expirée ou révoquée, 403 pour un rôle autre que PATIENT et 503 si le dépôt MongoDB
est indisponible. La réponse porte Cache-Control: no-store.

~~~json
{"measurements":[{"acquiredAtUtc":"2026-11-17T12:00:00Z","heartRate":75,"spo2":98,"quality":"good","reason":null,"deviceId":"sc-001","source":"simulated"}]}
~~~

Les nombres sont en bpm et %, sans conversion d'échelle. Les mesures invalides
conservent heartRate/spo2 à null et leur reason. Aucun identifiant de patient,
cookie ou document MongoDB brut n'est renvoyé. Une source absente est null.

À compléter avec B : filtres/pagination serveur et limites de volume. Cette
première route renvoie toutes les mesures appartenant au patient ; le frontend
filtre et pagine localement les lignes reçues, sans curseur serveur.

PatientMeasurementsResourceTest utilise deux connexions fictives, de vraies
sessions et une base MongoDB temporaire isolée. Il couvre l'isolation, les
identifiants forgés, les nulls, les erreurs et les refus d'accès. Le contexte
JAX-RS est simulé : ce test ne valide pas un déploiement HTTP/WildFly.
