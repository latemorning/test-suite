import { env } from '../support/env';
import type { ApiRequiredTermExpectation } from './pg-api-client';

/**
 * 화면 결제 E2E에서 시나리오별로 바뀌는 전환포인트 목표값과 성공 기준이다.
 */
export type PaymentScenario = {
  name: string;
  pgProvider: PaymentPgProvider;
  shopName?: string;
  paymentAmount: number;
  convertedPointAmount: number;
  paymentFlow: PaymentFlow;
  payLimitRate?: number;
  expectedSuccessPattern: RegExp;
};

export type PaymentFlow = 'standard-card-point' | 'settle-combined-exhaustion';

/**
 * 패밀리포인트 할인권 요청 플로우에서 시나리오별로 바뀌는 입력값과 성공 기준이다.
 */
export type FamilyPaymentScenario = FamilyPaymentScenarioBase &
  (
    | FamilyPaymentSuccessExpectation
    | FamilyPaymentPointUnitErrorExpectation
    | FamilyPaymentMaxAmountErrorExpectation
  );

type FamilyPaymentScenarioBase = {
  name: string;
  pgProvider: PaymentPgProvider;
  shopName?: string;
  shopCode?: string;
  paymentAmount: number;
};

type FamilyPaymentSuccessExpectation = {
  expectedOutcome: 'success';
  convertedPointAmount: number;
  expectedSuccessPattern: RegExp;
};

type FamilyPaymentPointUnitErrorExpectation = {
  expectedOutcome: 'point-unit-error';
  invalidConvertedPointAmount: number;
  expectedLayerPattern: RegExp;
};

type FamilyPaymentMaxAmountErrorExpectation = {
  expectedOutcome: 'maximum-amount-error';
  minimumTotalAvailableConvertedPointAmount: number;
  additionalConvertedPointAmount: number;
  expectedLayerPattern: RegExp;
  insufficientPointMessage: string;
};

type FamilyPaymentScenarioExpectation =
  | FamilyPaymentSuccessExpectation
  | FamilyPaymentPointUnitErrorExpectation
  | FamilyPaymentMaxAmountErrorExpectation;

type FamilyPaymentShopSelection = {
  label: string;
  shopName?: string;
  shopCode?: string;
};

/**
 * 화면 결제 E2E에서 선택할 PG사 탭과 검증용 PG 코드다.
 */
export type PaymentPgProvider = {
  name: string;
  code: string;
};

type PaymentPgProviderConfig = PaymentPgProvider & {
  shops: PaymentShopConfig[];
};

type PaymentShopConfig = {
  name: string;
  paymentFlow?: PaymentFlow;
  payLimitRate?: number;
};

const paymentPgProvidersByName: Record<string, PaymentPgProviderConfig> = {
  세틀뱅크: {
    name: '세틀뱅크',
    code: 'PG0001',
    shops: [
      { name: '굿툰' },
      { name: '수커뮤니케이션' },
      {
        name: '세틀_복합결제(소진형)',
        paymentFlow: 'settle-combined-exhaustion',
        payLimitRate: 100,
      },
    ],
  },
  메크로스: {
    name: '메크로스',
    code: 'PG0004',
    shops: [{ name: '메가파일', payLimitRate: 100 }],
  },
  페이레터: {
    name: '페이레터',
    code: 'PG0006',
    shops: [
      { name: '페이레터_UI_CU' },
      { name: '페이레터_UI_SI' },
      { name: '페이레터_1', payLimitRate: 50 },
    ],
  },
};

const familyPaymentPgProvider: PaymentPgProvider = { name: '패밀리', code: 'PG_FAM' };
const familyPaymentPointUnitErrorPattern =
  /사용\s*포인트는\s*1,000P\s*단위로만\s*입력\s*가능합니다/;
const familyPaymentMaxAmountErrorPattern =
  /할인권금액은\s*최대\s*500,000원까지\s*가능합니다\.?/;

/**
 * v1 결제 플로우에서 지원하는 PG사별 카드포인트 결제 시나리오다.
 */
export const paymentScenarios: PaymentScenario[] = env.paymentPgProviderNames.flatMap(
  (providerName) => {
    const pgProvider = paymentPgProvidersByName[providerName];
    if (!pgProvider) {
      throw new Error(
        [
          `Unsupported PAYMENT_PG_PROVIDERS entry: ${providerName}`,
          `Supported providers: ${Object.keys(paymentPgProvidersByName).join(', ')}`,
        ].join('\n'),
      );
    }

    return pgProvider.shops.flatMap((shop) =>
      env.cardPointAmounts.map((paymentAmount) => ({
        name: `${pgProvider.name} ${shop.name} 카드포인트 ${paymentAmount} 결제`,
        pgProvider,
        shopName: shop.name,
        paymentAmount,
        convertedPointAmount: resolveConvertedPointAmount(paymentAmount, shop.payLimitRate),
        paymentFlow: shop.paymentFlow ?? 'standard-card-point',
        payLimitRate: shop.payLimitRate,
        expectedSuccessPattern: new RegExp(env.successTextPattern),
      })),
    );
  },
);

/**
 * 일반 카드포인트 결제와 성공 화면이 다른 패밀리포인트 할인권 요청 시나리오다.
 */
export const familyPaymentScenarios: FamilyPaymentScenario[] = buildFamilyPaymentScenarios();

function buildFamilyPaymentScenarios(): FamilyPaymentScenario[] {
  return buildFamilyPaymentShopSelections().flatMap(({ label, ...shopSelection }) =>
    env.familyPaymentAmounts.map((paymentAmount) => {
      const expectation = buildFamilyPaymentExpectation(paymentAmount);

      return {
        name: `패밀리 ${label} 할인권 ${paymentAmount} 결제 ${formatFamilyPaymentExpectation(
          expectation,
        )}`,
        pgProvider: familyPaymentPgProvider,
        paymentAmount,
        ...shopSelection,
        ...expectation,
      };
    }),
  );
}

function buildFamilyPaymentShopSelections(): FamilyPaymentShopSelection[] {
  if (env.familyPaymentShopCodes.length > 0) {
    return env.familyPaymentShopCodes.map((shopCode) => ({
      label: `shop_cd ${shopCode}`,
      shopCode,
    }));
  }

  return [
    {
      label: env.familyPaymentShopName,
      shopName: env.familyPaymentShopName,
    },
  ];
}

function buildFamilyPaymentExpectation(paymentAmount: number): FamilyPaymentScenarioExpectation {
  if (paymentAmount === 900) {
    return {
      expectedOutcome: 'point-unit-error',
      invalidConvertedPointAmount: 900,
      expectedLayerPattern: familyPaymentPointUnitErrorPattern,
    };
  }

  if (paymentAmount === 501000) {
    return {
      expectedOutcome: 'maximum-amount-error',
      minimumTotalAvailableConvertedPointAmount: 501000,
      additionalConvertedPointAmount: 1000,
      expectedLayerPattern: familyPaymentMaxAmountErrorPattern,
      insufficientPointMessage: '501000포인트 미만 포인트 보유',
    };
  }

  return {
    expectedOutcome: 'success',
    convertedPointAmount: paymentAmount,
    expectedSuccessPattern: new RegExp(env.familyPaymentSuccessTextPattern),
  };
}

function resolveConvertedPointAmount(paymentAmount: number, payLimitRate?: number): number {
  if (payLimitRate === undefined) return paymentAmount;
  return Math.floor((paymentAmount * payLimitRate) / 100);
}

function formatFamilyPaymentExpectation(expectation: FamilyPaymentScenarioExpectation): string {
  if (expectation.expectedOutcome === 'point-unit-error') return '1000P 단위 오류';
  if (expectation.expectedOutcome === 'maximum-amount-error') return '최대 금액 오류';
  return '성공';
}

/**
 * PG API 직접 호출 약관 조회/동의 흐름 데이터다.
 */
export type ApiTermsScenario = {
  name: string;
  requiredTerms: ApiRequiredTermExpectation[];
};

/**
 * Postman 로컬 컬렉션 기준 PG0006 CU 약관 API 기본 시나리오다.
 */
export const apiTermsScenario: ApiTermsScenario = {
  name: `${env.pgApiPgCd} ${env.pgApiShopPayMethod} 약관 목록 조회 및 동의`,
  requiredTerms: [
    { clsId: 'PHA1A', mandatory: 'Y' },
    { clsId: 'PHA5A', mandatory: 'Y' },
    { clsId: 'a1A', mandatory: 'Y' },
    { clsId: 'a2A', mandatory: 'Y' },
    { clsId: 'a3A', mandatory: 'Y' },
  ],
};

/**
 * 약관 동의 이후 같은 거래 흐름에서 포인트 조회/사용/취소를 이어가기 위한 시나리오다.
 */
export type ApiPointPaymentScenario = {
  name: string;
  terms: ApiTermsScenario;
  targetPointAmount: number;
  shopCmsnRate: number;
};

/**
 * v1 포인트 API 직접 호출의 기본 카드포인트 사용 및 취소 시나리오다.
 */
export const apiPointPaymentScenario: ApiPointPaymentScenario = {
  name: `약관 동의 후 포인트 API ${env.pgApiShopPayMethod} ${env.pgApiPointTargetAmount} 사용 및 취소`,
  terms: apiTermsScenario,
  targetPointAmount: env.pgApiPointTargetAmount,
  shopCmsnRate: env.pgApiShopCmsnRate,
};
