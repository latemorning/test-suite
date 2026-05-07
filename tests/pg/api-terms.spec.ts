import { test } from '@playwright/test';
import { expectSuccessAlert } from './assertions';
import { ApiTermsPage } from './api-terms-page';
import { apiTermsScenario } from './scenarios';

test.describe('PG local API terms flow', { tag: '@api-terms' }, () => {
  test(apiTermsScenario.name, async ({ page }) => {
    const apiTerms = new ApiTermsPage(page);

    await test.step('페이지 접속', async () => {
      await apiTerms.goto();
    });

    await test.step('PG 연동 API 테스트 약관 영역 열기', async () => {
      await apiTerms.openTermsApiArea();
    });

    await test.step('공통 파라미터 입력', async () => {
      await apiTerms.fillCommonParams(apiTermsScenario.commonParams);
    });

    await test.step('약관 목록 조회 및 출력 확인', async () => {
      await apiTerms.inquireTerms();
      await apiTerms.expectTermsList(apiTermsScenario.expectedTerms);
    });

    await test.step('약관 동의 추가 정보 입력', async () => {
      await apiTerms.fillAgreementParams(apiTermsScenario.agreementParams);
    });

    await test.step('약관 동의 alert 확인', async () => {
      await expectSuccessAlert(page, apiTermsScenario.expectedAlert, async () => {
        await apiTerms.agreeTerms();
      });
    });
  });
});
