/*
 * ui-board.js — 보드와 자판 렌더링
 *
 * 화면에 그리는 일만 한다. 게임 상태는 바꾸지 않고 받아서 읽기만 한다.
 */
(function (global) {
  'use strict';

  var MAX_TRIES = global.Game.MAX_TRIES;

  // 참고 이미지와 같은 배열. 두벌식에서 쌍자음과 복합모음 키를 뺀 24키.
  var ROWS = [
    ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', '⌫'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']
  ];

  var REVEAL_STEP = 220;   // 타일 한 칸이 뒤집히는 간격(ms)
  var TILE_MAX = 62;
  var TILE_MIN = 24;
  var GAP = 8;

  // 스크린리더가 읽을 채점 결과. 색만으로는 전달되지 않는다.
  var MARK_LABEL = { ok: '자리까지 맞음', warn: '다른 자리에 있음', off: '없음' };

  var board = document.getElementById('board');
  var keyboard = document.getElementById('keyboard');
  var keyEls = {};
  var current = null;   // 지금 그려져 있는 game

  function buildKeyboard(handlers) {
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
        btn.setAttribute('aria-label', k === '⌫' ? '지우기' : '자모 ' + k);
        btn.addEventListener('click', function () {
          if (k === '⌫') { handlers.back(); } else { handlers.type(k); }
        });
        div.appendChild(btn);
        if (k !== '⌫') keyEls[k] = btn;
      });
      keyboard.appendChild(div);
    });
  }

  function paintKeyboard(game) {
    Object.keys(keyEls).forEach(function (k) {
      var state = game.keyState[k];
      keyEls[k].className = 'key' + (state ? ' ' + state : '');
      keyEls[k].setAttribute('aria-label', '자모 ' + k + (state ? ', ' + MARK_LABEL[state] : ''));
    });
  }

  function build(game) {
    current = game;
    board.style.setProperty('--cols', String(game.length));
    board.style.gridTemplateColumns = 'repeat(' + game.length + ', var(--tile))';
    size();
    board.innerHTML = '';
    for (var r = 0; r < MAX_TRIES; r++) {
      for (var c = 0; c < game.length; c++) {
        var t = document.createElement('div');
        t.className = 'tile';
        board.appendChild(t);
      }
    }
  }

  function tileAt(game, r, c) { return board.children[r * game.length + c]; }

  /*
   * 타일 크기는 가로만으로 정할 수 없다. 세로가 모자라면 보드가 배정된 높이를
   * 넘겨 버리는데, .board-wrap 이 가운데 정렬이라 넘친 만큼 위아래로 삐져나와
   * 길이 선택 칩과 자판을 덮는다. 남은 폭과 높이를 실제로 재서 둘 중 작은 쪽에 맞춘다.
   */
  function size() {
    if (!current) return;
    var wrap = board.parentNode;
    var cs = getComputedStyle(wrap);
    var w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var h = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var byWidth = (w - (current.length - 1) * GAP) / current.length;
    var byHeight = (h - (MAX_TRIES - 1) * GAP) / MAX_TRIES;
    var tile = Math.min(TILE_MAX, byWidth, byHeight);
    board.style.setProperty('--tile', Math.max(TILE_MIN, tile).toFixed(2) + 'px');
  }

  // 확정된 행과 입력 중인 행을 다시 그린다.
  function paint(game) {
    current = game;
    for (var r = 0; r < MAX_TRIES; r++) {
      var row = game.rows[r];
      for (var c = 0; c < game.length; c++) {
        var t = tileAt(game, r, c);
        if (row) {
          t.textContent = row.jamo[c];
          t.className = 'tile ' + row.marks[c];
          t.setAttribute('aria-label', (r + 1) + '번째 줄 ' + (c + 1) + '칸, ' +
            row.jamo[c] + ', ' + MARK_LABEL[row.marks[c]]);
        } else if (r === game.rows.length) {
          var ch = game.current[c];
          t.textContent = ch || '';
          t.className = 'tile' + (ch ? ' filled' : '');
          t.setAttribute('aria-label', (r + 1) + '번째 줄 ' + (c + 1) + '칸, ' + (ch || '빈 칸'));
        } else {
          t.textContent = '';
          t.className = 'tile';
          t.setAttribute('aria-label', (r + 1) + '번째 줄 ' + (c + 1) + '칸, 빈 칸');
        }
      }
    }
  }

  /** 왼쪽부터 한 칸씩 뒤집으며 색을 입힌다. 다 끝나면 done 을 부른다. */
  function reveal(game, rowIndex, done) {
    var row = game.rows[rowIndex];
    for (var c = 0; c < game.length; c++) {
      (function (c) {
        var t = tileAt(game, rowIndex, c);
        t.style.animationDelay = (c * REVEAL_STEP) + 'ms';
        t.classList.add('reveal');
        setTimeout(function () {
          t.className = 'tile ' + row.marks[c] + ' reveal';
        }, c * REVEAL_STEP + REVEAL_STEP);
      })(c);
    }
    setTimeout(done, game.length * REVEAL_STEP + 320);
  }

  function shake() {
    board.classList.remove('shake');
    void board.offsetWidth;
    board.classList.add('shake');
  }

  global.UIBoard = {
    buildKeyboard: buildKeyboard,
    paintKeyboard: paintKeyboard,
    build: build,
    paint: paint,
    reveal: reveal,
    shake: shake,
    size: size
  };
})(window);
