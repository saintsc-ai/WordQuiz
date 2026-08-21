/*
 * tests.js — jamo.js / game.js 의 순수 로직 검증
 *
 * 브라우저에서 tests/index.html 을 열면 결과가 표로 나온다.
 * DOM 을 만지지 않으므로 window.Jamo 와 window.Game 만 있으면 어디서든 돈다.
 */
(function (global) {
  'use strict';

  function Suite() { this.results = []; }

  Suite.prototype.eq = function (name, actual, expected) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    this.results.push({ name: name, ok: a === b, got: a, want: b });
  };
  Suite.prototype.ok = function (name, cond, note) {
    this.results.push({ name: name, ok: !!cond, got: String(cond), want: 'true', note: note });
  };

  function run() {
    var t = new Suite();
    var Jamo = global.Jamo, Game = global.Game;

    /* ── 자모 분해 ──────────────────────────────── */
    t.eq('안녕 → 6칸', Jamo.decompose('안녕'), 'ㅇㅏㄴㄴㅕㅇ');
    t.eq('꽃 → 쌍자음이 두 키로 펴진다', Jamo.decompose('꽃'), 'ㄱㄱㅗㅊ');
    t.eq('사과 → 복합모음이 두 키로 펴진다', Jamo.decompose('사과'), 'ㅅㅏㄱㅗㅏ');
    t.eq('닭 → 겹받침이 두 키로 펴진다', Jamo.decompose('닭'), 'ㄷㅏㄹㄱ');
    t.eq('의사 → ㅢ 는 ㅡㅣ (초성 ㅇ 포함)', Jamo.decompose('의사'), 'ㅇㅡㅣㅅㅏ');
    t.eq('값 → ㅄ 는 ㅂㅅ', Jamo.decompose('값'), 'ㄱㅏㅂㅅ');
    t.eq('왜 → 미지원(ㅙ)', Jamo.decompose('왜'), null);
    t.eq('궤 → 미지원(ㅞ)', Jamo.decompose('궤'), null);
    t.eq('영문은 거부', Jamo.decompose('abc'), null);
    t.eq('자모만 있는 글자도 거부', Jamo.decompose('ㄱㄴ'), null);
    t.eq('빈 문자열은 빈 결과', Jamo.decompose(''), '');
    t.ok('자판은 24키', Jamo.CONSONANTS.length + Jamo.VOWELS.length === 24);
    t.ok('분해 결과는 전부 자판 키', ['안녕', '꽃', '사과', '닭', '값', '의사'].every(function (w) {
      return Jamo.decompose(w).split('').every(function (k) { return Jamo.KEYS[k]; });
    }));

    /* ── 채점: 같은 자모가 여러 번 나올 때 ──────────── */
    t.eq('자리까지 맞으면 ok', Game.score('ㄱㄴ', 'ㄱㄴ'), ['ok', 'ok']);
    t.eq('자리가 다르면 warn', Game.score('ㄱㄴ', 'ㄴㄱ'), ['warn', 'warn']);
    t.eq('없으면 off', Game.score('ㄱㄴ', 'ㄷㄹ'), ['off', 'off']);
    t.eq('정답에 ㄱ 하나인데 추측에 둘 → 노랑은 하나만',
         Game.score('ㄱㄱㄴ', 'ㄱㄴㄷ'), ['ok', 'off', 'warn']);
    t.eq('맞은 자리가 먼저 개수를 가져간다',
         Game.score('ㄱㄴㄱ', 'ㄷㄴㄱ'), ['off', 'ok', 'ok']);
    // 정답의 ㄱ 두 개 중 하나만 제자리에서 소진 → 남은 하나만 노랑이 된다
    t.eq('남은 개수만큼만 노랑', Game.score('ㄴㄱㄱㄱ', 'ㄱㄱㄷㄹ'), ['off', 'ok', 'warn', 'off']);
    t.eq('제자리에서 다 소진되면 초과분은 회색', Game.score('ㄱㄱㄱㄱ', 'ㄷㄱㄱㄹ'), ['off', 'ok', 'ok', 'off']);

    /* ── 공유 코드 ──────────────────────────────── */
    ['안녕', '사과', '뷁', '가나다라마바사'].forEach(function (w) {
      t.eq('encode→decode 왕복: ' + w, Game.decode(Game.encode(w)), w);
    });
    t.ok('코드는 URL 에 그대로 쓸 수 있는 문자만', /^[A-Za-z0-9_-]+$/.test(Game.encode('안녕하세요')),
         Game.encode('안녕하세요'));
    t.ok('정답이 코드에 그대로 보이지 않는다', Game.encode('안녕').indexOf('안녕') < 0);

    /* ── 게임 진행 ──────────────────────────────── */
    var WORDS = ['사과', '사랑', '하늘'];          // 전부 자모 5칸
    var valid = {};
    WORDS.forEach(function (w) { valid[Jamo.decompose(w)] = 1; });
    var dict = {
      length: 5,
      valid: { has: function (k) { return !!valid[k]; } },
      answers: WORDS.slice()
    };
    t.ok('테스트 단어가 모두 5칸', WORDS.every(function (w) { return Jamo.decompose(w).length === 5; }));

    var g = new Game(dict);
    t.ok('주어진 단어로 판을 깐다', g.reset('사랑') === true && g.answer === '사랑');
    t.ok('사전에 없는 단어로는 못 깐다', g.reset('노래') === false);
    t.ok('실패해도 이전 판이 유지된다', g.answer === '사랑');

    /* ── 시계 ──────────────────────────────────── */
    g.reset('사랑');
    t.ok('판을 깔았다고 시작한 것은 아니다', g.started() === false);
    t.eq('시작 전에는 걸린 시간이 0', g.elapsedSeconds(), 0);
    g.type('ㅅ');
    t.ok('첫 자모를 치면 시작', g.started() === true);
    g.back();
    t.ok('지워도 시작한 것은 그대로', g.started() === true);
    g.reset('사랑');
    t.ok('새 판을 깔면 다시 시작 전', g.started() === false);

    g.reset('사랑');
    t.eq('처음엔 입력이 비어 있다', g.current, '');
    t.eq('덜 채우고 제출하면 short', g.submit(), { ok: false, reason: 'short' });

    'ㄴㅗㄹㅏㅣ'.split('').forEach(function (k) { g.type(k); });
    t.ok('길이를 넘겨 입력되지 않는다', g.type('ㄱ') === false && g.current.length === 5);
    t.eq('사전에 없으면 unknown', g.submit(), { ok: false, reason: 'unknown' });
    t.ok('거부된 입력은 그대로 남는다', g.current === 'ㄴㅗㄹㅏㅣ');
    g.back();
    t.eq('지우기', g.current, 'ㄴㅗㄹㅏ');

    g.reset('사랑');
    'ㅎㅏㄴㅡㄹ'.split('').forEach(function (k) { g.type(k); });
    var res = g.submit();
    t.ok('사전에 있으면 제출된다', res.ok === true);
    t.eq('제출 후 입력이 비워진다', g.current, '');
    t.eq('키 색은 좋은 쪽이 남는다', g.keyState['ㅎ'], 'off');
    t.eq('한 줄이 쌓였다', g.rows.length, 1);
    t.eq('아직 진행 중', g.status, 'play');

    'ㅅㅏㄹㅏㅇ'.split('').forEach(function (k) { g.type(k); });
    g.submit();
    t.eq('맞히면 win', g.status, 'win');
    t.eq('2번 만에 맞힌 5칸 점수 = 5 * (6-2)', g.score(), 20);

    // 5번 모두 틀리면 lose
    g.reset('사랑');
    for (var i = 0; i < Game.MAX_TRIES; i++) {
      'ㅎㅏㄴㅡㄹ'.split('').forEach(function (k) { g.type(k); });
      g.submit();
    }
    t.eq('다 틀리면 lose', g.status, 'lose');
    t.eq('진 판은 0점', g.score(), 0);
    t.eq('끝난 판은 더 못 친다', g.type('ㄱ'), false);
    t.eq('끝난 판 제출은 done', g.submit(), { ok: false, reason: 'done' });
    t.ok('공유 격자에 X/5 가 찍힌다', g.shareText().indexOf('X/' + Game.MAX_TRIES) > 0, g.shareText().split('\n')[0]);

    /* ── 이미 점수를 등록한 단어는 다시 내지 않는다 ── */
    // skip 이 참인 단어는 무작위 후보에서 빠진다. '하늘' 하나만 남겨 둔다.
    var only = new Game(dict, function (w) { return w !== '하늘'; });
    t.eq('걸러지지 않은 후보만 뽑는다', only.answer, '하늘');
    var picks = [];
    for (var p = 0; p < 20; p++) { only.reset(); picks.push(only.answer); }
    t.ok('다시 깔아도 걸러진 단어는 안 나온다',
         picks.every(function (w) { return w === '하늘'; }), picks.join(','));
    t.ok('걸러진 단어도 링크로 주면 그대로 깔린다',
         only.reset('사과') === true && only.answer === '사과');

    // 후보를 다 등록한 사람에게도 낼 단어는 있어야 한다
    var none = new Game(dict, function () { return true; });
    t.ok('후보가 전부 걸러지면 전체에서 고른다', WORDS.indexOf(none.answer) >= 0, none.answer);

    var plain = new Game(dict);
    t.ok('skip 을 주지 않으면 전체에서 고른다', WORDS.indexOf(plain.answer) >= 0, plain.answer);

    /* ── 결과 링크 복원 ─────────────────────────── */
    g.reset('사랑');
    'ㅅㅏㄹㅏㅇ'.split('').forEach(function (k) { g.type(k); });
    g.submit();
    var code = g.resultCode();

    var g2 = new Game(dict);
    g2.reset('사랑');
    t.ok('같은 단어의 결과는 복원된다', g2.restoreResult(code) === true);
    t.eq('복원된 판은 끝난 상태', g2.status, 'win');
    t.eq('복원된 줄 수', g2.rows.length, 1);

    var g3 = new Game(dict);
    g3.reset('하늘');
    t.ok('다른 단어의 결과는 거부', g3.restoreResult(code) === false);
    t.ok('깨진 코드는 거부', g3.restoreResult('!!!!') === false);
    t.ok('빈 코드는 거부', g3.restoreResult('') === false);

    // 사전에 없는 자모열이 섞인 결과는 거부해야 한다
    var forged = Game.encode(JSON.stringify({
      answer: '하늘', status: 'win', elapsedSeconds: 1,
      rows: [{ jamo: 'ㄴㅗㄹㅏㅣ', marks: ['ok', 'ok', 'ok', 'ok', 'ok'] }]
    }));
    t.ok('사전에 없는 줄이 든 결과는 거부', g3.restoreResult(forged) === false);

    // 채점표를 손댄 결과는 받지 않는다 (다시 매겨 대조한다)
    var realMarks = Game.score(Jamo.decompose('사랑'), Jamo.decompose('하늘'));
    function payload(rows, status) {
      return Game.encode(JSON.stringify({ answer: '하늘', status: status, elapsedSeconds: 1, rows: rows }));
    }
    function rowsOf(n, marks) {
      var out = [];
      for (var k = 0; k < n; k++) out.push({ jamo: Jamo.decompose('사랑'), marks: marks });
      return out;
    }
    t.ok('전부 초록으로 고친 격자는 거부',
         g3.restoreResult(payload(rowsOf(5, ['ok','ok','ok','ok','ok']), 'lose')) === false);
    t.ok('진짜 채점표를 단 5줄 패배는 받는다',
         g3.restoreResult(payload(rowsOf(5, realMarks), 'lose')) === true);
    g3.reset('하늘');
    t.ok('정답을 못 맞혔는데 win 이라 우기면 거부',
         g3.restoreResult(payload(rowsOf(5, realMarks), 'win')) === false);
    t.ok('기회가 남았는데 lose 라 하면 거부',
         g3.restoreResult(payload(rowsOf(1, realMarks), 'lose')) === false);

    var tooMany = Game.encode(JSON.stringify({
      answer: '하늘', status: 'win', elapsedSeconds: 1,
      rows: new Array(Game.MAX_TRIES + 1).fill({ jamo: 'ㅎㅏㄴㅡㄹ', marks: ['ok','ok','ok','ok','ok'] })
    }));
    t.ok('기회보다 많은 줄은 거부', g3.restoreResult(tooMany) === false);

    var passed = t.results.filter(function (r) { return r.ok; }).length;
    return { results: t.results, passed: passed, failed: t.results.length - passed };
  }

  global.WordQuizTests = { run: run };
})(typeof window !== 'undefined' ? window : this);
