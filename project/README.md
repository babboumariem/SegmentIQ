# SegmentIQ — The3Beez Platform
## Architecture : Angular 17 + FastAPI + MongoDB

---

## Prérequis

- Python 3.10+
- Node.js 18+ et npm
- MongoDB Community Edition 8.x
- Angular CLI : `npm install -g @angular/cli`

---

## Démarrage (ordre obligatoire)

### Étape 1 — Installer et démarrer MongoDB

Télécharger et installer MongoDB Community Edition :
https://www.mongodb.com/try/download/community
→ Choisir Windows, version 8.x, package MSI
→ Installer avec "Complete" + cocher "Install MongoDB as a Service"

Vérifier que MongoDB tourne :
```bash
mongosh
```

---

### Étape 2 — Configurer la clé API Anthropic (Chatbot)

Dans `project/segmentiq-backend/`, créer un fichier `.env` :
```
ANTHROPIC_API_KEY=sk-ant-VOTRE-CLE-ICI
```
Obtenir une clé sur : https://console.anthropic.com/

---

### Étape 3 — Installer les dépendances Python

```bash
cd project\segmentiq-backend
pip install -r requirements.txt
```

---

### Étape 4 — Vérifier les fichiers CSV

Les fichiers suivants doivent être présents dans `project\segmentiq-backend\data\` :

| Fichier | Description | Statut |
|---------|-------------|--------|
| `The3B.User.csv` | 26 383 utilisateurs inscrits | Obligatoire |
| `The3B.UserAddress.csv` | Adresses / gouvernorats | Obligatoire |
| `The3B.UserPurshase.csv` | 229 155 commandes (source principale) | Obligatoire |
| `The3B.Product.csv` | Catalogue produits | Obligatoire |
| `The3B.ProductCategory.csv` | Catégories de produits | Obligatoire |
| `The3B.ProductIngredient.csv` | Ingrédients des produits | Obligatoire |
| `The3B.Collection.csv` | Collections | Obligatoire |
| `The3B.ProductForCollection.csv` | Produits par collection | Obligatoire |
| `The3B.PaymentLog.csv` | Logs de paiement | Obligatoire |
| `The3B.Offer.csv` | Offres et promotions | Obligatoire |
| `The3B.Country.csv` | Référentiel pays | Obligatoire |
| `The3B.DeliveryRequest.csv` | Fichier vide dans ce dataset | Présent mais vide |

> ⚠️ Ne pas déplacer ni renommer ces fichiers.

---

### Étape 5 — Importer les données dans MongoDB

```bash
cd project\segmentiq-backend
python import_data.py
```

À lancer **une seule fois** (ou après mise à jour des CSV). Cette commande :
1. Lit les fichiers CSV The3B
2. Nettoie et transforme les données (`clean_data.py`)
3. Lance la segmentation K-Means (K=4) + PCA (`segment_engine.py`)
4. Insère tous les résultats dans MongoDB (base : `the3beez`)

Durée estimée : **3 à 10 minutes** selon la machine.

---

### Étape 6 — Lancer le backend FastAPI

```bash
cd project\segmentiq-backend
uvicorn main:app --reload --port 8000
```

API disponible sur : http://localhost:8000

---

### Étape 7 — Lancer le frontend Angular (autre terminal)

```bash
cd project\segmentiq-frontend
npm install
ng serve
```

Application disponible sur : http://localhost:4200

---

## Données The3Beez (réelles)

| Indicateur | Valeur |
|---|---|
| Utilisateurs inscrits | 26 383 |
| Clients ayant acheté (Status=1) | **11 074** |
| Commandes payées | 226 370 |
| Offres / promotions | 1 578 |
| Pays référencés | 8 |

---

## ML Pipeline (8 étapes)

1. **Raw Data**              — 11 fichiers CSV The3B
2. **Data Cleaning**         — Suppression doublons, nulls, conversion types (`clean_data.py`)
3. **Feature Engineering**   — RFM, spend_velocity, AOV, CLV slope, diversity (10 features)
4. **Data Preprocessing**    — Winsorisation P1/P99 + **RobustScaler** (médiane + IQR)
5. **K-Means Clustering**    — fit_predict, K=4, n_init=10, random_state=42
6. **Customer Segmentation** — Remap clusters par dépense décroissante → labels métier
7. **PCA Visualization**     — PCA 2D APRÈS K-Means (visualisation uniquement)
8. **Business Insights**     — KPIs, scatter PCA, z-scores, campagnes, export PDF

### Features utilisées par le modèle

| Feature | Description |
|---------|-------------|
| `total_spend` | Dépense totale |
| `order_count` | Nombre de commandes uniques |
| `recency` | Jours depuis la dernière commande |
| `aov` | Panier moyen (Average Order Value) |
| `avg_discount` | Remise moyenne appliquée |
| `active_months` | Nombre de mois d'activité |
| `return_rate` | Taux de retour |
| `diversity` | Diversité des catégories achetées |
| `spend_velocity` | Dépense mensuelle moyenne |
| `clv_slope` | Tendance d'évolution de la valeur client |

---

## Segments (K-Means K=4)

| ID | Label | Profil |
|----|-------|--------|
| 0 | 👑 VIP | Forte dépense, haute fréquence, activité récente |
| 1 | 💚 Loyal | Acheteurs réguliers, engagement constant, forte LTV |
| 2 | ⚠️ At Risk | Auparavant actifs, maintenant en retrait |
| 3 | 💤 Lost | Faibles dépenses, récence élevée, risque de churn |

Les counts par segment sont recalculés dynamiquement à chaque import.

---

## Lancement rapide (script automatique)

Un script `start.bat` est disponible à la racine du projet.
Il lance automatiquement le backend (port 8000) puis le frontend (port 4200).

> ⚠️ `import_data.py` doit avoir été exécuté au préalable.