# Cueva — Play Store first release (manual, click‑by‑click)

Google requires the **first** release of a new app to be uploaded through the Play Console UI.
After this, `scripts/play_publish.py` automates all future releases.

Target: a live **Internal testing** build you can install on your phone.

> **Package name is `com.cuevapp.app` and is permanent.** A Play Console app locks to the
> package of its first uploaded bundle and it can never be changed. If an app entry shows a
> different package (e.g. a placeholder `com.cueva.myapp`) and rejects the upload with
> *"needs to have the package name …"*, that entry is unusable — **Create a new app** and
> upload `app-release.aab` into it (the first upload locks it to `com.cuevapp.app`). Don't
> rename the project to match a placeholder; Auth0's native callback + the deep‑link scheme
> are all built on `com.cuevapp.app`.

---

## 0. Assets you'll need (all in this repo)
| What | Path / value |
|------|--------------|
| App bundle | `web/android/app/build/outputs/bundle/release/app-release.aab` |
| App icon (512×512) | `store/play/icon-512.png` |
| Feature graphic (1024×500) | `store/play/feature-graphic-1024x500.png` |
| Phone screenshots (×6) | `store/play/screenshots/01..06*.png` |
| Privacy policy URL | `https://cuevapp.com/privacy.html` |
| App name | `Cueva` |
| Short description | `Your movie taste, fingerprinted. Get film picks that actually fit you.` |
| Full description | see `store/play/listing.md` (or the block at the bottom) |

### Create a reviewer demo account first
The app requires sign‑in (Auth0), so Google needs a working login to review it later.
1. Open `https://cuevapp.com`, **Sign up** with a throwaway you control, e.g. `reviewer@cuevapp.com` + a password.
2. Keep those credentials — you'll paste them into **App access** (Step 3a).

---

## 1. Upload the app bundle (Internal testing)
1. Play Console → select **Cueva**.
2. Left nav → **Testing → Internal testing**.
3. **Create new release** (top right).
4. Under **App integrity / App signing** → if prompted, **accept Play App Signing** (Google manages the
   distribution key; your `cueva-upload.jks` stays your upload key). One‑time.
5. **App bundles → Upload** → choose `app-release.aab`. Wait for it to process (shows versionCode 1, "1.0").
6. **Release name**: leave the default `1 (1.0)` (or type `1.0 internal`).
7. **Release notes**: paste between the language tags, e.g.
   `<en-US>First internal build of Cueva.</en-US>`
8. **Next / Save** → it may warn about no deobfuscation file — that's fine (we don't minify).
9. Don't roll out yet if it blocks you — finish Steps 2–3 first, then come back and **Start rollout to Internal testing**.

---

## 2. Main store listing
Left nav → **Grow → Store presence → Main store listing**.
1. **App name**: `Cueva`
2. **Short description**: `Your movie taste, fingerprinted. Get film picks that actually fit you.`
3. **Full description**: paste the full block (bottom of this file).
4. **App icon**: upload `store/play/icon-512.png`
5. **Feature graphic**: upload `store/play/feature-graphic-1024x500.png`
6. **Phone screenshots**: upload all 6 from `store/play/screenshots/` (drag in order; lead with
   `04-home-matches` and `06-profile`). Minimum 2 required.
7. **Save**.

(Then **Store settings**: App category = **Entertainment**; add a support **email** you control.)

---

## 3. App content (policy declarations) — required to roll out
Left nav → **Policy → App content**. Work down the list:

**a. App access** → "All or some functionality is restricted" → add instructions:
   `Sign in with email: reviewer@cuevapp.com / <password>` (the demo account from Step 0).

**b. Ads** → **No**, the app has no ads.

**c. Content rating** → Start questionnaire.
   - Email = your contact; Category = **Reference, News, or Educational** (it's not a game).
   - Violence / sexual content / language / controlled substances → **No** to all
     (Cueva shows film titles/posters only).
   - User‑generated content / user communication / sharing → **No**.
   - Submit → expect an **Everyone / PEGI 3** rating.

**d. Target audience and content** → target age **18+** (or 13+) → simplest path, avoids
   "designed for families" obligations. Confirm the app isn't appealing to children.

**e. Data safety** → declare:
   - **Does your app collect or share user data?** → **Yes**.
   - Data types collected: **Email address** (purpose: Account management) and **User IDs**
     (Account management). Optionally **App activity → App interactions** (your film
     likes/feedback) for App functionality/Personalization.
   - **Is data shared with third parties?** → **No** (Auth0/Neon are processors acting on your
     behalf, not "sharing" in Play's sense).
   - **Encrypted in transit?** → **Yes**.
   - **Can users request deletion?** → **Yes** — provide `https://cuevapp.com/privacy.html`
     and note in‑app **Profile → Delete account**.

**f. Privacy policy** (under App content) → `https://cuevapp.com/privacy.html`.

**g. The remaining toggles** → **No** to: News app, COVID‑19 contact tracing, Government app,
   Financial features, Health. **Save** each.

---

## 4. Testers + roll out
1. **Testing → Internal testing → Testers** tab → create an email list → add your own Google
   account email(s) → **Save**.
2. Go back to **Releases** → your draft → **Review release** → **Start rollout to Internal testing** → confirm.
3. **Testers** tab → copy the **Join on the web** opt‑in link (and/or "Copy link").

## 5. Install on your phone
1. On your Android phone (signed into a tester Google account), open the opt‑in link → **Accept** the invite.
2. Tap the Play Store link → **Install** Cueva → open it → tap **Continue** → sign in.
   (Login works because the native Auth0 callback URL is whitelisted.)

Internal testing builds go live in minutes (no full review). Promote to **Closed/Open testing**
or **Production** later — that triggers Google's review (hours to a few days).

---

## Full description (paste into Step 2.3)
```
Cueva learns your taste in movies and recommends what to watch next.

Pick a handful of films you love and Cueva builds your personal "taste
fingerprint" across seven dimensions — action, comedy, romance, sci‑fi,
adventure, drama, and horror. Every recommendation is matched to that
fingerprint, so the picks feel like they came from a friend who actually
knows what you like.

• Build your fingerprint in under a minute
• Search for favorites or react to a curated set
• Get personalized matches with a clear "why it fits" score
• See what's in theaters and where to stream
• Your taste sharpens over time as you react to more films

No endless scrolling, no generic "popular now" lists — just films chosen
for you.

This product uses the TMDB API but is not endorsed or certified by TMDB.
```
