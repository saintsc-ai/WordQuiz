/*
 * ui.js — 화면 렌더링과 입력 처리
 */
(function () {
  'use strict';

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

  var game = null;
  var locked = false;   // 뒤집기 애니메이션 동안 입력을 막는다
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
    board.style.setProperty('--cols', game.length);
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
      submitBtn.textContent = '새 게임 시작';
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
    if (game.status !== 'play') { newGame(); return; }

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
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1400);
  }

  function openSheet(html) {
    sheetBody.innerHTML = html;
    sheet.hidden = false;
  }

  function closeSheet() { sheet.hidden = true; }

  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });

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
      '<div class="sheet-actions">' +
        '<button type="button" id="act-share">결과 복사</button>' +
        '<button type="button" class="primary" id="act-again">한 판 더</button>' +
      '</div>'
    );

    document.getElementById('act-again').addEventListener('click', function () {
      closeSheet();
      newGame();
    });
    document.getElementById('act-share').addEventListener('click', function () {
      var text = game.shareText();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { toast('결과를 복사했어요'); });
      } else {
        toast('복사를 지원하지 않는 브라우저예요');
      }
    });
  }

  function showHelp() {
    openSheet(
      '<h2>규칙</h2>' +
      '<ol>' +
        '<li>자모 3 · 6 · 9개 중 하나를 골라 그 길이의 명사를 맞힙니다. 예: 안녕 → ㅇㅏㄴㄴㅕㅇ (6칸)</li>' +
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
      '<p style="font-size:12px;color:#8e8e93;text-align:center;margin-top:16px">' +
        '단어 출처: 국립국어원 한국어기초사전</p>'
    );
  }

  /* 게임 진행 */
  function newGame() {
    game.reset();
    buildBoard();
    paintKeyboard();
    paintBoard();
  }

  function setLength(n) {
    Array.prototype.forEach.call(lengths.children, function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.len) === n));
    });
    try { localStorage.setItem('wordquiz.length', String(n)); } catch (e) { /* 무시 */ }

    submitBtn.textContent = '사전 불러오는 중…';
    window.Dict.load(n).then(function (dict) {
      game = new window.Game(dict);
      buildBoard();
      paintKeyboard();
      paintBoard();
    }).catch(function () {
      submitBtn.textContent = '사전을 불러오지 못했습니다';
    });
  }

  lengths.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-len]');
    if (b) setLength(Number(b.dataset.len));
  });
  submitBtn.addEventListener('click', onSubmit);
  document.getElementById('btn-new').addEventListener('click', function () {
    if (game && !locked) newGame();
  });
  document.getElementById('btn-help').addEventListener('click', showHelp);

  buildKeyboard();
  var saved = 6;
  try { saved = Number(localStorage.getItem('wordquiz.length')) || 6; } catch (e) { /* 무시 */ }
  setLength([3, 6, 9].indexOf(saved) >= 0 ? saved : 6);
})();
