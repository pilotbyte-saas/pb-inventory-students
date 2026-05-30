# Classroom Inventory

[![CI](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml/badge.svg)](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml)

A single-device, local-first Electron app for tracking classroom consumables
(name tags, pens, t-shirts, …). It reads and writes a local JSON cache instantly
and syncs to a **Google Sheet** whenever it is connected. Losing connection is a
non-event: changes queue locally and flush on reconnect.

- **Renderer:** React + Tailwind + Recharts
- **Main:** pluggable sync backend — **Google Sheets** (googleapis) or **AWS
  DynamoDB** (`@aws-sdk`) — with the credential encrypted via Electron `safeStorage`
- **Cache:** plain JSON files in the app `userData` directory
- **Build:** electron-vite + electron-builder (Windows + macOS), auto-update via electron-updater

---

## Download

Get the latest installer from the
[**Releases page**](https://github.com/pilotbyte-saas/pb-inventory-students/releases/latest):

- **Windows:** `Classroom.Inventory.Setup.<version>.exe`
- **macOS (Apple Silicon):** `Classroom.Inventory-<version>-arm64.dmg`

The app updates itself afterward — new releases install automatically on restart.
First launch is unsigned: on macOS use **right-click → Open**; on Windows click
**More info → Run anyway** at the SmartScreen prompt.

---

## Phase 0 — one-time Google setup (do this first)

This gates syncing. The app still runs and tracks inventory locally without it,
but it won't sync until these steps are done.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project, e.g. `classroom-inventory`.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account.**
   Give it a name and create it.
4. Open the service account → **Keys → Add key → Create new key → JSON** and
   download the file. **This is your key. Keep it private and out of version
   control.**
5. Create a Google Sheet. A **blank one is fine** — on first sync the app creates
   the `Items` and `Transactions` tabs and their header rows for you.
6. Copy the service account email (`name@project-id.iam.gserviceaccount.com`).
   In the Sheet, click **Share** and add that email as an **Editor**.
7. Copy the spreadsheet ID from the URL (the long string between `/d/` and
   `/edit`).

In the app, open **Settings**, load the JSON key with the file picker, and paste
the spreadsheet ID. The key is encrypted with the OS keychain (`safeStorage`)
and stored in `userData` — it never lives in this project folder.

### Sheet headers (created automatically)

The app writes these header rows itself on first sync; they're listed here only
for reference if you want to read or edit the Sheet directly.

`Items` tab, row 1:

```
id | name | sku | category | unit | quantity | reorderThreshold | unitCost | reorderUrl | supplier | notes | createdAt | updatedAt
```

`Transactions` tab, row 1 (append-only):

```
id | itemId | type | quantity | unitCost | totalCost | receiptRef | note | timestamp
```

`type` is one of `initial`, `receive`, `consume`, `adjust`. `quantity` is signed
(positive for receive, negative for consume).

---

## Using AWS DynamoDB (multiple devices)

For a few devices sharing one live dataset, switch in **Settings → Sync backend →
AWS DynamoDB**. Every device points at the same table; conflicts are resolved per
item (newest edit wins) and transactions are append-only, so devices never
clobber each other. The local-first cache and queue work exactly the same.

1. In AWS **IAM**, create a user with programmatic access and attach a policy
   scoped to your table (rename the table in the ARN if you change it):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:DescribeTable",
           "dynamodb:CreateTable",
           "dynamodb:Query",
           "dynamodb:PutItem"
         ],
         "Resource": "arn:aws:dynamodb:*:*:table/classroom-inventory"
       }
     ]
   }
   ```

2. In **Settings**, enter the Access Key ID, Secret Access Key, region (e.g.
   `us-east-1`), and table name (default `classroom-inventory`), then click
   **Test connection**. The table is created automatically on first connect
   (on-demand / pay-per-request billing — effectively pennies at this volume).

Use the **same** access key + region + table name on each device.

---

## Develop & run

```bash
npm install
npm run dev          # launches the app with hot reload
```

Other scripts:

```bash
npm run typecheck    # tsc for main/preload and renderer
npm run build        # bundle main, preload, renderer into out/
npm run start        # preview the production bundle
npm run build:win    # Windows installer (.exe)
npm run build:mac    # macOS Apple Silicon (.dmg + .zip)
npm run icons        # regenerate app icons from build/icon.svg
```

The app works fully offline. Go to **Settings** to connect Google Sheets when
you're ready.

---

## Connecting & troubleshooting sync

Pick the backend in **Settings → Sync backend**, fill in its credentials, then
click **Test connection** — it does a real round-trip and reports exactly what's
wrong. Common causes:

**Google Sheets**

| Message | Fix |
| --- | --- |
| Permission denied | Share the Sheet with the service-account email (shown in Settings) as **Editor**. |
| Sheets API not enabled | Enable **Google Sheets API** for the project in the Cloud Console. |
| Spreadsheet not found | Re-check the ID — the part of the URL between `/d/` and `/edit`. |
| Key looks malformed | Re-download the JSON key and load it as-is; don't reformat it. |

**AWS DynamoDB**

| Message | Fix |
| --- | --- |
| AWS rejected the credentials | Re-check the Access Key ID and Secret Access Key. |
| AWS denied the request | Attach the IAM policy above (DescribeTable, CreateTable, Query, PutItem). |
| Table not found / can't create | Grant `CreateTable`, or pre-create a table with keys `pk` (S) + `sk` (S). |

You can also verify **Google** access from the terminal without launching the app:

```bash
npm run check:sheets -- "C:\path\to\key.json" "<spreadsheetId>"
```

---

## Continuous integration & releases

- **CI** (`.github/workflows/ci.yml`): every push / PR to `main` runs typecheck
  and builds all three bundles.
- **Release** (`.github/workflows/release.yml`): pushing a `v*` tag builds
  installers for **Windows** (NSIS `.exe`) and **macOS Apple Silicon**
  (`.dmg` + `.zip`) on GitHub-hosted runners.

  ```bash
  npm version patch        # bumps package.json and creates a v* tag
  git push --follow-tags   # triggers the release build
  ```

  Installers are always uploaded as **workflow artifacts** (download them from
  the Actions run page). If the `RELEASES_TOKEN` secret is set, they are also
  **published to the public releases repo**, which is what powers in-app
  auto-update.

### Auto-update

This repo is **public**, so updates are served straight from its **GitHub
Releases** and the installed app needs no token. CI publishes with the built-in
`GITHUB_TOKEN` — nothing to configure. Push a tag and installed apps check for
the new version, download it in the background, and install on restart (or
automatically on next quit).

### App icon

`build/icon.svg` is the source. `npm run icons` regenerates `icon.png`,
`icon.ico`, and `icon.icns` (committed, consumed by electron-builder).

### Signing notes

- **Windows:** the installer is unsigned, so SmartScreen shows “More info → Run
  anyway” on first launch. Auto-update still works.
- **macOS:** without an Apple Developer ID the `.dmg` is unsigned — open it the
  first time with right-click → **Open** (or `xattr -cr` the app). **macOS
  auto-update requires signing + notarization**; add `MAC_CSC_LINK` and
  `MAC_CSC_KEY_PASSWORD` secrets to enable it (the workflow already passes them
  through when present).

---

## Notes & gotchas

- Sheets API quota is ~60 reads or writes per minute. Batching keeps us far
  under it at classroom volume.
- Don't hand-edit the Sheet while the app has unsynced offline changes. On sync
  the app pulls first, then your local edits win for any shared item id.
- Receipts: store the image in a Drive folder shared with the service account
  and keep the link in `receiptRef`, or just record the amount and a note.
