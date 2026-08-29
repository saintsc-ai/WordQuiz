'use strict';

/*
 * 추측 허용 사전과 뜻풀이.
 *
 * 표제어가 수십만 개라 브라우저로 내려보내지 않는다. 화면은 자기가 친 자모열
 * 하나를 /valid 로 물어보고, 답을 받아 두었다가 같은 단어는 다시 묻지 않는다.
 * (정답 후보 answers-N.js 는 길이당 1~2천 개뿐이라 예전처럼 화면이 그대로 받는다.)
 *
 * 뜻풀이도 같은 이유로 여기 있다. 27만 개에 24MB 라 내려보낼 수 없다.
 * 화면은 한 줄 낼 때마다, 판이 끝났을 때, 출제할 때 그 단어 하나만
 * /define 으로 묻는다.
 *
 * 기록 DB(var/wordquiz.db)와 일부러 다른 파일이다. 사전은 이미지에 실려 와
 * 배포마다 통째로 갈리고, 기록은 볼륨에 남아야 한다. 수명이 다르니 섞지 않는다.
 * 그래서 여는 방식도 다르다 — 이쪽은 읽기 전용이고 WAL 도 쓰지 않는다.
 */

var sqlite = require('node:sqlite');
var fs = require('node:fs');

/*
 * 사전을 못 열면 null 을 돌려준다. 서버는 그래도 뜬다 — 사전이 빠졌다고
 * 순위표까지 같이 죽일 이유는 없다. 대신 그때는 모든 추측을 통과시키므로
 * (server.js 의 valid), 조용히 넘어가지 않게 로그를 남기고 /healthz 가
 * dict 를 함께 보고한다. 배포가 잘못된 것을 거기서 알아채면 된다.
 */
function open(file) {
  if (!fs.existsSync(file)) {
    console.error('사전 파일이 없습니다: ' + file + ' — 모든 추측을 통과시킵니다. python tools/build_dict.py 로 만드세요.');
    return null;
  }

  var db;
  try {
    db = new sqlite.DatabaseSync(file, { readOnly: true });
  } catch (err) {
    console.error('사전을 열지 못했습니다: ' + file, err);
    return null;
  }

  var lookup = db.prepare('SELECT 1 FROM words WHERE n = ? AND jamo = ?');
  var size = db.prepare('SELECT count(*) AS n FROM words').get().n;

  /*
   * 자모열의 대표 표제어. 화면은 자기가 친 자모열밖에 모르는데 뜻풀이는
   * 한글 표제어로 찾으므로, 그 사이를 이 칸이 잇는다.
   *
   * word 칸이 없는 옛 사전 파일이면 null 을 돌려준다 — 뜻풀이만 조용히
   * 쉬고 판정은 그대로 돈다.
   */
  var hasWord = db.prepare(
    "SELECT 1 FROM pragma_table_info('words') WHERE name = 'word'"
  ).get() !== undefined;

  var spelling = hasWord
    ? db.prepare('SELECT word FROM words WHERE n = ? AND jamo = ?')
    : null;

  /*
   * 뜻풀이 표는 옛 사전 파일에는 없다. 없으면 뜻풀이 기능만 조용히 쉰다 —
   * 사전이 한 판 낡았다고 게임을 못 하게 할 이유는 없다.
   */
  var hasSenses = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'senses'"
  ).get() !== undefined;

  var senses = hasSenses
    ? db.prepare('SELECT definition FROM senses WHERE word = ? ORDER BY seq LIMIT ?')
    : null;

  /*
   * 추천 단어. 정답 후보에서 뽑는다 — 남이 풀 판을 만드는 것이니 풀 수 있는
   * 말이어야 하고, 그쪽은 기초사전이라 뜻풀이도 읽기 쉽다.
   *
   * answers 표가 있으면 그걸 쓰고, 없는 낡은 사전이면 null 을 돌려준다.
   */
  var hasAnswers = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'answers'"
  ).get() !== undefined;

  var pickAnswer = hasAnswers
    ? db.prepare('SELECT word FROM answers WHERE n = ? ORDER BY RANDOM() LIMIT 1')
    : null;

  /*
   * 어휘등급(초급·중급·고급). 정답 후보에만 있다 — 기초사전에서 온 값이고,
   * 표준대사전에만 있는 말은 등급이 없다. 등급 칸이 없는 옛 사전 파일이면
   * 조용히 null 을 돌려준다.
   */
  var hasLevel = hasAnswers && db.prepare(
    "SELECT 1 FROM pragma_table_info('answers') WHERE name = 'level'"
  ).get() !== undefined;

  var levelOf = hasLevel
    ? db.prepare('SELECT level FROM answers WHERE word = ? LIMIT 1')
    : null;

  return {
    size: size,
    /** 이 길이의 사전에 있는 자모열인가. */
    has: function (n, jamo) { return lookup.get(n, jamo) !== undefined; },
    /** 이 자모열의 대표 표제어. 없으면 null. */
    spell: function (n, jamo) {
      if (!spelling) return null;
      var row = spelling.get(n, jamo);
      return (row && row.word) || null;
    },
    /** 표제어의 뜻풀이. 없으면 빈 배열. */
    define: function (word, limit) {
      if (!senses) return [];
      return senses.all(word, limit || 8).map(function (r) { return r.definition; });
    },
    /** 표제어의 어휘등급. 없으면 null. */
    level: function (word) {
      if (!levelOf) return null;
      var row = levelOf.get(word);
      return (row && row.level) || null;
    },
    /** 그 길이의 정답 후보 하나. 없으면 null. */
    suggest: function (n) {
      if (!pickAnswer) return null;
      var row = pickAnswer.get(n);
      return row ? row.word : null;
    },
    close: function () { db.close(); }
  };
}

module.exports = { open: open };
