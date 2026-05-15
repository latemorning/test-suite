# 로컬 PG 결제 플로우 자동화 테스트 계획

## Summary

이 프로젝트는 로컬에 실행 중인 PG 테스트 페이지의 결제 플로우와 PG 연동 API 직접 호출 흐름을 자동화하기 위한 테스트 프로젝트다.

- 테스트 대상 URL: `http://localhost/pg/pgfront.do`
- 기본 스택: TypeScript + Playwright
- 실행 대상: 로컬 환경
- 테스트 방식: 실제 브라우저 E2E와 Playwright `request` 기반 API 직접 호출 테스트
- v1 목표: 핵심 결제 플로우, API 약관 조회/동의 직접 호출 흐름, API 포인트 조회/사용/취소 직접 호출 흐름이 정상 완료되는지 회귀 테스트로 검증

v1에서는 GitHub Actions, Slack 알림, 운영 환경 테스트, 외부 side effect 검증은 포함하지 않는다.

## Key Changes

추후 구현 시 다음 기준으로 프로젝트를 구성한다.

- `package.json`, `playwright.config.ts`, `tsconfig.json`으로 TypeScript + Playwright 프로젝트를 구성한다.
- 기본 실행은 headless 모드로 두고, 로컬 디버깅용 headed 실행 스크립트를 별도로 둔다.
- headed 실행은 화면 확인이 쉽도록 `HEADED_SLOW_MO_MS` 값으로 브라우저 동작 지연을 조절한다.
- 환경값은 `.env`에서 받을 수 있게 하되 기본값을 제공한다.
- 페이지 객체 또는 헬퍼 계층을 두어 버튼, 입력 필드, 팝업 탐색 로직을 한 곳에서 관리한다.
- 실패 진단을 위해 Playwright trace, screenshot, video, HTML report를 남긴다.

기본 환경값은 다음과 같이 둔다.

```env
PG_FRONT_URL=http://localhost/pg/pgfront.do
PAYMENT_PG_PROVIDERS=세틀뱅크,메크로스,페이레터
CARD_POINT_AMOUNTS=5000
SUCCESS_TEXT_PATTERN=포인트허브 결제 성공
FAMILY_PAYMENT_AMOUNTS=900,5000,501000
FAMILY_PAYMENT_SHOP_NAME=세틀_패밀리박스
FAMILY_PAYMENT_SHOP_CODES=PO0134,PO0018,PO0017,PO0016,PO0015,PO0011
FAMILY_PAYMENT_SUCCESS_TEXT_PATTERN=가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다
PG_API_BASE_URL=http://localhost
PG_API_PG_CD=PG0006
PG_API_SHOP_CD=API_ph_CU
PG_API_SHOP_NAME=API_pointhub용 CU
PG_API_SHOP_PAY_METHOD=CU
PG_API_GOODS_NAME=ApiTest상품
PG_API_POINT_TARGET_AMOUNT=4000
PG_API_SHOP_CMSN_RATE=0
PG_API_AUTHORIZATION=dSgVkYp3s6v9y$B&E)H@McQeThWmZq4t7w!z%C*F-JaNdRgUjXn2r5u8x/A?D(G+
PG_API_CUST_CI=p/8cpnfrPfHF8JDF61xaIyHskFbNrbXLJuyVEJwGtXDOJ2bznkmZDSh8+HhHIwZvxPXpVjMYFbssO0WQxrOoDT68YwoWJ7gg6w3d5WrIswbZ2bhvF336qhjN3EKIKlh2
PG_API_CUST_NAME=veMvOJTU0L98Zq20ceDJJA==
PG_API_CUST_CTN=0Lamm89+8wGhhHvtMMzuIA==
HEADED_SLOW_MO_MS=250
```

로컬 서비스는 기본적으로 사용자가 직접 실행한 상태를 대상으로 한다. 다만 구현 시 `~/docker/middleware-stack`에서 서비스 기동 방법을 파악할 수 있으면, 별도 npm script로 로컬 서비스 기동을 보조할 수 있게 구성한다.

## Target Flow

v1의 핵심 E2E 시나리오는 다음 순서로 진행한다.

1. `http://localhost/pg/pgfront.do` 접속
2. 페이지가 정상 로드되었는지 확인
3. 결제 시나리오의 PG사 탭 선택
   - 기본 대상: `세틀뱅크`, `메크로스`, `페이레터`
4. 시나리오가 지정한 가맹점이 있으면 해당 가맹점 선택
   - `세틀뱅크`: `소진형테스트가맹점`, `수커뮤니케이션`, `세틀_복합결제(소진형)`
   - `메크로스`: `메가파일`
   - `페이레터`: `페이레터_UI_CU`, `페이레터_UI_SI`, `페이레터_1`
5. `암호화` 버튼 클릭
6. 시나리오가 `pay_limit_rate` 값을 지정하면 `암호화` 이후 `PC전용 Submit` 전에 해당 값을 입력
   - 카드포인트 입력 목표 전환포인트는 `pay_amt * pay_limit_rate / 100`으로 계산한다.
   - `세틀_복합결제(소진형)`은 `pay_limit_rate=100`을 사용한다.
   - 현재 로컬 화면은 `암호화` 클릭 후 `pay_limit_rate`가 `0`으로 재설정되므로 암호화 이후에 입력한다.
7. `PC전용 Submit` 버튼 클릭
8. 약관 화면에서 `전체 약관 동의 후 포인트조회하기(선택포함)` 또는 같은 의미의 본인인증 진입 버튼 클릭
   - `세틀_복합결제(소진형)`은 약관 전체동의 체크박스 `#agreeAll`을 선택한 뒤 `#send` 확인 버튼으로 진행한다.
9. 가상 인증 팝업에서 필요 시 테스트 이름을 입력한 뒤 `전송` 버튼 클릭
10. 카드사별 목록에서 모든 `input.pnt`를 0으로 초기화한 뒤, 전환포인트가 시나리오 금액이 되도록 `사용포인트` 입력
   - 기본 시나리오 금액은 `5000`이다.
   - `pay_limit_rate`가 있는 시나리오는 결제금액이 아니라 `pay_amt * pay_limit_rate / 100` 값을 전환포인트 목표값으로 사용한다.
   - 현대카드는 사용포인트와 전환포인트 비율이 `1.5:1`이므로 전환포인트 목표값을 기준으로 사용포인트 입력값을 환산한다.
11. `결제`, `전환하기` 또는 복합결제 포인트 화면의 `#send` 확인 버튼 클릭
    - `세틀_복합결제(소진형)`은 `#send` 클릭 후 포인트 전환 안내 레이어가 항상 뜨므로 레이어의 확인 버튼을 한 번 더 클릭한다.
12. 최종 `확인` 버튼 클릭
13. alert 창의 `포인트허브 결제 성공` 문구 확인
    - `세틀_복합결제(소진형)`은 최종 alert 없이 `/pg/dummyRetUrl.do` 결과 페이지로 이동할 수 있으므로 `ret_code=00`과 `ret_msg=성공`을 성공 조건으로 확인한다.

패밀리포인트 할인권 요청은 `PC전용 Submit` 이후 팝업 흐름과 성공 조건이 다르므로 별도 시나리오로 진행한다.

1. `http://localhost/pg/pgfront.do` 접속
2. `패밀리` PG사 탭 선택
3. `FAMILY_PAYMENT_SHOP_CODES`가 있으면 각 값별로 별도 테스트를 등록하고 `#shop_sel` option value 기준으로 가맹점 선택
   - 값이 없으면 `FAMILY_PAYMENT_SHOP_NAME`의 기본 가맹점 `세틀_패밀리박스` 선택
4. 각 가맹점마다 `FAMILY_PAYMENT_AMOUNTS`의 금액 목록을 별도 테스트로 등록하고 `pay_amt`를 시나리오 금액으로 설정
5. `암호화` 버튼 클릭
6. `PC전용 Submit` 버튼 클릭
7. 패밀리 약관 화면에서 `전체 약관 동의 후 본인인증하기` 클릭
8. 가상 인증 팝업에서 필요 시 테스트 이름을 입력한 뒤 `전송` 버튼 클릭
9. 금액별 기대 결과에 맞춰 패밀리포인트 사용 화면을 검증한다.
   - `900`: 각 카드사 행의 `초기화` 버튼을 클릭해 사용포인트를 0으로 만든 뒤 첫 사용가능 카드사의 전환포인트가 `900`이 되도록 사용포인트를 입력하고 `확인` 클릭 후 `사용 포인트는 1,000P 단위로만 입력 가능합니다.` 레이어 문구가 나오면 통과로 본다.
   - `5000`: 각 카드사 행의 `초기화` 버튼을 클릭해 사용포인트를 0으로 만든 뒤 화면 순서대로 사용가능 전환포인트가 결제금액 이상인 첫 행의 전환포인트가 결제금액이 되도록 입력한다. 이후 `확인` 클릭, 결과 문자열의 `ret_code=00`, 가족 목록의 `일괄요청`, 최종 할인권 요청 성공 레이어 문구까지 확인한다.
   - `501000`: 총 보유 전환포인트가 `501000` 미만이면 `501000포인트 미만 포인트 보유` 메시지로 실패 처리한다. 총 보유 전환포인트가 `501000` 이상이면 패밀리포인트 사용 화면 진입 시 자동 설정된 전환포인트에 `1000`포인트만 추가하고 `확인` 클릭 후 `할인권금액은 최대 500,000원까지 가능합니다.` 레이어 문구가 나오면 통과로 본다.
   - 현대카드는 사용포인트와 전환포인트 비율이 `1.5:1`이므로 전환포인트 목표값을 기준으로 사용포인트 입력값을 환산한다.

## PG API Terms Flow

결제 화면과 별개로, Playwright `request` fixture로 로컬 PG API를 직접 호출해 약관 API 흐름을 검증한다. 기준 시나리오는 `postmanscript2`의 Postman 컬렉션 로컬 흐름이다.

1. 테스트마다 `AT_PG_TR_NO_` 접두어와 timestamp, 짧은 suffix로 `pg_tr_no`를 생성한다.
   - 전체 길이는 PG API 제약에 맞춰 30자 이하로 유지한다.
2. `POST /api/v1/r/terms`를 호출한다.
   - `pg_tr_no`: 생성한 거래번호
   - `pg_cd`: `PG0006`
   - `shop_cd`: `API_ph_CU`
   - `pg_cust_ci`: `postmanscript2` 로컬 기준 암호화 고객 CI
   - Header `Authorization`: `postmanscript2/local.postman_environment.json`의 enabled `header_auth`
3. 응답의 `ret_code=00`, `phub_tr_no`, `pg_tr_no`, `cls_list`를 검증한다.
4. 필수 약관 ID와 필수 여부가 응답에 포함됐는지 확인한다.
   - `PHA1A`, `PHA5A`, `a1A`, `a2A`, `a3A`
   - 각 항목은 `mdt_yn=Y`여야 한다.
5. `POST /api/v1/c/terms`를 호출한다.
   - `phub_tr_no`: 약관 조회 응답값
   - `pg_tr_no`, `pg_cd`, `shop_cd`, `pg_cust_ci`: 약관 조회와 같은 값
   - `pg_cust_name`: `postmanscript2` 로컬 기준 암호화 고객명
   - `pg_cust_ctn`: `postmanscript2` 로컬 기준 암호화 전화번호
   - `is_mdt_all`: `Y`
6. 응답의 `ret_code=00`, 동일 `phub_tr_no`, 동일 `pg_tr_no`를 검증한다.

## PG API Point Payment Flow

`PG API Terms Flow`가 성공한 거래번호와 `phub_tr_no`로 포인트 조회, 포인트 사용, 포인트 사용 취소 API를 직접 호출한다.

1. `PG API Terms Flow`의 약관 조회와 동의를 먼저 실행한다.
2. `POST /api/v1/r/pnt`를 호출한다.
   - `pg_tr_no`, `pg_cd`, `phub_tr_no`, `shop_cd`, `pg_cust_ci`: 약관 흐름과 같은 값
   - `shop_name`: `API_pointhub용 CU`
   - `goods_name`: `ApiTest상품`
3. 응답의 `ret_code=00`, 동일 `pg_tr_no`, 동일 `phub_tr_no`, `prvdr_list`를 검증한다.
4. `prvdr_list`에서 목표 전환금액 `PG_API_POINT_TARGET_AMOUNT`를 사용할 수 있는 첫 카드사를 자동 선택한다.
   - 선택 기준은 `pnt_exch_rate`, `min_avl_pnt`, `max_avl_pnt`, `deal_unit`, `crnt_point`를 모두 만족하는 것이다.
   - `point_amt`가 목표 전환금액이 되도록 `point`를 역산한다.
5. `check_hash`는 Postman과 동일하게 `SHA256(pg_tr_no + ttl_pnt_amt + shop_cd + phub_tr_no)`로 생성한다.
6. `POST /api/v1/c/pnt`를 호출한다.
   - `shop_pay_method`: `CU`
   - `shop_cmsn_rate`: `0`
   - `prvdr_list`: 자동 선택한 카드사 1개
   - `ttl_pnt`: 선택 카드사의 사용포인트
   - `ttl_pay_amt`: 목표 전환금액
   - `ttl_pnt_amt`: 목표 전환금액
   - `ttl_rmnd_amt`: 결제금액에서 고객부담수수료 적용 후 할인액을 뺀 값
   - `ttl_cprt_amt`: 고객부담수수료를 반영한 결제할인액
7. 응답의 `ret_code=00`, 동일 `pg_tr_no`, 동일 `phub_tr_no`, 사용금액 합계를 검증한다.
8. `POST /api/v1/d/pnt`로 사용 취소를 호출한다.
   - `ori_pg_tr_no`: 포인트 사용과 같은 `pg_tr_no`
   - `tr_div`: `CA`
   - `points`: 포인트 사용 요청의 `ttl_pnt_amt`
   - `check_hash`: 포인트 사용 요청과 같은 값
9. 응답의 `ret_code=00`과 취소 금액을 검증한다.

## Selector Policy

구현 시 셀렉터는 사용자에게 보이는 의미를 우선한다.

- 버튼은 `getByRole('button', { name: /암호화|PC전용 Submit|포인트조회하기|전송|결제|전환하기|확인/ })` 형태를 우선 사용한다.
- PG사 선택은 `ul.tabs li`의 노출 텍스트를 우선 사용하고, 선택 후 `#pg_cd` 값으로 PG 코드가 갱신됐는지 확인한다.
- 가맹점 선택이 필요한 시나리오는 `#shop_sel` 옵션 텍스트로 선택하고 `#shopName` 값으로 반영 여부를 확인한다.
- 패밀리포인트 가맹점 시나리오는 `#shop_sel` option value로 선택하고 실제 요청용 `shop_cd`가 `#shopCd`에 반영됐는지 확인한다.
- `포인트조회하기`처럼 button role이 아닌 clickable 텍스트는 visible text 클릭 fallback을 사용한다.
- 입력 필드는 label, name, id, 주변 텍스트 기반 탐색 순서로 찾는다.
- `pay_limit_rate`는 `#payLimitRate` 또는 `name="pay_limit_rate"` 입력 필드를 우선 사용한다.
- 카드포인트 입력란은 명시 라벨이 없으므로 카드사별 목록의 `사용포인트` 헤더 아래 `input.pnt` 입력 필드를 우선 찾는다. 입력 전에는 `.initBtn` 또는 `input.pnt` 직접 입력으로 모든 사용포인트를 0으로 초기화하고, 같은 행의 `.pntExchRate`가 있으면 전환포인트 기준으로 사용포인트 입력값을 환산한다.
- 팝업은 `page.waitForEvent('popup')` 또는 브라우저 컨텍스트의 새 페이지 이벤트를 기다린 뒤 해당 페이지에서 조작한다.
- 텍스트가 불안정하거나 중복될 경우에만 CSS selector나 XPath를 보조로 사용한다.
- `약관조회하기`, `전송`, `결제`, `확인` 버튼명은 화면 내 중복되지 않는다는 전제로 role 기반 selector를 우선한다.
- 패밀리포인트 사용 화면은 `.pointGroup` 단위로 카드사 행을 순회하고, `.initBtn`, `.avlPnt`, `input.pnt`, `.cprtAmt`, `.pntExchRate`, `#confirmBtn`을 우선 사용한다.
- 패밀리 결과/요청 화면은 `#btn_confirm`, `#btnReqAll`, `#myPopup`과 최종 요청 메시지 텍스트를 우선 사용한다.
- API 직접 호출 테스트는 화면 selector를 사용하지 않고 Playwright `request` fixture와 JSON 응답 검증만 사용한다.

## Test Scenarios

초기 구현 시 구체적인 시나리오가 많지 않더라도, 나중에 시나리오를 쉽게 추가할 수 있도록 테스트 흐름과 시나리오 데이터를 분리한다.

권장 파일 구조는 다음과 같다.

```text
tests/
  pg/
    payment.spec.ts
    api-terms.spec.ts
    api-point-payment.spec.ts
    family-payment.spec.ts
    scenarios.ts
    pg-api-client.ts
    pg-page.ts
    card-point-payment-page.ts
    family-payment-page.ts
    page-actions.ts
    assertions.ts
```

- `payment.spec.ts`: 시나리오 목록을 순회하며 실제 테스트를 실행한다.
- `family-payment.spec.ts`: 패밀리포인트 할인권 요청 전용 흐름을 실행한다.
- `api-terms.spec.ts`: Playwright `request` fixture로 약관 조회/동의 API 흐름을 실행한다.
- `api-point-payment.spec.ts`: 약관 API 성공 후 포인트 조회/사용/취소 API 흐름을 실행한다.
- `scenarios.ts`: 금액, PG 설정, 결제수단, 기대 성공 패턴 같은 시나리오 데이터를 정의한다.
- `pg-api-client.ts`: PG API 직접 호출, 거래번호 생성, 포인트 사용 요청 계산, 공통 오류 메시지 처리를 제공한다.
- `pg-page.ts`: 페이지 접속, PG/가맹점 선택, 암호화, `PC전용 Submit`까지의 공통 시작 흐름을 제공한다.
- `card-point-payment-page.ts`: `PC전용 Submit` 이후 일반 카드포인트 결제 팝업 흐름을 제공한다.
- `settle-combined-payment-page.ts`: `세틀_복합결제(소진형)`의 약관 전체동의, 본인인증, 복합결제 포인트 입력 흐름을 제공한다.
- `family-payment-page.ts`: `PC전용 Submit` 이후 패밀리포인트 사용, 결과 확인, 일괄요청 흐름을 제공한다.
- `page-actions.ts`: 버튼 탐색, 팝업 전환, 인증 팝업 처리 같은 저수준 화면 조작 유틸을 제공한다.
- `assertions.ts`: 성공 문구, alert, 팝업, 네트워크 응답 등 성공/실패 판정 로직을 제공한다.

시나리오는 데이터로 추가한다.

```ts
export const paymentScenarios = [
  {
    name: '기본 카드포인트 5000 결제',
    paymentAmount: 5000,
    convertedPointAmount: 5000,
    pgProvider: { name: '세틀뱅크', code: 'PG0001' },
    shopName: '소진형테스트가맹점',
    paymentFlow: 'standard-card-point',
    expectedSuccessPattern: /포인트허브 결제 성공/,
  },
];
```

패밀리포인트 할인권 요청은 일반 결제 시나리오와 분리한다.

```ts
export const familyPaymentScenarios = [
  {
    name: '패밀리 세틀_패밀리박스 할인권 5000 결제',
    pgProvider: { name: '패밀리', code: 'PG_FAM' },
    shopName: '세틀_패밀리박스',
    paymentAmount: 5000,
    expectedOutcome: 'success',
    convertedPointAmount: 5000,
    expectedSuccessPattern: /할인권 요청 메시지가 발송 되었습니다/,
  },
];
```

나중에 금액이나 설정만 다른 일반 결제 시나리오는 `CARD_POINT_AMOUNTS`에 쉼표로 구분한 금액 목록을 지정하거나 `scenarios.ts`에 PG사별 가맹점 항목을 추가한다. `CARD_POINT_AMOUNTS`를 지정하면 각 PG사, 각 가맹점, 각 금액이 곱해져 `paymentScenarios` 항목이 만들어지고 테스트가 별도로 등록된다. 기존 단일 금액 설정인 `CARD_POINT_AMOUNT`만 있으면 그 값을 단일 금액 목록으로 해석해 호환성을 유지한다. 패밀리포인트에서 `FAMILY_PAYMENT_SHOP_CODES`를 지정하면 각 값과 `FAMILY_PAYMENT_AMOUNTS`의 각 금액이 곱해져 `familyPaymentScenarios` 항목이 만들어지고 테스트가 별도로 등록된다.
`paymentFlow`와 `payLimitRate`는 특정 가맹점만 다른 결제 흐름이나 포인트 사용 제한율을 사용할 때 시나리오 데이터에 추가하는 옵션이다. `payLimitRate`가 있으면 `convertedPointAmount`는 결제금액에 제한율을 적용해 계산한다. 현재는 `세틀_복합결제(소진형)`과 `메크로스/메가파일`이 `payLimitRate=100`, `페이레터/페이레터_1`이 `payLimitRate=50`을 사용한다.

```ts
{
  name: '메크로스 카드포인트 10000 결제',
  pgProvider: { name: '메크로스', code: 'PG0004' },
  paymentAmount: 10000,
  convertedPointAmount: 10000,
  expectedSuccessPattern: /포인트허브 결제 성공/,
}
```

테스트 실행 코드는 시나리오 배열을 순회한다.

```ts
for (const scenario of paymentScenarios) {
  test(scenario.name, async ({ page }) => {
    const pg = new PgPage(page);
    let cardPayment = new CardPointPaymentPage(page);

    await pg.goto();
    await pg.selectPgProvider(scenario.pgProvider);
    if (scenario.shopName) await pg.selectShop(scenario.shopName);
    await pg.setPaymentAmount(scenario.paymentAmount);
    await pg.encrypt();
    cardPayment = new CardPointPaymentPage(await pg.submitTest());
    await cardPayment.lookupTerms();
    await cardPayment.sendVirtualAuth();
    await cardPayment.enterCardPoint(scenario.convertedPointAmount);

    await expectSuccessAlert(cardPayment.page, scenario.expectedSuccessPattern, async () => {
      await cardPayment.pay();
      await cardPayment.confirmIfPresent();
    });
  });
}
```

시나리오 확장은 다음 기준으로 나눈다.

- 데이터만 다른 시나리오: 금액, PG사, 결제수단, 성공 문구만 `scenarios.ts`에 추가한다.
- 흐름이 조금 다른 시나리오: 약관 생략, 다른 팝업, 다른 인증 방식 같은 옵션을 시나리오 데이터에 추가한다.
- 완전히 다른 흐름: 별도 spec 파일을 추가한다.

### Page Load Smoke

- PG 테스트 페이지가 열리는지 확인한다.
- `암호화` 버튼과 `테스트서브밋` 버튼이 존재하는지 확인한다.
- 기본 PG, 상점, 결제수단 값은 화면 기본값을 그대로 사용한다.

### Payment Success E2E

- 결제 시나리오의 PG사 탭과 필요 시 가맹점을 선택한 뒤 `암호화`를 실행한다.
- 결제 시나리오 금액이 기본값과 다르면 암호화 전에 `pay_amt`를 시나리오 금액으로 설정한다.
- `PC전용 Submit`으로 결제 또는 약관 흐름을 시작한다.
- `/pg/identification.do` 화면에서 전체 약관 동의 후 포인트 조회를 실행한다.
- `세틀_복합결제(소진형)`은 `암호화` 후 `pay_limit_rate=100`을 입력하고, 약관 화면에서 `#agreeAll` 선택 후 `#send` 확인으로 본인인증을 시작한다.
- 가상 인증 팝업에서 `전송`만 클릭해 인증 완료 상태로 진행한다.
- 카드사별 목록에서 전환포인트가 시나리오 금액이 되도록 `사용포인트` 입력란을 채운다.
- 현대카드는 전환비율이 `1.5:1`이므로 전환포인트 `5000P`를 맞추려면 사용포인트 `7500M`을 입력한다.
- 결제 후 최종 확인을 클릭한다.
- alert 창의 `포인트허브 결제 성공` 문구가 확인되면 통과로 본다.

### Payment Amount Matrix

- 일반 카드포인트 결제는 기본적으로 `CARD_POINT_AMOUNTS=5000`의 금액 목록을 모든 `PAYMENT_PG_PROVIDERS`에 대해 실행한다.
- 각 PG사는 `scenarios.ts`에 정의한 가맹점 목록과 금액 목록을 곱해 별도 테스트로 등록한다.
- `CARD_POINT_AMOUNTS` 값은 사용포인트 입력값이 아니라 결제금액이자 전환포인트 목표값으로 해석한다.
- 기존 로컬 `.env`에 `CARD_POINT_AMOUNT`만 있으면 그 값을 단일 금액 목록으로 사용한다.
- 각 금액 시나리오는 암호화 전에 `pay_amt`를 해당 금액으로 설정하고, 카드포인트 사용 화면에서는 같은 전환포인트 목표값을 입력한다.

### Family Payment Success E2E

- `패밀리` PG사 탭과 `세틀_패밀리박스` 가맹점을 선택한 뒤 `암호화`를 실행한다.
- `PC전용 Submit`으로 패밀리 약관 흐름을 시작한다.
- 약관 동의 후 본인인증 팝업을 통과한다.
- 패밀리포인트 사용 화면에서 각 카드사 행의 `초기화` 버튼을 눌러 사용포인트를 0으로 만든다.
- `5000` 성공 케이스는 화면 순서대로 카드사 행을 검사해 사용가능 전환포인트가 결제금액 이상인 첫 행의 전환포인트가 결제금액이 되도록 입력한다.
- `확인` 클릭 후 결과 문자열에서 `ret_code=00`을 확인하고 결과 화면의 `확인`을 클릭한다.
- 가족 목록 화면에서 `일괄요청`을 클릭한다.
- `가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다.` 레이어 문구가 확인되면 통과로 본다.

### Family Payment Amount Validation

- 패밀리포인트 할인권 요청은 기본적으로 `900`, `5000`, `501000` 금액을 모든 `FAMILY_PAYMENT_SHOP_CODES`에 대해 실행한다.
- `FAMILY_PAYMENT_AMOUNTS` 값은 사용포인트 입력값이 아니라 전환포인트 목표값으로 해석한다.
- `900` 케이스는 사용포인트를 모두 초기화한 뒤 첫 사용가능 카드사의 전환포인트가 `900`이 되도록 입력하고 `확인`을 클릭한다. `사용 포인트는 1,000P 단위로만 입력 가능합니다.` 레이어 문구가 확인되면 통과로 본다.
- `501000` 케이스는 총 보유 전환포인트가 `501000` 미만이면 `501000포인트 미만 포인트 보유` 메시지로 실패 처리한다.
- 총 보유 전환포인트가 `501000` 이상이면 패밀리포인트 사용 화면 진입 시 자동 설정된 전환포인트에 `1000`포인트만 추가한 뒤 `확인`을 클릭한다. `할인권금액은 최대 500,000원까지 가능합니다.` 레이어 문구가 확인되면 통과로 본다.
- 현대카드는 전환비율이 `1.5:1`이므로 전환포인트 `1000P`를 맞추려면 사용포인트 `1500M`을 입력한다.

### API Terms Inquiry And Agreement

- Playwright `request` fixture로 `/api/v1/r/terms`와 `/api/v1/c/terms`를 직접 호출한다.
- PG 코드, 가맹점, Authorization, `pg_cust_ci`는 `PG_API_*` 환경값을 사용한다.
- 약관 목록 조회 후 `ret_code=00`, `phub_tr_no`, `pg_tr_no`, `cls_list`를 확인한다.
- 필수 약관 ID `PHA1A`, `PHA5A`, `a1A`, `a2A`, `a3A`가 모두 `mdt_yn=Y`로 포함됐는지 확인한다.
- 약관 동의 응답의 `ret_code=00`, 동일 `pg_tr_no`, 동일 `phub_tr_no`가 확인되면 통과로 본다.

### API Point Inquiry And Payment

- 약관 API 조회/동의가 성공한 같은 거래번호로 `/api/v1/r/pnt`를 직접 호출한다.
- 포인트 조회 응답의 `prvdr_list`에서 목표 전환금액을 사용할 수 있는 첫 카드사를 자동 선택한다.
- 선택 카드사 1개로 `/api/v1/c/pnt`를 직접 호출하고 `ret_code=00`, 금액 합계, 거래번호를 확인한다.
- 포인트 사용 성공 후 `/api/v1/d/pnt`를 직접 호출해 사용 취소까지 확인한다.

### Failure Diagnostics

- 각 주요 단계는 Playwright `test.step`으로 감싼다.
- 브라우저 E2E 실패 시 현재 URL, 열린 페이지 수, 주요 visible text 일부를 확인할 수 있게 한다.
- API 직접 호출 실패 시 HTTP status, 요청 path, 요청 body 핵심값, 응답 body가 오류 메시지에 포함되게 한다.
- 브라우저 E2E 실패 artifact로 trace, screenshot, video, HTML report를 남긴다.
- API 직접 호출 테스트는 브라우저를 열지 않으므로 screenshot과 video 증적은 기대하지 않는다.

## Assumptions

- 로컬 서비스는 기본적으로 테스트 실행 전에 사용자가 직접 실행한다.
- 구현 시 `~/docker/middleware-stack`에서 서비스 기동 방법을 파악할 수 있으면 로컬 서비스 기동용 보조 스크립트를 추가할 수 있다.
- 테스트 URL은 기본적으로 `http://localhost/pg/pgfront.do`다.
- `PC전용 Submit` 이후 화면은 새 팝업으로 열린다.
- 전화번호 인증은 기본적으로 가상 인증 팝업의 `전송` 버튼 클릭만으로 통과된다.
- KMC 테스트 인증 화면처럼 이름 입력이 필요한 경우 테스트용 이름을 입력한 뒤 전송한다.
- 실제 외부 결제, 문자, 메일, 재고, 정산 같은 side effect는 없다.
- 화면 결제 플로우는 기본적으로 `세틀뱅크`, `메크로스`, `페이레터` PG사 탭을 각각 선택하고, PG사별 지정 가맹점과 금액 목록을 곱해 실행한다.
- 화면 결제의 기본 가맹점 매트릭스는 `세틀뱅크` 3개, `메크로스` 1개, `페이레터` 3개로 구성한다.
- `세틀_복합결제(소진형)`은 일반 카드포인트 약관 화면과 버튼 구성이 다르므로 전용 페이지 객체에서 처리한다.
- `패밀리` PG사는 일반 카드포인트 결제 기본 목록에서 제외하고 `family-payment` 시나리오로 별도 실행한다.
- 패밀리포인트 기본 금액 매트릭스는 `900`, `5000`, `501000`이다.
- 패밀리포인트 금액 시나리오는 사용포인트 입력값이 아니라 전환포인트 목표값을 기준으로 한다.
- 패밀리포인트 사용 화면에서는 사용가능 전환포인트가 결제금액과 정확히 같은 카드사도 선택 대상에 포함한다.
- 모든 카드포인트 입력 시나리오는 전환포인트 목표값을 기준으로 사용포인트 입력값을 환산한다.
- 현대카드는 전환비율이 `1.5:1`이므로 전환포인트 기준 목표값에 맞춰 사용포인트 입력값을 환산한다.
- 패밀리포인트 할인권 요청 성공 판정은 `5000` 케이스의 `ret_code=00` 결과와 최종 일괄요청 레이어 문구를 기준으로 한다.
- 패밀리포인트 `900` 케이스는 `사용 포인트는 1,000P 단위로만 입력 가능합니다.` 레이어 문구를 정상 결과로 본다.
- 패밀리포인트 `501000` 케이스는 총 보유 전환포인트가 `501000` 이상이어야 하며, 부족하면 `501000포인트 미만 포인트 보유` 메시지로 실패 처리한다.
- 패밀리포인트 `501000` 케이스는 자동 설정된 전환포인트에 `1000`포인트만 추가한 뒤 `할인권금액은 최대 500,000원까지 가능합니다.` 레이어 문구를 정상 결과로 본다.
- 결제수단은 화면 기본값을 변경하지 않는다.
- 카드포인트 전환포인트 목표값 목록은 기본 `5000`이다.
- API 직접 호출 기본값은 `PG_API_BASE_URL=http://localhost`, `PG_API_PG_CD=PG0006`, `PG_API_SHOP_CD=API_ph_CU`, `PG_API_SHOP_PAY_METHOD=CU`, `PG_API_POINT_TARGET_AMOUNT=4000`, `PG_API_SHOP_CMSN_RATE=0`이다.
- API 포인트 결제는 포인트 조회 응답에서 목표 전환금액을 사용할 수 있는 카드사를 자동 선택한다.
- 성공 판정은 alert 창의 `포인트허브 결제 성공` 문구를 기준으로 한다.
- API 약관 동의 성공 판정은 API 응답 `ret_code=00`과 거래번호 일치 여부를 기준으로 한다.
- API 포인트 조회/사용/취소 성공 판정은 API 응답 `ret_code=00`, 거래번호 일치 여부, 금액 합계를 기준으로 한다.
- 실패해도 테스트 데이터 정리는 필요 없다.
- 결제 플로우는 PG사별 기본 카드포인트 결제 시나리오를 유지하고, 금액이나 PG사 추가는 이후 `CARD_POINT_AMOUNTS`, `scenarios.ts` 또는 `PAYMENT_PG_PROVIDERS`에 반영한다.
- PG 연동 API처럼 완전히 다른 흐름은 별도 spec 파일로 추가한다.

## Explicitly Excluded From V1

- GitHub Actions 실행 구성
- Slack 또는 메신저 알림
- 운영 환경 대상 테스트
- 결제수단 확장 매트릭스 테스트
- 테스트 데이터 정리 자동화
