import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// الإعدادات الأساسية
const CONFIG = {
    baseUrl: "https://topcinema.rip/movies",
    outputDir: path.join(__dirname, "movies-data"),
    timeout: 30000,
    
    folders: {
        movies: "movies",
        pages: "pages",
        index: "index",
        logs: "logs",
        config: "config"
    }
};

// إنشاء الهيكل المجلدات
function createFolderStructure() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد الرئيسي: ${CONFIG.outputDir}`);
    }
    
    // إنشاء المجلدات الفرعية
    Object.values(CONFIG.folders).forEach(folder => {
        const folderPath = path.join(CONFIG.outputDir, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`   📁 تم إنشاء: ${folder}`);
        }
    });
}

// دالة fetch محسنة
async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`❌ خطأ في الاستجابة: ${response.status}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log('⏱️ انتهى وقت الانتظار');
        } else {
            console.log(`❌ خطأ في الجلب: ${error.message}`);
        }
        return null;
    }
}

// استخراج الأفلام من الصفحة الأولى
async function extractFirstPage() {
    console.log("🎬 بدء استخراج الصفحة الأولى فقط");
    console.log("=".repeat(50));
    
    const url = "https://topcinema.rip/movies/";
    console.log(`📡 جلب الصفحة: ${url}`);
    
    const html = await fetchWithTimeout(url);
    if (!html) {
        console.log("❌ فشل جلب الصفحة الأولى");
        return;
    }
    
    try {
        // استخدام JSDOM لتحليل HTML
        const { JSDOM } = await import('jsdom');
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن الأفلام
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ عثر على ${movieElements.length} فيلم في الصفحة الأولى`);
        
        const movies = [];
        
        movieElements.forEach((element, index) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                // استخراج العنوان
                const titleElement = element.querySelector('.title');
                const title = titleElement ? titleElement.textContent.trim() : 
                              element.textContent.trim() || `فيلم ${index + 1}`;
                
                // استخراج الصورة المصغرة
                const imageElement = element.querySelector('img');
                const thumbnail = imageElement ? imageElement.src : null;
                
                movies.push({
                    id: index + 1,
                    title: title,
                    url: movieUrl,
                    thumbnail: thumbnail,
                    position: index + 1,
                    scrapedAt: new Date().toISOString()
                });
                
                console.log(`   ${index + 1}. ${title.substring(0, 40)}...`);
            }
        });
        
        // حفظ النتائج
        saveResults(movies);
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
    }
}

// حفظ النتائج في مجلدات منظمة
function saveResults(movies) {
    const pagesDir = path.join(CONFIG.outputDir, CONFIG.folders.pages);
    const moviesDir = path.join(CONFIG.outputDir, CONFIG.folders.movies);
    
    // 1. حفظ الصفحة كاملة
    const pageData = {
        pageNumber: 1,
        url: "https://topcinema.rip/movies/",
        scrapedAt: new Date().toISOString(),
        totalMovies: movies.length,
        movies: movies.map(m => ({
            id: m.id,
            title: m.title,
            url: m.url,
            thumbnail: m.thumbnail
        }))
    };
    
    const pageFile = path.join(pagesDir, "Home.json");
    fs.writeFileSync(pageFile, JSON.stringify(pageData, null, 2));
    console.log(`\n📄 تم حفظ الصفحة في: pages/Home.json`);
    
    // 2. حفظ كل فيلم كملف منفصل (اختياري)
    console.log(`\n💾 حفظ الأفلام المنفردة:`);
    
    movies.forEach(movie => {
        const movieFile = path.join(moviesDir, `movie-${movie.id}.json`);
        
        const movieData = {
            ...movie,
            details: "سيتم استخراج التفاصيل لاحقاً",
            watchServers: [],
            downloadServers: []
        };
        
        fs.writeFileSync(movieFile, JSON.stringify(movieData, null, 2));
        console.log(`   ✅ ${movie.id}. ${movie.title.substring(0, 30)}...`);
    });
    
    // 3. حفظ الفهرس البسيط
    const indexDir = path.join(CONFIG.outputDir, CONFIG.folders.index);
    const indexData = {
        version: "1.0",
        created: new Date().toISOString(),
        totalMovies: movies.length,
        movies: movies.map(m => ({
            id: m.id,
            title: m.title,
            url: m.url,
            page: 1,
            position: m.position
        }))
    };
    
    const indexFile = path.join(indexDir, "index.json");
    fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
    console.log(`\n📋 تم حفظ الفهرس في: index/index.json`);
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء الاستخراج - الصفحة الأولى فقط");
    console.log("=".repeat(50));
    
    // 1. إنشاء المجلدات
    createFolderStructure();
    
    // 2. استخراج الصفحة الأولى
    await extractFirstPage();
    
    console.log("\n" + "=".repeat(50));
    console.log("🎉 اكتمل الاستخراج بنجاح!");
    console.log(`📁 البيانات محفوظة في: ${CONFIG.outputDir}/`);
    
    // عرض إحصائيات بسيطة
    const pagesDir = path.join(CONFIG.outputDir, CONFIG.folders.pages);
    const homeFile = path.join(pagesDir, "Home.json");
    
    if (fs.existsSync(homeFile)) {
        const data = JSON.parse(fs.readFileSync(homeFile, 'utf8'));
        console.log(`📊 الإحصائيات:`);
        console.log(`   • عدد الأفلام: ${data.totalMovies}`);
        console.log(`   • وقت الاستخراج: ${new Date(data.scrapedAt).toLocaleTimeString('ar-EG')}`);
    }
}

// التشغيل
main().catch(error => {
    console.error('💥 خطأ غير متوقع:', error.message);
});
