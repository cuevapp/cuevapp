# Cueva on iOS & Android (Capacitor)

Cueva is wrapped with [Capacitor](https://capacitorjs.com): the web app (`web/`) is built
to `dist/` and bundled into native iOS/Android shells that call the live API at
`https://api.cuevapp.com`. This is a real app bundle (not a webview-of-a-website), which
is what the App Store expects.

## What's already scaffolded
- `web/capacitor.config.ts` — app id `com.cuevapp.app`, name "Cueva", dark theme.
- `web/android/` — the Android Studio project (committed), with the web build bundled.
- App icons + splash screens generated for all densities (`web/assets/icon.png`,
  `splash.png` are the sources; regenerate with `npx @capacitor/assets generate`).
- Capacitor deps in `web/package.json`.
- **Account deletion** — `DELETE /me` + a Profile "Delete account" button (App Store requirement). ✅

## Dev workflow (every time you change the web app)
```bash
cd web
npm run build          # build the web app to dist/
npx cap sync           # copy dist/ into the native projects + update plugins
npx cap open android   # open Android Studio   (or: npx cap open ios  on a Mac)
```

---

## Android (you can do this on Windows)
**Account:** Google Play Developer — **$25 one-time**. Tooling: Android Studio.

1. `cd web && npm run build && npx cap sync android`
2. `npx cap open android` → Android Studio opens `web/android`.
3. **Run** on an emulator/device to test (green ▶).
4. Release build: **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**,
   create/choose an upload keystore (keep it safe — you sign every update with it).
5. Play Console → create the app → upload the `.aab` → fill the store listing →
   submit for review.

> Note: Android Studio + the Android SDK aren't installed on this machine yet — install
> Android Studio (it bundles the SDK) before step 2. The project itself is ready.

## iOS (requires a Mac)
**Account:** Apple Developer Program — **$99/year**. Tooling: a Mac with Xcode + CocoaPods.
(No Mac? Use a cloud-mac CI like Codemagic or Ionic Appflow to build/sign.)

1. On the Mac: `cd web && npm install && npm run build`
2. `npx cap add ios` → creates `web/ios` (it's not generated here because pod install needs macOS)
3. `npx cap sync ios` then `npx cap open ios` → Xcode opens the project.
4. In Xcode: set the **Team** (signing), bump the bundle id if needed (`com.cuevapp.app`).
5. Test on a simulator/device, then **Product → Archive → Distribute App → App Store Connect**.
6. App Store Connect → fill the listing → submit for review.

---

## ⚠️ The one real code change before login works in-app: native Auth0
The current build does Auth0 the *web* way (redirect to `https://cuevapp.com`). In a native
app the redirect must come back to the app via a custom scheme / app link. To wire it:

1. **Auth0 dashboard → your SPA app → Settings**, add to the allow-lists:
   - Callback URLs: `com.cuevapp.app://dev-j1n3u5tpkiesxqx2.us.auth0.com/capacitor/com.cuevapp.app/callback`
   - Logout URLs: same pattern.
   (Auth0's "Native" / Ionic guide has the exact strings for your tenant.)
2. In the app, use Auth0 with Capacitor's **Browser** plugin (`@capacitor/browser`) and the
   `@auth0/auth0-spa-js` low-level client (or the Ionic Auth Connect SDK) so the login opens
   the system browser and returns via the custom scheme. The web `@auth0/auth0-react`
   provider stays for the web build; the native build swaps in the Capacitor flow.
3. Register the URL scheme: `com.cuevapp.app` in `Info.plist` (iOS) and an intent-filter
   in `AndroidManifest.xml` (Capacitor's Auth0 guide generates these).

Until this is done, the native app loads and shows the catalog, but the Auth0 login button
won't complete the round-trip. This is the main remaining engineering task.

## CORS for the native origin
Capacitor apps make requests from `capacitor://localhost` (iOS) / `https://localhost`
(Android), not `https://cuevapp.com`. Two options:
- Add those origins to the backend `API_CORS_ORIGINS`, **or**
- Use the native HTTP layer (`CapacitorHttp`, enabled in `capacitor.config.ts`) so requests
  are made natively and bypass browser CORS entirely (recommended for mobile).

---

## App Store / Play compliance checklist
- ✅ **Account deletion** — in-app (`DELETE /me` + Profile button). *(Optional follow-up: also
  delete the Auth0 identity via the Auth0 Management API, not just the Cueva profile.)*
- **Privacy policy URL** — required by both stores (you collect email/identifiers via Auth0).
  Add a `/privacy` page (e.g. on cuevapp.com) and link it in both store listings.
- **Apple App Privacy labels** — declare: email + user id (for account), usage data. 
- **Sign in with Apple** — required *only if* you offer third-party social login (e.g. Google).
  You're email/password-only today, so you're exempt — add it if/when you add Google login.
- **"Buy me a coffee" donation** — App Review may flag external donation links (Apple often
  wants digital tips via in-app purchase unless you're a registered nonprofit). Consider
  hiding the donate button on the **iOS** build (feature-flag by platform) to avoid a
  rejection, or route it through approved IAP. *(The Fandango "Get tickets" link is fine —
  movie tickets are a physical service, exempt from IAP.)*
- **Minimum functionality (Apple 4.2)** — fine: this is a real bundled app with native
  shell + offline PWA assets, not a bare website wrapper.
- **Store assets** — 1024² icon, screenshots per device size, description, keywords, age rating.

## Recommended order
Ship **Android first** (cheaper, no Mac, faster review) to validate the wrapper, then do iOS.
