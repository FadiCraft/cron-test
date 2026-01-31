
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
    
    files: {
        home: "Home.json",
        index: "index.json",
        stats: "stats.json"
    },
    
    batchSize: 250,
    requestDelay: 1000,
    timeout: 30000,
    
    isFirstRun: false,
    scanOnlyPage2: true,
    maxPagesFirstRun: 100
};

// ==================== الدوال المساعدة ====================

function initSystem() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        console.log(`📁 تم إنشاء المجلد: ${CONFIG.outputDir}`);
    }
    
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    if (!fs.existsSync(indexFile)) {
        CONFIG.isFirstRun = true;
        console.log("🆕 هذا هو التشغيل الأول للنظام");
    } else {
        try {
            const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            CONFIG.isFirstRun = Object.keys(data.movies || {}).length === 0;
        } catch {
            CONFIG.isFirstRun = true;
        }
    }
    
    return {
        index: loadIndex(),
        stats: loadStats(),
        lastTopCinemaFile: getLastTopCinemaFile()
    };
}

function loadIndex() {
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    if (fs.existsSync(indexFile)) {
        try {
            return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        } catch (error) {
            console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
        }
    }
    return {
        movies: {},
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    };
}

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

function getLastTopCinemaFile() {
    const files = fs.readdirSync(CONFIG.outputDir);
    const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
    
    if (topCinemaFiles.length === 0) {
        return {
            filename: "TopCinema1.json",
            number: 1,
            movieCount: 0,
            isFull: false
        };
    }
    
    topCinemaFiles.sort((a, b) => {
        const numA = parseInt(a.match(/TopCinema(\d+)\.json/)?.[1] || 0);
        const numB = parseInt(b.match(/TopCinema(\d+)\.json/)?.[1] || 0);
        return numB - numA;
    });
    
    const lastFile = topCinemaFiles[0];
    const filePath = path.join(CONFIG.outputDir, lastFile);
    
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return {
            filename: lastFile,
            number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
            movieCount: content.movies?.length || 0,
            isFull: (content.movies?.length || 0) >= CONFIG.batchSize
        };
    } catch (error) {
        console.log(`⚠️ خطأ في قراءة ملف ${lastFile}: ${error.message}`);
        return {
            filename: lastFile,
            number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
            movieCount: 0,
            isFull: false
        };
    }
}

function createNewTopCinemaFile(fileNumber) {
    const newFilename = `TopCinema${fileNumber}.json`;
    const newFilePath = path.join(CONFIG.outputDir, newFilename);
    
    const structure = {
        fileNumber: fileNumber,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        movies: [],
        totalMovies: 0,
        metadata: { batchSize: CONFIG.batchSize, source: "topcinema.rip" }
    };
    
    fs.writeFileSync(newFilePath, JSON.stringify(structure, null, 2));
    console.log(`📄 تم إنشاء ملف جديد: ${newFilename}`);
    
    return {
        filename: newFilename,
        number: fileNumber,
        movieCount: 0,
        isFull: false
    };
}

function addMovieToTopCinemaFile(movieData, topCinemaInfo) {
    const filePath = path.join(CONFIG.outputDir, topCinemaInfo.filename);
    
    try {
        let content = { movies: [] };
        if (fs.existsSync(filePath)) {
            content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        
        // التحقق من التكرار
        const exists = content.movies.some(m => m.id === movieData.id);
        if (exists) {
            console.log(`   ⚠️ الفيلم ${movieData.id} موجود مسبقاً`);
            return false;
        }
        
        content.movies.push(movieData);
        content.lastUpdated = new Date().toISOString();
        content.totalMovies = content.movies.length;
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        console.log(`   ✅ أضيف الفيلم ${movieData.id} إلى ${topCinemaInfo.filename}`);
        return true;
        
    } catch (error) {
        console.log(`❌ خطأ في إضافة الفيلم للملف: ${error.message}`);
        return false;
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

// ==================== استخراج سيرفرات المشاهدة ====================
async function fetchWatchServers(watchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة...`);
    
    const html = await fetchWithTimeout(watchUrl);
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const watchServers = [];
        
        // البحث في meta tags
        const metaElements = doc.querySelectorAll('meta');
        metaElements.forEach(meta => {
            const content = meta.getAttribute('content');
            if (content && content.includes('embed')) {
                watchServers.push({
                    type: 'embed',
                    url: content,
                    quality: 'متعدد الجودات',
                    server: 'Embed Server'
                });
            }
        });
        
        // البحث في iframes
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src && src.includes('embed')) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: 'Iframe Embed'
                });
            }
        });
        
        // البحث في روابط JavaScript
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const scriptContent = script.textContent;
            if (scriptContent && scriptContent.includes('embed')) {
                const embedMatch = scriptContent.match(/https?[^"\s]*embed[^"\s]*/g);
                if (embedMatch) {
                    embedMatch.forEach(url => {
                        watchServers.push({
                            type: 'js_embed',
                            url: url,
                            quality: 'متعدد الجودات',
                            server: 'JavaScript Embed'
                        });
                    });
                }
            }
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        watchServers.forEach(server => {
            if (!seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر مشاهدة`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج سيرفرات التحميل ====================
async function fetchDownloadServers(downloadUrl) {
    console.log(`   🔍 جلب سيرفرات التحميل...`);
    
    const html = await fetchWithTimeout(downloadUrl);
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة التحميل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const downloadServers = [];
        
        // سيرفرات Pro
        const proServerElements = doc.querySelectorAll('.proServer a.downloadsLink');
        proServerElements.forEach(server => {
            const nameElement = server.querySelector('.text span');
            const providerElement = server.querySelector('.text p');
            
            const serverName = nameElement?.textContent?.trim() || 'متعدد الجودات';
            const provider = providerElement?.textContent?.trim() || 'غير معروف';
            const url = server.getAttribute('href') || '';
            
            if (url) {
                downloadServers.push({
                    server: provider,
                    url: url,
                    quality: serverName,
                    type: 'pro'
                });
            }
        });
        
        // سيرفرات عادية
        const allDownloadLinks = doc.querySelectorAll('.download-items li a.downloadsLink');
        allDownloadLinks.forEach(link => {
            const providerElement = link.querySelector('.text span');
            const qualityElement = link.querySelector('.text p');
            
            const provider = providerElement?.textContent?.trim() || 'غير معروف';
            const quality = qualityElement?.textContent?.trim() || 'غير معروف';
            const url = link.getAttribute('href') || '';
            
            if (url && !link.closest('.proServer')) {
                downloadServers.push({
                    server: provider,
                    url: url,
                    quality: quality,
                    type: 'normal'
                });
            }
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        downloadServers.forEach(server => {
            if (!seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر تحميل`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الفيلم الكاملة ====================
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
        const movieId = shortLink ? extractMovieId(shortLink) : movie.id;
        
        if (!movieId) {
            console.log(`   ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // 2. البيانات الأساسية
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        // 3. القصة
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
        // 4. روابط المشاهدة والتحميل
        const watchLink = doc.querySelector('a.watch')?.getAttribute('href');
        const downloadLink = doc.querySelector('a.download')?.getAttribute('href');
        
        // 5. التفاصيل
        const details = {
            category: [],
            genres: [],
            quality: [],
            duration: "",
            releaseYear: [],
            language: [],
            country: [],
            directors: [],
            writers: [],
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
                    } else if (label.includes("دولة الفيلم")) {
                        details.country = values;
                    } else if (label.includes("المخرجين")) {
                        details.directors = values;
                    } else if (label.includes("المؤلفين")) {
                        details.writers = values;
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
        
        // 6. جلب سيرفرات المشاهدة والتحميل
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            watchServers = await fetchWatchServers(watchLink);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (downloadLink) {
            downloadServers = await fetchDownloadServers(downloadLink);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // 7. تجميع البيانات الكاملة
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchServers: watchServers,
            downloadServers: downloadServers,
            page: movie.page,
            position: movie.position,
            discoveredAt: movie.discoveredAt,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum}`);
    
    const html = await fetchWithTimeout(url);
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return [];
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
                    position: i + 1,
                    discoveredAt: new Date().toISOString()
                });
            }
        });
        
        return movies;
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return [];
    }
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

// ==================== حفظ البيانات ====================
function saveToFile(filename, data) {
    const filePath = path.join(CONFIG.outputDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 تم حفظ ${filename}`);
    return filePath;
}

function saveSystemData(system) {
    system.index.lastUpdated = new Date().toISOString();
    saveToFile(CONFIG.files.index, system.index);
    
    system.stats.lastRunDate = new Date().toISOString();
    system.stats.runs = system.stats.runs || [];
    system.stats.runs.push({
        date: new Date().toISOString(),
        newMovies: system.newMoviesCount || 0,
        updatedMovies: system.updatedMoviesCount || 0,
        totalMovies: system.stats.totalMovies
    });
    
    if (system.stats.runs.length > 30) {
        system.stats.runs = system.stats.runs.slice(-30);
    }
    
    saveToFile(CONFIG.files.stats, system.stats);
}

// ==================== تحديث الفهرس ====================
function updateIndex(movie, topCinemaFile, system) {
    const now = new Date().toISOString();
    
    if (!system.index.movies[movie.id]) {
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
        system.index.movies[movie.id].lastSeen = now;
        system.index.movies[movie.id].lastPageSeen = movie.page;
        
        if (system.index.movies[movie.id].storedIn !== topCinemaFile.filename) {
            system.index.movies[movie.id].storedIn = topCinemaFile.filename;
        }
        
        return 'updated';
    }
}

// ==================== التشغيل الأول ====================
async function firstRun(system) {
    console.log("🚀 بدء التشغيل الأول");
    console.log("=".repeat(50));
    
    let currentPage = 1;
    let totalMoviesCollected = 0;
    let topCinemaFile = system.lastTopCinemaFile;
    
    while (currentPage <= CONFIG.maxPagesFirstRun) {
        console.log(`\n📄 الصفحة ${currentPage}/${CONFIG.maxPagesFirstRun}`);
        
        const movies = await fetchMoviesFromPage(currentPage);
        if (movies.length === 0) break;
        
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
        
        // استخراج تفاصيل كل الأفلام
        for (let i = 0; i < movies.length; i++) {
            const movie = movies[i];
            
            if (system.index.movies[movie.id]) {
                console.log(`   ⏭️ تخطي ${movie.id} - موجود مسبقاً`);
                continue;
            }
            
            if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                topCinemaFile = createNewTopCinemaFile(topCinemaFile.number + 1);
                system.stats.totalFiles++;
            }
            
            const movieDetails = await fetchMovieDetails(movie);
            if (movieDetails) {
                const added = addMovieToTopCinemaFile(movieDetails, topCinemaFile);
                if (added) {
                    updateIndex(movieDetails, topCinemaFile, system);
                    topCinemaFile.movieCount++;
                    totalMoviesCollected++;
                    
                    console.log(`   ✅ ${i + 1}/${movies.length}: ${movieDetails.title.substring(0, 30)}...`);
                    console.log(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0} سيرفر`);
                    console.log(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0} سيرفر`);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
        currentPage++;
        
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
    
    // تحديث الصفحة الأولى
    console.log("\n1️⃣ تحديث الصفحة الأولى...");
    const page1Movies = await fetchMoviesFromPage(1);
    
    if (page1Movies.length > 0) {
        const homeData = {
            page: 1,
            url: "https://topcinema.rip/movies/",
            scrapedAt: new Date().toISOString(),
            movies: page1Movies
        };
        saveToFile(CONFIG.files.home, homeData);
        console.log(`🏠 تم تحديث Home.json بـ ${page1Movies.length} فيلم`);
    }
    
    // فحص الصفحة الثانية
    console.log("\n2️⃣ فحص الصفحة الثانية...");
    const page2Movies = await fetchMoviesFromPage(2);
    console.log(`📊 الصفحة الثانية تحتوي على ${page2Movies.length} فيلم`);
    
    let newMoviesFound = 0;
    
    for (let i = 0; i < page2Movies.length; i++) {
        const movie = page2Movies[i];
        
        if (topCinemaFile.movieCount >= CONFIG.batchSize) {
            topCinemaFile = createNewTopCinemaFile(topCinemaFile.number + 1);
            system.stats.totalFiles++;
        }
        
        if (!system.index.movies[movie.id]) {
            console.log(`   🎯 ${i + 1}/${page2Movies.length}: فيلم جديد`);
            
            const movieDetails = await fetchMovieDetails(movie);
            if (movieDetails) {
                const added = addMovieToTopCinemaFile(movieDetails, topCinemaFile);
                if (added) {
                    updateIndex(movieDetails, topCinemaFile, system);
                    topCinemaFile.movieCount++;
                    newMoviesFound++;
                    system.newMoviesCount++;
                    
                    console.log(`     ✅ ${movieDetails.title.substring(0, 30)}...`);
                    console.log(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0} سيرفر`);
                    console.log(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0} سيرفر`);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            updateIndex(movie, topCinemaFile, system);
            system.updatedMoviesCount++;
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 نتائج التحديث:");
    console.log(`   🆕 أفلام جديدة: ${newMoviesFound}`);
    console.log(`   🔄 أفلام محدثة: ${system.updatedMoviesCount}`);
    console.log(`   📁 الملف النشط: ${topCinemaFile.filename} (${topCinemaFile.movieCount}/${CONFIG.batchSize})`);
    
    saveSystemData(system);
    return { newMovies: newMoviesFound, updatedMovies: system.updatedMoviesCount };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء نظام جمع الأفلام");
    console.log("=".repeat(50));
    
    const system = initSystem();
    
    if (CONFIG.isFirstRun) {
        await firstRun(system);
    } else {
        await dailyUpdate(system);
    }
    
    console.log("\n🎉 اكتمل التشغيل!");
}

// التشغيل
main().catch(error => {
    console.error('💥 خطأ:', error.message);
});


