# SmartCare middleware

Jakarta EE 11 backend built as a Maven reactor. The parent POM is [`pom.xml`](pom.xml); the deployable artifact is produced by the `api` module.

## Modules

| Module | Purpose |
| --- | --- |
| [`core/`](core/README.md) | MongoDB persistence, repository and CDI beans |
| [`iam/`](iam/README.md) | Identity and access module scaffolding for planned authentication and authorization |
| [`api/`](api/README.md) | JAX-RS application, health endpoints and WAR packaging |

Dependency direction: `api -> iam -> core`. `core` does not depend on `api`.

## Build

```powershell
mvn -f middleware/pom.xml clean verify
```

The integration tests in `core` need MongoDB on `localhost:27017`. The build produces:

```text
middleware/api/target/smartcare.war
```

The WAR keeps the `smartcare` final name and the `/smartcare` context path used by the frontends and scripts.

For a faster package build without tests:

```powershell
mvn -f middleware/pom.xml clean package -DskipTests
```

## Deploy

Deploy only through `jboss-cli`; do not copy the WAR into `standalone\deployments`:

```powershell
$wildfly = 'C:\path\to\wildfly'
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\middleware\api\target\smartcare.war --force"
```

## Endpoints

The current API exposes:

- `GET /smartcare/api/health`
- `GET /smartcare/api/health/database`

See [`api/README.md`](api/README.md) for details.

## CDI and tests

Each module has its own `META-INF/beans.xml` where needed. There is no `web.xml`; the API module uses the Jakarta EE annotations and its `WEB-INF/beans.xml` descriptor.

Java tests live in the module that owns the code:

- `middleware/core/src/test/java/com/smartcare/persistence/`
- `middleware/api/src/test/java/com/smartcare/api/`

CI reads Surefire reports from `middleware/*/target/surefire-reports/*.xml`.
