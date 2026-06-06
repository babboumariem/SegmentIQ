// src/app/core/services/nav.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { NavPage } from '../models/segment.model';

interface PageConfig {
  crumb: string;
  title: string;
}

const PAGE_CONFIGS: Record<NavPage, PageConfig> = {
  dashboard:          { crumb: 'SegmentIQ / Overview',              title: 'Dashboard'               },
  segments:           { crumb: 'SegmentIQ / Segmentation',          title: 'Customer Segments'        },
  customers:          { crumb: 'SegmentIQ / Data',                  title: 'Customer Explorer'        },
  report:             { crumb: 'SegmentIQ / Analysis',              title: 'Segment Report'           },
  behavior:           { crumb: 'SegmentIQ / Analysis',              title: 'Behavioral Analysis'      },
  params:             { crumb: 'SegmentIQ / Config',                title: 'Model Parameters'         },
  'spending-value':   { crumb: 'SegmentIQ / Feature Engineering',   title: 'Spending & Value'         },
  frequency:          { crumb: 'SegmentIQ / Feature Engineering',   title: 'Frequency & Recency'      },
  'category-affinity':{ crumb: 'SegmentIQ / Feature Engineering',   title: 'Category Affinity'        },
  seasonality:        { crumb: 'SegmentIQ / Feature Engineering',   title: 'Seasonality'              },
  'price-discount':   { crumb: 'SegmentIQ / Feature Engineering',   title: 'Price & Discount'         },
  returns:            { crumb: 'SegmentIQ / Feature Engineering',   title: 'Returns & Refunds'        },
  normalization:      { crumb: 'SegmentIQ / Feature Engineering',   title: 'Normalisation'            },
  campaigns:          { crumb: 'SegmentIQ / Actions',               title: 'Campaigns'                },
};

@Injectable({ providedIn: 'root' })
export class NavService {

  private readonly _current           = signal<NavPage>('dashboard');
  private readonly _targetSegmentId   = signal<number | null>(null);

  readonly current          = this._current.asReadonly();
  readonly currentConfig    = computed(() => PAGE_CONFIGS[this._current()]);
  readonly targetSegmentId  = this._targetSegmentId.asReadonly();

  navigate(page: NavPage): void {
    this._current.set(page);
    try { localStorage.setItem('siq_page', page); } catch {}
    this._scrollToTop();
  }

  navigateToSegment(segmentId: number): void {
    this._targetSegmentId.set(segmentId);
    this._current.set('segments');
    try { localStorage.setItem('siq_page', 'segments'); } catch {}
    this._scrollToTop();
  }

  private _scrollToTop(): void {
    const el = document.querySelector('.page-content');
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  clearTargetSegment(): void {
    this._targetSegmentId.set(null);
  }

  isActive(page: NavPage): boolean {
    return this._current() === page;
  }
}