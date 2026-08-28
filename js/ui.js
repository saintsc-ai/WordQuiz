/*
 * ui.js — 조립 · 입력 처리 · 해시 라우팅
 *
 * 그리는 일은 ui-board.js, 시트 내용은 ui-score.js / ui-compose.js 가 맡는다.
 * 여기는 게임 하나를 들고 있으면서 그 셋을 이어 붙인다.
 */
(function (global) {
  'use strict';

  var Sheet = global.UISheet;
  var Board = global.UIBoard;
  var Share = global.UIShare;
  var Score = global.UIScore;
  var Compose = global.UICompose;
  var Hint = global.UIHint;

  var LENGTHS = global.Dict.LENGTHS;
  var MAX_TRIES = global.Game.MAX_TRIES;
  var DEFAULT_LENGTH = 6;
  var TITLE = '단어 퍼즐';
  var TITLE_SHARED = '공유받은 단어';

  // 물리 키보드(영문 자판 기준 두벌식 자리)
  var QWERTY = {
    q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
    a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
    z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ'
  };

  var submitBtn = document.getElementById('btn-submit');
  var hintBtn = document.getElementById('btn-hint');
  var timerEl = document.getElementById('timer');
  var lengths = document.getElementById('lengths');
  var titleEl = document.getElementById('title');

  var game = null;
  var locked = false;       // 뒤집기 애니메이션 동안 입력을 막는다
  var shared = false;       // 링크로 받은 문제를 푸는 중인가
  var sharedResult = false; // 결과 링크를 열어 결과를 보는 중인가
  var authored = false;     // 내가 직접 출제한 문제를 푸는 중인가

  /* 화면 갱신 ------------------------------------------------------------- */

  function buildLengths() {
    lengths.innerHTML = '';
    LENGTHS.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.len = String(n);
      b.textContent = n + '자모';
      lengths.appendChild(b);
    });
  }

  function markChips(n) {
    Array.prototype.forEach.call(lengths.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n));
    });
  }

  function paintTitle() {
    titleEl.textContent = shared ? TITLE_SHARED : TITLE;
  }

  /*
   * 시계. 첫 자모를 치기 전에는 0:00 에서 멈춰 있고 옅게 보인다.
   * 힌트를 봤으면 실제 시간 뒤에 얹힌 값을 따로 붙인다.
   */
  function paintTimer() {
    if (!game) { timerEl.textContent = '0:00'; return; }
    var extra = game.hintSecondsPenalty();
    timerEl.innerHTML = Share.formatTime(game.baseSeconds()) +
      (extra ? ' <span class="penalty">+' + Share.formatTime(extra) + '</span>' : '');
    timerEl.className = 'timer' + (game.started() ? '' : ' idle');
  }

  function paintHint() {
    hintBtn.disabled = !game || game.status !== 'play';
    hintBtn.textContent = game && game.hintsUsed ? '힌트 ' + game.hintsUsed : '힌트';
  }

  function paintSubmit() {
    if (game.status !== 'play') {
      submitBtn.textContent = '결과 보기';
      submitBtn.classList.add('ready');
      return;
    }
    var n = game.current.length;
    submitBtn.classList.toggle('ready', n === game.length);
    if (n === 0) {
      submitBtn.textContent = '글자를 입력하세요';
    } else if (n === game.length) {
      submitBtn.textContent = '확인';
    } else {
      submitBtn.textContent = n + ' / ' + game.length;
    }
  }

  function repaint() {
    Board.paint(game);
    paintSubmit();
    paintHint();
    paintTimer();
  }

  /* 이미 점수를 등록한 단어. 답을 아는 것이라 무작위로 다시 내지 않는다. */
  function alreadyScored(word) { return global.Store.isScored(word); }

  function showResult() {
    Score.showResult({
      game: game,
      sharedResult: sharedResult,
      authored: authored,
      scored: global.Store.isScored(game.answer),
      onAgain: newGame
    });
  }

  /* 입력 ------------------------------------------------------------------ */

  function onType(k) {
    if (locked) return;
    if (game && game.type(k)) repaint();
  }

  function onBack() {
    if (locked) return;
    if (game && game.back()) repaint();
  }

  /*
   * 사전 확인이 끝난 뒤의 제출. game.submit() 은 동기라, 여기 오기 전에
   * 그 자모열을 dict.check 로 물어봐 둬야 한다(onSubmit).
   */
  function applySubmit() {
    var rowIndex = game.rows.length;
    var res = game.submit();
    if (!res.ok) {
      if (res.reason === 'short') Sheet.toast('자모 ' + game.length + '개를 모두 채우세요');
      if (res.reason === 'unknown') Sheet.toast('사전에 없는 단어예요 (명사만 됩니다)');
      if (res.reason === 'repeat') Sheet.toast('이미 ' + res.at + '번째 줄에서 낸 단어예요');
      Board.shake();
      return;
    }

    locked = true;
    Board.reveal(game, rowIndex, function () {
      locked = false;
      Board.paintKeyboard(game);
      repaint();
      if (game.status !== 'play') showResult();
    });
  }

  function onSubmit() {
    if (locked || !game) return;
    if (game.status !== 'play') { showResult(); return; }

    // 덜 찼으면 사전을 물어볼 것도 없다. applySubmit 이 'short' 를 내보낸다.
    if (!game.isFull()) { applySubmit(); return; }
    // 이미 낸 단어도 물어볼 것이 없다 — 그때 이미 사전을 통과한 단어다.
    if (game.triedAt(game.current)) { applySubmit(); return; }

    /*
     * 사전은 서버에 있다(js/dict.js). 답이 올 때까지 입력을 막는다 — 안 그러면
     * 기다리는 사이에 자모를 더 쳐 넣고, 엉뚱한 줄이 올라간다.
     * 이미 물어본 단어면 왕복 없이 곧바로 이어진다.
     */
    var typed = game.current;
    locked = true;
    game.dict.check([typed]).then(function () {
      locked = false;
      if (!game || game.current !== typed) return;   // 기다리는 사이 판이 바뀌었다
      applySubmit();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (Sheet.isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); Sheet.close(); return; }
      Sheet.trap(e);
      return;   // 시트가 열려 있는 동안에는 보드 입력을 받지 않는다
    }
    if (!game) return;
    if (e.key === 'Backspace') { e.preventDefault(); onBack(); return; }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); return; }
    // 영문 자판이면 QWERTY 로 옮기고, 한글 자판이면 친 자모가 그대로 온다.
    // 어느 쪽이든 ㅐ ㅔ 처럼 한 키인 겹자모가 섞이므로 24키로 펴서 받는다.
    var keys = global.Jamo.keysFor(QWERTY[e.key.toLowerCase()] || e.key);
    if (keys) {
      e.preventDefault();
      for (var i = 0; i < keys.length; i++) onType(keys[i]);
    }
  });

  /* 게임 진행 ------------------------------------------------------------- */

  /*
   * 풀던 판을 버리고 다른 판으로 가려는 참인가.
   * 첫 자모를 친 뒤에만 센다. 판을 깔아 두기만 하고 ↻ 를 누른 것은 그만둔 게 아니다.
   * 시계가 가기 시작하는 시점과 같다(js/game.js 의 started).
   * 닉네임을 정해 둔 사람만 해당한다 — 이름이 없으면 남길 곳이 없다.
   */
  function quitting() {
    return game && game.status === 'play' && game.started() &&
      global.WordQuizScoreboard.nickname() &&
      Score.recordable({ sharedResult: sharedResult, authored: authored,
                         scored: global.Store.isScored(game.answer) });
  }

  /** 그만두겠다고 하면 실패로 남기고 go() 를 부른다. 아니면 아무 일도 없다. */
  function confirmQuit(go) {
    if (!quitting()) { go(); return; }
    var quit = game;   // 확인하는 사이에 판이 바뀔 수 있다
    Sheet.open(
      '<h2>그만둘까요?</h2>' +
      '<p class="hint">지금 그만두면 이 판은 <b>실패로 기록</b>돼요.<br>' +
        '남은 기회는 ' + (MAX_TRIES - quit.rows.length) + '번입니다.</p>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-quit">그만두기</button>' +
        '<button type="button" class="primary" id="act-keep">계속 풀기</button>' +
      '</div>'
    );
    document.getElementById('act-keep').addEventListener('click', Sheet.close);
    document.getElementById('act-quit').addEventListener('click', function () {
      Sheet.close();
      Score.record(quit, global.WordQuizScoreboard.nickname())
        .then(function () { Sheet.toast('실패로 기록했어요'); })
        .catch(function () { Sheet.toast('기록하지 못했어요'); });
      go();
    });
  }

  /** 같은 길이로 새 단어를 뽑는다. 공유받은 문제를 풀던 중이면 거기서 빠져나온다. */
  function newGame() {
    if (!game) return;
    game.reset();
    shared = false;
    sharedResult = false;
    authored = false;
    Share.clearHash();
    paintTitle();
    Board.build(game);
    Board.paintKeyboard(game);
    repaint();
  }

  /**
   * 길이 n 의 사전을 불러와 판을 시작한다.
   * word 를 주면 그 단어를 정답으로 고정한다(링크로 받은 문제).
   */
  function start(n, word, resultCode, authoredWord) {
    markChips(n);
    if (!word) global.Store.saveLength(n);
    submitBtn.textContent = '사전 불러오는 중…';
    return global.Dict.load(n).then(function (dict) {
      /*
       * reset(word) 와 restoreResult 는 사전을 동기로 본다. 링크로 받은 단어와
       * 결과 코드가 주장하는 줄들을 한 번에 물어봐 두고 시작한다.
       */
      var need = [];
      if (word) {
        var jamo = global.Jamo.decompose(word);
        if (jamo) need.push(jamo);
      }
      if (resultCode) need = need.concat(global.Game.resultJamo(resultCode));
      return dict.check(need).then(function () { return dict; });
    }).then(function (dict) {
      game = new global.Game(dict, alreadyScored);
      shared = false;
      sharedResult = false;
      authored = Boolean(authoredWord);
      if (word) {
        if (game.reset(word)) {
          shared = !authored;
        } else {
          Sheet.toast('링크의 단어를 열 수 없어 새 단어로 시작합니다');
          Share.clearHash();
        }
      }
      if (resultCode && game.restoreResult(resultCode)) sharedResult = true;
      paintTitle();
      Board.build(game);
      Board.paintKeyboard(game);
      repaint();
      // 판을 푸는 동안 순위를 미리 받아 둔다. ♛ 를 누를 때 기다리지 않게.
      global.WordQuizScoreboard.prefetch('daily', { mode: 'total' });
      if (sharedResult) setTimeout(showResult, 0);
    }).catch(function () {
      submitBtn.textContent = '사전을 불러오지 못했습니다';
    });
  }

  function playWord(word) {
    Share.replaceHash(Share.linkFor(word));
    start(global.Jamo.decompose(word).length, word, null, true);
  }

  /** 해시에 문제가 실려 있으면 그 판으로 시작한다. 아니면 저장된 길이로 새 판. */
  function startFromHash() {
    var resultCode = Share.resultCode();
    if (resultCode) {
      var resultWord = null;
      try {
        resultWord = JSON.parse(global.Game.decode(resultCode)).answer;
      } catch (e) { resultWord = null; }
      var resultJamo = resultWord && global.Jamo.decompose(resultWord);
      if (resultJamo && LENGTHS.indexOf(resultJamo.length) >= 0) {
        return start(resultJamo.length, resultWord, resultCode);
      }
      Sheet.toast('결과 링크가 올바르지 않아요');
      Share.clearHash();
    }
    var code = Share.puzzleCode();
    if (code) {
      var word = null;
      try { word = global.Game.decode(code); } catch (e) { word = null; }
      var jamo = word && global.Jamo.decompose(word);
      // 내가 낸 단어를 링크로 다시 여는 경우. 정답을 아니까 점수에 넣지 않는다.
      if (jamo && LENGTHS.indexOf(jamo.length) >= 0) {
        return start(jamo.length, word, null, global.Store.isAuthored(word));
      }
      Sheet.toast('링크가 올바르지 않아요');
      Share.clearHash();
    }
    var saved = global.Store.length();
    return start(LENGTHS.indexOf(saved) >= 0 ? saved : DEFAULT_LENGTH);
  }

  /* 배선 ------------------------------------------------------------------ */

  lengths.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-len]');
    if (!b || locked) return;
    var n = Number(b.dataset.len);
    confirmQuit(function () {
      Share.clearHash();
      start(n);
    });
  });

  submitBtn.addEventListener('click', onSubmit);

  hintBtn.addEventListener('click', function () {
    if (locked || !game || game.status !== 'play') return;
    Hint.show(game);
    // 힌트를 봤는지는 시트 안에서 정해진다. 닫힌 뒤 버튼 글씨와 시계를 다시 그린다.
    Sheet.onClose(repaint);
  });

  document.getElementById('btn-new').addEventListener('click', function () {
    if (game && !locked) confirmQuit(newGame);
  });
  // 직접 출제는 ⋯ 시트 안에 그대로 있다. 머리말 자리는 테마가 쓴다.
  var themeBtn = document.getElementById('btn-theme');

  function paintTheme(mode, resolved) {
    themeBtn.textContent = global.Theme.ICONS[mode];
    themeBtn.setAttribute('aria-label', '화면 테마: ' + global.Theme.LABELS[mode] +
      (mode === 'system' ? ' (지금 ' + global.Theme.LABELS[resolved] + ')' : '') + '. 눌러서 바꾸기');
  }

  // theme.js 는 이 파일보다 먼저 돌기 때문에 첫 그리기는 직접 한다.
  global.Theme.onChange(paintTheme);
  paintTheme(global.Theme.mode(), global.Theme.resolved());
  themeBtn.addEventListener('click', global.Theme.next);
  document.getElementById('btn-help').addEventListener('click', function () {
    Compose.showHelp({
      play: playWord,
      // 추천 단어를 지금 놀던 길이로 뽑기 위해 알려 준다.
      length: function () { return game ? game.length : null; },
      copyLink: function () { Share.copyThen(Share.linkFor(game.answer), '문제 링크를 복사했어요'); }
    });
  });
  document.getElementById('btn-scoreboard').addEventListener('click', function () {
    Score.showRanking('daily', 'total');
  });

  // 같은 탭에 링크를 붙여넣는 경우
  global.addEventListener('hashchange', function () {
    if (Share.puzzleCode() || Share.resultCode()) { Sheet.close(); startFromHash(); }
  });

  // 회전, 주소창 접힘, 데스크톱 창 크기 변경
  global.addEventListener('resize', Board.size);
  global.addEventListener('orientationchange', Board.size);

  // 판이 도는 동안에만 다시 그린다. 끝났거나 아직 안 쳤으면 값이 안 변한다.
  setInterval(function () {
    if (game && game.status === 'play' && game.started()) paintTimer();
  }, 500);

  buildLengths();
  Board.buildKeyboard({ type: onType, back: onBack });
  startFromHash();
})(window);
