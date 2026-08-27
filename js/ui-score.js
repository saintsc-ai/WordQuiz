/*
 * ui-score.js — 결과 시트와 순위 시트
 *
 * 이 게임은 한 판씩 무작위 단어를 내주고 몇 번이든 다시 풀 수 있다.
 * 그래서 순위는 '같은 문제를 누가 잘 풀었나'가 아니라
 * '오늘 얼마나 많이·잘 풀었나'를 세운다. 오늘도 누적도 사람별 합계다.
 * 다만 한 단어는 한 번만 센다. 두 번째부터는 답을 아는 채로 푸는 것이다.
 */
(function (global) {
  'use strict';

  var Sheet = global.UISheet;
  var Share = global.UIShare;
  var MAX_TRIES = global.Game.MAX_TRIES;
  var PAGE_SIZE = 10;

  var ICON = { ok: '🟩', warn: '🟨', off: '⬜' };

  /* 순위 ------------------------------------------------------------------ */

  /*
   * 순위는 두 축이다. 기간(오늘 / 전체) 과 방식(누적 점수 / 타임어택 / 점수어택).
   * 방식마다 무엇을 크게 보여 줄지가 달라 primary / detail 을 따로 만든다.
   */
  var PERIODS = [
    { key: 'daily', label: '오늘 순위' },
    { key: 'overall', label: '전체 순위' }
  ];

  var MODES = [
    { key: 'total', label: '누적 점수', caption: '총점 · 승리 / 판수 · 이긴 판 평균' },
    { key: 'time', label: '타임어택', caption: '가장 빨리 푼 한 판' },
    { key: 'score', label: '점수어택', caption: '한 판 최고 점수' }
  ];

  function modeOf(key) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].key === key) return MODES[i];
    return MODES[0];
  }

  function num(value, suffix) {
    var n = Number(value);
    return isFinite(n) ? n + suffix : '-';
  }

  function jamo(row) {
    var n = Number(row.jamoLength);
    return isFinite(n) ? n + '자모' : '';
  }

  /*
   * 누적 순위에만 두 번째 줄이 붙는다. 승률·평균 시도·평균 시간은
   * '이긴 판'만 센 값이라 승률과 나란히 놓아야 뜻이 통한다.
   * 타임어택·점수어택은 판 하나의 기록이라 평균이 성립하지 않는다.
   */
  function totalSub(row) {
    var bits = [];
    if (isFinite(Number(row.winRate))) bits.push(Number(row.winRate) + '%');
    if (row.avgAttempts !== null && isFinite(Number(row.avgAttempts))) {
      bits.push('평균 ' + Number(row.avgAttempts).toFixed(1) + '회');
    }
    if (row.avgSeconds !== null && isFinite(Number(row.avgSeconds))) {
      bits.push(Share.formatTime(row.avgSeconds));
    }
    return bits.join(' · ');
  }

  function rankingRow(row, index, mode) {
    var primary, detail, sub = '';
    if (mode === 'time') {
      primary = Share.formatTime(row.elapsedSeconds);
      detail = [jamo(row), num(row.score, '점')].filter(Boolean).join(' · ');
    } else if (mode === 'score') {
      primary = num(row.score, '점');
      detail = [jamo(row), Share.formatTime(row.elapsedSeconds)].filter(Boolean).join(' · ');
    } else if (row.games === undefined && row.elapsedSeconds !== undefined) {
      // 스코어보드 배포가 오래돼 합산 이전 형태가 온 경우. 판 하나의 기록으로 읽는다.
      primary = num(row.score, '점');
      detail = Share.formatTime(row.elapsedSeconds);
    } else {
      primary = num(row.score, '점');
      detail = num(row.wins, '승') + ' / ' + num(row.games, '판');
      sub = totalSub(row);
    }
    return '<div class="ranking-row' + (sub ? ' has-sub' : '') + '">' +
      '<span class="rank-number">' + (index + 1) + '</span>' +
      '<b>' + Share.escapeHtml(row.nickname) + '</b>' +
      '<span class="rank-score">' + primary + '</span>' +
      '<span class="rank-time">' + detail + '</span>' +
      (sub ? '<span class="rank-sub">' + sub + '</span>' : '') +
    '</div>';
  }

  function tabs(items, current, group, label) {
    return '<div class="' + group + '" role="group" aria-label="' + label + '">' +
      items.map(function (item) {
        return '<button type="button" data-' + group + '="' + item.key + '"' +
          (item.key === current ? ' class="selected"' : '') +
          ' aria-pressed="' + (item.key === current) + '">' + item.label + '</button>';
      }).join('') +
    '</div>';
  }

  function rankHeader(period, mode) {
    return '<h2>스코어보드</h2>' +
      tabs(PERIODS, period, 'rank-tabs', '기간') +
      tabs(MODES, mode, 'rank-modes', '순위 방식') +
      '<p class="rank-caption">' + modeOf(mode).caption + '</p>';
  }

  // 기록이 없으면 안내문만 내보낸다. 호출부는 이 때 목록 엘리먼트를 찾으면 안 된다.
  function rankingShell(count, mode) {
    if (count) {
      return '<div class="ranking-scroll" id="ranking-scroll">' +
        '<div class="ranking-list" id="ranking-list"></div>' +
        '<p class="ranking-loading" id="ranking-loading">더 불러오는 중…</p>' +
      '</div>';
    }
    // 타임어택 · 점수어택은 이긴 판만 센다. 왜 비었는지 알려 준다.
    return '<p class="empty-rank">' +
      (mode === 'total' ? '아직 등록된 기록이 없어요.' : '아직 이긴 기록이 없어요.') +
    '</p>';
  }

  // 서버가 상위 N명만 내려줄 때, 잘렸다는 사실을 숨기지 않는다.
  function truncatedNote(shown, total) {
    if (!total || total <= shown) return '';
    return '<p class="hint">전체 ' + total + '명 중 상위 ' + shown + '명만 표시합니다.</p>';
  }

  function bindTabs(group, current, onPick) {
    Array.prototype.forEach.call(Sheet.body().querySelectorAll('[data-' + group + ']'), function (btn) {
      btn.addEventListener('click', function () {
        var picked = btn.getAttribute('data-' + group);
        if (picked !== current) onPick(picked);
      });
    });
  }

  function showRanking(period, mode) {
    period = period || 'daily';
    mode = modeOf(mode).key;

    Sheet.open('<h2>스코어보드</h2><p class="hint">기록을 불러오는 중…</p>');
    if (!global.WordQuizScoreboard.configured()) {
      Sheet.open(
        '<h2>스코어보드</h2>' +
        '<p class="hint">Google Sheets 연결이 아직 설정되지 않았어요.<br>게임 결과는 계속 플레이할 수 있습니다.</p>'
      );
      return;
    }
    // date 를 보내지 않는다. '오늘'의 기준은 서버(스크립트 시간대)가 정한다.
    global.WordQuizScoreboard.rankings(period, { mode: mode }).then(function (data) {
      // 정적 파일과 Apps Script 는 따로 배포된다. 서버가 mode 를 모르면
      // 엉뚱한 표를 그리는 대신 그렇다고 말한다.
      if (mode !== 'total' && (!data || data.mode !== mode)) {
        Sheet.open(rankHeader(period, mode) +
          '<p class="hint">스코어보드 서버가 아직 이 순위를 모릅니다.<br>' +
          'backend/Code.gs 를 다시 배포해 주세요.</p>');
        bindTabs('rank-tabs', period, function (p) { showRanking(p, mode); });
        bindTabs('rank-modes', mode, function (m) { showRanking(period, m); });
        return;
      }

      var rows = (data && data.rows) || [];
      Sheet.open(rankHeader(period, mode) + rankingShell(rows.length, mode) +
                 truncatedNote(rows.length, data && data.total));

      // 탭은 기록이 없을 때도 눌러야 하므로 목록보다 먼저 연결한다.
      bindTabs('rank-tabs', period, function (p) { showRanking(p, mode); });
      bindTabs('rank-modes', mode, function (m) { showRanking(period, m); });
      if (!rows.length) return;

      var list = document.getElementById('ranking-list');
      var scroll = document.getElementById('ranking-scroll');
      var loading = document.getElementById('ranking-loading');
      var offset = 0;
      function appendRankings() {
        var next = rows.slice(offset, offset + PAGE_SIZE);
        next.forEach(function (row, index) {
          list.insertAdjacentHTML('beforeend', rankingRow(row, offset + index, mode));
        });
        offset += next.length;
        loading.hidden = offset >= rows.length;
      }
      appendRankings();
      scroll.addEventListener('scroll', function () {
        if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 40) appendRankings();
      });
    }, function () {
      // 통신 실패만 여기로 온다. 위 렌더링에서 난 예외는 삼키지 않는다.
      Sheet.open('<h2>스코어보드</h2><p class="hint">순위를 불러오지 못했어요.<br>잠시 후 다시 시도해 주세요.</p>');
    });
  }

  /* 등록 ------------------------------------------------------------------ */

  /**
   * 점수를 시트에 남긴다. 이긴 판이면 점수가, 중간에 그만둔 판이면 0점이 간다.
   * 서버가 중복이라 답해도 이 브라우저가 등록을 시도한 단어인 것은 같으므로
   * 기억해 둔다. 다음부터 무작위로 뽑지도, 링크로 열어도 등록하지도 않는다.
   */
  function record(game, nickname) {
    return global.WordQuizScoreboard.submit({
      nickname: nickname,
      puzzleId: game.code(),
      jamoLength: game.length,
      attempts: game.rows.length,
      score: game.score(),
      elapsedSeconds: game.elapsedSeconds(),
      won: game.status === 'win'
    }).then(function (data) {
      global.Store.rememberScored(game.answer);
      return data;
    });
  }

  /** 지금 판을 시트에 남길 수 있는 상태인가. */
  function recordable(ctx) {
    return global.WordQuizScoreboard.configured() &&
      !ctx.sharedResult && !ctx.authored && !ctx.scored;
  }

  /* 결과 ------------------------------------------------------------------ */

  /**
   * ctx = { game, sharedResult, authored, scored, onAgain }
   * sharedResult: 남의 결과 링크를 열어 보는 중 — 정답도 점수 등록도 감춘다.
   * authored: 내가 직접 낸 문제 — 점수에 넣지 않는다.
   * scored: 이미 점수를 등록한 단어 — 한 단어는 한 번만 센다.
   */
  function showResult(ctx) {
    var game = ctx.game;
    var won = game.status === 'win';
    var grid = game.rows.map(function (r) {
      return r.marks.map(function (m) { return ICON[m]; }).join('');
    }).join('<br>');
    var blocked = ctx.sharedResult ? '공유받은 기록은 등록할 수 없어요.' :
      ctx.authored ? '직접 출제한 문제는 점수에 포함되지 않아요.' :
      ctx.scored ? '이미 점수를 등록한 단어예요.' : '';

    Sheet.open(
      '<h2>' + (ctx.sharedResult ? '공유받은 결과' : (won ? '정답입니다 🎉' : '아쉬워요')) + '</h2>' +
      (ctx.sharedResult ? '<div class="answer hidden-answer">공유된 결과</div>'
                        : '<div class="answer">' + Share.escapeHtml(game.answer) + '</div>') +
      // 공유받은 결과는 정답을 감추는 화면이다. 뜻풀이를 보여 주면 그걸로
      // 답이 드러나므로 자리 자체를 만들지 않는다.
      (ctx.sharedResult ? '' : '<div class="senses" id="result-senses"></div>') +
      '<p style="text-align:center">' +
        (won ? game.rows.length + '번 만에 맞혔어요' : MAX_TRIES + '번 안에 못 맞혔어요') +
      '</p>' +
      '<div class="grid">' + grid + '</div>' +
      '<div class="score-summary"><b>' + game.score() + '점</b>' +
        '<span>걸린 시간 ' + Share.formatTime(game.elapsedSeconds()) + '</span></div>' +
      '<div class="score-submit">' +
        '<input id="score-name" type="text" maxlength="20" placeholder="닉네임" aria-label="닉네임" value="' +
          Share.escapeHtml(global.WordQuizScoreboard.nickname()) + '">' +
        '<button type="button" id="act-score"' + (blocked ? ' disabled' : '') + '>점수 등록</button>' +
        '<p id="score-status" role="status">' + blocked + '</p>' +
      '</div>' +
      '<p class="hint">결과 링크를 보내면 친구가 <b>내 기록</b>을 바로 볼 수 있어요.<br>' +
        '정답은 링크에 그대로 드러나지 않습니다.</p>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-link">링크 복사</button>' +
        '<button type="button" id="act-share">결과 링크 공유</button>' +
        '<button type="button" id="act-ranking">순위 보기</button>' +
        '<button type="button" class="primary" id="act-again">한 판 더</button>' +
      '</div>'
    );

    // 뜻풀이는 늦게 온다. 시트는 먼저 뜨고 그 자리에 나중에 채워진다 —
    // 사전을 못 불러와도 결과 화면은 그대로 쓸 수 있어야 한다.
    if (!ctx.sharedResult && global.Define) {
      global.Define.fill(document.getElementById('result-senses'), game.answer);
    }

    document.getElementById('act-again').addEventListener('click', function () {
      Sheet.close();
      ctx.onAgain();
    });

    document.getElementById('act-link').addEventListener('click', function () {
      Share.copyThen(Share.linkFor(game.answer), '문제 링크를 복사했어요');
    });

    document.getElementById('act-share').addEventListener('click', function () {
      // 결과는 자랑하되, 링크를 연 사람은 같은 단어를 직접 풀게 한다.
      var text = game.shareText() + '\n' + Share.linkFor(game.answer);
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () { /* 사용자가 취소한 것 */ });
      } else {
        Share.copyThen(text, '결과와 링크를 복사했어요');
      }
    });

    document.getElementById('act-ranking').addEventListener('click', function () {
      showRanking('daily', 'total');
    });

    var button = document.getElementById('act-score');
    var status = document.getElementById('score-status');

    function send(name) {
      button.disabled = true;
      status.textContent = '등록하는 중…';
      return record(game, name).then(function (data) {
        status.textContent = data.duplicate ? '이미 등록한 기록이에요.' :
          (won ? '점수가 등록됐어요.' : '패배로 기록했어요.');
      }).catch(function () {
        button.disabled = false;
        status.textContent = '등록하지 못했어요.';
      });
    }

    // 등록하면 화면 캐시가 비워지므로, 그 뒤에 미리 받아야 내 기록까지 담긴다.
    function prefetchRanking() {
      global.WordQuizScoreboard.prefetch('daily', { mode: 'total' });
    }

    button.addEventListener('click', function () {
      var name = document.getElementById('score-name').value.trim();
      if (!name) { status.textContent = '닉네임을 입력해 주세요.'; return; }
      if (!global.WordQuizScoreboard.configured()) {
        status.textContent = '스코어보드 연결이 아직 설정되지 않았어요.';
        return;
      }
      send(name);
    });

    /*
     * 닉네임을 정해 둔 사람은 손대지 않아도 올라간다. 이긴 판만이 아니라 진 판도 남긴다.
     * 그만둔 판이 실패로 남는 마당에 끝까지 푼 패배만 빼면, 질 것 같을 때 끝내지 않는
     * 편이 이득이 된다. 승패가 다 남아야 판수와 승률이 말이 된다.
     */
    if (!blocked && recordable(ctx) && global.WordQuizScoreboard.nickname()) {
      send(global.WordQuizScoreboard.nickname()).then(prefetchRanking);
    } else {
      prefetchRanking();
    }
  }

  global.UIScore = { showResult: showResult, showRanking: showRanking, record: record, recordable: recordable };
})(window);
