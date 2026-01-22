/**
 * mcp-tools.js
 * MCP 도구 로더 및 실행기
 */

const fs = require('fs');
const path = require('path');

// MCP 도구 캐시
let toolsCache = null;
let executorsCache = {};

/**
 * MCP 도구 목록 로드
 * @returns {Array} Claude API tools 형식의 도구 배열
 */
function loadMCPTools() {
  if (toolsCache) return toolsCache;

  const toolsPath = path.join(__dirname, '../../mcp/tools');
  const tools = [];
  executorsCache = {};

  try {
    const files = fs.readdirSync(toolsPath);

    for (const file of files) {
      if (!file.endsWith('.js')) continue;

      try {
        const toolModule = require(path.join(toolsPath, file));

        if (toolModule.tools && Array.isArray(toolModule.tools)) {
          // Claude API 형식으로 변환
          for (const tool of toolModule.tools) {
            tools.push({
              name: tool.name,
              description: tool.description,
              input_schema: tool.input_schema || tool.inputSchema || { type: 'object', properties: {} }
            });

            // 실행기 등록
            if (toolModule.executeTool) {
              executorsCache[tool.name] = toolModule.executeTool;
            }
          }
        }
      } catch (error) {
        console.error(`Failed to load tool module ${file}:`, error.message);
      }
    }

    toolsCache = tools;
    console.log(`[MCP] Loaded ${tools.length} tools from ${Object.keys(executorsCache).length} modules`);
  } catch (error) {
    console.error('Failed to load MCP tools:', error);
  }

  return tools;
}

/**
 * MCP 도구 실행
 * @param {string} toolName - 도구 이름
 * @param {object} input - 입력 파라미터
 * @returns {Promise<any>} 실행 결과
 */
async function executeMCPTool(toolName, input) {
  // 캐시 확인
  if (!toolsCache) {
    loadMCPTools();
  }

  const executor = executorsCache[toolName];

  if (!executor) {
    return {
      success: false,
      error: `도구를 찾을 수 없습니다: ${toolName}`
    };
  }

  try {
    console.log(`[MCP] Executing tool: ${toolName}`, input);
    const result = await executor(toolName, input);
    console.log(`[MCP] Tool result:`, result);
    return result;
  } catch (error) {
    console.error(`[MCP] Tool execution error:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Google Home 관련 도구만 가져오기
 */
function getGoogleHomeTools() {
  const allTools = loadMCPTools();
  return allTools.filter(t =>
    ['list_smart_devices', 'get_device_state', 'search_devices', 'get_rooms_summary', 'control_smart_device'].includes(t.name)
  );
}

/**
 * 캐시 초기화
 */
function clearCache() {
  toolsCache = null;
  executorsCache = {};
}

module.exports = {
  loadMCPTools,
  executeMCPTool,
  getGoogleHomeTools,
  clearCache
};
