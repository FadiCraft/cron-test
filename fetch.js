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
        stats: "stats.json",
        errors: "errors.json"
    },
    
    batchSize: 250,
    requestDelay: 1500,
    timeout: 45000,
    maxRetries: 3,
    
    isFirstRun: false,
    scanOnlyPage2: true,
    maxPagesFirstRun: 100,
    maxErrorsPerRun: 50,
    
    logLevel: "detailed", // "detailed", "normal", "minimal"
};

// ==================== نظام التسجيل ====================
class Logger {
    static log(message, level = "info") {
        const timestamp = new Date().toISOString();
        const prefix = {
            info: "ℹ️",
            success: "✅",
            warning: "⚠️",
            error: "❌",
            debug: "🐛"
        }[level] || "📝";
        
        if (CONFIG.logLevel === "minimal" && level === "debug") return;
        
        console.log(`${prefix} [${timestamp}] ${message}`);
    }
    
    static error(message, error = null) {
        const timestamp = new Date().toISOString();
        console.error(`❌ [${timestamp}] ${message}`);
        if (error) {
            console.error(`   ↳ ${error.message}`);
            if (CONFIG.logLevel === "detailed") {
                console.error(error.stack);
            }
        }
    }
}

// ==================== نظام إدارة الأخطاء ====================
class ErrorManager {
    static errorsFile = path.join(CONFIG.outputDir, CONFIG.files.errors);
    
    static init() {
        if (!fs.existsSync(this.errorsFile)) {
            const initial = {
                errors: [],
                stats: {
                    totalErrors: 0,
                    lastReset: new Date().toISOString(),
                    byType: {}
                }
            };
            fs.writeFileSync(this.errorsFile, JSON.stringify(initial, null, 2));
        }
    }
    
    static addError(type, message, details = {}) {
        try {
            const data = JSON.parse(fs.readFileSync(this.errorsFile, 'utf8'));
            
            const error = {
                id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: type,
                message: message,
                details: details,
                timestamp: new Date().toISOString(),
                resolved: false
            };
            
            data.errors.push(error);
            
            // تحديث الإحصائيات
            data.stats.totalErrors++;
            data.stats.byType[type] = (data.stats.byType[type] || 0) + 1;
            
            // الحفاظ على 100 خطأ فقط كحد أقصى
            if (data.errors.length > 100) {
                data.errors = data.errors.slice(-100);
            }
            
            fs.writeFileSync(this.errorsFile, JSON.stringify(data, null, 2));
            Logger.warning(`سجلت خطأ: ${type} - ${message}`);
            
        } catch (error) {
            console.error("❌ فشل تسجيل الخطأ:", error.message);
        }
    }
    
    static getRecentErrors(limit = 10) {
        try {
            const data = JSON.parse(fs.readFileSync(this.errorsFile, 'utf8'));
            return data.errors.slice(-limit);
        } catch {
            return [];
        }
    }
}

// ==================== نظام المحاولات المتكررة ====================
class RetryManager {
    static async withRetry(operation, operationName, maxRetries = CONFIG.maxRetries) {
        let lastError = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                Logger.debug(`${operationName} - المحاولة ${attempt}/${maxRetries}`);
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    Logger.error(`فشل ${operationName} بعد ${maxRetries} محاولات`, error);
                    throw error;
                }
                
                const delay = attempt * 2000; // تأخير متزايد
                Logger.warning(`فشلت المحاولة ${attempt} لـ ${operationName}. إعادة المحاولة بعد ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }
}

// ==================== الدوال المساعدة ====================

function initSystem() {
    Logger.log("تهيئة النظام...");
    
    // إنشاء مجلد الإخراج
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
        Logger.success(`تم إنشاء المجلد: ${CONFIG.outputDir}`);
    }
    
    // تهيئة ملف الأخطاء
    ErrorManager.init();
    
    const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
    
    // تحديد إذا كان التشغيل الأول
    if (!fs.existsSync(indexFile)) {
        CONFIG.isFirstRun = true;
        Logger.log("🆕 هذا هو التشغيل الأول للنظام");
    } else {
        try {
            const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            CONFIG.isFirstRun = Object.keys(data.movies || {}).length === 0;
        } catch (error) {
            CONFIG.isFirstRun = true;
            ErrorManager.addError("index_load", "فشل تحميل الفهرس", { error: error.message });
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
            Logger.error(`خطأ في تحميل الفهرس: ${error.message}`);
            ErrorManager.addError("index_corrupt", "فهرس تالف", { file: indexFile, error: error.message });
            
            // إنشاء فهرس جديد في حالة التلف
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

function loadStats() {
    const statsFile = path.join(CONFIG.outputDir, CONFIG.files.stats);
    
    if (fs.existsSync(statsFile)) {
        try {
            return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
        } catch (error) {
            Logger.warning(`خطأ في تحميل الإحصائيات: ${error.message}`);
            ErrorManager.addError("stats_load", "فشل تحميل الإحصائيات", { error: error.message });
        }
    }
    
    return {
        totalMovies: 0,
        totalFiles: 0,
        firstRunDate: new Date().toISOString(),
        lastRunDate: null,
        runs: [],
        errorsCount: 0,
        successRate: 100
    };
}

function getLastTopCinemaFile() {
    try {
        const files = fs.readdirSync(CONFIG.outputDir);
        const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
        
        if (topCinemaFiles.length === 0) {
            Logger.debug("لا توجد ملفات TopCinema، سيتم إنشاء ملف جديد");
            return {
                filename: "TopCinema1.json",
                number: 1,
                movieCount: 0,
                isFull: false,
                path: path.join(CONFIG.outputDir, "TopCinema1.json")
            };
        }
        
        // فرز الملفات رقمياً
        topCinemaFiles.sort((a, b) => {
            const numA = parseInt(a.match(/TopCinema(\d+)\.json/)?.[1] || 0);
            const numB = parseInt(b.match(/TopCinema(\d+)\.json/)?.[1] || 0);
            return numB - numA; // ترتيب تنازلي
        });
        
        const lastFile = topCinemaFiles[0];
        const filePath = path.join(CONFIG.outputDir, lastFile);
        
        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const movieCount = content.movies?.length || 0;
            
            return {
                filename: lastFile,
                number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
                movieCount: movieCount,
                isFull: movieCount >= CONFIG.batchSize,
                path: filePath
            };
            
        } catch (error) {
            Logger.error(`خطأ في قراءة ملف ${lastFile}: ${error.message}`);
            ErrorManager.addError("file_corrupt", "ملف تالف", { 
                file: lastFile, 
                error: error.message 
            });
            
            return {
                filename: lastFile,
                number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
                movieCount: 0,
                isFull: false,
                path: filePath
            };
        }
        
    } catch (error) {
        Logger.error(`خطأ في الحصول على ملف TopCinema: ${error.message}`);
        ErrorManager.addError("file_system", "خطأ نظام الملفات", { error: error.message });
        
        return {
            filename: "TopCinema1.json",
            number: 1,
            movieCount: 0,
            isFull: false,
            path: path.join(CONFIG.outputDir, "TopCinema1.json")
        };
    }
}

function createNewTopCinemaFile(fileNumber) {
    const newFilename = `TopCinema${fileNumber}.json`;
    const newFilePath = path.join(CONFIG.outputDir, newFilename);
    
    try {
        const structure = {
            fileNumber: fileNumber,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            movies: [],
            totalMovies: 0,
            metadata: {
                batchSize: CONFIG.batchSize,
                source: "topcinema.rip",
                encoding: "UTF-8"
            }
        };
        
        fs.writeFileSync(newFilePath, JSON.stringify(structure, null, 2));
        Logger.success(`تم إنشاء ملف جديد: ${newFilename}`);
        
        return {
            filename: newFilename,
            number: fileNumber,
            movieCount: 0,
            isFull: false,
            path: newFilePath
        };
        
    } catch (error) {
        Logger.error(`فشل إنشاء ملف جديد: ${error.message}`);
        ErrorManager.addError("file_creation", "فشل إنشاء ملف", {
            fileNumber: fileNumber,
            error: error.message
        });
        
        throw error; // إعادة رمي الخطأ للمعالجة
    }
}

function addMovieToTopCinemaFile(movieData, topCinemaInfo) {
    try {
        const filePath = topCinemaInfo.path;
        let content = { movies: [] };
        
        if (fs.existsSync(filePath)) {
            content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        
        // التحقق من التكرار
        const exists = content.movies.some(m => m.id === movieData.id);
        if (exists) {
            Logger.debug(`الفيلم ${movieData.id} موجود مسبقاً في ${topCinemaInfo.filename}`);
            return false;
        }
        
        // إضافة الفيلم
        content.movies.push(movieData);
        content.lastUpdated = new Date().toISOString();
        content.totalMovies = content.movies.length;
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        Logger.debug(`أضيف الفيلم ${movieData.id} إلى ${topCinemaInfo.filename}`);
        return true;
        
    } catch (error) {
        Logger.error(`خطأ في إضافة الفيلم للملف: ${error.message}`);
        ErrorManager.addError("movie_add", "فشل إضافة فيلم", {
            movieId: movieData?.id,
            file: topCinemaInfo.filename,
            error: error.message
        });
        return false;
    }
}

// ==================== استخراج ID من الرابط ====================
function extractMovieId(shortLink, movieUrl) {
    try {
        if (!shortLink && !movieUrl) {
            return `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // المحاولة الأولى: استخراج من الرابط المختصر
        if (shortLink) {
            const shortLinkPatterns = [
                /p=(\d+)/,
                /id=(\d+)/,
                /movie\/(\d+)/,
                /(\d+)\.html/
            ];
            
            for (const pattern of shortLinkPatterns) {
                const match = shortLink.match(pattern);
                if (match) return match[1];
            }
        }
        
        // المحاولة الثانية: استخراج من رابط الفيلم
        if (movieUrl) {
            const urlPatterns = [
                /\/(\d+)\/?$/,
                /-(\d+)\/?$/,
                /\/(\d+)-/,
                /movie\/(\d+)/,
                /film\/(\d+)/,
                /\?id=(\d+)/
            ];
            
            for (const pattern of urlPatterns) {
                const match = movieUrl.match(pattern);
                if (match) return match[1];
            }
        }
        
        // المحاولة الثالثة: استخراج من العنوان لو وجد
        return `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
    } catch (error) {
        Logger.warning(`خطأ في استخراج ID: ${error.message}`);
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// ==================== استخراج سيرفرات المشاهدة ====================
async function fetchWatchServers(watchUrl) {
    Logger.debug(`جلب سيرفرات المشاهدة من: ${watchUrl}`);
    
    if (!watchUrl) {
        Logger.warning("رابط المشاهدة غير متوفر");
        return [];
    }
    
    try {
        const html = await fetchWithTimeout(watchUrl);
        if (!html) {
            Logger.warning("فشل جلب صفحة المشاهدة");
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const watchServers = [];
        
        // 1. البحث في iframes
        const iframes = doc.querySelectorAll('iframe[src*="embed"], iframe[src*="player"]');
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: 'Iframe Embed',
                    source: 'iframe'
                });
            }
        });
        
        // 2. البحث في عناصر video
        const videos = doc.querySelectorAll('video source');
        videos.forEach(video => {
            const src = video.getAttribute('src');
            if (src) {
                watchServers.push({
                    type: 'direct',
                    url: src,
                    quality: video.getAttribute('label') || 'متوسط',
                    server: 'Direct Video',
                    source: 'video'
                });
            }
        });
        
        // 3. البحث في روابط JavaScript
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (content) {
                const patterns = [
                    /"(https?:\/\/[^"]*embed[^"]*)"/g,
                    /'(https?:\/\/[^']*embed[^']*)'/g,
                    /src=["']([^"']*\.(mp4|m3u8|webm)[^"']*)["']/gi
                ];
                
                patterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const url = match.replace(/["']/g, '');
                            watchServers.push({
                                type: 'js_embed',
                                url: url,
                                quality: 'غير محدد',
                                server: 'JavaScript Embed',
                                source: 'script'
                            });
                        });
                    }
                });
            }
        });
        
        // 4. البحث في data attributes
        const elementsWithData = doc.querySelectorAll('[data-src], [data-url]');
        elementsWithData.forEach(el => {
            const src = el.getAttribute('data-src') || el.getAttribute('data-url');
            if (src && src.includes('http')) {
                watchServers.push({
                    type: 'data_src',
                    url: src,
                    quality: 'غير محدد',
                    server: 'Data Source',
                    source: 'data-attribute'
                });
            }
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        
        watchServers.forEach(server => {
            if (server.url && !seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        Logger.debug(`عثر على ${uniqueServers.length} سيرفر مشاهدة`);
        return uniqueServers;
        
    } catch (error) {
        Logger.error(`خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        ErrorManager.addError("watch_servers", "فشل استخراج سيرفرات المشاهدة", {
            url: watchUrl,
            error: error.message
        });
        return [];
    }
}

// ==================== استخراج سيرفرات التحميل ====================
async function fetchDownloadServers(downloadUrl) {
    Logger.debug(`جلب سيرفرات التحميل من: ${downloadUrl}`);
    
    if (!downloadUrl) {
        Logger.warning("رابط التحميل غير متوفر");
        return [];
    }
    
    try {
        const html = await fetchWithTimeout(downloadUrl);
        if (!html) {
            Logger.warning("فشل جلب صفحة التحميل");
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const downloadServers = [];
        
        // 1. سيرفرات Pro
        const proServers = doc.querySelectorAll('.proServer, .pro-server, .premium-server');
        proServers.forEach(server => {
            const links = server.querySelectorAll('a[href*="download"], a[href*="file"]');
            links.forEach(link => {
                const url = link.getAttribute('href');
                const text = link.textContent.trim() || 'Pro Server';
                
                if (url && url.includes('http')) {
                    downloadServers.push({
                        server: 'Pro',
                        url: url,
                        quality: text,
                        type: 'pro',
                        source: 'pro_server'
                    });
                }
            });
        });
        
        // 2. جميع روابط التحميل
        const allDownloadLinks = doc.querySelectorAll(
            'a[href*="download"], a[href*=".mp4"], a[href*=".mkv"], a[href*=".avi"], a.download'
        );
        
        allDownloadLinks.forEach(link => {
            const url = link.getAttribute('href');
            const text = link.textContent.trim() || link.getAttribute('title') || 'Download Link';
            
            if (url && url.includes('http') && !link.closest('.proServer')) {
                // محاولة تحديد الجودة من النص
                let quality = 'غير محدد';
                if (text.includes('1080')) quality = '1080p';
                else if (text.includes('720')) quality = '720p';
                else if (text.includes('480')) quality = '480p';
                else if (text.includes('HD')) quality = 'HD';
                
                downloadServers.push({
                    server: 'Direct',
                    url: url,
                    quality: quality,
                    type: 'direct',
                    source: 'direct_link'
                });
            }
        });
        
        // 3. البحث في الجداول
        const tables = doc.querySelectorAll('table');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    const serverCell = cells[0].textContent.trim();
                    const linkCell = cells[1].querySelector('a');
                    
                    if (linkCell) {
                        const url = linkCell.getAttribute('href');
                        if (url && url.includes('http')) {
                            downloadServers.push({
                                server: serverCell || 'Table Server',
                                url: url,
                                quality: cells[2]?.textContent?.trim() || 'غير محدد',
                                type: 'table',
                                source: 'table'
                            });
                        }
                    }
                }
            });
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        
        downloadServers.forEach(server => {
            if (server.url && !seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        Logger.debug(`عثر على ${uniqueServers.length} سيرفر تحميل`);
        return uniqueServers;
        
    } catch (error) {
        Logger.error(`خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        ErrorManager.addError("download_servers", "فشل استخراج سيرفرات التحميل", {
            url: downloadUrl,
            error: error.message
        });
        return [];
    }
}

// ==================== استخراج تفاصيل الفيلم الكاملة ====================
async function fetchMovieDetails(movie) {
    const movieId = movie.id || `temp_${movie.position}_${movie.page}`;
    Logger.log(`🎬 معالجة: ${movie.title.substring(0, 50)}...`);
    
    try {
        const html = await RetryManager.withRetry(
            () => fetchWithTimeout(movie.url),
            `جلب صفحة الفيلم ${movieId}`
        );
        
        if (!html) {
            Logger.warning(`فشل جلب صفحة الفيلم: ${movie.url}`);
            ErrorManager.addError("movie_fetch", "فشل جلب صفحة الفيلم", {
                movieTitle: movie.title,
                url: movie.url,
                id: movieId
            });
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. استخراج ID
        const shortLinkInput = doc.querySelector('#shortlink, .shortlink, input[value*="p="]');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const extractedId = extractMovieId(shortLink, movie.url);
        
        if (!extractedId || extractedId.includes('error_') || extractedId.includes('unknown_')) {
            Logger.warning(`ID غير صالح للفيلم: ${movie.title}`);
            ErrorManager.addError("invalid_id", "ID غير صالح", {
                movieTitle: movie.title,
                shortLink: shortLink,
                url: movie.url,
                extractedId: extractedId
            });
        }
        
        // 2. البيانات الأساسية
        const title = doc.querySelector(".post-title, h1.title, .movie-title")?.textContent?.trim() || 
                      movie.title || "غير معروف";
        
        const image = doc.querySelector(".image img, .poster img, .movie-poster img")?.src ||
                     doc.querySelector('meta[property="og:image"]')?.content ||
                     doc.querySelector('meta[name="twitter:image"]')?.content;
        
        const imdbRating = doc.querySelector(".imdbR, .imdb-rating, .rating")?.textContent?.trim() ||
                          doc.querySelector('span[itemprop="ratingValue"]')?.textContent?.trim();
        
        // 3. القصة
        let story = "غير متوفر";
        const storySelectors = [
            ".story p",
            ".description",
            ".plot",
            ".synopsis",
            '[itemprop="description"]',
            '.movie-desc'
        ];
        
        for (const selector of storySelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                story = element.textContent.trim();
                if (story.length > 50) break;
            }
        }
        
        // 4. روابط المشاهدة والتحميل
        const watchLink = doc.querySelector('a.watch, a[href*="watch"], .watch-btn')?.getAttribute('href');
        const downloadLink = doc.querySelector('a.download, a[href*="download"], .download-btn')?.getAttribute('href');
        
        // 5. التفاصيل - بنية مرنة
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
        
        // محاولة استخراج التفاصيل بطرق مختلفة
        try {
            // الطريقة 1: القوائم المعتادة
            const detailItems = doc.querySelectorAll(".RightTaxContent li, .movie-details li, .details li");
            
            detailItems.forEach(item => {
                try {
                    const text = item.textContent.trim();
                    if (!text) return;
                    
                    // تقسيم النص إلى تسمية وقيمة
                    const parts = text.split(':');
                    if (parts.length >= 2) {
                        const label = parts[0].trim().toLowerCase();
                        const value = parts.slice(1).join(':').trim();
                        
                        if (label.includes('قسم') || label.includes('category')) {
                            details.category = value.split(',').map(v => v.trim());
                        } else if (label.includes('نوع') || label.includes('genre')) {
                            details.genres = value.split(',').map(v => v.trim());
                        } else if (label.includes('جودة') || label.includes('quality')) {
                            details.quality = value.split(',').map(v => v.trim());
                        } else if (label.includes('مدة') || label.includes('duration')) {
                            details.duration = value;
                        } else if (label.includes('تاريخ') || label.includes('year')) {
                            details.releaseYear = value.split(',').map(v => v.trim());
                        } else if (label.includes('لغة') || label.includes('language')) {
                            details.language = value.split(',').map(v => v.trim());
                        } else if (label.includes('دولة') || label.includes('country')) {
                            details.country = value.split(',').map(v => v.trim());
                        } else if (label.includes('مخرج') || label.includes('director')) {
                            details.directors = value.split(',').map(v => v.trim());
                        }
                    }
                } catch (error) {
                    // تجاهل أخطاء المعالجة الفردية
                }
            });
            
            // الطريقة 2: الروابط في العناصر
            const categoryLinks = doc.querySelectorAll('a[href*="/category/"], a[href*="/genre/"]');
            categoryLinks.forEach(link => {
                const text = link.textContent.trim();
                if (text && !details.genres.includes(text)) {
                    details.genres.push(text);
                }
            });
            
        } catch (error) {
            Logger.debug(`خطأ في استخراج التفاصيل: ${error.message}`);
        }
        
        // 6. جلب سيرفرات المشاهدة والتحميل
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            try {
                watchServers = await fetchWatchServers(watchLink);
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (error) {
                Logger.warning(`فشل جلب سيرفرات المشاهدة: ${error.message}`);
            }
        }
        
        if (downloadLink) {
            try {
                downloadServers = await fetchDownloadServers(downloadLink);
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (error) {
                Logger.warning(`فشل جلب سيرفرات التحميل: ${error.message}`);
            }
        }
        
        // 7. تجميع البيانات النهائية
        const movieData = {
            id: extractedId || movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating || "غير متوفر",
            story: story.substring(0, 1000), // تقليل الطول
            details: details,
            watchServers: watchServers.slice(0, 10), // الحد الأقصى 10 سيرفرات
            downloadServers: downloadServers.slice(0, 10), // الحد الأقصى 10 سيرفرات
            page: movie.page,
            position: movie.position,
            discoveredAt: movie.discoveredAt,
            scrapedAt: new Date().toISOString(),
            metadata: {
                processingTime: new Date().toISOString(),
                hasImage: !!image,
                hasWatchServers: watchServers.length > 0,
                hasDownloadServers: downloadServers.length > 0,
                status: "success"
            }
        };
        
        Logger.success(`تم استخراج: ${title.substring(0, 40)}...`);
        return movieData;
        
    } catch (error) {
        Logger.error(`خطأ جسيم في معالجة الفيلم: ${movie.title}`, error);
        ErrorManager.addError("movie_processing", "فشل معالجة الفيلم", {
            movieTitle: movie.title,
            url: movie.url,
            error: error.message,
            stack: error.stack
        });
        
        // إرجاع بيانات جزئية في حالة الفشل
        return {
            id: `failed_${Date.now()}_${movie.position}`,
            title: movie.title,
            url: movie.url,
            page: movie.page,
            position: movie.position,
            discoveredAt: movie.discoveredAt,
            scrapedAt: new Date().toISOString(),
            error: error.message,
            status: "failed"
        };
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    Logger.log(`📖 جلب الصفحة ${pageNum}: ${url}`);
    
    try {
        const html = await RetryManager.withRetry(
            () => fetchWithTimeout(url),
            `جلب الصفحة ${pageNum}`
        );
        
        if (!html) {
            Logger.error(`فشل جلب الصفحة ${pageNum}`);
            ErrorManager.addError("page_fetch", "فشل جلب الصفحة", { page: pageNum, url: url });
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // محاولة عدة أنماط لعناصر الأفلام
        const selectors = [
            '.Small--Box a',
            '.movie-item a',
            '.film-item a',
            'article a',
            '.post a'
        ];
        
        let movieElements = [];
        for (const selector of selectors) {
            movieElements = doc.querySelectorAll(selector);
            if (movieElements.length > 0) {
                Logger.debug(`وجد ${movieElements.length} فيلم باستخدام ${selector}`);
                break;
            }
        }
        
        if (movieElements.length === 0) {
            Logger.warning(`لم يتم العثور على أفلام في الصفحة ${pageNum}`);
            return [];
        }
        
        Logger.success(`عثر على ${movieElements.length} فيلم في الصفحة ${pageNum}`);
        
        movieElements.forEach((element, i) => {
            try {
                const movieUrl = element.href;
                
                if (movieUrl && movieUrl.includes('topcinema.rip')) {
                    const title = element.querySelector('.title, h3, .film-title')?.textContent?.trim() || 
                                 element.textContent?.trim() || 
                                 `فيلم ${i + 1} صفحة ${pageNum}`;
                    
                    movies.push({
                        id: `temp_${pageNum}_${i}`,
                        title: title.substring(0, 200), // تقليل الطول
                        url: movieUrl,
                        page: pageNum,
                        position: i + 1,
                        discoveredAt: new Date().toISOString()
                    });
                }
            } catch (error) {
                Logger.debug(`خطأ في معالجة فيلم ${i}: ${error.message}`);
            }
        });
        
        return movies;
        
    } catch (error) {
        Logger.error(`خطأ في استخراج الأفلام من الصفحة ${pageNum}: ${error.message}`);
        ErrorManager.addError("page_processing", "فشل معالجة الصفحة", {
            page: pageNum,
            url: url,
            error: error.message
        });
        return [];
    }
}

// ==================== fetch مع timeout وإعادة المحاولة ====================
async function fetchWithTimeout(url, timeout = CONFIG.timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            referrerPolicy: 'no-referrer'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            Logger.warning(`استجابة غير ناجحة: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('text/html')) {
            Logger.warning(`نوع محتوى غير متوقع: ${contentType}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            Logger.warning(`⏱️ انتهى الوقت للطلب: ${url}`);
        } else {
            Logger.error(`خطأ في fetch: ${error.message}`);
        }
        return null;
    }
}

// ==================== حفظ البيانات ====================
function saveToFile(filename, data) {
    try {
        const filePath = path.join(CONFIG.outputDir, filename);
        
        // تأكد من أن البيانات قابلة للتسلسل
        const serializableData = JSON.parse(JSON.stringify(data));
        
        fs.writeFileSync(filePath, JSON.stringify(serializableData, null, 2));
        Logger.debug(`تم حفظ ${filename}`);
        return filePath;
        
    } catch (error) {
        Logger.error(`خطأ في حفظ الملف ${filename}: ${error.message}`);
        ErrorManager.addError("file_save", "فشل حفظ الملف", {
            filename: filename,
            error: error.message
        });
        return null;
    }
}

function saveSystemData(system) {
    try {
        // تحديث الفهرس
        if (system.index) {
            system.index.lastUpdated = new Date().toISOString();
            saveToFile(CONFIG.files.index, system.index);
        }
        
        // تحديث الإحصائيات
        if (system.stats) {
            system.stats.lastRunDate = new Date().toISOString();
            system.stats.runs = system.stats.runs || [];
            
            const runStats = {
                date: new Date().toISOString(),
                newMovies: system.newMoviesCount || 0,
                updatedMovies: system.updatedMoviesCount || 0,
                totalMovies: system.stats.totalMovies || 0,
                errors: system.errorCount || 0,
                duration: system.runDuration || 0
            };
            
            system.stats.runs.push(runStats);
            
            // الحفاظ على آخر 50 عملية فقط
            if (system.stats.runs.length > 50) {
                system.stats.runs = system.stats.runs.slice(-50);
            }
            
            saveToFile(CONFIG.files.stats, system.stats);
        }
        
        Logger.debug("تم حفظ بيانات النظام");
        
    } catch (error) {
        Logger.error(`خطأ في حفظ بيانات النظام: ${error.message}`);
    }
}

// ==================== تحديث الفهرس ====================
function updateIndex(movie, topCinemaFile, system) {
    try {
        const now = new Date().toISOString();
        const movieId = movie.id;
        
        if (!movieId) {
            Logger.warning("لا يمكن تحديث الفهرس: ID غير متوفر");
            return 'skipped';
        }
        
        if (!system.index.movies[movieId]) {
            // فيلم جديد
            system.index.movies[movieId] = {
                title: movie.title,
                image: movie.image,
                url: movie.url,
                firstSeen: now,
                lastSeen: now,
                storedIn: topCinemaFile.filename,
                lastPageSeen: movie.page,
                discoveryPage: movie.page,
                status: movie.status || 'success'
            };
            
            system.stats.totalMovies = (system.stats.totalMovies || 0) + 1;
            return 'new';
            
        } else {
            // تحديث فيلم موجود
            system.index.movies[movieId].lastSeen = now;
            system.index.movies[movieId].lastPageSeen = movie.page;
            
            if (system.index.movies[movieId].storedIn !== topCinemaFile.filename) {
                system.index.movies[movieId].storedIn = topCinemaFile.filename;
            }
            
            return 'updated';
        }
        
    } catch (error) {
        Logger.error(`خطأ في تحديث الفهرس: ${error.message}`);
        return 'error';
    }
}

// ==================== التشغيل الأول ====================
async function firstRun(system) {
    const startTime = Date.now();
    Logger.log("🚀 بدء التشغيل الأول");
    console.log("=".repeat(60));
    
    let currentPage = 1;
    let totalMoviesCollected = 0;
    let errorCount = 0;
    let topCinemaFile = system.lastTopCinemaFile;
    
    system.newMoviesCount = 0;
    system.updatedMoviesCount = 0;
    system.errorCount = 0;
    
    while (currentPage <= CONFIG.maxPagesFirstRun && errorCount < CONFIG.maxErrorsPerRun) {
        Logger.log(`\n📄 الصفحة ${currentPage}/${CONFIG.maxPagesFirstRun}`);
        
        const movies = await fetchMoviesFromPage(currentPage);
        
        if (movies.length === 0) {
            Logger.warning(`لم يتم العثور على أفلام في الصفحة ${currentPage}`);
            if (currentPage > 5) break; // توقف إذا كانت عدة صفحات فارغة
        }
        
        // الصفحة الأولى -> Home.json
        if (currentPage === 1 && movies.length > 0) {
            try {
                const homeData = {
                    page: 1,
                    url: "https://topcinema.rip/movies/",
                    scrapedAt: new Date().toISOString(),
                    totalMovies: movies.length,
                    movies: movies.slice(0, 50) // حفظ أول 50 فيلم فقط للصفحة الأولى
                };
                saveToFile(CONFIG.files.home, homeData);
                Logger.success(`حفظ الصفحة الأولى في Home.json (${movies.length} فيلم)`);
            } catch (error) {
                Logger.error(`خطأ في حفظ Home.json: ${error.message}`);
            }
        }
        
        // استخراج تفاصيل كل الأفلام
        for (let i = 0; i < movies.length; i++) {
            const movie = movies[i];
            
            if (errorCount >= CONFIG.maxErrorsPerRun) {
                Logger.error(`تجاوز الحد الأقصى للأخطاء (${CONFIG.maxErrorsPerRun})`);
                break;
            }
            
            // تخطي إذا كان الملف ممتلئاً
            if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                try {
                    topCinemaFile = createNewTopCinemaFile(topCinemaFile.number + 1);
                    system.stats.totalFiles = (system.stats.totalFiles || 0) + 1;
                } catch (error) {
                    Logger.error(`فشل إنشاء ملف جديد: ${error.message}`);
                    errorCount++;
                    continue;
                }
            }
            
            // تخطي الأفلام الموجودة
            if (system.index.movies[movie.id]) {
                Logger.debug(`تخطي ${movie.id} - موجود مسبقاً`);
                continue;
            }
            
            try {
                const movieDetails = await fetchMovieDetails(movie);
                
                if (movieDetails) {
                    if (movieDetails.status === 'failed') {
                        errorCount++;
                        Logger.warning(`فشل استخراج الفيلم: ${movie.title}`);
                        continue;
                    }
                    
                    const added = addMovieToTopCinemaFile(movieDetails, topCinemaFile);
                    if (added) {
                        updateIndex(movieDetails, topCinemaFile, system);
                        topCinemaFile.movieCount++;
                        totalMoviesCollected++;
                        system.newMoviesCount++;
                        
                        Logger.success(`${i + 1}/${movies.length}: ${movieDetails.title.substring(0, 30)}...`);
                        Logger.debug(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0} سيرفر`);
                        Logger.debug(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0} سيرفر`);
                    }
                } else {
                    errorCount++;
                    Logger.warning(`لم يتم استخراج تفاصيل الفيلم: ${movie.title}`);
                }
                
            } catch (error) {
                errorCount++;
                Logger.error(`خطأ في معالجة الفيلم ${movie.title}: ${error.message}`);
                ErrorManager.addError("movie_fatal", "خطأ جسيم في الفيلم", {
                    movieTitle: movie.title,
                    url: movie.url,
                    error: error.message
                });
            }
            
            // تأخير بين الأفلام
            await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
        }
        
        // تأخير بين الصفحات
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay * 2));
        currentPage++;
        
        // حفظ مؤقت كل 5 صفحات
        if (currentPage % 5 === 0) {
            Logger.log(`💾 حفظ مؤقت بعد الصفحة ${currentPage - 1}`);
            saveSystemData(system);
        }
        
        // كسر الحلقة إذا تجاوزت الأخطاء الحد
        if (errorCount >= CONFIG.maxErrorsPerRun) {
            Logger.error(`تم إيقاف التشغيل بسبب كثرة الأخطاء: ${errorCount}`);
            break;
        }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    system.runDuration = duration;
    
    console.log("\n" + "=".repeat(60));
    Logger.success(`✅ التشغيل الأول مكتمل!`);
    console.log("📊 النتائج:");
    console.log(`   🎬 أفلام مجمعة: ${totalMoviesCollected}`);
    console.log(`   📁 الملفات: ${system.stats.totalFiles || 0} ملف TopCinema`);
    console.log(`   ⚠️  أخطاء: ${errorCount}`);
    console.log(`   ⏱️  الوقت المستغرق: ${duration} ثانية`);
    
    saveSystemData(system);
    return totalMoviesCollected;
}

// ==================== التحديث اليومي ====================
async function dailyUpdate(system) {
    const startTime = Date.now();
    Logger.log("🔄 بدء التحديث اليومي");
    console.log("=".repeat(60));
    
    system.newMoviesCount = 0;
    system.updatedMoviesCount = 0;
    system.errorCount = 0;
    let topCinemaFile = system.lastTopCinemaFile;
    
    // 1. تحديث الصفحة الأولى
    Logger.log("\n1️⃣ تحديث الصفحة الأولى...");
    const page1Movies = await fetchMoviesFromPage(1);
    
    if (page1Movies.length > 0) {
        try {
            const homeData = {
                page: 1,
                url: "https://topcinema.rip/movies/",
                scrapedAt: new Date().toISOString(),
                totalMovies: page1Movies.length,
                movies: page1Movies.slice(0, 50)
            };
            saveToFile(CONFIG.files.home, homeData);
            Logger.success(`تم تحديث Home.json بـ ${page1Movies.length} فيلم`);
        } catch (error) {
            Logger.error(`خطأ في تحديث Home.json: ${error.message}`);
            system.errorCount++;
        }
    }
    
    // 2. فحص الصفحة الثانية
    Logger.log("\n2️⃣ فحص الصفحة الثانية...");
    const page2Movies = await fetchMoviesFromPage(2);
    Logger.info(`الصفحة الثانية تحتوي على ${page2Movies.length} فيلم`);
    
    let newMoviesFound = 0;
    
    for (let i = 0; i < page2Movies.length; i++) {
        const movie = page2Movies[i];
        
        if (system.errorCount >= CONFIG.maxErrorsPerRun) {
            Logger.error(`تجاوز الحد الأقصى للأخطاء (${CONFIG.maxErrorsPerRun})`);
            break;
        }
        
        // إنشاء ملف جديد إذا كان الملف الحالي ممتلئاً
        if (topCinemaFile.movieCount >= CONFIG.batchSize) {
            try {
                topCinemaFile = createNewTopCinemaFile(topCinemaFile.number + 1);
                system.stats.totalFiles = (system.stats.totalFiles || 0) + 1;
            } catch (error) {
                Logger.error(`فشل إنشاء ملف جديد: ${error.message}`);
                system.errorCount++;
                continue;
            }
        }
        
        // استخراج ID للفيلم
        const tempId = extractMovieId(null, movie.url);
        movie.id = tempId;
        
        if (!system.index.movies[tempId]) {
            // فيلم جديد
            Logger.log(`   🎯 ${i + 1}/${page2Movies.length}: فيلم جديد`);
            
            try {
                const movieDetails = await fetchMovieDetails(movie);
                
                if (movieDetails && movieDetails.status !== 'failed') {
                    const added = addMovieToTopCinemaFile(movieDetails, topCinemaFile);
                    
                    if (added) {
                        updateIndex(movieDetails, topCinemaFile, system);
                        topCinemaFile.movieCount++;
                        newMoviesFound++;
                        system.newMoviesCount++;
                        
                        Logger.success(`     ✅ ${movieDetails.title.substring(0, 30)}...`);
                        Logger.debug(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0} سيرفر`);
                        Logger.debug(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0} سيرفر`);
                    }
                } else {
                    system.errorCount++;
                    Logger.warning(`     ❌ فشل استخراج الفيلم الجديد`);
                }
                
            } catch (error) {
                system.errorCount++;
                Logger.error(`     ❌ خطأ في استخراج الفيلم: ${error.message}`);
            }
            
        } else {
            // فيلم موجود
            const updateResult = updateIndex(movie, topCinemaFile, system);
            if (updateResult === 'updated') {
                system.updatedMoviesCount++;
                Logger.debug(`     🔄 تحديث: ${movie.title.substring(0, 30)}...`);
            }
        }
        
        // تأخير بين الأفلام
        await new Promise(resolve => setTimeout(resolve, CONFIG.requestDelay));
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    system.runDuration = duration;
    
    console.log("\n" + "=".repeat(60));
    Logger.success("📊 نتائج التحديث:");
    console.log(`   🆕 أفلام جديدة: ${newMoviesFound}`);
    console.log(`   🔄 أفلام محدثة: ${system.updatedMoviesCount}`);
    console.log(`   ⚠️  أخطاء: ${system.errorCount}`);
    console.log(`   📁 الملف النشط: ${topCinemaFile.filename} (${topCinemaFile.movieCount}/${CONFIG.batchSize})`);
    console.log(`   ⏱️  الوقت المستغرق: ${duration} ثانية`);
    
    saveSystemData(system);
    return { 
        newMovies: newMoviesFound, 
        updatedMovies: system.updatedMoviesCount,
        errors: system.errorCount
    };
}

// ==================== إظهار ملخص الأخطاء ====================
function showErrorSummary() {
    const recentErrors = ErrorManager.getRecentErrors(5);
    
    if (recentErrors.length > 0) {
        console.log("\n" + "=".repeat(60));
        Logger.warning("ملخص الأخطاء الأخيرة:");
        recentErrors.forEach((error, index) => {
            console.log(`   ${index + 1}. [${error.type}] ${error.message}`);
            if (CONFIG.logLevel === "detailed") {
                console.log(`      ↳ ${JSON.stringify(error.details)}`);
            }
        });
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("\n" + "=".repeat(60));
    Logger.log("🎬 بدء نظام جمع الأفلام");
    Logger.log(`الإصدار: 2.0.0 | وضع التسجيل: ${CONFIG.logLevel}`);
    console.log("=".repeat(60));
    
    try {
        const system = initSystem();
        
        if (CONFIG.isFirstRun) {
            Logger.log("⚡ وضع التشغيل الأول");
            await firstRun(system);
        } else {
            Logger.log("⚡ وضع التحديث اليومي");
            await dailyUpdate(system);
        }
        
        // إظهار ملخص الأخطاء
        showErrorSummary();
        
        console.log("\n" + "=".repeat(60));
        Logger.success("🎉 اكتمل التشغيل بنجاح!");
        console.log("=".repeat(60));
        
    } catch (error) {
        console.log("\n" + "=".repeat(60));
        Logger.error("💥 خطأ جسيم في النظام:", error);
        console.log("=".repeat(60));
        
        ErrorManager.addError("system_fatal", "خطأ جسيم في النظام", {
            error: error.message,
            stack: error.stack
        });
        
        process.exit(1);
    }
}

// إضافة تعامل مع إشارات النظام
process.on('SIGINT', () => {
    Logger.log("📛 تلقي إشارة إيقاف (Ctrl+C)");
    console.log("⏳ الخروج بأمان...");
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    Logger.error("💥 خطأ غير متوقع:", error);
    ErrorManager.addError("uncaught_exception", "خطأ غير متوقع", {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error("💥 وعد مرفوض غير معالج:", reason);
    ErrorManager.addError("unhandled_rejection", "وعد مرفوض غير معالج", {
        reason: reason?.message || String(reason)
    });
});

// التشغيل
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    fetchMovieDetails,
    fetchMoviesFromPage,
    fetchWithTimeout,
    ErrorManager,
    Logger
};
