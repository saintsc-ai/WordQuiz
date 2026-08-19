/*
 * ui.js — 화면 렌더링과 입력 처리
 */
(function () {
  'use strict';

  var LENGTHS = [5, 6, 7, 8, 9];
  var TITLE = '오늘의 단어';
  var TITLE_SHARED = '공유받은 단어';

  // 참고 이미지와 같은 배열. 두벌식에서 쌍자음과 복합모음 키를 뺀 24키.
  var ROWS = [
    ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', '⌫'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']
  ];

  // 물리 키보드(영문 자판 기준 두벌식 자리)
  var QWERTY = {
    q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ',
    a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
    z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ'
  };

  var REVEAL_STEP = 220; // 타일 한 칸이 뒤집히는 간격(ms)

  var board = document.getElementById('board');
  var keyboard = document.getElementById('keyboard');
  var submitBtn = document.getElementById('btn-submit');
  var toastEl = document.getElementById('toast');
  var sheet = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheet-body');
  var lengths = document.getElementById('lengths');
  var titleEl = document.getElementById('title');

  var game = null;
  var locked = false;   // 뒤집기 애니메이션 동안 입력을 막는다
  var shared = false;   // 링크로 받은 문제를 푸는 중인가
  var keyEls = {};
  var toastTimer = null;

  /* 자판 */
  function buildKeyboard() {
    keyboard.innerHTML = '';
    keyEls = {};
    ROWS.forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'krow';
      row.forEach(function (k) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'key';
        btn.textContent = k;
        btn.addEventListener('click', function () {
          if (k === '⌫') { onBack(); } else { onType(k); }
        });
        div.appendChild(btn);
        if (k !== '⌫') keyEls[k] = btn;
      });
      keyboard.appendChild(div);
    });
  }

  function paintKeyboard() {
    Object.keys(keyEls).forEach(function (k) {
      keyEls[k].className = 'key' + (game.keyState[k] ? ' ' + game.keyState[k] : '');
    });
  }

  /* 보드 */
  function buildBoard() {
    board.style.setProperty('--cols', String(game.length));
    board.style.gridTemplateColumns = 'repeat(' + game.length + ', var(--tile))';
    sizeBoard();
    board.innerHTML = '';
    for (var r = 0; r < window.Game.MAX_TRIES; r++) {
      for (var c = 0; c < game.length; c++) {
        var t = document.createElement('div');
        t.className = 'tile';
        board.appendChild(t);
      }
    }
  }

  function tileAt(r, c) {
    return board.children[r * game.length + c];
  }

  /*
   * 타일 크기는 가로만으로 정할 수 없다. 세로가 모자라면 보드가 배정된 높이를
   * 넘겨 버리는데, .board-wrap 이 가운데 정렬이라 넘친 만큼 위아래로 삐져나와
   * 길이 선택 칩과 자판을 덮는다. 남은 폭과 높이를 실제로 재서 둘 중 작은 쪽에 맞춘다.
   */
  var TILE_MAX = 62;
  var TILE_MIN = 24;
  var GAP = 8;

  function sizeBoard() {
    if (!game) return;
    var wrap = board.parentNode;
    var cs = getComputedStyle(wrap);
    var w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var h = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var rows = window.Game.MAX_TRIES;
    var byWidth = (w - (game.length - 1) * GAP) / game.length;
    var byHeight = (h - (rows - 1) * GAP) / rows;
    var tile = Math.min(TILE_MAX, byWidth, byHeight);
    board.style.setProperty('--tile', Math.max(TILE_MIN, tile).toFixed(2) + 'px');
  }

  // 확정된 행과 입력 중인 행을 다시 그린다.
  function paintBoard() {
    for (var r = 0; r < window.Game.MAX_TRIES; r++) {
      var row = game.rows[r];
      for (var c = 0; c < game.length; c++) {
        var t = tileAt(r, c);
        if (row) {
          t.textContent = row.jamo[c];
          t.className = 'tile ' + row.marks[c];
        } else if (r === game.rows.length) {
          var ch = game.current[c];
          t.textContent = ch || '';
          t.className = 'tile' + (ch ? ' filled' : '');
        } else {
          t.textContent = '';
          t.className = 'tile';
        }
      }
    }
    paintSubmit();
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

  /* 입력 */
  function onType(k) {
    if (locked) return;
    if (game.type(k)) paintBoard();
  }

  function onBack() {
    if (locked) return;
    if (game.back()) paintBoard();
  }

  function onSubmit() {
    if (locked) return;
    if (game.status !== 'play') { showResult(); return; }

    var rowIndex = game.rows.length;
    var res = game.submit();
    if (!res.ok) {
      if (res.reason === 'short') toast('자모 ' + game.length + '개를 모두 채우세요');
      if (res.reason === 'unknown') toast('사전에 없는 단어예요');
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
      return;
    }

    // 왼쪽부터 한 칸씩 뒤집으며 색을 입힌다.
    locked = true;
    var row = game.rows[rowIndex];
    for (var c = 0; c < game.length; c++) {
      (function (c) {
        var t = tileAt(rowIndex, c);
        t.style.animationDelay = (c * REVEAL_STEP) + 'ms';
        t.classList.add('reveal');
        setTimeout(function () {
          t.className = 'tile ' + row.marks[c] + ' reveal';
        }, c * REVEAL_STEP + REVEAL_STEP);
      })(c);
    }
    setTimeout(function () {
      locked = false;
      paintKeyboard();
      paintBoard();
      if (game.status !== 'play') showResult();
    }, game.length * REVEAL_STEP + 320);
  }

  document.addEventListener('keydown', function (e) {
    if (!game || !sheet.hidden) return;
    if (e.key === 'Backspace') { e.preventDefault(); onBack(); return; }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit(); return; }
    var k = QWERTY[e.key.toLowerCase()];
    if (!k && window.Jamo.KEYS[e.key]) k = e.key;   // 한글 자판으로 직접 친 경우
    if (k) { e.preventDefault(); onType(k); }
  });

  /* 안내 */
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  function openSheet(html) {
    sheetBody.innerHTML = html;
    sheet.hidden = false;
  }

  function closeSheet() { sheet.hidden = true; }

  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });

  /* 공유 ------------------------------------------------------------------ */

  /** 단어 하나를 그대로 낼 수 있는 링크. 정답은 해시에 인코딩해 숨긴다. */
  function linkFor(word) {
    return location.href.replace(/#.*$/, '') + '#p=' + window.Game.encode(word);
  }

  function puzzleLink() { return linkFor(game.answer); }

  function hashCode() {
    var m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
    return m ? m[1] : null;
  }

  function clearHash() {
    if (!location.hash) return;
    // file:// 에서는 replaceState 가 막힐 수 있다.
    try {
      history.replaceState(null, '', location.href.replace(/#.*$/, ''));
    } catch (e) {
      location.hash = '';
    }
  }

  /** clipboard API 는 https / localhost 에서만 쓸 수 있어 대체 경로를 둔다. */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { resolve(); } else { reject(new Error('copy failed')); }
    });
  }

  function copyThen(text, msg) {
    copy(text).then(function () {
      toast(msg);
    }).catch(function () {
      toast('복사하지 못했어요');
    });
  }

  /* 결과 ------------------------------------------------------------------ */

  var ICON = { ok: '🟩', warn: '🟨', off: '⬜' };

  function showResult() {
    var won = game.status === 'win';
    var grid = game.rows.map(function (r) {
      return r.marks.map(function (m) { return ICON[m]; }).join('');
    }).join('<br>');

    openSheet(
      '<h2>' + (won ? '정답입니다 🎉' : '아쉬워요') + '</h2>' +
      '<div class="answer">' + game.answer + '</div>' +
      '<p style="text-align:center">' +
        (won ? game.rows.length + '번 만에 맞혔어요' : '5번 안에 못 맞혔어요') +
      '</p>' +
      '<div class="grid">' + grid + '</div>' +
      '<p class="hint">링크를 보내면 친구도 <b>같은 단어</b>를 풀 수 있어요.<br>' +
        '링크에 정답이 드러나지는 않습니다.</p>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-link">링크 복사</button>' +
        '<button type="button" id="act-share">결과 공유</button>' +
        '<button type="button" class="primary" id="act-again">한 판 더</button>' +
      '</div>'
    );

    document.getElementById('act-again').addEventListener('click', function () {
      closeSheet();
      newGame();
    });

    document.getElementById('act-link').addEventListener('click', function () {
      copyThen(puzzleLink(), '문제 링크를 복사했어요');
    });

    document.getElementById('act-share').addEventListener('click', function () {
      var text = game.shareText() + '\n' + puzzleLink();
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () { /* 사용자가 취소한 것 */ });
      } else {
        copyThen(text, '결과와 링크를 복사했어요');
      }
    });
  }

  /* 직접 출제 ------------------------------------------------------------ */

  function showCompose() {
    openSheet(
      '<h2>직접 출제</h2>' +
      '<p class="hint">사전에 있는 명사를 넣으면 그 단어로 푸는 링크를 만듭니다.<br>' +
        '자모 5 ~ 9칸짜리만 낼 수 있어요.</p>' +
      '<input class="compose-input" id="cw" type="text" placeholder="예: 안녕"' +
        ' autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12">' +
      '<p class="compose-status" id="cs">한글 명사를 입력하세요</p>' +
      '<input class="compose-link" id="cl" type="text" readonly hidden>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-play" disabled>바로 풀기</button>' +
        '<button type="button" class="primary" id="act-copy" disabled>링크 복사</button>' +
      '</div>'
    );

    var input = document.getElementById('cw');
    var status = document.getElementById('cs');
    var linkBox = document.getElementById('cl');
    var playBtn = document.getElementById('act-play');
    var copyBtn = document.getElementById('act-copy');
    var word = null;   // 지금 유효한 단어
    var seq = 0;       // 사전 로딩이 늦게 끝난 결과가 최신 입력을 덮지 않게

    function setState(msg, cls, ok) {
      status.textContent = msg;
      status.className = 'compose-status' + (cls ? ' ' + cls : '');
      word = ok || null;
      playBtn.disabled = copyBtn.disabled = !word;
      if (word) {
        linkBox.value = linkFor(word);
        linkBox.hidden = false;
      } else {
        linkBox.hidden = true;
      }
    }

    function check() {
      var w = input.value.trim();
      var my = ++seq;
      if (!w) { setState('한글 명사를 입력하세요', ''); return; }
      if (!/^[가-힣]+$/.test(w)) { setState('완성된 한글 단어만 됩니다', 'bad'); return; }
      var jamo = window.Jamo.decompose(w);
      if (!jamo) { setState('ㅙ · ㅞ 가 들어간 단어는 낼 수 없어요', 'bad'); return; }
      if (LENGTHS.indexOf(jamo.length) < 0) {
        setState('자모 ' + jamo.length + '칸 — 5 ~ 9칸만 됩니다', 'bad');
        return;
      }
      setState('확인하는 중…', '');
      window.Dict.load(jamo.length).then(function (dict) {
        if (my !== seq) return;
        if (dict.valid.has(jamo)) setState('자모 ' + jamo.length + '칸 · 낼 수 있어요', 'good', w);
        else setState('사전에 없는 명사예요', 'bad');
      }).catch(function () {
        if (my === seq) setState('사전을 불러오지 못했습니다', 'bad');
      });
    }

    input.addEventListener('input', check);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && word) copyBtn.click();
    });
    input.focus();

    copyBtn.addEventListener('click', function () {
      if (word) copyThen(linkFor(word), '출제 링크를 복사했어요');
    });

    playBtn.addEventListener('click', function () {
      if (!word) return;
      var w = word;
      closeSheet();
      try { history.replaceState(null, '', linkFor(w)); } catch (e) { /* file:// */ }
      start(window.Jamo.decompose(w).length, w);
    });
  }

  function showHelp() {
    openSheet(
      '<h2>규칙</h2>' +
      '<ol>' +
        '<li>자모 5 ~ 9개 중 하나를 골라 그 길이의 명사를 맞힙니다. 예: 안녕 → ㅇㅏㄴㄴㅕㅇ (6칸)</li>' +
        '<li>기회는 5번. 추측하는 단어도 사전에 있는 명사여야 합니다.</li>' +
        '<li>쌍자음 · 겹받침 · 복합모음은 기본 자모를 이어서 칩니다. ㄲ=ㄱㄱ, ㄺ=ㄹㄱ, ㅐ=ㅏㅣ, ㅘ=ㅗㅏ</li>' +
        '<li>ㅙ · ㅞ 가 들어간 단어는 나오지 않습니다.</li>' +
      '</ol>' +
      '<div class="legend">' +
        '<span style="background:var(--ok)">ㅇ</span>' +
        '<span style="background:var(--warn)">ㅏ</span>' +
        '<span style="background:var(--absent)">ㅋ</span>' +
      '</div>' +
      '<p style="text-align:center;font-size:13px">자리까지 맞음 · 들어있지만 다른 자리 · 없음</p>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-compose2">직접 출제</button>' +
        '<button type="button" class="primary" id="act-link2">지금 단어 링크 복사</button>' +
      '</div>' +
      '<p style="font-size:12px;color:#8e8e93;text-align:center;margin-top:16px">' +
        '단어 출처: 국립국어원 한국어기초사전</p>'
    );
    document.getElementById('act-link2').addEventListener('click', function () {
      copyThen(puzzleLink(), '문제 링크를 복사했어요');
    });
    document.getElementById('act-compose2').addEventListener('click', showCompose);
  }

  /* 게임 진행 ------------------------------------------------------------- */

  function paintTitle() {
    titleEl.textContent = shared ? TITLE_SHARED : TITLE;
  }

  function markChips(n) {
    Array.prototype.forEach.call(lengths.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n));
    });
  }

  /** 같은 길이로 새 단어를 뽑는다. 공유받은 문제를 풀던 중이면 거기서 빠져나온다. */
  function newGame() {
    if (!game) return;
    game.reset();
    shared = false;
    clearHash();
    paintTitle();
    buildBoard();
    paintKeyboard();
    paintBoard();
  }

  /**
   * 길이 n 의 사전을 불러와 판을 시작한다.
   * word 를 주면 그 단어를 정답으로 고정한다(링크로 받은 문제).
   */
  function start(n, word) {
    markChips(n);
    if (!word) {
      try { localStorage.setItem('wordquiz.length', String(n)); } catch (e) { /* 무시 */ }
    }
    submitBtn.textContent = '사전 불러오는 중…';
    return window.Dict.load(n).then(function (dict) {
      game = new window.Game(dict);
      shared = false;
      if (word) {
        if (game.reset(word)) {
          shared = true;
        } else {
          toast('링크의 단어를 열 수 없어 새 단어로 시작합니다');
          clearHash();
        }
      }
      paintTitle();
      buildBoard();
      paintKeyboard();
      paintBoard();
    }).catch(function () {
      submitBtn.textContent = '사전을 불러오지 못했습니다';
    });
  }

  /** 해시에 문제가 실려 있으면 그 판으로 시작한다. 아니면 저장된 길이로 새 판. */
  function startFromHash() {
    var code = hashCode();
    if (code) {
      var word = null;
      try { word = window.Game.decode(code); } catch (e) { word = null; }
      var jamo = word && window.Jamo.decompose(word);
      if (jamo && LENGTHS.indexOf(jamo.length) >= 0) return start(jamo.length, word);
      toast('링크가 올바르지 않아요');
      clearHash();
    }
    var saved = 6;
    try { saved = Number(localStorage.getItem('wordquiz.length')) || 6; } catch (e) { /* 무시 */ }
    return start(LENGTHS.indexOf(saved) >= 0 ? saved : 6);
  }

  lengths.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-len]');
    if (!b || locked) return;
    clearHash();
    start(Number(b.dataset.len));
  });

  submitBtn.addEventListener('click', onSubmit);
  document.getElementById('btn-new').addEventListener('click', function () {
    if (game && !locked) newGame();
  });
  document.getElementById('btn-compose').addEventListener('click', showCompose);
  document.getElementById('btn-help').addEventListener('click', showHelp);

  // 같은 탭에 링크를 붙여넣는 경우
  window.addEventListener('hashchange', function () {
    if (hashCode()) { closeSheet(); startFromHash(); }
  });

  // 회전, 주소창 접힘, 데스크톱 창 크기 변경
  window.addEventListener('resize', sizeBoard);
  window.addEventListener('orientationchange', sizeBoard);

  buildKeyboard();
  startFromHash();
})();
