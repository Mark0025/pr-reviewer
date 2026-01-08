# PR Reviewer Tools v2.0

## Overview

The PR Reviewer Tools are a set of utilities designed to help manage and analyze pull requests in the AIrie-teachings-dev repository. These tools provide automated analysis, recommendation, and consolidation capabilities for PRs.

## Application Flow

```mermaid
flowchart TD
    A[Start PR Tools] --> B{Check for .env}
    B -->|Exists| C[Load Environment Variables]
    B -->|Missing| D[Create from Template]
    D --> E{GitHub CLI Auth?}
    E -->|Yes| F[Import GitHub Token]
    E -->|No| G[Prompt for Manual Token]
    F --> C
    G --> C
    C --> H{Valid Token?}
    H -->|Yes| I[Display Main Menu]
    H -->|No| J[Prompt for Token]
    J --> C
    I --> K[Select Tool]
    K --> L[PR Analyzer]
    K --> M[PR Consolidator]
    K --> N[Config Editor]
    K --> O[View Guide]
    L --> P[Fetch PRs]
    P --> Q[Analyze PRs]
    Q --> R[Generate Report]
    M --> S[List PR Groups]
    S --> T[Consolidate Selected PRs]
    T --> U[Create New Branch]
    U --> V[Merge PR Branches]
```

## Authentication Process

```mermaid
sequenceDiagram
    participant User
    participant Script
    participant GitHub CLI
    participant GitHub API
    
    User->>Script: Run PR Tools
    Script->>Script: Check for .env
    
    alt .env exists
        Script->>Script: Load GITHUB_TOKEN
    else .env missing
        Script->>Script: Create from template
    end
    
    alt Token missing
        Script->>GitHub CLI: Check auth status
        
        alt GitHub CLI authenticated
            Script->>GitHub CLI: Get auth token
            GitHub CLI-->>Script: Return token
            Script->>Script: Save token to .env
        else Not authenticated
            Script->>User: Prompt for token
            User->>Script: Enter token
            Script->>Script: Save token to .env
        end
    end
    
    Script->>GitHub API: Validate token
    
    alt Valid token
        GitHub API-->>Script: Authentication successful
        Script->>User: Show main menu
    else Invalid token
        GitHub API-->>Script: Authentication failed
        Script->>User: Show error
    end
```

## System Architecture

```mermaid
graph TD
    subgraph "PR Reviewer Tools"
        A[pr-tools.sh] --> B[setup.sh]
        A --> C[pr-analyzer.ts]
        A --> D[pr-consolidator.ts]
        
        E[.env] --> C
        E --> D
        
        F[.env.example] -.-> E
        
        G[package.json] --> H[node_modules]
        
        I[GitHub CLI] -.-> E
    end
    
    subgraph "GitHub"
        J[GitHub API]
        K[Repository PRs]
        L[User Auth]
    end
    
    C --> J
    D --> J
    J --> K
    I --> L
    L -.-> I
```

## Key Components

### 1. PR Analyzer (`pr-analyzer.ts`)

The PR Analyzer evaluates open pull requests and provides:
- Risk assessment for each PR
- Impact analysis on critical code areas
- Review recommendations
- Priority scores
- Merge impact evaluation
- Change intent analysis

### 2. PR Consolidator (`pr-consolidator.ts`)

The PR Consolidator helps combine related PRs:
- Identifies PRs with similar titles or changes
- Provides options for consolidation approaches
- Creates new branches with combined changes
- Handles merge conflicts
- Preserves author attribution

### 3. Interactive Shell Script (`pr-tools.sh`)

The shell script provides a user-friendly interface:
- Environment setup and validation
- Token management
- Tool selection
- Configuration editing
- Dependency installation

## GitHub Authentication Flow

The tools support two authentication methods:

### 1. GitHub CLI Integration (Recommended)

```mermaid
flowchart LR
    A[GitHub CLI] --> B{Authenticated?}
    B -->|Yes| C[Get Auth Token]
    C --> D[Update .env]
    D --> E[API Access]
    B -->|No| F[Prompt Login]
    F --> G{Login Success?}
    G -->|Yes| C
    G -->|No| H[Manual Token Entry]
    H --> D
```

When you run the tools:
1. The script checks if GitHub CLI is installed and authenticated
2. If authenticated, it retrieves your token automatically
3. The token is saved to the .env file
4. All API calls use this token

### 2. Manual Token Setup

If GitHub CLI isn't available:
1. Create a personal access token at https://github.com/settings/tokens
2. Grant 'repo' scope permissions
3. Add the token to your .env file
4. The tools will validate and use this token

## Configuration Options

Your .env file controls the tool behavior:

```
# GitHub Token (required for API access)
GITHUB_TOKEN=your_github_token_here

# GitHub Organization and Repository
GITHUB_ORG=THE-AI-REAL-ESTATE-INVESTOR
GITHUB_REPO=AIrie-teachings-dev

# Critical Directories (comma-separated)
CRITICAL_DIRECTORIES=app/lib/services,app/components/auth,app/api,middleware

# Directories that require tests (comma-separated)
TEST_REQUIRED_DIRS=services,utils,api

# Auto-merge patterns (comma-separated)
AUTOMERGE_PATTERNS=docs/,README.md,*.md
```

## Change Intent Analysis

The PR Analyzer now includes a powerful Change Intent Analysis feature that examines PRs to understand what they're trying to accomplish:

```mermaid
flowchart TD
    A[PR Data] --> B[Extract Keywords]
    A --> C[Analyze Commits]
    A --> D[Examine Files]
    B --> E[Identify Intent]
    C --> E
    D --> F[Determine Components]
    D --> G[Categorize Changes]
    E --> H[Map Features & Fixes]
    F --> I[Area of Impact]
    G --> J[Complexity Rating]
    H & I & J --> K[Comprehensive Intent Analysis]
```

The Change Intent Analysis provides:

1. **PR Intent Detection**: Automatically identifies if a PR is a bug fix, new feature, refactoring, etc.
2. **Change Type Classification**: Categorizes changes as New Features, Enhancements, Bug Fixes, or Removals
3. **Component Impact Mapping**: Shows which components/directories are affected by the changes
4. **Feature & Fix Extraction**: Identifies specific features being added or bugs being fixed
5. **Complexity Assessment**: Rates PR complexity as Low, Medium, or High based on scope of changes
6. **Implementation Details**: Provides insights into the technical implementation approach

This analysis helps reviewers understand:
- What the PR is trying to accomplish
- Which areas of the codebase are affected
- The risk level associated with the changes
- The amount of effort required to review the PR

The analysis appears in the PR report like this:

```markdown
#### Change Intent Analysis

**Intent:** Bug fix
**Change Types:** Bug Fix, Enhancement
**Components Affected:** app/components, app/lib/services
**Area of Impact:** app/components, app/lib/services
**Complexity:** Medium

**Suggested Fixes:** 
- fix authentication issue
- fix redirect after login

**Implementation Details:** Changes involve ts, tsx files with 156 additions and 42 deletions
```

## PR Analysis Process

```mermaid
flowchart TD
    A[Fetch Open PRs] --> B[Get PR Details]
    B --> C[Analyze Files Changed]
    C --> D{Critical Changes?}
    D -->|Yes| E[High Risk]
    D -->|No| F[Low Risk]
    C --> G{Test Files?}
    G -->|Yes| H[Lower Risk]
    G -->|No| I[Higher Risk]
    C --> J{Documentation Only?}
    J -->|Yes| K[Auto-merge Candidate]
    E & F & H & I & K --> L[Calculate Priority]
    L --> M[Generate Recommendations]
    M --> N[Create Report]
```

## PR Consolidation Process

```mermaid
flowchart TD
    A[List Open PRs] --> B[Group by Title/Content]
    B --> C{Multiple Groups?}
    C -->|Yes| D[Select Group]
    C -->|No| E[Single Group]
    D & E --> F{Consolidation Strategy}
    F -->|New Branch| G[Create Branch]
    F -->|Keep Oldest| H[Keep Oldest PR]
    F -->|Keep Newest| I[Keep Newest PR]
    G --> J[Merge PR Branches]
    J --> K{Conflicts?}
    K -->|Yes| L[Resolve Conflicts]
    K -->|No| M[Complete Merge]
    L --> M
    H & I --> N[Close Other PRs]
    M & N --> O[Create/Update PR]
```

## Installation and Setup

The setup process ensures all dependencies are properly installed:

```mermaid
flowchart TD
    A[Run setup.sh] --> B{Node.js Installed?}
    B -->|No| C[Install Node.js]
    B -->|Yes| D{npm Installed?}
    D -->|No| E[Install npm]
    D -->|Yes| F[Install Dependencies]
    F --> G{GitHub CLI Installed?}
    G -->|No| H{Install GitHub CLI?}
    H -->|Yes| I[Install GitHub CLI]
    H -->|No| J[Skip]
    G -->|Yes| K{GitHub CLI Authenticated?}
    K -->|No| L[GitHub Login]
    K -->|Yes| M[Get Token]
    I --> L
    L --> M
    M --> N[Update .env]
    J --> O[Manual Setup]
    O --> N
    N --> P[Make Scripts Executable]
    P --> Q[Setup Complete]
```

## Troubleshooting

Common issues and solutions:

1. **Bad credentials error**
   - Token may be expired or invalid
   - Use GitHub CLI integration to refresh
   - Generate a new token if needed

2. **Type errors in TypeScript**
   - Run `npm install` to ensure all dependencies are installed
   - Check TypeScript version compatibility

3. **Permission denied for scripts**
   - Run `chmod +x pr-tools.sh` and `chmod +x setup.sh`

4. **GitHub API rate limiting**
   - Use authenticated requests (token required)
   - Implement request throttling for large repos

## Security Considerations

The PR tools handle sensitive GitHub tokens:

- Tokens are stored locally in the .env file (not in git)
- The .gitignore prevents accidental token commits
- Tokens should have minimal required permissions
- Token validation occurs before API access
- GitHub CLI integration uses your existing authentication

## Conclusion

The PR Reviewer Tools provide a comprehensive solution for managing pull requests in the AIrie-teachings-dev repository. By streamlining the review process and providing automated analysis, these tools help maintain code quality and development velocity. 