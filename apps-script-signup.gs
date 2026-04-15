// ╔════════════════════════════════════════════════════════════════╗
// ║  ASCEND GOLF CAMP — Signup form handler                        ║
// ║                                                                 ║
// ║  Features:                                                      ║
// ║  • Per-week tabs (Week I … Week XII) with color-coded rows     ║
// ║  • Master "Reservations" tab — every row color-coded by week   ║
// ║  • Pay at Drop-Off cells highlighted red as a visual flag      ║
// ║  • Payment gate — online payments blocked at the server until  ║
// ║    Stripe webhook verification is wired up                     ║
// ║  • HTML email notification on every new reservation             ║
// ║  • Server-side validation of all required fields               ║
// ╚════════════════════════════════════════════════════════════════╝

// ─── Config ─────────────────────────────────────────────────────
const NOTIFY_EMAIL = 'info@ascendgolfcamp.com';   // Change to your gmail if that doesn't exist yet
const PRICE_PER_WEEK = 999.99;
const MASTER_SHEET = 'Reservations';
const DROPOFF_RED = '#FECACA';   // Soft red background for Pay at Drop-Off cells
const DROPOFF_TEXT = '#991B1B';  // Deep red text for those cells
const FALLBACK_COLOR = '#E5E3DB'; // Used when a week key doesn't match (shouldn't happen in practice)

// 🔒 Set to true ONLY after you've wired up Stripe webhook signature verification.
// While this is false, ALL online payment attempts are rejected — even if someone
// tries to spoof a "paid" submission from DevTools. The only way in is Pay at Drop-Off.
const ONLINE_PAYMENTS_ENABLED = false;

// Colors per week — muted pastel palette that reads well with dark text
const WEEK_COLORS = {
  'Week I':    '#FCE8DE',  // peach
  'Week II':   '#FDDADA',  // pink
  'Week III':  '#FFF1C2',  // butter
  'Week IV':   '#E0F1D3',  // sage
  'Week V':    '#D7ECFA',  // powder blue
  'Week VI':   '#DCDFFB',  // periwinkle
  'Week VII':  '#EBD8FA',  // lavender
  'Week VIII': '#FAD8EC',  // rose
  'Week IX':   '#F9E4C8',  // apricot
  'Week X':    '#D4F1E8',  // mint
  'Week XI':   '#DFE9F7',  // ice
  'Week XII':  '#F5D7C8'   // terracotta
};

// Column headers used in every sheet
const HEADERS = [
  'Submitted', 'Week', 'Parent', 'Camper', 'Age', 'Skill',
  'Email', 'Phone', 'Total ($)', 'Dietary', 'Allergies',
  'Emergency Name', 'Emergency Phone', 'Payment', 'Notes'
];
// ────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // ─── Validate ───
    if (!data.parentName || !data.camperName || !data.email || !data.phone || !Array.isArray(data.weeks) || data.weeks.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing required fields' });
    }

    // ─── Payment gate ───
    // Only Drop-Off is allowed right now. Online is blocked entirely at the server level
    // until Stripe webhook verification is implemented — impossible to spoof from the browser.
    const isDropoff = data.payment === 'dropoff';
    const isConfirmedOnline = ONLINE_PAYMENTS_ENABLED
      && data.payment === 'online'
      && verifyStripePayment(data);  // Returns true only with a valid Stripe webhook signature
    if (!isDropoff && !isConfirmedOnline) {
      return jsonResponse({
        ok: false,
        error: 'Online payment is not yet available. Please select "Pay at Drop-Off" to complete your reservation.'
      });
    }

    const total = (data.weeks.length * PRICE_PER_WEEK).toFixed(2);
    const timestamp = new Date();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Payment column index (1-based) based on HEADERS order
    const paymentCol = HEADERS.indexOf('Payment') + 1;
    const isDropoffPayment = data.payment === 'dropoff';

    // ─── Append to per-week tabs (one row in each week's sheet) ───
    data.weeks.forEach(function (weekFull) {
      const weekKey = extractWeekKey(weekFull);             // e.g. "Week I"
      const weekColor = WEEK_COLORS[weekKey] || FALLBACK_COLOR;
      const sheet = getOrCreateSheet(ss, weekKey, weekColor);
      const row = buildRow(data, weekFull, total, timestamp);
      sheet.appendRow(row);
      const lastRow = sheet.getLastRow();
      // Tint the new row with the week's color
      sheet.getRange(lastRow, 1, 1, row.length).setBackground(weekColor);
      // Red flag on Payment cell if Drop-Off (overrides week tint for that single cell)
      if (isDropoffPayment) {
        sheet.getRange(lastRow, paymentCol)
          .setBackground(DROPOFF_RED)
          .setFontColor(DROPOFF_TEXT)
          .setFontWeight('bold');
      }
    });

    // ─── Master "Reservations" overview tab — one row per week selected ───
    const masterSheet = getOrCreateSheet(ss, MASTER_SHEET, '#1F5D2E');
    data.weeks.forEach(function (weekFull) {
      const weekKey = extractWeekKey(weekFull);
      const weekColor = WEEK_COLORS[weekKey] || FALLBACK_COLOR;
      const row = buildRow(data, weekFull, total, timestamp);
      masterSheet.appendRow(row);
      const lastRow = masterSheet.getLastRow();
      masterSheet.getRange(lastRow, 1, 1, row.length).setBackground(weekColor);
      if (isDropoffPayment) {
        masterSheet.getRange(lastRow, paymentCol)
          .setBackground(DROPOFF_RED)
          .setFontColor(DROPOFF_TEXT)
          .setFontWeight('bold');
      }
    });

    // ─── Email notification ───
    if (NOTIFY_EMAIL) {
      GmailApp.sendEmail(NOTIFY_EMAIL,
        'New reservation: ' + data.camperName + ' (' + data.weeks.length + ' week' + (data.weeks.length === 1 ? '' : 's') + ')',
        'New reservation received. See HTML body for full details.',
        {
          htmlBody: buildEmailHtml(data, total, timestamp),
          replyTo: data.email,
          name: 'Ascend Reservations'
        }
      );
    }

    return jsonResponse({ ok: true });

  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'Ascend Golf Camp signup handler' });
}

// ─── Helpers ───────────────────────────────────────────────────

// Placeholder — always returns false until Stripe integration is wired up.
// When Stripe is added, this function will verify the HMAC-SHA256 signature
// on the Stripe-Signature header using your STRIPE_WEBHOOK_SECRET. A bad actor
// cannot forge this signature, so online payments become tamper-proof.
function verifyStripePayment(data) {
  return false;
}

function extractWeekKey(weekFull) {
  // Input: "Week I · May 27 – 29" → Output: "Week I"
  const m = String(weekFull).match(/^Week\s+[IVX]+/);
  return m ? m[0] : 'Other';
}

function getOrCreateSheet(ss, name, tabColor) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1F5D2E')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    // Auto-size the timestamp + week columns
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 110);
    if (tabColor) sheet.setTabColor(tabColor);
  }
  return sheet;
}

function buildRow(d, weekFull, total, timestamp) {
  return [
    timestamp,
    weekFull,
    d.parentName,
    d.camperName,
    d.camperAge || '',
    d.skillLevel || '',
    d.email,
    d.phone,
    total,
    d.dietary || '',
    d.allergies || '',
    d.emergencyName || '',
    d.emergencyPhone || '',
    d.payment === 'online' ? 'Paid Online' : (d.payment === 'dropoff' ? 'Pay at Drop-Off' : d.payment || ''),
    d.notes || ''
  ];
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function row(label, value) {
  return '<tr>' +
    '<td style="padding:6px 14px 6px 0;color:#6B6B6B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;vertical-align:top;white-space:nowrap">' + htmlEscape(label) + '</td>' +
    '<td style="padding:6px 0;color:#1A1A1A;font-size:14px;vertical-align:top">' + (value ? htmlEscape(value) : '<span style="color:#999">—</span>') + '</td>' +
    '</tr>';
}

function buildEmailHtml(d, total, timestamp) {
  const weeksHtml = d.weeks.map(function (w) { return '• ' + htmlEscape(w); }).join('<br>');
  const paymentLabel = d.payment === 'online' ? 'Paid Online' : (d.payment === 'dropoff' ? 'Pay at Drop-Off' : (d.payment || ''));

  return (
    '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;background:#FBFAF5;padding:32px;color:#1A1A1A">' +
      '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #E5E3DB;padding:36px">' +
        '<div style="border-bottom:2px solid #1F5D2E;padding-bottom:16px;margin-bottom:24px">' +
          '<div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#BFA76A;font-weight:600">New Reservation</div>' +
          '<h1 style="margin:6px 0 0;font-size:24px;color:#1F5D2E;font-weight:600">Ascend Golf Camp</h1>' +
        '</div>' +

        '<h2 style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#1F5D2E;margin:24px 0 10px">Camper &amp; Parent</h2>' +
        '<table style="width:100%;border-collapse:collapse">' +
          row('Camper', d.camperName) +
          row('Age', d.camperAge) +
          row('Skill Level', d.skillLevel) +
          row('Parent', d.parentName) +
          row('Email', d.email) +
          row('Phone', d.phone) +
        '</table>' +

        '<h2 style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#1F5D2E;margin:24px 0 10px">Weeks Selected</h2>' +
        '<div style="padding:10px 14px;background:#F7F5EF;border-left:3px solid #BFA76A;font-size:14px;line-height:1.7">' +
          weeksHtml +
        '</div>' +
        '<div style="margin-top:8px;font-size:13px;color:#6B6B6B">' + d.weeks.length + ' week' + (d.weeks.length === 1 ? '' : 's') + ' × $' + PRICE_PER_WEEK.toFixed(2) + ' = <strong style="color:#1F5D2E">$' + total + '</strong></div>' +

        '<h2 style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#1F5D2E;margin:24px 0 10px">Health &amp; Safety</h2>' +
        '<table style="width:100%;border-collapse:collapse">' +
          row('Dietary', d.dietary) +
          row('Allergies', d.allergies) +
          row('Emergency Contact', d.emergencyName) +
          row('Emergency Phone', d.emergencyPhone) +
        '</table>' +

        '<h2 style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:#1F5D2E;margin:24px 0 10px">Payment &amp; Notes</h2>' +
        '<table style="width:100%;border-collapse:collapse">' +
          row('Payment Method', paymentLabel) +
          row('Notes', d.notes) +
        '</table>' +

        '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #E5E3DB;font-size:11px;color:#999;text-align:center;letter-spacing:0.1em">' +
          'Submitted ' + Utilities.formatDate(timestamp, 'America/Los_Angeles', 'MMM d, yyyy • h:mm a') + ' PT' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}
