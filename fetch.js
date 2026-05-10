import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const HOME_FILE = path.join(MOVIES_DIR, "Home.json");

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== إعدادات ====================
const BASE_URL = "https://topcinemaa.com";

// ==================== دوال المساعدة ====================
async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url.substring(0, 60)}...`);
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
            'Referer': BASE_URL,
        };
        const response = await fetch(url, { headers });
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status}`);
            return null;
        }
        return await response.text();
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractMovieId(url) {
    try {
        const match = url.match(/[?&]p=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];
        const numMatch = lastPart.match(/(\d+)$/);
        return numMatch ? numMatch[1] : `temp_${Date.now()}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// ==================== البحث عن m3u8 داخل Iframe ====================
async function extractM3u8FromUrl(iframeUrl) {
    try {
        const html = await fetchPage(iframeUrl);
        if (!html) return null;

        // بحث مباشر عن أي رابط ينتهي بـ m3u8 داخل كود الصفحة
        // يتم البحث عن الروابط التي تبدأ بـ http أو https وتنتهي بـ m3u8
        const m3u8Match = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
        
        if (m3u8Match && m3u8Match[1]) {
            return m3u8Match[1].replace(/\\/g, ''); // إزالة خطوط الهروب إن وجدت
        }
        return null;
    } catch (error) {
        console.log(`   ⚠️ لم يتم العثور على m3u8 في الرابط: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum = 1) {
    const url = `${BASE_URL}/movies/`; // استهداف الصفحة الأولى مباشرة
    console.log(`\n📖 ===== جلب الصفحة الرئيسية =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 البحث عن الأفلام...");
        const movieElements = doc.querySelectorAll('.Small--Box a.recent--block');
        console.log(`✅ وجدت ${movieElements.length} فيلم في الصفحة`);
        
        for (let i = 0; i < movieElements.length; i++) {
            const element = movieElements[i];
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes(BASE_URL.replace('https://', ''))) {
                const titleElement = element.querySelector('h3.title');
                const title = cleanText(titleElement?.textContent || `فيلم ${i + 1}`);
                
                movies.push({
                    id: extractMovieId(movieUrl),
                    title: title,
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
            }
        }
        return { url, movies };
    } catch (error) {
        console.error(`❌ خطأ في الصفحة:`, error.message);
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة مع m3u8 ====================
async function extractWatchServers(watchUrl) {
    try {
        console.log(`   👁️ جاري استخراج سيرفرات المشاهدة ورابط m3u8...`);
        const html = await fetchPage(watchUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = [];
        
        const metaTags = ['og:video:secure_url', 'og:video', 'twitter:player:stream', 'video'];
        metaTags.forEach(property => {
            const meta = doc.querySelector(`meta[property="${property}"]`) || 
                         doc.querySelector(`meta[name="${property}"]`);
            if (meta && meta.content) {
                servers.push({
                    name: "مشاهدة مباشرة",
                    url: meta.content,
                    m3u8: meta.content.includes('.m3u8') ? meta.content : null,
                    quality: "متعدد الجودات",
                    type: "meta_stream"
                });
            }
        });
        
        const iframes = doc.querySelectorAll('iframe[src*="embed"], iframe[src*="video"], iframe[src*="player"]');
        
        // استخدام حلقة for...of لانتظار جلب m3u8 من كل iframe
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            if (iframe.src) {
                // محاولة جلب رابط m3u8 المباشر من داخل صفحة الـ iframe
                let m3u8Link = await extractM3u8FromUrl(iframe.src);
                
                servers.push({
                    name: `مشاهدة Iframe ${i + 1}`,
                    url: iframe.src,
                    m3u8: m3u8Link || "غير متوفر حالياً (قد يتطلب Network Interception)", // ✅ تمت إضافة الرابط المباشر
                    quality: "متعدد الجودات",
                    type: "iframe"
                });
            }
        }
        
        console.log(`   ✅ تم العثور على ${servers.length} سيرفر مشاهدة`);
        return servers;
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== دالة متخصصة لاستخراج سيرفرات التحميل ====================
async function extractDownloadServers(downloadUrl) {
    try {
        console.log(`   ⬇️ جاري استخراج سيرفرات التحميل...`);
        const html = await fetchPage(downloadUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = [];
        
        const proServers = doc.querySelectorAll('.proServer a.downloadsLink');
        proServers.forEach(server => {
            const nameElement = server.querySelector('.text p');
            const qualityElement = server.querySelector('.text span');
            servers.push({
                name: cleanText(nameElement?.textContent) || "VidTube",
                url: server.href,
                quality: cleanText(qualityElement?.textContent) || "متعدد الجودات",
                type: "pro_server"
            });
        });
        
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "1080p";
            
            const serverLinks = block.querySelectorAll('ul.download-items a.downloadsLink');
            serverLinks.forEach(link => {
                const nameElement = link.querySelector('.text p');
                const name = cleanText(nameElement?.textContent) || quality;
                servers.push({
                    name: name,
                    url: link.href,
                    quality: quality,
                    type: "download_server"
                });
            });
        });
        
        const uniqueServers = servers.filter((server, index, self) =>
            index === self.findIndex((s) => s.url === server.url)
        );
        
        console.log(`   ✅ تم العثور على ${uniqueServers.length} سيرفر تحميل`);
        return uniqueServers;
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الفيلم الكاملة ====================
async function fetchMovieDetails(movie) {
    console.log(`\n🎬 [${movie.position}] ${movie.title.substring(0, 40)}...`);
    try {
        const html = await fetchPage(movie.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const shortLinkInput = doc.querySelector('input#shortlink');
        let shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        const titleElement = doc.querySelector("h1.post-title a");
        const title = cleanText(titleElement?.textContent || movie.title);
        
        let image = doc.querySelector(".image img")?.src || doc.querySelector("img[src*='MV5B']")?.src;
        const imdbElement = doc.querySelector(".imdbR span, .imdbRating span");
        const imdbRating = imdbElement ? cleanText(imdbElement.textContent) : null;
        
        const storyElement = doc.querySelector(".story p, .entry-content p");
        const story = cleanText(storyElement?.textContent) || "غير متوفر";
        
        const details = {
            "قسم الفيلم": [], "نوع الفيلم": [], "جودة الفيلم": [],
            "توقيت الفيلم": "", "موعد الصدور": [], "دولة الفيلم": [],
            "المخرجين": [], "المؤلفين": [], "بطولة": []
        };
        
        const detailItems = doc.querySelectorAll("ul.RightTaxContent li, .post-details li, .movie-details li");
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span, strong:first-child");
            if (labelElement) {
                let label = cleanText(labelElement.textContent).replace(":", "").trim();
                let value = cleanText(item.textContent.replace(labelElement.textContent, ""));
                const links = item.querySelectorAll("a");
                const linkTexts = links.length > 0 ? Array.from(links).map(a => cleanText(a.textContent)) : [];
                
                if (label.includes('قسم')) details["قسم الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('نوع')) details["نوع الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('جودة')) details["جودة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('توقيت')) details["توقيت الفيلم"] = value;
                else if (label.includes('صدور')) details["موعد الصدور"] = linkTexts.length > 0 ? linkTexts : [value.replace(/[^0-9]/g, '')];
                else if (label.includes('دولة')) details["دولة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('مخرج')) details["المخرجين"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('مؤلف')) details["المؤلفين"] = linkTexts.length > 0 ? linkTexts : [value];
                else if (label.includes('بطولة')) details["بطولة"] = linkTexts.length > 0 ? linkTexts : value.split(',').map(v => cleanText(v));
            }
        });
        
        Object.keys(details).forEach(key => {
            if (Array.isArray(details[key]) && details[key].length === 0) delete details[key];
            else if (key === "توقيت الفيلم" && !details[key]) delete details[key];
        });
        
        let watchServers = [];
        const watchButton = doc.querySelector('a.watch, a[href*="watch"], .watch-btn a');
        if (watchButton && watchButton.href) {
            watchServers = await extractWatchServers(watchButton.href);
        }
        
        let downloadServers = [];
        const downloadButton = doc.querySelector('a.download, a[href*="download"], .download-btn a');
        if (downloadButton && downloadButton.href) {
            downloadServers = await extractDownloadServers(downloadButton.href);
        }
        
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image || null,
            imdbRating: imdbRating,
            story: story,
            details: details,
            runtime: new Date().toLocaleDateString('en-GB').split('/').reverse().join('-'),
            watchServers: watchServers,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية (استخراج الصفحة الأولى فقط) ====================
async function scrapeHomePageOnly() {
    console.log("🚀 بدء الاستخراج (الصفحة الأولى فقط)");
    console.log("=".repeat(60));
    
    // جلب قائمة الأفلام من الصفحة الأولى
    const pageData = await fetchMoviesFromPage(1);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`\n❌ لم يتم العثور على أفلام في الصفحة الرئيسية.`);
        return;
    }
    
    console.log(`📊 جاري استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    const allHomeMovies = [];
    
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        const movieDetails = await fetchMovieDetails(movie);
        
        if (movieDetails) {
            allHomeMovies.push(movieDetails);
        }
        
        // تأخير بسيط لتجنب الحظر (Anti-Ban)
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // حفظ جميع النتائج في Home.json مباشرةً
    const fileContent = {
        fileName: "Home.json",
        description: "جميع أفلام الصفحة الأولى",
        totalMovies: allHomeMovies.length,
        lastUpdated: new Date().toISOString(),
        movies: allHomeMovies
    };
    
    fs.writeFileSync(HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`\n🏠 ✅ تمت العملية بنجاح! تم حفظ ${allHomeMovies.length} فيلم في ${HOME_FILE}`);
}

// تشغيل السكريبت
scrapeHomePageOnly();
