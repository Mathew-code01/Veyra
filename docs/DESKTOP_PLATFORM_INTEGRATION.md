# Desktop–Platform integration (verified snapshot)

Date: 2026-11-15.

## Responsibility boundary
Electron owns interview practice, local inference, candidate documents/context, voice, and desktop overlay/capture. Platform owns shared identity, devices, entitlements, subscription/payment/credit truth, cloud AI authorization, usage records and releases.

## Observed state
- Desktop is Electron 39 + Vite/React/TypeScript with local model, voice, SQLite/Drizzle and interview/context services.
- No Platform SDK or direct Platform HTTP client use was found in inspected Electron main/preload/UI files.
- `server/` contains a separate Express control-plane with account/device/billing/AI scaffolding; connection to Electron lifecycle was not established.
- Development renderer is configured at port 5174; Platform is 3000.

## Required before claiming integration
Wire one authenticated Platform client into the Electron main process, use secure OS credential storage and narrow IPC, and implement device registration/revocation plus entitlement refresh. Do not let the renderer supply authoritative plan, credit or user identifiers. Verify offline/expired/revoked sessions, retries and account switching with tests. No cross-project lifecycle flow was executed in this pass.