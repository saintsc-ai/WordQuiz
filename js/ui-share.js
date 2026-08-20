/*
 * ui-share.js — 링크 만들기 · 해시 읽기 · 클립보드
 *
 * 정답과 결과는 URL 해시에 인코딩해 실어 보낸다(js/game.js 의 encode).
 * 주소만 봐서는 알 수 없게 하는 정도이지 암호가 아니다.
 */
(function (global) {
  'use strict';

  function base() { return location.href.replace(/#.*$/, ''); }

  /** 단어 하나를 그대로 낼 수 있는 링크. */
  function linkFor(word) { return base() + '#p=' + global.Game.encode(word); }

  /** 지금 판의 정답과 시도 기록을 담은 링크. */
  function resultLink(game) { return base() + '#r=' + game.resultCode(); }

  function puzzleCode() {
    var m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
    return m ? m[1] : null;
  }

  function resultCode() {
    var m = /[#&]r=([A-Za-z0-9_-]+)/.exec(location.hash);
    return m ? m[1] : null;
  }

  function clearHash() {
    if (!location.hash) return;
    // file:// 에서는 replaceState 가 막힐 수 있다.
    try {
      history.replaceState(null, '', base());
    } catch (e) {
      location.hash = '';
    }
  }

  function replaceHash(url) {
    try { history.replaceState(null, '', url); } catch (e) { /* file:// */ }
  }

  /** clipboard API 는 https / localhost 에서만 쓸 수 있어 대체 경로를 둔다. */
  function copy(text) {
    if (navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { resolve(); } else { reject(new Error('copy failed')); }
    });
  }

  function copyThen(text, msg) {
    copy(text).then(function () {
      global.UISheet.toast(msg);
    }).catch(function () {
      global.UISheet.toast('복사하지 못했어요');
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatTime(seconds) {
    var n = Number(seconds) || 0;
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  }

  global.UIShare = {
    linkFor: linkFor,
    resultLink: resultLink,
    puzzleCode: puzzleCode,
    resultCode: resultCode,
    clearHash: clearHash,
    replaceHash: replaceHash,
    copyThen: copyThen,
    escapeHtml: escapeHtml,
    formatTime: formatTime
  };
})(window);
