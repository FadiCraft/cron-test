import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const INDEX_FILE = path.join(MOVIES_DIR, "index.json");

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
                console.log(`📂 الفهرس المحمل: ${Object.keys(this.movies).length} فيلم`);
            } else {
                this.movies = {};
                console.log(`📝 الفهرس جديد`);
            }
        } catch (error) {
            console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
            this.movies = {};
        }
    }
    
    saveIndex() {
        try {
            const indexData = {
                movies: this.movies,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
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
                addedAt: new Date().toISOString()
            };
            return true;
        }
        return false;
    }
    
    isMovieExists(movieId) {
        return !!this.movies[movieId];
    }
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
    
    console.log(`\n📖 الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}: ${url}`);
    
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
        console.log(`🔍 عثر على ${movieElements.length} فيلم`);
        
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
    console.log(`  🎬 ${movie.title.substring(0, 40)}...`);
    
    const html = await fetchWithTimeout(movie.url);
    
    if (!html) {
        console.log(`     ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const movieId = shortLink ? extractMovieId(shortLink) : null;
        
        if (!movieId) {
            console.log(`     ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // البيانات الأساسية
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
        // التفاصيل
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
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ صفحة واحدة مباشرة ====================
async function scrapeAndSavePage(pageNum, index) {
    console.log(`\n========================================`);
    console.log(`🚀 بدء استخراج الصفحة ${pageNum}`);
    console.log(`========================================`);
    
    // جلب قائمة الأفلام من الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`❌ لا توجد أفلام في الصفحة ${pageNum}`);
        return { success: false, newMovies: 0, total: 0 };
    }
    
    const allMovies = [];
    let newMoviesCount = 0;
    
    console.log(`\n🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    // استخراج تفاصيل كل فيلم
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        const details = await fetchMovieDetails(movie);
        
        if (!details || !details.id) {
            continue;
        }
        
        // التحقق من التكرار
        const isNew = !index.isMovieExists(details.id);
        
        if (isNew) {
            index.addMovie(details.id, details);
            newMoviesCount++;
            console.log(`  ✅ جديد! (${newMoviesCount})`);
        } else {
            console.log(`  🔄 مكرر`);
        }
        
        allMovies.push(details);
        
        // انتظار قصير بين الأفلام
        if (i < pageData.movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    // ⭐⭐⭐ **حفظ الصفحة مباشرة** ⭐⭐⭐
    console.log(`\n💾 جاري حفظ الصفحة ${pageNum}...`);
    
    const fileName = pageNum === 1 ? "Home.json" : `${pageNum}.json`;
    const filePath = path.join(MOVIES_DIR, fileName);
    
    const pageContent = {
        page: pageNum,
        url: pageData.url,
        totalMovies: allMovies.length,
        newMovies: newMoviesCount,
        scrapedAt: new Date().toISOString(),
        movies: allMovies
    };
    
    try {
        fs.writeFileSync(filePath, JSON.stringify(pageContent, null, 2));
        console.log(`✅ تم حفظ ${fileName} بـ ${allMovies.length} فيلم (${newMoviesCount} جديد)`);
        
        // حفظ الفهرس أيضاً
        index.saveIndex();
        
        // حفظ تقرير مصغر للصفحة
        const reportFile = path.join(MOVIES_DIR, `page${pageNum}_report.json`);
        const miniReport = {
            page: pageNum,
            savedAt: new Date().toISOString(),
            totalMovies: allMovies.length,
            newMovies: newMoviesCount
        };
        fs.writeFileSync(reportFile, JSON.stringify(miniReport, null, 2));
        
        return { 
            success: true, 
            newMovies: newMoviesCount, 
            total: allMovies.length,
            fileName: fileName
        };
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الصفحة ${pageNum}: ${error.message}`);
        return { success: false, newMovies: 0, total: 0 };
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج الأفلام (حفظ مباشر لكل صفحة)");
    console.log("=".repeat(50));
    
    const index = new MovieIndex();
    let totalNew = 0;
    let currentPage = 1;
    
    // ⭐⭐⭐ **استمرار الاستخراج بدون توقف للتكرارات** ⭐⭐⭐
    while (true) {
        console.log(`\n📊 الصفحة السابقة: ${totalNew} جديد - الفهرس: ${Object.keys(index.movies).length}`);
        
        // استخراج وحفظ الصفحة الحالية
        const result = await scrapeAndSavePage(currentPage, index);
        
        if (!result.success) {
            console.log(`\n⏹️ توقف: فشل في الصفحة ${currentPage}`);
            break;
        }
        
        totalNew += result.newMovies;
        
        console.log(`\n📈 الإحصاءات حتى الآن:`);
        console.log(`   - الصفحات المكتملة: ${currentPage}`);
        console.log(`   - الأفلام الجديدة الإجمالية: ${totalNew}`);
        console.log(`   - الفهرس الكلي: ${Object.keys(index.movies).length}`);
        
        // الانتقال للصفحة التالية
        currentPage++;
        
        // انتظار قصير بين الصفحات
        console.log(`\n⏳ انتظار 2 ثواني للصفحة التالية...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // يمكنك إضافة شرط للتوقف هنا إذا أردت
        // مثال: التوقف بعد 10 صفحات
        if (currentPage > 10) { // غير الرقم حسب ما تريد
            console.log(`\n🛑 توقف بعد ${currentPage - 1} صفحة حسب الإعدادات`);
            break;
        }
    }
    
    // ==================== التقرير النهائي ====================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 انتهى الاستخراج الكامل");
    console.log("=".repeat(50));
    console.log(`📊 النتائج النهائية:`);
    console.log(`   - الصفحات المكتملة: ${currentPage - 1}`);
    console.log(`   - الأفلام الجديدة: ${totalNew}`);
    console.log(`   - الفهرس الكلي: ${Object.keys(index.movies).length}`);
    console.log(`   - الملفات المحفوظة:`);
    
    // عرض الملفات المحفوظة
    try {
        const files = fs.readdirSync(MOVIES_DIR)
            .filter(file => file.endsWith('.json') && !file.includes('index'))
            .sort((a, b) => {
                if (a === 'Home.json') return -1;
                if (b === 'Home.json') return 1;
                return parseInt(a) - parseInt(b);
            });
        
        files.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`     📄 ${file}: ${content.totalMovies} فيلم`);
        });
    } catch (error) {
        console.log(`     ❌ خطأ في قراءة الملفات: ${error.message}`);
    }
    
    console.log("=".repeat(50));
    
    // حفظ التقرير النهائي
    const finalReport = {
        status: "completed",
        totalPages: currentPage - 1,
        totalNewMovies: totalNew,
        totalMovies: Object.keys(index.movies).length,
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
