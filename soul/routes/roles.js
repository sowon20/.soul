/**
 * roles.js
 * Soul의 알바(Worker Roles) API
 *
 * Soul이 전문 작업을 알바에게 위임하는 엔드포인트
 */

const express = require('express');
const router = express.Router();
const { ROLES } = require('../config/roles');
const { AIServiceFactory } = require('../utils/ai-service');

/**
 * POST /api/roles/execute
 * 특정 역할로 작업 실행
 */
router.post('/execute', async (req, res) => {
  try {
    const { roleId, input, options = {} } = req.body;

    if (!roleId || !input) {
      return res.status(400).json({
        success: false,
        error: 'roleId and input are required'
      });
    }

    const role = ROLES[roleId];
    if (!role) {
      return res.status(404).json({
        success: false,
        error: `Role not found: ${roleId}`
      });
    }

    // 모델 선택 (우선 모델 → 폴백)
    const modelId = options.model || role.preferredModel;

    // AI 서비스 생성
    const serviceName = modelId.includes('claude') ? 'anthropic'
      : modelId.includes('gpt') ? 'openai'
      : modelId.includes('gemini') ? 'google'
      : 'anthropic';

    const aiService = await AIServiceFactory.createService(serviceName, modelId);

    // 역할 실행
    const messages = [
      { role: 'user', content: input }
    ];

    const result = await aiService.chat(messages, {
      systemPrompt: role.systemPrompt,
      maxTokens: options.maxTokens || role.maxTokens,
      temperature: options.temperature || role.temperature
    });

    res.json({
      success: true,
      roleId,
      roleName: role.name,
      model: modelId,
      result,
      metadata: {
        input: input.substring(0, 100) + '...',
        outputLength: result.length
      }
    });

  } catch (error) {
    console.error('Error executing role:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/roles/chain
 * 여러 역할을 순차 실행 (체인)
 */
router.post('/chain', async (req, res) => {
  try {
    const { steps, input, options = {} } = req.body;

    if (!steps || !Array.isArray(steps) || !input) {
      return res.status(400).json({
        success: false,
        error: 'steps (array) and input are required'
      });
    }

    let currentInput = input;
    const outputs = [];

    for (const step of steps) {
      const roleId = typeof step === 'string' ? step : step.roleId;
      const stepOptions = typeof step === 'object' ? step.options : {};

      const role = ROLES[roleId];
      if (!role) {
        return res.status(404).json({
          success: false,
          error: `Role not found in chain: ${roleId}`
        });
      }

      // 모델 선택
      const modelId = stepOptions.model || role.preferredModel;
      const serviceName = modelId.includes('claude') ? 'anthropic'
        : modelId.includes('gpt') ? 'openai'
        : modelId.includes('gemini') ? 'google'
        : 'anthropic';

      const aiService = await AIServiceFactory.createService(serviceName, modelId);

      // 실행
      const messages = [
        { role: 'user', content: currentInput }
      ];

      const result = await aiService.chat(messages, {
        systemPrompt: role.systemPrompt,
        maxTokens: stepOptions.maxTokens || role.maxTokens,
        temperature: stepOptions.temperature || role.temperature
      });

      outputs.push({
        step: roleId,
        roleName: role.name,
        model: modelId,
        result
      });

      // 다음 단계의 입력으로 사용
      currentInput = result;
    }

    res.json({
      success: true,
      chain: steps,
      outputs,
      final: currentInput
    });

  } catch (error) {
    console.error('Error executing chain:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/roles
 * 사용 가능한 역할 목록
 */
router.get('/', (req, res) => {
  const roleList = Object.values(ROLES).map(role => ({
    id: role.id,
    name: role.name,
    description: role.description,
    preferredModel: role.preferredModel,
    triggers: role.triggers
  }));

  res.json({
    success: true,
    roles: roleList
  });
});

/**
 * GET /api/roles/:roleId
 * 특정 역할 상세 정보
 */
router.get('/:roleId', (req, res) => {
  const { roleId } = req.params;
  const role = ROLES[roleId];

  if (!role) {
    return res.status(404).json({
      success: false,
      error: `Role not found: ${roleId}`
    });
  }

  res.json({
    success: true,
    role: {
      id: role.id,
      name: role.name,
      description: role.description,
      preferredModel: role.preferredModel,
      fallbackModel: role.fallbackModel,
      maxTokens: role.maxTokens,
      temperature: role.temperature,
      triggers: role.triggers
    }
  });
});

module.exports = router;
