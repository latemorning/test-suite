import { expect, type Page } from '@playwright/test';
import { env } from '../support/env';
import {
  clickAndMaybeGetPopup,
  clickButton,
  exactTextPattern,
  findButton,
} from './page-actions';

/**
 * 로컬 PG 테스트 페이지에서 PC전용 Submit 전까지의 공통 시작 흐름을 조작한다.
 */
export class PgPage {
  constructor(
    private readonly page: Page,
    private readonly url = env.pgFrontUrl,
  ) {}

  /**
   * PG 테스트 시작 화면을 열고 결제 진입에 필요한 기본 요소가 보이는지 확인한다.
   */
  async goto(): Promise<void> {
    try {
      await this.page.goto(this.url, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      throw new Error(
        [
          `Failed to open PG front page: ${this.url}`,
          `Make sure the local service is running. You can try: npm run service:up`,
          `Original error: ${String(error)}`,
        ].join('\n'),
      );
    }

    await expect(this.page.getByText(/PG사 정보|pg_cd|pay_amt/).first()).toBeVisible();
    await expect(this.page.getByRole('button', { name: /암호화/ }).first()).toBeVisible();
  }

  /**
   * 테스트 페이지가 결제 요청 데이터를 만들도록 암호화 버튼을 클릭한다.
   */
  async encrypt(): Promise<void> {
    await clickButton(this.page, /암호화/);
  }

  /**
   * 시나리오가 지정한 PG사 탭을 선택하고 화면의 PG 코드가 갱신됐는지 확인한다.
   */
  async selectPgProvider(provider: { name: string; code: string }): Promise<void> {
    const tab = this.page
      .locator('ul.tabs li')
      .filter({ hasText: exactTextPattern(provider.name) })
      .first();

    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveClass(/current/);
    await expect(this.page.locator('#pg_cd')).toHaveValue(provider.code);
  }

  /**
   * PG사 탭의 기본 가맹점이 결제 UI로 이어지지 않을 때 시나리오의 가맹점을 선택한다.
   */
  async selectShop(shopName: string): Promise<void> {
    const shopSelect = this.page.locator('#shop_sel');
    const option = shopSelect.locator('option').filter({ hasText: exactTextPattern(shopName) }).first();

    await expect(shopSelect).toBeVisible();
    await expect(option).toBeAttached();

    const value = await option.getAttribute('value');
    if (!value) {
      throw new Error(`Could not find a selectable shop option for ${shopName}.`);
    }

    await shopSelect.selectOption(value);
    await expect(shopSelect).toHaveValue(value);
    await expect(this.page.locator('#shopName')).toHaveValue(shopName);
  }

  /**
   * 패밀리 가맹점 케이스를 직접 검증해야 하는 시나리오에서 option value 기준으로 선택한다.
   *
   * 로컬 화면은 `PO...` 값을 선택하면 실제 요청용 `shop_cd`를 `#shopCd`에 별도로 채운다.
   */
  async selectShopByCode(shopCode: string): Promise<void> {
    const shopSelect = this.page.locator('#shop_sel');
    const shopCdInput = this.page.locator('#shopCd');

    await expect(shopSelect).toBeVisible();
    await shopSelect.selectOption({ value: shopCode });
    await expect(shopSelect).toHaveValue(shopCode);
    await expect(shopCdInput).not.toHaveValue('');
  }

  /**
   * 시나리오가 결제금액을 명시하면 암호화 전에 테스트 페이지의 pay_amt를 조정한다.
   */
  async setPaymentAmount(amount: number): Promise<void> {
    const value = String(amount);
    const input = this.page.locator('#payAmt');

    await expect(input).toBeVisible();
    await input.fill(value);
    await expect(input).toHaveValue(value);
  }

  /**
   * 복합결제처럼 포인트 사용 제한율을 명시해야 하는 시나리오에서 값을 입력한다.
   */
  async setPayLimitRate(rate: number): Promise<void> {
    const value = String(rate);
    const input = this.page.locator('#payLimitRate, input[name="pay_limit_rate"]').first();

    await expect(input).toBeVisible();
    await input.fill(value);
    await expect(input).toHaveValue(value);
  }

  /**
   * PC전용 Submit을 실행하고, 새 창이 열리면 이후 조작 대상을 그 창으로 전환한다.
   */
  async submitTest(): Promise<Page> {
    return clickAndMaybeGetPopup(this.page, /PC전용\s*Submit|테스트\s*서브밋|테스트서브밋/);
  }

  /**
   * smoke 테스트에서 결제 플로우 진입 버튼들이 준비됐는지 확인한다.
   */
  async expectPaymentEntryControls(): Promise<void> {
    await findButton(this.page, /암호화/);
    await findButton(this.page, /PC전용\s*Submit|테스트\s*서브밋|테스트서브밋/);
  }
}
