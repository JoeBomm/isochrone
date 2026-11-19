#!/bin/bash

# Environment setup script for Cloudflare Workers deployment
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

show_usage() {
    echo "Usage: $0 [environment]"
    echo ""
    echo "This script helps set up Cloudflare Workers environment resources:"
    echo "- D1 Database"
    echo "- KV Namespaces"
    echo "- R2 Buckets (optional)"
    echo "- Environment variables and secrets"
    echo ""
    echo "Environments:"
    echo "  development  Set up development environment"
    echo "  staging      Set up staging environment"
    echo "  production   Set up production environment"
    echo ""
    echo "Prerequisites:"
    echo "- wrangler CLI installed and authenticated"
    echo "- Cloudflare account with Workers enabled"
}

# Parse arguments
ENVIRONMENT="${1:-development}"

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    show_usage
    exit 1
fi

log_info "Setting up Cloudflare Workers environment: $ENVIRONMENT"

# Check prerequisites
log_step "Checking prerequisites..."

if ! command -v wrangler &> /dev/null; then
    log_error "wrangler CLI is not installed. Please install it with: npm install -g wrangler"
    exit 1
fi

if ! wrangler whoami &> /dev/null; then
    log_error "Not authenticated with Cloudflare. Please run: wrangler login"
    exit 1
fi

# Set environment-specific names
DB_NAME="isochrone_db"
KV_NAME="isochrone-cache"
R2_NAME="isochrone-assets"

if [[ "$ENVIRONMENT" != "production" ]]; then
    DB_NAME="${DB_NAME}_${ENVIRONMENT}"
    KV_NAME="${KV_NAME}-${ENVIRONMENT}"
    R2_NAME="${R2_NAME}-${ENVIRONMENT}"
fi

# Create D1 Database
log_step "Creating D1 Database: $DB_NAME"
if wrangler d1 list | grep -q "$DB_NAME"; then
    log_info "D1 Database $DB_NAME already exists"
    DB_ID=$(wrangler d1 list | grep "$DB_NAME" | awk '{print $2}')
else
    log_info "Creating new D1 Database: $DB_NAME"
    DB_OUTPUT=$(wrangler d1 create "$DB_NAME")
    DB_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)
    log_info "Created D1 Database with ID: $DB_ID"
fi

# Run database migrations
log_step "Running database migrations..."
if [[ -d "./migrations" ]]; then
    log_info "Applying migrations to D1 database..."
    wrangler d1 migrations apply "$DB_NAME" --local
    if [[ "$ENVIRONMENT" == "production" ]]; then
        wrangler d1 migrations apply "$DB_NAME"
    fi
else
    log_warn "No migrations directory found. Skipping database setup."
fi

# Create KV Namespace
log_step "Creating KV Namespace: $KV_NAME"
if wrangler kv:namespace list | grep -q "$KV_NAME"; then
    log_info "KV Namespace $KV_NAME already exists"
    KV_ID=$(wrangler kv:namespace list | grep "$KV_NAME" | jq -r '.id')
else
    log_info "Creating new KV Namespace: $KV_NAME"
    KV_OUTPUT=$(wrangler kv:namespace create "$KV_NAME")
    KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
    log_info "Created KV Namespace with ID: $KV_ID"
fi

# Create preview KV Namespace
PREVIEW_KV_NAME="${KV_NAME}-preview"
log_step "Creating preview KV Namespace: $PREVIEW_KV_NAME"
if wrangler kv:namespace list | grep -q "$PREVIEW_KV_NAME"; then
    log_info "Preview KV Namespace $PREVIEW_KV_NAME already exists"
    PREVIEW_KV_ID=$(wrangler kv:namespace list | grep "$PREVIEW_KV_NAME" | jq -r '.id')
else
    log_info "Creating new preview KV Namespace: $PREVIEW_KV_NAME"
    PREVIEW_KV_OUTPUT=$(wrangler kv:namespace create "$PREVIEW_KV_NAME")
    PREVIEW_KV_ID=$(echo "$PREVIEW_KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
    log_info "Created preview KV Namespace with ID: $PREVIEW_KV_ID"
fi

# Create R2 Bucket (optional)
log_step "Creating R2 Bucket: $R2_NAME"
read -p "Do you want to create an R2 bucket for asset storage? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if wrangler r2 bucket list | grep -q "$R2_NAME"; then
        log_info "R2 Bucket $R2_NAME already exists"
    else
        log_info "Creating new R2 Bucket: $R2_NAME"
        wrangler r2 bucket create "$R2_NAME"
        log_info "Created R2 Bucket: $R2_NAME"
    fi
else
    log_info "Skipping R2 bucket creation"
fi

# Set up secrets
log_step "Setting up secrets..."
if [[ "$ENVIRONMENT" == "production" ]]; then
    log_info "Setting up production secrets..."

    echo "Please enter your OpenRouteService API key:"
    read -s OPENROUTE_API_KEY
    echo "$OPENROUTE_API_KEY" | wrangler secret put OPENROUTE_SERVICE_API_KEY --env production
    log_info "Set OPENROUTE_SERVICE_API_KEY secret"
else
    log_info "For development/staging, you can set secrets with:"
    log_info "wrangler secret put OPENROUTE_SERVICE_API_KEY --env $ENVIRONMENT"
fi

# Update wrangler.toml with the created resource IDs
log_step "Updating wrangler.toml configuration..."

# Create a backup of wrangler.toml
cp wrangler.toml wrangler.toml.backup

# Update the configuration (this is a simplified approach)
log_info "Please manually update your wrangler.toml with these values:"
echo ""
echo "For environment [$ENVIRONMENT]:"
echo "D1 Database ID: $DB_ID"
echo "KV Namespace ID: $KV_ID"
echo "Preview KV Namespace ID: $PREVIEW_KV_ID"
echo ""
echo "Add these to your wrangler.toml:"
echo ""
echo "[[d1_databases]]"
echo "binding = \"DB\""
echo "database_name = \"$DB_NAME\""
echo "database_id = \"$DB_ID\""
echo ""
echo "[[kv_namespaces]]"
echo "binding = \"CACHE\""
echo "id = \"$KV_ID\""
echo "preview_id = \"$PREVIEW_KV_ID\""

# Summary
log_step "Environment setup complete!"
log_info "Resources created for $ENVIRONMENT environment:"
log_info "✓ D1 Database: $DB_NAME ($DB_ID)"
log_info "✓ KV Namespace: $KV_NAME ($KV_ID)"
log_info "✓ Preview KV Namespace: $PREVIEW_KV_NAME ($PREVIEW_KV_ID)"

if wrangler r2 bucket list | grep -q "$R2_NAME"; then
    log_info "✓ R2 Bucket: $R2_NAME"
fi

log_info ""
log_info "Next steps:"
log_info "1. Update wrangler.toml with the resource IDs shown above"
log_info "2. Set any additional secrets with: wrangler secret put <SECRET_NAME> --env $ENVIRONMENT"
log_info "3. Test your deployment with: npm run deploy:worker"
log_info ""
log_info "For local development, run: npm run dev"
