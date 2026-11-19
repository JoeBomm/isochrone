#!/bin/bash

# Deployment script for Isochrone Center Point RedwoodSDK application
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENTS=("development" "staging" "production")
DEFAULT_ENV="development"
PROJECT_NAME="isochrone-center-point"

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
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Environments:"
    echo "  development  Deploy to development environment (default)"
    echo "  staging      Deploy to staging environment"
    echo "  production   Deploy to production environment"
    echo ""
    echo "Options:"
    echo "  --dry-run           Show what would be deployed without actually deploying"
    echo "  --force             Force deployment even if there are warnings"
    echo "  --skip-tests        Skip running tests before deployment"
    echo "  --skip-migrations   Skip running database migrations"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Deploy to development"
    echo "  $0 production                # Deploy to production"
    echo "  $0 staging --dry-run         # Dry run for staging"
    echo "  $0 production --skip-tests   # Deploy to production without running tests"
}

# Parse arguments
ENVIRONMENT="$DEFAULT_ENV"
DRY_RUN=false
FORCE=false
SKIP_TESTS=false
SKIP_MIGRATIONS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        development|staging|production)
            ENVIRONMENT="$1"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${ENVIRONMENT} " ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    log_error "Valid environments: ${ENVIRONMENTS[*]}"
    exit 1
fi

log_info "Starting deployment to $ENVIRONMENT environment"

# Pre-deployment checks
check_prerequisites() {
    log_step "Running pre-deployment checks..."

    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        log_error "wrangler CLI is not installed. Please install it with: npm install -g wrangler"
        exit 1
    fi

    # Check if user is authenticated
    if ! wrangler whoami &> /dev/null; then
        log_error "Not authenticated with Cloudflare. Please run: wrangler login"
        exit 1
    fi

    # Check if wrangler.toml exists and is properly configured
    if [[ ! -f wrangler.toml ]]; then
        log_error "wrangler.toml not found. Please ensure you're in the correct directory."
        exit 1
    fi

    # Check for placeholder values in wrangler.toml
    if grep -q "your-.*-id" wrangler.toml; then
        log_warn "Found placeholder IDs in wrangler.toml. Please update with actual resource IDs."
        if [[ "$FORCE" != true ]]; then
            log_error "Use --force to deploy anyway, or run setup-cloudflare.sh to create resources"
            exit 1
        fi
    fi

    log_info "Prerequisites check passed"
}

# Check environment-specific requirements
check_environment_requirements() {
    log_step "Checking $ENVIRONMENT environment requirements..."

    if [[ "$ENVIRONMENT" == "production" ]]; then
        # Check if production secrets are set
        if ! wrangler secret list --env production 2>/dev/null | grep -q "OPENROUTE_SERVICE_API_KEY"; then
            log_warn "OPENROUTE_SERVICE_API_KEY secret not found for production."
            log_warn "Set it with: wrangler secret put OPENROUTE_SERVICE_API_KEY --env production"
            if [[ "$FORCE" != true ]]; then
                log_error "Use --force to deploy anyway"
                exit 1
            fi
        fi

        # Additional production checks
        log_info "Verifying production database exists..."
        if ! wrangler d1 list | grep -q "${PROJECT_NAME//-/_}_db"; then
            log_warn "Production D1 database not found. Run setup-cloudflare.sh first."
            if [[ "$FORCE" != true ]]; then
                log_error "Use --force to deploy anyway"
                exit 1
            fi
        fi
    fi

    log_info "Environment requirements check passed"
}

# Build the application
build_application() {
    log_step "Building application..."

    # Clean previous build
    if [[ -d dist ]]; then
        rm -rf dist
        log_info "Cleaned previous build"
    fi

    # Run build
    if npm run build; then
        log_info "Build completed successfully"
    else
        log_error "Build failed"
        exit 1
    fi

    # Verify build output
    if [[ ! -f dist/worker.js ]]; then
        log_error "Build output not found: dist/worker.js"
        exit 1
    fi

    log_info "Build verification passed"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        log_warn "Skipping tests (--skip-tests flag used)"
        return 0
    fi

    log_step "Running tests..."

    # Run type check
    log_info "Running type check..."
    if ! npm run typecheck; then
        log_warn "Type check failed"
        if [[ "$FORCE" != true ]]; then
            log_error "Use --force to deploy anyway"
            exit 1
        fi
    fi

    # Run unit tests
    log_info "Running unit tests..."
    if ! npm run test:run; then
        log_warn "Tests failed"
        if [[ "$FORCE" != true ]]; then
            log_error "Use --force to deploy anyway"
            exit 1
        fi
    fi

    log_info "All tests passed"
}

# Run database migrations
run_database_migrations() {
    if [[ "$SKIP_MIGRATIONS" == true ]]; then
        log_warn "Skipping database migrations (--skip-migrations flag used)"
        return 0
    fi

    log_step "Running database migrations for $ENVIRONMENT..."

    # Apply migrations to the target environment
    if wrangler d1 migrations apply --env "$ENVIRONMENT" --remote; then
        log_info "Database migrations applied successfully"
    else
        log_warn "Database migrations failed or no migrations to apply"
        if [[ "$FORCE" != true ]]; then
            log_error "Use --force to deploy anyway"
            exit 1
        fi
    fi
}

# Deploy to Cloudflare Workers
deploy_worker() {
    log_step "Deploying to $ENVIRONMENT environment..."

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would deploy to $ENVIRONMENT environment"
        log_info "Command: wrangler deploy --env $ENVIRONMENT"
        log_info "Build output: $(ls -la dist/)"
        return 0
    fi

    # Deploy the worker
    if wrangler deploy --env "$ENVIRONMENT"; then
        log_info "Deployment successful!"
    else
        log_error "Deployment failed"
        exit 1
    fi
}

# Post-deployment verification
post_deployment_verification() {
    if [[ "$DRY_RUN" == true ]]; then
        return 0
    fi

    log_step "Running post-deployment verification..."

    # Get deployment info
    log_info "Recent deployments:"
    wrangler deployments list --env "$ENVIRONMENT" | head -5

    # Construct worker URL
    local worker_url="https://${PROJECT_NAME}"
    if [[ "$ENVIRONMENT" != "production" ]]; then
        worker_url="${worker_url}-${ENVIRONMENT}"
    fi
    worker_url="${worker_url}.your-domain.workers.dev"

    log_info "Deployment URL: $worker_url"

    # Wait for deployment to propagate
    log_info "Waiting for deployment to propagate..."
    sleep 10

    # Basic health check
    log_info "Running health check..."
    if curl -f -s --max-time 10 "${worker_url}/" > /dev/null 2>&1; then
        log_info "✅ Health check passed!"
    else
        log_warn "⚠️  Health check failed - please verify deployment manually"
        log_info "Try accessing: $worker_url"
    fi

    # Test API endpoints
    log_info "Testing API endpoints..."
    if curl -f -s --max-time 10 "${worker_url}/api/health" > /dev/null 2>&1; then
        log_info "✅ API health check passed!"
    else
        log_warn "⚠️  API health check failed - this may be expected if health endpoint is not implemented"
    fi
}

# Rollback function
rollback_deployment() {
    log_step "Rolling back deployment..."

    # Get previous deployment
    local previous_deployment
    previous_deployment=$(wrangler deployments list --env "$ENVIRONMENT" --format json | jq -r '.[1].id' 2>/dev/null)

    if [[ -n "$previous_deployment" && "$previous_deployment" != "null" ]]; then
        log_info "Rolling back to deployment: $previous_deployment"
        if wrangler rollback "$previous_deployment" --env "$ENVIRONMENT"; then
            log_info "Rollback successful"
        else
            log_error "Rollback failed"
        fi
    else
        log_warn "No previous deployment found for rollback"
    fi
}

# Main execution
main() {
    # Trap errors for potential rollback
    trap 'log_error "Deployment failed. Consider running rollback if needed."; exit 1' ERR

    check_prerequisites
    check_environment_requirements
    build_application
    run_tests
    run_database_migrations
    deploy_worker
    post_deployment_verification

    log_info "🎉 Deployment process completed successfully!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Test the deployed application thoroughly"
    log_info "2. Monitor logs with: wrangler tail --env $ENVIRONMENT"
    log_info "3. Check analytics in Cloudflare dashboard"

    if [[ "$ENVIRONMENT" == "development" ]]; then
        log_info "4. When ready, deploy to staging: $0 staging"
    elif [[ "$ENVIRONMENT" == "staging" ]]; then
        log_info "4. When ready, deploy to production: $0 production"
    fi
}

# Run main function
main
