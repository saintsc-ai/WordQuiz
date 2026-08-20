/*
 * store.js — localStorage 접근을 한곳에 모은다.
 *
 * 키 이름이 여러 파일에 흩어져 있으면 오타 하나로 조용히 다른 칸을 읽는다.
 * 사파리 프라이빗 모드처럼 접근 자체가 예외를 던지는 환경이 있어 전부 감싼다.
 */
(function (global) {
  'use strict';

  var KEYS = {
    length: 'wordquiz.length',
    player: 'wordquiz.player',
    nickname: 'wordquiz.nickname'
  };

  var NAME_MAX = 20;

  function get(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function set(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 진행한다 */ }
    return value;
  }

  global.Store = {
    KEYS: KEYS,

    /** 마지막으로 고른 자모 길이. 없으면 0. */
    length: function () { return Number(get(KEYS.length)) || 0; },
    saveLength: function (n) { set(KEYS.length, String(n)); },

    nickname: function () { return get(KEYS.nickname) || ''; },
    saveNickname: function (name) { return set(KEYS.nickname, String(name || '').trim().slice(0, NAME_MAX)); },

    /** 브라우저별 익명 ID. 없으면 만들어 저장한다. */
    playerId: function () {
      var saved = get(KEYS.player);
      if (saved) return saved;
      var id = global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() :
        'p-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      return set(KEYS.player, id);
    }
  };
})(window);
