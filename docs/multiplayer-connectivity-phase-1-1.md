# Multiplayer Connectivity Phase 1.1

This phase prepares the existing room/test-message relay for a real hosted WebSocket proof. It does not deploy a service, provide a live URL, or synchronize game state. No provider account or deployment credentials are available in this checkout.

## Hosting recommendation

Use a Render **Web Service** for the first public test. It accepts inbound WebSocket upgrades on the same public HTTP port, terminates TLS at its edge, supports a `/health` check, and can run the existing Node process without adding a server dependency. The repository includes `render.yaml` for a single relay service on the dedicated `phase-6-multiplayer-connectivity` branch. It intentionally disables automatic deploys so a later push does not deploy unexpectedly.

Render Free is suitable only for a proof, not reliable play: it has 750 free instance-hours per workspace/month; an idle free service spins down after 15 minutes and can take about a minute to wake; it can restart at any time; WebSocket connections end when the instance is stopped/replaced; and outbound traffic counts toward shared included bandwidth (overage can be billed if payment is configured, or services paused without it). Free services are single-instance. Keep it single-instance even on a paid plan: room membership is in process memory and multiple instances would not share rooms. For a continuously available test, choose a paid Render instance; current listed entry paid compute is $6/month plus bandwidth, subject to price changes. [Render WebSockets](https://render.com/docs/websocket), [Free services and limits](https://render.com/docs/free), [Pricing](https://render.com/pricing).

Railway is a viable alternative: its public networking supplies HTTPS domains, while a Hobby account currently has a $5/month minimum with $5 included usage; trial credits are temporary and its public TCP proxy is an alternative for raw TCP. Its pricing is usage-based and can exceed the included amount. Fly.io also runs a persistent Node process and prices compute by machine time (currently about $2.19/month for a 256 MB shared-cpu-1x machine before storage/egress); it is more operator-managed and outbound egress is separately charged. For this small HTTP-upgrade relay, Render's native WebSocket support and health check make it the least operational setup. Verify current price/limits before selecting a paid plan. [Railway public networking](https://docs.railway.com/networking), [Railway TCP proxy](https://docs.railway.com/networking/tcp-proxy), [Railway pricing](https://railway.com/pricing), [Fly.io pricing](https://fly.io/pricing/).

Vercel's static Vite deployment is not this Node WebSocket process; it must not be treated as hosting the relay. Deploy the frontend and relay separately. The browser opens `wss://` to the relay; the host terminates TLS and forwards the HTTP upgrade to Node on the platform-provided `PORT`.

## Configuration

Relay service variables:

| Variable | Required value | Where |
| --- | --- | --- |
| `PORT` | Supplied automatically by Render; do not hardcode or set manually | Render runtime |
| `MULTIPLAYER_ALLOWED_ORIGINS` | Comma-separated exact browser origins, e.g. `https://your-frontend-domain.example` (no path or trailing slash) | Render dashboard, or prompted while creating the Blueprint |
| `NODE_ENV` | `production` (set in Blueprint) | Render |
| `VITE_MULTIPLAYER_SERVER_URL` | `wss://<actual-relay-host>` | Frontend build environment, not relay runtime |

There are no service credentials. Do not place relay credentials in Vite variables or client code. `MULTIPLAYER_ALLOWED_ORIGINS` is an Origin allowlist, not authentication; room codes remain joinable invitation tokens, and the relay is still a proof rather than a hardened public game service. With the variable omitted locally, the server accepts origins to keep localhost development working. Production must set the exact HTTPS frontend origin(s). The client defaults to the page host on port 3001 only for local development; production needs the build-time `VITE_MULTIPLAYER_SERVER_URL` value. Rebuild/redeploy the frontend after changing it.

## Deploy steps (manual account action required)

1. Commit this change on `phase-6-multiplayer-connectivity`, then push that branch (never `main`).
2. In Render, create a Blueprint from the repository and select the `phase-6-multiplayer-connectivity` branch. Review the proposed service; it creates only `imposter-india-relay` and uses the Free plan for a proof.
3. Set `MULTIPLAYER_ALLOWED_ORIGINS` to the exact HTTPS origin where the frontend is hosted. Deploy the Blueprint. Render will assign the actual service hostname; obtain it from the dashboard after deploy.
4. Confirm `https://<actual-relay-host>/health` returns HTTP 200 JSON with `status: "ok"`.
5. Configure the frontend hosting provider's build variable `VITE_MULTIPLAYER_SERVER_URL=wss://<actual-relay-host>`, rebuild/redeploy the HTTPS frontend, then follow the test procedure below.
6. Keep the relay at one instance. Deploys/restarts discard all in-memory rooms and disconnect clients; a host leaving while the room survives causes the server to elect the next connected participant.

No Render service has been created here, so no host URL exists to report. Public WSS and cross-network connectivity remain unverified until steps 1–5 are completed by someone with repository and hosting access.

## Local verification procedure

1. Run `npm run server` and `npm run dev` in separate terminals. Use two browser profiles at `http://localhost:5173` and select the Multiple Mobiles connection proof. The host creates a room; the other client joins; send a harmless test message and confirm both clients receive it.
2. To test two devices on the same Wi-Fi, serve the HTTPS frontend (or use a trusted local HTTPS setup), run the relay on a machine reachable on the LAN, and set the frontend build variable to that machine's reachable `ws://` URL for HTTP local testing or `wss://` URL for HTTPS. Allow the firewall port. This test does not demonstrate public routing.
3. For Wi-Fi + mobile data, use the deployed HTTPS frontend on both phones, with one phone on Wi-Fi and the other on cellular. Create/join the same room, exchange a test message in both directions, and note the relay's `/health` status. Test the reverse direction if possible. A real public deployment is required.
4. Try a malformed room code in the UI, then with a protocol test client send invalid JSON, a malformed action, oversized payload, wrong-room membership, and non-member test-message actions. Expect `JOIN_ERROR`/`ERROR` or handshake rejection; verify the socket is closed after exceeding the message limit.
5. Close one client's tab/network, confirm the other sees departure, then reconnect it and join with the same room code (a fresh connection is a new membership; there is no automatic resume/grace period).
6. Close the host connection while a guest remains. Confirm the guest receives `HOST_CHANGED`; reconnect the old host and rejoin as a guest. This proof has no host reclaim protocol.

## Safeguards and limitations

- Server validates room code syntax, participant fields/membership, message shape, text length, payload size, per-socket message rate, active room count, room capacity, origin, and concurrent connections. Excess message rate closes that socket. The process invokes relay shutdown on `SIGTERM`/`SIGINT` and closes active sockets.
- Health data contains service status and active-room count only. No words, roles, votes, or gameplay state are sent or logged.
- The origin allowlist reduces unwanted browser-origin use but is not identity/authentication and can be forged by non-browser clients. There is no persistence, IP-based rate limit, reconnect token, relay authentication, or protection against distributed abuse. Keep this proof private and low-volume.
- Automated loopback relay tests prove the local websocket handshake, rules and message exchange only. They do not prove mobile-browser behavior, hosted WSS, same-Wi-Fi connectivity, or cross-network reachability.
