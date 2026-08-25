'use strict';

/*
 * 시트 대신 SQLite 파일 하나. 볼륨에 두면 컨테이너를 다시 띄워도 남는다.
 *
 * 열 이름은 시트의 HEADERS 를 그대로 옮겼다. Apps Script 쪽 기록을 CSV 로
 * 내려받아 그대로 넣을 수 있고(server/import-csv.js), 두 배포를 나란히
 * 두는 동안 어느 쪽을 보든 같은 이름으로 읽힌다.
 */

var sqlite = require('node:sqlite');
var fs = require('node:fs');
var path = require('node:path');

var SCHEMA = [
  'CREATE TABLE IF NOT EXISTS results (',
  '  id             INTEGER PRIMARY KEY,',
  '  createdAt      TEXT    NOT NULL,',   // ISO 8601, UTC
  '  clientId       TEXT    NOT NULL,',
  '  nickname       TEXT    NOT NULL,',
  '  puzzleId       TEXT    NOT NULL,',
  '  puzzleDate     TEXT    NOT NULL,',   // yyyy-MM-dd, 서버 시간대
  '  jamoLength     INTEGER NOT NULL,',
  '  attempts       INTEGER NOT NULL,',
  '  score          INTEGER NOT NULL,',
  '  elapsedSeconds INTEGER NOT NULL,',
  '  won            INTEGER NOT NULL',
  ');',
  /*
   * 한 단어, 한 번. Apps Script 는 스크립트 락을 잡고 시트를 전부 훑어
   * 확인했는데, 여기서는 유일 인덱스가 대신한다. 겹치는 INSERT 는 조용히
   * 넘어가고, 끼어들기를 막는 일도 SQLite 가 한다.
   *
   * 날짜는 키에 넣지 않는다 — 이유는 SCOREBOARD_SETUP.md 의 '한 단어, 한 번'.
   */
  'CREATE UNIQUE INDEX IF NOT EXISTS results_once ON results (clientId, puzzleId);',
  'CREATE INDEX IF NOT EXISTS results_date ON results (puzzleDate);'
].join('\n');

/*
 * 볼륨이 비어 있고 이미지에 씨앗 파일이 들어 있으면 한 번 복사한다.
 * dtc 에는 컨테이너 안으로 파일을 넣는 명령이 없어서, 시트에서 옮겨 온
 * 기록을 배포에 태우는 길이 이것뿐이다. 자세한 절차는 DEPLOY.md.
 *
 * 씨앗은 VACUUM INTO 로 뜬 한 파일이어야 한다. WAL 을 남긴 채 복사하면
 * 마지막 몇 초가 빠진다.
 */
function seed(file, from) {
  if (!from || fs.existsSync(file) || !fs.existsSync(from)) return false;
  fs.copyFileSync(from, file);
  return true;
}

function open(file, from) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  if (seed(file, from)) console.log('seeded ' + file + ' from ' + from);
  var db = new sqlite.DatabaseSync(file);
  // 읽기와 쓰기가 서로를 막지 않는다. 볼륨 위 파일 하나라 이걸로 충분하다.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(SCHEMA);
  return db;
}

var INSERT = 'INSERT OR IGNORE INTO results' +
  ' (createdAt, clientId, nickname, puzzleId, puzzleDate,' +
  '  jamoLength, attempts, score, elapsedSeconds, won)' +
  ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

/** 넣었으면 true, 이미 등록한 단어라 넘어갔으면 false. */
function insert(db, row) {
  var done = db.prepare(INSERT).run(
    row.createdAt, row.clientId, row.nickname, row.puzzleId, row.puzzleDate,
    row.jamoLength, row.attempts, row.score, row.elapsedSeconds, row.won ? 1 : 0
  );
  return done.changes > 0;
}

/*
 * date 를 주면 그 날 것만. 넣은 순서대로 돌려준다 — 닉네임을 바꿨을 때
 * 순위표가 최근 것을 따라가는 규칙이 이 순서에 기댄다(rank.js 의 totals).
 */
function read(db, date) {
  var sql = 'SELECT * FROM results' + (date ? ' WHERE puzzleDate = ?' : '') + ' ORDER BY id';
  var rows = date ? db.prepare(sql).all(date) : db.prepare(sql).all();
  return rows.map(function (row) {
    row.won = row.won === 1;
    return row;
  });
}

module.exports = { open: open, insert: insert, read: read };
