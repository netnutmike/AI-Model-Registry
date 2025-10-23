# AI Model Registry

A comprehensive platform for AI model governance, lifecycle management, and compliance controls. This system provides a modern web frontend and microservice-based backend architecture designed to manage the complete lifecycle of AI models from registration through deployment and monitoring.

## Features

- **Model Registry**: Complete model and version management with metadata tracking
- **Governance Controls**: Policy engine with automated compliance checking
- **Evaluation Framework**: Automated testing for bias, safety, and effectiveness
- **Deployment Management**: Canary deployments with rollback capabilities
- **Audit & Compliance**: Immutable audit logs and evidence generation
- **Security**: End-to-end encryption, RBAC, and vulnerability scanning

## Architecture

This is a monorepo containing:
- **Frontend**: React application with TypeScript and Material-UI
- **Backend**: Node.js microservices with Express and TypeScript
- **Database**: PostgreSQL with Redis for caching
- **Storage**: S3-compatible object storage for artifacts

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-model-registry
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development environment**
   ```bash
   # Start all services with Docker Compose
   docker-compose up -d

   # Or run frontend and backend separately
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - MinIO Console: http://localhost:9001

### Project Structure

```
ai-model-registry/
├── frontend/                 # React frontend application
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── backend/                  # Node.js backend services
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── docker-compose.yml        # Development environment
├── package.json             # Root package.json for workspaces
└── README.md
```

## Development

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build both applications for production
- `npm run test` - Run tests for all workspaces
- `npm run lint` - Run linting for all workspaces

### Frontend Development

```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Run ESLint
```

### Backend Development

```bash
cd backend
npm run dev          # Start development server with hot reload
npm run build        # Build TypeScript to JavaScript
npm run test         # Run tests
npm run lint         # Run ESLint
```

## Docker

### Development with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Building Individual Images

```bash
# Build frontend
docker build -f frontend/Dockerfile -t ai-model-registry-frontend .

# Build backend
docker build -f backend/Dockerfile -t ai-model-registry-backend .
```

## Configuration

### Environment Variables

Create `.env` files in the respective directories:

**Backend (.env)**
```
NODE_ENV=development
PORT=8000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_model_registry
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-key
AWS_REGION=us-west-2
```

**Frontend (.env)**
```
VITE_API_BASE_URL=http://localhost:8000
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
