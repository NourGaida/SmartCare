# Frontend / backend — à valider avec la personne B

## Routes implémentées sur `feature/auth-login`

Le WAR préfixe les chemins par `/smartcare`. Les routes de santé sont `GET /api/health`,
`GET /api/health/database` et `GET /api/health/ingestion`.

| Méthode / chemin | Contrat utilisé par le frontend |
| --- | --- |
| `POST /api/auth/login` | JSON `{email,password}`. Le serveur renvoie un cookie de session HttpOnly. |
| `GET /api/session` | Renvoie `userId`, `role`, `csrfToken` et `expiresAt`. Les portails vérifient cette réponse après la connexion. |
| `POST /api/auth/logout` | Invalide la session avec le cookie et l'en-tête `X-CSRF-Token`. |

Les routes métier et le WebSocket restent à implémenter. La connexion serveur est
ouverte depuis les portails servis par le WAR sur la même origine que l'API.

Les scénarios d'accès et les dépendances précises de la personne A envers la
personne B sont dans [access-verification.md](access-verification.md).

## Routes proposées, non implémentées

Toutes les lignes suivantes sont **à valider avec la personne B**, y compris
DTO, erreurs, paramètres, pagination et transport.

| Méthode / chemin proposé | Usage / adaptateur |
| --- | --- |
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
