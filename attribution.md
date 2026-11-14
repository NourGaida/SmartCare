# 📜 Déclaration d'Attribution et d'Intégrité Académique
### Module : Cloud of Things (COT) · Année 2026/2027 · SUP'COM

Ce document est un **livrable obligatoire** devant être complété et mis à jour à chaque sprint par l'équipe. Il vise à cartographier de manière transparente l'origine du code, des architectures et l'usage des outils d'assistance (IA, bibliothèques tiers, codes d'archive).

---

## 👥 1. Identification de l'Équipe
*   **Projet (Nom) :** SmartCare (IoT-Based Patient Monitoring & Early Warning System)
*   **Dépôt :** https://github.com/NourGaida/SmartCare
*   **Équipe (Numéro) :** 9
*   **Membres :**
    *   Membre 1 (Prénom, Nom) : Nour Gaïda
    *   Membre 2 (Prénom, Nom) : Hadil Karous
    *   Membre 3 (Prénom, Nom) : Nour Shili

---

## 🧠 2. Usage des Assistants de Génération (IA)
*Cochez l'option qui correspond à votre réalité et détaillez le périmètre.*

*   [ ] **Option A :** Aucun outil de génération de code par IA n'a été utilisé.
*   [ ] **Option B :** Utilisation modérée (Aide au débogage, génération de fonctions isolées, documentation).
*   [x] **Option C :** Utilisation intensive (Génération de structures de dossiers, squelettes d'API complets, scripts de déploiement).

### 📝 Journal des invites (Prompts) notables et composants générés par IA :

| Composant / Module | Outil utilisé (ChatGPT/Claude/Copilot...) | Description du prompt ou du rôle confié à l'IA |
| :--- | :--- | :--- |
| *Ex: Squelette API /api* | *Claude 3.5 Sonnet* | *Génération de la structure multi-module Maven conforme au patron BCE* |
| | | |
| | | |

---

## 📚 3. Emprunts, Squelettes de Cours & Plagiat
*Précisez si vous avez utilisé une base de code préexistante.*

*   **Code de départ enseignant / squelette du cours :**
    *   [ ] Oui (indiquer quels modules : ________________________)
    *   [x] Non
*   **Réutilisation d'anciens projets (Années précédentes / GitHub externes) :**
    *   [ ] Oui (Lien du dépôt d'origine : `https://github.com...`)
    *   [x] Non
    *   *Si Oui, listez les fichiers ou concepts importés directement :* ________________________
*   **Bibliothèques et outils tiers (dépendances) :** Jakarta EE 11 / JAX-RS (WildFly 42), MongoDB, MQTT, Node-RED, ESP32 + MAX30102 (à compléter avec les bibliothèques précises des `pom.xml` sous `middleware/`, de `iot/` et de `frontends/`).

---

## 🛠️ 4. Répartition Réelle de l'Écriture du Code
*Indiquez la provenance réelle (en %) des lignes de code actuellement sur votre branche principale.*

| Module / Composant | % Écrit à la main par l'équipe | % Généré par IA | % Emprunté / Réutilisé |
| :--- | :---: | :---: | :---: |
| **Passerelle IoT / Node-RED / Edge** (`iot/`) | 22 % | 78 % | 0 % |
| **Backend / API REST / Middleware** (`middleware/core`, `middleware/api`, `middleware/pom.xml`) | 18 % |82 % | 0 % |
| **Sécurité (IAM / Keycloak / mTLS)** (`middleware/iam`) | 15 % | 85 % | 0 % |
| **Frontend / PWA** (`frontends/`) | 8 % | 92 % | 0 % |
| **Scripts d'Infra / Déploiement** (`.github/workflows`) | 13 % | 87 % | 0 % |

*   **AI-generated vs human-written share (this work):** TO_FILL_BY_HUMAN

---

## 📦 5. Bibliothèques (générées depuis les `pom.xml` sous `middleware/`, `package.json` et les fichiers `requirements`)

| Bibliothèque / outil | Version | Licence (si connue) | Fichier source |
| :--- | :--- | :--- | :--- |
| Jakarta EE API (`jakarta.platform:jakarta.jakartaee-api`) | 11.0.0 | EPL-2.0 OR GPL-2.0 with Classpath Exception | `middleware/pom.xml` (scope `provided`) |
| MongoDB Java sync driver (`org.mongodb:mongodb-driver-sync`) | 5.5.1 | Apache-2.0 | `middleware/pom.xml` |
| JUnit Jupiter (`org.junit.jupiter:junit-jupiter`) | 5.11.4 | EPL-2.0 | `middleware/pom.xml` (scope `test`) |
| Maven Compiler Plugin | 3.14.1 | Apache-2.0 | `middleware/pom.xml` (build) |
| Maven WAR Plugin | 3.4.0 | Apache-2.0 | `middleware/api/pom.xml` (build) |
| Maven Surefire Plugin | 3.5.2 | Apache-2.0 | `middleware/pom.xml` (build) |
| Eclipse Paho MQTT Python client (`paho-mqtt`) | 2.1.0 | EPL-2.0 OR EDL-1.0 | `iot/simulator/requirements.txt` |
| Node.js built-in test runner | Node.js 22 (CI) | Node.js licence | `frontends/tests/*.mjs`; no `package.json` exists in the repository |

No npm dependency file (`package.json`) is present: the frontend is plain HTML/CSS/ES modules and its tests use Node's built-in test runner.

---

## 🤖 6. Prompts (OpenCode)

| Date | Outil | Modèle | Portée | Fichiers modifiés | Prompt |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-14 | OpenCode | Big Pickle | Généré à partir de notre spécification écrite après inspection du dépôt : timeout MongoDB configurable, service MongoDB en CI, règles `.gitignore`, scripts de récupération/démonstration, attribution et vérification | `middleware/core/src/main/java/com/smartcare/persistence/MongoProvider.java`, `middleware/api/src/main/java/com/smartcare/api/DatabaseHealthSource.java`, `middleware/core/src/test/java/com/smartcare/persistence/MongoProviderTest.java`, `middleware/api/src/test/java/com/smartcare/api/DatabaseHealthSourceTest.java`, `.github/workflows/ci.yml`, `.gitignore`, `scripts/check-recovery.ps1`, `scripts/demo-duplicate.js`, `attribution.md`, `docs/prompts/2026-11-14-close-mongo-pr.md`, `docs/prompts/pr-mongo-data-layer.md` | [docs/prompts/2026-11-14-close-mongo-pr.md](docs/prompts/2026-11-14-close-mongo-pr.md) |
| 2026-11-14 | OpenCode | Big Pickle | Restructuration du dépôt : renommage des dossiers en minuscules, séparation `frontends/frontoffice` et `frontends/backoffice`, découpage Maven `middleware/core`, `middleware/iam`, `middleware/api`, mise à jour des imports, chemins, CI et documentation | `.github/workflows/ci.yml`, `.gitignore`, `README.md`, `attribution.md`, `broker/README.md`, `docs/README.md`, `docs/prompts/2026-11-14-repo-restructure.md`, `scripts/README.md`, `frontends/**`, `iot/**`, `middleware/**` | [docs/prompts/2026-11-14-repo-restructure.md](docs/prompts/2026-11-14-repo-restructure.md) |

---

## ✍️ 7. Engagement sur l'Honneur
En validant ce fichier sur notre dépôt GitHub, nous certifions sur l'honneur que les déclarations ci-dessus sont exactes, sincères et reflètent fidèlement notre processus de développement. Nous sommes conscients que la falsification de ce document ou la non-maîtrise technique du code déclaré comme "écrit par l'équipe" lors des soutenances entraînera une **pénalité immédiate et sévère sur la note globale**.

*   [x] **Lu et approuvé par l'ensemble des membres de l'équipe.**
*   **Date de dernière mise à jour :** 14 / 11 / 2026
________
