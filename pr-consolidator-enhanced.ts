#!/usr/bin/env ts-node

/**
 * Enhanced PR Consolidator
 * 
 * A TypeScript tool for analyzing and consolidating related PRs.
 * This tool extends the original PR consolidator to:
 * 1. Work with any set of related PRs, not just mobile optimization
 * 2. Provide better type safety
 * 3. Perform more sophisticated diff analysis
 * 4. Handle auto-merging with safety checks
 * 
 * Usage:
 * ts-node pr-consolidator-enhanced.ts [optional PR numbers]
 */

import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Types for PR Analysis
interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  body: string;
  author: {
    login: string;
  };
  createdAt: string;
  isDraft: boolean;
  mergeable?: boolean | null;
  files?: PullRequestFile[];
}

interface PullRequestFile {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  patch?: string;
}

interface PRDiffAnalysis {
  prNumber: number;
  uniqueFiles: string[];
  changedFiles: string[];
  commonFiles: string[];
  diffPatterns: Record<string, string[]>;
  riskLevel: 'Low' | 'Medium' | 'High';
  conflicts: string[];
}

interface ConsolidationRecommendation {
  recommendedPR: number | null;
  otherPRs: number[];
  strategy: 'keep-latest' | 'keep-oldest' | 'create-new' | 'manual-review';
  justification: string;
  risks: string[];
  steps: string[];
}

// Constants from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'THE-AI-REAL-ESTATE-INVESTOR';
const GITHUB_REPO = process.env.GITHUB_REPO || 'AIrie-teachings-dev';
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

/**
 * Format date in a consistent manner
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

/**
 * Run a shell command and return the output
 */
function runCommand(command: string, args: string[]): { stdout: string; stderr: string; success: boolean } {
  console.log(chalk.blue(`Running command: ${command} ${args.join(' ')}`));
  
  const result = spawnSync(command, args, { encoding: 'utf8' });
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.status === 0
  };
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(): string {
  const dir = path.resolve(OUTPUT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(chalk.green(`Created output directory: ${dir}`));
  }
  return dir;
}

/**
 * Get PR details using GitHub API
 */
async function getPRDetails(octokit: Octokit, prNumber: number): Promise<PullRequest | null> {
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
      }))
    };
  } catch (error) {
    console.error(chalk.red(`Error fetching PR #${prNumber}:`), error);
    return null;
  }
}

/**
 * Compare two PRs to find differences
 */
function comparePRs(pr1: PullRequest, pr2: PullRequest): PRDiffAnalysis {
  // Extract file paths
  const pr1Files = new Set(pr1.files?.map(file => file.path) || []);
  const pr2Files = new Set(pr2.files?.map(file => file.path) || []);
  
  // Find unique files in PR2
  const uniqueFiles = [...pr2Files].filter(file => !pr1Files.has(file));
  
  // Find common files
  const commonFiles = [...pr2Files].filter(file => pr1Files.has(file));

  // Analyze common files for diff patterns
  const diffPatterns: Record<string, string[]> = {};
  let conflicts: string[] = [];
  
  // For each common file, identify the diff pattern
  commonFiles.forEach(filePath => {
    const pr1File = pr1.files?.find(f => f.path === filePath);
    const pr2File = pr2.files?.find(f => f.path === filePath);
    
    if (pr1File?.patch && pr2File?.patch) {
      // Simple conflict detection - if both PRs change the same lines
      const pr1Lines = extractChangedLineNumbers(pr1File.patch);
      const pr2Lines = extractChangedLineNumbers(pr2File.patch);
      
      // Find overlapping changed lines
      const overlappingLines = pr1Lines.filter(line => pr2Lines.includes(line));
      
      if (overlappingLines.length > 0) {
        conflicts.push(`${filePath} (lines: ${overlappingLines.join(', ')})`);
      }
      
      // Extract patterns from patches
      const patterns = extractDiffPatterns(pr2File.patch);
      if (patterns.length > 0) {
        diffPatterns[filePath] = patterns;
      }
    }
  });
  
  // Determine risk level
  let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
  
  if (conflicts.length > 0) {
    riskLevel = 'High';
  } else if (uniqueFiles.length > 10 || commonFiles.length > 20) {
    riskLevel = 'Medium';
  } else if (uniqueFiles.some(file => HIGH_RISK_PATTERNS.some(pattern => file.includes(pattern)))) {
    riskLevel = 'Medium';
  }
  
  return {
    prNumber: pr2.number,
    uniqueFiles,
    changedFiles: [...pr2Files],
    commonFiles,
    diffPatterns,
    riskLevel,
    conflicts
  };
}

/**
 * Extract line numbers from a diff patch
 */
function extractChangedLineNumbers(patch: string): number[] {
  const lines = patch.split('\n');
  const lineNumbers: number[] = [];
  
  lines.forEach(line => {
    if (line.startsWith('+') || line.startsWith('-')) {
      // This is a simplification - actual line number extraction is more complex
      const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
      if (match) {
        const startLine = parseInt(match[3]);
        const lineCount = parseInt(match[4]);
        for (let i = 0; i < lineCount; i++) {
          lineNumbers.push(startLine + i);
        }
      }
    }
  });
  
  return lineNumbers;
}

/**
 * Extract common diff patterns from a patch
 */
function extractDiffPatterns(patch: string): string[] {
  const patterns: string[] = [];
  const lines = patch.split('\n');
  
  // Look for repeated patterns in the diff
  let currentPattern = '';
  let patternCount = 0;
  
  lines.forEach(line => {
    if (line.startsWith('+') || line.startsWith('-')) {
      // Skip diff markers and focus on actual changes
      const cleanLine = line.substring(1).trim();
      
      // Look for common patterns in React/Next.js code
      if (cleanLine.includes('className=')) {
        patterns.push('className changes');
      } else if (cleanLine.includes('import ')) {
        patterns.push('import changes');
      } else if (cleanLine.includes('export ')) {
        patterns.push('export changes');
      } else if (cleanLine.match(/<[a-zA-Z]+/)) {
        patterns.push('JSX element changes');
      }
    }
  });
  
  return [...new Set(patterns)]; // Remove duplicates
}

/**
 * Generate a consolidation recommendation
 */
function generateRecommendation(prs: PullRequest[], analyses: PRDiffAnalysis[]): ConsolidationRecommendation {
  // Default to keeping the latest PR
  const sortedPRs = [...prs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const latestPR = sortedPRs[0];
  const otherPRs = sortedPRs.slice(1).map(pr => pr.number);
  
  // Default recommendation
  const recommendation: ConsolidationRecommendation = {
    recommendedPR: latestPR.number,
    otherPRs,
    strategy: 'keep-latest',
    justification: 'Latest PR is the most recent update',
    risks: [],
    steps: [
      `Close PRs #${otherPRs.join(', ')}`,
      `Review and merge PR #${latestPR.number}`
    ]
  };
  
  // Check for high-risk situations
  const highRiskAnalyses = analyses.filter(analysis => analysis.riskLevel === 'High');
  
  if (highRiskAnalyses.length > 0) {
    recommendation.strategy = 'manual-review';
    recommendation.justification = 'High-risk changes detected';
    recommendation.risks.push('Potential conflicts in changed files');
    recommendation.steps = ['Manual review required due to high-risk changes'];
  }
  
  // Check for conflicts
  const conflictAnalyses = analyses.filter(analysis => analysis.conflicts.length > 0);
  
  if (conflictAnalyses.length > 0) {
    recommendation.strategy = 'manual-review';
    recommendation.justification = 'Conflicts detected between PRs';
    recommendation.risks.push('File conflicts need manual resolution');
    recommendation.steps = ['Manual conflict resolution required'];
  }
  
  // Check if a PR completely contains another
  const completelyContained = analyses.some(analysis => 
    analysis.uniqueFiles.length === 0 && analysis.commonFiles.length > 0
  );
  
  if (completelyContained) {
    // Find the most comprehensive PR
    const prsByFileCount = [...prs].sort((a, b) => 
      (b.files?.length || 0) - (a.files?.length || 0)
    );
    
    const mostComprehensive = prsByFileCount[0];
    
    recommendation.recommendedPR = mostComprehensive.number;
    recommendation.otherPRs = prs.filter(pr => pr.number !== mostComprehensive.number)
      .map(pr => pr.number);
    recommendation.strategy = 'keep-latest';
    recommendation.justification = 'One PR contains all changes from others';
    recommendation.steps = [
      `Close PRs #${recommendation.otherPRs.join(', ')}`,
      `Review and merge PR #${recommendation.recommendedPR}`
    ];
  }
  
  return recommendation;
}

/**
 * Generate a detailed report
 */
async function generateReport(
  prs: PullRequest[], 
  analyses: PRDiffAnalysis[], 
  recommendation: ConsolidationRecommendation
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const outputDir = ensureOutputDir();
  const reportPath = path.join(outputDir, `pr-consolidation-${timestamp}.md`);
  
  let report = `# PR Consolidation Analysis\n`;
  report += `Generated: ${new Date().toLocaleString()}\n\n`;
  
  // PR Summary
  report += `## PR Summary\n\n`;
  report += `| PR | Title | Branch | Files | Created | Risk |\n`;
  report += `|---|---|---|---|---|---|\n`;
  
  for (const pr of prs) {
    const analysis = analyses.find(a => a.prNumber === pr.number);
    report += `| #${pr.number} | ${pr.title} | ${pr.headRefName} | ${pr.files?.length || 0} | ${formatDate(pr.createdAt)} | ${analysis?.riskLevel || 'N/A'} |\n`;
  }
  
  report += `\n`;
  
  // Diff Analysis
  report += `## Diff Analysis\n\n`;
  
  for (const analysis of analyses) {
    report += `### PR #${analysis.prNumber}\n\n`;
    
    if (analysis.uniqueFiles.length > 0) {
      report += `#### Unique Files (${analysis.uniqueFiles.length})\n`;
      analysis.uniqueFiles.forEach(file => {
        report += `- \`${file}\`\n`;
      });
      report += `\n`;
    }
    
    if (analysis.conflicts.length > 0) {
      report += `#### Conflicts (${analysis.conflicts.length})\n`;
      analysis.conflicts.forEach(conflict => {
        report += `- ${conflict}\n`;
      });
      report += `\n`;
    }
    
    // Show a few diff patterns as examples
    if (Object.keys(analysis.diffPatterns).length > 0) {
      report += `#### Diff Patterns\n`;
      let patternCount = 0;
      for (const [file, patterns] of Object.entries(analysis.diffPatterns)) {
        if (patternCount < 3) { // Limit to 3 examples
          report += `- \`${file}\`: ${patterns.join(', ')}\n`;
          patternCount++;
        }
      }
      if (Object.keys(analysis.diffPatterns).length > 3) {
        report += `- ...(${Object.keys(analysis.diffPatterns).length - 3} more files)\n`;
      }
      report += `\n`;
    }
  }
  
  // Recommendation
  report += `## Recommendation\n\n`;
  report += `**Strategy:** ${recommendation.strategy}\n\n`;
  report += `**Justification:** ${recommendation.justification}\n\n`;
  
  if (recommendation.risks.length > 0) {
    report += `### Risks\n\n`;
    recommendation.risks.forEach(risk => {
      report += `- ${risk}\n`;
    });
    report += `\n`;
  }
  
  report += `### Steps\n\n`;
  recommendation.steps.forEach((step, index) => {
    report += `${index + 1}. ${step}\n`;
  });
  report += `\n`;
  
  if (recommendation.strategy === 'keep-latest' || recommendation.strategy === 'keep-oldest') {
    report += `### Implementation\n\n`;
    report += `\`\`\`bash\n`;
    
    for (const prNumber of recommendation.otherPRs) {
      report += `gh pr close ${prNumber} -c "Consolidated into PR #${recommendation.recommendedPR}"\n`;
    }
    
    report += `gh pr review ${recommendation.recommendedPR} --approve -b "Approved after consolidation analysis"\n`;
    report += `\`\`\`\n\n`;
  } else if (recommendation.strategy === 'create-new') {
    report += `### New Branch Creation\n\n`;
    report += `For creating a new consolidated branch, use the interactive PR Consolidator:\n\n`;
    report += `\`\`\`bash\n`;
    report += `cd ${GITHUB_REPO}\n`;
    report += `./pr-tools.sh # Select option 2\n`;
    report += `\`\`\`\n\n`;
  }
  
  // Save report
  fs.writeFileSync(reportPath, report);
  console.log(chalk.green(`Report generated: ${reportPath}`));
  
  // Also save a "latest" version
  const latestReportPath = path.join(outputDir, `pr-consolidation-latest.md`);
  fs.writeFileSync(latestReportPath, report);
  
  return reportPath;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(chalk.bold.green(`PR Consolidator for ${GITHUB_ORG}/${GITHUB_REPO}`));
    
    // Check for GitHub token
    if (!GITHUB_TOKEN) {
      console.error(chalk.red('GitHub token not found. Please set GITHUB_TOKEN in .env file.'));
      console.error(chalk.yellow('You can create a token at https://github.com/settings/tokens'));
      process.exit(1);
    }
    
    console.log(chalk.green('GitHub token found!'));
    
    // Initialize Octokit
    const octokit = new Octokit({
      auth: GITHUB_TOKEN
    });
    
    // Get command line arguments for PR numbers
    const args = process.argv.slice(2);
    let prNumbers: number[] = [];
    
    if (args.length > 0) {
      // Use PR numbers from command line arguments
      prNumbers = args.map(Number).filter(n => !isNaN(n));
      console.log(chalk.blue(`Analyzing PRs: ${prNumbers.join(', ')}`));
    } else {
      // Fetch PRs from GitHub
      console.log(chalk.blue('Fetching open PRs...'));
      const { data: prs } = await octokit.pulls.list({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        state: 'open',
        per_page: 100
      });
      
      console.log(chalk.green(`Found ${prs.length} open PRs.`));
      
      // Group PRs by title similarity
      const prGroups: Record<string, any[]> = {};
      prs.forEach(pr => {
        // Normalize title for grouping (remove emojis, numbers, etc.)
        const normalizedTitle = pr.title.replace(/[^a-zA-Z\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        
        if (!prGroups[normalizedTitle]) {
          prGroups[normalizedTitle] = [];
        }
        prGroups[normalizedTitle].push(pr);
      });
      
      // Find groups with multiple PRs
      const multiPRGroups = Object.entries(prGroups)
        .filter(([_, group]) => group.length > 1)
        .map(([title, group]) => ({ title, prs: group }));
      
      if (multiPRGroups.length === 0) {
        console.log(chalk.yellow('No groups of related PRs found.'));
        return;
      }
      
      console.log(chalk.yellow(`Found ${multiPRGroups.length} groups of related PRs.`));
      
      // Ask which group to consolidate
      const { groupIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'groupIndex',
          message: 'Which group of PRs would you like to consolidate?',
          choices: multiPRGroups.map((group, index) => ({
            name: `${group.title} (${group.prs.length} PRs)`,
            value: index
          }))
        }
      ]);
      
      const selectedGroup = multiPRGroups[groupIndex];
      prNumbers = selectedGroup.prs.map(pr => pr.number);
      
      console.log(chalk.blue(`Selected group: ${selectedGroup.title}`));
      console.log(chalk.blue(`PRs to analyze: ${prNumbers.join(', ')}`));
    }
    
    // Fetch details for each PR
    const prs: PullRequest[] = [];
    for (const prNumber of prNumbers) {
      const pr = await getPRDetails(octokit, prNumber);
      if (pr) {
        prs.push(pr);
      }
    }
    
    if (prs.length < 2) {
      console.log(chalk.yellow('Need at least 2 PRs to compare. Exiting.'));
      return;
    }
    
    // Compare PRs
    const analyses: PRDiffAnalysis[] = [];
    for (let i = 0; i < prs.length - 1; i++) {
      for (let j = i + 1; j < prs.length; j++) {
        console.log(chalk.blue(`Comparing PR #${prs[i].number} with PR #${prs[j].number}...`));
        analyses.push(comparePRs(prs[i], prs[j]));
      }
    }
    
    // Generate recommendation
    const recommendation = generateRecommendation(prs, analyses);
    
    // Generate and display report
    const reportPath = await generateReport(prs, analyses, recommendation);
    
    // Ask if user wants to execute the recommendation
    if (recommendation.strategy === 'keep-latest' || recommendation.strategy === 'keep-oldest') {
      const { execute } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'execute',
          message: `Would you like to execute the recommended actions? (close other PRs, approve ${recommendation.recommendedPR})`,
          default: false
        }
      ]);
      
      if (execute) {
        console.log(chalk.blue('Executing recommendation...'));
        
        // Close other PRs
        for (const prNumber of recommendation.otherPRs) {
          console.log(chalk.yellow(`Closing PR #${prNumber}...`));
          await octokit.pulls.update({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            pull_number: prNumber,
            state: 'closed'
          });
          
          // Add comment about consolidation
          await octokit.issues.createComment({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            issue_number: prNumber,
            body: `Closed in favor of PR #${recommendation.recommendedPR} as part of PR consolidation.`
          });
        }
        
        // Approve the recommended PR
        if (recommendation.recommendedPR) {
          console.log(chalk.green(`Approving PR #${recommendation.recommendedPR}...`));
          await octokit.pulls.createReview({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            pull_number: recommendation.recommendedPR,
            event: 'APPROVE',
            body: 'Approved after PR consolidation analysis'
          });
        }
        
        console.log(chalk.green('Recommendation executed!'));
      }
    } else {
      console.log(chalk.yellow('The recommended strategy requires manual intervention.'));
      console.log(chalk.yellow(`Please review the report at ${reportPath}`));
    }
    
  } catch (error) {
    console.error(chalk.red('An error occurred:'), error);
  }
}

// Run the main function
main().catch(console.error); 