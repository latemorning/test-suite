import { createHash, randomInt } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { env } from '../support/env';

type PgApiPath =
  | '/api/v1/r/terms'
  | '/api/v1/c/terms'
  | '/api/v1/r/pnt'
  | '/api/v1/c/pnt'
  | '/api/v1/d/pnt';
type JsonObject = Record<string, unknown>;

/**
 * PG API 직접 호출 테스트에 필요한 고정 요청값이다.
 */
export type PgApiConfig = {
  baseUrl: string;
  pgCd: string;
  shopCd: string;
  shopName: string;
  shopPayMethod: string;
  goodsName: string;
  pointTargetAmount: number;
  shopCmsnRate: number;
  authHeader: string;
  custCi: string;
  custName: string;
  custCtn: string;
};

/**
 * 약관 조회 응답에서 반드시 포함되어야 하는 필수 약관 기준이다.
 */
export type ApiRequiredTermExpectation = {
  clsId: string;
  mandatory: 'Y';
};

/**
 * 약관 조회부터 약관 동의까지 완료된 거래 컨텍스트다.
 */
export type PgApiTermsFlowResult = {
  pgTrNo: string;
  phubTrNo: string;
  termsInquiry: TermsInquiryResponse;
  termsAgreement: TermsAgreementResponse;
};

/**
 * 포인트 조회, 사용, 취소까지 완료된 결과다.
 */
export type PgApiPointPaymentFlowResult = {
  pointInquiry: PointInquiryResponse;
  selectedProvider: SelectedPointProvider;
  pointPayment: PointPaymentResponse;
  pointCancel: PointCancelResponse;
  pointPaymentRequest: PointPaymentRequest;
};

type ApiRetCodeResponse = {
  ret_code?: string;
  ret_msg?: string;
};

type TermClause = {
  cls_id?: string;
  cls_titl?: string;
  cls_ver?: string;
  cls_url?: string;
  mdt_yn?: string;
  agre_yn?: string;
};

type TermsInquiryResponse = ApiRetCodeResponse & {
  phub_tr_no?: string;
  pg_tr_no?: string;
  pg_cd?: string;
  shop_cd?: string;
  cls_list?: TermClause[];
};

type TermsAgreementResponse = ApiRetCodeResponse & {
  phub_tr_no?: string;
  pg_tr_no?: string;
};

type PointProvider = {
  pnt_tr_no?: string;
  pnt_cd?: string;
  name?: string;
  pnt_nm?: string;
  deal_unit?: number;
  min_avl_pnt?: number;
  max_avl_pnt?: number;
  pnt_exch_rate?: number;
  crnt_point?: number;
};

type PointInquiryResponse = ApiRetCodeResponse & {
  pg_tr_no?: string;
  phub_tr_no?: string;
  shop_cd?: string;
  shop_name?: string;
  prvdr_list?: PointProvider[];
};

type SelectedPointProvider = {
  source: PointProvider;
  pntTrNo: string;
  pntCd: string;
  name: string;
  usePoint: number;
  pointAmt: number;
  exchangeRate: number;
};

type PointPaymentProviderRequest = {
  pnt_tr_no: string;
  pnt_cd: string;
  name: string;
  point: number;
  point_amt: number;
};

type PointPaymentRequest = {
  pg_tr_no: string;
  pg_cd: string;
  phub_tr_no: string;
  shop_cd: string;
  pg_cust_ci: string;
  shop_pay_method: string;
  shop_cmsn_rate: number;
  prvdr_list: PointPaymentProviderRequest[];
  check_hash: string;
  ttl_pnt: number;
  ttl_pay_amt: number;
  ttl_pnt_amt: number;
  ttl_rmnd_amt: number;
  ttl_cprt_amt: number;
};

type PointPaymentResponse = ApiRetCodeResponse & {
  pg_tr_no?: string;
  phub_tr_no?: string;
  ttl_pay_amt?: number | string;
  ttl_pnt?: number | string;
  ttl_pnt_amt?: number | string;
  ttl_cprt_amt?: number | string;
};

type PointCancelResponse = ApiRetCodeResponse & {
  pg_tr_no?: string;
  phub_tr_no?: string;
  pay_amt?: number | string;
  points?: number | string;
};

/**
 * Postman 컬렉션 흐름과 같은 JSON 요청을 Playwright request fixture로 직접 호출한다.
 */
export class PgApiClient {
  readonly pgTrNo: string;

  private readonly config: PgApiConfig;

  constructor(
    private readonly request: APIRequestContext,
    config: Partial<PgApiConfig> = {},
    pgTrNo = createPgTransactionNo(),
  ) {
    this.config = {
      baseUrl: env.pgApiBaseUrl,
      pgCd: env.pgApiPgCd,
      shopCd: env.pgApiShopCd,
      shopName: env.pgApiShopName,
      shopPayMethod: env.pgApiShopPayMethod,
      goodsName: env.pgApiGoodsName,
      pointTargetAmount: env.pgApiPointTargetAmount,
      shopCmsnRate: env.pgApiShopCmsnRate,
      authHeader: env.pgApiAuthorization,
      custCi: env.pgApiCustCi,
      custName: env.pgApiCustName,
      custCtn: env.pgApiCustCtn,
      ...config,
    };
    this.pgTrNo = pgTrNo;
  }

  /**
   * 약관 목록 조회와 필수 약관 전체 동의를 순서대로 실행한다.
   */
  async runTermsFlow(
    requiredTerms: ApiRequiredTermExpectation[],
  ): Promise<PgApiTermsFlowResult> {
    const termsInquiry = await this.inquireTerms();
    this.expectTermsInquiry(termsInquiry, requiredTerms);

    const termsAgreement = await this.agreeTerms(termsInquiry.phub_tr_no);
    this.expectTermsAgreement(termsInquiry, termsAgreement);

    return {
      pgTrNo: this.pgTrNo,
      phubTrNo: termsInquiry.phub_tr_no ?? '',
      termsInquiry,
      termsAgreement,
    };
  }

  /**
   * 포인트 조회, 포인트 사용, 포인트 사용 취소를 순서대로 실행한다.
   */
  async runPointPaymentFlow(
    termsFlow: PgApiTermsFlowResult,
    targetPointAmount = this.config.pointTargetAmount,
    shopCmsnRate = this.config.shopCmsnRate,
  ): Promise<PgApiPointPaymentFlowResult> {
    const pointInquiry = await this.inquirePoints(termsFlow.phubTrNo);
    this.expectPointInquiry(pointInquiry, termsFlow);

    const selectedProvider = this.selectPointProvider(pointInquiry, targetPointAmount);
    const pointPaymentRequest = this.buildPointPaymentRequest(
      termsFlow.phubTrNo,
      selectedProvider,
      targetPointAmount,
      shopCmsnRate,
    );
    const pointPayment = await this.payPoints(pointPaymentRequest);
    this.expectPointPayment(pointPayment, termsFlow, pointPaymentRequest);

    const pointCancel = await this.cancelPoints(termsFlow.phubTrNo, pointPaymentRequest);
    this.expectPointCancel(pointCancel, pointPaymentRequest);

    return {
      pointInquiry,
      selectedProvider,
      pointPayment,
      pointCancel,
      pointPaymentRequest,
    };
  }

  private async inquireTerms(): Promise<TermsInquiryResponse> {
    return this.postJson<TermsInquiryResponse>('/api/v1/r/terms', {
      pg_tr_no: this.pgTrNo,
      pg_cd: this.config.pgCd,
      shop_cd: this.config.shopCd,
      pg_cust_ci: this.config.custCi,
    });
  }

  private async agreeTerms(phubTrNo: string | undefined): Promise<TermsAgreementResponse> {
    return this.postJson<TermsAgreementResponse>('/api/v1/c/terms', {
      phub_tr_no: phubTrNo,
      pg_tr_no: this.pgTrNo,
      pg_cd: this.config.pgCd,
      shop_cd: this.config.shopCd,
      pg_cust_name: this.config.custName,
      pg_cust_ctn: this.config.custCtn,
      pg_cust_ci: this.config.custCi,
      is_mdt_all: 'Y',
    });
  }

  private async inquirePoints(phubTrNo: string): Promise<PointInquiryResponse> {
    return this.postJson<PointInquiryResponse>('/api/v1/r/pnt', {
      pg_tr_no: this.pgTrNo,
      pg_cd: this.config.pgCd,
      phub_tr_no: phubTrNo,
      shop_cd: this.config.shopCd,
      shop_name: this.config.shopName,
      goods_name: this.config.goodsName,
      pg_cust_ci: this.config.custCi,
    });
  }

  private async payPoints(body: PointPaymentRequest): Promise<PointPaymentResponse> {
    return this.postJson<PointPaymentResponse>('/api/v1/c/pnt', body);
  }

  private async cancelPoints(
    phubTrNo: string,
    pointPaymentRequest: PointPaymentRequest,
  ): Promise<PointCancelResponse> {
    return this.postJson<PointCancelResponse>('/api/v1/d/pnt', {
      pg_tr_no: this.pgTrNo,
      pg_cd: this.config.pgCd,
      phub_tr_no: phubTrNo,
      ori_pg_tr_no: this.pgTrNo,
      tr_div: 'CA',
      points: pointPaymentRequest.ttl_pnt_amt,
      check_hash: pointPaymentRequest.check_hash,
    });
  }

  private expectTermsInquiry(
    response: TermsInquiryResponse,
    requiredTerms: ApiRequiredTermExpectation[],
  ): void {
    expect(response.pg_tr_no).toBe(this.pgTrNo);
    expect(response.phub_tr_no, '약관 조회 응답에 phub_tr_no가 있어야 한다.').toBeTruthy();
    expect(Array.isArray(response.cls_list), '약관 조회 응답에 cls_list가 있어야 한다.').toBe(
      true,
    );

    const terms = Array.isArray(response.cls_list) ? response.cls_list : [];
    for (const expectedTerm of requiredTerms) {
      const term = terms.find((item) => item.cls_id === expectedTerm.clsId);
      expect(term, `필수 약관 ${expectedTerm.clsId}가 응답에 포함되어야 한다.`).toBeTruthy();
      expect(term?.mdt_yn, `필수 약관 ${expectedTerm.clsId}의 mdt_yn 값`).toBe(
        expectedTerm.mandatory,
      );
    }
  }

  private expectTermsAgreement(
    inquiry: TermsInquiryResponse,
    agreement: TermsAgreementResponse,
  ): void {
    expect(agreement.pg_tr_no).toBe(this.pgTrNo);
    expect(agreement.phub_tr_no).toBe(inquiry.phub_tr_no);
  }

  private expectPointInquiry(
    response: PointInquiryResponse,
    termsFlow: PgApiTermsFlowResult,
  ): void {
    expect(response.pg_tr_no).toBe(this.pgTrNo);
    expect(response.phub_tr_no).toBe(termsFlow.phubTrNo);
    expect(Array.isArray(response.prvdr_list), '포인트 조회 응답에 prvdr_list가 있어야 한다.').toBe(
      true,
    );
    expect(response.prvdr_list?.length ?? 0).toBeGreaterThan(0);
  }

  private expectPointPayment(
    response: PointPaymentResponse,
    termsFlow: PgApiTermsFlowResult,
    requestBody: PointPaymentRequest,
  ): void {
    expect(response.pg_tr_no).toBe(this.pgTrNo);
    expect(response.phub_tr_no).toBe(termsFlow.phubTrNo);
    expectNumberLike(response.ttl_pay_amt, requestBody.ttl_pay_amt, 'ttl_pay_amt');
    expectNumberLike(response.ttl_pnt, requestBody.ttl_pnt, 'ttl_pnt');
    expectNumberLike(response.ttl_pnt_amt, requestBody.ttl_pnt_amt, 'ttl_pnt_amt');
    expectNumberLike(response.ttl_cprt_amt, requestBody.ttl_cprt_amt, 'ttl_cprt_amt');
  }

  private expectPointCancel(
    response: PointCancelResponse,
    requestBody: PointPaymentRequest,
  ): void {
    expect(response.pg_tr_no).toBe(this.pgTrNo);
    expectNumberLike(response.points, requestBody.ttl_pnt_amt, 'points');
  }

  private selectPointProvider(
    response: PointInquiryResponse,
    targetPointAmount: number,
  ): SelectedPointProvider {
    const providers = Array.isArray(response.prvdr_list) ? response.prvdr_list : [];

    for (const provider of providers) {
      const selected = this.trySelectPointProvider(provider, targetPointAmount);
      if (selected) return selected;
    }

    throw new Error(
      [
        `No point provider can use target point amount: ${targetPointAmount}`,
        `Providers: ${providers.map(formatProviderForDiagnostics).join(' | ') || '(none)'}`,
      ].join('\n'),
    );
  }

  private trySelectPointProvider(
    provider: PointProvider,
    targetPointAmount: number,
  ): SelectedPointProvider | null {
    const exchangeRate = toPositiveNumber(provider.pnt_exch_rate);
    const minAvailablePoint = toPositiveNumber(provider.min_avl_pnt);
    const maxAvailablePoint = toPositiveNumber(provider.max_avl_pnt);
    const currentPoint = toPositiveNumber(provider.crnt_point);
    const dealUnit = toPositiveNumber(provider.deal_unit) ?? 1;
    const pntTrNo = toNonEmptyString(provider.pnt_tr_no);
    const pntCd = toNonEmptyString(provider.pnt_cd);

    if (
      exchangeRate === undefined ||
      minAvailablePoint === undefined ||
      maxAvailablePoint === undefined ||
      currentPoint === undefined ||
      !pntTrNo ||
      !pntCd
    ) {
      return null;
    }

    const usePoint = alignToDealUnit(Math.ceil(targetPointAmount / exchangeRate), dealUnit);
    const pointAmt = toPointAmount(usePoint, exchangeRate);
    if (pointAmt !== targetPointAmount) return null;
    if (usePoint < minAvailablePoint) return null;
    if (usePoint > maxAvailablePoint) return null;
    if (usePoint > currentPoint) return null;

    return {
      source: provider,
      pntTrNo,
      pntCd,
      name: toNonEmptyString(provider.pnt_nm) ?? toNonEmptyString(provider.name) ?? pntCd,
      usePoint,
      pointAmt,
      exchangeRate,
    };
  }

  private buildPointPaymentRequest(
    phubTrNo: string,
    selectedProvider: SelectedPointProvider,
    targetPointAmount: number,
    shopCmsnRate: number,
  ): PointPaymentRequest {
    const ttlCprtAmt = toMoneyAmount(
      targetPointAmount - targetPointAmount * (shopCmsnRate / 100),
    );
    const ttlRmndAmt = toMoneyAmount(targetPointAmount - ttlCprtAmt);
    const checkHash = createHash('sha256')
      .update(`${this.pgTrNo}${targetPointAmount}${this.config.shopCd}${phubTrNo}`)
      .digest('hex');

    return {
      pg_tr_no: this.pgTrNo,
      pg_cd: this.config.pgCd,
      phub_tr_no: phubTrNo,
      shop_cd: this.config.shopCd,
      pg_cust_ci: this.config.custCi,
      shop_pay_method: this.config.shopPayMethod,
      shop_cmsn_rate: shopCmsnRate,
      prvdr_list: [
        {
          pnt_tr_no: selectedProvider.pntTrNo,
          pnt_cd: selectedProvider.pntCd,
          name: selectedProvider.name,
          point: selectedProvider.usePoint,
          point_amt: selectedProvider.pointAmt,
        },
      ],
      check_hash: checkHash,
      ttl_pnt: selectedProvider.usePoint,
      ttl_pay_amt: targetPointAmount,
      ttl_pnt_amt: targetPointAmount,
      ttl_rmnd_amt: ttlRmndAmt,
      ttl_cprt_amt: ttlCprtAmt,
    };
  }

  private async postJson<T extends ApiRetCodeResponse>(
    path: PgApiPath,
    body: JsonObject,
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl).toString();
    let responseText = '';
    let status = '(request failed)';
    const authHeaderValue = this.config.authHeader;

    try {
      logApiRequest(path, url, body);
      const response = await this.request.post(url, {
        data: body,
        headers: {
          Authorization: authHeaderValue,
          'Content-Type': 'application/json',
        },
        timeout: 30_000,
      });
      status = String(response.status());
      responseText = await response.text();
      logApiResponse(path, status, responseText);

      if (!response.ok()) {
        throw this.buildApiError(path, status, body, responseText);
      }
    } catch (error) {
      if (error instanceof PgApiRequestError) throw error;

      throw this.buildApiError(path, status, body, responseText, error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText) as unknown;
    } catch (error) {
      throw this.buildApiError(path, status, body, responseText, error);
    }

    if (!isRecord(parsed) || parsed.ret_code !== '00') {
      throw this.buildApiError(path, status, body, responseText);
    }

    return parsed as T;
  }

  private buildApiError(
    path: PgApiPath,
    status: string,
    body: JsonObject,
    responseBody: string,
    cause?: unknown,
  ): PgApiRequestError {
    return new PgApiRequestError(
      [
        `PG API request failed: ${path}`,
        `Status: ${status}`,
        `Request body: ${JSON.stringify(formatRequestBodyForDiagnostics(body), null, 2)}`,
        `Response body: ${truncateForDiagnostics(responseBody || '(empty)')}`,
        cause ? `Original error: ${String(cause)}` : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

class PgApiRequestError extends Error {}

function createPgTransactionNo(): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join('');
  const suffix = String(randomInt(0, 10_000)).padStart(4, '0');

  return `AT_PG_TR_NO_${timestamp}${suffix}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function expectNumberLike(actual: unknown, expected: number, fieldName: string): void {
  const parsed = Number(actual);
  expect(Number.isFinite(parsed), `${fieldName} 값은 숫자로 해석 가능해야 한다.`).toBe(true);
  expect(parsed, `${fieldName} 값`).toBeCloseTo(expected, 6);
}

function alignToDealUnit(point: number, dealUnit: number): number {
  const normalizedUnit = Math.max(1, Math.floor(dealUnit));
  return Math.ceil(point / normalizedUnit) * normalizedUnit;
}

function toPointAmount(usePoint: number, exchangeRate: number): number {
  return Math.round(usePoint * exchangeRate);
}

function toMoneyAmount(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) return rounded;

  return Number(value.toFixed(6));
}

function toPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logApiRequest(path: PgApiPath, url: string, body: JsonObject): void {
  console.info(
    [
      `[PG API][request] ${path}`,
      `Method: POST`,
      `URL: ${url}`,
      `Body: ${formatJsonForLog(body)}`,
    ].join('\n'),
  );
}

function logApiResponse(path: PgApiPath, status: string, responseText: string): void {
  console.info(
    [
      `[PG API][response] ${path}`,
      `Status: ${status}`,
      `Body: ${formatResponseBodyForLog(responseText)}`,
    ].join('\n'),
  );
}

function formatJsonForLog(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatResponseBodyForLog(responseText: string): string {
  if (!responseText) return '(empty)';

  try {
    return formatJsonForLog(JSON.parse(responseText) as unknown);
  } catch {
    return responseText;
  }
}

function formatProviderForDiagnostics(provider: PointProvider): string {
  return JSON.stringify({
    pnt_cd: provider.pnt_cd,
    name: provider.pnt_nm ?? provider.name,
    pnt_exch_rate: provider.pnt_exch_rate,
    min_avl_pnt: provider.min_avl_pnt,
    max_avl_pnt: provider.max_avl_pnt,
    deal_unit: provider.deal_unit,
    crnt_point: provider.crnt_point,
  });
}

function formatRequestBodyForDiagnostics(body: JsonObject): JsonObject {
  const keys = [
    'pg_tr_no',
    'pg_cd',
    'phub_tr_no',
    'shop_cd',
    'shop_name',
    'shop_pay_method',
    'is_mdt_all',
    'ttl_pnt',
    'ttl_pay_amt',
    'ttl_pnt_amt',
    'ttl_rmnd_amt',
    'ttl_cprt_amt',
    'points',
    'tr_div',
  ];
  const formatted: JsonObject = {};

  for (const key of keys) {
    if (body[key] !== undefined) formatted[key] = body[key];
  }

  if (typeof body.pg_cust_ci === 'string') {
    formatted.pg_cust_ci = summarizeString(body.pg_cust_ci);
  }

  if (typeof body.pg_cust_name === 'string') {
    formatted.pg_cust_name = summarizeString(body.pg_cust_name);
  }

  if (typeof body.pg_cust_ctn === 'string') {
    formatted.pg_cust_ctn = summarizeString(body.pg_cust_ctn);
  }

  if (Array.isArray(body.prvdr_list)) {
    formatted.prvdr_list = body.prvdr_list.map((item) =>
      isRecord(item)
        ? {
            pnt_cd: item.pnt_cd,
            point: item.point,
            point_amt: item.point_amt,
          }
        : item,
    );
  }

  if (typeof body.check_hash === 'string') {
    formatted.check_hash = summarizeString(body.check_hash);
  }

  return formatted;
}

function summarizeString(value: string): string {
  if (value.length <= 24) return value;

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function truncateForDiagnostics(value: string, limit = 8_000): string {
  if (value.length <= limit) return value;

  return `${value.slice(0, limit)}...(truncated ${value.length - limit} chars)`;
}
