# Google Play store-listing assets

Graphics uploaded in **Play Console → Main store listing** (they are *not* bundled into the app).

| File | Size | Where it goes in Play Console |
|------|------|-------------------------------|
| `icon-512.png` | 512×512 | Store listing → **App icon** (hi-res icon) |
| `feature-graphic-1024x500.png` | 1024×500 | Store listing → **Feature graphic** |

Both are generated from the brand mark (`web/assets/icon.png`) by:

```bash
.venv/Scripts/python.exe scripts/gen_play_assets.py
```

Edit `scripts/gen_play_assets.py` to tweak the wordmark/tagline, then re-run.

## Still needed for the listing (not generated here)
- **Phone screenshots** — min 2, 16:9 or 9:16, 320–3840 px (capture from the app/emulator).
- App icon is also rendered as the launcher icon inside the app via `@capacitor/assets`
  (separate from this 512 store icon).
