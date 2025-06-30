// scripts/deploy.sh
#!/bin/bash

# Production deployment script

echo "🚀 Starting ResumeCraft API deployment..."

# Load environment variables
if [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
fi

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Run database migrations
echo "🗄️  Running database migrations..."
npm run migrate

# Build and tag Docker image
echo "🐳 Building Docker image..."
docker build -t resumecraft-api:latest .

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Start new containers
echo "▶️  Starting new containers..."
docker-compose up -d

# Health check
echo "🏥 Performing health check..."
sleep 10
curl -f http://localhost:5000/api/health || exit 1

echo "✅ Deployment complete!"