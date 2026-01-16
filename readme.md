# Shitcoin App

## Gereksinimler
- Python 3.12+
- Node.js 20+
- (Opsiyonel) Docker Desktop

## Normal (Docker'sız) Çalıştırma

### Backend
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000


Backend env dosyası: `backend/.env`  
Zorunlu: `DATABASE_URL`

### Frontend
Yeni bir terminal aç:
cd frontend
npm install
npm run dev


Frontend API URL ayarı:
- `NEXT_PUBLIC_API_URL` (örnek: `http://127.0.0.1:8000`)

## Docker ile Çalıştırma (Dev)
Kod değişince otomatik yansır.
docker compose -f docker-compose.dev.yml up --build -d


Durdurmak için:
docker compose -f docker-compose.dev.yml down


Frontend: http://localhost:3000  
Backend: http://localhost:8000

## Docker ile Çalıştırma (Prod benzeri)
docker compose up --build -d


Durdurmak için:
docker compose down

