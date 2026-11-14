#!/bin/bash
# Quick start script for the Wellness Platform

set -e

echo "🚀 Starting Wellness & Population Health Analytics Platform"
echo ""

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"
echo ""

# Check if .env file exists
if [ ! -f backend/.env ]; then
    echo "📝 Creating .env file..."
    cat > backend/.env << EOF
DATABASE_URL=postgresql://wellness_user:wellness_password@postgres:5432/wellness_db
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=INFO
MAX_UPLOAD_SIZE=10485760
EOF
fi

# Start services with Docker Compose
echo "🐳 Starting Docker services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
    echo ""
    echo "📍 Access the platform:"
    echo "   Frontend:  http://localhost:3000"
    echo "   Backend:   http://localhost:8000"
    echo "   API Docs:  http://localhost:8000/docs"
    echo ""
    echo "📊 Sample Data:"
    echo "   See: backend/sample_data/"
    echo ""
    echo "⚠️  Initial setup:"
    echo "   1. Upload sample Excel file via /collect"
    echo "   2. Review data in /processing"
    echo "   3. Approve dataset"
    echo "   4. View dashboard at /dashboard"
else
    echo "❌ Services failed to start. Check Docker Compose logs:"
    docker-compose logs
    exit 1
fi
