# Classroom Inventory

[![CI](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml/badge.svg)](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml)

A single-device, local-first Electron app for tracking classroom consumables
(name tags, pens, t-shirts, …). It reads and writes a local JSON cache instantly
and syncs to a **Google Sheet** whenever it is connected. Losing connection is a
non-event: changes queue locally and flush on reconnect.

- **Renderer:** React + Tailwind + Recharts
- **Main:** googleapis (Sheets API v4), Electron `safeStorage` for the key
- **Cache:** plain JSON files in the app `userData` directory
- **Build:** electron-vite (+ electron-builder, optional)

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
npm run build:win    # optional: produce a Windows installer (electron-builder)
```

The app works fully offline. Go to **Settings** to connect Google Sheets when
you're ready.

---

## Connecting & troubleshooting sync

1. **Settings → Load key file…** and pick the downloaded service-account `.json`.
2. Paste the **spreadsheet ID**, then click **Test connection**. This does a real
   round-trip to Google and creates the `Items`/`Transactions` tabs if missing.
3. If it fails, the message tells you the fix. Common causes:

| Message | Fix |
| --- | --- |
| Permission denied | Share the Sheet with the service-account email (shown in Settings) as **Editor**. |
| Sheets API not enabled | Enable **Google Sheets API** for this project in the Cloud Console. |
| Spreadsheet not found | Re-check the ID — the part of the URL between `/d/` and `/edit`. |
| Key looks malformed | Re-download the JSON key and load it as-is; don't reformat or edit it. |

---

## Continuous integration & releases

- **CI** (`.github/workflows/ci.yml`): every push / PR to `main` runs typecheck
  and builds all three bundles.
- **Release** (`.github/workflows/release.yml`): pushing a `v*` tag builds the
  Windows installer with electron-builder and attaches it to a GitHub Release.

  ```bash
  npm version patch        # bumps version in package.json and creates a v* tag
  git push --follow-tags   # triggers the release build
  ```

  The installer is unsigned, so Windows SmartScreen shows a "More info → Run
  anyway" prompt on first launch — expected for a personal build.

---

## Notes & gotchas

- Sheets API quota is ~60 reads or writes per minute. Batching keeps us far
  under it at classroom volume.
- Don't hand-edit the Sheet while the app has unsynced offline changes. On sync
  the app pulls first, then your local edits win for any shared item id.
- Receipts: store the image in a Drive folder shared with the service account
  and keep the link in `receiptRef`, or just record the amount and a note.
