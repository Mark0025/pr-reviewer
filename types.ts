/**
 * Shared Type Definitions for PR Reviewer Tools
 * 
 * Central repository for all type definitions used across PR tools
 */

// Base Pull Request Type
export interface PullRequest {
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
  labels?: {name: string}[];
  linkedIssues?: number[];
}

// Pull Request File Type
export interface PullRequestFile {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  patch?: string;
}

// Main Branch Analysis
export interface MainBranchAnalysis {
  criticalFileChanges: string[];
  potentialMergeConflicts: string[];
  setupFileChanges: string[];
  apiBreakingChanges: string[];
  databaseSchemaChanges: string[];
  overallRisk: 'Low' | 'Medium' | 'High';
}

// Race Condition Analysis
export interface RaceConditionAnalysis {
  formSubmissionIssues: string[];
  stateManagementIssues: string[];
  asyncOperationIssues: string[];
  databaseTransactionIssues: string[];
  overallRisk: 'Low' | 'Medium' | 'High';
}

// Dependency Analysis
export interface DependencyAnalysis {
  packageJsonChanges: string[];
  versionConflicts: string[];
  duplicateLibraries: string[];
  missingPeerDependencies: string[];
  overallRisk: 'Low' | 'Medium' | 'High';
}

// File Analysis
export interface FileAnalysis {
  criticalFiles: string[];
  setupFiles: string[];
  formComponents: string[];
  apiEndpoints: string[];
  databaseOperations: string[];
  testFiles: string[];
}

// PR Auto Review Result
export interface PRAutoReviewResult {
  prNumber: number;
  title: string;
  readyForReview: boolean;
  mainBranchAnalysis: MainBranchAnalysis;
  raceConditionAnalysis: RaceConditionAnalysis;
  dependencyAnalysis: DependencyAnalysis;
  recommendedReviewers: string[];
  mergeRecommendation: 'Approve' | 'Request Changes' | 'Needs Discussion';
  actionItems: string[];
}

// PR Diff Analysis
export interface PRDiffAnalysis {
  prNumber: number;
  uniqueFiles: string[];
  changedFiles: string[];
  commonFiles: string[];
  diffPatterns: Record<string, string[]>;
  riskLevel: 'Low' | 'Medium' | 'High';
  conflicts: string[];
}

// Consolidation Recommendation
export interface ConsolidationRecommendation {
  recommendedPR: number | null;
  otherPRs: number[];
  strategy: 'keep-latest' | 'keep-oldest' | 'create-new' | 'manual-review';
  justification: string;
  risks: string[];
  steps: string[];
}

// PR Analysis
export interface PrAnalysis {
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

// Project Configuration
export interface ProjectConfig {
  criticalDirectories: string[];
  testRequired: string[];
  automergePatterns: string[];
}

// Shared output directory configuration
export interface OutputConfig {
  dirPath: string;
  timestampFormat: string;
} 