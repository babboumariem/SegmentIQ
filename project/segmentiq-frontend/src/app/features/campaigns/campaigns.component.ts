// src/app/features/campaigns/campaigns.component.ts
// ─────────────────────────────────────────────────────────────────────────────
// PAGE CAMPAIGNS — The3Beez / SegmentIQ  (v6 — Full Sync)
// ─────────────────────────────────────────────────────────────────────────────

import { Component, signal, computed, OnInit, OnDestroy, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignService } from '../../core/services/campaign.service';
import { DataService } from '../../core/services/data.service';
import { AuthService } from '../../core/services/auth.service';

// ── Segment definitions (mirrored from params.component / segment_engine.py) ──
interface SegmentDef { id: number; name: string; icon: string; }

const CORE_SEGS: SegmentDef[] = [
  { id: 0, name: 'VIP',       icon: '👑' },
  { id: 1, name: 'Loyal',     icon: '💚' },
  { id: 2, name: 'At Risk',   icon: '⚠️' },
  { id: 3, name: 'Lost',      icon: '💤' },
];
const EXTRA_SEGS: SegmentDef[] = [
  { id: 4, name: 'Ultra VIP', icon: '💎' },
  { id: 5, name: 'Promising', icon: '🌱' },
  { id: 6, name: 'Inactifs',  icon: '😴' },
];
const K_SEGMENTS: Record<number, SegmentDef[]> = {
  2: [ CORE_SEGS[0], CORE_SEGS[1] ],
  3: [ CORE_SEGS[0], CORE_SEGS[1], CORE_SEGS[2] ],
  4: [ CORE_SEGS[0], CORE_SEGS[1], CORE_SEGS[2], CORE_SEGS[3] ],
  5: [ CORE_SEGS[0], CORE_SEGS[1], CORE_SEGS[2], CORE_SEGS[3], EXTRA_SEGS[0] ],
  6: [ CORE_SEGS[0], CORE_SEGS[1], CORE_SEGS[2], CORE_SEGS[3], EXTRA_SEGS[0], EXTRA_SEGS[1] ],
  7: [ CORE_SEGS[0], CORE_SEGS[1], CORE_SEGS[2], CORE_SEGS[3], EXTRA_SEGS[0], EXTRA_SEGS[1], EXTRA_SEGS[2] ],
};

// ── Types ──────────────────────────────────────────────────────────────────

interface Campaign {
  id:          string;
  segment:     string;
  channel:     string;
  subject?:    string;
  body?:       string;
  discount?:   string;
  status:      'pending' | 'sent' | 'cancelled';
  created_at:  string;
  created_by:  string;
  recipients?: number;
}

interface EmailSend {
  id:           string;
  campaign_id?: string;  // ← lien vers la Campaign parente
  segment:      string;
  subject:      string;
  body?:        string;
  recipients:   number;
  status:       'queued' | 'sent' | 'failed';
  created_at:   string;
  created_by:   string;
  discount?:    string;
}

interface WhatsAppSend {
  id:           string;
  campaign_id?: string;  // ← lien vers la Campaign parente
  segment:      string;
  message:      string;
  recipients:   number;
  status:       'queued' | 'sent' | 'failed';
  created_at:   string;
  created_by:   string;
}

interface NewCampaignForm {
  segment:   string;
  channel:   string;
  subject:   string;
  body:      string;
  discount:  string;
  recipients:number;
}

type TabType      = 'campaigns';
type CampStatus   = 'pending' | 'sent' | 'cancelled';
type SendStatus   = 'queued'  | 'sent' | 'failed';
type StatusFilter = 'all' | CampStatus | SendStatus;

interface ConfirmDialogConfig {
  title:        string;
  body?:        string;
  note?:        string;
  confirmLabel: string;
  variant:      'danger' | 'warning' | 'info';
  onConfirm:    () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

@Component({
  selector:   'app-campaigns',
  standalone: true,
  imports:    [CommonModule, FormsModule],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./campaigns.component.scss'],
})
export class CampaignsComponent implements OnInit, OnDestroy {

  // ── State ────────────────────────────────────────────────────────────────

  private readonly dataService = inject(DataService);
  private readonly authService = inject(AuthService);

  // ── Role helpers ─────────────────────────────────────────────────────────
  /** true if the logged-in user is admin */
  isAdmin    = computed(() => this.authService.isAdmin());
  /** true if the logged-in user is analyst (any non-admin logged-in user) */
  isAnalyst  = computed(() => !this.authService.isAdmin() && this.authService.user() !== null);

  /** Current user's display name (used for created_by) */
  currentUserName = computed(() => this.authService.user()?.name ?? 'manual');

  // ── Permission helpers (compatible with reference HTML) ──────────────────
  /** Admin or analyst can create campaigns */
  canCreate   = computed(() => this.authService.user() !== null);
  /** Only admin can mark as sent */
  canLaunch   = computed(() => this.isAdmin());
  /** Admin always; analyst only for own campaigns */
  canEdit     = computed(() => this.authService.user() !== null);
  canEditCampaign(c: { created_by?: string }): boolean {
    if (this.isAdmin()) return true;
    return c.created_by === this.currentUserName();
  }
  /** Only admin can cancel */
  canCancel     = computed(() => this.isAdmin());
  /** Only admin can delete */
  canDelete     = computed(() => this.isAdmin());
  /** Only admin can reactivate */
  canReactivate = computed(() => this.isAdmin());

  /**
   * Can the current user perform "Mark Sent"?
   * Admin only — analyst cannot send campaigns.
   */
  canSend(_c: Campaign): boolean {
    return this.isAdmin();
  }

  /**
   * Can the current user cancel / reactivate / delete a given campaign?
   * Admin → always yes (regardless of who created it).
   * Analyst → only for campaigns they created.
   */
  canManage(c: Campaign): boolean {
    if (this.isAdmin()) return true;
    return c.created_by === this.currentUserName();
  }

  /** Segments actifs selon le K choisi dans Params — réactif via DataService. */
  activeSegments = computed(() => {
    // Priorité 1 : segments déjà chargés par DataService (avec vrais noms/icônes/couleurs)
    const segs = this.dataService.segments();
    if (segs.length > 0) return segs;
    // Priorité 2 : fallback local si DataService pas encore chargé
    return K_SEGMENTS[this._readK()] ?? K_SEGMENTS[4];
  });

  /**
   * Returns the exact customer count for a given segment name.
   * Uses DataService.segmentCounts() (keyed by segment id) matched against
   * the active segment definitions.  Returns null when unknown (e.g. "All Customers").
   */
  getSegmentCount(segmentName: string): number | null {
    if (!segmentName || segmentName === 'All Customers') {
      // For "All Customers" use totalCustomers from DataService
      const total = this.dataService.totalCustomers();
      return total > 0 ? total : null;
    }
    const seg = this.activeSegments().find(s => s.name === segmentName);
    if (!seg) return null;
    const counts = this.dataService.segmentCounts();
    const count = counts[seg.id];
    return (count !== undefined && count > 0) ? count : null;
  }

  /**
   * Called when the user changes the Target Segment dropdown.
   * Auto-fills Estimated Recipients with the real segment customer count.
   */
  onSegmentChange(): void {
    const count = this.getSegmentCount(this.form.segment);
    if (count !== null) {
      this.form.recipients = count;
    } else {
      this.form.recipients = 0;
    }
  }

  /**
   * Maximum allowed recipients for the currently selected segment.
   * Used as [max] on the input so the browser enforces the upper bound.
   */
  get maxRecipientsForSegment(): number | null {
    return this.getSegmentCount(this.form.segment);
  }

  private _readK(): number {
    try {
      const v = parseInt(localStorage.getItem('segmentiq_k') ?? '4', 10);
      return (v >= 2 && v <= 7) ? v : 4;
    } catch { return 4; }
  }

  private _storageListener = (_e: StorageEvent) => { /* K sync now handled by DataService */ };

  private _visibilityListener = () => { /* K sync now handled by DataService */ };

  campaigns      = signal<Campaign[]>([]);
  emailSends     = signal<EmailSend[]>([]);
  whatsapp       = signal<WhatsAppSend[]>([]);
  loading        = signal(false);
  error          = signal<string | null>(null);
  activeTab      = signal<TabType>('campaigns');
  campStatusTab  = signal<CampStatus>('pending');
  statusFilter   = signal<StatusFilter>('all');
  updatingId     = signal<string | null>(null);
  showModal      = signal(false);
  editingCampaign= signal<Campaign | null>(null);
  saving         = signal(false);
  toast          = signal<string | null>(null);
  toastType      = signal<'success' | 'error'>('success');
  searchQuery    = signal('');
  confirmDialog  = signal<ConfirmDialogConfig | null>(null);

  form: NewCampaignForm = this.emptyForm();

  // ── Multi-select state ────────────────────────────────────────────────────
  selectedIds = signal<Set<string>>(new Set());

  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  toggleSelect(id: string): void {
    this.selectedIds.update(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  get allVisibleSelected(): boolean {
    const list = this.filteredCampaigns();
    return list.length > 0 && list.every(c => this.selectedIds().has(c.id));
  }

  toggleSelectAll(): void {
    const list = this.filteredCampaigns();
    if (this.allVisibleSelected) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(list.map(c => c.id)));
    }
  }

  clearSelection(): void { this.selectedIds.set(new Set()); }

  selectedCount = computed(() => this.selectedIds().size);

  /**
   * Returns true if every selected campaign was created by the current user.
   * Used to gate bulk actions for analyst role.
   */
  selectedAllOwnedByMe = computed(() => {
    const ids  = this.selectedIds();
    if (ids.size === 0) return false;
    const name = this.currentUserName();
    return this.campaigns()
      .filter(c => ids.has(c.id))
      .every(c => c.created_by === name);
  });

  // Bulk actions
  bulkDelete(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.openConfirm({
      title: `Delete ${ids.length} campaign(s)?`,
      body: 'All linked Email and WhatsApp sends will also be deleted.',
      note: 'This action is irreversible.',
      confirmLabel: `Delete ${ids.length} campaign(s)`,
      variant: 'danger',
      onConfirm: async () => {
        const toDelete = this.campaigns().filter(c => ids.includes(c.id));
        for (const c of toDelete) { await this._doDeleteCampaign(c); }
        this.clearSelection();
      },
    });
  }

  bulkCancel(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.openConfirm({
      title: `Cancel ${ids.length} campaign(s)?`,
      body: 'All linked sends will also be cancelled.',
      note: 'You can reactivate them from the Cancelled tab.',
      confirmLabel: `Cancel ${ids.length} campaign(s)`,
      variant: 'warning',
      onConfirm: async () => {
        const toCancel = this.campaigns().filter(c => ids.includes(c.id));
        for (const c of toCancel) { await this._doCancelCampaign(c); }
        this.clearSelection();
      },
    });
  }

  bulkReactivate(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.openConfirm({
      title: `Reactivate ${ids.length} campaign(s)?`,
      body: 'Selected campaigns will move back to Pending.',
      confirmLabel: `Reactivate ${ids.length} campaign(s)`,
      variant: 'warning',
      onConfirm: async () => {
        const toReactivate = this.campaigns().filter(c => ids.includes(c.id));
        for (const c of toReactivate) { await this.reactivateCampaign(c); }
        this.clearSelection();
      },
    });
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  totalCampaigns    = computed(() => this.campaigns().length);
  pendingCampaigns  = computed(() => { const active = new Set([...this.activeSegments().map(s => s.name), 'All Customers']); return this.campaigns().filter(c => c.status === 'pending' && (!c.segment || active.has(c.segment))).length; });
  sentCampaigns     = computed(() => this.campaigns().filter(c => c.status === 'sent').length);
  cancelledCampaigns= computed(() => this.campaigns().filter(c => c.status === 'cancelled').length);
  totalEmailSends   = computed(() => this.emailSends().length);
  totalWa           = computed(() => this.whatsapp().length);

  /** Retourne true si le segment est actif dans le K courant (ou si c'est "All Customers"). */
  isSegmentActive(segment: string): boolean {
    if (!segment || segment === 'All Customers') return true;
    return this.activeSegments().some(s => s.name === segment);
  }

  filteredCampaigns = computed(() => {
    const activeNames = new Set(this.activeSegments().map(s => s.name));
    activeNames.add('All Customers');

    let list = this.campaigns().filter(c => {
      if (c.status !== this.campStatusTab()) return false;
      // Si pending : cacher les campagnes dont le segment n'existe plus dans le K actif
      if (c.status === 'pending' && c.segment && !activeNames.has(c.segment)) return false;
      return true;
    });

    const sq = this.searchQuery().trim();
    if (sq) {
      const q = sq.toLowerCase();
      list = list.filter(c =>
        c.segment?.toLowerCase().includes(q) ||
        c.channel?.toLowerCase().includes(q) ||
        c.subject?.toLowerCase().includes(q)
      );
    }
    return list;
  });

  filteredEmailSends = computed(() => {
    let list = this.emailSends();
    if (this.statusFilter() !== 'all') list = list.filter(e => e.status === this.statusFilter());
    const sq = this.searchQuery().trim();
    if (sq) {
      const q = sq.toLowerCase();
      list = list.filter(e =>
        e.segment?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q)
      );
    }
    return list;
  });

  filteredWa = computed(() => {
    let list = this.whatsapp();
    if (this.statusFilter() !== 'all') list = list.filter(w => w.status === this.statusFilter());
    const sq = this.searchQuery().trim();
    if (sq) {
      const q = sq.toLowerCase();
      list = list.filter(w => w.segment?.toLowerCase().includes(q) || w.message?.toLowerCase().includes(q));
    }
    return list;
  });

  // ── Filter configs ───────────────────────────────────────────────────────
  sendFilters = [
    { label: 'All',     value: 'all'    as StatusFilter },
    { label: 'Queued',  value: 'queued' as StatusFilter },
    { label: 'Sent',    value: 'sent'   as StatusFilter },
    { label: 'Failed',  value: 'failed' as StatusFilter },
  ];

  // ── Lifecycle ────────────────────────────────────────────────────────────
  constructor(private campaignSvc: CampaignService) {

    // ── Chatbot → campaigns bridge ─────────────────────────────────────────
    effect(() => {
      const pending = this.campaignSvc.pendingFromChatbot();
      if (!pending) return;
      if (this.loading()) return;

      const already = this.campaigns().some(c => c.id === pending.id);
      if (already) { this.campaignSvc.clearPending(); return; }

      this.campaigns.update(list => [pending as any, ...list]);
      this.campStatusTab.set('pending');
      this.activeTab.set('campaigns');
      this.showToast(`✅ Campaign added — segment: ${pending.segment}`, 'success');
      this.saveToLocal();
      this.campaignSvc.clearPending();
    });

    // ── Auto-clean when K changes: remove pending & cancelled whose segment no longer exists ──
    // Sent campaigns are kept — they were already delivered.
    effect(() => {
      const activeNames = new Set(this.activeSegments().map(s => s.name));
      activeNames.add('All Customers');

      const current = this.campaigns();
      if (!current.length) return;

      const removed: string[] = [];
      const cleaned = current.filter(c => {
        if (c.status === 'sent') return true;
        if (!c.segment || activeNames.has(c.segment)) return true;
        removed.push(c.segment);
        return false;
      });

      if (removed.length > 0) {
        this.campaigns.set(cleaned);
        this.saveToLocal();
        const unique = [...new Set(removed)].join(', ');
        this.showToast(`🗑️ ${removed.length} campaign(s) removed — segment(s) no longer active: ${unique}`, 'error');
      }
    });
  }

  ngOnInit(): void {
    // K sync is handled reactively via DataService.segments() signal
    window.addEventListener('storage', this._storageListener);
    document.addEventListener('visibilitychange', this._visibilityListener);
    this.loadAll();
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this._storageListener);
    document.removeEventListener('visibilitychange', this._visibilityListener);
  }

  // ── LocalStorage keys (mock-mode persistence) ───────────────────────────
  private readonly LS_CAMPAIGNS   = 'siq_campaigns_v1';
  private readonly LS_EMAIL_SENDS = 'siq_email_sends_v1';
  private readonly LS_WA_SENDS    = 'siq_wa_sends_v1';

  private saveToLocal(): void {
    try {
      localStorage.setItem(this.LS_CAMPAIGNS,   JSON.stringify(this.campaigns()));
      localStorage.setItem(this.LS_EMAIL_SENDS, JSON.stringify(this.emailSends()));
      localStorage.setItem(this.LS_WA_SENDS,    JSON.stringify(this.whatsapp()));
    } catch {}
  }

  private loadFromLocal(): boolean {
    try {
      const c  = localStorage.getItem(this.LS_CAMPAIGNS);
      const e  = localStorage.getItem(this.LS_EMAIL_SENDS);
      const w  = localStorage.getItem(this.LS_WA_SENDS);
      if (c && e && w) {
        this.campaigns.set(JSON.parse(c));
        this.emailSends.set(JSON.parse(e));
        this.whatsapp.set(JSON.parse(w));
        return true;
      }
    } catch {}
    return false;
  }

  async loadAll(): Promise<void> {
    const pendingOnLoad = this.campaignSvc.pendingFromChatbot();

    this.loading.set(true);
    this.error.set(null);
    try {
      const [campRes, emailRes, waRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/email/sends'),
        fetch('/api/whatsapp/sends'),
      ]);
      if (!campRes.ok)  throw new Error(`Campaigns API error ${campRes.status}`);
      if (!emailRes.ok) throw new Error(`Email sends API error ${emailRes.status}`);
      if (!waRes.ok)    throw new Error(`WhatsApp API error ${waRes.status}`);
      const campData  = await campRes.json();
      const emailData = await emailRes.json();
      const waData    = await waRes.json();
      this.campaigns.set(campData.campaigns   ?? []);
      this.emailSends.set(emailData.sends     ?? []);
      this.whatsapp.set(waData.sends          ?? []);
      try { localStorage.removeItem(this.LS_CAMPAIGNS); localStorage.removeItem(this.LS_EMAIL_SENDS); localStorage.removeItem(this.LS_WA_SENDS); } catch {}
    } catch (err: any) {
      const restored = this.loadFromLocal();
      if (!restored) {
        this.campaigns.set(this.mockCampaigns());
        this.emailSends.set(this.mockEmailSends());
        this.whatsapp.set(this.mockWaSends());
      }
      this.error.set(null);
    } finally {
      const pending = pendingOnLoad ?? this.campaignSvc.pendingFromChatbot();
      if (pending) {
        const already = this.campaigns().some(c => c.id === pending.id);
        if (!already) {
          this.campaigns.update(list => [pending as any, ...list]);
          this.campStatusTab.set('pending');
          this.activeTab.set('campaigns');
        }
        this.campaignSvc.clearPending();
      }
      this.saveToLocal();
      this.loading.set(false);
      if (pending) {
        this.showToast(`✅ Campaign added — segment: ${pending.segment}`, 'success');
      }
    }
  }

  // ── CRUD — Campaigns ─────────────────────────────────────────────────────

  openCreate(): void {
    this.editingCampaign.set(null);
    this.form = this.emptyForm();
    this.showModal.set(true);
  }

  editCampaign(c: Campaign): void {
    this.editingCampaign.set(c);
    const maxRec = this.getSegmentCount(c.segment);
    const recipients = Math.min(c.recipients ?? 0, maxRec ?? Infinity);
    this.form = {
      segment:    c.segment,
      channel:    c.channel,
      subject:    c.subject ?? '',
      body:       c.body ?? '',
      discount:   c.discount ?? '',
      recipients,
    };
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editingCampaign.set(null); }

  // ── Sync helpers ─────────────────────────────────────────────────────────

  private channelHasEmail(ch: string): boolean {
    return ch.toLowerCase().includes('email');
  }

  private channelHasWhatsApp(ch: string): boolean {
    return ch.toLowerCase().includes('whatsapp');
  }

  private buildEmailSend(camp: Campaign, status: 'queued' | 'sent' | 'failed' = 'queued'): EmailSend {
    return {
      id:          'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      campaign_id: camp.id,
      segment:     camp.segment,
      subject:     camp.subject ?? camp.id,
      body:        camp.body,
      recipients:  camp.recipients ?? 0,
      discount:    camp.discount,
      status,
      created_at:  camp.created_at,
      created_by:  camp.created_by,
    };
  }

  private buildWaSend(camp: Campaign, status: 'queued' | 'sent' | 'failed' = 'queued'): WhatsAppSend {
    return {
      id:          'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      campaign_id: camp.id,
      segment:     camp.segment,
      message:     camp.body ?? camp.subject ?? '',
      recipients:  camp.recipients ?? 0,
      status,
      created_at:  camp.created_at,
      created_by:  camp.created_by,
    };
  }

  private linkedEmailIds(camp: Campaign): string[] {
    return this.emailSends()
      .filter(e =>
        e.campaign_id === camp.id ||
        (!e.campaign_id && e.segment === camp.segment && e.subject === (camp.subject ?? camp.id))
      )
      .map(e => e.id);
  }

  private linkedWaIds(camp: Campaign): string[] {
    return this.whatsapp()
      .filter(w =>
        w.campaign_id === camp.id ||
        (!w.campaign_id && w.segment === camp.segment && w.message === (camp.body ?? camp.subject ?? ''))
      )
      .map(w => w.id);
  }

  private syncParentCampaign(campaignId: string | undefined): void {
    if (!campaignId) return;
    const camp = this.campaigns().find(c => c.id === campaignId);
    if (!camp) return;

    const emailStatuses = this.emailSends().filter(e => e.campaign_id === campaignId).map(e => e.status);
    const waStatuses    = this.whatsapp().filter(w => w.campaign_id === campaignId).map(w => w.status);
    const allStatuses   = [...emailStatuses, ...waStatuses];

    if (allStatuses.length === 0) return;

    let newStatus: Campaign['status'];
    if (allStatuses.every(s => s === 'sent'))         newStatus = 'sent';
    else if (allStatuses.every(s => s === 'failed'))  newStatus = 'cancelled';
    else                                              newStatus = 'pending';

    if (newStatus !== camp.status) {
      this.campaigns.update(list =>
        list.map(c => c.id === campaignId ? { ...c, status: newStatus } : c)
      );
    }
  }

  async saveCampaign(): Promise<void> {
    if (!this.form.segment || !this.form.channel || !this.form.subject) return;

    // Enforce cap: recipients must not exceed the real segment customer count
    const maxRec = this.maxRecipientsForSegment;
    if (maxRec !== null && this.form.recipients > maxRec) {
      this.form.recipients = maxRec;
    }
    if (this.form.recipients < 0) this.form.recipients = 0;

    this.saving.set(true);
    try {
      const editing = this.editingCampaign();
      if (editing) {
        await fetch(`/api/campaigns/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.form),
        }).catch(() => null);

        const updatedCamp: Campaign = { ...editing, ...this.form };
        this.campaigns.update(list => list.map(c => c.id === editing.id ? updatedCamp : c));

        const emailIds = this.linkedEmailIds(editing);
        this.emailSends.update(list => list.map(e =>
          emailIds.includes(e.id)
            ? { ...e, subject: this.form.subject, body: this.form.body, discount: this.form.discount, recipients: this.form.recipients ?? e.recipients }
            : e
        ));

        const waIds = this.linkedWaIds(editing);
        this.whatsapp.update(list => list.map(w =>
          waIds.includes(w.id)
            ? { ...w, message: this.form.body || this.form.subject, recipients: this.form.recipients ?? w.recipients }
            : w
        ));

        this.saveToLocal();
        this.showToast('Campaign updated + linked sends synced ✅', 'success');

      } else {
        const now = new Date().toISOString();
        const newCamp: Campaign = {
          id:         'c_' + Date.now(),
          segment:    this.form.segment,
          channel:    this.form.channel,
          subject:    this.form.subject,
          body:       this.form.body,
          discount:   this.form.discount,
          recipients: this.form.recipients || undefined,
          status:     'pending',
          created_at: now,
          created_by: this.currentUserName(),
        };

        await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCamp),
        }).catch(() => null);

        this.campaigns.update(list => [newCamp, ...list]);

        let created: string[] = [];
        if (this.channelHasEmail(newCamp.channel)) {
          const emailSend = this.buildEmailSend(newCamp);
          await fetch('/api/email/sends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailSend),
          }).catch(() => null);
          this.emailSends.update(list => [emailSend, ...list]);
          created.push('Email Send');
        }

        if (this.channelHasWhatsApp(newCamp.channel)) {
          const waSend = this.buildWaSend(newCamp);
          await fetch('/api/whatsapp/sends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(waSend),
          }).catch(() => null);
          this.whatsapp.update(list => [waSend, ...list]);
          created.push('WhatsApp Send');
        }

        this.campStatusTab.set('pending');
        this.saveToLocal();

        const extra = created.length > 0 ? ` + ${created.join(' & ')} automatically created` : '';
        this.showToast(`Campaign launched 🚀${extra}`, 'success');
      }
      this.closeModal();
    } finally {
      this.saving.set(false);
    }
  }

  async markCampaignSent(c: Campaign): Promise<void> {
    if (!this.canSend(c)) { this.showToast('❌ Only admins can mark campaigns as sent.', 'error'); return; }
    this.updatingId.set(c.id);
    try {
      await fetch(`/api/campaigns/${c.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      }).catch(() => null);

      this.campaigns.update(list => list.map(x => x.id === c.id ? { ...x, status: 'sent' } : x));

      const emailIds = this.linkedEmailIds(c);
      this.emailSends.update(list => list.map(e =>
        emailIds.includes(e.id) ? { ...e, status: 'sent' as const } : e
      ));

      const waIds = this.linkedWaIds(c);
      this.whatsapp.update(list => list.map(w =>
        waIds.includes(w.id) ? { ...w, status: 'sent' as const } : w
      ));

      this.saveToLocal();
      const synced = [...emailIds, ...waIds].length;
      this.showToast(`Campaign sent ✅${synced > 0 ? ` — ${synced} send(s) marked as sent` : ''}`, 'success');
    } finally { this.updatingId.set(null); }
  }

  async cancelCampaign(c: Campaign): Promise<void> {
    if (!this.canManage(c)) { this.showToast('❌ You can only cancel your own campaigns.', 'error'); return; }
    this.openConfirm({
      title: `Cancel campaign for "${c.segment}"?`,
      body: 'All linked Email and WhatsApp sends will also be cancelled.',
      note: 'You can reactivate it from the Cancelled tab.',
      confirmLabel: 'Cancel campaign',
      variant: 'warning',
      onConfirm: () => this._doCancelCampaign(c),
    });
  }

  private async _doCancelCampaign(c: Campaign): Promise<void> {
    this.updatingId.set(c.id);
    try {
      await fetch(`/api/campaigns/${c.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }).catch(() => null);

      this.campaigns.update(list => list.map(x => x.id === c.id ? { ...x, status: 'cancelled' } : x));

      const emailIds = this.linkedEmailIds(c);
      this.emailSends.update(list => list.map(e =>
        emailIds.includes(e.id) ? { ...e, status: 'failed' as const } : e
      ));

      const waIds = this.linkedWaIds(c);
      this.whatsapp.update(list => list.map(w =>
        waIds.includes(w.id) ? { ...w, status: 'failed' as const } : w
      ));

      await Promise.all([
        ...emailIds.map(id => fetch(`/api/email/sends/${id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed' }),
        }).catch(() => null)),
        ...waIds.map(id => fetch(`/api/whatsapp/${id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'failed' }),
        }).catch(() => null)),
      ]);

      this.saveToLocal();
      const synced = emailIds.length + waIds.length;
      this.showToast(`Campaign cancelled${synced > 0 ? ` — ${synced} send(s) cancelled` : ''} — reactivatable from Cancelled tab.`, 'success');
    } finally { this.updatingId.set(null); }
  }

  async reactivateCampaign(c: Campaign): Promise<void> {
    if (!this.canManage(c)) { this.showToast('❌ You can only reactivate your own campaigns.', 'error'); return; }
    this.updatingId.set(c.id);
    try {
      await fetch(`/api/campaigns/${c.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      }).catch(() => null);

      this.campaigns.update(list => list.map(x => x.id === c.id ? { ...x, status: 'pending' } : x));

      const emailIds = this.linkedEmailIds(c);
      this.emailSends.update(list => list.map(e =>
        emailIds.includes(e.id) ? { ...e, status: 'queued' as const } : e
      ));

      const waIds = this.linkedWaIds(c);
      this.whatsapp.update(list => list.map(w =>
        waIds.includes(w.id) ? { ...w, status: 'queued' as const } : w
      ));

      await Promise.all([
        ...emailIds.map(id => fetch(`/api/email/sends/${id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'queued' }),
        }).catch(() => null)),
        ...waIds.map(id => fetch(`/api/whatsapp/${id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'queued' }),
        }).catch(() => null)),
      ]);

      this.saveToLocal();
      const synced = emailIds.length + waIds.length;
      this.showToast(`Campaign reactivated → Pending ✅${synced > 0 ? ` — ${synced} send(s) re-queued` : ''}`, 'success');
    } finally { this.updatingId.set(null); }
  }

  async deleteCampaign(c: Campaign): Promise<void> {
    if (!this.canManage(c)) { this.showToast('❌ You can only delete your own campaigns.', 'error'); return; }
    this.openConfirm({
      title: `Permanently delete "${c.segment}"?`,
      body: 'All linked Email and WhatsApp sends will also be deleted.',
      note: 'This action is irreversible.',
      confirmLabel: 'Delete permanently',
      variant: 'danger',
      onConfirm: () => this._doDeleteCampaign(c),
    });
  }

  private async _doDeleteCampaign(c: Campaign): Promise<void> {
    this.updatingId.set(c.id);
    try {
      await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' }).catch(() => null);

      const emailIds = this.linkedEmailIds(c);
      const waIds    = this.linkedWaIds(c);

      this.emailSends.update(list => list.filter(e => !emailIds.includes(e.id)));
      this.whatsapp.update(list   => list.filter(w => !waIds.includes(w.id)));

      await Promise.all([
        ...emailIds.map(id => fetch(`/api/email/sends/${id}`, { method: 'DELETE' }).catch(() => null)),
        ...waIds.map(id    => fetch(`/api/whatsapp/${id}`,    { method: 'DELETE' }).catch(() => null)),
      ]);

      this.campaigns.update(list => list.filter(x => x.id !== c.id));
      this.saveToLocal();

      const synced = emailIds.length + waIds.length;
      this.showToast(`Campaign deleted${synced > 0 ? ` + ${synced} send(s) deleted` : ''}.`, 'success');
    } finally { this.updatingId.set(null); }
  }

  // ── CRUD — Email Sends ───────────────────────────────────────────────────

  async markEmailSent(e: EmailSend): Promise<void> {
    this.updatingId.set(e.id);
    try {
      await fetch(`/api/email/sends/${e.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      }).catch(() => null);
      this.emailSends.update(list => list.map(x => x.id === e.id ? { ...x, status: 'sent' } : x));
      this.syncParentCampaign(e.campaign_id);
      this.saveToLocal();
      this.showToast('Email marked as sent ✅', 'success');
    } finally { this.updatingId.set(null); }
  }

  async cancelEmail(e: EmailSend): Promise<void> {
    this.openConfirm({
      title: `Cancel this Email send?`,
      body: `Segment: ${e.segment}`,
      confirmLabel: 'Cancel send',
      variant: 'warning',
      onConfirm: () => this._doCancelEmail(e),
    });
  }

  private async _doCancelEmail(e: EmailSend): Promise<void> {
    this.updatingId.set(e.id);
    try {
      await fetch(`/api/email/sends/${e.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => null);
      this.emailSends.update(list => list.map(x => x.id === e.id ? { ...x, status: 'failed' } : x));
      this.syncParentCampaign(e.campaign_id);
      this.saveToLocal();
      this.showToast('Email send cancelled.', 'success');
    } finally { this.updatingId.set(null); }
  }

  async retryEmail(e: EmailSend): Promise<void> {
    this.updatingId.set(e.id);
    try {
      await fetch(`/api/email/sends/${e.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'queued' }),
      }).catch(() => null);
      this.emailSends.update(list => list.map(x => x.id === e.id ? { ...x, status: 'queued' } : x));
      this.syncParentCampaign(e.campaign_id);
      this.saveToLocal();
      this.showToast('Email re-queued ✅', 'success');
    } finally { this.updatingId.set(null); }
  }

  async deleteEmail(e: EmailSend): Promise<void> {
    this.openConfirm({
      title: 'Delete this Email send?',
      note: 'This action is irreversible.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => this._doDeleteEmail(e),
    });
  }

  private async _doDeleteEmail(e: EmailSend): Promise<void> {
    this.updatingId.set(e.id);
    try {
      await fetch(`/api/email/sends/${e.id}`, { method: 'DELETE' }).catch(() => null);
      this.emailSends.update(list => list.filter(x => x.id !== e.id));
      this.syncParentCampaign(e.campaign_id);
      this.saveToLocal();
      this.showToast('Email send deleted.', 'success');
    } finally { this.updatingId.set(null); }
  }

  // ── CRUD — WhatsApp ──────────────────────────────────────────────────────

  async markWaSent(w: WhatsAppSend): Promise<void> {
    this.updatingId.set(w.id);
    try {
      await fetch(`/api/whatsapp/${w.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      }).catch(() => null);
      this.whatsapp.update(list => list.map(x => x.id === w.id ? { ...x, status: 'sent' } : x));
      this.syncParentCampaign(w.campaign_id);
      this.saveToLocal();
      this.showToast('WhatsApp send marked as sent ✅', 'success');
    } finally { this.updatingId.set(null); }
  }

  async cancelWa(w: WhatsAppSend): Promise<void> {
    this.openConfirm({
      title: 'Cancel this WhatsApp send?',
      body: `Segment: ${w.segment}`,
      confirmLabel: 'Cancel send',
      variant: 'warning',
      onConfirm: () => this._doCancelWa(w),
    });
  }

  private async _doCancelWa(w: WhatsAppSend): Promise<void> {
    this.updatingId.set(w.id);
    try {
      await fetch(`/api/whatsapp/${w.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => null);
      this.whatsapp.update(list => list.map(x => x.id === w.id ? { ...x, status: 'failed' } : x));
      this.syncParentCampaign(w.campaign_id);
      this.saveToLocal();
      this.showToast('WhatsApp send cancelled.', 'success');
    } finally { this.updatingId.set(null); }
  }

  async retryWa(w: WhatsAppSend): Promise<void> {
    this.updatingId.set(w.id);
    try {
      await fetch(`/api/whatsapp/${w.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'queued' }),
      }).catch(() => null);
      this.whatsapp.update(list => list.map(x => x.id === w.id ? { ...x, status: 'queued' } : x));
      this.syncParentCampaign(w.campaign_id);
      this.saveToLocal();
      this.showToast('WhatsApp send re-queued ✅', 'success');
    } finally { this.updatingId.set(null); }
  }

  async deleteWa(w: WhatsAppSend): Promise<void> {
    this.openConfirm({
      title: 'Delete this WhatsApp send?',
      note: 'This action is irreversible.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => this._doDeleteWa(w),
    });
  }

  private async _doDeleteWa(w: WhatsAppSend): Promise<void> {
    this.updatingId.set(w.id);
    try {
      await fetch(`/api/whatsapp/${w.id}`, { method: 'DELETE' }).catch(() => null);
      this.whatsapp.update(list => list.filter(x => x.id !== w.id));
      this.syncParentCampaign(w.campaign_id);
      this.saveToLocal();
      this.showToast('WhatsApp send deleted.', 'success');
    } finally { this.updatingId.set(null); }
  }

  // ── UI helpers ───────────────────────────────────────────────────────────

  setTab(t: TabType): void {
    this.activeTab.set(t);
    this.statusFilter.set('all');
    this.searchQuery.set('');
  }

  setCampStatusTab(s: CampStatus): void { this.campStatusTab.set(s); this.clearSelection(); }
  setFilter(f: StatusFilter): void { this.statusFilter.set(f); }

  openConfirm(config: ConfirmDialogConfig): void {
    this.confirmDialog.set(config);
  }

  acceptConfirm(): void {
    const cfg = this.confirmDialog();
    this.confirmDialog.set(null);
    if (cfg) cfg.onConfirm();
  }

  rejectConfirm(): void {
    this.confirmDialog.set(null);
  }

  showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(null), 3500);
  }

  channelIcon(ch: string): string {
    const c = ch?.toLowerCase() ?? '';
    if (c.includes('whatsapp') && c.includes('email')) return '📧💬';
    if (c.includes('whatsapp')) return '💬';
    if (c.includes('email')) return '📧';
    if (c.includes('sms')) return '📱';
    if (c.includes('push')) return '🔔';
    return '📢';
  }

  normalizeChannel(ch: string): string {
    const c = (ch ?? '').toLowerCase().replace(/\s+/g, '').replace(/\+/g, '-');
    if (c.includes('whatsapp') && c.includes('email')) return 'email-whatsapp';
    if (c.includes('whatsapp')) return 'whatsapp';
    if (c.includes('email')) return 'email';
    if (c.includes('sms')) return 'sms';
    if (c.includes('push')) return 'push';
    return 'default';
  }

  truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  emptyForm(): NewCampaignForm {
    return { segment: '', channel: '', subject: '', body: '', discount: '', recipients: 0 };
  }

  // ── Mock data (used when backend is unavailable) ─────────────────────────

  private mockCampaigns(): Campaign[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'c_001', segment: 'At Risk', channel: 'email',
        subject: 'We miss you — exclusive 15% off just for you',
        body: 'Hi [First Name],\n\nWe noticed you haven\'t visited recently. Here\'s an exclusive discount code: COMEBACK15 — valid 72 hours.',
        discount: '-15%', recipients: 842, status: 'pending',
        created_at: now, created_by: 'AI Chatbot',
      },
      {
        id: 'c_002', segment: 'VIP', channel: 'email',
        subject: '[VIP Exclusive] Early access to our new collection 🌟',
        body: 'Hi [First Name],\n\nAs one of our most valued VIP customers, enjoy early access + free premium shipping.',
        recipients: 214, status: 'sent',
        created_at: new Date(Date.now() - 86400000).toISOString(), created_by: 'AI Chatbot',
      },
      {
        id: 'c_003', segment: 'Loyal', channel: 'email+whatsapp',
        subject: 'You\'re almost VIP — one step away 🚀',
        body: 'Hi [First Name],\n\nYou\'re this close to VIP status! One more order this month unlocks exclusive perks.',
        discount: '-10%', recipients: 615, status: 'cancelled',
        created_at: new Date(Date.now() - 172800000).toISOString(), created_by: 'manual',
      },
    ];
  }

  private mockEmailSends(): EmailSend[] {
    return [
      {
        id: 'e_001', campaign_id: 'c_001', segment: 'At Risk',
        subject: 'We miss you — exclusive 15% off just for you',
        body: 'Hi [First Name],\n\nWe noticed you haven\'t visited recently. Here\'s an exclusive discount code: COMEBACK15 — valid 72 hours.',
        discount: '-15%', recipients: 842, status: 'queued',
        created_at: new Date().toISOString(), created_by: 'AI Chatbot',
      },
      {
        id: 'e_002', campaign_id: 'c_002', segment: 'VIP',
        subject: '[VIP Exclusive] Early access to our new collection',
        body: 'Hi [First Name],\n\nAs one of our most valued VIP customers, enjoy early access + free premium shipping.',
        recipients: 214, status: 'sent',
        created_at: new Date(Date.now() - 86400000).toISOString(), created_by: 'AI Chatbot',
      },
      {
        id: 'e_003', campaign_id: 'c_003', segment: 'Lost',
        subject: 'Win-back offer — 20% discount just for you',
        body: 'Hi [First Name],\n\nWe haven\'t seen you in a while! Use COMEBACK20 for 20% off — expires in 72h.',
        discount: '-20%', recipients: 390, status: 'failed',
        created_at: new Date(Date.now() - 172800000).toISOString(), created_by: 'AI Chatbot',
      },
    ];
  }

  private mockWaSends(): WhatsAppSend[] {
    return [
      {
        id: 'w_001', campaign_id: 'c_001', segment: 'At Risk',
        message: 'Hi [First Name] 👋\n\nWe miss you! Here\'s an exclusive offer: *15% off* your next order.\n\nReply YES to get your code. Valid 72h only ⏳',
        recipients: 842, status: 'queued',
        created_at: new Date().toISOString(), created_by: 'AI Chatbot',
      },
      {
        id: 'w_002', campaign_id: 'c_002', segment: 'Lost',
        message: 'Hi [First Name] 👋\n\nWe haven\'t seen you in a while! COMEBACK20 gives you *20% off* — expires in 72h.',
        recipients: 390, status: 'sent',
        created_at: new Date(Date.now() - 86400000).toISOString(), created_by: 'AI Chatbot',
      },
    ];
  }
}