var SHEET_NAME = 'results';
var SPREADSHEET_ID = '1CO_hgEwuvvPDr1NL8Xh_mwyGDzxneq2KsE4dWcsmGxQ';
var HEADERS = [
  'createdAt', 'clientId', 'nickname', 'puzzleId', 'puzzleDate',
  'jamoLength', 'attempts', 'score', 'elapsedSeconds', 'won'
];

function sheet_() {
  var book = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  return sheet;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = e.parameter.action || 'daily';
  var sheet = sheet_();
  var rows = readRows_(sheet);
  if (action === 'overall') return json_(overall_(rows));
  return json_(daily_(rows, e.parameter.date || today_(), e.parameter.length));
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'invalid_json' }); }
  if (data.action !== 'submit') return json_({ ok: false, error: 'invalid_action' });
  if (!data.clientId || !data.nickname || !data.puzzleId) return json_({ ok: false, error: 'missing_fields' });
  var sheet = sheet_();
  var rows = readRows_(sheet);
  var duplicate = rows.some(function (row) {
    return row.clientId === String(data.clientId) && row.puzzleId === String(data.puzzleId);
  });
  if (duplicate) return json_({ ok: true, duplicate: true });

  var score = Math.max(0, Number(data.score) || 0);
  var attempts = Math.max(0, Math.min(5, Number(data.attempts) || 0));
  var length = Math.max(5, Math.min(10, Number(data.jamoLength) || 0));
  var elapsed = Math.max(0, Number(data.elapsedSeconds) || 0);
  sheet.appendRow([
    new Date(), String(data.clientId), String(data.nickname).trim().slice(0, 20),
    String(data.puzzleId), String(data.puzzleDate || today_()), length,
    attempts, score, elapsed, Boolean(data.won)
  ]);
  return json_({ ok: true, duplicate: false });
}

function readRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).map(function (row) {
    return {
      createdAt: row[0], clientId: String(row[1]), nickname: String(row[2]),
      puzzleId: String(row[3]), puzzleDate: String(row[4]), jamoLength: Number(row[5]),
      attempts: Number(row[6]), score: Number(row[7]), elapsedSeconds: Number(row[8]),
      won: row[9] === true || String(row[9]) === 'true'
    };
  });
}

function daily_(rows, date, length) {
  var filtered = rows.filter(function (row) {
    return (rowDate_(row) === date || normalizeDate_(row.puzzleDate) === date) &&
      (!length || row.jamoLength === Number(length));
  });
  return { ok: true, rows: filtered.sort(sortScore_).slice(0, 100).map(publicRow_) };
}

function rowDate_(row) {
  if (row.createdAt) {
    var createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    if (!isNaN(createdAt.getTime())) {
      return Utilities.formatDate(createdAt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  }
  return row.puzzleDate;
}

function normalizeDate_(value) {
  if (!value) return '';
  var text = String(value);
  var match = text.match(/(20\d{2})\D(\d{1,2})\D(\d{1,2})/);
  if (!match) return text.slice(0, 10);
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function overall_(rows) {
  var totals = {};
  rows.forEach(function (row) {
    var key = row.clientId;
    if (!totals[key]) totals[key] = { clientId: key, nickname: row.nickname, score: 0, games: 0, wins: 0, bestTime: null };
    totals[key].score += row.score;
    totals[key].games++;
    if (row.won) {
      totals[key].wins++;
      if (totals[key].bestTime === null || row.elapsedSeconds < totals[key].bestTime) totals[key].bestTime = row.elapsedSeconds;
    }
  });
  return { ok: true, rows: Object.keys(totals).map(function (key) { return totals[key]; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 100) };
}

function sortScore_(a, b) {
  return b.score - a.score || a.elapsedSeconds - b.elapsedSeconds || a.attempts - b.attempts;
}

function publicRow_(row) {
  return { nickname: row.nickname, score: row.score, attempts: row.attempts, elapsedSeconds: row.elapsedSeconds, won: row.won, jamoLength: row.jamoLength };
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
