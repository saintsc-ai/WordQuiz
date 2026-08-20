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
    authored: 'wordquiz.authored',
    scored: 'wordquiz.scored'
  };

  var NAME_MAX = 20;
  var AUTHORED_MAX = 100;
  // 정답 후보는 전부 합쳐 5,801개다. 다 풀어도 잘리지 않을 만큼 잡는다.
  var SCORED_MAX = 8000;

  function get(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  function set(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* 저장 못 해도 진행한다 */ }
    return value;
  }

  /*
   * 단어 목록은 단어를 그대로 두지 않고 Game.encode 로 감싸 담는다. 저장소를
   * 열어 봐도 눈에 띄지 않게 하려는 것뿐이지 암호는 아니다.
   */
  function readList(key) {
    try {
      var list = JSON.parse(get(key) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  /*
   * 목록을 고치는 곳이 여기뿐이라 파싱 결과를 들고 있는다. 판을 깔 때 정답
   * 후보 1,500개를 한 번에 훑어야 해서, 그때마다 JSON.parse 하면 느리다.
   */
  var cached = {};

  function codesOf(key) {
    if (!cached[key]) cached[key] = new Set(readList(key));
    return cached[key];
  }

  function remember(key, word, max) {
    var code = global.Game.encode(word);
    if (codesOf(key).has(code)) return;
    var list = readList(key);
    list.push(code);
    if (list.length > max) list = list.slice(-max);
    set(key, JSON.stringify(list));
    cached[key] = new Set(list);
  }

  function has(key, word) {
    return word ? codesOf(key).has(global.Game.encode(word)) : false;
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
     */
    rememberAuthored: function (word) { remember(KEYS.authored, word, AUTHORED_MAX); },
    isAuthored: function (word) { return has(KEYS.authored, word); },

    /*
     * 점수를 등록한 단어. 한 단어는 한 번만 센다.
     *
     * 결과 화면의 '링크 복사' 로 얻은 주소를 스스로 다시 열면 답을 아는 채로
     * 푸는 것이 된다. 그래서 이 목록에 있는 단어는 무작위로 다시 뽑지 않고
     * (js/game.js 의 skip), 링크로 열더라도 등록 버튼을 잠근다.
     *
     * 서버도 (clientId, puzzleId) 로 같은 판단을 한다(backend/Code.gs).
     * 여기서 먼저 막는 것은 다 풀고 나서야 거절당하지 않게 하려는 것이다.
     */
    rememberScored: function (word) { remember(KEYS.scored, word, SCORED_MAX); },
    isScored: function (word) { return has(KEYS.scored, word); },

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
