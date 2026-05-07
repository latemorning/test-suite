import type { Dialog, Page } from '@playwright/test';

/**
 * 지정한 동작을 실행한 뒤 기대 문구와 일치하는 성공 alert가 발생했는지 확인한다.
 */
export async function expectSuccessAlert(
  page: Page,
  expectedPattern: RegExp,
  action: () => Promise<void>,
  timeoutMs = 20_000,
): Promise<void> {
  const messages: string[] = [];

  let resolveSuccess!: () => void;
  let rejectSuccess!: (error: Error) => void;

  // dialog 이벤트는 action 이후 비동기로 들어오므로 별도 Promise로 성공 조건을 기다린다.
  const successPromise = new Promise<void>((resolve, reject) => {
    resolveSuccess = resolve;
    rejectSuccess = reject;
  });

  const timeout = setTimeout(async () => {
    const textSnapshot = await getVisibleTextSnapshot(page);
    rejectSuccess(
      new Error(
        [
          `Timed out waiting for success alert matching ${expectedPattern}.`,
          `Dialog messages: ${messages.length ? messages.join(' | ') : '(none)'}`,
          `URL: ${page.url()}`,
          `Visible text snapshot: ${textSnapshot}`,
        ].join('\n'),
      ),
    );
  }, timeoutMs);

  const handler = async (dialog: Dialog) => {
    const message = dialog.message();
    messages.push(message);

    if (expectedPattern.test(message)) {
      clearTimeout(timeout);
      resolveSuccess();
    }

    await dialog.accept().catch(() => undefined);
  };

  page.on('dialog', handler);

  try {
    await action();
    await successPromise;
  } finally {
    clearTimeout(timeout);
    page.off('dialog', handler);
  }
}

/**
 * 실패 진단용으로 현재 페이지의 주요 visible text를 짧게 수집한다.
 */
export async function getVisibleTextSnapshot(page: Page, maxLength = 1000): Promise<string> {
  try {
    const text = await page.locator('body').innerText({ timeout: 3000 });
    return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  } catch {
    return '(body text unavailable)';
  }
}
