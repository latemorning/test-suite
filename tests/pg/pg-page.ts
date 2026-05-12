import { expect, type Dialog, type Frame, type Locator, type Page } from '@playwright/test';
import { env } from '../support/env';

type SearchRoot = Page | Frame;

/**
 * 로컬 PG 테스트 페이지의 화면 결제 플로우를 조작하는 페이지 객체다.
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
    await this.clickButton(this.page, /암호화/);
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
   * PC전용 Submit을 실행하고, 새 창이 열리면 이후 조작 대상을 그 창으로 전환한다.
   */
  async submitTest(): Promise<Page> {
    return this.clickAndMaybeGetPopup(this.page, /PC전용\s*Submit|테스트\s*서브밋|테스트서브밋/);
  }

  /**
   * smoke 테스트에서 결제 플로우 진입 버튼들이 준비됐는지 확인한다.
   */
  async expectPaymentEntryControls(): Promise<void> {
    await this.findButton(this.page, /암호화/);
    await this.findButton(this.page, /PC전용\s*Submit|테스트\s*서브밋|테스트서브밋/);
  }

  /**
   * 약관 동의 후 포인트 조회 진입 버튼을 클릭하고, 새 창이 열리면 그 창을 반환한다.
   */
  async lookupTerms(target: Page): Promise<Page> {
    return this.clickAndMaybeGetPopup(
      target,
      /전체\s*약관\s*동의\s*후\s*(?:포인트\s*조회하기|본인\s*인증하기)|포인트\s*조회하기|약관\s*조회\s*하기|약관조회하기/,
    );
  }

  /**
   * 가상 인증 팝업의 전송 버튼을 누르고 카드포인트 입력 화면으로 이동한 페이지를 찾는다.
   */
  async sendVirtualAuth(target: Page): Promise<Page> {
    const opener = await target.opener();
    const kmcNameInput = target.locator('#krName').first();
    if (await this.isUsable(kmcNameInput, true)) {
      // KMC 테스트 인증 화면은 이름 입력값이 비어 있으면 결과 페이지로 이어지지 않는다.
      await kmcNameInput.fill('고영희');
    }

    await this.withAutoAcceptDialogs(target, async () => {
      await this.clickButton(target, /전송/);
    });

    const nextPage = await this.resolveUsablePage(target, opener ?? undefined);
    await nextPage.waitForLoadState('domcontentloaded').catch(() => undefined);

    return nextPage;
  }

  /**
   * 카드사별 사용포인트 입력란에 시나리오의 포인트 금액을 입력한다.
   */
  async enterCardPoint(target: Page, pointAmount: number): Promise<void> {
    const value = String(pointAmount);
    const input = await this.findUsePointInput(target);
    await input.fill(value);
  }

  /**
   * 결제 또는 전환 버튼을 눌러 카드포인트 결제를 진행한다.
   */
  async pay(target: Page): Promise<void> {
    await this.clickButton(target, /결제|전환하기/);
  }

  /**
   * 일부 로컬 화면에서만 표시되는 최종 확인 버튼을 있으면 클릭한다.
   */
  async confirmIfPresent(target: Page): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clicked = await this.clickOptionalConfirm(target, 1500);
      if (!clicked) return;

      // PG별로 확인 버튼 뒤에 한 번 더 전환/결제 확인 레이어가 뜰 수 있다.
      await target.waitForTimeout(500).catch(() => undefined);
    }
  }

  private async clickAndMaybeGetPopup(target: Page, buttonName: RegExp): Promise<Page> {
    const popupPromise = target.waitForEvent('popup', { timeout: 15_000 }).catch(() => null);

    await this.clickButton(target, buttonName);

    const popup = await popupPromise;
    if (!popup) return target;

    await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
    return popup;
  }

  private async clickButton(target: Page, buttonName: RegExp): Promise<void> {
    const locator = await this.findButton(target, buttonName);
    await locator.click();
  }

  private async clickOptionalButton(
    target: Page,
    buttonName: RegExp,
    timeoutMs: number,
  ): Promise<boolean> {
    const locator = await this.findButton(target, buttonName, timeoutMs).catch(() => null);
    if (!locator) return false;

    await locator.click();
    return true;
  }

  private async clickOptionalConfirm(target: Page, timeoutMs: number): Promise<boolean> {
    const popupConfirm = target
      .locator('#myPopup:visible, .popup:visible, [role="dialog"]:visible')
      .locator('button, a, input[type="button"], input[type="submit"]')
      .filter({ hasText: /확인/ })
      .last();

    if (await this.isUsable(popupConfirm)) {
      await popupConfirm.click({ timeout: timeoutMs });
      return true;
    }

    return this.clickOptionalButton(target, /확인/, timeoutMs);
  }

  private async withAutoAcceptDialogs(target: Page, action: () => Promise<void>): Promise<void> {
    const handler = async (dialog: Dialog) => {
      await dialog.accept().catch(() => undefined);
    };

    target.on('dialog', handler);
    try {
      await action();
      await target.waitForTimeout(500).catch(() => undefined);
    } finally {
      target.off('dialog', handler);
    }
  }

  private async resolveUsablePage(target: Page, preferred?: Page): Promise<Page> {
    const openPages = target.context().pages().filter((page) => !page.isClosed());
    for (const page of openPages) {
      // 가상 인증 이후 브라우저가 원래 창이나 새 창 중 어디로 이동할지 환경별로 달라질 수 있다.
      if (page.url().includes('/phub/std/point.do')) return page;
      const hasPointInput = await page.locator('input.pnt').count().catch(() => 0);
      if (hasPointInput > 0) return page;
    }

    if (preferred && !preferred.isClosed()) return preferred;
    if (!target.isClosed()) return target;

    const lastPage = openPages.at(-1);
    if (lastPage) return lastPage;

    throw new Error('No open page remained after virtual authentication.');
  }

  private async findButton(
    target: Page,
    buttonName: RegExp,
    timeoutMs = 15_000,
  ): Promise<Locator> {
    const roots = this.searchRoots(target);
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    while (Date.now() < deadline) {
      for (const root of roots) {
        // 로컬 PG 화면은 button, input value, 일반 텍스트 링크가 섞여 있어 의미 기반 후보를 순서대로 시도한다.
        const roleButton = root.getByRole('button', { name: buttonName }).first();
        if (await this.isUsable(roleButton)) return roleButton;

        const inputButton = root
          .locator('input[type="button"], input[type="submit"], button, a')
          .filter({ hasText: buttonName })
          .first();
        if (await this.isUsable(inputButton)) return inputButton;

        const valueButton = root
          .locator(
            `xpath=.//input[(@type='button' or @type='submit') and ${xpathTextMatch(
              '@value',
              buttonName,
            )}]`,
          )
          .first();
        if (await this.isUsable(valueButton)) return valueButton;

        const textTarget = root.getByText(buttonName).first();
        if (await this.isUsable(textTarget)) return textTarget;
      }

      await target.waitForTimeout(250).catch((error) => {
        lastError = error;
      });
    }

    throw new Error(
      [
        `Could not find visible button matching ${buttonName}.`,
        `URL: ${target.url()}`,
        `Last error: ${String(lastError ?? '(none)')}`,
      ].join('\n'),
    );
  }

  private async findUsePointInput(target: Page): Promise<Locator> {
    // 사용포인트 입력란은 명시 라벨이 없으므로 계획 문서의 셀렉터 우선순위에 따라 후보를 좁힌다.
    const candidates = [
      `css=input.pnt:visible`,
      `xpath=.//*[self::table or self::div][contains(normalize-space(.), '사용포인트')]//input[not(@type='hidden')]`,
      `css=table:has-text("사용포인트") input:visible`,
      `xpath=.//*[contains(normalize-space(.), '사용포인트')]/ancestor::table[1]//input[not(@type='hidden')]`,
      `css=input[name*="point" i]:visible`,
      `css=input[id*="point" i]:visible`,
    ];
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      for (const root of this.searchRoots(target)) {
        for (const selector of candidates) {
          const input = await this.firstEditable(root.locator(selector));
          if (input) return input;
        }
      }

      await target.waitForTimeout(250).catch(() => undefined);
    }

    throw new Error(
      [
        'Could not find an editable card point input under the 사용포인트 area.',
        `URL: ${target.url()}`,
      ].join('\n'),
    );
  }

  private async firstEditable(locator: Locator): Promise<Locator | null> {
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await this.isUsable(candidate, true)) return candidate;
    }

    return null;
  }

  private async isUsable(locator: Locator, requireEditable = false): Promise<boolean> {
    try {
      if (!(await locator.isVisible({ timeout: 500 }))) return false;
      if (!(await locator.isEnabled({ timeout: 500 }))) return false;
      if (requireEditable && !(await locator.isEditable({ timeout: 500 }))) return false;
      return true;
    } catch {
      return false;
    }
  }

  private searchRoots(target: Page): SearchRoot[] {
    return [target, ...target.frames().filter((frame) => frame !== target.mainFrame())];
  }
}

function xpathTextMatch(attribute: string, pattern: RegExp): string {
  // RegExp 전체를 XPath로 옮기지 않고, 화면 텍스트에 필요한 핵심 토큰만 contains 조건으로 사용한다.
  const source = pattern.source
    .replace(/\\s\*/g, '')
    .replace(/\\/g, '')
    .replace(/\|/g, ' ')
    .replace(/[()[\].+?^$]/g, ' ')
    .trim();

  const tokens = source.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 'true()';

  return tokens.map((token) => `contains(${attribute}, '${escapeXpathLiteral(token)}')`).join(' or ');
}

function escapeXpathLiteral(value: string): string {
  return value.replace(/'/g, "&apos;");
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
