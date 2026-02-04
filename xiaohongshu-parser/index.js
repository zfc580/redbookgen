const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const USER_DATA_DIR = path.resolve(__dirname, 'user_data');

async function parseArgs() {
    const args = process.argv.slice(2);
    let url = '';
    let outputPath = '';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--url') url = args[i + 1];
        if (args[i] === '--output') outputPath = args[i + 1];
    }

    if (!url || !outputPath) {
        console.error('Usage: node xiaohongshu-parser/index.js --url <URL> --output <OUTPUT_PATH>');
        process.exit(1);
    }
    return { url, outputPath };
}

async function scrape(url) {
    console.log(`Launching Stealth browser...`);
    console.log(`User Data Dir: ${USER_DATA_DIR}`);

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1280, height: 800 },
        userDataDir: USER_DATA_DIR, // Automatically persistence of cookies/localStorage
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' // Extra measure
        ]
    });

    const page = await browser.newPage();

    // Stealth plugin handles User-Agent and navigator.webdriver, but being explicit doesn't hurt
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // --- Wait for Meaningful Content or Login ---
        console.log('Waiting for page content to stabilize...');

        let needRefresh = false;

        try {
            await page.waitForFunction(
                () => {
                    const title = document.querySelector('.title') || document.querySelector('#detail-title');
                    const isLogin = document.body.innerText.includes('手机号登录') || document.title.includes('登录');

                    // Ready if:
                    // 1. Title exists AND is not "手机号登录"
                    const hasValidTitle = title && title.innerText.trim().length > 0 && !title.innerText.includes('手机号登录');

                    // 2. OR explicitly on login page
                    if (isLogin) {
                        return true;
                    }

                    // 3. OR initial state is loaded
                    if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.note) return true;

                    return hasValidTitle;
                },
                { timeout: 15000 }
            );
        } catch (e) {
            console.warn('Initial wait timeout.');
        }

        // Double check login status
        const isLoginPage = await page.evaluate(() => {
            return document.body.innerText.includes('手机号登录') || document.title.includes('登录');
        });

        if (isLoginPage) {
            console.log('\n!!! ACTION REQUIRED !!!');
            console.log('Login Page Detected. Please LOGIN manually in the browser window.');
            console.log('NOTE: Since we updated the browser to "Stealth Mode", login should succeed now.');
            console.log('Script will wait for 120s for you to finish login...');

            try {
                // Wait for success indicator (Title appearing)
                await page.waitForFunction(
                    () => {
                        const t = document.querySelector('.title') || document.querySelector('#detail-title');
                        return t && !t.innerText.includes('手机号登录');
                    },
                    { timeout: 120000 }
                );
                console.log('Login success detected!');
                needRefresh = true;
            } catch (e) {
                console.error('Timeout waiting for login. Proceeding anyway.');
            }
        } else {
            console.log('Page loaded directly (Cookies valid).');
        }

        if (needRefresh) {
            console.log('Reloading page to ensure content renders correctly...');
            await new Promise(r => setTimeout(r, 2000));
            await page.reload({ waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 3000));
        }

        console.log('Extracting data...');

        // 1. Try __INITIAL_STATE__
        const initialState = await page.evaluate(() => window.__INITIAL_STATE__);

        let data = {};

        if (initialState && initialState.note && initialState.note.noteDetailMap) {
            console.log('Found __INITIAL_STATE__, extracting structured data.');
            const keys = Object.keys(initialState.note.noteDetailMap);
            // Try to find the one matching URL or just first one
            // The noteId is the last part of URL usually
            let targetKey = keys[0];
            const noteData = initialState.note.noteDetailMap[targetKey].note;

            if (noteData) {
                data = {
                    title: noteData.title,
                    description: noteData.desc,
                    tags: noteData.tagList ? noteData.tagList.map(t => t.name) : [],
                    image_urls: noteData.imageList ? noteData.imageList.map(img => img.urlDefault || img.url) : []
                };
            }
        }

        // 2. Fallback to DOM
        if (!data.title) {
            console.log('__INITIAL_STATE__ parse failed, fallback to DOM.');
            data = await page.evaluate(() => {
                const titleEl = document.querySelector('.title') || document.querySelector('#detail-title');
                const descEl = document.querySelector('.desc') || document.querySelector('#detail-desc');

                // Try to find images in swiper
                // Helper to get background image URL
                const getBgUrl = (el) => {
                    const bg = window.getComputedStyle(el).backgroundImage;
                    return bg && bg !== 'none' ? bg.slice(4, -1).replace(/"/g, "") : null;
                };

                const imgEls = Array.from(document.querySelectorAll('.swiper-wrapper .swiper-slide span'));
                let urls = imgEls.map(getBgUrl).filter(u => u && u.startsWith('http'));

                // Fallback: looking for normal img tags if not swiper
                if (urls.length === 0) {
                    const imgs = Array.from(document.querySelectorAll('.note-content img, .media-container img'));
                    urls = imgs.map(img => img.src);
                }

                return {
                    title: titleEl ? titleEl.innerText : '',
                    description: descEl ? descEl.innerText : '',
                    image_urls: urls
                };
            });
        }

        return data;

    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    } finally {
        // Keep browser open slightly longer if needed for debugging, but generally close it
        await browser.close();
    }
}

async function main() {
    const { url, outputPath } = await parseArgs();

    try {
        const data = await scrape(url);

        const output = {
            meta: {
                url,
                timestamp: new Date().toISOString()
            },
            data
        };

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`Success! Data saved to ${outputPath}`);
        console.log(`Title: ${data.title}`);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

main();
