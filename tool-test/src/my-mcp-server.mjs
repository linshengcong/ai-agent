import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 数据库
const database = {
  users: {
    '001': { id: '001', name: '张三', email: 'zhangsan@example.com', role: 'admin' },
    '002': { id: '002', name: '李四', email: 'lisi@example.com', role: 'user' },
    '003': { id: '003', name: '王五', email: 'wangwu@example.com', role: 'user' },
  }
};

const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});


// 注册工具：查询用户信息
server.registerTool('query_user', {
  description: '查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。',
  inputSchema: {
    userId: z.string().describe('用户 ID，例如: 001, 002, 003'),
  },
}, async ({ userId }) => {
  const user = database.users[userId];

  if (!user) {
    return {
      content: [
        {
          type: 'text',
          text: `用户 ID ${userId} 不存在。可用的 ID: 001, 002, 003`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`,
      },
    ],
  };
});


server.registerResource('使用指南', 'docs://guide', {
  description: 'MCP Server 使用文档',
  mimeType: 'text/plain',
}, async () => {
  return {
    contents: [
      {
        uri: 'docs://guide',
        mimeType: 'text/plain',
        text: `MCP Server 使用指南
               功能：提供用户查询等工具。
               使用：在 Cursor 等 MCP Client 中通过自然语言对话，Cursor 会自动调用相应工具。`,
      },
    ],
  };
});


const transport = new StdioServerTransport();
await server.connect(transport);    
/**
总体结构：这是一个最小可用的 MCP Server
这份 my-mcp-server.mjs 做了 4 件事：准备数据 → 创建 MCP 服务器实例 → 注册一个 Tool（可调用能力）→ 注册一个 Resource（可读取文档）→ 用 stdio 启动服务。

1) 依赖导入（1–3 行）
McpServer：MCP 服务端核心类，用来注册 tools/resources 并对外提供能力。
StdioServerTransport：传输层实现之一，用 stdin/stdout 跟 MCP Client 通信（Cursor 常用这种方式启动本地 MCP Server）。
z from zod：用来定义/校验 tool 的入参结构（让客户端知道怎么构造参数，也让服务端能校验类型）。
2) “数据库”模拟（5–12 行）
database 是内存对象，里面有 users 表（其实就是一个以 id 为 key 的 map）。
目的：让你不用接真实 DB，也能演示 “tool 接受参数 → 查数据 → 返回结果”。
3) 创建 MCP Server（14–17 行）
const server = new McpServer({ name, version })
name / version：服务的元信息。客户端可能用于展示、缓存、兼容性判断等。
4) 注册 Tool：query_user（20–48 行）
这一段是“让客户端可调用的能力”。

4.1 Tool 的“声明”（21–26 行）
tool 名：query_user（客户端会用这个名字来调用）
description：给人/模型看的说明（Cursor 会用它来理解何时调用这个 tool）
inputSchema：告诉客户端参数长什么样
这里定义必须传：userId: string
describe(...) 是给参数写注释，帮助模型生成更准确的入参
4.2 Tool 的“实现”（26–48 行）
handler：async ({ userId }) => { ... }
执行逻辑：
从 database.users[userId] 取用户
不存在：返回一段文本提示可用 ID
存在：拼接用户信息并返回
4.3 返回值格式为什么是 content: [{ type: 'text', text: ... }]？
MCP 的 tool 返回通常是“内容块数组”，每个块有类型（例如 text）。
你这里返回的是单个文本块，所以是 content: [ { type: 'text', text: ... } ]。
用数组的好处：将来可以一次返回多段内容（或不同类型的内容块）。
5) 注册 Resource：使用指南 / docs://guide（51–66 行）
这一段是“让客户端可读取的静态/半静态资源”（类似内置文档）。

5.1 Resource 的核心概念
Resource 更像“可被读取的内容”（例如文档、说明、配置示例）
Tool 更像“可被调用的动作/能力”（例如查用户、下单、发请求）
5.2 docs://guide 的含义（uri）
uri 是资源的唯一标识符，客户端用它来定位/请求资源。
docs:// 是你自定义的 scheme（不是 HTTP），表达“这是文档命名空间下的资源”。
这里有两处要区分但通常保持一致：
注册时的资源 ID：server.registerResource(..., 'docs://guide', ...)
返回内容块上的归属标识：contents[0].uri: 'docs://guide'
5.3 为什么 contents 也是数组、且每项有 mimeType？
contents 是数组：一次读取可以返回多个内容条目（分段、多格式、附加内容）。
注册元信息里的 mimeType：资源默认类型（客户端在读之前就知道怎么展示/处理）。
contents 里的 mimeType：每个内容条目的实际类型（可以覆盖默认值；也允许同一资源返回多种格式）。
总结：注册处的 mimeType 是“资源概览”，contents[n].mimeType 是“实际返回的每一块内容”。

6) 启动传输并连接（69–70 行）
const transport = new StdioServerTransport();
await server.connect(transport);
创建 stdio 传输层：让服务通过标准输入输出收发 MCP 消息。
connect 之后：服务器开始监听来自客户端的请求（列出 tools/resources、调用 tool、读取 resource 等）。
7) 这份代码跑起来后，客户端能做什么？
调用 tool：用 query_user + { userId: "001" } 获取用户信息文本
读取 resource：读取 docs://guide 得到“使用指南”那段 text/plain 文本
 */