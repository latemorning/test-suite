import { test } from '@playwright/test';
import { expectSuccessAlert } from './assertions';
import { PgPage } from './pg-page';
import { paymentScenarios } from './scenarios';

test.describe('PG local payment flow', { tag: ['@payment', '@e2e'] }, () => {
  for (const scenario of paymentScenarios) {
    test(scenario.name, async ({ page }) => {
      const pg = new PgPage(page);
      // PC전용 Submit 이후 흐름은 같은 창 또는 팝업으로 이어질 수 있어 현재 조작 대상을 갱신한다.
      let popup = page;

      await test.step('페이지 접속', async () => {
        await pg.goto();
      });

      await test.step('암호화 버튼 클릭', async () => {
        await pg.encrypt();
      });

      await test.step('테스트서브밋 후 팝업 열기', async () => {
        popup = await pg.submitTest();
      });

      await test.step('약관조회하기 버튼 클릭', async () => {
        popup = await pg.lookupTerms(popup);
      });

      await test.step('가상 인증 팝업 전송', async () => {
        popup = await pg.sendVirtualAuth(popup);
      });

      await test.step('사용포인트 입력', async () => {
        await pg.enterCardPoint(popup, scenario.pointAmount);
      });

      await test.step('결제 후 성공 alert 확인', async () => {
        await expectSuccessAlert(popup, scenario.expectedSuccessPattern, async () => {
          await pg.pay(popup);
          await pg.confirmIfPresent(popup);
        });
      });
    });
  }
});
