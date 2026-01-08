/**
 * PR Consolidation Map
 * 
 * This module implements the PR Consolidation Map strategy, which analyzes
 * dependencies between PRs and identifies integration points for complex PR sets.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const MIN_INTEGRATION_POINT_SIZE = parseInt(process.env.MIN_INTEGRATION_POINT_SIZE || '2', 10);
const MAX_INTEGRATION_POINT_SIZE = parseInt(process.env.MAX_INTEGRATION_POINT_SIZE || '5', 10);
const MAP_OUTPUT_FORMAT = process.env.MAP_OUTPUT_FORMAT || 'mermaid';

// Types
export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  author: {
    login: string;
    name?: string;
  };
  baseRefName: string;
  headRefName: string;
  createdAt: string;
  updatedAt: string;
  files?: PullRequestFile[];
  labels?: {name: string}[];
  commits?: {
    message: string;
    id: string;
  }[];
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PRDependency {
  fromPR: number;
  toPR: number;
  dependencyType: 'builds-on' | 'depends-on' | 'conflicts-with';
  files: string[];
  confidence: number;
  reason: string;
}

export interface IntegrationPoint {
  id: string;
  prs: number[];
  requiredBefore: string[];
  description: string;
  testRequirements: string[];
}

export interface ConsolidationMap {
  integrationPoints: IntegrationPoint[];
  dependencies: PRDependency[];
  finalPR: number | null;
  visualMap: string;
  implementationPlan: string;
}

/**
 * Primary function to create a PR Consolidation Map for a set of PRs
 */
export function createConsolidationMap(prs: PullRequest[]): ConsolidationMap {
  // Sort PRs by creation date (oldest first)
  const sortedPRs = [...prs].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  // Detect dependencies between PRs
  const dependencies = detectDependencies(sortedPRs);
  
  // Identify integration points
  const integrationPoints = identifyIntegrationPoints(sortedPRs, dependencies);
  
  // Determine final PR (newest PR or null if none suitable)
  const finalPR = sortedPRs.length > 0 ? sortedPRs[sortedPRs.length - 1].number : null;
  
  // Generate visual map
  const visualMap = generateVisualMap(sortedPRs, dependencies, integrationPoints, finalPR);
  
  // Generate implementation plan
  const implementationPlan = generateImplementationPlan(sortedPRs, integrationPoints, finalPR);
  
  return {
    integrationPoints,
    dependencies,
    finalPR,
    visualMap,
    implementationPlan
  };
}

/**
 * Detects dependencies between PRs based on various factors
 */
export function detectDependencies(prs: PullRequest[]): PRDependency[] {
  const dependencies: PRDependency[] = [];
  
  // Helper to add a dependency if it doesn't exist
  const addDependency = (
    fromPR: number,
    toPR: number,
    dependencyType: 'builds-on' | 'depends-on' | 'conflicts-with',
    files: string[],
    confidence: number,
    reason: string
  ) => {
    // Don't add self-dependencies
    if (fromPR === toPR) return;
    
    // Check if dependency already exists
    const existingDep = dependencies.find(d => 
      d.fromPR === fromPR && d.toPR === toPR && d.dependencyType === dependencyType
    );
    
    if (existingDep) {
      // Update existing dependency if new one has higher confidence
      if (confidence > existingDep.confidence) {
        existingDep.confidence = confidence;
        existingDep.reason = reason;
      }
      
      // Add any new files
      for (const file of files) {
        if (!existingDep.files.includes(file)) {
          existingDep.files.push(file);
        }
      }
    } else {
      // Add new dependency
      dependencies.push({
        fromPR,
        toPR,
        dependencyType,
        files,
        confidence,
        reason
      });
    }
  };
  
  // 1. Detect dependencies based on file modifications
  const fileModifications = new Map<string, {pr: number, timestamp: number}[]>();
  
  // Build map of file modifications
  for (const pr of prs) {
    const timestamp = new Date(pr.createdAt).getTime();
    const files = pr.files || [];
    
    for (const file of files) {
      const filename = file.filename;
      if (!fileModifications.has(filename)) {
        fileModifications.set(filename, []);
      }
      
      fileModifications.get(filename)!.push({
        pr: pr.number,
        timestamp
      });
    }
  }
  
  // Find sequential modifications to the same files
  for (const [filename, modifications] of fileModifications.entries()) {
    // Sort by timestamp
    modifications.sort((a, b) => a.timestamp - b.timestamp);
    
    // Check for sequential modifications
    for (let i = 0; i < modifications.length - 1; i++) {
      const current = modifications[i];
      const next = modifications[i + 1];
      
      // Add builds-on dependency if modifications are sequential
      addDependency(
        next.pr,
        current.pr,
        'builds-on',
        [filename],
        0.7,
        `Sequential modification to ${filename}`
      );
    }
  }
  
  // 2. Detect dependencies based on commit messages
  for (const pr of prs) {
    const commits = pr.commits || [];
    
    for (const commit of commits) {
      const message = commit.message;
      
      // Look for references to other PRs in commit messages
      const prRefs = message.match(/#(\d+)/g);
      if (prRefs) {
        for (const ref of prRefs) {
          const referencedPR = parseInt(ref.substring(1), 10);
          
          // Check if referenced PR exists in our set
          if (prs.some(p => p.number === referencedPR)) {
            addDependency(
              pr.number,
              referencedPR,
              'depends-on',
              [],
              0.9,
              `Commit message references PR #${referencedPR}`
            );
          }
        }
      }
    }
  }
  
  // 3. Detect dependencies based on PR body references
  for (const pr of prs) {
    if (pr.body) {
      // Look for references to other PRs in PR body
      const prRefs = pr.body.match(/#(\d+)/g);
      if (prRefs) {
        for (const ref of prRefs) {
          const referencedPR = parseInt(ref.substring(1), 10);
          
          // Check if referenced PR exists in our set
          if (prs.some(p => p.number === referencedPR)) {
            addDependency(
              pr.number,
              referencedPR,
              'depends-on',
              [],
              0.8,
              `PR description references PR #${referencedPR}`
            );
          }
        }
      }
    }
  }
  
  // 4. Detect dependencies based on branch names
  for (const pr of prs) {
    const headBranch = pr.headRefName;
    
    for (const otherPR of prs) {
      if (pr.number === otherPR.number) continue;
      
      const otherHeadBranch = otherPR.headRefName;
      
      // Check for branch name patterns that suggest dependencies
      if (headBranch.includes(otherHeadBranch) || 
          headBranch.includes(otherPR.number.toString())) {
        addDependency(
          pr.number,
          otherPR.number,
          'builds-on',
          [],
          0.6,
          `Branch name suggests dependency`
        );
      }
    }
  }
  
  // 5. Detect potential conflicts
  for (const pr1 of prs) {
    const files1 = pr1.files || [];
    
    for (const pr2 of prs) {
      if (pr1.number === pr2.number) continue;
      
      const files2 = pr2.files || [];
      const overlappingFiles: string[] = [];
      
      // Find overlapping files
      for (const file1 of files1) {
        if (files2.some(f => f.filename === file1.filename)) {
          overlappingFiles.push(file1.filename);
        }
      }
      
      // If there are overlapping files, there might be conflicts
      if (overlappingFiles.length > 0) {
        addDependency(
          pr1.number,
          pr2.number,
          'conflicts-with',
          overlappingFiles,
          0.5,
          `Modified same files: ${overlappingFiles.slice(0, 3).join(', ')}${overlappingFiles.length > 3 ? ', ...' : ''}`
        );
      }
    }
  }
  
  return dependencies;
}

/**
 * Identifies logical integration points based on PR dependencies
 */
export function identifyIntegrationPoints(
  prs: PullRequest[],
  dependencies: PRDependency[]
): IntegrationPoint[] {
  // Create a dependency graph
  const graph: Record<number, number[]> = {};
  
  // Initialize graph with all PRs
  for (const pr of prs) {
    graph[pr.number] = [];
  }
  
  // Add edges for 'builds-on' and 'depends-on' dependencies
  for (const dep of dependencies) {
    if (dep.dependencyType === 'builds-on' || dep.dependencyType === 'depends-on') {
      if (!graph[dep.fromPR].includes(dep.toPR)) {
        graph[dep.fromPR].push(dep.toPR);
      }
    }
  }
  
  // Group PRs into integration points
  const integrationPoints: IntegrationPoint[] = [];
  const assignedPRs = new Set<number>();
  
  // First pass: Create integration points from strongly connected PRs
  for (const pr of prs) {
    if (assignedPRs.has(pr.number)) continue;
    
    // Find PRs that have strong dependencies with this PR
    const connectedPRs = findConnectedPRs(pr.number, graph, dependencies);
    
    // Skip single PR clusters for now
    if (connectedPRs.length <= 1) continue;
    
    // Limit integration points to a reasonable size
    const prsToInclude = connectedPRs.slice(0, MAX_INTEGRATION_POINT_SIZE);
    
    // Create an integration point
    const integrationPoint: IntegrationPoint = {
      id: `integration-point-${integrationPoints.length + 1}`,
      prs: prsToInclude,
      requiredBefore: [],
      description: generateIntegrationPointDescription(prsToInclude, prs),
      testRequirements: determineTestRequirements(prsToInclude, prs)
    };
    
    integrationPoints.push(integrationPoint);
    
    // Mark these PRs as assigned
    for (const prNum of prsToInclude) {
      assignedPRs.add(prNum);
    }
  }
  
  // Second pass: Handle remaining PRs
  const remainingPRs = prs.filter(pr => !assignedPRs.has(pr.number))
    .map(pr => pr.number);
  
  // Group remaining PRs into integration points of reasonable size
  for (let i = 0; i < remainingPRs.length; i += MAX_INTEGRATION_POINT_SIZE) {
    const prsToInclude = remainingPRs.slice(i, i + MAX_INTEGRATION_POINT_SIZE);
    
    // Skip if below minimum size (these will be added to final PR)
    if (prsToInclude.length < MIN_INTEGRATION_POINT_SIZE) continue;
    
    // Create an integration point
    const integrationPoint: IntegrationPoint = {
      id: `integration-point-${integrationPoints.length + 1}`,
      prs: prsToInclude,
      requiredBefore: [],
      description: generateIntegrationPointDescription(prsToInclude, prs),
      testRequirements: determineTestRequirements(prsToInclude, prs)
    };
    
    integrationPoints.push(integrationPoint);
    
    // Mark these PRs as assigned
    for (const prNum of prsToInclude) {
      assignedPRs.add(prNum);
    }
  }
  
  // Third pass: Add dependencies between integration points
  for (let i = 0; i < integrationPoints.length; i++) {
    for (let j = 0; j < integrationPoints.length; j++) {
      if (i === j) continue;
      
      const pointA = integrationPoints[i];
      const pointB = integrationPoints[j];
      
      // Check if any PR in pointA depends on any PR in pointB
      const hasDependency = pointA.prs.some(prA => 
        pointB.prs.some(prB => 
          dependencies.some(dep => 
            (dep.fromPR === prA && dep.toPR === prB) &&
            (dep.dependencyType === 'builds-on' || dep.dependencyType === 'depends-on')
          )
        )
      );
      
      if (hasDependency && !pointA.requiredBefore.includes(pointB.id)) {
        pointA.requiredBefore.push(pointB.id);
      }
    }
  }
  
  // Find unassigned PRs
  const unassignedPRs = prs.filter(pr => !assignedPRs.has(pr.number))
    .map(pr => pr.number);
  
  // If there are unassigned PRs, create a final integration point
  if (unassignedPRs.length > 0) {
    const integrationPoint: IntegrationPoint = {
      id: `integration-point-${integrationPoints.length + 1}`,
      prs: unassignedPRs,
      requiredBefore: [],
      description: 'Final integration point for remaining PRs',
      testRequirements: determineTestRequirements(unassignedPRs, prs)
    };
    
    integrationPoints.push(integrationPoint);
  }
  
  // Sort integration points based on dependencies
  return topologicalSort(integrationPoints);
}

/**
 * Finds PRs that are strongly connected to the given PR
 */
function findConnectedPRs(
  prNumber: number,
  graph: Record<number, number[]>,
  dependencies: PRDependency[]
): number[] {
  const result = new Set<number>([prNumber]);
  const queue: number[] = [prNumber];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Find PRs that have a strong dependency relationship with current
    for (const dep of dependencies) {
      if ((dep.fromPR === current || dep.toPR === current) && 
          (dep.dependencyType === 'builds-on' || dep.dependencyType === 'depends-on') && 
          dep.confidence >= 0.7) {
        
        const other = dep.fromPR === current ? dep.toPR : dep.fromPR;
        
        if (!result.has(other)) {
          result.add(other);
          queue.push(other);
        }
      }
    }
  }
  
  return Array.from(result);
}

/**
 * Generates a description for an integration point based on its PRs
 */
function generateIntegrationPointDescription(prNumbers: number[], allPRs: PullRequest[]): string {
  // Map PR numbers to titles
  const prMap = new Map<number, string>();
  for (const pr of allPRs) {
    prMap.set(pr.number, pr.title);
  }
  
  // Collect keywords from PR titles
  const keywords = new Set<string>();
  for (const prNum of prNumbers) {
    const title = prMap.get(prNum) || '';
    
    // Extract key terms from the title
    const terms = title.split(/[ :]/g)
      .filter(t => t.length > 3)
      .map(t => t.toLowerCase());
    
    for (const term of terms) {
      keywords.add(term);
    }
  }
  
  // Find most common keywords
  const keywordCounts = Array.from(keywords).map(keyword => {
    let count = 0;
    for (const prNum of prNumbers) {
      const title = prMap.get(prNum) || '';
      if (title.toLowerCase().includes(keyword)) {
        count++;
      }
    }
    return { keyword, count };
  });
  
  // Sort by count descending
  keywordCounts.sort((a, b) => b.count - a.count);
  
  // Take top 3 keywords
  const topKeywords = keywordCounts.slice(0, 3).map(k => k.keyword);
  
  // Generate description
  if (topKeywords.length > 0) {
    return `Integration point for ${topKeywords.join(', ')} changes`;
  } else {
    return `Integration point ${prNumbers.join(', ')}`;
  }
}

/**
 * Determines test requirements for an integration point
 */
function determineTestRequirements(prNumbers: number[], allPRs: PullRequest[]): string[] {
  const requirements = new Set<string>();
  
  // Get all files changed by these PRs
  const files = new Set<string>();
  for (const pr of allPRs) {
    if (prNumbers.includes(pr.number)) {
      for (const file of (pr.files || [])) {
        files.add(file.filename);
      }
    }
  }
  
  // Check for specific types of files
  if (Array.from(files).some(f => f.includes('/api/'))) {
    requirements.add('api');
  }
  
  if (Array.from(files).some(f => f.includes('/components/'))) {
    requirements.add('ui');
  }
  
  if (Array.from(files).some(f => f.includes('/services/'))) {
    requirements.add('service');
  }
  
  if (Array.from(files).some(f => f.includes('/auth/'))) {
    requirements.add('auth');
  }
  
  if (Array.from(files).some(f => f.includes('/test/'))) {
    requirements.add('test');
  }
  
  if (files.size > 10) {
    requirements.add('integration');
  }
  
  return Array.from(requirements);
}

/**
 * Topologically sorts integration points based on their dependencies
 */
function topologicalSort(integrationPoints: IntegrationPoint[]): IntegrationPoint[] {
  // Create a graph representing dependencies
  const graph: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  
  // Initialize graph with all integration points
  for (const point of integrationPoints) {
    graph[point.id] = [];
    inDegree[point.id] = 0;
  }
  
  // Add edges based on requiredBefore
  for (const point of integrationPoints) {
    for (const requiredId of point.requiredBefore) {
      if (graph[point.id]) {
        graph[point.id].push(requiredId);
        inDegree[requiredId] = (inDegree[requiredId] || 0) + 1;
      }
    }
  }
  
  // Find all sources (nodes with in-degree 0)
  const queue: string[] = [];
  for (const point of integrationPoints) {
    if (inDegree[point.id] === 0) {
      queue.push(point.id);
    }
  }
  
  // Process nodes in topological order
  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    
    // For each neighbor, reduce in-degree by 1
    for (const neighbor of graph[current]) {
      inDegree[neighbor]--;
      
      // If in-degree becomes 0, add to queue
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  // If sorted doesn't include all points, there's a cycle
  if (sorted.length !== integrationPoints.length) {
    // Handle cycle by using original order
    console.warn('Cycle detected in integration point dependencies');
    return integrationPoints;
  }
  
  // Reorder integration points based on topological sort
  const result: IntegrationPoint[] = [];
  for (const id of sorted) {
    const point = integrationPoints.find(p => p.id === id);
    if (point) {
      result.push(point);
    }
  }
  
  return result;
}

/**
 * Generates a visual representation of the consolidation map
 */
export function generateVisualMap(
  prs: PullRequest[],
  dependencies: PRDependency[],
  integrationPoints: IntegrationPoint[],
  finalPR: number | null
): string {
  switch (MAP_OUTPUT_FORMAT) {
    case 'mermaid':
      return generateMermaidDiagram(prs, dependencies, integrationPoints, finalPR);
    default:
      return generateMermaidDiagram(prs, dependencies, integrationPoints, finalPR);
  }
}

/**
 * Generates a Mermaid diagram representing the consolidation map
 */
function generateMermaidDiagram(
  prs: PullRequest[],
  dependencies: PRDependency[],
  integrationPoints: IntegrationPoint[],
  finalPR: number | null
): string {
  // Map PR numbers to short titles for display
  const prTitles = new Map<number, string>();
  for (const pr of prs) {
    const shortTitle = pr.title.length > 30 
      ? pr.title.substring(0, 27) + '...'
      : pr.title;
    prTitles.set(pr.number, shortTitle);
  }
  
  let diagram = '```mermaid\ngraph TD\n';
  
  // Add nodes for PRs
  for (const pr of prs) {
    diagram += `    PR${pr.number}[PR #${pr.number}: ${prTitles.get(pr.number)}]\n`;
  }
  
  // Add nodes for integration points
  for (const point of integrationPoints) {
    diagram += `    ${point.id}[${point.description}]\n`;
  }
  
  // Add node for final PR if it exists
  if (finalPR !== null) {
    diagram += `    Final[Final Consolidated PR]\n`;
  }
  
  // Add edges from PRs to integration points
  for (const point of integrationPoints) {
    for (const prNum of point.prs) {
      diagram += `    PR${prNum} --> ${point.id}\n`;
    }
  }
  
  // Add edges between integration points
  for (const point of integrationPoints) {
    for (const requiredId of point.requiredBefore) {
      diagram += `    ${point.id} --> ${requiredId}\n`;
    }
  }
  
  // Add edges from integration points to final PR
  if (finalPR !== null) {
    for (const point of integrationPoints) {
      diagram += `    ${point.id} --> Final\n`;
    }
  }
  
  // Add styling classes
  diagram += '\n    classDef pr fill:#ddf,stroke:#333,stroke-width:1px;\n';
  diagram += '    classDef integration fill:#ffd,stroke:#333,stroke-width:2px;\n';
  diagram += '    classDef final fill:#dfd,stroke:#333,stroke-width:3px;\n\n';
  
  // Apply classes
  for (const pr of prs) {
    diagram += `    class PR${pr.number} pr\n`;
  }
  
  for (const point of integrationPoints) {
    diagram += `    class ${point.id} integration\n`;
  }
  
  if (finalPR !== null) {
    diagram += `    class Final final\n`;
  }
  
  diagram += '```';
  
  return diagram;
}

/**
 * Generates an implementation plan for the consolidation map
 */
export function generateImplementationPlan(
  prs: PullRequest[],
  integrationPoints: IntegrationPoint[],
  finalPR: number | null
): string {
  let plan = '# Implementation Plan for PR Consolidation\n\n';
  
  // Add steps for each integration point
  for (let i = 0; i < integrationPoints.length; i++) {
    const point = integrationPoints[i];
    
    plan += `## ${point.description}\n\n`;
    
    // First integration point starts from the base branch
    if (i === 0) {
      // Get oldest PR in this integration point
      const prNumbers = [...point.prs].sort((a, b) => {
        const prA = prs.find(p => p.number === a);
        const prB = prs.find(p => p.number === b);
        return new Date(prA?.createdAt || '').getTime() - new Date(prB?.createdAt || '').getTime();
      });
      
      const basePR = prNumbers[0];
      plan += `1. Start with PR #${basePR} as base\n`;
      
      // Add remaining PRs
      for (let j = 1; j < prNumbers.length; j++) {
        plan += `2. Add changes from PR #${prNumbers[j]}\n`;
      }
    } 
    // Subsequent integration points start from the previous integration point
    else {
      const prevPoint = integrationPoints[i - 1];
      plan += `1. Start with branch \`${prevPoint.id}\`\n`;
      
      // Add all PRs in this integration point
      for (let j = 0; j < point.prs.length; j++) {
        plan += `${j + 2}. Add changes from PR #${point.prs[j]}\n`;
      }
    }
    
    // Add tests based on requirements
    if (point.testRequirements.length > 0) {
      const testRequirements = point.testRequirements.join(', ');
      plan += `${point.prs.length + 2}. Run ${testRequirements} tests\n`;
    }
    
    // Create integration branch
    plan += `${point.prs.length + 3}. Create integration branch \`${point.id}\`\n\n`;
  }
  
  // Add final consolidation step if there's a final PR
  if (finalPR !== null) {
    plan += '## Final Consolidation\n\n';
    
    // Start from the last integration point
    if (integrationPoints.length > 0) {
      const lastPoint = integrationPoints[integrationPoints.length - 1];
      plan += `1. Start with branch \`${lastPoint.id}\`\n`;
      plan += `2. Add remaining changes from PR #${finalPR}\n`;
    } else {
      plan += `1. Start with PR #${finalPR}\n`;
    }
    
    // Add final steps
    plan += '3. Run full test suite\n';
    plan += '4. Update documentation\n';
    plan += '5. Create final PR with comprehensive description\n';
  }
  
  return plan;
}

// Export default functions
export default {
  createConsolidationMap,
  detectDependencies,
  identifyIntegrationPoints,
  generateVisualMap,
  generateImplementationPlan
}; 