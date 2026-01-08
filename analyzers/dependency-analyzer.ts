/**
 * Dependency Analyzer
 * 
 * Checks for dependency conflicts in setup files like package.json
 */

import { 
  PullRequest, 
  DependencyAnalysis 
} from '../types';
import { 
  createOctokit, 
  getPRDetails 
} from '../utils';

/**
 * Analyze a PR for dependency conflicts
 */
export async function checkDependencyConflicts(prNumber: number): Promise<DependencyAnalysis> {
  console.log(`Checking dependency conflicts for PR #${prNumber}...`);
  
  // Get PR details
  const octokit = createOctokit();
  const pr = await getPRDetails(octokit, prNumber);
  
  if (!pr) {
    throw new Error(`Could not fetch PR #${prNumber}`);
  }
  
  // Analyze dependencies
  return {
    packageJsonChanges: analyzePackageJsonChanges(pr),
    versionConflicts: detectVersionConflicts(pr),
    duplicateLibraries: findDuplicateLibraries(pr),
    missingPeerDependencies: checkMissingPeerDependencies(pr),
    overallRisk: calculateDependencyRisk(pr)
  };
}

/**
 * Analyze changes to package.json files
 */
function analyzePackageJsonChanges(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const packageChanges: string[] = [];
  
  // Find package.json files
  const packageFiles = pr.files.filter(file => 
    file.path.endsWith('package.json')
  );
  
  // Analyze each package.json file
  packageFiles.forEach(file => {
    if (!file.patch) return;
    
    // Check for dependency additions
    const addedDeps = extractAddedDependencies(file.patch);
    if (addedDeps.length > 0) {
      packageChanges.push(`${file.path}: Added dependencies: ${addedDeps.join(', ')}`);
    }
    
    // Check for dependency removals
    const removedDeps = extractRemovedDependencies(file.patch);
    if (removedDeps.length > 0) {
      packageChanges.push(`${file.path}: Removed dependencies: ${removedDeps.join(', ')}`);
    }
    
    // Check for version changes
    const versionChanges = extractVersionChanges(file.patch);
    if (versionChanges.length > 0) {
      packageChanges.push(`${file.path}: Changed versions: ${versionChanges.join(', ')}`);
    }
    
    // Check for script changes
    if (file.patch.includes('"scripts"')) {
      packageChanges.push(`${file.path}: Modified npm scripts`);
    }
  });
  
  return packageChanges;
}

/**
 * Extract added dependencies from the patch
 */
function extractAddedDependencies(patch: string): string[] {
  const added: string[] = [];
  
  // Pattern to match added dependencies
  const addedPattern = /^\+\s*"([^"]+)":\s*"([^"]+)"/gm;
  let match;
  
  // Find all added dependencies
  while ((match = addedPattern.exec(patch)) !== null) {
    added.push(`${match[1]}@${match[2]}`);
  }
  
  return added;
}

/**
 * Extract removed dependencies from the patch
 */
function extractRemovedDependencies(patch: string): string[] {
  const removed: string[] = [];
  
  // Pattern to match removed dependencies
  const removedPattern = /^-\s*"([^"]+)":\s*"([^"]+)"/gm;
  let match;
  
  // Find all removed dependencies
  while ((match = removedPattern.exec(patch)) !== null) {
    removed.push(`${match[1]}@${match[2]}`);
  }
  
  return removed;
}

/**
 * Extract version changes from the patch
 */
function extractVersionChanges(patch: string): string[] {
  const changes: string[] = [];
  
  // Look for lines with both a - and + for the same dependency
  const lines = patch.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1];
    
    // Check if we have a removed dependency followed by added with same name
    if (currentLine.startsWith('-') && nextLine.startsWith('+')) {
      const removedMatch = /^-\s*"([^"]+)":\s*"([^"]+)"/.exec(currentLine);
      const addedMatch = /^\+\s*"([^"]+)":\s*"([^"]+)"/.exec(nextLine);
      
      if (removedMatch && addedMatch && removedMatch[1] === addedMatch[1]) {
        changes.push(`${addedMatch[1]}: ${removedMatch[2]} → ${addedMatch[2]}`);
      }
    }
  }
  
  return changes;
}

/**
 * Detect version conflicts between dependencies
 */
function detectVersionConflicts(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const conflicts: string[] = [];
  const packageDeps = new Map<string, string[]>();
  
  // Find package.json files
  const packageFiles = pr.files.filter(file => 
    file.path.endsWith('package.json')
  );
  
  // Nothing to check if no package files
  if (packageFiles.length === 0) {
    return conflicts;
  }
  
  // Extract dependencies from each package.json
  packageFiles.forEach(file => {
    if (!file.patch) return;
    
    // Extract all dependencies (both original and modified)
    const depPattern = /[+-]\s*"([^"]+)":\s*"([^"]+)"/gm;
    let match;
    
    while ((match = depPattern.exec(file.patch)) !== null) {
      const depName = match[1];
      const version = match[2];
      
      if (!packageDeps.has(depName)) {
        packageDeps.set(depName, []);
      }
      
      packageDeps.get(depName)?.push(version);
    }
  });
  
  // Check for version conflicts
  packageDeps.forEach((versions, depName) => {
    // Remove duplicates
    const uniqueVersions = [...new Set(versions)];
    
    // If more than one version, we have a conflict
    if (uniqueVersions.length > 1) {
      conflicts.push(`${depName}: Multiple versions specified (${uniqueVersions.join(', ')})`);
    }
  });
  
  return conflicts;
}

/**
 * Find duplicate libraries that provide similar functionality
 */
function findDuplicateLibraries(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const duplicates: string[] = [];
  const packageGroups = [
    // UI libraries
    ['react', 'preact', 'inferno'],
    // State management
    ['redux', 'mobx', 'zustand', 'recoil', 'jotai'],
    // CSS-in-JS
    ['styled-components', 'emotion', '@stitches', 'styled-jsx'],
    // HTTP clients
    ['axios', 'fetch', 'superagent', 'got', 'request'],
    // Form libraries
    ['formik', 'react-hook-form', 'redux-form', 'final-form'],
    // Routing
    ['react-router', 'next/router', '@tanstack/router'],
    // Testing
    ['jest', 'mocha', 'vitest', 'ava'],
    // Date handling
    ['moment', 'date-fns', 'dayjs', 'luxon']
  ];
  
  // Find package.json files
  const packageFiles = pr.files.filter(file => 
    file.path.endsWith('package.json')
  );
  
  if (packageFiles.length === 0) {
    return duplicates;
  }
  
  // Extract dependencies from all package.json files
  const allDeps = new Set<string>();
  
  packageFiles.forEach(file => {
    if (!file.patch) return;
    
    // Extract all dependencies
    const depPattern = /[+-]\s*"([^"]+)":\s*"([^"]+)"/gm;
    let match;
    
    while ((match = depPattern.exec(file.patch)) !== null) {
      allDeps.add(match[1]);
    }
  });
  
  // Check each group for duplicates
  packageGroups.forEach(group => {
    const foundInGroup = group.filter(lib => {
      // Check for exact match or starting with
      return [...allDeps].some(dep => dep === lib || dep.startsWith(`${lib}/`));
    });
    
    if (foundInGroup.length > 1) {
      duplicates.push(`Duplicate libraries: ${foundInGroup.join(', ')}`);
    }
  });
  
  return duplicates;
}

/**
 * Check for missing peer dependencies
 */
function checkMissingPeerDependencies(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const missing: string[] = [];
  const knownPeerDeps = new Map<string, string[]>([
    ['@emotion/react', ['@emotion/styled']],
    ['react-redux', ['redux']],
    ['@mui/material', ['@emotion/react', '@emotion/styled']],
    ['react-router-dom', ['react-router']],
    ['@typescript-eslint/eslint-plugin', ['@typescript-eslint/parser']],
    ['styled-components', ['react']],
    ['next', ['react', 'react-dom']],
    ['eslint-config-next', ['eslint']],
    ['@tanstack/react-query', ['react']],
    ['formik', ['react']]
  ]);
  
  // Find package.json files
  const packageFiles = pr.files.filter(file => 
    file.path.endsWith('package.json')
  );
  
  if (packageFiles.length === 0) {
    return missing;
  }
  
  // Extract added dependencies
  const addedDeps = new Set<string>();
  
  packageFiles.forEach(file => {
    if (!file.patch) return;
    
    // Extract added dependencies
    const depPattern = /\+\s*"([^"]+)":\s*"([^"]+)"/gm;
    let match;
    
    while ((match = depPattern.exec(file.patch)) !== null) {
      addedDeps.add(match[1]);
    }
  });
  
  // Check for missing peer dependencies
  addedDeps.forEach(dep => {
    if (knownPeerDeps.has(dep)) {
      const peers = knownPeerDeps.get(dep) || [];
      
      peers.forEach(peer => {
        if (!addedDeps.has(peer)) {
          missing.push(`${dep} requires peer dependency ${peer}`);
        }
      });
    }
  });
  
  return missing;
}

/**
 * Calculate overall dependency risk
 */
function calculateDependencyRisk(pr: PullRequest): 'Low' | 'Medium' | 'High' {
  if (!pr.files) return 'Low';
  
  const packageChanges = analyzePackageJsonChanges(pr);
  const versionConflicts = detectVersionConflicts(pr);
  const duplicateLibraries = findDuplicateLibraries(pr);
  const missingPeerDeps = checkMissingPeerDependencies(pr);
  
  // Critical issues
  if (versionConflicts.length > 0 || missingPeerDeps.length > 0) {
    return 'High';
  }
  
  // Moderate issues
  if (duplicateLibraries.length > 0 || packageChanges.length > 3) {
    return 'Medium';
  }
  
  // Minor or no issues
  return 'Low';
} 