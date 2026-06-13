# ATTENDX — AI-Powered Attendance Platform

> A production-ready Smart Attendance Management System using Face Recognition and AI-powered analytics for educational institutions.

![Tech Stack](https://img.shields.io/badge/React-18-blue) ![Flask](https://img.shields.io/badge/Flask-3.1-green) ![OpenCV](https://img.shields.io/badge/OpenCV-4.10-red) ![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)

## ✨ Features

### Core
- **Face Registration** — Capture 40+ face images, generate 128-dim encodings
- **Real-time Recognition** — Live webcam feed with face detection
- **Automatic Attendance** — Mark present/absent without manual intervention
- **GPS + Network Validation** — Verify student location via GPS and WiFi/IP

### Portals
- **Super Admin Portal** — Teacher management, GPS locations, network config, audit logs
- **Teacher Portal** — Session management, student roster, attendance reports, CSV import
- **Student Portal** — Dashboard, attendance history, face registration, notifications

### Intelligence
- **Predictive Analytics** — AI-powered attendance risk forecasting
- **Session Reports** — Detailed session history with sortable/filterable records
- **CSV/PDF Export** — Export reports in multiple formats

### Design
- **Dark/Light Mode** — Premium UI with glassmorphism and micro-animations
- **Responsive** — Works on desktop, tablet, and mobile
- **Custom Branding** — ATTENDX logo with futuristic design

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite + TailwindCSS | UI, dashboards, webcam |
| Backend | Flask (Python) | REST API, business logic |
| AI/Vision | OpenCV + face_recognition + dlib | Face detection & matching |
| Database | MySQL + SQLAlchemy | Data persistence |
| Auth | JWT + Bcrypt | Authentication |
| Email | Flask-Mail + APScheduler | Automated notifications |

## 📁 Project Structure

```
attendx/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Flask app factory
│   │   ├── config.py            # Configuration
│   │   ├── extensions.py        # DB, JWT, Mail, CORS
│   │   ├── scheduler.py         # APScheduler jobs
│   │   ├── models/              # SQLAlchemy models
│   │   ├── routes/              # API blueprints
│   │   │   ├── auth.py          # Authentication
│   │   │   ├── admin.py         # Super admin
│   │   │   ├── teacher.py       # Teacher portal
│   │   │   ├── students.py      # Student management
│   │   │   ├── faces.py         # Face recognition
│   │   │   ├── attendance.py    # Attendance sessions
│   │   │   ├── reports.py       # CSV/PDF reports
│   │   │   ├── analytics.py     # Predictive analytics
│   │   │   └── notifications.py # Alerts
│   │   ├── services/            # Business logic
│   │   └── utils/               # Decorators, helpers
│   ├── requirements.txt
│   ├── run.py                   # Entry point
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/                 # Axios config
│   │   ├── components/          # Reusable UI
│   │   ├── context/             # Auth state
│   │   ├── pages/               # All portal pages
│   │   ├── utils/               # Route guards
│   │   ├── App.jsx              # Root router
│   │   └── index.css            # Design system
│   ├── package.json
│   └── vite.config.js
├── Procfile                     # For Render/Railway
├── .gitignore
└── README.md
```

## 🚀 Local Development

### Prerequisites
- Python 3.9+
- MySQL 8.0+
- Node.js 18+
- CMake (for dlib/face_recognition)

### 1. Database Setup
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS attendance_db;"
```

### 2. Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your MySQL credentials

python run.py
# ✅ Server runs on http://localhost:5001
# ✅ Default super admin: admin@attendance.com / SuperAdmin@123
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# ✅ App runs on http://localhost:3000
```

## ☁️ Cloud Deployment

### Backend (Render / Railway)
1. Push to GitHub
2. Connect your GitHub repo to [Render](https://render.com)
3. Create a **Web Service** pointing to the `backend/` directory
4. Set **Build Command**: `pip install -r requirements.txt`
5. Set **Start Command**: `gunicorn run:app --bind 0.0.0.0:$PORT --timeout 120`
6. Add environment variables from `.env.example`
7. Use a cloud MySQL (PlanetScale, TiDB, Railway, or Aiven)

### Frontend (Vercel / Render Static)
1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Set **Root Directory**: `frontend`
3. Set **Build Command**: `npm run build`
4. Set **Output Directory**: `dist`
5. Add env variable: `VITE_API_URL=https://your-backend.onrender.com/api`

## 🔑 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@attendance.com | SuperAdmin@123 |
| Teacher | (created by admin) | Faculty@123 |
| Student | (created by teacher) | Institution@123 |

## 📜 License

MIT License
