
# 📜 Déclaration d'Attribution et d'Intégrité Académique

### Module : Cloud of Things (COT) · Année 2026/2027 · SUP'COM

Ce document est un livrable obligatoire, mis à jour à chaque sprint. Il présente l'origine du code, les outils d'assistance utilisés et les contributions de l'équipe.

---

## 👥 1. Identification de l'Équipe

- **Projet :** SmartCare (IoT-Based Patient Monitoring & Early Warning System)
- **Dépôt :** https://github.com/NourGaida/SmartCare
- **Équipe :** 9
- **Membres :**
  - Nour Gaïda
  - Hadil Karous
  - Nour Shili

---

## 🧠 2. Usage des Assistants de Génération (IA)

- [ ] **Option A :** Aucun outil de génération de code par IA.
- [ ] **Option B :** Utilisation modérée (débogage, fonctions isolées, documentation).
- [x] **Option C :** Utilisation intensive (génération de modules, scripts, structures et assistance à l'implémentation).

### 📝 Journal des prompts notables

Les descriptions ci-dessous sont des reformulations représentatives des demandes adressées à l'IA. Elles ne constituent pas des transcriptions littérales des prompts originaux.

| Composant / Module | Outil et modèle | Description du prompt ou du rôle confié à l'IA |
| :--- | :--- | :--- |
| Simulateur IoT MQTT | ChatGPT — GPT-6 | Concevoir et améliorer un simulateur de données physiologiques avec les scénarios `normal`, `spike`, `sustained`, `missing`, `duplicates`, `disconnect` et `invalid`, tout en assurant la reproductibilité et la compatibilité MQTT. |
| Détection d'anomalies temporelles | ChatGPT — GPT-6 | Proposer une architecture de détection à règles permettant de reconnaître les anomalies physiologiques persistantes, de gérer les doublons et de publier des événements MQTT structurés. |
| Génération du dataset MLOps | ChatGPT — GPT-6 | Réutiliser le simulateur SmartCare pour générer un dataset synthétique reproductible, sans broker MQTT, avec horloge virtuelle, identifiants de sessions et labels d'anomalies. |
| Prétraitement et feature engineering | ChatGPT — GPT-6 | Construire des fenêtres temporelles de cinq mesures, extraire dix caractéristiques statistiques et séparer les données par session afin de limiter les fuites entre entraînement et test. |
| Isolation Forest et MLflow | ChatGPT — GPT-6 | Implémenter l'entraînement Isolation Forest, optimiser le seuil sur validation, calculer les métriques et intégrer MLflow avec SQLite pour le suivi des expériences. |

### Autres assistants

| Outil | Modèle | Usage |
| :--- | :--- | :--- |
| OpenCode | Big Pickle | Assistance à la restructuration du dépôt, au middleware Java, aux scripts et à la CI. |
| Claude | Sonnet 5.5 | Exemple d'assistant supplémentaire demandé pour la déclaration. Aucune contribution précise ne lui est attribuée sans confirmation de son utilisation effective. |

---

## 📚 3. Emprunts, Squelettes de Cours & Plagiat

**Code de départ enseignant / squelette du cours :**

- [ ] Oui
- [x] Non

**Réutilisation d'anciens projets ou de dépôts GitHub externes :**

- [ ] Oui
- [x] Non

**Bibliothèques et outils tiers :**

Jakarta EE 11, WildFly 42, MongoDB, Eclipse Paho MQTT, Mosquitto, Node-RED, ESP32, MAX30102, Python, NumPy, Pandas, scikit-learn, Joblib, MLflow, Pytest et SQLite.

Ces bibliothèques sont des dépendances tierces et ne sont pas revendiquées comme du code original de l'équipe.

---

## 🛠️ 4. Répartition Réelle de l'Écriture du Code

Les pourcentages ci-dessous sont les estimations déclarées par l'équipe. Ils doivent être vérifiés et actualisés à chaque sprint.

| Module / Composant | % Écrit à la main | % Généré par IA | % Emprunté / Réutilisé |
| :--- | ---: | ---: | ---: |
| Passerelle IoT / Node-RED / Edge (`iot/`) | 22 % | 78 % | 0 % |
| Backend / API REST / Middleware (`middleware/`) | 18 % | 82 % | 0 % |
| Sécurité (`middleware/iam/`) | 15 % | 85 % | 0 % |
| Frontend / PWA (`frontends/`) | 8 % | 92 % | 0 % |
| Scripts d'infrastructure / CI (`.github/workflows/`) | 13 % | 87 % | 0 % |
| MLOps (`IoT/mlops/` ou `iot/mlops/`) |32 % | 68 % | 0 % |

**Note :** Les pourcentages portent sur la provenance du code du projet, hors bibliothèques installées comme dépendances.

---

## 📦 5. Bibliothèques et Dépendances

| Bibliothèque / outil | Version | Licence | Fichier source |
| :--- | :--- | :--- | :--- |
| Jakarta EE API | 11.0.0 | EPL-2.0 ou GPL-2.0 avec exception Classpath | `middleware/pom.xml` |
| MongoDB Java Sync Driver | 5.5.1 | Apache-2.0 | `middleware/pom.xml` |
| Eclipse Paho MQTT Java | 1.2.5 | EPL-2.0 ou EDL-1.0 | `middleware/pom.xml` |
| Eclipse Parsson | 1.1.7 | EPL-2.0 | `middleware/pom.xml` |
| JUnit Jupiter | 5.11.4 | EPL-2.0 | `middleware/pom.xml` |
| Maven Compiler Plugin | 3.14.1 | Apache-2.0 | `middleware/pom.xml` |
| Maven WAR Plugin | 3.4.0 | Apache-2.0 | `middleware/api/pom.xml` |
| Maven Surefire Plugin | 3.5.2 | Apache-2.0 | `middleware/pom.xml` |
| Eclipse Paho MQTT Python | 2.1.0 | EPL-2.0 ou EDL-1.0 | `iot/simulator/requirements.txt` |
| scikit-learn | 1.9.1 | BSD-3-Clause | Environnement MLOps |
| MLflow | 3.18.0 | Apache-2.0 | Environnement MLOps |
| Pandas | 3.1.1 | BSD-3-Clause | Environnement MLOps |
| NumPy | 2.5.5 | BSD-3-Clause | Environnement MLOps |
| Pytest | 9.2.0 | MIT | Environnement MLOps |

Les versions Python indiquées correspondent à l'environnement MLOps local et doivent être figées dans un fichier de dépendances avant livraison.

Le frontend utilise HTML, CSS et des modules JavaScript, avec le test runner intégré à Node.js 22.

---

## 🤖 6. Journal des Prompts OpenCode

| Date | Outil | Modèle | Portée | Référence du prompt |
| :--- | :--- | :--- | :--- | :--- |
| 2026-11-14 | OpenCode | Big Pickle | Timeout MongoDB configurable, tests, CI, scripts de récupération et documentation | [MongoDB PR](docs/prompts/2026-11-14-close-mongo-pr.md) |
| 2026-11-14 | OpenCode | Big Pickle | Restructuration du dépôt, séparation frontend, découpage Maven et adaptation CI | [Restructuration](docs/prompts/2026-11-14-repo-restructure.md) |
| 2026-11-15 | OpenCode | Big Pickle | Réception MQTT des mesures validées, endpoint de santé, tests et intégration Mosquitto | [MQTT Receiver](docs/prompts/2026-11-14-mqtt-receiver.md) |
| 2026-11-21 | OpenCode | Big Pickle | HTTPS local, certificats mkcert, nginx TLS, cookies sécurisés, PWA installables et documentation associée | [Master prompt HTTPS/PWA](docs/prompts/00-master-prompt.md) |

Le travail HTTPS/PWA est produit avec l'assistance de codage IA (opencode, modèle Big Pickle) et est soumis à la revue de l'équipe avant intégration. Le prompt intégral est archivé dans [`docs/prompts/00-master-prompt.md`](docs/prompts/00-master-prompt.md) ; aucun secret ni certificat n'y figure.

### Contributions ChatGPT — MLOps

| Période | Modèle | Composants concernés | Type d'assistance |
| :--- | :--- | :--- | :--- |
| Novembre 2026 | GPT-6 | `iot/mlops/src/generate_dataset.py` | Génération du dataset synthétique à partir du simulateur existant |
| Novembre 2026 | GPT-6 | `iot/mlops/src/features.py` | Extraction des caractéristiques temporelles |
| Novembre 2026 | GPT-6 | `iot/mlops/src/preprocess.py` | Prétraitement et séparation des données par session |
| Novembre 2026 | GPT-6 | `iot/mlops/src/train.py` | Entraînement, évaluation et sauvegarde d'Isolation Forest |
| Novembre 2026 | GPT-6 | MLflow et SQLite | Intégration du suivi des expériences et résolution des erreurs de sérialisation |

---

## ✍️ 7. Engagement sur l'Honneur

En validant ce fichier sur notre dépôt GitHub, nous certifions sur l'honneur que les déclarations ci-dessus sont exactes, sincères et reflètent fidèlement notre processus de développement.

Nous sommes conscients que la falsification de ce document ou la non-maîtrise technique du code déclaré comme écrit par l'équipe lors des soutenances entraînera une pénalité immédiate et sévère sur la note globale.

- [x] **Lu et approuvé par l'ensemble des membres de l'équipe** 

**Date de dernière mise à jour :** 17/11/2026

**Équipe 9 — SmartCare**
