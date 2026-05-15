import { test } from '@playwright/test';
import { PgApiClient } from './pg-api-client';
import { apiTermsScenario } from './scenarios';

test.describe('PG local direct API terms flow', { tag: '@api-terms' }, () => {
  test(apiTermsScenario.name, async ({ request }) => {
    const api = new PgApiClient(request);

    await test.step('약관 조회 및 필수 약관 전체 동의 API 직접 호출', async () => {
      await api.runTermsFlow(apiTermsScenario.requiredTerms);
    });
  });
});
