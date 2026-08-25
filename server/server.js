'use strict';

/*
 * WordQuiz 자체 배포 서버.
 *
 * 화면(정적 파일)과 스코어보드 API 를 한 컨테이너에서 같은 오리진으로 내보낸다.
 * GitHub Pages + Apps Script 배포는 그대로 두고 이쪽만 따로 돌린다.
 *
 * API 는 backend/Code.gs 의 계약을 그대로 따른다. 주소 하나에 GET 은 순위,
 * POST 는 등록이다. 그래야 js/scoreboard.js 가 API_URL 만 바꿔 두 배포를
 * 같은 코드로 쓸 수 있다.
 *
 *   GET  /api?action=daily|overall&mode=total|time|score[&date=&length=]
 *   POST /api   {"action":"submit", ...}
 *
 * Apps Script 는 무엇이 잘못돼도 200 에 {ok:false} 를 실어 보낸다(플랫폼 제약).
 * 화면이 그 모양에 맞춰져 있으므로 여기서도 요청 내용이 잘못된 경우는 200 에
 * {ok:false,error} 로 답한다. 없는 주소와 서버 오류만 진짜 상태 코드를 쓴다.
 */

var http = require('node:http');
var crypto = require('node:crypto');
var fs = require('node:fs');
var path = require('node:path');

var db = require('./db');
var rank = require('./rank');
var statics = require('./static');

var PORT = Number(process.env.PORT) || 8080;
var DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'var', 'wordquiz.db');
var ROOT = fs.realpathSync(process.env.STATIC_ROOT || path.join(__dirname, '..'));

/*
 * '오늘'은 서버 시간대 하나로 정한다. 브라우저는 날짜를 보내지 않는다.
 * 해외에서 접속해도 모두 같은 하루를 본다. TZ 환경변수로 바꾼다.
 */
/*
 * 볼륨이 비어 있을 때 한 번만 쓰는 씨앗. 시트에서 옮겨 온 기록을 배포에
 * 태우는 길이다(DEPLOY.md 의 '기존 기록 옮기기').
 */
var SEED_DB = process.env.SEED_DB || path.join(__dirname, '..', 'seed', 'wordquiz.db');

/*
 * 백업 내려받기 열쇠. 비워 두면 /export 가 아예 없는 주소가 된다.
 * clientId 까지 나가므로 켜 두려면 반드시 값을 정한다.
 */
var ADMIN_KEY = process.env.ADMIN_KEY || '';

var TZ = process.env.TZ || 'Asia/Seoul';
var DATE_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});

function today() {
  var got = {};
  DATE_PARTS.formatToParts(new Date()).forEach(function (part) { got[part.type] = part.value; });
  return got.year + '-' + got.month + '-' + got.day;
}

function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }

var MAX_BODY = 8 * 1024;
var NAME_MAX = 20;
var ID_MAX = 128;

var handle = db.open(DB_FILE, SEED_DB);

/*
 * index.html 은 저장소에 있는 것을 그대로 쓰고, 내려줄 때 API 주소만 심는다.
 * 파일을 고치면 GitHub Pages 배포까지 따라 바뀌므로 건드리지 않는다.
 * js/scoreboard.js 는 이 값이 없으면 Apps Script 주소로 떨어진다.
 */
function loadIndex() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var inject = '<script>window.WORDQUIZ_API_URL = \'/api\';</script>\n</head>';
  if (html.indexOf('</head>') < 0) throw new Error('index.html 에 </head> 가 없다');
  var body = Buffer.from(html.replace('</head>', inject), 'utf8');
  return { body: body, etag: '"index-' + body.length.toString(16) + '"' };
}

var index = loadIndex();

function json(res, value, status) {
  var body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(status || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function getRank(res, url) {
  var params = url.searchParams;
  var mode = rank.MODES[params.get('mode')] ? params.get('mode') : 'total';
  var action = params.get('action') === 'overall' ? 'overall' : 'daily';
  var date = isDate(params.get('date')) ? params.get('date') : today();

  var rows = db.read(handle, action === 'overall' ? null : date);

  // length 로 거르는 건 화면이 쓰지 않는 길이다. 직접 부를 때를 위해 남겨 둔다.
  var length = Number(params.get('length'));
  if (length) rows = rows.filter(function (row) { return row.jamoLength === length; });

  json(res, rank.rank(rows, mode));
}

/*
 * 백업 내려받기. 시트가 내보내는 CSV 와 같은 열, 같은 순서라 그대로
 * server/import-csv.js 로 되넣을 수 있다.
 *
 * clientId 가 함께 나간다. 열쇠가 없으면 있는 주소인 것도 알리지 않는다.
 */
var CSV_HEADERS = [
  'createdAt', 'clientId', 'nickname', 'puzzleId', 'puzzleDate',
  'jamoLength', 'attempts', 'score', 'elapsedSeconds', 'won'
];

function csvCell(value) {
  var text = String(value === null || value === undefined ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function allowed(url) {
  if (!ADMIN_KEY) return false;
  var given = Buffer.from(String(url.searchParams.get('key') || ''), 'utf8');
  var want = Buffer.from(ADMIN_KEY, 'utf8');
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function exportCsv(res, url) {
  if (!allowed(url)) return json(res, { ok: false, error: 'not_found' }, 404);

  var lines = [CSV_HEADERS.join(',')];
  db.read(handle, null).forEach(function (row) {
    lines.push(CSV_HEADERS.map(function (name) {
      return csvCell(name === 'won' ? (row.won ? 'TRUE' : 'FALSE') : row[name]);
    }).join(','));
  });

  var body = Buffer.from(lines.join('\n') + '\n', 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Length': body.length,
    'Content-Disposition': 'attachment; filename="wordquiz-results.csv"',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function clamp(value, low, high) {
  var number = Number(value) || 0;
  return Math.max(low, Math.min(high, number));
}

function submit(res, data) {
  if (data.action !== 'submit') return json(res, { ok: false, error: 'invalid_action' });
  if (!data.clientId || !data.nickname || !data.puzzleId) {
    return json(res, { ok: false, error: 'missing_fields' });
  }

  // 등록 시각도 날짜도 서버가 찍는다. 화면이 보낸 값은 쓰지 않는다.
  var added = db.insert(handle, {
    createdAt: new Date().toISOString(),
    clientId: String(data.clientId).slice(0, ID_MAX),
    nickname: String(data.nickname).trim().slice(0, NAME_MAX),
    puzzleId: String(data.puzzleId).slice(0, ID_MAX),
    puzzleDate: today(),
    jamoLength: clamp(data.jamoLength, 5, 10),
    attempts: clamp(data.attempts, 0, 5),
    score: Math.max(0, Number(data.score) || 0),
    elapsedSeconds: Math.max(0, Number(data.elapsedSeconds) || 0),
    won: Boolean(data.won)
  });

  json(res, { ok: true, duplicate: !added });
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) {
        // 소켓을 끊으면 답을 못 보낸다. 쌓기만 멈추고 남은 것은 흘려보낸다.
        req.removeAllListeners('data');
        req.resume();
        reject(new Error('too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

var server = http.createServer(function (req, res) {
  var url;
  try { url = new URL(req.url, 'http://localhost'); } catch (err) { return json(res, { ok: false, error: 'bad_request' }, 400); }

  try {
    if (url.pathname === '/healthz') return json(res, { ok: true });

    if (url.pathname === '/export' && (req.method === 'GET' || req.method === 'HEAD')) {
      return exportCsv(res, url);
    }

    if (url.pathname === '/api') {
      if (req.method === 'GET' || req.method === 'HEAD') return getRank(res, url);
      if (req.method !== 'POST') return json(res, { ok: false, error: 'method_not_allowed' }, 405);
      return readBody(req).then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (err) { return json(res, { ok: false, error: 'invalid_json' }); }
        submit(res, data);
      }).catch(function (err) {
        json(res, { ok: false, error: err.message === 'too_large' ? 'too_large' : 'server_error' });
      });
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (statics.send(req, res, ROOT, url, index)) return;
    }
    json(res, { ok: false, error: 'not_found' }, 404);
  } catch (err) {
    console.error(req.method, req.url, err);
    json(res, { ok: false, error: 'server_error' }, 500);
  }
});

server.listen(PORT, function () {
  console.log('wordquiz listening on ' + PORT + ' · tz=' + TZ + ' · db=' + DB_FILE + ' · root=' + ROOT);
});

// 쿠버네티스는 SIGTERM 을 보낸다. 받던 요청을 끝내고 파일을 닫는다.
['SIGTERM', 'SIGINT'].forEach(function (signal) {
  process.on(signal, function () {
    server.close(function () {
      try { handle.close(); } catch (err) { /* 이미 닫혔다 */ }
      process.exit(0);
    });
  });
});
