import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CrudApi } from '../../../core/http/crud-api';

export interface Reminder {
  id: string;
  name: string;
  templateId?: string | null;
  trigger?: string | null;
  active: boolean;
}

export interface ReminderUpsert {
  name: string;
  templateId?: string | null;
  trigger?: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class RemindersApiService {
  private readonly http = inject(HttpClient);
  readonly reminders = new CrudApi<Reminder, ReminderUpsert>(this.http, 'reminders');
}
