// src/app/core/services/campaign.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVICE PARTAGÉ : Campaign Bridge (Chatbot → Campaigns Page)
//
// Ce service est le pont entre le chatbot et la page Campaigns.
// Quand le chatbot exécute une action "create_campaign", il pousse la campagne
// ici via pushFromChatbot(). La page Campaigns s'abonne au signal pendingFromChatbot
// pour absorber automatiquement la nouvelle campagne dans sa liste.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, signal } from '@angular/core';

export interface CampaignPayload {
  id:          string;
  segment:     string;
  channel:     string;
  subject?:    string;
  body?:       string;
  discount?:   string;
  status:      'pending';
  created_at:  string;
  created_by:  string;
  recipients?: number;
  source:      'chatbot';   // marqueur d'origine
}

const LS_PENDING_KEY = 'siq_chatbot_pending_campaign';

@Injectable({ providedIn: 'root' })
export class CampaignService {

  /** Campagne créée par le chatbot, en attente d'être absorbée par la page */
  readonly pendingFromChatbot = signal<CampaignPayload | null>(this._loadPendingFromStorage());

  /**
   * Appelé par le chatbot lors de l'exécution d'une action create_campaign.
   * Génère un ID temporaire si le backend ne le retourne pas encore.
   */
  pushFromChatbot(params: {
    segment?:  string;
    channel?:  string;
    subject?:  string;
    body?:     string;
    discount?: string;
    count?:    number;
  }): CampaignPayload {
    const payload: CampaignPayload = {
      id:          `chatbot-${Date.now()}`,
      segment:     params.segment  ?? 'All customers',
      channel:     params.channel  ?? 'email',
      subject:     params.subject,
      body:        params.body,
      discount:    params.discount,
      status:      'pending',
      created_at:  new Date().toISOString(),
      created_by:  'AI Chatbot',
      recipients:  params.count,
      source:      'chatbot',
    };
    // Persist to localStorage so it survives component recreation on navigation
    try { localStorage.setItem(LS_PENDING_KEY, JSON.stringify(payload)); } catch {}
    this.pendingFromChatbot.set(payload);
    return payload;
  }

  /** Appelé par la page Campaigns après avoir absorbé la campagne */
  clearPending(): void {
    try { localStorage.removeItem(LS_PENDING_KEY); } catch {}
    this.pendingFromChatbot.set(null);
  }

  private _loadPendingFromStorage(): CampaignPayload | null {
    try {
      const raw = localStorage.getItem(LS_PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}