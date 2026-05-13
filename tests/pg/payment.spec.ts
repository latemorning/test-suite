import { test } from '@playwright/test';
import { expectSuccessAlert } from './assertions';
import { CardPointPaymentPage } from './card-point-payment-page';
import { PgPage } from './pg-page';
import { paymentScenarios } from './scenarios';

test.describe('PG local payment flow', { tag: ['@payment', '@e2e'] }, () => {
  for (const scenario of paymentScenarios) {
    test(scenario.name, async ({ page }) => {
      const pg = new PgPage(page);
      let cardPayment = new CardPointPaymentPage(page);

      await test.step('페이지 접속', async () => {
        await pg.goto();
      });

      await test.step(`PG사 선택: ${scenario.pgProvider.name}`, async () => {
        await pg.selectPgProvider(scenario.pgProvider);
      });

      const { shopName } = scenario;
      if (shopName) {
        await test.step(`가맹점 선택: ${shopName}`, async () => {
          await pg.selectShop(shopName);
        });
      }

      await test.step('암호화 버튼 클릭', async () => {
        await pg.encrypt();
      });

      await test.step('테스트서브밋 후 팝업 열기', async () => {
        cardPayment = new CardPointPaymentPage(await pg.submitTest());
      });

      await test.step('약관조회하기 버튼 클릭', async () => {
        await cardPayment.lookupTerms();
      });

      await test.step('가상 인증 팝업 전송', async () => {
        await cardPayment.sendVirtualAuth();
      });

      await test.step('사용포인트 입력', async () => {
        await cardPayment.enterCardPoint(scenario.pointAmount);
      });

      await test.step('결제 후 성공 alert 확인', async () => {
        await expectSuccessAlert(cardPayment.page, scenario.expectedSuccessPattern, async () => {
          await cardPayment.pay();
          await cardPayment.confirmIfPresent();
        });
      });
    });
  }
});
