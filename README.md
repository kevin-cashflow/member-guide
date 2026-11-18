# 회원번호 안내 페이지

사전 동의한 회원의 회원번호를 한 번에 한 명씩 안내하는 정적 페이지 + 서버리스 API입니다.

## 구조

- `index.html` — 화면. 회원번호 데이터는 들어 있지 않습니다.
- `api/pick.js` — Vercel Node.js 서버리스 함수. `GET /api/pick` 한 번에 한 명의 이름·회원번호를 돌려줍니다.
- `robots.txt` — 검색엔진 수집 차단.

## 회원번호 풀 설정

회원번호는 코드나 저장소에 두지 않고, Vercel 프로젝트의 환경변수로만 넣습니다.

| Key | Value |
| --- | --- |
| `SPONSOR_POOL_JSON` | 아래 형식의 JSON 한 줄 |

```json
[{"name":"홍*동","abo":"1234567"},{"name":"김*수","abo":"7654321"}]
```

- 환경변수가 없거나 비어 있으면 API는 `503`과 함께 "회원번호 풀이 아직 준비되지 않았습니다"를 돌려주고, 화면은 그 안내를 그대로 보여 줍니다.
- 환경변수를 수정한 뒤에는 Vercel에서 **Redeploy** 해야 반영됩니다.

## 동작

- 응답: `{ "ok": true, "name": "홍*동", "abo": "1234567", "next_reset_at": 1763500000000 }` (`next_reset_at`은 epoch ms)
- 응답에는 풀 목록과 전체 인원 수가 포함되지 않습니다. `Cache-Control: no-store`.
- 직전에 안내한 번호는 `last_abo` 쿠키(HttpOnly)로 기억해 다음 안내에서 제외합니다.
- `first_seen_at` 쿠키를 기준으로 10시간마다 갱신 창이 새로 시작됩니다.

## 로컬 확인

```bash
python3 -m http.server 8000   # index.html 확인용 (API는 동작하지 않음)
vercel dev                    # API까지 함께 확인
```
