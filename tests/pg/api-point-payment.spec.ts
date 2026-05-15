import { test } from '@playwright/test';
import { PgApiClient } from './pg-api-client';
import { apiPointPaymentScenario } from './scenarios';

test.describe('PG local direct API point payment flow', { tag: ['@api-point', '@api-payment'] }, () => {
  test(apiPointPaymentScenario.name, async ({ request }) => {
    const api = new PgApiClient(request);
    const { terms, targetPointAmount, shopCmsnRate } = apiPointPaymentScenario;

    const termsFlow = await test.step('약관 조회 및 필수 약관 전체 동의 API 직접 호출', async () => {
      return api.runTermsFlow(terms.requiredTerms);
    });

    await test.step('포인트 조회, 사용, 취소 API 직접 호출', async () => {
      await api.runPointPaymentFlow(termsFlow, targetPointAmount, shopCmsnRate);
    });
  });
});
