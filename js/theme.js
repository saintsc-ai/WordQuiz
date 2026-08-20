/*
 * theme.js — 밝게 / 어둡게 전환
 *
 * <head> 에서 다른 스크립트보다 먼저 돈다. 첫 페인트 전에 data-theme 을 찍어야
 * 어두운 화면이 한 번 번쩍이고 밝아지는 일이 없다. 그래서 js/store.js 에 기대지
 * 않고 여기서 직접 localStorage 를 읽는다.
 *
 * 저장하는 값은 system | light | dark 세 가지다. system 이면 OS 설정을 따라가고,
 * OS 설정이 바뀌면 새로고침 없이 따라 바뀐다.
 */
(function (global) {
  'use strict';

  var KEY = 'wordquiz.theme';
  var MODES = ['system', 'light', 'dark'];
  var LABELS = { system: '시스템', light: '밝게', dark: '어둡게' };
  var BAR = { light: '#e8e8ec', dark: '#0d0d0f' };   // 모바일 주소창 색

  var query = global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null;
  var listeners = [];

  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      return MODES.indexOf(saved) >= 0 ? saved : 'system';
    } catch (e) {
      return 'system';
    }
  }

  var mode = read();

  function resolve(m) {
    if (m === 'light' || m === 'dark') return m;
    return query && query.matches ? 'light' : 'dark';
  }

  function apply() {
    var resolved = resolve(mode);
    document.documentElement.setAttribute('data-theme', resolved);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR[resolved]);
    listeners.forEach(function (fn) { fn(mode, resolved); });
  }

  function set(next) {
    if (MODES.indexOf(next) < 0) return;
    mode = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* 저장 못 해도 이번 세션은 바뀐다 */ }
    apply();
  }

  // system 을 고른 사람은 OS 설정이 바뀌면 따라가야 한다.
  if (query) {
    var onChange = function () { if (mode === 'system') apply(); };
    if (query.addEventListener) query.addEventListener('change', onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  apply();

  global.Theme = {
    MODES: MODES,
    LABELS: LABELS,
    mode: function () { return mode; },
    resolved: function () { return resolve(mode); },
    set: set,
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
