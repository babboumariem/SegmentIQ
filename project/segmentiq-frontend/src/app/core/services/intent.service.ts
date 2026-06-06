// src/app/features/chatbot/intent.service.ts — v5 (EN only)

import { Injectable } from '@angular/core';
import { DataService } from './data.service';

export interface ActionParams {
  segment?:       string;
  channel?:       string;
  subject?:       string;
  body?:          string;
  discount?:      string;
  filter_label?:  string;
  count?:         number;
  [key: string]: any;
}

export interface ChatAction {
  type:   'create_campaign' | 'send_whatsapp' | 'create_segment';
  label:  string;
  icon:   string;
  params: ActionParams;
}

export interface IntentResult {
  intent:     string;
  confidence: 'high' | 'medium';
  response:   string;
  action?:    ChatAction;
}

interface IntentRule {
  intent:           string;
  keywords:         string[];
  excludeKeywords?: string[];
  buildResponse:    (data: DataService) => { text: string; action?: ChatAction };
}

// ── Language detection — always English ───────────────────────────────────
function detectLang(_message: string): 'en' {
  return 'en';
}

@Injectable({ providedIn: 'root' })
export class IntentService {
  constructor(private data: DataService) {}

  detect(message: string): IntentResult | null {
    const normalized = this.normalize(message);
    for (const rule of INTENT_RULES) {
      if (this.matches(normalized, rule)) {
        const { text, action } = rule.buildResponse(this.data);
        return { intent: rule.intent, confidence: 'high', response: text, action };
      }
    }
    return null;
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private matches(normalized: string, rule: IntentRule): boolean {
    const hasKeyword = rule.keywords.some(kw => normalized.includes(kw));
    if (!hasKeyword) return false;
    if (rule.excludeKeywords?.length) {
      const hasExcluded = rule.excludeKeywords.some(kw => normalized.includes(kw));
      if (hasExcluded) return false;
    }
    return true;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function fmtSeg(ds: DataService, segId: number) {
  const segs   = ds.segments();
  const counts = ds.segmentCounts();
  const total  = ds.totalCustomers();
  const agg    = ds.agg();
  const seg    = segs.find(s => s.id === segId);
  if (!seg) return null;
  const count   = counts[segId] ?? 0;
  const pct     = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  const aggData = agg[segId] ?? {};
  const spend   = aggData.avg_spend   != null ? Number(aggData.avg_spend).toFixed(0)   : '?';
  const aov     = aggData.avg_aov     != null ? Number(aggData.avg_aov).toFixed(0)     : '?';
  const orders  = aggData.avg_orders  != null ? Number(aggData.avg_orders).toFixed(1)  : '?';
  const recency = aggData.avg_recency != null ? Number(aggData.avg_recency).toFixed(0) : '?';
  return { seg, count, pct, spend, aov, orders, recency };
}

// ══════════════════════════════════════════════════════════════════════════════
// INTENT RULES v5 — English only
// ══════════════════════════════════════════════════════════════════════════════

const INTENT_RULES: IntentRule[] = [

  // ── 1. Greeting ───────────────────────────────────────────────────────────
  {
    intent: 'greeting',
    keywords: ['bonjour', 'salut', 'hello', 'hi ', 'hey ', 'bonsoir', 'salam', 'coucou'],
    excludeKeywords: ['segment', 'churn', 'vip', 'client', 'alert', 'loyal', 'risk'],
    buildResponse: (_) => ({
      text: `👋 **Hello!** I'm your SegmentIQ AI assistant.\n\nI can help you:\n- 📊 Analyze your **customer segments** (VIP, Loyal, At Risk, Lost)\n- ⚠️ Monitor **churn alerts** in real time\n- 💰 Identify **revenue opportunities**\n- 🚀 **Launch campaigns** directly from this chat\n\nWhat would you like to explore?`,
    }),
  },

  // ── 2. Help ───────────────────────────────────────────────────────────────
  {
    intent: 'help',
    keywords: ['aide', 'help', 'que peux-tu', 'que sais-tu', 'que peux tu', 'what can you', 'capabilities'],
    buildResponse: (_) => ({
      text: `🤖 **What I can do:**\n\n- 📊 Analyze your segments and KPIs\n- ⚠️ Identify at-risk customers\n- 🚀 Create email / WhatsApp / SMS campaigns\n- 🎯 Create custom segments\n- 📅 Build marketing action plans\n\nAsk me anything about your data!`,
    }),
  },

  // ── 3. Segment overview ───────────────────────────────────────────────────
  {
    intent: 'segment_overview',
    keywords: ['tous les segments', 'all segments', 'segment overview', 'vue ensemble', 'resume des segments', 'overview of segments', 'show segments', 'combien de segments'],
    buildResponse: (ds) => {
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      const total  = ds.totalCustomers();
      const rev    = ds.totalRevenue();
      if (!segs.length) return { text: `⏳ Loading data...` };
      const lines = segs.map(s => {
        const c   = counts[s.id] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
        return `- **${s.name}** : ${c.toLocaleString()} customers (${pct}%)`;
      }).join('\n');
      return {
        text: `📊 **Segment overview:**\n\n${lines}\n\n**Total:** ${total.toLocaleString()} customers · **Revenue:** ${rev.toLocaleString()} KWD\n\n💡 Which segment would you like to act on?`,
      };
    },
  },

  // ── 4. Loyal segment ─────────────────────────────────────────────────────
  {
    intent: 'loyal_status',
    keywords: ['loyal', 'who is loyal', "who's loyal", 'loyal customers', 'loyal clients', 'clients loyaux', 'segment loyal', 'loyal segment'],
    excludeKeywords: ['vip', 'convert', 'convertir', 'upgrade', 'passer en vip', 'to vip', 'en vip', 'campaign', 'campagne'],
    buildResponse: (ds) => {
      const info = fmtSeg(ds, 1);
      if (!info) return { text: `⏳ Loyal data is loading.` };
      const { seg, count, pct, spend, aov, orders, recency } = info;
      return {
        text: `💚 **Loyal Segment — your regular customers:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average total spend: **${spend} KWD**\n- Average order value (AOV): **${aov} KWD**\n- Average order count: **${orders}**\n- Average recency: **${recency} days**\n\n💡 These customers are close to VIP status — a conversion campaign can push them to the next level.`,
        action: {
          type:  'create_campaign',
          label: `Loyal loyalty campaign (${count.toLocaleString()})`,
          icon:  '💚',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: `Thank you for your loyalty — your exclusive reward`,
            body: `Hi [First Name],\n\nYou're one of our most loyal customers and we want to show our appreciation.\n\nEnjoy 10% off your next order.\n\nCode: LOYAL10 — valid for 7 days`,
            discount: '-10%',
            count,
          },
        },
      };
    },
  },

  // ── 5. VIP segment ────────────────────────────────────────────────────────
  {
    intent: 'vip_status',
    keywords: ['vip', 'meilleur client', 'top client', 'client premium', 'best customers', 'top customers', 'premium customers', 'who is vip', "who's vip", 'vip customers', 'clients vip'],
    excludeKeywords: ['convertir', 'convert', 'passer', 'devenir', 'strategie', 'campagne', 'campaign', 'upgrade', 'en vip', 'to vip', 'loyal'],
    buildResponse: (ds) => {
      const info = fmtSeg(ds, 0);
      if (!info) return { text: `⏳ VIP data is loading.` };
      const { seg, count, pct, spend, aov, orders } = info;
      return {
        text: `⭐ **VIP Segment — your best customers:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average total spend: **${spend} KWD**\n- Average order value (AOV): **${aov} KWD**\n- Average order count: **${orders}**\n\n💡 Send them an exclusive offer to reinforce their loyalty.`,
        action: {
          type:  'create_campaign',
          label: `VIP exclusive offer (${count.toLocaleString()})`,
          icon:  '⭐',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: `[VIP Exclusive] A special gift just for you`,
            body: `Hi [First Name],\n\nAs a VIP customer, you deserve something special.\n\nEnjoy early access to our new collection + free premium shipping.\n\nThank you for your loyalty! 🌟`,
            count,
          },
        },
      };
    },
  },

  // ── 6. At Risk ────────────────────────────────────────────────────────────
  {
    intent: 'at_risk_status',
    keywords: ['at risk', 'risque', 'churn', 'churning', 'danger', 'alerte churn', 'losing customers', 'clients risque'],
    excludeKeywords: ['campaign', 'campagne', 'email', 'whatsapp', 'plan', 'action', 'lancer'],
    buildResponse: (ds) => {
      const info = fmtSeg(ds, 2);
      if (!info) return { text: `⚠️ At Risk segment not loaded.` };
      const { seg, count, pct, spend, recency } = info;
      return {
        text: `⚠️ **At Risk Segment — current status:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average recency: **${recency} days** since last purchase\n- Average spend: **${spend} KWD**\n\n**Risk signals:** Declining frequency, recent inactivity.\n\n💡 Retention campaign ready to launch:`,
        action: {
          type:  'create_campaign',
          label: `At Risk retention campaign (${count.toLocaleString()})`,
          icon:  '🚀',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: `We miss you — exclusive offer`,
            body: `Hi [First Name],\n\nWe noticed you haven't been around. Here's an exclusive offer: 15% off.\n\nCode: COMEBACK15 — valid 72h`,
            discount: '-15%',
            count,
          },
        },
      };
    },
  },

  // ── 7. Revenue ────────────────────────────────────────────────────────────
  {
    intent: 'revenue_question',
    keywords: ['revenu', 'revenue', 'chiffre d affaire', 'vente', 'kwd', 'argent', 'sales', 'income', 'earnings', 'financial', 'combien rapporte', 'revenue of', 'revenue from', 'revenu de'],
    buildResponse: (ds) => {
      const summary  = ds.summary();
      const revenue  = ds.totalRevenue();
      const aov      = ds.overallAov();
      const total    = ds.totalCustomers();
      if (!revenue) return { text: `⏳ Financial data is loading.` };
      const returnRate = summary?.return_rate ? (summary.return_rate * 100).toFixed(1) : '?';
      const segs     = ds.segments();
      const segLines = segs.map(s => {
        const r = ds.getSegRevenue(s.id);
        return r > 0 ? `- **${s.name}** : ${ds.getSegRevStr(s.id)}` : null;
      }).filter(Boolean).join('\n');
      return {
        text: `💰 **Financial KPIs:**\n\n- **Total revenue:** ${revenue.toLocaleString()} KWD\n- **AOV:** ${aov.toFixed(0)} KWD\n- **Customers:** ${total.toLocaleString()}\n- **Return rate:** ${returnRate}%\n${segLines ? `\n**Revenue by segment:**\n${segLines}` : ''}\n\n💡 Would you like me to identify the best growth opportunities?`,
      };
    },
  },

  // ── 8. Campaign request ───────────────────────────────────────────────────
  {
    intent: 'campaign_request',
    keywords: ['campagne', 'campaign', 'lancer campagne', 'creer campagne', 'create campaign', 'launch campaign'],
    excludeKeywords: ['at risk', 'vip', 'lost', 'perdu', 'loyal', 'whatsapp'],
    buildResponse: (ds) => {
      const segs   = ds.segments();
      const atRisk = segs.find(s => s.id === 2);
      const counts = ds.segmentCounts();
      const count  = atRisk ? (counts[2] ?? 0) : 0;
      return {
        text: `🎯 **Campaign builder — ready to launch:**\n\n${atRisk && count > 0 ? `💡 Your **At Risk** segment has **${count.toLocaleString()} customers** — highest ROI for a retention campaign.` : `Specify your target and I'll generate the full message.`}`,
        action: {
          type:  'create_campaign',
          label: `Launch retention campaign`,
          icon:  '🚀',
          params: {
            segment: atRisk?.name ?? 'At Risk',
            channel: 'email',
            subject: `We have something special for you`,
            body: `Hi [First Name],\n\nExclusive offer: 15% off your next order.\n\nCode: SPECIAL15 — valid 72h`,
            discount: '-15%',
            count,
          },
        },
      };
    },
  },

  // ── 9. WhatsApp ───────────────────────────────────────────────────────────
  {
    intent: 'whatsapp_request',
    keywords: ['whatsapp', 'envoyer whatsapp', 'send whatsapp', 'message whatsapp'],
    buildResponse: (ds) => {
      const segs   = ds.segments();
      const atRisk = segs.find(s => s.id === 2);
      const counts = ds.segmentCounts();
      const count  = atRisk ? (counts[2] ?? 0) : 0;
      return {
        text: `💬 **WhatsApp campaign — ready to send:**\n\nPersonalized message for your At Risk customers. Click to launch.`,
        action: {
          type:  'send_whatsapp',
          label: `Send WhatsApp — At Risk`,
          icon:  '💬',
          params: {
            segment: atRisk?.name ?? 'At Risk',
            body: `Hi [First Name] 👋\n\nWe miss you! Exclusive offer: *15% off*.\n\nReply YES for your code. Valid 72h only ⏳`,
            count,
          },
        },
      };
    },
  },

  // ── 10. Lost / inactive ───────────────────────────────────────────────────
  {
    intent: 'lost_customers',
    keywords: ['perdu', 'inactif', 'lost', 'reactiver', 'reactivation', 'win back', 'winback', 'recuperer', 'inactive', 'reactivate', 'lapsed'],
    buildResponse: (ds) => {
      const info = fmtSeg(ds, 3);
      if (!info) return { text: `⏳ Data is loading.` };
      const { seg, count, pct, recency } = info;
      return {
        text: `🔄 **Lost Segment — customers to reactivate:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Inactive for **${recency} days** on average\n\n**Strategy:** "We miss you" campaign with a time-limited offer.`,
        action: {
          type:  'create_campaign',
          label: `Win-back Lost customers (${count.toLocaleString()})`,
          icon:  '🔄',
          params: {
            segment: seg.name,
            channel: 'email+whatsapp',
            subject: `It's been a while... here's a gift`,
            body: `Hi [First Name],\n\nWe miss you! 20% off your next order.\n\nCode: COMEBACK20 — expires in 72h ⏰`,
            discount: '-20%',
            count,
          },
        },
      };
    },
  },

  // ── 11. Compare segments ──────────────────────────────────────────────────
  {
    intent: 'compare_segments',
    keywords: ['comparer', 'comparaison', 'compare', 'versus', ' vs ', 'comparison', 'which segment', 'best segment', 'quel segment'],
    buildResponse: (ds) => {
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      const agg    = ds.agg();
      const total  = ds.totalCustomers();
      if (!segs.length) return { text: `⏳ Data is loading.` };
      const rows = segs.map(s => {
        const a   = agg[s.id] ?? {};
        const c   = counts[s.id] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
        return `**${s.name}** (${pct}%) · Spend: ${Number(a.avg_spend ?? 0).toFixed(0)} KWD · AOV: ${Number(a.avg_aov ?? 0).toFixed(0)} KWD · Recency: ${Number(a.avg_recency ?? 0).toFixed(0)}d`;
      }).join('\n');
      return {
        text: `📈 **All segments comparison:**\n\n${rows}\n\n💡 Which one would you like to act on?`,
      };
    },
  },

  // ── 12. Total customers ───────────────────────────────────────────────────
  {
    intent: 'total_customers',
    keywords: ['combien de client', 'nombre de client', 'total client', 'base client', 'how many customers', 'total customers', 'customer count', 'customer base'],
    buildResponse: (ds) => {
      const total  = ds.totalCustomers();
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      if (!total) return { text: `⏳ Data is loading.` };
      const lines = segs.map(s => {
        const c   = counts[s.id] ?? 0;
        const pct = ((c / total) * 100).toFixed(1);
        return `- **${s.name}** : ${c.toLocaleString()} (${pct}%)`;
      }).join('\n');
      return {
        text: `👥 **Total customer base: ${total.toLocaleString()} customers**\n\n${lines}`,
      };
    },
  },

  // ── 13. Convert Loyal → VIP ───────────────────────────────────────────────
  {
    intent: 'convert_to_vip',
    keywords: ['convertir', 'convert', 'passer en vip', 'devenir vip', 'loyal en vip', 'upgrade', 'convert to vip', 'become vip', 'loyal to vip'],
    buildResponse: (ds) => {
      const info  = fmtSeg(ds, 1);
      const count = info?.count ?? 0;
      const spend = info?.spend ?? '?';
      const seg   = info?.seg;
      return {
        text: `🚀 **Loyal → VIP conversion strategy:**\n\n${seg ? `**${count.toLocaleString()} Loyal customers** (avg. spend ${spend} KWD) to convert.\n\n` : ''}**3-step plan:**\n1. Identify high AOV, recency < 30d\n2. Incentivize: points, early access, -10%\n3. "You're almost VIP" email with progress bar`,
        action: {
          type:  'create_campaign',
          label: `VIP upgrade — Loyal customers (${count.toLocaleString()})`,
          icon:  '⭐',
          params: {
            segment: seg?.name ?? 'Loyal',
            channel: 'email',
            subject: `You're almost VIP 🌟`,
            body: `Hi [First Name],\n\nOne more purchase this month and you become VIP!\n\n✓ Free premium shipping\n✓ Early access to collections\n✓ Exclusive VIP offers\n\nCode: ALMOSTVIP — 10% off your next order`,
            discount: '-10%',
            count,
          },
        },
      };
    },
  },

  // ── 14. Thanks ────────────────────────────────────────────────────────────
  {
    intent: 'thanks',
    keywords: ['merci', 'thanks', 'thank you', 'parfait', 'super', 'excellent', 'bravo', 'nickel', 'great', 'awesome', 'perfect'],
    excludeKeywords: ['mais', 'but', 'however', 'segment', 'client', 'customer'],
    buildResponse: (_) => ({
      text: `You're welcome! 😊 Feel free to ask if you need anything else.`,
    }),
  },
];