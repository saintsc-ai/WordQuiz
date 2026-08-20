/*
 * ui-score.js — 결과 시트와 순위 시트
 *
 * 이 게임은 한 판씩 무작위 단어를 내주고 몇 번이든 다시 풀 수 있다.
 * 그래서 순위는 '같은 문제를 누가 잘 풀었나'가 아니라
 * '오늘 얼마나 많이·잘 풀었나'를 세운다. 오늘도 누적도 사람별 합계다.
 */
(function (global) {
  'use strict';

  var Sheet = global.UISheet;
  var Share = global.UIShare;
  var MAX_TRIES = global.Game.MAX_TRIES;
  var PAGE_SIZE = 10;

  var ICON = { ok: '🟩', warn: '🟨', off: '⬜' };

  /* 순위 ------------------------------------------------------------------ */

  function num(value, suffix) {
    var n = Number(value);
    return isFinite(n) ? n + suffix : '-';
  }

  /*
   * 정적 파일은 GitHub Pages 가, 스코어보드는 Apps Script 가 따로 배포된다.
   * 둘의 버전이 어긋나면 응답에 games/wins 가 없을 수 있다. 그 때는 옛 응답대로
   * 판 하나의 걸린 시간을 보여 준다. 없는 값을 NaN 으로 찍지 않는다.
   */
  function rankingRow(row, index) {
    var detail = row && row.games === undefined ?
      Share.formatTime(row.elapsedSeconds) :
      num(row.wins, '승') + ' / ' + num(row.games, '판');
    return '<div class="ranking-row">' +
      '<span class="rank-number">' + (index + 1) + '</span>' +
      '<b>' + Share.escapeHtml(row.nickname) + '</b>' +
      '<span class="rank-score">' + num(row.score, '점') + '</span>' +
      '<span class="rank-time">' + detail + '</span>' +
    '</div>';
  }

  function rankHeader(kind) {
    return '<h2>스코어보드</h2>' +
      '<div class="rank-tabs">' +
        '<button type="button" class="' + (kind === 'daily' ? 'selected' : '') + '" id="rank-daily">오늘 순위</button>' +
        '<button type="button" class="' + (kind === 'overall' ? 'selected' : '') + '" id="rank-overall">누적 순위</button>' +
      '</div>' +
      '<p class="rank-caption">' +
        (kind === 'daily' ? '오늘 총점 · 승리 / 판수' : '전체 총점 · 승리 / 판수') +
      '</p>';
  }

  // 기록이 없으면 안내문만 내보낸다. 호출부는 이 때 목록 엘리먼트를 찾으면 안 된다.
  function rankingShell(count) {
    if (!count) return '<p class="empty-rank">아직 등록된 기록이 없어요.</p>';
    return '<div class="ranking-scroll" id="ranking-scroll">' +
      '<div class="ranking-list" id="ranking-list"></div>' +
      '<p class="ranking-loading" id="ranking-loading">더 불러오는 중…</p>' +
    '</div>';
  }

  // 서버가 상위 N명만 내려줄 때, 잘렸다는 사실을 숨기지 않는다.
  function truncatedNote(shown, total) {
    if (!total || total <= shown) return '';
    return '<p class="hint">전체 ' + total + '명 중 상위 ' + shown + '명만 표시합니다.</p>';
  }

  function showRanking(kind) {
    kind = kind || 'daily';
    Sheet.open('<h2>스코어보드</h2><p class="hint">기록을 불러오는 중…</p>');
    if (!global.WordQuizScoreboard.configured()) {
      Sheet.open(
        '<h2>스코어보드</h2>' +
        '<p class="hint">Google Sheets 연결이 아직 설정되지 않았어요.<br>게임 결과는 계속 플레이할 수 있습니다.</p>'
      );
      return;
    }
    // date 를 보내지 않는다. '오늘'의 기준은 서버(스크립트 시간대)가 정한다.
    global.WordQuizScoreboard.rankings(kind).then(function (data) {
      var rows = (data && data.rows) || [];
      Sheet.open(rankHeader(kind) + rankingShell(rows.length) +
                 truncatedNote(rows.length, data && data.total));

      // 탭은 기록이 없을 때도 눌러야 하므로 목록보다 먼저 연결한다.
      document.getElementById('rank-daily').addEventListener('click', function () { showRanking('daily'); });
      document.getElementById('rank-overall').addEventListener('click', function () { showRanking('overall'); });
      if (!rows.length) return;

      var list = document.getElementById('ranking-list');
      var scroll = document.getElementById('ranking-scroll');
      var loading = document.getElementById('ranking-loading');
      var offset = 0;
      function appendRankings() {
        var next = rows.slice(offset, offset + PAGE_SIZE);
        next.forEach(function (row, index) {
          list.insertAdjacentHTML('beforeend', rankingRow(row, offset + index));
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

  /* 결과 ------------------------------------------------------------------ */

  /**
   * ctx = { game, sharedResult, authored, onAgain }
   * sharedResult: 남의 결과 링크를 열어 보는 중 — 정답도 점수 등록도 감춘다.
   * authored: 내가 직접 낸 문제 — 점수에 넣지 않는다.
   */
  function showResult(ctx) {
    var game = ctx.game;
    var won = game.status === 'win';
    var grid = game.rows.map(function (r) {
      return r.marks.map(function (m) { return ICON[m]; }).join('');
    }).join('<br>');
    var blocked = ctx.sharedResult ? '공유받은 기록은 등록할 수 없어요.' :
      ctx.authored ? '직접 출제한 문제는 점수에 포함되지 않아요.' : '';

    Sheet.open(
      '<h2>' + (ctx.sharedResult ? '공유받은 결과' : (won ? '정답입니다 🎉' : '아쉬워요')) + '</h2>' +
      (ctx.sharedResult ? '<div class="answer hidden-answer">공유된 결과</div>'
                        : '<div class="answer">' + Share.escapeHtml(game.answer) + '</div>') +
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
      showRanking('daily');
    });

    document.getElementById('act-score').addEventListener('click', function () {
      var name = document.getElementById('score-name').value.trim();
      var status = document.getElementById('score-status');
      if (!name) { status.textContent = '닉네임을 입력해 주세요.'; return; }
      if (!global.WordQuizScoreboard.configured()) {
        status.textContent = '스코어보드 연결이 아직 설정되지 않았어요.';
        return;
      }
      var button = document.getElementById('act-score');
      button.disabled = true;
      status.textContent = '등록하는 중…';
      global.WordQuizScoreboard.submit({
        nickname: name,
        puzzleId: game.code(),
        jamoLength: game.length,
        attempts: game.rows.length,
        score: game.score(),
        elapsedSeconds: game.elapsedSeconds(),
        won: game.status === 'win'
      }).then(function (data) {
        status.textContent = data.duplicate ? '이미 등록한 기록이에요.' : '점수가 등록됐어요.';
      }).catch(function () {
        button.disabled = false;
        status.textContent = '등록하지 못했어요.';
      });
    });
  }

  global.UIScore = { showResult: showResult, showRanking: showRanking };
})(window);
