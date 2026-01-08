#!/usr/bin/env ts-node
/**
 * GitHub Webhook Server for PR Review Triggers
 *
 * Listens for PR events and triggers terry-review analysis
 *
 * Usage:
 *   npx ts-node webhook-server.ts
 *
 * Environment:
 *   WEBHOOK_SECRET - GitHub webhook secret
 *   PORT - Server port (default: 8020)
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PORT = process.env.PORT || 8020;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

interface PRPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    user: { login: string };
    base: { ref: string };
    head: { ref: string };
  };
  repository: {
    full_name: string;
  };
}

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.log('⚠️  No WEBHOOK_SECRET set - skipping signature verification');
    return true;
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function handlePREvent(payload: PRPayload): Promise<void> {
  const { action, number, pull_request, repository } = payload;

  console.log(`\n📥 PR Event: ${action} on ${repository.full_name} #${number}`);
  console.log(`   Title: ${pull_request.title}`);
  console.log(`   Author: ${pull_request.user.login}`);
  console.log(`   Branch: ${pull_request.head.ref} → ${pull_request.base.ref}`);

  // Only review on opened, synchronize (new commits), or reopened
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    console.log(`   Skipping: action '${action}' doesn't trigger review`);
    return;
  }

  // Don't review PRs to non-main branches
  if (pull_request.base.ref !== 'main') {
    console.log(`   Skipping: target branch is '${pull_request.base.ref}', not 'main'`);
    return;
  }

  console.log(`\n🔍 Triggering Terry-Review analysis...`);

  try {
    // Run the PR auto-reviewer
    const { stdout, stderr } = await execAsync(
      `cd /home/mark/pr-reviewer && npx ts-node pr-auto-reviewer.ts ${number}`,
      { timeout: 300000 } // 5 minute timeout
    );

    console.log('📊 Analysis output:');
    console.log(stdout);

    if (stderr) {
      console.log('⚠️  Stderr:', stderr);
    }

    console.log(`✅ Review complete for PR #${number}`);

  } catch (error: any) {
    console.error(`❌ Review failed for PR #${number}:`, error.message);
  }
}

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'terry-review-webhook' }));
    return;
  }

  // Only accept POST to /webhook
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string;
    if (signature && !verifySignature(body, signature)) {
      console.log('❌ Invalid signature');
      res.writeHead(401);
      res.end('Invalid signature');
      return;
    }

    // Check event type
    const event = req.headers['x-github-event'];
    if (event !== 'pull_request') {
      console.log(`ℹ️  Ignoring event: ${event}`);
      res.writeHead(200);
      res.end('OK - ignored');
      return;
    }

    try {
      const payload: PRPayload = JSON.parse(body);

      // Respond immediately
      res.writeHead(200);
      res.end('OK - processing');

      // Process asynchronously
      await handlePREvent(payload);

    } catch (error: any) {
      console.error('❌ Error processing webhook:', error.message);
      res.writeHead(500);
      res.end('Error processing webhook');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Terry-Review Webhook Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Listening on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nWaiting for PR events...`);
});
