import { Component, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { NavService } from '../../core/services/nav.service';

@Component({
  selector: 'app-segments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './segments.component.html',
  styleUrls: ['./segments.component.scss']
})
export class SegmentsComponent implements AfterViewInit {
  constructor(public data: DataService, public nav: NavService) {}

  ngAfterViewInit(): void {
    const id = this.nav.targetSegmentId();
    if (id !== null) {
      setTimeout(() => {
        const el = document.getElementById('seg-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => this.nav.clearTargetSegment(), 1600);
      }, 120);
    }
  }

  sharePct(segId: number): string {
    const total = this.data.totalCustomers();
    const n = this.data.segmentCounts()[segId];
    if (!total || !n) return '0.0';
    return (n / total * 100).toFixed(1);
  }

  /**
   * 6 KPIs — all values come directly from the backend (segments_agg).
   *
   * Displayed AOV = avg_spend / avg_orders (ratio of segment averages).
   * Why not avg_aov from the backend?
   *   avg_aov = mean(total_spend_i / order_count_i) — mean of fractions,
   *   biased by customers with very few orders.
   *   avg_spend / avg_orders = AOV representative of the segment's average behavior.
   */
  getKpis(segId: number): any[] {
    const a = this.data.agg()[segId];
    if (!a) return [];

    // Segment's real AOV: average spend / average orders
    const segAov = a.avg_orders > 0
      ? a.avg_spend / a.avg_orders
      : 0;

    const recColor = a.avg_recency < 30  ? '#059669'
                   : a.avg_recency < 90  ? '#e07820'
                   : '#dc2626';

    const retColor = a.avg_return_rate < 0.05 ? '#059669'
                   : a.avg_return_rate < 0.15 ? '#e07820'
                   : '#dc2626';

    return [
      { label: 'Avg Spend',     value: a.avg_spend.toFixed(0) + ' KWD' },
      { label: 'AOV',           value: segAov.toFixed(2) + ' KWD' },
      { label: 'Avg Orders',    value: a.avg_orders.toFixed(1) },
      { label: 'Recency',       value: a.avg_recency + 'd',                   color: recColor },
      { label: 'Return Rate',   value: (a.avg_return_rate * 100).toFixed(1) + '%', color: retColor },
      { label: 'Active Months', value: a.avg_active_months.toFixed(1) + 'mo' },
    ];
  }

  getRevKwd(segId: number): string {
    const rev = this.data.getSegRevenue(segId);
    if (!rev) return '0';
    return rev >= 1_000_000
      ? (rev / 1_000_000).toFixed(2) + 'M'
      : (rev / 1_000).toFixed(0) + 'K';
  }

  getRevPct(segId: number): number {
    return this.data.getSegRevPct(segId);
  }

  getTopCats(segId: number): { name: string; pct: number }[] {
    const cats = this.data.agg()[segId]?.cats ?? {};
    return Object.entries(cats)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, pct]) => ({ name, pct: pct as number }));
  }
}