import { test } from '@playwright/test';
import { FamilyPaymentPage } from './family-payment-page';
import { PgPage } from './pg-page';
import { type FamilyPaymentScenario, familyPaymentScenarios } from './scenarios';

test.describe('PG local family payment flow', { tag: ['@family-payment', '@e2e'] }, () => {
  for (const scenario of familyPaymentScenarios) {
    test(scenario.name, async ({ page }) => {
      const pg = new PgPage(page);
      let familyPayment = new FamilyPaymentPage(page);

      await test.step('페이지 접속', async () => {
        await pg.goto();
      });

      await test.step(`PG사 선택: ${scenario.pgProvider.name}`, async () => {
        await pg.selectPgProvider(scenario.pgProvider);
      });

      await test.step(`가맹점 선택: ${formatShopSelection(scenario)}`, async () => {
        if (scenario.shopCode) {
          await pg.selectShopByCode(scenario.shopCode);
          return;
        }

        if (!scenario.shopName) {
          throw new Error('Family payment scenario must provide shopName or shopCode.');
        }

        await pg.selectShop(scenario.shopName);
      });

      await test.step(`결제금액 설정: ${scenario.paymentAmount}`, async () => {
        await pg.setPaymentAmount(scenario.paymentAmount);
      });

      await test.step('암호화 버튼 클릭', async () => {
        await pg.encrypt();
      });

      await test.step('테스트서브밋 후 팝업 열기', async () => {
        familyPayment = new FamilyPaymentPage(await pg.submitTest());
      });

      await test.step('약관 동의 후 본인인증 진입', async () => {
        await familyPayment.startUserAuthentication();
      });

      await test.step('사용자 인증 팝업 전송', async () => {
        await familyPayment.sendVirtualAuth();
      });

      await test.step('패밀리포인트 사용 화면 확인', async () => {
        await familyPayment.expectPointUsePage();
      });

      if (scenario.expectedOutcome === 'point-unit-error') {
        await test.step('사용포인트 초기화', async () => {
          await familyPayment.resetAllUsePoints();
        });

        await test.step(`사용가능 카드사에 ${scenario.invalidUsePointAmount} 포인트 입력`, async () => {
          await familyPayment.enterFirstEligibleUsePoint(scenario.invalidUsePointAmount);
        });

        await test.step('1000P 단위 오류 레이어 확인', async () => {
          await familyPayment.confirmPointUseAndExpectLayerMessage(scenario.expectedLayerPattern);
        });

        return;
      }

      if (scenario.expectedOutcome === 'maximum-amount-error') {
        await test.step(`자동 설정 사용포인트에 ${scenario.additionalUsePointAmount} 포인트 추가`, async () => {
          await familyPayment.addOneThousandPointOverAutomaticMaximum(
            scenario.additionalUsePointAmount,
            scenario.minimumTotalAvailablePointAmount,
            scenario.insufficientPointMessage,
          );
        });

        await test.step('최대 할인권금액 오류 레이어 확인', async () => {
          await familyPayment.confirmPointUseAndExpectLayerMessage(scenario.expectedLayerPattern);
        });

        return;
      }

      await test.step('사용포인트 초기화', async () => {
        await familyPayment.resetAllUsePoints();
      });

      await test.step(`사용가능 카드사에 ${scenario.usePointAmount} 포인트 입력`, async () => {
        await familyPayment.enterFirstEligibleUsePoint(scenario.usePointAmount);
      });

      await test.step('결과 문자열 ret_code=00 확인', async () => {
        await familyPayment.confirmPointUseAndOpenFamilyList();
      });

      await test.step('가족 할인권 일괄요청 성공 확인', async () => {
        await familyPayment.requestAllFamilyCoupons(scenario.expectedSuccessPattern);
      });
    });
  }
});

function formatShopSelection(scenario: FamilyPaymentScenario): string {
  return scenario.shopCode ? `shop_cd=${scenario.shopCode}` : String(scenario.shopName);
}
