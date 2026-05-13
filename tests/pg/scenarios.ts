import { env } from '../support/env';
import type { ApiPointPaymentParams } from './api-point-page';
import type {
  ApiTermsAgreementParams,
  ApiTermsCommonParams,
  ExpectedApiTerm,
} from './api-terms-page';

/**
 * 화면 결제 E2E에서 시나리오별로 바뀌는 입력값과 성공 기준이다.
 */
export type PaymentScenario = {
  name: string;
  pgProvider: PaymentPgProvider;
  shopName?: string;
  pointAmount: number;
  expectedSuccessPattern: RegExp;
};

/**
 * 패밀리포인트 할인권 요청 플로우에서 시나리오별로 바뀌는 입력값과 성공 기준이다.
 */
export type FamilyPaymentScenario = {
  name: string;
  pgProvider: PaymentPgProvider;
  shopName: string;
  paymentAmount: number;
  usePointAmount: number;
  expectedSuccessPattern: RegExp;
};

/**
 * 화면 결제 E2E에서 선택할 PG사 탭, 검증용 PG 코드, 필요 시 가맹점 기본값이다.
 */
export type PaymentPgProvider = {
  name: string;
  code: string;
  shopName?: string;
};

const paymentPgProvidersByName: Record<string, PaymentPgProvider> = {
  세틀뱅크: { name: '세틀뱅크', code: 'PG0001' },
  메크로스: { name: '메크로스', code: 'PG0004' },
  페이레터: { name: '페이레터', code: 'PG0006', shopName: '페이레터_UI_CU' },
};

const familyPaymentPgProvider: PaymentPgProvider = { name: '패밀리', code: 'PG_FAM' };

/**
 * v1 결제 플로우에서 지원하는 PG사별 카드포인트 결제 시나리오다.
 */
export const paymentScenarios: PaymentScenario[] = env.paymentPgProviderNames.map((providerName) => {
  const pgProvider = paymentPgProvidersByName[providerName];
  if (!pgProvider) {
    throw new Error(
      [
        `Unsupported PAYMENT_PG_PROVIDERS entry: ${providerName}`,
        `Supported providers: ${Object.keys(paymentPgProvidersByName).join(', ')}`,
      ].join('\n'),
    );
  }

  return {
    name: `${pgProvider.name} 카드포인트 ${env.cardPointAmount} 결제`,
    pgProvider,
    shopName: pgProvider.shopName,
    pointAmount: env.cardPointAmount,
    expectedSuccessPattern: new RegExp(env.successTextPattern),
  };
});

/**
 * 일반 카드포인트 결제와 성공 화면이 다른 패밀리포인트 할인권 요청 시나리오다.
 */
export const familyPaymentScenario: FamilyPaymentScenario = {
  name: `패밀리 할인권 ${env.familyPaymentAmount} 결제`,
  pgProvider: familyPaymentPgProvider,
  shopName: env.familyPaymentShopName,
  paymentAmount: env.familyPaymentAmount,
  usePointAmount: env.familyPaymentUsePointAmount,
  expectedSuccessPattern: new RegExp(env.familyPaymentSuccessTextPattern),
};

/**
 * PG 연동 API 테스트 영역의 약관 조회/동의 흐름 데이터다.
 */
export type ApiTermsScenario = {
  name: string;
  commonParams: ApiTermsCommonParams;
  expectedTerms: ExpectedApiTerm[];
  agreementParams: ApiTermsAgreementParams;
  expectedAlert: RegExp;
};

/**
 * 테스트 계획에 명시된 PG0004 약관 API 기본 시나리오다.
 */
export const apiTermsScenario: ApiTermsScenario = {
  name: 'PG0004 메크로스 약관 목록 조회 및 동의',
  commonParams: {
    pgCode: 'PG0004',
    shopNameParts: ['네이버페이쿠폰', '10', '부담'],
    authorizationNameParts: ['PG0004', '메크로'],
    // 로컬 PG 페이지가 암호화된 고객 식별값을 요구하므로 계획 문서의 고정값을 그대로 사용한다.
    pgCustCi:
      'VWQ0XWXdhh3X9+z1h8+//wGfWRi+HP8zbD9R8B7LsL8kxgTWmWnoPjMvm1pf7QktPH7/Bnu8yS/Wlaw47TZn6y3yv8b1UFqmNerdTYDmZeT++2geSd6AavyG4oJSnTYZ',
  },
  expectedTerms: [
    { title: '포인트다모아(포인트허브) 약관', hasViewLink: true },
    { title: '포인트다모아 개인정보 처리 방침', hasViewLink: true },
    { title: '개인정보 수집/이용 동의', hasViewLink: true },
    { title: '본인은 주식회사 케이티가 다음의 목적을 위하여 해당 정보를 제공함에 동의합니다.' },
    { title: '포인트 사용에 동의하시겠습니까?' },
  ],
  agreementParams: {
    pgCustName: 'iplN7+Z1mztKbluon55Olw==',
    pgCustCtn: '4N16Uy/P/56ultYiHOa1eA==',
    isMdtAll: 'Y',
  },
  expectedAlert: /약관 동의가 완료되었습니다\.?/,
};

/**
 * 약관 동의 이후 같은 거래 흐름에서 포인트 조회/결제를 이어가기 위한 시나리오다.
 */
export type ApiPointPaymentScenario = {
  name: string;
  terms: ApiTermsScenario;
  pointParams: ApiPointPaymentParams;
};

/**
 * v1 포인트 API 결제의 기본 KB 카드포인트 시나리오다.
 */
export const apiPointPaymentScenario: ApiPointPaymentScenario = {
  name: '약관 동의 후 포인트 API KB 카드포인트 결제',
  terms: apiTermsScenario,
  pointParams: {
    ttlPnt: env.apiPointTtlPnt,
    ttlPayAmt: env.apiPointTtlPayAmt,
    ttlPntAmt: env.apiPointTtlPntAmt,
    shopCmsnRate: env.apiPointShopCmsnRate,
    cardPoint: {
      providerCode: env.apiPointCardProvider,
      usePoint: env.apiPointTtlPnt,
      conversionRate: env.apiPointTtlPntAmt / env.apiPointTtlPnt,
    },
  },
};
