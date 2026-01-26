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
                console.log(`📂 تم تحميل الفهرس: ${Object.keys(this.movies).length} فيلم فريد`);
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
            url: pageData.url,
            updatedAt: new Date().toISOString()
        };
        
        // إذا كانت الصفحة جديدة فقط، نزيد العداد
        if (!this.pages[pageKey] || !this.pages[pageKey].scrapedAt) {
            this.stats.totalPages++;
        }
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
    
    // دالة جديدة: التحقق من وجود صفحة في الفهرس
    isPageScraped(pageNum) {
        const pageKey = pageNum === 1 ? "Home" : pageNum.toString();
        return !!this.pages[pageKey];
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
                this.consecutiveDuplicates = data.consecutiveDuplicates || 0;
                this.shouldStop = data.shouldStop || false;
                console.log(`📄 التقدم: الصفحة ${this.currentPage}`);
            } else {
                this.currentPage = 1;
                this.lastMovieId = null;
                this.consecutiveDuplicates = 0;
                this.shouldStop = false;
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم");
            this.currentPage = 1;
            this.lastMovieId = null;
            this.consecutiveDuplicates = 0;
            this.shouldStop = false;
        }
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            lastMovieId: this.lastMovieId,
            consecutiveDuplicates: this.consecutiveDuplicates,
            shouldStop: this.shouldStop,
            lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    // زيادة عدد التكرارات المتتالية
    incrementConsecutiveDuplicates() {
        this.consecutiveDuplicates++;
        console.log(`🔄 تكرار متتالي: ${this.consecutiveDuplicates}/3`);
        
        if (this.consecutiveDuplicates >= 3) {
            this.shouldStop = true;
            console.log(`🛑 توقف: 3 أفلام مكررة متتالية`);
        }
        this.saveProgress();
    }
    
    // إعادة تعيين التكرارات المتتالية
    resetConsecutiveDuplicates() {
        this.consecutiveDuplicates = 0;
        this.saveProgress();
    }
    
    nextPage() {
        this.currentPage++;
        this.consecutiveDuplicates = 0; // إعادة تعيين عند الانتقال لصفحة جديدة
        this.saveProgress();
    }
    
    reset() {
        this.currentPage = 1;
        this.lastMovieId = null;
        this.consecutiveDuplicates = 0;
        this.shouldStop = false;
        this.saveProgress();
    }
}

// ==================== دوال المساعدة ====================
async function fetchPage(url) {
    try {
        console.log(`🌐 جلب: ${url.substring(0, 60)}...`);
        
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
    
    console.log(`\n📖 ===== الصفحة ${pageNum === 1 ? "Home" : pageNum} =====`);
    console.log(`🔗 ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 جاري البحث عن الأفلام...");
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ وجدت ${movieElements.length} فيلم`);
        
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
async function fetchMovieDetails(movie) {
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
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ/تحديث صفحة الأفلام ====================
function savePageToFile(pageNum, pageData, moviesData, isUpdate = false) {
    const fileName = pageNum === 1 ? "Home.json" : `${pageNum}.json`;
    const filePath = path.join(MOVIES_DIR, fileName);
    
    const pageContent = {
        page: pageNum,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        movies: moviesData,
        status: isUpdate ? "updated" : "new"
    };
    
    fs.writeFileSync(filePath, JSON.stringify(pageContent, null, 2));
    
    if (isUpdate) {
        console.log(`\n🔄 تم تحديث: movies/${fileName} (${moviesData.length} فيلم)`);
    } else {
        console.log(`\n💾 تم حفظ: movies/${fileName} (${moviesData.length} فيلم)`);
    }
    
    return fileName;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الأفلام الذكي");
    console.log("⏱️ " + new Date().toLocaleString());
    console.log("=".repeat(50));
    
    // تهيئة الأنظمة
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    const startTime = Date.now();
    let totalMoviesExtracted = 0;
    let hasNewMovies = false;
    
    console.log(`📊 الفهرس: ${index.getStats().uniqueMovies} فيلم فريد`);
    console.log(`📄 الصفحة الحالية: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
    
    // حلقة الصفحات الرئيسية
    while (!progress.shouldStop) {
        const pageNum = progress.currentPage;
        const pageKey = pageNum === 1 ? "Home" : pageNum.toString();
        
        console.log(`\n📖 === الصفحة ${pageKey} ===`);
        
        // جلب قائمة الأفلام من الصفحة
        const pageData = await fetchMoviesFromPage(pageNum);
        
        if (!pageData || pageData.movies.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${pageNum}`);
            progress.shouldStop = true;
            break;
        }
        
        console.log(`📊 ${pageData.movies.length} فيلم للتحقق`);
        
        // استخراج تفاصيل كل فيلم في الصفحة
        const newMoviesData = [];
        const allMoviesData = [];
        
        for (let i = 0; i < pageData.movies.length; i++) {
            const movie = pageData.movies[i];
            
            // استخراج تفاصيل الفيلم
            console.log(`\n📊 التقدم: ${i + 1}/${pageData.movies.length}`);
            const movieDetails = await fetchMovieDetails(movie);
            
            if (!movieDetails) continue;
            
            // التحقق من التكرار
            const isDuplicate = index.isMovieExists(movieDetails.id);
            
            if (isDuplicate) {
                console.log(`   ⚠️ مكرر: ${movieDetails.title.substring(0, 30)}...`);
                
                // زيادة التكرارات المتتالية
                progress.incrementConsecutiveDuplicates();
                
                // إذا وصلنا لـ3 تكرارات متتالية، نتوقف
                if (progress.consecutiveDuplicates >= 3) {
                    console.log(`\n🛑 توقف: 3 أفلام مكررة متتالية`);
                    console.log(`   آخر فيلم جديد: ${progress.lastMovieId}`);
                    progress.shouldStop = true;
                    break;
                }
            } else {
                // فيلم جديد - إضافته
                console.log(`   ✅ جديد: ${movieDetails.title.substring(0, 30)}...`);
                
                index.addMovie(movieDetails.id, movieDetails);
                newMoviesData.push(movieDetails);
                allMoviesData.push(movieDetails);
                totalMoviesExtracted++;
                hasNewMovies = true;
                
                // إعادة تعيين التكرارات المتتالية
                progress.resetConsecutiveDuplicates();
                progress.lastMovieId = movieDetails.id;
                progress.saveProgress();
            }
            
            // إضافة الفيلم المكرر للبيانات الكاملة (للتحديث)
            if (isDuplicate) {
                allMoviesData.push(movieDetails);
            }
            
            // تأخير بين الأفلام
            if (i < pageData.movies.length - 1 && !progress.shouldStop) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // إذا وجد 3 تكرارات متتالية، توقف
        if (progress.shouldStop && progress.consecutiveDuplicates >= 3) {
            console.log(`\n🛑 تم إيقاف الاستخراج: 3 أفلام مكررة متتالية`);
            break;
        }
        
        // حفظ أو تحديث الصفحة
        if (allMoviesData.length > 0) {
            const isUpdate = index.isPageScraped(pageNum);
            const fileName = savePageToFile(pageNum, pageData, allMoviesData, isUpdate);
            
            index.addPage(pageNum, {
                fileName: fileName,
                movies: allMoviesData,
                url: pageData.url
            });
            index.saveIndex();
        }
        
        console.log(`\n✅ اكتملت الصفحة ${pageKey}:`);
        console.log(`   🆕 أفلام جديدة: ${newMoviesData.length}`);
        console.log(`   📊 الإجمالي: ${allMoviesData.length}`);
        console.log(`   📈 الإجمالي الكلي: ${totalMoviesExtracted}`);
        
        // إذا لم يكن هناك أفلام جديدة في هذه الصفحة، نتوقف
        if (newMoviesData.length === 0) {
            console.log(`\n⚠️ لا توجد أفلام جديدة في الصفحة ${pageKey}`);
            
            // لكن ننتقل للصفحة التالية للتحقق
            if (!progress.shouldStop) {
                progress.nextPage();
                console.log(`\n➡️ الانتقال للصفحة ${progress.currentPage}...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } else {
            // هناك أفلام جديدة، ننتقل للصفحة التالية
            if (!progress.shouldStop) {
                progress.nextPage();
                console.log(`\n➡️ الانتقال للصفحة ${progress.currentPage}...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    // ==================== النتائج النهائية ====================
    const executionTime = Date.now() - startTime;
    
    console.log("\n" + "=".repeat(50));
    console.log("🎉 اكتمل الاستخراج!");
    console.log("=".repeat(50));
    
    // إحصائيات الفهرس
    const stats = index.getStats();
    console.log(`📊 النتائج:`);
    console.log(`   🎬 أفلام فريدة: ${stats.uniqueMovies}`);
    console.log(`   📄 صفحات محفوظة: ${Object.keys(index.pages).length}`);
    console.log(`   🆕 أفلام جديدة اليوم: ${totalMoviesExtracted}`);
    console.log(`   ⏱️ الوقت: ${(executionTime / 1000).toFixed(1)} ثانية`);
    
    // عرض الملفات
    console.log(`\n💾 الملفات في movies/:`);
    try {
        const files = fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
        
        if (files.length === 0) {
            console.log("   📭 لا توجد ملفات");
        } else {
            // عرض آخر 5 ملفات
            files.slice(-5).forEach(file => {
                const filePath = path.join(MOVIES_DIR, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const status = content.status === "updated" ? "🔄" : "💾";
                console.log(`   ${status} ${file}: ${content.totalMovies} فيلم`);
            });
            
            if (files.length > 5) {
                console.log(`   ... و ${files.length - 5} ملفات أخرى`);
            }
        }
    } catch (error) {
        console.log(`   ⚠️ لا يمكن قراءة الملفات`);
    }
    
    // حفظ التقرير
    const finalReport = {
        status: hasNewMovies ? "completed_with_new" : "completed_no_new",
        timestamp: new Date().toISOString(),
        executionTime: executionTime,
        totalMoviesExtracted: totalMoviesExtracted,
        totalUniqueMovies: stats.uniqueMovies,
        lastPageProcessed: progress.currentPage - 1,
        consecutiveDuplicates: progress.consecutiveDuplicates,
        hasNewMovies: hasNewMovies,
        stopReason: progress.consecutiveDuplicates >= 3 ? "3_consecutive_duplicates" : "normal"
    };
    
    fs.writeFileSync("report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 التقرير: report.json`);
    console.log("=".repeat(50));
    
    if (!hasNewMovies) {
        console.log(`\n💤 لا توجد أفلام جديدة اليوم`);
        console.log(`   البرنامج سيتحقق غداً مجدداً`);
    }
    
    console.log("=".repeat(50));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    const errorReport = {
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
