'use strict';

/*
 * 순위 계산. backend/Code.gs 의 rank_ · totals_ · bests_ 를 그대로 옮겼다.
 * 두 배포가 같은 표를 그려야 하므로 정렬 규칙과 응답 모양을 손대지 않는다.
 *
 * 순위는 두 축이다.
 *   기간  action=daily(오늘) | overall(전체)
 *   방식  mode=total(누적 점수) | time(타임어택) | score(점수어택)
 */

var MODES = { total: 1, time: 1, score: 1 };

var LIMIT = 100;
var NO_TIME = 1e9;   // 아직 이긴 적이 없으면 맨 뒤로

/*
 * 응답에 mode 를 되돌려 준다. 화면이 요청한 것과 다르면 서버 배포가
 * 오래됐다는 뜻이고, 그러면 엉뚱한 표를 그리지 않고 알려 줄 수 있다
 * (js/ui-score.js 의 showRanking).
 */
function rank(rows, mode) {
  var made = mode === 'total' ? totals(rows) : bests(rows, mode);
  made.sort(mode === 'total' ? sortTotals : (mode === 'time' ? sortTime : sortScore));
  return { ok: true, mode: mode, total: made.length, rows: made.slice(0, LIMIT) };
}

/*
 * 누적 점수 — 사람별 합계.
 *
 * 평균 시도와 평균 시간은 '이긴 판'만 센다. 진 판은 늘 5번을 다 쓰고 끝나
 * 섞으면 시도 평균이 5쪽으로 눌리고, 시간도 풀어낸 속도를 나타내지 못한다.
 * 대신 승률을 함께 보내 이긴 판만 센다는 사실이 가려지지 않게 한다.
 */
function totals(rows) {
  var totals = {};
  rows.forEach(function (row) {
    var key = row.clientId;
    if (!totals[key]) {
      totals[key] = { nickname: row.nickname, score: 0, games: 0, wins: 0, bestTime: null,
                      attemptSum: 0, secondSum: 0 };
    }
    var t = totals[key];
    // 닉네임을 바꾸면 최근 것을 따라간다. 행은 기록된 순서대로 들어 있다.
    if (row.nickname) t.nickname = row.nickname;
    t.score += row.score;
    t.games++;
    if (row.won) {
      t.wins++;
      t.attemptSum += row.attempts;
      t.secondSum += row.elapsedSeconds;
      if (t.bestTime === null || row.elapsedSeconds < t.bestTime) t.bestTime = row.elapsedSeconds;
    }
  });

  return Object.keys(totals).map(function (key) {
    var t = totals[key];
    return {
      nickname: t.nickname,
      score: t.score,
      games: t.games,
      wins: t.wins,
      bestTime: t.bestTime,
      winRate: t.games ? Math.round(t.wins * 100 / t.games) : 0,
      avgAttempts: t.wins ? Math.round(t.attemptSum * 10 / t.wins) / 10 : null,
      avgSeconds: t.wins ? Math.round(t.secondSum / t.wins) : null
    };
  });
}

/*
 * 타임어택 · 점수어택 — 사람별 '가장 좋은 한 판'.
 * 진 판은 시간도 점수도 견줄 대상이 아니라 빼고 센다. 그래서 아직 한 번도
 * 이기지 못한 사람은 이 두 표에 나오지 않는다.
 */
function bests(rows, mode) {
  var best = {};
  var better = mode === 'time' ? sortTime : sortScore;
  rows.forEach(function (row) {
    if (!row.won) return;
    var key = row.clientId;
    var entry = {
      nickname: row.nickname, score: row.score, elapsedSeconds: row.elapsedSeconds,
      jamoLength: row.jamoLength, attempts: row.attempts
    };
    if (!best[key] || better(entry, best[key]) < 0) best[key] = entry;
    else if (row.nickname) best[key].nickname = row.nickname;
  });
  return Object.keys(best).map(function (key) { return best[key]; });
}

// 총점 -> 적은 판수 -> 빠른 최고 기록. 같은 점수면 판을 덜 쓴 쪽이 위로 간다.
function sortTotals(a, b) {
  return b.score - a.score || a.games - b.games ||
    (a.bestTime === null ? NO_TIME : a.bestTime) - (b.bestTime === null ? NO_TIME : b.bestTime);
}

// 타임어택: 빠른 순. 같은 시간이면 점수가 높은 쪽.
function sortTime(a, b) {
  return a.elapsedSeconds - b.elapsedSeconds || b.score - a.score;
}

// 점수어택: 높은 순. 같은 점수면 빨리 푼 쪽.
function sortScore(a, b) {
  return b.score - a.score || a.elapsedSeconds - b.elapsedSeconds;
}

module.exports = { MODES: MODES, LIMIT: LIMIT, rank: rank };
