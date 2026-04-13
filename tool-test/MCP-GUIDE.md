# MCP 服务器使用指南

## 概述

`mcp-server.mjs` 将你的工具集转换成标准的 **Model Context Protocol (MCP)** 服务器，可以被 Claude Desktop、VS Code 等 AI 工具使用。

## 架构对比

### 之前（LangChain 直接调用）
```
mini-cursor.mjs → [readFile, writeFile, executeCommand, listDirectory]
         ↓
        本地调用
```

### 之后（MCP 服务器）
```
Claude Desktop / VS Code
         ↓ (JSON-RPC 通信)
   mcp-server.mjs
         ↓
[readFile, writeFile, executeCommand, listDirectory]
```

## 安装依赖

```bash
npm install @modelcontextprotocol/sdk
```

## 快速开始

### 方式 1：直接运行（测试用）

```bash
node src/mcp-server.mjs
```

服务器会启动并等待客户端连接。所有日志输出到 stderr。

### 方式 2：在 Claude Desktop 中使用

#### macOS/Linux

编辑 `~/.config/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "ai-agent-tools": {
      "command": "node",
      "args": ["/absolute/path/to/tool-test/src/mcp-server.mjs"],
      "env": {
        "COMMAND_PREFIX": "source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && "
      }
    }
  }
}
```

#### Windows

编辑 `%APPDATA%\Claude\claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "ai-agent-tools": {
      "command": "node",
      "args": ["C:\\path\\to\\tool-test\\src\\mcp-server.mjs"]
    }
  }
}
```

**保存后重启 Claude Desktop**，工具就会出现在对话中。

### 方式 3：在 VS Code 中使用

在 VS Code 的 `settings.json` 中配置：

```json
"mcpServer.servers": {
  "ai-agent-tools": {
    "command": "node",
    "args": ["/path/to/tool-test/src/mcp-server.mjs"],
    "env": {
      "COMMAND_PREFIX": "source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && "
    }
  }
}
```

## 工具列表

MCP 服务器提供以下四个工具：

### 1. read_file
读取文件内容

**参数：**
- `filePath` (string) - 文件路径

**返回：**
```json
{
  "success": true,
  "content": "文件内容..."
}
```

### 2. write_file
写入文件内容（自动创建目录）

**参数：**
- `filePath` (string) - 文件路径
- `content` (string) - 文件内容

**返回：**
```json
{
  "success": true,
  "message": "文件写入成功: /path/to/file"
}
```

### 3. execute_command
执行系统命令

**参数：**
- `command` (string) - 要执行的命令
- `workingDirectory` (string, 可选) - 工作目录

**返回：**
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "命令输出...",
  "stderr": "标准错误..."
}
```

### 4. list_directory
列出目录内容

**参数：**
- `directoryPath` (string) - 目录路径

**返回：**
```json
{
  "success": true,
  "files": ["file1.js", "file2.js", "folder/"]
}
```

## 环境变量

### COMMAND_PREFIX

为所有执行的命令添加前缀。常用于激活特定的 Node 版本：

```bash
export COMMAND_PREFIX="source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && "
node src/mcp-server.mjs
```

或在配置文件中：

```json
"env": {
  "COMMAND_PREFIX": "source ~/.nvm/nvm.sh && nvm use 20 > /dev/null 2>&1 && "
}
```

## 调试

查看 MCP 服务器的日志：

```bash
# 所有日志输出到 stderr
node src/mcp-server.mjs 2>&1 | tee mcp-server.log
```

或在 Claude Desktop 中：
- 点击右上角 **⚙️ 设置**
- 选择 **开发者选项**
- 启用 **MCP 服务器日志**

## 对比：LangChain vs MCP

| 特性 | mini-cursor.mjs | mcp-server.mjs |
|------|-----------------|----------------|
| 通信方式 | 直接函数调用 | JSON-RPC (stdin/stdout) |
| 使用场景 | 本地 Node.js 应用 | Claude Desktop、VS Code 等 |
| 可复用性 | 仅限本项目 | 可被多个 AI 工具使用 |
| 部署 | 本地 | 本地或远程 |
| 配置复杂度 | 低 | 中 |

## 下一步

- 在 Claude Desktop 中测试工具
- 添加更多自定义工具
- 考虑将服务器部署到远程机器
