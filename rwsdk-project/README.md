# Isochrone Center Point - RedwoodSDK

This is the RedwoodSDK version of the Isochrone Center Point application, migrated from RedwoodJS 8.9.0 to leverage Cloudflare's edge computing capabilities.

## Features

- **React Server Components (RSC)**: Server-side rendering with client-side interactivity
- **Cloudflare Workers**: Edge computing for fast global response times
- **D1 Database**: SQLite-compatible database at the edge
- **Native Web APIs**: Using fetch, Request/Response instead of GraphQL
- **Miniflare**: Local development environment that emulates Cloudflare runtime

## Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (for production deployment)
- OpenRouteService API key

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenRouteService API key
   ```

3. **Run database migrations**:
   ```bash
   # Migrations will be applied automatically by Miniflare
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:8787`

## Development

### Local Development with Miniflare

Miniflare provides a local development environment that closely emulates the Cloudflare Workers runtime:

- **D1 Database**: Local SQLite database that mimics Cloudflare D1
- **KV Storage**: Local key-value storage
- **R2 Storage**: Local blob storage (if needed)
- **Environment Variables**: Local environment variable support

### Project Structure

```
src/
├── components/          # React components (client-side)
├── pages/              # React Server Components
├── server/             # Server functions (API endpoints)
├── lib/                # Shared utilities
│   ├── database.ts     # D1 database service
│   ├── cache.ts        # Cloudflare cache service
│   └── openroute.ts    # OpenRouteService client
├── middleware/         # Request middleware
└── types/              # TypeScript type definitions

migrations/             # D1 database migrations
worker.ts              # Main worker entry point
```

### Server Functions

Server functions replace GraphQL resolvers and provide API endpoints:

```typescript
// src/server/isochrones.ts
"use server"

export async function findOptimalLocations(
  locations: LocationInput[],
  travelMode: TravelMode,
  optimizationGoal: OptimizationGoal
): Promise<OptimalLocationResult> {
  // Implementation
}
```

### React Server Components

Pages are rendered on the server by default, with client components marked explicitly:

```typescript
// src/pages/HomePage.tsx (Server Component)
export default function HomePage() {
  return <div>...</div>
}

// src/components/LocationInput.tsx (Client Component)
"use client"
export function LocationInput() {
  return <form>...</form>
}
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck
```

## Building and Deployment

### Build for Production

```bash
npm run build
```

### Deploy to Cloudflare Workers

1. **Set up Cloudflare CLI**:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create D1 database**:
   ```bash
   wrangler d1 create isochrone_db
   # Update wrangler.toml with the database ID
   ```

3. **Run migrations**:
   ```bash
   wrangler d1 migrations apply isochrone_db
   ```

4. **Set secrets**:
   ```bash
   wrangler secret put OPENROUTE_SERVICE_API_KEY
   ```

5. **Deploy**:
   ```bash
   npm run deploy
   ```

## Migration from RedwoodJS

This project is part of a migration from RedwoodJS to RedwoodSDK. Key changes include:

- **GraphQL → Server Functions**: API layer simplified to use native web APIs
- **Prisma → D1**: Database layer migrated to Cloudflare's edge database
- **Redis → Cloudflare Cache**: Caching layer uses Cloudflare's native caching
- **Traditional Hosting → Edge Computing**: Deployed to Cloudflare Workers

## Environment Variables

- `OPENROUTE_SERVICE_API_KEY`: Required for geospatial operations
- `NODE_ENV`: Environment (development/production)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Your License Here]
