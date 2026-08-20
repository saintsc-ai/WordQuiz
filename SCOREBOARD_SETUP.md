# 스코어보드 연결

WordQuiz는 GitHub Pages에서 실행되므로 별도 서버를 운영하지 않고 Google Sheets와 Google Apps Script Web App을 저장소로 사용합니다.

## 1. Google Sheet 만들기

빈 Google Sheet를 만들고 URL을 복사합니다. 시트의 첫 번째 탭 이름은 `results`로 두세요. 헤더는 Apps Script가 처음 실행될 때 자동으로 만듭니다.

## 2. Apps Script 배포

1. Google Sheet에서 `확장 프로그램 > Apps Script`를 엽니다.
2. `backend/Code.gs` 내용을 붙여넣습니다.
3. `배포 > 새 배포`를 선택합니다.
4. 유형을 `웹 앱`으로 선택합니다.
5. 실행 주체는 본인, 액세스 권한은 `모든 사용자`로 설정합니다.
6. 배포된 웹 앱 URL을 복사합니다.

## 3. WordQuiz에 URL 넣기

`js/scoreboard.js`의 `API_URL`에 웹 앱 URL을 넣습니다.

```js
var API_URL = 'https://script.google.com/macros/s/배포ID/exec';
```

그 다음 커밋하고 `main` 브랜치에 푸시하면 GitHub Pages에 반영됩니다.

## 점수 규칙

```text
성공 점수 = 자모 수 * (6 - 성공한 시도 횟수)
실패 점수 = 0
```

걸린 시간은 점수와 별도로 저장하고 순위 화면에 표시합니다. 닉네임과 브라우저별 익명 ID만 사용하므로 로그인이나 본인 인증은 제공하지 않습니다.

## 동작 범위

- 오늘의 단어별 순위: 현재 자모 길이의 기록을 점수순으로 표시
- 누적 순위: 브라우저별 익명 ID 기준 총점, 승리 수, 플레이 수 표시
- 같은 브라우저가 같은 문제를 다시 등록하면 Apps Script가 중복 등록을 거부

Google Apps Script의 공개 Web App 특성상 점수 조작을 완전히 막을 수는 없습니다. 자랑용 순위표 수준의 신뢰 모델입니다.
