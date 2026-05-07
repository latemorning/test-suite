import { expect, type Locator, type Page } from '@playwright/test';
import { env } from '../support/env';

/**
 * 약관 API 탭에서 공통으로 입력하는 PG/가맹점/고객 식별 파라미터다.
 */
export type ApiTermsCommonParams = {
  pgCode: string;
  shopNameParts: string[];
  authorizationNameParts: string[];
  pgCustCi: string;
};

/**
 * 약관 동의 API 호출 전에 추가로 입력하는 고객 정보 파라미터다.
 */
export type ApiTermsAgreementParams = {
  pgCustName: string;
  pgCustCtn: string;
  isMdtAll: 'Y' | 'N';
};

/**
 * 약관 목록 조회 결과에서 검증할 약관 항목 기준이다.
 */
export type ExpectedApiTerm = {
  title: string;
  hasViewLink?: boolean;
};

/**
 * PG 연동 API 테스트 영역에서 약관 조회와 동의 흐름을 조작하는 페이지 객체다.
 */
export class ApiTermsPage {
  constructor(
    private readonly page: Page,
    private readonly url = env.pgFrontUrl,
  ) {}

  /**
   * PG 테스트 시작 화면을 열고 API 테스트 영역이 DOM에 준비됐는지 확인한다.
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

    await expect(this.page.locator('#api-test')).toBeAttached();
  }

  /**
   * PG 연동 API 테스트 영역으로 이동한 뒤 약관 API 탭을 활성화한다.
   */
  async openTermsApiArea(): Promise<void> {
    const apiArea = this.page.locator('#api-test');
    await apiArea.scrollIntoViewIfNeeded();
    await expect(apiArea).toBeVisible();

    await this.page.locator('.api-tab[data-api-tab="terms"]').click();
    await expect(this.page.locator('.api-tab[data-api-tab="terms"]')).toHaveClass(
      /api-tab-active/,
    );
    await expect(this.page.locator('.api-section-terms').first()).toBeVisible();
  }

  /**
   * 약관 조회와 동의 API가 공유하는 PG 공통 파라미터를 입력한다.
   */
  async fillCommonParams(params: ApiTermsCommonParams): Promise<void> {
    await this.page.locator('#api_pg_cd').selectOption(params.pgCode);

    await this.selectOptionByText(this.page.locator('#api_shop_sel'), params.shopNameParts);
    await this.selectOptionByText(
      this.page.locator('#api_authorization_sel'),
      params.authorizationNameParts,
    );

    await expect(this.page.locator('#api_authorization')).not.toHaveValue('');
    await this.page.locator('#api_pg_cust_ci').fill(params.pgCustCi);
  }

  /**
   * 약관 목록 조회 API 요청이 실제로 완료될 때까지 기다린다.
   */
  async inquireTerms(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/r/terms') && response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: /약관 목록 조회/ }).click(),
    ]);

    await expect(this.page.locator('#api_terms_list')).toBeVisible();
    await expect(this.page.locator('#api_phub_tr_no')).not.toHaveValue('');
  }

  /**
   * 화면에 출력된 필수 약관 목록이 시나리오의 기대값과 일치하는지 확인한다.
   */
  async expectTermsList(expectedTerms: ExpectedApiTerm[]): Promise<void> {
    const termsList = this.page.locator('#api_terms_list');
    await expect(termsList).toBeVisible();

    for (const term of expectedTerms) {
      const termItem = termsList.locator('.terms-item').filter({ hasText: term.title }).first();
      await expect(termItem, `Expected terms list to include: ${term.title}`).toBeVisible();
      await expect(termItem).toContainText('(필수)');

      if (term.hasViewLink) {
        await expect(termItem.getByRole('link', { name: '약관 보기' })).toBeVisible();
      }
    }
  }

  /**
   * 약관 동의 API에 필요한 추가 고객 정보를 입력한다.
   */
  async fillAgreementParams(params: ApiTermsAgreementParams): Promise<void> {
    await this.page.locator('#api_pg_cust_name').fill(params.pgCustName);
    await this.page.locator('#api_pg_cust_ctn').fill(params.pgCustCtn);
    await this.page.locator('#api_is_mdt_all').selectOption(params.isMdtAll);
  }

  /**
   * 약관 동의 API 요청이 실제로 완료될 때까지 기다린다.
   */
  async agreeTerms(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/c/terms') && response.request().method() === 'POST',
      ),
      this.page.getByRole('button', { name: /약관 동의/ }).click(),
    ]);
  }

  private async selectOptionByText(
    select: Locator,
    expectedTextParts: string[],
    timeoutMs = 15_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let visibleOptions = '';

    while (Date.now() < deadline) {
      const match = await select.evaluate((element, textParts) => {
        const selectElement = element as HTMLSelectElement;
        const options = Array.from(selectElement.options);
        // 상점과 Authorization option 텍스트는 부가 설명이 붙을 수 있어 핵심 단어 조합으로 찾는다.
        const matched = options.find((option) => {
          const text = option.textContent?.trim() ?? '';
          return textParts.every((part) => text.includes(part));
        });

        return matched
          ? {
              value: matched.value,
              text: matched.textContent?.trim() ?? '',
            }
          : null;
      }, expectedTextParts);

      if (match) {
        await select.selectOption(match.value);
        return;
      }

      visibleOptions = await select.evaluate((element) => {
        const selectElement = element as HTMLSelectElement;
        return Array.from(selectElement.options)
          .map((option) => option.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' | ');
      });
      await this.page.waitForTimeout(250);
    }

    throw new Error(
      [
        `Could not find select option containing all text parts: ${expectedTextParts.join(', ')}`,
        `Visible options: ${visibleOptions || '(none)'}`,
      ].join('\n'),
    );
  }
}
