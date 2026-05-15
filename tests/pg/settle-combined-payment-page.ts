import { expect, type Page } from '@playwright/test';
import {
  clickButton,
  clickOptionalConfirm,
  findUsePointInput,
  isUsable,
  resetAllUsePointInputs,
  resolveUsablePage,
  withAutoAcceptDialogs,
} from './page-actions';
import { fillConvertedPointInput } from './point-conversion';

/**
 * 세틀_복합결제(소진형)의 PC전용 Submit 이후 결제 팝업 흐름을 조작한다.
 */
export class SettleCombinedPaymentPage {
  constructor(private currentPage: Page) {}

  /**
   * 현재 조작 대상 페이지를 반환한다.
   */
  get page(): Page {
    return this.currentPage;
  }

  /**
   * 복합결제 약관 화면에서 전체동의 후 본인인증으로 진입한다.
   */
  async agreeTerms(): Promise<void> {
    await expect(this.currentPage.locator('#agreeAll')).toBeAttached();

    // 체크박스가 커스텀 UI 밖에 있어 일반 click이 실패할 수 있으므로 화면 스크립트의 change 이벤트를 직접 발생시킨다.
    await this.currentPage.evaluate(() => {
      const agreeAll = document.querySelector<HTMLInputElement>('#agreeAll');
      if (!agreeAll) throw new Error('Could not find #agreeAll on settle combined terms page.');

      if (!agreeAll.checked) agreeAll.click();
      agreeAll.dispatchEvent(new Event('input', { bubbles: true }));
      agreeAll.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const sendButton = this.currentPage.locator('#send').first();
    await expect(sendButton).toBeEnabled();
    await this.clickSendAndMaybeGetPopup();
  }

  /**
   * 가상 인증 팝업의 전송 버튼을 누르고 복합결제 포인트 입력 화면으로 이동한다.
   */
  async sendVirtualAuth(): Promise<void> {
    const opener = await this.currentPage.opener();
    const kmcNameInput = this.currentPage.locator('#krName').first();
    if (await isUsable(kmcNameInput, true)) {
      // KMC 테스트 인증 화면은 이름 입력값이 비어 있으면 결과 페이지로 이어지지 않는다.
      await kmcNameInput.fill('고영희');
    }

    await withAutoAcceptDialogs(this.currentPage, async () => {
      await clickButton(this.currentPage, /전송/);
    });

    this.currentPage = await resolveUsablePage(this.currentPage, opener ?? undefined);
    await this.currentPage.waitForLoadState('domcontentloaded').catch(() => undefined);
  }

  /**
   * 복합결제 포인트 입력 화면에서 전환포인트 목표값에 맞춰 사용포인트를 입력한다.
   */
  async enterCardPoint(convertedPointAmount: number): Promise<void> {
    await resetAllUsePointInputs(this.currentPage);
    const input = await findUsePointInput(this.currentPage);
    await fillConvertedPointInput(input, convertedPointAmount);
  }

  /**
   * 복합결제 포인트 입력 화면의 확인 버튼으로 결제를 진행한다.
   */
  async pay(): Promise<void> {
    const sendButton = this.currentPage.locator('#send').first();
    if (await isUsable(sendButton)) {
      await sendButton.click();
      // [CU]소진형은 확인 후 포인트 전환 안내 레이어가 항상 뜨므로 레이어 확인 버튼을 추가로 클릭한다
      await clickOptionalConfirm(this.currentPage, 5000);
      return;
    }

    await clickButton(this.currentPage, /결제|전환하기|확인/);
  }

  /**
   * 일부 로컬 화면에서만 표시되는 최종 확인 버튼을 있으면 클릭한다.
   */
  async confirmIfPresent(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clicked = await clickOptionalConfirm(this.currentPage, 1500);
      if (!clicked) return;

      // PG별로 확인 버튼 뒤에 한 번 더 전환/결제 확인 레이어가 뜰 수 있다.
      await this.currentPage.waitForTimeout(500).catch(() => undefined);
    }
  }

  private async clickSendAndMaybeGetPopup(): Promise<void> {
    const popupPromise = this.currentPage.waitForEvent('popup', { timeout: 15_000 }).catch(() => null);

    await this.currentPage.locator('#send').first().click();

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
      this.currentPage = popup;
      return;
    }

    await this.currentPage.waitForLoadState('domcontentloaded').catch(() => undefined);
  }
}
