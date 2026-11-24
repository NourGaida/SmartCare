# Frontoffice — portail patient et historique

Le parcours connecté s'ouvre sur http://localhost:8085/smartcare/frontends/frontoffice/
avec **Sign in** ou **Sign up**. Après connexion, **History**, **Alerts** et
**Device** utilisent la session SmartCare et les données MongoDB. Voir le
[guide de lancement et de vérification](../../docs/connected-care.md).

Les notes ci-dessous retracent la préparation et la validation du premier
historique patient avant le raccordement complet.

HTML/CSS/JavaScript natifs ; aucune installation npm ni compilation frontend.

## Ouvrir localement avec le JSON fictif

Depuis la racine, dans PowerShell :

~~~powershell
py -3 -m http.server 8081 --bind 127.0.0.1
~~~

Ouvrir http://127.0.0.1:8081/frontends/frontoffice/, cliquer
**Use fictional patient account**, puis **History**. Le formulaire accepte aussi
patient@smartcare.demo / demo-patient. Cette connexion reste une démo non sécurisée.

History utilise le [même exemple JSON](fixtures/measurement-history.json) que les
tests : six mesures, dates fixes du 17 novembre 2026, une mesure invalide et une
interruption. La bannière **FICTIONAL DEMO** indique explicitement leur origine.
Le dashboard conserve son flux fictif existant, distinct de cet exemple historique.

Le tableau et les deux courbes affichent les données dans l'ordre chronologique.
Heart rate est en bpm, Blood oxygen en %. Les dates à l'écran sont dans le fuseau
du navigateur ; le CSV conserve des dates UTC.
Les filtres s'appliquent aux lignes reçues ; en démo, les périodes relatives
sont ancrées sur la dernière date de l'exemple, pas sur l'heure de consultation.
**Export CSV** utilise toute la sélection filtrée, indépendamment de la page.

## Utiliser la session serveur existante

Construire et déployer le WAR selon le [guide serveur](../../middleware/api/README.md),
puis ouvrir http://localhost:8080/smartcare/frontends/frontoffice/ sur la même
origine que l'API. Se connecter avec un compte patient fourni/provisionné pour
le backend. Après Sign in ou restauration de session, l'écran Reading history
s'ouvre directement. Les autres écrans serveur ne sont pas encore raccordés.

Le parcours existant est conservé : POST /smartcare/api/auth/login, vérification
GET /smartcare/api/session, puis GET /smartcare/api/me/measurements.
Le navigateur envoie le cookie HttpOnly avec credentials: same-origin ; aucun
patientId, userId, cookie lisible en JavaScript ou token d'authentification n'est
ajouté à la requête de mesures. Le backend déduit le patient de la session.

**La route des mesures est implémentée dans le WAR construit depuis cette branche.**
Elle lit uniquement les mesures MongoDB dont le patientId correspond au userId
de la session PATIENT. Redéployer le WAR pour l'utiliser ; les erreurs restent
affichées sans remplacement par le JSON fictif.

| Réponse / état | Affichage |
| --- | --- |
| Requête en cours | Loading measurements… ; ancien contenu retiré, export désactivé. |
| Liste avec des mesures | Deux courbes et tableau chronologiques, filtres, pagination locale et CSV. |
| Liste vide | No measurements are available yet. |
| Erreur HTTP, réseau, JSON ou format | Message d'indisponibilité/format et bouton Retry ; Reload measurements permet aussi de relancer. |
| HTTP 401 | Effacement des données, retour à la connexion, message Your session has expired. Sign in again. |
| Sign out | Déconnexion existante avec CSRF, effacement des séries et annulation de la requête en cours. |

Une réponse tardive après déconnexion ou une ancienne requête ne peut pas
réafficher les mesures ni fermer une nouvelle session.

## Adaptateur et contrat

- measurements-adapter.mjs : requête sans cache et conversion unique dans
  normalizeMeasurements. Ajuster cette fonction quand B confirmera le DTO.
- history.mjs : états, filtres, pagination, contrôleur de l'écran et courbes/CSV
  réutilisés depuis shared/ui.mjs.
- server-history.mjs : montage de cet écran pour une session patient réelle.
- portal.mjs : entrée dédiée au patient ; sélection explicite du portail patient.
- ../shared/server-portal.mjs : connexion existante, restauration de session et
  ouverture de History après connexion. ../shared/portal.mjs reste l'entrée
  compatible utilisée par la supervision et les anciennes pages.
- fixtures/measurement-history.json : réponse fictive publique pour la démo/tests.
- index.html, styles.css : écran et design turquoise existants.

Le serveur renvoie une enveloppe measurements (l'adaptateur accepte aussi une liste brute). Chaque ligne
contient acquiredAtUtc (ISO 8601 avec fuseau), heartRate (nombre en bpm ou null),
spo2 (nombre en % ou null), quality (good/invalid), reason et, si disponibles,
deviceId et source. La conversion trie les dates, conserve les nulls invalides
et refuse un format inconnu plutôt que de le présenter comme un historique vide.
Le contrôleur ne connaît pas les champs JSON du serveur.

La route renvoie toutes les mesures du patient, par date croissante, sans
pagination serveur. À compléter avec B : pagination/curseur, filtres et limites
de volume. La pagination actuelle concerne uniquement les mesures de la réponse
reçue ; aucun curseur serveur n'est encore traité. Les erreurs serveur sont
401 (session), 403 (rôle), 503 (MongoDB indisponible).
Voir la [proposition API](../../docs/frontend/api-proposal.md) et la
[matrice d'intégration](../../docs/frontend/access-verification.md).

## Cache et hors ligne

Le code statique figure dans le cache smartcare-patient-static-v6.
L'entrée patient enregistre aussi le worker en mode serveur avec updateViaCache:
none. Son installation remplace les anciens caches patient ; elle ne vide pas
les données ou caches des autres applications. Le worker reste network-first.
Les réponses API et le JSON des mesures fictives sont demandés avec cache: no-store
et ne sont pas ajoutés au service worker. Aucune mesure n'est persistée.
Hors ligne, le shell de démo peut s'ouvrir, mais le chargement de ce JSON affiche
une erreur réessayable. Il ne restaure aucun historique de santé sauvegardé.

## Tests

Depuis la racine, avec Node 22 :

~~~powershell
node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs frontends/tests/patient-history.test.mjs
node --test frontends/tests/patient-history.test.mjs
~~~

Les tests ciblés utilisent des réponses HTTP simulées pour les états, la session,
les dates/units, les courbes, filtres/CSV, erreurs/retry et annulation. Le contrôleur
est aussi testé avec une frontière DOM minimale fondée sur le vrai markup :
ce n'est pas une vérification en navigateur ni une intégration avec l'API réelle.
Aucun navigateur n'était disponible pour la vérification visuelle de cette version.

## Vérifier le WAR déployé et une vraie connexion

Le 17 novembre 2026, les ressources servies sur localhost:8080 ont été comparées
octet par octet au WAR et à la branche locale : aucune divergence constatée.
Le texte « Signed in as … / Measurements and alerts will appear … » appartient
à l'écran de session de supervision ; le patient dispose désormais de sa propre
entrée ./portal.mjs, qui ouvre explicitement History.

Un défaut serveur distinct a été reproduit avec une vraie connexion : login 200,
session 200, mais mesures 500 (RESTEasy ne fournit pas ContainerRequestContext
dans la ressource). La ressource lit maintenant l'attribut de session via
HttpServletRequest, synchronisé avec les propriétés du filtre JAX-RS.

Après reconstruction et redéploiement via jboss-cli, le test HTTP a obtenu :

| Étape sur http://localhost:8080 | Résultat observé |
| --- | --- |
| Session / mesures avant connexion | 401 / 401 |
| POST /smartcare/api/auth/login, compte patient existant | 200, dev-patient-1 / PATIENT |
| GET /smartcare/api/session avec le nouveau cookie | 200 |
| GET /smartcare/api/me/measurements avec le même cookie | 200 ; mesure existante 75 bpm / 98 % présente |
| Paramètres patientId/userId forgés | Même historique du patient connecté |
| Déconnexion CSRF puis session / mesures | 401 / 401 |

Le test ne modifie ni le mot de passe, ni le compte, ni les mesures. Le cookie
créé par la connexion reste en mémoire et la session est fermée à la fin.
Pour le reproduire depuis la racine, avec le WAR déjà déployé :

~~~powershell
$taskPassword = Read-Host 'Mot de passe patient' -AsSecureString
$taskCredentials = [pscredential]::new('patient@smartcare.local', $taskPassword)
$env:SMARTCARE_PATIENT_EMAIL = $taskCredentials.UserName
$env:SMARTCARE_PATIENT_PASSWORD = $taskCredentials.GetNetworkCredential().Password
$env:SMARTCARE_EXPECTED_PATIENT_ID = 'dev-patient-1'
try {
  node --test frontends/tests/integration/patient-history-http.test.mjs
} finally {
  Remove-Item Env:SMARTCARE_PATIENT_PASSWORD
  $taskPassword.Dispose()
  Remove-Variable taskCredentials,taskPassword
}
~~~

Sans ces variables, ce test HTTP est explicitement ignoré. Il exige une mesure
existante good à 75 bpm / 98 %. Il est distinct des tests frontend simulés et de
la matrice d'accès complète encore bloquée pour les routes professionnel/CSV/live.

Vérification manuelle restante (aucun navigateur pilotable disponible) :

1. Ouvrir http://localhost:8080/smartcare/frontends/frontoffice/ ; conserver ce
   nom d'hôte, sans alterner avec 127.0.0.1.
2. Saisir patient@smartcare.local et le mot de passe de développement ; cliquer
   **Sign in**. Attendre **Reading history**, le menu **History** et **SERVER MODE**.
3. Sélectionner **All returned readings** et **All readings** : retrouver la
   ligne **75 bpm** / **98%**. L'exemple JSON fictif ne doit pas être chargé.
4. Dans Réseau des outils développeur, vérifier session et me/measurements à
   200, ainsi que ./portal.mjs et ../shared/server-portal.mjs. Recharger la page :
   une session valide doit rouvrir History.
5. Si une ancienne page reste affichée, cocher **Bypass for network** dans
   Application > Service Workers, puis recharger. Vérifier le worker patient v6
   et ses seules ressources statiques ; ne pas effacer tout le stockage de l'origine.
6. Cliquer **Sign out** : retour au formulaire. /api/session et /api/me/measurements
   doivent ensuite renvoyer 401.

Les contrôles du cache exécutés dans Node sont simulés ; le cache du navigateur
et le rendu visuel de ce parcours restent à vérifier manuellement.
