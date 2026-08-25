'use strict';

/*
 * 시트 기록 옮겨 넣기.
 *
 *   Google Sheet > 파일 > 다운로드 > 쉼표로 구분된 값(.csv)
 *   DB_FILE=./var/wordquiz.db node server/import-csv.js results.csv
 *
 * 첫 줄은 헤더로 보고 이름으로 짝을 맞춘다. 열 순서가 달라도 된다.
 * 겹치는 (clientId, puzzleId) 는 유일 인덱스가 걸러 내므로 몇 번을 다시
 * 돌려도 같은 판이 두 번 들어가지 않는다.
 */

var fs = require('node:fs');
var path = require('node:path');
var db = require('./db');

var TZ = process.env.TZ || 'Asia/Seoul';
var DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});

/** 따옴표 안의 쉼표와 줄바꿈까지 본다. 닉네임에 무엇이 들었을지 모른다. */
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = '';
  var quoted = false;

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (quoted) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (one) { return one.some(function (cell) { return cell !== ''; }); });
}

/*
 * yyyy-MM-dd 로 맞춘다. 시트는 지역 설정에 따라 '2026. 8. 21' 처럼 내보내므로
 * 숫자 세 덩이를 뽑아 쓴다. Code.gs 의 normalizeDate_ 와 같은 규칙이다.
 */
function normalizeDate(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var match = text.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return text.slice(0, 10);
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

/*
 * createdAt 은 보관용이라 아무 표도 이 값으로 그리지 않는다(순위의 '오늘'은
 * puzzleDate 가 정한다). 읽히면 ISO 로, 안 읽히면 시트가 준 글자 그대로 둔다.
 */
function normalizeStamp(value) {
  var text = String(value || '').trim();
  if (!text) return new Date().toISOString();
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function today() {
  var got = {};
  DATE_PARTS.formatToParts(new Date()).forEach(function (part) { got[part.type] = part.value; });
  return got.year + '-' + got.month + '-' + got.day;
}

function main() {
  var file = process.argv[2];
  if (!file) {
    console.error('쓰임: DB_FILE=./var/wordquiz.db node server/import-csv.js <시트.csv>');
    process.exit(2);
  }

  var rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) { console.error('빈 파일이다'); process.exit(1); }

  var head = rows[0].map(function (name) { return name.trim(); });
  var need = ['clientId', 'nickname', 'puzzleId', 'jamoLength', 'attempts', 'score', 'elapsedSeconds', 'won'];
  var missing = need.filter(function (name) { return head.indexOf(name) < 0; });
  if (missing.length) { console.error('없는 열: ' + missing.join(', ')); process.exit(1); }

  var handle = db.open(process.env.DB_FILE || path.join(__dirname, '..', 'var', 'wordquiz.db'));
  var added = 0;
  var skipped = 0;

  handle.exec('BEGIN');
  try {
    rows.slice(1).forEach(function (cells) {
      var got = {};
      head.forEach(function (name, at) { got[name] = cells[at]; });
      if (!got.clientId || !got.puzzleId) { skipped++; return; }

      var puzzleDate = normalizeDate(got.puzzleDate) || normalizeDate(got.createdAt) || today();
      var won = /^(true|1|y|yes)$/i.test(String(got.won || '').trim());

      var ok = db.insert(handle, {
        createdAt: normalizeStamp(got.createdAt),
        clientId: String(got.clientId).trim(),
        nickname: String(got.nickname || '').trim().slice(0, 20),
        puzzleId: String(got.puzzleId).trim(),
        puzzleDate: puzzleDate,
        jamoLength: Number(got.jamoLength) || 0,
        attempts: Number(got.attempts) || 0,
        score: Number(got.score) || 0,
        elapsedSeconds: Number(got.elapsedSeconds) || 0,
        won: won
      });
      if (ok) added++; else skipped++;
    });
    handle.exec('COMMIT');
  } catch (err) {
    handle.exec('ROLLBACK');
    throw err;
  }

  console.log('넣음 ' + added + ' · 넘어감 ' + skipped + ' (이미 있거나 clientId·puzzleId 가 빈 줄)');
  handle.close();
}

main();
