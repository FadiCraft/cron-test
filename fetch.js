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
const PROGRESS_FILE = path.join(__dirname, "progress.json");

// إنشاء المجلدات
[PAGES_DIR, MOVIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// دالة لحفظ حالة التقدم
function saveProgress(state) {
    const progress = {
        ...state,
        lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// دالة لتحميل حالة التقدم
function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        }
    } catch (error) {
        console.log("⚠️ لا يمكن تحميل حالة التقدم:", error.message);
    }
    return null;
}

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
            console.log(`🌐 محاولة ${i + 1}: ${url.substring(0, 60)}...`);
            const response = await fetch(url, { headers });
            
            if (response.ok) {
                return await response.text();
            } else {
                console.log(`⚠️ الاستجابة: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ خطأ: ${error.message}`);
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
        
        const pathMatch = url.match(/\/(\d+)\/?$/);
        if (pathMatch && pathMatch[1]) {
            return pathMatch[1];
        }
        
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

// دالة لحفظ الصفحة فوراً
async function savePageImmediately(pageNum, movies) {
    const pageFile = path.join(PAGES_DIR, `page_${pageNum}.json`);
    const pageData = {
        page: pageNum,
        url: `https://topcinema.rip/movies/${pageNum > 1 ? `page/${pageNum}/` : ''}`,
        moviesCount: movies.length,
        movies: movies.map(m => ({ id: m.id, title: m.title, url: m.url })),
        savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));
    console.log(`💾 حفظت الصفحة ${pageNum}`);
    
    // حفظ حالة التقدم
    const progress = loadProgress() || {};
    progress.lastPageSaved = pageNum;
    progress.totalPagesSaved = pageNum;
    progress.lastSavedAt = new Date().toISOString();
    saveProgress(progress);
    
    return pageData;
}

// دالة لحفظ الفيلم فوراً
async function saveMovieImmediately(movieData) {
    if (!movieData || !movieData.id) return null;
    
    const movieFile = path.join(MOVIES_DIR, `movie_${movieData.id}.json`);
    fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2), "utf8");
    
    console.log(`💾 حفظت الفيلم: ${movieData.id}`);
    
    // تحديث التقدم
    const progress = loadProgress() || {};
    progress.moviesSaved = (progress.moviesSaved || 0) + 1;
    progress.lastMovieId = movieData.id;
    progress.lastSavedAt = new Date().toISOString();
    saveProgress(progress);
    
    return movieData;
}

// دالة لحفظ الملخص النهائي
function saveFinalSummary(state) {
    const summary = {
        success: true,
        timestamp: new Date().toISOString(),
        lastPageProcessed: state.currentPage - 1,
        totalPagesProcessed: state.currentPage - 1,
        newMoviesAdded: state.totalNewMovies,
        totalMoviesNow: countTotalMovies(),
        stoppedBecauseExisting: state.foundExistingMovie,
        executionTime: Date.now() - state.startTime,
        note: `تم الاستخراج أول بأول - الصفحة ${state.currentPage - 1}`
    };
    
    fs.writeFileSync("result.json", JSON.stringify(summary, null, 2));
    console.log(`💾 حفظت النتيجة النهائية`);
    return summary;
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
    
    const html = await fetchWithRetry(url);
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // البحث عن الروابط
        const elements = doc.querySelectorAll('.Small--Box a, article a, .movie-item a');
        
        for (const element of elements) {
            try {
                const movieUrl = element.href;
                if (!movieUrl || !movieUrl.includes('topcinema.rip')) continue;
                
                const movieId = extractMovieId(movieUrl);
                const title = cleanText(element.querySelector('.title')?.textContent || 
                                      element.textContent || 
                                      `فيلم من الصفحة ${pageNum}`);
                
                if (title.length > 5) { // تأكد أنه عنوان حقيقي
                    movies.push({
                        id: movieId,
                        title: title.substring(0, 100),
                        url: movieUrl,
                        page: pageNum
                    });
                }
                
                // حد أقصى 20 فيلم لكل صفحة
                if (movies.length >= 20) break;
                
            } catch (error) {
                // تجاهل الأخطاء في العناصر
            }
        }
        
        console.log(`✅ الصفحة ${pageNum}: ${movies.length} فيلم`);
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// دالة لاستخراج فيلم واحد (مبسطة)
async function fetchMovieDetails(movie) {
    try {
        console.log(`🎬 جاري: ${movie.title.substring(0, 40)}...`);
        
        const html = await fetchWithRetry(movie.url);
        if (!html) {
            console.log(`⚠️ فشل جلب الفيلم ${movie.id}`);
            return createBasicMovieData(movie);
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || 
                               doc.querySelector("h1")?.textContent || 
                               movie.title);
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
        
        // البيانات النهائية
        const movieData = {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story || "قصة الفيلم غير متوفرة",
            details: details,
            page: movie.page,
            scrapedAt: new Date().toISOString(),
            status: "success"
        };
        
        return movieData;
        
    } catch (error) {
        console.error(`❌ خطأ في الفيلم ${movie.id}:`, error.message);
        
        return {
            id: movie.id,
            title: movie.title,
            url: movie.url,
            error: error.message,
            scrapedAt: new Date().toISOString(),
            status: "error"
        };
    }
}

// بيانات أساسية للفيلم
function createBasicMovieData(movie) {
    return {
        id: movie.id,
        title: movie.title,
        url: movie.url,
        page: movie.page,
        scrapedAt: new Date().toISOString(),
        status: "basic_data",
        note: "تم حفظ البيانات الأساسية فقط"
    };
}

// دالة للالتزام بالتغييرات إلى Git
async function commitChangesToGit(pageNum, moviesCount) {
    try {
        console.log(`🔄 إعداد الالتزام للتغييرات...`);
        
        // تشغيل أوامر git
        const { execSync } = await import('child_process');
        
        // إضافة الملفات الجديدة
        execSync('git add pages/ movies/ result.json progress.json last_page.json || true', { stdio: 'inherit' });
        
        // الالتزام
        const commitMessage = `🎬 تحديث الصفحة ${pageNum} - ${moviesCount} أفلام جديدة`;
        execSync(`git commit -m "${commitMessage}" || echo "لا توجد تغييرات"`, { stdio: 'inherit' });
        
        // الدفع
        execSync('git push || echo "لا يمكن الدفع"', { stdio: 'inherit' });
        
        console.log(`✅ تم الالتزام والدفع للصفحة ${pageNum}`);
        
    } catch (error) {
        console.log(`⚠️ لا يمكن الالتزام: ${error.message}`);
    }
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء الاستخراج أول بأول...");
    
    // حالة التنفيذ
    const state = {
        startTime: Date.now(),
        currentPage: 1,
        foundExistingMovie: false,
        totalNewMovies: 0,
        shouldStop: false,
        maxPages: 5 // يمكنك زيادة هذا الرقم
    };
    
    // تحميل التقدم السابق
    const progress = loadProgress();
    if (progress && progress.lastPageSaved) {
        console.log(`📖 استئناف من الصفحة ${progress.lastPageSaved + 1}`);
        state.currentPage = progress.lastPageSaved + 1;
    }
    
    console.log(`📊 الأفلام الموجودة: ${countTotalMovies()}`);
    
    // حلقة الصفحات
    while (!state.foundExistingMovie && !state.shouldStop && state.currentPage <= state.maxPages) {
        console.log(`\n📖 ===== الصفحة ${state.currentPage} =====`);
        
        // جلب الأفلام من الصفحة
        const moviesOnPage = await fetchMoviesFromPage(state.currentPage);
        
        if (!moviesOnPage || moviesOnPage.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${state.currentPage}`);
            state.shouldStop = true;
            break;
        }
        
        // حفظ الصفحة فوراً
        await savePageImmediately(state.currentPage, moviesOnPage);
        
        // معالجة الأفلام
        let newMoviesInPage = 0;
        const pageMoviesData = [];
        
        for (const movie of moviesOnPage) {
            // تحقق إذا كان الفيلم موجوداً
            if (isMovieExists(movie.id) && !movie.id.startsWith('temp_')) {
                console.log(`⏭️ تخطي ${movie.id} (موجود)`);
                state.foundExistingMovie = true;
                break;
            }
            
            // استخراج وحفظ الفيلم
            const movieData = await fetchMovieDetails(movie);
            if (movieData) {
                await saveMovieImmediately(movieData);
                newMoviesInPage++;
                state.totalNewMovies++;
                pageMoviesData.push(movieData);
            }
            
            // تأخير قصير بين الأفلام
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`📈 الصفحة ${state.currentPage}: ${newMoviesInPage} أفلام جديدة`);
        
        // إذا لم يتم إضافة أفلام جديدة، توقف
        if (newMoviesInPage === 0 && !state.foundExistingMovie) {
            console.log(`🛑 لم تتم إضافة أفلام جديدة في الصفحة ${state.currentPage}`);
            state.shouldStop = true;
        }
        
        // إذا وصلنا للحد الأقصى، توقف
        if (state.totalNewMovies >= 20) {
            console.log(`🛑 وصلنا للحد الأقصى (20 فيلم)`);
            state.shouldStop = true;
        }
        
        // تحديث التقدم
        saveProgress({
            currentPage: state.currentPage,
            totalNewMovies: state.totalNewMovies,
            foundExistingMovie: state.foundExistingMovie,
            shouldStop: state.shouldStop
        });
        
        // الانتقال للصفحة التالية
        state.currentPage++;
        
        // تأخير بين الصفحات
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // حفظ النتيجة النهائية
    const summary = saveFinalSummary(state);
    
    // عرض النتائج
    console.log("\n" + "=".repeat(60));
    console.log("✅ اكتمل الاستخراج!");
    console.log("=".repeat(60));
    console.log(`📄 الصفحات: ${state.currentPage - 1}`);
    console.log(`🎬 الأفلام الجديدة: ${state.totalNewMovies}`);
    console.log(`📊 الإجمالي: ${countTotalMovies()}`);
    console.log(`⏱️ الوقت: ${((Date.now() - state.startTime) / 1000).toFixed(1)} ثانية`);
    console.log("=".repeat(60));
}

// تشغيل البرنامج
main().catch(error => {
    console.error("💥 خطأ رئيسي:", error);
    
    // حفظ الخطأ
    const errorSummary = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("result.json", JSON.stringify(errorSummary, null, 2));
    process.exit(1);
});
