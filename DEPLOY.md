# 자체 서버 배포 (dropthe.codes)

기존 배포는 그대로 둡니다. GitHub Pages + Apps Script + Google Sheets 는 손대지 않고,
같은 저장소를 컨테이너로 한 벌 더 띄웁니다. 두 배포는 서로를 모르며 기록도 각자 씁니다.

|  | 기존 | 자체 서버 |
|---|---|---|
| 화면 | GitHub Pages | 같은 컨테이너 |
| 스코어보드 | Apps Script + Sheets | 같은 컨테이너의 `/api` |
| 저장소 | Google Sheet | 볼륨 위 SQLite 파일 하나 |
| 순위 한 번 부르는 데 | 2~3초 | 수 ms |

## 왜 이 모양인가

**컨테이너 하나에 화면과 API 를 같이 둡니다.** 오리진이 하나라 CORS 가 없고, 배포도
한 번입니다. 화면이 API 주소를 알아야 할 일도 없습니다 — 서버가 `index.html` 을
내려줄 때 `window.WORDQUIZ_API_URL = '/api'` 를 심어 줍니다. 저장소의 `index.html` 은
그대로라서 GitHub Pages 쪽은 아무 영향을 받지 않고, `js/scoreboard.js` 는 그 값이
없으면 Apps Script 주소로 떨어집니다.

**관리형 DB 대신 SQLite 를 씁니다.** 쓰기는 판이 끝날 때 `INSERT` 한 번이고 읽기는
집계뿐입니다. 이 부하에 DB 파드를 따로 띄우면 CPU 와 메모리만 더 먹습니다. Block
볼륨은 어차피 한 Pod 전용이라 `--replicas 1` 이고, SQLite 의 단일 라이터 제약이 실제
제약이 되지 않습니다. 백업도 파일 하나를 복사하면 끝입니다.

나중에 넘어갈 자리는 있습니다. 레플리카를 늘려야 하거나 밖에서 직접 쿼리하고
싶어지면 `dtc db create` 로 Postgres 를 붙이고 `server/db.js` 만 갈아 끼웁니다.
집계는 `server/rank.js` 가 따로 들고 있어 저장소가 바뀌어도 그대로입니다.

**서버 캐시는 두지 않았습니다.** Apps Script 의 `CacheService` 5분 캐시는 시트를 여는
데만 2~3초가 걸려서 있던 것입니다. SQLite 는 매 요청 계산해도 밀리초라 캐시가
버는 것보다 '방금 등록한 점수가 안 보인다'는 값이 더 큽니다. 화면 쪽 60초 캐시와
미리 받아 두기(`js/scoreboard.js`)는 그대로 두어도 해가 없습니다.

## 파일

```
Dockerfile              node:24-alpine, 의존성 없음
.dockerignore           data/raw · tools · tests 는 이미지에 넣지 않는다
server/server.js        HTTP · 라우팅 · 입력 검증 · index.html 주입
server/db.js            SQLite 스키마와 읽기/쓰기
server/rank.js          순위 계산 (backend/Code.gs 에서 그대로 옮김)
server/static.js        정적 파일 · 캐시 헤더 · 경로 탈출 방지
server/import-csv.js    시트 CSV 를 SQLite 로 옮기기
seed/wordquiz.db        (선택) 첫 배포에 태워 보내는 기록. 커밋하지 않는다
```

`npm install` 이 없습니다. SQLite 는 Node 24 에 들어 있는 `node:sqlite` 를 쓰므로
`package.json` 도 `node_modules` 도 만들지 않습니다. 저장소에 빌드 단계가 없다는
성질을 서버에서도 유지합니다.

## 로컬에서 돌려보기

```bash
docker build -t wordquiz:local .
docker run --rm -p 8080:8080 -v wordquiz-data:/data wordquiz:local
# http://localhost:8080
```

## 배포

```bash
# 1. CLI 설치와 인증
brew install drop-the-codes/tap/dtc
dtc login

# 2. 기록을 담을 볼륨 (5GB 면 차고 넘친다)
dtc storage create wordquiz-data --size 5

# 3. 이미지 올리기
docker build -t wordquiz:latest .
dtc image push wordquiz:latest

# 4. 배포
dtc deploy --name wordquiz \
  --image wordquiz:latest \
  --port 8080 \
  --cpu 250m --memory 256Mi \
  --replicas 1 \
  --volume wordquiz-data:/data
```

`--replicas` 는 **1 로 둡니다.** Block 볼륨은 한 Pod 만 붙일 수 있고, SQLite 파일도
하나뿐입니다.

도메인을 붙이려면 `--domain wordquiz.example.com` 을 더합니다.

확인:

```bash
dtc logs wordquiz --tail 50     # 뜰 때 tz · db · root 를 한 줄로 찍는다
dtc describe wordquiz
```

`/healthz` 가 `{"ok":true}` 를 돌려줍니다.

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PORT` | `8080` | 듣는 포트 |
| `DB_FILE` | `/data/wordquiz.db` | SQLite 파일. 볼륨 안이어야 남는다 |
| `TZ` | `Asia/Seoul` | **'오늘'의 기준.** 브라우저는 날짜를 보내지 않는다 |
| `STATIC_ROOT` | 저장소 뿌리 | 정적 파일 위치 |
| `SEED_DB` | `/app/seed/wordquiz.db` | 볼륨이 비어 있을 때 한 번만 복사하는 씨앗 |
| `ADMIN_KEY` | 없음 | 백업 내려받기 열쇠. 비우면 `/export` 가 없는 주소가 된다 |

```bash
dtc env set wordquiz TZ=Asia/Seoul
```

`TZ` 를 바꾸면 그 뒤로 들어오는 기록의 `puzzleDate` 가 바뀝니다. 이미 쌓인 기록은
그대로라 하루 경계가 한 번 어긋납니다. 처음에 정하고 두는 편이 낫습니다.

## 기존 기록 옮기기

`dtc` 에는 컨테이너 안으로 파일을 넣거나 명령을 실행하는 수단이 없습니다. 그래서
**기록을 이미지에 태워 보냅니다.** 볼륨이 비어 있을 때 서버가 씨앗 파일을 한 번
복사하고, 그 뒤로는 쳐다보지 않습니다.

```bash
# 1. Google Sheet > 파일 > 다운로드 > 쉼표로 구분된 값(.csv)

# 2. 로컬에서 SQLite 로 옮긴다 (Node 24 이상)
DB_FILE=./seed/wordquiz.db node server/import-csv.js results.csv
# 넣음 412 · 넘어감 0

# 3. 이미지에 실어 배포한다
docker build -t wordquiz:latest .
dtc image push wordquiz:latest
dtc deploy --name wordquiz --image wordquiz:latest --port 8080 \
  --volume wordquiz-data:/data
```

로컬에 Node 가 없으면 컨테이너로 돌립니다.

```bash
docker run --rm -v "$PWD:/app" -w /app node:24-alpine \
  node --disable-warning=ExperimentalWarning server/import-csv.js results.csv
```

`seed/` 는 `.gitignore` 에 있고 `.dockerignore` 에는 없습니다. 커밋되지 않으면서
이미지에는 들어갑니다.

첫 줄을 헤더로 보고 이름으로 짝을 맞추므로 열 순서는 상관없습니다. 시트가
`2026. 8. 21` 처럼 내보낸 날짜도 읽습니다. 겹치는 `(clientId, puzzleId)` 는 유일
인덱스가 걸러 내니 몇 번을 다시 돌려도 같은 판이 두 번 들어가지 않습니다.

씨앗은 **볼륨이 빈 첫 배포에만** 듣습니다. 이미 돌고 있는 배포에 뒤늦게 넣으려면
`/export` 로 지금 것을 받아 CSV 를 합친 뒤, 볼륨을 지우고 새 씨앗으로 다시 올려야
합니다.

### 기록이 갈리는 것

두 배포를 같이 굴리면 그때부터 기록이 갈립니다. 한쪽을 정본으로 삼든지, 갈린 채로
두고 순위표를 둘로 보든지 정해야 합니다. 나중에 합치는 길은 없습니다 — `clientId` 는
브라우저마다 다르고 두 주소는 `localStorage` 를 나눠 쓰니, 같은 사람도 두 배포에서
다른 사람으로 잡힙니다.

## 백업

`ADMIN_KEY` 를 정해 두면 `/export` 가 시트와 같은 모양의 CSV 를 내려줍니다.
`server/import-csv.js` 로 그대로 되넣을 수 있습니다.

```bash
dtc env set wordquiz ADMIN_KEY=$(openssl rand -hex 16)
curl -fsS "https://wordquiz.example.com/export?key=..." > backup-$(date +%F).csv
```

열쇠가 없거나 틀리면 **404** 입니다. 있는 주소인 것조차 알리지 않습니다.
응답에는 `clientId` 가 함께 나가므로 열쇠를 흘리지 않게 합니다.

`cron` 이나 GitHub Actions 에 위 `curl` 한 줄을 걸어 두면 그게 백업 전부입니다.

## API

`backend/Code.gs` 의 계약을 그대로 따릅니다. 주소 하나에 GET 은 순위, POST 는 등록입니다.

```
GET  /api?action=daily|overall&mode=total|time|score[&date=yyyy-MM-dd][&length=5..10]
POST /api   {"action":"submit","clientId":…,"nickname":…,"puzzleId":…,
             "jamoLength":…,"attempts":…,"score":…,"elapsedSeconds":…,"won":…}
```

응답 모양도 같습니다 — `{ok, mode, total, rows}`. 순위 규칙은
[SCOREBOARD_SETUP.md](SCOREBOARD_SETUP.md) 의 '동작 범위' 그대로입니다.

요청 내용이 잘못된 경우(`invalid_json` · `invalid_action` · `missing_fields`)는 Apps
Script 와 맞춰 **200 에 `{ok:false,error}`** 로 답합니다. 화면이 그 모양에 맞춰져 있고,
`js/scoreboard.js` 는 HTTP 상태가 나쁘면 본문을 읽기 전에 던져 버려 오류 이름이
사라집니다. 없는 주소(404)와 서버 오류(500)만 진짜 상태 코드를 씁니다.

등록 시각과 날짜는 **서버가 찍습니다.** 화면이 보낸 값은 쓰지 않습니다.

이 밖에 `GET /healthz` 와 `GET /export?key=…` 가 있습니다.

## 알아 둘 것

- 컨테이너를 **root 로 돌립니다.** 붙는 볼륨이 root 소유로 올라오는 일이 잦아
  사용자를 낮추면 첫 쓰기에서 `EACCES` 로 죽습니다. 자랑용 순위표 하나라 여기까지 합니다.
- `node:sqlite` 는 아직 실험 딱지가 붙어 있습니다. `node:24-alpine` 으로 태그를
  고정해 두었으니 이미지를 다시 만들지 않는 한 흔들리지 않습니다.
- 점수 조작을 막는 장치는 없습니다. Apps Script 배포와 같은 신뢰 모델입니다.
