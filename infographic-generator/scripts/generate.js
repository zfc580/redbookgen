const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { setGlobalDispatcher, ProxyAgent, fetch } = require('undici');

// --- Configuration ---
// Keeping proxy configuration to ensure connectivity in this environment
if (process.env.HTTPS_PROXY) {
  const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY);
  setGlobalDispatcher(dispatcher);
  console.log(`Using Proxy: ${process.env.HTTPS_PROXY}`);
}

const API_KEY = process.env.GOOGLE_API_KEY;
// User requested specifically this model
// --- Argument Parsing ---
const args = process.argv.slice(2);
let INPUT_FILE = 'input.json';
let OUTPUT_DIR = 'output';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-dir') {
    OUTPUT_DIR = args[i + 1];
    i++; // skip next arg
  } else if (!args[i].startsWith('--')) {
    INPUT_FILE = args[i];
  }
}

const MODEL_NAME = 'gemini-3-pro-image-preview';
const TEMPLATE_FILE = path.join(__dirname, '../assets/example_asset.txt');

if (!API_KEY) {
  console.error('Error: GOOGLE_API_KEY is not set in .env file.');
  process.exit(1);
}

async function main() {
  try {
    const inputPath = path.resolve(INPUT_FILE);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: Input file not found at ${inputPath}`);
      process.exit(1);
    }
    const pages = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    if (!fs.existsSync(TEMPLATE_FILE)) {
      console.error(`Error: Template file not found at ${TEMPLATE_FILE}`);
      process.exit(1);
    }
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`Starting generation for ${pages.length} pages...`);
    console.log(`Model: ${MODEL_NAME}`);
    console.log(`Method: generateContent (Gemini Native)`);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const content = page.content || page.description || JSON.stringify(page);
      const fullPrompt = template.replace('$CONTENT$', content);

      console.log(`
[Page ${i + 1}/${pages.length}] Generating...`);

      // Documentation: https://ai.google.dev/gemini-api/docs/image-generation
      // Using generateContent endpoint for Gemini models
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

      const payload = {
        contents: [
          { parts: [{ text: fullPrompt }] }
        ],
        // Important: Some Gemini models require specific config to trigger image generation modes,
        // but often the prompt itself is enough.
        // We do NOT set responseMimeType to image/jpeg as it previously caused errors.
        generationConfig: {
          // Optional: You can try to guide parameters here if the model supports them
          // candidateCount: 1
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
          console.error(`API Error: ${data.error.message}`);
          // Log full error details for debugging
          if (data.error.details) console.error('Details:', JSON.stringify(data.error.details));
          continue;
        }

        // Gemini native image generation returns the image inside the candidates
        // Structure: candidates[0].content.parts[].inlineData
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
          let imageFound = false;

          for (const part of data.candidates[0].content.parts) {
            // Case 1: Inline Data (Base64)
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
              const b64Data = part.inlineData.data;
              const buffer = Buffer.from(b64Data, 'base64');
              const filename = `page_${String(i + 1).padStart(2, '0')}.png`;
              const outputPath = path.join(OUTPUT_DIR, filename);
              fs.writeFileSync(outputPath, buffer);
              console.log(`Saved: ${outputPath}`);
              imageFound = true;
              break;
            }

            // Case 2: Executable Code (The model might write code to generate the image? Unlikely for this endpoint but possible)

            // Case 3: Text refusal
            if (part.text) {
              // If we got text but no image, the model likely refused or chatted instead.
              console.log('Model returned text (first 100 chars):', part.text.substring(0, 100));
            }
          }

          if (!imageFound) {
            console.warn('Response received but no inline image data found.');
            // console.log('Full Response:', JSON.stringify(data));
          }

        } else {
          console.warn('No valid candidates returned.');
          console.log('Response:', JSON.stringify(data));
        }

      } catch (err) {
        console.error(`Failed to generate page ${i + 1}:`, err.message);
      }
    }

    console.log('\nAll tasks completed.');

  } catch (error) {
    console.error('Fatal Error:', error);
  }
}

main();