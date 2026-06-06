// src/app/features/chatbot/intent.service.ts — v4
// Bilingue FR/EN — détection langue robuste — règles séparées VIP vs Loyal

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
  buildResponse:    (data: DataService, lang: 'fr' | 'en') => { text: string; action?: ChatAction };
}

// ── Détection de langue ────────────────────────────────────────────────────
function detectLang(message: string): 'fr' | 'en' {
  const lower = message.toLowerCase();
  // Only words that are EXCLUSIVELY French - never appear in English
  const strictlyFrench = [
    'bonjour', 'bonsoir', 'salut', 'merci', 'combien', 'comment',
    'campagne', 'perdre', 'perdu', 'perdus', 'risque', 'inactif',
    'meilleur', 'convertir', 'comparer', 'lancer', 'envoyer',
    'vente', 'argent', 'chiffre', 'revenu', 'revenus',
    'quels', 'quel', 'quelle', 'quelles',
    'votre', 'vos', 'notre', 'nos',
    'sont', 'donne', 'montre', 'affiche',
    'mes clients', 'mon magasin', 'ma boutique',
    'clients loyaux', 'clients vip', 'clients perdus',
  ];
  // Use word boundary check to avoid matching 'revenu' inside 'revenue'
  const frCount = strictlyFrench.filter(w => {
    const idx = lower.indexOf(w);
    if (idx === -1) return false;
    const before = idx === 0 || /[^a-z]/.test(lower[idx - 1]);
    const after  = (idx + w.length) >= lower.length || /[^a-z]/.test(lower[idx + w.length]);
    return before && after;
  }).length;
  return frCount >= 1 ? 'fr' : 'en';
}

@Injectable({ providedIn: 'root' })
export class IntentService {
  constructor(private data: DataService) {}

  detect(message: string): IntentResult | null {
    const normalized = this.normalize(message);
    const lang = detectLang(message);
    for (const rule of INTENT_RULES) {
      if (this.matches(normalized, rule)) {
        const { text, action } = rule.buildResponse(this.data, lang);
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

function fmtSeg(ds: DataService, segId: number, lang: 'fr'|'en') {
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
// INTENT RULES v4
// ══════════════════════════════════════════════════════════════════════════════

const INTENT_RULES: IntentRule[] = [

  // ── 1. Greeting ───────────────────────────────────────────────────────────
  {
    intent: 'greeting',
    keywords: ['bonjour', 'salut', 'hello', 'hi ', 'hey ', 'bonsoir', 'salam', 'coucou'],
    excludeKeywords: ['segment', 'churn', 'vip', 'client', 'alert', 'loyal', 'risk'],
    buildResponse: (_, lang) => ({
      text: lang === 'fr'
        ? `👋 **Bonjour !** Je suis votre assistant SegmentIQ AI.\n\nJe peux vous aider à :\n- 📊 Analyser vos **segments clients** (VIP, Loyal, À risque, Perdu)\n- ⚠️ Suivre les **alertes de churn** en temps réel\n- 💰 Identifier des **opportunités de revenus**\n- 🚀 **Lancer des campagnes** directement depuis ce chat\n\nQu'aimeriez-vous explorer ?`
        : `👋 **Hello!** I'm your SegmentIQ AI assistant.\n\nI can help you:\n- 📊 Analyze your **customer segments** (VIP, Loyal, At Risk, Lost)\n- ⚠️ Monitor **churn alerts** in real time\n- 💰 Identify **revenue opportunities**\n- 🚀 **Launch campaigns** directly from this chat\n\nWhat would you like to explore?`,
    }),
  },

  // ── 2. Help ───────────────────────────────────────────────────────────────
  {
    intent: 'help',
    keywords: ['aide', 'help', 'que peux-tu', 'que sais-tu', 'que peux tu', 'what can you', 'capabilities'],
    buildResponse: (_, lang) => ({
      text: lang === 'fr'
        ? `🤖 **Ce que je peux faire :**\n\n- 📊 Analyser vos segments et KPIs\n- ⚠️ Identifier les clients à risque\n- 🚀 Créer des campagnes email / WhatsApp / SMS\n- 🎯 Créer des segments personnalisés\n- 📅 Construire des plans d'action marketing\n\nPosez-moi n'importe quelle question sur vos données !`
        : `🤖 **What I can do:**\n\n- 📊 Analyze your segments and KPIs\n- ⚠️ Identify at-risk customers\n- 🚀 Create email / WhatsApp / SMS campaigns\n- 🎯 Create custom segments\n- 📅 Build marketing action plans\n\nAsk me anything about your data!`,
    }),
  },

  // ── 3. Segment overview ───────────────────────────────────────────────────
  {
    intent: 'segment_overview',
    keywords: ['tous les segments', 'all segments', 'segment overview', 'vue ensemble', 'resume des segments', 'overview of segments', 'show segments', 'combien de segments'],
    buildResponse: (ds, lang) => {
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      const total  = ds.totalCustomers();
      const rev    = ds.totalRevenue();
      if (!segs.length) return { text: lang === 'fr' ? `⏳ Chargement en cours...` : `⏳ Loading data...` };
      const lines = segs.map(s => {
        const c   = counts[s.id] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
        return `- **${s.name}** : ${c.toLocaleString()} ${lang === 'fr' ? 'clients' : 'customers'} (${pct}%)`;
      }).join('\n');
      return {
        text: lang === 'fr'
          ? `📊 **Vue d'ensemble des segments :**\n\n${lines}\n\n**Total :** ${total.toLocaleString()} clients · **Revenu :** ${rev.toLocaleString()} KWD\n\n💡 Sur quel segment souhaitez-vous agir ?`
          : `📊 **Segment overview:**\n\n${lines}\n\n**Total:** ${total.toLocaleString()} customers · **Revenue:** ${rev.toLocaleString()} KWD\n\n💡 Which segment would you like to act on?`,
      };
    },
  },

  // ── 4. Loyal segment (SEPARATE from VIP — must come BEFORE vip_status) ───
  {
    intent: 'loyal_status',
    keywords: ['loyal', 'who is loyal', "who's loyal", 'loyal customers', 'loyal clients', 'clients loyaux', 'segment loyal', 'loyal segment'],
    excludeKeywords: ['vip', 'convert', 'convertir', 'upgrade', 'passer en vip', 'to vip', 'en vip', 'campaign', 'campagne'],
    buildResponse: (ds, lang) => {
      const info = fmtSeg(ds, 1, lang); // id=1 is Loyal
      if (!info) return { text: lang === 'fr' ? `⏳ Données Loyal en cours de chargement.` : `⏳ Loyal data is loading.` };
      const { seg, count, pct, spend, aov, orders, recency } = info;
      return {
        text: lang === 'fr'
          ? `💚 **Segment Loyal — vos clients réguliers :**\n\n- **${count.toLocaleString()} clients** (${pct}% de votre base)\n- Dépense totale moyenne : **${spend} KWD**\n- Valeur moyenne des commandes (AOV) : **${aov} KWD**\n- Nombre moyen de commandes : **${orders}**\n- Récence moyenne : **${recency} jours**\n\n💡 Ces clients sont proches du statut VIP — une campagne de conversion peut les faire passer au niveau supérieur.`
          : `💚 **Loyal Segment — your regular customers:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average total spend: **${spend} KWD**\n- Average order value (AOV): **${aov} KWD**\n- Average order count: **${orders}**\n- Average recency: **${recency} days**\n\n💡 These customers are close to VIP status — a conversion campaign can push them to the next level.`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Campagne fidélisation Loyal (${count.toLocaleString()})` : `Loyal loyalty campaign (${count.toLocaleString()})`,
          icon:  '💚',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: lang === 'fr' ? `Merci pour votre fidélité — votre récompense exclusive` : `Thank you for your loyalty — your exclusive reward`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nVous faites partie de nos clients les plus fidèles et nous tenons à vous le montrer.\n\nProfitez de 10% de réduction sur votre prochaine commande.\n\nCode : LOYAL10 — valable 7 jours`
              : `Hi [First Name],\n\nYou're one of our most loyal customers and we want to show our appreciation.\n\nEnjoy 10% off your next order.\n\nCode: LOYAL10 — valid for 7 days`,
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
    buildResponse: (ds, lang) => {
      const info = fmtSeg(ds, 0, lang); // id=0 is VIP
      if (!info) return { text: lang === 'fr' ? `⏳ Données VIP en cours de chargement.` : `⏳ VIP data is loading.` };
      const { seg, count, pct, spend, aov, orders } = info;
      return {
        text: lang === 'fr'
          ? `⭐ **Segment VIP — vos meilleurs clients :**\n\n- **${count.toLocaleString()} clients** (${pct}% de votre base)\n- Dépense totale moyenne : **${spend} KWD**\n- Valeur moyenne des commandes (AOV) : **${aov} KWD**\n- Nombre moyen de commandes : **${orders}**\n\n💡 Envoyez-leur une offre exclusive pour renforcer leur fidélité.`
          : `⭐ **VIP Segment — your best customers:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average total spend: **${spend} KWD**\n- Average order value (AOV): **${aov} KWD**\n- Average order count: **${orders}**\n\n💡 Send them an exclusive offer to reinforce their loyalty.`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Offre exclusive VIP (${count.toLocaleString()})` : `VIP exclusive offer (${count.toLocaleString()})`,
          icon:  '⭐',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: lang === 'fr' ? `[VIP Exclusif] Un cadeau spécial rien que pour vous` : `[VIP Exclusive] A special gift just for you`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nEn tant que client VIP, vous méritez quelque chose de spécial.\n\nAccès anticipé à notre nouvelle collection + livraison premium offerte.\n\nMerci pour votre fidélité ! 🌟`
              : `Hi [First Name],\n\nAs a VIP customer, you deserve something special.\n\nEnjoy early access to our new collection + free premium shipping.\n\nThank you for your loyalty! 🌟`,
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
    buildResponse: (ds, lang) => {
      const info = fmtSeg(ds, 2, lang); // id=2 is At Risk
      if (!info) return { text: lang === 'fr' ? `⚠️ Segment À Risque non chargé.` : `⚠️ At Risk segment not loaded.` };
      const { seg, count, pct, spend, recency } = info;
      return {
        text: lang === 'fr'
          ? `⚠️ **Segment À Risque — statut actuel :**\n\n- **${count.toLocaleString()} clients** (${pct}% de votre base)\n- Récence moyenne : **${recency} jours** depuis le dernier achat\n- Dépense moyenne : **${spend} KWD**\n\n**Signaux de risque :** Fréquence en baisse, inactivité récente.\n\n💡 Campagne de rétention prête à lancer :`
          : `⚠️ **At Risk Segment — current status:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Average recency: **${recency} days** since last purchase\n- Average spend: **${spend} KWD**\n\n**Risk signals:** Declining frequency, recent inactivity.\n\n💡 Retention campaign ready to launch:`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Campagne rétention At Risk (${count.toLocaleString()})` : `At Risk retention campaign (${count.toLocaleString()})`,
          icon:  '🚀',
          params: {
            segment: seg.name,
            channel: 'email',
            subject: lang === 'fr' ? `Vous nous manquez — offre exclusive` : `We miss you — exclusive offer`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nNous avons remarqué votre absence. Voici une offre exclusive : 15% de réduction.\n\nCode : RETOUR15 — valable 72h`
              : `Hi [First Name],\n\nWe noticed you haven't been around. Here's an exclusive offer: 15% off.\n\nCode: COMEBACK15 — valid 72h`,
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
    buildResponse: (ds, lang) => {
      const summary  = ds.summary();
      const revenue  = ds.totalRevenue();
      const aov      = ds.overallAov();
      const total    = ds.totalCustomers();
      if (!revenue) return { text: lang === 'fr' ? `⏳ Données financières en cours de chargement.` : `⏳ Financial data is loading.` };
      const returnRate = summary?.return_rate ? (summary.return_rate * 100).toFixed(1) : '?';
      // Revenue by segment using real backend values
      const segs     = ds.segments();
      const segLines = segs.map(s => {
        const r = ds.getSegRevenue(s.id);
        return r > 0 ? `- **${s.name}** : ${ds.getSegRevStr(s.id)}` : null;
      }).filter(Boolean).join('\n');
      return {
        text: lang === 'fr'
          ? `💰 **KPIs financiers :**\n\n- **Revenu total :** ${revenue.toLocaleString()} KWD\n- **AOV :** ${aov.toFixed(0)} KWD\n- **Clients :** ${total.toLocaleString()}\n- **Taux de retour :** ${returnRate}%\n${segLines ? `\n**Revenu par segment :**\n${segLines}` : ''}\n\n💡 Souhaitez-vous identifier les meilleures opportunités de croissance ?`
          : `💰 **Financial KPIs:**\n\n- **Total revenue:** ${revenue.toLocaleString()} KWD\n- **AOV:** ${aov.toFixed(0)} KWD\n- **Customers:** ${total.toLocaleString()}\n- **Return rate:** ${returnRate}%\n${segLines ? `\n**Revenue by segment:**\n${segLines}` : ''}\n\n💡 Would you like me to identify the best growth opportunities?`,
      };
    },
  },

  // ── 8. Campaign request ───────────────────────────────────────────────────
  {
    intent: 'campaign_request',
    keywords: ['campagne', 'campaign', 'lancer campagne', 'creer campagne', 'create campaign', 'launch campaign'],
    excludeKeywords: ['at risk', 'vip', 'lost', 'perdu', 'loyal', 'whatsapp'],
    buildResponse: (ds, lang) => {
      const segs   = ds.segments();
      const atRisk = segs.find(s => s.id === 2);
      const counts = ds.segmentCounts();
      const count  = atRisk ? (counts[2] ?? 0) : 0;
      return {
        text: lang === 'fr'
          ? `🎯 **Créateur de campagne — prêt à lancer :**\n\n${atRisk && count > 0 ? `💡 Votre segment **À Risque** compte **${count.toLocaleString()} clients** — meilleur ROI pour une campagne de rétention.` : `Précisez votre cible et je génèrerai le message complet.`}`
          : `🎯 **Campaign builder — ready to launch:**\n\n${atRisk && count > 0 ? `💡 Your **At Risk** segment has **${count.toLocaleString()} customers** — highest ROI for a retention campaign.` : `Specify your target and I'll generate the full message.`}`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Lancer une campagne de rétention` : `Launch retention campaign`,
          icon:  '🚀',
          params: {
            segment: atRisk?.name ?? 'At Risk',
            channel: 'email',
            subject: lang === 'fr' ? `Nous avons quelque chose de spécial pour vous` : `We have something special for you`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nOffre exclusive : 15% de réduction sur votre prochaine commande.\n\nCode : SPECIAL15 — valable 72h`
              : `Hi [First Name],\n\nExclusive offer: 15% off your next order.\n\nCode: SPECIAL15 — valid 72h`,
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
    buildResponse: (ds, lang) => {
      const segs   = ds.segments();
      const atRisk = segs.find(s => s.id === 2);
      const counts = ds.segmentCounts();
      const count  = atRisk ? (counts[2] ?? 0) : 0;
      return {
        text: lang === 'fr'
          ? `💬 **Campagne WhatsApp — prête à envoyer :**\n\nMessage personnalisé pour vos clients À Risque. Cliquez pour lancer.`
          : `💬 **WhatsApp campaign — ready to send:**\n\nPersonalized message for your At Risk customers. Click to launch.`,
        action: {
          type:  'send_whatsapp',
          label: lang === 'fr' ? `Envoyer WhatsApp — À Risque` : `Send WhatsApp — At Risk`,
          icon:  '💬',
          params: {
            segment: atRisk?.name ?? 'At Risk',
            body: lang === 'fr'
              ? `Bonjour [Prénom] 👋\n\nVous nous manquez ! Offre exclusive : *15% de réduction*.\n\nRépondez OUI pour votre code. Valable 72h ⏳`
              : `Hi [First Name] 👋\n\nWe miss you! Exclusive offer: *15% off*.\n\nReply YES for your code. Valid 72h only ⏳`,
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
    buildResponse: (ds, lang) => {
      const info = fmtSeg(ds, 3, lang); // id=3 is Lost
      if (!info) return { text: lang === 'fr' ? `⏳ Données en cours de chargement.` : `⏳ Data is loading.` };
      const { seg, count, pct, recency } = info;
      return {
        text: lang === 'fr'
          ? `🔄 **Segment Perdu — clients à réactiver :**\n\n- **${count.toLocaleString()} clients** (${pct}% de votre base)\n- Inactifs depuis **${recency} jours** en moyenne\n\n**Stratégie :** Campagne "Vous nous manquez" avec offre limitée.`
          : `🔄 **Lost Segment — customers to reactivate:**\n\n- **${count.toLocaleString()} customers** (${pct}% of your base)\n- Inactive for **${recency} days** on average\n\n**Strategy:** "We miss you" campaign with a time-limited offer.`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Campagne reconquête Perdus (${count.toLocaleString()})` : `Win-back Lost customers (${count.toLocaleString()})`,
          icon:  '🔄',
          params: {
            segment: seg.name,
            channel: 'email+whatsapp',
            subject: lang === 'fr' ? `Ça fait longtemps... voici un cadeau` : `It's been a while... here's a gift`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nVous nous manquez ! 20% de réduction sur votre prochaine commande.\n\nCode : RETOUR20 — expire dans 72h ⏰`
              : `Hi [First Name],\n\nWe miss you! 20% off your next order.\n\nCode: COMEBACK20 — expires in 72h ⏰`,
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
    buildResponse: (ds, lang) => {
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      const agg    = ds.agg();
      const total  = ds.totalCustomers();
      if (!segs.length) return { text: lang === 'fr' ? `⏳ Données en cours de chargement.` : `⏳ Data is loading.` };
      const rows = segs.map(s => {
        const a   = agg[s.id] ?? {};
        const c   = counts[s.id] ?? 0;
        const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
        return `**${s.name}** (${pct}%) · ${lang === 'fr' ? 'Dépense' : 'Spend'}: ${Number(a.avg_spend ?? 0).toFixed(0)} KWD · AOV: ${Number(a.avg_aov ?? 0).toFixed(0)} KWD · ${lang === 'fr' ? 'Récence' : 'Recency'}: ${Number(a.avg_recency ?? 0).toFixed(0)}j`;
      }).join('\n');
      return {
        text: lang === 'fr'
          ? `📈 **Comparaison de tous les segments :**\n\n${rows}\n\n💡 Sur lequel souhaitez-vous agir ?`
          : `📈 **All segments comparison:**\n\n${rows}\n\n💡 Which one would you like to act on?`,
      };
    },
  },

  // ── 12. Total customers ───────────────────────────────────────────────────
  {
    intent: 'total_customers',
    keywords: ['combien de client', 'nombre de client', 'total client', 'base client', 'how many customers', 'total customers', 'customer count', 'customer base'],
    buildResponse: (ds, lang) => {
      const total  = ds.totalCustomers();
      const segs   = ds.segments();
      const counts = ds.segmentCounts();
      if (!total) return { text: lang === 'fr' ? `⏳ Données en cours de chargement.` : `⏳ Data is loading.` };
      const lines = segs.map(s => {
        const c   = counts[s.id] ?? 0;
        const pct = ((c / total) * 100).toFixed(1);
        return `- **${s.name}** : ${c.toLocaleString()} (${pct}%)`;
      }).join('\n');
      return {
        text: lang === 'fr'
          ? `👥 **Base clients totale : ${total.toLocaleString()} clients**\n\n${lines}`
          : `👥 **Total customer base: ${total.toLocaleString()} customers**\n\n${lines}`,
      };
    },
  },

  // ── 13. Convert Loyal → VIP ───────────────────────────────────────────────
  {
    intent: 'convert_to_vip',
    keywords: ['convertir', 'convert', 'passer en vip', 'devenir vip', 'loyal en vip', 'upgrade', 'convert to vip', 'become vip', 'loyal to vip'],
    buildResponse: (ds, lang) => {
      const info  = fmtSeg(ds, 1, lang);
      const count = info?.count ?? 0;
      const spend = info?.spend ?? '?';
      const seg   = info?.seg;
      return {
        text: lang === 'fr'
          ? `🚀 **Stratégie Loyal → VIP :**\n\n${seg ? `**${count.toLocaleString()} clients Loyaux** (dépense moy. ${spend} KWD) à convertir.\n\n` : ''}**Plan 3 étapes :**\n1. Identifier ceux à fort AOV, récence < 30j\n2. Inciter : points, accès anticipé, -10%\n3. Email "Vous êtes presque VIP" avec barre de progression`
          : `🚀 **Loyal → VIP conversion strategy:**\n\n${seg ? `**${count.toLocaleString()} Loyal customers** (avg. spend ${spend} KWD) to convert.\n\n` : ''}**3-step plan:**\n1. Identify high AOV, recency < 30d\n2. Incentivize: points, early access, -10%\n3. "You're almost VIP" email with progress bar`,
        action: {
          type:  'create_campaign',
          label: lang === 'fr' ? `Campagne upgrade VIP — Loyaux (${count.toLocaleString()})` : `VIP upgrade — Loyal customers (${count.toLocaleString()})`,
          icon:  '⭐',
          params: {
            segment: seg?.name ?? 'Loyal',
            channel: 'email',
            subject: lang === 'fr' ? `Vous êtes presque VIP 🌟` : `You're almost VIP 🌟`,
            body: lang === 'fr'
              ? `Bonjour [Prénom],\n\nUn achat de plus ce mois-ci et vous devenez VIP !\n\n✓ Livraison premium offerte\n✓ Accès anticipé aux collections\n✓ Offres exclusives VIP\n\nCode : PRESQUE VIP — -10% sur votre prochaine commande`
              : `Hi [First Name],\n\nOne more purchase this month and you become VIP!\n\n✓ Free premium shipping\n✓ Early access to collections\n✓ Exclusive VIP offers\n\nCode: ALMOSTEVIP — 10% off your next order`,
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
    buildResponse: (_, lang) => ({
      text: lang === 'fr'
        ? `De rien ! 😊 N'hésitez pas si vous avez d'autres questions.`
        : `You're welcome! 😊 Feel free to ask if you need anything else.`,
    }),
  },
];