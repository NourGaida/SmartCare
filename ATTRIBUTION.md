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
*   **Bibliothèques et outils tiers (dépendances) :** Jakarta EE 11 / JAX-RS (WildFly 42), MongoDB, MQTT, Node-RED, ESP32 + MAX30102 (à compléter avec les bibliothèques précises du `pom.xml`, de `IoT/` et de `frontend/`).

---

## 🛠️ 4. Répartition Réelle de l'Écriture du Code
*Indiquez la provenance réelle (en %) des lignes de code actuellement sur votre branche principale.*

| Module / Composant | % Écrit à la main par l'équipe | % Généré par IA | % Emprunté / Réutilisé |
| :--- | :---: | :---: | :---: |
| **Passerelle IoT / Node-RED / Edge** (`IoT/`) | 22 % | 78 % | 0 % |
| **Backend / API REST / Middleware** (`MiddleWare/src`, `pom.xml`) | 18 % |82 % | 0 % |
| **Sécurité (IAM / Keycloak / mTLS)** | 15 % | 85 % | 0 % |
| **Frontend / PWA** (`frontend/`) | 8 % | 92 % | 0 % |
| **Scripts d'Infra / Déploiement** (`.github/workflows`) | 13 % | 87 % | 0 % |

---

## ✍️ 5. Engagement sur l'Honneur
En validant ce fichier sur notre dépôt GitHub, nous certifions sur l'honneur que les déclarations ci-dessus sont exactes, sincères et reflètent fidèlement notre processus de développement. Nous sommes conscients que la falsification de ce document ou la non-maîtrise technique du code déclaré comme "écrit par l'équipe" lors des soutenances entraînera une **pénalité immédiate et sévère sur la note globale**.

*   [x] **Lu et approuvé par l'ensemble des membres de l'équipe.**
*   **Date de dernière mise à jour :** 10 / 11 / 2026
________
