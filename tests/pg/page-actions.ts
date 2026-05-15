import type { Dialog, Frame, Locator, Page } from '@playwright/test';

type SearchRoot = Page | Frame;

/**
 * 버튼을 클릭하고 새 팝업이 열리면 팝업 페이지를 반환한다.
 */
export async function clickAndMaybeGetPopup(target: Page, buttonName: RegExp): Promise<Page> {
  const popupPromise = target.waitForEvent('popup', { timeout: 15_000 }).catch(() => null);

  await clickButton(target, buttonName);

  const popup = await popupPromise;
  if (!popup) return target;

  await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
  return popup;
}

/**
 * 로컬 PG 화면의 버튼, input value, 텍스트 링크 후보 중 첫 사용 가능한 대상을 클릭한다.
 */
export async function clickButton(target: Page, buttonName: RegExp): Promise<void> {
  const locator = await findButton(target, buttonName);
  await locator.click();
}

/**
 * 선택적으로 표시되는 버튼이 있으면 클릭하고 클릭 여부를 반환한다.
 */
export async function clickOptionalButton(
  target: Page,
  buttonName: RegExp,
  timeoutMs: number,
): Promise<boolean> {
  const locator = await findButton(target, buttonName, timeoutMs).catch(() => null);
  if (!locator) return false;

  await locator.click();
  return true;
}

/**
 * 일부 결제 화면에서만 표시되는 확인 버튼이나 레이어 확인 버튼을 클릭한다.
 */
export async function clickOptionalConfirm(target: Page, timeoutMs: number): Promise<boolean> {
  const popupConfirm = target
    .locator('#myPopup:visible, .popup:visible, [role="dialog"]:visible')
    .locator('button, a, input[type="button"], input[type="submit"]')
    .filter({ hasText: /확인/ })
    .last();

  if (await isUsable(popupConfirm)) {
    await popupConfirm.click({ timeout: timeoutMs });
    return true;
  }

  return clickOptionalButton(target, /확인/, timeoutMs);
}

/**
 * 버튼 역할, input value, 일반 텍스트를 모두 고려해 화면 조작 대상을 찾는다.
 */
export async function findButton(
  target: Page,
  buttonName: RegExp,
  timeoutMs = 15_000,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    for (const root of searchRoots(target)) {
      // 로컬 PG 화면은 button, input value, 일반 텍스트 링크가 섞여 있어 의미 기반 후보를 순서대로 시도한다.
      const roleButton = root.getByRole('button', { name: buttonName }).first();
      if (await isUsable(roleButton)) return roleButton;

      const inputButton = root
        .locator('input[type="button"], input[type="submit"], button, a')
        .filter({ hasText: buttonName })
        .first();
      if (await isUsable(inputButton)) return inputButton;

      const valueButton = root
        .locator(
          `xpath=.//input[(@type='button' or @type='submit') and ${xpathTextMatch(
            '@value',
            buttonName,
          )}]`,
        )
        .first();
      if (await isUsable(valueButton)) return valueButton;

      const textTarget = root.getByText(buttonName).first();
      if (await isUsable(textTarget)) return textTarget;
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

/**
 * 카드사별 사용포인트 입력란 후보 중 첫 번째 수정 가능한 입력란을 찾는다.
 */
export async function findUsePointInput(target: Page): Promise<Locator> {
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
    for (const root of searchRoots(target)) {
      for (const selector of candidates) {
        const input = await firstEditable(root.locator(selector));
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

/**
 * 카드포인트 사용포인트 입력 전 모든 카드사 행의 사용포인트를 0으로 초기화한다.
 */
export async function resetAllUsePointInputs(target: Page): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if ((await target.locator('input.pnt:visible').count().catch(() => 0)) > 0) break;
    await target.waitForTimeout(250).catch(() => undefined);
  }

  let resetTargetCount = 0;

  for (const root of searchRoots(target)) {
    const resetButtons = root.locator('.pointGroup .initBtn:visible, .initBtn:visible');
    const resetButtonCount = await resetButtons.count().catch(() => 0);
    for (let index = 0; index < resetButtonCount; index += 1) {
      const resetButton = resetButtons.nth(index);
      if (await isUsable(resetButton)) {
        await resetButton.click();
      }
    }

    const inputs = root.locator('input.pnt:visible');
    const inputCount = await inputs.count().catch(() => 0);
    for (let index = 0; index < inputCount; index += 1) {
      const input = inputs.nth(index);
      if (!(await isUsable(input, true))) continue;

      resetTargetCount += 1;
      await fillAndNotify(input, '0');
    }
  }

  if (resetTargetCount === 0) {
    throw new Error(
      [
        'Could not find editable card point inputs to reset.',
        `URL: ${target.url()}`,
      ].join('\n'),
    );
  }
}

/**
 * 가상 인증처럼 alert가 부수적으로 뜨는 조작을 자동 승인한다.
 */
export async function withAutoAcceptDialogs(
  target: Page,
  action: () => Promise<void>,
): Promise<void> {
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

/**
 * 인증 이후 실제 조작해야 하는 페이지가 원래 창인지 새 창인지 판별한다.
 */
export async function resolveUsablePage(target: Page, preferred?: Page): Promise<Page> {
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

/**
 * Locator가 현재 사용 가능한지 확인한다.
 */
export async function isUsable(locator: Locator, requireEditable = false): Promise<boolean> {
  try {
    if (!(await locator.isVisible({ timeout: 500 }))) return false;
    if (!(await locator.isEnabled({ timeout: 500 }))) return false;
    if (requireEditable && !(await locator.isEditable({ timeout: 500 }))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 공백 차이를 무시하는 정확한 텍스트 매칭 정규식을 만든다.
 */
export function exactTextPattern(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`);
}

async function firstEditable(locator: Locator): Promise<Locator | null> {
  const count = await locator.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await isUsable(candidate, true)) return candidate;
  }

  return null;
}

async function fillAndNotify(input: Locator, value: string): Promise<void> {
  await input.fill(value);
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.dispatchEvent('focusout');
}

function searchRoots(target: Page): SearchRoot[] {
  return [target, ...target.frames().filter((frame) => frame !== target.mainFrame())];
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
