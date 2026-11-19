#!/bin/bash

# Comprehensive environment configuration script for RedwoodSDK project
# This script helps configure both local development and Cloudflare deployment environments

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
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  local           Set up local development environment"
    echo "  cloudflare      Set up Cloudflare Workers environment"
    echo "  secrets         Configure environment secrets"
    echo "  verify          Verify environment configuration"
    echo "  all             Run complete setup (local + cloudflare)"
    echo ""
    echo "Options:"
    echo "  --env ENV       Target environment (development|staging|production)"
    echo "  --force         Force overwrite existing configuration"
    echo "  --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 local                           # Set up local development"
    echo "  $0 cloudflare --env production     # Set up production Cloudflare env"
    echo "  $0 secrets --env staging           # Configure staging secrets"
    echo "  $0 all --env development           # Complete development setup"
}

# Parse arguments
COMMAND=""
ENVIRONMENT="development"
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        local|cloudflare|secrets|verify|all)
            COMMAND="$1"
            shift
            ;;
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --force)
            FORCE=true
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

# Validate inputs
if [[ -z "$COMMAND" ]]; then
    log_error "No command specified"
    show_usage
    exit 1
fi

if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    log_error "Valid environments: development, staging, production"
    exit 1
fi

# Set up local development environment
setup_local_environment() {
    log_step "Setting up local development environment..."

    # Create .env file
    if [[ ! -f .env ]] || [[ "$FORCE" == true ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            log_info "Created .env file from .env.example"
            log_warn "Please edit .env file and add your actual API keys"
        else
            log_error ".env.example file not found"
            return 1
        fi
    else
        log_info ".env file already exists (use --force to overwrite)"
    fi

    # Install dependencies
    log_info "Installing project dependencies..."
    if command -v npm &> /dev/null; then
        npm install
        log_info "Dependencies installed successfully"
    else
        log_error "npm not found. Please install Node.js first."
        return 1
    fi

    # Set up local database directory
    mkdir -p .miniflare/d1
    log_info "Local database directory created"

    # Verify local setup
    log_info "Local development environment setup completed"
    log_info "Start development with: npm run dev"
}

# Set up Cloudflare Workers environment
setup_cloudflare_environment() {
    log_step "Setting up Cloudflare Workers environment: $ENVIRONMENT"

    # Check prerequisites
    if ! command -v wrangler &> /dev/null; then
        log_error "wrangler CLI is not installed. Please install it with: npm install -g wrangler"
        return 1
    fi

    if ! wrangler whoami &> /dev/null; then
        log_error "Not authenticated with Cloudflare. Please run: wrangler login"
        return 1
    fi

    # Set environment-specific names
    local db_name="isochrone_db"
    local kv_name="isochrone-cache"
    local r2_name="isochrone-assets"

    if [[ "$ENVIRONMENT" != "production" ]]; then
        db_name="${db_name}_${ENVIRONMENT}"
        kv_name="${kv_name}-${ENVIRONMENT}"
        r2_name="${r2_name}-${ENVIRONMENT}"
    fi

    # Create D1 Database
    log_info "Setting up D1 Database: $db_name"
    local db_id=""
    if wrangler d1 list | grep -q "$db_name"; then
        log_info "D1 Database $db_name already exists"
        db_id=$(wrangler d1 list | grep "$db_name" | awk '{print $2}')
    else
        log_info "Creating new D1 Database: $db_name"
        local db_output
        db_output=$(wrangler d1 create "$db_name")
        db_id=$(echo "$db_output" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)
        log_info "Created D1 Database with ID: $db_id"
    fi

    # Create KV Namespace
    log_info "Setting up KV Namespace: $kv_name"
    local kv_id=""
    if wrangler kv:namespace list | grep -q "$kv_name"; then
        log_info "KV Namespace $kv_name already exists"
        kv_id=$(wrangler kv:namespace list | grep "$kv_name" | jq -r '.id' 2>/dev/null || echo "")
    else
        log_info "Creating new KV Namespace: $kv_name"
        local kv_output
        kv_output=$(wrangler kv:namespace create "$kv_name")
        kv_id=$(echo "$kv_output" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
        log_info "Created KV Namespace with ID: $kv_id"
    fi

    # Create preview KV Namespace
    local preview_kv_name="${kv_name}-preview"
    local preview_kv_id=""
    if wrangler kv:namespace list | grep -q "$preview_kv_name"; then
        log_info "Preview KV Namespace $preview_kv_name already exists"
        preview_kv_id=$(wrangler kv:namespace list | grep "$preview_kv_name" | jq -r '.id' 2>/dev/null || echo "")
    else
        log_info "Creating new preview KV Namespace: $preview_kv_name"
        local preview_kv_output
        preview_kv_output=$(wrangler kv:namespace create "$preview_kv_name")
        preview_kv_id=$(echo "$preview_kv_output" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
        log_info "Created preview KV Namespace with ID: $preview_kv_id"
    fi

    # Save resource IDs to file
    local resources_file=".cloudflare-resources-${ENVIRONMENT}.txt"
    {
        echo "# Cloudflare Resources for $ENVIRONMENT environment"
        echo "# Generated on $(date)"
        echo ""
        echo "D1_DATABASE_ID=$db_id"
        echo "KV_NAMESPACE_ID=$kv_id"
        echo "PREVIEW_KV_NAMESPACE_ID=$preview_kv_id"
        echo ""
        echo "# wrangler.toml configuration:"
        echo "# [[env.$ENVIRONMENT.d1_databases]]"
        echo "# binding = \"DB\""
        echo "# database_name = \"$db_name\""
        echo "# database_id = \"$db_id\""
        echo "#"
        echo "# [[env.$ENVIRONMENT.kv_namespaces]]"
        echo "# binding = \"CACHE\""
        echo "# id = \"$kv_id\""
        if [[ -n "$preview_kv_id" ]]; then
            echo "# preview_id = \"$preview_kv_id\""
        fi
    } > "$resources_file"

    log_info "Resource IDs saved to: $resources_file"
    log_warn "Please update wrangler.toml with the resource IDs from this file"

    # Run database migrations
    if [[ -d "./migrations" ]]; then
        log_info "Running database migrations..."
        if wrangler d1 migrations apply "$db_name" --remote; then
            log_info "Database migrations applied successfully"
        else
            log_warn "Failed to apply migrations (this may be expected for new databases)"
        fi
    else
        log_warn "No migrations directory found"
    fi
}

# Configure environment secrets
configure_secrets() {
    log_step "Configuring secrets for $ENVIRONMENT environment..."

    # Check if .env file exists for local values
    if [[ -f .env ]]; then
        log_info "Reading configuration from .env file..."
        set -a
        source .env
        set +a
    else
        log_warn ".env file not found. You'll need to enter values manually."
    fi

    # Configure OpenRouteService API Key
    if [[ -n "$OPENROUTE_SERVICE_API_KEY" && "$OPENROUTE_SERVICE_API_KEY" != "your_openroute_service_api_key_here" ]]; then
        log_info "Setting OPENROUTE_SERVICE_API_KEY from .env file..."
        echo "$OPENROUTE_SERVICE_API_KEY" | wrangler secret put OPENROUTE_SERVICE_API_KEY --env "$ENVIRONMENT"
        log_info "OPENROUTE_SERVICE_API_KEY configured for $ENVIRONMENT"
    else
        log_warn "OPENROUTE_SERVICE_API_KEY not found in .env or is placeholder value"
        read -p "Enter your OpenRouteService API key (or press Enter to skip): " -s api_key
        echo
        if [[ -n "$api_key" ]]; then
            echo "$api_key" | wrangler secret put OPENROUTE_SERVICE_API_KEY --env "$ENVIRONMENT"
            log_info "OPENROUTE_SERVICE_API_KEY configured for $ENVIRONMENT"
        else
            log_warn "Skipped OPENROUTE_SERVICE_API_KEY configuration"
        fi
    fi

    # List configured secrets
    log_info "Currently configured secrets for $ENVIRONMENT:"
    wrangler secret list --env "$ENVIRONMENT" || log_warn "Failed to list secrets"
}

# Verify environment configuration
verify_environment() {
    log_step "Verifying environment configuration..."

    local errors=0

    # Check local files
    local required_files=("package.json" "wrangler.toml" "miniflare.toml" "vite.config.ts")
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            log_info "✅ $file exists"
        else
            log_error "❌ $file not found"
            errors=$((errors + 1))
        fi
    done

    # Check .env file
    if [[ -f .env ]]; then
        log_info "✅ .env file exists"

        # Check for required variables
        if grep -q "OPENROUTE_SERVICE_API_KEY=" .env; then
            local api_key
            api_key=$(grep "OPENROUTE_SERVICE_API_KEY=" .env | cut -d'=' -f2)
            if [[ -n "$api_key" && "$api_key" != "your_openroute_service_api_key_here" ]]; then
                log_info "✅ OPENROUTE_SERVICE_API_KEY is configured"
            else
                log_warn "⚠️  OPENROUTE_SERVICE_API_KEY needs to be set in .env"
            fi
        else
            log_warn "⚠️  OPENROUTE_SERVICE_API_KEY not found in .env"
        fi
    else
        log_warn "⚠️  .env file not found"
    fi

    # Check dependencies
    if [[ -d node_modules ]]; then
        log_info "✅ Dependencies installed"
    else
        log_warn "⚠️  Dependencies not installed (run: npm install)"
    fi

    # Check Cloudflare configuration
    if command -v wrangler &> /dev/null; then
        log_info "✅ wrangler CLI installed"

        if wrangler whoami &> /dev/null; then
            log_info "✅ Authenticated with Cloudflare"
        else
            log_warn "⚠️  Not authenticated with Cloudflare (run: wrangler login)"
        fi
    else
        log_warn "⚠️  wrangler CLI not installed"
    fi

    # Check for placeholder values in wrangler.toml
    if grep -q "your-.*-id" wrangler.toml; then
        log_warn "⚠️  Found placeholder IDs in wrangler.toml"
        log_warn "   Run: $0 cloudflare --env $ENVIRONMENT to create resources"
    else
        log_info "✅ wrangler.toml appears to be configured"
    fi

    # Summary
    if [[ $errors -eq 0 ]]; then
        log_info "🎉 Environment verification completed successfully!"
    else
        log_error "❌ Environment verification failed with $errors error(s)"
        return 1
    fi
}

# Main execution
main() {
    log_info "Configuring environment: $ENVIRONMENT"
    log_info "Command: $COMMAND"
    echo

    case "$COMMAND" in
        local)
            setup_local_environment
            ;;
        cloudflare)
            setup_cloudflare_environment
            ;;
        secrets)
            configure_secrets
            ;;
        verify)
            verify_environment
            ;;
        all)
            setup_local_environment
            echo
            setup_cloudflare_environment
            echo
            configure_secrets
            echo
            verify_environment
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac

    echo
    log_info "Configuration completed for: $COMMAND ($ENVIRONMENT)"

    if [[ "$COMMAND" != "verify" ]]; then
        log_info "Run verification with: $0 verify --env $ENVIRONMENT"
    fi
}

# Run main function
main
