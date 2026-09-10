# bus-tracker

경기도 버스 실시간 도착정보 조회 서비스입니다.

공공데이터포털의 경기도 버스 Open API 4종을 사용합니다.

- 정류소 조회
- 버스도착정보 조회
- 버스위치정보 조회
- 버스노선 조회

## 환경변수

Vercel 프로젝트 **Settings → Environment Variables**에 아래를 추가하세요.

```
DATA_GO_KR_SERVICE_KEY=공공데이터포털_인증키
```

운영계정 신청 후 키가 바뀌었다면 새 키로 교체한 뒤 Redeploy 합니다.
