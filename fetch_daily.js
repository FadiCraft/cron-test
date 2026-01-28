import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const OUTPUT_FILE = path.join(MOVIES_DIR, "Hg.json"); // ⭐ تغيير اسم الملف إلى Hg.json

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
async function fetchMoviesFromPage(pageNum = 1) {
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

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(pageData, moviesData) {
    const pageContent = {
        page: 1,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(), // ⭐ إضافة وقت التحديث
        movies: moviesData
    };
    
    // ⭐⭐⭐ كتابة فوق الملف دائماً ⭐⭐⭐
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ البيانات في Hg.json بـ ${moviesData.length} فيلم`);
    
    return OUTPUT_FILE;
}

// ==================== الدالة الرئيسية (الصفحة الأولى فقط) ====================
async function main() {
    console.log("🎬 بدء استخراج الصفحة الأولى فقط");
    console.log("=".repeat(50));
    
    const pageNum = 1; // ⭐ نستخرج الصفحة الأولى فقط
    
    // جلب الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`⏹️ لا توجد أفلام في الصفحة`);
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
    
    // ⭐⭐⭐ حفظ البيانات في Hg.json ⭐⭐⭐
    if (moviesData.length > 0) {
        const savedFile = saveToHgFile(pageData, moviesData);
        
        console.log(`\n✅ تم حفظ الصفحة الأولى بنجاح في ${savedFile}`);
        console.log(`📊 الأفلام المحفوظة: ${moviesData.length}`);
        
        // عرض عينة من البيانات
        console.log(`📋 عينة من البيانات المحفوظة:`);
        moviesData.slice(0, 3).forEach((movie, idx) => {
            console.log(`   ${idx + 1}. ID: ${movie.id}, العنوان: ${movie.title.substring(0, 30)}`);
        });
        
        // ⭐ عرض معلومات الملف ⭐
        try {
            const stats = fs.statSync(OUTPUT_FILE);
            console.log(`\n📁 معلومات الملف:`);
            console.log(`   - المسار: ${OUTPUT_FILE}`);
            console.log(`   - الحجم: ${(stats.size / 1024).toFixed(2)} كيلوبايت`);
            console.log(`   - وقت التحديث: ${new Date().toISOString()}`);
        } catch (error) {
            console.log(`   ❌ خطأ في قراءة معلومات الملف: ${error.message}`);
        }
        
        return { success: true, total: moviesData.length };
    }
    
    return { success: false, total: 0 };
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
