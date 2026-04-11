import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();
console.log(process.env.OPENAI_API_KEY);
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const response = await model.invoke("你是谁");
console.log(response.content);
