# API module

The `api` module contains the JAX-RS application and the deployable WAR.

## Contents

- `SmartCareApplication`: JAX-RS application path.
- `HealthSource` / `DatabaseHealthSource`: `/health` and `/health/database` endpoints.
- `WEB-INF/beans.xml`: CDI descriptor for the web module.
- `DatabaseHealthSourceTest`: database health endpoint tests.

There is no `web.xml`; the application is configured through annotations.

## Build and package

```powershell
mvn -f middleware/pom.xml -pl api -am clean package
```

Output:

```text
middleware/api/target/smartcare.war
```

The `finalName` is `smartcare`, and the deployed context path is `/smartcare`. A clean build removes any older `smartcare-api-1.0.0.war` left from before the rename.

## Deploy

Use `jboss-cli` rather than copying the WAR:

```powershell
$wildfly = 'C:\path\to\wildfly'
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\middleware\api\target\smartcare.war --force"
```

## Health checks

```powershell
curl.exe -i http://localhost:8080/smartcare/api/health
curl.exe -i http://localhost:8080/smartcare/api/health/database
```

Both are expected to return HTTP 200 when MongoDB is reachable.

## Dependency direction

`api` depends on `core` and `iam`. `DatabaseHealthSource` stays in `api` because it implements the web health contract; `core` does not depend on `api`.
