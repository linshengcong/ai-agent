/**
 * 一个最小可运行的 RAG 示例：
 * 1. 从网页抓取文章正文
 * 2. 将长文本切分为多个片段
 * 3. 为片段生成向量并建立内存向量库
 * 4. 针对问题检索相关片段
 * 5. 把检索结果作为上下文交给大模型生成答案
 */
import "dotenv/config";
import "cheerio";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";

// 负责最终回答问题的聊天模型。
const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 负责把文本转成向量，用于后续语义检索。
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
});

// 抓取掘金文章，并只提取正文段落内容，尽量减少导航栏等噪音。
const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7233327509919547452",
  {
    selector: '.main-area p'
  }
);

// 从目标网页中加载原始文档。
const documents = await cheerioLoader.load();

// 这里预期 loader 会把选中的正文合并成 1 个 Document，先做一次保护性校验。
console.assert(documents.length === 1);
console.log(`Total characters: ${documents[0].pageContent.length}`);

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,  // 每个分块最多约 500 个字符，避免上下文过长。
  chunkOverlap: 50,  // 相邻分块保留重叠区域，减少切分后语义断裂。
  separators: ["。", "！", "？"],  // 优先按中文句子边界切分，让片段更自然。
});

// 把长文章切成适合向量化和检索的小片段。
const splitDocuments = await textSplitter.splitDocuments(documents);

console.log(splitDocuments);


console.log(`文档分割完成，共 ${splitDocuments.length} 个分块\n`);

console.log("正在创建向量存储...");
// 将每个文本分块编码成向量，并存入内存向量库。
// 这里使用 MemoryVectorStore，适合本地实验，不适合大规模持久化场景。
const vectorStore = await MemoryVectorStore.fromDocuments(
  splitDocuments,
  embeddings,
);
console.log("向量存储创建完成\n");

// 示例问题列表，可扩展为多轮批量提问。
const questions = [
  "父亲的去世对作者的人生态度产生了怎样的根本性逆转？"
];

// RAG 主流程：先检索，再把检索结果作为上下文交给模型生成答案。
for (const question of questions) {
  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));

  // 检索与问题最相关的 2 个片段，并同时拿到距离分数。
  const scoredResults = await vectorStore.similaritySearchWithScore(question, 2);

  // 后续拼 prompt 只需要文档内容，因此先把文档对象提取出来。
  const retrievedDocs = scoredResults.map(([doc]) => doc);

  // 输出检索命中的片段，便于观察召回质量。
  console.log("\n【检索到的文档及相似度评分】");
  scoredResults.forEach(([doc, score], i) => {
    // 这里的 score 更接近“距离”，因此用 1 - score 粗略展示为相似度。
    const similarity = (1 - score).toFixed(4);

    console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
    console.log(`内容: ${doc.pageContent}`);
    if (doc.metadata && Object.keys(doc.metadata).length > 0) {
      console.log(`元数据:`, doc.metadata);
    }
  });

  // 将检索到的片段拼成上下文，明确标出片段边界，方便模型引用。
  const context = retrievedDocs
    .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
    .join("\n\n━━━━━\n\n");

  // 用“问题 + 检索上下文”构造一个最简单的回答型 prompt。
  const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：
                  文章内容：
                  ${context}
                  问题: ${question}
                  你的回答:`;

  console.log("\n【AI 回答】");
  // 让模型基于检索出的上下文生成回答。
  const response = await model.invoke(prompt);
  console.log(response.content);
  console.log("\n");
}
