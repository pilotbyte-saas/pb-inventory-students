# Classroom Inventory

[![CI](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml/badge.svg)](https://github.com/pilotbyte-saas/pb-inventory-students/actions/workflows/ci.yml)

A local-first Electron app for tracking classroom consumables (name tags, pens,
t-shirts, …). It reads and writes a local JSON cache instantly and syncs to
**AWS DynamoDB** when you're online. Losing connection is a non-event: changes
queue locally and flush on reconnect.

- **Renderer:** React + Tailwind + Recharts
- **Main:** AWS DynamoDB sync (`@aws-sdk`), with the credential encrypted via
  Electron `safeStorage`
- **Cache:** plain JSON files in the app `userData` directory
- **Build:** electron-vite + electron-builder (Windows + macOS), auto-update via
  electron-updater

---

## Download

Get the latest installer from the
[**Releases page**](https://github.com/pilotbyte-saas/pb-inventory-students/releases/latest):

- **Windows:** `Classroom.Inventory.Setup.<version>.exe`
- **macOS (Apple Silicon):** `Classroom.Inventory-<version>-arm64.dmg`

The app updates itself afterward — new releases install on restart. First launch
is unsigned: on macOS use **right-click → Open**; on Windows click **More info →
Run anyway** at the SmartScreen prompt.

---

## Sync modes

Choose in **Settings → Sync mode**:

- **Local only** — nothing leaves the device; every change is saved locally.
  Great when you're offline.
- **AWS DynamoDB** — syncs to a shared cloud table. Multiple devices can use the
  same table. Local-first still applies: edits are instant and flush when online.

Switching from **Local only** to **AWS DynamoDB** (a "go-live" sync) pushes your
accumulated changes up — see [Conflicts](#conflicts-on-go-live) below.

### Setting up AWS DynamoDB

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

2. In **Settings → AWS DynamoDB**, enter the Access Key ID, Secret Access Key,
   region (e.g. `us-east-1`), and table name (default `classroom-inventory`),
   then click **Test connection**. The table is created automatically on first
   connect (on-demand / pay-per-request — effectively pennies at this volume).

Use the **same** access key + region + table name on each device. The secret is
encrypted with the OS keychain and never leaves `userData`.

---

## Deleting items

In **Inventory**, each row has a **Delete** action (with a confirmation). Delete
is a **soft-delete**: the item is hidden and stops counting toward any total, but
it's kept in DynamoDB marked `deleted` (with a timestamp) and a `delete` entry is
written to the ledger — so you keep a full audit trail and the item could be
restored. It never affects live counts once deleted.

---

## Conflicts on go-live

When local changes sync up to the cloud, the app compares your items against
what's already there. If something clashes, the sync **pauses and shows a
resolution dialog** instead of silently overwriting:

- **Duplicate** — a local item matches an existing cloud item by name/SKU (e.g.
  the same thing was created on two devices). Choose **Merge** (fold into the
  cloud item; its ledger entries are re-pointed and the quantity recomputed) or
  **Keep as new** (push it as a separate item).
- **Divergent edit** — the same item was edited on this device and in the cloud
  since the last sync. Choose **Keep mine** or **Keep cloud**.

Resolve each, click **Apply & sync**, and the push finishes.

---

## Develop & run

```bash
npm install
npm run dev          # launch with hot reload
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

The app works fully offline — open **Settings** to connect AWS DynamoDB when
you're ready.

---

## Troubleshooting sync

In **Settings → AWS DynamoDB**, click **Test connection** — it does a real
round-trip and reports exactly what's wrong.

| Message | Fix |
| --- | --- |
| AWS rejected the credentials | Re-check the Access Key ID and Secret Access Key. |
| AWS denied the request | Attach the IAM policy above (DescribeTable, CreateTable, Query, PutItem). |
| Table not found / can't create | Grant `CreateTable`, or pre-create a table with keys `pk` (S) + `sk` (S). |
| Network problem | Check your connection and press **Sync now**. |

---

## Continuous integration & releases

- **CI** (`.github/workflows/ci.yml`): every push / PR to `main` runs typecheck
  and builds all bundles.
- **Release** (`.github/workflows/release.yml`): pushing a `v*` tag builds
  installers for **Windows** (NSIS `.exe`) and **macOS Apple Silicon**
  (`.dmg` + `.zip`), uploads them as workflow artifacts, and publishes them to
  this repo's **Releases** (which powers in-app auto-update).

  ```bash
  npm version patch        # bumps package.json and creates a v* tag
  git push --follow-tags   # triggers the release build
  ```

### Auto-update

This repo is **public**, so updates are served straight from its **GitHub
Releases** and the installed app needs no token. CI publishes with the built-in
`GITHUB_TOKEN`. Push a tag and installed apps download the new version in the
background and install on restart (or automatically on next quit).

### App icon

`build/icon.svg` is the source. `npm run icons` regenerates `icon.png`,
`icon.ico`, and `icon.icns` (committed, consumed by electron-builder).

### Signing notes

- **Windows:** the installer is unsigned, so SmartScreen shows “More info → Run
  anyway” on first launch. Auto-update still works.
- **macOS:** without an Apple Developer ID the `.dmg` is unsigned — open it the
  first time with right-click → **Open** (or `xattr -cr` the app). **macOS
  auto-update requires signing + notarization**; add `MAC_CSC_LINK` and
  `MAC_CSC_KEY_PASSWORD` secrets to enable it (the release workflow uses them
  when present).

---

## Data model & gotchas

- **Items** are a current-state snapshot (merged newest-edit-wins per id, except
  when a conflict is flagged). **Transactions** are an append-only ledger —
  `initial`, `receive`, `consume`, `adjust`, `delete`.
- Stock is always reconcilable from the ledger (**Settings → Recompute
  quantities from ledger**). Deleted items are excluded.
- DynamoDB on-demand billing is pennies at classroom volume; batched reads/writes
  keep request counts low.
- Round every number that reaches the screen — float math leaks artifacts.
