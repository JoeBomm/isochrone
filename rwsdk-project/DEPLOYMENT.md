# Deployment Guide

This document provides comprehensive instructions for deploying the Isochrone Center Point application using RedwoodSDK and Cloudflare Workers.

## Overview

The application is deployed on Cloudflare Workers with the following architecture:
- **Compute**: Cloudflare Workers (serverless)
- **Database**: Cloudflare D1 (SQLite-compatible)
- **Caching**: Cloudflare KV (key-value store)
- **Storage**: Cloudflare R2 (optional, for assets)
- **CDN**: Cloudflare global network

## Prerequisites

### Required Tools
- Node.js 18+ and npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare Workers CLI)
- Cloudflare account with Workers enabled

### Installation
```bash
# Install Wrangler globally
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Install project dependencies
npm install
```

## Environment Setup

### 1. Local Development Setup

```bash
# Set up local development environment
npm run setup:local

# Or manually:
cp .env.example .env
# Edit .env with your API keys
npm install
```

### 2. Cloudflare Resources Setup

```bash
# Complete Cloudflare setup for development
npm run setup:cloudflare

# Or for specific environment
./scripts/setup-cloudflare.sh --create-resources
./scripts/setup-cloudflare.sh --set-secrets
```

### 3. Environment Configuration

```bash
# Configure all environments
npm run setup:env

# Or configure specific environment
./scripts/configure-environment.sh cloudflare --env production
./scripts/configure-environment.sh secrets --env production
```

## Configuration Files

### wrangler.toml

The main configuration file for Cloudflare Workers deployment. Key sections:

```toml
# Main worker configuration
name = "isochrone-center-point"
main = "dist/worker.js"
compatibility_date = "2024-12-18"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "isochrone_db"
database_id = "your-d1-database-id"

# KV namespace for caching
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

# Environment-specific configuration
[env.production]
name = "isochrone-center-point"
vars = { NODE_ENV = "production" }
```

### Environment Variables

**Public Variables** (in wrangler.toml):
- `NODE_ENV`: Environment name
- `API_BASE_URL`: Base URL for the deployed worker
- `ISOCHRONE_CACHE_TTL`: Cache TTL for isochrone data (seconds)
- `MATRIX_CACHE_TTL`: Cache TTL for matrix calculations (seconds)
- `GEOCODING_CACHE_TTL`: Cache TTL for geocoding results (seconds)
- `MAX_LOCATIONS_PER_REQUEST`: Maximum locations per API request
- `MAX_TRAVEL_TIME_MINUTES`: Maximum travel time allowed

**Secret Variables** (set via wrangler secrets):
- `OPENROUTE_SERVICE_API_KEY`: API key for OpenRouteService

## Deployment Process

### Development Environment

```bash
# Build and deploy to development
npm run build
npm run deploy:dev

# Or use the deployment script directly
./scripts/deploy.sh development
```

### Staging Environment

```bash
# Deploy to staging
npm run deploy:staging

# Or with options
./scripts/deploy.sh staging --skip-tests
```

### Production Environment

```bash
# Deploy to production (with all checks)
npm run deploy:prod

# Or with force flag (skip warnings)
./scripts/deploy.sh production --force
```

### Deployment Script Options

```bash
./scripts/deploy.sh [environment] [options]

Options:
  --dry-run           Show what would be deployed
  --force             Force deployment despite warnings
  --skip-tests        Skip running tests
  --skip-migrations   Skip database migrations
```

## Database Management

### Migrations

```bash
# Apply migrations to specific environment
wrangler d1 migrations apply --env production --remote

# Apply migrations locally
wrangler d1 migrations apply isochrone_db --local

# Create new migration
wrangler d1 migrations create "add_new_table"
```

### Database Operations

```bash
# List databases
wrangler d1 list

# Execute SQL query
wrangler d1 execute isochrone_db --command "SELECT * FROM locations LIMIT 5"

# Backup database (export)
wrangler d1 export isochrone_db --output backup.sql

# Import data
wrangler d1 execute isochrone_db --file backup.sql
```

## Secrets Management

### Setting Secrets

```bash
# Set OpenRouteService API key
wrangler secret put OPENROUTE_SERVICE_API_KEY --env production

# Set from file
wrangler secret put API_KEY --env production < api-key.txt

# List secrets
wrangler secret list --env production

# Delete secret
wrangler secret delete OLD_SECRET --env production
```

### Environment-Specific Secrets

Each environment (development, staging, production) has its own secrets:

```bash
# Development
wrangler secret put OPENROUTE_SERVICE_API_KEY --env development

# Staging
wrangler secret put OPENROUTE_SERVICE_API_KEY --env staging

# Production
wrangler secret put OPENROUTE_SERVICE_API_KEY --env production
```

## Monitoring and Debugging

### Logs

```bash
# Tail logs in real-time
wrangler tail --env production

# Filter logs
wrangler tail --env production --format pretty

# View deployment logs
wrangler deployments list --env production
```

### Analytics

```bash
# View analytics (if configured)
wrangler analytics --env production
```

### Health Checks

The deployment script includes automatic health checks:
- Basic connectivity test
- API endpoint verification
- Response time validation

## Rollback Procedures

### Automatic Rollback

```bash
# Rollback to previous deployment
wrangler rollback --env production

# Rollback to specific deployment
wrangler rollback <deployment-id> --env production
```

### Manual Rollback

1. Identify the previous working deployment:
   ```bash
   wrangler deployments list --env production
   ```

2. Rollback to that deployment:
   ```bash
   wrangler rollback <deployment-id> --env production
   ```

3. Verify the rollback:
   ```bash
   curl https://your-worker-url.workers.dev/api/health
   ```

## Troubleshooting

### Common Issues

**Build Failures**:
```bash
# Clean and rebuild
npm run clean
npm run build

# Check for TypeScript errors
npm run typecheck
```

**Authentication Issues**:
```bash
# Re-authenticate
wrangler logout
wrangler login
```

**Database Connection Issues**:
```bash
# Verify database exists
wrangler d1 list

# Check database binding in wrangler.toml
# Ensure database_id matches the actual D1 database ID
```

**Secret Configuration Issues**:
```bash
# Verify secrets are set
wrangler secret list --env production

# Re-set secrets if needed
wrangler secret put OPENROUTE_SERVICE_API_KEY --env production
```

### Debug Mode

Enable debug logging by setting environment variables:

```bash
# Local development
DEBUG=* npm run dev

# Deployment with verbose logging
WRANGLER_LOG=debug wrangler deploy --env development
```

## Performance Optimization

### Caching Strategy

The application uses multiple caching layers:

1. **Cloudflare KV**: For API responses and computed results
2. **Browser Cache**: For static assets
3. **CDN Cache**: For global content distribution

### Cache Configuration

```javascript
// Cache TTL settings (in wrangler.toml)
ISOCHRONE_CACHE_TTL = "3600"    // 1 hour
MATRIX_CACHE_TTL = "7200"       // 2 hours
GEOCODING_CACHE_TTL = "86400"   // 24 hours
```

### Resource Limits

```toml
# Worker limits (in wrangler.toml)
[limits]
cpu_ms = 30000  # 30 seconds max CPU time

# Usage model
usage_model = "standard"  # or "unbound" for higher limits
```

## Security Considerations

### API Keys
- Store all sensitive data as Wrangler secrets
- Never commit API keys to version control
- Use different keys for different environments

### CORS Configuration
- Configure appropriate CORS headers
- Restrict origins in production

### Rate Limiting
- Implement rate limiting for API endpoints
- Use Cloudflare's built-in DDoS protection

## Custom Domains

### Setup

1. Add domain to Cloudflare
2. Configure DNS records
3. Add routes to wrangler.toml:

```toml
[[routes]]
pattern = "isochrone.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### SSL/TLS

Cloudflare provides automatic SSL/TLS certificates for custom domains.

## Backup and Recovery

### Database Backups

```bash
# Export database
wrangler d1 export isochrone_db --output backup-$(date +%Y%m%d).sql

# Automated backup script
./scripts/backup-database.sh production
```

### Configuration Backups

- Keep wrangler.toml in version control
- Document all secret names and sources
- Maintain environment-specific configuration files

## Support and Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [KV Storage Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv/)

## Quick Reference

### Common Commands

```bash
# Development
npm run dev                    # Start local development
npm run build                  # Build for production
npm run test:run              # Run tests

# Deployment
npm run deploy:dev            # Deploy to development
npm run deploy:staging        # Deploy to staging
npm run deploy:prod           # Deploy to production

# Configuration
npm run setup:env             # Complete environment setup
npm run configure:secrets     # Configure secrets
npm run verify:env            # Verify configuration

# Debugging
wrangler tail --env production    # View logs
wrangler deployments list        # List deployments
wrangler rollback               # Rollback deployment
```

### Environment URLs

- **Development**: `https://isochrone-center-point-dev.your-domain.workers.dev`
- **Staging**: `https://isochrone-center-point-staging.your-domain.workers.dev`
- **Production**: `https://isochrone-center-point.your-domain.workers.dev`

Replace `your-domain` with your actual Cloudflare Workers subdomain or custom domain.
