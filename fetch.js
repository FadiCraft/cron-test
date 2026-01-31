import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== استيراد الحزم بشكل صحيح ====================
// استخدم dynamic imports مع catch
let cheerio, pLimit, retry, chalk, boxen, ora, cliProgress;

try {
    // تحميل الحزم بشكل غير متزامن
    const cheerioModule = await import('cheerio');
    cheerio = cheerioModule.default;
    
    const pLimitModule = await import('p-limit');
    pLimit = pLimitModule.default;
    
    const retryModule = await import('async-retry');
    retry = retryModule.default;
    
    const chalkModule = await import('chalk');
    chalk = chalkModule.default;
    
    const boxenModule = await import('boxen');
    boxen = boxenModule.default;
    
    const oraModule = await import('ora');
    ora = oraModule.default;
    
    const cliProgressModule = await import('cli-progress');
    cliProgress = cliProgressModule;
    
    console.log("✅ جميع الحزم محملة بنجاح");
} catch (error) {
    console.error("❌ خطأ في تحميل الحزم:", error.message);
    console.log("\n📦 يرجى تثبيت الحزم المطلوبة:");
    console.log("npm install cheerio p-limit async-retry chalk boxen ora cli-progress");
    process.exit(1);
}

// ==================== الإعدادات ====================
const CONFIG = {
    // === المسارات ===
    BASE_URL: "https://topcinema.rip",
    MOVIES_URL: "https://topcinema.rip/movies",
    OUTPUT_DIR: path.join(__dirname, "movies"),
    
    // === الملفات ===
    FILES: {
        HOME: "Home.json",
        INDEX: "index.json",
        STATS: "stats.json",
        CONFIG: "config.json",
        TOP_CINEMA_PREFIX: "TopCinema"
    },
    
    // === إعدادات الاستخراج ===
    SCRAPING: {
        BATCH_SIZE: 250,
        REQUEST_DELAY: 1000,
        TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        CONCURRENT_REQUESTS: 3,
        MAX_PAGES_FIRST_RUN: 10, // اخفضناها للتجربة
        MAX_PAGES_DAILY: 2
    },
    
    // === إعدادات النظام ===
    SYSTEM: {
        CHECKPOINT_INTERVAL: 5,
        SAVE_INTERVAL: 10,
        LOG_LEVEL: "info"
    }
};

// ==================== تسجيل ذكي ====================
class Logger {
    constructor() {
        this.colors = {
            info: chalk.cyan,
            success: chalk.green,
            warn: chalk.yellow,
            error: chalk.red,
            debug: chalk.gray,
            title: chalk.magenta.bold
        };
        
        this.spinner = null;
        this.progressBar = null;
    }
    
    log(level, message, module = "") {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = module ? `[${module}]` : "";
        const color = this.colors[level] || chalk.white;
        
        console.log(`${chalk.gray(timestamp)} ${color(`${level.toUpperCase()}`)} ${prefix} ${message}`);
    }
    
    info(message, module = "") {
        this.log('info', message, module);
    }
    
    success(message, module = "") {
        this.log('success', message, module);
    }
    
    warn(message, module = "") {
        this.log('warn', message, module);
    }
    
    error(message, module = "") {
        this.log('error', message, module);
    }
    
    debug(message, module = "") {
        if (CONFIG.SYSTEM.LOG_LEVEL === 'debug') {
            this.log('debug', message, module);
        }
    }
    
    startSpinner(text) {
        if (this.spinner) this.spinner.stop();
        this.spinner = ora(text).start();
    }
    
    updateSpinner(text) {
        if (this.spinner) {
            this.spinner.text = text;
        }
    }
    
    stopSpinner(success = true, text = "") {
        if (this.spinner) {
            if (success) {
                this.spinner.succeed(text);
            } else {
                this.spinner.fail(text);
            }
            this.spinner = null;
        }
    }
    
    createProgressBar(total, title) {
        if (this.progressBar) this.progressBar.stop();
        this.progressBar = new cliProgress.SingleBar({
            format: `${title} | ${chalk.cyan('{bar}')} | {percentage}% | {value}/{total} | الوقت: {duration_formatted}`,
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true
        }, cliProgress.Presets.shades_classic);
        
        this.progressBar.start(total, 0);
        return this.progressBar;
    }
    
    updateProgressBar(value) {
        if (this.progressBar) {
            this.progressBar.update(value);
        }
    }
    
    stopProgressBar() {
        if (this.progressBar) {
            this.progressBar.stop();
            this.progressBar = null;
        }
    }
}

const logger = new Logger();

// ==================== ذاكرة تخزين مؤقت ====================
class Cache {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            size: 0
        };
    }
    
    set(key, value, ttl = 60000) {
        this.cache.set(key, {
            data: value,
            expires: Date.now() + ttl
        });
        this.stats.size++;
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            this.stats.misses++;
            return null;
        }
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            this.stats.size--;
            this.stats.misses++;
            return null;
        }
        
        this.stats.hits++;
        return item.data;
    }
    
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, size: 0 };
    }
    
    getStats() {
        const hitRate = this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0;
        return {
            ...this.stats,
            hitRate: hitRate.toFixed(2) + '%',
            cacheSize: this.cache.size
        };
    }
}

const cache = new Cache();

// ==================== طلب HTTP مع retry وcache ====================
async function fetchWithRetry(url, options = {}) {
    const cacheKey = `fetch:${url}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        logger.debug(`استخدام البيانات المخزنة: ${url}`, "FETCH");
        return cached;
    }
    
    return await retry(async (bail) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.SCRAPING.TIMEOUT);
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en;q=0.9',
                    'Referer': CONFIG.BASE_URL,
                    'DNT': '1'
                },
                ...options
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 404) {
                    bail(new Error(`404 - الصفحة غير موجودة: ${url}`));
                    return;
                }
                if (response.status === 429) {
                    throw new Error(`429 - الكثير من الطلبات: ${url}`);
                }
                throw new Error(`HTTP ${response.status}: ${url}`);
            }
            
            const html = await response.text();
            cache.set(cacheKey, html, 300000);
            return html;
            
        } catch (error) {
            logger.warn(`فشل الطلب: ${url} - ${error.message}`, "FETCH");
            throw error;
        }
    }, {
        retries: CONFIG.SCRAPING.RETRY_ATTEMPTS,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (error, attempt) => {
            logger.debug(`إعادة المحاولة ${attempt}/${CONFIG.SCRAPING.RETRY_ATTEMPTS}: ${url}`, "FETCH");
        }
    });
}

// ==================== إدارة الملفات المتقدمة ====================
class FileManager {
    constructor() {
        this.ensureDirectory();
    }
    
    ensureDirectory() {
        const dirs = [
            CONFIG.OUTPUT_DIR,
            path.join(CONFIG.OUTPUT_DIR, "logs"),
            path.join(CONFIG.OUTPUT_DIR, "backups"),
            path.join(CONFIG.OUTPUT_DIR, "temp")
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.success(`تم إنشاء المجلد: ${path.basename(dir)}`, "FILE");
            }
        });
    }
    
    loadIndex() {
        const filePath = path.join(CONFIG.OUTPUT_DIR, CONFIG.FILES.INDEX);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (error) {
                logger.error(`خطأ في تحميل الفهرس: ${error.message}`, "FILE");
            }
        }
        
        return {
            version: "3.0",
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            movies: {},
            totalMovies: 0,
            totalFiles: 0,
            lastScan: null
        };
    }
    
    loadStats() {
        const filePath = path.join(CONFIG.OUTPUT_DIR, CONFIG.FILES.STATS);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (error) {
                logger.error(`خطأ في تحميل الإحصائيات: ${error.message}`, "FILE");
            }
        }
        
        return {
            version: "3.0",
            firstRun: new Date().toISOString(),
            lastRun: null,
            totalRuns: 0,
            totalMoviesScraped: 0,
            totalRequests: 0,
            totalErrors: 0,
            avgTimePerMovie: 0,
            runHistory: []
        };
    }
    
    saveIndex(data) {
        const filePath = path.join(CONFIG.OUTPUT_DIR, CONFIG.FILES.INDEX);
        const tempPath = `${filePath}.tmp`;
        
        try {
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
            fs.renameSync(tempPath, filePath);
            logger.debug(`تم حفظ الفهرس (${Object.keys(data.movies).length} فيلم)`, "FILE");
        } catch (error) {
            logger.error(`خطأ في حفظ الفهرس: ${error.message}`, "FILE");
            throw error;
        }
    }
    
    saveStats(stats) {
        const filePath = path.join(CONFIG.OUTPUT_DIR, CONFIG.FILES.STATS);
        stats.lastRun = new Date().toISOString();
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(stats, null, 2), 'utf8');
            logger.debug(`تم حفظ الإحصائيات`, "FILE");
        } catch (error) {
            logger.error(`خطأ في حفظ الإحصائيات: ${error.message}`, "FILE");
        }
    }
    
    getTopCinemaFiles() {
        const files = fs.readdirSync(CONFIG.OUTPUT_DIR);
        const topCinemaFiles = files
            .filter(f => f.startsWith(CONFIG.FILES.TOP_CINEMA_PREFIX) && f.endsWith('.json'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || 0);
                const numB = parseInt(b.match(/\d+/)?.[0] || 0);
                return numB - numA;
            });
        
        return topCinemaFiles.map(filename => {
            const filePath = path.join(CONFIG.OUTPUT_DIR, filename);
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                return {
                    filename,
                    number: parseInt(filename.match(/\d+/)?.[0] || 1),
                    movieCount: content.movies?.length || 0,
                    isFull: (content.movies?.length || 0) >= CONFIG.SCRAPING.BATCH_SIZE,
                    createdAt: content.createdAt,
                    lastUpdated: content.lastUpdated
                };
            } catch (error) {
                return {
                    filename,
                    number: parseInt(filename.match(/\d+/)?.[0] || 1),
                    movieCount: 0,
                    isFull: false,
                    error: error.message
                };
            }
        });
    }
    
    getCurrentTopCinemaFile() {
        const files = this.getTopCinemaFiles();
        if (files.length === 0) {
            return this.createNewTopCinemaFile(1);
        }
        
        const lastFile = files[0];
        if (lastFile.isFull) {
            return this.createNewTopCinemaFile(lastFile.number + 1);
        }
        
        return lastFile;
    }
    
    createNewTopCinemaFile(number) {
        const filename = `${CONFIG.FILES.TOP_CINEMA_PREFIX}${number}.json`;
        const filePath = path.join(CONFIG.OUTPUT_DIR, filename);
        
        const structure = {
            fileNumber: number,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            movies: [],
            totalMovies: 0,
            metadata: {
                batchSize: CONFIG.SCRAPING.BATCH_SIZE,
                source: "topcinema.rip",
                version: "3.0"
            }
        };
        
        fs.writeFileSync(filePath, JSON.stringify(structure, null, 2));
        logger.success(`📄 تم إنشاء ملف جديد: ${filename}`, "FILE");
        
        return {
            filename,
            number,
            movieCount: 0,
            isFull: false,
            filePath
        };
    }
    
    addMovieToFile(movieData, topCinemaFile) {
        const filePath = path.join(CONFIG.OUTPUT_DIR, topCinemaFile.filename);
        
        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // التحقق من التكرار
            const exists = content.movies.some(m => m.id === movieData.id);
            if (exists) {
                logger.warn(`الفيلم ${movieData.id} موجود مسبقاً في الملف`, "FILE");
                return false;
            }
            
            content.movies.push(movieData);
            content.totalMovies = content.movies.length;
            content.lastUpdated = new Date().toISOString();
            
            fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
            
            logger.debug(`تم إضافة الفيلم ${movieData.id} إلى ${topCinemaFile.filename}`, "FILE");
            return true;
            
        } catch (error) {
            logger.error(`خطأ في إضافة الفيلم للملف: ${error.message}`, "FILE");
            return false;
        }
    }
    
    saveHomePage(movies) {
        const filePath = path.join(CONFIG.OUTPUT_DIR, CONFIG.FILES.HOME);
        const data = {
            page: 1,
            url: CONFIG.MOVIES_URL,
            scrapedAt: new Date().toISOString(),
            totalMovies: movies.length,
            movies: movies.slice(0, 50)
        };
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        logger.success(`تم حفظ الصفحة الرئيسية (${movies.length} فيلم)`, "FILE");
    }
}

// ==================== محرك الاستخراج ====================
class ScraperEngine {
    constructor() {
        this.fileManager = new FileManager();
        this.system = {
            index: this.fileManager.loadIndex(),
            stats: this.fileManager.loadStats()
        };
        this.stats = {
            moviesScraped: 0,
            moviesAdded: 0,
            moviesUpdated: 0,
            requestsMade: 0,
            errors: 0,
            startTime: Date.now()
        };
        this.limit = pLimit(CONFIG.SCRAPING.CONCURRENT_REQUESTS);
    }
    
    async initialize() {
        console.log(boxen(chalk.bold.magenta('🎬 TopCinema Scraper v3.0\n') + 
                         chalk.gray('نظام متقدم لجمع وتنظيم الأفلام العربية\n') +
                         chalk.yellow('='.repeat(45)), 
                         { 
                             padding: 1, 
                             borderColor: 'magenta',
                             borderStyle: 'round',
                             margin: 1
                         }));
        
        logger.info(`📁 المجلد الرئيسي: ${CONFIG.OUTPUT_DIR}`, "INIT");
        logger.info(`📊 عدد الأفلام المخزنة: ${Object.keys(this.system.index.movies).length}`, "INIT");
        
        const topCinemaFiles = this.fileManager.getTopCinemaFiles();
        logger.info(`📦 عدد ملفات TopCinema: ${topCinemaFiles.length}`, "INIT");
    }
    
    async scrapePage(pageNum) {
        const url = pageNum === 1 
            ? CONFIG.MOVIES_URL 
            : `${CONFIG.MOVIES_URL}/page/${pageNum}/`;
        
        logger.info(`جلب الصفحة ${pageNum}...`, "SCRAPE");
        
        try {
            const html = await fetchWithRetry(url);
            this.stats.requestsMade++;
            
            const $ = cheerio.load(html);
            const movies = [];
            
            $('.Small--Box a').each((index, element) => {
                const movieUrl = $(element).attr('href');
                if (movieUrl && movieUrl.includes('topcinema.rip')) {
                    const title = $(element).find('.title').text().trim() || 
                                 $(element).text().trim() || 
                                 `فيلم ${index + 1}`;
                    
                    movies.push({
                        id: this.extractIdFromUrl(movieUrl),
                        title: title.substring(0, 200),
                        url: movieUrl,
                        page: pageNum,
                        position: index + 1,
                        discoveredAt: new Date().toISOString()
                    });
                }
            });
            
            logger.success(`عثر على ${movies.length} فيلم في الصفحة ${pageNum}`, "SCRAPE");
            return movies;
            
        } catch (error) {
            logger.error(`فشل جلب الصفحة ${pageNum}: ${error.message}`, "SCRAPE");
            this.stats.errors++;
            return [];
        }
    }
    
    extractIdFromUrl(url) {
        const match = url.match(/\/(\d+)\//);
        return match ? match[1] : Date.now().toString();
    }
    
    async scrapeMovieDetails(movie) {
        logger.info(`استخراج: ${movie.title.substring(0, 50)}...`, "MOVIE");
        
        try {
            const html = await fetchWithRetry(movie.url);
            this.stats.requestsMade++;
            
            const $ = cheerio.load(html);
            
            // استخراج ID من الرابط المختصر
            const shortLink = $('#shortlink').val();
            const movieId = shortLink ? this.extractMovieId(shortLink) : movie.id;
            
            if (!movieId) {
                logger.warn(`لم يتم العثور على ID للفيلم: ${movie.title}`, "MOVIE");
                return null;
            }
            
            // البيانات الأساسية
            const title = $(".post-title a").text().trim() || movie.title;
            const image = $(".image img").attr('src');
            const imdbRating = $(".imdbR span").text().trim();
            const story = $(".story p").text().trim() || "غير متوفر";
            
            // استخراج التفاصيل
            const details = this.extractMovieDetails($);
            
            // تجميع البيانات
            const movieData = {
                id: movieId,
                title: title,
                url: movie.url,
                shortLink: shortLink,
                image: image,
                imdbRating: imdbRating,
                story: story,
                details: details,
                metadata: {
                    page: movie.page,
                    position: movie.position,
                    discoveredAt: movie.discoveredAt,
                    scrapedAt: new Date().toISOString()
                }
            };
            
            this.stats.moviesScraped++;
            logger.success(`تم استخراج: ${title.substring(0, 40)}...`, "MOVIE");
            
            return movieData;
            
        } catch (error) {
            logger.error(`فشل استخراج الفيلم ${movie.title}: ${error.message}`, "MOVIE");
            this.stats.errors++;
            return null;
        }
    }
    
    extractMovieId(shortLink) {
        const match = shortLink.match(/p=(\d+)/);
        return match ? match[1] : null;
    }
    
    extractMovieDetails($) {
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
        
        $(".RightTaxContent li").each((index, element) => {
            const labelElement = $(element).find("span");
            if (labelElement.length) {
                const label = labelElement.text().replace(":", "").trim();
                const links = $(element).find("a");
                
                if (links.length > 0) {
                    const values = links.map((i, el) => $(el).text().trim()).get();
                    
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
                    const text = $(element).text().trim();
                    const value = text.split(":").slice(1).join(":").trim();
                    
                    if (label.includes("توقيت الفيلم")) {
                        details.duration = value;
                    }
                }
            }
        });
        
        return details;
    }
    
    async processMovie(movie, topCinemaFile) {
        // التحقق إذا كان الفيلم موجوداً مسبقاً
        if (this.system.index.movies[movie.id]) {
            this.system.index.movies[movie.id].lastSeen = new Date().toISOString();
            this.system.index.movies[movie.id].lastPageSeen = movie.page;
            this.stats.moviesUpdated++;
            
            logger.debug(`محدث: ${movie.title.substring(0, 40)}...`, "PROCESS");
            return { status: 'updated', movie: null };
        }
        
        // استخراج التفاصيل
        const movieDetails = await this.scrapeMovieDetails(movie);
        if (!movieDetails) {
            return { status: 'failed', movie: null };
        }
        
        // إضافة إلى ملف TopCinema
        const added = this.fileManager.addMovieToFile(movieDetails, topCinemaFile);
        if (!added) {
            return { status: 'duplicate', movie: null };
        }
        
        // تحديث الفهرس
        this.system.index.movies[movieDetails.id] = {
            title: movieDetails.title,
            image: movieDetails.image,
            url: movieDetails.url,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            storedIn: topCinemaFile.filename,
            lastPageSeen: movie.page,
            discoveryPage: movie.page
        };
        
        this.system.index.totalMovies = Object.keys(this.system.index.movies).length;
        this.stats.moviesAdded++;
        
        return { status: 'added', movie: movieDetails };
    }
    
    async testScrape() {
        logger.info("🧪 بدء اختبار النظام", "TEST");
        
        // اختبار جلب الصفحة الأولى فقط
        const movies = await this.scrapePage(1);
        
        if (movies.length === 0) {
            logger.error("❌ لم يتم العثور على أفلام", "TEST");
            return false;
        }
        
        logger.success(`✅ تم العثور على ${movies.length} فيلم`, "TEST");
        
        // اختبار استخراج فيلم واحد
        if (movies.length > 0) {
            const testMovie = movies[0];
            logger.info(`اختبار استخراج: ${testMovie.title}`, "TEST");
            
            const movieDetails = await this.scrapeMovieDetails(testMovie);
            if (movieDetails) {
                logger.success(`✅ نجح استخراج الفيلم: ${movieDetails.title}`, "TEST");
                logger.info(`   🏷️  ID: ${movieDetails.id}`);
                logger.info(`   📷 صورة: ${movieDetails.image ? 'نعم' : 'لا'}`);
                logger.info(`   ⭐ IMDB: ${movieDetails.imdbRating || 'غير متوفر'}`);
                logger.info(`   🎭 أنواع: ${movieDetails.details.genres.join(', ') || 'غير معروف'}`);
                return true;
            }
        }
        
        return false;
    }
    
    async firstRun() {
        logger.info("🚀 بدء التشغيل الأول للنظام", "MAIN");
        
        let currentPage = 1;
        let totalMoviesProcessed = 0;
        let topCinemaFile = this.fileManager.getCurrentTopCinemaFile();
        
        const progressBar = logger.createProgressBar(CONFIG.SCRAPING.MAX_PAGES_FIRST_RUN, "جلب الصفحات");
        
        while (currentPage <= CONFIG.SCRAPING.MAX_PAGES_FIRST_RUN) {
            // جلب الأفلام من الصفحة
            const movies = await this.scrapePage(currentPage);
            
            // إذا كانت الصفحة الأولى، احفظها كـ Home
            if (currentPage === 1 && movies.length > 0) {
                this.fileManager.saveHomePage(movies);
            }
            
            // معالجة الأفلام
            for (const movie of movies) {
                await this.processMovie(movie, topCinemaFile);
                
                // تحديث ملف TopCinema إذا امتلأ
                if (topCinemaFile.movieCount >= CONFIG.SCRAPING.BATCH_SIZE) {
                    topCinemaFile = this.fileManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                }
                
                // تأخير بين الأفلام
                await new Promise(resolve => setTimeout(resolve, CONFIG.SCRAPING.REQUEST_DELAY));
            }
            
            totalMoviesProcessed += movies.length;
            progressBar.update(currentPage);
            
            currentPage++;
            
            // تأخير بين الصفحات
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        progressBar.stop();
        
        // الحفظ النهائي
        this.finalizeRun();
        
        logger.success(`✅ اكتمل التشغيل الأول!`, "MAIN");
        this.showSummary();
    }
    
    async dailyUpdate() {
        logger.info("🔄 بدء التحديث اليومي", "MAIN");
        
        let topCinemaFile = this.fileManager.getCurrentTopCinemaFile();
        const pagesToScan = CONFIG.SCRAPING.MAX_PAGES_DAILY;
        
        for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
            logger.info(`فحص الصفحة ${pageNum}/${pagesToScan}...`, "MAIN");
            
            const movies = await this.scrapePage(pageNum);
            
            // حفظ الصفحة الأولى كـ Home
            if (pageNum === 1 && movies.length > 0) {
                this.fileManager.saveHomePage(movies);
            }
            
            // معالجة الأفلام
            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];
                
                await this.processMovie(movie, topCinemaFile);
                
                // تحديث ملف TopCinema إذا امتلأ
                if (topCinemaFile.movieCount >= CONFIG.SCRAPING.BATCH_SIZE) {
                    topCinemaFile = this.fileManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                }
                
                // تأخير بين الأفلام
                await new Promise(resolve => setTimeout(resolve, CONFIG.SCRAPING.REQUEST_DELAY));
                
                // عرض التقدم
                if (i % 10 === 0) {
                    logger.info(`   معالجة ${i + 1}/${movies.length}...`, "MAIN");
                }
            }
            
            // تأخير بين الصفحات
            if (pageNum < pagesToScan) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // الحفظ النهائي
        this.finalizeRun();
        
        logger.success(`✅ اكتمل التحديث اليومي!`, "MAIN");
        this.showSummary();
    }
    
    finalizeRun() {
        // تحديث الوقت
        this.system.index.updated = new Date().toISOString();
        this.system.index.lastScan = new Date().toISOString();
        
        // تحديث الإحصائيات
        const endTime = Date.now();
        const duration = (endTime - this.stats.startTime) / 1000;
        
        this.system.stats.totalRuns++;
        this.system.stats.lastRun = new Date().toISOString();
        this.system.stats.totalMoviesScraped += this.stats.moviesScraped;
        this.system.stats.totalRequests += this.stats.requestsMade;
        this.system.stats.totalErrors += this.stats.errors;
        
        if (this.stats.moviesScraped > 0) {
            this.system.stats.avgTimePerMovie = duration / this.stats.moviesScraped;
        }
        
        // إضافة سجل التشغيل
        this.system.stats.runHistory.unshift({
            date: new Date().toISOString(),
            duration: duration,
            moviesAdded: this.stats.moviesAdded,
            moviesUpdated: this.stats.moviesUpdated,
            moviesScraped: this.stats.moviesScraped,
            requests: this.stats.requestsMade,
            errors: this.stats.errors
        });
        
        // الحفاظ على آخر 50 سجل فقط
        if (this.system.stats.runHistory.length > 50) {
            this.system.stats.runHistory = this.system.stats.runHistory.slice(0, 50);
        }
        
        // حفظ كل شيء
        this.fileManager.saveIndex(this.system.index);
        this.fileManager.saveStats(this.system.stats);
    }
    
    showSummary() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        
        console.log("\n" + "=".repeat(60));
        console.log(chalk.bold.magenta("📊 ملخص التشغيل"));
        console.log("=".repeat(60));
        console.log(chalk.cyan("⏱️  الوقت المستغرق:") + ` ${minutes} دقائق و ${seconds} ثانية`);
        console.log(chalk.cyan("🎬 الأفلام المستخرجة:") + ` ${this.stats.moviesScraped}`);
        console.log(chalk.green("🆕 الأفلام المضافة:") + ` ${this.stats.moviesAdded}`);
        console.log(chalk.yellow("🔄 الأفلام المحدثة:") + ` ${this.stats.moviesUpdated}`);
        console.log(chalk.red("❌ الأخطاء:") + ` ${this.stats.errors}`);
        console.log(chalk.blue("📡 الطلبات:") + ` ${this.stats.requestsMade}`);
        console.log("=".repeat(60));
        
        const totalMovies = Object.keys(this.system.index.movies).length;
        const totalFiles = this.fileManager.getTopCinemaFiles().length;
        
        console.log(chalk.bold.green("📈 الإجماليات التراكمية:"));
        console.log(chalk.green("   مجموع الأفلام:") + ` ${totalMovies}`);
        console.log(chalk.green("   مجموع الملفات:") + ` ${totalFiles}`);
        console.log(chalk.green("   نسبة نجاح Cache:") + ` ${cache.getStats().hitRate}`);
        console.log("=".repeat(60));
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    try {
        const engine = new ScraperEngine();
        await engine.initialize();
        
        const args = process.argv.slice(2);
        
        if (args.includes('--test')) {
            // وضع الاختبار
            const testResult = await engine.testScrape();
            if (testResult) {
                console.log("\n" + chalk.bold.green("✅ كل شيء يعمل بشكل صحيح!"));
            } else {
                console.log("\n" + chalk.bold.red("❌ هناك مشكلة في النظام"));
            }
            
        } else if (args.includes('--first-run')) {
            await engine.firstRun();
            
        } else if (args.includes('--daily-update')) {
            await engine.dailyUpdate();
            
        } else if (args.includes('--stats')) {
            // عرض الإحصائيات فقط
            engine.showSummary();
            
        } else {
            // الوضع التلقائي
            console.log(chalk.yellow("🤖 الوضع التلقائي"));
            console.log(chalk.gray("استخدم --test لاختبار النظام"));
            console.log(chalk.gray("استخدم --first-run للتشغيل الأول"));
            console.log(chalk.gray("استخدم --daily-update للتحديث اليومي"));
            console.log(chalk.gray("استخدم --stats لعرض الإحصائيات"));
        }
        
    } catch (error) {
        console.error(chalk.bold.red("💥 خطأ غير متوقع:"), error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// ==================== التشغيل ====================
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
