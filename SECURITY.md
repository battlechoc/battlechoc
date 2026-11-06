# Security

## Reporting a vulnerability

Please report a vulnerability privately and not in a public issue:

- on GitHub with [Report a vulnerability](https://github.com/battlechoc/battlechoc/security/advisories/new) (the repository's Security tab), or
- by e-mail to **[hello@battlechoc.com](mailto:hello@battlechoc.com)**.

Tell us what you found, how to reproduce it and what someone could do with it. We will answer as soon as we can and tell you when a fix is released.

## Scope

- The API (`apps/api`, running at `api.battlechoc.com`): accounts, profiles, the lab, Web Push and the live match WebSocket.
- The game client (`apps/pwa`, running at `battlechoc.com`).

Please test against your own account or a local copy (the [README](README.md) shows how to run the whole stack locally), and do not disturb other players or the running service.

## Supported versions

Only the latest [release](https://github.com/battlechoc/battlechoc/releases) is supported. A fix goes into the next release.

## Bounty

There is no bug bounty.
