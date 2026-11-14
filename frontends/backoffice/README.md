# Backoffice — portail professionnel et administrateur

PWA statique pour le suivi des patients et l'administration. Le professionnel
consulte ses patients affectés, les alertes, l'historique et les graphiques ;
l'administrateur gère les comptes, les affectations et les appareils. Aucune
compilation ni installation npm n'est nécessaire.

## Lancer

Depuis la racine du dépôt :

```powershell
py -3 -m http.server 8080 --bind 127.0.0.1
```

Puis ouvrir `http://127.0.0.1:8080/frontends/backoffice/`.

## Comptes de démonstration

| Rôle | Email | Mot de passe public |
| --- | --- | --- |
| Professionnel Dr Morgan Ellis | `professional@smartcare.demo` | `demo-professional` |
| Administrateur Robin Lee | `admin@smartcare.demo` | `demo-admin` |

Les comptes, affectations et appareils sont des données fictives en mémoire. Les
mutations administratives ne modifient pas les comptes publics de connexion. La
connexion n'est pas sécurisée et rien n'est persisté dans le navigateur.

## Contenu

- `index.html`, `styles.css`, `app.mjs`, `views.mjs`, `adapter.mjs` : page, styles,
  session, navigation et rendu.
- `manifest.webmanifest`, `sw.js`, icônes : installation et cache hors ligne.
- `fixtures/administrative.mjs` : registre, comptes et affectations, sans données
  physiologiques.
- `fixtures/clinical.mjs` : séries et épisodes fictifs, chargés après les contrôles
  professionnels.
- `../shared/` : authentification de démo et règles communes.
- `../docs/` : proposition d'API et scénarios de vérification d'accès.

## Tests

Depuis la racine du dépôt :

```powershell
node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs
```

Voir [`../README.md`](../README.md) pour les rôles, les écrans et les états de
démonstration.
