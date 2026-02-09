const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const args = process.argv.slice(2);
let targetUrl = '';
let taskId = '';

// --- Argument Parsing ---
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') {
        targetUrl = args[i + 1];
        i++;
    } else if (args[i] === '--task-id') {
        taskId = args[i + 1];
        i++;
    }
}

if (!targetUrl) {
    console.error('Error: --url argument is required.');
    console.log('Usage: node redbook-automator/index.js --url "NOTE_URL" [--task-id "ID"]');
    process.exit(1);
}

// Generate Task ID if not provided
if (!taskId) {
    const now = new Date();
    const format = (n) => n.toString().padStart(2, '0');
    taskId = `auto_${now.getFullYear()}${format(now.getMonth() + 1)}${format(now.getDate())}_${format(now.getHours())}${format(now.getMinutes())}`;
}

const PROJECT_ROOT = process.cwd();
const WORKSPACE_DIR = path.join(PROJECT_ROOT, 'workspace', taskId);
const IMAGES_DIR = path.join(WORKSPACE_DIR, 'images');

// Ensure workspace exists
if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

console.log(`\n=== 🚀 Initiating Redbook Automation Task: ${taskId} ===`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Workspace: ${WORKSPACE_DIR}\n`);


// --- Helper to run commands ---
function runStep(name, command) {
    console.log(`\n--- ► Step: ${name} ---`);
    console.log(`Executing: ${command}`);
    try {
        execSync(command, { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log(`✅ ${name} completed successfully.`);
    } catch (error) {
        console.error(`❌ ${name} failed. Task aborted.`);
        process.exit(1);
    }
}

// --- Step 1: Parse ---
const parserScript = path.join('xiaohongshu-parser', 'index.js');
const rawOutput = path.join('workspace', taskId, '01_raw.json');
// Note: windows path separation might be an issue so we use forward slashes for cross-platform compatibility where possible or rely on node handling
// However, when passing args to node, relative paths work best from project root.
const parseCmd = `node "${parserScript}" --url "${targetUrl}" --output "${rawOutput}"`;
runStep('Parser', parseCmd);


// --- Step 2: Plan ---
const plannerScript = path.join('content-planner', 'index.js');
// Planner takes input file and output dir
const planCmd = `node "${plannerScript}" --input "${rawOutput}" --output-dir "workspace/${taskId}/"`;
runStep('Content Planner', planCmd);


// --- Step 3: Generate Images ---
const generatorScript = path.join('infographic-generator', 'scripts', 'generate.js');
const visualInput = path.join('workspace', taskId, '02_visual_input.json');
// Generator takes input file as first argument, output dir as --output-dir
const generateCmd = `node "${generatorScript}" "${visualInput}" --output-dir "workspace/${taskId}/images/"`;
runStep('Image Generator', generateCmd);


// --- Step 4: Publish ---
const publisherScript = path.join('xiaohongshu-publisher', 'index.js');
const draftFile = path.join('workspace', taskId, '02_draft.json');
// Publisher takes draft file and images dir
const publishCmd = `node "${publisherScript}" --draft "${draftFile}" --images "workspace/${taskId}/images/"`;

console.log('\n--- ⚠️  Pre-Flight Check for Publisher ---');
console.log('Ensure you have a Chrome instance running with remote debugging port 9222.');
console.log('If not, please run ".\\run_publisher.ps1" in a separate terminal now.');
console.log('Waiting 3 seconds before proceeding...');

// Simple wait to let user read the message
const end = Date.now() + 3000;
while (Date.now() < end) { }

runStep('Publisher', publishCmd);

console.log(`\n🎉 All steps completed for task ${taskId}!`);
