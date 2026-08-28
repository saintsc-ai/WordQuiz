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

    // 물리 자판으로 친 겹자모를 24키로 펴는가 (js/jamo.js 의 keysFor)
    t.eq('ㅐ 는 ㅏㅣ 로 펴진다', Jamo.keysFor('ㅐ'), 'ㅏㅣ');
    t.eq('ㅔ 는 ㅓㅣ 로 펴진다', Jamo.keysFor('ㅔ'), 'ㅓㅣ');
    t.eq('ㅒ 도 편다', Jamo.keysFor('ㅒ'), 'ㅑㅣ');
    t.eq('쌍자음도 편다', Jamo.keysFor('ㄲ'), 'ㄱㄱ');
    t.eq('원래 키는 그대로', Jamo.keysFor('ㄱ'), 'ㄱ');
    t.eq('원래 키는 그대로 (모음)', Jamo.keysFor('ㅏ'), 'ㅏ');
    t.eq('미지원 모음은 받지 않는다', Jamo.keysFor('ㅙ'), '');
    t.eq('영문은 받지 않는다', Jamo.keysFor('a'), '');
    t.eq('기능키는 받지 않는다', Jamo.keysFor('Shift'), '');

    /*
     * 이 기능의 요점: 한글 자판으로 한 글자씩 친 결과가, 퍼즐이 쓰는
     * 자모열과 정확히 같아야 한다. 다르면 친 사람만 억울해진다.
     */
    ['배', '게', '얘기', '깨', '의사'].forEach(function (word) {
      var typed = '';
      for (var i = 0; i < word.length; i++) {
        var code = word.charCodeAt(i) - 0xac00;
        var cho = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ',
                   'ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][Math.floor(code / 588)];
        var jung = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ',
                    'ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'][Math.floor(code / 28) % 21];
        var jong = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ',
                    'ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][code % 28];
        typed += Jamo.keysFor(cho) + Jamo.keysFor(jung) + (jong ? Jamo.keysFor(jong) : '');
      }
      t.eq('자판으로 친 ' + word + ' = 퍼즐의 ' + word, typed, Jamo.decompose(word));
    });
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

    /*
     * 5번 모두 틀리면 lose.
     *
     * 서로 다른 단어로 틀려야 한다 — 같은 단어를 다시 내는 것은 거부되므로
     * (triedAt), 한 단어를 다섯 번 내면 줄이 하나만 쌓이고 판이 끝나지 않는다.
     * 위의 WORDS 는 3개뿐이고 힌트 테스트가 그 개수를 전제하므로, 판을 끝까지
     * 밀어야 하는 여기서만 사전을 따로 만든다.
     */
    var MANY = ['사과', '사랑', '하늘', '구름', '소금', '사람'];   // 전부 자모 5칸
    var manyValid = {};
    MANY.forEach(function (w) { manyValid[Jamo.decompose(w)] = 1; });
    var manyDict = {
      length: 5,
      valid: { has: function (k) { return !!manyValid[k]; } },
      answers: MANY.slice()
    };
    t.ok('MANY 도 모두 5칸', MANY.every(function (w) { return Jamo.decompose(w).length === 5; }));
    var WRONG = ['ㅎㅏㄴㅡㄹ', 'ㅅㅏㄱㅗㅏ', 'ㄱㅜㄹㅡㅁ', 'ㅅㅗㄱㅡㅁ', 'ㅅㅏㄹㅏㅁ'];

    g = new Game(manyDict);
    g.reset('사랑');
    WRONG.forEach(function (jamo) {
      jamo.split('').forEach(function (k) { g.type(k); });
      g.submit();
    });
    t.eq('다 틀리면 lose', g.status, 'lose');
    t.eq('진 판은 0점', g.score(), 0);
    t.eq('끝난 판은 더 못 친다', g.type('ㄱ'), false);
    t.eq('끝난 판 제출은 done', g.submit(), { ok: false, reason: 'done' });
    t.ok('공유 격자에 X/5 가 찍힌다', g.shareText().indexOf('X/' + Game.MAX_TRIES) > 0, g.shareText().split('\n')[0]);

    /* ── 같은 단어를 두 번 내지 못한다 ──────────────
     *
     * 다시 내도 새로 알게 되는 것이 없는데 기회만 사라진다. 실수로 같은 줄을
     * 두 번 올리는 일이 실제로 생긴다.
     */
    var r = new Game(manyDict);
    r.reset('사랑');
    'ㅎㅏㄴㅡㄹ'.split('').forEach(function (k) { r.type(k); });
    t.ok('첫 제출은 통과', r.submit().ok === true);
    t.eq('아직 안 낸 단어는 0', r.triedAt('ㅅㅏㄱㅗㅏ'), 0);
    t.eq('이미 낸 단어는 줄 번호', r.triedAt('ㅎㅏㄴㅡㄹ'), 1);

    'ㅎㅏㄴㅡㄹ'.split('').forEach(function (k) { r.type(k); });
    t.eq('같은 단어를 다시 내면 repeat', r.submit(), { ok: false, reason: 'repeat', at: 1 });
    t.eq('거부됐으니 줄이 늘지 않는다', r.rows.length, 1);
    t.ok('입력은 그대로 남아 고칠 수 있다', r.current === 'ㅎㅏㄴㅡㄹ');

    // 세 번째 줄과 겹쳐도 그 줄 번호를 알려 준다
    r.reset('사랑');
    ['ㅎㅏㄴㅡㄹ', 'ㅅㅏㄱㅗㅏ', 'ㄱㅜㄹㅡㅁ'].forEach(function (jamo) {
      jamo.split('').forEach(function (k) { r.type(k); });
      r.submit();
    });
    'ㄱㅜㄹㅡㅁ'.split('').forEach(function (k) { r.type(k); });
    t.eq('세 번째 줄과 겹치면 at=3', r.submit(), { ok: false, reason: 'repeat', at: 3 });
    t.eq('기회는 그대로 3줄', r.rows.length, 3);

    // 사전에 없는 단어가 먼저 걸러진다 — 낸 적 없는 단어이므로 repeat 가 아니다
    r.reset('사랑');
    'ㄴㅗㄹㅏㅣ'.split('').forEach(function (k) { r.type(k); });
    t.eq('사전에 없는 쪽이 먼저다', r.submit().reason, 'unknown');

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

    /* ── 힌트 ──────────────────────────────────── */
    var h = new Game(dict);
    h.reset('사랑');
    t.eq('처음엔 힌트를 안 봤다', h.hintsUsed, 0);
    t.eq('안 봤으면 점수도 시간도 안 깎인다', [h.hintScorePenalty(), h.hintSecondsPenalty()], [0, 0]);

    var seen = [];
    var w1 = h.hint();
    t.ok('힌트가 나온다', typeof w1 === 'string' && w1.length > 0, w1);
    t.ok('정답은 힌트로 안 나온다', w1 !== '사랑');
    t.ok('힌트도 이 길이의 단어다', Jamo.decompose(w1).length === 5);
    t.eq('본 횟수가 는다', h.hintsUsed, 1);
    t.eq('5자모 한 번 = 5점 · 100초', [h.hintScorePenalty(), h.hintSecondsPenalty()], [5, 100]);
    t.ok('힌트를 보면 시계가 시작된다', h.started() === true);
    seen.push(w1);

    var w2 = h.hint();
    t.ok('두 번째도 나온다', typeof w2 === 'string', w2);
    t.ok('앞서 본 것과 다르다', w2 !== w1);
    t.eq('두 번 보면 두 배', [h.hintScorePenalty(), h.hintSecondsPenalty()], [10, 200]);
    seen.push(w2);

    t.eq('사전이 3개뿐이라 더는 없다', h.hint(), null);
    t.eq('없으면 횟수도 안 는다', h.hintsUsed, 2);

    // 이미 제출한 줄도 힌트에서 빠진다
    var h2 = new Game(dict);
    h2.reset('사랑');
    'ㅎㅏㄴㅡㄹ'.split('').forEach(function (k) { h2.type(k); });
    h2.submit();
    var only = h2.hint();
    t.ok('제출한 단어는 힌트로 안 나온다', only !== '하늘' && only !== '사랑', only);
    t.eq('남은 하나가 나온다', only, '사과');

    // 점수와 시간에 실제로 반영된다
    var h3 = new Game(dict);
    h3.reset('사랑');
    'ㅅㅏㄹㅏㅇ'.split('').forEach(function (k) { h3.type(k); });
    h3.submit();
    t.eq('힌트 없이 1번에 맞히면 25점', h3.score(), 25);

    var h4 = new Game(dict);
    h4.reset('사랑');
    h4.hint();
    'ㅅㅏㄹㅏㅇ'.split('').forEach(function (k) { h4.type(k); });
    h4.submit();
    t.eq('힌트 한 번이면 5점 깎여 20점', h4.score(), 20);
    t.ok('시간에도 100초가 얹힌다', h4.elapsedSeconds() - h4.baseSeconds() === 100);

    // 점수가 음수로 내려가지 않는다
    var h5 = new Game({ length: 5, valid: dict.valid, answers: WORDS.slice() });
    h5.reset('사랑');
    h5.hintsUsed = 99;
    'ㅅㅏㄹㅏㅇ'.split('').forEach(function (k) { h5.type(k); });
    h5.submit();
    t.eq('아무리 깎여도 0점 아래로는 안 간다', h5.score(), 0);

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

    /* 스코어보드 더 불러오기 --------------------------------------------
     *
     * 목록은 스크롤할 때마다 다음 묶음을 그린다. 그런데 첫 묶음이 컨테이너를
     * 넘치지 않으면 스크롤할 것이 없어 이벤트가 영영 오지 않는다. 창이 세로로
     * 길면 실제로 그렇게 되고, '더 불러오는 중…' 에서 멈춘 채 끝난다.
     */
    var needsMore = global.UIScore && global.UIScore.needsMore;
    t.ok('needsMore 가 있다', typeof needsMore === 'function');
    if (typeof needsMore === 'function') {
      t.ok('스크롤이 안 생겼는데 남은 것이 있으면 더 채운다',
           needsMore(10, 25, false) === true);
      t.ok('스크롤이 생겼으면 사용자가 부를 수 있으니 멈춘다',
           needsMore(10, 25, true) === false);
      t.ok('다 그렸으면 멈춘다', needsMore(25, 25, false) === false);
      t.ok('더 그렸어도 멈춘다', needsMore(30, 25, false) === false);
      t.ok('빈 목록이면 멈춘다', needsMore(0, 0, false) === false);
    }

    var passed = t.results.filter(function (r) { return r.ok; }).length;
    return { results: t.results, passed: passed, failed: t.results.length - passed };
  }

  global.WordQuizTests = { run: run };
})(typeof window !== 'undefined' ? window : this);
