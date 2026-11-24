# SmartCare connecté sur Windows

Les deux portails utilisent le WAR SmartCare et la base MongoDB locale. Le
profil ci-dessous utilise WildFly sur 8085, un broker sur 1885 et Node-RED sur
1886. Il peut tourner à côté du profil HTTPS sur 8080.

## Initialiser et lancer

Démarrer Docker Desktop. Depuis la racine du dépôt, avec Node 22, Python 3.10
ou plus, JDK 25, Maven et WildFly 42 installés :

```powershell
Set-Location 'C:\projet cot\SmartCare'
if (-not (Test-Path .\.venv-simulator\Scripts\python.exe)) {
    py -3 -m venv .venv-simulator
}
.\.venv-simulator\Scripts\python.exe -m pip install -r .\iot\simulator\requirements.txt
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\init-local-care.ps1

$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot'
$wildfly = "$env:USERPROFILE\Tools\wildfly-42.0.0.Final"
$maven = (Get-ChildItem "$env:USERPROFILE\.m2\wrapper\dists\apache-maven-3.9.12" -Recurse -Filter mvn.cmd |
    Select-Object -First 1).FullName
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local-care.ps1 -WildFlyHome $wildfly -JavaHome $jdk -Maven $maven
```

Adapter les chemins JDK et WildFly à la machine. Utiliser `-Maven mvn` si Maven
est sur le PATH. Le lancement vérifie la disponibilité de MongoDB, du WAR, de
l'ingestion et du détecteur. Quand 8085 est déjà occupé par ce profil, ouvrir
les URL ci-dessous. Les journaux WildFly et Python sont sous
`target/wildfly-connected/`.

| Interface | URL |
| --- | --- |
| Patient | http://localhost:8085/smartcare/frontends/frontoffice/ |
| Supervision | http://localhost:8085/smartcare/frontends/backoffice/ |
| Simulation des capteurs | http://localhost:8085/smartcare/frontends/backoffice/#simulation |

### Comptes et provenance

| Rôle | Nom | Adresse | Appareil |
| --- | --- | --- | --- |
| Patient | Hadil Karous | hadil.karous@smartcare.local | sc-test-hadil |
| Patient | Nour Shili | nour.shili@smartcare.local | sc-test-nour-shili |
| Patient | Nour Gaida | nour.gaida@smartcare.local | sc-test-nour-gaida |
| Professionnel | Dr Ali Ben Ali | ali.benali@smartcare.local | Les trois appareils des patients affectés |

La première initialisation génère un mot de passe commun aux quatre comptes
locaux. PowerShell le conserve dans un fichier DPAPI chiffré pour le compte
Windows courant. MongoDB enregistre les hachages PBKDF2 compatibles avec
l'authentification SmartCare. Depuis le même compte Windows, copier le mot
de passe dans le presse-papiers pour le coller dans le formulaire :

```powershell
Set-Clipboard -Value ((Import-Clixml .\target\local-care-credential.clixml).GetNetworkCredential().Password)
```

L'initialisation conserve les mots de passe et les enregistrements existants.
Elle s'arrête en cas de collision de compte ou de propriété d'appareil. Les
affectations et les appareils ont des identifiants déterministes. Chaque
fenêtre de cinq minutes autorise un lot de **24 mesures par patient** avec la
même clé à chaque relance dans cette fenêtre.

Les historiques d'initialisation sont des données générées pour les essais.
Le champ `source: "simulated"` identifie leur provenance et
`seedDataset: "connected-fixture-v1"` distingue les lots insérés de la
simulation lancée dans le portail. Celle-ci exécute `iot/simulator/simulator.py`
avec un `bootId` propre à l'exécution. Elle publie sur MQTT. Node-RED valide les
messages et WildFly les enregistre avec le propriétaire de l'appareil. WildFly
notifie ensuite le détecteur Python via le topic `smartcare/v1/persisted/+`.
Le détecteur publie ses événements et WildFly enregistre les alertes confirmées
dans MongoDB. L'écran de simulation lit chaque seconde les mesures enregistrées
pour l'exécution choisie. Les valeurs et les règles servent à l'essai du logiciel.

Le suivi d'une exécution, ses mesures, les alertes et leurs acquittements restent
dans MongoDB après la fin du scénario et après redémarrage. La session de connexion expire après
trente minutes d'inactivité ou huit heures depuis la connexion.

## Montrer le parcours

1. Ouvrir le portail patient dans une fenêtre Edge standard. Se connecter avec
   `hadil.karous@smartcare.local`. **Tableau de bord** affiche **Dernier scénario**
   et les alertes. **Tout l’historique** ouvre les mesures de tous les scénarios.
   **Device** affiche `sc-test-hadil`.
2. Dans une fenêtre InPrivate, ouvrir le portail de supervision et se connecter
   avec `ali.benali@smartcare.local`. **Assigned patients** affiche Hadil Karous,
   Nour Shili et Nour Gaida. Ouvrir **View details** sur la fiche de Hadil. Noter
   les alertes déjà présentes si un scénario a été joué auparavant.
3. Cliquer sur **Simulation des capteurs**. Choisir **Hadil Karous · sc-test-hadil**
   dans **Patient and device**, puis cliquer sur **normal**. Les valeurs et les
   courbes suivent les publications jusqu'à **Completed · 15 / 15 saved readings**.
4. Dans la fenêtre patient, cliquer sur **Tout l’historique**, sélectionner **Last 15 minutes**
   et cliquer sur **Reload measurements**. Dans la supervision, revenir à la
   fiche de Hadil. Le scénario normal ne doit ajouter aucune alerte.
5. Revenir dans **Simulation des capteurs**, garder l'appareil de Hadil et cliquer
   sur **sustained**. Les douze mesures de 125 bpm / 93 % figurent dans le graphe.
   Laisser le **Tableau de bord** ouvert dans la fenêtre patient. Les deux écrans
   interrogent le serveur chaque seconde. Pendant l’exécution, la même alerte
   apparaît dans **Rule alerts** et **Vos alertes**. Côté patient elle s’appelle
   **Mesures inhabituelles à vérifier** et indique l’heure du début de l’épisode.
   Attendre **Completed · 37 / 37 saved readings** et comparer les tableaux
   ligne par ligne avec les horodatages UTC.
6. Ouvrir de nouveau **View details** pour Hadil. Dans **Rule alerts**, repérer
   **Sustained low blood oxygen** à l'heure du scénario. Le retour aux valeurs
   normales peut déjà avoir résolu l'épisode. Saisir une note, cliquer sur
   **Acknowledge** puis recharger. La note et l'heure d'acquittement restent
   affichées.
7. Revenir dans **Simulation des capteurs** et lancer **invalid** sur le même
   appareil. Attendre **18 / 18**. **Dernier scénario** affiche trois lignes
   non mesurées, deux courbes interrompues aux mêmes secondes et le message
   **Signal du capteur indisponible**. L’alerte précédente reste consultable.
8. Pour montrer l'inscription, partir du formulaire patient après **Sign out**.
   Cliquer sur **Sign up**, entrer un e-mail distinct des comptes ci-dessus et
   choisir un mot de passe de 10 à 100 caractères. Cliquer sur **Create patient
   account**, puis se connecter. L'historique est vide tant qu'aucun appareil
   n'est associé au compte.

`spike` publie 26 mesures, avec une valeur à 180 bpm. Le détecteur exige une
durée minimale de dix secondes pour confirmer une alerte de règle.

## Vérifications

```powershell
node --test (Get-ChildItem .\frontends\tests\*.test.mjs).FullName
.\.venv-simulator\Scripts\python.exe -m unittest iot.simulator.tests.test_simulator
$env:JAVA_HOME = $jdk
& $maven -f .\middleware\pom.xml verify
```

Pour relancer le test HTTP avec WildFly, MongoDB, MQTT, Node-RED et le détecteur
démarrés, lire le mot de passe depuis le fichier local. Le test crée un compte
patient distinct et conserve les mesures et l'alerte de son scénario dans la base.

```powershell
$env:SMARTCARE_SEED_PASSWORD = (Import-Clixml .\target\local-care-credential.clixml).GetNetworkCredential().Password
try { node --test .\frontends\tests\integration\connected-care.test.mjs }
finally { Remove-Item Env:\SMARTCARE_SEED_PASSWORD }
```
