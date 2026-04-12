import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import fs from 'node:fs/promises';
import { z } from 'zod';

// 防止模型陷入无限工具调用循环的最大轮次限制
const MAX_TOOL_ROUNDS = 10;

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 定义 read_file 工具：让模型能够读取本地文件内容
// schema 用 Zod 声明参数结构，LangChain 会自动将其转换为 JSON Schema 传给模型
const readFileTool = tool(
  async ({ filePath }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`  [工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字节`);
    return `文件内容:\n${content}`;
  },
  {
    name: 'read_file',
    description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
    schema: z.object({
      filePath: z.string().describe('要读取的文件路径'),
    }),
  }
);

const tools = [readFileTool];

// 将工具列表绑定到模型，模型响应时可以返回 tool_calls 请求调用工具
const modelWithTools = model.bindTools(tools);

// 支持从命令行参数指定目标文件，默认分析当前文件自身
const targetFile = process.argv[2] || 'src/tool-file-read.mjs';

// 构建初始消息历史：System 设定角色，Human 发出用户请求
// 消息顺序规则：SystemMessage 必须第一条，之后 Human/AI/Tool 按对话轮次追加
const messages = [
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。

工作流程：
1. 用户要求读取文件时，立即调用 read_file 工具
2. 等待工具返回文件内容
3. 基于文件内容进行分析和解释

可用工具：
- read_file: 读取文件内容（使用此工具来获取文件内容）
`),
  new HumanMessage(`请读取 ${targetFile} 文件内容并解释代码`)
];

try {
  // 第一轮调用：模型判断是否需要使用工具
  // 若需要，response 中会携带 tool_calls 字段，而非直接给出文字回答
  let response = await modelWithTools.invoke(messages);
  let toolRounds = 0;

  // Agent 循环：持续执行工具调用，直到模型不再请求工具或达到最大轮次
  // 轮次检查前置在 while 条件中，避免超限后仍执行无效的一轮
  while (response.tool_calls?.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
    toolRounds++;
    console.log(`\n[第 ${toolRounds} 轮，检测到 ${response.tool_calls.length} 个工具调用]`);

    // 并行执行本轮所有工具调用，提升效率
    // 注意：避免用 const tool 命名，防止与顶部导入的 tool 函数发生变量遮蔽
    const toolResults = await Promise.all(
      response.tool_calls.map(async (toolCall) => {
        const matchedTool = tools.find(t => t.name === toolCall.name);
        if (!matchedTool) {
          // 工具未注册时返回错误信息而非抛出异常，让模型感知并自行处理
          return `错误: 找不到工具 ${toolCall.name}`;
        }

        console.log(`  [执行工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
        try {
          return await matchedTool.invoke(toolCall.args);
        } catch (error) {
          return `错误: ${error.message}`;
        }
      })
    );

    // 将本轮 AIMessage（含 tool_calls）和所有 ToolMessage 追加到消息历史
    // OpenAI 要求：ToolMessage 必须紧跟在触发它的 AIMessage 之后，且 tool_call_id 必须一一对应
    messages.push(response);
    response.tool_calls.forEach((toolCall, index) => {
      // ToolMessage.content 必须是字符串，对象类型结果需先序列化
      const result = toolResults[index];
      messages.push(
        new ToolMessage({
          content: typeof result === 'string' ? result : JSON.stringify(result),
          tool_call_id: toolCall.id,
        })
      );
    });

    // 携带完整消息历史（含工具结果）再次调用模型，模型据此生成下一步回复
    response = await modelWithTools.invoke(messages);
  }

  if (toolRounds >= MAX_TOOL_ROUNDS) {
    console.warn(`\n[警告] 已达到最大工具调用轮次 (${MAX_TOOL_ROUNDS})，强制终止循环`);
  }

  console.log('\n[最终回复]');
  console.log(response.content);
} catch (error) {
  console.error(`\n[错误] 执行失败: ${error.message}`);
  process.exit(1);
}
