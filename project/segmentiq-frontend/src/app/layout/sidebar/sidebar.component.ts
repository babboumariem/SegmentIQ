// src/app/layout/sidebar/sidebar.component.ts
import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavService } from '../../core/services/nav.service';
import { NavPage } from '../../core/models/segment.model';
import { DataService } from '../../core/services/data.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  @Input() role: 'admin' | 'analyst' = 'analyst';
  @Output() logout = new EventEmitter<void>();
  campaignCount = 0;

  constructor(public nav: NavService, public data: DataService) {}

  ngOnInit(): void { this.loadCampaignCount(); }

  async loadCampaignCount(): Promise<void> {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const d = await res.json();
        this.campaignCount = (d.campaigns ?? []).filter((c: any) => c.status === 'pending').length;
      }
    } catch {}
  }

  get isAdmin(): boolean { return this.role === 'admin'; }
  go(page: NavPage): void { this.nav.navigate(page); }

  /** Returns feature count label for FE nav items.
   *  Uses actual featureImportance total divided across sections,
   *  or falls back to the static default. */
  feCount(sectionIndex: number, fallback: number): number | string {
    const total = this.data.featureImportance().length;
    if (!total) return fallback;
    // Distribute total features across 5 sections proportionally
    const weights = [6, 6, 5, 4, 5]; // spending, freq, cat, season, discount
    const wSum = weights.reduce((a, b) => a + b, 0);
    return Math.round(total * weights[sectionIndex] / wSum) || fallback;
  }
}