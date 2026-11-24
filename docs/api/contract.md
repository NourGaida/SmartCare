# SmartCare API contract

Status legend: **IMPLEMENTED** means the route exists in the Java source under `middleware/**/src`. **PLANNED** means the route is a candidate only; it is not evidence of an endpoint. `docs/frontend/api-proposal.md` is used only as a source of candidate paths, never as evidence that a route exists.

Base path: JAX-RS is mounted at `/api` (`SmartCareApplication.java:6`). The WAR adds the `/smartcare` context root, so the internal WildFly URL is `/smartcare/api/...`; the HTTPS reverse proxy exposes the same resources as `/api/...`.

Status was derived from these real sources:

- `middleware/api/src/main/java/com/smartcare/api/SmartCareApplication.java`
- `middleware/api/src/main/java/com/smartcare/api/HealthSource.java`
- `middleware/api/src/main/java/com/smartcare/api/DatabaseHealthSource.java`
- `middleware/api/src/main/java/com/smartcare/api/IngestionHealthSource.java`
- `middleware/api/src/main/java/com/smartcare/api/PatientMeasurementsResource.java`
- `middleware/api/src/main/java/com/smartcare/api/auth/AuthResource.java`
- `middleware/api/src/main/java/com/smartcare/api/auth/SessionResource.java`
- `middleware/api/src/main/java/com/smartcare/api/auth/SecurityFilter.java`

## Authentication and common errors

- Session cookie: `SMARTCARE_SESSION` by default (`SessionSettings.java:7-9`), `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when configured.
- CSRF: `GET`, `HEAD` and `OPTIONS` are safe. Every other method requires header `X-CSRF-Token` matching the session token (`SecurityFilter.java:28`, `:50-54`).
- Role values returned by the server are `PATIENT`, `PROFESSIONAL` and `ADMIN`.
- The authentication filter only checks "valid session"; it does not enforce roles. The only implemented role check is the `PATIENT` check in `PatientMeasurementsResource.java:45`.

All error JSON below has `Content-Type: application/json`.

| Status | Code | Contract | Body |
| --- | --- | --- | --- |
| 401 | `unauthorized` | IMPLEMENTED (`SecurityFilter.java:44-46`, `SessionResource.java:19-22`, `PatientMeasurementsResource.java:41-44`) | `{"error":"unauthorized","message":"Not authenticated"}` |
| 401 | `invalid_credentials` | IMPLEMENTED (`AuthResource.java:43-45`, `AuthService.java:44-47`) | `{"error":"invalid_credentials","message":"Invalid credentials"}` |
| 403 | `csrf_invalid` | IMPLEMENTED (`SecurityFilter.java:50-54`) | `{"error":"csrf_invalid","message":"Invalid or missing CSRF token"}` |
| 403 | `forbidden` | IMPLEMENTED for non-`PATIENT` on `/api/me/measurements` (`PatientMeasurementsResource.java:45-47`) | `{"error":"forbidden","message":"Patient session required"}` |
| 403 | `forbidden` | PLANNED for other role or assignment denials | `{"error":"forbidden","message":"Forbidden"}` |
| 404 | none | IMPLEMENTED behavior: no JSON body is defined in the Java source. Without a valid session, the filter aborts an unknown `/api/...` path with the 401 above before routing; with a valid session, the WildFly/RESTEasy container default 404 is non-JSON and environment-defined. | no JSON contract |
| 404 | `not_found` | PLANNED target contract for all routes below | `{"error":"not_found","message":"Resource not found"}` |

A 404 is not an authorization decision. For planned patient-scoped resources, the same 404 body may be used to mask an existing resource that the caller may not see.

## Route index

| Status | Method | Path | May call |
| --- | --- | --- | --- |
| IMPLEMENTED | GET | `/api/health` | Public: patient, professional, admin or anonymous |
| IMPLEMENTED | GET | `/api/health/database` | Public |
| IMPLEMENTED | GET | `/api/health/ingestion` | Public |
| IMPLEMENTED | POST | `/api/auth/login` | Public |
| IMPLEMENTED | POST | `/api/auth/logout` | Any authenticated role: patient, professional, admin |
| IMPLEMENTED | GET | `/api/session` | Any authenticated role: patient, professional, admin |
| IMPLEMENTED (pagination PLANNED) | GET | `/api/me/measurements` | Patient only |
| PLANNED | GET | `/api/me/device` | Patient only |
| PLANNED | GET | `/api/me/measurements/export` | Patient only |
| PLANNED | GET | `/api/me/alerts` | Patient only |
| PLANNED | GET | `/api/patients` | Professional, assigned patients only |
| PLANNED | GET | `/api/patients/{id}` | Professional, assigned patient only |
| PLANNED | GET | `/api/patients/{id}/measurements` | Professional, assigned patient only |
| PLANNED | GET | `/api/patients/{id}/measurements/export` | Professional, assigned patient only |
| PLANNED | GET | `/api/alerts` | Professional, assigned patients only |
| PLANNED | POST | `/api/alerts/{id}/acknowledgements` | Professional, assigned patient only |
| PLANNED | GET | `/api/admin/accounts` | Admin |
| PLANNED | POST | `/api/admin/accounts` | Admin |
| PLANNED | PATCH | `/api/admin/accounts/{id}` | Admin |
| PLANNED | GET | `/api/admin/assignments` | Admin |
| PLANNED | POST | `/api/admin/assignments` | Admin |
| PLANNED | DELETE | `/api/admin/assignments/{professionalId}/{patientId}` | Admin |
| PLANNED | GET | `/api/admin/devices` | Admin |
| PLANNED | POST | `/api/admin/devices` | Admin |
| PLANNED | PATCH | `/api/admin/devices/{id}/assignment` | Admin |
| PLANNED | POST | `/api/admin/devices/{id}/revocation` | Admin |
| PLANNED | GET | `/api/admin/services` | Admin |
| PLANNED | GET | `/api/admin/model` | Admin (metadata only) |
| PLANNED | WebSocket | `/api/events` | Patient (own subject), professional (assigned patients), admin (metadata events only) |

## Implemented routes

### GET `/api/health` — IMPLEMENTED

- Caller: public; no session or role check.
- Request: no JSON body.
- Success `200`:

```json
{"status":"ok"}
```

- Errors: 401/403 not applicable (public route). 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `HealthSource.java:10-19`.

### GET `/api/health/database` — IMPLEMENTED

- Caller: public.
- Request: no JSON body.
- Success `200`:

```json
{"status":"ok"}
```

- Unhealthy `503`:

```json
{"status":"error"}
```

- Errors: 401/403 not applicable. 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `DatabaseHealthSource.java:13-49`.

### GET `/api/health/ingestion` — IMPLEMENTED

- Caller: public.
- Request: no JSON body.
- Success `200` (the same body is returned with `503` and `"status":"error"` when MongoDB or the schema is not ready):

```json
{
  "status": "ok",
  "connected": true,
  "received": 128,
  "saved": 120,
  "duplicate": 5,
  "rejected": 3,
  "storeFailed": 0,
  "unowned": 1,
  "ownershipConflict": 2,
  "rejectedByReason": {"invalid_payload": 2, "unknown_device": 1},
  "lastRejectionReason": "invalid_payload",
  "lastMessageAt": "2026-11-23T09:15:00Z"
}
```

- Errors: 401/403 not applicable. 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `IngestionHealthSource.java:16-104`.

### POST `/api/auth/login` — IMPLEMENTED

- Caller: public.
- Request JSON:

```json
{"email":"patient-001@example.test","password":"correct-horse"}
```

- Success `200`:

```json
{
  "userId": "patient-001",
  "role": "PATIENT",
  "csrfToken": "9f2c...redacted"
}
```

- Response also sets `Set-Cookie: SMARTCARE_SESSION=...; Path=/; HttpOnly; SameSite=Strict; Secure` (the `Secure` flag is profile-driven).
- Errors:

```json
{"error":"invalid_credentials","message":"Invalid credentials"}
```

```json
{"error":"too_many_attempts","message":"Too many login attempts"}
```

- 403 not applicable (public route; CSRF token is not required for login). 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `AuthResource.java:17-47`, `AuthService.java:33-57`.

### POST `/api/auth/logout` — IMPLEMENTED

- Caller: any authenticated role (patient, professional, admin). No role-specific restriction exists.
- Request: no JSON body. Requires `Cookie: SMARTCARE_SESSION=...` and `X-CSRF-Token: <session csrfToken>`.
- Success `204` with empty body and an expired session cookie.
- Errors:

```json
{"error":"unauthorized","message":"Not authenticated"}
```

```json
{"error":"csrf_invalid","message":"Invalid or missing CSRF token"}
```

- 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `AuthResource.java:49-66`, `SecurityFilter.java:41-54`.

### GET `/api/session` — IMPLEMENTED

- Caller: any authenticated role (patient, professional, admin). No role-specific restriction exists.
- Request: no JSON body; requires the session cookie.
- Success `200`:

```json
{
  "userId": "pro-001",
  "role": "PROFESSIONAL",
  "csrfToken": "9f2c...redacted",
  "expiresAt": "2026-11-23T17:45:00Z"
}
```

- Errors:

```json
{"error":"unauthorized","message":"Not authenticated"}
```

- 403 is not enforced by this route; a CSRF token is not needed for `GET`. 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Source: `SessionResource.java:10-31`.

### GET `/api/me/measurements` — IMPLEMENTED

- Caller: `PATIENT` only. The subject is taken from the validated session; client `patientId`/`userId` query parameters are ignored.
- Request: no JSON body. The current implementation does not support pagination; unknown query parameters are ignored.
- Success `200` (all responses also set `Cache-Control: no-store`):

```json
{
  "measurements": [
    {
      "acquiredAtUtc": "2026-11-17T12:00:00Z",
      "heartRate": 75,
      "spo2": 98,
      "quality": "good",
      "reason": null,
      "deviceId": "sc-001",
      "source": "simulated"
    }
  ]
}
```

- Empty history returns `{"measurements":[]}`.
- Errors:

```json
{"error":"unauthorized","message":"Not authenticated"}
```

```json
{"error":"forbidden","message":"Patient session required"}
```

```json
{"error":"measurements_unavailable","message":"Measurement history is unavailable"}
```

- 404 has no JSON body in the current code; PLANNED 404 body is `{"error":"not_found","message":"Resource not found"}`.
- Pagination: **PLANNED**, see [Planned cursor pagination](#planned-cursor-pagination-for-get-apimeasurements).
- Source: `PatientMeasurementsResource.java:21-81`.

## Planned routes

For every PLANNED route below, `401`, `403` and `404` use the documented envelopes: 401 `{"error":"unauthorized","message":"Not authenticated"}`, 403 `{"error":"forbidden","message":"Forbidden"}` (or `csrf_invalid` on non-safe HTTP methods), 404 `{"error":"not_found","message":"Resource not found"}`. None of these routes exists in the Java source yet.

### GET `/api/me/device` — PLANNED

- Caller: patient only; device derived from the session subject.
- Request: no JSON body.
- Success `200`:

```json
{
  "deviceId": "sc-001",
  "fresh": true,
  "lastSeenAtUtc": "2026-11-23T09:15:00Z",
  "assignmentStatus": "assigned"
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/me/measurements/export` — PLANNED

- Caller: patient only; filters must be revalidated server-side against the session subject.
- Request: no JSON body; filters are query parameters, for example `/api/me/measurements/export?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z`.
- Success `200` is `text/csv`, not JSON:

```csv
acquiredAtUtc,heartRate,spo2,quality,reason,deviceId,source
2026-11-17T12:00:00Z,75,98,good,,sc-001,simulated
```

- Errors (JSON): 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/me/alerts` — PLANNED

- Caller: patient only.
- Request: no JSON body.
- Success `200`:

```json
{
  "alerts": [
    {
      "alertId": "al-123",
      "state": "open",
      "severity": "high",
      "openedAtUtc": "2026-11-23T08:40:00Z",
      "message": "Low SpO2"
    }
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/patients` — PLANNED

- Caller: professional; only assigned patients may be returned.
- Request: no JSON body.
- Success `200`:

```json
{
  "patients": [
    {"patientId": "patient-001", "displayName": "Patient A", "assigned": true}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/patients/{id}` — PLANNED

- Caller: professional; assignment to `{id}` is required. Admin may see metadata only through `/api/admin/*`, not clinical detail here.
- Request: no JSON body.
- Success `200`:

```json
{
  "patientId": "patient-001",
  "displayName": "Patient A",
  "active": true,
  "assignedDevices": ["sc-001"]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found (may mask an unassigned patient).

### GET `/api/patients/{id}/measurements` — PLANNED

- Caller: professional; assignment to `{id}` is required.
- Request: no JSON body; planned query parameters include `from`, `to`, `quality`, `limit` and `cursor`.
- Success `200`:

```json
{
  "measurements": [
    {
      "acquiredAtUtc": "2026-11-17T12:00:00Z",
      "heartRate": 75,
      "spo2": 98,
      "quality": "good",
      "reason": null,
      "deviceId": "sc-001",
      "source": "simulated"
    }
  ],
  "pageInfo": {"nextCursor": null, "hasMore": false}
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found (may mask an unassigned patient).

### GET `/api/patients/{id}/measurements/export` — PLANNED

- Caller: professional; assignment to `{id}` is required.
- Request: no JSON body; same filters as the planned measurement history route.
- Success `200` is `text/csv`, not JSON:

```csv
acquiredAtUtc,heartRate,spo2,quality,reason,deviceId,source
2026-11-17T12:00:00Z,75,98,good,,sc-001,simulated
```

- Errors (JSON): 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/alerts` — PLANNED

- Caller: professional; only alerts for assigned patients may be returned.
- Request: no JSON body; planned query parameters include `patientId` and `state`.
- Success `200`:

```json
{
  "alerts": [
    {
      "alertId": "al-123",
      "patientId": "patient-001",
      "state": "open",
      "severity": "high",
      "openedAtUtc": "2026-11-23T08:40:00Z"
    }
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### POST `/api/alerts/{id}/acknowledgements` — PLANNED

- Caller: professional assigned to the alert's patient.
- Request JSON:

```json
{"note":"Reviewed; patient contacted."}
```

- Success `201` (author and time are server-generated; acknowledgement must not imply resolution):

```json
{
  "acknowledgementId": "ack-1",
  "alertId": "al-123",
  "authorUserId": "pro-001",
  "acknowledgedAtUtc": "2026-11-23T09:20:00Z",
  "note": "Reviewed; patient contacted.",
  "alertState": "open"
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token` (403 `csrf_invalid`).

### GET `/api/admin/accounts` — PLANNED

- Caller: admin.
- Request: no JSON body.
- Success `200`:

```json
{
  "accounts": [
    {"userId": "patient-001", "role": "PATIENT", "active": true},
    {"userId": "pro-001", "role": "PROFESSIONAL", "active": true}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### POST `/api/admin/accounts` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"userId":"nurse-002","role":"PROFESSIONAL","active":true,"password":"redacted"}
```

- Success `201` (never echo the password):

```json
{"userId":"nurse-002","role":"PROFESSIONAL","active":true}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### PATCH `/api/admin/accounts/{id}` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"role":"PROFESSIONAL","active":false}
```

- Success `200`:

```json
{"userId":"nurse-002","role":"PROFESSIONAL","active":false}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### GET `/api/admin/assignments` — PLANNED

- Caller: admin.
- Request: no JSON body.
- Success `200`:

```json
{
  "assignments": [
    {"professionalId": "pro-001", "patientId": "patient-001"}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### POST `/api/admin/assignments` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"professionalId":"pro-001","patientId":"patient-002"}
```

- Success `201`:

```json
{"professionalId":"pro-001","patientId":"patient-002","active":true}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### DELETE `/api/admin/assignments/{professionalId}/{patientId}` — PLANNED

- Caller: admin.
- Request: no JSON body.
- Success `204` with empty body; related access grants must be revoked server-side.
- Errors (JSON): 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### GET `/api/admin/devices` — PLANNED

- Caller: admin; metadata only.
- Request: no JSON body.
- Success `200`:

```json
{
  "devices": [
    {"deviceId":"sc-001","patientId":"patient-001","status":"active"}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### POST `/api/admin/devices` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"deviceId":"sc-002","secret":"redacted"}
```

- Success `201` (never echo the secret):

```json
{"deviceId":"sc-002","status":"registered"}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### PATCH `/api/admin/devices/{id}/assignment` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"patientId":"patient-002"}
```

- Success `200`:

```json
{
  "deviceId": "sc-001",
  "patientId": "patient-002",
  "assignmentHistory": [
    {"patientId": "patient-001", "fromUtc": "2026-11-01T00:00:00Z", "toUtc": "2026-11-23T09:30:00Z"},
    {"patientId": "patient-002", "fromUtc": "2026-11-23T09:30:00Z", "toUtc": null}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### POST `/api/admin/devices/{id}/revocation` — PLANNED

- Caller: admin.
- Request JSON:

```json
{"reason":"device lost"}
```

- Success `200`:

```json
{"deviceId":"sc-001","revokedAtUtc":"2026-11-23T09:40:00Z","reason":"device lost"}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found. Non-safe method also requires `X-CSRF-Token`.

### GET `/api/admin/services` — PLANNED

- Caller: admin.
- Request: no JSON body.
- Success `200`:

```json
{
  "services": [
    {"name":"ingestion","status":"ok","lastCheckedAtUtc":"2026-11-23T09:45:00Z"},
    {"name":"database","status":"ok","lastCheckedAtUtc":"2026-11-23T09:45:00Z"}
  ]
}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### GET `/api/admin/model` — PLANNED

- Caller: admin. Availability, version and mode only; no physiological data.
- Request: no JSON body.
- Success `200`:

```json
{"model":{"available":true,"version":"1.0.0","mode":"rules"}}
```

- Errors: 401 unauthorized; 403 forbidden; 404 not_found.

### WebSocket `/api/events` — PLANNED

- Caller: patient (own subject only), professional (assigned patients only), admin (metadata channels only). Authorization must be checked at handshake and again on every subscribe.
- Request JSON (first client frame):

```json
{"type":"subscribe","channels":["measurements","alerts"],"patientId":"patient-001"}
```

- Success JSON (server frames):

```json
{"type":"subscribed","subscriptionId":"sub-1","channels":["measurements","alerts"]}
```

```json
{
  "type": "measurement",
  "patientId": "patient-001",
  "measurement": {
    "acquiredAtUtc": "2026-11-23T09:50:00Z",
    "heartRate": 74,
    "spo2": 97,
    "quality": "good",
    "reason": null,
    "deviceId": "sc-001",
    "source": "simulated"
  }
}
```

- Errors: during the HTTP handshake, 401 `{"error":"unauthorized","message":"Not authenticated"}`, 403 `{"error":"forbidden","message":"Forbidden"}` and 404 `{"error":"not_found","message":"Resource not found"}` use the common envelopes. After upgrade, failures are JSON frames:

```json
{"type":"error","error":"forbidden","message":"Forbidden"}
```

## Planned cursor pagination for `GET /api/me/measurements`

**PLANNED** extension to the implemented route. The current implementation still returns every owned measurement in `{"measurements":[...]}` and ignores unknown query parameters.

Parameters:

- `limit`: optional integer, `1..200`. Default is `50` when pagination is requested. Values above `200` are rejected with `400 {"error":"invalid_limit","message":"limit must be between 1 and 200"}`; they are not silently clamped.
- `cursor`: opaque, server-generated string from a previous `pageInfo.nextCursor`. Clients must not parse it. It is bound to the authenticated `userId`, `from`, `to`, `quality` (when added) and resolved `limit`; a missing, malformed or foreign cursor returns `400 {"error":"invalid_cursor","message":"Invalid cursor"}`.
- `from`: optional ISO-8601 UTC instant, inclusive.
- `to`: optional ISO-8601 UTC instant, exclusive.
- Invalid ranges (`from >= to`, bad timestamp) return `400 {"error":"invalid_range","message":"Invalid time range"}`.
- Ordering is stable: `acquiredAtUtc` ascending, then `deviceId`, `bootId` and `sequence` (the same sort used by the current repository). The cursor encodes this sort key, never a raw Mongo document, cookie or patient identifier.

First request:

```text
GET /api/me/measurements?limit=100&from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z
Cookie: SMARTCARE_SESSION=...
```

Next request:

```text
GET /api/me/measurements?limit=100&from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z&cursor=eyJrIjoiMjAyNi0xMS0xN1QxMjonLCJkIjoic2MtMDAxIn0
Cookie: SMARTCARE_SESSION=...
```

Success `200` when pagination parameters are supplied:

```json
{
  "measurements": [
    {
      "acquiredAtUtc": "2026-11-17T12:00:00Z",
      "heartRate": 75,
      "spo2": 98,
      "quality": "good",
      "reason": null,
      "deviceId": "sc-001",
      "source": "simulated"
    }
  ],
  "pageInfo": {
    "nextCursor": "eyJrIjoiMjAyNi0xMS0xN1QxMjonLCJkIjoic2MtMDAxIn0",
    "hasMore": true
  }
}
```

Final page uses `"nextCursor": null` and `"hasMore": false`. With no pagination parameters, the response remains exactly the implemented `{"measurements":[...]}` shape. All responses keep `Cache-Control: no-store`.

Pagination errors use the common 401/403/404 envelopes above, plus the planned `400` codes defined in this section.
