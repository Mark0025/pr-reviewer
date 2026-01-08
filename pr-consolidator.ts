#!/usr/bin/env ts-node

/**
 * PR Consolidator Script
 * 
 * This script helps consolidate multiple related PRs into a single PR.
 * Particularly useful for the multiple mobile optimization PRs.
 * 
 * Usage:
 * 1. Copy .env.example to .env and set your GitHub token
 * 2. Run the script: ts-node pr-consolidator.ts
 */

import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import * as inquirer from 'inquirer';
import { spawnSync } from 'child_process';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Constants from .env
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'THE-AI-REAL-ESTATE-INVESTOR';
const GITHUB_REPO = process.env.GITHUB_REPO || 'AIrie-teachings-dev';

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
}

/**
 * Format date to readable string
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
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
 * Main function
 */
async function main() {
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
  
  // Fetch PRs
  console.log(chalk.blue('Fetching open PRs...'));
  const { data: prs } = await octokit.pulls.list({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    state: 'open',
    per_page: 100
  });
  
  console.log(chalk.green(`Found ${prs.length} open PRs.`));
  
  // Format for selection
  const pullRequests = prs.map(pr => ({
    number: pr.number,
    title: pr.title,
    headRefName: pr.head.ref,
    baseRefName: pr.base.ref,
    body: pr.body || '',
    author: {
      login: pr.user?.login || 'unknown'
    },
    createdAt: pr.created_at
  }));
  
  // Group by title to find potential duplicates
  const prsByTitle: Record<string, PullRequest[]> = {};
  pullRequests.forEach(pr => {
    if (!prsByTitle[pr.title]) {
      prsByTitle[pr.title] = [];
    }
    prsByTitle[pr.title].push(pr);
  });
  
  // Find groups with multiple PRs
  const duplicateGroups = Object.entries(prsByTitle)
    .filter(([_, group]) => group.length > 1)
    .map(([title, group]) => ({ title, prs: group }));
  
  if (duplicateGroups.length > 0) {
    console.log(chalk.yellow(`Found ${duplicateGroups.length} groups of PRs with identical titles.`));
    
    for (const group of duplicateGroups) {
      console.log(chalk.bold(`\nTitle: "${group.title}"`));
      group.prs.forEach((pr, index) => {
        console.log(`${index + 1}. #${pr.number} (${formatDate(pr.createdAt)}) - ${pr.headRefName} → ${pr.baseRefName}`);
      });
    }
    
    // Ask which group to consolidate
    const { groupIndex } = await inquirer.prompt([
      {
        type: 'list',
        name: 'groupIndex',
        message: 'Which group of PRs would you like to consolidate?',
        choices: duplicateGroups.map((group, index) => ({
          name: `${group.title} (${group.prs.length} PRs)`,
          value: index
        }))
      }
    ]);
    
    const selectedGroup = duplicateGroups[groupIndex];
    
    // Ask how to consolidate
    const { strategy } = await inquirer.prompt([
      {
        type: 'list',
        name: 'strategy',
        message: 'How would you like to consolidate these PRs?',
        choices: [
          {
            name: 'Create a new branch that combines all changes',
            value: 'new_branch'
          },
          {
            name: 'Keep the oldest PR and close others',
            value: 'keep_oldest'
          },
          {
            name: 'Keep the newest PR and close others',
            value: 'keep_newest'
          }
        ]
      }
    ]);
    
    if (strategy === 'new_branch') {
      // Create a new consolidated branch
      const { newBranchName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newBranchName',
          message: 'Enter a name for the new consolidated branch:',
          default: `consolidated-${selectedGroup.prs[0].headRefName}`
        }
      ]);
      
      // Find the base branch (should be the same for all PRs in the group)
      const baseBranch = selectedGroup.prs[0].baseRefName;
      
      // Create new branch from base
      console.log(chalk.blue(`Creating new branch '${newBranchName}' from '${baseBranch}'...`));
      
      let result = runCommand('git', ['fetch', 'origin', baseBranch]);
      if (!result.success) {
        console.log(chalk.red('Failed to fetch base branch.'));
        console.log(result.stderr);
        return;
      }
      
      result = runCommand('git', ['checkout', '-b', newBranchName, `origin/${baseBranch}`]);
      if (!result.success) {
        console.log(chalk.red(`Failed to create new branch '${newBranchName}'.`));
        console.log(result.stderr);
        return;
      }
      
      // Merge each PR branch into the new branch
      for (const pr of selectedGroup.prs) {
        console.log(chalk.blue(`Merging changes from PR #${pr.number} (${pr.headRefName})...`));
        
        result = runCommand('git', ['fetch', 'origin', pr.headRefName]);
        if (!result.success) {
          console.log(chalk.red(`Failed to fetch branch '${pr.headRefName}'.`));
          console.log(result.stderr);
          continue;
        }
        
        result = runCommand('git', ['merge', '--no-ff', `origin/${pr.headRefName}`, '-m', `Merge PR #${pr.number}: ${pr.title}`]);
        if (!result.success) {
          console.log(chalk.red(`Merge conflict detected when merging '${pr.headRefName}'.`));
          console.log(chalk.yellow('Please resolve conflicts, then continue the script.'));
          
          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'How would you like to proceed?',
              choices: [
                {
                  name: 'Resolve conflicts manually (will exit script)',
                  value: 'exit'
                },
                {
                  name: 'Skip this PR and continue with others',
                  value: 'skip'
                },
                {
                  name: 'Abort the merge and exit',
                  value: 'abort'
                }
              ]
            }
          ]);
          
          if (action === 'exit') {
            console.log(chalk.yellow('Exiting script. Resolve conflicts and commit changes manually.'));
            return;
          } else if (action === 'abort') {
            runCommand('git', ['merge', '--abort']);
            console.log(chalk.red('Merge aborted. Exiting script.'));
            return;
          } else {
            runCommand('git', ['merge', '--abort']);
            console.log(chalk.yellow(`Skipping PR #${pr.number}.`));
            continue;
          }
        }
      }
      
      // Push the new branch
      console.log(chalk.blue(`Pushing the consolidated branch '${newBranchName}'...`));
      result = runCommand('git', ['push', '-u', 'origin', newBranchName]);
      
      if (!result.success) {
        console.log(chalk.red('Failed to push the consolidated branch.'));
        console.log(result.stderr);
        return;
      }
      
      console.log(chalk.green(`Consolidated branch '${newBranchName}' created and pushed!`));
      
      // Prepare PR description
      let consolidatedBody = `# Consolidated PR\n\nThis PR consolidates the following PRs:\n\n`;
      selectedGroup.prs.forEach(pr => {
        consolidatedBody += `- #${pr.number}: ${pr.title}\n`;
      });
      
      consolidatedBody += `\n## Original PR Descriptions\n\n`;
      selectedGroup.prs.forEach(pr => {
        consolidatedBody += `### PR #${pr.number}\n\n${pr.body}\n\n---\n\n`;
      });
      
      // Create a new PR
      console.log(chalk.blue('Creating a new consolidated PR...'));
      
      result = runCommand('gh', [
        'pr', 'create',
        '--base', baseBranch,
        '--head', newBranchName,
        '--title', selectedGroup.title,
        '--body', consolidatedBody
      ]);
      
      if (!result.success) {
        console.log(chalk.red('Failed to create the consolidated PR.'));
        console.log(result.stderr);
        return;
      }
      
      console.log(chalk.green('Consolidated PR created successfully!'));
      
      // Ask if the original PRs should be closed
      const { shouldClose } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldClose',
          message: 'Would you like to close the original PRs?',
          default: true
        }
      ]);
      
      if (shouldClose) {
        console.log(chalk.blue('Closing original PRs...'));
        
        for (const pr of selectedGroup.prs) {
          console.log(chalk.blue(`Closing PR #${pr.number}...`));
          
          const closeResult = runCommand('gh', [
            'pr', 'close', pr.number.toString(),
            '--comment', `This PR has been consolidated into the new PR. Original changes preserved.`
          ]);
          
          if (closeResult.success) {
            console.log(chalk.green(`PR #${pr.number} closed successfully.`));
          } else {
            console.log(chalk.red(`Failed to close PR #${pr.number}.`));
            console.log(closeResult.stderr);
          }
        }
      }
      
    } else if (strategy === 'keep_oldest' || strategy === 'keep_newest') {
      // Sort by creation date
      const sortedPRs = [...selectedGroup.prs].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return strategy === 'keep_oldest' ? dateA - dateB : dateB - dateA;
      });
      
      const keepPR = sortedPRs[0];
      const closePRs = sortedPRs.slice(1);
      
      console.log(chalk.green(`Keeping PR #${keepPR.number} (${formatDate(keepPR.createdAt)}).`));
      console.log(chalk.yellow(`The following PRs will be closed:`));
      closePRs.forEach(pr => {
        console.log(`- #${pr.number} (${formatDate(pr.createdAt)})`);
      });
      
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to proceed with this action?',
          default: false
        }
      ]);
      
      if (confirm) {
        console.log(chalk.blue('Closing PRs...'));
        
        for (const pr of closePRs) {
          console.log(chalk.blue(`Closing PR #${pr.number}...`));
          
          const closeResult = runCommand('gh', [
            'pr', 'close', pr.number.toString(),
            '--comment', `This PR has been consolidated with #${keepPR.number}. Please refer to that PR for further discussion.`
          ]);
          
          if (closeResult.success) {
            console.log(chalk.green(`PR #${pr.number} closed successfully.`));
          } else {
            console.log(chalk.red(`Failed to close PR #${pr.number}.`));
            console.log(closeResult.stderr);
          }
        }
      } else {
        console.log(chalk.yellow('Operation cancelled.'));
      }
    }
    
  } else {
    console.log(chalk.yellow('No groups of duplicate PRs found.'));
    
    // Allow manual selection of PRs to consolidate
    console.log(chalk.blue('\nYou can still manually select PRs to consolidate.'));
    
    // Show Mobile Optimization PRs
    const mobileOptPRs = pullRequests.filter(pr => pr.title.includes('Mobile Optimization'));
    if (mobileOptPRs.length > 0) {
      console.log(chalk.yellow(`\nFound ${mobileOptPRs.length} Mobile Optimization PRs:`));
      mobileOptPRs.forEach((pr, index) => {
        console.log(`${index + 1}. #${pr.number}: ${pr.title} (${formatDate(pr.createdAt)})`);
      });
      
      const { shouldConsolidate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldConsolidate',
          message: 'Would you like to consolidate these Mobile Optimization PRs?',
          default: true
        }
      ]);
      
      if (shouldConsolidate) {
        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: 'Select PRs to consolidate:',
            choices: mobileOptPRs.map(pr => ({
              name: `#${pr.number}: ${pr.title} (${formatDate(pr.createdAt)})`,
              value: pr.number,
              checked: true
            }))
          }
        ]);
        
        if (selected.length < 2) {
          console.log(chalk.red('You need to select at least 2 PRs to consolidate. Operation cancelled.'));
          return;
        }
        
        const selectedPRs = mobileOptPRs.filter(pr => selected.includes(pr.number));
        
        // Create a new consolidated branch
        const { newBranchName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newBranchName',
            message: 'Enter a name for the new consolidated branch:',
            default: 'consolidated-mobile-optimization'
          }
        ]);
        
        // Find the base branch (should be the same for all PRs in the group)
        const baseBranch = selectedPRs[0].baseRefName;
        
        // Create new branch from base
        console.log(chalk.blue(`Creating new branch '${newBranchName}' from '${baseBranch}'...`));
        
        let result = runCommand('git', ['fetch', 'origin', baseBranch]);
        if (!result.success) {
          console.log(chalk.red('Failed to fetch base branch.'));
          console.log(result.stderr);
          return;
        }
        
        result = runCommand('git', ['checkout', '-b', newBranchName, `origin/${baseBranch}`]);
        if (!result.success) {
          console.log(chalk.red(`Failed to create new branch '${newBranchName}'.`));
          console.log(result.stderr);
          return;
        }
        
        // Merge each PR branch into the new branch
        for (const pr of selectedPRs) {
          console.log(chalk.blue(`Merging changes from PR #${pr.number} (${pr.headRefName})...`));
          
          result = runCommand('git', ['fetch', 'origin', pr.headRefName]);
          if (!result.success) {
            console.log(chalk.red(`Failed to fetch branch '${pr.headRefName}'.`));
            console.log(result.stderr);
            continue;
          }
          
          result = runCommand('git', ['merge', '--no-ff', `origin/${pr.headRefName}`, '-m', `Merge PR #${pr.number}: ${pr.title}`]);
          if (!result.success) {
            console.log(chalk.red(`Merge conflict detected when merging '${pr.headRefName}'.`));
            console.log(chalk.yellow('Please resolve conflicts, then continue the script.'));
            
            const { action } = await inquirer.prompt([
              {
                type: 'list',
                name: 'action',
                message: 'How would you like to proceed?',
                choices: [
                  {
                    name: 'Resolve conflicts manually (will exit script)',
                    value: 'exit'
                  },
                  {
                    name: 'Skip this PR and continue with others',
                    value: 'skip'
                  },
                  {
                    name: 'Abort the merge and exit',
                    value: 'abort'
                  }
                ]
              }
            ]);
            
            if (action === 'exit') {
              console.log(chalk.yellow('Exiting script. Resolve conflicts and commit changes manually.'));
              return;
            } else if (action === 'abort') {
              runCommand('git', ['merge', '--abort']);
              console.log(chalk.red('Merge aborted. Exiting script.'));
              return;
            } else {
              runCommand('git', ['merge', '--abort']);
              console.log(chalk.yellow(`Skipping PR #${pr.number}.`));
              continue;
            }
          }
        }
        
        // Push the new branch
        console.log(chalk.blue(`Pushing the consolidated branch '${newBranchName}'...`));
        result = runCommand('git', ['push', '-u', 'origin', newBranchName]);
        
        if (!result.success) {
          console.log(chalk.red('Failed to push the consolidated branch.'));
          console.log(result.stderr);
          return;
        }
        
        console.log(chalk.green(`Consolidated branch '${newBranchName}' created and pushed!`));
        
        // Prepare PR description
        let consolidatedBody = `# Consolidated Mobile Optimization PR\n\nThis PR consolidates the following mobile optimization PRs:\n\n`;
        selectedPRs.forEach(pr => {
          consolidatedBody += `- #${pr.number}: ${pr.title}\n`;
        });
        
        consolidatedBody += `\n## Original PR Descriptions\n\n`;
        selectedPRs.forEach(pr => {
          consolidatedBody += `### PR #${pr.number}\n\n${pr.body}\n\n---\n\n`;
        });
        
        // Create a new PR
        console.log(chalk.blue('Creating a new consolidated PR...'));
        
        result = runCommand('gh', [
          'pr', 'create',
          '--base', baseBranch,
          '--head', newBranchName,
          '--title', '🔄 Consolidated Mobile Optimization Updates',
          '--body', consolidatedBody
        ]);
        
        if (!result.success) {
          console.log(chalk.red('Failed to create the consolidated PR.'));
          console.log(result.stderr);
          return;
        }
        
        console.log(chalk.green('Consolidated PR created successfully!'));
        
        // Ask if the original PRs should be closed
        const { shouldClose } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldClose',
            message: 'Would you like to close the original PRs?',
            default: true
          }
        ]);
        
        if (shouldClose) {
          console.log(chalk.blue('Closing original PRs...'));
          
          for (const pr of selectedPRs) {
            console.log(chalk.blue(`Closing PR #${pr.number}...`));
            
            const closeResult = runCommand('gh', [
              'pr', 'close', pr.number.toString(),
              '--comment', `This PR has been consolidated into a new PR. Original changes preserved.`
            ]);
            
            if (closeResult.success) {
              console.log(chalk.green(`PR #${pr.number} closed successfully.`));
            } else {
              console.log(chalk.red(`Failed to close PR #${pr.number}.`));
              console.log(closeResult.stderr);
            }
          }
        }
      }
    } else {
      console.log(chalk.yellow('No Mobile Optimization PRs found.'));
    }
  }
}

// Run the script
main().catch(error => {
  console.error(chalk.red('Error:'), error);
}); 