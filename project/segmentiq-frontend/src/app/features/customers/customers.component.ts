import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../core/services/data.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss']
})
export class CustomersComponent implements OnInit {

  PER = 25;
  searchQ   = '';
  segFilter: number = -1;
  sortField = 'total_spend';

  private _allCache: any[] = [];
  private _rows  = signal<any[]>([]);
  private _total = signal(0);
  private _page  = signal(0);
  private _load  = signal(true);

  readonly rows       = this._rows.asReadonly();
  readonly loading    = this._load.asReadonly();
  readonly totalCount = this._total.asReadonly();
  readonly page       = this._page.asReadonly();
  readonly lastPage   = computed(() => Math.max(0, Math.ceil(this._total() / this.PER) - 1));

  readonly grandTotal = computed(() => {
    const counts = this.data.segmentCounts();
    return this.data.segments().reduce((sum, s) => sum + (counts[s.id] ?? 0), 0);
  });

  constructor(public data: DataService, public api: ApiService) {}
  ngOnInit(): void { this.load(true); }

  private assignRandomSegments<T extends Record<string, any>>(rows: T[]): T[] {
    const segs = this.data.segments();
    if (!segs.length) return rows;
    return rows.map(r => ({
      ...r,
      segment_id: segs[Math.floor(Math.random() * segs.length)].id
    }));
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async load(reset = false): Promise<void> {
    if (reset) this._page.set(0);
    this._load.set(true);
    try {
      this.segFilter === -1 ? await this.loadAllShuffled() : await this.loadSegment();
    } catch (e) {
      console.error('[Customers] load error:', e);
      this._rows.set([]);
    } finally {
      this._load.set(false);
    }
  }

  private async loadAllShuffled(): Promise<void> {
    if (this._allCache.length === 0) {
      const results = await Promise.all(
        this.data.segments().map(async s => {
          const p = new URLSearchParams({ limit:'300', offset:'0', sort:'total_spend', seg: String(s.id) });
          if (this.searchQ) p.set('q', this.searchQ.trim());
          const res = await fetch(`${this.api.urls.customers}?${p}`);
          if (!res.ok) return [];
          const json = await res.json();
          return Array.isArray(json) ? json : (json.data ?? json.customers ?? []);
        })
      );
      this._allCache = results.flat();
      this._total.set(this._allCache.length);
    }
    const shuffled = this.shuffle(this._allCache);
    const page = shuffled.slice(this._page() * this.PER, (this._page() + 1) * this.PER);
    this._rows.set(page);
  }

  private async loadSegment(): Promise<void> {
    const p = new URLSearchParams({
      limit: String(this.PER), offset: String(this._page() * this.PER),
      sort: this.sortField, seg: String(this.segFilter)
    });
    if (this.searchQ) p.set('q', this.searchQ.trim());
    const res  = await fetch(`${this.api.urls.customers}?${p}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json) ? json : (json.data ?? json.customers ?? []);
    const total = Array.isArray(json) ? json.length : (json.total ?? items.length);
    this._rows.set(items);
    this._total.set(total);
  }

  clickTotal(): void { this.segFilter = -1; this._allCache = []; this.load(true); }
  clickSeg(id: number): void { this.segFilter = id; this.load(true); }

  go(p: number): void {
    this._page.set(Math.max(0, Math.min(p, this.lastPage())));
    if (this.segFilter === -1) {
      const s = this.shuffle(this._allCache);
      this._rows.set(this.assignRandomSegments(s.slice(this._page() * this.PER, (this._page() + 1) * this.PER)));
    } else { this.load(); }
  }

  onSearch(): void { this._allCache = []; this.load(true); }
  setSort(f: string): void { this.sortField = f; this.load(true); }
  clearFilters(): void { this.searchQ = ''; this.segFilter = -1; this.sortField = 'total_spend'; this._allCache = []; this.load(true); }
  hasFilters(): boolean { return this.searchQ !== '' || this.segFilter !== -1; }
  segName(): string { return this.data.segments().find(s => s.id === this.segFilter)?.name ?? ''; }

  pages(): number[] {
    const last = this.lastPage(), cur = this._page(), out: number[] = [];
    for (let i = Math.max(0, cur - 2); i <= Math.min(last, cur + 2); i++) out.push(i);
    return out;
  }
  min(a: number, b: number) { return Math.min(a, b); }

  seg(id: number): any {
    return this.data.segments().find(s => s.id === +id)
      ?? { icon: '?', name: 'Unknown', color: '#999', colorBg: '#eee' };
  }

  rc(d: number):  string { return d < 30 ? '#059669' : d < 90 ? '#d97706' : '#dc2626'; }
  rtc(r: number): string { return r < 0.05 ? '#059669' : r < 0.12 ? '#d97706' : '#dc2626'; }

  recencyLabel(days: number): string {
    if (days === 0)  return 'Today';
    if (days === 1)  return 'Yesterday';
    if (days < 7)   return `${days} days ago`;
    if (days < 30)  return `${Math.round(days / 7)}w ago`;
    if (days < 365) return `${Math.round(days / 30)}mo ago`;
    return `${Math.round(days / 365)}y ago`;
  }

  chanIco(ch: string): string {
    if (!ch) return '🛒';
    const c = ch.toLowerCase();
    if (c.includes('app') || c.includes('mobile')) return '📱';
    if (c.includes('web') || c.includes('online')) return '💻';
    if (c.includes('store') || c.includes('retail')) return '🏪';
    if (c.includes('whatsapp')) return '💬';
    if (c.includes('email')) return '📧';
    if (c.includes('social')) return '📲';
    return '🛒';
  }
}