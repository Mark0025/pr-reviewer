#!/bin/bash

# Quick test script for PR Consolidator v4
# Tests functionality with enhanced logging

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
OUTPUT_DIR="./OUTPUT_DIR/REPORTS"
mkdir -p "$OUTPUT_DIR"

# Check for command-line arguments
EXECUTE_MODE=false
if [ "$1" == "--execute" ]; then
  EXECUTE_MODE=true
fi

# Log file for this test
LOG_FILE="$OUTPUT_DIR/quick-test-$(date +%Y%m%d-%H%M%S).log"

echo -e "${CYAN}PR Consolidator v4 Quick Test${NC}"
echo -e "${YELLOW}Running with enhanced logging...${NC}"
echo -e "${BLUE}Log file: ${LOG_FILE}${NC}"

# Test with a small subset of mobile optimization PRs (3 PRs only)
echo -e "${YELLOW}Testing with PRs: 168, 156, 155${NC}"

if [ "$EXECUTE_MODE" = true ]; then
  echo -e "${RED}RUNNING IN EXECUTE MODE - WILL ACTUALLY MAKE PR CHANGES${NC}"
  echo -e "${RED}Press Ctrl+C now to cancel or wait 5 seconds to continue...${NC}"
  sleep 5
  
  npx ts-node pr-consolidator-v4.ts --prs 168,156,155 --strategy keep-latest --execute | tee "$LOG_FILE"
else
  echo -e "${GREEN}RUNNING IN ANALYSIS-ONLY MODE - NO PR CHANGES WILL BE MADE${NC}"
  npx ts-node pr-consolidator-v4.ts --prs 168,156,155 --strategy keep-latest | tee "$LOG_FILE"
fi

if [ $? -eq 0 ]; then
  echo -e "\n${GREEN}Test completed successfully!${NC}"
  
  # Find the generated report file
  LATEST_REPORT=$(find "$OUTPUT_DIR" -name "pr-consolidation-*.md" -type f -exec stat -f "%m %N" {} \; | sort -n | tail -1 | cut -f2- -d" ")
  
  if [ -n "$LATEST_REPORT" ]; then
    echo -e "${GREEN}Report generated: ${LATEST_REPORT}${NC}"
    echo -e "${YELLOW}Report contains executable commands section:${NC}"
    grep -A 10 "## Executable Commands" "$LATEST_REPORT"
    echo -e "${CYAN}...${NC}"
    
    if [ "$EXECUTE_MODE" = true ]; then
      echo -e "${RED}Changes have been made to PRs. Please verify in GitHub.${NC}"
    else
      echo -e "${GREEN}No PR changes were made. Run with --execute to perform actions.${NC}"
      echo -e "${YELLOW}Example: ./quick-test.sh --execute${NC}"
    fi
  else
    echo -e "${RED}No report file found!${NC}"
  fi
else
  echo -e "\n${RED}Test failed!${NC}"
fi 