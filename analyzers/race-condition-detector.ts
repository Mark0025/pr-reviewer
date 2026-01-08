/**
 * Race Condition Detector
 * 
 * Detects potential race conditions in form submissions and state management
 */

import { 
  PullRequest, 
  RaceConditionAnalysis 
} from '../types';
import { 
  createOctokit, 
  getPRDetails 
} from '../utils';

/**
 * Analyze PR for potential race conditions
 */
export async function detectRaceConditions(prNumber: number): Promise<RaceConditionAnalysis> {
  console.log(`Analyzing race conditions for PR #${prNumber}...`);
  
  // Get PR details
  const octokit = createOctokit();
  const pr = await getPRDetails(octokit, prNumber);
  
  if (!pr) {
    throw new Error(`Could not fetch PR #${prNumber}`);
  }
  
  // Analyze for race conditions
  return {
    formSubmissionIssues: detectFormSubmissionIssues(pr),
    stateManagementIssues: detectStateManagementIssues(pr),
    asyncOperationIssues: detectAsyncOperationIssues(pr),
    databaseTransactionIssues: detectDatabaseTransactionIssues(pr),
    overallRisk: calculateRaceConditionRisk(pr)
  };
}

/**
 * Detect race conditions in form submissions
 */
function detectFormSubmissionIssues(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const formIssues: string[] = [];
  
  // Form-related files
  const formFiles = pr.files.filter(file => 
    (file.path.includes('/form') || file.path.includes('actions')) &&
    (file.path.endsWith('.tsx') || file.path.endsWith('.jsx') || file.path.endsWith('.ts') || file.path.endsWith('.js'))
  );
  
  // Check each form file for potential issues
  formFiles.forEach(file => {
    if (!file.patch) return;
    
    // Check for proper form state handling
    const hasFormStateChanges = file.patch.includes('useState') || 
                               file.patch.includes('FormState') || 
                               file.patch.includes('useActionState');
    
    // Check for proper loading states
    const hasLoadingState = file.patch.includes('isLoading') || 
                           file.patch.includes('pending') || 
                           file.patch.includes('useFormStatus');
    
    // Check for multiple form submissions
    const hasSubmitHandler = file.patch.includes('onSubmit') || 
                            file.patch.includes('handleSubmit') || 
                            file.patch.includes('formAction');
    
    // If form has submit handler but no loading state, flag it
    if (hasSubmitHandler && !hasLoadingState) {
      formIssues.push(`${file.path}: Form submission without loading state`);
    }
    
    // Check for form actions without proper state reset
    if (hasFormStateChanges && !file.patch.includes('reset') && !file.patch.includes('setState')) {
      formIssues.push(`${file.path}: Form state not properly reset after submission`);
    }
    
    // Check for prevention of multiple submissions
    if (hasSubmitHandler && !file.patch.includes('disabled={') && !file.patch.includes('disabled=')) {
      formIssues.push(`${file.path}: Form submission not disabled during processing`);
    }
  });
  
  return formIssues;
}

/**
 * Detect race conditions in state management
 */
function detectStateManagementIssues(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const stateIssues: string[] = [];
  
  // State management files
  const stateFiles = pr.files.filter(file => 
    file.path.includes('/store') || 
    file.path.includes('useReducer') || 
    file.path.includes('useState') || 
    file.path.includes('context') || 
    file.path.includes('redux') || 
    file.path.includes('zustand')
  );
  
  // Check each state file for potential issues
  stateFiles.forEach(file => {
    if (!file.patch) return;
    
    // Look for concurrent state updates
    if ((file.patch.includes('setState') || file.patch.includes('dispatch')) && 
        !file.patch.includes('useCallback') && 
        !file.patch.includes('debounce') && 
        !file.patch.includes('throttle')) {
      stateIssues.push(`${file.path}: Potential concurrent state updates without debounce/throttle`);
    }
    
    // Look for state derived from props without memoization
    if (file.patch.includes('props') && 
        file.patch.includes('setState') && 
        !file.patch.includes('useEffect') && 
        !file.patch.includes('useMemo')) {
      stateIssues.push(`${file.path}: State derived from props without proper effects or memoization`);
    }
    
    // Look for set state in loops
    if ((file.patch.includes('for (') || file.patch.includes('forEach')) && 
        (file.patch.includes('setState') || file.patch.includes('dispatch'))) {
      stateIssues.push(`${file.path}: Setting state in loops can cause race conditions`);
    }
  });
  
  return stateIssues;
}

/**
 * Detect race conditions in async operations
 */
function detectAsyncOperationIssues(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const asyncIssues: string[] = [];
  
  // Find files with async operations
  const asyncFiles = pr.files.filter(file => 
    file.patch && (
      file.patch.includes('async ') || 
      file.patch.includes('Promise') || 
      file.patch.includes('then(') || 
      file.patch.includes('catch(') || 
      file.patch.includes('await ')
    )
  );
  
  // Check each async file for potential issues
  asyncFiles.forEach(file => {
    if (!file.patch) return;
    
    // Check for multiple fetch calls without cleanup
    if ((file.patch.includes('fetch(') || file.patch.includes('axios')) && 
        file.patch.includes('useEffect') && 
        !file.patch.includes('abortController') && 
        !file.patch.includes('return () =>')) {
      asyncIssues.push(`${file.path}: Async operations without cleanup in useEffect`);
    }
    
    // Check for concurrent fetches of the same resource
    if ((file.patch.match(/fetch\(/g) || []).length > 1 && 
        !file.patch.includes('useCallback') && 
        !file.patch.includes('useRef')) {
      asyncIssues.push(`${file.path}: Multiple fetch calls could race`);
    }
    
    // Check for event handlers without cleanup
    if (file.patch.includes('addEventListener') && 
        !file.patch.includes('removeEventListener')) {
      asyncIssues.push(`${file.path}: Event listeners added without removal`);
    }
  });
  
  return asyncIssues;
}

/**
 * Detect race conditions in database transactions
 */
function detectDatabaseTransactionIssues(pr: PullRequest): string[] {
  if (!pr.files) return [];
  
  const dbIssues: string[] = [];
  
  // Find database operation files
  const dbFiles = pr.files.filter(file => 
    file.path.includes('/services') || 
    file.path.includes('/db/') || 
    file.path.includes('/database') || 
    file.path.includes('model') ||
    file.path.includes('appwrite')
  );
  
  // Check each DB file for potential issues
  dbFiles.forEach(file => {
    if (!file.patch) return;
    
    // Check for proper transaction handling
    const hasWriteOperations = 
      file.patch.includes('update') || 
      file.patch.includes('insert') || 
      file.patch.includes('delete') || 
      file.patch.includes('create') || 
      file.patch.includes('remove');
    
    const hasTransactionHandling = 
      file.patch.includes('transaction') || 
      file.patch.includes('atomic') || 
      file.patch.includes('lock');
    
    // If has write operations but no transaction handling
    if (hasWriteOperations && !hasTransactionHandling) {
      dbIssues.push(`${file.path}: Database write operations without transaction handling`);
    }
    
    // Check for race conditions in existence checks
    if ((file.patch.includes('if (') || file.patch.includes('if(')) && 
        (file.patch.includes('exists') || file.patch.includes('find') || file.patch.includes('get')) && 
        hasWriteOperations && 
        !hasTransactionHandling) {
      dbIssues.push(`${file.path}: Existence check followed by write without transaction`);
    }
    
    // Check for batch operations without proper error handling
    if ((file.patch.includes('map(') || file.patch.includes('forEach(')) && 
        hasWriteOperations && 
        !file.patch.includes('try {') && 
        !file.patch.includes('catch(')) {
      dbIssues.push(`${file.path}: Batch database operations without proper error handling`);
    }
  });
  
  return dbIssues;
}

/**
 * Calculate the overall race condition risk level
 */
function calculateRaceConditionRisk(pr: PullRequest): 'Low' | 'Medium' | 'High' {
  if (!pr.files) return 'Low';
  
  const formIssues = detectFormSubmissionIssues(pr);
  const stateIssues = detectStateManagementIssues(pr);
  const asyncIssues = detectAsyncOperationIssues(pr);
  const dbIssues = detectDatabaseTransactionIssues(pr);
  
  const totalIssues = formIssues.length + stateIssues.length + asyncIssues.length + dbIssues.length;
  
  // Determine risk level based on number of issues
  if (totalIssues >= 5 || dbIssues.length >= 2) {
    return 'High';
  } else if (totalIssues >= 2 || dbIssues.length >= 1) {
    return 'Medium';
  } else {
    return 'Low';
  }
} 