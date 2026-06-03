# Cueva UI prototypes

Standalone React components (single-file, no build step) that demo the product
surfaces. Each is a default-export component using `recharts` + `lucide-react`,
styled with the dark cinema theme. They compute locally (mirroring the API
contract in `../clients/cueva.ts`) so they run without the backend.

| File | What it is |
|------|-----------|
| **cueva-app-connected.jsx** | The **backend-connected** app — all data flows through `CuevaClient` (real fetch + auth + token refresh/401). Runs against an in-browser mock of the API contract; this is what the runnable `../web/` scaffold mounts. |
| **cueva-app.jsx** | The unified app shell — **start here.** Login/registration → onboarding → tabbed app (Home · Discover · Profile), with one shared fingerprint, per-account persistence on launch, and the full session lifecycle (token refresh / expiry) in Profile → Session. |
| cueva-onboarding.jsx | Standalone onboarding flow: welcome → pick films → fingerprint reveal → matches. |
| cueva-home.jsx | Returning-user home: mood chips, availability filter, recommendation shelves. |
| cueva-feedback.jsx | The feedback loop: rate films and watch the fingerprint sharpen. |
| cueva-analytics.jsx | Analytics dashboard: offline leave-one-out lift + calibration + love-rate by maturity (live simulated cohort). |
| cueva-fingerprint-lab.jsx | Dev tool: live LLM scoring of a synopsis into a 7-axis fingerprint. |
| cueva-prototype.jsx | The original matching playground (sliders + nearest-neighbor). |

`cueva-app.jsx` supersedes the individual screen prototypes — they're kept for
reference. In production these read live data via `CuevaClient` against the
FastAPI backend in `../cueva/` instead of computing locally.
