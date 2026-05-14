import type { Page } from '@playwright/test';
import {
  clickAndMaybeGetPopup,
  clickButton,
  clickOptionalConfirm,
  findUsePointInput,
  isUsable,
  resolveUsablePage,
  withAutoAcceptDialogs,
} from './page-actions';
import { fillConvertedPointInput } from './point-conversion';

/**
 * PC전용 Submit 이후 일반 카드포인트 결제 팝업 흐름을 조작한다.
 */
export class CardPointPaymentPage {
  constructor(private currentPage: Page) {}

  /**
   * 현재 조작 대상 페이지를 반환한다.
   */
  get page(): Page {
    return this.currentPage;
  }

  /**
   * 약관 동의 후 포인트 조회 진입 버튼을 클릭하고, 새 창이 열리면 조작 대상을 갱신한다.
   */
  async lookupTerms(): Promise<void> {
    this.currentPage = await clickAndMaybeGetPopup(
      this.currentPage,
      /전체\s*약관\s*동의\s*후\s*(?:포인트\s*조회하기|본인\s*인증하기)|포인트\s*조회하기|약관\s*조회\s*하기|약관조회하기/,
    );
  }

  /**
   * 가상 인증 팝업의 전송 버튼을 누르고 카드포인트 입력 화면으로 이동한다.
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
   * 카드사별 사용포인트 입력란에 시나리오의 전환포인트 금액을 입력한다.
   */
  async enterCardPoint(convertedPointAmount: number): Promise<void> {
    const input = await findUsePointInput(this.currentPage);
    await fillConvertedPointInput(input, convertedPointAmount);
  }

  /**
   * 결제 또는 전환 버튼을 눌러 카드포인트 결제를 진행한다.
   */
  async pay(): Promise<void> {
    await clickButton(this.currentPage, /결제|전환하기/);
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
}
