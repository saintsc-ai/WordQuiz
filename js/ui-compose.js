/*
 * ui-compose.js — 직접 출제 시트와 규칙 시트
 */
(function (global) {
  'use strict';

  var Sheet = global.UISheet;
  var Share = global.UIShare;
  var LENGTHS = global.Dict.LENGTHS;
  var MAX_TRIES = global.Game.MAX_TRIES;
  var RANGE = LENGTHS[0] + ' ~ ' + LENGTHS[LENGTHS.length - 1];

  /**
   * 낼 단어를 고르는 시트. onPlay(word) 를 주면 '바로 풀기'가 그 단어로 시작한다.
   */
  function showCompose(onPlay, currentLength) {
    Sheet.open(
      '<h2>직접 출제</h2>' +
      '<p class="hint">사전에 있는 명사를 넣으면 그 단어로 푸는 링크를 만듭니다.<br>' +
        '자모 ' + RANGE + '칸짜리만 낼 수 있어요.</p>' +
      '<input class="compose-input" id="cw" type="text" placeholder="예: 사랑" aria-label="낼 단어"' +
        ' autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12">' +
      '<p class="compose-status" id="cs" role="status">한글 명사를 입력하세요</p>' +
      '<div class="senses" id="compose-senses"></div>' +
      '<input class="compose-link" id="cl" type="text" aria-label="출제 링크" readonly hidden>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-suggest">추천 단어</button>' +
        '<button type="button" id="act-play" disabled>바로 풀기</button>' +
        '<button type="button" class="primary" id="act-copy" disabled>링크 복사</button>' +
      '</div>',
      { focus: '#cw' }
    );

    var input = document.getElementById('cw');
    var status = document.getElementById('cs');
    var linkBox = document.getElementById('cl');
    var playBtn = document.getElementById('act-play');
    var copyBtn = document.getElementById('act-copy');
    var senses = document.getElementById('compose-senses');
    var suggestBtn = document.getElementById('act-suggest');
    var word = null;   // 지금 유효한 단어
    var seq = 0;       // 사전 로딩이 늦게 끝난 결과가 최신 입력을 덮지 않게

    function setState(msg, cls, ok) {
      status.textContent = msg;
      status.className = 'compose-status' + (cls ? ' ' + cls : '');
      word = ok || null;
      playBtn.disabled = copyBtn.disabled = !word;
      if (word) {
        linkBox.value = Share.linkFor(word);
        linkBox.hidden = false;
      } else {
        linkBox.hidden = true;
      }
      // 뜻풀이는 낼 수 있는 단어일 때만 보여 준다. 동음이의어를 헷갈리지 않고
      // 의도한 단어가 맞는지 여기서 확인할 수 있다.
      if (senses) {
        senses.textContent = '';
        if (word && global.Define) {
          var mine = seq;
          global.Define.of(word).then(function (list) {
            if (mine === seq) global.Define.render(senses, list);
          });
        }
      }
    }

    function check() {
      var w = input.value.trim();
      var my = ++seq;
      if (!w) { setState('한글 명사를 입력하세요', ''); return; }
      if (!/^[가-힣]+$/.test(w)) { setState('완성된 한글 단어만 됩니다', 'bad'); return; }
      var jamo = global.Jamo.decompose(w);
      if (!jamo) { setState('ㅙ · ㅞ 가 들어간 단어는 낼 수 없어요', 'bad'); return; }
      if (LENGTHS.indexOf(jamo.length) < 0) {
        setState('자모 ' + jamo.length + '칸 — ' + RANGE + '칸만 됩니다', 'bad');
        return;
      }
      setState('확인하는 중…', '');
      global.Dict.load(jamo.length).then(function (dict) {
        if (my !== seq) return;
        if (dict.valid.has(jamo)) setState('자모 ' + jamo.length + '칸 · 낼 수 있어요', 'good', w);
        else setState('사전에 없는 명사예요', 'bad');
      }).catch(function () {
        if (my === seq) setState('사전을 불러오지 못했습니다', 'bad');
      });
    }

    /*
     * 추천 단어. 정답 후보에서 뽑으므로 받은 사람이 풀 수 있다.
     * 지금 놀던 길이로 뽑는다 — 6칸을 풀다 출제하러 왔으면 6칸이 자연스럽다.
     */
    suggestBtn.addEventListener('click', function () {
      if (!global.Define) return;
      var n = currentLength || LENGTHS[0];
      suggestBtn.disabled = true;
      setState('추천 단어를 고르는 중…', '');
      global.Define.suggest(n).then(function (got) {
        suggestBtn.disabled = false;
        if (!got) { setState('추천 단어를 가져오지 못했어요', 'bad'); return; }
        input.value = got.word;
        check();
      });
    });

    input.addEventListener('input', check);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && word) copyBtn.click();
    });

    copyBtn.addEventListener('click', function () {
      if (!word) return;
      // 이 링크로 내가 다시 들어와도 출제한 문제로 알아보게 남겨 둔다.
      global.Store.rememberAuthored(word);
      Share.copyThen(Share.linkFor(word), '출제 링크를 복사했어요');
    });

    playBtn.addEventListener('click', function () {
      if (!word) return;
      var w = word;
      global.Store.rememberAuthored(w);
      Sheet.close();
      onPlay(w);
    });
  }

  function showHelp(onCompose) {
    Sheet.open(
      '<h2>규칙</h2>' +
      '<ol>' +
        '<li>자모 ' + RANGE + '개 중 하나를 골라 그 길이의 명사를 맞힙니다. 예: 사랑 → ㅅㅏㄹㅏㅇ (5칸)</li>' +
        '<li>기회는 ' + MAX_TRIES + '번. 추측하는 단어도 사전에 있는 명사여야 합니다.</li>' +
        '<li>쌍자음 · 겹받침 · 복합모음은 기본 자모를 이어서 칩니다. ㄲ=ㄱㄱ, ㄺ=ㄹㄱ, ㅐ=ㅏㅣ, ㅘ=ㅗㅏ</li>' +
        '<li>ㅙ · ㅞ 가 들어간 단어는 나오지 않습니다.</li>' +
        '<li>단어는 판마다 새로 뽑습니다. 몇 번이든 다시 풀 수 있지만, ' +
          '점수는 한 단어당 한 번만 등록됩니다.</li>' +
      '</ol>' +
      '<div class="legend">' +
        '<span style="background:var(--ok)">ㅇ</span>' +
        '<span style="background:var(--warn)">ㅏ</span>' +
        '<span style="background:var(--absent)">ㅋ</span>' +
      '</div>' +
      '<p style="text-align:center;font-size:13px">자리까지 맞음 · 들어있지만 다른 자리 · 없음</p>' +
      '<h3 class="setting-title">화면 테마</h3>' +
      '<div class="theme-tabs" role="group" aria-label="화면 테마">' +
        global.Theme.MODES.map(function (m) {
          return '<button type="button" data-theme-mode="' + m + '"' +
            ' aria-pressed="' + (global.Theme.mode() === m) + '">' +
            global.Theme.LABELS[m] + '</button>';
        }).join('') +
      '</div>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-compose2">직접 출제</button>' +
        '<button type="button" class="primary" id="act-link2">지금 단어 링크 복사</button>' +
      '</div>' +
      '<p class="source-note">' +
        '단어 출처: 국립국어원 한국어기초사전 · 표준국어대사전</p>'
    );
    document.getElementById('act-link2').addEventListener('click', onCompose.copyLink);
    document.getElementById('act-compose2').addEventListener('click', function () {
      showCompose(onCompose.play, onCompose.length && onCompose.length());
    });

    var themeTabs = Sheet.body().querySelectorAll('[data-theme-mode]');
    Array.prototype.forEach.call(themeTabs, function (btn) {
      btn.addEventListener('click', function () {
        global.Theme.set(btn.dataset.themeMode);
        Array.prototype.forEach.call(themeTabs, function (other) {
          other.setAttribute('aria-pressed', String(other === btn));
        });
      });
    });
  }

  global.UICompose = { show: showCompose, showHelp: showHelp };
})(window);
