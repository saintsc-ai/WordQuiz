/*
 * game.js — 게임 상태와 채점 로직 (DOM 을 만지지 않는다)
 */
(function (global) {
  'use strict';

  var MAX_TRIES = 5;

  /**
   * 워들 채점. 자리까지 맞으면 'ok', 들어있지만 자리가 다르면 'warn', 아니면 'off'.
   *
   * 같은 자모가 여러 번 나올 때를 위해 두 번 훑는다.
   * 1차: 자리가 맞는 것부터 확정하고 정답 쪽 개수를 깎는다.
   * 2차: 남은 개수 안에서만 'warn' 을 준다. 이래야 정답에 ㄱ이 하나인데
   *      ㄱ을 둘 쓴 추측에서 노란색이 두 개 뜨는 일이 없다.
   */
  function score(guess, answer) {
    var n = answer.length;
    var result = new Array(n).fill('off');
    var pool = {};
    var i, ch;

    for (i = 0; i < n; i++) {
      if (guess[i] === answer[i]) {
        result[i] = 'ok';
      } else {
        ch = answer[i];
        pool[ch] = (pool[ch] || 0) + 1;
      }
    }
    for (i = 0; i < n; i++) {
      if (result[i] === 'ok') continue;
      ch = guess[i];
      if (pool[ch] > 0) {
        result[i] = 'warn';
        pool[ch]--;
      }
    }
    return result;
  }

  var RANK = { off: 0, warn: 1, ok: 2 };

  /**
   * skip(word) 가 참인 단어는 무작위로 뽑지 않는다. 이미 점수를 등록해
   * 답을 아는 단어를 다시 내밀지 않으려는 것이다(js/store.js 의 isScored).
   * 링크로 받은 단어는 이 걸름망을 지나지 않는다 — 그건 풀라고 준 것이다.
   */
  function Game(dict, skip) {
    this.dict = dict;
    this.length = dict.length;
    this.skip = typeof skip === 'function' ? skip : null;
    this.reset();
  }

  /** 남은 후보에서 하나 고른다. 전부 걸러졌으면 전체에서 고른다. */
  function pick(pool, skip) {
    var left = skip ? pool.filter(function (w) { return !skip(w); }) : pool;
    if (!left.length) left = pool;
    return left[Math.floor(Math.random() * left.length)];
  }

  /**
   * 판을 새로 깐다. word 를 주면 그 단어를, 없으면 정답 후보에서 무작위로 고른다.
   * 주어진 word 가 이 길이의 사전 단어가 아니면 아무것도 바꾸지 않고 false.
   */
  Game.prototype.reset = function (word) {
    var jamo;
    if (word) {
      jamo = global.Jamo.decompose(word);
      if (!jamo || jamo.length !== this.length || !this.dict.valid.has(jamo)) return false;
    } else {
      word = pick(this.dict.answers, this.skip);
      jamo = global.Jamo.decompose(word);
    }
    this.answer = word;
    this.answerJamo = jamo;
    this.rows = [];        // [{ jamo, marks }]
    this.current = '';     // 입력 중인 자모열
    this.keyState = {};    // 자모 -> ok|warn|off (좋은 쪽이 이긴다)
    this.status = 'play';  // play | win | lose
    this.startedAt = Date.now();
    this.finishedAt = null;
    return true;
  };

  Game.prototype.type = function (key) {
    if (this.status !== 'play') return false;
    if (this.current.length >= this.length) return false;
    this.current += key;
    return true;
  };

  Game.prototype.back = function () {
    if (this.status !== 'play' || !this.current) return false;
    this.current = this.current.slice(0, -1);
    return true;
  };

  Game.prototype.isFull = function () {
    return this.current.length === this.length;
  };

  /** 제출. { ok:false, reason } 또는 { ok:true, marks } 를 돌려준다. */
  Game.prototype.submit = function () {
    if (this.status !== 'play') return { ok: false, reason: 'done' };
    if (!this.isFull()) return { ok: false, reason: 'short' };
    if (!this.dict.valid.has(this.current)) return { ok: false, reason: 'unknown' };

    var marks = score(this.current, this.answerJamo);
    for (var i = 0; i < marks.length; i++) {
      var k = this.current[i];
      if (!(k in this.keyState) || RANK[marks[i]] > RANK[this.keyState[k]]) {
        this.keyState[k] = marks[i];
      }
    }
    this.rows.push({ jamo: this.current, marks: marks });
    var won = this.current === this.answerJamo;
    this.current = '';
    if (won) this.status = 'win';
    else if (this.rows.length >= MAX_TRIES) this.status = 'lose';
    if (this.status !== 'play') this.finishedAt = Date.now();
    return { ok: true, marks: marks };
  };

  /** 성공 점수. 빠른 성공일수록 회수 보너스가 커진다. */
  Game.prototype.score = function () {
    if (this.status !== 'win') return 0;
    return this.length * (MAX_TRIES + 1 - this.rows.length);
  };

  Game.prototype.elapsedSeconds = function () {
    var end = this.finishedAt || Date.now();
    return Math.max(0, Math.round((end - this.startedAt) / 1000));
  };

  /** 결과 공유용 이모지 격자. */
  Game.prototype.shareText = function () {
    var head = '한글 워들 · 자모 ' + this.length + '칸  ' +
      (this.status === 'win' ? this.rows.length : 'X') + '/' + MAX_TRIES;
    var icon = { ok: '🟩', warn: '🟨', off: '⬜' };
    var body = this.rows.map(function (r) {
      return r.marks.map(function (m) { return icon[m]; }).join('');
    }).join('\n');
    return head + '\n' + body;
  };

  /*
   * 공유 링크용 코드. 정답 단어를 UTF-8 -> XOR -> base64url 로 감싼다.
   * 암호가 아니라 URL 에 정답이 그대로 보이지 않게 하려는 것뿐이다.
   */
  var MASK = 0x5a;

  function encode(word) {
    var bytes = new TextEncoder().encode(word);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ MASK);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(code) {
    var bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ MASK;
    return new TextDecoder().decode(bytes);
  }

  Game.prototype.code = function () { return encode(this.answer); };

  /** 현재 판의 정답과 시도 기록을 결과 공유 링크에 담는다. */
  Game.prototype.resultCode = function () {
    var payload = {
      answer: this.answer,
      status: this.status,
      rows: this.rows,
      elapsedSeconds: this.elapsedSeconds()
    };
    return encode(JSON.stringify(payload));
  };

  /** 결과 공유 링크에서 복원한 기록을 현재 판에 적용한다. */
  Game.prototype.restoreResult = function (code) {
    var payload;
    try {
      payload = JSON.parse(decode(code));
    } catch (e) {
      return false;
    }
    if (!payload || payload.answer !== this.answer ||
        (payload.status !== 'win' && payload.status !== 'lose') ||
        !Array.isArray(payload.rows) || payload.rows.length > MAX_TRIES) {
      return false;
    }
    for (var i = 0; i < payload.rows.length; i++) {
      var row = payload.rows[i];
      if (!row || typeof row.jamo !== 'string' || row.jamo.length !== this.length ||
          !Array.isArray(row.marks) || row.marks.length !== this.length ||
          !this.dict.valid.has(row.jamo)) return false;
      // 채점표는 믿지 않고 다시 매겨 본다. 손댄 격자를 자기 기록인 양 퍼뜨리지 못하게.
      var expected = score(row.jamo, this.answerJamo);
      for (var j = 0; j < expected.length; j++) {
        if (row.marks[j] !== expected[j]) return false;
      }
    }
    // 마지막 줄이 정답이면 win, 아니면 lose 여야 앞뒤가 맞는다.
    var lastWon = payload.rows.length > 0 &&
      payload.rows[payload.rows.length - 1].jamo === this.answerJamo;
    if (lastWon !== (payload.status === 'win')) return false;
    if (payload.status === 'lose' && payload.rows.length !== MAX_TRIES) return false;
    this.rows = payload.rows;
    this.current = '';
    this.status = payload.status;
    this.finishedAt = Date.now();
    this.startedAt = this.finishedAt - (Number(payload.elapsedSeconds) || 0) * 1000;
    this.keyState = {};
    this.rows.forEach(function (row) {
      row.marks.forEach(function (mark, index) {
        if (mark !== 'ok' && mark !== 'warn' && mark !== 'off') return;
        var key = row.jamo[index];
        if (!(key in this.keyState) || RANK[mark] > RANK[this.keyState[key]]) {
          this.keyState[key] = mark;
        }
      }, this);
    }, this);
    return true;
  };

  Game.MAX_TRIES = MAX_TRIES;
  Game.score = score;
  Game.encode = encode;
  Game.decode = decode;
  global.Game = Game;
})(window);
