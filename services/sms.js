/**
 * SMS delivery service — Dialog eSMS only.
 * Notify.lk has been removed. All credentials are managed by the super admin
 * via SystemConfig. Lab-level credentials are no longer used.
 *
 * Credit system
 * ─────────────
 * Each SMS deducts 1 credit from lab.smsCredits (atomic findOneAndUpdate).
 * If a lab has 0 credits the send is rejected before hitting the Dialog API.
 */

const fetch        = require('node-fetch');
const Lab          = require('../models/Lab');
const SystemConfig = require('../models/SystemConfig');

// ── Helpers ────────────────────────────────────────────────────────────────

function normaliseToE164(mobile) {
  const digits = mobile.replace(/\D/g, '');
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0'))  return '94' + digits.slice(1);
  return '94' + digits;
}

// ── Dialog eSMS ────────────────────────────────────────────────────────────

async function sendViaDialog({ mobile, message, apiKey, sourceAddress }) {
  const e164   = normaliseToE164(mobile);
  const params = new URLSearchParams({
    esmsqk:         apiKey,
    list:           e164,
    source_address: sourceAddress || 'HealthPass',
    message,
  });

  const url = `https://e-sms.dialog.lk/api/v1/message-via-url/create/url-campaign?${params}`;
  const res  = await fetch(url, { method: 'GET' });
  const text = await res.text();

  if (!res.ok || text.startsWith('-')) {
    throw new Error(`Dialog eSMS error: ${text}`);
  }

  return { provider: 'dialog', raw: text };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * sendSMS(mobile, message, labId)
 *
 * 1. Reads Dialog credentials from SystemConfig (falls back to env vars).
 * 2. Atomically deducts 1 credit from the lab — rejects if balance is 0.
 * 3. Sends via Dialog eSMS.
 *
 * @param {string}          mobile   Recipient phone (any Sri Lankan format)
 * @param {string}          message  Plain-text body
 * @param {string|ObjectId} labId    The lab whose credits are deducted
 */
async function sendSMS(mobile, message, labId) {
  // 1. Get Dialog config (DB first, env var fallback)
  const cfg       = await SystemConfig.findOne({ key: 'global' });
  const dialogKey = cfg?.dialogApiKey        || process.env.DIALOG_ESMS_API_KEY;
  const dialogSrc = cfg?.dialogSourceAddress || process.env.DIALOG_ESMS_SOURCE || 'HealthPass';

  if (!dialogKey) {
    throw new Error('SMS not configured. Contact your system administrator to set up Dialog eSMS.');
  }

  // 2. Deduct 1 credit atomically (prevents over-sending under concurrency)
  const lab = await Lab.findOneAndUpdate(
    { _id: labId, smsCredits: { $gt: 0 } },
    { $inc: { smsCredits: -1 } },
    { new: true },
  );

  if (!lab) {
    throw new Error('Insufficient SMS credits. Please contact your administrator to top up.');
  }

  // 3. Send — refund the credit if the API call fails so credits only decrease on actual delivery
  try {
    return await sendViaDialog({ mobile, message, apiKey: dialogKey, sourceAddress: dialogSrc });
  } catch (err) {
    await Lab.findByIdAndUpdate(labId, { $inc: { smsCredits: 1 } });
    throw err;
  }
}

module.exports = { sendSMS };
