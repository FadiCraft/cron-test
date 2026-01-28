import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const OUTPUT_FILE = path.join(MOVIES_DIR, "Hg.json");

if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== وظائف المساعدة ====================

async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        });
        clearTimeout(id);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        clearTimeout(id);
        return null;
    }
}

// ==================== جلب سيرفرات المشاهدة ====================
async function getWatchServers(watchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة من: ${watchUrl}`);
    const html = await fetchWithTimeout(watchUrl);
    if (!html) return [];

    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const servers = [];

    // 1. البحث في Meta Tag (og:video)
    const metaVideo = doc.querySelector('meta[property="og:video:secure_url"]');
    if (metaVideo?.content) servers.push(metaVideo.content);

    // 2. البحث عن أي iframe يحتوي على embed
    doc.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.src && iframe.src.includes('embed')) servers.push(iframe.src);
    });

    // 3. البحث في الروابط التي تحتوي كلمة embed
    doc.querySelectorAll('a').forEach(a => {
        if (a.href && a.href.includes('embed')) servers.push(a.href);
    });

    return [...new Set(servers)]; // حذف التكرار
}

// ==================== جلب سيرفرات التحميل ====================
async function getDownloadServers(downloadUrl) {
    console.log(`   🔍 جلب سيرفرات التحميل من: ${downloadUrl}`);
    const html = await fetchWithTimeout(downloadUrl);
    if (!html) return [];

    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const servers = [];

    const links = doc.querySelectorAll('.downloadsLink');
    links.forEach(link => {
        const name = link.querySelector('.text span')?.textContent?.trim() || "Unknown";
        const quality = link.querySelector('.text p')?.textContent?.trim() || "";
        const href = link.href;

        if (href && href !== "#") {
            servers.push({ server: name, quality, url: href });
        }
    });

    return servers;
}

// ==================== استخراج بيانات الفيلم التفصيلية ====================
async function fetchMovieDetails(initialMovie) {
    const html = await fetchWithTimeout(initialMovie.url);
    if (!html) return null;

    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // الرابط المختصر و ID
        const shortLink = doc.querySelector('#shortlink')?.value || "";
        const movieId = shortLink.match(/p=(\d+)/)?.[1] || null;

        if (!movieId) return null;

        // روابط الصفحات الفرعية
        const watchPageUrl = doc.querySelector('a.watch')?.href;
        const downloadPageUrl = doc.querySelector('a.download')?.href;

        // استخراج التفاصيل من القائمة
        const details = {
            category: [], genres: [], quality: [], duration: "", 
            year: "", language: "", country: "", actors: []
        };

        doc.querySelectorAll(".RightTaxContent li").forEach(li => {
            const label = li.querySelector("span")?.textContent || "";
            const links = Array.from(li.querySelectorAll("a")).map(a => a.textContent.trim());
            const text = li.querySelector("strong")?.textContent?.trim() || li.textContent.split(':').pop().trim();

            if (label.includes("قسم")) details.category = links;
            else if (label.includes("نوع")) details.genres = links;
            else if (label.includes("جودة")) details.quality = links;
            else if (label.includes("توقيت")) details.duration = text;
            else if (label.includes("موعد")) details.year = links[0] || text;
            else if (label.includes("لغة")) details.language = links[0] || text;
            else if (label.includes("دولة")) details.country = links[0] || text;
            else if (label.includes("بطولة")) details.actors = links;
        });

        const movieObj = {
            id: movieId,
            title: doc.querySelector(".post-title a")?.textContent?.trim() || initialMovie.title,
            image: doc.querySelector(".image img")?.src,
            rating: doc.querySelector(".imdbR span")?.textContent?.trim(),
            story: doc.querySelector(".story p")?.textContent?.trim(),
            details: details,
            watchServers: [],
            downloadServers: [],
            scrapedAt: new Date().toISOString()
        };

        // الانتقال لصفحات المشاهدة والتحميل
        if (watchPageUrl) movieObj.watchServers = await getWatchServers(watchPageUrl);
        if (downloadPageUrl) movieObj.downloadServers = await getDownloadServers(downloadPageUrl);

        return movieObj;

    } catch (e) {
        console.error(`❌ خطأ في تحليل الفيلم: ${initialMovie.title}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء العمل على الصفحة الأولى...");
    
    // 1. جلب قائمة الأفلام من الرئيسية
    const mainHtml = await fetchWithTimeout("https://topcinema.rip/movies/");
    if (!mainHtml) return console.log("❌ فشل الاتصال بالموقع");

    const mainDom = new JSDOM(mainHtml);
    const movieLinks = mainDom.window.document.querySelectorAll('.Small--Box a');
    
    const initialMovies = Array.from(movieLinks).map(el => ({
        title: el.textContent.trim(),
        url: el.href
    })).filter(m => m.url.includes('topcinema.rip'));

    console.log(`✅ تم العثور على ${initialMovies.length} فيلم. جلب التفاصيل...`);

    const finalData = [];

    // 2. جلب تفاصيل كل فيلم بدقة
    for (let i = 0; i < initialMovies.length; i++) {
        const details = await fetchMovieDetails(initialMovies[i]);
        if (details) {
            finalData.push(details);
            console.log(`   ✅ تم بنجاح [${i + 1}/${initialMovies.length}]: ${details.title}`);
        }
        // تأخير بسيط لتجنب الحظر
        await new Promise(r => setTimeout(r, 1000));
    }

    // 3. الحفظ النهائي
    const output = {
        total: finalData.length,
        lastUpdate: new Date().toLocaleString('ar-EG'),
        movies: finalData
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n🎉 اكتمل العمل! تم حفظ ${finalData.length} فيلم في ${OUTPUT_FILE}`);
}

main();
