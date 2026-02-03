const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const { setGlobalDispatcher, ProxyAgent } = require('undici');

if (process.env.HTTPS_PROXY) {
  const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY);
  setGlobalDispatcher(dispatcher);
  console.log(`Using Proxy: ${process.env.HTTPS_PROXY}`);
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function listModels() {
  try {
    const models = await genAI.getGenerativeModel({ model: 'gemini-pro' }).apiKey 
        ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_API_KEY}`).then(r => r.json())
        : { models: [] }; // Fallback if SDK doesn't have direct list method easily accessible without internal methods
    
    // Actually, the SDK doesn't expose listModels directly on the main class in some versions, 
    // but we can use the API directly via fetch to be sure.
    
    console.log('Available Models:');
    if (models.models) {
        models.models.forEach(m => {
            console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`);
        });
    } else {
        console.log('No models found or error parsing response.');
        console.log(models);
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
