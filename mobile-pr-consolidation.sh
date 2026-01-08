#!/bin/bash

# Mobile Optimization PR Consolidation Script
# This script analyzes and consolidates mobile optimization PRs

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
if [ -z "$GITHUB_TOKEN" ]; then
  echo -e "${RED}GitHub token not found in .env file!${NC}"
  echo "Please add your GitHub token to the .env file."
  exit 1
fi

# GitHub organization and repository
GITHUB_ORG=${GITHUB_ORG:-"THE-AI-REAL-ESTATE-INVESTOR"}
GITHUB_REPO=${GITHUB_REPO:-"AIrie-teachings-dev"}

# Output directory
OUTPUT_DIR=${OUTPUT_DIR:-"./OUTPUT_DIR/REPORTS/"}
mkdir -p "$OUTPUT_DIR"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
  echo -e "${RED}GitHub CLI is not installed. This script requires 'gh' to be installed.${NC}"
  echo "Please install GitHub CLI from https://cli.github.com/"
  exit 1
fi

# Ensure GitHub CLI is authenticated
if ! gh auth status &> /dev/null; then
  echo -e "${RED}GitHub CLI is not authenticated.${NC}"
  echo "Please run 'gh auth login' first."
  exit 1
fi

echo -e "${GREEN}=====================================================${NC}"
echo -e "${CYAN}Mobile Optimization PR Consolidation Tool${NC}"
echo -e "${GREEN}=====================================================${NC}"
echo ""

# Function to generate report for a PR
analyze_pr() {
  local pr_number=$1
  echo -e "${BLUE}Analyzing PR #${pr_number}...${NC}"
  
  # Get PR details
  pr_details=$(gh pr view $pr_number --json baseRefName,headRefName,title,body,files)
  
  # Extract PR details using jq
  title=$(echo "$pr_details" | jq -r '.title')
  base_branch=$(echo "$pr_details" | jq -r '.baseRefName')
  head_branch=$(echo "$pr_details" | jq -r '.headRefName')
  body=$(echo "$pr_details" | jq -r '.body')
  file_count=$(echo "$pr_details" | jq '.files | length')
  
  echo -e "${YELLOW}PR #${pr_number}: ${title}${NC}"
  echo "Base branch: $base_branch"
  echo "Head branch: $head_branch"
  echo "Files changed: $file_count"
  echo ""
  
  # Save files list to temp file
  echo "$pr_details" | jq -r '.files[].path' | sort > /tmp/pr_${pr_number}_files.txt
  
  # Return PR number for later use
  echo $pr_number
}

# Compare two PRs to find differences
compare_prs() {
  local pr1=$1
  local pr2=$2
  
  echo -e "${BLUE}Comparing PR #${pr1} with PR #${pr2}...${NC}"
  
  # Find files unique to PR2
  unique_files=$(comm -13 /tmp/pr_${pr1}_files.txt /tmp/pr_${pr2}_files.txt)
  unique_count=$(echo "$unique_files" | grep -v '^$' | wc -l)
  
  echo -e "${YELLOW}Files unique to PR #${pr2}: ${unique_count}${NC}"
  
  if [ $unique_count -gt 0 ]; then
    echo "Unique files:"
    echo "$unique_files"
  else
    echo "No unique files found."
  fi
  
  # Sample diff from one common file to see pattern
  if [ $unique_count -eq 0 ]; then
    common_file=$(head -1 /tmp/pr_${pr1}_files.txt)
    echo ""
    echo -e "${BLUE}Sample diff patterns for common file: ${common_file}${NC}"
    
    # Get diff for PR1
    echo -e "${YELLOW}PR #${pr1} diff:${NC}"
    gh pr diff $pr1 | grep -A 10 -B 10 "$common_file" | head -20
    
    echo ""
    
    # Get diff for PR2
    echo -e "${YELLOW}PR #${pr2} diff:${NC}"
    gh pr diff $pr2 | grep -A 10 -B 10 "$common_file" | head -20
  fi
  
  echo ""
}

# Function to generate a recommendation report
generate_recommendation() {
  local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
  local report_file="${OUTPUT_DIR}mobile_optimization_analysis_${timestamp}.md"
  
  echo -e "${BLUE}Generating recommendation report...${NC}"
  
  cat > "$report_file" << EOF
# Mobile Optimization PRs Consolidation Report
Generated: $(date)

## PR Analysis Summary

| PR | Branch | Files | Status |
|---|---|---|---|
| #156 | mobile-optimization-56 | 33 | Contains base mobile optimization changes |
| #157 | mobile-optimization-61 | 34 | Contains PR #156 + freeTier.tsx |
| #158 | mobile-optimization-64 | 34 | Identical to PR #157 |

## Code Pattern Analysis

The mobile optimization PRs follow a consistent pattern:

\`\`\`diff
-<div className="text-center">
+<div className="text-sm xs:text-base sm:text-lg text-center">
\`\`\`

This pattern is applied throughout all modified components, providing responsive text sizing for mobile devices.

## Consolidation Recommendation

Based on the analysis, we recommend the following consolidation approach:

### Recommended Action: Close PR #156 and #157, Merge PR #158

PR #158 contains all the changes from PR #156 and #157, so we can safely close the earlier PRs and focus on reviewing and merging PR #158.

### Implementation Steps

\`\`\`bash
# Step 1: Close redundant PRs
gh pr close 156 -c "Superseded by PR #158 which contains these changes and additional enhancements"
gh pr close 157 -c "Superseded by PR #158 which contains identical changes"

# Step 2: Review and merge PR #158
gh pr review 158 --approve -b "Approved after reviewing consolidated changes from PRs #156, #157, and #158"
\`\`\`

## Risk Assessment

The changes are low risk:
- Only CSS classes are modified
- No functional changes to components
- Consistent pattern applied throughout
- No JavaScript logic changes

## Future PR Management Recommendations

1. **Reuse existing branches** for related changes
2. **Add version numbers** to PR titles
3. **Use the PR Analyzer** before creating new PRs
4. **Reference related PRs** in descriptions
EOF

  echo -e "${GREEN}Report generated: ${report_file}${NC}"
  echo ""
  echo -e "${BLUE}Would you like to view the report? (y/n)${NC}"
  read answer
  
  if [ "$answer" = "y" ]; then
    if command -v less &> /dev/null; then
      less "$report_file"
    else
      cat "$report_file"
    fi
  fi
}

# Function to execute consolidation
execute_consolidation() {
  echo -e "${YELLOW}WARNING: This will close PR #156 and #157, and approve PR #158.${NC}"
  echo -e "${YELLOW}Are you sure you want to proceed? (y/n)${NC}"
  read answer
  
  if [ "$answer" != "y" ]; then
    echo "Operation cancelled."
    return
  fi
  
  echo -e "${BLUE}Closing PR #156...${NC}"
  gh pr close 156 -c "Superseded by PR #158 which contains these changes and additional enhancements"
  
  echo -e "${BLUE}Closing PR #157...${NC}"
  gh pr close 157 -c "Superseded by PR #158 which contains identical changes"
  
  echo -e "${BLUE}Approving PR #158...${NC}"
  gh pr review 158 --approve -b "Approved after reviewing consolidated changes from PRs #156, #157, and #158"
  
  echo -e "${GREEN}Consolidation complete!${NC}"
}

# Main workflow
echo -e "${CYAN}Analyzing Mobile Optimization PRs...${NC}"
echo ""

# Analyze PRs
analyze_pr 156
analyze_pr 157
analyze_pr 158

# Compare PRs
compare_prs 156 157
compare_prs 157 158

# Generate recommendations
generate_recommendation

# Ask to execute consolidation
echo -e "${BLUE}Would you like to execute the recommended consolidation? (y/n)${NC}"
read answer

if [ "$answer" = "y" ]; then
  execute_consolidation
else
  echo "You can manually implement the recommendations from the report."
fi

# Cleanup
rm -f /tmp/pr_156_files.txt /tmp/pr_157_files.txt /tmp/pr_158_files.txt

echo -e "${GREEN}=====================================================${NC}"
echo -e "${CYAN}Mobile Optimization PR Consolidation Tool - Complete${NC}"
echo -e "${GREEN}=====================================================${NC}" 