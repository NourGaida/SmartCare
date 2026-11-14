# Frontoffice — portail patient

PWA statique pour le patient : connexion de démonstration, mesures physiologiques,
historique, graphiques, alertes et états hors ligne. Aucune compilation ni
installation npm n'est nécessaire.

## Lancer

Depuis la racine du dépôt :

```powershell
py -3 -m http.server 8080 --bind 127.0.0.1
```

Puis ouvrir `http://127.0.0.1:8080/frontends/frontoffice/`.

## Compte de démonstration

| Rôle | Email | Mot de passe public |
| --- | --- | --- |
| Patient Jamie Davis | `patient@smartcare.demo` | `demo-patient` |

La connexion est une démonstration non sécurisée. Les données sont des fixtures en
mémoire et ne sont pas persistées dans le navigateur.

## Contenu

- `index.html`, `styles.css`, `app.js`, `adapter.mjs` : page, styles, contrôleur et
  adaptateur de données.
- `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` :
  installation et cache hors ligne.
- `fixtures.mjs` : séries et alertes fictives.
- `../shared/` : authentification de démo et règles communes.
- `../docs/` : proposition d'API et scénarios de vérification d'accès.

## Tests

Depuis la racine du dépôt :

```powershell
node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs
```

Les tests couvrent aussi les ressources statiques et les service workers des deux
applications. Voir [`../README.md`](../README.md) pour l'ensemble des écrans et le
fonctionnement de démonstration.
