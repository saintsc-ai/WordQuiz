/*
 * scoreboard.js - Google Apps Script scoreboard client
 */
(function (global) {
  'use strict';

  // Paste the deployed Apps Script Web App URL here.
  var API_URL = 'https://script.google.com/macros/s/AKfycbw5OAcfQidrS_Rifx6BeRDqi6f-_7V88IkwAL9DvkNbfMzqGdfBDAsUIvgxW5UG06IB4g/exec';

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
    });
  }

  /** kind: daily | overall. 날짜는 서버가 정하므로 params 는 보통 비운다. */
  function rankings(kind, params) {
    if (!configured()) return Promise.reject(new Error('scoreboard is not configured'));
    var query = new URLSearchParams(params || {});
    query.set('action', kind);
    return request(API_URL + '?' + query.toString());
  }

  global.WordQuizScoreboard = {
    configured: configured,
    nickname: nickname,
    saveNickname: saveNickname,
    submit: submit,
    rankings: rankings
  };
})(window);
