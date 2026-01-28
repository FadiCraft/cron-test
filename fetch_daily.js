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
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`⚠️ حالة غير ناجحة: ${response.status} لـ ${url}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت لـ ${url}`);
        } else {
            console.log(`❌ خطأ في جلب ${url}: ${error.message}`);
        }
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
        
        // محاولة انتقاءات مختلفة لعناصر الأفلام
        let movieElements = doc.querySelectorAll('.Small--Box a');
        
        if (movieElements.length === 0) {
            movieElements = doc.querySelectorAll('article a, .post-item a');
        }
        
        console.log(`✅ عثر على ${movieElements.length} فيلم في الصفحة الرئيسية`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title, h2, h3')?.textContent || 
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
    
    const html = await fetchWithTimeout(movie.url, 15000);
    
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
        
        // استخراج ID
        let movieId = null;
        if (shortLink) {
            const match = shortLink.match(/p=(\d+)/);
            movieId = match ? match[1] : null;
        }
        
        // إذا لم نجد ID من shortlink، نجرب من URL
        if (!movieId) {
            const urlMatch = movie.url.match(/\/(\d+)\/$/);
            movieId = urlMatch ? urlMatch[1] : `temp_${Date.now()}_${movie.position}`;
        }
        
        // البيانات الأساسية
        const title = doc.querySelector(".post-title a, h1.entry-title, h1")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img, .post-thumbnail img, img.wp-post-image")?.src;
        const imdbRating = doc.querySelector(".imdbR span, .rating, .imdb")?.textContent?.trim();
        
        // استخراج القصة
        let story = "غير متوفر";
        const storyElement = doc.querySelector(".story p, .entry-content p, .content p");
        if (storyElement) {
            story = storyElement.textContent.trim();
        }
        
        return {
            id: movieId,
            title: title,
            image: image,
            imdbRating: imdbRating,
            story: story,
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
            timestamp: new Date().toLocaleString('ar-SA'),
            movies: moviesData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pageContent, null, 2));
        console.log(`💾 تم حفظ ${moviesData.length} فيلم في ${OUTPUT_FILE}`);
        
        // حفظ نسخة احتياطية مع التاريخ
        const backupFile = path.join(MOVIES_DIR, `Hg_${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(pageContent, null, 2));
        console.log(`📦 نسخة احتياطية: ${backupFile}`);
        
        return true;
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return false;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الصفحة الرئيسية - fetch_daily.js");
    console.log("=".repeat(60));
    console.log(`📅 التاريخ: ${new Date().toLocaleString('ar-SA')}`);
    console.log("=".repeat(60));
    
    try {
        // 1. جلب الصفحة الرئيسية
        const pageData = await fetchMoviesFromHomePage();
        
        if (!pageData || pageData.movies.length === 0) {
            console.log("⏹️ لا توجد أفلام في الصفحة الرئيسية");
            
            // حفظ تقرير فارغ
            const emptyReport = {
                status: "no_movies_found",
                message: "لا توجد أفلام في الصفحة الرئيسية",
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync("empty_report.json", JSON.stringify(emptyReport, null, 2));
            return;
        }
        
        // 2. استخراج تفاصيل كل فيلم
        console.log(`\n🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
        
        const moviesData = [];
        
        for (let i = 0; i < pageData.movies.length; i++) {
            const movie = pageData.movies[i];
            
            try {
                const details = await fetchBasicMovieDetails(movie);
                
                if (details) {
                    moviesData.push(details);
                    console.log(`   ✅ ${i + 1}/${pageData.movies.length}: ${details.title.substring(0, 30)}...`);
                } else {
                    console.log(`   ⏭️ تخطي الفيلم ${i + 1}`);
                }
                
                // انتظار قصير بين الأفلام
                if (i < pageData.movies.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
                
            } catch (movieError) {
                console.log(`   ❌ خطأ في الفيلم ${i + 1}: ${movieError.message}`);
                continue;
            }
        }
        
        // 3. حفظ النتائج
        console.log(`\n💾 جاري حفظ النتائج...`);
        
        if (moviesData.length > 0) {
            const saved = saveToHgFile(pageData, moviesData);
            
            if (saved) {
                console.log("\n" + "=".repeat(60));
                console.log("🎉 تم استخراج الصفحة الرئيسية بنجاح!");
                console.log("=".repeat(60));
                console.log(`📊 إجمالي الأفلام: ${moviesData.length}`);
                console.log(`📁 الملف المحفوظ: Hg.json`);
                console.log(`⏰ وقت التنفيذ: ${new Date().toLocaleString('ar-SA')}`);
                console.log("=".repeat(60));
                
                // حفظ تقرير النجاح
                const successReport = {
                    status: "success",
                    totalMovies: moviesData.length,
                    savedFile: "Hg.json",
                    timestamp: new Date().toISOString(),
                    executionTime: new Date().toLocaleString('ar-SA')
                };
                fs.writeFileSync("success_report.json", JSON.stringify(successReport, null, 2));
                
            } else {
                console.log("\n❌ فشل في حفظ النتائج");
                fs.writeFileSync("save_error.json", JSON.stringify({
                    error: "فشل في حفظ الملف",
                    timestamp: new Date().toISOString()
                }, null, 2));
            }
        } else {
            console.log("\n⚠️ لم يتم استخراج أي فيلم بنجاح");
            fs.writeFileSync("no_data.json", JSON.stringify({
                status: "no_data_extracted",
                timestamp: new Date().toISOString()
            }, null, 2));
        }
        
    } catch (error) {
        console.error("\n💥 خطأ في الدالة الرئيسية:", error.message);
        
        const errorReport = {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync("main_error.json", JSON.stringify(errorReport, null, 2));
        console.log("📝 تم حفظ تفاصيل الخطأ في main_error.json");
    }
}

// التشغيل
main().then(() => {
    console.log("\n✨ البرنامج انتهى بنجاح!");
    process.exit(0);
}).catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
