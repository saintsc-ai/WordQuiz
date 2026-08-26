/*
 * dict.js — 단어 데이터 로딩과 검증
 *
 * data/answers-N.js: 정답 후보 단어(한글) 배열. 길이당 1~2천 개라 그대로 받는다.
 *                    <script> 태그를 주입해 읽는다.
 *
 * 추측으로 인정되는 단어 목록은 여기 없다. 표제어가 수십만 개라 통으로 받으면
 * 첫 화면이 무거워져서, 서버에 두고 /valid 로 물어본다(server/dict.js).
 * 물어본 답은 이 파일이 들고 있다가 같은 단어는 다시 묻지 않는다.
 *
 * game.js 는 valid.has(자모열) 를 예전처럼 동기로 부른다. 그래서 화면은 판을
 * 넘기기 전에 check() 로 먼저 물어봐 두어야 한다(js/ui.js).
 */
(function (global) {
  'use strict';

  // 사전이 존재하는 자모 길이. tools/build_dict.py 의 LENGTHS 와 같아야 한다.
  // (tools/check_sync.py 가 검사한다)
  var LENGTHS = [5, 6, 7, 8, 9, 10];

  // 화면과 API 를 같은 서버가 내보낸다. 다른 곳을 보게 하려면 이 파일보다
  // 먼저 window.WORDQUIZ_VALID_URL 을 정해 둔다(js/scoreboard.js 와 같은 방식).
  var VALID_URL = global.WORDQUIZ_VALID_URL || '/valid';

  // 한 번에 물어보는 최대 개수. server/server.js 의 VALID_MAX 와 같아야 한다.
  var BATCH_MAX = 16;

  var cache = {};

  /** index.html 의 ?v= 와 같은 값을 붙인다. 사전만 낡은 채로 남는 일을 막는다. */
  function url(path) {
    return global.APP_VERSION ? path + '?v=' + global.APP_VERSION : path;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('load failed: ' + src)); };
      document.head.appendChild(el);
    });
  }

  /*
   * 자모열 하나하나의 판정을 담아 둔다. true/false 는 서버가 답한 것이고,
   * 아직 안 물어본 것은 undefined 다. 이 셋을 구분해야 check() 가 이미 아는
   * 단어를 다시 묻지 않는다.
   */
  function Known(n, answers) {
    this.length = n;
    this.map = Object.create(null);
    /*
     * 정답 후보는 사전에 있는 것이 확실하다. 미리 채워 두면 흔한 단어는
     * 서버에 묻지 않고 끝나고, 판을 깔 때 정답을 확인하는 왕복도 없어진다.
     */
    answers.forEach(function (word) {
      var jamo = global.Jamo.decompose(word);
      if (jamo && jamo.length === n) this.map[jamo] = true;
    }, this);
  }

  /** 물어본 적이 있고, 사전에 있던 것. game.js 가 동기로 부른다. */
  Known.prototype.has = function (jamo) { return this.map[jamo] === true; };

  /*
   * 아직 모르는 것만 서버에 묻고 답을 담아 둔다. 끝나면 has() 가 답할 수 있다.
   *
   * 서버에 닿지 못하면 물어본 것을 전부 통과시킨다. 사전을 확인할 수 없다고
   * 아무 단어도 못 내게 하면 판이 아예 멈춘다. 틀린 단어가 한 번 지나가는
   * 편이 낫다고 봤다 — 어차피 정답을 맞히지 못하면 점수도 없다.
   */
  Known.prototype.check = function (jamos) {
    var self = this;
    var ask = [];
    jamos.forEach(function (jamo) {
      if (jamo && self.map[jamo] === undefined && ask.indexOf(jamo) < 0) ask.push(jamo);
    });
    if (!ask.length) return Promise.resolve();

    // 서버가 한 번에 받는 만큼씩 나눠 묻는다. 넘치는 것을 버리면 그 단어는
    // 영영 '모르는' 채로 남아, 멀쩡한 단어가 거부당한다.
    var batches = [];
    for (var i = 0; i < ask.length; i += BATCH_MAX) batches.push(ask.slice(i, i + BATCH_MAX));
    return Promise.all(batches.map(function (batch) { return self.ask(batch); }));
  };

  Known.prototype.ask = function (batch) {
    var self = this;
    var query = 'n=' + this.length + batch.map(function (jamo) {
      return '&w=' + encodeURIComponent(jamo);
    }).join('');

    return fetch(VALID_URL + '?' + query).then(function (res) {
      if (!res.ok) throw new Error('valid request failed');
      return res.json();
    }).then(function (data) {
      if (!data || data.ok === false) throw new Error((data && data.error) || 'valid request failed');
      batch.forEach(function (jamo) {
        // 서버가 빠뜨린 것은 담지 않는다. 다음에 다시 묻게 둔다.
        if (jamo in data.valid) self.map[jamo] = data.valid[jamo] === true;
      });
    }).catch(function (err) {
      console.warn('사전을 확인하지 못해 그냥 통과시킵니다', err);
      batch.forEach(function (jamo) { self.map[jamo] = true; });
    });
  };

  /**
   * 자모 길이 n 의 정답 후보를 준비한다.
   * 실패한 Promise 는 캐시에서 지운다. 남겨 두면 통신이 한 번 끊긴 뒤로는
   * 새로고침 전까지 그 길이를 영영 못 불러온다.
   */
  function load(n) {
    if (cache[n]) return cache[n];
    var pending = loadScript(url('data/answers-' + n + '.js')).then(function () {
      var answers = global.ANSWERS[n];
      var known = new Known(n, answers);
      return {
        length: n,
        valid: known,
        answers: answers,
        /** 이 자모열들을 서버에 물어봐 둔다. 그래야 valid.has 가 답한다. */
        check: function (jamos) { return known.check(jamos); }
      };
    });
    pending.catch(function () {
      if (cache[n] === pending) delete cache[n];
    });
    cache[n] = pending;
    return pending;
  }

  global.Dict = { LENGTHS: LENGTHS, load: load };
})(window);
