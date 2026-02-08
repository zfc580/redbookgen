const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function parseArgs() {
    const args = process.argv.slice(2);
    let draftPath = '';
    let imagesDir = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--draft') draftPath = args[i + 1];
        if (args[i] === '--images') imagesDir = args[i + 1];
    }
    if (!draftPath || !imagesDir) {
        process.exit(1);
    }
    return { draftPath, imagesDir };
}

async function getImages(dir) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir)
        .filter(file => {
            if (!/\.(png|jpg|jpeg|webp)$/i.test(file)) return false;
            if (file.startsWith('debug_')) return false;
            return true;
        })
        .sort();
    return files.map(file => path.resolve(dir, file));
}

// 📌 Encapsulated Upload Logic for Retry
async function performUpload(page, images) {
    console.log('--- Starting Upload Process ---');

    // 1. Switch to Image Tab
    console.log('Switching to Image Tab...');
    await page.waitForSelector('div, span', { timeout: 10000 });

    // Explicitly click '上传图文'
    const tabSwitchResult = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim() === '上传图文') {
                node.parentElement.click();
                return true;
            }
        }
        return false;
    });

    if (!tabSwitchResult) {
        console.warn('Tab switch via text failed, trying index fallback...');
        const tabs = await page.$$('.tab-item, .header-tab');
        if (tabs.length >= 2) {
            await tabs[1].click();
        }
    }
    await new Promise(r => setTimeout(r, 2000)); // wait for UI

    // 2. Upload Files (Interaction Mode)
    console.log('Uploading images via FileChooser interception...');

    // Step A: Setup the interceptor
    const fileChooserPromise = page.waitForFileChooser({ timeout: 30000 });

    // Step B: Find and Click the "Upload Area"
    const clickSuccess = await page.evaluate(() => {
        // Try finding the specific "Upload" text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            // "点击上传" (Click to Upload) or "拖拽" (Drag)
            if (node.textContent.includes('点击上传') || node.textContent.includes('拖拽')) {
                // Click the direct parent. Events usually bubble up to the listener.
                console.log("Found upload text node, clicking parent:", node.parentElement);
                node.parentElement.click();
                return true;
            }
        }

        // Fallback: Click generic upload class if text not found
        const uploader = document.querySelector('.upload-input, .upload-btn, .file-picker, .upload-wrapper');
        if (uploader) {
            console.log("Found generic upload class");
            uploader.click();
            return true;
        }
        return false;
    });

    if (!clickSuccess) {
        throw new Error('Could not find clickable Upload Area');
    }

    // Step C: Wait for the file chooser request and accept it
    try {
        const fileChooser = await fileChooserPromise;
        await fileChooser.accept(images);
        console.log(`✅ FileChooser intercepted. Uploading ${images.length} files...`);
    } catch (e) {
        console.error('File Picker did not appear within timeout!', e);
        throw e;
    }

    // 3. Wait for processing (critical for redirect detection)
    console.log('Waiting for upload processing...');
    await new Promise(r => setTimeout(r, 5000));

    // 4. CHECK FOR REDIRECT (The Fix)
    const isLogin = await page.evaluate(() => {
        return window.location.href.includes('login') ||
            !!document.querySelector('.login-container') ||
            !!document.querySelector('.qrcode-box');
    });

    if (isLogin) {
        console.error('❌ REDIRECTED TO LOGIN AFTER UPLOAD!');
        return { success: false, reason: 'login_redirect' };
    }

    // 5. Verify Thumbnails
    const hasThumbnails = await page.evaluate(() => {
        return !!document.querySelector('.drag-item, .preview-item, .image-preview, .media-list, .file-item');
    });

    if (!hasThumbnails) {
        console.warn('⚠️ No thumbnails detected. Upload might have failed silently.');
    }

    return { success: true };
}

async function main() {
    const { draftPath, imagesDir } = await parseArgs();

    try {
        if (!fs.existsSync(draftPath)) throw new Error(`Draft file not found: ${draftPath}`);
        const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
        const images = await getImages(imagesDir);

        console.log(`Preparing to publish: ${draft.title}`);

        // 🔹 CONNECT TO EXISTING BROWSER
        console.log('Connecting to existing Chrome on port 9222...');
        let browser;
        try {
            browser = await puppeteer.connect({
                browserURL: 'http://127.0.0.1:9222',
                defaultViewport: null,
            });
            console.log('✅ Connected to existing Chrome!');
        } catch (e) {
            console.error('❌ Failed to connect to Chrome. Did you launch it with --remote-debugging-port=9222?');
            throw e;
        }

        const pages = await browser.pages();
        // Find the page that is likely the creator center, or use the first one
        let page = pages.find(p => p.url().includes('xiaohongshu.com')) || pages[0];

        if (!page) {
            console.log('No existing page found, creating new one...');
            page = await browser.newPage();
        } else {
            console.log(`Using existing page: ${page.url()}`);
            await page.bringToFront();
        }

        const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish';

        // Only navigate if we are not already there to save time/risk
        if (!page.url().includes('/publish/publish')) {
            console.log(`Navigating to ${PUBLISH_URL}...`);
            await page.goto(PUBLISH_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        } else {
            console.log('Already on publish page, refreshing to ensure clean state...');
            await page.reload({ waitUntil: 'networkidle2' });
        }

        // --- Upload Loop with Retry ---
        let uploadSuccess = false;
        let attempts = 0;

        while (!uploadSuccess && attempts < 3) {
            attempts++;
            try {
                const result = await performUpload(page, images);

                if (result.success) {
                    uploadSuccess = true;
                    console.log('✅ Upload Sequence Completed Successfully.');
                } else if (result.reason === 'login_redirect') {
                    console.log('⏳ Waiting for manual login to complete (in your browser window)...');
                    // Wait until back on publish page
                    while (true) {
                        await new Promise(r => setTimeout(r, 3000));
                        const currentUrl = page.url();
                        if (currentUrl.includes('/publish') && !currentUrl.includes('login')) {
                            console.log('✅ Detected return to Publish Page! Retrying upload...');
                            await page.reload({ waitUntil: 'networkidle2' });
                            break;
                        }
                    }
                }
            } catch (e) {
                console.error(`Attempt ${attempts} failed:`, e);
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        if (!uploadSuccess) {
            console.error('❌ Upload failed after multiple attempts. Please do it manually.');
        } else {
            // --- Fill Content ---
            console.log('Filling title...');
            let titleInput = await page.$('input[placeholder*="标题"]');
            if (!titleInput) titleInput = await page.$('.title-input, .c-input');

            if (titleInput) {
                await titleInput.click({ clickCount: 3 });
                await titleInput.type(draft.title, { delay: 100 });
            } else {
                console.warn('Could not find Title input!');
            }

            console.log('Filling content...');
            const contentEditor = await page.$('#post-textarea, .ql-editor, .c-editor, div[contenteditable="true"]');
            if (contentEditor) {
                await contentEditor.click();
                await contentEditor.type(draft.content || '', { delay: 50 });
            } else {
                console.warn('Could not find Content editor!');
            }

            console.log('✅ Draft Filled! Please review and click Publish.');
        }

        // Do not disconnect/close browser to let user publish
        console.log('Done. Browser left open for you.');

    } catch (error) {
        console.error('Publisher Error:', error);
    }
}

main();
