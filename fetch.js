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
                console.log(`📂 الفهرس المحمل: ${Object.keys(this.movies).length} فيلم`);
            } else {
                this.movies = {};
                this.pages = {};
                this.stats = { totalMovies: 0, totalPages: 0 };
                this.saveIndex();
                console.log(`📝 الفهرس جديد`);
            }
        } catch (error) {
            console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
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
            console.log(`💾 الفهرس محفوظ: ${Object.keys(this.movies).length} فيلم`);
        } catch (error) {
            console.log(`❌ خطأ في حفظ الفهرس: ${error.message}`);
        }
    }
    
    addMovie(movieId, movieData) {
        if (!this.movies[movieId]) {
            this.movies[movieId] = {
                id: movieId,
                title: movieData.title,
                page: movieData.page,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };
            return true;
        } else {
            // تحديث lastSeen إذا كان الفيلم موجود
            this.movies[movieId].lastSeen = new Date().toISOString();
            return false;
        }
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
                console.log(`📌 استئناف من الصفحة: ${this.currentPage}`);
            } else {
                this.currentPage = 1;
                console.log(`🆕 بداية جديدة من الصفحة 1`);
            }
        } catch (error) {
            console.log(`❌ خطأ في تحميل التقدم: ${error.message}`);
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
            console.log(`❌ خطأ في حفظ التقدم: ${error.message}`);
        }
    }
    
    nextPage() {
        this.currentPage++;
        this.saveProgress();
        console.log(`➡️ الانتقال للصفحة: ${this.currentPage}`);
    }
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        console.log(`🌐 جلب: ${url.substring(0, 60)}...`);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`⚠️ حالة غير ناجحة: ${response.status}`);
            return null;
        }
        
        const text = await response.text();
        console.log(`✅ تم الجلب بنجاح (${text.length} حرف)`);
        return text;
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت لـ ${url}`);
        } else {
            console.log(`❌ خطأ في الجلب: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط المختصر ====================
function extractMovieId(shortLink) {
    try {
        if (!shortLink) return null;
        
        const match = shortLink.match(/p=(\d+)/);
        if (match && match[1]) {
            const id = match[1];
            console.log(`🔍 ID مستخرج: ${id}`);
            return id;
        }
        return null;
    } catch (error) {
        console.log(`❌ خطأ في استخراج ID: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`\n📖 === الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum} ===`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`🔍 عثر على ${movieElements.length} فيلم`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title')?.textContent || 
                              element.textContent || 
                              `فيلم ${i + 1}`;
                
                const cleanTitle = title.trim();
                movies.push({
                    title: cleanTitle,
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
                
                console.log(`   ${i+1}. ${cleanTitle.substring(0, 40)}...`);
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة ${pageNum}: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم الرئيسية ====================
async function fetchMovieDetails(movie) {
    console.log(`\n🎬 جلب تفاصيل: ${movie.title.substring(0, 50)}...`);
    
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
            console.log(`   ⚠️ لم يتم العثور على ID للفيلم`);
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
        console.log(`   📊 ${detailItems.length} تفصيل`);
        
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
        
        // 5. استخراج روابط المشاهدة والتحميل
        console.log(`   🔗 جلب روابط المشاهدة والتحميل...`);
        const watchButton = doc.querySelector('a.watch');
        const downloadButton = doc.querySelector('a.download');
        
        // 6. استخراج سيرفرات المشاهدة
        const watchServers = [];
        if (watchButton && watchButton.href) {
            const watchPageHtml = await fetchWithTimeout(watchButton.href);
            if (watchPageHtml) {
                const watchDom = new JSDOM(watchPageHtml);
                const watchDoc = watchDom.window.document;
                
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
        
        console.log(`   ✅ تم استخراج ${watchServers.length} سيرفر مشاهدة و ${downloadServers.length} سيرفر تحميل`);
        
        return {
            id: movieId,
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
        console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الصفحة ====================
function savePage(pageNum, pageData, moviesData) {
    try {
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
        console.log(`💾 تم حفظ ${fileName} بـ ${moviesData.length} فيلم`);
        
        // حفظ نسخة احتياطية
        const backupFile = path.join(MOVIES_DIR, `${fileName}.backup`);
        fs.writeFileSync(backupFile, JSON.stringify(pageContent, null, 2));
        
        return fileName;
    } catch (error) {
        console.log(`❌ خطأ في حفظ الصفحة ${pageNum}: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("=".repeat(60));
    console.log("🚀 بدء استخراج الأفلام");
    console.log("=".repeat(60));
    
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    let totalNew = 0;
    let consecutiveDuplicates = 0;
    const MAX_CONSECUTIVE_DUPLICATES = 3;
    
    console.log(`⚙️ الإعدادات: ${MAX_CONSECUTIVE_DUPLICATES} تكرارات كحد أقصى`);
    
    while (true) {
        const pageNum = progress.currentPage;
        console.log(`\n📄 === معالجة الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum} ===`);
        
        // جلب الصفحة
        const pageData = await fetchMoviesFromPage(pageNum);
        
        if (!pageData || pageData.movies.length === 0) {
            console.log("⏹️ توقف: لا توجد أفلام في هذه الصفحة");
            break;
        }
        
        // استخراج التفاصيل
        const newMovies = [];
        let shouldStop = false;
        
        console.log(`🔍 فحص ${pageData.movies.length} فيلم...`);
        
        for (let i = 0; i < pageData.movies.length; i++) {
            const movie = pageData.movies[i];
            
            // جلب التفاصيل
            const details = await fetchMovieDetails(movie);
            
            if (!details || !details.id) {
                console.log(`   ⚠️ تخطي: لم يتم استخراج ID`);
                continue;
            }
            
            // التحقق من التكرار
            if (index.isMovieExists(details.id)) {
                console.log(`   🔄 مكرر [ID: ${details.id}]: ${details.title.substring(0, 40)}...`);
                consecutiveDuplicates++;
                
                console.log(`   📈 التكرارات المتتالية: ${consecutiveDuplicates}/${MAX_CONSECUTIVE_DUPLICATES}`);
                
                if (consecutiveDuplicates >= MAX_CONSECUTIVE_DUPLICATES) {
                    console.log(`   🛑 وصل للحد الأقصى للتكرارات المتتالية`);
                    shouldStop = true;
                    
                    // لكننا نكمل مع الأفلام الباقية في الصفحة الحالية
                    // لأننا ربما نجد أفلام جديدة بعد التكرارات
                }
                continue;
            }
            
            // إعادة تعيين العداد
            consecutiveDuplicates = 0;
            
            // إضافة للفهرس
            const isNew = index.addMovie(details.id, details);
            if (isNew) {
                newMovies.push(details);
                totalNew++;
                console.log(`   ✅ جديد! [ID: ${details.id}]: ${details.title.substring(0, 40)}...`);
            }
            
            // انتظار بين الأفلام
            if (i < pageData.movies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        // ⭐⭐⭐ **حفظ الصفحة - حتى لو وصلنا للتكرارات** ⭐⭐⭐
        if (newMovies.length > 0) {
            console.log(`\n💾 جاري حفظ ${newMovies.length} فيلم جديد من الصفحة ${pageNum}...`);
            savePage(pageNum, pageData, newMovies);
            index.saveIndex();
            console.log(`✅ تم حفظ الصفحة ${pageNum} بنجاح`);
        } else {
            console.log(`📭 لا توجد أفلام جديدة في الصفحة ${pageNum}`);
        }
        
        console.log(`📊 إحصاءات الصفحة ${pageNum}: ${newMovies.length} جديد`);
        
        // ⭐⭐⭐ **التوقف بعد حفظ الصفحة** ⭐⭐⭐
        if (shouldStop) {
            console.log(`\n🛑 توقف البرنامج بسبب الوصول لـ ${MAX_CONSECUTIVE_DUPLICATES} تكرارات متتالية`);
            console.log(`💾 لكن! تم حفظ ${totalNew} فيلم جديد قبل التوقف`);
            break;
        }
        
        // إذا كان هناك أفلام جديدة، ننتقل للصفحة التالية
        if (newMovies.length > 0) {
            progress.nextPage();
            
            // انتظار بين الصفحات
            console.log(`⏳ انتظار 3 ثواني قبل الصفحة التالية...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            console.log(`⏹️ توقف: لا توجد أفلام جديدة في الصفحة ${pageNum}`);
            break;
        }
    }
    
    // ==================== النتائج النهائية ====================
    console.log("\n" + "=".repeat(60));
    console.log("🎉 انتهى الاستخراج");
    console.log("=".repeat(60));
    console.log(`📊 أفلام جديدة: ${totalNew}`);
    console.log(`📋 الفهرس الكلي: ${Object.keys(index.movies).length} فيلم`);
    console.log(`📌 آخر صفحة: ${progress.currentPage}`);
    console.log("=".repeat(60));
    
    // حفظ التقرير النهائي
    try {
        const report = {
            status: "completed",
            totalNewMovies: totalNew,
            totalMovies: Object.keys(index.movies).length,
            lastPage: progress.currentPage,
            consecutiveDuplicates: consecutiveDuplicates,
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync("report.json", JSON.stringify(report, null, 2));
        console.log(`📝 التقرير محفوظ في report.json`);
        
        // حفظ ملخص
        const summary = `الاستخراج انتهى بنجاح!
        - الأفلام الجديدة: ${totalNew}
        - الفهرس الكلي: ${Object.keys(index.movies).length}
        - آخر صفحة: ${progress.currentPage}
        - التكرارات المتتالية: ${consecutiveDuplicates}
        - الوقت: ${new Date().toLocaleString('ar-SA')}`;
        
        fs.writeFileSync("summary.txt", summary);
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ التقرير: ${error.message}`);
    }
}

// ==================== التشغيل مع معالجة الأخطاء ====================
async function run() {
    try {
        await main();
        console.log("\n✨ البرنامج انتهى بنجاح!");
        process.exit(0);
    } catch (error) {
        console.error("\n💥 خطأ غير متوقع:", error.message);
        console.error("Stack:", error.stack);
        
        try {
            const errorReport = {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            };
            
            fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
            console.log("📝 تم حفظ تفاصيل الخطأ في error.json");
        } catch (e) {
            console.log("❌ فشل حفظ تفاصيل الخطأ:", e.message);
        }
        
        process.exit(1);
    }
}

// بدء التشغيل
run();
