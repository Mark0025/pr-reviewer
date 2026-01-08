/**
 * PR Consolidation Strategy Selector
 * 
 * This module determines the most appropriate consolidation strategy
 * for a given set of pull requests based on analysis factors.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Types
export type ConsolidationStrategy = 'keep-latest' | 'rolling-up' | 'consolidation-map';

export interface PRAnalysisFactors {
  prCount: number;               // Number of PRs to consolidate
  filesChanged: number;          // Total unique files changed
  criticalPathChanges: boolean;  // Changes to critical system paths
  testRequirements: string[];    // Types of tests needed
  changeComplexity: 'Low' | 'Medium' | 'High'; // Complexity assessment
  developerCount: number;        // Distinct PR authors
  timeSpan: number;              // Days between first and last PR
  conflictProbability: number;   // Estimated merge conflict probability
}

export interface StrategyRecommendation {
  recommendedStrategy: ConsolidationStrategy;
  confidence: number; // 0-100
  reasoning: string[];
  alternativeStrategies: Array<{
    strategy: ConsolidationStrategy;
    score: number;
    pros: string[];
    cons: string[];
  }>;
}

// Configuration from environment
const PR_COMPLEXITY_THRESHOLD = process.env.PR_COMPLEXITY_THRESHOLD || 'medium';
const MAX_PRS_FOR_KEEP_LATEST = parseInt(process.env.MAX_PRS_FOR_KEEP_LATEST || '5', 10);
const CONFLICT_PROBABILITY_THRESHOLD = parseFloat(process.env.CONFLICT_PROBABILITY_THRESHOLD || '0.4');
const DEFAULT_STRATEGY = (process.env.DEFAULT_STRATEGY || 'auto') as ConsolidationStrategy | 'auto';

/**
 * Determines the most appropriate consolidation strategy based on PR analysis factors
 */
export function determineStrategy(factors: PRAnalysisFactors): StrategyRecommendation {
  // Score for each strategy (0-100)
  let keepLatestScore = 0;
  let rollingUpScore = 0;
  let consolidationMapScore = 0;
  
  // Reasoning for recommendations
  const reasoning: string[] = [];
  const keepLatestPros: string[] = [];
  const keepLatestCons: string[] = [];
  const rollingUpPros: string[] = [];
  const rollingUpCons: string[] = [];
  const consolidationMapPros: string[] = [];
  const consolidationMapCons: string[] = [];
  
  // Factor 1: PR Count
  if (factors.prCount <= 3) {
    keepLatestScore += 20;
    rollingUpScore += 15;
    consolidationMapScore += 5;
    reasoning.push(`Small number of PRs (${factors.prCount}) favors simpler approaches`);
    keepLatestPros.push('Efficient for small PR sets');
    consolidationMapCons.push('May be overhead for just a few PRs');
  } else if (factors.prCount <= MAX_PRS_FOR_KEEP_LATEST) {
    keepLatestScore += 15;
    rollingUpScore += 20;
    consolidationMapScore += 15;
    reasoning.push(`Moderate number of PRs (${factors.prCount}) works with any strategy`);
  } else {
    keepLatestScore += 5;
    rollingUpScore += 10;
    consolidationMapScore += 25;
    reasoning.push(`Large number of PRs (${factors.prCount}) benefits from structured approach`);
    keepLatestCons.push('Risk of missing changes increases with PR count');
    consolidationMapPros.push('Scales well to many PRs');
  }
  
  // Factor 2: Change Complexity
  if (factors.changeComplexity === 'Low') {
    keepLatestScore += 25;
    rollingUpScore += 10;
    consolidationMapScore += 5;
    reasoning.push('Low complexity changes are suitable for simple consolidation');
    keepLatestPros.push('Efficient for simple changes');
    rollingUpCons.push('Excessive process for simple changes');
  } else if (factors.changeComplexity === 'Medium') {
    keepLatestScore += 15;
    rollingUpScore += 20;
    consolidationMapScore += 20;
    reasoning.push('Medium complexity changes benefit from some structure');
  } else {
    keepLatestScore += 5;
    rollingUpScore += 25;
    consolidationMapScore += 20;
    reasoning.push('High complexity changes require careful integration');
    keepLatestCons.push('High risk for complex changes');
    rollingUpPros.push('Methodical approach suits complex changes');
  }
  
  // Factor 3: Critical Path Changes
  if (factors.criticalPathChanges) {
    keepLatestScore += 0;
    rollingUpScore += 25;
    consolidationMapScore += 20;
    reasoning.push('Critical path changes require careful integration');
    keepLatestCons.push('Too risky for critical path changes');
    rollingUpPros.push('Careful verification of each integration step');
  } else {
    keepLatestScore += 15;
    rollingUpScore += 10;
    consolidationMapScore += 10;
    reasoning.push('Non-critical changes allow for simpler approaches');
  }
  
  // Factor 4: Developer Count
  if (factors.developerCount <= 1) {
    keepLatestScore += 20;
    rollingUpScore += 15;
    consolidationMapScore += 10;
    reasoning.push('Single developer changes are more predictable');
    keepLatestPros.push('Efficient for single-developer changes');
  } else if (factors.developerCount <= 3) {
    keepLatestScore += 10;
    rollingUpScore += 20;
    consolidationMapScore += 15;
    reasoning.push('Small team changes benefit from some coordination');
  } else {
    keepLatestScore += 5;
    rollingUpScore += 15;
    consolidationMapScore += 25;
    reasoning.push('Multi-developer changes require structured coordination');
    consolidationMapPros.push('Better visibility across multiple developers');
    keepLatestCons.push('May lose individual developer context');
  }
  
  // Factor 5: Conflict Probability
  if (factors.conflictProbability < 0.2) {
    keepLatestScore += 20;
    rollingUpScore += 10;
    consolidationMapScore += 10;
    reasoning.push('Low conflict probability allows for simpler approaches');
    keepLatestPros.push('Efficient when conflicts unlikely');
  } else if (factors.conflictProbability < CONFLICT_PROBABILITY_THRESHOLD) {
    keepLatestScore += 10;
    rollingUpScore += 15;
    consolidationMapScore += 20;
    reasoning.push('Moderate conflict risk benefits from some structure');
  } else {
    keepLatestScore += 0;
    rollingUpScore += 25;
    consolidationMapScore += 20;
    reasoning.push('High conflict probability requires careful integration');
    keepLatestCons.push('High risk with likely conflicts');
    rollingUpPros.push('Best for handling complex conflicts step by step');
  }
  
  // Factor 6: Time Span
  if (factors.timeSpan < 3) {
    keepLatestScore += 15;
    rollingUpScore += 10;
    consolidationMapScore += 10;
    reasoning.push('Short time span indicates closely related changes');
  } else if (factors.timeSpan < 14) {
    keepLatestScore += 10;
    rollingUpScore += 15;
    consolidationMapScore += 15;
    reasoning.push('Moderate time span suggests evolving changes');
  } else {
    keepLatestScore += 5;
    rollingUpScore += 10;
    consolidationMapScore += 20;
    reasoning.push('Long time span indicates potentially divergent changes');
    consolidationMapPros.push('Better for tracking changes over time');
    keepLatestCons.push('May miss important historical context');
  }
  
  // Determine the best strategy
  let recommendedStrategy: ConsolidationStrategy;
  let confidence: number;
  
  if (DEFAULT_STRATEGY !== 'auto') {
    // Use the default strategy if specified
    recommendedStrategy = DEFAULT_STRATEGY;
    
    // Determine confidence based on the score
    switch (recommendedStrategy) {
      case 'keep-latest':
        confidence = keepLatestScore;
        break;
      case 'rolling-up':
        confidence = rollingUpScore;
        break;
      case 'consolidation-map':
        confidence = consolidationMapScore;
        break;
    }
    
    reasoning.unshift(`Using configured default strategy: ${recommendedStrategy}`);
  } else {
    // Auto-determine based on scores
    if (keepLatestScore >= rollingUpScore && keepLatestScore >= consolidationMapScore) {
      recommendedStrategy = 'keep-latest';
      confidence = keepLatestScore;
    } else if (rollingUpScore >= keepLatestScore && rollingUpScore >= consolidationMapScore) {
      recommendedStrategy = 'rolling-up';
      confidence = rollingUpScore;
    } else {
      recommendedStrategy = 'consolidation-map';
      confidence = consolidationMapScore;
    }
  }
  
  return {
    recommendedStrategy,
    confidence,
    reasoning,
    alternativeStrategies: [
      {
        strategy: 'keep-latest' as ConsolidationStrategy,
        score: keepLatestScore,
        pros: keepLatestPros,
        cons: keepLatestCons
      },
      {
        strategy: 'rolling-up' as ConsolidationStrategy,
        score: rollingUpScore,
        pros: rollingUpPros,
        cons: rollingUpCons
      },
      {
        strategy: 'consolidation-map' as ConsolidationStrategy,
        score: consolidationMapScore,
        pros: consolidationMapPros,
        cons: consolidationMapCons
      }
    ].filter(s => s.strategy !== recommendedStrategy)
  };
}

/**
 * Generates a visual representation of the strategy recommendation
 */
export function generateStrategyVisualization(recommendation: StrategyRecommendation): string {
  // Create a table comparing all strategies
  const allStrategies = [
    {
      strategy: recommendation.recommendedStrategy,
      score: recommendation.confidence,
      pros: recommendation.alternativeStrategies.find(s => s.strategy === recommendation.recommendedStrategy)?.pros || [],
      cons: recommendation.alternativeStrategies.find(s => s.strategy === recommendation.recommendedStrategy)?.cons || []
    },
    ...recommendation.alternativeStrategies
  ];
  
  // Sort by score descending
  allStrategies.sort((a, b) => b.score - a.score);
  
  // Create markdown table
  let table = '| Strategy | Score | Pros | Cons |\n';
  table += '|----------|-------|------|------|\n';
  
  for (const strategy of allStrategies) {
    const pros = strategy.pros.length ? strategy.pros.map(p => `- ${p}`).join('<br>') : '-';
    const cons = strategy.cons.length ? strategy.cons.map(c => `- ${c}`).join('<br>') : '-';
    const name = strategy.strategy === recommendation.recommendedStrategy 
      ? `**${strategy.strategy} (Recommended)**` 
      : strategy.strategy;
    
    table += `| ${name} | ${strategy.score}/100 | ${pros} | ${cons} |\n`;
  }
  
  let output = '## Strategy Recommendation\n\n';
  output += `**Recommended Strategy:** ${recommendation.recommendedStrategy}\n\n`;
  output += `**Confidence:** ${recommendation.confidence}%\n\n`;
  output += '### Reasoning\n\n';
  
  for (const reason of recommendation.reasoning) {
    output += `- ${reason}\n`;
  }
  
  output += '\n### Strategy Comparison\n\n';
  output += table;
  
  return output;
}

/**
 * Analyzes pull requests to determine consolidation strategy factors
 */
export function analyzePRsForStrategyFactors(prs: any[]): PRAnalysisFactors {
  // This would normally analyze the PRs in detail
  // For now, we'll create a simplified version based on PR metadata
  
  // Get unique files changed across all PRs
  const allFiles = new Set<string>();
  for (const pr of prs) {
    const files = pr.files || [];
    for (const file of files) {
      allFiles.add(file.filename);
    }
  }
  
  // Get unique developers
  const developers = new Set<string>();
  for (const pr of prs) {
    if (pr.author && pr.author.login) {
      developers.add(pr.author.login);
    }
  }
  
  // Check for critical path changes
  const criticalPaths = (process.env.CRITICAL_DIRECTORIES || 'app/lib/services,app/components/auth,app/api,middleware').split(',');
  let hasCriticalChanges = false;
  
  for (const file of allFiles) {
    if (criticalPaths.some(path => file.startsWith(path))) {
      hasCriticalChanges = true;
      break;
    }
  }
  
  // Calculate time span
  let oldestDate = Date.now();
  let newestDate = 0;
  
  for (const pr of prs) {
    const createdAt = new Date(pr.createdAt).getTime();
    if (createdAt < oldestDate) {
      oldestDate = createdAt;
    }
    if (createdAt > newestDate) {
      newestDate = createdAt;
    }
  }
  
  const timeSpanDays = Math.round((newestDate - oldestDate) / (1000 * 60 * 60 * 24));
  
  // Estimate conflict probability based on file overlap
  let conflictProbability = 0;
  
  if (prs.length > 1) {
    // Count how many PRs modify the same files
    const fileModificationCount = new Map<string, number>();
    
    for (const pr of prs) {
      const files = pr.files || [];
      for (const file of files) {
        const count = fileModificationCount.get(file.filename) || 0;
        fileModificationCount.set(file.filename, count + 1);
      }
    }
    
    // Calculate percentage of files modified by multiple PRs
    let multiModifiedFiles = 0;
    for (const [_, count] of fileModificationCount.entries()) {
      if (count > 1) {
        multiModifiedFiles++;
      }
    }
    
    conflictProbability = multiModifiedFiles / fileModificationCount.size;
  }
  
  // Determine complexity based on file types and changes
  let changeComplexity: 'Low' | 'Medium' | 'High' = 'Low';
  
  // Check file extensions that indicate higher complexity
  const complexFilePatterns = [
    /\.tsx?$/,  // TypeScript files
    /\.jsx?$/,  // JavaScript files
    /\.service\./,  // Service files
    /middleware/,  // Middleware files
    /api\//   // API files
  ];
  
  // Count complex files
  let complexFileCount = 0;
  
  for (const file of allFiles) {
    if (complexFilePatterns.some(pattern => pattern.test(file))) {
      complexFileCount++;
    }
  }
  
  const complexityRatio = complexFileCount / allFiles.size;
  
  if (complexityRatio > 0.7 || allFiles.size > 20) {
    changeComplexity = 'High';
  } else if (complexityRatio > 0.3 || allFiles.size > 10) {
    changeComplexity = 'Medium';
  }
  
  // Determine test requirements
  const testRequirements: string[] = [];
  
  if (hasCriticalChanges) {
    testRequirements.push('critical-path');
  }
  
  if (allFiles.size > 15) {
    testRequirements.push('integration');
  }
  
  if ([...allFiles].some(file => file.includes('api/'))) {
    testRequirements.push('api');
  }
  
  if ([...allFiles].some(file => file.includes('components/'))) {
    testRequirements.push('ui');
  }
  
  return {
    prCount: prs.length,
    filesChanged: allFiles.size,
    criticalPathChanges: hasCriticalChanges,
    testRequirements,
    changeComplexity,
    developerCount: developers.size,
    timeSpan: timeSpanDays,
    conflictProbability
  };
}

// Export default functions
export default {
  determineStrategy,
  generateStrategyVisualization,
  analyzePRsForStrategyFactors
}; 