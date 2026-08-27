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

  /*
   * 판이 끝난 뒤, 마지막 추측 때 후보가 몇 개 남아 있었는지.
   *
   * 채점은 Game.score 를 그대로 쓴다 — 규칙을 두 벌로 두면 언젠가 어긋나고,
   * 그때 이 숫자는 조용히 거짓말을 하게 된다.
   *
   * 후보는 정답 후보 목록(ANSWERS[n])에서 센다. 추측 허용 목록이 아니다 —
   * 판을 낼 때 뽑은 자리가 거기이므로, 플레이어가 실제로 상대한 경우의 수도 거기다.
   *
   * 이긴 판은 마지막 추측 '직전'까지의 정보로 센다. 그게 그 순간 골라야 했던
   * 경우의 수다. 진 판은 다 쓰고 난 뒤에 몇 개가 남았는지를 센다.
   *
   * 셀 수 없으면 null — 직접 낸 단어가 정답 후보 밖일 수 있고, 그때 이 숫자는
   * 뜻이 없다. 부르는 쪽이 그 줄을 그리지 않으면 된다.
   */
  function odds(game) {
    var answers = global.ANSWERS && global.ANSWERS[game.length];
    if (!answers || !answers.length || !global.Game || !global.Game.score) return null;
    if (!game.rows || !game.rows.length) return null;

    var jamoOf = global.Jamo.decompose;
    var pool = [];
    for (var i = 0; i < answers.length; i++) {
      var j = jamoOf(answers[i]);
      if (j && j.length === game.length) pool.push(j);
    }
    if (!pool.length) return null;

    var won = game.status === 'win';
    // 이긴 판이면 마지막(맞힌) 추측은 빼고 센다.
    var upto = won ? game.rows.length - 1 : game.rows.length;

    for (var r = 0; r < upto; r++) {
      var row = game.rows[r];
      if (!row || !row.jamo || !row.marks) return null;
      pool = pool.filter(function (cand) {
        var got = global.Game.score(row.jamo, cand);
        for (var k = 0; k < got.length; k++) {
          if (got[k] !== row.marks[k]) return false;
        }
        return true;
      });
    }

    // 정답이 후보에 없으면(직접 낸 단어 등) 이 숫자는 뜻이 없다.
    if (game.answerJamo && pool.indexOf(game.answerJamo) < 0) return null;
    return { left: pool.length, tries: game.rows.length, won: won };
  }

  /*
   * 판이 끝난 뒤 한 줄. 셀 수 없으면 빈 문자열.
   *
   * 성적표가 아니라 판이 끝나고 건네는 말이다. 백분율은 쓰지 않는다 —
   * 6,996분의 1을 '0.0%' 라고 적으면 가장 잘한 판이 0점처럼 보이고,
   * 몇 개 중 하나였는지가 훨씬 잘 와닿는다.
   *
   * 진 판도 나무라지 않는다. 5번을 다 쓰고도 못 맞힌 사람에게 필요한 말은
   * 몇 개가 남았다는 사실이 아니라 어디까지 갔었는지다. 그래서 이긴 판은
   * 줄표로 담백하게 잇고, 진 판만 말줄임표로 한 박자 쉰다.
   */
  function oddsText(game) {
    var o = odds(game);
    if (!o || !o.left) return '';
    var many = o.left.toLocaleString();

    if (!o.won) {
      if (o.left === 1) return '아쉬워요… 딱 한 단어를 남기고 끝났네요';
      if (o.left <= 5) return '아쉬워요… ' + many + '개까지 좁혔는데요';
      return '아쉬워요… 아직 ' + many + '개가 남아 있었어요';
    }
    if (o.tries === 1) {
      return '와우! 한 번에 맞혔어요 — ' + many + '개 중 하나였는데요';
    }
    if (o.left === 1) return '범위를 잘 좁혔네요 — 마지막 한 단어였어요';
    if (o.left > 100) return '잘 찍었네요 — ' + many + '개 중 하나였어요';
    if (o.left > 10) return '운이 좋네요 — ' + many + '개 중 하나였어요';
    return '접근을 잘했네요 — ' + many + '개 중 하나였어요';
  }

  global.Define = { of: of, suggest: suggest, render: render, fill: fill,
                    odds: odds, oddsText: oddsText };
})(window);
