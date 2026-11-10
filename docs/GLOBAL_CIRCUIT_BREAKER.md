# Global circuit-breaker integration

The Division 19 codebase is TypeScript (`src/core` and `src/api`), so the emergency circuit-breaker implementation is `src/core/GlobalCircuitBreaker.ts`, not a standalone FastAPI `circuit_breaker.py`.

## What the module provides

- Local global and per-division pause state, with a status snapshot suitable for policy guards.
- Multisig verification through an injected verifier. Verification is fail-closed; a `0x` prefix or proof length alone is not accepted as authentication.
- An injected event transport for halt/resume broadcasts. State changes happen before dispatch, and a router failure does not roll back a local halt.
- Only constrained reason codes are accepted and broadcast. Do not send resident PII or free-form incident text in mesh events.

## Required production wiring

Instantiate one `GlobalCircuitBreaker` at the application composition root and supply:

1. `verifyMultisigProof`: a real cryptographic verifier backed by the approved multisig policy and key custody.
2. `dispatchDivisionEvent`: the authenticated division-event-router adapter.
3. Durable, shared persistence for state, audit history, and coordination across processes/regions. The included class is process-local and is not by itself a mesh-wide safety guarantee.

Before any resident-data operation or LUCR transaction, call `getStatus(divisionId)` and reject/hold the operation when `operational` is false. Treat inability to reach the authoritative status service as unavailable and fail closed for protected actions. Do not rely on an untrusted client-side status check as the enforcement point.

The `beast3-division-sdk` repository currently contains only its README, not a `beast3_sdk.py` implementation or `Beast3MeshClient`. The event transport must therefore be wired to the actual approved router client when that implementation is available; this module does not claim that cross-division delivery is already configured.
