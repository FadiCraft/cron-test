import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const OUTPUT_FILE = path.join(MOVIES_DIR, "Hg.json");

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
        console.log(`❌ خطأ في جلب ${url}: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الأفلام من الصفحة الأولى ====================
async function fetchMoviesFromHomePage() {
    const url = "https://topcinema.rip/movies/";
    
    console.log(`📖 جلب الصفحة الرئيسية: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة الرئيسية`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ عثر على ${movieElements.length} فيلم في الصفحة الرئيسية`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title')?.textContent || 
                              element.textContent || 
                              `فيلم ${i + 1}`;
                
                movies.push({
                    title: title.trim(),
                    url: movieUrl,
                    position: i + 1
                });
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم الأساسية ====================
async function fetchBasicMovieDetails(movie) {
    console.log(`  🎬 ${movie.title.substring(0, 40)}...`);
    
    const html = await fetchWithTimeout(movie.url);
    
    if (!html) {
        console.log(`     ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        
        // استخراج p=xxxx من الرابط المختصر
        let movieId = null;
        if (shortLink) {
            const match = shortLink.match(/p=(\d+)/);
            movieId = match ? match[1] : null;
        }
        
        if (!movieId) {
            console.log(`     ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // البيانات الأساسية فقط
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        return {
            id: movieId,
            title: title,
            image: image,
            imdbRating: imdbRating,
            url: movie.url,
            shortLink: shortLink,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ في ملف Hg.json ====================
function saveToHgFile(pageData, moviesData) {
    try {
        const pageContent = {
            page: "Home",
            url: pageData.url,
            totalMovies: moviesData.length,
            scrapedAt: new Date().toISOString(),
            movies: moviesData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pageContent, null, 2));
        console.log(`💾 تم حفظ ${moviesData.length} فيلم في Hg.json`);
        
        return true;
    } catch (error) {
        console.log(`❌ خطأ في حفظ Hg.json: ${error.message}`);
        return false;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الصفحة الرئيسية فقط");
    console.log("=".repeat(50));
    
    // 1. جلب الصفحة الرئيسية
    const pageData = await fetchMoviesFromHomePage();
    
    if (!pageData || pageData.movies.length === 0) {
        console.log("⏹️ لا توجد أفلام في الصفحة الرئيسية");
        return;
    }
    
    // 2. استخراج تفاصيل كل فيلم
    console.log(`\n🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    const moviesData = [];
    
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        const details = await fetchBasicMovieDetails(movie);
        
        if (details) {
            moviesData.push(details);
            console.log(`   ✅ ${i + 1}/${pageData.movies.length}: ${details.title.substring(0, 30)}...`);
        }
        
        // انتظار قصير بين الأفلام
        if (i < pageData.movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // 3. حفظ النتائج في Hg.json
    console.log(`\n💾 جاري حفظ النتائج...`);
    
    const saved = saveToHgFile(pageData, moviesData);
    
    if (saved) {
        console.log("\n" + "=".repeat(50));
        console.log("🎉 تم استخراج الصفحة الرئيسية بنجاح!");
        console.log(`📊 إجمالي الأفلام: ${moviesData.length}`);
        console.log(`📁 الملف المحفوظ: ${OUTPUT_FILE}`);
        console.log("=".repeat(50));
        
        // عرض عينة من النتائج
        console.log("\n📋 عينة من النتائج:");
        moviesData.slice(0, 3).forEach((movie, idx) => {
            console.log(`   ${idx + 1}. ID: ${movie.id}, العنوان: ${movie.title.substring(0, 30)}`);
        });
    } else {
        console.log("\n❌ فشل في حفظ النتائج");
    }
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
