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
            fileName: `${pageKey}.json`,
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
                this.lastMovieId = data.lastMovieId || null;
                this.foundDuplicate = data.foundDuplicate || false;
                this.shouldStop = data.shouldStop || false;
            } else {
                this.currentPage = 1;
                this.lastMovieId = null;
                this.foundDuplicate = false;
                this.shouldStop = false;
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم");
            this.currentPage = 1;
            this.lastMovieId = null;
            this.foundDuplicate = false;
            this.shouldStop = false;
        }
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            lastMovieId: this.lastMovieId,
            foundDuplicate: this.foundDuplicate,
            shouldStop: this.shouldStop,
            lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    setDuplicateFound(movieId) {
        this.foundDuplicate = true;
        this.lastMovieId = movieId;
        this.shouldStop = true;
        this.saveProgress();
    }
    
    nextPage() {
        this.currentPage++;
        this.saveProgress();
    }
    
    reset() {
        this.currentPage = 1;
        this.lastMovieId = null;
        this.foundDuplicate = false;
        this.shouldStop = false;
        this.saveProgress();
    }
}

// ==================== دوال المساعدة ====================
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

// ==================== استخراج الأفلام من صفحة ====================
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

// ==================== استخراج تفاصيل الفيلم ====================
async function fetchMovieDetails(movie, index) {
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
        
        // سيرفرات المشاهدة والتحميل (مبسطة)
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
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ صفحة الأفلام ====================
function savePageToFile(pageNum, pageData, moviesData) {
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
    console.log(`\n💾 تم حفظ: movies/${fileName} (${moviesData.length} فيلم)`);
    
    return fileName;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الأفلام الذكي مع منع التكرار");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    // تهيئة الأنظمة
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    const startTime = Date.now();
    let totalMoviesExtracted = 0;
    let duplicateFound = false;
    
    console.log(`📊 الفهرس الحالي: ${index.getStats().uniqueMovies} فيلم فريد`);
    console.log(`📄 الصفحة الحالية: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
    if (progress.foundDuplicate) {
        console.log(`⚠️ تم العثور على تكرار سابق عند الفيلم: ${progress.lastMovieId}`);
    }
    
    // حلقة الصفحات
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
            const movieDetails = await fetchMovieDetails(movie, i);
            
            if (movieDetails) {
                // إضافة إلى الفهرس
                const isNew = index.addMovie(movieDetails.id, movieDetails);
                if (isNew) {
                    pageMoviesData.push(movieDetails);
                    totalMoviesExtracted++;
                }
                
                // تحديث التقدم
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
        
        // حفظ صفحة الأفلام في ملف
        if (pageMoviesData.length > 0) {
            const fileName = savePageToFile(pageNum, pageData, pageMoviesData);
            index.addPage(pageNum, {
                fileName: fileName,
                movies: pageMoviesData,
                url: pageData.url
            });
            index.saveIndex();
        }
        
        console.log(`\n✅ اكتملت الصفحة ${pageNum === 1 ? "Home" : pageNum}:`);
        console.log(`   📊 أفلام جديدة: ${pageMoviesData.length}`);
        console.log(`   📈 الإجمالي حتى الآن: ${totalMoviesExtracted}`);
        
        // الانتقال للصفحة التالية
        if (!duplicateFound) {
            progress.nextPage();
            console.log(`\n🔄 الانتقال للصفحة ${progress.currentPage === 1 ? "Home" : progress.currentPage}...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // ==================== النتائج النهائية ====================
    const executionTime = Date.now() - startTime;
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل الاستخراج الذكي!");
    console.log("=".repeat(60));
    
    // إحصائيات الفهرس
    const stats = index.getStats();
    console.log(`📊 إحصائيات الفهرس:`);
    console.log(`   📈 أفلام فريدة: ${stats.uniqueMovies}`);
    console.log(`   📄 صفحات محفوظة: ${stats.totalPages}`);
    console.log(`   ⏱️ وقت التنفيذ: ${(executionTime / 1000).toFixed(1)} ثانية`);
    
    // حالة التوقف
    if (duplicateFound) {
        console.log(`\n🛑 سبب التوقف: اكتشاف فيلم مكرر`);
        console.log(`   📍 آخر فيلم جديد: ${progress.lastMovieId}`);
        console.log(`   📍 الصفحة الأخيرة: ${progress.currentPage === 1 ? "Home" : progress.currentPage - 1}`);
    } else {
        console.log(`\n✅ اكتمل استخراج جميع الصفحات المتاحة`);
    }
    
    // الملفات المحفوظة
    console.log(`\n💾 الملفات المحفوظة في movies/:`);
    try {
        const files = fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json'));
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
        status: duplicateFound ? "stopped_duplicate" : "completed",
        timestamp: new Date().toISOString(),
        executionTime: executionTime,
        totalMoviesExtracted: totalMoviesExtracted,
        totalUniqueMovies: stats.uniqueMovies,
        lastPageProcessed: progress.currentPage - 1,
        lastMovieId: progress.lastMovieId,
        duplicateFound: duplicateFound,
        files: fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json'))
    };
    
    fs.writeFileSync("report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 تم حفظ التقرير النهائي في: report.json`);
    console.log("=".repeat(60));
    console.log(`\n📌 في المرة القادمة، سيبدأ البرنامج من:`);
    console.log(`   الصفحة: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
    console.log(`   الفهرس: ${stats.uniqueMovies} فيلم فريد`);
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
