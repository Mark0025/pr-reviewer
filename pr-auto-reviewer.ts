#!/usr/bin/env ts-node

/**
 * PR Auto Reviewer
 * 
 * Automatically analyzes PRs for merge readiness and main branch protection
 * v3 Implementation - Part of PR_AUTO_REVIEWR
 * 
 * Usage:
 * ts-node pr-auto-reviewer.ts <PR_NUMBER>
 */

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { analyzeMainBranchRisks } from './analyzers/main-branch-analyzer';
import { detectRaceConditions } from './analyzers/race-condition-detector';
import { checkDependencyConflicts } from './analyzers/dependency-analyzer';
import { 
  PullRequest, 
  PRAutoReviewResult, 
  MainBranchAnalysis, 
  RaceConditionAnalysis, 
  DependencyAnalysis 
} from './types';
import { 
  createOctokit, 
  getPRDetails, 
  saveReport, 
  formatDateCST,
  executeGitCommand,
  requestReviews
} from './utils';

/**
 * Main function to auto review a PR
 */
export async function autoReviewPR(prNumber: number): Promise<void> {
  try {
    console.log(chalk.blue(`Starting auto review for PR #${prNumber}...`));
    
    // Get the Octokit instance
    const octokit = createOctokit();
    
    // Get PR details
    const pr = await getPRDetails(octokit, prNumber);
    
    if (!pr) {
      console.error(chalk.red(`Could not fetch PR #${prNumber}`));
      process.exit(1);
    }
    
    console.log(chalk.green(`Analyzing PR #${prNumber}: "${pr.title}"`));
    
    // Analyze main branch risks
    console.log(chalk.blue('Analyzing main branch risks...'));
    const mainBranchRisks = await analyzeMainBranchRisks(prNumber);
    
    // Check for race conditions
    console.log(chalk.blue('Checking for race conditions...'));
    const raceConditions = await detectRaceConditions(prNumber);
    
    // Validate dependency changes
    console.log(chalk.blue('Validating dependency changes...'));
    const dependencyConflicts = await checkDependencyConflicts(prNumber);
    
    // Determine if PR is ready for review
    const isReadyForReview = determineReviewReadiness(
      mainBranchRisks,
      raceConditions,
      dependencyConflicts
    );
    
    // Get recommended reviewers
    const recommendedReviewers = getRecommendedReviewers(
      pr,
      mainBranchRisks,
      raceConditions,
      dependencyConflicts
    );
    
    // Determine merge recommendation
    const mergeRecommendation = determineMergeRecommendation(
      mainBranchRisks,
      raceConditions,
      dependencyConflicts
    );
    
    // Get action items
    const actionItems = generateActionItems(
      pr,
      mainBranchRisks,
      raceConditions,
      dependencyConflicts,
      mergeRecommendation
    );
    
    // Generate result object
    const result: PRAutoReviewResult = {
      prNumber: pr.number,
      title: pr.title,
      readyForReview: isReadyForReview,
      mainBranchAnalysis: mainBranchRisks,
      raceConditionAnalysis: raceConditions,
      dependencyAnalysis: dependencyConflicts,
      recommendedReviewers,
      mergeRecommendation,
      actionItems
    };
    
    // Generate and save report
    const report = generateAutoReviewReport(result);
    const timestamp = formatDateCST();
    const filename = `pr-auto-review-${prNumber}-${timestamp}.md`;
    saveReport(report, filename);
    
    // Request reviews if ready
    if (isReadyForReview && recommendedReviewers.length > 0) {
      console.log(chalk.blue(`Requesting reviews from: ${recommendedReviewers.join(', ')}`));
      await requestReviews(octokit, prNumber, recommendedReviewers);
    }
    
    // Print summary to console
    printResultSummary(result);
    
  } catch (error) {
    console.error(chalk.red('Error during auto review:'), error);
    process.exit(1);
  }
}

/**
 * Determine if a PR is ready for review
 */
function determineReviewReadiness(
  mainBranchRisks: MainBranchAnalysis,
  raceConditions: RaceConditionAnalysis,
  dependencyConflicts: DependencyAnalysis
): boolean {
  // Block review for high risk issues
  if (
    mainBranchRisks.overallRisk === 'High' ||
    raceConditions.overallRisk === 'High' ||
    dependencyConflicts.overallRisk === 'High' ||
    dependencyConflicts.versionConflicts.length > 0 ||
    dependencyConflicts.missingPeerDependencies.length > 0
  ) {
    return false;
  }
  
  // Block review for critical conflicts
  if (mainBranchRisks.potentialMergeConflicts.length > 0) {
    return false;
  }
  
  // Otherwise ready for review
  return true;
}

/**
 * Get recommended reviewers based on PR content
 */
function getRecommendedReviewers(
  pr: PullRequest,
  mainBranchRisks: MainBranchAnalysis,
  raceConditions: RaceConditionAnalysis,
  dependencyConflicts: DependencyAnalysis
): string[] {
  const reviewers: Set<string> = new Set();
  
  // Default reviewers
  reviewers.add('aire-team');
  
  // Add specific reviewers based on content
  if (pr.files) {
    // Check for backend changes
    const hasBackendChanges = pr.files.some(file => 
      file.path.includes('/api/') || 
      file.path.includes('/services/') || 
      file.path.includes('/server/')
    );
    
    // Check for frontend changes
    const hasFrontendChanges = pr.files.some(file => 
      file.path.includes('/components/') || 
      file.path.includes('/pages/') || 
      file.path.includes('/app/') && 
      (file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))
    );
    
    // Check for database changes
    const hasDatabaseChanges = mainBranchRisks.databaseSchemaChanges.length > 0;
    
    // Add specific reviewers based on content
    if (hasBackendChanges) {
      reviewers.add('backend-team');
    }
    
    if (hasFrontendChanges) {
      reviewers.add('frontend-team');
    }
    
    if (hasDatabaseChanges) {
      reviewers.add('data-team');
    }
    
    // Add reviewers for race conditions
    if (raceConditions.overallRisk !== 'Low') {
      reviewers.add('senior-dev');
    }
    
    // Add reviewers for dependency issues
    if (dependencyConflicts.overallRisk !== 'Low') {
      reviewers.add('devops-team');
    }
  }
  
  return Array.from(reviewers);
}

/**
 * Determine merge recommendation
 */
function determineMergeRecommendation(
  mainBranchRisks: MainBranchAnalysis,
  raceConditions: RaceConditionAnalysis,
  dependencyConflicts: DependencyAnalysis
): 'Approve' | 'Request Changes' | 'Needs Discussion' {
  // Critical issues that require changes
  if (
    mainBranchRisks.overallRisk === 'High' ||
    raceConditions.overallRisk === 'High' ||
    dependencyConflicts.overallRisk === 'High' ||
    mainBranchRisks.potentialMergeConflicts.length > 0 ||
    dependencyConflicts.versionConflicts.length > 0 ||
    dependencyConflicts.missingPeerDependencies.length > 0
  ) {
    return 'Request Changes';
  }
  
  // Issues that need discussion
  if (
    mainBranchRisks.overallRisk === 'Medium' ||
    raceConditions.overallRisk === 'Medium' ||
    dependencyConflicts.overallRisk === 'Medium' ||
    mainBranchRisks.apiBreakingChanges.length > 0 ||
    mainBranchRisks.databaseSchemaChanges.length > 0
  ) {
    return 'Needs Discussion';
  }
  
  // Otherwise approve
  return 'Approve';
}

/**
 * Generate action items based on analysis
 */
function generateActionItems(
  pr: PullRequest,
  mainBranchRisks: MainBranchAnalysis,
  raceConditions: RaceConditionAnalysis,
  dependencyConflicts: DependencyAnalysis,
  mergeRecommendation: 'Approve' | 'Request Changes' | 'Needs Discussion'
): string[] {
  const actionItems: string[] = [];
  
  // Main branch risks
  if (mainBranchRisks.potentialMergeConflicts.length > 0) {
    actionItems.push(`Resolve merge conflicts with files: ${mainBranchRisks.potentialMergeConflicts.join(', ')}`);
  }
  
  if (mainBranchRisks.apiBreakingChanges.length > 0) {
    actionItems.push(`Review API breaking changes in: ${mainBranchRisks.apiBreakingChanges.join(', ')}`);
  }
  
  if (mainBranchRisks.databaseSchemaChanges.length > 0) {
    actionItems.push(`Create database migration plan for: ${mainBranchRisks.databaseSchemaChanges.join(', ')}`);
  }
  
  // Race conditions
  if (raceConditions.formSubmissionIssues.length > 0) {
    actionItems.push(`Fix form submission race conditions: ${raceConditions.formSubmissionIssues.join('; ')}`);
  }
  
  if (raceConditions.stateManagementIssues.length > 0) {
    actionItems.push(`Fix state management race conditions: ${raceConditions.stateManagementIssues.join('; ')}`);
  }
  
  if (raceConditions.asyncOperationIssues.length > 0) {
    actionItems.push(`Fix async operation race conditions: ${raceConditions.asyncOperationIssues.join('; ')}`);
  }
  
  if (raceConditions.databaseTransactionIssues.length > 0) {
    actionItems.push(`Fix database transaction issues: ${raceConditions.databaseTransactionIssues.join('; ')}`);
  }
  
  // Dependency conflicts
  if (dependencyConflicts.versionConflicts.length > 0) {
    actionItems.push(`Resolve dependency version conflicts: ${dependencyConflicts.versionConflicts.join('; ')}`);
  }
  
  if (dependencyConflicts.duplicateLibraries.length > 0) {
    actionItems.push(`Resolve duplicate libraries: ${dependencyConflicts.duplicateLibraries.join('; ')}`);
  }
  
  if (dependencyConflicts.missingPeerDependencies.length > 0) {
    actionItems.push(`Add missing peer dependencies: ${dependencyConflicts.missingPeerDependencies.join('; ')}`);
  }
  
  // Add review and test action items based on recommendation
  if (mergeRecommendation === 'Request Changes') {
    actionItems.push('Address all issues before requesting review again');
  } else if (mergeRecommendation === 'Needs Discussion') {
    actionItems.push('Discuss identified issues with the team before proceeding');
  } else {
    actionItems.push('Write tests for new functionality');
    actionItems.push('Update documentation if needed');
  }
  
  return actionItems;
}

/**
 * Generate a comprehensive review report
 */
function generateAutoReviewReport(result: PRAutoReviewResult): string {
  const timestamp = formatDateCST();
  
  return `# PR Auto Review Report
Generated: ${new Date().toLocaleString()}

## PR Summary

| Field | Value |
|-------|-------|
| PR Number | #${result.prNumber} |
| Title | ${result.title} |
| Ready for Review | ${result.readyForReview ? '✅ Yes' : '❌ No'} |
| Merge Recommendation | ${getMergeRecommendationEmoji(result.mergeRecommendation)} ${result.mergeRecommendation} |

## Risk Analysis

| Risk Category | Level | Details |
|---------------|-------|---------|
| Main Branch Risk | ${getRiskEmoji(result.mainBranchAnalysis.overallRisk)} ${result.mainBranchAnalysis.overallRisk} | ${getMainBranchRiskSummary(result.mainBranchAnalysis)} |
| Race Condition Risk | ${getRiskEmoji(result.raceConditionAnalysis.overallRisk)} ${result.raceConditionAnalysis.overallRisk} | ${getRaceConditionSummary(result.raceConditionAnalysis)} |
| Dependency Risk | ${getRiskEmoji(result.dependencyAnalysis.overallRisk)} ${result.dependencyAnalysis.overallRisk} | ${getDependencyRiskSummary(result.dependencyAnalysis)} |

## Critical Files Changed

${result.mainBranchAnalysis.criticalFileChanges.length > 0 
  ? result.mainBranchAnalysis.criticalFileChanges.map(file => `- \`${file}\``).join('\n') 
  : 'No critical files changed'
}

## Setup Files Changed

${result.mainBranchAnalysis.setupFileChanges.length > 0 
  ? result.mainBranchAnalysis.setupFileChanges.map(file => `- \`${file}\``).join('\n') 
  : 'No setup files changed'
}

## Potential Merge Conflicts

${result.mainBranchAnalysis.potentialMergeConflicts.length > 0 
  ? result.mainBranchAnalysis.potentialMergeConflicts.map(file => `- \`${file}\``).join('\n') 
  : 'No potential merge conflicts detected'
}

## API Breaking Changes

${result.mainBranchAnalysis.apiBreakingChanges.length > 0 
  ? result.mainBranchAnalysis.apiBreakingChanges.map(file => `- \`${file}\``).join('\n') 
  : 'No API breaking changes detected'
}

## Database Schema Changes

${result.mainBranchAnalysis.databaseSchemaChanges.length > 0 
  ? result.mainBranchAnalysis.databaseSchemaChanges.map(file => `- \`${file}\``).join('\n') 
  : 'No database schema changes detected'
}

## Race Condition Issues

${getRaceConditionDetails(result.raceConditionAnalysis)}

## Dependency Issues

${getDependencyDetails(result.dependencyAnalysis)}

## Recommended Reviewers

${result.recommendedReviewers.length > 0 
  ? result.recommendedReviewers.map(reviewer => `- @${reviewer}`).join('\n') 
  : 'No specific reviewers recommended'
}

## Action Items

${result.actionItems.length > 0 
  ? result.actionItems.map(item => `- ${item}`).join('\n') 
  : 'No action items'
}

---
Generated by PR_AUTO_REVIEWR v3 on ${timestamp}
`;
}

/**
 * Get emoji for risk level
 */
function getRiskEmoji(risk: 'Low' | 'Medium' | 'High'): string {
  switch (risk) {
    case 'Low':
      return '🟢';
    case 'Medium':
      return '🟠';
    case 'High':
      return '🔴';
    default:
      return '';
  }
}

/**
 * Get emoji for merge recommendation
 */
function getMergeRecommendationEmoji(recommendation: 'Approve' | 'Request Changes' | 'Needs Discussion'): string {
  switch (recommendation) {
    case 'Approve':
      return '✅';
    case 'Request Changes':
      return '❌';
    case 'Needs Discussion':
      return '⚠️';
    default:
      return '';
  }
}

/**
 * Get summary of main branch risks
 */
function getMainBranchRiskSummary(analysis: MainBranchAnalysis): string {
  const issues: string[] = [];
  
  if (analysis.criticalFileChanges.length > 0) {
    issues.push(`${analysis.criticalFileChanges.length} critical files`);
  }
  
  if (analysis.potentialMergeConflicts.length > 0) {
    issues.push(`${analysis.potentialMergeConflicts.length} merge conflicts`);
  }
  
  if (analysis.setupFileChanges.length > 0) {
    issues.push(`${analysis.setupFileChanges.length} setup files`);
  }
  
  if (analysis.apiBreakingChanges.length > 0) {
    issues.push(`${analysis.apiBreakingChanges.length} API changes`);
  }
  
  if (analysis.databaseSchemaChanges.length > 0) {
    issues.push(`${analysis.databaseSchemaChanges.length} DB schema changes`);
  }
  
  return issues.length > 0 ? issues.join(', ') : 'No significant risks detected';
}

/**
 * Get summary of race condition issues
 */
function getRaceConditionSummary(analysis: RaceConditionAnalysis): string {
  const issues: string[] = [];
  
  if (analysis.formSubmissionIssues.length > 0) {
    issues.push(`${analysis.formSubmissionIssues.length} form issues`);
  }
  
  if (analysis.stateManagementIssues.length > 0) {
    issues.push(`${analysis.stateManagementIssues.length} state issues`);
  }
  
  if (analysis.asyncOperationIssues.length > 0) {
    issues.push(`${analysis.asyncOperationIssues.length} async issues`);
  }
  
  if (analysis.databaseTransactionIssues.length > 0) {
    issues.push(`${analysis.databaseTransactionIssues.length} DB transaction issues`);
  }
  
  return issues.length > 0 ? issues.join(', ') : 'No race conditions detected';
}

/**
 * Get detailed race condition issues
 */
function getRaceConditionDetails(analysis: RaceConditionAnalysis): string {
  const sections: string[] = [];
  
  if (analysis.formSubmissionIssues.length > 0) {
    sections.push('### Form Submission Issues\n\n' + 
      analysis.formSubmissionIssues.map(issue => `- ${issue}`).join('\n'));
  }
  
  if (analysis.stateManagementIssues.length > 0) {
    sections.push('### State Management Issues\n\n' + 
      analysis.stateManagementIssues.map(issue => `- ${issue}`).join('\n'));
  }
  
  if (analysis.asyncOperationIssues.length > 0) {
    sections.push('### Async Operation Issues\n\n' + 
      analysis.asyncOperationIssues.map(issue => `- ${issue}`).join('\n'));
  }
  
  if (analysis.databaseTransactionIssues.length > 0) {
    sections.push('### Database Transaction Issues\n\n' + 
      analysis.databaseTransactionIssues.map(issue => `- ${issue}`).join('\n'));
  }
  
  return sections.length > 0 ? sections.join('\n\n') : 'No race condition issues detected';
}

/**
 * Get summary of dependency issues
 */
function getDependencyRiskSummary(analysis: DependencyAnalysis): string {
  const issues: string[] = [];
  
  if (analysis.packageJsonChanges.length > 0) {
    issues.push(`${analysis.packageJsonChanges.length} package.json changes`);
  }
  
  if (analysis.versionConflicts.length > 0) {
    issues.push(`${analysis.versionConflicts.length} version conflicts`);
  }
  
  if (analysis.duplicateLibraries.length > 0) {
    issues.push(`${analysis.duplicateLibraries.length} duplicate libraries`);
  }
  
  if (analysis.missingPeerDependencies.length > 0) {
    issues.push(`${analysis.missingPeerDependencies.length} missing peer deps`);
  }
  
  return issues.length > 0 ? issues.join(', ') : 'No dependency issues detected';
}

/**
 * Get detailed dependency issues
 */
function getDependencyDetails(analysis: DependencyAnalysis): string {
  const sections: string[] = [];
  
  if (analysis.packageJsonChanges.length > 0) {
    sections.push('### Package.json Changes\n\n' + 
      analysis.packageJsonChanges.map(change => `- ${change}`).join('\n'));
  }
  
  if (analysis.versionConflicts.length > 0) {
    sections.push('### Version Conflicts\n\n' + 
      analysis.versionConflicts.map(conflict => `- ${conflict}`).join('\n'));
  }
  
  if (analysis.duplicateLibraries.length > 0) {
    sections.push('### Duplicate Libraries\n\n' + 
      analysis.duplicateLibraries.map(duplicate => `- ${duplicate}`).join('\n'));
  }
  
  if (analysis.missingPeerDependencies.length > 0) {
    sections.push('### Missing Peer Dependencies\n\n' + 
      analysis.missingPeerDependencies.map(missing => `- ${missing}`).join('\n'));
  }
  
  return sections.length > 0 ? sections.join('\n\n') : 'No dependency issues detected';
}

/**
 * Print a summary of results to the console
 */
function printResultSummary(result: PRAutoReviewResult): void {
  console.log('\n');
  console.log(chalk.cyan('===== PR AUTO REVIEW COMPLETE ====='));
  console.log('\n');
  console.log(`PR #${result.prNumber}: ${chalk.bold(result.title)}`);
  console.log(`Ready for review: ${result.readyForReview ? chalk.green('YES') : chalk.red('NO')}`);
  console.log(`Main branch risk: ${getColoredRisk(result.mainBranchAnalysis.overallRisk)}`);
  console.log(`Race condition risk: ${getColoredRisk(result.raceConditionAnalysis.overallRisk)}`);
  console.log(`Dependency conflicts: ${getColoredRisk(result.dependencyAnalysis.overallRisk)}`);
  console.log('\n');
  
  if (result.recommendedReviewers.length > 0) {
    console.log(`Recommended reviewers: ${chalk.cyan(result.recommendedReviewers.join(', '))}`);
  }
  
  console.log('\n');
  console.log(chalk.cyan('===================================='));
}

/**
 * Get colored risk level text
 */
function getColoredRisk(risk: 'Low' | 'Medium' | 'High'): string {
  switch (risk) {
    case 'Low':
      return chalk.green(risk);
    case 'Medium':
      return chalk.yellow(risk);
    case 'High':
      return chalk.red(risk);
    default:
      return risk;
  }
}

/**
 * Process command line arguments and run the auto reviewer
 */
async function main() {
  // Check if PR number is provided
  const prNumber = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  
  if (!prNumber || isNaN(prNumber)) {
    console.error(chalk.red('Please provide a valid PR number as an argument'));
    console.log(chalk.yellow('Usage: ts-node pr-auto-reviewer.ts <PR_NUMBER>'));
    process.exit(1);
  }
  
  await autoReviewPR(prNumber);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  });
} 