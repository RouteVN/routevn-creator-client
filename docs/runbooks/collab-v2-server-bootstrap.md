# Collab V2 Server Bootstrap

This folder contains bootstrap scripts for RouteVN V2 authoritative collaboration server.

## Runtime Assumptions

- Node.js 20+
- WebSocket gateway integration handled by product backend
- Auth provider must map token -> `{ clientId, claims }`
- Project membership authorization must be enforced

## Files

- `start-sync-server.js`: in-process sync server bootstrap
- `sql/server-schema.sql`: reference server schema
- `sql/client-schema.sql`: reference client schema

## Note

This bootstrap is an implementation starter, not production deployment wiring.
Production service should integrate app auth, tenancy, and websocket lifecycle.
