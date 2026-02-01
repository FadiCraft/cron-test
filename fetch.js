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

// ==================== إعدادات جديدة ====================
const MOVIES_PER_FILE = 250;        // 250 فيلم في كل ملف
const PAGES_PER_RUN = 2;           // صفحتين فقط في كل تشغيل

// ==================== نظام الفهرس (يبقى كما هو) ====================
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
            console.log("⚠️ لا يمكن تحميل الفهرس، إنشاء جديد");
            this.movies = {};
            this.pages = {};
            this.stats = { totalMovies: 0, totalPages: 0 };
        }
    }
    
    saveIndex() {
        const indexData = {
            movies: this.movies,
            pages: this.pages,
            stats: this.stats,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    }
    
    addMovie(movieId, movieData) {
        if (!this.movies[movieId]) {
            this.movies[movieId] = {
                id: movieId,
                title: movieData.title,
                currentFile: movieData.currentFile, // إضافة الملف الحالي
                page: movieData.page,
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };
            this.stats.totalMovies++;
            return true; // جديد
        }
        this.movies[movieId].lastSeen = new Date().toISOString();
        return false; // مكرر
    }
    
    addPage(pageNum, pageData) {
        const pageKey = pageNum === 1 ? "Home" : pageNum.toString();
        this.pages[pageKey] = {
            page: pageNum,
            fileName: pageData.fileName, // اسم الملف الذي تم حفظه فيه
            moviesCount: pageData.movies.length,
            scrapedAt: new Date().toISOString(),
            url: pageData.url
        };
        this.stats.totalPages++;
    }
    
    isMovieExists(movieId) {
        return !!this.movies[movieId];
    }
    
    getStats() {
        return {
            ...this.stats,
            uniqueMovies: Object.keys(this.movies).length
        };
    }
}

// ==================== نظام التقدم المعدل ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                this.currentPage = data.currentPage || 1;
                this.currentFileNumber = data.currentFileNumber || 1;
                this.moviesInCurrentFile = data.moviesInCurrentFile || 0;
                this.currentFileName = data.currentFileName || "Top1.json";
                this.lastMovieId = data.lastMovieId || null;
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.foundDuplicate = data.foundDuplicate || false;
                this.shouldStop = data.shouldStop || false;
            } else {
                this.currentPage = 1;
                this.currentFileNumber = 1;
                this.moviesInCurrentFile = 0;
                this.currentFileName = "Top1.json";
                this.lastMovieId = null;
                this.pagesProcessedThisRun = 0;
                this.foundDuplicate = false;
                this.shouldStop = false;
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم");
            this.currentPage = 1;
            this.currentFileNumber = 1;
            this.moviesInCurrentFile = 0;
            this.currentFileName = "Top1.json";
            this.lastMovieId = null;
            this.pagesProcessedThisRun = 0;
            this.foundDuplicate = false;
            this.shouldStop = false;
        }
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            currentFileNumber: this.currentFileNumber,
            moviesInCurrentFile: this.moviesInCurrentFile,
            currentFileName: this.currentFileName,
            lastMovieId: this.lastMovieId,
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            foundDuplicate: this.foundDuplicate,
            shouldStop: this.shouldStop,
            lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    addMovieToFile() {
        this.moviesInCurrentFile++;
        
        // إذا وصلنا إلى 250 فيلم، ننتقل للملف التالي
        if (this.moviesInCurrentFile >= MOVIES_PER_FILE) {
            this.currentFileNumber++;
            this.moviesInCurrentFile = 0;
            this.currentFileName = `Top${this.currentFileNumber}.json`;
            console.log(`\n📁 تم تعبئة الملف! إنشاء ملف جديد: ${this.currentFileName}`);
        }
        
        this.saveProgress();
    }
    
    addPageProcessed() {
        this.pagesProcessedThisRun++;
        
        // إذا تمت معالجة صفحتين، نتوقف
        if (this.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        } else {
            // الانتقال للصفحة التالية
            this.currentPage++;
            console.log(`\n🔄 الانتقال للصفحة ${this.currentPage === 1 ? "Home" : this.currentPage}...`);
        }
        
        this.saveProgress();
    }
    
    setDuplicateFound(movieId) {
        this.foundDuplicate = true;
        this.lastMovieId = movieId;
        this.shouldStop = true;
        this.saveProgress();
    }
    
    resetForNewRun() {
        // لا نعيد تعيين الصفحة الحالية، فقط عدد الصفحات المعالجة
        this.pagesProcessedThisRun = 0;
        this.foundDuplicate = false;
        this.shouldStop = false;
        this.saveProgress();
    }
}

// ==================== دوال المساعدة (تبقى كما هي) ====================
async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url.substring(0, 60)}...`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
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
        const match = url.match(/p=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];
        const numMatch = lastPart.match(/(\d+)/);
        return numMatch ? numMatch[1] : `temp_${Date.now()}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// ==================== استخراج الأفلام من صفحة (تبقى كما هي) ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`\n📖 ===== جلب الصفحة ${pageNum === 1 ? "Home" : pageNum} =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 البحث عن الأفلام...");
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ وجدت ${movieElements.length} فيلم في الصفحة`);
        
        for (let i = 0; i < movieElements.length; i++) {
            const element = movieElements[i];
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const movieId = extractMovieId(movieUrl);
                const title = cleanText(element.querySelector('.title')?.textContent || 
                                      element.textContent || 
                                      `فيلم ${i + 1}`);
                
                movies.push({
                    id: movieId,
                    title: title,
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
            }
        }
        
        return { url, movies };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم (معدلة قليلاً) ====================
async function fetchMovieDetails(movie, index, currentFileName) {
    console.log(`\n🎬 [${movie.position}] ${movie.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchPage(movie.url);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || movie.title);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // التفاصيل
        const details = {};
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
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
        });
        
        // سيرفرات المشاهدة والتحميل
        const watchButton = doc.querySelector('a.watch');
        const downloadButton = doc.querySelector('a.download');
        
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story || "غير متوفر",
            details: details,
            watchPage: watchButton ? watchButton.href : null,
            downloadPage: downloadButton ? downloadButton.href : null,
            page: movie.page,
            position: movie.position,
            currentFile: currentFileName, // إضافة الملف الحالي
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الأفلام في الملف الحالي ====================
function saveMoviesToCurrentFile(progress, moviesData, pageData) {
    const filePath = path.join(MOVIES_DIR, progress.currentFileName);
    
    let existingMovies = [];
    
    // تحميل الملف الحالي إذا كان موجوداً
    if (fs.existsSync(filePath)) {
        try {
            const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingMovies = existingData.movies || [];
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة الملف الحالي، إنشاء جديد`);
        }
    }
    
    // إضافة الأفلام الجديدة
    const allMovies = [...existingMovies, ...moviesData];
    
    // حفظ الملف
    const fileContent = {
        fileName: progress.currentFileName,
        totalMovies: allMovies.length,
        scrapedAt: new Date().toISOString(),
        pagesIncluded: pageData ? [pageData.page] : [],
        movies: allMovies
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

// ==================== الدالة الرئيسية المعدلة ====================
async function main() {
    console.log("🚀 بدء استخراج الأفلام الذكي (250 فيلم/ملف، صفحتين/تشغيل)");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    // تهيئة الأنظمة
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    // إعادة تعيين لمتغيرات هذا التشغيل فقط
    progress.resetForNewRun();
    
    const startTime = Date.now();
    let totalMoviesExtractedThisRun = 0;
    let duplicateFound = false;
    
    console.log(`📊 الفهرس العام: ${index.getStats().uniqueMovies} فيلم فريد`);
    console.log(`📄 الصفحة الحالية: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
    console.log(`📁 الملف الحالي: ${progress.currentFileName} (${progress.moviesInCurrentFile}/${MOVIES_PER_FILE})`);
    console.log(`📊 الصفحات لهذا التشغيل: ${progress.pagesProcessedThisRun}/${PAGES_PER_RUN}`);
    
    if (progress.foundDuplicate) {
        console.log(`⚠️ تم العثور على تكرار سابق عند الفيلم: ${progress.lastMovieId}`);
    }
    
    // حلقة الصفحات (لصفحتين فقط)
    while (!progress.shouldStop) {
        const pageNum = progress.currentPage;
        console.log(`\n📖 ====== معالجة الصفحة ${pageNum === 1 ? "Home" : pageNum} ======`);
        
        // جلب قائمة الأفلام من الصفحة
        const pageData = await fetchMoviesFromPage(pageNum);
        
        if (!pageData || pageData.movies.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${pageNum}`);
            progress.shouldStop = true;
            break;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.movies.length} فيلم`);
        
        // استخراج تفاصيل كل فيلم في الصفحة
        const pageMoviesData = [];
        let pageDuplicateFound = false;
        
        for (let i = 0; i < pageData.movies.length; i++) {
            const movie = pageData.movies[i];
            
            // التحقق من التكرار
            if (index.isMovieExists(movie.id)) {
                console.log(`\n🛑 اكتشاف تكرار!`);
                console.log(`   الفيلم: ${movie.title}`);
                console.log(`   ID: ${movie.id}`);
                console.log(`   موجود مسبقاً في الفهرس`);
                
                duplicateFound = true;
                pageDuplicateFound = true;
                progress.setDuplicateFound(movie.id);
                break;
            }
            
            // استخراج تفاصيل الفيلم
            console.log(`\n📊 التقدم في الصفحة: ${i + 1}/${pageData.movies.length}`);
            console.log(`📊 التقدم في الملف: ${progress.moviesInCurrentFile}/${MOVIES_PER_FILE}`);
            
            const movieDetails = await fetchMovieDetails(movie, i, progress.currentFileName);
            
            if (movieDetails) {
                // إضافة إلى الفهرس
                const isNew = index.addMovie(movieDetails.id, movieDetails);
                if (isNew) {
                    pageMoviesData.push(movieDetails);
                    totalMoviesExtractedThisRun++;
                    
                    // تحديث تقدم الملف
                    progress.addMovieToFile();
                }
                
                // تحديث التقدم العام
                progress.lastMovieId = movieDetails.id;
                progress.saveProgress();
            }
            
            // تأخير بين الأفلام
            if (i < pageData.movies.length - 1 && !pageDuplicateFound) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // إذا وجد تكرار في هذه الصفحة، توقف
        if (pageDuplicateFound) {
            console.log(`\n🛑 تم إيقاف الاستخراج بسبب اكتشاف فيلم مكرر`);
            console.log(`   آخر فيلم جديد: ${progress.lastMovieId}`);
            break;
        }
        
        // حفظ الأفلام في الملف الحالي
        if (pageMoviesData.length > 0) {
            const fileContent = saveMoviesToCurrentFile(progress, pageMoviesData, pageData);
            console.log(`\n💾 تم إضافة ${pageMoviesData.length} فيلم إلى ${progress.currentFileName}`);
            console.log(`   📊 الإجمالي في الملف: ${fileContent.totalMovies} فيلم`);
            
            // إضافة الصفحة إلى الفهرس
            index.addPage(pageNum, {
                fileName: progress.currentFileName,
                movies: pageMoviesData,
                url: pageData.url
            });
            index.saveIndex();
        }
        
        console.log(`\n✅ اكتملت الصفحة ${pageNum === 1 ? "Home" : pageNum}:`);
        console.log(`   📊 أفلام جديدة: ${pageMoviesData.length}`);
        console.log(`   📈 الإجمالي لهذا التشغيل: ${totalMoviesExtractedThisRun}`);
        
        // تحديث تقدم الصفحات
        progress.addPageProcessed();
        
        // تأخير بين الصفحات
        if (!progress.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // ==================== النتائج النهائية ====================
    const executionTime = Date.now() - startTime;
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل الاستخراج لهذا التشغيل!");
    console.log("=".repeat(60));
    
    // إحصائيات الفهرس
    const stats = index.getStats();
    console.log(`📊 الإحصائيات العامة:`);
    console.log(`   📈 أفلام فريدة: ${stats.uniqueMovies}`);
    console.log(`   📄 صفحات محفوظة: ${stats.totalPages}`);
    console.log(`   ⏱️ وقت التنفيذ: ${(executionTime / 1000).toFixed(1)} ثانية`);
    
    // إحصائيات هذا التشغيل
    console.log(`\n📊 إحصائيات هذا التشغيل:`);
    console.log(`   📊 أفلام جديدة: ${totalMoviesExtractedThisRun}`);
    console.log(`   📄 صفحات معالجة: ${progress.pagesProcessedThisRun}`);
    console.log(`   📁 الملف النشط: ${progress.currentFileName}`);
    console.log(`   📊 أفلام في الملف: ${progress.moviesInCurrentFile}/${MOVIES_PER_FILE}`);
    
    // حالة التوقف
    if (duplicateFound) {
        console.log(`\n🛑 سبب التوقف: اكتشاف فيلم مكرر`);
        console.log(`   📍 آخر فيلم جديد: ${progress.lastMovieId}`);
    } else if (progress.pagesProcessedThisRun >= PAGES_PER_RUN) {
        console.log(`\n✅ تم استخراج ${PAGES_PER_RUN} صفحات بنجاح`);
    }
    
    // الملفات المحفوظة
    console.log(`\n💾 الملفات المحفوظة في movies/:`);
    try {
        const files = fs.readdirSync(MOVIES_DIR).filter(f => f.startsWith('Top') && f.endsWith('.json'));
        files.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            const stats = fs.statSync(filePath);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`   📄 ${file}: ${content.totalMovies} فيلم (${(stats.size / 1024).toFixed(1)} كيلوبايت)`);
        });
    } catch (error) {
        console.log(`   ⚠️ لا يمكن قراءة الملفات`);
    }
    
    // حفظ التقرير النهائي
    const finalReport = {
        runType: "limited_run",
        status: duplicateFound ? "stopped_duplicate" : 
                progress.pagesProcessedThisRun >= PAGES_PER_RUN ? "completed_pages" : "stopped_other",
        timestamp: new Date().toISOString(),
        executionTime: executionTime,
        totalMoviesThisRun: totalMoviesExtractedThisRun,
        totalUniqueMovies: stats.uniqueMovies,
        pagesProcessedThisRun: progress.pagesProcessedThisRun,
        lastPageProcessed: progress.currentPage,
        lastMovieId: progress.lastMovieId,
        currentFile: progress.currentFileName,
        moviesInCurrentFile: progress.moviesInCurrentFile,
        duplicateFound: duplicateFound,
        nextRun: {
            startPage: progress.currentPage,
            currentFile: progress.currentFileName,
            moviesInFile: progress.moviesInCurrentFile
        }
    };
    
    fs.writeFileSync("report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 تم حفظ التقرير النهائي في: report.json`);
    console.log("=".repeat(60));
    console.log(`\n📌 في المرة القادمة، سيبدأ البرنامج من:`);
    console.log(`   الصفحة: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
    console.log(`   الملف: ${progress.currentFileName} (${progress.moviesInCurrentFile}/${MOVIES_PER_FILE})`);
    console.log(`   الصفحات المتبقية لهذا التشغيل: ${PAGES_PER_RUN - progress.pagesProcessedThisRun}`);
    console.log("=".repeat(60));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    // حفظ الخطأ
    const errorReport = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
