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

        // --- Robust Data Extraction ---
        console.log('Extracting data...');

        // Method 1: Regex Extraction of __INITIAL_STATE__ from HTML source
        // This is more reliable than window object because it doesn't depend on JS execution timing
        const html = await page.content();

        let match = null;
        // Try multiple variations
        const patterns = [
            /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
            /__INITIAL_STATE__\s*=\s*({.+?});/s,
            /<script>window\.__INITIAL_STATE__=(.+?)<\/script>/
        ];

        for (const p of patterns) {
            match = html.match(p);
            if (match && match[1]) break;
        }

        let data = { title: '', description: '', tags: [], image_urls: [] };
        let stateFound = false;

        if (match && match[1]) {
            try {
                // The regex match might contain undefined as a value which isn't valid JSON
                // We simply replace undefined with null just in case
                let jsonStr = match[1].replace(/:undefined/g, ':null');
                const state = JSON.parse(jsonStr);

                // Deep search for note data
                // We look for an object that has 'title', 'desc', and 'imageList'
                const findNoteData = (obj) => {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj.title !== undefined && obj.desc !== undefined && Array.isArray(obj.imageList)) {
                        return obj;
                    }
                    for (const key in obj) {
                        const found = findNoteData(obj[key]);
                        if (found) return found;
                    }
                    return null;
                };

                const noteData = findNoteData(state);

                if (noteData) {
                    console.log('✅ Successfully extracted structured data from __INITIAL_STATE__');
                    data.title = noteData.title || '';
                    data.description = noteData.desc || '';
                    data.tags = noteData.tagList ? noteData.tagList.map(t => t.name) : [];

                    // Extract High-Res Images
                    // imageList elements usually have urlDefault, urlOriginal, etc.
                    if (noteData.imageList && noteData.imageList.length > 0) {
                        data.image_urls = noteData.imageList.map(img => {
                            // Prioritize original/large images
                            return img.urlOriginal || img.urlDefault || img.url || '';
                        }).filter(u => !!u);

                        // Fix protocol if missing
                        data.image_urls = data.image_urls.map(u => u.startsWith('//') ? 'https:' + u : u);
                    }
                    stateFound = true;
                } else {
                    console.log('⚠️ __INITIAL_STATE__ found but could not locate note data structure.');
                }

            } catch (e) {
                console.warn('⚠️ Failed to parse __INITIAL_STATE__ JSON:', e.message);
            }
        }

        // Method 2: Fallback to DOM (if State failed)
        if (!stateFound || !data.title || data.image_urls.length === 0) {
            console.log('🔄 Fallback: Extracting data from DOM...');

            const domData = await page.evaluate(() => {
                const titleEl = document.querySelector('.title') || document.querySelector('#detail-title');
                const descEl = document.querySelector('.desc') || document.querySelector('#detail-desc');
                const tagsRaw = Array.from(document.querySelectorAll('.tag, #detail-tag')).map(el => el.innerText.replace('#', ''));

                // Detailed Image Logic:
                // 1. Look for 'swiper-slide' having background-image
                // 2. Look for 'note-content' images

                let urls = [];

                // Strategy A: Swiper Slides (Background Images)
                const slides = document.querySelectorAll('.swiper-slide');
                if (slides.length > 0) {
                    slides.forEach(slide => {
                        // Often the image is in a span's background
                        const span = slide.querySelector('span');
                        const style = span ? window.getComputedStyle(span) : window.getComputedStyle(slide);
                        let bg = style.backgroundImage;
                        if (bg && bg !== 'none') {
                            // Remove url("...") wrapper
                            const url = bg.slice(4, -1).replace(/"/g, "");
                            if (url.startsWith('http') || url.startsWith('//')) {
                                urls.push(url);
                            }
                        }
                    });
                }

                // Strategy B: Img tags (sometimes used in different layouts)
                if (urls.length === 0) {
                    const imgs = document.querySelectorAll('.note-content img, .media-container img, main img');
                    imgs.forEach(img => {
                        if (img.src && img.src.startsWith('http')) {
                            // Filter out avatars or icons if possible? 
                            // Usually note images are large.
                            if (img.width > 200 || img.height > 200) {
                                urls.push(img.src);
                            }
                        }
                    });
                }

                return {
                    title: titleEl ? titleEl.innerText : '',
                    description: descEl ? descEl.innerText : '',
                    tags: tagsRaw,
                    image_urls: urls
                };
            });

            // Merge DOM data if State failed
            if (!data.title) data.title = domData.title;
            if (!data.description) data.description = domData.description;
            if (data.tags.length === 0) data.tags = domData.tags;
            // Only overwrite images if we truly failed to get them from state
            if (data.image_urls.length === 0) data.image_urls = domData.image_urls;

            // If we still found nothing, and we are in a browser, maybe try to click dots?
            // (Skipped for now to keep it fast, usually JSON works)
        }

        // Final Cleanup
        data.image_urls = [...new Set(data.image_urls)]; // Dedup
        data.image_urls = data.image_urls.map(u => u.startsWith('//') ? 'https:' + u : u);

        console.log(`Found ${data.image_urls.length} images.`);
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
