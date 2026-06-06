// src/app/core/services/notification.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { DataService } from './data.service';

export type NotifCategory = 'alert' | 'insight' | 'action' | 'system';
export type NotifPriority = 'high' | 'medium' | 'low';

export interface SmartNotification {
  id: string;
  title: string;
  message: string;
  category: NotifCategory;
  priority: NotifPriority;
  time: Date;
  read: boolean;
  actionLabel?: string;
  actionPage?: string;
  icon: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private readonly _notifications = signal<SmartNotification[]>([]);
  private _generated = false;

  readonly notifications = this._notifications.asReadonly();

  readonly unreadCount = computed(() =>
    this._notifications().filter(n => !n.read).length
  );

  readonly hasHigh = computed(() =>
    this._notifications().some(n => n.priority === 'high' && !n.read)
  );

  constructor(private data: DataService) {
    this._watchDataAndGenerate();
  }

  private _watchDataAndGenerate(): void {
    const interval = setInterval(() => {
      if (!this.data.loading() && !this._generated) {
        clearInterval(interval);
        this._generated = true;
        this._generateSmartNotifications();
      }
    }, 300);
  }

  private _generateSmartNotifications(): void {
    const notifs: SmartNotification[] = [];
    const now = new Date();

    const totalCustomers = this.data.totalCustomers();
    const segments = this.data.segments();
    const yoyPct = this.data.yoyPct();
    const counts = this.data.segmentCounts();

    const atRiskSeg = segments.find(s => s.name?.toLowerCase().includes('at risk'));
    const lostSeg   = segments.find(s => s.name?.toLowerCase().includes('lost'));

    if (atRiskSeg && counts[atRiskSeg.id]) {
      const pct = Math.round(counts[atRiskSeg.id] / totalCustomers * 100);
      if (pct >= 15) {
        notifs.push({
          id: 'at-risk-high',
          title: 'At-Risk Segment Alert',
          message: `${pct}% of your customers (${counts[atRiskSeg.id].toLocaleString()}) are at risk of churning. Immediate action recommended.`,
          category: 'alert',
          priority: pct >= 25 ? 'high' : 'medium',
          time: new Date(now.getTime() - 5 * 60000),
          read: false,
          actionLabel: 'View Segments',
          actionPage: 'segments',
          icon: '⚠️',
        });
      }
    }

    if (lostSeg && counts[lostSeg.id]) {
      const pct = Math.round(counts[lostSeg.id] / totalCustomers * 100);
      if (pct >= 10) {
        notifs.push({
          id: 'lost-seg',
          title: 'Lost Customers Rising',
          message: `${pct}% of customers classified as lost (${counts[lostSeg.id].toLocaleString()} total). Consider a win-back campaign.`,
          category: 'action',
          priority: 'high',
          time: new Date(now.getTime() - 12 * 60000),
          read: false,
          actionLabel: 'Create Campaign',
          actionPage: 'campaigns',
          icon: '🔴',
        });
      }
    }

    const vipSeg = segments.find(s => s.name?.toLowerCase().includes('vip'));
    if (vipSeg) {
      const revShare = this.data.getSegRevPct(vipSeg.id);
      if (revShare >= 40) {
        notifs.push({
          id: 'vip-revenue',
          title: 'VIP Revenue Concentration',
          message: `VIPs contribute ${revShare}% of total revenue. High dependency — consider loyalty programs to protect this segment.`,
          category: 'insight',
          priority: 'medium',
          time: new Date(now.getTime() - 30 * 60000),
          read: false,
          actionLabel: 'View Report',
          actionPage: 'report',
          icon: '👑',
        });
      }
    }

    if (yoyPct !== null) {
      if (yoyPct < 0) {
        notifs.push({
          id: 'yoy-negative',
          title: 'Revenue Decline Detected',
          message: `Year-over-year revenue is down ${Math.abs(yoyPct)}%. Review behavioral patterns to identify root causes.`,
          category: 'alert',
          priority: 'high',
          time: new Date(now.getTime() - 60 * 60000),
          read: false,
          actionLabel: 'Analyze Behavior',
          actionPage: 'behavior',
          icon: '📉',
        });
      } else if (yoyPct > 100) {
        notifs.push({
          id: 'yoy-strong',
          title: 'Strong Growth Momentum',
          message: `Revenue grew +${yoyPct}% year-over-year. Identify your top-performing segments to double down.`,
          category: 'insight',
          priority: 'low',
          time: new Date(now.getTime() - 2 * 3600000),
          read: false,
          actionLabel: 'See Dashboard',
          actionPage: 'dashboard',
          icon: '📈',
        });
      }
    }

    const cats = this.data.categoryRevenue();
    if (cats.length > 0 && cats[0].pct >= 50) {
      notifs.push({
        id: 'category-concentration',
        title: 'Category Concentration Risk',
        message: `"${cats[0].name}" drives ${cats[0].pct}% of revenue. Diversification could reduce business risk.`,
        category: 'insight',
        priority: 'low',
        time: new Date(now.getTime() - 4 * 3600000),
        read: true,
        actionLabel: 'View Feature',
        actionPage: 'category-affinity',
        icon: '🏷️',
      });
    }

    notifs.push({
      id: 'data-loaded',
      title: 'Data Refreshed',
      message: `All ${totalCustomers.toLocaleString()} customer records loaded and segmentation model is up to date.`,
      category: 'system',
      priority: 'low',
      time: new Date(now.getTime() - 10000),
      read: true,
      icon: '✅',
    });

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notifs.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority];
      return b.time.getTime() - a.time.getTime();
    });

    this._notifications.set(notifs);
  }

  markRead(id: string): void {
    this._notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }

  markAllRead(): void {
    this._notifications.update(list => list.map(n => ({ ...n, read: true })));
  }

  dismiss(id: string): void {
    this._notifications.update(list => list.filter(n => n.id !== id));
  }

  timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
