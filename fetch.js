import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const INDEX_FILE = path.join(MOVIES_DIR, "index.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== نظام الفهرس ====================
class MovieIndex {
    constructor() {
        this.loadIndex();
    }
    
    loadIndex() {
        try {
            if (fs.existsSync(INDEX_FILE)) {
                const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
                this.movies = data.movies || {};
                this.pages = data.pages || {};
                this.stats = data.stats || { totalMovies: 0, totalPages: 0 };
            } else {
                this.movies = {};
                this.pages = {};
                this.stats = { totalMovies: 0, totalPages: 0 };
                this.saveIndex();
            }
        } catch (error) {
            this.movies = {};
            this.pages = {};
            this.stats = { totalMovies: 0, totalPages: 0 };
        }
    }
    
    saveIndex() {
        try {
            const indexData = {
                movies: this.movies,
                pages: this.pages,
                stats: this.stats,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
        } catch (error) {
            console.log("❌ خطأ في حفظ الفهرس");
        }
    }
    
    addMovie(movieId, movieData) {
        if (!this.movies[movieId]) {
            this.movies[movieId] = {
                id: movieId,
                title: movieData.title,
                page: movieData.page,
                firstSeen: new Date().toISOString()
            };
            return true;
        }
        return false;
    }
    
    isMovieExists(movieId) {
        return !!this.movies[movieId];
    }
}

// ==================== نظام التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                this.currentPage = data.currentPage || 1;
            } else {
                this.currentPage = 1;
            }
        } catch (error) {
            this.currentPage = 1;
        }
    }
    
    saveProgress() {
        try {
            const progressData = {
                currentPage: this.currentPage,
                lastUpdate: new Date().toISOString()
            };
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
        } catch (error) {
            console.log("❌ خطأ في حفظ التقدم");
        }
    }
    
    nextPage() {
        this.currentPage++;
        this.saveProgress();
    }
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط المختصر ====================
function extractMovieId(shortLink) {
    try {
        // استخراج p=xxxx من الرابط المختصر
        const match = shortLink.match(/p=(\d+)/);
        if (match && match[1]) {
            return match[1]; // إرجاع الـ ID فقط
        }
        return null;
    } catch {
        return null;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 الصفحة ${pageNum === 1 ? "Home" : pageNum}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ ${movieElements.length} فيلم`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title')?.textContent || 
                              element.textContent || 
                              `فيلم ${i + 1}`;
                
                movies.push({
                    title: title.trim(),
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم الرئيسية ====================
async function fetchMovieDetails(movie) {
    console.log(`🎬 ${movie.title.substring(0, 30)}...`);
    
    const html = await fetchWithTimeout(movie.url);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const movieId = shortLink ? extractMovieId(shortLink) : null;
        
        if (!movieId) {
            console.log(`   ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // 2. البيانات الأساسية
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        // 3. القصة
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
        // 4. التفاصيل
        const details = {
            category: [],
            genres: [],
            quality: [],
            duration: "",
            releaseYear: [],
            language: [],
            actors: []
        };
        
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = labelElement.textContent.replace(":", "").trim();
                const links = item.querySelectorAll("a");
                
                if (links.length > 0) {
                    const values = Array.from(links).map(a => a.textContent.trim());
                    
                    if (label.includes("قسم الفيلم")) {
                        details.category = values;
                    } else if (label.includes("نوع الفيلم")) {
                        details.genres = values;
                    } else if (label.includes("جودة الفيلم")) {
                        details.quality = values;
                    } else if (label.includes("موعد الصدور")) {
                        details.releaseYear = values;
                    } else if (label.includes("لغة الفيلم")) {
                        details.language = values;
                    } else if (label.includes("بطولة")) {
                        details.actors = values;
                    }
                } else {
                    const text = item.textContent.trim();
                    const value = text.split(":").slice(1).join(":").trim();
                    
                    if (label.includes("توقيت الفيلم")) {
                        details.duration = value;
                    }
                }
            }
        });
        
        // 5. استخراج روابط المشاهدة والتحميل من الأزرار
        const watchButton = doc.querySelector('a.watch');
        const downloadButton = doc.querySelector('a.download');
        
        // 6. استخراج سيرفرات المشاهدة
        const watchServers = [];
        if (watchButton && watchButton.href) {
            const watchPageHtml = await fetchWithTimeout(watchButton.href);
            if (watchPageHtml) {
                const watchDom = new JSDOM(watchPageHtml);
                const watchDoc = watchDom.window.document;
                
                // استخراج رابط الفيديو من meta tag
                const videoMeta = watchDoc.querySelector('meta[property="og:video:secure_url"]');
                if (videoMeta && videoMeta.content) {
                    watchServers.push({
                        type: "embed",
                        url: videoMeta.content,
                        quality: "متعدد الجودات"
                    });
                }
            }
        }
        
        // 7. استخراج سيرفرات التحميل
        const downloadServers = [];
        if (downloadButton && downloadButton.href) {
            const downloadPageHtml = await fetchWithTimeout(downloadButton.href);
            if (downloadPageHtml) {
                const downloadDom = new JSDOM(downloadPageHtml);
                const downloadDoc = downloadDom.window.document;
                
                // استخراج سيرفرات التحميل الرئيسية
                const proServerLinks = downloadDoc.querySelectorAll('.proServer a.downloadsLink');
                proServerLinks.forEach(link => {
                    if (link.href) {
                        downloadServers.push({
                            server: link.querySelector('p')?.textContent?.trim() || "غير معروف",
                            url: link.href,
                            quality: "متعدد الجودات",
                            type: "pro"
                        });
                    }
                });
                
                // استخراج سيرفرات التحميل العادية
                const downloadBlocks = downloadDoc.querySelectorAll('.DownloadBlock');
                downloadBlocks.forEach(block => {
                    const quality = block.querySelector('span')?.textContent?.trim() || "غير معروف";
                    const serverLinks = block.querySelectorAll('a.downloadsLink');
                    
                    serverLinks.forEach(link => {
                        if (link.href) {
                            downloadServers.push({
                                server: link.querySelector('span')?.textContent?.trim() || "غير معروف",
                                url: link.href,
                                quality: quality,
                                type: "normal"
                            });
                        }
                    });
                });
            }
        }
        
        return {
            id: movieId,  // ✅ هذا الـ ID المطلوب
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchServers: watchServers,
            downloadServers: downloadServers,
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الصفحة ====================
function savePage(pageNum, pageData, moviesData) {
    const fileName = pageNum === 1 ? "Home.json" : `${pageNum}.json`;
    const filePath = path.join(MOVIES_DIR, fileName);
    
    const pageContent = {
        page: pageNum,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(pageContent, null, 2));
    console.log(`💾 ${fileName} (${moviesData.length} فيلم)`);
    
    return fileName;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الأفلام مع جميع البيانات");
    console.log("=".repeat(50));
    
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    let totalNew = 0;
    let consecutiveDuplicates = 0;
    const MAX_CONSECUTIVE_DUPLICATES = 3;
    
    while (true) {
        const pageNum = progress.currentPage;
        console.log(`\n📄 === صفحة ${pageNum === 1 ? "Home" : pageNum} ===`);
        
        // جلب الصفحة
        const pageData = await fetchMoviesFromPage(pageNum);
        
        if (!pageData || pageData.movies.length === 0) {
            console.log("⏹️ توقف: لا توجد أفلام");
            break;
        }
        
        // استخراج التفاصيل
        const newMovies = [];
        let pageHasNew = false;
        
        for (const movie of pageData.movies) {
            // جلب التفاصيل أولاً للحصول على الـ ID
            const details = await fetchMovieDetails(movie);
            
            if (!details || !details.id) {
                console.log(`   ⚠️ تخطي: لم يتم استخراج ID`);
                continue;
            }
            
            // التحقق من التكرار باستخدام الـ ID
            if (index.isMovieExists(details.id)) {
                console.log(`   ⚠️ مكرر [ID: ${details.id}]: ${details.title.substring(0, 20)}...`);
                consecutiveDuplicates++;
                
                if (consecutiveDuplicates >= MAX_CONSECUTIVE_DUPLICATES) {
                    console.log(`🛑 توقف: ${MAX_CONSECUTIVE_DUPLICATES} تكرارات متتالية`);
                    break;
                }
                continue;
            }
            
            // إعادة تعيين العداد
            consecutiveDuplicates = 0;
            
            // إضافة للفهرس
            index.addMovie(details.id, details);
            newMovies.push(details);
            totalNew++;
            pageHasNew = true;
            
            // انتظار بين الأفلام
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // إذا كان هناك تكرارات متتالية كثيرة، توقف
        if (consecutiveDuplicates >= MAX_CONSECUTIVE_DUPLICATES) {
            console.log("🛑 توقف بسبب التكرارات");
            break;
        }
        
        // حفظ الصفحة إذا كان فيها أفلام جديدة
        if (newMovies.length > 0) {
            savePage(pageNum, pageData, newMovies);
            index.saveIndex();
        }
        
        console.log(`📊 الصفحة ${pageNum}: ${newMovies.length} جديد`);
        
        // إذا لم يكن هناك أفلام جديدة، توقف
        if (!pageHasNew) {
            console.log("⏹️ توقف: لا توجد أفلام جديدة");
            break;
        }
        
        // الانتقال للصفحة التالية
        progress.nextPage();
        
        // انتظار بين الصفحات
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // ==================== النتائج ====================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 انتهى الاستخراج");
    console.log(`📊 أفلام جديدة: ${totalNew}`);
    console.log(`📋 الفهرس: ${Object.keys(index.movies).length} فيلم`);
    console.log("=".repeat(50));
    
    // حفظ التقرير النهائي
    const report = {
        status: "completed",
        totalNewMovies: totalNew,
        totalMovies: Object.keys(index.movies).length,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("report.json", JSON.stringify(report, null, 2));
}

// التشغيل
main().catch(error => {
    console.error("💥 خطأ:", error.message);
    
    const errorReport = {
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
});
