import { test } from '@playwright/test';
import { expectSuccessAlert } from './assertions';
import { ApiPointPage } from './api-point-page';
import { ApiTermsPage } from './api-terms-page';
import { apiPointPaymentScenario } from './scenarios';

test.describe('PG local API point payment flow', { tag: ['@api-point', '@api-payment'] }, () => {
  test(apiPointPaymentScenario.name, async ({ page }) => {
    const apiTerms = new ApiTermsPage(page);
    const apiPoint = new ApiPointPage(page);
    const { terms, pointParams } = apiPointPaymentScenario;
    // 포인트 API 결제는 약관 동의로 생성된 거래번호를 같은 페이지에서 이어서 사용한다.

    await test.step('페이지 접속', async () => {
      await apiTerms.goto();
    });

    await test.step('PG 연동 API 테스트 약관 영역 열기', async () => {
      await apiTerms.openTermsApiArea();
    });

    await test.step('약관 API 공통 파라미터 입력', async () => {
      await apiTerms.fillCommonParams(terms.commonParams);
    });

    await test.step('약관 목록 조회 및 출력 확인', async () => {
      await apiTerms.inquireTerms();
      await apiTerms.expectTermsList(terms.expectedTerms);
    });

    await test.step('약관 동의 추가 정보 입력', async () => {
      await apiTerms.fillAgreementParams(terms.agreementParams);
    });

    await test.step('약관 동의 alert 확인', async () => {
      await expectSuccessAlert(page, terms.expectedAlert, async () => {
        await apiTerms.agreeTerms();
      });
    });

    await test.step('포인트 API 영역 열기', async () => {
      await apiPoint.openPointApiArea();
    });

    await test.step('포인트 API 결제 파라미터 입력', async () => {
      await apiPoint.fillPaymentParams(pointParams);
    });

    await test.step('포인트 조회 실행 및 결제 가능 확인', async () => {
      await apiPoint.inquirePoints();
    });

    await test.step('포인트 결제 실행 및 성공 확인', async () => {
      await apiPoint.payPoints(pointParams);
    });
  });
});
