// src/app/features/params/params.component.ts
import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { ApiService } from '../../core/services/api.service';

// ─────────────────────────────────────────────────────────────────────────────
//  Types & constants
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentDef {
  id: number;
  name: string;
  icon: string;
  color: string;
  bg: string;
  description: string;
  isNew?: boolean;
}

const CORE: SegmentDef[] = [
  { id: 0, name: 'VIP',     icon: '👑', color: '#f59e0b', bg: 'rgba(245,158,11,.12)',   description: 'High-spend, high-frequency buyers with very recent activity.' },
  { id: 1, name: 'Loyal',   icon: '💚', color: '#10b981', bg: 'rgba(16,185,129,.12)',   description: 'Regular buyers with consistent engagement and strong LTV.' },
  { id: 2, name: 'At Risk', icon: '⚠️', color: '#8b5cf6', bg: 'rgba(139,92,246,.12)',   description: 'Previously active customers drifting away — re-engagement needed.' },
  { id: 3, name: 'Lost',    icon: '💤', color: '#ef4444', bg: 'rgba(239,68,68,.12)',    description: 'Low spend, high recency, very infrequent. High churn risk.' },
];

const EXTRA: SegmentDef[] = [
  { id: 4, name: 'Ultra VIP', icon: '💎', color: '#ec4899', bg: 'rgba(236,72,153,.12)', description: 'Top 1% by spend — extreme frequency, highest AOV.', isNew: true },
  { id: 5, name: 'Promising', icon: '🌱', color: '#3b82f6', bg: 'rgba(59,130,246,.12)', description: 'Growing customers with increasing spend and engagement.', isNew: true },
  { id: 6, name: 'Inactive',  icon: '😴', color: '#f97316', bg: 'rgba(249,115,22,.12)', description: 'Long-dormant customers — no recent purchases.', isNew: true },
];

const K_SEGMENTS: Record<number, SegmentDef[]> = {
  2: [ CORE[0], CORE[1] ],
  3: [ CORE[0], CORE[1], CORE[2] ],
  4: [ CORE[0], CORE[1], CORE[2], CORE[3] ],
  5: [ CORE[0], CORE[1], CORE[2], CORE[3], EXTRA[0] ],
  6: [ CORE[0], CORE[1], CORE[2], CORE[3], EXTRA[0], EXTRA[1] ],
  7: [ CORE[0], CORE[1], CORE[2], CORE[3], EXTRA[0], EXTRA[1], EXTRA[2] ],
};

interface KInsight {
  label: string;
  labelColor: string;
  grade: 'poor' | 'low' | 'ok' | 'good' | 'best';
  inertia: number;
  silhouette: number;
  note: string;
  useCase: string;
}

const K_INSIGHTS: Record<number, KInsight> = {
  2: { label: 'Too broad',      labelColor: '#dc2626', grade: 'poor', inertia: 185, silhouette: 2, note: 'Only VIP and Loyal. At Risk and Lost missing — major loss of granularity.', useCase: 'Ultra-simple A/B campaigns only' },
  3: { label: 'Minimal viable', labelColor: '#f97316', grade: 'low',  inertia: 130, silhouette: 3, note: 'VIP, Loyal, At Risk. Lost missing — churned customers invisible.', useCase: 'CRM teams with limited resources' },
  4: { label: 'Recommended ✓',  labelColor: '#059669', grade: 'best', inertia: 100, silhouette: 4, note: 'Elbow method. The 4 core segments: VIP · Loyal · At Risk · Lost.', useCase: 'The vast majority of retail use cases' },
  5: { label: 'Fine-grained',   labelColor: '#2563eb', grade: 'good', inertia: 82,  silhouette: 4, note: 'Adds Ultra VIP — isolates the top 1% of best customers.', useCase: 'Premium retail with high top-customer revenue' },
  6: { label: 'Detailed',       labelColor: '#7c3aed', grade: 'ok',   inertia: 70,  silhouette: 3, note: 'Adds Ultra VIP + Promising — identifies growing customers.', useCase: 'Marketplaces with diverse catalogue' },
  7: { label: 'Very detailed',  labelColor: '#d97706', grade: 'ok',   inertia: 62,  silhouette: 3, note: 'All active segments: VIP → Lost + Ultra VIP + Promising + Inactive.', useCase: 'Retailers with customer base >50K' },
};

const ELBOW_H: Record<number, number> = { 2: 96, 3: 76, 4: 54, 5: 41, 6: 33, 7: 28 };

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-params',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './params.component.html',
  styleUrls: ['./params.component.scss']
})
export class ParamsComponent implements OnDestroy {
  protected readonly data = inject(DataService);
  protected readonly api  = inject(ApiService);
  protected readonly Math = Math;
  protected readonly ELBOW_H = ELBOW_H;

  kOptions  = [2, 3, 4, 5, 6, 7];
  selectedK = signal<number>(4);

  // ── Aliases to singleton signals in DataService ─────────────────────────────
  // These signals survive navigation since they live in the service.
  get status()        { return this.data.applyStatus; }
  get progress()      { return this.data.applyProgress; }
  get isMock()        { return this.data.applyIsMock; }
  get errorMsg()      { return this.data.applyErrorMsg; }
  get appliedK()      { return this.data.appliedK; }
  get progressLabel() { return this.data.applyProgressLabel; }

  constructor() {
    // Initialize selectedK from the service's current state
    this.selectedK.set(this.data.appliedK());
  }

  currentK        = computed(() => this.data.appliedK());
  currentSegments = computed(() => K_SEGMENTS[this.currentK()] ?? K_SEGMENTS[4]);
  segmentNames    = computed(() => this.currentSegments().map(s => s.name).join(' · '));
  previewSegments = computed(() => K_SEGMENTS[this.selectedK()] ?? K_SEGMENTS[4]);
  insight         = computed(() => K_INSIGHTS[this.selectedK()]);

  removedSegments = computed(() => {
    if (this.selectedK() >= this.currentK()) return [];
    const kept = new Set(this.previewSegments().map(s => s.id));
    return (K_SEGMENTS[this.currentK()] ?? []).filter(s => !kept.has(s.id));
  });

  // ── Export ────────────────────────────────────────────────────────────────
  exportingKey   = signal<string | null>(null);
  exportStatus   = signal<'idle' | 'success' | 'error'>('idle');
  exportErrorMsg = signal<string>('');
  lastExported   = signal<string | null>(null);
  private _exportStatusTimer: ReturnType<typeof setTimeout> | null = null;

  readonly exportCollections = [
    { key: 'customers', name: 'Customers (ML Features)', desc: 'All customers with K-Means features and segment',   endpoint: '/api/customers/download', filename: 'customers_segments.csv', icon: '👤', color: '#7c3aed', bg: 'rgba(124,58,237,.1)' },
    { key: 'sample',    name: 'PCA Sample',              desc: '1,000 PCA points for segment visualization',   endpoint: '/api/sample/download',    filename: 'sample_segments.csv',   icon: '🔬', color: '#2563eb', bg: 'rgba(37,99,235,.1)'  },
    { key: 'offers',    name: 'Offers / Promotions',     desc: '1,578 promo codes with type, value and usage', endpoint: '/api/offers',             filename: 'offers.csv',            icon: '🎁', color: '#059669', bg: 'rgba(5,150,105,.1)'  },
  ];

  async exportCollection(col: { key: string; endpoint: string; filename: string }): Promise<void> {
    this.exportingKey.set(col.key);
    this.exportErrorMsg.set('');
    try {
      const res = await fetch(col.endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') ?? '';
      let blob: Blob;
      if (ct.includes('json')) {
        const data: Record<string, unknown>[] = await res.json();
        blob = this._jsonToCsvBlob(data);
      } else {
        blob = await res.blob();
      }
      this._triggerDownload(blob, col.filename);
      this.lastExported.set(col.key);
      this._setExportSuccess();
    } catch (err: unknown) {
      this._setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      this.exportingKey.set(null);
    }
  }

  async exportAll(): Promise<void> {
    this.exportingKey.set('__all__');
    this.exportErrorMsg.set('');
    let hasError = false;
    for (const col of this.exportCollections) {
      try {
        const res = await fetch(col.endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${col.filename}`);
        const ct = res.headers.get('content-type') ?? '';
        let blob: Blob;
        if (ct.includes('json')) {
          const data: Record<string, unknown>[] = await res.json();
          blob = this._jsonToCsvBlob(data);
        } else {
          blob = await res.blob();
        }
        this._triggerDownload(blob, col.filename);
        this.lastExported.set(col.key);
        await new Promise(r => setTimeout(r, 400));
      } catch (err: unknown) {
        hasError = true;
        this.exportErrorMsg.set(err instanceof Error ? err.message : String(err));
      }
    }
    this.exportingKey.set(null);
    if (!hasError) this._setExportSuccess(); else this.exportStatus.set('error');
  }

  private _jsonToCsvBlob(rows: Record<string, unknown>[]): Blob {
    if (!rows.length) return new Blob([''], { type: 'text/csv' });
    const keys = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))];
    return new Blob([lines.join('\n')], { type: 'text/csv' });
  }

  private _triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private _setExportSuccess(): void {
    this.exportStatus.set('success');
    if (this._exportStatusTimer) clearTimeout(this._exportStatusTimer);
    this._exportStatusTimer = setTimeout(() => {
      this.exportStatus.set('idle');
      this.lastExported.set(null);
    }, 3000);
  }

  private _setExportError(msg: string): void {
    this.exportStatus.set('error');
    this.exportErrorMsg.set(msg);
  }

  getSegDots(k: number): SegmentDef[] { return K_SEGMENTS[k] ?? []; }

  elbowLinePoints(): string {
    const W = 280, H = 90, n = this.kOptions.length;
    const stepW = W / n;
    return this.kOptions.map((k, i) => {
      const x = stepW * i + stepW / 2;
      const y = H * (1 - ELBOW_H[k] / 100);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  elbowDots(): { x: number; y: number; active: boolean }[] {
    const W = 280, H = 90, n = this.kOptions.length;
    const stepW = W / n;
    return this.kOptions.map((k, i) => ({
      x: stepW * i + stepW / 2,
      y: H * (1 - ELBOW_H[k] / 100),
      active: k === this.selectedK(),
    }));
  }

  selectK(k: number): void {
    this.selectedK.set(k);
    // Reset status only if not currently loading
    if (this.data.applyStatus() !== 'loading') {
      this.data.applyStatus.set('idle');
    }
  }

  /**
   * Delegates the operation to DataService (singleton).
   * The operation continues even if the user navigates to another page.
   */
  applyConfig(): void {
    this.data.applyConfig(this.selectedK(), this.data.featureImportance().length);
  }

  ngOnDestroy(): void {
    // The progress timer now lives in DataService — do not cancel it here.
    // Only the export timer (local to this component) needs to be cleaned up.
    if (this._exportStatusTimer) clearTimeout(this._exportStatusTimer);
  }
}