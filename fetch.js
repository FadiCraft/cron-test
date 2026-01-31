import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== الإعدادات ====================
const CONFIG = {
    baseUrl: "https://topcinema.rip/movies",
    outputDir: path.join(__dirname, "movies"),
    
    // ملفات النظام
    files: {
        home: "Home.json",           // الصفحة الأولى
        index: "index.json",         // الفهرس الرئيسي
        stats: "stats.json"          // إحصائيات النظام
    },
    
    // إعدادات الأداء
    batchSize: 250,                  // عدد الأفلام في كل ملف TopCinema
    requestDelay: 1000,              // تأخير بين الطلبات (ملي ثانية)
    timeout: 30000,                  // وقت الانتظار للطلب
    
    // وضع التشغيل
    isFirstRun: false,               // سيتم اكتشافه تلقائياً
    scanOnlyPage2: true,             // فحص الصفحة الثانية فقط للتحديث
    maxPagesFirstRun: 100            // الحد الأقصى للصفحات في التشغيل الأول
};

// ==================== تهيئة النظام ====================
function initSystem() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${CONFIG.outputDir}`);
    }
    
    // التحقق من الملفات الأساسية
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    if (!fs.existsSync(indexFile)) {
        CONFIG.isFirstRun = true;
        console.log("🆕 هذا هو التشغيل الأول للنظام");
    } else {
        CONFIG.isFirstRun = false;
        console.log("🔄 وضع التحديث اليومي");
    }
    
    return {
        index: loadIndex(),
        stats: loadStats(),
        lastTopCinemaFile: getLastTopCinemaFile()
    };
}

// ==================== تحميل الفهرس ====================
function loadIndex() {
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    
    if (fs.existsSync(indexFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            console.log(`📊 الفهرس المحمول: ${Object.keys(data.movies || {}).length} فيلم`);
            return data;
        } catch (error) {
            console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
        }
    }
    
    // الفهرس الجديد
    return {
        movies: {},
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    };
}

// ==================== تحميل الإحصائيات ====================
function loadStats() {
    const statsFile = path.join(CONFIG.outputDir, CONFIG.files.stats);
    
    if (fs.existsSync(statsFile)) {
        try {
            return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
        } catch (error) {
            console.log(`⚠️ خطأ في تحميل الإحصائيات: ${error.message}`);
        }
    }
    
    // إحصائيات جديدة
    return {
        totalMovies: 0,
        totalFiles: 0,
        firstRunDate: new Date().toISOString(),
        lastRunDate: null,
        runs: []
    };
}

// ==================== الحصول على آخر ملف TopCinema ====================
function getLastTopCinemaFile() {
    const files = fs.readdirSync(CONFIG.outputDir);
    const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
    
    if (topCinemaFiles.length === 0) {
        return {
            filename: "TopCinema1.json",
            number: 1,
            movieCount: 0
        };
    }
    
    // ترتيب الملفات رقمياً
    topCinemaFiles.sort((a, b) => {
        const numA = parseInt(a.match(/TopCinema(\d+)\.json/)[1]);
        const numB = parseInt(b.match(/TopCinema(\d+)\.json/)[1]);
        return numA - numB;
    });
    
    const lastFile = topCinemaFiles[topCinemaFiles.length - 1];
    const filePath = path.join(CONFIG.outputDir, lastFile);
    
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            filename: lastFile,
            number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)[1]),
            movieCount: content.movies?.length || 0,
            isFull: (content.movies?.length || 0) >= CONFIG.batchSize
        };
    } catch (error) {
        console.log(`⚠️ خطأ في قراءة ملف ${lastFile}: ${error.message}`);
        return {
            filename: lastFile,
            number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)[1]),
            movieCount: 0,
            isFull: false
        };
    }
}

// ==================== إنشاء ملف TopCinema جديد ====================
function createNewTopCinemaFile(lastNumber) {
    const newNumber = lastNumber + 1;
    const newFilename = `TopCinema${newNumber}.json`;
    const newFilePath = path.join(CONFIG.outputDir, newFilename);
    
    const structure = {
        fileNumber: newNumber,
        createdAt: new Date().toISOString(),
        movies: [],
        metadata: {
            batchSize: CONFIG.batchSize,
            source: "topcinema.rip"
        }
    };
    
    fs.writeFileSync(newFilePath, JSON.stringify(structure, null, 2));
    console.log(`📄 تم إنشاء ملف جديد: ${newFilename}`);
    
    return {
        filename: newFilename,
        number: newNumber,
        movieCount: 0,
        isFull: false
    };
}

// ==================== إضافة فيلم لملف TopCinema ====================
function addMovieToTopCinemaFile(movieData, topCinemaInfo) {
    const filePath = path.join(CONFIG.outputDir, topCinemaInfo.filename);
    
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // التحقق من عدم التكرار في الملف نفسه
        const exists = content.movies.some(m => m.id === movieData.id);
        if (exists) {
            console.log(`   ⚠️ الفيلم ${movieData.id} موجود مسبقاً في الملف`);
            return false;
        }
        
        content.movies.push(movieData);
        content.lastUpdated = new Date().toISOString();
        content.totalMovies = content.movies.length;
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        
        console.log(`   ✅ أضيف للفيلم ${movieData.id} إلى ${topCinemaInfo.filename}`);
        return true;
        
    } catch (error) {
        console.log(`❌ خطأ في إضافة الفيلم للملف: ${error.message}`);
        return false;
    }
}

// ==================== حفظ البيانات في ملف ====================
function saveToFile(filename, data, subDir = null) {
    const dir = subDir ? path.join(CONFIG.outputDir, subDir) : CONFIG.outputDir;
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = CONFIG.timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en;q=0.9',
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`⚠️ استجابة غير ناجحة: ${response.status} ${response.statusText}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت للرابط: ${url}`);
        } else {
            console.log(`❌ خطأ في جلب ${url}: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط ====================
function extractMovieId(url) {
    try {
        if (!url) return null;
        // نمط لـ topcinema.rip
        const pattern1 = /topcinema\.rip\/(?:movie|series)\/([^\/]+)/;
        const pattern2 = /p=(\d+)/;
        
        const match1 = url.match(pattern1);
        const match2 = url.match(pattern2);
        
        if (match1) return match1[1];
        if (match2) return match2[1];
        
        // إذا لم يعثر على نمط، إنشاء hash من الرابط
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            hash = ((hash << 5) - hash) + url.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString();
        
    } catch (error) {
        console.log(`⚠️ خطأ في استخراج ID: ${error.message}`);
        return `unknown_${Date.now()}`;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum}: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // البحث عن عناصر الأفلام
        const movieElements = doc.querySelectorAll('.Small--Box a, .movie-item a, a[href*="/movie/"]');
        console.log(`   📊 عثر على ${movieElements.length} فيلم في الصفحة ${pageNum}`);
        
        movieElements.forEach((element, index) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title')?.textContent?.trim() || 
                             element.querySelector('.name')?.textContent?.trim() ||
                             element.textContent?.trim() || 
                             `فيلم ${index + 1}`;
                
                const image = element.querySelector('img')?.src || 
                             element.querySelector('.poster')?.src ||
                             null;
                
                const movieId = extractMovieId(movieUrl);
                
                movies.push({
                    id: movieId,
                    title: title.substring(0, 200),
                    url: movieUrl,
                    image: image,
                    page: pageNum,
                    position: index + 1,
                    discoveredAt: new Date().toISOString()
                });
            }
        });
        
        return movies;
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة ${pageNum}: ${error.message}`);
        return [];
    }
}

// ==================== تحديث الفهرس ====================
function updateIndex(movie, topCinemaFile, system) {
    const now = new Date().toISOString();
    
    if (!system.index.movies[movie.id]) {
        // فيلم جديد
        system.index.movies[movie.id] = {
            title: movie.title,
            image: movie.image,
            url: movie.url,
            firstSeen: now,
            lastSeen: now,
            storedIn: topCinemaFile.filename,
            lastPageSeen: movie.page,
            discoveryPage: movie.page
        };
        
        system.stats.totalMovies++;
        return 'new';
        
    } else {
        // فيلم موجود - تحديث فقط
        system.index.movies[movie.id].lastSeen = now;
        system.index.movies[movie.id].lastPageSeen = movie.page;
        
        // إذا تغير الموقع، تحديث storedIn
        if (system.index.movies[movie.id].storedIn !== topCinemaFile.filename) {
            system.index.movies[movie.id].storedIn = topCinemaFile.filename;
        }
        
        return 'updated';
    }
}

// ==================== حفظ الفهرس والإحصائيات ====================
function saveSystemData(system) {
    // حفظ الفهرس
    system.index.lastUpdated = new Date().toISOString();
    const indexPath = path.join(CONFIG.outputDir, CONFIG.files.index);
    fs.writeFileSync(indexPath, JSON.stringify(system.index, null, 2));
    
    // حفظ الإحصائيات
    system.stats.lastRunDate = new Date().toISOString();
    system.stats.runs.push({
        date: new Date().toISOString(),
        newMovies: system.newMoviesCount || 0,
        updatedMovies: system.updatedMoviesCount || 0,
        totalMovies: system.stats.totalMovies
    });
    
    // حفظ فقط آخر 30 تشغيل
    if (system.stats.runs.length > 30) {
        system.stats.runs = system.stats.runs.slice(-30);
    }
    
    const statsPath = path.join(CONFIG.outputDir, CONFIG.files.stats);
    fs.writeFileSync(statsPath, JSON.stringify(system.stats, null, 2));
    
    console.log(`💾 تم حفظ البيانات: ${system.stats.totalMovies} فيلم`);
}

// ==================== التشغيل الأول (جمع كل الأفلام) ====================
async function firstRun(system) {
    console.log("🚀 بدء التشغيل الأول - جمع كل الأفلام");
    console.log("=".repeat(50));
    
    let currentPage = 1;
    let totalMoviesCollected = 0;
    let topCinemaFile = system.lastTopCinemaFile;
    
    while (currentPage <= CONFIG.maxPagesFirstRun) {
        console.log(`\n📄 الصفحة ${currentPage}/${CONFIG.maxPagesFirstRun}`);
        
        const movies = await fetchMoviesFromPage(currentPage);
        
        if (movies.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${currentPage} - التوقف`);
            break;
        }
        
        // الصفحة الأولى -> Home.json
        if (currentPage === 1) {
            const homeData = {
                page: 1,
                url: "https://topcinema.rip/movies/",
                scrapedAt: new Date().toISOString(),
                movies: movies
            };
            
            saveToFile(CONFIG.files.home, homeData);
            console.log(`🏠 حفظ الصفحة الأولى في Home.json (${movies.length} فيلم)`);
        }
        
        // معالجة كل أفلام الصفحة
        for (const movie of movies) {
            // التحقق إذا كان الفيلم موجوداً بالفعل (لتجنب التكرار)
            if (system.index.movies[movie.id]) {
                console.log(`   ⏭️ تخطي ${movie.id} - موجود مسبقاً`);
                continue;
            }
            
            // إذا امتلأ الملف الحالي، إنشاء ملف جديد
            if (topCinemaFile.isFull || topCinemaFile.movieCount >= CONFIG.batchSize) {
                topCinemaFile = createNewTopCinemaFile(topCinemaFile.number);
                system.stats.totalFiles++;
            }
            
            // إضافة الفيلم للملف
            const added = addMovieToTopCinemaFile(movie, topCinemaFile);
            if (added) {
                updateIndex(movie, topCinemaFile, system);
                topCinemaFile.movieCount++;
                totalMoviesCollected++;
                
                if (totalMoviesCollected % 50 === 0) {
                    console.log(`   📦 تم جمع ${totalMoviesCollected} فيلم حتى الآن...`);
                }
            }
            
            // تأخير بسيط بين الأفلام
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // تأخير بين الصفحات
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
        
        currentPage++;
        
        // تحديث النظام كل 5 صفحات
        if (currentPage % 5 === 0) {
            saveSystemData(system);
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log(`✅ التشغيل الأول مكتمل!`);
    console.log(`📊 الإجمالي: ${totalMoviesCollected} فيلم`);
    console.log(`📁 الملفات: ${system.stats.totalFiles} ملف TopCinema`);
    
    saveSystemData(system);
    return totalMoviesCollected;
}

// ==================== التحديث اليومي ====================
async function dailyUpdate(system) {
    console.log("🔄 بدء التحديث اليومي");
    console.log("=".repeat(50));
    
    system.newMoviesCount = 0;
    system.updatedMoviesCount = 0;
    
    let topCinemaFile = system.lastTopCinemaFile;
    
    // الخطوة 1: تحديث الصفحة الأولى (Home.json)
    console.log("\n1️⃣ تحديث الصفحة الأولى...");
    const page1Movies = await fetchMoviesFromPage(1);
    
    if (page1Movies.length > 0) {
        const homeData = {
            page: 1,
            url: "https://topcinema.rip/movies/",
            scrapedAt: new Date().toISOString(),
            movies: page1Movies,
            totalMovies: page1Movies.length
        };
        
        saveToFile(CONFIG.files.home, homeData);
        console.log(`   🏠 تم تحديث Home.json بـ ${page1Movies.length} فيلم`);
        
        // تحديث الفهرس بأفلام الصفحة الأولى
        for (const movie of page1Movies) {
            if (system.index.movies[movie.id]) {
                updateIndex(movie, topCinemaFile, system);
                system.updatedMoviesCount++;
            }
        }
    }
    
    // الخطوة 2: فحص الصفحة الثانية فقط لاكتشاف الجديد
    console.log("\n2️⃣ فحص الصفحة الثانية لاكتشاف الأفلام الجديدة...");
    const page2Movies = await fetchMoviesFromPage(2);
    
    console.log(`   📊 الصفحة الثانية تحتوي على ${page2Movies.length} فيلم`);
    
    // اكتشاف الأفلام الجديدة في الصفحة الثانية
    let newMoviesFound = 0;
    
    for (const movie of page2Movies) {
        // إذا الفيلم غير موجود في الفهرس، فهو جديد
        if (!system.index.movies[movie.id]) {
            console.log(`   🎯 فيلم جديد مكتشف: ${movie.title.substring(0, 40)}...`);
            
            // إذا امتلأ الملف الحالي، إنشاء ملف جديد
            if (topCinemaFile.isFull || topCinemaFile.movieCount >= CONFIG.batchSize) {
                topCinemaFile = createNewTopCinemaFile(topCinemaFile.number);
                system.stats.totalFiles++;
            }
            
            // إضافة الفيلم للملف
            const added = addMovieToTopCinemaFile(movie, topCinemaFile);
            if (added) {
                updateIndex(movie, topCinemaFile, system);
                topCinemaFile.movieCount++;
                newMoviesFound++;
                system.newMoviesCount++;
                
                // تأخير بسيط بين الأفلام الجديدة
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            // الفيلم موجود - تحديث فقط
            updateIndex(movie, topCinemaFile, system);
            system.updatedMoviesCount++;
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 نتائج التحديث اليومي:");
    console.log(`   🆕 أفلام جديدة: ${newMoviesFound}`);
    console.log(`   🔄 أفلام محدثة: ${system.updatedMoviesCount}`);
    console.log(`   📁 الملف النشط: ${topCinemaFile.filename} (${topCinemaFile.movieCount}/${CONFIG.batchSize})`);
    
    saveSystemData(system);
    
    return {
        newMovies: newMoviesFound,
        updatedMovies: system.updatedMoviesCount,
        activeFile: topCinemaFile.filename
    };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء نظام جمع الأفلام المحسن");
    console.log("=".repeat(50));
    
    // تهيئة النظام
    const system = initSystem();
    
    // التحقق من اتصال الإنترنت
    try {
        const testResponse = await fetchWithTimeout("https://topcinema.rip/", 10000);
        if (!testResponse) {
            console.log("❌ لا يمكن الوصول إلى الموقع. تحقق من اتصال الإنترنت.");
            return;
        }
    } catch (error) {
        console.log("❌ خطأ في الاتصال بالموقع.");
        return;
    }
    
    // تحديد وضع التشغيل
    if (CONFIG.isFirstRun) {
        console.log("⚙️ وضع التشغيل: التشغيل الأول الكامل");
        const result = await firstRun(system);
        console.log(`\n🎉 اكتمل التشغيل الأول بنجاح!`);
        console.log(`📈 تم جمع ${result} فيلم`);
        
    } else {
        console.log("⚙️ وضع التشغيل: التحديث اليومي");
        console.log(`📊 الفهرس الحالي: ${Object.keys(system.index.movies).length} فيلم`);
        console.log(`📁 الملف النشط: ${system.lastTopCinemaFile.filename}`);
        
        const result = await dailyUpdate(system);
        
        console.log(`\n✅ اكتمل التحديث اليومي!`);
        
        // عرض ملخص
        const statsFile = path.join(CONFIG.outputDir, CONFIG.files.stats);
        if (fs.existsSync(statsFile)) {
            const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
            console.log(`\n📈 الإحصائيات الكلية:`);
            console.log(`   - إجمالي الأفلام: ${stats.totalMovies}`);
            console.log(`   - عدد الملفات: ${stats.totalFiles}`);
            console.log(`   - أول تشغيل: ${stats.firstRunDate ? new Date(stats.firstRunDate).toLocaleDateString('ar-EG') : 'غير معروف'}`);
            console.log(`   - آخر تشغيل: ${new Date().toLocaleDateString('ar-EG')}`);
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("🎬 النظام جاهز للتشغيل التلقائي!");
    console.log("💡 نصيحة: اضبط هذا الكود ليعمل تلقائياً مرة يومياً");
}

// ==================== معالجة الأخطاء ====================
process.on('unhandledRejection', (error) => {
    console.error('💥 خطأ غير متوقع:', error.message);
    
    const errorLog = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };
    
    const errorFile = path.join(CONFIG.outputDir, 'error_log.json');
    fs.writeFileSync(errorFile, JSON.stringify(errorLog, null, 2));
    
    process.exit(1);
});

// ==================== التشغيل ====================
main().catch(error => {
    console.error('💥 خطأ في الدالة الرئيسية:', error.message);
    process.exit(1);
});
