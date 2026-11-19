# Technology Stack

## Framework
- **RedwoodJS 8.9.0**: Full-stack React framework with GraphQL API
- **Node.js 20.x**: Required runtime version
- **Yarn 4.6.0**: Package manager

## Frontend (Web)
- **React 18.3.1**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Build tool and dev server
- **Leaflet 1.9.4**: Interactive mapping library

## Backend (API)
- **GraphQL**: API layer with SDL schema definitions
- **Prisma**: Database ORM with SQLite (development)
- **Jest**: Testing framework with scenarios and mocking

## Key Dependencies
- **@turf/centroid & @turf/union**: Geospatial calculations
- **Redis 4.7.0**: Caching layer for production
- **OpenRouteService**: External API for isochrone calculations and geocoding

## Development Tools
- **ESLint**: Code linting with RedwoodJS config
- **Prettier**: Code formatting
- **Storybook**: Component development and testing
- **Context7**: MCP server for documentation

## Common Commands

### Development
```bash
# Start development servers (web + api)
yarn rw dev

# Start individual services
yarn rw dev web    # Frontend only (port 8910)
yarn rw dev api    # Backend only (port 8911)
```

### Database
```bash
# Run database migrations
yarn rw prisma migrate dev

# Reset and seed database
yarn rw prisma migrate reset
yarn rw exec seed
```

### Testing (Token-Constrained, MVP Mode)
```bash
#Ignore integration tests
#Rule: Always run the smallest relevant scope first. Only run all tests as a last resort.
#Scoped Tests (Default)
#Single file:
NODE_ENV=test yarn rw test path/to/file.spec.ts --no-watch --ci --silent --runInBand
#Area (api/web):
NODE_ENV=test yarn rw test api --no-watch --ci --silent --runInBand
NODE_ENV=test yarn rw test web --no-watch --ci --silent --runInBand
#Only failing suites/tests shown; passing tests suppressed.
#If Tests Fail
#Show only failing suite/test names + short assertion summary.
#Ask user before escalating verbosity or running all tests.
#Ask user before removing NODE_ENV=test from command in order to get all logs
#Full Test Suite (Last Resort)
NODE_ENV=test yarn rw test --no-watch --ci --silent --runInBand
#Only run if failures cannot be diagnosed from scoped tests.
#Watch Mode (Manual Dev Only)
NODE_ENV=test yarn rw test --watch
```

Forbidden: running all tests by default, printing passing tests, or auto-escalating verbosity.

### Code Generation
```bash
# Generate GraphQL SDL and services
yarn rw generate sdl <model>
yarn rw generate service <name>

# Generate React components
yarn rw generate component <name>
yarn rw generate page <name>
```

### Build & Deploy
```bash
# Build for production
yarn rw build

# Deploy setup
yarn rw setup deploy --help
```

## Environment Configuration
- Copy `.env.example` to `.env` for local development
- Required: `OPENROUTE_SERVICE_API_KEY` for geospatial services
- Optional: `REDIS_URL` for production caching (falls back to in-memory)

# ENGINEERING STYLE CONSTRAINTS

- Prefer simple, explicit code over abstraction.
- Only introduce an abstraction when it is used in at least 2 places.
- Code must be self-documenting: no line-by-line comments.
- Prefer small pure functions.
- No new services, layers, or architectural patterns unless strictly required.
- Optimize for readability by a senior engineer.
- Tests: only where behavior is non-obvious or previously broken.
- Logging: only at system boundaries, never inside tight loops.
- Assume this is a fast-moving product, not a regulated system.

# ARCHITECTURE RULE

- Do not introduce abstractions for hypothetical future features.
- Only refactor when the existing structure blocks the fix.
- Avoid new interfaces unless a second implementation already exists.

# CLEAN CODE DEFINITION
## guidelines/rules of thumb not hard rules

- Functions < 20 lines.
- One level of indentation.
- Descriptive names > comments.
- No TODO scaffolding.
- No speculative extensibility.

# BUDGET

- You have a 100-credit budget.
- Avoid large refactors or file rewrites.
- Do not scan the full repo unless asked.
- Minimize test reruns.

# REFACTORING POLICY

- Do not refactor unrelated code.
- Only apply new style rules to files you must change.
- Even within a file, only refactor the smallest necessary scope.
- Never refactor for consistency alone.
- Preserve existing behavior and structure unless it blocks the fix.
