import { test } from '@playwright/test';
import { PgPage } from './pg-page';

test.describe('PG local page load smoke', { tag: '@smoke' }, () => {
  test('PG 테스트 페이지 기본 조작 요소 표시', async ({ page }) => {
    const pg = new PgPage(page);

    await test.step('페이지 접속', async () => {
      await pg.goto();
    });

    await test.step('기본 결제 테스트 버튼 확인', async () => {
      await pg.expectPaymentEntryControls();
    });
  });
});
