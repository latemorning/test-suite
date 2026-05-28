import { test } from '@playwright/test';
import { expectPageText, expectSuccessAlert } from './assertions';
import { CardPointPaymentPage } from './card-point-payment-page';
import { PgPage } from './pg-page';
import { paymentScenarios } from './scenarios';
import { SettleCombinedPaymentPage } from './settle-combined-payment-page';

test.describe('PG local payment flow', { tag: ['@payment', '@e2e'] }, () => {
  for (const scenario of paymentScenarios) {
    test(scenario.name, async ({ page }) => {
      const pg = new PgPage(page);

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

      await test.step(`결제금액 설정: ${scenario.paymentAmount}`, async () => {
        await pg.setPaymentAmount(scenario.paymentAmount);
      });

      await test.step('결제금액 자동 암호화 확인', async () => {
        await pg.encrypt();
      });

      const { payLimitRate } = scenario;
      if (payLimitRate !== undefined) {
        await test.step(`포인트 사용 제한율 설정: ${payLimitRate}`, async () => {
          await pg.setPayLimitRate(payLimitRate);
        });
      }

      if (scenario.paymentFlow === 'settle-combined-exhaustion') {
        let combinedPayment = new SettleCombinedPaymentPage(page);

        await test.step('테스트서브밋 후 복합결제 팝업 열기', async () => {
          combinedPayment = new SettleCombinedPaymentPage(await pg.submitTest());
        });

        await test.step('복합결제 약관 전체동의 후 본인인증 진입', async () => {
          await combinedPayment.agreeTerms();
        });

        await test.step('가상 인증 팝업 전송', async () => {
          await combinedPayment.sendVirtualAuth();
        });

        await test.step('전환포인트 기준 사용포인트 입력', async () => {
          await combinedPayment.enterCardPoint(scenario.convertedPointAmount);
        });

        await test.step('복합결제 후 성공 결과 확인', async () => {
          await combinedPayment.pay();
          await combinedPayment.confirmIfPresent();
          await expectPageText(combinedPayment.page, /ret_code=00/);
          await expectPageText(combinedPayment.page, /ret_msg=성공/);
        });

        return;
      }

      let cardPayment = new CardPointPaymentPage(page);

      await test.step('테스트서브밋 후 팝업 열기', async () => {
        cardPayment = new CardPointPaymentPage(await pg.submitTest());
      });

      await test.step('약관조회하기 버튼 클릭', async () => {
        await cardPayment.lookupTerms();
      });

      await test.step('가상 인증 팝업 전송', async () => {
        await cardPayment.sendVirtualAuth();
      });

      await test.step('전환포인트 기준 사용포인트 입력', async () => {
        await cardPayment.enterCardPoint(scenario.convertedPointAmount);
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
