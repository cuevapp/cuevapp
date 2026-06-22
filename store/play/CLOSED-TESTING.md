# Cueva — Closed testing plan (personal-account path to Production)

Google requires **personal** developer accounts to run a **closed test with ≥20 testers**,
kept **opted‑in for ≥14 continuous days**, before you can *apply* for production access. The
14‑day clock only runs while ≥20 testers are opted in — so recruit a buffer and start now.

Goal: 20+ opted‑in testers on a Closed testing track, 14 unbroken days, then apply for production.

---

## Step 1 — Create the closed testing release
1. Play Console → **Cueva → Testing → Closed testing**.
2. There's a default track **"Alpha."** Use it (or **Create track** → name it `closed-beta`).
3. **Create new release** → **Add from library** → pick the bundle you already uploaded
   (versionCode 1) — no new build needed. *(Or "Promote release" from Internal testing → Closed.)*
4. Add release notes → **Next → Save → Review release → Start rollout to Closed testing**.

## Step 2 — Set up the tester list
Easiest for 20+ people is a **Google Group** (one link, self‑managing); an email list also works.

**Option A — Google Group (recommended)**
1. groups.google.com → **Create group**, e.g. `cueva-testers@googlegroups.com`.
   Set "Who can join" = **Anyone can ask** (or add members directly).
2. Play Console → Closed testing → **Testers** tab → **Google Groups** → paste the group email → Save.

**Option B — Email list**
1. Closed testing → **Testers** tab → **Create email list** → paste up to ~20–30 tester emails
   (comma‑separated) → Save.

## Step 3 — Get the opt‑in link
- Closed testing → **Testers** tab → **"How testers join your test"** → copy the
  **Join on the web** link (e.g. `https://play.google.com/apps/testing/com.cuevapp.app`).
- Testers must use a **Google account that's on your list / in the group**.

## Step 4 — Recruit 20+ real testers
You need 20 opted‑in; **aim for 22–25** so a dropout doesn't reset the clock.
- **Personal network** — friends/family/colleagues with an Android phone + Google account.
- **Reciprocal testing communities** (how most indie devs hit 20/14):
  - Reddit: r/AndroidAppTesting, r/PlayStoreTesting (post your opt‑in link, test theirs back).
  - Discord/Telegram "Google Play closed testing exchange" groups.
- **Keep it genuine.** Google reviews the *quality* of testing. Don't buy fake/bot installs or
  incentivize hollow engagement — it risks rejection or account action. Real people who open the
  app a few times is what you want.

### What each tester must do
1. Open the opt‑in link on their phone → **Become a tester / Accept**.
2. Tap the **Google Play** link → **Install Cueva** → open it → sign in → try onboarding.
3. **Stay opted in and keep it installed for the full 14 days** (don't leave the test).

## Step 5 — Run the 14 days + collect feedback
- Track progress: Closed testing track page shows the **opted‑in tester count**; the
  **Dashboard / "Apply for production"** page shows the 14‑day countdown.
- The production‑access application asks *how you tested and what you learned*, so gather a little
  real feedback (a shared doc/form, or just notes): bugs, confusion points, what they liked.
- Ship fixes as needed — upload a new bundle (versionCode 2+) to the same closed track; the clock
  keeps running as long as ≥20 stay opted in.

## Step 6 — Apply for production access
- After **≥20 testers for ≥14 continuous days**, Play Console → **Dashboard** (or
  **Production → Apply for production access**) unlocks the application form.
- Fill it in (who your testers were, how you recruited them, what feedback you got) → **Submit**.
- Google reviews (often a few days). Once approved, create a **Production** release (promote the
  same build), make sure **store listing + all App content** are complete, and submit for the
  public review.

---

## Quick checklist
- [ ] Closed testing release rolled out (versionCode 1)
- [ ] Tester list/group attached + opt‑in link copied
- [ ] 22–25 testers recruited and sent the link
- [ ] ≥20 opted in (confirmed in Console) — note the start date: ____________
- [ ] 14 continuous days elapsed with ≥20 opted in
- [ ] Feedback collected
- [ ] Applied for production access
- [ ] Store listing + App content 100% complete (for the production review)

> Tip: the **14‑day clock is the long pole.** Get 20+ opted in on day 1 and the rest (store
> listing, App content, fixes) can happen in parallel during the wait.
