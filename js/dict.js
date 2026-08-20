/*
 * dict.js — 단어 데이터 로딩과 검증
 *
 * data/words-N.js  : 자모 N개짜리 명사의 입력열을 전부 이어붙인 한 덩어리 문자열.
 *                    길이가 균일하므로 N글자씩 잘라 Set 으로 만든다.
 * data/answers-N.js: 정답 후보 단어(한글) 배열.
 *
 * <script> 태그를 주입해 읽으므로 file:// 로 열어도 동작한다.
 */
(function (global) {
  'use strict';

  // 사전이 존재하는 자모 길이. tools/build_dict.py 의 LENGTHS 와 같아야 한다.
  // (tools/check_sync.py 가 검사한다)
  var LENGTHS = [5, 6, 7, 8, 9, 10];

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

  /**
   * 자모 길이 n 에 해당하는 사전을 준비한다.
   * 실패한 Promise 는 캐시에서 지운다. 남겨 두면 통신이 한 번 끊긴 뒤로는
   * 새로고침 전까지 그 길이를 영영 못 불러온다.
   */
  function load(n) {
    if (cache[n]) return cache[n];
    var pending = Promise.all([
      loadScript(url('data/words-' + n + '.js')),
      loadScript(url('data/answers-' + n + '.js'))
    ]).then(function () {
      var blob = global.WORDS[n];
      var valid = new Set();
      for (var i = 0; i < blob.length; i += n) valid.add(blob.substr(i, n));
      return { length: n, valid: valid, answers: global.ANSWERS[n] };
    });
    pending.catch(function () {
      if (cache[n] === pending) delete cache[n];
    });
    cache[n] = pending;
    return pending;
  }

  global.Dict = { LENGTHS: LENGTHS, load: load };
})(window);
