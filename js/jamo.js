/*
 * jamo.js — 한글 <-> 간략화 자판 키 입력열 변환
 *
 * 이 게임의 자판은 두벌식에서 쌍자음(ㄲㄸㅃㅆㅉ)과 복합모음 키를 뺀 24개다.
 *   자음 14: ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ
 *   모음 10: ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ
 * 나머지 자모는 모두 이 24키의 조합으로 입력한다. ㄲ=ㄱㄱ, ㄺ=ㄹㄱ, ㅐ=ㅏㅣ 등.
 * 단 3키가 필요한 ㅙ(ㅗㅏㅣ) ㅞ(ㅜㅓㅣ)는 지원하지 않으며,
 * 이를 포함한 단어는 사전 구축 단계에서 제외된다.
 *
 * 보드 한 칸 = 키 하나이므로, 단어 하나는 결국 24자 알파벳으로 된 문자열이 된다.
 */
(function (global) {
  'use strict';

  var CONSONANTS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var VOWELS = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ'];

  // 유니코드 한글 음절 = 0xAC00 + (초 * 21 + 중) * 28 + 종
  var CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
             'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ',
              'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ',
              'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ',
              'ㅌ', 'ㅍ', 'ㅎ'];

  // 겹자모 -> 자판 키 입력열. 여기에 없는 자모는 그 자체가 키다.
  var EXPAND = {
    'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ',
    'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ',
    'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ',
    'ㅐ': 'ㅏㅣ', 'ㅒ': 'ㅑㅣ', 'ㅔ': 'ㅓㅣ', 'ㅖ': 'ㅕㅣ',
    'ㅘ': 'ㅗㅏ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ'
  };

  // 3키가 필요해 지원하지 않는 모음
  var UNSUPPORTED = { 'ㅙ': 1, 'ㅞ': 1 };

  var KEYS = {};
  CONSONANTS.concat(VOWELS).forEach(function (k) { KEYS[k] = 1; });

  /**
   * 한글 단어를 자판 키 입력열로 분해한다.
   * 한글 음절이 아닌 문자나 미지원 자모가 섞이면 null 을 돌려준다.
   */
  function decompose(word) {
    var out = '';
    for (var i = 0; i < word.length; i++) {
      var code = word.charCodeAt(i) - 0xac00;
      if (code < 0 || code > 11171) return null;
      var parts = [CHO[Math.floor(code / 588)], JUNG[Math.floor(code / 28) % 21]];
      var jong = JONG[code % 28];
      if (jong) parts.push(jong);
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (UNSUPPORTED[p]) return null;
        out += EXPAND[p] || p;
      }
    }
    return out;
  }

  /*
   * 물리 자판에서 키 하나로 들어온 자모를, 이 게임의 24키 입력열로 편다.
   *
   * 두벌식에는 이 게임에 없는 키가 있다 — ㅐ ㅔ 는 각각 한 키이고 쌍자음도
   * 시프트 한 번이다. 그대로 버리면 친 사람은 자판이 먹통이라고 느낀다.
   * decompose 가 단어에 대해 하는 일을, 자모 하나에 대해 하는 셈이다.
   *
   * 키가 아닌 것(영문·기능키)과 미지원 자모(ㅙ ㅞ)는 빈 문자열이다 —
   * 부르는 쪽이 그것으로 '받지 않음' 을 판단한다.
   */
  function keysFor(ch) {
    if (UNSUPPORTED[ch]) return '';
    if (EXPAND[ch]) return EXPAND[ch];
    return KEYS[ch] ? ch : '';
  }

  function isConsonant(key) { return CONSONANTS.indexOf(key) >= 0; }
  function isVowel(key) { return VOWELS.indexOf(key) >= 0; }

  global.Jamo = {
    CONSONANTS: CONSONANTS,
    VOWELS: VOWELS,
    KEYS: KEYS,
    decompose: decompose,
    keysFor: keysFor,
    isConsonant: isConsonant,
    isVowel: isVowel
  };
})(window);
