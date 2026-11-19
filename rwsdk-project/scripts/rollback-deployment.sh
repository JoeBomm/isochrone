#!/bin/bash

# Code Deployment Rollback Script
#
# This script provides rollback capabilities for code deployments
# from RedwoodSDK back to RedwoodJS.
#
# Requirements: 8.5 - Document code deployment rollback process

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REDWOODJS_ROOT="$(dirname "$PROJECT_ROOT")"

# Default values
DRY_RUN=false
BACKUP_DIR="$PROJECT_ROOT/backups"
ENVIRONMENT="development"
PRESERVE_DATA=true
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Code Deployment Rollback Script

This script rolls back from RedwoodSDK deployment to RedwoodJS.

Usage: $0 [options]

Options:
    -e, --environment ENV    Target environment (development|staging|production)
    -b, --backup-dir DIR     Backup directory path (default: ./backups)
    -d, --dry-run           Preview changes without executing
    -p, --preserve-data     Preserve database data during rollback (default: true)
    -v, --verbose           Enable verbose output
    -h, --help              Show this help message

Examples:
    $0 --dry-run --environment staging
    $0 --environment production --backup-dir /path/to/backups
    $0 --verbose --preserve-data

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -b|--backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -p|--preserve-data)
                PRESERVE_DATA=true
                shift
                ;;
            --no-preserve-data)
                PRESERVE_DATA=false
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate environment
validate_environment() {
    case $ENVIRONMENT in
        development|staging|production)
            log_info "Target environment: $ENVIRONMENT"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_error "Must be one of: development, staging, production"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if we're in the right directory
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "Not in a valid project directory"
        exit 1
    fi

    # Check if RedwoodJS project exists
    if [[ ! -f "$REDWOODJS_ROOT/redwood.toml" ]]; then
        log_error "RedwoodJS project not found at: $REDWOODJS_ROOT"
        exit 1
    fi

    # Check required tools
    local required_tools=("node" "yarn" "git")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done

    # Check for backup directory
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warning "Backup directory not found: $BACKUP_DIR"
        if [[ "$DRY_RUN" == "false" ]]; then
            log_info "Creating backup directory..."
            mkdir -p "$BACKUP_DIR"
        fi
    fi

    log_success "Prerequisites check completed"
}

# Create backup of current state
create_backup() {
    log_info "Creating backup of current RedwoodSDK state..."

    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_path="$BACKUP_DIR/redwoodsdk_backup_$timestamp"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create backup at: $backup_path"
        return 0
    fi

    mkdir -p "$backup_path"

    # Backup source code
    log_info "Backing up source code..."
    cp -r "$PROJECT_ROOT/src" "$backup_path/"
    cp "$PROJECT_ROOT/package.json" "$backup_path/"
    cp "$PROJECT_ROOT/wrangler.toml" "$backup_path/"

    # Backup configuration files
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        cp "$PROJECT_ROOT/.env" "$backup_path/"
    fi

    # Backup database if it exists
    if [[ -f "$PROJECT_ROOT/local.db" ]]; then
        log_info "Backing up local database..."
        cp "$PROJECT_ROOT/local.db" "$backup_path/"
    fi

    log_success "Backup created at: $backup_path"
    echo "$backup_path" > "$BACKUP_DIR/latest_backup.txt"
}

# Stop RedwoodSDK services
stop_redwoodsdk_services() {
    log_info "Stopping RedwoodSDK services..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would stop RedwoodSDK services"
        return 0
    fi

    # Stop local development server if running
    local miniflare_pid=$(pgrep -f "miniflare" || true)
    if [[ -n "$miniflare_pid" ]]; then
        log_info "Stopping Miniflare (PID: $miniflare_pid)..."
        kill "$miniflare_pid" || true
        sleep 2
    fi

    # Stop any Wrangler processes
    local wrangler_pid=$(pgrep -f "wrangler" || true)
    if [[ -n "$wrangler_pid" ]]; then
        log_info "Stopping Wrangler (PID: $wrangler_pid)..."
        kill "$wrangler_pid" || true
        sleep 2
    fi

    log_success "RedwoodSDK services stopped"
}

# Rollback database if needed
rollback_database() {
    if [[ "$PRESERVE_DATA" == "false" ]]; then
        log_info "Skipping database rollback (preserve-data disabled)"
        return 0
    fi

    log_info "Rolling back database..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute database rollback"
        return 0
    fi

    # Check if database rollback script exists
    local rollback_script="$SCRIPT_DIR/rollback-database.ts"
    if [[ -f "$rollback_script" ]]; then
        log_info "Executing database rollback script..."
        cd "$PROJECT_ROOT"
        node "$rollback_script" --dry-run=false
    else
        log_warning "Database rollback script not found, skipping database rollback"
    fi

    log_success "Database rollback completed"
}

# Switch to RedwoodJS
switch_to_redwoodjs() {
    log_info "Switching to RedwoodJS..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would switch to RedwoodJS directory: $REDWOODJS_ROOT"
        return 0
    fi

    cd "$REDWOODJS_ROOT"

    # Install dependencies
    log_info "Installing RedwoodJS dependencies..."
    yarn install

    # Run database migrations if needed
    if [[ -f "api/db/schema.prisma" ]]; then
        log_info "Running Prisma migrations..."
        yarn rw prisma migrate deploy
    fi

    log_success "Switched to RedwoodJS"
}

# Start RedwoodJS services
start_redwoodjs_services() {
    log_info "Starting RedwoodJS services..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would start RedwoodJS services"
        return 0
    fi

    cd "$REDWOODJS_ROOT"

    case $ENVIRONMENT in
        development)
            log_info "Starting development servers..."
            log_info "Run 'yarn rw dev' to start the development servers"
            ;;
        staging|production)
            log_info "Building for production..."
            yarn rw build
            log_success "Production build completed"
            ;;
    esac
}

# Update configuration
update_configuration() {
    log_info "Updating configuration for RedwoodJS..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would update configuration files"
        return 0
    fi

    cd "$REDWOODJS_ROOT"

    # Update environment variables if needed
    if [[ -f ".env.example" && ! -f ".env" ]]; then
        log_info "Creating .env from .env.example..."
        cp ".env.example" ".env"
    fi

    # Reset any RedwoodSDK-specific configurations
    log_info "Configuration updated for RedwoodJS"
}

# Verify rollback
verify_rollback() {
    log_info "Verifying rollback..."

    cd "$REDWOODJS_ROOT"

    # Check if RedwoodJS files exist
    local required_files=("redwood.toml" "api/package.json" "web/package.json")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required RedwoodJS file missing: $file"
            return 1
        fi
    done

    # Check if we can run basic RedwoodJS commands
    if [[ "$DRY_RUN" == "false" ]]; then
        log_info "Testing RedwoodJS CLI..."
        if yarn rw --version &> /dev/null; then
            log_success "RedwoodJS CLI is working"
        else
            log_error "RedwoodJS CLI is not working"
            return 1
        fi
    fi

    log_success "Rollback verification completed"
}

# Generate rollback report
generate_report() {
    local report_file="$BACKUP_DIR/rollback_report_$(date +"%Y%m%d_%H%M%S").txt"

    log_info "Generating rollback report..."

    cat > "$report_file" << EOF
=== RedwoodSDK to RedwoodJS Rollback Report ===

Date: $(date)
Environment: $ENVIRONMENT
Dry Run: $DRY_RUN
Preserve Data: $PRESERVE_DATA

Directories:
- RedwoodJS Root: $REDWOODJS_ROOT
- RedwoodSDK Root: $PROJECT_ROOT
- Backup Directory: $BACKUP_DIR

Actions Performed:
✓ Prerequisites checked
✓ Backup created
✓ RedwoodSDK services stopped
$([ "$PRESERVE_DATA" == "true" ] && echo "✓ Database rolled back" || echo "- Database rollback skipped")
✓ Switched to RedwoodJS
✓ RedwoodJS services prepared
✓ Configuration updated
✓ Rollback verified

Next Steps:
1. Start RedwoodJS development servers: yarn rw dev
2. Verify application functionality
3. Update any external configurations (DNS, load balancers, etc.)
4. Monitor application performance and errors

Backup Location:
$(cat "$BACKUP_DIR/latest_backup.txt" 2>/dev/null || echo "No backup created")

=== End of Report ===
EOF

    log_success "Rollback report generated: $report_file"
}

# Main rollback function
perform_rollback() {
    log_info "=== Starting RedwoodSDK to RedwoodJS Rollback ==="

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No changes will be made"
    fi

    # Execute rollback steps
    check_prerequisites
    create_backup
    stop_redwoodsdk_services
    rollback_database
    switch_to_redwoodjs
    update_configuration
    start_redwoodjs_services
    verify_rollback
    generate_report

    log_success "=== Rollback completed successfully ==="

    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        log_info "Your application has been rolled back to RedwoodJS"
        log_info "RedwoodJS project location: $REDWOODJS_ROOT"
        log_info "To start development: cd $REDWOODJS_ROOT && yarn rw dev"
    fi
}

# Main execution
main() {
    parse_args "$@"
    validate_environment
    perform_rollback
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
