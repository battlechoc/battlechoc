# Play test 2026-10-30: answers to the questions (Part B)

Checked on 2026-10-30 against the code on `main` (7eb29fa) and the live site. No code was changed for this report.

## B1. Why there is no install dialog

**Short answer:** battlechoc is installable, but it never asks. The "install dialog" you see in other PWAs is their own button calling `prompt()` on the saved `beforeinstallprompt` event. battlechoc does not listen for that event, so it only gets what the browser shows by itself. On desktop Chrome that is a small install icon in the address bar. On Android it is a mini-infobar at most, which disappears for a long time once dismissed.

What I checked:

| Requirement (Chrome) | battlechoc | OK? |
| --- | --- | --- |
| HTTPS | `https://battlechoc.com`, http and www redirect to it | yes |
| Manifest linked and served | `/manifest.json`, `application/json` | yes |
| `name` / `short_name` | both `battlechoc` | yes |
| Icons 192 and 512 px | `icon-192x192.png`, `icon-512x512.png` (512 checked), plus maskable ones | yes |
| `start_url` | `./index.html?app_runs_as=pwa&app_version=1` | yes |
| `display` | `fullscreen` | yes |
| `prefer_related_applications` | not set | yes |
| Service worker | `/service-worker.js` (Workbox), registered in production | yes (no longer required by Chrome, still needed for offline) |
| Engagement | the user has tapped once and stayed 30 s | browser side |
| `beforeinstallprompt` listener | **none** in the code | missing |
| `description`, `screenshots` | **not in the manifest** | missing (no rich install sheet) |

What is missing, in order of effect:

1. **A `beforeinstallprompt` listener and an install button.** Save the event (`event.preventDefault()`), show an "Install" button (title screen or Settings, maybe after the first won match), call `deferred.prompt()` on tap, then hide the button on `userChoice` or on the `appinstalled` event. Hide it when the page already runs installed (`matchMedia("(display-mode: fullscreen)")`, `standalone`, or `navigator.standalone` on iOS). Effort: about half a day, including texts in 8 languages and a Playwright test that fires a fake event.
2. **`description` and `screenshots` in the manifest.** With them, Chrome on Android and desktop shows the larger install sheet with pictures instead of the plain one. That means a few portrait and landscape screenshots (`form_factor: "narrow"` and `"wide"`), which we can make with the screenshot script from this play test.
3. Small fixes in the manifest: `theme_color` (#3190C3) differs from the page's `theme-color` meta (#457B82); `id: "/"` while `start_url` is `/index.html?...` works, but keep `id` stable from now on, because changing it makes Chrome treat the app as a new one.

**iOS** has no `beforeinstallprompt` and no install API at all. The only way in is Share, then "Add to Home Screen" in Safari (and since iOS 16.4 also in other browsers). A custom button can only show instructions. The app already shows a one-time hint (`IOS_MESSAGE` in `App.jsx`), but the detection is weak:

- It tests `navigator.platform` for iPhone/iPad/iPod, but iPads report `MacIntel` since iPadOS 13, so iPads never get the hint.
- It treats the app as installed only for `display-mode: fullscreen`. iOS runs home-screen apps as `standalone`, so the check should also use `navigator.standalone`.
- The hint shows once ever, as a 6 s toast. A permanent "How to install" entry in Settings, with the two steps and a picture, would work better.

Sources: [web.dev install criteria](https://web.dev/articles/install-criteria), [Chrome: mini-infobar update](https://developer.chrome.com/blog/mini-infobar-update), [Chrome: changes to add to home screen](https://developer.chrome.com/blog/a2hs-updates).

## B2. Next steps to deploy the server

**State:** the code is ready to run (Docker stack in `deploy/`, verified locally with TLS and a WebSocket bot match in October). Nothing runs in production: `api.battlechoc.com` has no DNS record (checked 2026-10-30), so every player is offline on battlechoc.com and only plays against the local AI. The PWA already points at `https://api.battlechoc.com`, so it goes online the moment the API answers there.

### Infrastructure

- **VPS:** one small Linux machine in the EU (GDPR; the privacy policy has to name the hoster and location). 2 vCPU, 2 to 4 GB RAM and 40 GB disk are plenty at the start. **Only one API process:** live matches and the lab's upgrade queue live in the process memory, so do not scale horizontally or run two replicas.
- **Software:** Docker with Compose. The stack is `deploy/docker-compose.yml`: `postgres:17-alpine`, the API image (`apps/api/Dockerfile`, Node 22), `caddy:2-alpine` (Let's Encrypt TLS, WebSocket proxy).
- **Firewall:** open 22 (SSH, keys only), 80 and 443 (Caddy needs 80 for the certificate). Postgres stays inside the Docker network.
- **Domain:** at OVH, an `A` (and `AAAA` if the VPS has IPv6) record `api.battlechoc.com` pointing to the VPS. The PWA stays on GitHub Pages.

### Environment variables and secrets (`deploy/.env` on the VPS, never in the repository)

| Variable | What | Note |
| --- | --- | --- |
| `API_DOMAIN` | `api.battlechoc.com` | Caddy site name |
| `POSTGRES_PASSWORD` | random | `openssl rand -base64 32` |
| `JWT_SECRET` | at least 32 random characters | changing it logs every device out |
| `CORS_ORIGINS` | `https://battlechoc.com` | the example also lists `http://localhost:3000`: drop it in production |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys, `npx web-push generate-vapid-keys` | keep them forever, new keys break existing push subscriptions |
| `VAPID_SUBJECT` | `mailto:contact@battlechoc.com` | the example says `info@battlechoc.dev`, which does not match the privacy policy |
| `RECIPES_PATH` | path of the private recipe table on the VPS | the API refuses to start in production without it; copy `battlechoc-private/recipes.json`, `chmod 600`, check it first with `node apps/api/scripts/check-recipes.js <file>` |

For an automated deploy you also need GitHub environment secrets: an SSH deploy key (or a registry token if the VPS pulls images) and the host's SSH fingerprint.

### Database

- Postgres 17 in the `pgdata` volume. The API applies its migrations (`apps/api/src/migrations`) on every start, so a fresh database needs nothing by hand.
- **Backups are not set up:** a nightly `pg_dump` to storage outside the VPS, kept for a few weeks, and one test restore before launch.

### Steps, in order

1. Order the VPS, add your SSH key, firewall, automatic security updates, install Docker.
2. Create the DNS record for `api.battlechoc.com` (short TTL at first).
3. Put the repository (or just `deploy/`, `apps/api`, `packages/shared`) on the VPS, write `deploy/.env`, copy the recipe table.
4. `docker compose -f deploy/docker-compose.yml up -d --build`, then check `https://api.battlechoc.com/health`, the certificate, and `wss://api.battlechoc.com/live`.
5. Acceptance: `apps/api/scripts/live-bots.js` against the VPS (target p95 ≤ 150 ms), two real devices in one match, Web Push on Chrome desktop, Android and an iOS home-screen app.
6. Backups and monitoring: uptime check on `/health`, Docker log rotation, a way to see errors.
7. Update the privacy policy (hoster, location, controller address).
8. Then the follow-ups: `assetlinks.json` and the TWA (B4), remove `apps/server`, delete the Firebase project and Heroku leftovers, revoke the old secrets.

### Still open in the code

- **No deploy workflow.** Options: (a) a GitHub Action that SSHes in and runs `git pull && docker compose up -d --build`, or (b) build the API image in CI, push it to GHCR, and have the VPS pull it. (b) keeps build tools and the repository off the VPS. Either way, deploy only after CI is green, like `pages.yml`.
- **No backup or monitoring scripts** in `deploy/`.
- The `.env.example` values above (`CORS_ORIGINS`, `VAPID_SUBJECT`).
- The flaky online e2e test (reconnect after a slow page) is still open; it is a test timing issue, not a known server bug.
- A restart closes sockets with 1012 and the server resumes matches from its snapshots; this works in tests, but a deploy during a match still costs players a few seconds. Deploy at quiet times.

## B3. Why the release-please setup looks complicated

**Short answer:** you are right that it is more complicated than it needs to be, but not about the token. **Neither repository uses a personal token.** Both run release-please with the default `GITHUB_TOKEN`. uverify-ui writes `token: ${{ secrets.GITHUB_TOKEN }}`, which is just the default spelled out.

### Side by side

| | battlechoc | uverify-ui |
| --- | --- | --- |
| Workflow | `.github/workflows/release-please.yml` | `.github/workflows/release.yml` |
| Trigger | push to `main` | push to `main` |
| Permissions | `contents`, `pull-requests`, **`actions: write`** | `contents`, `pull-requests` |
| Token | default | default (written out) |
| Extra step | dispatches `ci.yml` and `secret-scan.yml` on the release branch | none |
| Setting "Allow GitHub Actions to create and approve pull requests" | **off** | on |
| Required checks on `main` | `test-and-build`, `e2e`, `gitleaks` + 1 approval | 1 approval only |

### Is a token needed here?

No. Two separate things are going on:

1. **The Release workflow fails on every push to `main`** because the repository setting "Allow GitHub Actions to create and approve pull requests" is off. That setting, not the YAML, is the difference to uverify-ui. Turn it on (Settings, Actions, General) and release-please can open its pull request.
2. **The dispatch step** exists because battlechoc requires status checks and uverify-ui does not. It was written for the old rule that a pull request opened with `GITHUB_TOKEN` starts no workflows, so the required checks would never report. **That rule changed on 2026-06-11:** such pull requests now get their `pull_request` runs, but they wait until someone with write access clicks "Approve workflows to run" ([GitHub changelog](https://github.blog/changelog/2026-06-11-bot-created-pull-requests-can-run-workflows-if-approved)). uverify-ui shows exactly this: on its release pull requests the first test run was created by `github-actions[bot]` and you started the second attempt by hand. Some uverify-ui release pull requests were merged without anyone approving the runs, so those releases went out without CI on the release commit.

What still holds: tags and releases created with `GITHUB_TOKEN` never trigger other workflows (no `on: release`, no tag push runs). battlechoc has no such workflow today: the merge of the release pull request is a normal push, which runs CI and then deploys through `pages.yml`.

### A minimal version

```yaml
name: Release
# Needs "Allow GitHub Actions to create and approve pull requests" (Settings, Actions, General).
# Before merging the release pull request, click "Approve workflows to run" on it.
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
concurrency:
  group: release-please
  cancel-in-progress: false
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v5
```

### What we lose by simplifying

- **The checks no longer start by themselves.** Each release pull request needs one click on "Approve workflows to run" before it can be merged. Without the click the required checks stay "Expected", and only the org-admin bypass could merge it.
- **We gain:** no `actions: write` (today the release job could dispatch any workflow, `pages.yml` included), no duplicate runs on the release pull request (dispatched runs plus the waiting `pull_request` runs), and no untested step (the dispatch step has never run, because the workflow always failed on the setting first).
- `concurrency` costs nothing and prevents two quick pushes from racing; I would keep it.

### Alternatives

- **Minimal version plus one approve click per release (recommended):** same as uverify-ui, no secret.
- **GitHub App token** (`actions/create-github-app-token`): checks start automatically, tags and releases can trigger workflows, the repository setting can stay off, and you can approve the bot's pull request. Costs a one-time App setup and a private key to keep safe. Best if zero clicks matter.
- **Fine-grained personal token:** a poor fit. The release pull request would be authored by you, and the ruleset needs one approval that the author cannot give, so every release would need the bypass. It also expires and ties releases to your personal account.
- **Dropping the required checks:** rulesets match the target branch, so the release branch cannot be exempted alone. It would drop the checks for every pull request.

Also outdated: the comment in `release-please.yml` says pull requests opened with `GITHUB_TOKEN` start no workflows. I left it as is (no code changes for Part B); it should change together with whichever option you pick.

## B4. Play Store and iOS

### What is there today

- **The Play listing is gone.** `play.google.com/store/apps/details?id=com.battlechoc.game` and the developer page answer 404, and a store search finds nothing (checked 2026-10-30). The last public copy (Wayback Machine, 2021-02-06) shows version 2.20, 500+ installs, developer "battlechoc", info@battlechoc.com. From outside, "unpublished", "removed for policy", "deleted" and "developer account closed" all look the same; only the Play Console tells which. The old app fits Google's rule for closing inactive personal accounts (older than a year, under 1,000 installs, no Play Console use for 180 days), so a closed account is likely.
- **The 2019 keystore is probably the upload key, not the app signing key.** Its certificate (alias `battlechoc_key`) has SHA-256 `0F:3B:…`, while the `assetlinks.json` committed one day later lists `95:7C:…`. That pattern fits an app enrolled in Play App Signing (unverified). `apps/android/twa-manifest.json` expects alias `battlechoc` and a file `battlechoc-upload.keystore`: both need fixing before a build.
- **`assetlinks.json` is not served.** `https://battlechoc.com/.well-known/assetlinks.json` answers 404, although the file is in `apps/pwa/public/.well-known/`. Cause: `actions/upload-pages-artifact` excludes files and folders starting with a dot unless `include-hidden-files: true` is set, and `pages.yml` does not set it (the Brave verification file in the same folder is missing too). Until that one line is added, a TWA always shows the browser's URL bar. I did not change it (Part B is report only).

### Steps to list it again as a TWA

1. **Find out what happened, in the Play Console of the old account.** This decides between keeping the package name and starting over:
   - *Unpublished:* publish again (App availability). Same package.
   - *Removed for a policy issue (for example an old target API):* fix it and upload an update. Same package.
   - *Deleted, or the account was closed:* package names with installs can never be reused and closed accounts cannot be reopened. You need a new package name (for example `com.battlechoc.app`), a new key and new asset links. Old installs from 2021 get no updates.
2. **Signing (same package only):**
   - *Enrolled in Play App Signing:* Google holds the app signing key. If the upload key password stays lost, make a new upload key and use "Request upload key reset" in the Play Console (account owner only).
   - *Not enrolled:* every update needs the original key and its password; Google cannot reset it. Without the password you are on the new-package path.
3. **Build with the Bubblewrap CLI** (`@bubblewrap/cli` 1.27.0, October 2026; targets API 36, which Play requires for new apps and updates since 2026-08-31). In `apps/android/`: `bubblewrap update`, then `bubblewrap build` gives the `.aab` for Play and a signed `.apk` for testing. The version code must be higher than the last uploaded one. PWABuilder builds on Bubblewrap and works for a one-off build, but the CLI keeps the configuration in the repository.
4. **Digital Asset Links:** take the SHA-256 of the **app signing key** from Play Console, Setup, App signing (plus the upload key if sideloaded test builds should verify), `bubblewrap fingerprint add <sha256>`, `bubblewrap fingerprint generateAssetLinks`, put the result into `apps/pwa/public/.well-known/assetlinks.json`, add `include-hidden-files: true` to `pages.yml`, deploy, then check with Google's Digital Asset Links API and an internal-test install (no URL bar).
5. **Play Console account.** An account created before 2023-11-13 is exempt from the testing rule. A **new personal account** needs the one-time US$25 fee, identity verification (government ID, legal name and address from a verified payments profile, verified e-mail and phone; D-U-N-S only for organizations), proof of a physical Android 10+ phone, and **a closed test with at least 12 testers opted in for 14 days in a row** before you can apply for production (the cut from 20 to 12 testers in December 2024 is only reported by secondary sources). Then production review, usually days.
6. **App content and listing:** privacy policy URL `https://battlechoc.com/privacy-policy/`; app access without login; no ads; IARC content rating questionnaire (declare that players interact online); Data safety form consistent with the privacy policy (device account, player name, push subscription, problem reports); target audience (choosing under 13 brings in the Families policy; with cartoon art, answer "appeals to children" honestly; 13+ is the simpler choice); 512 px icon, 1024×500 feature graphic, at least two screenshots, short and long description, category Games, Strategy. Release internal first, then closed, then production.
7. **Policy:** Play bans apps that are a webview of a site *without the owner's permission*; a TWA of our own site is fine, and an offline 3D game is far from "minimum functionality".
8. Android developer verification for apps outside Play (rolling out 2026 to 2027) only matters if we also hand out APKs ourselves.

### iOS

There is no TWA equivalent: every web app in the App Store is a WKWebView wrapper.

- **PWABuilder's iOS package:** the project was archived on 2025-09-11 (community support only). Not recommended.
- **Capacitor** (8.6, October 2026): bundle the built PWA into the app (loading the live site is "not intended for production"), and add something native (Game Center, haptics, push through APNs) to get past review.
- **App Store review:** guideline 4.2 (minimum functionality) wants the app to be more than "a repackaged website", 4.2.2 forbids "web clippings", 4.2.3 wants the app to work on its own. A real offline game has better chances than a wrapped content site, but 4.2 is the usual rejection. Costs: US$99 a year, a Mac with Xcode, and in the EU an individual "trader" must publish an address, phone number and e-mail on the product page.

**Without the App Store ("Add to Home Screen"):**

- iOS 26 opens every site added to the Home Screen as a web app by default, with the manifest's icons.
- Web Push and app badges work for Home Screen apps (since iOS 16.4); asking for permission needs a tap.
- Storage: Home Screen apps keep their own data and are not cleared by Safari's 7-day rule like a normal site; their storage is separate from Safari's, so a device account made in Safari does not carry over.
- Limits: no install prompt (only our own "Share, then Add to Home Screen" hint, see B1), no Fullscreen API on iPhone, no orientation lock.
- In the EU, Apple dropped its plan to remove Home Screen web apps (iOS 17.4); they keep working.

**Recommendation:** keep iOS as a Home Screen PWA with a better install hint for now, and only try Capacitor with bundled files if a store presence becomes important.

### What I need from you

1. Access to the Google account that owned the old developer account (info@battlechoc.com?), and from the Play Console: the app's status (Dashboard, Policy status, Inbox) and the App signing page (enrolled or not, both SHA-256 values).
2. The keystore and key passwords of the 2019 keystore, or confirmation that they are lost.
3. The last version code of the old app.
4. If a new account is needed: the fee, your ID, an Android phone, 12 testers for 14 days, and a decision on public contact details (trader or not).
5. OK to add `include-hidden-files: true` to `pages.yml` and to fix alias and path in `twa-manifest.json`.
6. Decisions on target audience, Data safety answers, store texts and screenshots, and whether iOS stays a PWA.

Sources (all checked 2026-10-30): [Play: unpublish and republish](https://support.google.com/googleplay/android-developer/answer/9859350), [Play: deleted apps and package names](https://support.google.com/googleplay/android-developer/answer/16483176), [Play: inactive accounts](https://support.google.com/googleplay/android-developer/answer/11605267), [Play App Signing and upload key reset](https://support.google.com/googleplay/android-developer/answer/9842756), [Play: testing requirement for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465), [Play: account verification](https://support.google.com/googleplay/android-developer/answer/13628312), [Android target API requirement](https://developer.android.com/google/play/requirements/target-sdk), [Bubblewrap releases](https://github.com/GoogleChromeLabs/bubblewrap/releases), [upload-pages-artifact action.yml](https://github.com/actions/upload-pages-artifact/blob/main/action.yml), [Play spam and minimum functionality policy](https://support.google.com/googleplay/android-developer/answer/9899034), [Android developer verification](https://developer.android.com/developer-verification), [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements), [pwabuilder-ios (archived)](https://github.com/pwa-builder/pwabuilder-ios), [WebKit: Safari 26](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/), [WebKit: Web Push for web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [WebKit: storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [MacRumors: EU web apps stay](https://www.macrumors.com/2024/03/01/apple-walks-back-decision-to-disable-eu-web-apps/).
