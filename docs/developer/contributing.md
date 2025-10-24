# Contributing Guidelines

Welcome to the AI Model Registry project! This document provides guidelines for contributing to the codebase, including coding standards, development workflow, and best practices.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Coding Standards](#coding-standards)
4. [Testing Guidelines](#testing-guidelines)
5. [Documentation Standards](#documentation-standards)
6. [Code Review Process](#code-review-process)
7. [Release Process](#release-process)
8. [Issue Management](#issue-management)
9. [Security Guidelines](#security-guidelines)
10. [Performance Guidelines](#performance-guidelines)

## Getting Started

### Prerequisites

Before contributing, ensure you have:

1. **Development Environment**: Follow the [Setup Guide](./setup.md)
2. **Git Configuration**: Set up your Git identity and GPG signing
3. **IDE Setup**: Configure your IDE with project settings
4. **Access**: Ensure you have appropriate repository access

### First-Time Setup

```bash
# Fork the repository
git clone https://github.com/your-username/ai-model-registry.git
cd ai-model-registry

# Add upstream remote
git remote add upstream https://github.com/original-org/ai-model-registry.git

# Install dependencies and setup
npm install
npm run setup

# Verify setup
npm run check
```

## Development Workflow

### Branch Strategy

We use **Git Flow** with the following branch types:

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features and enhancements
- `bugfix/*`: Bug fixes
- `hotfix/*`: Critical production fixes
- `release/*`: Release preparation

### Feature Development Workflow

```bash
# 1. Start from develop branch
git checkout develop
git pull upstream develop

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and commit
git add .
git commit -m "feat: add new feature"

# 4. Keep branch updated
git fetch upstream
git rebase upstream/develop

# 5. Push and create PR
git push origin feature/your-feature-name
```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `build`: Build system changes

#### Examples

```bash
# Feature commit
git commit -m "feat(auth): add SSO integration with OIDC"

# Bug fix commit
git commit -m "fix(api): resolve model version state transition bug"

# Breaking change
git commit -m "feat(api)!: change model creation API structure

BREAKING CHANGE: The model creation API now requires a 'group' field"

# Multi-line commit
git commit -m "feat(evaluation): add bias detection evaluation

- Implement fairness metrics calculation
- Add demographic parity checks
- Include equalized odds evaluation
- Update evaluation report format

Closes #123"
```

### Pull Request Process

1. **Create Descriptive PR**
   - Use clear, descriptive title
   - Fill out PR template completely
   - Link related issues
   - Add appropriate labels

2. **PR Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] No breaking changes (or documented)

   ## Related Issues
   Closes #123
   ```

3. **Review Requirements**
   - At least 2 approvals required
   - All CI checks must pass
   - No merge conflicts
   - Documentation updated if needed

## Coding Standards

### TypeScript Guidelines

#### General Principles

1. **Type Safety**: Use strict TypeScript configuration
2. **Explicit Types**: Prefer explicit types over `any`
3. **Immutability**: Use `readonly` and immutable patterns
4. **Null Safety**: Handle null/undefined explicitly

#### Code Style

```typescript
// ✅ Good: Explicit types and interfaces
interface CreateModelRequest {
  readonly name: string;
  readonly description: string;
  readonly owners: readonly string[];
  readonly riskTier: RiskTier;
  readonly tags?: readonly string[];
}

// ✅ Good: Proper error handling
async function createModel(request: CreateModelRequest): Promise<Model> {
  try {
    validateModelRequest(request);
    return await modelRepository.create(request);
  } catch (error) {
    logger.error('Failed to create model', { error, request });
    throw new ModelCreationError('Model creation failed', { cause: error });
  }
}

// ❌ Bad: Using any type
function processData(data: any): any {
  return data.someProperty;
}

// ❌ Bad: No error handling
async function createModel(request: CreateModelRequest): Promise<Model> {
  return await modelRepository.create(request);
}
```

#### Naming Conventions

```typescript
// Classes: PascalCase
class ModelRegistryService {}

// Interfaces: PascalCase with descriptive names
interface ModelRepository {}
interface CreateModelRequest {}

// Functions and variables: camelCase
const modelService = new ModelRegistryService();
function validateModel() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_MODEL_NAME_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;

// Enums: PascalCase with descriptive values
enum VersionState {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved'
}

// Files: kebab-case
// model-registry.service.ts
// create-model.request.ts
```

### React/Frontend Guidelines

#### Component Structure

```typescript
// ✅ Good: Proper component structure
interface ModelCardProps {
  readonly model: Model;
  readonly onEdit?: (model: Model) => void;
  readonly className?: string;
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  onEdit,
  className
}) => {
  const handleEdit = useCallback(() => {
    onEdit?.(model);
  }, [model, onEdit]);

  return (
    <Card className={className}>
      <CardContent>
        <Typography variant="h6">{model.name}</Typography>
        <Typography variant="body2">{model.description}</Typography>
        {onEdit && (
          <Button onClick={handleEdit}>Edit</Button>
        )}
      </CardContent>
    </Card>
  );
};
```

#### Hooks Guidelines

```typescript
// ✅ Good: Custom hook with proper dependencies
export function useModels(filters?: ModelFilters) {
  return useQuery({
    queryKey: ['models', filters],
    queryFn: () => modelApi.getModels(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: Boolean(filters)
  });
}

// ✅ Good: Proper useEffect dependencies
useEffect(() => {
  if (modelId) {
    fetchModelDetails(modelId);
  }
}, [modelId, fetchModelDetails]);
```

### Backend/API Guidelines

#### Service Layer Pattern

```typescript
// ✅ Good: Service with dependency injection
export class ModelRegistryService {
  constructor(
    private readonly repository: ModelRepository,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {}

  async createModel(
    request: CreateModelRequest,
    userId: string
  ): Promise<Model> {
    this.logger.info('Creating model', { request, userId });

    // Validation
    await this.validateCreateRequest(request);

    // Business logic
    const model = new Model({
      id: generateId(),
      ...request,
      createdBy: userId,
      createdAt: new Date()
    });

    // Persistence
    await this.repository.save(model);

    // Events
    await this.eventBus.publish(
      new ModelCreatedEvent(model.id, userId)
    );

    this.logger.info('Model created successfully', { modelId: model.id });
    return model;
  }

  private async validateCreateRequest(
    request: CreateModelRequest
  ): Promise<void> {
    if (await this.repository.existsByName(request.name)) {
      throw new ConflictError('Model name already exists');
    }
  }
}
```

#### Error Handling

```typescript
// ✅ Good: Custom error classes
export class ModelNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Model not found: ${modelId}`);
    this.name = 'ModelNotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ✅ Good: Error handling middleware
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const traceId = req.headers['x-trace-id'] as string;

  if (error instanceof ValidationError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        field: error.field,
        traceId
      }
    });
  } else if (error instanceof ModelNotFoundError) {
    res.status(404).json({
      error: {
        code: 'MODEL_NOT_FOUND',
        message: error.message,
        traceId
      }
    });
  } else {
    logger.error('Unhandled error', { error, traceId });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        traceId
      }
    });
  }
}
```

### Database Guidelines

#### Migration Scripts

```sql
-- ✅ Good: Descriptive migration with rollback
-- Migration: 001_create_models_table.sql
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    "group" VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    owners TEXT[] NOT NULL,
    risk_tier VARCHAR(20) NOT NULL CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH')),
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT models_name_group_unique UNIQUE (name, "group")
);

-- Indexes for performance
CREATE INDEX idx_models_group ON models("group");
CREATE INDEX idx_models_risk_tier ON models(risk_tier);
CREATE INDEX idx_models_owners ON models USING gin(owners);
CREATE INDEX idx_models_tags ON models USING gin(tags);

-- Rollback script
-- DROP TABLE IF EXISTS models;
```

#### Query Patterns

```typescript
// ✅ Good: Parameterized queries with proper types
export class ModelRepository {
  async findByFilters(filters: ModelFilters): Promise<Model[]> {
    const query = `
      SELECT * FROM models 
      WHERE ($1::text IS NULL OR "group" = $1)
        AND ($2::text IS NULL OR risk_tier = $2)
        AND ($3::text[] IS NULL OR tags && $3)
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const result = await this.db.query(query, [
      filters.group || null,
      filters.riskTier || null,
      filters.tags || null,
      filters.limit || 20,
      filters.offset || 0
    ]);

    return result.rows.map(row => this.mapRowToModel(row));
  }
}
```

## Testing Guidelines

### Test Structure

```
src/
├── components/
│   ├── ModelCard.tsx
│   └── __tests__/
│       ├── ModelCard.test.tsx
│       └── ModelCard.integration.test.tsx
├── services/
│   ├── modelRegistry.service.ts
│   └── __tests__/
│       ├── modelRegistry.service.test.ts
│       └── modelRegistry.service.integration.test.ts
└── __tests__/
    ├── setup.ts
    ├── helpers/
    └── fixtures/
```

### Unit Testing

```typescript
// ✅ Good: Comprehensive unit test
describe('ModelRegistryService', () => {
  let service: ModelRegistryService;
  let mockRepository: jest.Mocked<ModelRepository>;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockEventBus = createMockEventBus();
    service = new ModelRegistryService(mockRepository, mockEventBus);
  });

  describe('createModel', () => {
    it('should create model with valid data', async () => {
      // Arrange
      const request = createValidModelRequest();
      const userId = 'user-123';
      mockRepository.existsByName.mockResolvedValue(false);
      mockRepository.save.mockResolvedValue(undefined);

      // Act
      const result = await service.createModel(request, userId);

      // Assert
      expect(result).toMatchObject({
        name: request.name,
        description: request.description,
        createdBy: userId
      });
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: request.name })
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.any(ModelCreatedEvent)
      );
    });

    it('should throw error when model name exists', async () => {
      // Arrange
      const request = createValidModelRequest();
      mockRepository.existsByName.mockResolvedValue(true);

      // Act & Assert
      await expect(
        service.createModel(request, 'user-123')
      ).rejects.toThrow(ConflictError);
      
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
```

### Integration Testing

```typescript
// ✅ Good: Integration test with real database
describe('ModelRepository Integration', () => {
  let repository: ModelRepository;
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new ModelRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE models CASCADE');
  });

  it('should save and retrieve model', async () => {
    // Arrange
    const model = createTestModel();

    // Act
    await repository.save(model);
    const retrieved = await repository.findById(model.id);

    // Assert
    expect(retrieved).toEqual(model);
  });
});
```

### Frontend Testing

```typescript
// ✅ Good: Component test with user interactions
describe('ModelCard', () => {
  const mockModel = createMockModel();

  it('should display model information', () => {
    render(<ModelCard model={mockModel} />);

    expect(screen.getByText(mockModel.name)).toBeInTheDocument();
    expect(screen.getByText(mockModel.description)).toBeInTheDocument();
  });

  it('should call onEdit when edit button is clicked', async () => {
    const onEdit = jest.fn();
    render(<ModelCard model={mockModel} onEdit={onEdit} />);

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockModel);
  });
});
```

### Test Coverage Requirements

- **Unit Tests**: Minimum 80% code coverage
- **Integration Tests**: Cover all API endpoints
- **E2E Tests**: Cover critical user journeys
- **Performance Tests**: Load testing for key endpoints

## Documentation Standards

### Code Documentation

```typescript
/**
 * Creates a new model in the registry with validation and audit logging.
 * 
 * @param request - The model creation request containing name, description, etc.
 * @param userId - The ID of the user creating the model
 * @returns Promise resolving to the created model
 * 
 * @throws {ValidationError} When request data is invalid
 * @throws {ConflictError} When model name already exists
 * @throws {DatabaseError} When database operation fails
 * 
 * @example
 * ```typescript
 * const model = await service.createModel({
 *   name: 'sentiment-classifier',
 *   description: 'BERT-based sentiment analysis',
 *   owners: ['user@example.com'],
 *   riskTier: 'MEDIUM'
 * }, 'user-123');
 * ```
 */
async createModel(
  request: CreateModelRequest,
  userId: string
): Promise<Model> {
  // Implementation...
}
```

### API Documentation

```typescript
/**
 * @swagger
 * /api/v1/models:
 *   post:
 *     summary: Create a new model
 *     description: Creates a new model with metadata and initial configuration
 *     tags: [Models]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateModelRequest'
 *     responses:
 *       201:
 *         description: Model created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
```

### README Standards

Each module should have a README with:

1. **Purpose**: What the module does
2. **Installation**: How to set it up
3. **Usage**: Basic usage examples
4. **API**: Public interface documentation
5. **Configuration**: Available options
6. **Examples**: Common use cases
7. **Contributing**: How to contribute

## Code Review Process

### Review Checklist

#### Functionality
- [ ] Code works as intended
- [ ] Edge cases are handled
- [ ] Error handling is appropriate
- [ ] Performance is acceptable

#### Code Quality
- [ ] Code is readable and maintainable
- [ ] Follows coding standards
- [ ] No code duplication
- [ ] Proper abstractions used

#### Testing
- [ ] Adequate test coverage
- [ ] Tests are meaningful
- [ ] Tests pass consistently
- [ ] Integration tests included

#### Security
- [ ] No security vulnerabilities
- [ ] Input validation implemented
- [ ] Authentication/authorization correct
- [ ] Sensitive data protected

#### Documentation
- [ ] Code is well-documented
- [ ] API documentation updated
- [ ] README updated if needed
- [ ] Breaking changes documented

### Review Guidelines

#### For Authors
1. **Self-Review**: Review your own code first
2. **Small PRs**: Keep changes focused and small
3. **Clear Description**: Explain what and why
4. **Tests**: Include appropriate tests
5. **Documentation**: Update relevant docs

#### For Reviewers
1. **Be Constructive**: Provide helpful feedback
2. **Ask Questions**: Understand the reasoning
3. **Suggest Improvements**: Offer better alternatives
4. **Approve Quickly**: Don't block unnecessarily
5. **Learn**: Use reviews as learning opportunities

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Workflow

```bash
# 1. Create release branch
git checkout develop
git checkout -b release/v1.2.0

# 2. Update version numbers
npm version 1.2.0 --no-git-tag-version

# 3. Update CHANGELOG.md
# Add release notes and breaking changes

# 4. Commit and push
git commit -am "chore: prepare release v1.2.0"
git push origin release/v1.2.0

# 5. Create PR to main
# After approval and merge:

# 6. Tag release
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0

# 7. Merge back to develop
git checkout develop
git merge main
git push origin develop
```

### Release Notes

```markdown
# Release v1.2.0

## 🚀 New Features
- Add model evaluation framework (#123)
- Implement policy engine (#124)
- Add audit logging (#125)

## 🐛 Bug Fixes
- Fix model version state transitions (#126)
- Resolve authentication token refresh issue (#127)

## 💥 Breaking Changes
- Model creation API now requires `group` field
- Authentication endpoints moved to `/auth/v2/`

## 📚 Documentation
- Add API usage examples
- Update deployment guide

## 🔧 Internal Changes
- Upgrade to Node.js 18
- Improve test coverage to 85%
```

## Issue Management

### Issue Templates

#### Bug Report
```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g. macOS]
- Browser: [e.g. chrome, safari]
- Version: [e.g. 22]

**Additional context**
Any other context about the problem.
```

#### Feature Request
```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context or screenshots about the feature request.
```

### Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements or additions to documentation
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `priority/high`: High priority
- `priority/medium`: Medium priority
- `priority/low`: Low priority

## Security Guidelines

### Secure Coding Practices

1. **Input Validation**
   ```typescript
   // ✅ Good: Validate all inputs
   function validateEmail(email: string): boolean {
     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
     return emailRegex.test(email) && email.length <= 254;
   }
   ```

2. **SQL Injection Prevention**
   ```typescript
   // ✅ Good: Use parameterized queries
   const result = await db.query(
     'SELECT * FROM models WHERE id = $1',
     [modelId]
   );
   
   // ❌ Bad: String concatenation
   const result = await db.query(
     `SELECT * FROM models WHERE id = '${modelId}'`
   );
   ```

3. **Authentication**
   ```typescript
   // ✅ Good: Proper token validation
   function validateToken(token: string): DecodedToken {
     try {
       return jwt.verify(token, publicKey, {
         algorithms: ['RS256'],
         issuer: 'ai-model-registry'
       });
     } catch (error) {
       throw new UnauthorizedError('Invalid token');
     }
   }
   ```

### Security Review Checklist

- [ ] Input validation implemented
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Authentication/authorization
- [ ] Sensitive data encryption
- [ ] Secure headers configured
- [ ] Dependencies scanned for vulnerabilities

## Performance Guidelines

### Backend Performance

1. **Database Optimization**
   ```typescript
   // ✅ Good: Use indexes and limit results
   async function getModels(filters: ModelFilters): Promise<Model[]> {
     const query = `
       SELECT * FROM models 
       WHERE group = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3
     `;
     return db.query(query, [filters.group, 20, filters.offset]);
   }
   ```

2. **Caching Strategy**
   ```typescript
   // ✅ Good: Implement caching
   async function getModel(id: string): Promise<Model> {
     const cached = await cache.get(`model:${id}`);
     if (cached) return JSON.parse(cached);
     
     const model = await repository.findById(id);
     await cache.setex(`model:${id}`, 300, JSON.stringify(model));
     return model;
   }
   ```

### Frontend Performance

1. **Code Splitting**
   ```typescript
   // ✅ Good: Lazy load components
   const ModelDetail = lazy(() => import('./ModelDetail'));
   
   function App() {
     return (
       <Suspense fallback={<Loading />}>
         <Routes>
           <Route path="/models/:id" element={<ModelDetail />} />
         </Routes>
       </Suspense>
     );
   }
   ```

2. **Memoization**
   ```typescript
   // ✅ Good: Memoize expensive calculations
   const ModelCard = memo(({ model }: ModelCardProps) => {
     const formattedDate = useMemo(
       () => formatDate(model.createdAt),
       [model.createdAt]
     );
     
     return <Card>{/* component content */}</Card>;
   });
   ```

By following these contribution guidelines, we ensure consistent, high-quality code that is maintainable, secure, and performant. Thank you for contributing to the AI Model Registry!