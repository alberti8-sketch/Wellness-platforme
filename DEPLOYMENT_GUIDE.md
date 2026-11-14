# DEPLOYMENT_GUIDE.md

# Wellness Platform - Deployment Guide

## 📋 Prerequisites

- Docker & Docker Compose
- 8GB RAM minimum
- 10GB disk space
- PostgreSQL 14+ (or use Docker version)

## 🚀 Quick Start (Docker Compose)

```bash
# Clone repository
git clone https://github.com/Tikinasss/Wellness-platforme
cd Wellness-platforme

# Make script executable
chmod +x start.sh

# Start entire stack
./start.sh

# Or use Docker Compose directly
docker-compose up -d
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Postgres: localhost:5432

---

## 🔧 Manual Setup

### Backend Setup

```bash
cd backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
DATABASE_URL=sqlite:///./wellness.db
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=INFO
EOF

# Initialize database
python -c "from app.database import init_db; init_db()"

# Run server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Or build for production
npm run build
npm start
```

---

## 🗄️ Database Setup

### Option 1: PostgreSQL with Docker

```bash
docker run -d \
  --name wellness-postgres \
  -e POSTGRES_DB=wellness_db \
  -e POSTGRES_USER=wellness_user \
  -e POSTGRES_PASSWORD=wellness_password \
  -p 5432:5432 \
  postgres:15-alpine
```

### Option 2: PostgreSQL Local

```sql
CREATE USER wellness_user WITH PASSWORD 'wellness_password';
CREATE DATABASE wellness_db OWNER wellness_user;

-- Run migrations
-- psql -U wellness_user -d wellness_db < migrations/001_initial.sql
```

### Option 3: SQLite (Development Only)

Database is auto-created at `backend/wellness.db`

---

## 📦 Production Deployment

### AWS ECS

```bash
# Build and push Docker images
docker build -t wellness-backend:latest backend/
docker build -t wellness-frontend:latest frontend/

docker tag wellness-backend:latest <account>.dkr.ecr.<region>.amazonaws.com/wellness-backend:latest
docker tag wellness-frontend:latest <account>.dkr.ecr.<region>.amazonaws.com/wellness-frontend:latest

docker push <account>.dkr.ecr.<region>.amazonaws.com/wellness-backend:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/wellness-frontend:latest
```

### Kubernetes

```bash
# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml

# Check deployments
kubectl get pods -n wellness
```

### Vercel (Frontend)

```bash
# Connect GitHub repository
# Configure environment
NEXT_PUBLIC_API_URL=https://api.wellness.example.com

# Deploy
vercel --prod
```

---

## 🔐 Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS properly
- [ ] Set secure environment variables
- [ ] Enable database encryption
- [ ] Configure firewall rules
- [ ] Set up WAF rules
- [ ] Enable audit logging
- [ ] Configure rate limiting
- [ ] Enable CSRF protection
- [ ] Implement API authentication (JWT)

---

## 📊 Monitoring & Logging

### CloudWatch (AWS)

```bash
# Backend logs
aws logs tail /aws/ecs/wellness-backend --follow

# Frontend logs
aws logs tail /aws/amplify/wellness-frontend --follow
```

### Local Logging

```bash
# View container logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Check specific service
docker-compose logs backend --tail 100
```

---

## 🔄 Backup & Recovery

### Database Backup

```bash
# PostgreSQL backup
pg_dump -U wellness_user wellness_db > backup_$(date +%Y%m%d).sql

# Restore
psql -U wellness_user wellness_db < backup_20240101.sql
```

### S3 Backup

```bash
# Upload to S3
aws s3 cp backup_20240101.sql s3://wellness-backups/

# List backups
aws s3 ls s3://wellness-backups/
```

---

## 📈 Performance Tuning

### PostgreSQL

```sql
-- Connection pooling
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB

-- Query optimization
work_mem = 4MB
maintenance_work_mem = 64MB
```

### FastAPI

```python
# uvicorn workers
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 4 \
  --loop uvloop
```

### Next.js

```bash
# Build optimization
npm run build
npm run analyze  # Analyze bundle size
```

---

## 🚨 Troubleshooting

### Backend Issues

```bash
# Check if port 8000 is available
lsof -i :8000

# Clear cache
rm -rf backend/__pycache__
pip cache purge

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend Issues

```bash
# Clear cache and reinstall
rm -rf frontend/node_modules frontend/.next
npm install
npm run build
```

### Database Issues

```bash
# Check PostgreSQL connection
psql -U wellness_user -h localhost -d wellness_db

# Reset database
dropdb wellness_db
createdb wellness_db
# Re-run migrations
```

---

## 📚 Additional Resources

- **API Documentation**: http://localhost:8000/docs
- **Database Schema**: `backend/app/models.py`
- **Pipeline Documentation**: `backend/app/pipeline/orchestrator.py`
- **Frontend Components**: `frontend/components/`

---

## 🆘 Support

For deployment issues:
1. Check logs: `docker-compose logs`
2. Verify environment variables
3. Ensure ports are available
4. Check database connectivity
5. Review firewall rules

---

**Last Updated**: 2024
