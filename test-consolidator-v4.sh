#!/bin/bash

# Test script for PR Consolidator v4
# Tests functionality against mobile optimization PRs (142-168)

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directory containing this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure output directory exists
OUTPUT_DIR="./OUTPUT_DIR/TEST_REPORTS"
mkdir -p "$OUTPUT_DIR"

# Log file
LOG_FILE="$OUTPUT_DIR/test-results-$(date +%Y%m%d-%H%M%S).log"
SUMMARY_FILE="$OUTPUT_DIR/test-summary-$(date +%Y%m%d-%H%M%S).md"

# Initialize summary
echo "# PR Consolidator v4 Test Summary" > "$SUMMARY_FILE"
echo "Test run: $(date)" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "## Test Results" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# Test counter
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to log a message
log() {
  echo -e "$1" | tee -a "$LOG_FILE"
}

# Function to run a test and track results
run_test() {
  local test_name="$1"
  local test_command="$2"
  local expected_exit_code="${3:-0}"
  local check_output_regex="${4:-}"
  
  ((TESTS_TOTAL++))
  
  log "\n${YELLOW}Running test: ${test_name}${NC}"
  log "${BLUE}Command: ${test_command}${NC}"
  
  # Execute command and capture output and exit code
  local start_time=$(date +%s)
  local output
  output=$(eval "$test_command" 2>&1)
  local exit_code=$?
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  
  # Check exit code
  if [ "$exit_code" -eq "$expected_exit_code" ]; then
    log "${GREEN}Exit code check passed (got $exit_code)${NC}"
    
    # Check output if regex provided
    if [ -n "$check_output_regex" ]; then
      if echo "$output" | grep -q -E "$check_output_regex"; then
        log "${GREEN}Output check passed${NC}"
        ((TESTS_PASSED++))
        
        # Add to summary
        echo "- ✅ $test_name ($duration seconds)" >> "$SUMMARY_FILE"
        return 0
      else
        log "${RED}Output check failed${NC}"
        log "${RED}Expected output to match: $check_output_regex${NC}"
        log "${RED}Got: ${output}${NC}"
        ((TESTS_FAILED++))
        
        # Add to summary
        echo "- ❌ $test_name - Output did not match expected pattern" >> "$SUMMARY_FILE"
        return 1
      fi
    else
      ((TESTS_PASSED++))
      
      # Add to summary
      echo "- ✅ $test_name ($duration seconds)" >> "$SUMMARY_FILE"
      return 0
    fi
  else
    log "${RED}Exit code check failed (expected $expected_exit_code, got $exit_code)${NC}"
    log "${RED}Output: ${output}${NC}"
    ((TESTS_FAILED++))
    
    # Add to summary
    echo "- ❌ $test_name - Exit code: expected $expected_exit_code, got $exit_code" >> "$SUMMARY_FILE"
    return 1
  fi
}

# Start tests
log "${CYAN}Starting PR Consolidator v4 tests${NC}"
log "Date: $(date)"
log "Log file: $LOG_FILE"
log "Summary file: $SUMMARY_FILE"

# Test 1: Basic help command
run_test "Help command" "npx ts-node pr-consolidator-v4.ts --help" 0 "help|usage"

# Test 2: CLI token check
run_test "GitHub CLI authentication" "gh auth status" 0 "Logged in|authenticated"

# Test 3: Auto strategy with mobile optimization PRs
run_test "Auto strategy with mobile PRs" "npx ts-node pr-consolidator-v4.ts --prs 142,143,145,146,147,148,149,150,151,152,155,156,168 --strategy auto" 0 "PR.Consolidation.Analysis.saved"

# Test 4: Keep-latest strategy
run_test "Keep-latest strategy" "npx ts-node pr-consolidator-v4.ts --prs 142,143,145,146,147,148,149,150,151,152,155,156,168 --strategy keep-latest" 0 "Recommended.Strategy:.keep-latest"

# Test 5: Rolling-up strategy
run_test "Rolling-up strategy" "npx ts-node pr-consolidator-v4.ts --prs 142,143,145,146,147 --strategy rolling-up" 0 "Recommended.Strategy:.rolling-up"

# Test 6: Consolidation map strategy
run_test "Consolidation map strategy" "npx ts-node pr-consolidator-v4.ts --prs 142,143,145,146,147,148,149,150,151,152,155,156,168 --strategy consolidation-map" 0 "Recommended.Strategy:.consolidation-map"

# Test 7: Invalid PRs
run_test "Invalid PRs" "npx ts-node pr-consolidator-v4.ts --prs 9999,8888 --strategy auto" 1 "No.PRs.to.consolidate"

# Test 8: Execute flag recognition
run_test "Execute flag recognition" "npx ts-node pr-consolidator-v4.ts --prs 168,156,155 --strategy keep-latest --execute --help | grep -- '--execute'" 0 "Automatically.execute"

# Test 9: Report file existence check after test 3
if [[ "$(uname)" == "Darwin" ]]; then
  # macOS version
  REPORT_FILE=$(find "$OUTPUT_DIR/../REPORTS/" -name "pr-consolidation-*.md" -type f -exec stat -f "%m %N" {} \; | sort -n | tail -1 | cut -f2- -d" ")
else
  # Linux version
  REPORT_FILE=$(find "$OUTPUT_DIR/../REPORTS/" -name "pr-consolidation-*.md" -type f -printf "%T@ %p\n" | sort -n | tail -1 | cut -f2- -d" ")
fi

if [ -n "$REPORT_FILE" ] && [ -f "$REPORT_FILE" ]; then
  run_test "Report file check" "cat \"$REPORT_FILE\" | grep -E 'PR Summary|Strategy Recommendation'" 0 "PR.Summary|Strategy.Recommendation"
  
  # Copy the latest report to our test output
  cp "$REPORT_FILE" "$OUTPUT_DIR/latest-report.md"
  log "${GREEN}Latest report copied to $OUTPUT_DIR/latest-report.md${NC}"
else
  log "${RED}No report file found!${NC}"
  ((TESTS_FAILED++))
  ((TESTS_TOTAL++))
  echo "- ❌ Report file check - No report file found" >> "$SUMMARY_FILE"
fi

# Test 10: Check strategy-selector.ts
run_test "Strategy selector module" "grep -q 'export function determineStrategy' strategy-selector.ts && echo 'Strategy selector found'" 0 "Strategy.selector.found"

# Test 11: Check pr-consolidation-map.ts
run_test "Consolidation map module" "grep -q 'export function createConsolidationMap' pr-consolidation-map.ts && echo 'Consolidation map found'" 0 "Consolidation.map.found"

# Test 12: Menu script integration
run_test "Menu script integration" "grep -q 'run_consolidator_v4' pr-tools.sh && echo 'Menu integration found'" 0 "Menu.integration.found"

# Complete summary
echo "" >> "$SUMMARY_FILE"
echo "## Summary" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "- Total tests: $TESTS_TOTAL" >> "$SUMMARY_FILE"
echo "- Passed: $TESTS_PASSED" >> "$SUMMARY_FILE"
echo "- Failed: $TESTS_FAILED" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

# If a report was generated, analyze it
if [ -f "$OUTPUT_DIR/latest-report.md" ]; then
  echo "## Latest Report Analysis" >> "$SUMMARY_FILE"
  echo "" >> "$SUMMARY_FILE"
  
  # Count PRs in report
  PR_COUNT=$(grep -c "^| #" "$OUTPUT_DIR/latest-report.md" || echo "0")
  echo "- PRs analyzed: $PR_COUNT" >> "$SUMMARY_FILE"
  
  # Extract strategy
  STRATEGY=$(grep -A 1 "Recommended Strategy:" "$OUTPUT_DIR/latest-report.md" | tail -1 | sed 's/^**Recommended Strategy:** //')
  echo "- Selected strategy: $STRATEGY" >> "$SUMMARY_FILE"
  
  # Extract confidence
  CONFIDENCE=$(grep -A 2 "Recommended Strategy:" "$OUTPUT_DIR/latest-report.md" | tail -1 | sed 's/^**Confidence:** //')
  echo "- Confidence: $CONFIDENCE" >> "$SUMMARY_FILE"
  
  # Extract implementation steps
  STEPS=$(grep -c "^[0-9]\+\." "$OUTPUT_DIR/latest-report.md" || echo "0")
  echo "- Implementation steps: $STEPS" >> "$SUMMARY_FILE"
  
  echo "" >> "$SUMMARY_FILE"
  echo "## Recommendations" >> "$SUMMARY_FILE"
  echo "" >> "$SUMMARY_FILE"
  
  if [ "$PR_COUNT" -gt 10 ]; then
    echo "- ⚠️ Large number of PRs detected ($PR_COUNT). Consider batching PRs for more manageable consolidation." >> "$SUMMARY_FILE"
  fi
  
  if [ "$STRATEGY" = "keep-latest" ]; then
    echo "- 📌 Keep-latest strategy selected. Ensure the latest PR (#168) contains all necessary changes." >> "$SUMMARY_FILE"
    echo "- 🔍 Verify mobile responsiveness across all affected pages after consolidation." >> "$SUMMARY_FILE"
  fi
  
  if [ "$STRATEGY" = "rolling-up" ]; then
    echo "- 📌 Rolling-up strategy selected. This requires incremental integration and testing." >> "$SUMMARY_FILE"
    echo "- 🔄 Consider using the automated execution feature for assistance." >> "$SUMMARY_FILE"
  fi
  
  if [ "$STRATEGY" = "consolidation-map" ]; then
    echo "- 📌 Consolidation-map strategy selected. This requires careful planning of integration points." >> "$SUMMARY_FILE"
    echo "- 📊 Review the visual map to understand PR dependencies." >> "$SUMMARY_FILE"
  fi
fi

# Print summary
log "\n${CYAN}Test Summary${NC}"
log "${BLUE}Total tests: ${TESTS_TOTAL}${NC}"
log "${GREEN}Passed: ${TESTS_PASSED}${NC}"
log "${RED}Failed: ${TESTS_FAILED}${NC}"

log "\n${CYAN}Detailed results saved to:${NC}"
log "${YELLOW}Log: ${LOG_FILE}${NC}"
log "${YELLOW}Summary: ${SUMMARY_FILE}${NC}"

# Exit with failure if any tests failed
if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
else
  exit 0
fi 