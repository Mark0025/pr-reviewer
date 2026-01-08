#!/bin/bash

# PR Reviewer Tools Setup Script
# This script automates the setup of the PR reviewer tools

echo "=============================="
echo "🔧 PR REVIEWER TOOLS SETUP 🔧"
echo "=============================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if GitHub CLI is installed and authenticated
check_gh_auth() {
  if command -v gh >/dev/null 2>&1; then
    if gh auth status &>/dev/null; then
      return 0
    fi
  fi
  return 1
}

# Get GitHub token from GitHub CLI
get_gh_token() {
  if check_gh_auth; then
    TOKEN=$(gh auth token)
    if [ ! -z "$TOKEN" ]; then
      echo "✅ Successfully retrieved GitHub token from GitHub CLI!"
      return 0
    fi
  fi
  return 1
}

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required but not installed."
  echo "Please install Node.js and try again."
  exit 1
fi

# Check for npm
if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but not installed."
  echo "Please install npm and try again."
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
  echo "❌ Failed to install dependencies. Please check the error message above."
  exit 1
fi
echo "✅ Dependencies installed successfully!"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "📄 Creating .env file from example..."
    cp .env.example .env
    
    # Try to get GitHub token from GitHub CLI
    if get_gh_token; then
      # Update the .env file with the token
      sed -i.bak "s/GITHUB_TOKEN=.*/GITHUB_TOKEN=$TOKEN/" .env
      rm -f .env.bak
      echo "✅ Updated .env file with your GitHub token from GitHub CLI!"
    else
      echo "⚠️ GitHub token not configured. You'll need to edit the .env file with your GitHub token."
      echo "   You can create a token at: https://github.com/settings/tokens"
      echo "   Or run the pr-tools.sh script to import it from GitHub CLI."
    fi
    
    echo "✅ Created .env file."
  else
    echo "❌ .env.example file not found. Cannot create .env file."
    exit 1
  fi
fi

# Make sure OUTPUT_DIR exists
OUTPUT_DIR=$(grep "OUTPUT_DIR" .env | cut -d'=' -f2)
if [ -z "$OUTPUT_DIR" ]; then
  # If OUTPUT_DIR is not in .env, add it
  echo "OUTPUT_DIR=./OUTPUT_DIR/REPORTS/" >> .env
  OUTPUT_DIR="./OUTPUT_DIR/REPORTS/"
  echo "📁 Added OUTPUT_DIR to .env file."
fi

# Create OUTPUT_DIR directory structure
OUTPUT_DIR=${OUTPUT_DIR//\"/}  # Remove any quotes
OUTPUT_DIR=${OUTPUT_DIR//\'/}  # Remove any quotes
OUTPUT_DIR=${OUTPUT_DIR%/}/    # Ensure trailing slash

# Create the directory
mkdir -p "$OUTPUT_DIR"
if [ $? -eq 0 ]; then
  echo "📁 Created output directory: $OUTPUT_DIR"
else
  echo "⚠️ Failed to create output directory: $OUTPUT_DIR"
fi

# Make pr-tools.sh executable
if [ -f "pr-tools.sh" ]; then
  echo "🔒 Making pr-tools.sh executable..."
  chmod +x pr-tools.sh
  echo "✅ pr-tools.sh is now executable!"
else
  echo "❌ pr-tools.sh not found. Cannot make it executable."
  exit 1
fi

# Check for GitHub CLI
if ! command -v gh >/dev/null 2>&1; then
  echo "⚠️ GitHub CLI not found."
  echo "Some features of PR Reviewer Tools require GitHub CLI."
  echo "Would you like to install GitHub CLI now? (y/n)"
  read install_gh
  
  if [ "$install_gh" = "y" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "📦 Installing GitHub CLI with Homebrew..."
      brew install gh
      if [ $? -ne 0 ]; then
        echo "❌ Failed to install GitHub CLI. Please install it manually."
      else
        echo "✅ GitHub CLI installed successfully!"
        echo "🔑 Logging in to GitHub CLI..."
        gh auth login
        
        # Try to get GitHub token again now that we're logged in
        if get_gh_token; then
          # Update the .env file with the token
          sed -i.bak "s/GITHUB_TOKEN=.*/GITHUB_TOKEN=$TOKEN/" .env
          rm -f .env.bak
          echo "✅ Updated .env file with your GitHub token from GitHub CLI!"
        fi
      fi
    else
      echo "⚠️ Homebrew not found. Please install GitHub CLI manually:"
      echo "Visit: https://cli.github.com/manual/installation"
    fi
  fi
else
  echo "✅ GitHub CLI is already installed."
  if ! check_gh_auth; then
    echo "⚠️ GitHub CLI is not authenticated."
    echo "Would you like to login now? (y/n)"
    read login_gh
    
    if [ "$login_gh" = "y" ]; then
      gh auth login
      
      # Try to get GitHub token now that we're logged in
      if get_gh_token; then
        # Update the .env file with the token
        sed -i.bak "s/GITHUB_TOKEN=.*/GITHUB_TOKEN=$TOKEN/" .env
        rm -f .env.bak
        echo "✅ Updated .env file with your GitHub token from GitHub CLI!"
      fi
    fi
  else
    echo "✅ GitHub CLI is already authenticated."
    
    # Try to get GitHub token
    if get_gh_token; then
      # Update the .env file with the token
      sed -i.bak "s/GITHUB_TOKEN=.*/GITHUB_TOKEN=$TOKEN/" .env
      rm -f .env.bak
      echo "✅ Updated .env file with your GitHub token from GitHub CLI!"
    fi
  fi
fi

echo ""
echo "=============================="
echo "🎉 SETUP COMPLETE! 🎉"
echo "=============================="
echo ""
echo "Next steps:"
echo "1. Run the PR reviewer tools: ./pr-tools.sh"
echo ""
echo "For more information, see the README.md file."
echo "==============================" 