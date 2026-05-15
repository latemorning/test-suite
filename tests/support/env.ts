import fs from 'node:fs';
import path from 'node:path';

const defaultPgFrontUrl = 'http://localhost/pg/pgfront.do';
const defaultSuccessTextPattern = '포인트허브 결제 성공';
const defaultLocalStackDir = '/Users/harry/docker/middleware-stack';
const defaultCardPointAmounts = [5000];
const defaultFamilyPaymentAmounts = [900, 5000, 501000];
const defaultFamilyPaymentSuccessTextPattern =
  '가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다';
const defaultPgApiAuthorization =
  'dSgVkYp3s6v9y$B&E)H@McQeThWmZq4t7w!z%C*F-JaNdRgUjXn2r5u8x/A?D(G+';
const defaultPgApiCustCi =
  'p/8cpnfrPfHF8JDF61xaIyHskFbNrbXLJuyVEJwGtXDOJ2bznkmZDSh8+HhHIwZvxPXpVjMYFbssO0WQxrOoDT68YwoWJ7gg6w3d5WrIswbZ2bhvF336qhjN3EKIKlh2';

loadDotEnv();

/**
 * 로컬 PG 테스트 실행에 필요한 환경값을 한 곳에서 제공한다.
 *
 * 실제 환경 변수나 `.env` 값이 있으면 우선 사용하고, 없으면 테스트 계획의 기본값을 사용한다.
 */
export const env = {
  pgFrontUrl: getEnv('PG_FRONT_URL', defaultPgFrontUrl),
  paymentPgProviderNames: getListEnv('PAYMENT_PG_PROVIDERS', [
    '세틀뱅크',
    '메크로스',
    '페이레터',
  ]),
  cardPointAmounts: getCardPointAmounts(),
  successTextPattern: getEnv('SUCCESS_TEXT_PATTERN', defaultSuccessTextPattern),
  familyPaymentAmounts: getFamilyPaymentAmounts(),
  familyPaymentShopName: getEnv('FAMILY_PAYMENT_SHOP_NAME', '세틀_패밀리박스'),
  familyPaymentShopCodes: getListEnv('FAMILY_PAYMENT_SHOP_CODES', [
    'PO0134',
    'PO0018',
    'PO0017',
    'PO0016',
    'PO0015',
    'PO0011',
  ]),
  familyPaymentSuccessTextPattern: getEnv(
    'FAMILY_PAYMENT_SUCCESS_TEXT_PATTERN',
    defaultFamilyPaymentSuccessTextPattern,
  ),
  localStackDir: getEnv('LOCAL_STACK_DIR', defaultLocalStackDir),
  pgApiBaseUrl: getEnv('PG_API_BASE_URL', 'http://localhost'),
  pgApiPgCd: getEnv('PG_API_PG_CD', 'PG0006'),
  pgApiShopCd: getEnv('PG_API_SHOP_CD', 'API_ph_CU'),
  pgApiShopName: getEnv('PG_API_SHOP_NAME', 'API_pointhub용 CU'),
  pgApiShopPayMethod: getEnv('PG_API_SHOP_PAY_METHOD', 'CU'),
  pgApiGoodsName: getEnv('PG_API_GOODS_NAME', 'ApiTest상품'),
  pgApiPointTargetAmount: getNumberEnv('PG_API_POINT_TARGET_AMOUNT', 4000),
  pgApiShopCmsnRate: getNumberEnv('PG_API_SHOP_CMSN_RATE', 0),
  pgApiAuthorization: getEnv('PG_API_AUTHORIZATION', defaultPgApiAuthorization),
  pgApiCustCi: getEnv('PG_API_CUST_CI', defaultPgApiCustCi),
  pgApiCustName: getEnv('PG_API_CUST_NAME', 'veMvOJTU0L98Zq20ceDJJA=='),
  pgApiCustCtn: getEnv('PG_API_CUST_CTN', '0Lamm89+8wGhhHvtMMzuIA=='),
  headedSlowMoMs:
    process.env.PLAYWRIGHT_HEADED_SLOW_MO === '1' ? getNumberEnv('HEADED_SLOW_MO_MS', 250) : 0,
};

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  // dotenv 의존성을 추가하지 않고 로컬 실행에 필요한 단순 KEY=VALUE 형식만 반영한다.
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getCardPointAmounts(): number[] {
  const amounts = getNumberListEnv('CARD_POINT_AMOUNTS', []);
  if (amounts.length > 0) return amounts;

  // 기존 단일 금액 설정을 쓰는 로컬 .env가 있으면 그 값을 우선해 호환성을 유지한다.
  if (process.env.CARD_POINT_AMOUNT?.trim()) {
    return [getNumberEnv('CARD_POINT_AMOUNT', defaultCardPointAmounts[0])];
  }

  return defaultCardPointAmounts;
}

function getFamilyPaymentAmounts(): number[] {
  const amounts = getNumberListEnv('FAMILY_PAYMENT_AMOUNTS', []);
  if (amounts.length > 0) return amounts;

  // 기존 단일 금액 설정을 쓰는 로컬 .env가 있으면 그 값을 우선해 호환성을 유지한다.
  if (process.env.FAMILY_PAYMENT_AMOUNT?.trim()) {
    return [getNumberEnv('FAMILY_PAYMENT_AMOUNT', 5000)];
  }

  return defaultFamilyPaymentAmounts;
}

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function getListEnv(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length ? parsed : fallback;
}

function getNumberListEnv(name: string, fallback: number[]): number[] {
  const items = getListEnv(name, []);
  if (!items.length) return fallback;

  return items.map((item) => {
    const parsed = Number(item);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${name} must contain finite numbers. Received: ${item}`);
    }

    return parsed;
  });
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number. Received: ${value}`);
  }

  return parsed;
}
