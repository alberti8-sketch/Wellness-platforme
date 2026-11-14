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

if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"
echo ""

# Start services with Docker Compose
echo "🐳 Starting Docker services..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo "✅ Services started successfully!"
    echo ""
    echo "📍 Access the platform:"
    echo "   Frontend:  http://localhost:3000"
    echo "   Backend:   http://localhost:8000"
    echo "   API Docs:  http://localhost:8000/docs"
    echo ""
    echo "📊 Sample Data:"
    echo "   Published analytics sample: data/wp25_communes.xlsx (ou python -m scripts.seed_demo)"
    echo "   WP25 / CNAM reference: bundled in the dashboard"
    echo ""
    echo "⚠️  Initial setup:"
    echo "   1. Upload sample Excel file via /collect"
    echo "   2. Review data in /processing"
    echo "   3. Approve dataset"
    echo "   4. View dashboard at /dashboard"
else
    echo "❌ Services failed to start. Check Docker Compose logs:"
    docker compose logs
    exit 1
fi
