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

  var LENGTHS = global.Dict.LENGTHS;
  var DEFAULT_LENGTH = 6;
  var TITLE = '단어 퍼즐';
  var TITLE_SHARED = '공유받은 단어';

  // 물리 키보드(영문 자판 기준 두벌식 자리)
  var QWERTY = {
    q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ',
    a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
    z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ'
  };

  var submitBtn = document.getElementById('btn-submit');
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
  }

  function showResult() {
    Score.showResult({
      game: game,
      sharedResult: sharedResult,
      authored: authored,
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

  function onSubmit() {
    if (locked || !game) return;
    if (game.status !== 'play') { showResult(); return; }

    var rowIndex = game.rows.length;
    var res = game.submit();
    if (!res.ok) {
      if (res.reason === 'short') Sheet.toast('자모 ' + game.length + '개를 모두 채우세요');
      if (res.reason === 'unknown') Sheet.toast('사전에 없는 단어예요');
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

  document.addEventListener('keydown', function (e) {
    if (Sheet.isOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); Sheet.close(); return; }
      Sheet.trap(e);
      return;   // 시트가 열려 있는 동안에는 보드 입력을 받지 않는다
    }
    if (!game) return;
    if (e.key === 'Backspace') { e.preventDefault(); onBack(); return; }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); return; }
    var k = QWERTY[e.key.toLowerCase()];
    if (!k && global.Jamo.KEYS[e.key]) k = e.key;   // 한글 자판으로 직접 친 경우
    if (k) { e.preventDefault(); onType(k); }
  });

  /* 게임 진행 ------------------------------------------------------------- */

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
      game = new global.Game(dict);
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
      if (jamo && LENGTHS.indexOf(jamo.length) >= 0) return start(jamo.length, word);
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
    Share.clearHash();
    start(Number(b.dataset.len));
  });

  submitBtn.addEventListener('click', onSubmit);

  document.getElementById('btn-new').addEventListener('click', function () {
    if (game && !locked) newGame();
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
      copyLink: function () { Share.copyThen(Share.linkFor(game.answer), '문제 링크를 복사했어요'); }
    });
  });
  document.getElementById('btn-scoreboard').addEventListener('click', function () {
    Score.showRanking('daily');
  });

  // 같은 탭에 링크를 붙여넣는 경우
  global.addEventListener('hashchange', function () {
    if (Share.puzzleCode() || Share.resultCode()) { Sheet.close(); startFromHash(); }
  });

  // 회전, 주소창 접힘, 데스크톱 창 크기 변경
  global.addEventListener('resize', Board.size);
  global.addEventListener('orientationchange', Board.size);

  buildLengths();
  Board.buildKeyboard({ type: onType, back: onBack });
  startFromHash();
})(window);
