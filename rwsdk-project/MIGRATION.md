# Migration Guide: RedwoodJS to RedwoodSDK

This guide explains how to migrate data and functionality from the existing RedwoodJS application to the new RedwoodSDK version.

## Overview

The migration involves several key transformations:
- **GraphQL API → Server Functions**: Replace GraphQL resolvers with server functions
- **Prisma + SQLite → D1 Database**: Migrate database schema and data
- **Redis Caching → Cloudflare Cache**: Replace caching layer
- **Traditional Components → RSC**: Migrate to React Server Components

## Pre-Migration Checklist

- [ ] Backup existing database
- [ ] Export current data
- [ ] Document custom configurations
- [ ] Test current application functionality
- [ ] Set up Cloudflare account and services

## Step 1: Data Migration

### Export Data from RedwoodJS

```bash
# In the original RedwoodJS project
yarn rw prisma db pull
yarn rw exec seed --export-data
```

### Prepare D1 Database

```bash
# In the RedwoodSDK project
wrangler d1 create isochrone_db
wrangler d1 migrations apply isochrone_db
```

### Import Data to D1

Create a data import script:

```typescript
// scripts/import-data.ts
import { readFileSync } from 'fs'

async function importData() {
  const data = JSON.parse(readFileSync('exported-data.json', 'utf8'))

  // Import locations
  for (const location of data.locations) {
    await db.prepare(`
      INSERT INTO locations (id, address, latitude, longitude, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      location.id,
      location.address,
      location.latitude,
      location.longitude,
      location.createdAt
    ).run()
  }

  console.log(`Imported ${data.locations.length} locations`)
}

importData().catch(console.error)
```

## Step 2: API Migration

### GraphQL to Server Functions Mapping

| RedwoodJS GraphQL | RedwoodSDK Server Function |
|-------------------|----------------------------|
| `findOptimalLocations` mutation | `src/server/isochrones.ts::findOptimalLocations` |
| `generateIsochrone` mutation | `src/server/isochrones.ts::generateIsochrone` |
| `geocodeLocation` mutation | `src/server/locations.ts::geocodeLocation` |

### Business Logic Migration

Copy the core business logic from RedwoodJS services:

```bash
# Copy algorithm implementations
cp ../api/src/lib/algorithms/* src/lib/algorithms/
cp ../api/src/lib/geometry.ts src/lib/geometry.ts
cp ../api/src/lib/matrix.ts src/lib/matrix.ts
```

Update imports and adapt to new architecture:
- Replace Prisma calls with D1 database service
- Replace GraphQL context with server function context
- Update error handling to use HTTP status codes

## Step 3: Frontend Migration

### Component Classification

Analyze existing components and classify them:

**Server Components** (no client-side state):
- `HomePage` - Static layout and structure
- Layout components
- Static content components

**Client Components** (interactive):
- `LocationInput` - Form handling and user input
- `Map` - Leaflet integration and interactivity
- `IsochroneControls` - User controls and state
- `DebugControls` - Developer tools

### Migration Steps

1. **Copy component files**:
   ```bash
   cp -r ../web/src/components/* src/components/
   ```

2. **Add "use client" directives** to interactive components:
   ```typescript
   "use client"
   import React from 'react'
   // ... component code
   ```

3. **Update API calls** from GraphQL to server functions:
   ```typescript
   // Before (GraphQL)
   const [findOptimalLocations] = useMutation(FIND_OPTIMAL_LOCATIONS)

   // After (Server Function)
   import { findOptimalLocations } from '../server/isochrones'
   ```

4. **Update routing**:
   ```typescript
   // Before (RedwoodJS Router)
   <Router>
     <Route path="/" page={HomePage} name="home" />
   </Router>

   // After (RedwoodSDK)
   // Handled in worker.ts route definitions
   ```

## Step 4: External Service Integration

### OpenRouteService Migration

The OpenRouteService integration is already migrated in `src/lib/openroute.ts`. Key changes:

- Replace GraphQL client with native `fetch`
- Use Cloudflare environment variables for API keys
- Implement proper error handling with HTTP status codes

### Caching Migration

Replace Redis caching with Cloudflare Cache API:

```typescript
// Before (Redis)
await redis.set(key, value, 'EX', 3600)
const cached = await redis.get(key)

// After (Cloudflare Cache)
await cache.set(key, value, 3600)
const cached = await cache.get(key)
```

## Step 5: Testing Migration

### Test Data Migration

1. **Verify data integrity**:
   ```sql
   -- Check record counts
   SELECT COUNT(*) FROM locations;
   SELECT COUNT(*) FROM isochrone_cache;
   ```

2. **Test API endpoints**:
   ```bash
   # Test geocoding
   curl -X POST http://localhost:8787/api/locations/geocode \
     -H "Content-Type: application/json" \
     -d '{"address": "123 Main St, City, State"}'
   ```

3. **Test isochrone generation**:
   ```bash
   curl -X POST http://localhost:8787/api/isochrones/generate \
     -H "Content-Type: application/json" \
     -d '{"pointId": "test", "travelTimeMinutes": 30, "travelMode": "DRIVING_CAR"}'
   ```

### Performance Testing

Compare performance between old and new implementations:

1. **Response times**: Measure API endpoint response times
2. **Database queries**: Compare query performance
3. **Memory usage**: Monitor memory consumption
4. **Concurrent users**: Test under load

## Step 6: Deployment

### Staging Deployment

1. Deploy to staging environment:
   ```bash
   wrangler deploy --env staging
   ```

2. Run integration tests against staging
3. Verify all functionality works correctly

### Production Deployment

1. **Blue-Green Deployment**:
   - Deploy new version alongside old version
   - Gradually shift traffic to new version
   - Monitor for issues

2. **DNS Cutover**:
   - Update DNS to point to Cloudflare Workers
   - Monitor traffic and performance

3. **Rollback Plan**:
   - Keep old version running for quick rollback
   - Document rollback procedures

## Step 7: Post-Migration

### Monitoring

Set up monitoring for:
- Application performance
- Error rates
- Database performance
- Cache hit rates

### Optimization

1. **Performance tuning**:
   - Optimize database queries
   - Implement proper caching strategies
   - Monitor bundle sizes

2. **Cost optimization**:
   - Monitor Cloudflare usage
   - Optimize API call patterns
   - Implement efficient caching

### Cleanup

After successful migration:
- Archive old RedwoodJS application
- Update documentation
- Train team on new architecture

## Troubleshooting

### Common Migration Issues

1. **Data Type Mismatches**:
   - Verify data types between Prisma and D1
   - Handle date/time format differences

2. **API Compatibility**:
   - Ensure client applications work with new API
   - Maintain backward compatibility if needed

3. **Performance Regressions**:
   - Compare performance metrics
   - Optimize slow queries or operations

4. **Caching Issues**:
   - Verify cache keys and TTL settings
   - Test cache invalidation

### Getting Help

- Check Cloudflare Workers documentation
- Review RedwoodSDK migration guides
- Contact support if needed

## Rollback Procedure

If migration issues occur:

1. **Immediate Rollback**:
   ```bash
   # Revert DNS to old application
   # Or use Cloudflare traffic splitting
   ```

2. **Data Rollback**:
   - Restore from backup if data was modified
   - Sync any new data back to old system

3. **Investigation**:
   - Analyze logs and metrics
   - Identify root cause
   - Plan fixes for next migration attempt

## Success Criteria

Migration is successful when:
- [ ] All data migrated correctly
- [ ] All API endpoints functional
- [ ] Frontend components working
- [ ] Performance meets or exceeds original
- [ ] No critical bugs in production
- [ ] Monitoring and alerting operational
