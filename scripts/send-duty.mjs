// CLI alternative to the /api/whatsapp/send-duty route — sends the duty
// template directly via the Cloud API. Handy for a cron job or a one-off
// blast from your machine.
//
// Usage:
//   WHATSAPP_TOKEN=... PHONE_NUMBER_ID=... \
//   node scripts/send-duty.mjs scripts/prefects.example.json [fallback-date]
//
// The JSON file is an array of:
//   { name, phone, date?, time?, location?, duty? }

import { readFileSync } from 'node:fs';
import { sendDutyTemplate } from '../lib/whatsapp.js';

const [, , file, fallbackDate] = process.argv;
if (!file) {
  console.error('Usage: node scripts/send-duty.mjs <prefects.json> [fallback-date]');
  process.exit(1);
}

let prefects;
try {
  prefects = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Could not read/parse ${file}: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(prefects) || !prefects.length) {
  console.error('JSON file must be a non-empty array of prefects');
  process.exit(1);
}

let sent = 0;
for (const p of prefects) {
  const to = String(p.phone || '').replace(/\D/g, '');
  if (!to) {
    console.log(`✗ ${p.name || '(no name)'} — missing/invalid phone`);
    continue;
  }
  try {
    const r = await sendDutyTemplate({
      to,
      name: p.name || '',
      date: p.date || fallbackDate || '',
      time: p.time || '',
      location: p.location || '',
      duty: p.duty || '',
    });
    sent++;
    console.log(`✓ ${p.name || to} — id ${r?.messages?.[0]?.id || '(none)'}`);
  } catch (e) {
    console.log(`✗ ${p.name || to} — ${e.message}`);
  }
}
console.log(`\nDone: ${sent}/${prefects.length} sent.`);
