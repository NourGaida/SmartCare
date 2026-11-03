# SmartCare — patient et supervision

Deux applications HTML/CSS/JavaScript natifs, sans installation npm ni compilation.
L'interface reste en anglais, comme le patient existant. La supervision reprend
ses couleurs turquoise, cartes, typographies, icônes et espacements.

## Lancer sous Windows

Depuis la racine du dépôt, dans PowerShell :

~~~powershell
git branch --show-current
py -3 -m http.server 8080 --bind 127.0.0.1
~~~

Garder ce terminal ouvert. Dans un deuxième terminal :

~~~powershell
Start-Process 'http://127.0.0.1:8080/frontend/patient/'
Start-Process 'http://127.0.0.1:8080/frontend/supervision/'
~~~

Les applications utilisent le même serveur statique et des chemins distincts.
Ne pas ouvrir directement les fichiers avec file:// : les modules et les service
workers nécessitent HTTP. Ctrl+C arrête le serveur. Si nécessaire, changer 8080
dans les trois commandes.

## Accès de démonstration

| Application / rôle | Email | Mot de passe public |
| --- | --- | --- |
| Patient Jamie Davis | patient@smartcare.demo | demo-patient |
| Professionnel Dr Morgan Ellis | professional@smartcare.demo | demo-professional |
| Administrateur Robin Lee | admin@smartcare.demo | demo-admin |

Les boutons « Use … demo » ouvrent explicitement le compte fictif correspondant.
Les formulaires vérifient email, champs obligatoires et identifiants de démo.

**Ce mécanisme ne constitue pas une authentification sécurisée.** Les identifiants
sont publics et le code statique est lisible. Les restrictions servent à tester
l'interface. Aucune donnée réelle ne doit y être introduite. Aucune saisie de formulaire,
mesure générée ou session n'est persistée dans localStorage, sessionStorage,
IndexedDB ou les caches. Une sortie ou un rechargement efface la session et ses
mutations. Les sessions patient et supervision sont indépendantes.

## Écrans et interactions

### Patient

- Connexion et déconnexion accessibles sur ordinateur et téléphone.
- Dashboard : fréquence cardiaque en bpm, SpO₂ en %, qualité, dernière réception,
  courbes HR/SpO₂ et périodes 15 minutes / une heure / aujourd'hui.
- La série initiale inclut un trou de six secondes et des mesures invalides.
  Les courbes ne relient pas les points à travers ces interruptions.
- Historique paginé avec période et qualité. Le CSV contient toute la sélection
  filtrée, indépendamment de la page courante. Depuis le dashboard, il correspond
  à la période du graphique.
- Alertes fictives et détails : état, source, raison, période, exemple de mesure
  et version de règle. « Preview an alert » ajoute un exemple à la session.
- Appareil, pause/reprise, signal invalide, aperçu déconnecté et états vide,
  erreur et chargement ; retour aux données normales avec « Reload demo data ».
- Après 30 secondes sans mesure, les valeurs deviennent explicitement obsolètes.
  La sortie efface séries, alertes, contenus rendus et infobulles.

### Professionnel

L'écran initial « Assigned patients » présente Jamie Davis (patient-001),
Alex Morgan (patient-002) et Sam Taylor (patient-003). Le premier a des données
valides, le deuxième une réception ancienne et le troisième un signal invalide.
Recherche par nom, identifiant ou code ; filtres de connexion et qualité.

« View details » ouvre mesures, fraîcheur, courbes, historique paginé et CSV.
« Apply filters » applique la même période et qualité au graphique, à l'historique
et à l'export. Les données sont un instantané ; la fraîcheur évolue chaque seconde.
Les patients initialement connectés deviennent obsolètes après 30 secondes :
la supervision ne simule pas de flux WebSocket.

Les alertes se filtrent par patient affecté et état. Les détails contiennent
source, raison, période, mesures associées et version de règle lorsqu'elles sont
présentes. Un acquittement exige une note de 1 à 500 caractères et enregistre
auteur et heure. Le compteur « to acknowledge » diminue, mais le nombre d'épisodes
ouverts reste identique : acquitter ne résout pas un épisode. Les épisodes déjà
acquittés ou résolus ne peuvent pas être acquittés à nouveau.

patient-004 existe sans affectation. Le lien « Test unassigned patient access »,
l'URL #patient/patient-004, un identifiant inconnu ou une alerte non affectée
affichent un accès refusé sans révéler les données de cette personne.
Le professionnel ne peut pas utiliser les opérations administratives.

### Administrateur

- Comptes : liste, création fictive, modification du rôle, activation/désactivation.
  Le compte administrateur courant ne peut pas se désactiver ou se rétrograder.
- Affectations : associer/retirer un patient et un professionnel actif.
- Appareils : enregistrement, affectation et révocation. Révoquer l'ancien appareil
  avant de lui substituer un autre ; un appareil révoqué n'est plus affectable.
- Services : disponibilité et dernière vérification **simulées**, sans requête réseau.
- Modèle : indisponible par défaut, version/mode « Not supplied ». L'aperçu
  « Services available » affiche une version et un mode explicitement fictifs.

Les fixtures administratives ne contiennent que registre, comptes, affectations,
appareils et métadonnées opérationnelles. L'adaptateur refuse toutes les fonctions
cliniques à l'administrateur et ne charge pas les fixtures cliniques pour lui.
Ses écrans ne proposent ni mesures, ni courbes, historique, CSV ou détails cliniques
d'alertes. Une URL clinique modifiée est également refusée.

Les mutations administratives restent dans leur session : elles ne modifient pas
les comptes de connexion publics ni un autre onglet professionnel. Le backend
devra assurer la cohérence des sessions et des révocations.

### États de démonstration

Dans la supervision, « Demo preview » permet : normal, vide, erreur, chargement,
services indisponibles ou disponibles. Le chargement simulé reste affiché jusqu'à
« Reload normal demo data ». Les disponibilités s'appliquent à Services/Model.
Les erreurs d'opérations sont annoncées par un message de statut ; les formulaires
gardent leur contenu en cas d'échec.

## Organisation

| Fichier / dossier | Responsabilité |
| --- | --- |
| patient/index.html, styles.css | Structure et design patient, connexion et navigation accessible. |
| patient/app.js | Événements, navigation, rendu et cadence du flux fictif. |
| patient/fixtures.mjs | Mesures et alertes patient fictives. |
| patient/adapter.mjs | Login/logout, lectures, historique, alertes et appareil. |
| supervision/app.mjs | Session, navigation par rôle, formulaires et compteurs. |
| supervision/views.mjs | Fonctions de rendu et composants, textes variables échappés. |
| supervision/adapter.mjs | Accès, gardes de rôle/affectation, mutations en mémoire. |
| supervision/fixtures/administrative.mjs | Registre et opérations, sans données physiologiques. |
| supervision/fixtures/clinical.mjs | Séries/épisodes fictifs, importés après les contrôles professionnels. |
| shared/auth.mjs | Adaptateur de connexion de démo, sans persistance. |
| shared/domain.mjs | Autorisations, acquittement, filtre, pagination, fraîcheur, segmentation et CSV. |
| shared/ui.mjs, forms.css | Échappement, courbes, export et formulaires communs. |
| Chaque manifest.webmanifest, sw.js, icon* | Installation et ressources statiques de l'application. |
| tests/frontend.test.mjs | Tests Node natifs de rôles, actions, données et ressources. |

Caches distincts : smartcare-patient-static-v2 et smartcare-supervision-static-v2.
Les service workers ont des scopes distincts et n'interceptent qu'une liste
explicite de ressources statiques sans paramètres. API, exports, sessions et
mesures dynamiques ne sont pas mis en cache. Les modules de fixtures sont du code
statique public générant des données fictives. Les polices Google sont facultatives :
des polices système prennent le relais hors connexion. Une première visite en
ligne est nécessaire pour le cache statique.

## Intégration backend

Voir [api-proposal.md](api-proposal.md). Seul GET /api/health existe actuellement,
relativement au contexte du WAR (/smartcare par défaut). Toutes les autres routes
sont **à valider avec la personne B**.

Remplacer les factories d'adaptateurs par REST et un WebSocket autorisé. Le backend
doit déduire le patient depuis la session et appliquer les autorisations sur
**chaque API, export et connexion/abonnement WebSocket**, y compris après révocation
de rôle ou d'affectation. L'auteur et l'heure d'acquittement doivent venir du serveur.
La résolution des épisodes reste indépendante et gérée par le backend.

Les lignes de vue utilisent timestamp en millisecondes, hr en bpm, spo2 en %,
quality, reason, deviceId et source. L'adaptateur réel devra convertir les DTO
validés du backend ; le navigateur ne se connecte pas directement à MQTT.
Le [contrat MQTT observé](../SmartCare/docs/message-contract.md) décrit le simulateur.

## Vérifications

Node.js 22, sans dépendances, depuis la racine :

~~~powershell
node --test frontend/tests/frontend.test.mjs
Get-ChildItem frontend -Recurse -File -Include *.js,*.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed" } }
git diff --check
~~~

Le CI conserve Java, les contrôles patient et les tests Python, puis ajoute la
syntaxe supervision/modules communs et les tests frontend.

Les tests couvrent connexions, gardes de rôle/affectation, acquittement, CRUD fictifs,
pagination, sélection CSV, interruptions, obsolescence, déconnexion, états de démo,
manifests/icônes et service workers avec des mocks.

À vérifier manuellement sur ordinateur et à 360 px : navigation et focus clavier,
formulaires, filtres, pagination, téléchargements CSV, acquittement, opérations
administratives, accès refusés, sorties et installation/offline des deux PWAs.
**Le navigateur n'était pas disponible lors de cette implémentation : rendu visuel,
interactions DOM réelles et installation PWA restent à confirmer.** La liaison
backend et les échanges WebSocket ne sont pas implémentés dans cette démonstration.
