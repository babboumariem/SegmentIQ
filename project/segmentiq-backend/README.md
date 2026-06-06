# SegmentIQ — Backend

FastAPI backend avec segmentation client ML (K-Means K=4) + Chatbot IA (Claude Anthropic).

---

## Stack technique

| Composant | Rôle |
|-----------|------|
| **FastAPI** | API REST |
| **MongoDB** (`the3beez`) | Base de données principale |
| **pymongo** | Connexion MongoDB |
| **scikit-learn** | K-Means, PCA, StandardScaler |
| **pandas / numpy** | Traitement des données |
| **Anthropic Claude** | Chatbot intelligent intégré |
| **python-dotenv** | Gestion des variables d'environnement |

---

## Installation

```bash
pip install -r requirements.txt
```

---

## Configuration (.env)

Créer un fichier `.env` dans ce dossier :

```
ANTHROPIC_API_KEY=sk-ant-VOTRE-CLE-ICI
```

Obtenir une clé sur : https://console.anthropic.com/

---

## Import des données (obligatoire au premier lancement)

```bash
python import_data.py
```

> **MongoDB est obligatoire.** Le backend lit exclusivement depuis MongoDB.
> `import_data.py` doit être lancé en premier pour charger les CSV et entraîner le modèle.
> Durée estimée : 3 à 10 minutes.

---

## Lancer le serveur

```bash
uvicorn main:app --reload --port 8000
```

---

## Collections MongoDB (base : `the3beez`)

| Collection | Contenu | Nb docs |
|------------|---------|---------|
| `segments_feat` | Features complètes par client | 11 074 |
| `segments_meta` | Metadata des segments + counts | 4 |
| `segments_agg` | Agrégations par segment | 4 |
| `segments_sample` | Échantillon PCA pour visualisation | 1 000 |
| `summary` | KPIs globaux | 1 |
| `feature_importance` | Importance des features K-Means | 10 |
| `offers` | Promotions et offres | 1 578 |
| `countries` | Référentiel pays | 8 |
| `actions` | Actions marketing par segment | 1 |
| `categories` | Liste des catégories produit | 1 |

> ⚠️ Il n'existe pas de collections `products`, `orders`, ou `returns` en base.
> Toutes les données analytiques sont dans `segments_feat` et `summary`.

---

## Endpoints API

### Segmentation & ML

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/segments` | Métadonnées des 4 segments + counts |
| GET | `/api/agg` | Stats agrégées par segment |
| GET | `/api/sample` | Échantillon 1 000 clients avec coordonnées PCA |
| GET | `/api/sample/download` | Export CSV de l'échantillon |
| GET | `/api/actions` | Actions marketing recommandées par segment |
| GET | `/api/feature-importance` | Importance des 10 features K-Means |
| GET | `/api/pca-meta` | Variance expliquée + loadings PCA |
| POST | `/api/segments/custom` | Créer un segment personnalisé |
| GET | `/api/segments/custom` | Lister les segments personnalisés |
| POST | `/api/retrain` | Relancer K-Means avec nouveaux paramètres |

### KPIs & Configuration

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/summary` | KPIs globaux (revenue, commandes, clients, AOV…) |
| GET | `/api/payment-stats` | Stats paiement (gateway, taux d'échec) |
| GET | `/api/config` | Configuration courante du modèle ML |
| POST | `/api/config/apply` | Appliquer une nouvelle configuration |

### Clients

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/customers` | Liste paginée et filtrable (limit, offset, region, gender, seg…) |
| GET | `/api/customers/download` | Export CSV des clients |
| GET | `/api/customers/{customer_id}` | Détail complet d'un client |

### Référentiels

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/categories` | Catégories de produits |
| GET | `/api/offers` | Offres et promotions (max 5 000) |
| GET | `/api/offers/stats` | Statistiques d'utilisation des offres |
| GET | `/api/countries` | Référentiel pays (8 pays) |

### Campagnes Marketing

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/campaigns` | Lister les campagnes |
| POST | `/api/campaigns` | Créer une campagne |
| PATCH | `/api/campaigns/{campaign_id}` | Modifier une campagne |
| PATCH | `/api/campaigns/{campaign_id}/status` | Changer le statut |
| DELETE | `/api/campaigns/{campaign_id}` | Supprimer une campagne |

### Envois Email

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/email/sends` | Lister les envois email |
| POST | `/api/email/sends` | Créer un envoi email |
| PATCH | `/api/email/sends/{send_id}/status` | Mettre à jour le statut |
| DELETE | `/api/email/sends/{send_id}` | Supprimer un envoi |

### Envois WhatsApp

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/whatsapp/sends` | Lister les envois WhatsApp |
| POST | `/api/whatsapp/sends` | Créer un envoi WhatsApp |
| POST | `/api/whatsapp/send` | Envoyer un message WhatsApp direct |
| PATCH | `/api/whatsapp/{send_id}/status` | Mettre à jour le statut |
| DELETE | `/api/whatsapp/sends/{send_id}` | Supprimer un envoi |

### Chatbot IA (Claude Anthropic)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/chat` | Envoyer un message au chatbot |
| POST | `/api/chat/sessions` | Créer une session de chat |
| GET | `/api/chat/sessions` | Lister les sessions |
| GET | `/api/chat/sessions/{session_id}` | Détail d'une session |
| DELETE | `/api/chat/sessions/{session_id}` | Supprimer une session |
| PATCH | `/api/chat/sessions/{session_id}/messages` | Mettre à jour les messages |

### Alertes

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/alerts` | Lister les alertes actives |
| POST | `/api/alerts/{alert_id}/acknowledge` | Acquitter une alerte |

---

## Segments

| ID | Nom | Profil |
|----|-----|--------|
| 0 | 👑 VIP | Forte dépense, fréquence élevée, activité récente |
| 1 | 💚 Loyal | Acheteurs réguliers, engagement constant, forte LTV |
| 2 | ⚠️ At Risk | Auparavant actifs, maintenant en retrait |
| 3 | 💤 Lost | Faibles dépenses, récence élevée, risque de churn |

---

## Structure des fichiers

```
segmentiq-backend/
├── main.py                    # API FastAPI — 43 endpoints
├── import_data.py             # Import CSV → MongoDB + entraînement ML
├── segment_engine.py          # K-Means, PCA, StandardScaler, feature engineering
├── clean_data.py              # Nettoyage et transformation des CSV
├── database.py                # Connexion MongoDB + 10 collections
├── requirements.txt           # Dépendances Python
├── .env                       # Clé API Anthropic (à créer, ne pas committer)
└── data/
    ├── The3B.User.csv
    ├── The3B.UserAddress.csv
    ├── The3B.UserPurshase.csv
    ├── The3B.Product.csv
    ├── The3B.ProductCategory.csv
    ├── The3B.ProductIngredient.csv
    ├── The3B.Collection.csv
    ├── The3B.ProductForCollection.csv
    ├── The3B.PaymentLog.csv
    ├── The3B.Offer.csv
    ├── The3B.Country.csv
    └── The3B.DeliveryRequest.csv  (fichier vide dans ce dataset)
```