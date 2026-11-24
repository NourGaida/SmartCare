# Validation SmartCare – Personne A

Vérification locale du 24 novembre 2026 sur `feat/mlops-validation`, issue des PR #10 et #11.

## Matrice O1–O10

Les définitions et les cibles ci-dessous reprennent la section 2.3 du
[cahier des charges, page 8 du PDF](SmartCare_Scope_Statement.pdf#page=8).
Le statut porte sur l'objectif complet. Les résultats observés indiquent la
partie couverte par les essais locaux.

| Objectif | Définition et attendu | Scénario | Résultat observé | Statut | Preuve |
| --- | --- | --- | --- | --- | --- |
| O1 | **Live display:** target p95 acquisition-to-browser delay at most 5 s on a controlled network, with synchronized clocks, one derived message/s/device and ten simulated devices. Record sample counts and environment. | Jouer `sustained`, suivre les deux sessions, puis mesurer acquisition → navigateur avec dix appareils et des horloges synchronisées. | Les deux sessions HTTP voient les mêmes 37 mesures sur un appareil pendant le scénario. Le p95 dans le navigateur à dix appareils reste à mesurer. | À vérifier | [Intégration connectée](../../frontends/tests/integration/connected-care.test.mjs) |
| O2 | **Persistent alerts:** one episode per scripted qualifying deviation; isolated spikes do not trigger an event. Measure processing delay separately from configured persistence. | Jouer `spike` puis `sustained`, vérifier les alertes persistées et séparer délai de traitement et fenêtre de confirmation. | Le scénario isolé ne crée aucune alerte persistée. Le scénario soutenu donne un épisode confirmé et l'acquittement persiste. Le détecteur distingue le démarrage technique de la confirmation. Le délai de traitement seul reste à mesurer. | À vérifier | [Intégration connectée](../../frontends/tests/integration/connected-care.test.mjs), [test d'épisodes Java](../../middleware/api/src/test/java/com/smartcare/api/ConnectedCareResourceTest.java) |
| O3 | **Authorization:** cross-patient, unassigned-professional and administrator-history denial tests pass for REST, exports and WebSocket subscriptions. | Tenter l'accès avec un identifiant patient modifié, un professionnel non affecté et un administrateur, sur les trois transports. | Java confirme l'isolation des patients, le refus de l'historique patient pour un administrateur et les restrictions d'affectation. Le driver de la matrice REST, export et WebSocket n'est pas configuré. | À vérifier | [Tests d'historique Java](../../middleware/api/src/test/java/com/smartcare/api/auth/PatientMeasurementsResourceTest.java), [tests d'affectation](../../middleware/api/src/test/java/com/smartcare/api/ConnectedCareResourceTest.java), [suite d'accès](../../frontends/tests/integration/access-server.test.mjs) |
| O4 | **Quality/freshness:** invalid samples never enter physiological decisions; device silence produces a visible stale state. | Jouer `invalid` et simuler le silence d'un appareil. Contrôler décision, courbes et fraîcheur. | Les échantillons invalides coupent la fenêtre ML et les courbes. Les 18 mesures du scénario, dont 3 invalides, ne donnent pas de nouvelle alerte. L'état obsolète du capteur connecté reste à vérifier visuellement. | À vérifier | [Test MQTT](../../iot/mlops/tests/test_mqtt_inference.py), [tests des courbes](../../frontends/tests/connected-care.test.mjs), [tests du détecteur](../../iot/detection/tests/) |
| O5 | **History:** interval queries and authorized exports match stored records, timestamps and identity. | Ouvrir une session patient, consulter MongoDB via l'historique et comparer sélection, période, identité et CSV. | La lecture teste les mesures MongoDB du patient et ignore une identité client modifiée. Les tests frontend comparent le CSV à la sélection filtrée. Le filtrage se fait côté frontend et une requête REST d'intervalle reste à vérifier. | À vérifier | [Test HTTP patient](../../frontends/tests/integration/patient-history-http.test.mjs), [tests de l'historique](../../frontends/tests/patient-history.test.mjs) |
| O6 | **Two PWAs:** independent manifests, identifiers, start URLs and service-worker scopes; installation and responsive checks at 360 px and desktop width. | Contrôler les deux manifestes, installer séparément les applications, vérifier leur ouverture à 360 px et sur ordinateur. | Identifiants, URL de lancement, icônes et caches statiques distincts vérifiés par Node. Les preuves d'installation et de rendu navigateur restent à produire. | À vérifier | [Tests PWA](../../frontends/tests/frontend.test.mjs), [guide HTTPS](../https-pwa/README.md) |
| O7 | **ML reproducibility:** preserve dataset hash, split, features, seed, parameters and dependencies to reproduce reported metrics within a declared tolerance. | Rejouer les features et scores de validation, puis refaire l'entraînement depuis le snapshot et le split verrouillés. | Les features et le score d'une fenêtre sont reproductibles. Le seuil de l'artefact correspond au p95 des 3 802 scores de validation. Le hash du dataset, le manifeste de split et la tolérance de reproduction du modèle restent à confirmer. | À vérifier | [Tests d'inférence](../../iot/mlops/tests/test_inference.py), [rapport BIDMC](../../iot/mlops/reports/bidmc/evaluation_real.json) |
| O8 | **ML serving:** attach model/feature versions to scores, test invalid-input and timeout fallback, and target p95 inference below 500 ms on the recorded CPU environment. | Envoyer une fenêtre valide puis des entrées invalides, simuler un timeout et mesurer le p95 sur le CPU local. | Les entrées invalides donnent 422. Le timeout de 10 s est simulé dans le transport MQTT. Les règles produisent encore un épisode. FastAPI en processus retourne un p95 de 19,15 ms sur 100 appels, Windows 11, Intel64 Family 6 Model 140. Les scores n'incluent pas de versions modèle et features. | À vérifier | [Tests d'inférence](../../iot/mlops/tests/test_inference.py), [tests MQTT](../../iot/mlops/tests/test_mqtt_inference.py) |
| O9 | **Model release:** block a failing candidate and demonstrate fixed-version deployment, audit and rollback. | Opposer un candidat à p95 > 500 ms, une version de sérialisation incompatible et un artefact altéré, puis tester déploiement et retour à la version approuvée. | Le critère temporel rejette les durées simulées trop élevées. Les deux artefacts locaux invalides sont rejetés au chargement. Le déploiement par version immuable, l'audit et le rollback restent à valider. | À vérifier | [Tests des critères et artefacts](../../iot/mlops/tests/test_inference.py), [cahier des charges §5.6.2](SmartCare_Scope_Statement.pdf#page=20) |
| O10 | **Delivery evidence:** link sources, both PWA builds, installation instructions, tests, model card and communication assets to a release tag. | Vérifier un tag de livraison avec les sources, les deux portails, leurs guides, les tests, la fiche modèle et les supports. | Guides, portails et tests présents. La fiche modèle est vide et le dépôt local ne contient pas de tag de livraison. | À vérifier | [Sources et installation](../../frontends/README.md), [CI](../../.github/workflows/ci.yml), [fiche modèle](model-card.md) |

## Inférence, critères et parité

Le service [FastAPI](../../iot/mlops/api/main.py) charge le modèle BIDMC et
reçoit, sur `POST /predict`, `deviceId` et cinq mesures consécutives à une
seconde d'intervalle. Chaque mesure contient `timestampSeconds` (entier ≥ 0),
`heartRate` (30–220) et `spo2` (50–100). Le score est le négatif de
`decision_function`. Un score supérieur ou égal au seuil de validation signale
une fenêtre inhabituelle. Le résultat est rendu en `shadow` avec
`clinicalAlert: false`.

| Cas | Vérification locale |
| --- | --- |
| Modèle compatible | Le vrai bundle se charge. `/health`, `/model-info` et deux prédictions identiques sont vérifiés avec le client ASGI. |
| Performance sous la cible | Le critère p95 ≤ 500 ms (section 5.5.4) rejette un candidat à 501 ms simulés en queue de distribution, même si sa médiane est basse. Le seuil de score BIDMC sert à signaler des fenêtres et non à qualifier la performance d'un modèle. |
| Réponse tardive | Le client MQTT transmet son délai de 10 s et le transport simulé signale `ReadTimeout`. Aucun score de remplacement n'est produit. Le détecteur réel confirme l'épisode avec les mêmes mesures d'essai. Le délai de 1 s en §5.4 est encore une cible du cahier des charges. |
| Version incompatible | Un estimateur local sérialisé avec un marqueur scikit-learn incompatible déclenche un refus au chargement. Le bundle BIDMC encode scikit-learn 1.9.1. La règle fonctionnelle sur les versions du modèle et des features reste à confirmer. |
| Fichier endommagé | Une copie d'essai tronquée échoue au chargement. Le service est alors indisponible. Le fichier du dépôt reste intact. |

La section 5.5.4 demande la parité des règles d'éligibilité et des features
offline/online. Le [test de parité](../../iot/mlops/tests/test_inference.py)
compare les dix features et leur ordre entre
[`features_real.extract_features`](../../iot/mlops/src/features_real.py) et
[`main.extract_features`](../../iot/mlops/api/main.py). Il compare aussi le
score calculé hors ligne avec celui de `POST /predict` et vérifie le refus d'une
fenêtre traversant un trou. Cette preuve couvre les fenêtres de cinq mesures
du code actuel. Le prétraitement offline interpole certains trous et le
consommateur MQTT réinitialise sa fenêtre. La parité complète de ces traitements
et la fenêtre de 60 s décrite en §5.5.2 restent à valider.

Le test MQTT passe un message conforme au consommateur à FastAPI et vérifie
que le score et le mode sont observables en journal sans publication d'alerte.
Ce consommateur s'abonne à `smartcare/v1/devices/+/readings` et attend
`patientId`, `timestamp`, `valid: true` et `quality: "GOOD"`.
Le parcours connecté utilise `smartcare/v1/persisted/+` pour le détecteur à
règles, avec `acquiredAtUtc` et `quality: "good"`. L'essai MQTT sur des messages
dédiés confirme le mode shadow du consommateur actuel. Le raccordement à la
chaîne du portail reste à confirmer.

## Résultats et reproduction

- Frontend Node 22 et syntaxe JavaScript vérifiés, 98 tests réussis.
- Maven `verify` avec MongoDB et Mosquitto, 84 tests réussis.
- Python 3.14, 35 tests MLOps (mesure de latence comprise), 33 tests du
  détecteur et 27 tests du simulateur réussis.
- WildFly local après redéploiement, cinq tests et sous-tests HTTP réussis.
  Session et historique renvoient 200 après connexion. Le scénario normal
  enregistre 15 mesures, le pic 26 et le soutenu 37. L'alerte du scénario
  soutenu est visible dans les deux sessions et son acquittement persiste.
  L'inférence est restée indisponible sur le port 8001 pendant cet essai.
  Voir les [tests connectés](../../frontends/tests/integration/connected-care.test.mjs)
  et le [test HTTP patient](../../frontends/tests/integration/patient-history-http.test.mjs).
- Essai isolé avec Mosquitto local (1885) et FastAPI (18001).
  Les routes `/health` et `/model-info` répondent 200. Après cinq publications
  de test sur le topic du consommateur, le journal montre
  `Score: 0.026291602905371803`, `Flagged: True` et `Mode: shadow`.
  Voir le [test reproductible du consommateur](../../iot/mlops/tests/test_mqtt_inference.py).
- La suite d'accès historique ignore 15 cas sans `SMARTCARE_SERVER_DRIVER`.
  En exécutant la commande du job MLOps, 67 tests passent et seul le test de
  latence sur CPU est ignoré. Il a été lancé localement avec
  `SMARTCARE_MEASURE_INFERENCE=1`.
- Le rendu de la page et l'installation des PWA restent à vérifier dans un
  navigateur. Les états de la page administrateur ont été vérifiés avec
  des réponses simulées. Voir les [tests de l'état du modèle](../../frontends/tests/model-status.test.mjs).

Depuis la racine, dans PowerShell avec Node 22, Python 3.14, JDK 25 et Maven :

```powershell
py -3.14 -m venv .\target\mlops-venv
$python = '.\target\mlops-venv\Scripts\python.exe'
& $python -m pip install -r .\iot\mlops\requirements-test.txt
node --test (Get-ChildItem .\frontends\tests\*.test.mjs).FullName
node --test .\frontends\tests\integration\access-server.test.mjs
$env:SMARTCARE_MEASURE_INFERENCE = '1'
try {
    $testTemp = Join-Path (Resolve-Path .\target).Path ('mlops-pytest-' + [Guid]::NewGuid().ToString('N'))
    & $python -m pytest -q -rs -s -p no:cacheprovider --basetemp $testTemp iot/mlops/tests iot/detection/tests
} finally {
    Remove-Item Env:SMARTCARE_MEASURE_INFERENCE
}
& $python -m unittest iot.simulator.tests.test_simulator
mvn -f .\middleware\pom.xml verify
```

Le test Java d'intégration exige MongoDB et Mosquitto sur les ports de test
du [workflow](../../.github/workflows/ci.yml).

Pour les tests HTTP, démarrer le [profil connecté](../connected-care.md) avec
le WAR de cette branche. Utiliser le fichier d'identifiants créé par
l'initialisation des comptes locaux. Le test des scénarios enregistre des
mesures et des alertes d'essai dans MongoDB.

```powershell
$env:SMARTCARE_CARE_URL = 'http://localhost:8085/smartcare/'
$env:SMARTCARE_SERVER_URL = $env:SMARTCARE_CARE_URL
$env:SMARTCARE_SEED_PASSWORD = (Import-Clixml .\target\local-care-credential.clixml).GetNetworkCredential().Password
$env:SMARTCARE_PATIENT_EMAIL = 'hadil.karous@smartcare.local'
$env:SMARTCARE_PATIENT_PASSWORD = $env:SMARTCARE_SEED_PASSWORD
$env:SMARTCARE_EXPECTED_PATIENT_ID = 'sc-patient-hadil'
try {
    node --test .\frontends\tests\integration\patient-history-http.test.mjs .\frontends\tests\integration\connected-care.test.mjs
} finally {
    Remove-Item Env:SMARTCARE_CARE_URL, Env:SMARTCARE_SERVER_URL, Env:SMARTCARE_SEED_PASSWORD,
        Env:SMARTCARE_PATIENT_EMAIL, Env:SMARTCARE_PATIENT_PASSWORD, Env:SMARTCARE_EXPECTED_PATIENT_ID
}
```

## Raccordements à confirmer

**B** — Implémenter `GET /smartcare/api/admin/model` dans WildFly (ou
`/api/admin/model` derrière le proxy). La route prévue est réservée à
`ADMIN` avec la session SmartCare. Confirmer l'enveloppe
`{ "model": { "available": true, "version": "...", "mode": "shadow" } }`,
les réponses absence/indisponibilité et les codes 401/403. Pour afficher les
métriques et la dernière mise à jour, définir leurs noms, unités, provenance
et horodatage UTC. Avec une session professionnelle, le WildFly de test
renvoie actuellement 404. Le portail appelle cette route sur sa propre
origine et affiche **Analyse indisponible**. Voir le
[contrat prévu](../api/contract.md#get-apiadminmodel--planned).

**B** — Préciser les routes d'export et de WebSocket, l'autorisation à chaque
abonnement, ainsi que les sessions et données de test pour compléter O3 et O5.
Pour O9, fournir la procédure de déploiement fixe et les preuves d'audit et
de rollback (T9).

**C** — Fournir le snapshot BIDMC et son hash, le manifeste de split, la
tolérance de reproduction, la fiche modèle, les versions modèle/features et
leur règle de compatibilité. Confirmer le raccordement MQTT ou HTTP et la
source de métadonnées à transmettre à B. Pour un seuil d'acceptation fondé sur
le rappel, la précision ou le taux de fausses alertes, fournir un jeu labellisé
indépendant et la règle d'acceptation validée. Le rapport BIDMC actuellement
livré fournit des statistiques de scores et de fenêtres, sans labels d'anomalie.

**PSI** — Le cahier des charges §5.6.3 propose une revue au-delà de 0,2 après
200 fenêtres éligibles dans deux lots successifs. T10 attribue la vérification
des critères et des replis à R1. Aucune tâche PSI n'est attribuée séparément
à la personne A. La comparaison nécessite les bins fixes par feature issus
de l'entraînement, leurs effectifs ou proportions de référence, le lissage
des bins vides, les règles de constitution des lots et la version de features
associée. C doit fournir ces éléments et l'équipe confirmer le responsable.
Les CSV de scores disponibles ne définissent pas les distributions de
référence par feature. Les essais stable/décalé restent en attente de ces
données. [Cahier des charges §5.6.3](SmartCare_Scope_Statement.pdf#page=20),
[répartition §8.2](SmartCare_Scope_Statement.pdf#page=27)
