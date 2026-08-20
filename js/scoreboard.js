/*
 * scoreboard.js - Google Apps Script scoreboard client
 */
(function (global) {
  'use strict';

  // Paste the deployed Apps Script Web App URL here.
  var API_URL = '';
  var PLAYER_KEY = 'wordquiz.player';
  var NAME_KEY = 'wordquiz.nickname';

  function configured() { return API_URL.length > 0; }

  function playerId() {
    var saved = null;
    try { saved = localStorage.getItem(PLAYER_KEY); } catch (e) { /* ignore */ }
    if (saved) return saved;
    var id = global.crypto && global.crypto.randomUUID ?
      global.crypto.randomUUID() : 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try { localStorage.setItem(PLAYER_KEY, id); } catch (e) { /* ignore */ }
    return id;
  }

  function nickname() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }

  function saveNickname(name) {
    name = String(name || '').trim().slice(0, 20);
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignore */ }
    return name;
  }

  function request(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('scoreboard request failed');
      return res.json();
    });
  }

  function submit(result) {
    if (!configured()) return Promise.reject(new Error('scoreboard is not configured'));
    var body = {
      action: 'submit',
      clientId: playerId(),
      nickname: saveNickname(result.nickname),
      puzzleId: result.puzzleId,
      puzzleDate: result.puzzleDate,
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
