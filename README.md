# 광역버스 실시간 위치 지도

M4108 같은 경기도 광역버스의 실시간 위치를 지도 위 노선 선을 따라 보여주는 웹앱.
공공데이터포털 → Vercel 프록시 → 브라우저(Leaflet 지도) 구조.

## 왜 프록시(서버)가 필요한가
공공데이터포털 API를 브라우저에서 직접 부르면 CORS 정책으로 막힌다.
그래서 Vercel 서버리스 함수(`/api/*`)가 대신 호출해서 넘겨준다. 무료로 충분하다.

## 준비 순서

### 1. 공공데이터포털 API 키 발급 (약 5분)
1. https://www.data.go.kr 회원가입/로그인
2. "경기도_버스위치정보 조회" 검색 → 활용신청 (자동승인)
3. 같은 방식으로 "경기도_버스노선 조회" 도 활용신청
4. 마이페이지 → 오픈API → 인증키에서 **일반 인증키(Decoding)** 복사

### 2. Vercel 배포 (약 5분)
1. https://vercel.com 가입 (GitHub 계정 연동 권장)
2. 이 폴더를 GitHub에 올리거나, Vercel CLI로 배포
   - CLI: `npm i -g vercel` 후 폴더에서 `vercel`
3. Vercel 프로젝트 → Settings → Environment Variables 에 추가:
   - 이름: `SERVICE_KEY`
   - 값: 공공데이터포털 인증키 (Encoding 키도 동작)
   - 이름: `MAPBOX_TOKEN`
   - 값: Mapbox Public token (`pk.`로 시작)
4. 재배포(Redeploy)

### 노선 추가/삭제
- 화면 왼쪽 패널에서 버스 번호를 검색해 노선을 추가할 수 있습니다.
- `×` 버튼으로 삭제합니다.
- 선택한 노선 목록은 브라우저(`localStorage`)에 저장되어 새로고침 후에도 유지됩니다.

## 파일 구성
- `index.html` — 3D 지도 (Mapbox GL). 노선은 UI에서 검색·추가·삭제.
- `map2d.html` — 기존 2D Leaflet 지도
- `api/bus.js` — 실시간 버스 위치 프록시
- `api/route.js` — 노선 경로(정류소 좌표) 프록시
- `api/find.js` — 버스 번호로 노선 ID 찾기
- `api/arrival.js` — 정류소 도착예정 프록시
- `api/config.js` — Mapbox Public token 전달

## 3D 지도
- 기본 화면(`index.html`)은 **Mapbox GL** 3D(건물 extrude + 노선/버스)입니다.
- 2D(Leaflet)는 `/map2d.html` 에 남겨 두었습니다.
- `MAPBOX_TOKEN`(Public `pk.` 토큰)이 필요합니다.

## 주의
- 노선 경로는 경기버스 **공식 노선형상정보**(`getBusRouteLineListv2`)를 사용합니다.
- API 호출 한도가 있으니(일 트래픽) 갱신주기(REFRESH_MS)를 너무 짧게 두지 말 것.
