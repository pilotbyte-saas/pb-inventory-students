#!/usr/bin/env node
// Standalone Google Sheets connection check — runs OUTSIDE the Electron app so
// you can prove the service-account key + sharing + API are all working, and
// get a clear error if not.
//
// Usage:
//   node scripts/check-sheets.mjs "C:\\path\\to\\service-account.json" "<spreadsheetId>"
// or:
//   npm run check:sheets -- "C:\\path\\to\\service-account.json" "<spreadsheetId>"

import { readFileSync } from 'node:fs'
import googleapis from 'googleapis'

const { google } = googleapis

const [keyPath, spreadsheetId] = process.argv.slice(2)
if (!keyPath || !spreadsheetId) {
  console.error('Usage: node scripts/check-sheets.mjs <key.json> <spreadsheetId>')
  process.exit(2)
}

let creds
try {
  creds = JSON.parse(readFileSync(keyPath, 'utf8'))
} catch (e) {
  console.error('x Could not read or parse the key file:', e.message)
  process.exit(2)
}

if (!creds.client_email || !creds.private_key) {
  console.error('x This file is missing client_email / private_key — not a service account key.')
  process.exit(2)
}

console.log('Service account:', creds.client_email)
console.log('Spreadsheet ID :', spreadsheetId)
console.log('Connecting...')

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

try {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties.title'
  })
  const tabs = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean)
  console.log('\nOK - connected to:', meta.data.properties?.title)
  console.log('   Tabs found:', tabs.length ? tabs.join(', ') : '(none yet - the app will create them)')
  console.log('\nAuth and access are working. You can sync from the app.')
  process.exit(0)
} catch (e) {
  const msg = (e && e.message) || String(e)
  console.error('\nx FAILED:', msg)
  const lc = msg.toLowerCase()
  if (lc.includes('permission') || lc.includes('403') || lc.includes('forbidden')) {
    console.error('  -> Share the Sheet with', creds.client_email, 'as Editor.')
  } else if (lc.includes('has not been used') || lc.includes('disabled')) {
    console.error('  -> Enable the Google Sheets API for this project in the Cloud Console.')
  } else if (lc.includes('not found') || lc.includes('404')) {
    console.error('  -> Check the spreadsheet ID (the part of the URL between /d/ and /edit).')
  } else if (lc.includes('invalid_grant') || lc.includes('decoder') || lc.includes('jwt')) {
    console.error('  -> Re-download the JSON key, or check the system clock is correct.')
  }
  process.exit(1)
}
