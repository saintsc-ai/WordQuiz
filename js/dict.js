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

  var cache = {};

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('load failed: ' + src)); };
      document.head.appendChild(el);
    });
  }

  /** 자모 길이 n 에 해당하는 사전을 준비한다. */
  function load(n) {
    if (cache[n]) return cache[n];
    cache[n] = Promise.all([
      loadScript('data/words-' + n + '.js'),
      loadScript('data/answers-' + n + '.js')
    ]).then(function () {
      var blob = global.WORDS[n];
      var valid = new Set();
      for (var i = 0; i < blob.length; i += n) valid.add(blob.substr(i, n));
      return { length: n, valid: valid, answers: global.ANSWERS[n] };
    });
    return cache[n];
  }

  global.Dict = { load: load };
})(window);
