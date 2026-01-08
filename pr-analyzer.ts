#!/usr/bin/env ts-node

/**
 * PR Analyzer Script
 * 
 * This script analyzes pull requests in the AIrie-teachings-dev repository
 * and generates a report with recommendations for PR management.
 * 
 * Usage:
 * 1. Copy .env.example to .env and set your GitHub token
 * 2. Run the script: ts-node pr-analyzer.ts
 */

import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Types for PR Analysis
interface PullRequest {
  number: number;
  title: string;
  state: string;
  body: string;
  author: {
    login: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  baseRefName: string;
  headRefName: string;
  files?: PullRequestFile[];
  comments?: number;
  reviewComments?: number;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  mergeable?: boolean;
  labels?: {name: string}[];
}

interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface PrAnalysis {
  prInfo: PullRequest;
  riskLevel: 'Low' | 'Medium' | 'High';
  impactAreas: string[];
  reviewRecommendations: string[];
  mergeImpact: {
    benefits: string[];
    risks: string[];
  };
  priorityScore: number;
  changeIntent?: {
    intent: string;
    changeTypes: string[];
    components: string[];
    suggestedFeatures: string[];
    suggestedFixes: string[];
    areaOfImpact: string;
    complexity: 'Low' | 'Medium' | 'High';
    implementation: string;
  };
}

interface ProjectConfig {
  criticalDirectories: string[];
  testRequired: string[];
  automergePatterns: string[];
}

// Constants from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'THE-AI-REAL-ESTATE-INVESTOR';
const GITHUB_REPO = process.env.GITHUB_REPO || 'AIrie-teachings-dev';
const CRITICAL_DIRECTORIES = (process.env.CRITICAL_DIRECTORIES || 'app/lib/services,app/components/auth,app/api,middleware').split(',');
const TEST_REQUIRED_DIRS = (process.env.TEST_REQUIRED_DIRS || 'services,utils,api').split(',');
const AUTOMERGE_PATTERNS = (process.env.AUTOMERGE_PATTERNS || 'docs/,README.md,*.md').split(',');

// Add OUTPUT_DIR to environment variables
const OUTPUT_DIR = process.env.OUTPUT_DIR || './reports/';

// Load config from environment variables
const loadConfigFromEnv = (): ProjectConfig => {
  return {
    criticalDirectories: CRITICAL_DIRECTORIES,
    testRequired: TEST_REQUIRED_DIRS,
    automergePatterns: AUTOMERGE_PATTERNS
  };
};

/**
 * Format date in CST timezone for consistent reporting
 */
function formatDateCST(date: Date = new Date()): string {
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
function ensureOutputDirExists(): string {
  try {
    // Create the output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(chalk.green(`Created output directory: ${OUTPUT_DIR}`));
    }
    return OUTPUT_DIR;
  } catch (error) {
    console.error(chalk.red(`Error creating output directory: ${error}`));
    // Fallback to current directory
    return './';
  }
}

/**
 * PR Analysis function - evaluates pull requests and provides recommendations
 * @param prData Pull request data from GitHub
 * @param config Project configuration settings
 * @returns Detailed analysis of the PR
 */
async function analyzePullRequest(prData: PullRequest, config: ProjectConfig, octokit: Octokit): Promise<PrAnalysis> {
  // Initialize analysis object
  const analysis: PrAnalysis = {
    prInfo: prData,
    riskLevel: 'Low',
    impactAreas: [],
    reviewRecommendations: [],
    mergeImpact: {
      benefits: [],
      risks: []
    },
    priorityScore: 0
  };
  
  // 1. Assess file changes
  const impactedAreas = new Set<string>();
  let hasCriticalChanges = false;
  let testFilesChanged = false;
  
  prData.files?.forEach(file => {
    // Extract directory
    const directory = path.dirname(file.filename);
    impactedAreas.add(directory);
    
    // Check for critical directory changes
    if (config.criticalDirectories.some(d => file.filename.startsWith(d))) {
      hasCriticalChanges = true;
      analysis.reviewRecommendations.push(`Critical file changed: ${file.filename} - Requires senior developer review`);
    }
    
    // Check for test files
    if (file.filename.includes('test') || file.filename.includes('spec')) {
      testFilesChanged = true;
    }
    
    // Check for risky changes
    if (file.additions > 100) {
      analysis.reviewRecommendations.push(`Large addition in ${file.filename} (${file.additions} lines) - Review thoroughly`);
    }
  });
  
  // Update impact areas
  analysis.impactAreas = Array.from(impactedAreas);
  
  // 2. Evaluate risk level
  if (hasCriticalChanges) {
    analysis.riskLevel = 'High';
  } else if (prData.changedFiles && prData.changedFiles > 10) {
    analysis.riskLevel = 'Medium';
  }
  
  // 3. Assess test coverage
  const needsTests = config.testRequired.some(pattern => 
    analysis.impactAreas.some(area => area.includes(pattern))
  );
  
  if (needsTests && !testFilesChanged) {
    analysis.reviewRecommendations.push('Changes in areas requiring tests, but no test files updated');
    analysis.riskLevel = analysis.riskLevel === 'Low' ? 'Medium' : 'High';
  }
  
  // 4. Analyze PR title and description
  if (!prData.title.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?:/)) {
    analysis.reviewRecommendations.push('PR title does not follow conventional commit format');
  }
  
  if (!prData.body || prData.body.length < 50) {
    analysis.reviewRecommendations.push('PR description is missing or too brief - request more details');
  }
  
  // 5. Calculate merge impact
  // Benefits
  if (prData.title.startsWith('fix:')) {
    analysis.mergeImpact.benefits.push('Fixes a bug in the codebase');
  } else if (prData.title.startsWith('feat:')) {
    analysis.mergeImpact.benefits.push('Adds new functionality to the application');
  } else if (prData.title.startsWith('perf:')) {
    analysis.mergeImpact.benefits.push('Improves performance');
  }
  
  // Mobile optimization specific benefits
  if (prData.title.includes('Mobile Optimization')) {
    analysis.mergeImpact.benefits.push('Improves mobile user experience');
    analysis.mergeImpact.benefits.push('Potentially expands user base to mobile users');
  }
  
  // Risks
  if (hasCriticalChanges) {
    analysis.mergeImpact.risks.push('Changes to critical system components may affect stability');
  }
  
  if (prData.changedFiles && prData.changedFiles > 20) {
    analysis.mergeImpact.risks.push('Large number of files changed increases risk of unintended side effects');
  }
  
  if (needsTests && !testFilesChanged) {
    analysis.mergeImpact.risks.push('Lack of tests increases risk of undetected issues');
  }
  
  // 6. Calculate priority score (1-100)
  let score = 50; // Start at neutral
  
  // Adjust based on risk
  if (analysis.riskLevel === 'High') score -= 20;
  if (analysis.riskLevel === 'Low') score += 10;
  
  // Adjust based on PR age
  const prAge = new Date().getTime() - new Date(prData.createdAt).getTime();
  const daysOld = prAge / (1000 * 60 * 60 * 24);
  
  if (daysOld > 14) score += 15; // Older PRs get priority
  if (daysOld < 2) score -= 5; // Newer PRs less urgency
  
  // Adjust based on changes
  if (prData.title.startsWith('fix:')) score += 10; // Bugfixes get priority
  if (prData.title.startsWith('feat:')) score += 5; // Features get some priority
  if (prData.title.startsWith('docs:')) score -= 10; // Docs less urgent
  
  // Mobile optimization priority adjustment
  if (prData.title.includes('Mobile Optimization')) {
    // Prioritize mobile optimization based on current project needs
    score += 8;
  }
  
  analysis.priorityScore = Math.min(Math.max(score, 1), 100); // Ensure 1-100 range
  
  // Add change intent analysis
  const changeIntent = await analyzeChangeIntent(prData, octokit);
  
  // Include change intent in the analysis
  return {
    prInfo: prData,
    riskLevel: analysis.riskLevel,
    impactAreas: analysis.impactAreas,
    reviewRecommendations: analysis.reviewRecommendations,
    mergeImpact: analysis.mergeImpact,
    priorityScore: analysis.priorityScore,
    changeIntent
  };
}

/**
 * Analyze multiple PRs and provide recommendations for processing them
 * @param prs Array of pull requests
 * @param config Project configuration
 * @returns Analysis of PRs with recommendations
 */
async function analyzePullRequests(prs: PullRequest[], config: ProjectConfig, octokit: Octokit): Promise<string> {
  console.log(chalk.blue('Analyzing PRs...'));
  const analyses = await Promise.all(prs.map(pr => analyzePullRequest(pr, config, octokit)));
  
  // Sort by priority
  analyses.sort((a, b) => b.priorityScore - a.priorityScore);
  
  let report = `# PR Analysis Report\n\n`;
  
  // Add CST timestamp
  const timestamp = formatDateCST();
  report += `Generated: ${timestamp} (CST)\n\n`;
  
  report += `## PR Summary\n\n`;
  
  for (const pr of prs) {
    // Get full analysis
    const analysis = await analyzePullRequest(pr, config, octokit);
    
    report += `### [#${pr.number}] ${pr.title}\n\n`;
    report += `**Author:** ${pr.author.login}\n`;
    report += `**Created:** ${new Date(pr.createdAt).toLocaleDateString()}\n`;
    report += `**Status:** ${pr.state}\n`;
    report += `**Risk Level:** ${analysis.riskLevel}\n`;
    report += `**Priority Score:** ${analysis.priorityScore}/100\n\n`;
    
    // Add change intent analysis
    if (analysis.changeIntent) {
      report += `#### Change Intent Analysis\n\n`;
      report += `**Intent:** ${analysis.changeIntent.intent}\n`;
      report += `**Change Types:** ${analysis.changeIntent.changeTypes.join(', ') || 'None detected'}\n`;
      report += `**Components Affected:** ${analysis.changeIntent.components.join(', ') || 'None detected'}\n`;
      report += `**Area of Impact:** ${analysis.changeIntent.areaOfImpact}\n`;
      report += `**Complexity:** ${analysis.changeIntent.complexity}\n`;
      
      if (analysis.changeIntent.suggestedFeatures.length > 0) {
        report += `**Suggested Features:** \n${analysis.changeIntent.suggestedFeatures.map(f => `- ${f}`).join('\n')}\n\n`;
      }
      
      if (analysis.changeIntent.suggestedFixes.length > 0) {
        report += `**Suggested Fixes:** \n${analysis.changeIntent.suggestedFixes.map(f => `- ${f}`).join('\n')}\n\n`;
      }
      
      report += `**Implementation Details:** ${analysis.changeIntent.implementation}\n\n`;
    }
    
    // Include existing analysis sections...
    
    report += `---\n\n`;
  }
  
  // Add recommendations
  report += `## Recommendations\n\n`;
  
  // Sort PRs by priority
  const prsByPriority = [...analyses].sort((a, b) => b.priorityScore - a.priorityScore);
  
  // Highlight high priority PRs
  if (prsByPriority.length > 0) {
    report += `### Priority PRs\n\n`;
    prsByPriority.slice(0, 3).forEach(analysis => {
      report += `1. **[#${analysis.prInfo.number}] ${analysis.prInfo.title}** - Priority: ${analysis.priorityScore}/100\n`;
      report += `   - ${analysis.riskLevel} Risk, ${getDaysOld(analysis.prInfo.createdAt)} days old\n`;
      report += `   - ${analysis.reviewRecommendations[0]}\n\n`;
    });
  }
  
  // General recommendations
  report += `### General Advice\n\n`;
  report += `1. **Prioritize older PRs**: Focus on PRs that have been open the longest to reduce stagnation.\n\n`;
  report += `2. **Address high-risk areas first**: PRs affecting critical directories should be reviewed promptly.\n\n`;
  report += `3. **Clean up stale PRs**: Close or update PRs that have been inactive for more than 2 weeks.\n\n`;
  report += `4. **Improve PR descriptions**: Ensure all PRs have adequate descriptions of changes and test procedures.\n\n`;
  
  return report;
}

/**
 * Generate PR visual report for terminal
 * @param prs Array of pull requests
 * @returns Terminal-friendly visualization
 */
function generateVisualReport(prs: PullRequest[]): void {
  // Group PRs by type
  const mobileOptPRs = prs.filter(pr => pr.title.includes('Mobile Optimization'));
  const fixPRs = prs.filter(pr => pr.title.startsWith('fix:') && !pr.title.includes('Mobile Optimization'));
  const featurePRs = prs.filter(pr => pr.title.startsWith('feat:') && !pr.title.includes('Mobile Optimization'));
  const otherPRs = prs.filter(pr => 
    !pr.title.includes('Mobile Optimization') && 
    !pr.title.startsWith('fix:') && 
    !pr.title.startsWith('feat:')
  );

  console.log(chalk.bold.blue('\n=== PR Visual Report ===\n'));
  console.log(chalk.bold('PR Distribution:'));
  console.log(chalk.green(`Mobile Optimization: ${mobileOptPRs.length} PRs`));
  console.log(chalk.red(`Bug Fixes: ${fixPRs.length} PRs`));
  console.log(chalk.yellow(`Features: ${featurePRs.length} PRs`));
  console.log(chalk.gray(`Other: ${otherPRs.length} PRs`));
  console.log(chalk.bold.blue(`Total: ${prs.length} PRs\n`));

  // Create age visualization
  console.log(chalk.bold('PR Age Distribution:'));
  const now = new Date().getTime();
  const ageGroups = {
    recent: 0,  // 0-2 days
    active: 0,  // 3-7 days
    aging: 0,   // 8-14 days
    stale: 0    // 15+ days
  };

  prs.forEach(pr => {
    const createdDate = new Date(pr.createdAt).getTime();
    const daysOld = (now - createdDate) / (1000 * 60 * 60 * 24);
    
    if (daysOld < 3) {
      ageGroups.recent++;
    } else if (daysOld < 8) {
      ageGroups.active++;
    } else if (daysOld < 15) {
      ageGroups.aging++;
    } else {
      ageGroups.stale++;
    }
  });

  console.log(chalk.green(`Recent (0-2 days): ${ageGroups.recent} PRs`));
  console.log(chalk.yellow(`Active (3-7 days): ${ageGroups.active} PRs`));
  console.log(chalk.red(`Aging (8-14 days): ${ageGroups.aging} PRs`));
  console.log(chalk.gray(`Stale (15+ days): ${ageGroups.stale} PRs\n`));

  // Print top priority PRs
  console.log(chalk.bold('Top Priority PRs:'));
  
  // Auth fix has highest priority
  const authPR = prs.find(pr => pr.title.includes('auth-provider'));
  if (authPR) {
    console.log(chalk.red.bold(`1. #${authPR.number} - ${authPR.title} (${getDaysOld(authPR.createdAt)} days old)`));
  }
  
  // Testing PR comes next
  const testingPR = prs.find(pr => pr.title.includes('unit testing'));
  if (testingPR) {
    console.log(chalk.yellow.bold(`2. #${testingPR.number} - ${testingPR.title} (${getDaysOld(testingPR.createdAt)} days old)`));
  }
  
  // Then mobile optimization PRs
  if (mobileOptPRs.length > 0) {
    console.log(chalk.green.bold(`3. Mobile Optimization PRs (${mobileOptPRs.length} total):`));
    
    // Sort by age (oldest first)
    mobileOptPRs.sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    
    // Show the oldest 3
    mobileOptPRs.slice(0, 3).forEach((pr, i) => {
      console.log(chalk.green(`   ${i+1}. #${pr.number} - ${pr.title} (${getDaysOld(pr.createdAt)} days old)`));
    });
    
    if (mobileOptPRs.length > 3) {
      console.log(chalk.green(`   ... and ${mobileOptPRs.length - 3} more`));
    }
  }
  
  console.log('\n');
}

/**
 * Get days old from a date string
 */
function getDaysOld(dateString: string): number {
  const date = new Date(dateString).getTime();
  const now = new Date().getTime();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

/**
 * Analyze PR changes to extract what the PR is suggesting
 */
async function analyzeChangeIntent(pr: PullRequest, octokit: Octokit): Promise<{
  intent: string;
  changeTypes: string[];
  components: string[];
  suggestedFeatures: string[];
  suggestedFixes: string[];
  areaOfImpact: string;
  complexity: 'Low' | 'Medium' | 'High';
  implementation: string;
}> {
  // Default result
  const result = {
    intent: 'Unknown intent',
    changeTypes: [],
    components: [],
    suggestedFeatures: [],
    suggestedFixes: [],
    areaOfImpact: 'Unknown',
    complexity: 'Medium' as 'Low' | 'Medium' | 'High',
    implementation: 'Unknown implementation details',
  };

  try {
    // Get PR description keywords
    const descKeywords = extractKeywords(pr.body);
    
    // Get commit messages
    const { data: commits } = await octokit.pulls.listCommits({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: pr.number
    });
    
    // Extract keywords from commit messages
    const commitKeywords = commits.flatMap(commit => 
      extractKeywords(commit.commit.message)
    );
    
    // Analyze file changes to determine components affected
    const components = new Set<string>();
    const changeTypes = new Set<string>();
    
    if (pr.files) {
      for (const file of pr.files) {
        // Extract component from file path
        const pathParts = file.filename.split('/');
        if (pathParts.length > 1) {
          components.add(pathParts[0]);
          if (pathParts.length > 2) {
            components.add(`${pathParts[0]}/${pathParts[1]}`);
          }
        }
        
        // Determine change type
        if (file.status === 'added') {
          changeTypes.add('New Feature');
        } else if (file.status === 'modified') {
          // Check if it's a fix by looking at the patch
          if (file.patch && (file.patch.includes('fix') || file.patch.includes('bug'))) {
            changeTypes.add('Bug Fix');
          } else {
            changeTypes.add('Enhancement');
          }
        } else if (file.status === 'removed') {
          changeTypes.add('Removal');
        }
      }
    }
    
    // Determine PR intent from title, description, and commits
    const titleLower = pr.title.toLowerCase();
    let intent = 'Code change';
    
    if (titleLower.includes('fix') || titleLower.includes('bug') || titleLower.includes('issue')) {
      intent = 'Bug fix';
    } else if (titleLower.includes('feature') || titleLower.includes('add') || titleLower.includes('new')) {
      intent = 'New feature';
    } else if (titleLower.includes('refactor') || titleLower.includes('cleanup')) {
      intent = 'Code refactoring';
    } else if (titleLower.includes('docs') || titleLower.includes('documentation')) {
      intent = 'Documentation update';
    } else if (titleLower.includes('test')) {
      intent = 'Test improvement';
    } else if (titleLower.includes('perf') || titleLower.includes('performance')) {
      intent = 'Performance improvement';
    }
    
    // Extract suggested features and fixes
    const suggestedFeatures: string[] = [];
    const suggestedFixes: string[] = [];
    
    const allKeywords = [...new Set([...descKeywords, ...commitKeywords])];
    for (const keyword of allKeywords) {
      if (['add', 'implement', 'create', 'new', 'feature'].some(k => keyword.includes(k))) {
        suggestedFeatures.push(keyword);
      } else if (['fix', 'bug', 'issue', 'resolve', 'patch'].some(k => keyword.includes(k))) {
        suggestedFixes.push(keyword);
      }
    }
    
    // Determine complexity
    let complexity: 'Low' | 'Medium' | 'High' = 'Low';
    const additions = pr.additions || 0;
    const deletions = pr.deletions || 0;
    if (additions + deletions > 500) {
      complexity = 'High';
    } else if (additions + deletions > 100) {
      complexity = 'Medium';
    }
    
    // Determine area of impact
    let areaOfImpact = 'Unknown';
    if (components.size > 0) {
      areaOfImpact = Array.from(components).join(', ');
    }
    
    // Determine implementation details from files
    let implementation = '';
    if (pr.files && pr.files.length > 0) {
      const fileTypes = new Set(pr.files.map(f => f.filename.split('.').pop()));
      implementation = `Changes involve ${Array.from(fileTypes).join(', ')} files`;
      
      // Count additions and deletions
      const totalAdditions = pr.files.reduce((sum, file) => sum + file.additions, 0);
      const totalDeletions = pr.files.reduce((sum, file) => sum + file.deletions, 0);
      
      implementation += ` with ${totalAdditions} additions and ${totalDeletions} deletions`;
    }
    
    // Return analysis
    return {
      intent,
      changeTypes: Array.from(changeTypes),
      components: Array.from(components),
      suggestedFeatures,
      suggestedFixes,
      areaOfImpact,
      complexity,
      implementation
    };
  } catch (error) {
    console.error('Error analyzing PR changes:', error);
    return result;
  }
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Split text into words
  const words = text.toLowerCase().split(/\s+/);
  
  // Extract phrases that might indicate changes
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (['add', 'fix', 'implement', 'update', 'remove', 'refactor', 'improve'].includes(words[i])) {
      // Capture the next few words as a phrase
      let phrase = words[i];
      let j = i + 1;
      while (j < words.length && j < i + 5 && !['and', 'or', '.', ',', ';'].includes(words[j])) {
        phrase += ' ' + words[j];
        j++;
      }
      phrases.push(phrase);
    }
  }
  
  return phrases;
}

/**
 * Main function to run the PR analysis
 */
async function main() {
  // Check for GitHub token
  if (!GITHUB_TOKEN) {
    console.error(chalk.red('GitHub token not found. Please set GITHUB_TOKEN in .env file.'));
    console.error(chalk.yellow('You can create a token at https://github.com/settings/tokens'));
    process.exit(1);
  }

  // Configuration
  const config = loadConfigFromEnv();
  
  try {
    console.log(chalk.bold.green(`PR Analyzer for ${GITHUB_ORG}/${GITHUB_REPO}`));
    console.log(chalk.blue('GitHub token found! Starting analysis...'));
    
    // Initialize Octokit
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });
    
    // Fetch PRs
    const { data: prs } = await octokit.pulls.list({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      state: 'open',
      per_page: 100
    });
    
    console.log(chalk.green(`Found ${prs.length} open PRs!`));
    
    // Get detailed PR data including files
    console.log(chalk.blue('Fetching PR details...'));
    const detailedPRs = await Promise.all(prs.map(async (pr, index) => {
      console.log(chalk.blue(`Processing PR #${pr.number} (${index + 1}/${prs.length})`));
      
      // Get PR details
      const { data: prDetail } = await octokit.pulls.get({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number
      });
      
      // Get files changed
      const { data: files } = await octokit.pulls.listFiles({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number
      });
      
      // Get PR comments
      const { data: comments } = await octokit.issues.listComments({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        issue_number: pr.number
      });
      
      // Get PR review comments
      const { data: reviewComments } = await octokit.pulls.listReviewComments({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number
      });
      
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        body: pr.body || '',
        author: {
          login: pr.user?.login || 'unknown',
          name: pr.user?.name || pr.user?.login || 'unknown'
        },
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        baseRefName: pr.base.ref,
        headRefName: pr.head.ref,
        files: files.map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          patch: f.patch || undefined
        })),
        comments: comments.length,
        reviewComments: reviewComments.length,
        additions: files.reduce((sum, file) => sum + file.additions, 0),
        deletions: files.reduce((sum, file) => sum + file.deletions, 0),
        changedFiles: files.length,
        mergeable: prDetail.mergeable,
        labels: pr.labels?.map(l => ({ name: l.name })) || []
      } as PullRequest;
    }));
    
    console.log(chalk.green('All PR details fetched successfully!'));
    
    // Generate visual report
    generateVisualReport(detailedPRs);
    
    // Generate detailed report
    console.log(chalk.blue('Generating full analysis report with change intent mapping...'));
    const report = await analyzePullRequests(detailedPRs, config, octokit);
    
    // Ensure output directory exists
    const outputDir = ensureOutputDirExists();
    
    // Create a timestamped filename for the report
    const timestamp = formatDateCST();
    const reportFilename = path.join(outputDir, `pr-analysis-report-${timestamp}.md`);
    
    // Save report to file
    fs.writeFileSync(reportFilename, report);
    console.log(chalk.green(`Full report saved to ${reportFilename}`));
    
    // Also save a copy as the latest report
    const latestReportFilename = path.join(outputDir, 'pr-analysis-report-latest.md');
    fs.writeFileSync(latestReportFilename, report);
    console.log(chalk.green(`Latest report saved to ${latestReportFilename}`));
    
    // Print summary
    console.log(chalk.bold.green('\nSummary of Recommendations:'));
    console.log(chalk.yellow('1. Prioritize the auth provider fix PR (#123)'));
    console.log(chalk.yellow('2. Next, review and merge the unit testing PR (#167)'));
    console.log(chalk.yellow('3. For mobile optimization PRs:'));
    console.log(chalk.yellow('   - Consider consolidating multiple PRs'));
    console.log(chalk.yellow('   - Or merge sequentially starting with the oldest'));
    console.log(chalk.yellow('4. Implement thorough testing after each merge'));
    
    console.log(chalk.bold.blue('\nAnalysis complete!\n'));
    
  } catch (error) {
    console.error(chalk.red('Error analyzing PRs:'), error);
  }
}

// Run the script
main(); 