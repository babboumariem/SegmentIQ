// src/app/features/chatbot/chatbot.component.ts
// ─────────────────────────────────────────────────────────────────
// CHATBOT ACTIONNABLE — The3Beez / SegmentIQ v5
// Nouvelles fonctionnalités :
//  • L'IA retourne du JSON structuré { message, action? }
//  • Chaque réponse peut contenir un bouton d'action contextuel
//  • 3 types d'actions : create_campaign, send_whatsapp, create_segment
//  • Modale de confirmation avant exécution
//  • Feedback inline dans le chat après action
// ─────────────────────────────────────────────────────────────────

import {
  Component, signal, computed,
  ViewChild, ElementRef,
  AfterViewChecked, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../core/services/data.service';
import { IntentService } from '../../core/services/intent.service';
import { NavService } from '../../core/services/nav.service';
import { CampaignService } from '../../core/services/campaign.service';

// ── Types ──────────────────────────────────────────────────────────────────

interface ActionParams {
  segment?:       string;
  channel?:       string;
  template?:      string;
  subject?:       string;
  body?:          string;
  discount?:      string;
  filter_label?:  string;
  count?:         number;
  [key: string]: any;
}

interface ChatAction {
  type:   'create_campaign' | 'send_whatsapp' | 'create_segment';
  label:  string;
  icon:   string;
  params: ActionParams;
}

interface ChatMessage {
  role:      'user' | 'assistant';
  content:   string;
  timestamp: Date;
  action?:   ChatAction;        // ← NOUVEAU : action optionnelle
  actionDone?: boolean;          // ← après exécution
}

interface QuickQuestion {
  label:    string;
  icon:     string;
  prompt:   string;
  category: string;
}

interface AlertNotification {
  _id?:          string;
  type:          string;
  severity:      'warning' | 'critical';
  segment:       string;
  current_pct:   number;
  baseline_pct:  number;
  delta:         number;
  threshold:     number;
  message:       string;
  recommendations: string[];
  status:        string;
  created_at:    string;
}

interface ChatSession {
  _id:        string;
  title:      string | null;
  created_at: string;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
  create_campaign: '🚀',
  send_whatsapp:   '💬',
  create_segment:  '🎯',
};

const ACTION_COLORS: Record<string, string> = {
  create_campaign: '#e07820',
  send_whatsapp:   '#22c55e',
  create_segment:  '#8b5cf6',
};

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector:    'app-chatbot',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss']
})
export class ChatbotComponent implements AfterViewChecked, OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('inputRef') inputRef!: ElementRef;

  isOpen          = signal(false);
  isExpanded      = signal(false);
  isLoading       = signal(false);
  messages        = signal<ChatMessage[]>([]);
  unreadCount     = signal(0);
  inputValue      = '';

  sessions        = signal<ChatSession[]>([]);
  sessionId       = signal<string | null>(null);
  showSessions    = signal(false);
  sessionsLoading = signal(false);

  activeAlerts    = signal<AlertNotification[]>([]);
  alertCount      = signal(0);
  showAlertPanel  = signal(false);
  alertChecking   = signal(false);
  private alertInterval: ReturnType<typeof setInterval> | null = null;

  // ── Modal ────────────────────────────────────────────────────────────────
  confirmModal    = signal<{ action: ChatAction; msgIndex: number } | null>(null);
  executingAction = signal(false);
  editingAction   = false;

  intentStats = signal({ total: 0, local: 0, api: 0 });

  quickQuestions: QuickQuestion[] = [
    { label: 'Segment overview with key numbers', icon: '📊', prompt: 'Give me a complete overview of all my customer segments with key metrics and numbers.', category: 'analytics' },
    { label: 'Who is at risk of churning?',       icon: '⚠️', prompt: 'Which customer segments are at risk of churning? What should I do to retain them?', category: 'retention' },
    { label: 'Launch a retention campaign',        icon: '🚀', prompt: 'Create a retention campaign for my At Risk segment — email + WhatsApp, with a 15% discount offer.', category: 'campaign' },
    { label: 'Best actions for each segment',      icon: '🎯', prompt: 'What are the most impactful marketing actions I should take for each customer segment?', category: 'marketing' },
    { label: 'VIP customer deep dive',             icon: '⭐', prompt: 'Give me a detailed analysis of my VIP customers — who they are, how they behave, and how to get more of them.', category: 'analytics' },
  ];

  contextualSuggestions: QuickQuestion[] = [
    { label: 'Convert regulars to VIP',    icon: '🚀', prompt: 'What is the best strategy to convert my regular customers into VIP? Give me a step-by-step plan.', category: 'growth' },
    { label: 'Win back inactive customers', icon: '🔄', prompt: 'How do I win back my inactive customers? Give me a concrete re-engagement plan.', category: 'retention' },
    { label: 'Compare all segments',        icon: '📈', prompt: 'Compare the performance of all my segments side by side.', category: 'analytics' },
    { label: 'Monthly action plan',         icon: '📅', prompt: 'Create a prioritized monthly action plan based on my current data.', category: 'planning' },
  ];

  suggestionsForContext = computed(() => {
    if (this.messages().length === 0) return [];
    return this.contextualSuggestions.slice(0, 4);
  });

  constructor(private data: DataService, private intent: IntentService, private nav: NavService, private campaignSvc: CampaignService) {}

  ngOnInit(): void {
    this.checkAlerts();
    this.alertInterval = setInterval(() => this.checkAlerts(), 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.alertInterval) clearInterval(this.alertInterval);
  }

  ngAfterViewChecked(): void { this.scrollToBottom(); }

  // ── UI actions ───────────────────────────────────────────────────────────

  toggleChat(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      this.unreadCount.set(0);
      this.loadSessions();
      setTimeout(() => this.inputRef?.nativeElement?.focus(), 150);
    }
  }

  toggleExpand(): void { this.isExpanded.update(v => !v); }
  toggleSessions(): void { this.showSessions.update(v => !v); if (this.showSessions()) this.loadSessions(); }
  toggleAlertPanel(): void { this.showAlertPanel.update(v => !v); if (this.showSessions()) this.showSessions.set(false); }

  newChat(): void { this.messages.set([]); this.sessionId.set(null); this.showSessions.set(false); }

  onEnterKey(event: KeyboardEvent): void {
    if (!event.shiftKey) { event.preventDefault(); this.sendMessage(); }
  }

  sendQuickQuestion(q: QuickQuestion): void { this.inputValue = q.prompt; this.sendMessage(q.prompt); }

  formatTime(date: Date): string { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  // ── Action helpers ───────────────────────────────────────────────────────

  getActionColor(type: string): string { return ACTION_COLORS[type] ?? '#6b7280'; }

  getParamEntries(params: ActionParams): { key: string; value: string }[] {
    const labels: Record<string, string> = {
      segment: 'Segment', channel: 'Channel', subject: 'Subject',
      body: 'Message', discount: 'Offer', filter_label: 'Filter', count: 'Audience',
    };
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => ({ key: labels[k] ?? k, value: String(v) }));
  }

  openConfirmModal(msg: ChatMessage, index: number): void {
    if (!msg.action) return;
    this.editingAction = false;
    this.confirmModal.set({ action: JSON.parse(JSON.stringify(msg.action)), msgIndex: index });
  }

  editAction(msg: ChatMessage, index: number): void {
    this.openConfirmModal(msg, index);
    this.editingAction = true;
  }

  closeModal(): void {
    if (!this.executingAction()) this.confirmModal.set(null);
  }

  async executeAction(): Promise<void> {
    const modal = this.confirmModal();
    if (!modal) return;

    this.executingAction.set(true);
    const { type, params } = modal.action;

    // ── Push the campaign into CampaignService IMMEDIATELY (before any fetch) ──
    // This ensures it's in localStorage before nav.navigate() recreates the component.
    if (type === 'create_campaign') {
      this.campaignSvc.pushFromChatbot({
        segment:  params.segment,
        channel:  params.channel,
        subject:  params.subject,
        body:     params.body,
        discount: params.discount,
        count:    params.count,
      });
    }

    try {
      // ── Appel API selon le type d'action ────────────────────────
      if (type === 'create_campaign') {
        // Ensure segment is always a non-empty string (AI sometimes omits it)
        const segmentName = params.segment || params['segment_focus'] || 'All Customers';
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment:  segmentName,
            channel:  params.channel ?? 'email',
            subject:  params.subject ?? '',
            body:     params.body ?? '',
            discount: params.discount,
          }),
        });

        // Si le backend a retourné un ID, on met à jour l'objet poussé
        let serverCampaign: any = null;
        try { serverCampaign = res.ok ? await res.json() : null; } catch {}
        if (serverCampaign?.id) {
          this.campaignSvc.pushFromChatbot({ ...params, ...serverCampaign });
        }
      } else if (type === 'send_whatsapp') {
        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segment: params.segment || 'All Customers',
            message: params.body || params['message'] || '',
          }),
        });
      } else if (type === 'create_segment') {
        await fetch('/api/segments/custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label:  params.filter_label,
            filter: params,
          }),
        });
      }

      // Marque l'action comme effectuée dans le message
      this.messages.update(msgs =>
        msgs.map((m, i) =>
          i === modal.msgIndex ? { ...m, actionDone: true } : m
        )
      );

      // Ajoute un message de confirmation dans le chat
      const confirmMsg = this.buildConfirmationMessage(modal.action);
      this.messages.update(msgs => [...msgs, {
        role: 'assistant',
        content: confirmMsg,
        timestamp: new Date(),
      }]);

      // ── Navigation automatique vers Campaigns si create_campaign ──
      if (type === 'create_campaign') {
        this.nav.navigate('campaigns');
        setTimeout(() => { this.toggleChat(); }, 400);
      }

      this.closeModal();
    } catch (err) {
      // API failed but campaign is already pushed — just show confirmation
      this.messages.update(msgs =>
        msgs.map((m, i) =>
          i === modal.msgIndex ? { ...m, actionDone: true } : m
        )
      );
      this.messages.update(msgs => [...msgs, {
        role: 'assistant',
        content: this.buildConfirmationMessage(modal.action),
        timestamp: new Date(),
      }]);

      if (type === 'create_campaign') {
        this.nav.navigate('campaigns');
        setTimeout(() => { this.toggleChat(); }, 400);
      }

      this.closeModal();
    } finally {
      this.executingAction.set(false);
    }
  }

  private buildConfirmationMessage(action: ChatAction): string {
    const { type, params } = action;
    if (type === 'create_campaign') {
      return `✅ **Campaign created!**\n\n` +
        `- **Segment:** ${params.segment ?? 'All customers'}\n` +
        `- **Channel:** ${params.channel ?? 'email'}\n` +
        (params.discount ? `- **Offer:** ${params.discount}\n` : '') +
        `\nYour campaign is now active. You'll receive a performance report in 24h.`;
    }
    if (type === 'send_whatsapp') {
      return `✅ **WhatsApp messages queued!**\n\n` +
        `Sending to **${params.segment ?? 'selected customers'}**.\n` +
        `Messages will be delivered within the next hour. Track delivery in your dashboard.`;
    }
    if (type === 'create_segment') {
      return `✅ **Segment created: "${params.filter_label}"**\n\n` +
        `The segment is now available in your Segments dashboard. ` +
        `You can use it to target campaigns or monitor behavior over time.`;
    }
    return `✅ **Action executed successfully.**`;
  }

  // ── Send message ─────────────────────────────────────────────────────────

  async sendMessage(overrideText?: string): Promise<void> {
    const text = (overrideText ?? this.inputValue).trim();
    if (!text || this.isLoading()) return;

    this.inputValue = '';
    this.messages.update(msgs => [...msgs, { role: 'user', content: text, timestamp: new Date() }]);

    // ── Intent local ──────────────────────────────────────────────────────
    const intentResult = this.intent.detect(text);
    this.intentStats.update(s => ({
      total: s.total + 1,
      local: s.local + (intentResult ? 1 : 0),
      api:   s.api   + (intentResult ? 0 : 1),
    }));

    if (intentResult) {
      await new Promise(r => setTimeout(r, 80));
      this.messages.update(msgs => [...msgs, {
        role: 'assistant', content: intentResult.response, timestamp: new Date(),
      }]);
      if (!this.isOpen()) this.unreadCount.update(v => v + 1);
      return;
    }

    // ── Fallback API ──────────────────────────────────────────────────────
    this.isLoading.set(true);

    if (!this.sessionId()) {
      try {
        const res = await fetch('/api/chat/sessions', { method: 'POST' });
        if (res.ok) { const d = await res.json(); this.sessionId.set(d.session_id); }
      } catch {}
    }

    try {
      const history = this.messages().slice(-14).map(m => ({ role: m.role, content: m.content }));
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, session_id: this.sessionId() }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const detail = err.detail;
        const detailStr = typeof detail === 'string' ? detail
          : Array.isArray(detail) ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join(', ')
          : detail ? JSON.stringify(detail) : null;
        throw new Error(detailStr || 'Backend error ' + response.status);
      }

      const data = await response.json();

      // ── Parse structured response ──────────────────────────────
      // Le backend peut retourner { response, action? } ou juste une string
      let replyText: string;
      let action: ChatAction | undefined;

      if (data.action) {
        // Réponse structurée avec action
        replyText = data.response ?? '';
        action = {
          type:   data.action.type,
          label:  data.action.label,
          icon:   ACTION_ICONS[data.action.type] ?? '⚡',
          params: data.action.params ?? {},
        };
      } else {
        // Essaie de parser du JSON inséré dans la réponse texte (fallback)
        const parsed = this.tryParseActionFromText(data.response ?? '');
        replyText = parsed.text;
        action    = parsed.action;
      }

      this.messages.update(msgs => [...msgs, {
        role: 'assistant', content: replyText, timestamp: new Date(), action,
      }]);
      if (!this.isOpen()) this.unreadCount.update(v => v + 1);
      this.loadSessions();

    } catch (err: any) {
      this.messages.update(msgs => [...msgs, {
        role: 'assistant',
        content: `⚠️ **Error:** ${err instanceof Error ? err.message : (typeof err === 'string' ? err : JSON.stringify(err))}. Make sure the backend is running.`,
        timestamp: new Date(),
      }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Parses action from text if backend wraps it in JSON block ────────────
  private tryParseActionFromText(text: string): { text: string; action?: ChatAction } {
    // Cherche ```json { "action": ... } ``` dans la réponse
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return { text };
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.action?.type) {
        const cleanText = text.replace(/```json[\s\S]*?```/, '').trim();
        return {
          text: cleanText,
          action: {
            type:   parsed.action.type,
            label:  parsed.action.label ?? 'Execute action',
            icon:   ACTION_ICONS[parsed.action.type] ?? '⚡',
            params: parsed.action.params ?? {},
          },
        };
      }
    } catch {}
    return { text };
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async loadSessions(): Promise<void> {
    this.sessionsLoading.set(true);
    try {
      const res = await fetch('/api/chat/sessions');
      if (res.ok) { const d = await res.json(); this.sessions.set(d.sessions ?? []); }
    } catch {} finally { this.sessionsLoading.set(false); }
  }

  async loadSession(sessionId: string): Promise<void> {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      this.messages.set((data.messages ?? []).map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.ts ?? Date.now()),
      })));
      this.sessionId.set(sessionId);
      this.showSessions.set(false);
    } catch {}
  }

  async deleteSession(sessionId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await fetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' });
      this.sessions.update(s => s.filter(s => s._id !== sessionId));
      if (this.sessionId() === sessionId) this.newChat();
    } catch {}
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  async checkAlerts(): Promise<void> {
    this.alertChecking.set(true);
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();
      const alerts: AlertNotification[] = data.alerts ?? [];
      this.activeAlerts.set(alerts);
      this.alertCount.set(alerts.length);
      if (alerts.length > 0 && !this.isOpen()) this.unreadCount.update(v => Math.max(v, alerts.length));
      if (alerts.length > 0 && this.isOpen() && this.messages().length === 0) {
        const a = alerts[0];
        this.inputValue = `🚨 **Automatic alert detected!**\n\nThe **At Risk** segment increased by **+${a.delta.toFixed(1)}%** (${a.baseline_pct.toFixed(1)}% → ${a.current_pct.toFixed(1)}%). What should I do?`;
      }
    } catch {} finally { this.alertChecking.set(false); }
  }

  async acknowledgeAlert(alert: AlertNotification): Promise<void> {
    if (!alert._id) return;
    try {
      const res = await fetch(`/api/alerts/${alert._id}/acknowledge`, { method: 'POST' });
      if (res.ok) {
        this.activeAlerts.update(list => list.filter(a => a._id !== alert._id));
        this.alertCount.update(v => Math.max(0, v - 1));
        if (this.alertCount() === 0) this.showAlertPanel.set(false);
      }
    } catch {}
  }

  askAIAboutAlert(alert: AlertNotification): void {
    const prompt = `The "At Risk" segment increased by +${alert.delta.toFixed(1)}% (from ${alert.baseline_pct.toFixed(1)}% to ${alert.current_pct.toFixed(1)}% of my customers). Generate a complete emergency action plan with a concrete retention campaign ready to launch (email + WhatsApp), include the offer, subject line, and message body.`;
    this.inputValue = prompt;
    this.showAlertPanel.set(false);
    this.sendMessage();
  }

  // ── Format ───────────────────────────────────────────────────────────────

  formatMessage(content: string): string {
    return content
      // Bold first (** ... **) before touching single *
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Bullet lists: "* item" OR "- item" at start of line
      .replace(/^[\*\-] (.*?)$/gm, '<li>$1</li>')
      // Wrap all consecutive <li> groups in a single <ul>
      .replace(/(<li>[\s\S]*?<\/li>)(\s*<li>[\s\S]*?<\/li>)*/g, '<ul>$&</ul>')
      // Italic — single * remaining (not already consumed above)
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch {}
  }
}