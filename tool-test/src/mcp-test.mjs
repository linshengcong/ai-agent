import 'dotenv/config';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import chalk from 'chalk';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

const model = new ChatOpenAI({
  modelName: "qwen-plus",
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    'my-mcp-server': {
      command: "node",
      args: [
        "/Users/Zhuanz1/Documents/ai-agent/tool-test/src/my-mcp-server.mjs"
      ]
    },
    'amap-maps-streamableHTTP': {
      url: "https://mcp.amap.com/mcp?key=" + process.env.AMAP_MAPS_API_KEY
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        ...(process.env.ALLOWED_PATHS.split(',') || '')
      ]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--isolated"]
    },
  }
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [
    new HumanMessage(query)
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // 检查是否有工具调用
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return response.content;
    }

    console.log(chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`));
    console.log(chalk.bgBlue(`🔍 工具调用: ${response.tool_calls.map(t => t.name).join(', ')}`));
    // 执行工具调用
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find(t => t.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        // FileSystem MCP 封装的这些 tool 返回的是对象，有 text 属性, 需要兼容
        // 确保 content 是字符串类型
        let contentStr;
        if (typeof toolResult === 'string') {
          contentStr = toolResult;
        } else if (toolResult && toolResult.text) {
          // 如果返回对象有 text 字段，优先使用
          contentStr = toolResult.text;
        } else {
          // 兜底：避免 contentStr 未定义导致 ToolMessage 构造报错
          try {
            contentStr = JSON.stringify(toolResult);
          } catch {
            contentStr = String(toolResult);
          }
        }

        messages.push(new ToolMessage({
          content: contentStr,
          tool_call_id: toolCall.id,
        }));
      }
    }
  }

  return messages[messages.length - 1].content;
}

await runAgentWithTools("福州交通路附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名");
// await runAgentWithTools("帮我规划一下从福州到深圳的路线");
// await runAgentWithTools("查一下用户 005 的信息");
// await runAgentWithTools("MCP Server 的使用指南是什么");

await mcpClient.close();
