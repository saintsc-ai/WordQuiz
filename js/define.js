'use strict';

/*
 * 뜻풀이.
 *
 * 사전이 서버에만 있어서 생긴 주소다(server/dict.js). 뜻풀이는 27만 개에
 * 24MB 라 추측 허용 목록과 같은 이유로 내려보내지 않는다 — 화면은 지금
 * 필요한 단어 하나만 묻고, 받은 답은 들고 있다가 같은 단어는 다시 묻지 않는다.
 *
 * 뜻이 없어도 오류가 아니다. 사전에 있지만 뜻이 안 실린 단어가 있고, 그때는
 * 그 자리를 비우면 된다. 판을 푸는 데는 지장이 없다.
 */
(function (global) {
  // 화면과 API 를 같은 서버가 내보낸다. 다른 곳을 보게 하려면 이 파일보다
  // 먼저 window.WORDQUIZ_DEFINE_URL 을 정해 둔다(js/dict.js 와 같은 방식).
  var DEFINE_URL = global.WORDQUIZ_DEFINE_URL || '/define';
  var SUGGEST_URL = global.WORDQUIZ_SUGGEST_URL || '/suggest';

  var cache = {};

  function get(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /**
   * 단어의 뜻풀이. 실패해도 빈 배열로 답한다 — 뜻을 못 불러왔다고 결과 화면이
   * 깨지면 안 된다. 실패한 Promise 는 캐시에서 지워 다음에 다시 시도한다.
   */
  function of(word) {
    if (!word) return Promise.resolve([]);
    if (cache[word]) return cache[word];
    var pending = get(DEFINE_URL + '?w=' + encodeURIComponent(word))
      .then(function (data) { return (data && data.ok && data.senses) || []; })
      .catch(function () {
        delete cache[word];
        return [];
      });
    cache[word] = pending;
    return pending;
  }

  /**
   * 출제용 추천 단어 하나와 그 뜻풀이. 정답 후보에서 뽑으므로 받은 사람이
   * 풀 수 있다. 못 받으면 null — 부르는 쪽이 조용히 넘어가면 된다.
   */
  function suggest(n) {
    return get(SUGGEST_URL + '?n=' + encodeURIComponent(n))
      .then(function (data) {
        if (!data || !data.ok || !data.word) return null;
        cache[data.word] = Promise.resolve(data.senses || []);
        return { word: data.word, senses: data.senses || [] };
      })
      .catch(function () { return null; });
  }

  /**
   * 뜻풀이를 화면에 넣는다. 첫 뜻만 펼치고 나머지는 접는다 — 평균 1.3개라
   * 대부분은 접힌 것이 없고, 여러 개인 단어에서만 '뜻 더 보기'가 보인다.
   *
   * 뜻풀이는 사전에서 온 문장이지만 innerHTML 로 넣지 않는다. 원본이 무엇을
   * 담고 있는지는 우리가 정하지 않으므로, 넣는 쪽에서 텍스트로 못 박는다.
   */
  function render(el, senses) {
    if (!el) return;
    el.textContent = '';
    if (!senses || !senses.length) return;

    var first = document.createElement('p');
    first.className = 'sense';
    first.textContent = senses[0];
    el.appendChild(first);

    if (senses.length < 2) return;

    var more = document.createElement('details');
    more.className = 'sense-more';
    var sum = document.createElement('summary');
    sum.textContent = '뜻 ' + (senses.length - 1) + '개 더';
    more.appendChild(sum);
    var list = document.createElement('ol');
    senses.slice(1).forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      list.appendChild(li);
    });
    more.appendChild(list);
    el.appendChild(more);
  }

  /** 단어를 물어 그 자리에 그린다. 흔한 쓰임을 한 줄로 묶어 둔다. */
  function fill(el, word) {
    return of(word).then(function (senses) {
      render(el, senses);
      return senses;
    });
  }

  global.Define = { of: of, suggest: suggest, render: render, fill: fill };
})(window);
