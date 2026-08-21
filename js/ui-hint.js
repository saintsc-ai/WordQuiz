/*
 * ui-hint.js — 힌트 시트
 *
 * 이 길이의 단어가 어떤 것들인지 하나 보여 줄 뿐, 정답을 짚어 주지 않는다.
 * 값이 싸지 않으므로(점수 -자모수, 시간 +20초 x 자모수) 먼저 얼마인지 알리고
 * 확인을 받은 뒤에 꺼낸다.
 */
(function (global) {
  'use strict';

  var Sheet = global.UISheet;
  var Share = global.UIShare;

  function cost(game) {
    return {
      score: game.length,
      seconds: 20 * game.length
    };
  }

  function costLine(game) {
    var c = cost(game);
    return '점수 <b>−' + c.score + '점</b> · 시간 <b>+' + Share.formatTime(c.seconds) + '</b>';
  }

  function show(game) {
    if (!game || game.status !== 'play') return;

    Sheet.open(
      '<h2>힌트</h2>' +
      '<p class="hint">자모 ' + game.length + '칸짜리 단어를 하나 보여 줍니다.<br>' +
        '<b>정답은 아니고</b>, 이미 낸 단어도 아닙니다.</p>' +
      '<p class="hint-cost">' + costLine(game) +
        (game.hintsUsed ? '<br>이번 판에 ' + game.hintsUsed + '번 봤어요.' : '') + '</p>' +
      '<div class="sheet-actions">' +
        '<button type="button" id="act-hint-no">그만두기</button>' +
        '<button type="button" class="primary" id="act-hint-go">힌트 보기</button>' +
      '</div>'
    );

    document.getElementById('act-hint-no').addEventListener('click', Sheet.close);
    document.getElementById('act-hint-go').addEventListener('click', function () {
      var word = game.hint();
      if (!word) {
        Sheet.open('<h2>힌트</h2><p class="hint">더 보여 줄 단어가 없어요.</p>');
        return;
      }
      Sheet.open(
        '<h2>힌트</h2>' +
        '<p class="hint">자모 ' + game.length + '칸짜리 단어입니다.</p>' +
        '<div class="answer">' + Share.escapeHtml(word) + '</div>' +
        '<div class="hint-jamo">' + Share.escapeHtml(global.Jamo.decompose(word).split('').join(' ')) + '</div>' +
        '<p class="hint">이 판의 정답은 아닙니다.<br>' + costLine(game) + ' 가 적용됐어요.</p>' +
        '<div class="sheet-actions">' +
          '<button type="button" class="primary" id="act-hint-close">닫기</button>' +
        '</div>'
      );
      document.getElementById('act-hint-close').addEventListener('click', Sheet.close);
    });
  }

  global.UIHint = { show: show, cost: cost };
})(window);
