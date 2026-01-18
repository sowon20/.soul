#!/usr/bin/env node

/**
 * Phase 4.1 Context Detection API Test Script
 * 맥락 감지 시스템 API 테스트
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3080/api';

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function logSuccess(message) {
  log(colors.green, '✓', message);
}

function logError(message) {
  log(colors.red, '✗', message);
}

function logInfo(message) {
  log(colors.cyan, 'ℹ', message);
}

function logSection(message) {
  console.log('\n' + colors.blue + '='.repeat(60) + colors.reset);
  log(colors.blue, message);
  console.log(colors.blue + '='.repeat(60) + colors.reset + '\n');
}

// 테스트 메시지 샘플
const testMessages = [
  {
    name: '시간 참조 + 주제 참조',
    message: '저번에 얘기했던 React 프로젝트 기억나?',
    expectedTrigger: true
  },
  {
    name: '최근 참조 + 기술 키워드',
    message: '최근에 MongoDB 설정 어떻게 했었지?',
    expectedTrigger: true
  },
  {
    name: '단순 질문 (트리거 없음)',
    message: '안녕?',
    expectedTrigger: false
  },
  {
    name: '비슷한 이슈 참조',
    message: '그때 그 API 에러랑 비슷한 문제가 또 생겼어',
    expectedTrigger: true
  },
  {
    name: '프로젝트명 + 과거 참조',
    message: '예전에 soul 프로젝트에서 했던 것처럼 해보려고',
    expectedTrigger: true
  }
];

async function testHealthCheck() {
  try {
    const response = await axios.get(`${API_BASE}/health`);
    if (response.data.status === 'ok') {
      logSuccess('Health check passed');
      return true;
    } else {
      logError('Health check failed: Unexpected status');
      return false;
    }
  } catch (error) {
    logError(`Health check failed: ${error.message}`);
    return false;
  }
}

async function testExtractKeywords() {
  logSection('Test 1: Extract Keywords');

  for (const test of testMessages) {
    try {
      logInfo(`Testing: "${test.message}"`);

      const response = await axios.post(`${API_BASE}/context/extract-keywords`, {
        message: test.message
      });

      if (response.data.success && response.data.extracted) {
        const { keywords, entities, timeRefs, hasTopicReference } = response.data.extracted;

        console.log(`  Keywords: ${JSON.stringify(keywords)}`);
        console.log(`  Entities: ${JSON.stringify(entities)}`);
        console.log(`  Time References: ${JSON.stringify(timeRefs)}`);
        console.log(`  Has Topic Reference: ${hasTopicReference}`);

        logSuccess('Keyword extraction passed');
      } else {
        logError('Unexpected response format');
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
    console.log('');
  }
}

async function testEvaluateTrigger() {
  logSection('Test 2: Evaluate Trigger');

  for (const test of testMessages) {
    try {
      logInfo(`Testing: "${test.message}"`);

      const response = await axios.post(`${API_BASE}/context/evaluate-trigger`, {
        message: test.message,
        triggerConfig: {
          minKeywords: 2,
          minConfidence: 0.5
        }
      });

      if (response.data.success && response.data.trigger) {
        const { triggered, confidence, reasons } = response.data.trigger;

        console.log(`  Triggered: ${triggered}`);
        console.log(`  Confidence: ${(confidence * 100).toFixed(1)}%`);
        console.log(`  Reasons: ${JSON.stringify(reasons)}`);

        if (triggered === test.expectedTrigger) {
          logSuccess(`Trigger evaluation correct (expected: ${test.expectedTrigger})`);
        } else {
          logError(`Trigger evaluation incorrect (expected: ${test.expectedTrigger}, got: ${triggered})`);
        }
      } else {
        logError('Unexpected response format');
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
    console.log('');
  }
}

async function testFindMemories() {
  logSection('Test 3: Find Related Memories');

  const testMessage = '저번에 얘기했던 React 프로젝트 기억나?';

  try {
    logInfo(`Testing memory search for: "${testMessage}"`);

    const response = await axios.post(`${API_BASE}/context/find-memories`, {
      message: testMessage,
      searchOptions: {
        limit: 5,
        minRelevance: 5,
        timeWindow: 'recent'
      }
    });

    if (response.data.success && response.data.memories) {
      const { memories, searchStrategy, totalFound } = response.data.memories;

      console.log(`  Total Found: ${totalFound}`);
      console.log(`  Search Strategy: ${JSON.stringify(searchStrategy)}`);

      if (memories && memories.length > 0) {
        console.log(`\n  Top ${memories.length} memories:`);
        memories.forEach((mem, idx) => {
          console.log(`    ${idx + 1}. ${mem.topics?.[0] || 'Untitled'}`);
          console.log(`       Relevance: ${mem.relevanceScore?.toFixed(1) || 'N/A'}`);
          console.log(`       Date: ${mem.date}`);
        });
        logSuccess('Memory search returned results');
      } else {
        logInfo('No memories found (this is normal if index is empty)');
      }
    } else {
      logError('Unexpected response format');
    }
  } catch (error) {
    logError(`Test failed: ${error.message}`);
  }
}

async function testDetectAndRetrieve() {
  logSection('Test 4: Detect and Retrieve (Full Pipeline)');

  for (const test of testMessages.slice(0, 2)) { // Test first 2 only
    try {
      logInfo(`Testing full pipeline: "${test.message}"`);

      const response = await axios.post(`${API_BASE}/context/detect`, {
        message: test.message,
        options: {
          triggerConfig: {
            minConfidence: 0.5
          },
          searchOptions: {
            limit: 3,
            minRelevance: 5
          },
          autoTrigger: true
        }
      });

      if (response.data.success) {
        const { extracted, trigger, memories, shouldInject } = response.data;

        console.log(`  Extracted Keywords: ${extracted.keywords.length}`);
        console.log(`  Triggered: ${trigger.triggered} (confidence: ${(trigger.confidence * 100).toFixed(1)}%)`);
        console.log(`  Should Inject: ${shouldInject}`);

        if (memories) {
          console.log(`  Memories Found: ${memories.totalFound}`);
        }

        logSuccess('Full pipeline executed successfully');
      } else {
        logError('Unexpected response format');
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
    console.log('');
  }
}

async function testGeneratePrompt() {
  logSection('Test 5: Generate Context Prompt');

  const testMessage = '저번에 얘기했던 React 프로젝트 기억나?';

  try {
    logInfo(`Testing prompt generation for: "${testMessage}"`);

    const response = await axios.post(`${API_BASE}/context/generate-prompt`, {
      message: testMessage,
      options: {
        triggerConfig: {
          minConfidence: 0.5
        },
        searchOptions: {
          limit: 3
        },
        autoTrigger: true
      }
    });

    if (response.data.success) {
      const { prompt, shouldInject } = response.data;

      console.log(`  Should Inject: ${shouldInject}`);

      if (prompt) {
        console.log(`\n  Generated Prompt (first 200 chars):`);
        console.log(`  ${prompt.substring(0, 200)}...`);
        logSuccess('Prompt generated successfully');
      } else {
        logInfo('No prompt generated (trigger conditions not met or no memories found)');
      }
    } else {
      logError('Unexpected response format');
    }
  } catch (error) {
    logError(`Test failed: ${error.message}`);
  }
}

async function testSpamPrevention() {
  logSection('Test 6: Spam Prevention');

  const now = Date.now();
  const testCases = [
    {
      name: 'No recent injections (should allow)',
      recentInjections: [],
      expected: true
    },
    {
      name: 'Few recent injections (should allow)',
      recentInjections: [
        { timestamp: now - (10 * 60 * 1000), messageId: 'msg1' },
        { timestamp: now - (20 * 60 * 1000), messageId: 'msg2' }
      ],
      expected: true
    },
    {
      name: 'Too many in last hour (should block)',
      recentInjections: [
        { timestamp: now - (5 * 60 * 1000), messageId: 'msg1' },
        { timestamp: now - (10 * 60 * 1000), messageId: 'msg2' },
        { timestamp: now - (15 * 60 * 1000), messageId: 'msg3' },
        { timestamp: now - (20 * 60 * 1000), messageId: 'msg4' },
        { timestamp: now - (25 * 60 * 1000), messageId: 'msg5' }
      ],
      expected: false
    },
    {
      name: 'Too recent (should block)',
      recentInjections: [
        { timestamp: now - (2 * 60 * 1000), messageId: 'msg1' }
      ],
      config: { minIntervalMinutes: 5 },
      expected: false
    }
  ];

  for (const testCase of testCases) {
    try {
      logInfo(`Testing: ${testCase.name}`);

      const response = await axios.post(`${API_BASE}/context/check-spam`, {
        recentInjections: testCase.recentInjections,
        config: testCase.config || {}
      });

      if (response.data.success) {
        const { allowed, reason } = response.data;

        console.log(`  Allowed: ${allowed}`);
        if (reason) {
          console.log(`  Reason: ${reason}`);
        }

        if (allowed === testCase.expected) {
          logSuccess(`Result correct (expected: ${testCase.expected})`);
        } else {
          logError(`Result incorrect (expected: ${testCase.expected}, got: ${allowed})`);
        }
      } else {
        logError('Unexpected response format');
      }
    } catch (error) {
      logError(`Test failed: ${error.message}`);
    }
    console.log('');
  }
}

async function runAllTests() {
  console.log('\n');
  log(colors.yellow, '╔════════════════════════════════════════════════════════════╗');
  log(colors.yellow, '║    Phase 4.1: Context Detection API Test Suite            ║');
  log(colors.yellow, '╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Health check first
  logInfo('Checking server health...');
  const healthy = await testHealthCheck();

  if (!healthy) {
    logError('Server is not healthy. Please start the server first.');
    logInfo('Run: cd /workspaces/.soul/soul && node server/index.js');
    process.exit(1);
  }

  console.log('\n');

  // Run all tests
  await testExtractKeywords();
  await testEvaluateTrigger();
  await testFindMemories();
  await testDetectAndRetrieve();
  await testGeneratePrompt();
  await testSpamPrevention();

  console.log('\n');
  log(colors.yellow, '╔════════════════════════════════════════════════════════════╗');
  log(colors.yellow, '║    All Tests Completed                                     ║');
  log(colors.yellow, '╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
