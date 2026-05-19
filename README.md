# Salesforce Order Management Demo

Application web locale pour démontrer Salesforce Order Management via des appels API REST.  
Utilise le **Salesforce CLI** (`sf`) — aucune Connected App requise.

## Prérequis

- Python 3.11+
- Node.js 18+
- Salesforce CLI (`sf`) déjà installé et configuré

## Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
→ http://localhost:8000/docs

## Frontend (React)

```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:5173

## Utilisation

1. Ouvrir http://localhost:5173
2. Le menu déroulant affiche automatiquement vos orgs `sf` existantes
3. **+ Add Org** → entrer un alias → le navigateur s'ouvre sur la page login Salesforce → autoriser → l'org apparaît dans le menu
4. Sélectionner l'org active et créer des commandes
