import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات التخزين
const PAGES_DIR = path.join(__dirname, "pages");
const MOVIES_DIR = path.join(__dirname, "movies");
const LAST_PAGE_FILE = path.join(__dirname, "last_page.json");

// إنشاء المجلدات
[PAGES_DIR, MOVIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// دالة fetch مع headers
async function fetchWithRetry(url, retries = 3) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    };

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`🌐 محاولة ${i + 1}: جلب ${url}`);
            const response = await fetch(url, { headers });
            
            if (response.ok) {
                return await response.text();
            } else {
                console.log(`⚠️ الاستجابة: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.log(`❌ خطأ في المحاولة ${i + 1}: ${error.message}`);
        }
        
        if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return null;
}

// دالة لتنظيف النص
function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

// دالة لاستخراج ID من الرابط المختصر
function extractMovieId(url) {
    try {
        const match = url.match(/p=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        
        // محاولة أخرى من المسار
        const pathMatch = url.match(/\/(\d+)\/?$/);
        if (pathMatch && pathMatch[1]) {
            return pathMatch[1];
        }
        
        // إذا لم يجد، يرجع timestamp
        return `temp_${Date.now()}`;
    } catch (error) {
        return `temp_${Date.now()}`;
    }
}

// دالة للتحقق إذا كان الفيلم موجوداً
function isMovieExists(movieId) {
    if (!movieId || movieId.startsWith('temp_')) return false;
    
    const movieFile = path.join(MOVIES_DIR, `movie_${movieId}.json`);
    return fs.existsSync(movieFile);
}

// دالة لحفظ الصفحة
function savePage(pageNum, movies) {
    const pageFile = path.join(PAGES_DIR, `page_${pageNum}.json`);
    const pageData = {
        page: pageNum,
        url: `https://topcinema.rip/movies/${pageNum > 1 ? `page/${pageNum}/` : ''}`,
        moviesCount: movies.length,
        movies: movies.map(m => ({ id: m.id, title: m.title, url: m.url })),
        savedAt: new Date().toISOString()
    };
    fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));
    console.log(`📄 تم حفظ الصفحة ${pageNum} (${movies.length} فيلم)`);
}

// دالة لحفظ آخر صفحة
function saveLastPage(pageNum, hasNewMovies, moviesProcessed = 0) {
    const lastPageData = {
        lastPage: pageNum,
        lastRun: new Date().toISOString(),
        hasNewMovies: hasNewMovies,
        moviesProcessed: moviesProcessed,
        totalMovies: countTotalMovies()
    };
    fs.writeFileSync(LAST_PAGE_FILE, JSON.stringify(lastPageData, null, 2));
}

// دالة لحساب الأفلام
function countTotalMovies() {
    try {
        if (!fs.existsSync(MOVIES_DIR)) return 0;
        const files = fs.readdirSync(MOVIES_DIR);
        return files.filter(f => f.startsWith("movie_") && f.endsWith(".json")).length;
    } catch {
        return 0;
    }
}

// دالة لجلب الأفلام من صفحة معينة
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    const html = await fetchWithRetry(url);
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // البحث عن أفلام بطريقتين مختلفتين
        let movieElements = doc.querySelectorAll('.Small--Box');
        
        // إذا لم يجد بطريقة Small--Box، يحاول بطريقة أخرى
        if (movieElements.length === 0) {
            movieElements = doc.querySelectorAll('article, .movie-item, .post-item');
        }
        
        for (const element of movieElements) {
            try {
                // البحث عن الرابط
                const linkElement = element.querySelector('a');
                if (!linkElement || !linkElement.href) continue;
                
                const movieUrl = linkElement.href;
                if (!movieUrl.includes('topcinema.rip')) continue;
                
                // استخراج ID
                let movieId = extractMovieId(movieUrl);
                
                // استخراج العنوان
                let title = cleanText(linkElement.querySelector('.title')?.textContent) || 
                           cleanText(linkElement.textContent) || 
                           cleanText(element.querySelector('.title')?.textContent) ||
                           `فيلم ${movies.length + 1}`;
                
                movies.push({
                    id: movieId,
                    title: title,
                    url: movieUrl,
                    page: pageNum
                });
                
            } catch (error) {
                console.log(`⚠️ خطأ في عنصر: ${error.message}`);
            }
        }
        
        console.log(`✅ الصفحة ${pageNum}: وجدت ${movies.length} فيلم`);
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في تحليل الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// دالة لاستخراج بيانات الفيلم الكاملة
async function fetchMovieDetails(movie) {
    try {
        console.log(`🎬 استخراج الفيلم #${movie.id}: ${movie.title.substring(0, 50)}...`);
        
        const html = await fetchWithRetry(movie.url);
        if (!html) {
            console.log(`❌ فشل جلب صفحة الفيلم ${movie.id}`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkElement = doc.querySelector('#shortlink');
        const shortLink = shortLinkElement ? shortLinkElement.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || 
                               doc.querySelector("h1")?.textContent);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // استخراج التفاصيل
        const details = {};
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        detailItems.forEach(item => {
            try {
                const labelElement = item.querySelector("span");
                if (labelElement) {
                    const label = cleanText(labelElement.textContent).replace(":", "").trim();
                    if (label) {
                        const links = item.querySelectorAll("a");
                        if (links.length > 0) {
                            const values = Array.from(links).map(a => cleanText(a.textContent));
                            details[label] = values;
                        } else {
                            const text = cleanText(item.textContent);
                            const value = text.split(":").slice(1).join(":").trim();
                            details[label] = value;
                        }
                    }
                }
            } catch (error) {
                // تجاهل الأخطاء في العناصر
            }
        });
        
        // استخراج سيرفرات المشاهدة
        const watchButton = doc.querySelector('a.watch');
        const watchPageUrl = watchButton ? watchButton.href : null;
        let watchServer = null;
        
        if (watchPageUrl) {
            watchServer = await fetchWatchServer(watchPageUrl);
        }
        
        // استخراج سيرفرات التحميل
        const downloadButton = doc.querySelector('a.download');
        const downloadPageUrl = downloadButton ? downloadButton.href : null;
        let downloadServers = null;
        
        if (downloadPageUrl) {
            downloadServers = await fetchDownloadServers(downloadPageUrl);
        }
        
        // تجميع بيانات الفيلم
        const movieData = {
            id: movieId,
            title: title || movie.title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchServer: watchServer,
            downloadServers: downloadServers,
            page: movie.page,
            scrapedAt: new Date().toISOString()
        };
        
        // حفظ الفيلم
        const movieFile = path.join(MOVIES_DIR, `movie_${movieId}.json`);
        fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2), "utf8");
        
        console.log(`✅ تم حفظ: movie_${movieId}.json`);
        return movieData;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج الفيلم ${movie.id}:`, error.message);
        
        // حفظ بيانات الخطأ
        const errorData = {
            id: movie.id,
            title: movie.title,
            url: movie.url,
            error: error.message,
            scrapedAt: new Date().toISOString(),
            status: "error"
        };
        
        const movieFile = path.join(MOVIES_DIR, `movie_${movie.id}.json`);
        fs.writeFileSync(movieFile, JSON.stringify(errorData, null, 2));
        
        return null;
    }
}

// دالة لاستخراج سيرفر المشاهدة
async function fetchWatchServer(watchPageUrl) {
    try {
        console.log(`🎥 جاري جلب صفحة المشاهدة...`);
        
        const html = await fetchWithRetry(watchPageUrl);
        if (!html) {
            return { url: watchPageUrl, error: "فشل جلب الصفحة" };
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن رابط الفيديو
        const videoMeta = doc.querySelector('meta[property="og:video"], meta[property="og:video:secure_url"]');
        const videoUrl = videoMeta ? videoMeta.content : null;
        
        // البحث عن iframe
        const iframe = doc.querySelector('iframe');
        const iframeSrc = iframe ? iframe.src : null;
        
        return {
            url: watchPageUrl,
            videoUrl: videoUrl,
            iframeSrc: iframeSrc,
            found: !!(videoUrl || iframeSrc)
        };
        
    } catch (error) {
        console.error(`❌ خطأ في جلب سيرفر المشاهدة:`, error.message);
        return { url: watchPageUrl, error: error.message };
    }
}

// دالة لاستخراج سيرفرات التحميل
async function fetchDownloadServers(downloadPageUrl) {
    try {
        console.log(`📥 جاري جلب صفحة التحميل...`);
        
        const html = await fetchWithRetry(downloadPageUrl);
        if (!html) {
            return { url: downloadPageUrl, error: "فشل جلب الصفحة" };
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const servers = {
            multiQuality: [],
            byQuality: {}
        };
        
        // سيرفرات متعددة الجودات
        const proServers = doc.querySelectorAll('.proServer a');
        proServers.forEach(server => {
            const name = cleanText(server.querySelector('p')?.textContent);
            if (name) {
                servers.multiQuality.push({
                    name: name,
                    url: server.href,
                    type: "multi-quality"
                });
            }
        });
        
        // سيرفرات حسب الجودة
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "unknown";
            
            servers.byQuality[quality] = [];
            
            const serverLinks = block.querySelectorAll('.download-items a');
            serverLinks.forEach(link => {
                const name = cleanText(link.querySelector('span')?.textContent);
                const serverQuality = cleanText(link.querySelector('p')?.textContent);
                
                if (name) {
                    servers.byQuality[quality].push({
                        name: name,
                        quality: serverQuality,
                        url: link.href
                    });
                }
            });
        });
        
        return servers;
        
    } catch (error) {
        console.error(`❌ خطأ في جلب سيرفرات التحميل:`, error.message);
        return { url: downloadPageUrl, error: error.message };
    }
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج الأفلام من topcinema.rip");
    console.log("📊 الأفلام الموجودة حالياً:", countTotalMovies());
    
    let pageNum = 1;
    let foundExistingMovie = false;
    let totalNewMovies = 0;
    let moviesProcessed = [];
    let shouldStop = false;
    
    // حد أقصى للصفحات (يمكن تغييره)
    const MAX_PAGES = 10;
    
    while (!foundExistingMovie && !shouldStop && pageNum <= MAX_PAGES) {
        console.log(`\n📖 ====== الصفحة ${pageNum} ======`);
        
        // جلب الأفلام من الصفحة
        const moviesOnPage = await fetchMoviesFromPage(pageNum);
        
        if (!moviesOnPage || moviesOnPage.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${pageNum}`);
            shouldStop = true;
            break;
        }
        
        // حفظ الصفحة
        savePage(pageNum, moviesOnPage);
        
        // معالجة كل فيلم في الصفحة
        let newMoviesInPage = 0;
        
        for (const movie of moviesOnPage) {
            // تحقق إذا كان الفيلم موجوداً
            if (isMovieExists(movie.id)) {
                console.log(`⏭️ تخطي الفيلم ${movie.id} (موجود مسبقاً)`);
                foundExistingMovie = true;
                break;
            }
            
            console.log(`\n--- معالجة الفيلم ${newMoviesInPage + 1}/${moviesOnPage.length} ---`);
            
            // استخراج بيانات الفيلم
            const movieData = await fetchMovieDetails(movie);
            
            if (movieData) {
                newMoviesInPage++;
                totalNewMovies++;
                moviesProcessed.push(movieData.id);
                
                // حفظ تقدم كل 5 أفلام
                if (totalNewMovies % 5 === 0) {
                    console.log(`📈 تقدم: ${totalNewMovies} أفلام جديدة حتى الآن`);
                }
            }
            
            // تأخير لتجنب حظر IP
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log(`📊 الصفحة ${pageNum}: ${newMoviesInPage} أفلام جديدة`);
        
        // إذا وجد فيلم موجود، توقف
        if (foundExistingMovie) {
            console.log(`🛑 تم العثور على فيلم موجود، التوقف عند الصفحة ${pageNum}`);
            break;
        }
        
        // إذا لم يتم إضافة أفلام جديدة، توقف
        if (newMoviesInPage === 0) {
            console.log(`🛑 لم تتم إضافة أفلام جديدة، التوقف`);
            shouldStop = true;
            break;
        }
        
        // الانتقال للصفحة التالية
        pageNum++;
        
        // تأخير بين الصفحات
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // حفظ حالة التنفيذ
    saveLastPage(pageNum - 1, totalNewMovies > 0, totalNewMovies);
    
    // إنشاء ملخص النتائج
    const summary = {
        success: true,
        timestamp: new Date().toISOString(),
        lastPageProcessed: pageNum - 1,
        totalPagesProcessed: pageNum - 1,
        newMoviesAdded: totalNewMovies,
        totalMoviesNow: countTotalMovies(),
        stoppedBecauseExisting: foundExistingMovie,
        moviesProcessed: moviesProcessed,
        note: `تم استخراج ${totalNewMovies} فيلم جديد من ${pageNum - 1} صفحة`
    };
    
    fs.writeFileSync("result.json", JSON.stringify(summary, null, 2));
    
    // عرض النتائج
    console.log("\n" + "=".repeat(60));
    console.log("✅ اكتمل الاستخراج بنجاح!");
    console.log("=".repeat(60));
    console.log(`📄 الصفحات المعالجة: ${pageNum - 1}`);
    console.log(`🎬 الأفلام المضافة: ${totalNewMovies}`);
    console.log(`📊 إجمالي الأفلام الآن: ${countTotalMovies()}`);
    console.log(`💾 الملفات المحفوظة:`);
    console.log(`   - result.json: ملخص النتائج`);
    console.log(`   - last_page.json: حالة التنفيذ`);
    console.log(`   - pages/: ${fs.readdirSync(PAGES_DIR).length} صفحة`);
    console.log(`   - movies/: ${countTotalMovies()} فيلم`);
    console.log("=".repeat(60));
    
    // عرض عينة من الأفلام المحفوظة
    console.log("\n📋 عينة من الأفلام المحفوظة:");
    try {
        const movieFiles = fs.readdirSync(MOVIES_DIR)
            .filter(f => f.startsWith("movie_") && f.endsWith(".json"))
            .slice(0, 3);
        
        movieFiles.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`   ${file}: ${content.title || 'بدون عنوان'}`);
        });
    } catch (error) {
        console.log("   لا يمكن عرض العينة");
    }
}

// تشغيل البرنامج
main().catch(error => {
    console.error("💥 خطأ غير متوقع:", error);
    
    // حفظ الخطأ
    const errorSummary = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("result.json", JSON.stringify(errorSummary, null, 2));
    process.exit(1);
});
