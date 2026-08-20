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
    nickname: 'wordquiz.nickname',
    authored: 'wordquiz.authored'
  };

  var NAME_MAX = 20;
  var AUTHORED_MAX = 100;

  function get(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function set(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 진행한다 */ }
    return value;
  }

  function readAuthored() {
    try {
      var list = JSON.parse(get(KEYS.authored) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  global.Store = {
    KEYS: KEYS,

    /** 마지막으로 고른 자모 길이. 없으면 0. */
    length: function () { return Number(get(KEYS.length)) || 0; },
    saveLength: function (n) { set(KEYS.length, String(n)); },

    nickname: function () { return get(KEYS.nickname) || ''; },
    saveNickname: function (name) { return set(KEYS.nickname, String(name || '').trim().slice(0, NAME_MAX)); },

    /*
     * 내가 직접 낸 단어. 출제 링크를 복사해 열면 남이 공유해 준 문제와
     * 구별이 안 되는데, 정답을 아는 채로 푸는 것이라 점수에 넣으면 안 된다.
     * 이 목록에 있는 단어는 링크로 열어도 출제한 문제로 본다.
     *
     * 단어를 그대로 두지 않고 Game.encode 로 감싼다. 저장소를 열어 봐도
     * 눈에 띄지 않게 하려는 것뿐이지 암호는 아니다.
     */
    rememberAuthored: function (word) {
      var code = global.Game.encode(word);
      var list = readAuthored();
      if (list.indexOf(code) >= 0) return;
      list.push(code);
      if (list.length > AUTHORED_MAX) list = list.slice(-AUTHORED_MAX);
      set(KEYS.authored, JSON.stringify(list));
    },

    isAuthored: function (word) {
      if (!word) return false;
      return readAuthored().indexOf(global.Game.encode(word)) >= 0;
    },

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
