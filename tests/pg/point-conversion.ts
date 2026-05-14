import type { Locator } from '@playwright/test';

type PointProviderIdentity = {
  exchangeRate?: number;
  pointCode?: string;
  pointName?: string;
  providerCode?: string;
  rowText?: string;
};

const defaultPointExchangeRate = 1;
const hyundaiPointExchangeRate = 2 / 3;
const hyundaiPointProviderCodes = new Set([
  'HD',
  'HDC',
  'HDCARD',
  'HYUNDAI',
  'HYUNDAICARD',
  'HYUNDAI_CARD',
]);
const hyundaiPointPattern = /hyundai|현대|M포인트|M[-_. ]?POINT|H[-_ ]?POINT/i;

/**
 * 포인트 제공자와 화면 전환율 값을 기준으로 사용할 전환율을 결정한다.
 */
export function resolvePointExchangeRate(identity: PointProviderIdentity = {}): number {
  if (isHyundaiPointProvider(identity)) return hyundaiPointExchangeRate;

  const exchangeRate = identity.exchangeRate;
  if (exchangeRate !== undefined && Number.isFinite(exchangeRate) && exchangeRate > 0) {
    return exchangeRate;
  }

  return defaultPointExchangeRate;
}

/**
 * 카드사 코드나 이름이 현대카드 M포인트인지 확인한다.
 */
export function isHyundaiPointProvider(identity: PointProviderIdentity): boolean {
  const providerCode = identity.providerCode ?? identity.pointCode ?? '';
  if (hyundaiPointProviderCodes.has(providerCode.trim().toUpperCase())) return true;

  return hyundaiPointPattern.test(
    [identity.providerCode, identity.pointCode, identity.pointName, identity.rowText]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * 전환포인트 목표값에 맞는 사용포인트 입력값을 계산한다.
 */
export function toUsePointAmount(convertedPointAmount: number, exchangeRate: number): number {
  return Math.ceil(convertedPointAmount / exchangeRate);
}

/**
 * 사용포인트 입력값이 실제 전환되는 포인트 금액을 계산한다.
 */
export function toConvertedPointAmount(usePointAmount: number, exchangeRate: number): number {
  return Math.floor(usePointAmount * exchangeRate + 1e-6);
}

/**
 * 사용포인트 input 주변 DOM에서 전환율 정보를 읽는다.
 */
export async function getPointInputExchangeRate(input: Locator): Promise<number> {
  const identity = await input.evaluate((element) => {
    const scope =
      element.closest('.pointGroup') ??
      element.closest('tr') ??
      element.closest('li')?.parentElement ??
      element.parentElement;
    const toNumber = (value: string | null | undefined): number | undefined => {
      const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const exchangeRateInput = scope?.querySelector<HTMLInputElement>('.pntExchRate');
    const pointCode = scope?.querySelector<HTMLInputElement>('.pntCd');
    const pointName = scope?.querySelector<HTMLImageElement>('img');

    return {
      exchangeRate: toNumber(exchangeRateInput?.value),
      pointCode: pointCode?.value,
      pointName: pointName?.alt,
      rowText: (scope?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });

  return resolvePointExchangeRate(identity);
}

/**
 * 전환포인트 목표값을 기준으로 사용포인트 입력란을 채운다.
 */
export async function fillConvertedPointInput(
  input: Locator,
  convertedPointAmount: number,
): Promise<number> {
  const exchangeRate = await getPointInputExchangeRate(input);
  const usePointAmount = toUsePointAmount(convertedPointAmount, exchangeRate);

  await input.fill(String(usePointAmount));
  await input.dispatchEvent('input');
  await input.dispatchEvent('change');
  await input.dispatchEvent('focusout');

  return usePointAmount;
}
