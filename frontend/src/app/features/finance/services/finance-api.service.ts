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
  closeCash(dto: { closingAmount: number; notes?: string }): Observable<ApiResponse<CloseResult>> {
    return this.http.post<ApiResponse<CloseResult>>(`${this.api}/cash/close`, dto);
  }
  addMovement(dto: { type: 'IN' | 'OUT'; amount: number; concept: string }): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/movements`, dto);
  }
  editMovement(id: string, dto: { type?: 'IN' | 'OUT'; amount?: number; concept?: string }): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.api}/cash/movements/${id}`, dto);
  }
  deleteMovement(id: string): Observable<ApiResponse<{ success: boolean }>> {
    return this.http.delete<ApiResponse<{ success: boolean }>>(`${this.api}/cash/movements/${id}`);
  }
  reopenSession(id: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/cash/sessions/${id}/reopen`, {});
  }
  correctSale(id: string, method: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.api}/sales/${id}/correct`, { method });
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
  cancelSale(id: string): Observable<ApiResponse<Sale>> {
    return this.http.post<ApiResponse<Sale>>(`${this.api}/sales/${id}/cancel`, {});
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
