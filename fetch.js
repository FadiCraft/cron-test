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
async function fetchWithTimeout(url, timeout = 10000) { // 10 ثواني
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
            console.log(`⏱️ انتهى الوقت لـ ${url}`);
        } else {
            console.log(`❌ خطأ: ${error.message}`);
        }
        return null;
    }
}

// ==================== الدوال الأساسية ====================
function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractMovieId(url) {
    try {
        const match = url.match(/p=(\d+)/);
        return match ? match[1] : url.split('/').filter(p => p).pop() || 'temp';
    } catch {
        return 'temp';
    }
}

// جلب قائمة الأفلام من صفحة
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 الصفحة ${pageNum}`);
    
    const html = await fetchWithTimeout(url, 15000); // 15 ثانية كحد أقصى
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
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
                const movieId = extractMovieId(movieUrl);
                const title = cleanText(element.querySelector('.title')?.textContent || 
                                      element.textContent || 
                                      `فيلم ${i + 1}`);
                
                movies.push({
                    id: movieId,
                    title: title,
                    url: movieUrl,
                    page: pageNum
                });
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة ${pageNum}`);
        return null;
    }
}

// جلب تفاصيل الفيلم
async function fetchMovieDetails(movie) {
    console.log(`🎬 ${movie.title.substring(0, 30)}...`);
    
    const html = await fetchWithTimeout(movie.url, 15000);
    
    if (!html) {
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || movie.title);
        const image = doc.querySelector(".image img")?.src;
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // تفاصيل بسيطة
        const details = {};
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = cleanText(labelElement.textContent).replace(":", "").trim();
                if (label) {
                    details[label] = cleanText(item.textContent.split(":").slice(1).join(":").trim());
                }
            }
        });
        
        return {
            id: movie.id,
            title: title,
            image: image,
            story: story || "غير متوفر",
            details: details,
            page: movie.page
        };
        
    } catch (error) {
        return null;
    }
}

// حفظ الصفحة
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
    console.log("🚀 بدء الاستخراج");
    
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    let totalNew = 0;
    let consecutiveDuplicates = 0;
    const MAX_CONSECUTIVE_DUPLICATES = 3;
    
    while (true) {
        const pageNum = progress.currentPage;
        console.log(`\n📄 === صفحة ${pageNum} ===`);
        
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
            // تحقق سريع من الفهرس
            if (index.isMovieExists(movie.id)) {
                console.log(`⚠️ مكرر: ${movie.title.substring(0, 20)}...`);
                consecutiveDuplicates++;
                
                if (consecutiveDuplicates >= MAX_CONSECUTIVE_DUPLICATES) {
                    console.log(`🛑 توقف: ${MAX_CONSECUTIVE_DUPLICATES} تكرارات متتالية`);
                    break;
                }
                continue;
            }
            
            // إعادة تعيين العداد
            consecutiveDuplicates = 0;
            
            // جلب التفاصيل
            const details = await fetchMovieDetails(movie);
            
            if (details) {
                // إضافة للفهرس
                index.addMovie(details.id, details);
                newMovies.push(details);
                totalNew++;
                pageHasNew = true;
            }
            
            // انتظار بسيط بين الأفلام
            await new Promise(resolve => setTimeout(resolve, 500));
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
    console.log("\n" + "=".repeat(40));
    console.log("🎉 انتهى الاستخراج");
    console.log(`📊 أفلام جديدة: ${totalNew}`);
    console.log(`📋 الفهرس: ${Object.keys(index.movies).length} فيلم`);
    console.log("=".repeat(40));
    
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
