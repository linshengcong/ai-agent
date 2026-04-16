/**
 * 内存向量数据库
 */
import "dotenv/config";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const model = new ChatOpenAI({
  // temperature=0 让输出更稳定，便于你对比不同检索/Prompt改动带来的影响
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  // 这里建议用专用 embedding 模型，避免和对话模型混用导致效果/成本波动
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
});

const documents = [
  new Document({
    pageContent: `光光是一个活泼开朗的小男孩，他有一双明亮的大眼睛，总是带着灿烂的笑容。光光最喜欢的事情就是和朋友们一起玩耍，他特别擅长踢足球，每次在球场上奔跑时，就像一道阳光一样充满活力。`,
    metadata: { 
      chapter: 1, 
      character: "光光", 
      type: "角色介绍", 
      mood: "活泼" 
    },
  }),
  new Document({
    pageContent: `东东是光光最好的朋友，他是一个安静而聪明的男孩。东东喜欢读书和画画，他的画总是充满了想象力。虽然性格不同，但东东和光光从幼儿园就认识了，他们一起度过了无数个快乐的时光。`,
    metadata: { 
      chapter: 2, 
      character: "东东", 
      type: "角色介绍", 
      mood: "温馨" 
    },
  }),
  new Document({
    pageContent: `有一天，学校要举办一场足球比赛，光光非常兴奋，他邀请东东一起参加。但是东东从来没有踢过足球，他担心自己会拖累光光。光光看出了东东的担忧，他拍着东东的肩膀说："没关系，我们一起练习，我相信你一定能行的！"`,
    metadata: {
      chapter: 3,
      character: "光光和东东",
      type: "友情情节",
      mood: "鼓励",
    },
  }),
  new Document({
    pageContent: `接下来的日子里，光光每天放学后都会教东东踢足球。光光耐心地教东东如何控球、传球和射门，而东东虽然一开始总是踢不好，但他从不放弃。东东也用自己的方式回报光光，他画了一幅画送给光光，画上是两个小男孩在球场上一起踢球的场景。`,
    metadata: {
      chapter: 4,
      character: "光光和东东",
      type: "友情情节",
      mood: "互助",
    },
  }),
  new Document({
    pageContent: `比赛那天终于到了，光光和东东一起站在球场上。虽然东东的技术还不够熟练，但他非常努力，而且他用自己的观察力帮助光光找到了对手的弱点。在关键时刻，东东传出了一个漂亮的球，光光接球后射门得分！他们赢得了比赛，更重要的是，他们的友谊变得更加深厚了。`,
    metadata: {
      chapter: 5,
      character: "光光和东东",
      type: "高潮转折",
      mood: "激动",
    },
  }),
  new Document({
    pageContent: `从那以后，光光和东东成为了学校里最要好的朋友。光光教东东运动，东东教光光画画，他们互相学习，共同成长。每当有人问起他们的友谊，他们总是笑着说："真正的朋友就是互相帮助，一起变得更好的人！"`,
    metadata: {
      chapter: 6,
      character: "光光和东东",
      type: "结局",
      mood: "欢乐",
    },
  }),
  new Document({
    pageContent: `多年后，光光成为了一名职业足球运动员，而东东成为了一名优秀的插画师。虽然他们走上了不同的道路，但他们的友谊从未改变。东东为光光设计了球衣上的图案，光光在每场比赛后都会给东东打电话分享喜悦。他们证明了，真正的友情可以跨越时间和距离，永远闪闪发光。`,
    metadata: {
      chapter: 7,
      character: "光光和东东",
      type: "尾声",
      mood: "温馨",
    },
  }),
];

const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  embeddings,
);
// MemoryVectorStore 适合 demo/单机实验：无外部依赖、可快速迭代；缺点是不持久化、数据量大时会吃内存
// k=3 是个常见折中：上下文足够支撑回答，同时避免把噪声片段塞太多进 Prompt
const retriever = vectorStore.asRetriever({ k: 3 });

const questions = [
  "东东和光光是怎么成为朋友的？"
];

for (const question of questions) {
  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));
  
  // retriever 是“面向应用”的接口：你通常只关心返回的片段本身
  const retrievedDocs = await retriever.invoke(question);
  
  // 额外取 score 主要用于可观测性：方便你判断检索是否跑偏、以及 k 的选择是否合理
  const scoredResults = await vectorStore.similaritySearchWithScore(question, 3);
  
  // 打印用到的文档和相似度评分
  console.log("\n【检索到的文档及相似度评分】");
  retrievedDocs.forEach((doc, i) => {
    // 通过 pageContent 对齐 score（demo 写法）；真实业务建议使用稳定 id，避免重复内容导致匹配歧义
    const scoredResult = scoredResults.find(([scoredDoc]) => 
      scoredDoc.pageContent === doc.pageContent
    );
    const score = scoredResult ? scoredResult[1] : null;
    // LangChain 的 score 多数实现里“越小越相似”（常见是距离），这里做 1-score 仅用于直观展示，不代表严格概率
    const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
    
    console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
    console.log(`内容: ${doc.pageContent}`);
    console.log(`元数据: 章节=${doc.metadata.chapter}, 角色=${doc.metadata.character}, 类型=${doc.metadata.type}, 心情=${doc.metadata.mood}`);
  });
  
  // 用明显的分隔符把片段拆开，降低模型把相邻片段“串读”为同一段的概率
  const context = retrievedDocs
    .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
    .join("\n\n━━━━━\n\n");
  
  // 明确“缺失信息要承认”能显著减少编造（hallucination），对 RAG demo 很关键
  const prompt = `你是一个讲友情故事的老师。基于以下故事片段回答问题，用温暖生动的语言。如果故事中没有提到，就说"这个故事里还没有提到这个细节"。

故事片段:
${context}

问题: ${question}

老师的回答:`;
  
  // 直接使用 model.invoke
  console.log("\n【AI 回答】");
  const response = await model.invoke(prompt);
  console.log(response.content);
  console.log("\n");
}