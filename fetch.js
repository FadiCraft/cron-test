import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const HOME_FILE = path.join(MOVIES_DIR, "Home.json");

if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

const BASE_URL = "https://topcinemaa.com";

// ==================== وظيفة اعتراض الشبكة (Network Interception) ====================
async function interceptM3u8(iframeUrl) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        let foundM3u8 = null;

        // تعيين User-Agent ليبدو كمتصفح حقيقي
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            if (url.includes('.m3u8') || url.includes('playlist.m3u8') || url.includes('master.m3u8')) {
                foundM3u8 = url;
                console.log(`      🎯 تم اعتراض الرابط: ${url.substring(0, 50)}...`);
            }
            request.continue();
        });

        // زيارة الرابط وانتظار استجابة الشبكة
        await page.goto(iframeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // انتظار إضافي بسيط للتأكد من انطلاق طلبات الفيديو
        if (!foundM3u8) {
            await new Promise(resolve => setTimeout(resolve, 4000));
        }

        await browser.close();
        return foundM3u8;
    } catch (error) {
        console.log(`      ⚠️ خطأ في Interception: ${error.message}`);
        if (browser) await browser.close();
        return null;
    }
}

// ==================== دوال المساعدة العامة ====================
async function fetchPage(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        return response.ok ? await response.text() : null;
    } catch (error) {
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractMovieId(url) {
    const match = url.match(/[?&]p=(\d+)/);
    if (match) return match[1];
    const parts = url.split('/').filter(p => p);
    const last = parts[parts.length - 1];
    const num = last?.match(/(\d+)$/);
    return num ? num[1] : `id_${Date.now()}`;
}

// ==================== استخراج سيرفرات المشاهدة والتحميل ====================
async function extractWatchServers(watchUrl) {
    console.log(`   👁️ تحليل صفحة المشاهدة والشبكة...`);
    const html = await fetchPage(watchUrl);
    if (!html) return [];
    
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const servers = [];
    const iframes = doc.querySelectorAll('iframe[src*="embed"], iframe[src*="video"], iframe[src*="player"], iframe[src*="vtube"]');

    for (let i = 0; i < iframes.length; i++) {
        const src = iframes[i].src;
        if (src) {
            console.log(`   🔍 فحص السيرفر ${i + 1}/${iframes.length}...`);
            const m3u8Link = await interceptM3u8(src);
            servers.push({
                name: `سيرفر ${i + 1}`,
                url: src,
                m3u8: m3u8Link,
                type: "iframe_intercepted"
            });
        }
    }
    return servers;
}

async function extractDownloadServers(downloadUrl) {
    const html = await fetchPage(downloadUrl);
    if (!html) return [];
    const dom = new JSDOM(html);
    const servers = [];
    const links = dom.window.document.querySelectorAll('.proServer a.downloadsLink, .download-items a.downloadsLink');
    
    links.forEach(link => {
        servers.push({
            name: cleanText(link.querySelector('p')?.textContent) || "Download Server",
            url: link.href,
            quality: cleanText(link.querySelector('span')?.textContent) || "Unknown"
        });
    });
    return servers;
}

// ==================== استخراج تفاصيل الفيلم ====================
async function fetchMovieDetails(movie) {
    console.log(`\n🎬 جاري معالجة: ${movie.title}`);
    const html = await fetchPage(movie.url);
    if (!html) return null;

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const watchBtn = doc.querySelector('a.watch, a[href*="watch"]');
    const downBtn = doc.querySelector('a.download, a[href*="download"]');

    const movieData = {
        id: extractMovieId(movie.url),
        title: movie.title,
        image: doc.querySelector(".image img")?.src,
        story: cleanText(doc.querySelector(".story p")?.textContent),
        runtime: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        watchServers: watchBtn ? await extractWatchServers(watchBtn.href) : [],
        downloadServers: downBtn ? await extractDownloadServers(downBtn.href) : [],
        scrapedAt: new Date().toISOString()
    };

    return movieData;
}

// ==================== الدالة الرئيسية ====================
async function startScraper() {
    console.log("🚀 بدء العمل على الصفحة الأولى...");
    const html = await fetchPage(`${BASE_URL}/movies/`);
    if (!html) return;

    const dom = new JSDOM(html);
    const movieLinks = dom.window.document.querySelectorAll('.Small--Box a.recent--block');
    const allMovies = [];

    console.log(`✅ تم العثور على ${movieLinks.length} فيلم.`);

    for (let i = 0; i < movieLinks.length; i++) {
        const movie = {
            title: cleanText(movieLinks[i].querySelector('h3.title')?.textContent),
            url: movieLinks[i].href
        };

        const details = await fetchMovieDetails(movie);
        if (details) allMovies.push(details);

        // حفظ مؤقت بعد كل فيلم لضمان عدم ضياع البيانات
        fs.writeFileSync(HOME_FILE, JSON.stringify({ total: allMovies.length, movies: allMovies }, null, 2));
    }

    console.log(`\n🏠 تم الانتهاء! النتائج في ملف: ${HOME_FILE}`);
}

startScraper();
