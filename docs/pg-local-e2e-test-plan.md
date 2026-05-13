# 로컬 PG 결제 플로우 자동화 테스트 계획

## Summary

이 프로젝트는 로컬에 실행 중인 PG 테스트 페이지의 결제 플로우와 PG 연동 API 테스트 영역을 자동화하기 위한 테스트 프로젝트다.

- 테스트 대상 URL: `http://localhost/pg/pgfront.do`
- 기본 스택: TypeScript + Playwright
- 실행 대상: 로컬 환경
- 테스트 방식: 실제 브라우저 E2E
- v1 목표: 핵심 결제 플로우, API 약관 조회/동의 흐름, API 포인트 조회/결제 흐름이 정상 완료되는지 회귀 테스트로 검증

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
CARD_POINT_AMOUNT=5000
SUCCESS_TEXT_PATTERN=포인트허브 결제 성공
FAMILY_PAYMENT_AMOUNT=5000
FAMILY_PAYMENT_USE_POINT_AMOUNT=5000
FAMILY_PAYMENT_SHOP_NAME=세틀_패밀리박스
FAMILY_PAYMENT_SUCCESS_TEXT_PATTERN=가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다
API_POINT_TTL_PNT=1000
API_POINT_TTL_PAY_AMT=5000
API_POINT_TTL_PNT_AMT=1000
API_POINT_CARD_PROVIDER=KB
API_POINT_SHOP_CMSN_RATE=10
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
   - 현재 `페이레터`는 기본 가맹점 대신 `페이레터_UI_CU` 사용
5. `암호화` 버튼 클릭
6. `PC전용 Submit` 버튼 클릭
7. 약관 화면에서 `전체 약관 동의 후 포인트조회하기(선택포함)` 또는 같은 의미의 본인인증 진입 버튼 클릭
8. 가상 인증 팝업에서 필요 시 테스트 이름을 입력한 뒤 `전송` 버튼 클릭
9. 카드사별 목록의 `사용포인트` 입력란에 `5000` 입력
10. `결제` 또는 `전환하기` 버튼 클릭
11. 최종 `확인` 버튼 클릭
12. alert 창의 `포인트허브 결제 성공` 문구 확인

패밀리포인트 할인권 요청은 `PC전용 Submit` 이후 팝업 흐름과 성공 조건이 다르므로 별도 시나리오로 진행한다.

1. `http://localhost/pg/pgfront.do` 접속
2. `패밀리` PG사 탭 선택
3. `세틀_패밀리박스` 가맹점 선택
4. 필요 시 `pay_amt`를 `FAMILY_PAYMENT_AMOUNT` 값으로 설정
5. `암호화` 버튼 클릭
6. `PC전용 Submit` 버튼 클릭
7. 패밀리 약관 화면에서 `전체 약관 동의 후 본인인증하기` 클릭
8. 가상 인증 팝업에서 필요 시 테스트 이름을 입력한 뒤 `전송` 버튼 클릭
9. 패밀리포인트 사용 화면에서 각 카드사 행의 `초기화` 버튼을 클릭해 사용포인트를 0으로 설정
10. 카드사 행을 화면 순서대로 검색해 사용가능 포인트가 `FAMILY_PAYMENT_USE_POINT_AMOUNT` 이상인 첫 행의 사용포인트만 `FAMILY_PAYMENT_USE_POINT_AMOUNT`로 입력
11. `확인` 버튼 클릭
12. 결과 문자열에서 `ret_code=00` 확인 후 결과 화면의 `확인` 버튼 클릭
13. 가족 목록 화면에서 `일괄요청` 클릭
14. 레이어 팝업의 `가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다.` 문구 확인 후 `확인` 버튼 클릭

## PG API Terms Flow

결제 화면과 별개로, 같은 시작 URL의 `PG 연동 API 테스트` 영역에서 약관 API 흐름을 검증한다.

1. `http://localhost/pg/pgfront.do` 접속
2. `PG 연동 API 테스트` 영역으로 스크롤
3. 약관 API 탭이 보이는지 확인
4. 공통 파라미터 입력
   - PG 코드: `PG0004 (메크로스)`
   - 가맹점: `네이버페이쿠폰 10 부담`
   - Authorization: `PG0004 메크로` 인증키
   - `pg_cust_ci`: `VWQ0XWXdhh3X9+z1h8+//wGfWRi+HP8zbD9R8B7LsL8kxgTWmWnoPjMvm1pf7QktPH7/Bnu8yS/Wlaw47TZn6y3yv8b1UFqmNerdTYDmZeT++2geSd6AavyG4oJSnTYZ`
5. `약관 목록 조회 (/api/v1/r/terms)` 버튼 클릭
6. 하단 약관 목록에 다음 약관 텍스트가 출력되는지 확인
   - `포인트다모아(포인트허브) 약관 (필수)약관 보기`
   - `포인트다모아 개인정보 처리 방침 (필수)약관 보기`
   - `개인정보 수집/이용 동의 (필수)약관 보기`
   - `본인은 주식회사 케이티가 다음의 목적을 위하여 해당 정보를 제공함에 동의합니다. (필수)`
   - `포인트 사용에 동의하시겠습니까? (필수)`
7. 약관 동의 추가 정보 입력
   - `pg_cust_name`: `iplN7+Z1mztKbluon55Olw==`
   - `pg_cust_ctn`: `4N16Uy/P/56ultYiHOa1eA==`
   - `is_mdt_all`: `Y`
8. `약관 동의 (/api/v1/c/terms)` 버튼 클릭
9. alert 창의 `약관 동의가 완료되었습니다.` 문구 확인

## PG API Point Payment Flow

`PG 연동 API 테스트` 영역에서 약관 API 흐름이 성공한 뒤 같은 공통 파라미터와 거래번호로 포인트 API 조회/결제를 검증한다.

1. `PG API Terms Flow`의 약관 동의 성공 alert까지 완료
2. 우측 `포인트 API` 버튼 클릭
3. 포인트 API 파라미터 입력
   - `ttl_pnt`: `1000`
   - `ttl_pay_amt`: `5000`
   - `ttl_pnt_amt`: `1000`
   - `shop_cmsn_rate`: `10`
4. 카드 포인트 입력 영역에서 `KB (KB국민카드)` 선택
5. 카드 사용 포인트에 `1000` 입력
6. `포인트 조회 (/api/v1/r/pnt)` 버튼 클릭
7. 결과 영역에 `포인트 조회 성공`이 출력되고 `포인트 결제` 버튼이 활성화되는지 확인
8. `포인트 결제 (/api/v1/c/pnt)` 버튼 클릭
9. 결과 영역에 `포인트 결제 성공`이 출력되는지 확인

## Selector Policy

구현 시 셀렉터는 사용자에게 보이는 의미를 우선한다.

- 버튼은 `getByRole('button', { name: /암호화|PC전용 Submit|포인트조회하기|전송|결제|전환하기|확인/ })` 형태를 우선 사용한다.
- PG사 선택은 `ul.tabs li`의 노출 텍스트를 우선 사용하고, 선택 후 `#pg_cd` 값으로 PG 코드가 갱신됐는지 확인한다.
- 가맹점 선택이 필요한 시나리오는 `#shop_sel` 옵션 텍스트로 선택하고 `#shopName` 값으로 반영 여부를 확인한다.
- `포인트조회하기`처럼 button role이 아닌 clickable 텍스트는 visible text 클릭 fallback을 사용한다.
- 입력 필드는 label, name, id, 주변 텍스트 기반 탐색 순서로 찾는다.
- 카드포인트 입력란은 명시 라벨이 없으므로 카드사별 목록의 `사용포인트` 헤더 아래 `input.pnt` 입력 필드를 우선 찾는다.
- 팝업은 `page.waitForEvent('popup')` 또는 브라우저 컨텍스트의 새 페이지 이벤트를 기다린 뒤 해당 페이지에서 조작한다.
- 텍스트가 불안정하거나 중복될 경우에만 CSS selector나 XPath를 보조로 사용한다.
- `약관조회하기`, `전송`, `결제`, `확인` 버튼명은 화면 내 중복되지 않는다는 전제로 role 기반 selector를 우선한다.
- 패밀리포인트 사용 화면은 `.pointGroup` 단위로 카드사 행을 순회하고, `.initBtn`, `.avlPnt`, `input.pnt`, `#confirmBtn`을 우선 사용한다.
- 패밀리 결과/요청 화면은 `#btn_confirm`, `#btnReqAll`, `#myPopup`과 최종 요청 메시지 텍스트를 우선 사용한다.
- API 테스트 영역은 명시적인 `id`가 제공되므로 `#api-test`, `#api_pg_cd`, `#api_shop_sel`, `#api_authorization`, `#api_pg_cust_ci` 같은 안정적인 DOM id를 우선 사용한다.
- 포인트 API 영역은 `data-api-tab="point"`, `.api-section-point`, `#api_ttl_pnt`, `#api_ttl_pay_amt`, `#api_ttl_pnt_amt`, `#api_card_point_list`, `#api_point_pay_btn`, `#api_result` 같은 안정적인 DOM id와 class를 우선 사용한다.

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
    pg-page.ts
    card-point-payment-page.ts
    family-payment-page.ts
    api-terms-page.ts
    api-point-page.ts
    page-actions.ts
    assertions.ts
```

- `payment.spec.ts`: 시나리오 목록을 순회하며 실제 테스트를 실행한다.
- `family-payment.spec.ts`: 패밀리포인트 할인권 요청 전용 흐름을 실행한다.
- `api-terms.spec.ts`: PG 연동 API 테스트 영역의 약관 조회/동의 흐름을 실행한다.
- `api-point-payment.spec.ts`: 약관 API 성공 후 포인트 API 조회/결제 흐름을 실행한다.
- `scenarios.ts`: 금액, PG 설정, 결제수단, 기대 성공 패턴 같은 시나리오 데이터를 정의한다.
- `pg-page.ts`: 페이지 접속, PG/가맹점 선택, 암호화, `PC전용 Submit`까지의 공통 시작 흐름을 제공한다.
- `card-point-payment-page.ts`: `PC전용 Submit` 이후 일반 카드포인트 결제 팝업 흐름을 제공한다.
- `family-payment-page.ts`: `PC전용 Submit` 이후 패밀리포인트 사용, 결과 확인, 일괄요청 흐름을 제공한다.
- `api-terms-page.ts`: API 테스트 영역 진입, 공통 파라미터 입력, 약관 조회, 약관 동의 조작 함수를 제공한다.
- `api-point-page.ts`: 포인트 API 탭 진입, 포인트 금액/카드 포인트 입력, 포인트 조회, 포인트 결제 조작 함수를 제공한다.
- `page-actions.ts`: 버튼 탐색, 팝업 전환, 인증 팝업 처리 같은 저수준 화면 조작 유틸을 제공한다.
- `assertions.ts`: 성공 문구, alert, 팝업, 네트워크 응답 등 성공/실패 판정 로직을 제공한다.

시나리오는 데이터로 추가한다.

```ts
export const paymentScenarios = [
  {
    name: '기본 카드포인트 5000 결제',
    pointAmount: 5000,
    pgProvider: { name: '세틀뱅크', code: 'PG0001' },
    expectedSuccessPattern: /포인트허브 결제 성공/,
  },
];
```

패밀리포인트 할인권 요청은 일반 결제 시나리오와 분리한다.

```ts
export const familyPaymentScenario = {
  name: '패밀리 할인권 5000 결제',
  pgProvider: { name: '패밀리', code: 'PG_FAM' },
  shopName: '세틀_패밀리박스',
  paymentAmount: 5000,
  usePointAmount: 5000,
  expectedSuccessPattern: /할인권 요청 메시지가 발송 되었습니다/,
};
```

나중에 금액이나 설정만 다른 시나리오는 `scenarios.ts`에 항목을 하나 더 추가한다.

```ts
{
  name: '메크로스 카드포인트 10000 결제',
  pgProvider: { name: '메크로스', code: 'PG0004' },
  pointAmount: 10000,
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
    await pg.encrypt();
    cardPayment = new CardPointPaymentPage(await pg.submitTest());
    await cardPayment.lookupTerms();
    await cardPayment.sendVirtualAuth();
    await cardPayment.enterCardPoint(scenario.pointAmount);

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
- `PC전용 Submit`으로 결제 또는 약관 흐름을 시작한다.
- `/pg/identification.do` 화면에서 전체 약관 동의 후 포인트 조회를 실행한다.
- 가상 인증 팝업에서 `전송`만 클릭해 인증 완료 상태로 진행한다.
- 카드사별 목록의 `사용포인트` 입력란에 `5000`을 입력한다.
- 결제 후 최종 확인을 클릭한다.
- alert 창의 `포인트허브 결제 성공` 문구가 확인되면 통과로 본다.

### Family Payment Success E2E

- `패밀리` PG사 탭과 `세틀_패밀리박스` 가맹점을 선택한 뒤 `암호화`를 실행한다.
- `PC전용 Submit`으로 패밀리 약관 흐름을 시작한다.
- 약관 동의 후 본인인증 팝업을 통과한다.
- 패밀리포인트 사용 화면에서 각 카드사 행의 `초기화` 버튼을 눌러 사용포인트를 0으로 만든다.
- 화면 순서대로 카드사 행을 검사해 사용가능 포인트가 `5000` 이상인 첫 행의 사용포인트만 `5000`으로 입력한다.
- `확인` 클릭 후 결과 문자열에서 `ret_code=00`을 확인하고 결과 화면의 `확인`을 클릭한다.
- 가족 목록 화면에서 `일괄요청`을 클릭한다.
- `가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다.` 레이어 문구가 확인되면 통과로 본다.

### API Terms Inquiry And Agreement

- PG 연동 API 테스트 영역에서 약관 API 탭을 사용한다.
- PG 코드, 가맹점, Authorization, `pg_cust_ci`를 지정값으로 입력한다.
- 약관 목록 조회 후 필수 약관 5개가 화면에 표시되는지 확인한다.
- `pg_cust_name`, `pg_cust_ctn`, `is_mdt_all`을 입력하고 약관 동의를 실행한다.
- alert 창의 `약관 동의가 완료되었습니다.` 문구가 확인되면 통과로 본다.

### API Point Inquiry And Payment

- 약관 API 조회/동의가 성공한 같은 페이지에서 포인트 API 탭을 사용한다.
- `ttl_pnt`, `ttl_pay_amt`, `ttl_pnt_amt`를 지정값으로 입력한다.
- 카드 포인트 입력 영역에 `KB (KB국민카드)`와 사용 포인트를 입력한다.
- 포인트 조회 성공 후 결제 버튼이 활성화되는지 확인한다.
- 포인트 결제 후 결과 영역의 `포인트 결제 성공` 문구가 확인되면 통과로 본다.

### Failure Diagnostics

- 각 주요 단계는 Playwright `test.step`으로 감싼다.
- 실패 시 현재 URL, 열린 페이지 수, 주요 visible text 일부를 확인할 수 있게 한다.
- 실패 artifact로 trace, screenshot, video, HTML report를 남긴다.

## Assumptions

- 로컬 서비스는 기본적으로 테스트 실행 전에 사용자가 직접 실행한다.
- 구현 시 `~/docker/middleware-stack`에서 서비스 기동 방법을 파악할 수 있으면 로컬 서비스 기동용 보조 스크립트를 추가할 수 있다.
- 테스트 URL은 기본적으로 `http://localhost/pg/pgfront.do`다.
- `PC전용 Submit` 이후 화면은 새 팝업으로 열린다.
- 전화번호 인증은 기본적으로 가상 인증 팝업의 `전송` 버튼 클릭만으로 통과된다.
- KMC 테스트 인증 화면처럼 이름 입력이 필요한 경우 테스트용 이름을 입력한 뒤 전송한다.
- 실제 외부 결제, 문자, 메일, 재고, 정산 같은 side effect는 없다.
- 화면 결제 플로우는 기본적으로 `세틀뱅크`, `메크로스`, `페이레터` PG사 탭을 각각 선택해 실행한다.
- `페이레터` 화면 결제는 기본 가맹점이 오류 화면으로 진입하므로 `페이레터_UI_CU` 가맹점을 사용한다.
- `패밀리` PG사는 일반 카드포인트 결제 기본 목록에서 제외하고 `family-payment` 시나리오로 별도 실행한다.
- 패밀리포인트 사용 화면에서는 사용가능 포인트가 정확히 `5000`인 카드사도 선택 대상에 포함한다.
- 패밀리포인트 할인권 요청 성공 판정은 `ret_code=00` 결과와 최종 일괄요청 레이어 문구를 기준으로 한다.
- 결제수단은 화면 기본값을 변경하지 않는다.
- 카드포인트 입력값은 기본 `5000`이다.
- API 포인트 결제 입력값은 기본 `ttl_pnt=1000`, `ttl_pay_amt=5000`, `ttl_pnt_amt=1000`, `shop_cmsn_rate=10`, 카드사 `KB (KB국민카드)`다.
- 성공 판정은 alert 창의 `포인트허브 결제 성공` 문구를 기준으로 한다.
- API 약관 동의 성공 판정은 alert 창의 `약관 동의가 완료되었습니다.` 문구를 기준으로 한다.
- API 포인트 조회/결제 성공 판정은 `#api_result` 결과 영역의 `포인트 조회 성공`, `포인트 결제 성공` 문구를 기준으로 한다.
- 실패해도 테스트 데이터 정리는 필요 없다.
- 결제 플로우는 PG사별 기본 카드포인트 결제 시나리오를 유지하고, 금액이나 PG사 추가는 이후 `scenarios.ts` 또는 `PAYMENT_PG_PROVIDERS`에 반영한다.
- PG 연동 API 테스트처럼 완전히 다른 영역은 별도 spec 파일로 추가한다.

## Explicitly Excluded From V1

- GitHub Actions 실행 구성
- Slack 또는 메신저 알림
- 운영 환경 대상 테스트
- API 직접 호출 우회 테스트
- 여러 PG사나 결제수단에 대한 매트릭스 테스트
- 테스트 데이터 정리 자동화
