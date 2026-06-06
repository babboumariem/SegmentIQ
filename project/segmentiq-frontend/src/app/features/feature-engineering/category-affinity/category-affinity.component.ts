import { FE_STYLES, drawBar } from '../fe-shared';
import {
  Component, AfterViewInit, ViewChildren, QueryList,
  ElementRef, HostListener, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../core/services/data.service';
import { ChartService } from '../../../core/services/chart.service';

@Component({
  selector: 'app-category-affinity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './category-affinity.component.html',
  styleUrls: ['./category-affinity.component.scss']
})
export class Fe53Component implements AfterViewInit {
  @ViewChildren('divCanvas')  dc!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('top3Canvas') t3!: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(public data: DataService, private charts: ChartService) {
    effect(() => {
      const segs = this.data.segments();
      const agg  = this.data.agg();
      const loading = this.data.loading();
      if (!loading && segs.length && Object.keys(agg).length) {
        setTimeout(() => this.draw(), 80);
      }
    });
  }

  ngAfterViewInit(): void { setTimeout(() => this.draw(), 150); setTimeout(() => this.draw(), 400); }
  @HostListener('window:resize') onResize(): void { this.draw(); }

  draw(): void {
    const segs = this.data.segments(), agg = this.data.agg();
    if (!segs.length || !Object.keys(agg).length) return;
    const names  = segs.map(s => s.name);
    const colors = segs.map(s => s.color);

    // Chart 1: diversity score %
    drawBar(this.dc.first?.nativeElement, segs.map(s => (agg[s.id]?.avg_diversity ?? 0) * 100), colors, names, false, 'Diversity %', 'Segment', '%');

    // Chart 2: top-3 concentration (sum of top 3 category shares per segment)
    drawBar(this.t3.first?.nativeElement, segs.map(s => this.getTop3Share(s.id)), colors, names, false, 'Concentration %', 'Segment', '%');

    this._drawDonuts();
  }

  // ── Donut arc gauge drawn on each segment card ─────────────────────────────
  private _drawDonuts(): void {
    document.querySelectorAll<HTMLCanvasElement>('canvas.donut-canvas').forEach(el => {
      const pct   = Number(el.dataset['pct'] ?? 0);
      const color = el.dataset['color'] ?? '#059669';
      const ctx   = el.getContext('2d');
      if (!ctx) return;
      const cx = el.width / 2, cy = el.height / 2, r = el.width * 0.38;
      ctx.clearRect(0, 0, el.width, el.height);
      // Background arc (grey track)
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.8, Math.PI * 0.8);
      ctx.strokeStyle = 'rgba(128,128,128,0.13)';
      ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
      // Filled arc (value)
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.8, -Math.PI * 0.8 + (pct / 100) * Math.PI * 1.6);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
      // Center label
      ctx.fillStyle = color;
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pct + '%', cx, cy);
      ctx.textBaseline = 'alphabetic';
    });
  }

  // ── Diversity helpers ──────────────────────────────────────────────────────
  getDiversityPct(id: number): number {
    return Math.round((this.data.agg()[id]?.avg_diversity ?? 0) * 100);
  }

  getDiversityColor(id: number): string {
    const pct = this.getDiversityPct(id);
    return pct >= 60 ? '#10b981' : pct >= 35 ? '#e07820' : '#ef4444';
  }

  getDiversityLabel(id: number): string {
    const pct = this.getDiversityPct(id);
    return pct >= 60 ? 'Generalist' : pct >= 35 ? 'Moderate' : 'Specialist';
  }

  getAffinityProfile(id: number): string {
    const top3 = this.getTop3Share(id);
    if (top3 >= 85) return '🎯 Specialist';
    if (top3 >= 65) return '🔀 Focused';
    return '🌈 Diverse';
  }

  // ── Category data ──────────────────────────────────────────────────────────
  // Returns top 3 categories sorted by share descending
  getTopCats(id: number): { name: string; pct: number }[] {
    const cats = this.data.agg()[id]?.cats ?? {};
    return Object.entries(cats)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([name, pct]) => ({ name, pct: Number(pct) }));
  }

  // Sum of top-3 category shares = concentration score (opposite of diversity)
  getTop3Share(id: number): number {
    return this.getTopCats(id).reduce((s, c) => s + c.pct, 0);
  }

  getCatPct(segId: number, catName: string): number {
    return this.data.agg()[segId]?.cats?.[catName] ?? 0;
  }

  getAvgCatPct(catName: string): number {
    const segs = this.data.segments();
    if (!segs.length) return 0;
    const sum = segs.reduce((s, sg) => s + (this.data.agg()[sg.id]?.cats?.[catName] ?? 0), 0);
    return Math.round(sum / segs.length);
  }

  // ── Heatmap cell colors ────────────────────────────────────────────────────
  // Intensity = this segment's pct relative to the best segment for that category
  getHeatBg(segId: number, catName: string, color: string): string {
    const pct    = this.getCatPct(segId, catName);
    const maxPct = Math.max(...this.data.segments().map(s => this.getCatPct(s.id, catName))) || 1;
    const intensity = pct / maxPct;
    if (intensity < 0.15) return 'var(--bg2)';
    const alpha = Math.round(intensity * 35).toString(16).padStart(2, '0');
    return color + alpha;
  }

  getHeatFg(segId: number, catName: string): string {
    const pct    = this.getCatPct(segId, catName);
    const maxPct = Math.max(...this.data.segments().map(s => this.getCatPct(s.id, catName))) || 1;
    return pct / maxPct >= 0.7 ? 'var(--tx)' : 'var(--t2)';
  }

  // ── All categories sorted by total volume across segments ──────────────────
  get crossCats(): { name: string }[] {
    const all = new Set<string>();
    this.data.segments().forEach(s =>
      Object.keys(this.data.agg()[s.id]?.cats ?? {}).forEach(c => all.add(c))
    );
    return Array.from(all)
      .sort((a, b) => {
        const sumA = this.data.segments().reduce((s, sg) => s + (this.data.agg()[sg.id]?.cats?.[a] ?? 0), 0);
        const sumB = this.data.segments().reduce((s, sg) => s + (this.data.agg()[sg.id]?.cats?.[b] ?? 0), 0);
        return sumB - sumA;
      })
      .map(name => ({ name }));
  }

  // ── Global header stats ────────────────────────────────────────────────────
  get dominantCategory(): string {
    const totals: Record<string, number> = {};
    this.data.segments().forEach(s => {
      const cats = this.data.agg()[s.id]?.cats ?? {};
      Object.entries(cats).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + Number(v); });
    });
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0].slice(0, 10) : '—';
  }

  get avgDiversity(): string {
    const segs = this.data.segments(), agg = this.data.agg();
    if (!segs.length) return '—';
    const avg = segs.reduce((s, sg) => s + (agg[sg.id]?.avg_diversity ?? 0), 0) / segs.length;
    return (avg * 100).toFixed(0);
  }
}