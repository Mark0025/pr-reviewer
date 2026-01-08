/**
 * Shared utilities for PR review tools
 * 
 * Contains common functions used across all PR tools
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import chalk from 'chalk';
import { 
  PullRequest, 
  PullRequestFile,
  FileAnalysis,
  ProjectConfig,
  OutputConfig 
} from './types';

// Load environment variables
dotenv.config();

// Constants from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'THE-AI-REAL-ESTATE-INVESTOR';
const GITHUB_REPO = process.env.GITHUB_REPO || 'AIrie-teachings-dev';
const CRITICAL_DIRECTORIES = (process.env.CRITICAL_DIRECTORIES || 'app/lib/services,app/components/auth,app/api,middleware').split(',');
const TEST_REQUIRED_DIRS = (process.env.TEST_REQUIRED_DIRS || 'services,utils,api').split(',');
const AUTOMERGE_PATTERNS = (process.env.AUTOMERGE_PATTERNS || 'docs/,README.md,*.md').split(',');
const OUTPUT_DIR = process.env.OUTPUT_DIR || './OUTPUT_DIR/REPORTS/';

// High-risk file patterns that require careful review
const HIGH_RISK_PATTERNS = [
  'app/lib/services',
  'middleware',
  'app/api',
  'app/components/auth',
  'package.json',
  'next.config'
];

// GitHub API functions
/**
 * Creates an authenticated Octokit instance
 */
export function createOctokit(): Octokit {
  const token = getGitHubToken();
  
  if (!token) {
    console.error(chalk.red('GitHub token not found. Please set GITHUB_TOKEN in .env file'));
    process.exit(1);
  }
  
  return new Octokit({ auth: token });
}

/**
 * Gets GitHub token from environment or GitHub CLI
 */
export function getGitHubToken(): string | null {
  // First try to get from environment variable
  if (GITHUB_TOKEN) {
    return GITHUB_TOKEN;
  }
  
  // If not found, try to get from GitHub CLI
  try {
    const result = runCommand('gh', ['auth', 'token']);
    if (result.success && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch (error) {
    console.error(chalk.yellow('Could not retrieve GitHub token from gh CLI'));
  }
  
  return null;
}

/**
 * Get PR details using GitHub API
 */
export async function getPRDetails(octokit: Octokit, prNumber: number): Promise<PullRequest | null> {
  try {
    // Get PR basic info
    const { data: pr } = await octokit.pulls.get({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber
    });

    // Get PR files
    const { data: files } = await octokit.pulls.listFiles({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber
    });
    
    // Get PR labels
    const labels = pr.labels.map(label => ({ name: label.name }));
    
    // Get linked issues
    const linkedIssues = await getLinkedIssues(octokit, prNumber);

    return {
      number: pr.number,
      title: pr.title,
      headRefName: pr.head.ref,
      baseRefName: pr.base.ref,
      body: pr.body || '',
      author: {
        login: pr.user?.login || 'unknown'
      },
      createdAt: pr.created_at,
      isDraft: pr.draft || false,
      mergeable: pr.mergeable,
      files: files.map(file => ({
        path: file.filename,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        status: file.status,
        patch: file.patch
      })),
      labels,
      linkedIssues
    };
  } catch (error) {
    console.error(chalk.red(`Error fetching PR #${prNumber}:`), error);
    return null;
  }
}

/**
 * Get linked issues from PR body
 */
async function getLinkedIssues(octokit: Octokit, prNumber: number): Promise<number[]> {
  try {
    const { data: pr } = await octokit.pulls.get({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber
    });
    
    const body = pr.body || '';
    
    // Extract issue numbers using regex
    // Look for patterns like "Fixes #123" or "Closes #456" or "Related to #789"
    const issueRegex = /(fixes|closes|resolves|related to|addresses)\s*#(\d+)/gi;
    const matches = [...body.matchAll(issueRegex)];
    
    return matches.map(match => parseInt(match[2], 10));
  } catch (error) {
    console.error(chalk.yellow(`Error fetching linked issues for PR #${prNumber}`), error);
    return [];
  }
}

/**
 * List all open PRs
 */
export async function listOpenPRs(octokit: Octokit): Promise<PullRequest[]> {
  try {
    const { data: prs } = await octokit.pulls.list({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: 100
    });
    
    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      headRefName: pr.head.ref,
      baseRefName: pr.base.ref,
      body: pr.body || '',
      author: {
        login: pr.user?.login || 'unknown'
      },
      createdAt: pr.created_at,
      isDraft: pr.draft || false
    }));
  } catch (error) {
    console.error(chalk.red('Error fetching open PRs:'), error);
    return [];
  }
}

/**
 * Request reviews for a PR
 */
export async function requestReviews(octokit: Octokit, prNumber: number, reviewers: string[]): Promise<void> {
  try {
    if (reviewers.length === 0) {
      console.log(chalk.yellow(`No reviewers specified for PR #${prNumber}`));
      return;
    }
    
    await octokit.pulls.requestReviewers({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber,
      reviewers
    });
    
    console.log(chalk.green(`Requested reviews from ${reviewers.join(', ')} for PR #${prNumber}`));
  } catch (error) {
    console.error(chalk.red(`Error requesting reviews for PR #${prNumber}:`), error);
  }
}

// File analysis functions
/**
 * Analyze file changes to categorize them
 */
export function analyzeFileChanges(files: PullRequestFile[]): FileAnalysis {
  const analysis: FileAnalysis = {
    criticalFiles: [],
    setupFiles: [],
    formComponents: [],
    apiEndpoints: [],
    databaseOperations: [],
    testFiles: []
  };
  
  files.forEach(file => {
    const filePath = file.path;
    
    // Critical files
    if (isHighRiskFile(filePath)) {
      analysis.criticalFiles.push(filePath);
    }
    
    // Setup files
    if (filePath.endsWith('package.json') || 
        filePath.endsWith('tsconfig.json') || 
        filePath.endsWith('.env.example') || 
        filePath.includes('config')) {
      analysis.setupFiles.push(filePath);
    }
    
    // Form components
    if ((filePath.includes('components/forms') || filePath.includes('components/form')) && 
        (filePath.endsWith('.tsx') || filePath.endsWith('.jsx'))) {
      analysis.formComponents.push(filePath);
    }
    
    // API endpoints
    if (filePath.includes('app/api') || filePath.includes('pages/api')) {
      analysis.apiEndpoints.push(filePath);
    }
    
    // Database operations
    if (filePath.includes('services') && 
        (filePath.includes('database') || filePath.includes('db') || filePath.includes('appwrite'))) {
      analysis.databaseOperations.push(filePath);
    }
    
    // Test files
    if (filePath.includes('test') || filePath.includes('spec') || filePath.endsWith('.test.ts')) {
      analysis.testFiles.push(filePath);
    }
  });
  
  return analysis;
}

/**
 * Check if file changes include critical files
 */
export function detectCriticalChanges(fileAnalysis: FileAnalysis): boolean {
  return fileAnalysis.criticalFiles.length > 0 || 
         fileAnalysis.setupFiles.length > 0 || 
         fileAnalysis.apiEndpoints.length > 0 || 
         fileAnalysis.databaseOperations.length > 0;
}

/**
 * Determine if a file is high risk based on path
 */
export function isHighRiskFile(filePath: string): boolean {
  return HIGH_RISK_PATTERNS.some(pattern => filePath.includes(pattern));
}

// Report generation utilities
/**
 * Format date in CST timezone for consistent reporting
 */
export function formatDateCST(date: Date = new Date()): string {
  // Convert to CST (Central Standard Time)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  return new Intl.DateTimeFormat('en-US', options).format(date)
    .replace(/[\/,:]/g, '-')  // Replace slashes, colons, commas with dashes
    .replace(/\s/g, '_');     // Replace spaces with underscores
}

/**
 * Ensure the output directory exists
 */
export function ensureOutputDir(dirPath: string = OUTPUT_DIR): string {
  try {
    const dir = path.resolve(dirPath);
    
    // Create the output directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(chalk.green(`Created output directory: ${dir}`));
    }
    return dir;
  } catch (error) {
    console.error(chalk.red(`Error creating output directory: ${error}`));
    // Fallback to current directory
    return './';
  }
}

/**
 * Save a report to the output directory
 */
export function saveReport(content: string, filename: string): string {
  try {
    const outputDir = ensureOutputDir();
    const filePath = path.join(outputDir, filename);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(chalk.green(`Report saved to: ${filePath}`));
    
    // Also save a "latest" version
    const latestFilename = filename.replace(/\d{2}-\d{2}-\d{4}_\d{2}-\d{2}-\d{2}/, 'latest');
    const latestFilePath = path.join(outputDir, latestFilename);
    fs.writeFileSync(latestFilePath, content, 'utf8');
    
    return filePath;
  } catch (error) {
    console.error(chalk.red(`Error saving report: ${error}`));
    return '';
  }
}

// Command execution utilities
/**
 * Run a shell command and return the output
 */
export function runCommand(command: string, args: string[]): { stdout: string; stderr: string; success: boolean } {
  console.log(chalk.blue(`Running command: ${command} ${args.join(' ')}`));
  
  const result = spawnSync(command, args, { encoding: 'utf8' });
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.status === 0
  };
}

/**
 * Execute a Git command
 */
export function executeGitCommand(args: string[]): { stdout: string; stderr: string; success: boolean } {
  return runCommand('git', args);
}

/**
 * Load config from environment variables
 */
export function loadConfigFromEnv(): ProjectConfig {
  return {
    criticalDirectories: CRITICAL_DIRECTORIES,
    testRequired: TEST_REQUIRED_DIRS,
    automergePatterns: AUTOMERGE_PATTERNS
  };
}

/**
 * Get output directory configuration
 */
export function getOutputConfig(): OutputConfig {
  return {
    dirPath: OUTPUT_DIR,
    timestampFormat: 'MM-DD-YYYY_HH-MM-SS'
  };
} 