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

### Testing
```bash
# Run all tests (use --no-watch to avoid hanging on console input)
yarn rw test --no-watch

# Run tests in watch mode (for interactive development)
yarn rw test --watch

# Run specific test files
yarn rw test api --no-watch
yarn rw test web --no-watch
```

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