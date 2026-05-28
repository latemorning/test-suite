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
npm run test:family-payment
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
PAYMENT_PG_PROVIDERS=세틀뱅크,메크로스,페이레터
CARD_POINT_AMOUNTS=5000
SUCCESS_TEXT_PATTERN=포인트허브 결제 성공
FAMILY_PAYMENT_AMOUNTS=900,5000,501000
FAMILY_PAYMENT_SHOP_NAME=세틀_패밀리박스
FAMILY_PAYMENT_SHOP_CODES=PO0134,PO0018,PO0017,PO0016,PO0015,PO0011
FAMILY_PAYMENT_SUCCESS_TEXT_PATTERN=가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다
LOCAL_STACK_DIR=/Users/harry/docker/middleware-stack
PG_API_BASE_URL=http://localhost
PG_API_PG_CD=PG0006
PG_API_SHOP_CD=API_ph_CU
PG_API_SHOP_NAME=API_pointhub용 CU
PG_API_SHOP_PAY_METHOD=CU
PG_API_GOODS_NAME=ApiTest상품
PG_API_POINT_TARGET_AMOUNT=4000
PG_API_SHOP_CMSN_RATE=0
PG_API_AUTHORIZATION="dSgVkYp3s6v9y$B&E)H@McQeThWmZq4t7w!z%C*F-JaNdRgUjXn2r5u8x/A?D(G+"
PG_API_CUST_CI=p/8cpnfrPfHF8JDF61xaIyHskFbNrbXLJuyVEJwGtXDOJ2bznkmZDSh8+HhHIwZvxPXpVjMYFbssO0WQxrOoDT68YwoWJ7gg6w3d5WrIswbZ2bhvF336qhjN3EKIKlh2
PG_API_CUST_NAME=veMvOJTU0L98Zq20ceDJJA==
PG_API_CUST_CTN=0Lamm89+8wGhhHvtMMzuIA==
HEADED_SLOW_MO_MS=250
```

`CARD_POINT_AMOUNTS`, `FAMILY_PAYMENT_AMOUNTS`, `PG_API_POINT_TARGET_AMOUNT`는 전환포인트 목표값 기준입니다. 현대카드는 전환비율이 `1.5:1`이라 전환포인트 목표값에 맞춰 사용포인트 입력값을 환산합니다. 기존 `.env`에 `CARD_POINT_AMOUNT`만 있으면 단일 금액 목록으로 계속 사용할 수 있습니다.

## 시나리오 추가

새 결제 케이스는 [tests/pg/scenarios.ts](tests/pg/scenarios.ts)에 항목을 추가합니다.

결제 플로우는 기본적으로 `PAYMENT_PG_PROVIDERS`에 지정된 PG사 탭, [tests/pg/scenarios.ts](tests/pg/scenarios.ts)의 PG별 가맹점 목록, `CARD_POINT_AMOUNTS`에 지정된 금액 목록을 곱해 별도 테스트로 등록합니다. 일반 결제 금액을 여러 개 실행하려면 쉼표로 구분해 `CARD_POINT_AMOUNTS=1000,5000,10000`처럼 지정합니다.
`세틀_복합결제(소진형)`은 `paymentFlow='settle-combined-exhaustion'`과 `payLimitRate=100`을 쓰는 예외 케이스입니다. 이 경우 약관 화면은 `#agreeAll`과 `#send`, 포인트 입력 화면은 `settle-combined-payment-page.ts`에서 처리합니다.

패밀리포인트 할인권 요청은 `PC전용 Submit` 이후 팝업 흐름이 일반 결제와 달라 [tests/pg/family-payment.spec.ts](tests/pg/family-payment.spec.ts)와 [tests/pg/family-payment-page.ts](tests/pg/family-payment-page.ts)에서 별도로 실행합니다.
`FAMILY_PAYMENT_SHOP_CODES`에 쉼표로 구분한 값을 넣으면 각 값마다 별도 테스트가 등록됩니다. 이 값은 `#shop_sel`의 option value 기준이며, 선택 후 실제 요청용 `shop_cd`는 화면의 `#shopCd`에 반영됩니다.
`FAMILY_PAYMENT_AMOUNTS`는 각 패밀리 가맹점에 곱해지는 전환포인트 기준 금액 목록입니다. 기본값은 `900,5000,501000`이며, `900`은 1,000P 단위 오류, `501000`은 최대 할인권금액 오류가 정상 결과입니다.

결제 플로우와 다른 화면 영역의 테스트는 별도 spec으로 분리합니다. 현재 테스트 유형은 `smoke`, `payment`, `family-payment`, `api-terms`, `api-point`로 나뉘며, `PG 연동 API 테스트`의 약관 조회/동의 흐름은 [tests/pg/api-terms.spec.ts](tests/pg/api-terms.spec.ts)에 있고 약관 성공 후 포인트 API 조회/결제 흐름은 [tests/pg/api-point-payment.spec.ts](tests/pg/api-point-payment.spec.ts)에 있습니다.
