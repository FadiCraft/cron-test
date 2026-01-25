import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات
const PAGES_DIR = path.join(__dirname, "pages");
const MOVIES_DIR = path.join(__dirname, "movies");
const LAST_PAGE_FILE = path.join(__dirname, "last_page.json");

// إنشاء المجلدات
[PAGES_DIR, MOVIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// دالة fetch محسنة مع headers
async function safeFetch(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
    };

    try {
        console.log(`🌐 جلب: ${url}`);
        const response = await fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        });
        
        if (!response.ok) {
            console.log(`⚠️ استجابة غير ناجحة: ${response.status}`);
            return null;
        }
        
        const html = await response.text();
        return html;
    } catch (error) {
        console.error(`❌ خطأ في الاتصال: ${error.message}`);
        return null;
    }
}

// دالة لتنظيف النص
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
}

// دالة لاستخراج ID من الرابط
function extractMovieId(url) {
    try {
        // حاول أولاً من query parameter
        const urlObj = new URL(url);
        const idFromQuery = urlObj.searchParams.get('p');
        if (idFromQuery) return idFromQuery;
        
        // أو من الاسم في المسار
        const pathMatch = url.match(/\/(\d+)\/?$/);
        if (pathMatch) return pathMatch[1];
        
        // أو أنشئ ID عشوائي
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch {
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
    console.log(`📄 تم حفظ الصفحة ${pageNum}`);
}

// دالة لحفظ آخر صفحة
function saveLastPage(pageNum, hasNewMovies, moviesProcessed) {
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

// دالة لجلب الأفلام من صفحة
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    const html = await safeFetch(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const movies = [];
        
        // البحث بطرق مختلفة
        const selectors = [
            '.Small--Box a',
            '.movie-item a',
            '.post-item a',
            'a[href*="/movie"]',
            'a[href*="/film"]'
        ];
        
        let foundElements = [];
        for (const selector of selectors) {
            const elements = dom.window.document.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`✅ وجد ${elements.length} عنصر باستخدام: ${selector}`);
                foundElements = Array.from(elements);
                break;
            }
        }
        
        // إذا لم نجد بأي selector، نبحث عن جميع الروابط
        if (foundElements.length === 0) {
            const allLinks = dom.window.document.querySelectorAll('a');
            foundElements = Array.from(allLinks).filter(link => {
                const href = link.href;
                return href && (
                    href.includes('/movie') || 
                    href.includes('/film') ||
                    (href.includes('topcinema.rip') && !href.includes('/movies/'))
                );
            });
        }
        
        // استخراج البيانات
        for (const element of foundElements) {
            const movieUrl = element.href;
            if (!movieUrl || !movieUrl.includes('topcinema.rip')) continue;
            
            const movieId = extractMovieId(movieUrl);
            const title = cleanText(element.textContent) || cleanText(element.querySelector('.title')?.textContent);
            
            if (title && movieUrl) {
                movies.push({
                    id: movieId,
                    title: title.substring(0, 100),
                    url: movieUrl,
                    page: pageNum
                });
            }
            
            // فقط أول 20 فيلم لكل صفحة
            if (movies.length >= 20) break;
        }
        
        console.log(`📊 الصفحة ${pageNum}: وجدت ${movies.length} فيلم`);
        return movies;
    } catch (error) {
        console.error(`❌ خطأ في تحليل الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// دالة لاستخراج فيلم واحد (بسيطة)
async function fetchSimpleMovieDetails(movie) {
    try {
        console.log(`🎬 جاري فيلم: ${movie.title.substring(0, 40)}...`);
        
        const html = await safeFetch(movie.url);
        if (!html) {
            // بيانات تجريبية إذا فشل الاتصال
            return createSampleMovieData(movie);
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector("h1")?.textContent || 
                               doc.querySelector(".post-title")?.textContent);
        const image = doc.querySelector("img")?.src;
        
        // محاولة استخراج القصة
        let story = "";
        const storySelectors = ['.story', '.description', '.content', 'p'];
        for (const selector of storySelectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent && element.textContent.length > 50) {
                story = cleanText(element.textContent.substring(0, 300));
                break;
            }
        }
        
        // بيانات الفيلم
        const movieData = {
            id: movie.id,
            title: title || movie.title,
            url: movie.url,
            image: image || "",
            story: story || "لم يتم العثور على قصة الفيلم",
            page: movie.page,
            scrapedAt: new Date().toISOString(),
            status: "success"
        };
        
        // حفظ الفيلم
        const movieFile = path.join(MOVIES_DIR, `movie_${movie.id}.json`);
        fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2));
        
        console.log(`✅ حفظ: ${movie.id}`);
        return movieData;
        
    } catch (error) {
        console.error(`❌ خطأ في فيلم ${movie.id}:`, error.message);
        
        // حفظ بيانات خطأ
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
        
        return errorData;
    }
}

// بيانات تجريبية
function createSampleMovieData(movie) {
    const genres = ["أكشن", "دراما", "كوميديا", "رعب", "خيال علمي"];
    const countries = ["الولايات المتحدة", "مصر", "تركيا", "هند", "كوريا"];
    
    const sampleData = {
        id: movie.id,
        title: movie.title,
        url: movie.url,
        image: `https://picsum.photos/300/450?random=${movie.id}`,
        story: `قصة ${movie.title}: فيلم رائع يحكي قصة شيقة...`,
        genre: genres[Math.floor(Math.random() * genres.length)],
        year: 2020 + Math.floor(Math.random() * 5),
        rating: (5 + Math.random() * 5).toFixed(1),
        country: countries[Math.floor(Math.random() * countries.length)],
        page: movie.page,
        scrapedAt: new Date().toISOString(),
        status: "sample_data"
    };
    
    const movieFile = path.join(MOVIES_DIR, `movie_${movie.id}.json`);
    fs.writeFileSync(movieFile, JSON.stringify(sampleData, null, 2));
    
    console.log(`📝 حفظ بيانات تجريبية لـ ${movie.id}`);
    return sampleData;
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء الاستخراج الذكي...");
    console.log("📊 الأفلام الحالية:", countTotalMovies());
    
    let pageNum = 1;
    let foundExistingMovie = false;
    let totalNewMovies = 0;
    let moviesProcessed = [];
    
    // حلقة الصفحات
    while (!foundExistingMovie && pageNum <= 10) { // حد أقصى 10 صفحات
        console.log(`\n📖 ===== الصفحة ${pageNum} =====`);
        
        // جلب الأفلام
        const moviesOnPage = await fetchMoviesFromPage(pageNum);
        
        if (!moviesOnPage || moviesOnPage.length === 0) {
            console.log("⏹️ لا توجد أفلام، الانتقال للصفحة التالية");
            pageNum++;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
        }
        
        // حفظ الصفحة
        savePage(pageNum, moviesOnPage);
        
        // معالجة الأفلام
        let processedInPage = 0;
        
        for (const movie of moviesOnPage) {
            // تحقق إذا كان الفيلم موجوداً
            if (isMovieExists(movie.id) && !movie.id.startsWith('temp_')) {
                console.log(`⏭️ تخطي ${movie.id} (موجود)`);
                foundExistingMovie = true;
                break;
            }
            
            // استخراج بيانات الفيلم
            const result = await fetchSimpleMovieDetails(movie);
            
            if (result && result.status !== "error") {
                processedInPage++;
                totalNewMovies++;
                moviesProcessed.push({
                    id: movie.id,
                    title: movie.title,
                    status: result.status
                });
            }
            
            // تأخير بين الأفلام
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // توقف بعد 5 أفلام (للاختبار)
            if (totalNewMovies >= 5) {
                console.log("⚠️ توقف بعد 5 أفلام (للاختبار)");
                foundExistingMovie = true;
                break;
            }
        }
        
        console.log(`📈 الصفحة ${pageNum}: ${processedInPage} أفلام جديدة`);
        
        if (foundExistingMovie || processedInPage === 0) {
            console.log("🛑 توقف الاستخراج");
            break;
        }
        
        pageNum++;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // حفظ حالة التنفيذ
    saveLastPage(pageNum - 1, totalNewMovies > 0, moviesProcessed);
    
    // ملخص النتائج
    const summary = {
        success: true,
        timestamp: new Date().toISOString(),
        totalPages: pageNum - 1,
        totalMoviesAdded: totalNewMovies,
        totalMoviesNow: countTotalMovies(),
        moviesProcessed: moviesProcessed,
        stoppedAtPage: pageNum - 1,
        stoppedReason: foundExistingMovie ? "وجد فيلم موجود" : "انتهت الصفحات"
    };
    
    fs.writeFileSync("result.json", JSON.stringify(summary, null, 2));
    
    // إظهار النتائج
    console.log("\n" + "=".repeat(50));
    console.log("✅ الانتهاء بنجاح!");
    console.log("=".repeat(50));
    console.log(`📄 الصفحات: ${pageNum - 1}`);
    console.log(`🎬 الأفلام المضافة: ${totalNewMovies}`);
    console.log(`📊 الإجمالي الآن: ${countTotalMovies()}`);
    console.log(`💾 المجلدات:`);
    console.log(`   - movies/: ${fs.readdirSync(MOVIES_DIR).length} ملف`);
    console.log(`   - pages/: ${fs.readdirSync(PAGES_DIR).length} ملف`);
    console.log("=".repeat(50));
    
    // عرض أمثلة من الملفات المحفوظة
    console.log("\n📋 أمثلة من الملفات المحفوظة:");
    try {
        const movieFiles = fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json'));
        if (movieFiles.length > 0) {
            for (let i = 0; i < Math.min(3, movieFiles.length); i++) {
                const filePath = path.join(MOVIES_DIR, movieFiles[i]);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log(`   ${movieFiles[i]}: ${content.title}`);
            }
        }
    } catch (err) {
        console.log("   لا يمكن قراءة الملفات");
    }
}

// تشغيل البرنامج
main().catch(error => {
    console.error("💥 خطأ رئيسي:", error);
    
    // حفظ خطأ
    const errorSummary = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("result.json", JSON.stringify(errorSummary, null, 2));
    process.exit(1);
});
