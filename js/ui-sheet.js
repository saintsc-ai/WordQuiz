/*
 * ui-sheet.js — 시트(모달) 셸과 토스트
 *
 * 시트는 네 가지 내용(결과 · 순위 · 출제 · 규칙)을 돌려 쓰므로
 * 열고 닫기와 포커스 처리를 여기 한 곳에만 둔다.
 *
 * 포커스: 열 때 시트 안으로 옮기고, 열려 있는 동안 Tab 이 밖으로 새지 않게 하며,
 * 닫을 때 열기 전에 보던 곳으로 되돌린다. 이게 없으면 키보드나 스크린리더
 * 사용자는 시트가 떠 있는데도 뒤쪽 보드와 자판을 돌아다니게 된다.
 */
(function (global) {
  'use strict';

  var sheet = document.getElementById('sheet');
  var card = sheet.querySelector('.sheet-card');
  var body = document.getElementById('sheet-body');
  var closeBtn = document.getElementById('sheet-close');
  var toastEl = document.getElementById('toast');

  var TOAST_MS = 1600;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
                  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var lastFocused = null;
  var toastTimer = null;
  var closeOnce = [];   // 다음 닫힘 때 한 번만 부를 것들

  function focusable() {
    return Array.prototype.filter.call(card.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === closeBtn;
    });
  }

  function isOpen() { return !sheet.hidden; }

  /**
   * 시트를 연다. title 을 주면 제목과 dialog 를 aria-labelledby 로 묶는다.
   * focus 를 주면(선택자) 그 요소에, 없으면 첫 번째 조작 가능한 요소에 포커스한다.
   */
  function open(html, options) {
    options = options || {};
    if (!isOpen()) lastFocused = document.activeElement;

    body.innerHTML = html;
    sheet.hidden = false;

    var heading = body.querySelector('h2');
    if (heading) {
      if (!heading.id) heading.id = 'sheet-title';
      card.setAttribute('aria-labelledby', heading.id);
    } else {
      card.removeAttribute('aria-labelledby');
    }

    var target = options.focus ? body.querySelector(options.focus) : null;
    if (!target) target = focusable()[0] || closeBtn;
    if (target && target.focus) target.focus();
  }

  /** 다음에 시트가 닫힐 때 한 번 부른다. 시트를 열어 둔 쪽이 뒷정리할 자리다. */
  function onClose(fn) {
    closeOnce.push(fn);
  }

  function close() {
    if (!isOpen()) return;
    sheet.hidden = true;
    card.removeAttribute('aria-labelledby');
    // 시트를 열기 전에 보던 곳으로 돌려준다.
    if (lastFocused && lastFocused.focus && document.contains(lastFocused)) lastFocused.focus();
    lastFocused = null;

    var pending = closeOnce;
    closeOnce = [];
    pending.forEach(function (fn) { fn(); });
  }

  /** Tab 이 시트 밖으로 나가지 않게 양 끝에서 되돌린다. */
  function trap(e) {
    if (e.key !== 'Tab') return;
    var items = focusable();
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, TOAST_MS);
  }

  closeBtn.addEventListener('click', close);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });

  global.UISheet = {
    open: open,
    close: close,
    onClose: onClose,
    isOpen: isOpen,
    trap: trap,
    toast: toast,
    body: function () { return body; }
  };
})(window);
