// src/app/core/services/api.service.ts
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {

  readonly base = environment.apiUrl;

  readonly urls = {
    segments:          `${this.base}/api/segments`,
    agg:               `${this.base}/api/agg`,
    sample:            `${this.base}/api/sample`,
    actions:           `${this.base}/api/actions`,
    categories:        `${this.base}/api/categories`,
    featureImportance: `${this.base}/api/feature-importance`,
    pcaMeta:           `${this.base}/api/pca-meta`,
    summary:           `${this.base}/api/summary`,
    customers:         `${this.base}/api/customers`,
    orders:            `${this.base}/api/orders`,
    returns:           `${this.base}/api/returns`,
    products:          `${this.base}/api/products`,
    offers:            `${this.base}/api/offers`,
    offersStats:       `${this.base}/api/offers/stats`,
    countries:         `${this.base}/api/countries`,
    customSegments:    `${this.base}/api/segments/custom`,
    alerts:            `${this.base}/api/alerts`,
    campaigns:         `${this.base}/api/campaigns`,
    chatSessions:      `${this.base}/api/chat/sessions`,
    config:            `${this.base}/api/config`,
  };

  readonly csvUrls = {
    customers: `${this.base}/api/customers/download`,
    orders:    `${this.base}/api/orders/download`,
    returns:   `${this.base}/api/returns/download`,
    products:  `${this.base}/api/products/download`,
    sample:    `${this.base}/api/sample/download`,
  };

  // Helpers for parameterised requests
  customersUrl(opts: { limit?: number; offset?: number; region?: string; gender?: string; channel?: string; q?: string } = {}): string {
    const params = new URLSearchParams();
    if (opts.limit   != null) params.set('limit',   String(opts.limit));
    if (opts.offset  != null) params.set('offset',  String(opts.offset));
    if (opts.region)           params.set('region',  opts.region);
    if (opts.gender)           params.set('gender',  opts.gender);
    if (opts.channel)          params.set('channel', opts.channel);
    if (opts.q)                params.set('q',       opts.q);
    const qs = params.toString();
    return qs ? `${this.urls.customers}?${qs}` : this.urls.customers;
  }

  ordersUrl(opts: { limit?: number; customer_id?: string; category?: string; channel?: string } = {}): string {
    const params = new URLSearchParams();
    if (opts.limit       != null) params.set('limit',       String(opts.limit));
    if (opts.customer_id)          params.set('customer_id', opts.customer_id);
    if (opts.category)             params.set('category',    opts.category);
    if (opts.channel)              params.set('channel',     opts.channel);
    const qs = params.toString();
    return qs ? `${this.urls.orders}?${qs}` : this.urls.orders;
  }
}