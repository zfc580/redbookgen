const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Re-use the user data dir from the parser to share login state
const USER_DATA_DIR = path.resolve(__dirname, '../xiaohongshu-parser/user_data');
// const USER_DATA_DIR = path.resolve(__dirname, 'user_data_temp_' + Date.now());

async function parseArgs() {
    const args = process.argv.slice(2);
    let draftPath = '';
    let imagesDir = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--draft') draftPath = args[i + 1];
        if (args[i] === '--images') imagesDir = args[i + 1];
    }

    if (!draftPath || !imagesDir) {
        console.error('Usage: node xiaohongshu-publisher/index.js --draft <JSON_PATH> --images <DIR_PATH>');
        process.exit(1);
    }
    return { draftPath, imagesDir };
}

async function getImages(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file))
        .map(file => path.join(dir, file))
        .sort(); // Ensure order by filename (page_01, page_02...)
}

async function main() {
    const { draftPath, imagesDir } = await parseArgs();

    try {
        // 1. Load Data
        if (!fs.existsSync(draftPath)) throw new Error(`Draft file not found: ${draftPath}`);
        const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

        const images = await getImages(imagesDir);
        if (images.length === 0) throw new Error(`No images found in ${imagesDir}`);

        console.log(`Preparing to publish:`);
        console.log(`- Title: ${draft.title}`);
        console.log(`- Images: ${images.length} files`);

        // 2. Launch Browser
        const browser = await puppeteer.launch({
            headless: false, // Must be visible for this kind of operation
            defaultViewport: null,
            userDataDir: USER_DATA_DIR,
            args: ['--start-maximized', '--no-sandbox', '--disable-web-security']
        });

        const page = await browser.newPage();

        // Go to Creator Center Publish Page
        const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish';
        console.log(`Navigating to ${PUBLISH_URL}...`);
        await page.goto(PUBLISH_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.screenshot({ path: path.join(imagesDir, 'debug_01_navigated.png') });

        // 3. Check Login
        // If redirected to login page, we need intervention
        if (page.url().includes('login') || (await page.$('.login-container'))) {
            console.log('!!! Login Session Expired... !!!');
            await page.screenshot({ path: path.join(imagesDir, 'debug_02_login_fail.png') });
            console.log('Waiting 120s for login...');
            await page.waitForNavigation({ timeout: 120000, waitUntil: 'networkidle2' });
        }
        await page.screenshot({ path: path.join(imagesDir, 'debug_03_logged_in.png') });

        // 4. Upload Images
        console.log('Switching to Image Tab...');

        // Robust Tab Switching Logic
        // We need to find the tab that contains text "图文" (Image/Text) and click it.
        try {
            // Wait for tabs to render
            await page.waitForSelector('div, span', { timeout: 10000 });

            const clicked = await page.evaluate(() => {
                // Find all elements that might be the tab
                const elements = Array.from(document.querySelectorAll('div, span, li, .title'));
                for (const el of elements) {
                    // Match "上传图文" exactly or "图文"
                    // The text dump shows "上传图文" in a span.title
                    if (el.innerText && (el.innerText.trim() === '上传图文' || el.innerText.trim() === '图文')) {
                        el.click();
                        return true;
                    }
                }
                return false;
            });

            if (clicked) {
                console.log('Clicked "Image/Text" tab via DOM evaluation.');
                await new Promise(r => setTimeout(r, 2000)); // Wait for UI switch
            } else {
                console.warn('Could not identify "Image" tab. Assuming default or manual intervention needed.');
            }
        } catch (e) {
            console.error('Tab switching error:', e);
        }

        // Click the upload area first to wake up the UI
        try {
            const uploadBox = await page.$('.upload-container, .upload-wrapper, .file-picker');
            if (uploadBox) await uploadBox.click();
        } catch (e) { }

        try {
            await page.waitForSelector('input[type=file]', { timeout: 15000 });
        } catch (e) {
            console.error('Wait for file input failed!');
            await page.screenshot({ path: path.join(imagesDir, 'debug_04_upload_fail.png') });
            throw e;
        }

        const uploadHandle = await page.$('input[type=file]');
        if (uploadHandle) {
            // Hack: Force the input to accept multiple files just in case the DOM attribute is missing
            await page.evaluate((el) => el.setAttribute('multiple', ''), uploadHandle);
            await uploadHandle.uploadFile(...images);
            await page.screenshot({ path: path.join(imagesDir, 'debug_05_uploaded.png') });
        } else {
            throw new Error('Could not find file input element.');
        }

        // Wait for upload processing
        console.log('Waiting for images to process...');
        await new Promise(r => setTimeout(r, 5000));
        await page.screenshot({ path: path.join(imagesDir, 'debug_06_processing.png') });

        // 5. Fill Title
        console.log('Filling title...');
        // Use Puppeteer new locator or reliable css
        // Title input usually has placeholder "填写标题..."
        // Safe robust way: find input where placeholder includes '标题'
        try {
            // Using standard CSS selector with attribute partial match
            const titleInput = await page.waitForSelector('input[placeholder*="标题"]', { timeout: 5000 });
            if (titleInput) {
                await titleInput.click({ clickCount: 3 });
                await titleInput.type(draft.title, { delay: 100 });
                await page.screenshot({ path: path.join(imagesDir, 'debug_07_title_filled.png') });
            }
        } catch (e) {
            console.warn('Could not find Title input: ' + e.message);
            await page.screenshot({ path: path.join(imagesDir, 'debug_07_title_fail.png') });
        }

        // 6. Fill Content
        console.log('Filling content...');
        try {
            // Content editor usually matches this
            // Updated: Include generic contenteditable div as a fallback
            const contentEditor = await page.waitForSelector('#post-textarea, .ql-editor, .c-editor, div[contenteditable="true"]', { timeout: 5000 });
            if (contentEditor) {
                await contentEditor.click();
                await contentEditor.type(draft.content || '', { delay: 50 });
                await page.screenshot({ path: path.join(imagesDir, 'debug_08_content_filled.png') });
            }
        } catch (e) {
            console.warn('Could not find Content editor: ' + e.message);
            await page.screenshot({ path: path.join(imagesDir, 'debug_08_content_fail.png') });
        }

        console.log('---------------------------------------------------');
        console.log('✅ Draft Filled Successfully!');
        console.log('⚠️  AUTO-PUBLISH IS DISABLED FOR SAFETY.');
        console.log('👉 Please review the draft in the browser window.');
        console.log('👉 Click "Publish" manually when ready.');
        console.log('---------------------------------------------------');

        // Keep browser open for user review
        // await browser.close(); 

    } catch (error) {
        console.error('Publisher Error:', error);
        // Do not close browser on error so user can debug
    }
}

main();
