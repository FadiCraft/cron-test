import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const INDEX_FILE = path.join(MOVIES_DIR, "index.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");
const HOME_FILE = path.join(MOVIES_DIR, "Home.json");

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== إعدادات جديدة ====================
const MOVIES_PER_FILE = 250;        // 250 فيلم في كل ملف
const PAGES_PER_RUN = 5;           // 5 صفحات في كل تشغيل
const BASE_URL = "https://topcinema.red"; // ✅ تحديث الرابط الأساسي

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
                this.pages = data.pages || {};
                this.stats = data.stats || { totalMovies: 0, totalPages: 0 };
                this.allPagesScraped = data.allPagesScraped || false;
            } else {
                this.movies = {};
                this.pages = {};
                this.stats = { totalMovies: 0, totalPages: 0 };
                this.allPagesScraped = false;
                this.saveIndex();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل الفهرس، إنشاء جديد");
            this.movies = {};
            this.pages = {};
            this.stats = { totalMovies: 0, totalPages: 0 };
            this.allPagesScraped = false;
        }
    }
    
    saveIndex() {
        const indexData = {
            movies: this.movies,
            pages: this.pages,
            stats: this.stats,
            allPagesScraped: this.allPagesScraped,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    }
    
    addMovie(movieId, movieData) {
        const isNew = !this.movies[movieId];
        
        this.movies[movieId] = {
            id: movieId,
            title: movieData.title,
            currentFile: movieData.currentFile,
            page: movieData.page,
            watchServers: movieData.watchServers?.length || 0,
            downloadServers: movieData.downloadServers?.length || 0,
            lastUpdated: new Date().toISOString(),
            ...(isNew ? {
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            } : {
                firstSeen: this.movies[movieId].firstSeen,
                lastSeen: new Date().toISOString()
            })
        };
        
        if (isNew) {
            this.stats.totalMovies++;
        }
        
        return isNew;
    }
    
    addPage(pageNum, pageData) {
        const pageKey = pageNum === 1 ? "Home" : pageNum.toString();
        this.pages[pageKey] = {
            page: pageNum,
            fileName: pageData.fileName,
            moviesCount: pageData.movies.length,
            scrapedAt: new Date().toISOString(),
            url: pageData.url
        };
        this.stats.totalPages++;
    }
    
    isMovieExists(movieId) {
        return !!this.movies[movieId];
    }
    
    getMovie(movieId) {
        return this.movies[movieId];
    }
    
    getAllMoviesInFile(fileName) {
        return Object.values(this.movies).filter(movie => movie.currentFile === fileName);
    }
    
    markAllPagesScraped() {
        this.allPagesScraped = true;
        this.saveIndex();
    }
    
    getStats() {
        return {
            ...this.stats,
            uniqueMovies: Object.keys(this.movies).length,
            allPagesScraped: this.allPagesScraped
        };
    }
}

// ==================== نظام التقدم المعدل ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                this.currentPage = data.currentPage || 1;
                this.currentFileNumber = data.currentFileNumber || 1;
                this.moviesInCurrentFile = data.moviesInCurrentFile || 0;
                this.currentFileName = data.currentFileName || "Top1.json";
                this.lastMovieId = data.lastMovieId || null;
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.foundDuplicate = data.foundDuplicate || false;
                this.shouldStop = data.shouldStop || false;
                this.allPagesScraped = data.allPagesScraped || false;
                this.homeScraped = data.homeScraped || false;
            } else {
                this.currentPage = 1;
                this.currentFileNumber = 1;
                this.moviesInCurrentFile = 0;
                this.currentFileName = "Top1.json";
                this.lastMovieId = null;
                this.pagesProcessedThisRun = 0;
                this.foundDuplicate = false;
                this.shouldStop = false;
                this.allPagesScraped = false;
                this.homeScraped = false;
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم");
            this.currentPage = 1;
            this.currentFileNumber = 1;
            this.moviesInCurrentFile = 0;
            this.currentFileName = "Top1.json";
            this.lastMovieId = null;
            this.pagesProcessedThisRun = 0;
            this.foundDuplicate = false;
            this.shouldStop = false;
            this.allPagesScraped = false;
            this.homeScraped = false;
        }
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            currentFileNumber: this.currentFileNumber,
            moviesInCurrentFile: this.moviesInCurrentFile,
            currentFileName: this.currentFileName,
            lastMovieId: this.lastMovieId,
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            foundDuplicate: this.foundDuplicate,
            shouldStop: this.shouldStop,
            allPagesScraped: this.allPagesScraped,
            homeScraped: this.homeScraped,
            lastUpdate: new Date().toISOString()
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    addMovieToFile() {
        this.moviesInCurrentFile++;
        
        // إذا وصلنا إلى 250 فيلم، ننتقل للملف التالي
        if (this.moviesInCurrentFile >= MOVIES_PER_FILE) {
            this.currentFileNumber++;
            this.moviesInCurrentFile = 0;
            this.currentFileName = `Top${this.currentFileNumber}.json`;
            console.log(`\n📁 تم تعبئة الملف! إنشاء ملف جديد: ${this.currentFileName}`);
        }
        
        this.saveProgress();
    }
    
    addPageProcessed(isHomePage = false) {
        this.pagesProcessedThisRun++;
        
        if (isHomePage) {
            this.homeScraped = true;
        }
        
        // إذا تمت معالجة 5 صفحات، نتوقف
        if (this.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        } else if (!this.allPagesScraped) {
            // الانتقال للصفحة التالية فقط في المرحلة الأولى
            this.currentPage++;
            console.log(`\n🔄 الانتقال للصفحة ${this.currentPage === 1 ? "Home" : this.currentPage}...`);
        }
        
        this.saveProgress();
    }
    
    markAllPagesScraped() {
        this.allPagesScraped = true;
        this.currentPage = 1; // العودة للصفحة الأولى
        this.saveProgress();
    }
    
    setDuplicateFound(movieId) {
        this.foundDuplicate = true;
        this.lastMovieId = movieId;
        this.shouldStop = true;
        this.saveProgress();
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
        this.foundDuplicate = false;
        this.shouldStop = false;
        this.homeScraped = false;
        this.saveProgress();
    }
}

// ==================== دوال المساعدة ====================
async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url.substring(0, 60)}...`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
            'Referer': BASE_URL,
        };
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractMovieId(url) {
    try {
        // محاولة استخراج ID من الرابط القصير ?p=198907
        const match = url.match(/[?&]p=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        // محاولة استخراج ID من نهاية الرابط العادي
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];
        const numMatch = lastPart.match(/(\d+)$/);
        return numMatch ? numMatch[1] : `temp_${Date.now()}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// ==================== استخراج الأفلام من صفحة (مُحدّث) ====================
async function fetchMoviesFromPage(pageNum) {
    // ✅ تحديث الرابط لاستخدام BASE_URL الجديد
    const url = pageNum === 1 
        ? `${BASE_URL}/movies/`
        : `${BASE_URL}/movies/page/${pageNum}/`;
    
    console.log(`\n📖 ===== جلب الصفحة ${pageNum === 1 ? "Home" : pageNum} =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 البحث عن الأفلام...");
        
        // ✅ تحديث محدد العنصر (selector) ليتوافق مع الهيكل الجديد
        const movieElements = doc.querySelectorAll('.Small--Box a.recent--block');
        console.log(`✅ وجدت ${movieElements.length} فيلم في الصفحة`);
        
        for (let i = 0; i < movieElements.length; i++) {
            const element = movieElements[i];
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes(BASE_URL.replace('https://', ''))) {
                // ✅ استخراج العنوان من h3.title
                const titleElement = element.querySelector('h3.title');
                const title = cleanText(titleElement?.textContent || `فيلم ${i + 1}`);
                
                movies.push({
                    id: extractMovieId(movieUrl),
                    title: title,
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
            }
        }
        
        return { url, movies };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// ==================== دالة متخصصة لاستخراج سيرفرات المشاهدة ====================
async function extractWatchServers(watchUrl) {
    try {
        console.log(`   👁️ جاري استخراج سيرفرات المشاهدة...`);
        const html = await fetchPage(watchUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = [];
        
        // البحث عن رابط الفيديو المباشر في meta tags
        const metaTags = [
            'og:video:secure_url',
            'og:video',
            'twitter:player:stream',
            'video'
        ];
        
        metaTags.forEach(property => {
            const meta = doc.querySelector(`meta[property="${property}"]`) || 
                        doc.querySelector(`meta[name="${property}"]`);
            if (meta && meta.content) {
                servers.push({
                    name: "مشاهدة مباشرة",
                    url: meta.content,
                    quality: "متعدد الجودات",
                    type: "meta_stream",
                    source: property
                });
            }
        });
        
        // البحث عن iframes للمشاهدة
        const iframes = doc.querySelectorAll('iframe[src*="embed"], iframe[src*="video"], iframe[src*="player"]');
        iframes.forEach((iframe, i) => {
            if (iframe.src) {
                servers.push({
                    name: `مشاهدة Iframe ${i + 1}`,
                    url: iframe.src,
                    quality: "متعدد الجودات",
                    type: "iframe",
                    width: iframe.width,
                    height: iframe.height
                });
            }
        });
        
        console.log(`   ✅ تم العثور على ${servers.length} سيرفر مشاهدة`);
        return servers;
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== دالة متخصصة لاستخراج سيرفرات التحميل ====================
async function extractDownloadServers(downloadUrl) {
    try {
        console.log(`   ⬇️ جاري استخراج سيرفرات التحميل...`);
        const html = await fetchPage(downloadUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = [];
        
        // 1. استخراج سيرفرات التحميل السريعة (proServer)
        const proServers = doc.querySelectorAll('.proServer a.downloadsLink');
        proServers.forEach(server => {
            const nameElement = server.querySelector('.text p');
            const qualityElement = server.querySelector('.text span');
            
            servers.push({
                name: cleanText(nameElement?.textContent) || "VidTube",
                url: server.href,
                quality: cleanText(qualityElement?.textContent) || "متعدد الجودات",
                type: "pro_server",
                icon: "fas fa-rocket",
                label: "سيرفر سريع"
            });
        });
        
        // 2. استخراج سيرفرات التحميل حسب الجودة (DownloadBlock)
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        downloadBlocks.forEach(block => {
            // استخراج الجودة من الـ span داخل h2.download-title
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "1080p";
            
            const serverLinks = block.querySelectorAll('ul.download-items a.downloadsLink');
            serverLinks.forEach(link => {
                const nameElement = link.querySelector('.text p');
                const name = cleanText(nameElement?.textContent) || quality;
                
                servers.push({
                    name: name,
                    url: link.href,
                    quality: quality,
                    type: "download_server",
                    icon: "fas fa-download",
                    label: "سيرفر تحميل"
                });
            });
        });
        
        // تصفية الروابط المكررة
        const uniqueServers = servers.filter((server, index, self) =>
            index === self.findIndex((s) => s.url === server.url)
        );
        
        console.log(`   ✅ تم العثور على ${uniqueServers.length} سيرفر تحميل`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الفيلم الكاملة (مُعدلة بالكامل لتطابق Top6.json) ====================
async function fetchMovieDetails(movie, currentFileName) {
    console.log(`\n🎬 [${movie.position}] ${movie.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchPage(movie.url);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر في input#shortlink
        const shortLinkInput = doc.querySelector('input#shortlink');
        let shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // العنوان
        const titleElement = doc.querySelector("h1.post-title a");
        const title = cleanText(titleElement?.textContent || movie.title);
        
        // الصورة
        let image = doc.querySelector(".image img")?.src;
        // إذا لم نجد الصورة، نبحث في مكان آخر
        if (!image) {
            image = doc.querySelector("img[src*='MV5B']")?.src;
        }
        
        // تقييم IMDb
        const imdbElement = doc.querySelector(".imdbR span, .imdbRating span");
        const imdbRating = imdbElement ? cleanText(imdbElement.textContent) : null;
        
        // القصة
        const storyElement = doc.querySelector(".story p, .entry-content p");
        const story = cleanText(storyElement?.textContent) || "غير متوفر";
        
        // ==================== استخراج التفاصيل بالضبط مثل Top6.json ====================
        const details = {
            "قسم الفيلم": [],
            "نوع الفيلم": [],
            "جودة الفيلم": [],
            "توقيت الفيلم": "",
            "موعد الصدور": [],
            "دولة الفيلم": [],
            "المخرجين": [],
            "المؤلفين": [],
            "بطولة": []
        };
        
        // البحث عن عناصر التفاصيل - نحاول عدة محددات
        const detailItems = doc.querySelectorAll("ul.RightTaxContent li, .post-details li, .movie-details li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span, strong:first-child");
            if (labelElement) {
                let label = cleanText(labelElement.textContent).replace(":", "").trim();
                
                // الحصول على القيمة (النص بعد التصنيف)
                let value = cleanText(item.textContent.replace(labelElement.textContent, ""));
                
                // استخراج الروابط إذا وجدت
                const links = item.querySelectorAll("a");
                const linkTexts = links.length > 0 ? Array.from(links).map(a => cleanText(a.textContent)) : [];
                
                // تصنيف الحقل حسب النص
                if (label.includes('قسم') || label.includes('القسم') || label.includes('التصنيف')) {
                    details["قسم الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('نوع') || label.includes('النوع') || label.includes('تصنيف')) {
                    details["نوع الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('جودة') || label.includes('الجودة') || label.includes('الدقة')) {
                    details["جودة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('توقيت') || label.includes('المدة') || label.includes('مدة')) {
                    details["توقيت الفيلم"] = value || "غير محدد";
                }
                else if (label.includes('صدور') || label.includes('سنة') || label.includes('تاريخ')) {
                    details["موعد الصدور"] = linkTexts.length > 0 ? linkTexts : [value.replace(/[^0-9]/g, '')];
                }
                else if (label.includes('دولة') || label.includes('البلد') || label.includes('الانتاج')) {
                    details["دولة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('مخرج') || label.includes('إخراج')) {
                    details["المخرجين"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('مؤلف') || label.includes('كتابة') || label.includes('قصة')) {
                    details["المؤلفين"] = linkTexts.length > 0 ? linkTexts : [value];
                }
                else if (label.includes('بطولة') || label.includes('تمثيل') || label.includes('ابطال')) {
                    details["بطولة"] = linkTexts.length > 0 ? linkTexts : value.split(',').map(v => cleanText(v));
                }
            }
        });
        
        // إذا لم نجد أي تفاصيل، نحاول استخراجها من الجدول
        if (Object.values(details).every(v => (Array.isArray(v) && v.length === 0) || v === "")) {
            const tables = doc.querySelectorAll("table tr");
            tables.forEach(row => {
                const cells = row.querySelectorAll("td, th");
                if (cells.length >= 2) {
                    const label = cleanText(cells[0].textContent);
                    const value = cleanText(cells[1].textContent);
                    const links = cells[1].querySelectorAll("a");
                    const linkTexts = Array.from(links).map(a => cleanText(a.textContent));
                    
                    if (label.includes('قسم')) details["قسم الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('نوع')) details["نوع الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('جودة')) details["جودة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('توقيت')) details["توقيت الفيلم"] = value;
                    else if (label.includes('صدور')) details["موعد الصدور"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('دولة')) details["دولة الفيلم"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('مخرج')) details["المخرجين"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('مؤلف')) details["المؤلفين"] = linkTexts.length > 0 ? linkTexts : [value];
                    else if (label.includes('بطولة')) details["بطولة"] = linkTexts.length > 0 ? linkTexts : value.split(',').map(v => cleanText(v));
                }
            });
        }
        
        // تنظيف القيم الفارغة
        Object.keys(details).forEach(key => {
            if (Array.isArray(details[key]) && details[key].length === 0) {
                delete details[key];
            } else if (key === "توقيت الفيلم" && !details[key]) {
                delete details[key];
            }
        });
        
        // ==================== استخراج سيرفرات المشاهدة ====================
        let watchServers = [];
        const watchButton = doc.querySelector('a.watch, a[href*="watch"], .watch-btn a');
        
        if (watchButton && watchButton.href) {
            watchServers = await extractWatchServers(watchButton.href);
        }
        
        // ==================== استخراج سيرفرات التحميل ====================
        let downloadServers = [];
        const downloadButton = doc.querySelector('a.download, a[href*="download"], .download-btn a');
        
        if (downloadButton && downloadButton.href) {
            downloadServers = await extractDownloadServers(downloadButton.href);
        }
        
        // ==================== بناء الكائن النهائي ====================
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image || null,
            imdbRating: imdbRating,
            story: story,
            details: details,
            
            // هذه الحقلين سنتركهما null كما في Top6.json
            year: null,
            quality: null,
            // لاحظ: runtime هنا تم استخراجه كتاريخ (للتطابق مع Top6.json)
            runtime: new Date().toLocaleDateString('en-GB').split('/').reverse().join('-'), // تنسيق DD-MM-YYYY
            genres: [],
            countries: [],
            
            // سيرفرات المشاهدة
            watchServers: watchServers,
            watchPage: watchButton ? watchButton.href : null,
            
            // سيرفرات التحميل
            downloadServers: downloadServers,
            downloadPage: downloadButton ? downloadButton.href : null,
            
            // معلومات الاستخراج
            page: movie.page,
            position: movie.position,
            currentFile: currentFileName,
            scrapedAt: new Date().toISOString(),
            
            // إحصائيات
            stats: {
                watchServersCount: watchServers.length,
                downloadServersCount: downloadServers.length,
                genresCount: 0
            }
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الأفلام في الملفات المرتبة ====================
function saveMovieToTopFile(movie, progress) {
    const filePath = path.join(MOVIES_DIR, progress.currentFileName);
    
    let existingMovies = [];
    let fileInfo = {};
    
    // تحميل الملف الحالي إذا كان موجوداً
    if (fs.existsSync(filePath)) {
        try {
            const existingData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingMovies = existingData.movies || [];
            fileInfo = {
                fileName: existingData.fileName || progress.currentFileName,
                created: existingData.created || new Date().toISOString()
            };
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة الملف الحالي: ${error.message}`);
        }
    }
    
    // البحث إذا كان الفيلم موجوداً في الملف
    const existingIndex = existingMovies.findIndex(m => m.id === movie.id);
    
    if (existingIndex !== -1) {
        // تحديث الفيلم الموجود
        existingMovies[existingIndex] = movie;
        console.log(`   🔄 تم تحديث الفيلم في ${progress.currentFileName}`);
    } else {
        // إضافة الفيلم الجديد
        existingMovies.push(movie);
        console.log(`   ➕ تم إضافة الفيلم الجديد إلى ${progress.currentFileName}`);
        
        // تحديث عداد الملف
        progress.addMovieToFile();
    }
    
    // حفظ الملف
    const fileContent = {
        fileName: progress.currentFileName,
        fileNumber: progress.currentFileNumber,
        totalMovies: existingMovies.length,
        created: fileInfo.created || new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        moviesPerFileLimit: MOVIES_PER_FILE,
        movies: existingMovies
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

// ==================== حفظ جميع أفلام الصفحة الأولى في Home.json ====================
function saveAllMoviesToHomeFile(moviesData) {
    const fileContent = {
        fileName: "Home.json",
        description: "جميع أفلام الصفحة الأولى",
        totalMovies: moviesData.length,
        lastUpdated: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`\n🏠 تم حفظ ${moviesData.length} فيلم في Home.json`);
    
    return fileContent;
}

// ==================== تحديث فيلم في جميع الملفات ====================
function updateMovieInAllFiles(movieId, updatedMovie, progress) {
    console.log(`   🔄 جاري تحديث الفيلم في جميع الملفات...`);
    
    // البحث في جميع ملفات TopX.json
    const topFiles = fs.readdirSync(MOVIES_DIR).filter(f => f.startsWith('Top') && f.endsWith('.json'));
    
    let updatedCount = 0;
    
    topFiles.forEach(file => {
        const filePath = path.join(MOVIES_DIR, file);
        try {
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const movieIndex = fileData.movies.findIndex(m => m.id === movieId);
            
            if (movieIndex !== -1) {
                // تحديث الفيلم
                fileData.movies[movieIndex] = updatedMovie;
                fileData.lastUpdated = new Date().toISOString();
                
                fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
                updatedCount++;
                console.log(`     ✅ تم التحديث في ${file}`);
            }
        } catch (error) {
            console.log(`     ⚠️ خطأ في تحديث ${file}: ${error.message}`);
        }
    });
    
    console.log(`   📊 تم تحديث الفيلم في ${updatedCount} ملف`);
    return updatedCount;
}

// ==================== المرحلة 1: استخراج جميع الصفحات ====================
async function phase1InitialScraping(progress, index) {
    console.log("🚀 المرحلة 1: بدء الاستخراج الأولي");
    console.log("=".repeat(60));
    
    const startTime = Date.now();
    let totalMoviesExtracted = 0;
    
    while (!progress.shouldStop) {
        const pageNum = progress.currentPage;
        console.log(`\n📖 ====== معالجة الصفحة ${pageNum === 1 ? "Home" : pageNum} ======`);
        
        // جلب قائمة الأفلام من الصفحة
        const pageData = await fetchMoviesFromPage(pageNum);
        
        if (!pageData || pageData.movies.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            progress.markAllPagesScraped();
            index.markAllPagesScraped();
            break;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.movies.length} فيلم`);
        
        // استخراج تفاصيل كل فيلم في الصفحة
        const pageMoviesData = [];
        
        for (let i = 0; i < pageData.movies.length; i++) {
            const movie = pageData.movies[i];
            
            // استخراج تفاصيل الفيلم
            console.log(`\n📊 التقدم في الصفحة: ${i + 1}/${pageData.movies.length}`);
            console.log(`📊 التقدم في الملف: ${progress.moviesInCurrentFile}/${MOVIES_PER_FILE}`);
            
            const movieDetails = await fetchMovieDetails(movie, progress.currentFileName);
            
            if (movieDetails) {
                // إضافة إلى الفهرس
                const isNew = index.addMovie(movieDetails.id, movieDetails);
                
                // حفظ في الملف المرتب
                const savedFile = saveMovieToTopFile(movieDetails, progress);
                
                if (isNew) {
                    pageMoviesData.push(movieDetails);
                    totalMoviesExtracted++;
                }
                
                // تحديث التقدم
                progress.lastMovieId = movieDetails.id;
                progress.saveProgress();
            }
            
            // تأخير بين الأفلام
            if (i < pageData.movies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // إضافة الصفحة إلى الفهرس
        if (pageMoviesData.length > 0) {
            index.addPage(pageNum, {
                fileName: progress.currentFileName,
                movies: pageMoviesData,
                url: pageData.url
            });
            index.saveIndex();
        }
        
        console.log(`\n✅ اكتملت الصفحة ${pageNum === 1 ? "Home" : pageNum}:`);
        console.log(`   📊 أفلام جديدة: ${pageMoviesData.length}`);
        console.log(`   📈 الإجمالي حتى الآن: ${totalMoviesExtracted}`);
        
        // تحديث تقدم الصفحات
        progress.addPageProcessed(pageNum === 1);
        
        // تأخير بين الصفحات
        if (!progress.shouldStop && !progress.allPagesScraped) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return { totalMoviesExtracted, executionTime: Date.now() - startTime };
}

// ==================== المرحلة 2: نظام Home.json والتحديثات ====================
async function phase2HomeScraping(progress, index) {
    console.log("\n🔄 المرحلة 2: نظام Home.json والتحديثات");
    console.log("=".repeat(60));
    
    const startTime = Date.now();
    let newMoviesCount = 0;
    let updatedMoviesCount = 0;
    
    console.log(`📄 جاري فحص الصفحة الأولى (Home)...`);
    
    // جلب جميع أفلام الصفحة الأولى
    const pageData = await fetchMoviesFromPage(1);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log("❌ لا يمكن جلب الصفحة الأولى");
        return { newMoviesCount, updatedMoviesCount };
    }
    
    console.log(`🔍 وجدت ${pageData.movies.length} فيلم في الصفحة الأولى`);
    
    // استخراج تفاصيل جميع الأفلام
    const allHomeMovies = [];
    
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        console.log(`\n📊 التقدم: ${i + 1}/${pageData.movies.length}`);
        
        const movieDetails = await fetchMovieDetails(movie, progress.currentFileName);
        
        if (movieDetails) {
            allHomeMovies.push(movieDetails);
            
            // التحقق من الفيلم في الفهرس
            const isNew = index.addMovie(movieDetails.id, movieDetails);
            
            if (isNew) {
                // فيلم جديد - حفظه في الملف المرتب
                console.log(`   🆕 فيلم جديد: ${movieDetails.title}`);
                saveMovieToTopFile(movieDetails, progress);
                newMoviesCount++;
            } else {
                // فيلم موجود - تحديثه في جميع الملفات
                console.log(`   🔄 فيلم موجود: ${movieDetails.title}`);
                updateMovieInAllFiles(movieDetails.id, movieDetails, progress);
                updatedMoviesCount++;
            }
        }
        
        // تأخير بين الأفلام
        if (i < pageData.movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // حفظ جميع الأفلام في Home.json
    saveAllMoviesToHomeFile(allHomeMovies);
    
    // تحديث الفهرس
    index.saveIndex();
    
    console.log(`\n✅ اكتملت المرحلة 2:`);
    console.log(`   🆕 أفلام جديدة: ${newMoviesCount}`);
    console.log(`   🔄 أفلام محدثة: ${updatedMoviesCount}`);
    console.log(`   🏠 أفلام في Home.json: ${allHomeMovies.length}`);
    
    return { 
        newMoviesCount, 
        updatedMoviesCount, 
        totalHomeMovies: allHomeMovies.length,
        executionTime: Date.now() - startTime 
    };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج الأفلام المتقدم");
    console.log(`🌐 الرابط الأساسي: ${BASE_URL}`);
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    // تهيئة الأنظمة
    const index = new MovieIndex();
    const progress = new ProgressTracker();
    
    // إعادة تعيين لمتغيرات هذا التشغيل
    progress.resetForNewRun();
    
    const stats = index.getStats();
    console.log(`📊 حالة النظام:`);
    console.log(`   📈 أفلام فريدة: ${stats.uniqueMovies}`);
    console.log(`   📄 صفحات مكتملة: ${stats.allPagesScraped ? 'نعم' : 'لا'}`);
    console.log(`   📁 الملف النشط: ${progress.currentFileName} (${progress.moviesInCurrentFile}/${MOVIES_PER_FILE})`);
    
    let phase1Results = null;
    let phase2Results = null;
    
    // تحديد المرحلة الحالية
    if (!progress.allPagesScraped) {
        // المرحلة 1: استخراج جميع الصفحات
        console.log(`\n🌐 المرحلة الحالية: استخراج الصفحات (${PAGES_PER_RUN} صفحات/تشغيل)`);
        phase1Results = await phase1InitialScraping(progress, index);
    }
    
    // إذا انتهت المرحلة 1 أو كانت قد انتهت سابقاً
    if (progress.allPagesScraped) {
        // المرحلة 2: نظام Home.json والتحديثات
        console.log(`\n🏠 المرحلة الحالية: تحديث الصفحة الأولى`);
        phase2Results = await phase2HomeScraping(progress, index);
    }
    
    // ==================== النتائج النهائية ====================
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    // إحصائيات الفهرس النهائية
    const finalStats = index.getStats();
    
    if (phase1Results) {
        console.log(`📊 نتائج المرحلة 1 (الاستخراج الأولي):`);
        console.log(`   🎬 أفلام جديدة: ${phase1Results.totalMoviesExtracted}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase1Results.executionTime / 1000).toFixed(1)} ثانية`);
        console.log(`   📄 آخر صفحة معالجة: ${progress.currentPage === 1 ? 'Home' : progress.currentPage}`);
    }
    
    if (phase2Results) {
        console.log(`\n📊 نتائج المرحلة 2 (نظام Home.json):`);
        console.log(`   🆕 أفلام جديدة: ${phase2Results.newMoviesCount}`);
        console.log(`   🔄 أفلام محدثة: ${phase2Results.updatedMoviesCount}`);
        console.log(`   🏠 أفلام في Home.json: ${phase2Results.totalHomeMovies}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase2Results.executionTime / 1000).toFixed(1)} ثانية`);
    }
    
    console.log(`\n📈 الإحصائيات النهائية:`);
    console.log(`   🎬 أفلام فريدة إجمالاً: ${finalStats.uniqueMovies}`);
    console.log(`   📄 صفحات مكتملة: ${finalStats.totalPages}`);
    console.log(`   📁 الملف النشط: ${progress.currentFileName}`);
    console.log(`   📊 أفلام في الملف النشط: ${progress.moviesInCurrentFile}/${MOVIES_PER_FILE}`);
    
    // الملفات المحفوظة
    console.log(`\n💾 الملفات المحفوظة:`);
    try {
        const files = fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            const fileStats = fs.statSync(filePath);
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.log(`   📄 ${file}: ${content.totalMovies || content.movies?.length || 0} فيلم (${(fileStats.size / 1024).toFixed(1)} كيلوبايت)`);
            } catch {
                console.log(`   📄 ${file}: (${(fileStats.size / 1024).toFixed(1)} كيلوبايت)`);
            }
        });
    } catch (error) {
        console.log(`   ⚠️ لا يمكن قراءة الملفات: ${error.message}`);
    }
    
    // حفظ التقرير النهائي
    const finalReport = {
        timestamp: new Date().toISOString(),
        phase: progress.allPagesScraped ? "phase2_home_scraping" : "phase1_initial_scraping",
        systemStats: finalStats,
        progress: {
            currentPage: progress.currentPage,
            currentFile: progress.currentFileName,
            moviesInCurrentFile: progress.moviesInCurrentFile,
            allPagesScraped: progress.allPagesScraped
        },
        results: {
            phase1: phase1Results,
            phase2: phase2Results
        },
        nextRun: {
            phase: progress.allPagesScraped ? "phase2_home_scraping" : "phase1_initial_scraping",
            startPage: progress.currentPage,
            currentFile: progress.currentFileName
        }
    };
    
    fs.writeFileSync("report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 تم حفظ التقرير النهائي في: report.json`);
    console.log("=".repeat(60));
    
    if (!progress.allPagesScraped) {
        console.log(`\n📌 في المرة القادمة:`);
        console.log(`   ستستمر المرحلة 1`);
        console.log(`   الصفحة: ${progress.currentPage === 1 ? "Home" : progress.currentPage}`);
        console.log(`   الملف: ${progress.currentFileName}`);
    } else {
        console.log(`\n📌 النظام الآن في الوضع الثابت:`);
        console.log(`   كل تشغيل سيحدث Home.json`);
        console.log(`   وسيضيف الأفلام الجديدة للملفات المرتبة`);
    }
    console.log("=".repeat(60));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    // حفظ الخطأ
    const errorReport = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        lastPage: new ProgressTracker().currentPage
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
