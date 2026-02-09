const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { setGlobalDispatcher, ProxyAgent, fetch } = require('undici');

// --- Proxy Config ---
if (process.env.HTTPS_PROXY) {
    const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY);
    setGlobalDispatcher(dispatcher);
}

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = 'gemini-3-pro-preview'; // User explicitly requested this model

async function parseArgs() {
    const args = process.argv.slice(2);
    let inputPath = '';
    let outputDir = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input') inputPath = args[i + 1];
        if (args[i] === '--output-dir') outputDir = args[i + 1];
    }

    if (!inputPath || !outputDir) {
        console.error('Usage: node content-planner/index.js --input <PATH> --output-dir <DIR>');
        process.exit(1);
    }
    return { inputPath, outputDir };
}

const SYSTEM_PROMPT = `
你是一位顶级的小红书爆款内容策划专家。你的任务是基于用户提供的“原始笔记内容”（标题、正文）以及“原始笔记图片”，进行深度的拆解、重构和仿写。你不仅要理解文本，还要“看懂”图片中的信息（文字、排版、设计风格），并将这些精华融入到新的创作中。

请输出一个标准的 JSON 对象，包含两个主要部分：
1. "draft": 新的笔记文案（包含标题和正文）。
2. "visual_script": 给插画师的作图指令（Infographic Script）。

### 1. 文案要求 (draft)
- **标题**：
  - **严禁超过 20 个字符（包含标点符号、Emoji）**。
  - **建议 18-20 字最佳**。
- **正文**：
  - 必须融合图片中提取出来的关键信息（如果图片里有干货而在正文中未提及，记得补全）。
  - 采用小红书爆款风格（Emoji丰富、分段清晰、口语化）。
  - 结构：吸引人的开头 + 干货/价值点/故事 + 互动结尾 + 标签。
  - 字数控制在 400-800 字之间。

### 2. 作图指令要求 (visual_script)
这是一个数组，每个元素代表一张图的生成脚本，你需要为 AI 绘图师详细描述每一张图的画面。
- **图片数量原则**：请优先参考【原始笔记】的图片数量（如果原笔记有 N 张图，尽量也规划 N 张）。
- **最终决定权**：如果原图太少无法讲清，或者原图太多内容重复，你可以根据内容的逻辑完整性进行增减。一切以“把事情讲清楚、讲精彩”为最高准则。
- **结构建议**：
  - **封面图**：必须极具吸引力。
  - **内容图**：根据知识点拆分，确保信息密度适中。
  - **结尾图**：互动或总结。
- **Content 字段必须极其详细**，包含以下维度：
  1. **【总体画面】**：描述背景色、构图方式（上下结构/左右结构/居中）、核心视觉元素（人物/物体/图标）。
  2. **【文字内容】**：你需要把这张图上出现的每一个字都写清楚。明确区分“主标题”、“副标题”、“正文列表”、“标注文字”。
  3. **【排版位置】**：指定文字放在画面的什么位置（如“顶部居中大标题”、“左侧竖排列表”）。
  4. **【插图细节】**：具体的装饰元素（如“右下角画一只手拿着笔”、“标题旁边加个爆炸贴纸”）。
- **格式**：每个对象的 "content" 字段是一个长字符串，**不要使用换行符**，使用句号或空格分隔。

### JSON 输出示例
\`\`\`json
{
  "draft": {
    "title": "七天搞定空间思维，孩子数学成绩蹭蹭涨！", 
    "content": "..."
  },
  "visual_script": [
    { 
      "id": 1, 
      "content": "【总体画面】暖黄色背景，模仿手工剪纸风格。画面中央是一本打开的立体的书。【文字内容】顶部核心大标题：形状认知，你教对了吗？醒目副标题：别只教“这是圆”！底部标：3-6岁数学启蒙。【排版布局】大标题在顶部居中，使用粗体；立体书在中间占大面积。【插图】书本周围散落着积木和七巧板。" 
    }
  ]
}
\`\`\`
`;

async function callGemini(rawContent) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

    // 1. Prepare Text Part
    const textPrompt = `
    请分析并重构这篇小红书笔记。
    
    【原始文本信息】
    原标题：${rawContent.data.title}
    原正文：${rawContent.data.description}
    `;

    const contentsPart = [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] }
    ];

    const userMessageParts = [{ text: textPrompt }];

    // 2. Prepare Image Parts (Multimodal)
    // We expect rawContent.data.image_urls to contain URLs.
    // Gemini API expects base64 data for images ("inlineData").
    // So we need to fetch these images first.

    if (rawContent.data.image_urls && rawContent.data.image_urls.length > 0) {
        console.log(`Fetching ${rawContent.data.image_urls.length} images for analysis...`);
        let imagesSuccessCount = 0;

        for (const imgUrl of rawContent.data.image_urls) {
            try {
                // Fetch image (using proxy if needed)
                const imgRes = await fetch(imgUrl);
                if (!imgRes.ok) {
                    console.warn(`Failed to fetch image: ${imgUrl}`);
                    continue;
                }
                const arrayBuffer = await imgRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const base64Image = buffer.toString('base64');
                const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

                userMessageParts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                });
                imagesSuccessCount++;
            } catch (err) {
                console.warn(`Error processing image ${imgUrl}:`, err.message);
            }
        }
        console.log(`Successfully attached ${imagesSuccessCount} images to prompt.`);
    }

    // Add the assembled User Message
    contentsPart.push({ role: "user", parts: userMessageParts });

    const payload = {
        contents: contentsPart,
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message}`);
        }

        if (!data.candidates || !data.candidates[0].content) {
            throw new Error('Gemini API returned no candidates');
        }

        let textOutput = data.candidates[0].content.parts[0].text;

        // --- Robust JSON Parsing ---
        // 1. Remove Markdown code blocks
        textOutput = textOutput.replace(/```json/g, '').replace(/```/g, '');

        // 2. Find the first '{' and last '}'
        const firstOpen = textOutput.indexOf('{');
        const lastClose = textOutput.lastIndexOf('}');

        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            textOutput = textOutput.substring(firstOpen, lastClose + 1);
        }

        return JSON.parse(textOutput);

    } catch (error) {
        console.error('LLM Request Failed:', error);
        throw error;
    }
}

async function main() {
    const { inputPath, outputDir } = await parseArgs();

    try {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }

        const rawJson = fs.readFileSync(inputPath, 'utf8');
        const rawContent = JSON.parse(rawJson);

        console.log(`Analyzing content: "${rawContent.data.title}"...`);
        const plannedContent = await callGemini(rawContent);

        // Save Draft
        const draftPath = path.join(outputDir, '02_draft.json');
        fs.writeFileSync(draftPath, JSON.stringify(plannedContent.draft, null, 2));
        console.log(`Saved Draft: ${draftPath}`);

        // Save Visual Script (Input for Infographic Generator)
        const visualPath = path.join(outputDir, '02_visual_input.json');
        fs.writeFileSync(visualPath, JSON.stringify(plannedContent.visual_script, null, 2));
        console.log(`Saved Visual Input: ${visualPath}`);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

main();
