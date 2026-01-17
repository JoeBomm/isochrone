# Project Structure

## RedwoodJS Monorepo Layout

This project follows RedwoodJS conventions with a monorepo structure containing `api` and `web` workspaces.

```
├── api/                    # Backend GraphQL API
├── web/                    # Frontend React application
├── scripts/                # Database seeds and utilities
├── .redwood/              # Generated types and build artifacts
└── .kiro/                 # AI assistant configuration
```

## API Structure (`api/`)

```
api/
├── db/
│   └── schema.prisma      # Database schema definition
├── src/
│   ├── directives/        # GraphQL directives (auth)
│   ├── functions/         # Serverless functions
│   ├── graphql/           # SDL schema definitions
│   ├── lib/               # Shared utilities and services
│   └── services/          # GraphQL resolvers and business logic
└── types/                 # Generated GraphQL types
```

### Key API Conventions
- **SDL Files**: GraphQL schema definitions in `src/graphql/*.sdl.ts`
- **Services**: Business logic and resolvers in `src/services/*.ts`
- **Libraries**: Shared utilities in `src/lib/` (auth, db, logger, cache)
- **Directives**: Custom GraphQL directives for authentication

## Web Structure (`web/`)

```
web/
├── public/                # Static assets
├── src/
│   ├── components/        # Reusable React components
│   ├── layouts/           # Page layout components
│   ├── pages/             # Route-based page components
│   ├── App.tsx           # Root application component
│   ├── Routes.tsx        # Route definitions
│   └── index.css         # Global styles
└── dist/                 # Build output
```

### Key Web Conventions
- **Pages**: Route components in `src/pages/` with folder-based organization
- **Components**: Reusable UI components in `src/components/`
- **Layouts**: Shared page layouts in `src/layouts/`

## Domain-Specific Organization

### Geospatial Features
- **Isochrones**: `api/src/graphql/isochrones.sdl.ts` + `api/src/services/isochrones.ts`
- **Locations**: `api/src/graphql/locations.sdl.ts` + `api/src/services/locations.ts`
- **OpenRoute Integration**: `api/src/lib/openroute.ts` + `api/src/lib/cachedOpenroute.ts`
- **Caching Layer**: `api/src/lib/cache.ts` for Redis/in-memory caching

### Configuration Files
- **Environment**: `.env` (local), `.env.example` (template)
- **RedwoodJS Config**: `redwood.toml` for app settings
- **Database**: `api/db/schema.prisma` for data models
- **Package Management**: Workspace-based `package.json` files

## File Naming Conventions
- **Components**: PascalCase (e.g., `LocationInput.tsx`)
- **Services**: camelCase (e.g., `isochrones.ts`)
- **SDL Files**: camelCase with `.sdl.ts` extension
- **Test Files**: Same name as source with `.test.ts` suffix
- **Types**: Generated in `.redwood/types/` and `api/types/`

## Import Patterns
- **Relative imports**: For local files within same workspace
- **Absolute imports**: `types/graphql` for generated types
- **Workspace imports**: Cross-workspace imports handled by RedwoodJS