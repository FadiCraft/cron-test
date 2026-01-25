import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات
const PAGES_DIR = path.join(__dirname, "pages");
const MOVIES_DIR = path.join(__dirname, "movies");

// إنشاء المجلدات
[PAGES_DIR, MOVIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// دالة fetch بسيطة
async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        };
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status} ${response.statusText}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

// دالة لتنظيف النص
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
}

// دالة لاستخراج ID
function extractMovieId(url) {
    try {
        const match = url.match(/p=(\d+)/);
        return match ? match[1] : `temp_${Date.now()}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// دالة لجلب الأفلام من الصفحة الأولى
async function fetchFirstPage() {
    const url = "https://topcinema.rip/movies/";
    
    console.log(`\n📖 ===== جلب الصفحة الأولى =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    
    if (!html) {
        console.log("❌ فشل جلب الصفحة");
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 البحث عن الأفلام...");
        
        // البحث بطريقتين
        let movieElements = doc.querySelectorAll('.Small--Box a');
        
        if (movieElements.length === 0) {
            movieElements = doc.querySelectorAll('a[href*="/movie"], a[href*="/film"]');
            console.log("⚠️ استخدام طريقة بديلة للبحث");
        }
        
        console.log(`✅ وجدت ${movieElements.length} رابط أفلام`);
        
        // استخراج أول 10 أفلام فقط للاختبار
        const maxMovies = Math.min(10, movieElements.length);
        
        for (let i = 0; i < maxMovies; i++) {
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
                    page: 1,
                    index: i + 1
                });
                
                console.log(`  ${i + 1}. ${title.substring(0, 40)}...`);
            }
        }
        
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في تحليل الصفحة:`, error.message);
        return [];
    }
}

// دالة لاستخراج فيلم واحد
async function fetchSingleMovie(movie) {
    console.log(`\n🎬 جاري استخراج الفيلم ${movie.index}:`);
    console.log(`   العنوان: ${movie.title}`);
    console.log(`   الرابط: ${movie.url}`);
    console.log(`   ID: ${movie.id}`);
    
    try {
        const html = await fetchPage(movie.url);
        
        if (!html) {
            console.log("   ⚠️ فشل جلب صفحة الفيلم");
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || movie.title);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // استخراج التفاصيل
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
            story: story || "غير متوفر",
            details: details,
            page: 1,
            scrapedAt: new Date().toISOString()
        };
        
        // حفظ الفيلم
        const movieFile = path.join(MOVIES_DIR, `movie_${movieId}.json`);
        fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2));
        
        console.log(`   ✅ تم حفظ: ${movieId}.json`);
        console.log(`   🏆 IMDB: ${imdbRating || "غير متوفر"}`);
        
        return movieData;
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// دالة لحفظ الصفحة
function savePageData(movies) {
    const pageData = {
        page: 1,
        url: "https://topcinema.rip/movies/",
        moviesCount: movies.length,
        movies: movies.map(m => ({
            id: m.id,
            title: m.title,
            url: m.url,
            index: m.index
        })),
        savedAt: new Date().toISOString()
    };
    
    const pageFile = path.join(PAGES_DIR, "page_1.json");
    fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));
    
    console.log(`\n📄 تم حفظ بيانات الصفحة في: pages/page_1.json`);
    return pageData;
}

// دالة لعرض النتائج
function displayResults(movies, moviesData) {
    console.log("\n" + "=".repeat(60));
    console.log("📊 نتائج الاستخراج:");
    console.log("=".repeat(60));
    
    console.log(`🔗 الصفحة: https://topcinema.rip/movies/`);
    console.log(`🎬 عدد الأفلام المستخرجة: ${movies.length}`);
    console.log(`✅ عدد الأفلام المحفوظة: ${moviesData.length}`);
    
    if (moviesData.length > 0) {
        console.log("\n📋 قائمة الأفلام المحفوظة:");
        moviesData.forEach((data, index) => {
            console.log(`${index + 1}. ${data.title}`);
            console.log(`   📁 ملف: movie_${data.id}.json`);
            console.log(`   ⭐ IMDB: ${data.imdbRating || "غير متوفر"}`);
            console.log(`   📖 القصة: ${data.story ? data.story.substring(0, 50) + "..." : "غير متوفر"}`);
            console.log(`   🏷️ التفاصيل: ${Object.keys(data.details).length} حقل`);
            console.log();
        });
    }
    
    // حفظ ملف النتيجة
    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        page: 1,
        totalMoviesFound: movies.length,
        totalMoviesSaved: moviesData.length,
        movies: moviesData.map(m => ({
            id: m.id,
            title: m.title,
            imdbRating: m.imdbRating,
            hasStory: !!m.story,
            detailsCount: Object.keys(m.details).length
        })),
        files: {
            pages: [`pages/page_1.json`],
            movies: moviesData.map(m => `movies/movie_${m.id}.json`)
        }
    };
    
    fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
    
    console.log(`💾 تم حفظ النتيجة في: result.json`);
    console.log("=".repeat(60));
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج الصفحة الأولى فقط");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    
    // جلب قائمة الأفلام من الصفحة الأولى
    const movies = await fetchFirstPage();
    
    if (movies.length === 0) {
        console.log("\n❌ لم يتم العثور على أفلام");
        return;
    }
    
    console.log(`\n✅ تم العثور على ${movies.length} فيلم`);
    
    // استخراج كل فيلم
    const moviesData = [];
    
    for (const movie of movies) {
        console.log(`\n--- الفيلم ${movie.index}/${movies.length} ---`);
        
        const movieData = await fetchSingleMovie(movie);
        
        if (movieData) {
            moviesData.push(movieData);
        }
        
        // تأخير بسيط بين الأفلام
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // حفظ بيانات الصفحة
    savePageData(movies);
    
    // عرض النتائج
    displayResults(movies, moviesData);
    
    // ملخص نهائي
    console.log("\n🎉 اكتمل الاستخراج بنجاح!");
    console.log(`📁 المجلدات التي تم إنشاؤها:`);
    console.log(`   - pages/ → ${fs.readdirSync(PAGES_DIR).length} ملف`);
    console.log(`   - movies/ → ${fs.readdirSync(MOVIES_DIR).length} ملف`);
    console.log(`\n📝 يمكنك فحص الملفات المحفوظة في مجلدات pages/ و movies/`);
}

// تشغيل البرنامج
main().catch(error => {
    console.error("\n💥 حدث خطأ غير متوقع:", error);
    
    // حفظ الخطأ
    const errorResult = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("result.json", JSON.stringify(errorResult, null, 2));
    
    console.log("❌ تم حفظ الخطأ في result.json");
    process.exit(1);
});
