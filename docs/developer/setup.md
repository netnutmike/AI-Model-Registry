# Developer Setup Guide

This guide will help you set up a local development environment for the AI Model Registry.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Running the Application](#running-the-application)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Node.js**: Version 18.x or higher
- **npm**: Version 8.x or higher (comes with Node.js)
- **Docker**: Version 20.x or higher
- **Docker Compose**: Version 2.x or higher
- **Git**: Version 2.x or higher

### Optional Tools

- **VS Code**: Recommended IDE with extensions:
  - TypeScript and JavaScript Language Features
  - ESLint
  - Prettier
  - Docker
  - GitLens
- **Postman**: For API testing
- **Redis CLI**: For debugging Redis sessions
- **PostgreSQL Client**: For database debugging

### System Requirements

- **RAM**: Minimum 8GB, recommended 16GB
- **Storage**: At least 10GB free space
- **OS**: macOS, Linux, or Windows with WSL2

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/ai-model-registry.git
cd ai-model-registry
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 3. Set Up Development Environment

```bash
# Copy environment template
cp .env.example .env.local

# Copy backend environment
cp backend/.env.example backend/.env.local

# Copy frontend environment
cp frontend/.env.example frontend/.env.local
```

## Database Setup

### Using Docker Compose (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Wait for services to be ready
docker-compose logs -f postgres
# Look for "database system is ready to accept connections"
```

### Manual Database Setup

#### PostgreSQL Setup

```bash
# Install PostgreSQL (macOS with Homebrew)
brew install postgresql@14
brew services start postgresql@14

# Create database and user
createdb ai_model_registry_dev
psql ai_model_registry_dev -c "CREATE USER registry_user WITH PASSWORD 'dev_password';"
psql ai_model_registry_dev -c "GRANT ALL PRIVILEGES ON DATABASE ai_model_registry_dev TO registry_user;"
```

#### Redis Setup

```bash
# Install Redis (macOS with Homebrew)
brew install redis
brew services start redis

# Verify Redis is running
redis-cli ping
# Should return "PONG"
```

### Database Migration

```bash
cd backend

# Run database migrations
npm run migrate

# Seed development data
npm run seed:dev
```

## Environment Configuration

### Backend Environment (.env.local)

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_model_registry_dev
DB_USER=registry_user
DB_PASSWORD=dev_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-for-development
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# SSO Configuration (Optional for local dev)
OIDC_ISSUER=https://your-oidc-provider.com
OIDC_CLIENT_ID=ai-model-registry-dev
OIDC_CLIENT_SECRET=your-oidc-client-secret
OIDC_REDIRECT_URI=http://localhost:3000/api/v1/auth/callback/oidc

# AWS Configuration (for S3 artifacts)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
S3_BUCKET_NAME=ai-model-registry-dev-artifacts

# Application Configuration
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
CORS_ORIGIN=http://localhost:5173
```

### Frontend Environment (.env.local)

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_WS_BASE_URL=ws://localhost:3000

# Authentication Configuration
VITE_AUTH_PROVIDER=mock
VITE_MOCK_USER_EMAIL=developer@company.com
VITE_MOCK_USER_ROLES=MODEL_OWNER,ADMIN

# Feature Flags
VITE_ENABLE_MOCK_DATA=true
VITE_ENABLE_DEBUG_TOOLS=true
```

### Docker Environment

```yaml
# docker-compose.override.yml
version: '3.8'
services:
  postgres:
    environment:
      POSTGRES_DB: ai_model_registry_dev
      POSTGRES_USER: registry_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

volumes:
  postgres_dev_data:
  redis_dev_data:
```

## Running the Application

### Development Mode

#### Option 1: Using npm scripts (Recommended)

```bash
# Start all services
npm run dev

# This runs:
# - Backend API server on http://localhost:3000
# - Frontend dev server on http://localhost:5173
# - Database and Redis via Docker Compose
```

#### Option 2: Manual startup

```bash
# Terminal 1: Start infrastructure
docker-compose up postgres redis

# Terminal 2: Start backend
cd backend
npm run dev

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### Production Mode

```bash
# Build all applications
npm run build

# Start in production mode
npm run start
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all services in development mode |
| `npm run build` | Build all applications for production |
| `npm run start` | Start applications in production mode |
| `npm run test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint on all code |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Run TypeScript type checking |

### Backend-Specific Scripts

```bash
cd backend

# Development
npm run dev              # Start with nodemon
npm run build           # Build TypeScript
npm run start           # Start built application

# Database
npm run migrate         # Run database migrations
npm run migrate:rollback # Rollback last migration
npm run seed:dev        # Seed development data
npm run db:reset        # Reset database (drop + migrate + seed)

# Testing
npm run test            # Run all tests
npm run test:unit       # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage   # Run tests with coverage report
```

### Frontend-Specific Scripts

```bash
cd frontend

# Development
npm run dev             # Start Vite dev server
npm run build           # Build for production
npm run preview         # Preview production build

# Testing
npm run test            # Run Vitest tests
npm run test:ui         # Run tests with UI
npm run test:coverage   # Run tests with coverage

# Linting and Formatting
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues
npm run type-check      # TypeScript type checking
```

## Development Workflow

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/your-feature-name
```

### Code Quality Checks

#### Pre-commit Hooks

The project uses Husky for pre-commit hooks:

```bash
# Install pre-commit hooks
npm run prepare

# Hooks will run automatically on commit:
# - ESLint
# - Prettier
# - TypeScript type checking
# - Unit tests
```

#### Manual Quality Checks

```bash
# Run all quality checks
npm run check

# Individual checks
npm run lint
npm run type-check
npm run test
npm run format
```

### Hot Reloading

Both frontend and backend support hot reloading:

- **Backend**: Uses `nodemon` to restart on file changes
- **Frontend**: Uses Vite's HMR for instant updates
- **Database**: Changes require manual migration

### API Development

#### Using the API

```bash
# Get authentication token (mock mode)
curl -X POST http://localhost:3000/api/v1/auth/mock-login \
  -H "Content-Type: application/json" \
  -d '{"email": "developer@company.com", "roles": ["MODEL_OWNER", "ADMIN"]}'

# Use token for API calls
curl -X GET http://localhost:3000/api/v1/models \
  -H "Authorization: Bearer <token>"
```

#### API Documentation

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI Spec**: http://localhost:3000/api/v1/openapi.json

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Structure

```
backend/src/test/
├── unit/                 # Unit tests
│   ├── services/
│   ├── middleware/
│   └── utils/
├── integration/          # Integration tests
│   ├── api/
│   ├── database/
│   └── external/
└── fixtures/            # Test data and helpers

frontend/src/test/
├── components/          # Component tests
├── hooks/              # Hook tests
├── utils/              # Utility tests
└── integration/        # Integration tests
```

### Writing Tests

#### Backend Unit Test Example

```typescript
// backend/src/test/services/modelRegistry.test.ts
import { ModelRegistryService } from '../../services/modelRegistry/modelRegistryService.js';
import { DatabaseService } from '../../services/database/databaseService.js';

describe('ModelRegistryService', () => {
  let service: ModelRegistryService;
  let mockDb: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    mockDb = createMockDatabase();
    service = new ModelRegistryService(mockDb);
  });

  describe('createModel', () => {
    it('should create a model with valid data', async () => {
      const modelData = {
        name: 'test-model',
        group: 'test-group',
        description: 'Test model',
        owners: ['test@example.com'],
        riskTier: 'LOW' as const,
        tags: ['test']
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'model-id', ...modelData }]
      });

      const result = await service.createModel(modelData, 'user-id');

      expect(result).toMatchObject(modelData);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO models'),
        expect.any(Array)
      );
    });
  });
});
```

#### Frontend Component Test Example

```typescript
// frontend/src/components/ModelCard.test.tsx
import { render, screen } from '@testing-library/react';
import { ModelCard } from './ModelCard';

describe('ModelCard', () => {
  const mockModel = {
    id: 'model-1',
    name: 'test-model',
    description: 'Test model description',
    riskTier: 'LOW' as const,
    tags: ['test', 'demo']
  };

  it('renders model information correctly', () => {
    render(<ModelCard model={mockModel} />);

    expect(screen.getByText('test-model')).toBeInTheDocument();
    expect(screen.getByText('Test model description')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });
});
```

### Test Data Management

#### Database Test Setup

```typescript
// backend/src/test/setup.ts
import { DatabaseService } from '../services/database/databaseService.js';

export async function setupTestDatabase() {
  const testDb = new DatabaseService({
    host: 'localhost',
    port: 5433, // Different port for test DB
    database: 'ai_model_registry_test',
    user: 'test_user',
    password: 'test_password'
  });

  // Run migrations
  await testDb.migrate();
  
  return testDb;
}

export async function cleanupTestDatabase(db: DatabaseService) {
  // Clean up test data
  await db.query('TRUNCATE TABLE models CASCADE');
  await db.query('TRUNCATE TABLE model_versions CASCADE');
  // ... other cleanup
}
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or use different port
PORT=3001 npm run dev
```

#### Database Connection Issues

```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Check connection
psql -h localhost -p 5432 -U registry_user -d ai_model_registry_dev

# Reset database
npm run db:reset
```

#### Redis Connection Issues

```bash
# Check if Redis is running
brew services list | grep redis

# Test Redis connection
redis-cli ping

# Restart Redis
brew services restart redis
```

#### Node.js Version Issues

```bash
# Check Node.js version
node --version

# Use nvm to manage versions
nvm install 18
nvm use 18
```

#### TypeScript Compilation Errors

```bash
# Clean build cache
rm -rf backend/dist frontend/dist

# Rebuild
npm run build

# Check types only
npm run type-check
```

### Debug Mode

#### Backend Debugging

```bash
# Start with debugger
npm run dev:debug

# Or with VS Code debugger
# Use "Launch Backend" configuration
```

#### Frontend Debugging

```bash
# Enable debug mode
VITE_DEBUG=true npm run dev

# Use browser dev tools
# React DevTools extension recommended
```

### Performance Issues

#### Slow Database Queries

```bash
# Enable query logging
echo "log_statement = 'all'" >> /usr/local/var/postgres/postgresql.conf
brew services restart postgresql

# Monitor logs
tail -f /usr/local/var/log/postgres.log
```

#### Memory Issues

```bash
# Monitor memory usage
npm run dev -- --max-old-space-size=4096

# Profile with clinic.js
npm install -g clinic
clinic doctor -- npm run start
```

### Getting Help

- **Documentation**: Check `/docs` directory
- **Issues**: Create GitHub issue with reproduction steps
- **Discussions**: Use GitHub Discussions for questions
- **Slack**: Join #ai-model-registry channel (internal)

This setup guide provides everything needed to get started with local development of the AI Model Registry platform.