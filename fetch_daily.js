import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const CATALOG_FILE = path.join(MOVIES_DIR, "catalog.json"); // ملف سجل بسيط

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 20000) {
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
        if (!shortLink) return null;
        const match = shortLink.match(/p=(\d+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}`);
    
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
        console.log(`✅ عثر على ${movieElements.length} فيلم`);
        
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
    console.log(`🎬 ${movie.title.substring(0, 40)}...`);
    
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
        
        // 2. البيانات الأساسية (الاسم، الصورة، ID)
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        // 3. القصة
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
        // 4. التفاصيل الأساسية فقط
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
        
        return {
            id: movieId,      // ✅ ID
            title: title,     // ✅ الاسم
            image: image,     // ✅ الصورة
            url: movie.url,
            shortLink: shortLink,
            imdbRating: imdbRating,
            story: story,
            details: details,
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الصفحة (كتابة فوقية دائمة) ====================
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
    
    // ⭐⭐⭐ كتابة فوق الملف دائماً ⭐⭐⭐
    fs.writeFileSync(filePath, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ ${fileName} بـ ${moviesData.length} فيلم`);
    
    return fileName;
}

// ==================== تحديث السجل (الكاتالوج) ====================
function updateCatalog(moviesData, pageNum) {
    try {
        let catalog = { movies: [] };
        
        // تحميل الكاتالوج الحالي إذا موجود
        if (fs.existsSync(CATALOG_FILE)) {
            catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
        }
        
        // إضافة الأفلام الجديدة للسجل
        moviesData.forEach(movie => {
            if (movie && movie.id && movie.title) {
                // البحث عن الفيلم في السجل
                const existingIndex = catalog.movies.findIndex(m => m.id === movie.id);
                
                if (existingIndex === -1) {
                    // إضافة فيلم جديد
                    catalog.movies.push({
                        id: movie.id,
                        title: movie.title,
                        image: movie.image,
                        page: pageNum,
                        addedAt: new Date().toISOString()
                    });
                } else {
                    // تحديث الفيلم الموجود
                    catalog.movies[existingIndex] = {
                        ...catalog.movies[existingIndex],
                        title: movie.title,
                        image: movie.image,
                        updatedAt: new Date().toISOString()
                    };
                }
            }
        });
        
        // حفظ الكاتالوج
        catalog.lastUpdated = new Date().toISOString();
        catalog.totalMovies = catalog.movies.length;
        catalog.totalPages = pageNum;
        
        fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
        console.log(`📒 تحديث السجل: ${catalog.movies.length} فيلم`);
        
        return catalog;
        
    } catch (error) {
        console.log(`❌ خطأ في تحديث السجل: ${error.message}`);
        return null;
    }
}

// ==================== استخراج صفحة واحدة وحفظها ====================
async function processPage(pageNum) {
    console.log(`\n========================================`);
    console.log(`🚀 معالجة الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}`);
    console.log(`========================================`);
    
    // جلب الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`⏹️ لا توجد أفلام في هذه الصفحة`);
        return { success: false, total: 0 };
    }
    
    const moviesData = [];
    
    console.log(`🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    // استخراج كل الأفلام
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        const details = await fetchMovieDetails(movie);
        
        if (details && details.id) {
            moviesData.push(details);
            console.log(`   ✅ ${i + 1}/${pageData.movies.length}: ${details.title.substring(0, 30)}...`);
        } else {
            console.log(`   ⏭️ تخطي الفيلم ${i + 1}`);
        }
        
        // انتظار قصير بين الأفلام
        if (i < pageData.movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    // ⭐⭐⭐ حفظ الصفحة مباشرة (كتابة فوقية) ⭐⭐⭐
    if (moviesData.length > 0) {
        savePage(pageNum, pageData, moviesData);
        
        // تحديث سجل الكاتالوج
        updateCatalog(moviesData, pageNum);
        
        console.log(`\n✅ تم حفظ الصفحة ${pageNum} بنجاح`);
        console.log(`📊 الأفلام المحفوظة: ${moviesData.length}`);
        
        // عرض عينة من السجل
        console.log(`📋 عينة من السجل:`);
        moviesData.slice(0, 3).forEach((movie, idx) => {
            console.log(`   ${idx + 1}. ID: ${movie.id}, العنوان: ${movie.title.substring(0, 30)}`);
        });
        
        return { success: true, total: moviesData.length };
    }
    
    return { success: false, total: 0 };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج جميع الصفحات");
    console.log("=".repeat(50));
    
    const START_PAGE = 1;
    const MAX_PAGES = 50; // غير الرقم حسب ما تريد
    
    let totalMovies = 0;
    let successfulPages = 0;
    
    console.log(`⚙️ الإعدادات: من الصفحة ${START_PAGE} إلى ${MAX_PAGES}`);
    
    // ⭐⭐⭐ استخراج كل الصفحات بدون توقف ⭐⭐⭐
    for (let pageNum = START_PAGE; pageNum <= MAX_PAGES; pageNum++) {
        console.log(`\n📊 الصفحات المكتملة: ${successfulPages}/${pageNum - START_PAGE}`);
        
        try {
            const result = await processPage(pageNum);
            
            if (result.success) {
                totalMovies += result.total;
                successfulPages++;
                console.log(`📈 الإجمالي حتى الآن: ${totalMovies} فيلم`);
            } else {
                console.log(`⚠️ فشل في الصفحة ${pageNum}`);
            }
            
        } catch (error) {
            console.log(`💥 خطأ في الصفحة ${pageNum}: ${error.message}`);
        }
        
        // انتظار بين الصفحات (ماعدا الصفحة الأخيرة)
        if (pageNum < MAX_PAGES) {
            console.log(`⏳ انتظار 3 ثواني للصفحة التالية...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // ==================== النتائج النهائية ====================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 انتهى استخراج جميع الصفحات");
    console.log("=".repeat(50));
    console.log(`📊 النتائج النهائية:`);
    console.log(`   - الصفحات المكتملة: ${successfulPages}`);
    console.log(`   - إجمالي الأفلام: ${totalMovies}`);
    console.log(`   - سجل الكاتالوج: ${CATALOG_FILE}`);
    
    // قراءة و عرض ملخص السجل
    try {
        if (fs.existsSync(CATALOG_FILE)) {
            const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
            console.log(`   - الأفلام في السجل: ${catalog.totalMovies}`);
            
            // عرض عينة من السجل
            console.log(`\n📋 عينة من السجل (أول 5 أفلام):`);
            catalog.movies.slice(0, 5).forEach((movie, idx) => {
                console.log(`   ${idx + 1}. ${movie.title} (ID: ${movie.id})`);
            });
        }
    } catch (error) {
        console.log(`   ❌ خطأ في قراءة السجل: ${error.message}`);
    }
    
    console.log("\n📁 الملفات المحفوظة:");
    try {
        const files = fs.readdirSync(MOVIES_DIR)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => {
                if (a === 'Home.json') return -1;
                if (b === 'Home.json') return 1;
                if (a === 'catalog.json') return 1;
                if (b === 'catalog.json') return -1;
                return parseInt(a) - parseInt(b);
            });
        
        files.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                console.log(`   📄 ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
            } catch {
                console.log(`   📄 ${file}`);
            }
        });
    } catch (error) {
        console.log(`   ❌ خطأ في قراءة الملفات: ${error.message}`);
    }
    
    console.log("=".repeat(50));
    
    // حفظ التقرير النهائي
    const finalReport = {
        status: "completed",
        totalPages: successfulPages,
        totalMovies: totalMovies,
        catalogFile: CATALOG_FILE,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("final_report.json", JSON.stringify(finalReport, null, 2));
    console.log(`📝 التقرير النهائي محفوظ في final_report.json`);
}

// التشغيل
main().catch(error => {
    console.error("💥 خطأ غير متوقع:", error.message);
    
    const errorReport = {
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
});
