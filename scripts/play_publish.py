"""Upload an Android App Bundle (.aab) to Google Play via the Android Publisher API.

Automates *subsequent* releases (Google requires the FIRST release of a new app to be
uploaded manually through the Play Console UI).

Prereqs:
  - A Google Play Developer API service account with access granted in Play Console
    (Users and permissions → invite the service account → app/release permissions).
  - Its JSON key saved locally (gitignored). Default: secrets/play-service-account.json
    or set env GOOGLE_PLAY_KEY=<path>.
  - pip install -r scripts/requirements-publish.txt   (into the .venv)

Examples:
  python scripts/play_publish.py --aab web/android/app/build/outputs/bundle/release/app-release.aab
  python scripts/play_publish.py --track internal --notes "Bug fixes" --aab <path>

Tracks: internal | alpha | beta | production
"""
import argparse
import os
import sys
from pathlib import Path

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError:
    sys.exit("Missing deps. Run: .venv\\Scripts\\python.exe -m pip install -r scripts/requirements-publish.txt")

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "com.cuevapp.app"
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]
DEFAULT_KEY = ROOT / "secrets" / "play-service-account.json"


def main():
    ap = argparse.ArgumentParser(description="Upload an .aab to Google Play.")
    ap.add_argument("--aab", required=True, help="Path to the .aab")
    ap.add_argument("--track", default="internal", choices=["internal", "alpha", "beta", "production"])
    ap.add_argument("--package", default=PACKAGE)
    ap.add_argument("--key", default=os.environ.get("GOOGLE_PLAY_KEY", str(DEFAULT_KEY)),
                    help="Service account JSON key path")
    ap.add_argument("--notes", default="", help="Release notes (en-US)")
    ap.add_argument("--status", default="completed",
                    choices=["completed", "draft", "halted", "inProgress"])
    args = ap.parse_args()

    aab = Path(args.aab)
    key = Path(args.key)
    if not aab.exists():
        sys.exit(f"AAB not found: {aab}")
    if not key.exists():
        sys.exit(f"Service account key not found: {key}\n"
                 f"Save it there (gitignored) or pass --key / set GOOGLE_PLAY_KEY.")

    creds = service_account.Credentials.from_service_account_file(str(key), scopes=SCOPES)
    svc = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = svc.edits()

    print(f"→ Package: {args.package}   Track: {args.track}")
    edit_id = edits.insert(packageName=args.package, body={}).execute()["id"]
    print(f"  edit {edit_id} opened")

    media = MediaFileUpload(str(aab), mimetype="application/octet-stream", resumable=True)
    bundle = edits.bundles().upload(packageName=args.package, editId=edit_id, media_body=media).execute()
    version_code = bundle["versionCode"]
    print(f"  uploaded {aab.name} → versionCode {version_code}")

    release = {"versionCodes": [str(version_code)], "status": args.status}
    if args.notes:
        release["releaseNotes"] = [{"language": "en-US", "text": args.notes}]
    edits.tracks().update(
        packageName=args.package, editId=edit_id, track=args.track,
        body={"releases": [release]},
    ).execute()
    print(f"  assigned to '{args.track}' (status={args.status})")

    edits.commit(packageName=args.package, editId=edit_id).execute()
    print(f"✓ Committed. versionCode {version_code} is now on the {args.track} track.")


if __name__ == "__main__":
    main()
