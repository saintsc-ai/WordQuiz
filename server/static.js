'use strict';

/*
 * 정적 파일 서빙. 화면과 API 를 한 오리진에서 내보내므로 CORS 가 없다.
 * (Apps Script 배포는 다른 오리진이라 POST 에 text/plain 을 써서 프리플라이트를
 *  피해야 했다. 여기서는 그럴 일이 없지만, 화면은 두 배포를 같은 코드로
 *  돌아야 하니 그대로 둔다.)
 */

var fs = require('node:fs');
var path = require('node:path');

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
};

/*
 * 요청 경로를 root 안의 실제 파일로 바꾼다. root 밖으로 나가면 null.
 * 심볼릭 링크까지 따라가 확인해야 해서 realpath 를 쓴다.
 */
function resolve(root, pathname) {
  var decoded;
  try { decoded = decodeURIComponent(pathname); } catch (err) { return null; }
  if (decoded.indexOf('\0') >= 0) return null;

  var target = path.resolve(root, '.' + path.posix.normalize(decoded));
  var real;
  try { real = fs.realpathSync(target); } catch (err) { return null; }
  if (real !== root && real.indexOf(root + path.sep) !== 0) return null;

  var stat;
  try { stat = fs.statSync(real); } catch (err) { return null; }
  if (stat.isDirectory()) return resolve(root, path.posix.join(decoded, 'index.html'));
  if (!stat.isFile()) return null;
  return { file: real, stat: stat };
}

/*
 * 파일 주소에 ?v= 가 붙어 있으면 영원히 캐시해도 된다. index.html 이 버전을
 * 올리는 순간 주소가 바뀌기 때문이다. index.html 자체는 늘 다시 물어본다.
 */
function cacheControl(pathname, versioned) {
  if (/\.html$/.test(pathname)) return 'no-cache';
  return versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
}

function etagOf(stat) {
  return '"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
}

/** 보냈으면 true. 파일이 없으면 false 를 돌려주고 호출한 쪽이 404 를 낸다. */
function send(req, res, root, url, index) {
  var pathname = url.pathname;
  var body = null;

  // index.html 은 시작할 때 한 번 읽어 API 주소를 심어 둔 것을 쓴다.
  var etag;
  if (index && (pathname === '/' || pathname === '/index.html')) {
    body = index.body;
    etag = index.etag;
    pathname = '/index.html';
  } else {
    var found = resolve(root, pathname);
    if (!found) return false;
    body = fs.readFileSync(found.file);
    etag = etagOf(found.stat);
    pathname = found.file;
  }

  res.setHeader('Cache-Control', cacheControl(pathname, url.searchParams.has('v')));
  res.setHeader('ETag', etag);
  res.setHeader('Content-Type', TYPES[path.extname(pathname).toLowerCase()] || 'application/octet-stream');

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return true;
  }
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

module.exports = { send: send };
