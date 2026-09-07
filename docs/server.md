# Server Architecture

## Purpose

The server is optional. It can provide:

- account-backed synchronization;
- remote AI orchestration;
- centralized APIs;
- optional analytics;
- multi-device synchronization.

Local functionality should not depend on a server unless the feature explicitly requires it.

## Structure

```text
server/src/
├── app.ts
├── server.ts
├── config/
├── routes/
├── controllers/
├── services/
├── middleware/
├── repositories/
└── utils/
```

## Request flow

```text
HTTP
 ↓
Security
 ↓
Rate limit
 ↓
Validation
 ↓
Controller
 ↓
Service
 ↓
Repository/provider
 ↓
Response
```

## Security

- Authenticate protected resources.
- Authorize every user-owned resource.
- Validate request bodies, params, and query strings.
- Limit request sizes.
- Rate-limit expensive operations.
- Do not log secrets or raw sensitive content.
- Use HTTPS in production.

## Ownership

Repositories must scope multi-user records to the authenticated owner.

## Health

Liveness answers whether the process is alive. Readiness answers whether required dependencies are available.

An optional AI-provider outage should not automatically make the API process unhealthy.
