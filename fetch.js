import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إنشاء مجلد movies إذا لم يكن موجوداً
const moviesDir = path.join(__dirname, "movies");
if (!fs.existsSync(moviesDir)) {
    fs.mkdirSync(moviesDir, { recursive: true });
}

// دالة لتنظيف النص
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
}

// دالة لاستخراج ID من الرابط المختصر
function extractMovieId(url) {
    const match = url.match(/p=(\d+)/);
    return match ? match[1] : Date.now().toString();
}

// دالة لاستخراج بيانات الفيلم من صفحته
async function fetchMovieDetails(movieUrl) {
    try {
        console.log(`🎬 جاري استخراج بيانات الفيلم: ${movieUrl}`);
        const response = await fetch(movieUrl);
        if (!response.ok) throw new Error(`فشل الاتصال: ${response.status}`);
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector("#shortlink");
        const shortLink = shortLinkInput ? shortLinkInput.value : movieUrl;
        const movieId = extractMovieId(shortLink);

        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        
        // استخراج القصة
        const story = cleanText(doc.querySelector(".story p")?.textContent);

        // استخراج التفاصيل
        const details = {};
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        detailItems.forEach(item => {
            const label = cleanText(item.querySelector("span")?.textContent);
            if (label) {
                const values = Array.from(item.querySelectorAll("a"))
                    .map(a => cleanText(a.textContent));
                details[label.replace(":", "").trim()] = values.length > 0 ? values : cleanText(item.textContent.split(":").pop());
            }
        });

        // استخراج سيرفرات المشاهدة
        const watchPageUrl = doc.querySelector(".watch")?.href;
        let watchServer = null;
        if (watchPageUrl) {
            watchServer = await fetchWatchServer(watchPageUrl);
        }

        // استخراج سيرفرات التحميل
        const downloadPageUrl = doc.querySelector(".download")?.href;
        let downloadServers = {};
        if (downloadPageUrl) {
            downloadServers = await fetchDownloadServers(downloadPageUrl);
        }

        // تجميع بيانات الفيلم
        const movieData = {
            id: movieId,
            title: title,
            url: movieUrl,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchServer: watchServer,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };

        // حفظ بيانات الفيلم في ملف JSON
        const movieFileName = `movie_${movieId}.json`;
        const movieFilePath = path.join(moviesDir, movieFileName);
        fs.writeFileSync(movieFilePath, JSON.stringify(movieData, null, 2), "utf8");
        
        console.log(`✅ تم حفظ بيانات الفيلم: ${movieFileName}`);
        return movieData;

    } catch (error) {
        console.error(`❌ خطأ في استخراج بيانات الفيلم: ${error.message}`);
        return null;
    }
}

// دالة لاستخراج سيرفر المشاهدة
async function fetchWatchServer(watchPageUrl) {
    try {
        console.log(`🎥 جاري استخراج سيرفر المشاهدة: ${watchPageUrl}`);
        const response = await fetch(watchPageUrl);
        if (!response.ok) throw new Error(`فشل الاتصال: ${response.status}`);
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن رابط الفيديو في meta tags
        const metaVideo = doc.querySelector('meta[property="og:video:secure_url"], meta[property="og:video"]');
        const videoUrl = metaVideo ? metaVideo.content : null;
        
        // أو البحث في iframe
        const iframe = doc.querySelector("iframe");
        const iframeSrc = iframe ? iframe.src : null;
        
        return {
            url: watchPageUrl,
            videoUrl: videoUrl,
            iframeSrc: iframeSrc,
            found: !!(videoUrl || iframeSrc)
        };
    } catch (error) {
        console.error(`❌ خطأ في استخراج سيرفر المشاهدة: ${error.message}`);
        return { url: watchPageUrl, error: error.message };
    }
}

// دالة لاستخراج سيرفرات التحميل
async function fetchDownloadServers(downloadPageUrl) {
    try {
        console.log(`📥 جاري استخراج سيرفرات التحميل: ${downloadPageUrl}`);
        const response = await fetch(downloadPageUrl);
        if (!response.ok) throw new Error(`فشل الاتصال: ${response.status}`);
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const servers = {
            multiQuality: [],
            byQuality: {}
        };

        // سيرفرات متعددة الجودات
        const proServers = doc.querySelectorAll(".proServer a");
        proServers.forEach(server => {
            servers.multiQuality.push({
                name: cleanText(server.querySelector("p")?.textContent),
                url: server.href,
                type: "multi-quality"
            });
        });

        // سيرفرات حسب الجودة
        const downloadBlocks = doc.querySelectorAll(".DownloadBlock");
        downloadBlocks.forEach(block => {
            const quality = cleanText(block.querySelector("span")?.textContent) || "unknown";
            servers.byQuality[quality] = [];
            
            const serverLinks = block.querySelectorAll(".download-items a");
            serverLinks.forEach(link => {
                servers.byQuality[quality].push({
                    name: cleanText(link.querySelector("span")?.textContent),
                    quality: cleanText(link.querySelector("p")?.textContent),
                    url: link.href
                });
            });
        });

        return servers;
    } catch (error) {
        console.error(`❌ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return { error: error.message };
    }
}

// دالة لجلب قائمة الأفلام
async function fetchMoviesList() {
    console.log("🔍 جاري البحث عن الأفلام...");
    
    try {
        const response = await fetch("https://topcinema.media/movies/");
        if (!response.ok) throw new Error("فشل الاتصال");
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const movies = [];
        
        // استخراج جميع الأفلام
        const movieElements = dom.window.document.querySelectorAll('.Small--Box a');
        
        for (const element of movieElements) {
            const movieUrl = element.href;
            if (movieUrl && !movies.some(m => m.url === movieUrl)) {
                movies.push({
                    title: cleanText(element.querySelector('.title')?.textContent) || "بدون عنوان",
                    url: movieUrl,
                    scraped: false
                });
            }
        }
        
        console.log(`✅ تم العثور على ${movies.length} فيلم`);
        return movies;
        
    } catch (error) {
        console.log("⚠️ استخدام بيانات تجريبية");
        return getSampleMovies();
    }
}

function getSampleMovies() {
    return [
        { title: "فيلم المغامرة", url: "https://topcinema.rip/sample1", scraped: false },
        { title: "الكوميديا الرائعة", url: "https://topcinema.rip/sample2", scraped: false },
        { title: "الرعب المخيف", url: "https://topcinema.rip/sample3", scraped: false }
    ];
}

// الدالة الرئيسية
async function main() {
    console.log("🎬 بدء عملية الاستخراج...");
    
    // جلب قائمة الأفلام
    const moviesList = await fetchMoviesList();
    
    // مصفوفة لتخزين نتائج جميع الأفلام
    const allMoviesData = [];
    
    // تحديد عدد الأفلام المراد استخراجها (يمكنك تغيير الرقم)
    const moviesToScrape = moviesList.slice(0, 10);
    
    console.log(`🔄 جاري استخراج ${moviesToScrape.length} فيلم...`);
    
    // استخراج بيانات كل فيلم
    for (let i = 0; i < moviesToScrape.length; i++) {
        const movie = moviesToScrape[i];
        console.log(`\n📊 الفيلم ${i + 1} من ${moviesToScrape.length}`);
        
        const movieData = await fetchMovieDetails(movie.url);
        if (movieData) {
            movie.scraped = true;
            movie.id = movieData.id;
            allMoviesData.push(movieData);
        }
        
        // تأخير بسيط لتجنب حظر IP
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // حفظ الفهرس العام
    const indexData = {
        totalMovies: moviesList.length,
        scrapedMovies: allMoviesData.length,
        movies: moviesList.map(m => ({
            id: m.id,
            title: m.title,
            url: m.url,
            scraped: m.scraped,
            file: m.id ? `movie_${m.id}.json` : null
        })),
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(
        path.join(moviesDir, "index.json"),
        JSON.stringify(indexData, null, 2),
        "utf8"
    );
    
    // حفظ ملخص النتائج
    const summary = {
        success: true,
        timestamp: new Date().toISOString(),
        totalMoviesFound: moviesList.length,
        moviesScraped: allMoviesData.length,
        moviesDir: moviesDir,
        note: "تم استخراج البيانات بنجاح"
    };
    
    fs.writeFileSync("result.json", JSON.stringify(summary, null, 2));
    
    console.log("\n✅ تم الانتهاء من عملية الاستخراج!");
    console.log(`📁 تم حفظ البيانات في مجلد: ${moviesDir}`);
    console.log(`📊 عدد الأفلام المستخرجة: ${allMoviesData.length}`);
    console.log(`📄 الفهرس: ${path.join(moviesDir, "index.json")}`);
}

// تشغيل البرنامج
main().catch(error => {
    console.error("❌ خطأ غير متوقع:", error);
    process.exit(1);
});
