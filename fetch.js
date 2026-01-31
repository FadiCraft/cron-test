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
        home: "Home.json",
        index: "index.json",
        stats: "stats.json"
    },
    
    // إعدادات الأداء
    batchSize: 250,
    requestDelay: 1000,
    timeout: 30000,
    
    // وضع التشغيل
    isFirstRun: false,
    scanOnlyPage2: true,
    maxPagesFirstRun: 100
};

// ==================== تهيئة النظام ====================
function initSystem() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${CONFIG.outputDir}`);
    }
    
    // التحقق من الملفات الأساسية وإنشاؤها إذا لزم
    const requiredFiles = [CONFIG.files.index, CONFIG.files.stats];
    requiredFiles.forEach(file => {
        const filePath = path.join(CONFIG.outputDir, file);
        if (!fs.existsSync(filePath)) {
            if (file === CONFIG.files.index) {
                fs.writeFileSync(filePath, JSON.stringify({
                    movies: {},
                    lastUpdated: new Date().toISOString(),
                    version: "1.0"
                }, null, 2));
            } else if (file === CONFIG.files.stats) {
                fs.writeFileSync(filePath, JSON.stringify({
                    totalMovies: 0,
                    totalFiles: 0,
                    firstRunDate: new Date().toISOString(),
                    lastRunDate: null,
                    runs: []
                }, null, 2));
            }
            console.log(`📄 تم إنشاء: ${file}`);
        }
    });
    
    // التحقق من التشغيل الأول
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    if (fs.existsSync(indexFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            const hasMovies = Object.keys(data.movies || {}).length > 0;
            CONFIG.isFirstRun = !hasMovies;
            console.log(`📊 الفهرس: ${Object.keys(data.movies || {}).length} فيلم`);
        } catch (error) {
            CONFIG.isFirstRun = true;
            console.log(`⚠️ خطأ في الفهرس: ${error.message}`);
        }
    } else {
        CONFIG.isFirstRun = true;
    }
    
    if (CONFIG.isFirstRun) {
        console.log("🆕 هذا هو التشغيل الأول للنظام");
    } else {
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
            return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        } catch (error) {
            console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
            return {
                movies: {},
                lastUpdated: new Date().toISOString(),
                version: "1.0"
            };
        }
    }
    
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
    
    return {
        totalMovies: 0,
        totalFiles: 0,
        firstRunDate: new Date().toISOString(),
        lastRunDate: null,
        runs: []
    };
}

// ==================== الحصول على/إنشاء آخر ملف TopCinema ====================
function getLastTopCinemaFile() {
    const files = fs.readdirSync(CONFIG.outputDir);
    const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
    
    if (topCinemaFiles.length === 0) {
        // لا توجد ملفات، ننشئ الملف الأول
        return createNewTopCinemaFile(1);
    }
    
    // ترتيب الملفات رقمياً
    topCinemaFiles.sort((a, b) => {
        const numA = parseInt(a.match(/TopCinema(\d+)\.json/)?.[1] || 0);
        const numB = parseInt(b.match(/TopCinema(\d+)\.json/)?.[1] || 0);
        return numB - numA; // من الأحدث للأقدم
    });
    
    const lastFile = topCinemaFiles[0]; // أحدث ملف
    const filePath = path.join(CONFIG.outputDir, lastFile);
    
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            filename: lastFile,
            number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
            movieCount: content.movies?.length || 0,
            isFull: (content.movies?.length || 0) >= CONFIG.batchSize,
            path: filePath
        };
    } catch (error) {
        console.log(`⚠️ خطأ في قراءة ملف ${lastFile}: ${error.message}`);
        return createNewTopCinemaFile(parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1) + 1);
    }
}

// ==================== إنشاء ملف TopCinema جديد ====================
function createNewTopCinemaFile(fileNumber) {
    const newFilename = `TopCinema${fileNumber}.json`;
    const newFilePath = path.join(CONFIG.outputDir, newFilename);
    
    const structure = {
        fileNumber: fileNumber,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        movies: [],
        totalMovies: 0,
        metadata: {
            batchSize: CONFIG.batchSize,
            source: "topcinema.rip"
        }
    };
    
    // تأكد من وجود المجلد
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    
    // إنشاء الملف
    fs.writeFileSync(newFilePath, JSON.stringify(structure, null, 2));
    console.log(`📄 تم إنشاء ملف جديد: ${newFilename}`);
    
    return {
        filename: newFilename,
        number: fileNumber,
        movieCount: 0,
        isFull: false,
        path: newFilePath
    };
}

// ==================== إضافة فيلم لملف TopCinema ====================
function addMovieToTopCinemaFile(movieData, topCinemaInfo) {
    const filePath = topCinemaInfo.path || path.join(CONFIG.outputDir, topCinemaInfo.filename);
    
    try {
        // قراءة الملف الحالي أو إنشاء هيكل جديد
        let content;
        if (fs.existsSync(filePath)) {
            content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else {
            content = {
                fileNumber: topCinemaInfo.number,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                movies: [],
                totalMovies: 0,
                metadata: {
                    batchSize: CONFIG.batchSize,
                    source: "topcinema.rip"
                }
            };
        }
        
        // التحقق من عدم التكرار
        const exists = content.movies.some(m => m.id === movieData.id);
        if (exists) {
            console.log(`   ⚠️ الفيلم ${movieData.id} موجود مسبقاً في الملف`);
            return false;
        }
        
        // إضافة الفيلم
        content.movies.push(movieData);
        content.lastUpdated = new Date().toISOString();
        content.totalMovies = content.movies.length;
        
        // حفظ الملف
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        
        console.log(`   ✅ أضيف الفيلم ${movieData.id} إلى ${topCinemaInfo.filename}`);
        return true;
        
    } catch (error) {
        console.log(`❌ خطأ في إضافة الفيلم للملف ${filePath}: ${error.message}`);
        console.log(`   محاولة إنشاء الملف من جديد...`);
        
        // محاولة استعادة بإنشاء ملف جديد
        try {
            const newFile = createNewTopCinemaFile(topCinemaInfo.number);
            return addMovieToTopCinemaFile(movieData, newFile);
        } catch (retryError) {
            console.log(`❌ فشل إعادة المحاولة: ${retryError.message}`);
            return false;
        }
    }
}

// ==================== حفظ البيانات في ملف ====================
function saveToFile(filename, data) {
    const filePath = path.join(CONFIG.outputDir, filename);
    
    // تأكد من وجود المجلد
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 تم حفظ ${filename}`);
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
        if (!url) return `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // محاولة استخراج ID من الرابط
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        // نماذج متوقعة:
        // /movie/عنوان-الفيلم-12345/
        // /series/مسلسل-456/
        
        if (pathParts.length >= 2) {
            const lastPart = pathParts[pathParts.length - 1];
            // البحث عن أرقام في الجزء الأخير
            const numbersMatch = lastPart.match(/(\d+)/);
            if (numbersMatch) {
                return numbersMatch[1];
            }
            // استخدام الجزء الأخير كامل
            return lastPart;
        }
        
        // إذا لم يتم العثور، إنشاء hash من الرابط
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `hash_${Math.abs(hash).toString(16)}`;
        
    } catch (error) {
        console.log(`⚠️ خطأ في استخراج ID: ${error.message}`);
        return `error_${Date.now()}`;
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
        
        // أنماط البحث المختلفة
        const selectors = [
            '.Small--Box a',
            '.movie-item a',
            '.post a',
            '.item a',
            'a[href*="/movie/"]',
            'a[href*="/series/"]'
        ];
        
        let movieElements = [];
        for (const selector of selectors) {
            const elements = doc.querySelectorAll(selector);
            if (elements.length > 0) {
                movieElements = Array.from(elements);
                break;
            }
        }
        
        // إذا لم نجد بأي selector، نبحث عن أي روابط تحتوي على movie أو series
        if (movieElements.length === 0) {
            const allLinks = doc.querySelectorAll('a[href]');
            movieElements = Array.from(allLinks).filter(link => 
                link.href.includes('/movie/') || link.href.includes('/series/')
            );
        }
        
        console.log(`   📊 عثر على ${movieElements.length} فيلم في الصفحة ${pageNum}`);
        
        movieElements.forEach((element, index) => {
            try {
                const movieUrl = element.href;
                
                if (movieUrl && movieUrl.includes('topcinema.rip')) {
                    const title = element.querySelector('.title')?.textContent?.trim() || 
                                 element.querySelector('.name')?.textContent?.trim() ||
                                 element.textContent?.trim() || 
                                 `فيلم ${pageNum}_${index + 1}`;
                    
                    const image = element.querySelector('img')?.src || 
                                 element.querySelector('.poster')?.src ||
                                 element.querySelector('img[src*="poster"]')?.src ||
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
            } catch (error) {
                console.log(`   ⚠️ خطأ في معالجة فيلم ${index + 1}: ${error.message}`);
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
            discoveryPage: movie.page,
            addedAt: now
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
            console.log(`   ↪️ نقل الفيلم ${movie.id} إلى ${topCinemaFile.filename}`);
        }
        
        return 'updated';
    }
}

// ==================== حفظ النظام ====================
function saveSystemData(system) {
    try {
        // حفظ الفهرس
        system.index.lastUpdated = new Date().toISOString();
        saveToFile(CONFIG.files.index, system.index);
        
        // حفظ الإحصائيات
        system.stats.lastRunDate = new Date().toISOString();
        system.stats.runs = system.stats.runs || [];
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
        
        saveToFile(CONFIG.files.stats, system.stats);
        
        console.log(`💾 تم حفظ بيانات النظام`);
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ بيانات النظام: ${error.message}`);
    }
}

// ==================== التشغيل الأول ====================
async function firstRun(system) {
    console.log("🚀 بدء التشغيل الأول - جمع كل الأفلام");
    console.log("=".repeat(50));
    
    let currentPage = 1;
    let totalMoviesCollected = 0;
    let topCinemaFile = system.lastTopCinemaFile;
    
    // تأكد من وجود ملف TopCinema الأول
    if (!topCinemaFile || !fs.existsSync(topCinemaFile.path)) {
        topCinemaFile = createNewTopCinemaFile(1);
        system.stats.totalFiles = 1;
    }
    
    while (currentPage <= CONFIG.maxPagesFirstRun) {
        console.log(`\n📄 الصفحة ${currentPage}/${CONFIG.maxPagesFirstRun}`);
        
        const movies = await fetchMoviesFromPage(currentPage);
        
        if (movies.length === 0) {
            console.log(`⏹️ لا توجد أفلام في الصفحة ${currentPage} - ربما انتهت الصفحات`);
            break;
        }
        
        // الصفحة الأولى -> Home.json
        if (currentPage === 1) {
            const homeData = {
                page: 1,
                url: "https://topcinema.rip/movies/",
                scrapedAt: new Date().toISOString(),
                totalMovies: movies.length,
                movies: movies
            };
            
            saveToFile(CONFIG.files.home, homeData);
            console.log(`🏠 حفظ الصفحة الأولى في Home.json (${movies.length} فيلم)`);
        }
        
        // معالجة كل أفلام الصفحة
        for (let i = 0; i < movies.length; i++) {
            const movie = movies[i];
            
            // إذا امتلأ الملف الحالي، إنشاء ملف جديد
            if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                const newNumber = topCinemaFile.number + 1;
                topCinemaFile = createNewTopCinemaFile(newNumber);
                system.stats.totalFiles++;
                console.log(`📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
            }
            
            // إضافة الفيلم للملف
            const added = addMovieToTopCinemaFile(movie, topCinemaFile);
            if (added) {
                const status = updateIndex(movie, topCinemaFile, system);
                topCinemaFile.movieCount++;
                totalMoviesCollected++;
                
                if (status === 'new') {
                    console.log(`   ${i + 1}/${movies.length}: ✅ ${movie.title.substring(0, 30)}...`);
                }
                
                // تحديث كل 50 فيلم
                if (totalMoviesCollected % 50 === 0) {
                    console.log(`   📊 تم جمع ${totalMoviesCollected} فيلم حتى الآن...`);
                    saveSystemData(system);
                }
            }
            
            // تأخير بسيط بين الأفلام
            if (i < movies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // تأخير بين الصفحات
        if (currentPage < CONFIG.maxPagesFirstRun && movies.length > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
        }
        
        currentPage++;
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
    
    // تأكد من وجود ملف TopCinema
    if (!topCinemaFile || !fs.existsSync(topCinemaFile.path)) {
        const files = fs.readdirSync(CONFIG.outputDir);
        const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
        
        if (topCinemaFiles.length === 0) {
            topCinemaFile = createNewTopCinemaFile(1);
            system.stats.totalFiles = 1;
        } else {
            topCinemaFile = getLastTopCinemaFile();
        }
    }
    
    // الخطوة 1: تحديث الصفحة الأولى (Home.json)
    console.log("\n1️⃣ تحديث الصفحة الأولى...");
    const page1Movies = await fetchMoviesFromPage(1);
    
    if (page1Movies.length > 0) {
        const homeData = {
            page: 1,
            url: "https://topcinema.rip/movies/",
            scrapedAt: new Date().toISOString(),
            totalMovies: page1Movies.length,
            movies: page1Movies
        };
        
        saveToFile(CONFIG.files.home, homeData);
        console.log(`   🏠 تم تحديث Home.json بـ ${page1Movies.length} فيلم`);
    }
    
    // الخطوة 2: فحص الصفحة الثانية
    console.log("\n2️⃣ فحص الصفحة الثانية لاكتشاف الأفلام الجديدة...");
    const page2Movies = await fetchMoviesFromPage(2);
    
    console.log(`   📊 الصفحة الثانية تحتوي على ${page2Movies.length} فيلم`);
    
    // اكتشاف الأفلام الجديدة
    let newMoviesFound = 0;
    
    for (let i = 0; i < page2Movies.length; i++) {
        const movie = page2Movies[i];
        
        // إذا امتلأ الملف الحالي، إنشاء ملف جديد
        if (topCinemaFile.movieCount >= CONFIG.batchSize) {
            const newNumber = topCinemaFile.number + 1;
            topCinemaFile = createNewTopCinemaFile(newNumber);
            system.stats.totalFiles++;
            console.log(`   📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
        }
        
        // إذا الفيلم غير موجود في الفهرس، فهو جديد
        if (!system.index.movies[movie.id]) {
            console.log(`   🎯 ${i + 1}/${page2Movies.length}: فيلم جديد - ${movie.title.substring(0, 40)}...`);
            
            // إضافة الفيلم للملف
            const added = addMovieToTopCinemaFile(movie, topCinemaFile);
            if (added) {
                updateIndex(movie, topCinemaFile, system);
                topCinemaFile.movieCount++;
                newMoviesFound++;
                system.newMoviesCount++;
            }
        } else {
            // الفيلم موجود - تحديث فقط
            updateIndex(movie, topCinemaFile, system);
            system.updatedMoviesCount++;
        }
        
        // تأخير بسيط بين الأفلام
        if (i < page2Movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 نتائج التحديث اليومي:");
    console.log(`   🆕 أفلام جديدة: ${newMoviesFound}`);
    console.log(`   🔄 أفلام محدثة: ${system.updatedMoviesCount}`);
    console.log(`   📁 الملف النشط: ${topCinemaFile.filename} (${topCinemaFile.movieCount}/${CONFIG.batchSize})`);
    console.log(`   📈 إجمالي الأفلام: ${system.stats.totalMovies}`);
    
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
    
    try {
        // تهيئة النظام
        const system = initSystem();
        
        // اختبار الاتصال
        console.log("\n🔗 اختبار الاتصال بالموقع...");
        const testResponse = await fetchWithTimeout("https://topcinema.rip/", 10000);
        if (!testResponse) {
            console.log("❌ لا يمكن الوصول إلى الموقع. تحقق من اتصال الإنترنت.");
            return;
        }
        console.log("✅ الاتصال ناجح");
        
        // تحديد وضع التشغيل
        if (CONFIG.isFirstRun) {
            await firstRun(system);
        } else {
            await dailyUpdate(system);
        }
        
        console.log("\n" + "=".repeat(50));
        console.log("🎉 اكتمل التشغيل بنجاح!");
        console.log("💡 يمكنك تشغيل النظام يومياً للتحديث التلقائي");
        
    } catch (error) {
        console.error("💥 خطأ رئيسي:", error.message);
        console.error("Stack:", error.stack);
        
        // حفظ سجل الخطأ
        const errorLog = {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };
        
        const errorFile = path.join(CONFIG.outputDir, 'error_log.json');
        fs.writeFileSync(errorFile, JSON.stringify(errorLog, null, 2));
    }
}

// ==================== معالجة الأخطاء غير المتوقعة ====================
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 خطأ غير متوقع:', reason);
    
    const errorLog = {
        error: reason.toString(),
        timestamp: new Date().toISOString(),
        type: 'unhandledRejection'
    };
    
    const errorFile = path.join(CONFIG.outputDir, 'error_log.json');
    try {
        fs.writeFileSync(errorFile, JSON.stringify(errorLog, null, 2));
    } catch (e) {
        console.error('💥 لا يمكن حفظ سجل الخطأ:', e.message);
    }
    
    process.exit(1);
});

// ==================== التشغيل ====================
main();
