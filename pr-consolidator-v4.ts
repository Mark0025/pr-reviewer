#!/usr/bin/env ts-node

/**
 * PR Consolidator v4
 * 
 * Enhanced PR consolidation tool with multiple strategy options:
 * 1. Keep-Latest - Use the most recent PR that contains all changes
 * 2. Rolling-Up - Progressive integration from earliest to latest PR
 * 3. Consolidation Map - Structured approach with integration points
 * 
 * Usage:
 * ts-node pr-consolidator-v4.ts [--prs 123,456,789] [--strategy keep-latest|rolling-up|consolidation-map|auto]
 */

import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import custom modules
import strategySelector from './strategy-selector';
import consolidationMap from './pr-consolidation-map';
import { ConsolidationStrategy, PRAnalysisFactors, StrategyRecommendation } from './strategy-selector';
import { PullRequest, PRDependency, IntegrationPoint, ConsolidationMap } from './pr-consolidation-map';

// Add advanced logging utility
const logger = {
  debug: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DEBUG] ${message}`;
    console.log(chalk.gray(logMessage));
    if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
  },
  info: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}`;
    console.log(chalk.white(logMessage));
    if (data) console.log(chalk.white(JSON.stringify(data, null, 2)));
  },
  success: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [SUCCESS] ${message}`;
    console.log(chalk.green(logMessage));
    if (data) console.log(chalk.green(JSON.stringify(data, null, 2)));
  },
  warn: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WARNING] ${message}`;
    console.log(chalk.yellow(logMessage));
    if (data) console.log(chalk.yellow(JSON.stringify(data, null, 2)));
  },
  error: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ERROR] ${message}`;
    console.log(chalk.red(logMessage));
    if (data) console.log(chalk.red(JSON.stringify(data, null, 2)));
  }
};

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('prs', {
    alias: 'p',
    description: 'Comma-separated list of PR numbers to consolidate',
    type: 'string',
  })
  .option('strategy', {
    alias: 's',
    description: 'Consolidation strategy to use',
    choices: ['auto', 'keep-latest', 'rolling-up', 'consolidation-map'],
    default: 'auto',
    type: 'string',
  })
  .option('execute', {
    alias: 'e',
    description: 'Automatically execute the consolidation actions after analysis',
    type: 'boolean',
    default: false
  })
  .help()
  .alias('help', 'h')
  .parseSync();

// Constants from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'THE-AI-REAL-ESTATE-INVESTOR';
const GITHUB_REPO = process.env.GITHUB_REPO || 'AIrie-teachings-dev';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './OUTPUT_DIR/REPORTS/';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Main function
 */
async function main() {
  try {
    logger.info("Starting PR Consolidator v4");
    console.log(chalk.cyan.bold('PR Consolidator v4 - Enhanced Consolidation\n'));
    
    // Get GitHub token - first from .env, then try GitHub CLI
    let token = GITHUB_TOKEN;
    if (!token) {
      logger.debug("No GitHub token found in .env, trying GitHub CLI...");
      console.log(chalk.yellow('No GitHub token found in .env, trying GitHub CLI...'));
      try {
        // Try to get token from GitHub CLI using child_process
        const { execSync } = require('child_process');
        token = execSync('gh auth token', { encoding: 'utf8' }).trim();
        logger.success("Successfully retrieved token from GitHub CLI");
        console.log(chalk.green('Successfully retrieved token from GitHub CLI'));
      } catch (error) {
        logger.error("Error retrieving token from GitHub CLI", error);
        console.error(chalk.red('Error retrieving token from GitHub CLI:'), error);
        process.exit(1);
      }
    } else {
      logger.info("GitHub token found in .env");
    }
    
    // Validate GitHub token
    if (!token) {
      logger.error("GitHub token not found in .env or GitHub CLI");
      console.error(chalk.red('GitHub token not found. Please set GITHUB_TOKEN in .env or authenticate with GitHub CLI'));
      process.exit(1);
    }
    
    // Initialize Octokit
    logger.info("Initializing Octokit with GitHub token");
    const octokit = new Octokit({
      auth: token
    });
    
    // Ensure output directory exists
    logger.info("Ensuring output directory exists");
    ensureOutputDirExists();
    
    // Get PRs to consolidate
    logger.info("Getting PRs to consolidate from command line args or GitHub API");
    const prNumbers = await getPRNumbers(argv.prs, octokit);
    if (prNumbers.length === 0) {
      logger.error("No PRs to consolidate. Exiting.");
      console.error(chalk.red('No PRs to consolidate. Exiting.'));
      process.exit(1);
    }
    
    // Fetch PR data
    logger.info(`Fetching data for ${prNumbers.length} PRs: ${prNumbers.join(', ')}`);
    console.log(chalk.yellow(`Fetching data for ${prNumbers.length} PRs...`));
    const prs = await fetchPRsWithDetails(prNumbers, octokit);
    logger.success(`Successfully fetched ${prs.length} PRs`);
    
    // Analyze PRs to determine optimal strategy
    logger.info("Analyzing PRs to determine optimal strategy");
    console.log(chalk.yellow('Analyzing PRs to determine optimal strategy...'));
    const analysisFactors = strategySelector.analyzePRsForStrategyFactors(prs);
    logger.debug("PR analysis factors:", analysisFactors);
    
    // Get strategy (from command line or auto-determine)
    let strategy: ConsolidationStrategy;
    let recommendation: StrategyRecommendation;
    
    if (argv.strategy !== 'auto') {
      logger.info(`Using specified strategy: ${argv.strategy}`);
      strategy = argv.strategy as ConsolidationStrategy;
      recommendation = {
        recommendedStrategy: strategy,
        confidence: 100,
        reasoning: [`Using specified strategy: ${strategy}`],
        alternativeStrategies: []
      };
    } else {
      logger.info("Auto-determining optimal strategy");
      recommendation = strategySelector.determineStrategy(analysisFactors);
      strategy = recommendation.recommendedStrategy;
      logger.info(`Auto-determined strategy: ${strategy} (${recommendation.confidence}% confidence)`);
    }
    
    // Print strategy recommendation
    console.log(chalk.green(`\nRecommended Strategy: ${chalk.bold(strategy)} (${recommendation.confidence}% confidence)`));
    console.log(chalk.yellow('Reasoning:'));
    for (const reason of recommendation.reasoning) {
      console.log(`  - ${reason}`);
    }
    
    // Process PRs based on the selected strategy
    logger.info(`Processing PRs using ${strategy} strategy`);
    console.log(chalk.yellow(`\nProcessing PRs using ${strategy} strategy...`));
    
    let implementationPlan = '';
    let visualMap = '';
    
    switch (strategy) {
      case 'keep-latest':
        // Keep-Latest Strategy
        logger.info("Executing keep-latest strategy");
        const keepLatestResult = await processKeepLatestStrategy(prs, octokit);
        implementationPlan = keepLatestResult.implementationPlan;
        logger.success("Keep-latest strategy execution completed");
        break;
        
      case 'rolling-up':
        // Rolling-Up Strategy
        logger.info("Executing rolling-up strategy");
        const rollingUpResult = await processRollingUpStrategy(prs, octokit);
        implementationPlan = rollingUpResult.implementationPlan;
        logger.success("Rolling-up strategy execution completed");
        break;
        
      case 'consolidation-map':
        // Consolidation Map Strategy
        logger.info("Executing consolidation-map strategy");
        const mapResult = consolidationMap.createConsolidationMap(prs);
        implementationPlan = mapResult.implementationPlan;
        visualMap = mapResult.visualMap;
        logger.success("Consolidation-map strategy execution completed");
        break;
    }
    
    // Generate the consolidation report
    logger.info("Generating consolidation report");
    const timestamp = formatDate(new Date());
    const reportContent = generateConsolidationReport(prs, strategy, recommendation, implementationPlan, visualMap);
    
    // Save the report
    const reportPath = path.join(OUTPUT_DIR, `pr-consolidation-${timestamp}.md`);
    const latestReportPath = path.join(OUTPUT_DIR, 'pr-consolidation-latest.md');
    
    logger.info(`Saving report to ${reportPath}`);
    fs.writeFileSync(reportPath, reportContent);
    fs.writeFileSync(latestReportPath, reportContent);
    
    logger.success(`PR Consolidation Analysis saved to ${reportPath}`);
    console.log(chalk.green(`\nPR Consolidation Analysis saved to ${reportPath}`));
    
    // Ask user if they want to execute the plan
    logger.info("Asking user if they want to execute the plan");
    askForExecution(prs, strategy, implementationPlan, octokit);
    
  } catch (error) {
    logger.error("Error in main function", error);
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

/**
 * Get PR numbers to consolidate
 */
async function getPRNumbers(prsArg: string | undefined, octokit: Octokit): Promise<number[]> {
  logger.debug("getPRNumbers called with prsArg", prsArg);
  // If PRs are provided as an argument, use those
  if (prsArg) {
    const prNumbers = prsArg.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
    logger.info(`Using PR numbers from command line: ${prNumbers.join(', ')}`);
    return prNumbers;
  }
  
  // Otherwise, get open PRs
  try {
    logger.info(`Fetching open PRs from ${GITHUB_ORG}/${GITHUB_REPO}`);
    const { data: pullRequests } = await octokit.pulls.list({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      state: 'open',
      sort: 'created',
      direction: 'asc',
      per_page: 100
    });
    
    if (pullRequests.length === 0) {
      logger.warn("No open PRs found");
      console.log(chalk.yellow('No open PRs found.'));
      return [];
    }
    
    console.log(chalk.cyan('Open PRs:'));
    
    // Display PRs with numbers
    pullRequests.forEach((pr, index) => {
      console.log(`${index + 1}. #${pr.number}: ${pr.title} (${pr.user?.login})`);
    });
    
    // Prompt user to select PRs
    console.log(chalk.cyan('\nEnter PR numbers to consolidate (comma-separated, ranges like 1-3 allowed):'));
    
    const answer = await new Promise<string>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('> ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
    
    // Parse the answer
    let selected: number[] = [];
    if (answer.trim()) {
      selected = parseNumberRanges(answer).map(i => {
        const index = i - 1;
        return index >= 0 && index < pullRequests.length ? pullRequests[index].number : NaN;
      }).filter(n => !isNaN(n));
    }
    
    if (selected.length === 0) {
      logger.warn("No PRs selected");
      console.log(chalk.yellow('No PRs selected.'));
      return [];
    }
    
    logger.info(`Selected PR numbers: ${selected.join(', ')}`);
    return selected;
  } catch (error) {
    logger.error("Error fetching PRs", error);
    console.error(chalk.red('Error fetching PRs:'), error);
    return [];
  }
}

/**
 * Parse number ranges (e.g., "1,3,5-7")
 */
function parseNumberRanges(input: string): number[] {
  const result: number[] = [];
  
  const parts = input.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Check if it's a range
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
      }
    } 
    // Otherwise it's a single number
    else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        result.push(num);
      }
    }
  }
  
  return result;
}

/**
 * Fetch PR details including files and commits
 */
async function fetchPRsWithDetails(prNumbers: number[], octokit: Octokit): Promise<PullRequest[]> {
  const result: PullRequest[] = [];
  
  for (const prNumber of prNumbers) {
    try {
      // Get PR data
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
      
      // Get PR commits
      const { data: commits } = await octokit.pulls.listCommits({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: prNumber
      });
      
      // Map to our format
      result.push({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        author: {
          login: pr.user?.login || 'unknown',
          name: pr.user?.name || undefined
        },
        baseRefName: pr.base.ref,
        headRefName: pr.head.ref,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        files: files.map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes,
          patch: f.patch
        })),
        labels: pr.labels.map(l => ({ name: l.name })),
        commits: commits.map(c => ({
          message: c.commit.message,
          id: c.sha
        }))
      });
      
    } catch (error) {
      console.error(chalk.red(`Error fetching PR #${prNumber}:`), error);
    }
  }
  
  return result;
}

/**
 * Process PRs using Keep-Latest strategy
 */
async function processKeepLatestStrategy(prs: PullRequest[], octokit: Octokit): Promise<{
  implementationPlan: string;
}> {
  // Sort PRs by creation date (newest first)
  const sortedPRs = [...prs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // The latest PR is assumed to contain all changes
  const latestPR = sortedPRs[0];
  const olderPRs = sortedPRs.slice(1);
  
  // Generate implementation plan
  let implementationPlan = '# Implementation Plan for Keep-Latest Strategy\n\n';
  implementationPlan += '## Actions\n\n';
  
  // Close older PRs
  for (const pr of olderPRs) {
    implementationPlan += `1. Close PR #${pr.number} with comment "Consolidated into PR #${latestPR.number}"\n`;
  }
  
  // Approve and merge latest PR
  implementationPlan += `2. Review and approve PR #${latestPR.number}\n`;
  implementationPlan += `3. Merge PR #${latestPR.number}\n\n`;
  
  implementationPlan += '## Implementation\n\n';
  implementationPlan += '```bash\n';
  
  for (const pr of olderPRs) {
    implementationPlan += `gh pr close ${pr.number} -c "Consolidated into PR #${latestPR.number}"\n`;
  }
  
  implementationPlan += `gh pr review ${latestPR.number} --approve -b "Approved after consolidation analysis"\n`;
  implementationPlan += '```\n';
  
  return {
    implementationPlan
  };
}

/**
 * Process PRs using Rolling-Up strategy
 */
async function processRollingUpStrategy(prs: PullRequest[], octokit: Octokit): Promise<{
  implementationPlan: string;
}> {
  // Sort PRs by creation date (oldest first)
  const sortedPRs = [...prs].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  // Generate implementation plan
  let implementationPlan = '# Implementation Plan for Rolling-Up Strategy\n\n';
  implementationPlan += '## Actions\n\n';
  
  // Start with the earliest PR as base
  const basePR = sortedPRs[0];
  implementationPlan += `1. Start with PR #${basePR.number} as base\n`;
  
  // Roll up changes from subsequent PRs
  for (let i = 1; i < sortedPRs.length; i++) {
    const pr = sortedPRs[i];
    implementationPlan += `${i + 1}. Add changes from PR #${pr.number}\n`;
  }
  
  // Create consolidated PR
  implementationPlan += `${sortedPRs.length + 1}. Create consolidated PR\n\n`;
  
  implementationPlan += '## Implementation\n\n';
  implementationPlan += '```bash\n';
  implementationPlan += `# Create integration branch from base PR\n`;
  implementationPlan += `git fetch origin pull/${basePR.number}/head:integration-branch\n`;
  implementationPlan += `git checkout integration-branch\n\n`;
  
  // Roll up changes from subsequent PRs
  for (let i = 1; i < sortedPRs.length; i++) {
    const pr = sortedPRs[i];
    implementationPlan += `# Add changes from PR #${pr.number}\n`;
    implementationPlan += `git fetch origin pull/${pr.number}/head:pr-${pr.number}\n`;
    implementationPlan += `git merge pr-${pr.number} --no-commit\n`;
    implementationPlan += `# Resolve conflicts if any\n`;
    implementationPlan += `git commit -m "Integrate changes from PR #${pr.number}"\n\n`;
  }
  
  // Create consolidated PR
  implementationPlan += `# Create consolidated PR\n`;
  implementationPlan += `git push origin integration-branch\n`;
  implementationPlan += `gh pr create --base main --head integration-branch --title "Consolidated PR" --body "This PR consolidates changes from PRs: ${sortedPRs.map(pr => `#${pr.number}`).join(', ')}"\n`;
  implementationPlan += '```\n';
  
  return {
    implementationPlan
  };
}

/**
 * Generate the consolidation report
 */
function generateConsolidationReport(
  prs: PullRequest[],
  strategy: ConsolidationStrategy,
  recommendation: StrategyRecommendation,
  implementationPlan: string,
  visualMap: string
): string {
  let report = `# PR Consolidation Analysis\n`;
  report += `Generated: ${formatDate(new Date(), true)}\n\n`;
  
  // PR Summary
  report += `## PR Summary\n\n`;
  report += `| PR | Title | Branch | Files | Created | Risk |\n`;
  report += `|---|---|---|---|---|---|\n`;
  
  for (const pr of prs) {
    const createdDate = new Date(pr.createdAt).toLocaleString();
    report += `| #${pr.number} | ${pr.title} | ${pr.headRefName} | ${pr.files?.length || 'N/A'} | ${createdDate} | N/A |\n`;
  }
  
  // Add strategy recommendation
  report += `\n${strategySelector.generateStrategyVisualization(recommendation)}\n`;
  
  // Add visual map if available
  if (visualMap) {
    report += `\n## Consolidation Map\n\n${visualMap}\n`;
  }
  
  // Add implementation plan
  report += `\n${implementationPlan}\n`;
  
  // Add executable commands section for easy copy-paste
  report += `\n## Executable Commands\n\n`;
  report += `To execute this consolidation plan manually, you can run these commands:\n\n`;
  
  if (strategy === 'keep-latest') {
    // Sort PRs by creation date (newest first)
    const sortedPRs = [...prs].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // The latest PR is assumed to contain all changes
    const latestPR = sortedPRs[0];
    const olderPRs = sortedPRs.slice(1);
    
    report += '```bash\n';
    // Close older PRs
    for (const pr of olderPRs) {
      report += `# Close PR #${pr.number}\n`;
      report += `gh pr close ${pr.number} -c "Consolidated into PR #${latestPR.number}"\n`;
    }
    
    // Approve and merge latest PR
    report += `\n# Approve latest PR #${latestPR.number}\n`;
    report += `gh pr review ${latestPR.number} --approve -b "Approved after consolidation analysis"\n`;
    report += `gh pr merge ${latestPR.number} --merge --delete-branch\n`;
    report += '```\n';
  } else if (strategy === 'rolling-up') {
    // Extract bash commands from implementation plan
    const bashSection = implementationPlan.match(/```bash\n([\s\S]*?)```/);
    if (bashSection && bashSection[1]) {
      report += '```bash\n' + bashSection[1] + '```\n';
    }
  } else {
    // Consolidation map strategy
    report += '```bash\n';
    report += '# Follow the consolidation map steps as outlined above\n';
    report += '# This strategy requires careful manual execution\n';
    report += '```\n';
  }
  
  report += '\nYou can also run the PR Consolidator with `--execute` flag to automatically perform these actions.\n';
  
  return report;
}

/**
 * Ensure output directory exists
 */
function ensureOutputDirExists(): void {
  logger.debug("ensureOutputDirExists called");
  if (!fs.existsSync(OUTPUT_DIR)) {
    logger.info(`Creating output directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  } else {
    logger.debug(`Output directory already exists: ${OUTPUT_DIR}`);
  }
}

/**
 * Format date for filenames and display
 */
function formatDate(date: Date, forDisplay = false): string {
  if (forDisplay) {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } else {
    // For filenames, use more compact format
    return date.toISOString()
      .replace(/:/g, '-')
      .replace(/\..+/, '');
  }
}

/**
 * Ask user if they want to execute the plan
 */
function askForExecution(
  prs: PullRequest[],
  strategy: ConsolidationStrategy,
  implementationPlan: string,
  octokit: Octokit
): void {
  // If --execute flag was provided, automatically execute
  if (argv.execute) {
    logger.info("Automatic execution requested with --execute flag");
    console.log(chalk.green('\nAutomatic execution requested with --execute flag'));
    executeStrategy(prs, strategy, octokit)
      .then(() => {
        console.log(chalk.green('\nConsolidation actions completed successfully!'));
        console.log(chalk.green('Please verify the changes in your GitHub repository.'));
        rl.close();
      })
      .catch((error) => {
        console.error(chalk.red('\nError executing actions:'), error);
        console.error(chalk.red('You may need to perform these actions manually.'));
        console.error(chalk.red('See the "Executable Commands" section in the report.'));
        rl.close();
      });
    return;
  }

  // Otherwise, prompt the user
  console.log(chalk.yellow('\n===== CONSOLIDATION ACTION REQUIRED ====='));
  console.log(chalk.cyan('The analysis is complete. You can now execute the consolidation actions.'));
  console.log(chalk.cyan('This will:'));
  
  if (strategy === 'keep-latest') {
    // Sort PRs by creation date (newest first)
    const sortedPRs = [...prs].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // The latest PR is assumed to contain all changes
    const latestPR = sortedPRs[0];
    const olderPRs = sortedPRs.slice(1);
    
    console.log(chalk.cyan(`  1. Close ${olderPRs.length} older PRs: ${olderPRs.map(pr => '#' + pr.number).join(', ')}`));
    console.log(chalk.cyan(`  2. Approve the latest PR #${latestPR.number}`));
    console.log(chalk.cyan(`  3. Optionally merge PR #${latestPR.number} (if you have permission)`));
  } else if (strategy === 'rolling-up') {
    console.log(chalk.cyan('  1. Create an integration branch'));
    console.log(chalk.cyan('  2. Sequentially merge changes from all PRs'));
    console.log(chalk.cyan('  3. Create a new consolidated PR'));
  } else {
    console.log(chalk.cyan('  1. Follow the consolidation map steps'));
    console.log(chalk.cyan('  2. Create integration points as specified'));
    console.log(chalk.cyan('  3. Create a final consolidated PR'));
  }
  
  console.log(chalk.yellow('\nThese actions will modify PRs in the repository.'));
  rl.question(chalk.yellow('Do you want to execute these actions now? (y/N): '), async (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log(chalk.green('\nExecuting consolidation actions...'));
      
      try {
        await executeStrategy(prs, strategy, octokit);
        console.log(chalk.green('\nConsolidation actions completed successfully!'));
        console.log(chalk.green('Please verify the changes in your GitHub repository.'));
      } catch (error) {
        console.error(chalk.red('\nError executing actions:'), error);
        console.error(chalk.red('You may need to perform these actions manually.'));
        console.error(chalk.red('See the "Executable Commands" section in the report.'));
      }
    } else {
      console.log(chalk.yellow('\nNo actions executed.'));
      console.log(chalk.cyan('You can find the executable commands in the "Executable Commands" section of the report.'));
      console.log(chalk.cyan('Copy and run these commands manually when you are ready to consolidate the PRs.'));
    }
    
    rl.close();
  });
}

/**
 * Execute the selected strategy
 */
async function executeStrategy(
  prs: PullRequest[],
  strategy: ConsolidationStrategy,
  octokit: Octokit
): Promise<void> {
  switch (strategy) {
    case 'keep-latest':
      await executeKeepLatestStrategy(prs, octokit);
      break;
      
    case 'rolling-up':
      console.log(chalk.yellow('Rolling-Up strategy requires manual execution. Please follow the implementation plan.'));
      break;
      
    case 'consolidation-map':
      console.log(chalk.yellow('Consolidation Map strategy requires manual execution. Please follow the implementation plan.'));
      break;
  }
}

/**
 * Execute the Keep-Latest strategy
 */
async function executeKeepLatestStrategy(
  prs: PullRequest[],
  octokit: Octokit
): Promise<void> {
  // Sort PRs by creation date (newest first)
  const sortedPRs = [...prs].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // The latest PR is assumed to contain all changes
  const latestPR = sortedPRs[0];
  const olderPRs = sortedPRs.slice(1);
  
  // Close older PRs
  for (const pr of olderPRs) {
    console.log(chalk.yellow(`Closing PR #${pr.number}...`));
    
    try {
      await octokit.issues.createComment({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        issue_number: pr.number,
        body: `Closing in favor of PR #${latestPR.number}, which contains all these changes.`
      });
      
      await octokit.pulls.update({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number,
        state: 'closed'
      });
      
      console.log(chalk.green(`PR #${pr.number} closed successfully`));
    } catch (error) {
      console.error(chalk.red(`Error closing PR #${pr.number}:`), error);
    }
  }
  
  // Approve latest PR
  console.log(chalk.yellow(`Approving PR #${latestPR.number}...`));
  
  try {
    await octokit.pulls.createReview({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: latestPR.number,
      event: 'APPROVE',
      body: 'Approved after consolidation analysis'
    });
    
    console.log(chalk.green(`PR #${latestPR.number} approved successfully`));
  } catch (error) {
    console.error(chalk.red(`Error approving PR #${latestPR.number}:`), error);
  }
}

// Start the main function
main().catch(error => {
  logger.error("Unhandled error in main function", error);
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
}); 