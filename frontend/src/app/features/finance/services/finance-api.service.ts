import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CrudApi, toHttpParams, type ListParams } from '../../../core/http/crud-api';
import type { ApiResponse } from '../../../core/models/api-response.model';
import type {
  CashCurrent,
  CashDetail,
  CashSessionRow,
  CloseResult,
  CreateSaleInput,
  CreditDebitNote,
  FiscalPanel,
  FolioSeries,
  Invoice,
  MovementDetail,
  MovementInput,
  Sale,
  SessionReport,
} from './finance.models';

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Folios Maestros (CRUD). */
  readonly folios = new CrudApi<FolioSeries>(this.http, 'folios');

  cashCurrent(): Observable<ApiResponse<CashCurrent>> {
    return this.http.get<ApiResponse<CashCurrent>>(`${this.api}/cash/current`);
  }
  openCash(dto: { openingAmount: number; notes?: string }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/open`, dto);
  }
  closeCash(dto: { closingAmount: number; notes?: string; denominations?: { value: number; qty: number }[] }): Observable<ApiResponse<CloseResult>> {
    return this.http.post<ApiResponse<CloseResult>>(`${this.api}/cash/close`, dto);
  }
  addMovement(dto: MovementInput): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/movements`, dto);
  }
  editMovement(id: string, dto: MovementInput): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.api}/cash/movements/${id}`, dto);
  }
  frequentConcepts(): Observable<ApiResponse<string[]>> {
    return this.http.get<ApiResponse<string[]>>(`${this.api}/cash/frequent-concepts`);
  }
  saveFrequentConcepts(concepts: string[]): Observable<ApiResponse<string[]>> {
    return this.http.put<ApiResponse<string[]>>(`${this.api}/cash/frequent-concepts`, { concepts });
  }
  deleteMovement(id: string, reason?: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.request<ApiResponse<{ success: boolean }>>('delete', `${this.api}/cash/movements/${id}`, { body: { reason } });
  }
  reopenSession(id: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/sessions/${id}/reopen`, {});
  }
  correctSale(id: string, method: string, reason?: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/sales/${id}/correct`, { method, reason });
  }
  /** Detalle VER de un movimiento del feed (venta o movimiento de caja). */
  movementDetail(params: { saleId?: string | null; movementId?: string | null }): Observable<ApiResponse<MovementDetail>> {
    const p: Record<string, string> = {};
    if (params.saleId) p['saleId'] = params.saleId;
    if (params.movementId) p['movementId'] = params.movementId;
    return this.http.get<ApiResponse<MovementDetail>>(`${this.api}/cash/movement-detail`, { params: p });
  }
  /** Venta no registrada (regularización desde Kardex) con clasificación de cobro. */
  registerUnregisteredSale(dto: {
    sessionId?: string; productId: string; warehouseId: string; quantity: number; unitPrice: number;
    classification: 'COBRADA' | 'NO_COBRADA' | 'POR_VERIFICAR'; method?: string; roomId?: string; stayId?: string; note?: string;
  }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/reconciliation/unregistered-sale`, dto);
  }
  listSessions(params: ListParams = {}): Observable<ApiResponse<CashSessionRow[]>> {
    return this.http.get<ApiResponse<CashSessionRow[]>>(`${this.api}/cash/sessions`, { params: toHttpParams(params) });
  }
  sessionReport(id: string): Observable<ApiResponse<SessionReport>> {
    return this.http.get<ApiResponse<SessionReport>>(`${this.api}/cash/sessions/${id}/report`);
  }
  sessionDetail(id: string): Observable<ApiResponse<CashDetail>> {
    return this.http.get<ApiResponse<CashDetail>>(`${this.api}/cash/sessions/${id}/detail`);
  }

  createSale(input: CreateSaleInput): Observable<ApiResponse<Sale>> {
    return this.http.post<ApiResponse<Sale>>(`${this.api}/sales`, input);
  }
  listSales(params: ListParams = {}): Observable<ApiResponse<Sale[]>> {
    return this.http.get<ApiResponse<Sale[]>>(`${this.api}/sales`, { params: toHttpParams(params) });
  }
  cancelSale(id: string, reason?: string): Observable<ApiResponse<Sale>> {
    return this.http.post<ApiResponse<Sale>>(`${this.api}/sales/${id}/cancel`, { reason });
  }

  // ── Comprobantes ──
  listInvoices(params: ListParams = {}): Observable<ApiResponse<Invoice[]>> {
    return this.http.get<ApiResponse<Invoice[]>>(`${this.api}/invoices`, { params: toHttpParams(params) });
  }
  issueInvoice(dto: {
    saleId?: string | null;
    type: 'BOLETA' | 'FACTURA';
    customerName: string;
    customerDoc?: string;
    customerAddress?: string;
    total?: number;
  }): Observable<ApiResponse<Invoice>> {
    return this.http.post<ApiResponse<Invoice>>(`${this.api}/invoices`, dto);
  }
  voidInvoice(id: string): Observable<ApiResponse<Invoice>> {
    return this.http.post<ApiResponse<Invoice>>(`${this.api}/invoices/${id}/void`, {});
  }

  // ── Notas ──
  listNotes(params: ListParams = {}): Observable<ApiResponse<CreditDebitNote[]>> {
    return this.http.get<ApiResponse<CreditDebitNote[]>>(`${this.api}/notes`, { params: toHttpParams(params) });
  }
  createNote(dto: {
    invoiceId: string;
    type: 'CREDIT' | 'DEBIT';
    reason: string;
    total: number;
  }): Observable<ApiResponse<CreditDebitNote>> {
    return this.http.post<ApiResponse<CreditDebitNote>>(`${this.api}/notes`, dto);
  }

  // ── Panel Fiscal ──
  fiscalPanel(): Observable<ApiResponse<FiscalPanel>> {
    return this.http.get<ApiResponse<FiscalPanel>>(`${this.api}/fiscal/panel`);
  }
}
