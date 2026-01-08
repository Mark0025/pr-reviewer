/**
 * Main Branch Risk Analyzer
 * 
 * Analyzes PRs for potential risks to the main branch
 */

import { Octokit } from '@octokit/rest';
import { 
  PullRequest, 
  PullRequestFile,
  MainBranchAnalysis 
} from '../types';
import { 
  createOctokit, 
  getPRDetails, 
  isHighRiskFile,
  executeGitCommand
} from '../utils';

/**
 * Analyze risks that a PR poses to the main branch
 */
export async function analyzeMainBranchRisks(prNumber: number): Promise<MainBranchAnalysis> {
  console.log(`Analyzing main branch risks for PR #${prNumber}...`);
  
  // Get PR details
  const octokit = createOctokit();
  const pr = await getPRDetails(octokit, prNumber);
  
  if (!pr) {
    throw new Error(`Could not fetch PR #${prNumber}`);
  }
  
  // Analyze risks to main branch
  return {
    criticalFileChanges: detectCriticalFileChanges(pr),
    potentialMergeConflicts: await detectPotentialMergeConflicts(pr),
    setupFileChanges: detectSetupFileChanges(pr),
    apiBreakingChanges: detectAPIBreakingChanges(pr),
    databaseSchemaChanges: detectDatabaseSchemaChanges(pr),
    overallRisk: calculateOverallRisk(pr)
  };
}

/**
 * Detect critical file changes in the PR
 */
function detectCriticalFileChanges(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  return pr.files
    .filter(file => isHighRiskFile(file.path))
    .map(file => file.path);
}

/**
 * Detect potential merge conflicts with the main branch
 */
async function detectPotentialMergeConflicts(pr: PullRequest): Promise<string[]> {
  const conflicts: string[] = [];
  
  // Get the base branch (usually main/master)
  const baseBranch = pr.baseRefName;
  const headBranch = pr.headRefName;
  
  // Try to simulate a merge to find conflicts
  const mergeTest = executeGitCommand([
    'checkout', baseBranch, '&&',
    'git', 'merge', '--no-commit', '--no-ff', headBranch
  ]);
  
  // If merge test fails, there are conflicts
  if (!mergeTest.success) {
    // Get list of conflicting files
    const conflictingFiles = executeGitCommand(['diff', '--name-only', '--diff-filter=U']);
    if (conflictingFiles.success) {
      conflicts.push(...conflictingFiles.stdout.split('\n').filter(Boolean));
    }
    
    // Abort the merge
    executeGitCommand(['merge', '--abort']);
  }
  
  // If we couldn't test the merge directly, look for file overlap
  if (conflicts.length === 0) {
    // Get recently changed files in the base branch
    const baseChanges = executeGitCommand(['log', '-n', '10', '--name-only', '--pretty=format:', baseBranch]);
    
    if (baseChanges.success) {
      const baseFiles = new Set(baseChanges.stdout.split('\n').filter(Boolean));
      
      // Check for overlap with PR files
      if (pr.files) {
        const overlapFiles = pr.files
          .filter(file => baseFiles.has(file.path))
          .map(file => file.path);
        
        if (overlapFiles.length > 0) {
          conflicts.push(...overlapFiles);
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Detect changes to setup files that might affect project configuration
 */
function detectSetupFileChanges(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const setupFilePatterns = [
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'tsconfig.json',
    'next.config',
    '.eslintrc',
    '.babelrc',
    '.env.example',
    'docker'
  ];
  
  return pr.files
    .filter(file => setupFilePatterns.some(pattern => file.path.includes(pattern)))
    .map(file => file.path);
}

/**
 * Detect potential breaking API changes
 */
function detectAPIBreakingChanges(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const apiChanges: string[] = [];
  
  // API endpoint files
  const apiFiles = pr.files.filter(file => 
    (file.path.includes('/api/') || file.path.includes('services/')) && 
    (file.path.endsWith('.ts') || file.path.endsWith('.js'))
  );
  
  // Check each API file for breaking changes
  apiFiles.forEach(file => {
    if (!file.patch) return;
    
    // Look for parameter removals or changes in function signatures
    if (
      file.patch.includes('-export') || 
      file.patch.includes('-async function') || 
      file.patch.includes('-function') || 
      file.patch.includes('-interface') || 
      file.patch.includes('-type ')
    ) {
      apiChanges.push(file.path);
      return;
    }
    
    // Look for response structure changes
    if (
      file.patch.includes('-return {') || 
      file.patch.includes('-res.json({') || 
      file.patch.includes('-res.status(')
    ) {
      apiChanges.push(file.path);
      return;
    }
  });
  
  return apiChanges;
}

/**
 * Detect database schema changes that might require migrations
 */
function detectDatabaseSchemaChanges(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const schemaChanges: string[] = [];
  
  // Database-related files
  const dbFiles = pr.files.filter(file => 
    file.path.includes('schema') || 
    file.path.includes('migration') || 
    file.path.includes('database') || 
    file.path.includes('model') || 
    file.path.includes('collection')
  );
  
  // Check each DB file for schema changes
  dbFiles.forEach(file => {
    if (!file.patch) return;
    
    // Look for schema modifications
    if (
      file.patch.includes('createCollection') || 
      file.patch.includes('createDatabase') || 
      file.patch.includes('createAttribute') || 
      file.patch.includes('updateCollection') || 
      file.patch.includes('addField') || 
      file.patch.includes('removeField') || 
      file.patch.includes('alterTable') || 
      file.patch.includes('createTable')
    ) {
      schemaChanges.push(file.path);
    }
  });
  
  return schemaChanges;
}

/**
 * Calculate the overall risk level based on the analysis
 */
function calculateOverallRisk(pr: PullRequest): 'Low' | 'Medium' | 'High' {
  if (!pr.files) return 'Low';
  
  // Count critical factors
  let criticalFactors = 0;
  
  // Critical file changes
  const criticalFiles = detectCriticalFileChanges(pr);
  if (criticalFiles.length > 0) {
    criticalFactors++;
  }
  
  // Setup file changes
  const setupFiles = detectSetupFileChanges(pr);
  if (setupFiles.length > 0) {
    criticalFactors++;
  }
  
  // API breaking changes
  const apiChanges = detectAPIBreakingChanges(pr);
  if (apiChanges.length > 0) {
    criticalFactors += 2; // Higher weight for API changes
  }
  
  // Database schema changes
  const schemaChanges = detectDatabaseSchemaChanges(pr);
  if (schemaChanges.length > 0) {
    criticalFactors += 2; // Higher weight for schema changes
  }
  
  // PR size is also a risk factor
  const totalChanges = pr.files.reduce((sum, file) => sum + file.changes, 0);
  
  // Determine risk level based on factors and size
  if (criticalFactors >= 3 || totalChanges > 500) {
    return 'High';
  } else if (criticalFactors >= 1 || totalChanges > 200) {
    return 'Medium';
  } else {
    return 'Low';
  }
} 