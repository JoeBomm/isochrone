# RedwoodSDK to RedwoodJS Rollback Guide

This document provides comprehensive instructions for rolling back from RedwoodSDK to RedwoodJS in case of issues during or after migration.

## Overview

The rollback process involves several components:
1. **Code Deployment Rollback** - Switching back to RedwoodJS codebase
2. **Database Migration Rollback** - Converting D1 data back to SQLite/Prisma
3. **Configuration Rollback** - Restoring RedwoodJS configurations
4. **Service Rollback** - Switching from Cloudflare Workers back to traditional hosting

## Prerequisites

Before starting the rollback process, ensure you have:

- [ ] Access to the original RedwoodJS codebase
- [ ] Database backups from before the migration
- [ ] Administrative access to deployment environments
- [ ] Backup of current RedwoodSDK state (automatically created by rollback scripts)

## Emergency Rollback (Quick)

For immediate rollback in case of critical issues:

```bash
# Navigate to RedwoodSDK project
cd rwsdk-project

# Execute emergency rollback
./scripts/rollback-deployment.sh --environment production

# Or for dry run first
./scripts/rollback-deployment.sh --environment production --dry-run
```

This will:
1. Stop RedwoodSDK services
2. Switch back to RedwoodJS
3. Restore database from backup
4. Update configurations
5. Prepare RedwoodJS for startup

## Detailed Rollback Process

### Step 1: Assessment and Planning

Before starting the rollback, assess the current situation:

```bash
# Check current system status
cd rwsdk-project
node -e "
const { getMigrationStatus } = require('./src/lib/migration');
console.log(JSON.stringify(getMigrationStatus(), null, 2));
"
```

**Decision Matrix:**
- **Data Loss Acceptable**: Use fast rollback with `--no-preserve-data`
- **Data Must Be Preserved**: Use full rollback with database migration
- **Partial Issues**: Consider using feature flags to disable problematic features

### Step 2: Database Rollback

#### Option A: Automatic Database Rollback

```bash
# Navigate to RedwoodSDK project
cd rwsdk-project

# Run database rollback script
node scripts/rollback-database.ts --dry-run

# If dry run looks good, execute
node scripts/rollback-database.ts
```

#### Option B: Manual Database Rollback

1. **Export data from D1:**
```bash
# Export all tables from D1
wrangler d1 execute isochrone-db --command "SELECT * FROM locations" --output locations.json
wrangler d1 execute isochrone-db --command "SELECT * FROM isochrone_cache WHERE expires_at > datetime('now')" --output isochrone_cache.json
wrangler d1 execute isochrone-db --command "SELECT * FROM matrix_cache WHERE expires_at > datetime('now')" --output matrix_cache.json
wrangler d1 execute isochrone-db --command "SELECT * FROM geocoding_cache WHERE expires_at > datetime('now')" --output geocoding_cache.json
```

2. **Restore SQLite backup:**
```bash
# Navigate to RedwoodJS project
cd ../

# Restore database backup
cp backups/pre-migration-backup.db api/db/dev.db

# Run Prisma migrations
yarn rw prisma migrate deploy
```

3. **Import preserved data:**
```bash
# Convert JSON exports to SQL and import
# (Use the generated rollback SQL from the rollback script)
```

### Step 3: Code Deployment Rollback

#### Automated Rollback

```bash
# Full automated rollback
./scripts/rollback-deployment.sh --environment production --preserve-data

# With custom backup directory
./scripts/rollback-deployment.sh --environment production --backup-dir /path/to/backups
```

#### Manual Rollback Steps

1. **Stop RedwoodSDK services:**
```bash
# Stop Miniflare (development)
pkill -f miniflare

# Stop Wrangler processes
pkill -f wrangler
```

2. **Switch to RedwoodJS:**
```bash
# Navigate to RedwoodJS project
cd ../

# Install dependencies
yarn install

# Build the project
yarn rw build
```

3. **Update configurations:**
```bash
# Restore environment variables
cp .env.example .env
# Edit .env with appropriate values

# Update database connection
yarn rw prisma generate
```

### Step 4: Service and Infrastructure Rollback

#### Development Environment

```bash
# Start RedwoodJS development servers
yarn rw dev
```

#### Staging/Production Environment

1. **Update deployment configuration:**
   - Revert DNS changes to point back to original servers
   - Update load balancer configurations
   - Restore SSL certificates if needed

2. **Deploy RedwoodJS:**
```bash
# Build for production
yarn rw build

# Deploy using your original deployment method
# (Netlify, Vercel, AWS, etc.)
```

### Step 5: Verification and Testing

After rollback, verify that everything is working:

1. **Functional Testing:**
```bash
# Test API endpoints
curl http://localhost:8911/graphql -X POST -H "Content-Type: application/json" -d '{"query":"{ __typename }"}'

# Test web interface
curl http://localhost:8910
```

2. **Data Integrity Check:**
```bash
# Check database connectivity
yarn rw prisma studio

# Verify data migration
yarn rw console
# Run queries to verify data integrity
```

3. **Performance Testing:**
   - Monitor response times
   - Check error rates
   - Verify all features work as expected

## Rollback Scenarios

### Scenario 1: Migration Failed During Database Migration

**Symptoms:** D1 database is corrupted or incomplete

**Solution:**
```bash
# Restore from backup immediately
cp backups/pre-migration-backup.db api/db/dev.db

# Skip RedwoodSDK database rollback
./scripts/rollback-deployment.sh --no-preserve-data
```

### Scenario 2: RedwoodSDK Performance Issues

**Symptoms:** High response times, frequent errors

**Solution:**
```bash
# Use feature flags to gradually rollback
node -e "
const { emergencyControls } = require('./src/lib/migration');
emergencyControls.rollback();
"

# If issues persist, full rollback
./scripts/rollback-deployment.sh --preserve-data
```

### Scenario 3: Cloudflare Workers Deployment Issues

**Symptoms:** Deployment fails, workers not responding

**Solution:**
```bash
# Immediate rollback to RedwoodJS
./scripts/rollback-deployment.sh --environment production

# Update DNS to point back to original servers
# (Manual step - update your DNS provider)
```

### Scenario 4: Data Loss During Migration

**Symptoms:** Missing or corrupted data in D1

**Solution:**
```bash
# Restore from backup
cp backups/pre-migration-backup.db api/db/dev.db

# Full rollback without attempting data preservation
./scripts/rollback-deployment.sh --no-preserve-data

# Manually verify and restore any missing data
```

## Post-Rollback Checklist

After completing the rollback:

- [ ] All services are running on RedwoodJS
- [ ] Database is accessible and contains expected data
- [ ] Web interface is functional
- [ ] API endpoints are responding correctly
- [ ] External integrations (OpenRouteService) are working
- [ ] Performance is acceptable
- [ ] Error rates are normal
- [ ] Monitoring and logging are active
- [ ] Team has been notified of rollback
- [ ] Incident report has been created

## Troubleshooting

### Common Issues

**Issue:** Database connection errors after rollback
```bash
# Solution: Regenerate Prisma client
yarn rw prisma generate
yarn rw prisma migrate deploy
```

**Issue:** Missing environment variables
```bash
# Solution: Restore from backup or recreate
cp .env.example .env
# Edit .env with correct values
```

**Issue:** Build failures
```bash
# Solution: Clean and rebuild
yarn rw clean
yarn install
yarn rw build
```

**Issue:** Port conflicts
```bash
# Solution: Kill processes using required ports
lsof -ti:8910 | xargs kill -9
lsof -ti:8911 | xargs kill -9
```

### Getting Help

If you encounter issues during rollback:

1. **Check logs:**
```bash
# RedwoodJS logs
yarn rw logs

# System logs
tail -f /var/log/syslog
```

2. **Review rollback report:**
```bash
# Check the latest rollback report
cat backups/rollback_report_*.txt
```

3. **Contact support:**
   - Include rollback report
   - Provide error messages
   - Describe steps taken before the issue

## Prevention

To avoid future rollback scenarios:

1. **Always test in staging first**
2. **Create comprehensive backups before migration**
3. **Use feature flags for gradual rollout**
4. **Monitor performance metrics during migration**
5. **Have a rollback plan ready before starting migration**
6. **Test rollback procedures in non-production environments**

## Rollback Scripts Reference

### Database Rollback Script

```bash
node scripts/rollback-database.ts [options]

Options:
  --d1-database <name>     D1 database name
  --sqlite-backup <path>   Path to SQLite backup
  --output <path>          Output path for rollback SQL
  --dry-run               Preview changes without executing
```

### Deployment Rollback Script

```bash
./scripts/rollback-deployment.sh [options]

Options:
  -e, --environment ENV    Target environment (development|staging|production)
  -b, --backup-dir DIR     Backup directory path
  -d, --dry-run           Preview changes without executing
  -p, --preserve-data     Preserve database data during rollback
  -v, --verbose           Enable verbose output
```

## Emergency Contacts

In case of critical issues during rollback:

- **Development Team Lead:** [Contact Information]
- **DevOps Engineer:** [Contact Information]
- **Database Administrator:** [Contact Information]
- **On-Call Support:** [Contact Information]

---

**Remember:** Always test rollback procedures in a non-production environment before executing in production. Keep this document updated as your infrastructure and processes evolve.
