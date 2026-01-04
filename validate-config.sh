#!/bin/bash

# Cloudflare Pages Configuration Validator
# This script validates that the project is correctly configured for Cloudflare Pages deployment

echo "🔍 Validating Cloudflare Pages Configuration..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Check 1: Verify wrangler.toml exists
echo "✓ Checking wrangler.toml..."
if [ ! -f "wrangler.toml" ]; then
    echo -e "${RED}✗ FAIL: wrangler.toml not found${NC}"
    errors=$((errors + 1))
else
    echo -e "${GREEN}  ✓ wrangler.toml exists${NC}"

    # Check for pages_build_output_dir
    if grep -q "pages_build_output_dir" wrangler.toml; then
        echo -e "${GREEN}  ✓ pages_build_output_dir is set (Pages project)${NC}"
    else
        echo -e "${RED}  ✗ FAIL: pages_build_output_dir not found in wrangler.toml${NC}"
        errors=$((errors + 1))
    fi

    # Check for main field (should NOT exist for Pages)
    if grep -q "^main\s*=" wrangler.toml; then
        echo -e "${RED}  ✗ FAIL: 'main' field found in wrangler.toml (this makes it a Workers project, not Pages)${NC}"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}  ✓ No 'main' field (correct for Pages)${NC}"
    fi
fi
echo ""

# Check 2: Verify public directory exists
echo "✓ Checking build output directory..."
if [ ! -d "public" ]; then
    echo -e "${YELLOW}⚠ WARNING: public/ directory not found${NC}"
    echo "  This directory should contain your built static assets"
    warnings=$((warnings + 1))
else
    echo -e "${GREEN}  ✓ public/ directory exists${NC}"

    # Check for _worker.js (Pages Functions)
    if [ -f "public/_worker.js" ]; then
        echo -e "${GREEN}  ✓ public/_worker.js found (Pages Functions enabled)${NC}"
    else
        echo -e "${YELLOW}  ⚠ public/_worker.js not found (static-only mode)${NC}"
    fi
fi
echo ""

# Check 3: Verify package.json scripts
echo "✓ Checking package.json scripts..."
if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ FAIL: package.json not found${NC}"
    errors=$((errors + 1))
else
    if grep -q '"deploy".*"wrangler pages deploy' package.json; then
        echo -e "${GREEN}  ✓ Deploy script uses 'wrangler pages deploy' (correct)${NC}"
    else
        echo -e "${RED}  ✗ FAIL: Deploy script doesn't use 'wrangler pages deploy'${NC}"
        errors=$((errors + 1))
    fi
fi
echo ""

# Check 4: Dashboard configuration (informational)
echo "📋 Dashboard Configuration Requirements"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANT: The following settings MUST be configured in the Cloudflare Pages dashboard:"
echo ""
echo "   1. Go to: Cloudflare Dashboard → Workers & Pages → mapper → Settings → Builds & deployments"
echo ""
echo "   2. Required settings:"
echo "      • Build command: (leave EMPTY or remove any existing command)"
echo "      • Build output directory: public"
echo "      • Root directory: / (default)"
echo ""
echo "   3. What to avoid:"
echo -e "      ${RED}✗ Do NOT use: npx wrangler deploy${NC}"
echo -e "      ${RED}✗ Do NOT use: wrangler deploy${NC}"
echo -e "      ${GREEN}✓ Leave build command empty (Pages handles deployment automatically)${NC}"
echo ""
echo "   📖 See DEPLOYMENT_FIX.md for detailed dashboard instructions"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summary
echo "📊 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Local configuration is correct. If deployments are still failing,"
    echo "verify the Cloudflare Pages dashboard settings (see above)."
    exit 0
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠ Passed with $warnings warning(s)${NC}"
    exit 0
else
    echo -e "${RED}✗ Found $errors error(s) and $warnings warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before deploying."
    exit 1
fi
