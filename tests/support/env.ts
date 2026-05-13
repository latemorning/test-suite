import fs from 'node:fs';
import path from 'node:path';

const defaultPgFrontUrl = 'http://localhost/pg/pgfront.do';
const defaultSuccessTextPattern = '포인트허브 결제 성공';
const defaultLocalStackDir = '/Users/harry/docker/middleware-stack';
const defaultFamilyPaymentSuccessTextPattern =
  '가족 분 "손창익", "김학진", "최창현", "이용수", "최주희"님에게 할인권 요청 메시지가 발송 되었습니다';

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
  cardPointAmount: getNumberEnv('CARD_POINT_AMOUNT', 5000),
  successTextPattern: getEnv('SUCCESS_TEXT_PATTERN', defaultSuccessTextPattern),
  familyPaymentAmount: getNumberEnv('FAMILY_PAYMENT_AMOUNT', 5000),
  familyPaymentUsePointAmount: getNumberEnv('FAMILY_PAYMENT_USE_POINT_AMOUNT', 5000),
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
  apiPointTtlPnt: getNumberEnv('API_POINT_TTL_PNT', 1000),
  apiPointTtlPayAmt: getNumberEnv('API_POINT_TTL_PAY_AMT', 5000),
  apiPointTtlPntAmt: getNumberEnv('API_POINT_TTL_PNT_AMT', 1000),
  apiPointCardProvider: getEnv('API_POINT_CARD_PROVIDER', 'KB'),
  apiPointShopCmsnRate: getNumberEnv('API_POINT_SHOP_CMSN_RATE', 10),
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

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number. Received: ${value}`);
  }

  return parsed;
}
