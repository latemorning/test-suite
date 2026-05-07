import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 포인트 API 조회와 결제에 공통으로 사용하는 결제 파라미터다.
 */
export type ApiPointPaymentParams = {
  ttlPnt: number;
  ttlPayAmt: number;
  ttlPntAmt: number;
  shopCmsnRate: number;
  cardPoint: {
    providerCode: string;
    usePoint: number;
    conversionRate: number;
  };
};

/**
 * PG 연동 API 테스트 영역에서 포인트 조회와 결제 흐름을 조작하는 페이지 객체다.
 */
export class ApiPointPage {
  constructor(private readonly page: Page) {}

  /**
   * PG 연동 API 테스트 영역으로 이동한 뒤 포인트 API 탭을 활성화한다.
   */
  async openPointApiArea(): Promise<void> {
    const apiArea = this.page.locator('#api-test');
    await apiArea.scrollIntoViewIfNeeded();
    await expect(apiArea).toBeVisible();

    const pointTab = this.page.locator('.api-tab[data-api-tab="point"]');
    await pointTab.click();
    await expect(pointTab).toHaveClass(/api-tab-active/);
    await expect(this.pointSection).toBeVisible();
    await this.ensureCardPointRow();
  }

  /**
   * 포인트 조회와 결제에 필요한 금액, 수수료, 카드포인트 입력값을 채운다.
   */
  async fillPaymentParams(params: ApiPointPaymentParams): Promise<void> {
    await this.page.locator('#api_ttl_pnt').fill(String(params.ttlPnt));
    await this.page.locator('#api_ttl_pay_amt').fill(String(params.ttlPayAmt));
    await this.page.locator('#api_ttl_pnt_amt').fill(String(params.ttlPntAmt));
    await this.page.locator('#api_shop_cmsn_rate').fill(String(params.shopCmsnRate));

    const row = await this.ensureCardPointRow();
    await row.locator('.api_card_pnt_cd').selectOption(params.cardPoint.providerCode);
    await row.locator('.api_card_use_pnt').fill(String(params.cardPoint.usePoint));
    await row.locator('.api_card_cvt_rate').fill(String(params.cardPoint.conversionRate));

    await expect(row.locator('.api_card_pnt_cd')).toHaveValue(params.cardPoint.providerCode);
    await expect(row.locator('.api_card_use_pnt')).toHaveValue(String(params.cardPoint.usePoint));
  }

  /**
   * 포인트 조회 API가 성공하고 결제 버튼이 활성화되는지 확인한다.
   */
  async inquirePoints(): Promise<void> {
    await this.waitForSuccessfulApiResponse('/api/v1/r/pnt', async () => {
      await this.pointSection.getByRole('button', { name: /포인트 조회/ }).click();
    });

    await expect(this.page.locator('#api_result')).toContainText('포인트 조회 성공');
    await expect(this.page.locator('#api_point_pay_btn')).toBeEnabled();
  }

  /**
   * 조회된 포인트 거래번호로 포인트 결제 API를 실행하고 성공 결과를 확인한다.
   */
  async payPoints(params: ApiPointPaymentParams): Promise<void> {
    await this.page.locator('#api_shop_cmsn_rate').fill(String(params.shopCmsnRate));

    await this.waitForSuccessfulApiResponse('/api/v1/c/pnt', async () => {
      await this.page.locator('#api_point_pay_btn').click();
    });

    await expect(this.page.locator('#api_result')).toContainText('포인트 결제 성공');
    await expect(this.page.locator('#api_last_pg_tr_no')).not.toHaveValue('');
  }

  private get pointSection(): Locator {
    return this.page.locator('.api-section-point').first();
  }

  private async ensureCardPointRow(): Promise<Locator> {
    const list = this.page.locator('#api_card_point_list');
    let firstRow = list.locator(':scope > div').first();

    if ((await firstRow.count()) === 0) {
      // 일부 로컬 화면은 포인트 API 탭 진입 직후 카드포인트 행을 직접 추가해야 한다.
      await this.pointSection.getByRole('button', { name: /추가/ }).click();
      firstRow = list.locator(':scope > div').first();
    }

    await expect(firstRow).toBeVisible();
    return firstRow;
  }

  private async waitForSuccessfulApiResponse(
    apiPath: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const dialogMessages: string[] = [];
    const dialogHandler = async (dialog: import('@playwright/test').Dialog) => {
      // API 실패가 alert로만 표시되는 경우를 진단 메시지에 포함한다.
      dialogMessages.push(dialog.message());
      await dialog.accept().catch(() => undefined);
    };

    this.page.on('dialog', dialogHandler);

    let response: Awaited<ReturnType<Page['waitForResponse']>>;
    try {
      [response] = await Promise.all([
        this.page.waitForResponse(
          (candidate) =>
            candidate.url().includes(apiPath) && candidate.request().method() === 'POST',
        ),
        action(),
      ]);
    } catch (error) {
      throw new Error(
        [
          `Timed out or failed while waiting for API request: ${apiPath}`,
          `Dialog messages: ${dialogMessages.length ? dialogMessages.join(' | ') : '(none)'}`,
          `Original error: ${String(error)}`,
        ].join('\n'),
      );
    } finally {
      this.page.off('dialog', dialogHandler);
    }

    if (!response.ok()) {
      const body = await response.text().catch(() => '(response body unavailable)');
      throw new Error(
        [
          `API request failed: ${apiPath}`,
          `Status: ${response.status()}`,
          `Response: ${body}`,
        ].join('\n'),
      );
    }
  }
}
