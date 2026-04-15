// ╔════════════════════════════════════════════════════════════════╗
// ║  ASCEND GOLF CAMP — Signup form handler                        ║
// ║                                                                 ║
// ║  How to use:                                                    ║
// ║  1. Create a new Google Sheet (e.g. "Ascend — Reservations")   ║
// ║  2. Open Extensions → Apps Script                              ║
// ║  3. Replace the default code with everything in this file      ║
// ║  4. Set NOTIFY_EMAIL below to your gmail (or leave blank)      ║
// ║  5. Click Deploy → New deployment                              ║
// ║     - Type: Web app                                            ║
// ║     - Execute as: Me                                           ║
// ║     - Who has access: Anyone                                   ║
// ║  6. Copy the Web App URL and paste it into index.html         ║
// ║     (search for APPS_SCRIPT_URL and replace)                   ║
// ╚════════════════════════════════════════════════════════════════╝

// ─── Config ─────────────────────────────────────────────────────
const NOTIFY_EMAIL = 'info@ascendgolfcamp.com';   // Email to notify on every new reservation
const PRICE_PER_WEEK = 999.99;
const SHEET_NAME = 'Reservations';
// ────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Basic validation
    if (!data.parentName || !data.camperName || !data.email || !data.phone || !Array.isArray(data.weeks) || data.weeks.length === 0) {
      return jsonResponse({ ok: false, error: 'Missing required fields' });
    }

    const total = (data.weeks.length * PRICE_PER_WEEK).toFixed(2);
    const timestamp = new Date();

    // ─── Save to sheet ───
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        'Submitted', 'Parent', 'Camper', 'Age', 'Skill', 'Email', 'Phone',
        'Weeks', 'Count', 'Total ($)', 'Dietary', 'Allergies',
        'Emergency Name', 'Emergency Phone', 'Payment', 'Notes'
      ]);
      sheet.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#1F5D2E').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      timestamp,
      data.parentName,
      data.camperName,
      data.camperAge || '',
      data.skillLevel || '',
      data.email,
      data.phone,
      data.weeks.join('; '),
      data.weeks.length,
      total,
      data.dietary || '',
      data.allergies || '',
      data.emergencyName || '',
      data.emergencyPhone || '',
      data.payment || '',
      data.notes || ''
    ]);

    // ─── Send notification email ───
    if (NOTIFY_EMAIL) {
      const htmlBody = buildEmailHtml(data, total, timestamp);
      GmailApp.sendEmail(NOTIFY_EMAIL,
        'New reservation: ' + data.camperName + ' (' + data.weeks.length + ' week' + (data.weeks.length === 1 ? '' : 's') + ')',
        'New reservation received. See HTML body for full details.',
        {
          htmlBody: htmlBody,
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

function doGet(e) {
  return jsonResponse({ ok: true, service: 'Ascend Golf Camp signup handler' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function row(label, value) {
  return '<tr>' +
    '<td style="padding:6px 14px 6px 0;color:#6B6B6B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;vertical-align:top;white-space:nowrap">' + escape(label) + '</td>' +
    '<td style="padding:6px 0;color:#1A1A1A;font-size:14px;vertical-align:top">' + (value ? escape(value) : '<span style="color:#999">—</span>') + '</td>' +
    '</tr>';
}

function buildEmailHtml(d, total, timestamp) {
  const weeksHtml = d.weeks.map(function (w) { return '• ' + escape(w); }).join('<br>');
  const paymentLabel = d.payment === 'online' ? 'Pay Online' : (d.payment === 'dropoff' ? 'Pay at Drop-Off' : (d.payment || ''));

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
