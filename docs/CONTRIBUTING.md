# Contributing to AI Career OS

Thank you for contributing to AI Career OS. This guide ensures consistent code quality across the team.

## Development Workflow

### Branch Strategy

```
main          ← Production releases
  └── develop ← Integration branch
        ├── feat/auth-jwt-implementation
        ├── fix/user-service-query-timeout
        └── refactor/career-service-clean-architecture
```

1. Create a branch from `develop`
2. Name it: `{type}/{scope}-{description}` (e.g., `feat/auth-jwt-tokens`)
3. Make your changes
4. Create a PR to `develop`

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `infra`

**Scopes**: Service names (`auth`, `user`, `career`, etc.) or package names (`common`, `config`, etc.)

**Examples**:
```
feat(auth): add JWT token generation
fix(user): resolve query timeout on large datasets
docs(readme): update getting started guide
refactor(career): extract resume parser to separate service
test(exam): add unit tests for score calculation
```

## Code Standards

### TypeScript Rules

- **No `any` types** — use `unknown` or proper types
- **Consistent type imports** — `import type { X } from '...'`
- **Explicit return types** on exported functions
- **Readonly properties** on interfaces
- **No floating promises** — always `await` or `void`

### Adding a New API Endpoint

1. Define the Zod schema in `src/schemas/`
2. Create the DTO in `src/dto/`
3. Implement the service method in `src/services/`
4. Create the route in `src/routes/`
5. Wire up in the controller in `src/controllers/`
6. Write unit tests in `tests/unit/`
7. Write integration tests in `tests/integration/`

### Adding a New Shared Package

1. Create `packages/{name}/`
2. Add `package.json` with name `@ai-career-os/{name}`
3. Add `tsconfig.json` extending `../../tsconfig.base.json`
4. Add `src/index.ts` barrel export
5. Run `npm install` from root to link

## Pull Request Process

1. **Self-review** your code before creating a PR
2. **Run checks locally**: `npm run lint && npm run test`
3. **Write descriptive PR titles** using conventional commit format
4. **Link related issues** in the PR description
5. **Request review** from at least one team member
6. **Address all review comments** before merging
7. **Squash merge** into `develop`

## Testing Standards

- **Unit tests**: Test individual functions and classes in isolation
- **Integration tests**: Test service endpoints with mocked dependencies
- **Naming**: `{feature}.{test|spec}.ts`
- **Coverage target**: 80% for new code

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create a user with valid input', async () => {
      // Arrange → Act → Assert
    });

    it('should throw ValidationError for invalid email', async () => {
      // ...
    });
  });
});
```
