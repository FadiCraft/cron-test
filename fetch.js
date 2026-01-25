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

// دالة لتنظيف النص
function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

// دالة لاستخراج ID من الرابط
function extractMovieId(url) {
    const match = url.match(/p=(\d+)/);
    return match ? match[1] : Date.now().toString();
}

// دالة للتحقق إذا كان الفيلم موجوداً
function isMovieExists(movieId) {
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
        movies: movies,
        savedAt: new Date().toISOString()
    };
    fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));
    console.log(`📄 تم حفظ الصفحة ${pageNum} (${movies.length} فيلم)`);
}

// دالة لحفظ آخر صفحة تم معالجتها
function saveLastPage(pageNum, hasNewMovies) {
    const lastPageData = {
        lastPage: pageNum,
        lastRun: new Date().toISOString(),
        hasNewMovies: hasNewMovies,
        totalMovies: countTotalMovies()
    };
    fs.writeFileSync(LAST_PAGE_FILE, JSON.stringify(lastPageData, null, 2));
}

// دالة لحساب إجمالي الأفلام
function countTotalMovies() {
    if (!fs.existsSync(MOVIES_DIR)) return 0;
    const files = fs.readdirSync(MOVIES_DIR);
    return files.filter(f => f.startsWith("movie_") && f.endsWith(".json")).length;
}

// دالة لجلب قائمة الأفلام من صفحة معينة
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`🌐 جلب الصفحة ${pageNum}: ${url}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const movies = [];
        
        // استخراج الروابط من الصفحة
        const movieElements = dom.window.document.querySelectorAll('.Small--Box a');
        
        for (const element of movieElements) {
            const movieUrl = element.href;
            if (movieUrl && !movies.some(m => m.url === movieUrl)) {
                const movieId = extractMovieId(movieUrl);
                movies.push({
                    id: movieId,
                    title: cleanText(element.querySelector('.title')?.textContent) || "بدون عنوان",
                    url: movieUrl,
                    page: pageNum
                });
            }
        }
        
        return movies;
    } catch (error) {
        console.error(`❌ خطأ في جلب الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// دالة لاستخراج بيانات فيلم واحد
async function fetchMovieDetails(movie) {
    try {
        console.log(`🎬 استخراج الفيلم #${movie.id}: ${movie.title.substring(0, 30)}...`);
        
        const response = await fetch(movie.url);
        if (!response.ok) throw new Error(`فشل الاتصال: ${response.status}`);
        
        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
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

        // تجميع البيانات
        const movieData = {
            id: movie.id,
            title: title,
            url: movie.url,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            page: movie.page,
            scrapedAt: new Date().toISOString()
        };

        // حفظ الفيلم
        const movieFile = path.join(MOVIES_DIR, `movie_${movie.id}.json`);
        fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2), "utf8");
        
        console.log(`✅ تم حفظ: movie_${movie.id}.json`);
        return movieData;

    } catch (error) {
        console.error(`❌ خطأ في استخراج الفيلم ${movie.id}:`, error.message);
        return null;
    }
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء الاستخراج الذكي...");
    console.log("📁 الأفلام الموجودة حالياً:", countTotalMovies());
    
    let pageNum = 1;
    let foundExistingMovie = false;
    let totalNewMovies = 0;
    let hasNewMovies = false;
    
    // حلقة عبر الصفحات
    while (!foundExistingMovie) {
        console.log(`\n📖 ====== الصفحة ${pageNum} ======`);
        
        // جلب الأفلام من الصفحة الحالية
        const moviesOnPage = await fetchMoviesFromPage(pageNum);
        
        if (!moviesOnPage || moviesOnPage.length === 0) {
            console.log("⏹️ لا توجد أفلام في هذه الصفحة، التوقف.");
            break;
        }
        
        // حفظ صفحة الأفلام
        savePage(pageNum, moviesOnPage);
        
        // استخراج كل فيلم في الصفحة
        let newMoviesInPage = 0;
        
        for (const movie of moviesOnPage) {
            // التحقق إذا كان الفيلم موجوداً
            if (isMovieExists(movie.id)) {
                console.log(`⏭️ تخطي الفيلم ${movie.id} (موجود مسبقاً)`);
                foundExistingMovie = true;
                break;
            }
            
            // استخراج بيانات الفيلم
            const movieData = await fetchMovieDetails(movie);
            if (movieData) {
                newMoviesInPage++;
                totalNewMovies++;
                hasNewMovies = true;
            }
            
            // تأخير لتجنب حظر IP
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        console.log(`📊 الصفحة ${pageNum}: ${newMoviesInPage} أفلام جديدة`);
        
        // إذا وجدنا فيلم موجود، نتوقف
        if (foundExistingMovie) {
            console.log(`🛑 تم العثور على فيلم موجود، التوقف عند الصفحة ${pageNum}`);
            break;
        }
        
        // الانتقال للصفحة التالية
        pageNum++;
        
        // تأخير بين الصفحات
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // حفظ آخر صفحة
    saveLastPage(pageNum - 1, hasNewMovies);
    
    // إنشاء ملخص
    const summary = {
        success: true,
        timestamp: new Date().toISOString(),
        lastPageProcessed: pageNum - 1,
        totalPagesProcessed: pageNum - 1,
        newMoviesAdded: totalNewMovies,
        totalMoviesNow: countTotalMovies(),
        stoppedBecauseExisting: foundExistingMovie,
        note: "استخراج ذكي - توقف عند أول فيلم موجود"
    };
    
    fs.writeFileSync("result.json", JSON.stringify(summary, null, 2));
    
    console.log("\n✅ ====== الانتهاء ======");
    console.log(`📄 تمت معالجة ${pageNum - 1} صفحة`);
    console.log(`🎬 أضيف ${totalNewMovies} فيلم جديد`);
    console.log(`📊 إجمالي الأفلام الآن: ${countTotalMovies()}`);
    console.log(`💾 آخر صفحة: ${pageNum - 1}`);
    console.log(`📝 النتائج في: result.json`);
}

// تشغيل البرنامج
main().catch(error => {
    console.error("❌ خطأ غير متوقع:", error);
    process.exit(1);
});
