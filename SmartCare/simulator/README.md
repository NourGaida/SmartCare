# Simulateur SmartCare

Simulateur MQTT compatible avec Python 3.8 ou ultérieur. La seule dépendance
externe est `paho-mqtt==2.1.0`, déjà fixée dans `requirements.txt`.
Les tests utilisent uniquement `unittest`, une horloge simulée et un transport
d'enregistrement : aucun broker, aucune connexion réseau et aucune attente réelle.

## Installation sous Windows

Depuis la racine du dépôt, dans PowerShell :

```powershell
py -3 -m venv .venv-simulator
.\.venv-simulator\Scripts\python.exe -m pip install -r SmartCare/simulator/requirements.txt
```

Pour choisir explicitement Python 3.8, remplacer `py -3` par `py -3.8`
si cette version est installée. L'activation du venv n'est pas nécessaire.

## Exécuter les scénarios

Un broker MQTT doit écouter sur `localhost:1883`. Chaque commande ci-dessous
s'exécute depuis la racine du dépôt :

```powershell
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario normal
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario spike
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario sustained
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario missing
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario duplicates
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario disconnect
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario invalid
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario all
```

Options : `--scenario` (défaut : `all`), `--host` (défaut : `localhost`),
`--port` (défaut : `1883`), `--device-id` (défaut : `sc-001`),
`--seed` (défaut : `42`). Exemple personnalisé :

```powershell
.\.venv-simulator\Scripts\python.exe SmartCare/simulator/simulator.py --scenario normal --host localhost --port 1883 --device-id sc-002 --seed 123
```

| Scénario | Résultat attendu |
| --- | --- |
| `normal` | 15 mesures valides à une seconde d'intervalle, fréquence cardiaque entre 72 et 78 bpm, SpO2 entre 97 et 99 %. |
| `spike` | 10 normales, un seul pic à 180 bpm et 98 %, puis 15 normales : 26 publications. |
| `sustained` | 10 normales, 12 mesures consécutives à 125 bpm et 93 %, puis 15 normales : 37 publications. |
| `missing` | 5 normales, 6 créneaux sans publication en restant connecté, puis 10 normales : 15 publications. Les séquences passent de 5 à 12 et les horodatages correspondants sont distants de 7 secondes. |
| `duplicates` | Deux publications du même JSON, octet pour octet, y compris `deviceId`, `bootId`, `sequence` et `acquiredAtUtc`. Une seule mesure logique. |
| `disconnect` | 5 normales, fermeture MQTT et arrêt de la boucle réseau, 35 secondes hors connexion, reconnexion, puis 10 normales. Le `bootId` reste identique et les séquences continuent de 1 à 15. Les mesures de part et d'autre de la coupure sont distantes de 36 secondes (cadence normale comprise). |
| `invalid` | 5 normales, 3 mesures avec `heartRate=null`, `spo2=null`, `quality="invalid"`, `reason="no_finger"`, puis 10 normales : 18 publications. |
| `all` | Les sept scénarios ci-dessus dans cet ordre, avec un seul `bootId` et une séquence continue, sauf les créneaux manquants et le doublon : 128 publications, dernière séquence 133. |

La graine rend les variations normales reproductibles. Le `bootId` et les
horodatages réels changent entre deux lancements. Le `bootId` est conservé pendant
la reconnexion du scénario `disconnect`. Chaque créneau normal dure une seconde,
temps de publication compris lorsque l'acquittement arrive en moins d'une seconde.
Un broker lent peut retarder les publications.

## Messages et connexion

Le fichier `../docs/message-contract.md` était vide lors de cette modification.
Le simulateur conserve donc le format existant :

- Topic : `smartcare/v1/raw/{deviceId}`.
- Champs : `schemaVersion=1`, `deviceId`, `bootId`, `sequence`,
  `acquiredAtUtc` (ISO 8601 UTC), `heartRate`, `spo2`, `quality`, `reason`,
  `clockStatus="synced"`, `source="simulated"`.
- Mesures normales : `quality="good"`, `reason=null`.
- Aucun `patientId` : l'association appareil-patient reste gérée par le backend.

Ces valeurs servent aux tests du projet et ne constituent pas des recommandations
médicales. Aucun événement de statut inventé n'est publié : `missing` représente
une absence de mesures et `disconnect` une véritable fermeture MQTT.

Le client utilise `CallbackAPIVersion.VERSION2` et un identifiant comprenant le PID
et un UUID. La connexion attend le callback `on_connect` via un
`threading.Event`, dans une limite de 10 secondes incluant l'ouverture de la
connexion. Chaque publication QoS 1 vérifie le code de retour, attend au maximum
10 secondes, puis contrôle `is_published()`. Un échec produit un message sur stderr
et un code de sortie 1. Ctrl+C produit le code 130. La connexion et la boucle réseau
sont fermées à la fin et en cas d'erreur.

Les messages affichés indiquent un acquittement MQTT, sans confirmer le traitement
du message par le backend.

## Vérification

Depuis la racine sous Windows :

```powershell
.\.venv-simulator\Scripts\python.exe -m compileall -q SmartCare/simulator
.\.venv-simulator\Scripts\python.exe -m unittest discover -s SmartCare/simulator/tests -v
```

Le travail `simulator` du CI garde le contrôle de syntaxe, installe
`requirements.txt`, puis exécute :

```sh
python3 -m unittest discover -s SmartCare/simulator/tests -v
```

Les tests vérifient les scénarios, les cadences, la reproductibilité, le format
des messages, les options CLI et les erreurs/temporisations MQTT avec des mocks.
Pour vérifier l'intégration avec un broker local, lancer `normal` et abonner
un autre client au topic `smartcare/v1/raw/sc-001` : 15 messages sont attendus.
Les tests unitaires seuls ne valident pas cette intégration réelle.
