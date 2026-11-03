# Contrat MQTT observé — à valider avec l'équipe

Ce fichier était vide. Ce document décrit le format actuellement émis par le
simulateur Python ; il reste **à valider avec l'équipe et la personne B**.
Il ne définit pas une nouvelle API REST ou WebSocket.

## Topic et livraison

- Topic réellement émis : smartcare/v1/raw/{deviceId}.
- Défaut : smartcare/v1/raw/sc-001, broker localhost:1883.
- JSON UTF-8, MQTT QoS 1, sans retain. Attente d'acquittement bornée à 10 secondes.
- Aucun heartbeat ou message de statut n'est actuellement émis.
- Le topic smartcare/v1/validated/{deviceId} du document de périmètre appartient
  à la chaîne de validation prévue ; le simulateur ne le publie pas.

## Structure observée

~~~json
{
  "schemaVersion": 1,
  "deviceId": "sc-001",
  "bootId": "a3ca5664-75a3-4f9e-a32a-1c8ca9c1fe21",
  "sequence": 1,
  "acquiredAtUtc": "2026-11-01T12:00:00+00:00",
  "heartRate": 75,
  "spo2": 98,
  "quality": "good",
  "reason": null,
  "clockStatus": "synced",
  "source": "simulated"
}
~~~

Identifiants et horodatage ci-dessus illustratifs.

| Champ | Format / sémantique observée |
| --- | --- |
| schemaVersion | Entier 1. |
| deviceId | Identifiant appareil, défaut sc-001, option --device-id. |
| bootId | UUID par lancement, conservé à la reconnexion du scénario disconnect. |
| sequence | Entier à partir de 1, un numéro par créneau logique, y compris les créneaux manquants. |
| acquiredAtUtc | ISO 8601 UTC, décalage +00:00. |
| heartRate | Fréquence cardiaque en battements par minute (bpm), ou null. |
| spo2 | SpO₂ estimée en pourcentage : 98 signifie 98 %, ou null. |
| quality | good pour valide, invalid pour invalide dans le simulateur. |
| reason | null normalement, no_finger pour les mesures invalides. |
| clockStatus | synced dans la simulation. |
| source | Toujours simulated pour le simulateur. |

Il n'y a pas de patientId : l'association appareil-patient reste gérée par le
backend, en tenant compte de l'affectation au moment de l'acquisition.
L'identifiant du client MQTT comprend un PID et un UUID pour éviter les collisions
de connexion. Il est distinct de deviceId et bootId.

La clé (deviceId, bootId, sequence) identifie une mesure logique. QoS 1 permet des
redélivraisons : le backend devra dédupliquer sans produire de nouvelles mesures
ou de nouveaux épisodes. duplicates envoie deux payloads strictement identiques,
y compris cette clé et l'horodatage.

## Absence, invalidité et reconnexion

missing réserve six créneaux sans publication en restant connecté. Après cinq
mesures, la séquence passe de 5 à 12 et les horodatages sont distants de 7 secondes.
Un message avec des valeurs nulles ne représente pas cette absence.

invalid publie des messages avec heartRate=null, spo2=null, quality="invalid",
reason="no_finger".

disconnect ferme réellement MQTT pendant 35 secondes, conserve bootId et reprend
la séquence à la suite. Les délais du broker peuvent s'ajouter à cette durée.
Aucun redémarrage de l'appareil n'est simulé lors de cette reconnexion.

Ces valeurs servent aux tests et ne constituent pas des recommandations médicales.
Validation, identité, autorisations et cycle de vie des alertes relèvent du backend.
