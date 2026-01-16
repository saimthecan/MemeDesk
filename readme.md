# Alpha Call

## Proje Özeti
Bu proje, kendi trade kayıtlarını ve alpha call paylaşan hesapların başarılarını takip eden kişisel bir paneldir.

### Dashboard
Dashboard, iki temel aksiyonu net ayırır:
- Trade aç: Senin gerçek alım-satım kararını kaydeder. Giriş/çıkış, kâr-zarar ve son miktar buradan takip edilir.
- Alpha Call ekle: Bir hesabın yaptığı paylaşımı kaydeder. Bu senin işlemin değil; paylaşımın performansını ölçmek içindir.

### Alpha Calls
Alpha call paylaşan hesapların performansı burada izlenir. Paylaşım anındaki mcap ve sonrası (coinin paylaşımdan sonraki ulaştığı max ve min değer) üzerinden başarı ölçülür.

### Snapshot
Snapshot, trade ve alpha calls verilerini tek bir JSON dosyada toplar. Bu format, yapay zekanin  senin trade başarıın ve alpha caller  başarılarını analiz etmesi için idealdir; hangi callerın daha güçlü olduğunu belirlemeyi ve sonraki paylaşımlarında aksiyon alıp almamayı destekler.


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

