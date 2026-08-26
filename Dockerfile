# WordQuiz 배포 이미지 — 화면(정적 파일)과 API 를 한 컨테이너에서.
#
# data/dict.db(추측 허용 사전)도 함께 실린다. 화면이 /valid 로 물어보는 상대라
# 이게 빠지면 아무 단어나 통과한다. 빠졌는지는 /healthz 의 dict 로 본다.
FROM node:24-alpine

# Intl 은 ICU 를 쓰지만 로그 시각과 process.env.TZ 는 시스템 tzdata 를 본다.
RUN apk add --no-cache tzdata

ENV NODE_ENV=production \
    TZ=Asia/Seoul \
    PORT=8080 \
    DB_FILE=/data/wordquiz.db

WORKDIR /app
COPY . /app

# 볼륨을 붙이지 않고 띄워도 죽지 않게 자리를 만들어 둔다. 그때는 컨테이너를
# 다시 띄우는 순간 기록이 사라진다.
#
# 사용자를 node 로 낮추지 않는다. 붙는 볼륨이 root 소유로 올라오는 일이 잦아
# 그대로 두면 첫 쓰기에서 EACCES 로 죽는다. 자랑용 순위표 하나라 여기까지 한다.
RUN mkdir -p /data

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "require('node:http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)})"

# node:sqlite 는 아직 실험 딱지가 붙어 있다. 매 요청마다 경고를 찍지 않게 끈다.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
