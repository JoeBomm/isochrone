#!/bin/bash

# Cloudflare Workers setup script for Isochrone Center Point
# This script creates the necessary Cloudflare resources and configures secrets

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENTS=("development" "staging" "production")
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
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --create-resources   Create D1 databases and KV namespaces"
    echo "  --set-secrets       Set up environment secrets"
    echo "  --update-config     Update wrangler.toml with created resource IDs"
    echo "  --all               Run all setup steps"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --all                    # Complete setup"
    echo "  $0 --create-resources       # Only create Cloudflare resources"
    echo "  $0 --set-secrets           # Only configure secrets"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

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

    log_info "Prerequisites check passed"
}

# Create D1 databases
create_d1_databases() {
    log_step "Creating D1 databases..."

    for env in "${ENVIRONMENTS[@]}"; do
        local db_name="${PROJECT_NAME//-/_}_db"
        if [[ "$env" != "production" ]]; then
            db_name="${db_name}_${env}"
        fi

        log_info "Creating D1 database: $db_name"

        # Create database and capture output
        local output
        if output=$(wrangler d1 create "$db_name" 2>&1); then
            log_info "Created D1 database: $db_name"

            # Extract database ID from output
            local db_id
            db_id=$(echo "$output" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

            if [[ -n "$db_id" ]]; then
                log_info "Database ID for $env: $db_id"
                echo "# $env environment D1 database ID: $db_id" >> .cloudflare-resources.txt
            fi
        else
            if echo "$output" | grep -q "already exists"; then
                log_warn "D1 database $db_name already exists"
            else
                log_error "Failed to create D1 database $db_name: $output"
            fi
        fi
    done
}

# Create KV namespaces
create_kv_namespaces() {
    log_step "Creating KV namespaces..."

    for env in "${ENVIRONMENTS[@]}"; do
        local kv_name="CACHE"
        if [[ "$env" != "production" ]]; then
            kv_name="CACHE_${env^^}"
        fi

        log_info "Creating KV namespace: $kv_name"

        # Create KV namespace
        local output
        if output=$(wrangler kv:namespace create "$kv_name" 2>&1); then
            log_info "Created KV namespace: $kv_name"

            # Extract namespace ID
            local kv_id
            kv_id=$(echo "$output" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)

            if [[ -n "$kv_id" ]]; then
                log_info "KV namespace ID for $env: $kv_id"
                echo "# $env environment KV namespace ID: $kv_id" >> .cloudflare-resources.txt
            fi
        else
            if echo "$output" | grep -q "already exists"; then
                log_warn "KV namespace $kv_name already exists"
            else
                log_error "Failed to create KV namespace $kv_name: $output"
            fi
        fi

        # Create preview namespace for development
        if [[ "$env" == "development" ]]; then
            log_info "Creating preview KV namespace: ${kv_name}_PREVIEW"

            if output=$(wrangler kv:namespace create "${kv_name}_PREVIEW" --preview 2>&1); then
                log_info "Created preview KV namespace: ${kv_name}_PREVIEW"

                local preview_id
                preview_id=$(echo "$output" | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)

                if [[ -n "$preview_id" ]]; then
                    log_info "Preview KV namespace ID: $preview_id"
                    echo "# Preview KV namespace ID: $preview_id" >> .cloudflare-resources.txt
                fi
            fi
        fi
    done
}

# Create R2 buckets
create_r2_buckets() {
    log_step "Creating R2 buckets..."

    # Create main bucket
    log_info "Creating R2 bucket: isochrone-assets"
    if wrangler r2 bucket create isochrone-assets 2>/dev/null; then
        log_info "Created R2 bucket: isochrone-assets"
    else
        log_warn "R2 bucket isochrone-assets may already exist or R2 is not available"
    fi

    # Create preview bucket
    log_info "Creating R2 preview bucket: isochrone-assets-preview"
    if wrangler r2 bucket create isochrone-assets-preview 2>/dev/null; then
        log_info "Created R2 preview bucket: isochrone-assets-preview"
    else
        log_warn "R2 preview bucket isochrone-assets-preview may already exist or R2 is not available"
    fi
}

# Set up secrets
setup_secrets() {
    log_step "Setting up environment secrets..."

    # Check if .env file exists
    if [[ ! -f .env ]]; then
        log_warn ".env file not found. Please create one based on .env.example"
        return 1
    fi

    # Source environment variables
    set -a
    source .env
    set +a

    # Set secrets for each environment
    for env in "${ENVIRONMENTS[@]}"; do
        log_info "Setting secrets for $env environment..."

        # OpenRouteService API Key (required)
        if [[ -n "$OPENROUTE_SERVICE_API_KEY" ]]; then
            echo "$OPENROUTE_SERVICE_API_KEY" | wrangler secret put OPENROUTE_SERVICE_API_KEY --env "$env"
            log_info "Set OPENROUTE_SERVICE_API_KEY for $env"
        else
            log_warn "OPENROUTE_SERVICE_API_KEY not found in .env file"
        fi

        # Additional secrets can be added here
        # Example: Database encryption key, JWT secret, etc.
    done
}

# Run database migrations
run_migrations() {
    log_step "Running database migrations..."

    for env in "${ENVIRONMENTS[@]}"; do
        log_info "Running migrations for $env environment..."

        if wrangler d1 migrations apply --env "$env" --remote; then
            log_info "Migrations applied successfully for $env"
        else
            log_warn "Failed to apply migrations for $env (database may not exist yet)"
        fi
    done
}

# Update wrangler.toml with resource IDs
update_wrangler_config() {
    log_step "Updating wrangler.toml configuration..."

    if [[ -f .cloudflare-resources.txt ]]; then
        log_info "Resource IDs have been saved to .cloudflare-resources.txt"
        log_info "Please manually update wrangler.toml with the following IDs:"
        cat .cloudflare-resources.txt
        log_warn "Automatic wrangler.toml update is not implemented yet"
        log_warn "Please replace the placeholder IDs in wrangler.toml with the actual IDs above"
    else
        log_warn "No resource IDs file found. Run --create-resources first."
    fi
}

# Main execution
main() {
    local create_resources=false
    local set_secrets=false
    local update_config=false
    local run_all=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --create-resources)
                create_resources=true
                shift
                ;;
            --set-secrets)
                set_secrets=true
                shift
                ;;
            --update-config)
                update_config=true
                shift
                ;;
            --all)
                run_all=true
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

    # If no specific options, show usage
    if [[ "$create_resources" == false && "$set_secrets" == false && "$update_config" == false && "$run_all" == false ]]; then
        show_usage
        exit 1
    fi

    # Check prerequisites
    check_prerequisites

    # Initialize resources file
    if [[ "$create_resources" == true || "$run_all" == true ]]; then
        echo "# Cloudflare Resources for $PROJECT_NAME" > .cloudflare-resources.txt
        echo "# Generated on $(date)" >> .cloudflare-resources.txt
        echo "" >> .cloudflare-resources.txt
    fi

    # Execute requested operations
    if [[ "$run_all" == true ]]; then
        create_d1_databases
        create_kv_namespaces
        create_r2_buckets
        setup_secrets
        run_migrations
        update_wrangler_config
    else
        if [[ "$create_resources" == true ]]; then
            create_d1_databases
            create_kv_namespaces
            create_r2_buckets
        fi

        if [[ "$set_secrets" == true ]]; then
            setup_secrets
        fi

        if [[ "$update_config" == true ]]; then
            update_wrangler_config
        fi
    fi

    log_info "Setup completed successfully!"
    log_info "Next steps:"
    log_info "1. Update wrangler.toml with the actual resource IDs"
    log_info "2. Run 'npm run build' to build the application"
    log_info "3. Run 'wrangler deploy --env development' to deploy to development"
    log_info "4. Test the deployment and then deploy to staging/production"
}

# Run main function with all arguments
main "$@"
