# Contributing to AI Model Registry

We welcome contributions to the AI Model Registry project! This document provides guidelines for contributing to the project.

## Development Setup

1. **Prerequisites**
   - Node.js 18+ and npm 9+
   - Docker and Docker Compose
   - Git

2. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/ai-model-registry.git
   cd ai-model-registry
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Start Development Environment**
   ```bash
   docker-compose up -d
   npm run dev
   ```

## Code Standards

### TypeScript
- Use TypeScript for all new code
- Follow strict type checking
- Use meaningful type definitions
- Avoid `any` types when possible

### Code Style
- Use ESLint and Prettier for code formatting
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Testing
- Write unit tests for new functionality
- Maintain test coverage above 80%
- Use descriptive test names
- Test both success and error cases

## Pull Request Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Follow the code standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run test
   npm run lint
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

## Project Structure

```
ai-model-registry/
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API services
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
│   └── public/             # Static assets
├── backend/                 # Node.js backend
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── services/       # Business logic services
│   │   ├── models/         # Data models
│   │   ├── middleware/     # Express middleware
│   │   ├── config/         # Configuration files
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
│   └── tests/              # Test files
└── docs/                   # Documentation
```

## Getting Help

- Check existing issues and discussions
- Create a new issue for bugs or feature requests
- Join our community discussions
- Read the documentation

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

Thank you for contributing to AI Model Registry!