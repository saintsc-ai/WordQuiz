/*
 * scoreboard.js - Google Apps Script scoreboard client
 */
(function (global) {
  'use strict';

  // Paste the deployed Apps Script Web App URL here.
  var API_URL = 'https://script.google.com/macros/s/AKfycbyyzDDH-N9PT9ZJy9ik1zn6fdTLhGgy_i9JlP2rvpkzeFosANIk4lj8WLGpojWUQ78Khw/exec';

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

    var hit = rankCache[url];
    if (hit && Date.now() - hit.at < RANK_TTL) return Promise.resolve(hit.data);

    return request(url).then(function (data) {
      rankCache[url] = { at: Date.now(), data: data };
      return data;
    });
  }

  global.WordQuizScoreboard = {
    configured: configured,
    nickname: nickname,
    saveNickname: saveNickname,
    submit: submit,
    rankings: rankings
  };
})(window);
