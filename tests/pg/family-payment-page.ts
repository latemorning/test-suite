import { expect, type Page } from '@playwright/test';
import {
  clickAndMaybeGetPopup,
  clickButton,
  isUsable,
  resolveUsablePage,
  withAutoAcceptDialogs,
} from './page-actions';

type FamilyPointCandidate = {
  index: number;
  availablePoint: number;
  usePoint: number;
  pointCode: string;
  pointName: string;
  rowText: string;
};

type FamilyPointState = {
  candidates: FamilyPointCandidate[];
  totalAvailablePoint: number;
  totalUsePoint: number;
};

/**
 * PC전용 Submit 이후 패밀리포인트 할인권 요청 팝업 흐름을 조작한다.
 */
export class FamilyPaymentPage {
  constructor(private currentPage: Page) {}

  /**
   * 현재 조작 대상 페이지를 반환한다.
   */
  get page(): Page {
    return this.currentPage;
  }

  /**
   * 패밀리 약관 화면에서 전체 약관 동의 후 본인인증을 시작한다.
   */
  async startUserAuthentication(): Promise<void> {
    this.currentPage = await clickAndMaybeGetPopup(
      this.currentPage,
      /전체\s*약관\s*동의\s*후\s*본인\s*인증하기|본인\s*인증하기/,
    );
  }

  /**
   * 사용자 인증 팝업의 전송 버튼을 누르고 패밀리포인트 사용 화면으로 이동한다.
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
   * 패밀리포인트 사용 화면이 준비됐는지 확인한다.
   */
  async expectPointUsePage(): Promise<void> {
    await expect(this.currentPage.getByText(/패밀리\s*포인트/).first()).toBeVisible();
    await expect(this.currentPage.locator('.pointGroup').first()).toBeVisible();
    await expect(this.currentPage.locator('#confirmBtn')).toBeVisible();
  }

  /**
   * 각 카드사 행의 초기화 버튼을 눌러 사용포인트를 0으로 만든다.
   */
  async resetAllUsePoints(): Promise<void> {
    const resetButtons = this.currentPage.locator('.pointGroup .initBtn');
    const count = await resetButtons.count();
    if (count === 0) {
      throw new Error(`Could not find family point reset buttons. URL: ${this.currentPage.url()}`);
    }

    for (let index = 0; index < count; index += 1) {
      await resetButtons.nth(index).click();
    }

    const inputs = this.currentPage.locator('.pointGroup input.pnt');
    const inputCount = await inputs.count();
    for (let index = 0; index < inputCount; index += 1) {
      await expect(inputs.nth(index)).toHaveValue(/^0$/);
    }
  }

  /**
   * 사용가능 포인트가 기준 금액 이상인 첫 카드사 행에만 사용포인트를 입력한다.
   */
  async enterFirstEligibleUsePoint(usePointAmount: number): Promise<FamilyPointCandidate> {
    const selection = await this.findFirstEligiblePointCandidate(usePointAmount);
    const input = this.currentPage
      .locator('.pointGroup')
      .nth(selection.index)
      .locator('input.pnt')
      .first();

    await input.fill(String(usePointAmount));
    await input.dispatchEvent('input');
    await input.dispatchEvent('change');
    await input.dispatchEvent('focusout');

    await expect
      .poll(async () => parsePointAmount(await input.inputValue()), {
        message: `Expected selected family point row to use ${usePointAmount} points.`,
      })
      .toBe(usePointAmount);

    return selection;
  }

  /**
   * 자동 최대 사용포인트 상태에서 1,000P를 추가해 최대 할인권금액 오류 조건을 만든다.
   */
  async addOneThousandPointOverAutomaticMaximum(
    additionalUsePointAmount: number,
    minimumTotalAvailablePointAmount: number,
    insufficientPointMessage: string,
  ): Promise<void> {
    const state = await this.getPointState();
    if (state.totalAvailablePoint < minimumTotalAvailablePointAmount) {
      throw new Error(insufficientPointMessage);
    }

    const candidate = state.candidates.find(
      (item) => item.availablePoint - item.usePoint >= additionalUsePointAmount,
    );
    if (!candidate) {
      throw new Error(
        [
          `Could not find a family point row that can add ${additionalUsePointAmount} points.`,
          `Current total: ${state.totalUsePoint}`,
          `Available total: ${state.totalAvailablePoint}`,
          `URL: ${this.currentPage.url()}`,
        ].join('\n'),
      );
    }

    const input = this.currentPage
      .locator('.pointGroup')
      .nth(candidate.index)
      .locator('input.pnt')
      .first();
    if (!(await isUsable(input, true))) {
      throw new Error(
        `Selected family point input is not editable. URL: ${this.currentPage.url()}`,
      );
    }

    const expectedTotalUsePointAmount = state.totalUsePoint + additionalUsePointAmount;
    await input.fill(String(candidate.usePoint + additionalUsePointAmount));
    await input.dispatchEvent('input');
    await input.dispatchEvent('change');
    await input.dispatchEvent('focusout');

    await expect
      .poll(async () => (await this.getPointState()).totalUsePoint, {
        message: `Expected family point use total to be ${expectedTotalUsePointAmount}.`,
      })
      .toBe(expectedTotalUsePointAmount);
  }

  /**
   * 사용포인트 확인 버튼을 누른 뒤 레이어 팝업에 기대 오류 문구가 표시되는지 확인한다.
   */
  async confirmPointUseAndExpectLayerMessage(expectedPattern: RegExp): Promise<void> {
    await this.currentPage.locator('#confirmBtn').click();
    await this.expectLayerMessage(expectedPattern);
  }

  /**
   * 사용포인트 확인 후 결과 화면의 ret_code=00을 확인하고 가족 목록 화면으로 이동한다.
   */
  async confirmPointUseAndOpenFamilyList(): Promise<void> {
    await Promise.all([
      this.currentPage.waitForURL(/\/pg\/dummyRetUrl\.do/, { timeout: 20_000 }),
      this.currentPage.locator('#confirmBtn').click(),
    ]);

    await expect(this.currentPage.locator('body')).toContainText(/ret_code=00/, {
      timeout: 20_000,
    });

    const resultConfirm = this.currentPage.locator('#btn_confirm').first();
    const payRequestFailure = this.waitForPayRequestFailure();
    await Promise.all([
      this.currentPage.waitForURL(/\/phub\/fp\/familyList\.do/, { timeout: 20_000 }),
      payRequestFailure,
      isUsable(resultConfirm).then((usable) =>
        usable ? resultConfirm.click() : clickButton(this.currentPage, /확인/),
      ),
    ]);

    await expect(this.currentPage.locator('#btnReqAll')).toBeVisible();
  }

  /**
   * 가족 전체에게 할인권 요청 메시지를 발송하고 성공 레이어 문구를 확인한다.
   */
  async requestAllFamilyCoupons(expectedSuccessPattern: RegExp): Promise<void> {
    await this.currentPage.locator('#btnReqAll').click();

    const successPopup = this.currentPage.locator('#myPopup:visible').first();
    await expect(successPopup).toContainText(expectedSuccessPattern, { timeout: 20_000 });

    const popupConfirm = successPopup.locator('.btn_ok.pop_ok').filter({ hasText: /확인/ }).first();
    if (await isUsable(popupConfirm)) {
      await popupConfirm.click();
    } else {
      await clickButton(this.currentPage, /확인/);
    }
  }

  private async findFirstEligiblePointCandidate(
    usePointAmount: number,
  ): Promise<FamilyPointCandidate> {
    const result = await this.currentPage.evaluate((amount) => {
      const toNumber = (value: string | null | undefined): number => {
        const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const groups = Array.from(document.querySelectorAll('.pointGroup'));
      const candidates = groups.map((group, index) => {
        const avlPoint = group.querySelector<HTMLElement>('.avlPnt');
        const input = group.querySelector<HTMLInputElement>('input.pnt');
        const pointCode = group.querySelector<HTMLInputElement>('.pntCd');
        const pointName = group.querySelector<HTMLImageElement>('img');

        return {
          index,
          availablePoint: toNumber(avlPoint?.getAttribute('val') ?? avlPoint?.textContent),
          usePoint: toNumber(input?.value),
          pointCode: pointCode?.value ?? '',
          pointName: pointName?.alt ?? '',
          rowText: (group.textContent ?? '').replace(/\s+/g, ' ').trim(),
        };
      });

      const selected = candidates.find((candidate) => candidate.availablePoint >= amount) ?? null;
      return { selected, candidates };
    }, usePointAmount);

    if (result.selected) return result.selected;

    const candidateSummary = result.candidates
      .map(
        (candidate) =>
          `#${candidate.index + 1} ${candidate.pointName || candidate.pointCode || '(unknown)'}: ${
            candidate.availablePoint
          }`,
      )
      .join(' | ');

    throw new Error(
      [
        `Could not find a family point row with at least ${usePointAmount} available points.`,
        `Candidates: ${candidateSummary || '(none)'}`,
        `URL: ${this.currentPage.url()}`,
      ].join('\n'),
    );
  }

  private async expectLayerMessage(expectedPattern: RegExp): Promise<void> {
    const layer = this.currentPage
      .locator('#myPopup:visible, .popup:visible, .layer:visible, [role="dialog"]:visible')
      .filter({ hasText: expectedPattern })
      .first();

    try {
      await expect(layer).toBeVisible({ timeout: 20_000 });
    } catch {
      await expect(this.currentPage.locator('body')).toContainText(expectedPattern, {
        timeout: 1000,
      });
    }
  }

  private async waitForPayRequestFailure(): Promise<void> {
    try {
      const response = await this.currentPage.waitForResponse(
        (item) => item.url().includes('/pg/payRequest'),
        { timeout: 5_000 },
      );
      const payload = await response.json().catch(() => null);
      const retCode = getPayloadString(payload, 'ret_code');
      if (retCode && retCode !== '00') {
        throw new Error(
          [
            'Family list request failed after ret_code=00 result page.',
            `ret_code: ${retCode}`,
            `ret_msg: ${getPayloadString(payload, 'ret_msg') || '(empty)'}`,
            `URL: ${this.currentPage.url()}`,
          ].join('\n'),
        );
      }
    } catch (error) {
      if (error instanceof Error && /Timeout/.test(error.message)) return;
      throw error;
    }
  }

  private async getPointState(): Promise<FamilyPointState> {
    const candidates = await this.currentPage.evaluate(() => {
      const toNumber = (value: string | null | undefined): number => {
        const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
      };

      return Array.from(document.querySelectorAll('.pointGroup')).map((group, index) => {
        const avlPoint = group.querySelector<HTMLElement>('.avlPnt');
        const input = group.querySelector<HTMLInputElement>('input.pnt');
        const pointCode = group.querySelector<HTMLInputElement>('.pntCd');
        const pointName = group.querySelector<HTMLImageElement>('img');

        return {
          index,
          availablePoint: toNumber(avlPoint?.getAttribute('val') ?? avlPoint?.textContent),
          usePoint: toNumber(input?.value),
          pointCode: pointCode?.value ?? '',
          pointName: pointName?.alt ?? '',
          rowText: (group.textContent ?? '').replace(/\s+/g, ' ').trim(),
        };
      });
    });

    return {
      candidates,
      totalAvailablePoint: candidates.reduce(
        (total, candidate) => total + candidate.availablePoint,
        0,
      ),
      totalUsePoint: candidates.reduce((total, candidate) => total + candidate.usePoint, 0),
    };
  }
}

function parsePointAmount(value: string): number {
  const parsed = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPayloadString(payload: unknown, fieldName: string): string {
  if (!payload || typeof payload !== 'object') return '';

  const value = (payload as Record<string, unknown>)[fieldName];
  return value === undefined || value === null ? '' : String(value);
}
