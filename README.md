# PG Local E2E Test Suite

로컬 PG 테스트 페이지의 결제 플로우를 Playwright로 자동화하는 프로젝트입니다.

기준 문서:

- [docs/pg-local-e2e-test-plan.md](docs/pg-local-e2e-test-plan.md)

## 실행 전 준비

의존성을 설치합니다.

```bash
npm install
npm run install:browsers
```

로컬 서비스는 기본적으로 사용자가 먼저 실행합니다.

```bash
npm run service:up
```

서비스가 이미 떠 있다면 바로 테스트를 실행할 수 있습니다.

```bash
npm test
```

테스트 유형별로 실행할 수도 있습니다.

```bash
npm run test:smoke
npm run test:payment
npm run test:api-terms
npm run test:api-point
```

브라우저를 보면서 디버깅하려면 다음을 사용합니다.

```bash
npm run test:headed
```

`test:headed`는 기본적으로 각 브라우저 동작 사이에 `250ms` 지연을 둡니다. 더 느리거나 빠르게 보고 싶으면 실행 시 값을 바꿀 수 있습니다.

```bash
HEADED_SLOW_MO_MS=500 npm run test:headed
HEADED_SLOW_MO_MS=0 npm run test:headed
```

## 환경값

기본값은 코드에 포함되어 있습니다. 필요하면 `.env.example`을 참고해 `.env`를 만들고 값을 바꿉니다.

```env
PG_FRONT_URL=http://localhost/pg/pgfront.do
PAYMENT_PG_PROVIDERS=세틀뱅크,메크로스,페이레터,패밀리
CARD_POINT_AMOUNT=5000
SUCCESS_TEXT_PATTERN=포인트허브 결제 성공
LOCAL_STACK_DIR=/Users/harry/docker/middleware-stack
API_POINT_TTL_PNT=1000
API_POINT_TTL_PAY_AMT=5000
API_POINT_TTL_PNT_AMT=1000
API_POINT_CARD_PROVIDER=KB
API_POINT_SHOP_CMSN_RATE=10
HEADED_SLOW_MO_MS=250
```

## 시나리오 추가

새 결제 케이스는 [tests/pg/scenarios.ts](tests/pg/scenarios.ts)에 항목을 추가합니다.

결제 플로우는 기본적으로 `PAYMENT_PG_PROVIDERS`에 지정된 PG사 탭을 순서대로 선택합니다.

결제 플로우와 다른 화면 영역의 테스트는 별도 spec으로 분리합니다. 현재 테스트 유형은 `smoke`, `payment`, `api-terms`, `api-point`로 나뉘며, `PG 연동 API 테스트`의 약관 조회/동의 흐름은 [tests/pg/api-terms.spec.ts](tests/pg/api-terms.spec.ts)에 있고 약관 성공 후 포인트 API 조회/결제 흐름은 [tests/pg/api-point-payment.spec.ts](tests/pg/api-point-payment.spec.ts)에 있습니다.
