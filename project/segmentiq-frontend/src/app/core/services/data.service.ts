// src/app/core/services/data.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { SegmentMeta, SegmentAgg, SamplePoint, SummaryData } from '../models/segment.model';

// ── Segment definitions (UI metadata only — names, icons, colors, descriptions) ─
// These are NOT data sources. They are purely visual decorators applied on top
// of real backend counts and aggregations. No numbers here.
const SEG_ALL = [
  { id: 0, name: 'VIP',       icon: '👑', color: '#f59e0b', colorBg: 'rgba(245,158,11,.12)',  description: 'High-spend, high-frequency buyers with very recent activity.' },
  { id: 1, name: 'Loyal',     icon: '💚', color: '#10b981', colorBg: 'rgba(16,185,129,.12)',  description: 'Regular buyers with consistent engagement and strong LTV.' },
  { id: 2, name: 'At Risk',   icon: '⚠️', color: '#8b5cf6', colorBg: 'rgba(139,92,246,.12)',  description: 'Previously active customers drifting away — re-engagement needed.' },
  { id: 3, name: 'Lost',      icon: '💤', color: '#ef4444', colorBg: 'rgba(239,68,68,.12)',   description: 'Low spend, high recency, very infrequent. High churn risk.' },
  { id: 4, name: 'Ultra VIP', icon: '💎', color: '#ec4899', colorBg: 'rgba(236,72,153,.12)',  description: 'Top 1% by spend — extreme frequency, highest AOV.' },
  { id: 5, name: 'Promising', icon: '🌱', color: '#3b82f6', colorBg: 'rgba(59,130,246,.12)',  description: 'Growing customers with increasing spend and engagement.' },
  { id: 6, name: 'Inactive',  icon: '😴', color: '#f97316', colorBg: 'rgba(249,115,22,.12)',  description: 'Long-dormant customers — no recent purchases.' },
];

const K_SEG_MAP: Record<number, typeof SEG_ALL> = {
  2: SEG_ALL.slice(0, 2),
  3: SEG_ALL.slice(0, 3),
  4: SEG_ALL.slice(0, 4),
  5: SEG_ALL.slice(0, 5),
  6: SEG_ALL.slice(0, 6),
  7: SEG_ALL.slice(0, 7),
};

function colorBgFromHex(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    return `rgba(${r},${g},${b},.12)`;
  }
  return 'rgba(107,114,128,.12)';
}

// ── Progress steps for apply animation ───────────────────────────────────────
const PROGRESS_STEPS = [
  { pct: 18, label: 'Loading customer data…' },
  { pct: 38, label: 'StandardScaler normalization…' },
  { pct: 60, label: 'Training K-Means…' },
  { pct: 78, label: 'Computing RFM metrics…' },
  { pct: 90, label: 'Updating segments…' },
  { pct: 98, label: 'Finalizing…' },
];

@Injectable({ providedIn: 'root' })
export class DataService {

  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  // ── All signals populated exclusively from backend responses ─────────────
  private readonly _segments   = signal<SegmentMeta[]>([]);
  private readonly _agg        = signal<Record<number, SegmentAgg>>({});
  private readonly _sample     = signal<SamplePoint[]>([]);
  private readonly _actions    = signal<Record<number, string[]>>({});
  private readonly _summary    = signal<SummaryData>({} as SummaryData);
  private readonly _categories = signal<string[]>([]);
  private readonly _fi         = signal<{ feature: string; value: number }[]>([]);
  private readonly _segCounts  = signal<Record<number, number>>({});
  private readonly _pcaMeta    = signal<{
    explained_variance: number[];
    total_explained:    number;
    loadings:           { feature: string; pc1: number; pc2: number }[];
    n_features:         number;
  } | null>(null);

  // ── Active K — persisted in localStorage, no numeric default injected ────
  private readonly _activeK = signal<number>(
    (() => {
      const s = localStorage.getItem('segmentiq_k');
      const n = Number(s);
      return [2, 3, 4, 5, 6, 7].includes(n) ? n : 4;
    })()
  );

  readonly activeK           = this._activeK.asReadonly();
  readonly segments          = this._segments.asReadonly();
  readonly agg               = this._agg.asReadonly();
  readonly sample            = this._sample.asReadonly();
  readonly actions           = this._actions.asReadonly();
  readonly summary           = this._summary.asReadonly();
  readonly categories        = this._categories.asReadonly();
  readonly featureImportance = this._fi.asReadonly();
  readonly segmentCounts     = this._segCounts.asReadonly();
  readonly pcaMeta           = this._pcaMeta.asReadonly();

  // ── Apply-config state — singleton, survives navigation ──────────────────
  // These signals live in the root service and are NEVER destroyed
  // when the user navigates to another page. ParamsComponent reads them
  // as read-only; applyConfig() here is the only writer.
  readonly applyStatus      = signal<'idle' | 'loading' | 'success' | 'unavailable' | 'error'>('idle');
  readonly applyProgress    = signal<number>(0);
  readonly applyIsMock      = signal<boolean>(false);
  readonly applyErrorMsg    = signal<string>('');
  readonly appliedK         = signal<number>(
    (() => {
      const s = localStorage.getItem('segmentiq_k');
      const n = Number(s);
      return [2, 3, 4, 5, 6, 7].includes(n) ? n : 4;
    })()
  );

  readonly applyProgressLabel = computed(() => {
    const p = this.applyProgress();
    const step = PROGRESS_STEPS.slice().reverse().find(s => p >= s.pct - 20);
    return step?.label ?? 'Initializing…';
  });

  private _progressTimer: ReturnType<typeof setInterval> | null = null;

  // ── K management ─────────────────────────────────────────────────────────

  /**
   * Called by ParamsComponent after K is applied on the backend.
   * Updates only the visual segment metadata (names, icons, colors).
   * NEVER injects counts, agg, or any numeric values — those come from loadAll().
   */
  setActiveK(k: number): void {
    const defs = K_SEG_MAP[k] ?? K_SEG_MAP[4];
    this._activeK.set(k);
    localStorage.setItem('segmentiq_k', String(k));
    // Only update segment visual definitions — numeric signals stay as-is
    // until the next loadAll() call brings fresh backend data.
    this._segments.set(defs as any);
  }

  // ── Apply config — exécuté dans le service, survit à la navigation ────────
  /**
   * Triggers K-Means retraining. Can be called from ParamsComponent;
   * the user can navigate freely — the operation continues in the service.
   * Garde-fou : si un apply est déjà en cours, ignore le nouvel appel.
   */
  async applyConfig(selectedK: number, featureCount: number): Promise<void> {
    if (this.applyStatus() === 'loading') return;

    this.applyStatus.set('loading');
    this.applyErrorMsg.set('');
    this.applyIsMock.set(false);
    this._startProgress();

    try {
      const res = await fetch(`${this.api.base}/api/config/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          n_clusters:   selectedK,
          random_state: 42,
          n_init:       10,
          scaler:       'StandardScaler',
          features:     featureCount || 10,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.detail ?? `HTTP ${res.status}`);
      }
      this._stopProgress(true);
      this.appliedK.set(selectedK);
      this._activeK.set(selectedK);
      localStorage.setItem('segmentiq_k', String(selectedK));
      this.applyIsMock.set(false);
      this.applyStatus.set('success');
      await this.loadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkError =
        msg.includes('fetch') || msg.includes('Failed') ||
        msg.includes('NetworkError') || msg.includes('ECONNREFUSED') ||
        msg.includes('aborted') || msg.includes('abort') ||
        (err instanceof DOMException && (err as DOMException).name === 'AbortError');

      if (isNetworkError) {
        await this._runMockRetrain(selectedK);
      } else {
        this._stopProgress(false);
        this.applyErrorMsg.set(msg);
        this.applyStatus.set('error');
      }
    }
  }

  private async _runMockRetrain(selectedK: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 3_500));
    this._stopProgress(true);
    this.appliedK.set(selectedK);
    this._activeK.set(selectedK);
    this.setActiveK(selectedK);
    localStorage.setItem('segmentiq_k', String(selectedK));
    this.applyIsMock.set(true);
    this.applyStatus.set('success');
    try { await this.loadAll(); } catch {}
  }

  private _startProgress(): void {
    this.applyProgress.set(0);
    this._progressTimer = setInterval(() => {
      const cur = this.applyProgress();
      const inc = cur < 40 ? 3.5 : cur < 68 ? 2 : cur < 85 ? 1 : cur < 91 ? 0.4 : 0.15;
      this.applyProgress.set(Math.min(cur + inc, 92));
    }, 280);
  }

  private _stopProgress(success: boolean): void {
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    this.applyProgress.set(success ? 100 : 0);
  }

  // ── Sync appliedK from backend on startup ────────────────────────────────
  async loadCurrentK(): Promise<void> {
    try {
      const res = await fetch(`${this.api.base}/api/config`);
      if (res.ok) {
        const cfg = await res.json();
        const k = cfg?.n_clusters;
        if (k && [2, 3, 4, 5, 6, 7].includes(k)) {
          this._activeK.set(k);
          this.appliedK.set(k);
          localStorage.setItem('segmentiq_k', String(k));
          return;
        }
      }
    } catch { /* backend offline */ }
    const stored = localStorage.getItem('segmentiq_k');
    if (stored) {
      const k = Number(stored);
      if ([2, 3, 4, 5, 6, 7].includes(k)) {
        this._activeK.set(k);
        this.appliedK.set(k);
      }
    }
  }

  // ── Computed KPIs — 100% derived from backend signals ────────────────────

  readonly totalCustomers = computed(() =>
    Object.values(this._segCounts()).reduce((a, b) => a + b, 0)
  );

  /** Total Revenue from deduplicated PaymentLog on InvoiceId = 2,894,094 KD */
  readonly totalRevenue = computed(() =>
    this._summary()?.total_revenue ?? 0
  );

  /** Gross revenue = all orders including returned ones */
  readonly grossRevenue = computed(() => {
    const s = this._summary();
    return s?.gross_revenue ?? s?.total_revenue ?? 0;
  });

  /** Fulfilled orders only — returned order_ids excluded by backend */
  readonly totalFulfilledOrders = computed(() =>
    this._summary()?.total_fulfilled_orders ?? this._summary()?.total_orders ?? 0
  );

  /** True AOV = revenue / fulfilled orders, computed by backend */
  readonly overallAov = computed(() =>
    this._summary()?.true_aov ?? this._summary()?.avg_order_value ?? 0
  );

  /** Exact revenue per segment from backend summary */
  readonly revenueBySegment = computed(() =>
    this._summary()?.revenue_by_segment ?? {}
  );

  /** Exact revenue per category from backend — not approximated */
  readonly categoryRevenue = computed(() => {
    const raw = this._summary()?.category_revenue ?? {};
    const totalRev = Object.values(raw).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(raw)
      .sort((a, b) => b[1] - a[1])
      .map(([name, rev]) => ({
        name,
        rev: (rev / 1000).toFixed(0),
        bar: Math.round(rev / totalRev * 100),
        pct: Math.round(rev / totalRev * 100),
      }));
  });

  /** YoY growth % — computed by backend, null if insufficient history */
  readonly yoyPct = computed(() => this._summary()?.yoy_pct ?? null);

  /** Formatted YoY string e.g. "+332%" or "—" */
  readonly yoyGrowthStr = computed(() => {
    const pct = this._summary()?.yoy_pct;
    if (pct === null || pct === undefined) return '—';
    return (pct >= 0 ? '+' : '') + pct + '%';
  });

  readonly yoyPositive = computed(() => {
    const pct = this._summary()?.yoy_pct;
    if (pct === null || pct === undefined) return true;
    return pct >= 0;
  });

  /** Data freshness date — ref_date field from backend */
  readonly refDate = computed(() => this._summary()?.ref_date ?? null);

  // ── Revenue helpers (exact backend values only) ───────────────────────────

  /** Returns segment revenue scaled to the true PaymentLog total */
  getSegRevenue(segId: number): number {
    const revBySeg = this._summary()?.revenue_by_segment ?? {};
    const rawSeg   = revBySeg[String(segId)] ?? 0;
    const segSum   = Object.values(revBySeg).reduce((a, b) => a + b, 0);
    if (!segSum) return 0;
    const trueTotal = this._summary()?.total_revenue ?? segSum;
    return rawSeg * (trueTotal / segSum);
  }

  getSegRevStr(segId: number): string {
    const v = this.getSegRevenue(segId);
    if (!v) return '0';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M KWD';
    return (v / 1_000).toFixed(0) + 'K KWD';
  }

  getSegRevPct(segId: number): number {
    const revBySeg = this._summary()?.revenue_by_segment ?? {};
    const tot = Object.values(revBySeg).reduce((a, b) => a + b, 0);
    if (!tot) return 0;
    const rawSeg = revBySeg[String(segId)] ?? 0;
    return Math.round(rawSeg / tot * 100);
  }

  // ── Monthly helpers — from backend agg and summary only ──────────────────

  monthlyArray(segId: number): number[] {
    const a = this._agg()[segId];
    if (!a?.monthly) return [];
    return Object.keys(a.monthly).sort().map(m => a.monthly[m]);
  }

  /** Returns % of segment customers who ordered each month (0–100).
   *  All segments share the same Y-axis scale → balanced line chart. */
  monthlyActivePctArray(segId: number): number[] {
    const a = this._agg()[segId] as any;
    if (!a?.monthly_active_pct) return this.monthlyArray(segId);
    return Object.keys(a.monthly_active_pct).sort().map(m => a.monthly_active_pct[m]);
  }

  monthlyTotalArray(): number[] {
    const s = this._summary();
    if (!s?.monthly_revenue) return [];
    return Object.keys(s.monthly_revenue).sort().map(m => s.monthly_revenue[m]);
  }

  monthlyLabels(segId: number): string[] {
    const a = this._agg()[segId];
    if (!a?.monthly) return [];
    const keys = Object.keys(a.monthly).sort();
    const multiYear = keys.length > 13;
    return keys.map(m => {
      const d = new Date(m + '-01');
      if (multiYear) {
        const mon = d.toLocaleDateString('en-GB', { month: 'short' });
        const yr  = String(d.getFullYear()).slice(2);
        // Show year only on January or first month
        return mon === 'Jan' ? `Jan '${yr}` : mon;
      }
      return d.toLocaleDateString('en-GB', { month: 'short' });
    });
  }

  monthlyTotalLabels(): string[] {
    const s = this._summary();
    if (!s?.monthly_revenue) return [];
    return Object.keys(s.monthly_revenue).sort().map(m => {
      const d = new Date(m + '-01');
      return d.toLocaleDateString('en-GB', { month: 'short' });
    });
  }

  // ── Core data loader ──────────────────────────────────────────────────────

  constructor(private api: ApiService) {
    this.loadAll();
    this.loadCurrentK();
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [rawSegsResp, rawAgg, rawSample, rawActions, rawSummary, rawCategories, rawFi, rawPcaMeta] =
        await Promise.all([
          this.get<any>(this.api.urls.segments),
          this.get<Record<string, any>>(this.api.urls.agg),
          this.get<SamplePoint[]>(this.api.urls.sample),
          this.get<Record<string, string[]>>(this.api.urls.actions),
          this.get<SummaryData>(this.api.urls.summary),
          this.get<string[]>(this.api.urls.categories),
          this.get<any[]>(this.api.urls.featureImportance),
          this.get<any>(this.api.urls['pcaMeta'] ?? `${this.api.base}/api/pca-meta`).catch(() => null),
        ]);

      // ── Segments: normalize backend response ──────────────────────────────
      const rawSegs: any[] = Array.isArray(rawSegsResp)
        ? rawSegsResp
        : (rawSegsResp?.segments ?? []);

      const segs: SegmentMeta[] = (rawSegs ?? []).map((s: any) => {
        const id        = Number(s.id);
        const canonical = SEG_ALL.find(d => d.id === id);
        // Replace generic backend names like "Segment 0" with canonical UI names
        const isGeneric = /^segment\s*\d+$/i.test((s.name ?? '').trim());
        const name      = (isGeneric || !s.name) ? (canonical?.name ?? s.name) : s.name;
        const icon      = s.icon    || canonical?.icon    || '🔵';
        const color     = s.color   || canonical?.color   || '#6b7280';
        const colorBg   = s.colorBg || canonical?.colorBg || colorBgFromHex(color);
        return {
          id,
          name,
          icon,
          color,
          colorBg,
          description: s.description ?? canonical?.description ?? '',
        };
      });
      this._segments.set(segs.sort((a, b) => a.id - b.id));

      // ── Aggregations: keyed by numeric segment id ─────────────────────────
      const agg: Record<number, SegmentAgg> = {};
      for (const [k, v] of Object.entries(rawAgg ?? {})) {
        agg[Number(k)] = v as SegmentAgg;
      }
      this._agg.set(agg);

      this._sample.set(rawSample ?? []);

      // ── Actions: keyed by numeric segment id ─────────────────────────────
      const actions: Record<number, string[]> = {};
      for (const [k, v] of Object.entries(rawActions ?? {})) {
        actions[Number(k)] = v as string[];
      }
      this._actions.set(actions);

      this._summary.set(rawSummary ?? ({} as SummaryData));
      this._categories.set(rawCategories ?? []);
      this._fi.set(rawFi ?? []);
      this._pcaMeta.set(rawPcaMeta ?? null);

      // ── Segment counts: from backend count field only ─────────────────────
      const counts: Record<number, number> = {};
      for (const s of rawSegs ?? []) {
        counts[Number(s.id)] = Number(s.count ?? 0);
      }
      // Secondary fallback: derive counts from PCA sample if all counts are 0
      // (sample is real backend data, just less precise than exact counts)
      if (Object.values(counts).every(v => v === 0) && rawSample?.length) {
        for (const p of rawSample) {
          counts[p.seg] = (counts[p.seg] ?? 0) + 1;
        }
      }
      this._segCounts.set(counts);

    } catch (err: any) {
      // ── Backend unreachable ───────────────────────────────────────────────
      // All numeric signals remain at their initial empty/zero state.
      // Only segment UI definitions (names, icons, colors) are populated so
      // the page structure renders — but every KPI card will show 0 / empty.
      // This guarantees no fabricated number ever appears as real business data.
      const msg = err?.message ?? 'Backend unreachable — please start the backend server.';
      this.error.set(msg);
      console.error('[DataService] loadAll error:', err);

      if (this._segments().length === 0) {
        const defs = K_SEG_MAP[this._activeK()] ?? K_SEG_MAP[4];
        this._segments.set(defs as any);
        // Counts and agg intentionally left empty — no mock numbers injected.
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    return res.json();
  }
}