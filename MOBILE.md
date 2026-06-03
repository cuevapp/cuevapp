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
- **Native Auth0 login** — `CapacitorAuthShell` (system-browser + custom-scheme callback),
  `CapacitorHttp` enabled for CORS-free API calls, and the Android deep-link intent-filter. ✅
  (One Auth0-dashboard URL + the iOS Info.plist scheme remain — see below.)
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

## Native Auth0 login — wired in code ✅ (one dashboard step + iOS plist left)
The native shell (`CapacitorAuthShell` in `web/src/App.jsx`, active only when
`Capacitor.isNativePlatform()`) drives `@auth0/auth0-spa-js` + `@capacitor/browser` +
`@capacitor/app`: login opens the **system browser** and the redirect returns via the app's
**custom URL scheme**, caught by `appUrlOpen`. The web build is untouched (still
`@auth0/auth0-react`). Two things remain to make it work on a device:

1. **Auth0 dashboard → Applications → [Cueva Web] → Settings** — add this **exact** URL to BOTH
   **Allowed Callback URLs** and **Allowed Logout URLs** (alongside your existing
   `https://cuevapp.com`, comma-separated):
   ```
   com.cuevapp.app://dev-j1n3u5tpkiesxqx2.us.auth0.com/capacitor/com.cuevapp.app/callback
   ```
2. **iOS only** (on the Mac, after `npx cap add ios`) — register the scheme in
   `ios/App/App/Info.plist` (Android's intent-filter is already in `AndroidManifest.xml`):
   ```xml
   <key>CFBundleURLTypes</key>
   <array><dict>
     <key>CFBundleURLSchemes</key>
     <array><string>com.cuevapp.app</string></array>
   </dict></array>
   ```

Once the callback URL is saved in Auth0, login completes in-app.

## CORS for the native origin — handled ✅
Capacitor apps would otherwise call the API from `capacitor://localhost` / `https://localhost`
(not `https://cuevapp.com`) and hit CORS. We enabled **`CapacitorHttp`** in
`capacitor.config.ts`, so `fetch`/XHR go through the native HTTP stack and bypass browser CORS
entirely — no backend `API_CORS_ORIGINS` change needed.

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
