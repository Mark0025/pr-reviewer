#!/bin/bash

# PR Tools Menu
# Interactive shell script to simplify using PR tools

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

# Load environment variables from .env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check for GitHub token
get_github_token() {
  # First try to get from environment variable
  if [ -n "$GITHUB_TOKEN" ]; then
    echo "$GITHUB_TOKEN"
    return 0
  fi
  
  # Try to get from GitHub CLI
  if command -v gh &> /dev/null; then
    token=$(gh auth token 2>/dev/null)
    if [ -n "$token" ]; then
      echo "$token"
      return 0
    fi
  fi
  
  # No token found
  echo ""
  return 1
}

# Ensure the output directory exists
ensure_output_dir() {
  # Get output directory from .env or use default
  OUTPUT_DIR=${OUTPUT_DIR:-"./OUTPUT_DIR/REPORTS/"}
  
  # Create the directory if it doesn't exist
  if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    echo -e "${GREEN}Created output directory: ${OUTPUT_DIR}${NC}"
  fi
  
  echo "$OUTPUT_DIR"
}

# Display menu
show_menu() {
  clear
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${CYAN}PR Tools Menu${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo "1. Run PR Analyzer"
  echo "2. Run PR Consolidator (Enhanced)"
  echo "3. Run PR Auto Reviewer" 
  echo "4. Run PR Consolidator v4"
  echo "5. Edit .env"
  echo "6. Check GitHub CLI"
  echo "7. View PR Management Guide"
  echo "0. Exit"
  echo -e "${GREEN}=========================================${NC}"
}

# Run PR Analyzer
run_analyzer() {
  echo "Running PR Analyzer..."
  ensure_output_dir > /dev/null
  
  npx ts-node pr-analyzer.ts
  
  if [ $? -eq 0 ]; then
    echo "PR analysis complete!"
  else
    echo "PR analysis failed. Check the error message above."
  fi
  
  read -p "Press Enter to continue..."
}

# Run Enhanced PR Consolidator
run_enhanced_consolidator() {
  echo "Running Enhanced PR Consolidator..."
  ensure_output_dir > /dev/null
  
  # Check if PR numbers were provided
  echo "Would you like to specify PR numbers? (y/n)"
  read answer
  
  if [ "$answer" = "y" ]; then
    echo "Enter PR numbers separated by spaces:"
    read pr_numbers
    npx ts-node pr-consolidator-enhanced.ts $pr_numbers
  else
    npx ts-node pr-consolidator-enhanced.ts
  fi
  
  if [ $? -eq 0 ]; then
    echo "PR consolidation complete!"
  else
    echo "PR consolidation failed. Check the error message above."
  fi
  
  read -p "Press Enter to continue..."
}

# Run PR Auto Reviewer
run_auto_reviewer() {
  echo -e "${CYAN}Running PR Auto Reviewer...${NC}"
  ensure_output_dir > /dev/null
  
  # Check if PR number was provided
  echo "Enter PR number to auto-review:"
  read pr_number
  
  if [[ -n "$pr_number" && "$pr_number" =~ ^[0-9]+$ ]]; then
    if [ -f "pr-auto-reviewer.ts" ]; then
      npx ts-node pr-auto-reviewer.ts $pr_number
      
      if [ $? -eq 0 ]; then
        echo -e "${GREEN}PR auto-review complete!${NC}"
        echo -e "${YELLOW}Report saved to: $(ensure_output_dir)pr-auto-review-${pr_number}-*.md${NC}"
      else
        echo -e "${RED}PR auto-review failed. Check the error message above.${NC}"
      fi
    else
      echo -e "${RED}Error: pr-auto-reviewer.ts not found.${NC}"
      echo -e "${YELLOW}Make sure you're in the correct directory and the file exists.${NC}"
    fi
  else
    echo -e "${RED}Invalid PR number. Please enter a valid number.${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

# Run PR Consolidator v4
run_consolidator_v4() {
  echo -e "${CYAN}Running PR Consolidator v4...${NC}"
  
  # Ensure output directory exists
  OUTPUT_DIR=${OUTPUT_DIR:-"./OUTPUT_DIR/REPORTS/"}
  if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    echo -e "${GREEN}Created output directory: ${OUTPUT_DIR}${NC}"
  fi
  
  # Prompt for PR numbers or leave empty to select from list
  read -p "Enter PR numbers to consolidate (comma-separated, or leave empty to select from list): " pr_numbers
  
  # Prompt for strategy
  echo -e "${YELLOW}Available strategies:${NC}"
  echo "1. keep-latest - Use the most recent PR that contains all changes"
  echo "2. rolling-up - Progressive integration from earliest to latest PR"
  echo "3. consolidation-map - Structured approach with integration points"
  echo "4. auto - Automatically determine the best strategy (default)"
  read -p "Select strategy (1-4): " strategy_choice
  
  case "$strategy_choice" in
    1) strategy="keep-latest" ;;
    2) strategy="rolling-up" ;;
    3) strategy="consolidation-map" ;;
    *) strategy="auto" ;;
  esac
  
  # Log file for this run
  LOG_FILE="$OUTPUT_DIR/pr-tools-$(date +%Y%m%d-%H%M%S).log"
  
  # Prepare the command
  cmd="cd \"$SCRIPT_DIR\" && npx ts-node pr-consolidator-v4.ts"
  
  # Add PR numbers if provided
  if [ -n "$pr_numbers" ]; then
    cmd="$cmd --prs \"$pr_numbers\""
  fi
  
  # Add strategy
  cmd="$cmd --strategy \"$strategy\""
  
  # Run the consolidator
  echo -e "${YELLOW}Starting PR Consolidator v4 with strategy: $strategy${NC}"
  echo -e "${BLUE}Command: $cmd${NC}"
  echo -e "${BLUE}Log file: $LOG_FILE${NC}"
  
  # Run and capture start time
  start_time=$(date +%s)
  eval "$cmd" | tee "$LOG_FILE"
  exit_code=${PIPESTATUS[0]}
  end_time=$(date +%s)
  duration=$((end_time - start_time))
  
  # Check result
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}PR consolidation v4 completed successfully in $duration seconds.${NC}"
    
    # Find the generated report file
    if [[ "$(uname)" == "Darwin" ]]; then
      # macOS version
      LATEST_REPORT=$(find "$OUTPUT_DIR" -name "pr-consolidation-*.md" -type f -exec stat -f "%m %N" {} \; | sort -n | tail -1 | cut -f2- -d" ")
    else
      # Linux version
      LATEST_REPORT=$(find "$OUTPUT_DIR" -name "pr-consolidation-*.md" -type f -printf "%T@ %p\n" | sort -n | tail -1 | cut -f2- -d" ")
    fi
    
    if [ -n "$LATEST_REPORT" ]; then
      echo -e "${GREEN}Report generated: ${LATEST_REPORT}${NC}"
      
      # Ask if user wants to view the report
      read -p "Would you like to view the report? (y/n): " view_report
      if [[ "$view_report" == "y" ]]; then
        if command -v less &> /dev/null; then
          less "$LATEST_REPORT"
        else
          cat "$LATEST_REPORT"
        fi
      fi
    else
      echo -e "${RED}No report file found!${NC}"
    fi
  else
    echo -e "${RED}PR consolidation v4 failed with exit code $exit_code.${NC}"
    echo -e "${RED}Check the log file for details: $LOG_FILE${NC}"
  fi
  
  read -p "Press Enter to continue..."
}

# Edit .env file
edit_env() {
  echo "Editing .env file..."
  
  # Check if .env exists
  if [ ! -f ".env" ]; then
    # Create .env from .env.example if exists
    if [ -f ".env.example" ]; then
      cp .env.example .env
      echo "Created .env from .env.example"
    else
      # Create a basic .env
      cat > .env << EOF
# GitHub Token (required for API access)
# Create a personal access token at https://github.com/settings/tokens
# with 'repo' scope permissions, or use GitHub CLI integration
GITHUB_TOKEN=

# GitHub Organization and Repository
GITHUB_ORG=THE-AI-REAL-ESTATE-INVESTOR
GITHUB_REPO=AIrie-teachings-dev

# Critical Directories (comma-separated)
CRITICAL_DIRECTORIES=app/lib/services,app/components/auth,app/api,middleware

# Directories that require tests (comma-separated)
TEST_REQUIRED_DIRS=services,utils,api

# Auto-merge patterns (comma-separated)
AUTOMERGE_PATTERNS=docs/,README.md,*.md

# Output Directory for Reports
OUTPUT_DIR=./OUTPUT_DIR/REPORTS/
EOF
      echo "Created basic .env file"
    fi
  fi
  
  # Open .env with preferred editor
  if command -v nano >/dev/null 2>&1; then
    nano .env
  elif command -v vim >/dev/null 2>&1; then
    vim .env
  else
    # Fallback to basic editor
    echo "Please edit the .env file with your preferred text editor."
    read -p "Press Enter to continue..."
  fi
}

# Check GitHub CLI installation and authentication
check_gh_cli() {
  echo "Checking GitHub CLI status..."
  
  # Check if GitHub CLI is installed
  if ! command -v gh &> /dev/null; then
    echo -e "${RED}GitHub CLI is not installed.${NC}"
    echo "Install instructions: https://cli.github.com/manual/installation"
    read -p "Press Enter to continue..."
    return
  fi
  
  echo -e "${GREEN}GitHub CLI is installed.${NC}"
  
  # Check if GitHub CLI is authenticated
  if gh auth status &> /dev/null; then
    echo -e "${GREEN}GitHub CLI is authenticated.${NC}"
    
    # Update .env with token
    token=$(gh auth token)
    if [ -n "$token" ]; then
      # Update .env with token
      if [ -f ".env" ]; then
        # Check if GITHUB_TOKEN is already set
        if grep -q "^GITHUB_TOKEN=" .env; then
          # Update existing token
          sed -i.bak "s/^GITHUB_TOKEN=.*/GITHUB_TOKEN=$token/" .env && rm -f .env.bak
        else
          # Add token if not present
          echo "GITHUB_TOKEN=$token" >> .env
        fi
      else
        # Create .env with token
        echo "GITHUB_TOKEN=$token" > .env
      fi
      echo -e "${GREEN}GitHub token updated in .env file.${NC}"
    fi
  else
    echo -e "${YELLOW}GitHub CLI is not authenticated.${NC}"
    echo "Run 'gh auth login' to authenticate."
  fi
  
  read -p "Press Enter to continue..."
}

# View PR Management Guide
view_guide() {
  echo "Opening PR Management Guide..."
  
  if [ -f "pr-management-readme.md" ]; then
    # Display the guide
    if command -v less &> /dev/null; then
      less pr-management-readme.md
    else
      cat pr-management-readme.md
    fi
  else
    echo "PR Management Guide not found."
  fi
  
  read -p "Press Enter to continue..."
}

# Open output directory
open_output_dir() {
  output_dir=$(ensure_output_dir)
  
  echo "Opening output directory: $output_dir"
  
  # Try to open the directory based on the OS
  if [ "$(uname)" == "Darwin" ]; then
    # macOS
    open "$output_dir"
  elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
    # Linux
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$output_dir"
    else
      echo "Cannot open directory automatically. Path: $output_dir"
    fi
  elif [ "$(expr substr $(uname -s) 1 10)" == "MINGW32_NT" ] || [ "$(expr substr $(uname -s) 1 10)" == "MINGW64_NT" ]; then
    # Windows
    explorer "$output_dir"
  else
    echo "Cannot open directory automatically. Path: $output_dir"
  fi
  
  read -p "Press Enter to continue..."
}

# Main loop
while true; do
  show_menu
  echo -n "Enter your choice: "
  read choice
  
  case $choice in
    1) run_analyzer ;;
    2) run_enhanced_consolidator ;;
    3) run_auto_reviewer ;;
    4) run_consolidator_v4 ;;
    5) edit_env ;;
    6) check_gh_cli ;;
    7) view_guide ;;
    0) exit 0 ;;
    *) echo "Invalid choice. Press Enter to continue..."; read ;;
  esac
done 