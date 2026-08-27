# 배포 (dropthe.codes)

WordQuiz 의 배포처입니다. 화면과 스코어보드 API 를 컨테이너 하나가 함께 내보내고,
기록은 볼륨 위 SQLite 파일에 씁니다.

2026-08-25 까지 쓰던 GitHub Pages + Apps Script + Google Sheets 배포는 물러났습니다.
그때까지의 기록은 옮겨 왔습니다 — [SCOREBOARD_SETUP.md](SCOREBOARD_SETUP.md) 의
'옛 배포'.

## 왜 이 모양인가

**컨테이너 하나에 화면과 API 를 같이 둡니다.** 오리진이 하나라 CORS 가 없고, 배포도
한 번입니다. 화면은 API 주소를 알 필요가 없습니다 — `js/scoreboard.js` 가 같은
오리진의 `/api` 를 부릅니다.

**관리형 DB 대신 SQLite 를 씁니다.** 쓰기는 판이 끝날 때 `INSERT` 한 번이고 읽기는
집계뿐입니다. 이 부하에 DB 파드를 따로 띄우면 CPU 와 메모리만 더 먹습니다. Block
볼륨은 어차피 한 Pod 전용이라 `--replicas 1` 이고, SQLite 의 단일 라이터 제약이 실제
제약이 되지 않습니다. 백업도 파일 하나를 복사하면 끝입니다.

나중에 넘어갈 자리는 있습니다. 레플리카를 늘려야 하거나 밖에서 직접 쿼리하고
싶어지면 `dtc db create` 로 Postgres 를 붙이고 `server/db.js` 만 갈아 끼웁니다.
집계는 `server/rank.js` 가 따로 들고 있어 저장소가 바뀌어도 그대로입니다.

**서버 캐시는 두지 않았습니다.** 매 요청 계산해도 밀리초라, 캐시가 버는 것보다
'방금 등록한 점수가 안 보인다'는 값이 더 큽니다.

## 파일

```
Dockerfile              node:24-alpine, 의존성 없음
.dockerignore           data/raw · tools · tests 는 이미지에 넣지 않는다
server/server.js        HTTP · 라우팅 · 입력 검증
server/db.js            SQLite 스키마와 읽기/쓰기
server/rank.js          순위 계산 (backend/Code.gs 에서 그대로 옮김)
server/static.js        정적 파일 · 캐시 헤더 · 경로 탈출 방지
server/dict.js          추측 허용 사전 (읽기 전용 SQLite)
server/import-csv.js    시트 CSV 를 SQLite 로 옮기기
data/dict.db            추측으로 인정되는 자모열. 이미지에 실려 온다
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

`brew` 탭(`drop-the-codes/tap`)은 없습니다(404). 설치는 공식 스크립트로 합니다.

```bash
curl -fsSL https://dropthe.codes/install.sh -o /tmp/install.sh   # 받아서 읽어 보고
sh /tmp/install.sh                                               # 실행한다
export PATH="$HOME/.local/bin:$PATH"                             # 설치 위치가 PATH 에 없다
dtc login                                                        # 대화형으로 API 키 입력
```

키를 `--api-key` 나 `DTC_API_KEY` 로 넘기면 셸 히스토리와 프로세스 목록에 남습니다.
대화형 `dtc login` 이 가장 깔끔하고, 값은 `~/.dtc.yaml` 에 저장됩니다.

```bash
# 1. 기록을 담을 볼륨 (5GB 면 차고 넘친다)
dtc storage create wordquiz-data --size 5

# 2. 이미지. 노드가 amd64 라 애플 실리콘에서는 --platform 을 반드시 준다.
docker build --platform linux/amd64 -t wordquiz:v1 .
dtc image push wordquiz:v1 wordquiz --tag v1
#   → api.dropthe.codes/<계정>/wordquiz:v1

# 3. 배포
dtc deploy \
  --name wordquiz \
  --image api.dropthe.codes/<계정>/wordquiz:v1 \
  --port 8080 \
  --cpu 0.25 --memory 256 \
  --replicas 1 \
  --volume wordquiz-data:/data \
  --env TZ=Asia/Seoul \
  --wait
```

**`--platform linux/amd64` 를 빼먹지 마세요.** 애플 실리콘에서 그냥 빌드하면 arm64
이미지가 올라가고 컨테이너가 `exec format error` 로 죽습니다.

플래그 단위가 문서와 다릅니다. `--cpu` 는 `250m` 이 아니라 **vCPU 실수**(`0.25`),
`--memory` 는 `256Mi` 가 아니라 **MB 정수**(`256`) 입니다.

`--replicas` 는 **1 로 둡니다.** Block 볼륨은 ReadWriteOnce 라 한 Pod 만 붙을 수
있고, SQLite 파일도 하나뿐입니다.

도메인을 붙이려면 `--domain wordquiz.example.com` 을 더합니다. 안 주면
`<name>-dtc-<해시>.dropthe.codes` 가 자동으로 붙고 HTTPS 도 같이 옵니다.

프롬프트를 건너뛰는 플래그는 명령마다 이름이 다릅니다 — `dtc deploy --wait`,
`dtc update -y`.

이미지를 새로 올릴 때:

```bash
docker build --platform linux/amd64 -t wordquiz:v2 .
dtc image push wordquiz:v2 wordquiz --tag v2
dtc update wordquiz --image api.dropthe.codes/<계정>/wordquiz:v2 -y
dtc restart wordquiz
```

**올렸다고 바뀐 것이 아닙니다. `/healthz` 로 확인하세요.**

2026-08-27 에 겪은 일입니다. `dtc update` 가 이미지를 바꿨다고 답하고
(`이미지: …:v2 → …:v3`), `dtc restart` 도 성공했다고 답하고, `dtc describe` 의
업타임도 1분으로 새로 뜬 것처럼 보였는데, 실제로는 **옛 컨테이너가 계속
서비스하고 있었습니다.** 옛 `data/words-6.js` 가 200 을 돌려주는 것으로 들통났습니다.

새 태그로 한 번 더 올리고 재시작하니 그제야 503 을 잠깐 거쳐 새 파드가 떴습니다.
`dtc restart` 가 항상 이미지를 다시 당겨오지는 않는 것으로 보입니다.

그래서 배포는 여기서 끝나지 않습니다. `/healthz` 가 새 코드의 응답을 돌려줄
때까지 확인하고, 안 바뀌면 태그를 올려 다시 밀어야 합니다.

```bash
for i in $(seq 1 15); do
  curl -s https://<도메인>/healthz; echo
  sleep 8
done
```

`/healthz` 를 코드 변경이 드러나게 만들어 두면 이 확인이 값을 합니다. 지금은
사전 개수를 실어 보냅니다 — `{"ok":true,"dict":167786}`. 숫자가 옛것이면
옛 이미지가 돌고 있다는 뜻입니다.

확인:

```bash
dtc describe wordquiz
curl -s https://<도메인>/healthz     # {"ok":true,"dict":24945}
#   dict 가 0 이면 사전이 안 실린 것이다. 그 상태에서는 아무 단어나 통과한다.
```

`dtc logs` 는 파드 이름을 못 찾아 실패할 때가 있습니다. 살아 있는지는 `/healthz` 로
보는 편이 확실합니다.

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `PORT` | `8080` | 듣는 포트 |
| `DB_FILE` | `/data/wordquiz.db` | SQLite 파일. 볼륨 안이어야 남는다 |
| `TZ` | `Asia/Seoul` | **'오늘'의 기준.** 브라우저는 날짜를 보내지 않는다 |
| `STATIC_ROOT` | 저장소 뿌리 | 정적 파일 위치 |
| `SEED_DB` | `/app/seed/wordquiz.db` | 볼륨이 비어 있을 때 한 번만 복사하는 씨앗 |
| `ADMIN_KEY` | 없음 | 백업 내려받기 열쇠. 비우면 `/export` 가 없는 주소가 된다 |
| `DICT_FILE` | `/app/data/dict.db` | 추측 허용 사전. 읽기만 한다 |

```bash
dtc env set wordquiz TZ=Asia/Seoul
```

`TZ` 를 바꾸면 그 뒤로 들어오는 기록의 `puzzleDate` 가 바뀝니다. 이미 쌓인 기록은
그대로라 하루 경계가 한 번 어긋납니다. 처음에 정하고 두는 편이 낫습니다.

## 기존 기록 옮기기

`dtc` 에는 컨테이너 안으로 파일을 넣거나 명령을 돌리는 수단이 없습니다. 그래서
**기록을 이미지에 태워 보냅니다.** 볼륨에 `DB_FILE` 이 없을 때 서버가 씨앗을 한 번
복사하고, 그 뒤로는 쳐다보지 않습니다.

```bash
# 1. 시트를 CSV 로. 링크가 열려 있으면 주소로 바로 받아진다.
ID=<스프레드시트 ID>   # backend/Code.gs 의 SPREADSHEET_ID
curl -fsSL "https://docs.google.com/spreadsheets/d/$ID/export?format=csv" -o results.csv
#   막히면 시트에서 파일 > 다운로드 > 쉼표로 구분된 값(.csv)

# 2. SQLite 로 옮긴다. 로컬에 Node 24 가 없으면 컨테이너로.
docker run --rm -v "$PWD:/app" -w /app -e TZ=Asia/Seoul -e DB_FILE=/app/seed/wordquiz.db \
  node:24-alpine node --disable-warning=ExperimentalWarning server/import-csv.js results.csv
#   넣음 96 · 넘어감 2

# 3. 이미지에 실어 올린다
docker build --platform linux/amd64 -t wordquiz:v2 .
dtc image push wordquiz:v2 wordquiz --tag v2
dtc update wordquiz --image api.dropthe.codes/<계정>/wordquiz:v2 -y
```

`DB_FILE` 을 꼭 넘기세요. 안 주면 `var/wordquiz.db` 로 들어가 씨앗이 빈 채로 올라갑니다.

`seed/` 는 `.gitignore` 에 있고 `.dockerignore` 에는 없습니다. 커밋되지 않으면서
이미지에는 들어갑니다.

첫 줄을 헤더로 보고 이름으로 짝을 맞추므로 열 순서는 상관없습니다. 시트가
`2026. 8. 21` 처럼 내보낸 날짜도 읽습니다. 겹치는 `(clientId, puzzleId)` 는 유일
인덱스가 걸러 내니 몇 번을 다시 돌려도 같은 판이 두 번 들어가지 않습니다.

### 이미 돌고 있는 배포에 씨앗을 넣기

씨앗은 **`DB_FILE` 이 없을 때만** 듭니다. 이미 돌고 있다면 파일이 이미 있으니
그냥 다시 띄워도 아무 일이 없습니다. `DB_FILE` 을 **새 이름으로 바꾸면** 그 자리에
씨앗이 복사되고, 옛 파일은 볼륨에 그대로 남습니다(되돌릴 자리가 됩니다).

```bash
dtc update wordquiz --image …:v2 -y      # 씨앗이 든 이미지를 먼저 올리고
dtc env set wordquiz DB_FILE=/data/scoreboard.db
dtc restart wordquiz
```

**순서가 중요합니다.** 씨앗이 없는 이미지가 새 `DB_FILE` 로 한 번이라도 뜨면 그
자리에 빈 파일이 생기고, 그 뒤에 씨앗이 든 이미지를 올려도 건너뜁니다. 그렇게 됐다면
`DB_FILE` 을 또 다른 이름으로 바꾸면 됩니다.

## 백업

`ADMIN_KEY` 를 정해 두면 `/export` 가 시트와 같은 모양의 CSV 를 내려줍니다.
`server/import-csv.js` 로 그대로 되넣을 수 있습니다.

```bash
umask 077 && openssl rand -hex 16 > ~/.wordquiz-admin-key
dtc env set wordquiz ADMIN_KEY="$(cat ~/.wordquiz-admin-key)"
dtc restart wordquiz

curl -fsS "https://<도메인>/export?key=$(cat ~/.wordquiz-admin-key)" > backup-$(date +%F).csv
```

**키를 파일로 남기는 것이 요령입니다.** `dtc env list` 가 값을 가려서 보여 주므로
플랫폼에서 되읽을 방법이 없습니다.

열쇠가 없거나 틀리면 **404** 입니다. 있는 주소인 것조차 알리지 않습니다.
응답에는 `clientId` 가 함께 나가므로 열쇠를 흘리지 않게 합니다.

`cron` 이나 GitHub Actions 에 위 `curl` 한 줄을 걸어 두면 그게 백업 전부입니다.

## API

주소 하나에 GET 은 순위, POST 는 등록입니다. 옛 Apps Script 배포의 계약을 그대로
물려받았습니다(`backend/Code.gs`).

```
GET  /api?action=daily|overall&mode=total|time|score[&date=yyyy-MM-dd][&length=5..10]
POST /api   {"action":"submit","clientId":…,"nickname":…,"puzzleId":…,
             "jamoLength":…,"attempts":…,"score":…,"elapsedSeconds":…,"won":…}
```

응답 모양도 같습니다 — `{ok, mode, total, rows}`. 순위 규칙은
[SCOREBOARD_SETUP.md](SCOREBOARD_SETUP.md) 의 '동작 범위' 그대로입니다.

요청 내용이 잘못된 경우(`invalid_json` · `invalid_action` · `missing_fields`)는
**200 에 `{ok:false,error}`** 로 답합니다. `js/scoreboard.js` 가 HTTP 상태를 먼저
보고 본문을 읽기 전에 던져 버려서, 상태 코드로 알리면 오류 이름이 사라집니다.
없는 주소(404)와 서버 오류(500)만 진짜 상태 코드를 씁니다.

등록 시각과 날짜는 **서버가 찍습니다.** 화면이 보낸 값은 쓰지 않습니다.

이 밖에 `GET /healthz` 와 `GET /export?key=…` 가 있습니다.

## 알아 둘 것

- 컨테이너를 **root 로 돌립니다.** 붙는 볼륨이 root 소유로 올라오는 일이 잦아
  사용자를 낮추면 첫 쓰기에서 `EACCES` 로 죽습니다. 자랑용 순위표 하나라 여기까지 합니다.
- `node:sqlite` 는 아직 실험 딱지가 붙어 있습니다. `node:24-alpine` 으로 태그를
  고정해 두었으니 이미지를 다시 만들지 않는 한 흔들리지 않습니다.
- 점수 조작을 막는 장치는 없습니다. 자랑용 순위표 수준의 신뢰 모델입니다.
- `dtc env list` 는 값을 `e88c****c831` 처럼 **가려서** 보여 줍니다. 한 번 넣은
  `ADMIN_KEY` 는 되읽을 수 없으니 만들 때 손에 남겨 두세요.
- 옛 시트가 링크로 열려 있으면 `?format=csv` 로 누구나 그때까지의 기록을 받습니다.
  `SPREADSHEET_ID` 는 공개 저장소의 `backend/Code.gs` 에 적혀 있습니다. 닉네임과
  익명 ID 가 그대로 나가므로, 곤란하면 시트 공유 범위를 좁히세요.
