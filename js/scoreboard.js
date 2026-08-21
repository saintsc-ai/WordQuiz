/*
 * scoreboard.js - Google Apps Script scoreboard client
 */
(function (global) {
  'use strict';

  // Paste the deployed Apps Script Web App URL here.
  var API_URL = 'https://script.google.com/macros/s/AKfycbwA_wMozj8mHCvR9RkKDHeAj5gVkJKld5G5UK_uVr002EZ4aX_6-7rbP_e20QhFQH3nfA/exec';

  // 시트를 여는 왕복이 몇 초 걸린다. 탭을 오갈 때마다 다시 부르지 않도록
  // 이번 세션 동안만 들고 있는다. 점수를 등록하면 버린다.
  var RANK_TTL = 60000;
  var rankCache = {};

  function configured() { return API_URL.length > 0; }

  // 닉네임과 익명 ID 는 js/store.js 가 보관한다.
  function playerId() { return global.Store.playerId(); }
  function nickname() { return global.Store.nickname(); }
  function saveNickname(name) { return global.Store.saveNickname(name); }

  function request(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('scoreboard request failed');
      return res.json();
    }).then(function (data) {
      if (data && data.ok === false) throw new Error(data.error || 'scoreboard request failed');
      return data;
    });
  }

  function submit(result) {
    if (!configured()) return Promise.reject(new Error('scoreboard is not configured'));
    var body = {
      action: 'submit',
      clientId: playerId(),
      nickname: saveNickname(result.nickname),
      puzzleId: result.puzzleId,
      jamoLength: result.jamoLength,
      attempts: result.attempts,
      score: result.score,
      elapsedSeconds: result.elapsedSeconds,
      won: result.won
    };
    return request(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (data) {
      rankCache = {};   // 내 점수가 바로 보여야 한다
      return data;
    });
  }

  /**
   * kind: daily | overall (기간). params.mode: total | time | score (방식).
   * 날짜는 서버가 정하므로 date 는 보내지 않는다.
   */
  function rankings(kind, params) {
    if (!configured()) return Promise.reject(new Error('scoreboard is not configured'));
    var query = new URLSearchParams(params || {});
    query.set('action', kind);
    var url = API_URL + '?' + query.toString();

    // 결과가 아니라 Promise 를 담아 둔다. 미리 받는 중에 사용자가 순위를 열면
    // 같은 요청을 또 보내지 않고 진행 중인 것을 같이 기다린다.
    var hit = rankCache[url];
    if (hit && Date.now() - hit.at < RANK_TTL) return hit.promise;

    var entry = { at: Date.now(), promise: null };
    entry.promise = request(url);
    // 실패한 것을 물고 있으면 다음 시도까지 막힌다. 캐시에서 지운다.
    entry.promise.catch(function () {
      if (rankCache[url] === entry) delete rankCache[url];
    });
    rankCache[url] = entry;
    return entry.promise;
  }

  /*
   * 미리 받아 두기. 순위는 한 번 부르는 데 2~3초가 걸리는데, 그 대부분이
   * Apps Script 의 요청당 고정 비용이라 서버를 손봐도 줄지 않는다.
   * 대신 사용자가 기다리는 시점과 부르는 시점을 떼어 놓는다. 판을 시작할 때와
   * 판이 끝났을 때 미리 불러 두면 ♛ 를 누를 때는 이미 캐시에 있다.
   *
   * 실패해도 조용히 넘어간다. 어차피 진짜로 열 때 다시 부른다.
   */
  function prefetch(kind, params) {
    if (!configured()) return;
    rankings(kind, params).catch(function () { /* 미리 받는 것뿐이다 */ });
  }

  global.WordQuizScoreboard = {
    prefetch: prefetch,
    configured: configured,
    nickname: nickname,
    saveNickname: saveNickname,
    submit: submit,
    rankings: rankings
  };
})(window);
