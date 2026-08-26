'use strict';

/*
 * 추측 허용 사전.
 *
 * 표제어가 수십만 개라 브라우저로 내려보내지 않는다. 화면은 자기가 친 자모열
 * 하나를 /valid 로 물어보고, 답을 받아 두었다가 같은 단어는 다시 묻지 않는다.
 * (정답 후보 answers-N.js 는 길이당 1~2천 개뿐이라 예전처럼 화면이 그대로 받는다.)
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

  return {
    size: size,
    /** 이 길이의 사전에 있는 자모열인가. */
    has: function (n, jamo) { return lookup.get(n, jamo) !== undefined; },
    close: function () { db.close(); }
  };
}

module.exports = { open: open };
