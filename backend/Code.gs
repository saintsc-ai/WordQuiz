var SHEET_NAME = 'results';
var SPREADSHEET_ID = '1CO_hgEwuvvPDr1NL8Xh_mwyGDzxneq2KsE4dWcsmGxQ';
var HEADERS = [
  'createdAt', 'clientId', 'nickname', 'puzzleId', 'puzzleDate',
  'jamoLength', 'attempts', 'score', 'elapsedSeconds', 'won'
];

// 중복 검사에 필요한 열만 읽기 위한 위치. HEADERS 와 순서가 같아야 한다.
var COL_CLIENT_ID = 2;   // clientId · nickname · puzzleId 3칸
var DUP_COLS = 3;

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

/*
 * 순위는 두 축이다.
 *   기간  action=daily(오늘) | overall(전체)
 *   방식  mode=total(누적 점수) | time(타임어택) | score(점수어택)
 *
 * 날짜 기준은 서버(스크립트 시간대) 하나로 둔다. 클라이언트가 date 를 보내지
 * 않으면 오늘로 본다. 브라우저 시간대에 따라 '오늘 순위'가 어제 것으로
 * 보이던 문제를 막는다.
 *
 * 응답에 mode 를 되돌려 준다. 화면이 요청한 것과 다르면 스코어보드 쪽 배포가
 * 오래됐다는 뜻이고, 그러면 엉뚱한 표를 그리지 않고 알려 줄 수 있다.
 */
var MODES = { total: 1, time: 1, score: 1 };

function doGet(e) {
  var params = (e && e.parameter) || {};
  var mode = MODES[params.mode] ? params.mode : 'total';
  var rows = readRows_(sheet_());

  if ((params.action || 'daily') !== 'overall') {
    rows = daily_(rows, normalizeDate_(params.date) || today_(), params.length);
  }
  return json_(rank_(rows, mode));
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'invalid_json' }); }
  if (data.action !== 'submit') return json_({ ok: false, error: 'invalid_action' });
  if (!data.clientId || !data.nickname || !data.puzzleId) return json_({ ok: false, error: 'missing_fields' });

  // 중복 검사와 기록 사이에 다른 요청이 끼어들면 같은 판이 두 번 들어간다.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json_({ ok: false, error: 'busy' }); }

  try {
    var sheet = sheet_();
    var clientId = String(data.clientId);
    var puzzleId = String(data.puzzleId);
    var puzzleDate = today_();   // 제출 날짜도 서버가 찍는다

    if (isDuplicate_(sheet, clientId, puzzleId)) return json_({ ok: true, duplicate: true });

    sheet.appendRow([
      new Date(), clientId, String(data.nickname).trim().slice(0, 20),
      puzzleId, puzzleDate,
      Math.max(5, Math.min(10, Number(data.jamoLength) || 0)),
      Math.max(0, Math.min(5, Number(data.attempts) || 0)),
      Math.max(0, Number(data.score) || 0),
      Math.max(0, Number(data.elapsedSeconds) || 0),
      Boolean(data.won)
    ]);
    return json_({ ok: true, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

/*
 * 같은 브라우저가 같은 단어를 두 번 등록하는 것을 막는다. 날짜는 보지 않는다.
 *
 * puzzleId 는 정답 단어에서 나온다. 한 번 등록한 단어를 다시 푸는 길은 결과
 * 화면의 링크를 스스로 다시 여는 것뿐인데, 그건 답을 아는 채로 푸는 것이라
 * 점수에 넣지 않는다. 그 단어가 무작위로 다시 뽑히는 일은 화면 쪽에서
 * 미리 걸러 낸다(js/store.js 의 isScored, js/game.js 의 skip).
 *
 * 날짜를 키에 넣지 않는 이유가 하나 더 있다. puzzleDate 는 시트가 Date 로
 * 바꿔 저장하는데, 스프레드시트 시간대와 스크립트 시간대가 다르면 하루가
 * 밀려 같은 날 등록도 새 기록으로 통과해 버린다.
 */
function isDuplicate_(sheet, clientId, puzzleId) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, COL_CLIENT_ID, last - 1, DUP_COLS).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === clientId && String(values[i][2]) === puzzleId) return true;
  }
  return false;
}

function readRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1).map(function (row) {
    return {
      createdAt: row[0], clientId: String(row[1]), nickname: String(row[2]),
      puzzleId: String(row[3]), puzzleDate: normalizeDate_(row[4]), jamoLength: Number(row[5]),
      attempts: Number(row[6]), score: Number(row[7]), elapsedSeconds: Number(row[8]),
      won: row[9] === true || String(row[9]) === 'true'
    };
  });
}

/** 오늘 기록만 남긴다. */
function daily_(rows, date, length) {
  return rows.filter(function (row) {
    return (rowDate_(row) === date || row.puzzleDate === date) &&
      (!length || row.jamoLength === Number(length));
  });
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

/*
 * yyyy-MM-dd 로 맞춘다. 시트가 날짜 문자열을 Date 로 바꿔 저장해 둔 칸이 있어
 * Date 를 먼저 걸러야 한다. String(Date) 를 정규식에 넣으면 2026-00-00 이 나온다.
 */
function normalizeDate_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' :
      Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  var match = text.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return text.slice(0, 10);
  return match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

/*
 * 사람별로 한 줄씩 만든다. clientId 는 익명 식별자라 묶는 키로만 쓰고
 * 응답에는 싣지 않는다. total 을 함께 내보내 상위 LIMIT 명만 보여 준다는
 * 사실을 화면이 숨기지 않게 한다.
 */
var LIMIT = 100;
var NO_TIME = 1e9;   // 아직 이긴 적이 없으면 맨 뒤로

function rank_(rows, mode) {
  var made = mode === 'total' ? totals_(rows) : bests_(rows, mode);
  made.sort(mode === 'total' ? sortTotals_ : (mode === 'time' ? sortTime_ : sortScore_));
  return { ok: true, mode: mode, total: made.length, rows: made.slice(0, LIMIT) };
}

/** 누적 점수 — 사람별 합계. */
function totals_(rows) {
  var totals = {};
  rows.forEach(function (row) {
    var key = row.clientId;
    if (!totals[key]) totals[key] = { nickname: row.nickname, score: 0, games: 0, wins: 0, bestTime: null };
    // 닉네임을 바꾸면 최근 것을 따라간다. 행은 기록된 순서대로 들어 있다.
    if (row.nickname) totals[key].nickname = row.nickname;
    totals[key].score += row.score;
    totals[key].games++;
    if (row.won) {
      totals[key].wins++;
      if (totals[key].bestTime === null || row.elapsedSeconds < totals[key].bestTime) totals[key].bestTime = row.elapsedSeconds;
    }
  });
  return Object.keys(totals).map(function (key) { return totals[key]; });
}

/*
 * 타임어택 · 점수어택 — 사람별 '가장 좋은 한 판'.
 * 진 판은 시간도 점수도 견줄 대상이 아니라 빼고 센다. 그래서 아직 한 번도
 * 이기지 못한 사람은 이 두 표에 나오지 않는다.
 */
function bests_(rows, mode) {
  var best = {};
  var better = mode === 'time' ? sortTime_ : sortScore_;
  rows.forEach(function (row) {
    if (!row.won) return;
    var key = row.clientId;
    var entry = {
      nickname: row.nickname, score: row.score, elapsedSeconds: row.elapsedSeconds,
      jamoLength: row.jamoLength, attempts: row.attempts
    };
    if (!best[key] || better(entry, best[key]) < 0) best[key] = entry;
    else if (row.nickname) best[key].nickname = row.nickname;
  });
  return Object.keys(best).map(function (key) { return best[key]; });
}

// 총점 -> 적은 판수 -> 빠른 최고 기록. 같은 점수면 판을 덜 쓴 쪽이 위로 간다.
function sortTotals_(a, b) {
  return b.score - a.score || a.games - b.games ||
    (a.bestTime === null ? NO_TIME : a.bestTime) - (b.bestTime === null ? NO_TIME : b.bestTime);
}

// 타임어택: 빠른 순. 같은 시간이면 점수가 높은 쪽.
function sortTime_(a, b) {
  return a.elapsedSeconds - b.elapsedSeconds || b.score - a.score;
}

// 점수어택: 높은 순. 같은 점수면 빨리 푼 쪽.
function sortScore_(a, b) {
  return b.score - a.score || a.elapsedSeconds - b.elapsedSeconds;
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
