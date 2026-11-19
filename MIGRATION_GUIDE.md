# RedwoodJS to RedwoodSDK Migration Guide

This guide provides comprehensive instructions for migrating the Isochrone Center Point application from RedwoodJS 8.9.0 to RedwoodSDK 1.x with Cloudflare D1 database.

## Overview

The migration involves:
- Converting Prisma/SQLite database to Cloudflare D1
- Migrating GraphQL API to Server Functions
- Converting React components to RSC architecture
- Updating external service integrations
- Preserving all existing functionality

## Prerequisites

### RedwoodJS Project (Source)
- RedwoodJS 8.9.0 or compatible
- Node.js 20.x
- Yarn 4.6.0
- Existing database with data (optional)

### RedwoodSDK Project (Target)
- RedwoodSDK 1.x
- Cloudflare Workers environment
- D1 database configured
- Wrangler CLI installed

## Migration Process

### Phase 1: Database Migration

#### Step 1: Export Data from RedwoodJS

```bash
# In the RedwoodJS project directory
yarn rw exec export-data
```

This creates:
- `data-export.json` - JSON export of all data
- `data-export.sql` - SQL dump for manual inspection

#### Step 2: Run D1 Migrations

```bash
# In the RedwoodSDK project directory
wrangler d1 migrations apply --local
```

#### Step 3: Import Data to D1

```bash
# In the RedwoodSDK project directory
npm run import-data
```

### Phase 2: Complete Migration (Automated)

For a complete automated migration:

```bash
# In the RedwoodJS project directory
yarn rw exec migrate-to-d1
```

This orchestrates the entire migration process including:
- Data export
- D1 migration
- Data import
- Validation
- Rollback point creation

## Database Schema Mapping

### Prisma Models → D1 Tables

| Prisma Model | D1 Table | Purpose |
|--------------|----------|---------|
| `Location` | `locations` | User-entered locations |
| `IsochroneCache` | `isochrone_cache` | Cached isochrone polygons |
| `MatrixCache` | `matrix_cache` | Cached travel time matrices |
| `GeocodingCache` | `geocoding_cache` | Cached address geocoding |

### Key Differences

1. **ID Generation**: Prisma uses `cuid()`, D1 uses `crypto.randomUUID()`
2. **Date Handling**: Prisma uses `DateTime`, D1 uses ISO string format
3. **JSON Storage**: Both support JSON, but D1 requires string serialization
4. **Indexes**: D1 uses explicit CREATE INDEX statements

## API Migration

### GraphQL → Server Functions

| GraphQL Resolver | Server Function | File |
|------------------|-----------------|------|
| `findOptimalLocations` | `findOptimalLocations()` | `server/isochrones.ts` |
| `generateIsochrone` | `generateIsochrone()` | `server/isochrones.ts` |
| `calculateMinimaxCenter` | `calculateMinimaxCenter()` | `server/isochrones.ts` |
| `geocodeAddress` | `geocodeAddress()` | `server/locations.ts` |

### Key Changes

1. **Context Access**: `getRequestInfo()` instead of GraphQL context
2. **Error Handling**: HTTP status codes instead of GraphQL errors
3. **Input Validation**: Manual validation instead of SDL schema
4. **Response Format**: Direct JSON instead of GraphQL response

## Component Migration

### React Components → RSC

| Component | Type | Changes Required |
|-----------|------|------------------|
| `HomePage` | RSC | Server-side rendering |
| `LocationInput` | Client | Add "use client" directive |
| `Map` | Client | Add "use client" directive |
| `IsochroneControls` | Client | Add "use client" directive |

### Key Considerations

1. **State Management**: Client components handle local state
2. **Server Actions**: Use server functions for data operations
3. **Hydration**: Ensure proper client/server boundaries
4. **Performance**: Leverage RSC for better initial load times

## Caching Strategy

### Redis/In-Memory → D1 Database

| Cache Type | RedwoodJS | RedwoodSDK |
|------------|-----------|------------|
| Isochrones | Redis/Memory | D1 `isochrone_cache` |
| Travel Matrices | Redis/Memory | D1 `matrix_cache` |
| Geocoding | Redis/Memory | D1 `geocoding_cache` |

### Benefits

1. **Persistence**: Cache survives application restarts
2. **Scalability**: Leverages Cloudflare's global network
3. **Consistency**: Single database for all data
4. **Cost**: No separate Redis instance required

## Rollback Procedure

If migration issues occur:

```bash
# In the RedwoodJS project directory
yarn rw exec rollback-migration
```

This will:
1. Restore original RedwoodJS application
2. Import data back to SQLite (if needed)
3. Clean up migration artifacts
4. Validate rollback success

### Manual Rollback Steps

1. Stop the RedwoodSDK application
2. Restore the original RedwoodJS application
3. Run `yarn rw exec restore-data` if data restoration is needed
4. Restart the RedwoodJS application
5. Verify functionality

## Validation and Testing

### Data Integrity Checks

```bash
# Compare record counts
yarn rw exec validate-migration
```

### Functional Testing

1. **Location Input**: Test address geocoding
2. **Isochrone Generation**: Test on-demand isochrone calculation
3. **Optimal Location Finding**: Test algorithm execution
4. **Map Visualization**: Test interactive map features
5. **Caching**: Verify cache hit/miss behavior

## Troubleshooting

### Common Issues

#### Database Connection Errors
```
Error: D1 database not accessible
```
**Solution**: Verify D1 database binding in `wrangler.toml`

#### Migration Script Failures
```
Error: Export script not found
```
**Solution**: Ensure all migration scripts are in place and executable

#### Data Import Errors
```
Error: Invalid JSON in export file
```
**Solution**: Re-run export script and verify JSON validity

#### Cache Performance Issues
```
Warning: High cache miss rate
```
**Solution**: Check TTL settings and cache key generation

### Debug Commands

```bash
# Check database stats
yarn rw exec cache-stats

# Validate schema
wrangler d1 execute --local --command "PRAGMA table_info(locations);"

# Test connectivity
yarn rw exec test-db-connection
```

## Performance Considerations

### Expected Improvements

1. **Cold Start**: Faster with Cloudflare Workers
2. **Global Latency**: Reduced with edge deployment
3. **Database Performance**: Improved with D1's SQLite engine
4. **Caching**: Better hit rates with persistent cache

### Monitoring

1. **Response Times**: Monitor API endpoint performance
2. **Cache Hit Rates**: Track cache effectiveness
3. **Error Rates**: Monitor for migration-related issues
4. **Resource Usage**: Track memory and CPU utilization

## Post-Migration Tasks

### Immediate (Day 1)
- [ ] Verify all functionality works
- [ ] Monitor error rates and performance
- [ ] Test rollback procedure
- [ ] Update documentation

### Short-term (Week 1)
- [ ] Optimize cache TTL settings
- [ ] Fine-tune D1 query performance
- [ ] Update monitoring and alerting
- [ ] Train team on new architecture

### Long-term (Month 1)
- [ ] Remove RedwoodJS dependencies
- [ ] Optimize for Cloudflare Workers
- [ ] Implement additional RSC optimizations
- [ ] Plan for future enhancements

## Support and Resources

### Documentation
- [RedwoodSDK Documentation](https://redwoodjs.com/docs/sdk)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

### Migration Scripts
- `scripts/export-data.ts` - Export data from RedwoodJS
- `scripts/migrate-to-d1.ts` - Complete migration orchestration
- `scripts/rollback-migration.ts` - Rollback to RedwoodJS
- `rwsdk-project/scripts/import-data.ts` - Import data to D1

### Database Files
- `api/db/migrations/001_add_location_and_cache_tables.sql` - Prisma migration
- `rwsdk-project/migrations/002_updated_schema.sql` - D1 schema
- `api/src/lib/database.ts` - Prisma-compatible database service
- `rwsdk-project/src/lib/database.ts` - D1 database service

## Conclusion

This migration provides a path to modern, edge-optimized architecture while preserving all existing functionality. The process is designed to be reversible and includes comprehensive validation to ensure data integrity throughout the migration.

For questions or issues, refer to the troubleshooting section or consult the migration error logs generated during the process.
