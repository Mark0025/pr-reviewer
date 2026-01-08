# PR Reviewer Tools

This directory contains tools to help manage and review pull requests for the AIrie-teachings-dev project.

## Tools Overview

1. **PR Analyzer** (`pr-analyzer.ts`): Analyzes current PRs and provides recommendations
2. **PR Consolidator** (`pr-consolidator.ts`): Helps consolidate multiple related PRs into a single PR
3. **Shell Script** (`pr-tools.sh`): Interactive shell script to simplify using the tools
4. **ESLint Config** (`eslint.config.mjs`): ESLint rules for the PR tools

## Recent Fixes

The PR management tools have been recently updated to fix the following issues:

1. **TypeScript Errors**: Fixed property access for PR objects by properly retrieving data from the GitHub API
2. **Dependency Updates**: Updated `@octokit/rest` to version 19.0.11 for better compatibility
3. **Module Fixes**: Added proper CommonJS configuration to avoid ESM/CJS conflicts
4. **Self-contained Environment**: All dependencies are now isolated to this directory
5. **GitHub CLI Integration**: Added automatic token retrieval from GitHub CLI if you're already authenticated
6. **Change Intent Analysis**: Added intelligent analysis of PR changes to understand what they're suggesting
7. **Output Directory Management**: Reports are now saved to a configurable output directory
8. **Standardized Timestamps**: All reports use CST timezone for consistent version sequencing

## Documentation

For the full PR reviewer guide, please refer to the included documentation file: 
- [`pr-management-readme.md`](./pr-management-readme.md)

## Quick Start

The easiest way to use these tools is with the interactive shell script:

```bash
# Navigate to the pr-reviewer tools directory
cd _DEV_MAN/tools/pr-reviewer

# Make the script executable (if needed)
chmod +x pr-tools.sh

# Run the interactive tool
./pr-tools.sh
```

The script will guide you through setting up your environment and running the tools.

## GitHub Authentication

The tools support two ways to authenticate with GitHub:

1. **GitHub CLI (Recommended)**: If you have the GitHub CLI (`gh`) installed and authenticated, the script will automatically retrieve your token. Just run the script and select option 5 to check GitHub CLI status and import your credentials.

2. **Manual Token Entry**: You can manually add your GitHub personal access token to the `.env` file.

## Configuration

These tools use a `.env` file for configuration. If you don't have one, the script will help you create one, or you can copy the example:

```bash
cp .env.example .env
```

Then edit the `.env` file with your settings:

```bash
# GitHub Token (required for API access)
# Create a personal access token at https://github.com/settings/tokens
# with 'repo' scope permissions, or use GitHub CLI integration
GITHUB_TOKEN=your_github_personal_access_token_here

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
# Where analysis reports will be stored
OUTPUT_DIR=./OUTPUT_DIR/REPORTS/
```

## Output and Reports

When you run the PR Analyzer, it will:

1. Create the output directory specified in your `.env` file (if it doesn't exist)
2. Generate a detailed analysis report with CST timestamps
3. Save the report with both timestamped and latest versions:
   - `OUTPUT_DIR/pr-analysis-report-MM-DD-YYYY_HH-MM-SS.md` (version history)
   - `OUTPUT_DIR/pr-analysis-report-latest.md` (always points to most recent)

This approach maintains a history of all analyses while always providing easy access to the latest report.

## Manual Setup

If you prefer not to use the interactive script, you can set up and run the tools manually:

### 1. Install Dependencies

```bash
# Navigate to the pr-reviewer tools directory
cd _DEV_MAN/tools/pr-reviewer

# Install dependencies
npm install
```

### 2. Create Configuration

```bash
# Copy the example configuration
cp .env.example .env

# Edit the .env file with your settings (especially your GitHub token)
nano .env
```

### 3. Using the PR Analyzer

```bash
# Run the analyzer
npx ts-node pr-analyzer.ts
```

### 4. Using the PR Consolidator

```bash
# Run the consolidator
npx ts-node pr-consolidator.ts
```

## Troubleshooting

### Installation Issues

If you encounter errors when running the tools:

1. **Missing dependencies**: Make sure you've installed the dependencies by running `npm install` in the pr-reviewer directory
2. **TypeScript errors**: The tools are written in TypeScript and require the dependencies to be properly installed
3. **Environment variables**: Ensure your `.env` file is properly configured
4. **GitHub CLI**: Some features require the GitHub CLI to be installed and authenticated

### Common Error Messages

- **Cannot find module '@octokit/rest'**: Run `npm install` in the pr-reviewer directory
- **GitHub token not set**: Edit your `.env` file and add your GitHub personal access token, or use GitHub CLI integration with option 5
- **Permission denied**: Make sure the script is executable with `chmod +x pr-tools.sh`
- **Bad credentials**: Your GitHub token is invalid or expired. Generate a new token with 'repo' scope or use GitHub CLI integration

## Requirements

- Node.js 14+
- TypeScript
- GitHub CLI (for PR operations and optional token retrieval)
- GitHub personal access token with repo scope (not needed if using GitHub CLI) 