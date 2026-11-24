# Guide du portail patient

Démarrer le profil WildFly, MongoDB, MQTT et Node-RED décrit dans le
[guide du parcours connecté](../../docs/connected-care.md). Le portail utilise la
session SmartCare. Le serveur déduit le patient de cette session à chaque lecture.

## Se connecter et consulter les mesures

1. Ouvrir [le portail patient local](http://localhost:8085/smartcare/frontends/frontoffice/).
   Saisir le compte patient de test, par exemple `hadil.karous@smartcare.local`,
   et cliquer sur **Sign in**. Le portail ouvre **Tableau de bord**.
2. Dans **Dernier scénario**, suivre le dernier essai joué sur l'appareil affecté.
   Les deux courbes utilisent la même échelle de temps. Pendant **invalid**,
   le message **Signal du capteur indisponible** et le trou dans les courbes
   identifient les secondes sans mesure valide.
3. Cliquer sur **Tout l’historique**. Choisir **Time range** et **Signal quality**,
   puis cliquer sur **Export CSV**. Le CSV couvre toute la sélection filtrée,
   quelle que soit la page du tableau. L'écran affiche les heures locales et
   le CSV conserve les horodatages UTC. **Reload measurements** relance la
   lecture de MongoDB. Les filtres et l'export s'appliquent dans le navigateur
   aux mesures renvoyées par `GET /api/me/measurements`.
4. Ouvrir **Alerts**. Une alerte de règle confirmée pour ce patient apparaît
   sous **Mesures inhabituelles à vérifier** avec son heure de début. L'acquittement
   se fait dans la supervision. Les résultats ML en mode shadow restent
   expérimentaux et la page d'état du modèle se trouve côté administration.
5. Ouvrir **Device** pour identifier les appareils affectés. Cliquer sur
   **Sign out** pour fermer la session. Une session expirée ramène à la connexion.

Pour créer un compte, cliquer sur **Sign up**, renseigner un e-mail distinct et
un mot de passe de 10 à 100 caractères, puis cliquer sur **Create patient
account**. Se connecter avec le nouveau compte. L'historique reste vide avant
l'affectation d'un appareil et l'enregistrement de mesures.

## Installation et mode hors ligne

Pour une installation depuis Edge, ouvrir le portail sur une origine compatible
et utiliser **Applications** → **Installer ce site en tant qu’application**.
Sur téléphone, utiliser l'[adresse HTTPS](../../docs/https-pwa/README.md) et
l'option **Installer l'application** ou **Ajouter à l'écran d'accueil** du
navigateur. Vérifier que l'icône ouvre bien le portail patient.

Le service worker conserve les ressources statiques. Hors ligne, le portail
signale l'indisponibilité des données serveur. Il faut se reconnecter au réseau
pour charger les mesures, les alertes et les appareils.

## Tests

Depuis la racine, exécuter `node --test frontends/tests/patient-history.test.mjs`
pour les réponses simulées et suivre le [guide du parcours connecté](../../docs/connected-care.md#vérifications)
pour le test HTTP contre MongoDB. Voir les résultats et les limites dans la
[matrice O1–O10](../../docs/iot/mlops-validation.md).
