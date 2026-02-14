import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== إعدادات المسارات ====================
const SERIES_DIR = path.join(__dirname, "Series");
const AG_SERIES_DIR = path.join(SERIES_DIR, "AgSeries");
const TV_SERIES_DIR = path.join(AG_SERIES_DIR, "TV_Series");
const SEASONS_DIR = path.join(AG_SERIES_DIR, "Seasons");
const EPISODES_DIR = path.join(AG_SERIES_DIR, "Episodes");
const CACHE_DIR = path.join(AG_SERIES_DIR, "Cache");
const PROGRESS_FILE = path.join(AG_SERIES_DIR, "series_progress.json");
const HOME_SERIES_FILE = path.join(TV_SERIES_DIR, "Home.json");
const LOGS_DIR = path.join(AG_SERIES_DIR, "Logs");

// إنشاء المجلدات
const createDirectories = async () => {
    console.log("📁 جاري إنشاء المجلدات...");
    const dirs = [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, CACHE_DIR, LOGS_DIR];
    
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${path.basename(dir)}`);
        }
    }
    console.log("✅ اكتمل إنشاء المجلدات\n");
};

await createDirectories();

// ==================== إعدادات النظام ====================
const CONFIG = {
    itemsPerFile: {
        series: 50,
        seasons: 100,
        episodes: 500
    },
    pagesPerRun: 3, // استخراج 3 صفحات في كل تشغيل
    requestDelay: 1500, // 1.5 ثانية بين الطلبات
    maxRetries: 3,
    concurrentRequests: 2,
    cacheTTL: 3600000, // ساعة
    requestTimeout: 30000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ==================== نظام التخزين المؤقت ====================
class CacheManager {
    constructor(cacheDir, ttl = CONFIG.cacheTTL) {
        this.cacheDir = cacheDir;
        this.ttl = ttl;
        this.memoryCache = new Map();
    }

    getCachePath(url) {
        const hash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').substring(0, 100);
        return path.join(this.cacheDir, `${hash}.json`);
    }

    async get(url) {
        // فحص الذاكرة المؤقتة
        if (this.memoryCache.has(url)) {
            const cached = this.memoryCache.get(url);
            if (Date.now() - cached.timestamp < this.ttl) {
                return cached.data;
            }
            this.memoryCache.delete(url);
        }

        // فحص ملف الكاش
        const cachePath = this.getCachePath(url);
        try {
            if (fs.existsSync(cachePath)) {
                const stats = fs.statSync(cachePath);
                if (Date.now() - stats.mtimeMs < this.ttl) {
                    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    this.memoryCache.set(url, { data, timestamp: Date.now() });
                    return data;
                }
            }
        } catch (error) {
            // تجاهل أخطاء الكاش
        }
        return null;
    }

    async set(url, data) {
        this.memoryCache.set(url, { data, timestamp: Date.now() });
        
        // تخزين في ملف (بشكل غير متزامن)
        const cachePath = this.getCachePath(url);
        fs.writeFile(cachePath, JSON.stringify(data, null, 2), () => {});
    }
}

// ==================== نظام طلبات HTTP ====================
class HttpClient {
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
        this.requestQueue = [];
        this.activeRequests = 0;
        this.lastRequestTime = 0;
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            failedRequests: 0
        };
    }

    async fetch(url, useCache = true) {
        if (useCache) {
            const cached = await this.cacheManager.get(url);
            if (cached) {
                this.stats.cacheHits++;
                return cached;
            }
        }

        return this.queueRequest(url);
    }

    async queueRequest(url) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.activeRequests >= CONFIG.concurrentRequests) return;

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < CONFIG.requestDelay) {
            setTimeout(() => this.processQueue(), CONFIG.requestDelay - timeSinceLastRequest);
            return;
        }

        if (this.requestQueue.length === 0) return;

        this.activeRequests++;
        const { url, resolve, reject } = this.requestQueue.shift();

        try {
            const result = await this.executeRequest(url);
            this.lastRequestTime = Date.now();
            this.stats.totalRequests++;
            
            await this.cacheManager.set(url, result);
            
            resolve(result);
        } catch (error) {
            this.stats.failedRequests++;
            reject(error);
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    }

    async executeRequest(url, retries = CONFIG.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                if (i > 0) {
                    console.log(`   ↻ إعادة المحاولة ${i + 1}/${retries}...`);
                    await new Promise(r => setTimeout(r, 2000 * i));
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': CONFIG.userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                        'Referer': 'https://topcinema.rip/'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (response.status === 404) {
                        return null; // صفحة غير موجودة
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                return html;

            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log(`   ⏱️ انتهاء مهلة الطلب`);
                }
                if (i === retries - 1) throw error;
            }
        }
    }

    getStats() {
        return this.stats;
    }
}

// ==================== نظام تتبع التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
        this.startTime = performance.now();
        this.pagesProcessedThisSession = 0;
    }

    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                
                this.seriesPage = data.seriesPage || 1;
                this.seriesFileNumber = data.seriesFileNumber || 1;
                this.seriesInCurrentFile = data.seriesInCurrentFile || 0;
                
                this.seasonFileNumber = data.seasonFileNumber || 1;
                this.seasonsInCurrentFile = data.seasonsInCurrentFile || 0;
                
                this.episodeFileNumber = data.episodeFileNumber || 1;
                this.episodesInCurrentFile = data.episodesInCurrentFile || 0;
                
                this.totalExtracted = data.totalExtracted || {
                    series: 0,
                    seasons: 0,
                    episodes: 0
                };
                
                this.lastRunDate = data.lastRunDate || null;
                this.totalPagesScraped = data.totalPagesScraped || 0;
                
                console.log(`📊 تم استئناف العمل من الصفحة ${this.seriesPage}`);
                console.log(`📊 إجمالي الصفحات المستخرجة سابقاً: ${this.totalPagesScraped}`);
                
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ خطأ في تحميل التقدم، بدء من جديد");
            this.resetProgress();
        }
    }

    resetProgress() {
        this.seriesPage = 1;
        this.seriesFileNumber = 1;
        this.seriesInCurrentFile = 0;
        this.seasonFileNumber = 1;
        this.seasonsInCurrentFile = 0;
        this.episodeFileNumber = 1;
        this.episodesInCurrentFile = 0;
        this.totalExtracted = { series: 0, seasons: 0, episodes: 0 };
        this.lastRunDate = null;
        this.totalPagesScraped = 0;
        this.saveProgress();
    }

    saveProgress() {
        const progressData = {
            seriesPage: this.seriesPage,
            seriesFileNumber: this.seriesFileNumber,
            seriesInCurrentFile: this.seriesInCurrentFile,
            seasonFileNumber: this.seasonFileNumber,
            seasonsInCurrentFile: this.seasonsInCurrentFile,
            episodeFileNumber: this.episodeFileNumber,
            episodesInCurrentFile: this.episodesInCurrentFile,
            totalExtracted: this.totalExtracted,
            lastRunDate: new Date().toISOString(),
            totalPagesScraped: this.totalPagesScraped,
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }

    canProcessMorePages() {
        return this.pagesProcessedThisSession < CONFIG.pagesPerRun;
    }

    markPageProcessed(success = true) {
        if (success) {
            this.pagesProcessedThisSession++;
            this.seriesPage++;
            this.totalPagesScraped++;
        }
        this.saveProgress();
        
        console.log(`\n📊 تقدم الجلسة: ${this.pagesProcessedThisSession}/${CONFIG.pagesPerRun} صفحات`);
        console.log(`📊 إجمالي الصفحات: ${this.totalPagesScraped}`);
    }

    addToCount(type) {
        this.totalExtracted[type]++;
        
        switch(type) {
            case 'series':
                this.seriesInCurrentFile++;
                if (this.seriesInCurrentFile >= CONFIG.itemsPerFile.series) {
                    this.seriesFileNumber++;
                    this.seriesInCurrentFile = 0;
                    console.log(`\n📁 ملف مسلسلات جديد: Page${this.seriesFileNumber}.json`);
                }
                break;
            case 'seasons':
                this.seasonsInCurrentFile++;
                if (this.seasonsInCurrentFile >= CONFIG.itemsPerFile.seasons) {
                    this.seasonFileNumber++;
                    this.seasonsInCurrentFile = 0;
                    console.log(`\n📁 ملف مواسم جديد: Page${this.seasonFileNumber}.json`);
                }
                break;
            case 'episodes':
                this.episodesInCurrentFile++;
                if (this.episodesInCurrentFile >= CONFIG.itemsPerFile.episodes) {
                    this.episodeFileNumber++;
                    this.episodesInCurrentFile = 0;
                    console.log(`\n📁 ملف حلقات جديد: Page${this.episodeFileNumber}.json`);
                }
                break;
        }
        
        this.saveProgress();
    }

    getElapsedTime() {
        return ((performance.now() - this.startTime) / 1000).toFixed(1);
    }

    resetSession() {
        this.pagesProcessedThisSession = 0;
        this.startTime = performance.now();
    }
}

// ==================== نظام الحفظ ====================
class StorageManager {
    constructor(progress) {
        this.progress = progress;
    }

    async saveItem(directory, fileName, item, type) {
        const filePath = path.join(directory, fileName);
        
        try {
            let data = { info: {}, data: [] };
            
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                data = JSON.parse(content);
            } else {
                data.info = {
                    type,
                    fileName: path.basename(filePath),
                    created: new Date().toISOString(),
                    totalItems: 0
                };
            }
            
            data.data.push(item);
            data.info.totalItems = data.data.length;
            data.info.lastUpdated = new Date().toISOString();
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            this.progress.addToCount(type);
            
            return { success: true, file: path.basename(filePath) };
        } catch (error) {
            console.log(`   ⚠️ خطأ في الحفظ: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async itemExists(directory, itemId) {
        try {
            const files = fs.readdirSync(directory).filter(f => f.endsWith('.json'));
            
            for (const file of files) {
                const filePath = path.join(directory, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (content.data?.some(item => item.id === itemId)) {
                    return true;
                }
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
        return false;
    }
}

// ==================== أدوات المساعدة ====================
const cleanText = (text) => text ? text.replace(/\s+/g, " ").trim() : "";

const extractId = (shortLink) => {
    try {
        if (!shortLink) return `id_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const patterns = [
            /\?p=(\d+)/,
            /\?gt=(\d+)/,
            /\/series\/(\d+)/,
            /\/(\d+)(?:\/|$)/
        ];
        
        for (const pattern of patterns) {
            const match = shortLink.match(pattern);
            if (match) return `${pattern.source.includes('gt') ? 'gt' : 'id'}_${match[1]}`;
        }
        
        return `id_${Date.now()}`;
    } catch {
        return `id_${Date.now()}`;
    }
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ==================== استخراج سيرفرات التحميل ====================
const extractDownloadServers = async (doc) => {
    const servers = {};
    
    try {
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
        for (const block of downloadBlocks) {
            const quality = cleanText(block.querySelector('.download-title span')?.textContent) || "غير محدد";
            
            const links = block.querySelectorAll('a.downloadsLink');
            const qualityServers = [];
            
            links.forEach(link => {
                qualityServers.push({
                    name: cleanText(link.querySelector('span, p')?.textContent) || "غير معروف",
                    url: link.href,
                    quality
                });
            });
            
            if (qualityServers.length > 0) {
                servers[quality] = qualityServers;
            }
        }
        
        const proServer = doc.querySelector('.proServer a.downloadsLink');
        if (proServer) {
            if (!servers["متعدد الجودات"]) servers["متعدد الجودات"] = [];
            servers["متعدد الجودات"].push({
                name: cleanText(proServer.querySelector('span, p')?.textContent) || "متعدد الجودات",
                url: proServer.href,
                quality: "متعدد الجودات"
            });
        }
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج السيرفرات: ${error.message}`);
    }
    
    return servers;
};

// ==================== استخراج بيانات الصفحة ====================
const fetchPageData = async (url, httpClient) => {
    const html = await httpClient.fetch(url);
    if (!html) return null;
    
    const dom = new JSDOM(html);
    return dom.window.document;
};

// ==================== استخراج قائمة المسلسلات ====================
const extractSeriesList = async (pageNum, httpClient) => {
    const url = pageNum === 1 
        ? "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/"
        : `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/page/${pageNum}/`;
    
    console.log(`\n📺 صفحة ${pageNum}: ${url}`);
    
    const doc = await fetchPageData(url, httpClient);
    if (!doc) return { success: false, series: [], isEmpty: true };
    
    const series = [];
    const elements = doc.querySelectorAll('.Small--Box a');
    
    // تحقق إذا كانت الصفحة فارغة (انتهى المحتوى)
    if (elements.length === 0) {
        // تحقق من وجود رسالة خطأ
        const errorMsg = doc.querySelector('.error, .not-found, .no-results');
        if (errorMsg || !doc.querySelector('.main-content, .posts, .articles')) {
            console.log(`   ℹ️ الصفحة ${pageNum} لا تحتوي على مسلسلات (نهاية المحتوى)`);
            return { success: true, series: [], isEmpty: true };
        }
    }
    
    elements.forEach((el, i) => {
        const seriesUrl = el.href;
        if (seriesUrl?.includes('topcinema.rip')) {
            series.push({
                url: seriesUrl,
                title: cleanText(el.querySelector('.title')?.textContent || el.textContent),
                image: el.querySelector('img')?.src,
                seasonsCount: cleanText(el.querySelector('.number.Collection span')?.textContent),
                page: pageNum,
                position: i + 1
            });
        }
    });
    
    if (series.length === 0) {
        console.log(`   ℹ️ الصفحة ${pageNum} لا تحتوي على مسلسلات`);
        return { success: true, series: [], isEmpty: true };
    }
    
    console.log(`✅ وجد ${series.length} مسلسل`);
    return { success: true, series, isEmpty: false };
};

// ==================== استخراج تفاصيل المسلسل ====================
const extractSeriesDetails = async (seriesData, httpClient) => {
    console.log(`   🎬 ${seriesData.title.substring(0, 40)}...`);
    
    const doc = await fetchPageData(seriesData.url, httpClient);
    if (!doc) return null;
    
    const shortLink = doc.querySelector('#shortlink')?.value || seriesData.url;
    
    const details = {};
    doc.querySelectorAll(".RightTaxContent li").forEach(item => {
        const labelElement = item.querySelector("span");
        if (labelElement) {
            const label = cleanText(labelElement.textContent).replace(":", "").trim();
            if (label) {
                const links = item.querySelectorAll("a");
                if (links.length > 0) {
                    details[label] = Array.from(links).map(a => cleanText(a.textContent));
                } else {
                    const text = cleanText(item.textContent);
                    const value = text.split(":").slice(1).join(":").trim();
                    details[label] = value;
                }
            }
        }
    });
    
    return {
        id: extractId(shortLink),
        title: cleanText(doc.querySelector(".post-title a")?.textContent) || seriesData.title,
        url: seriesData.url,
        shortLink,
        image: doc.querySelector(".image img")?.src || seriesData.image,
        imdbRating: cleanText(doc.querySelector(".imdbR span")?.textContent),
        story: cleanText(doc.querySelector(".story p")?.textContent) || "غير متوفر",
        details,
        page: seriesData.page,
        position: seriesData.position,
        scrapedAt: new Date().toISOString()
    };
};

// ==================== استخراج المواسم ====================
const extractSeasons = async (seriesUrl, httpClient) => {
    console.log(`   📅 جاري استخراج المواسم...`);
    
    const doc = await fetchPageData(seriesUrl, httpClient);
    if (!doc) return [];
    
    const seasons = [];
    const seasonElements = doc.querySelectorAll('.Small--Box.Season');
    
    seasonElements.forEach((el, i) => {
        const link = el.querySelector('a');
        if (link?.href) {
            const seasonNumber = i + 1;
            seasons.push({
                url: link.href,
                title: cleanText(el.querySelector('.title')?.textContent) || `الموسم ${seasonNumber}`,
                image: el.querySelector('img')?.src,
                seasonNumber,
                position: i + 1
            });
        }
    });
    
    // إذا لم نجد مواسم بالطريقة الأولى، ابحث عن روابط مواسم
    if (seasons.length === 0) {
        const seasonLinks = doc.querySelectorAll('a[href*="season"], a[href*="موسم"]');
        seasonLinks.forEach((link, i) => {
            if (link.href?.includes('topcinema.rip')) {
                const seasonNumber = i + 1;
                seasons.push({
                    url: link.href,
                    title: cleanText(link.textContent) || `الموسم ${seasonNumber}`,
                    seasonNumber,
                    position: i + 1
                });
            }
        });
    }
    
    console.log(`   ✅ وجد ${seasons.length} موسم`);
    return seasons;
};

// ==================== استخراج تفاصيل الموسم ====================
const extractSeasonDetails = async (seasonData, seriesId, httpClient) => {
    console.log(`     🎞️ الموسم ${seasonData.seasonNumber}`);
    
    const doc = await fetchPageData(seasonData.url, httpClient);
    if (!doc) return null;
    
    const shortLink = doc.querySelector('#shortlink')?.value || seasonData.url;
    
    // البحث عن رابط التحميل الكامل
    const downloadLink = doc.querySelector('a.downloadFullSeason, a[href*="download"][href*="season"]')?.href;
    
    let downloadServers = {};
    if (downloadLink) {
        const downloadDoc = await fetchPageData(downloadLink, httpClient);
        if (downloadDoc) {
            downloadServers = await extractDownloadServers(downloadDoc);
        }
    }
    
    return {
        id: extractId(shortLink),
        seriesId,
        seasonNumber: seasonData.seasonNumber,
        title: cleanText(doc.querySelector(".post-title a")?.textContent) || seasonData.title,
        url: seasonData.url,
        shortLink,
        image: doc.querySelector(".image img")?.src || seasonData.image,
        fullDownloadUrl: downloadLink,
        downloadServers,
        scrapedAt: new Date().toISOString()
    };
};

// ==================== استخراج الحلقات ====================
const extractEpisodes = async (seasonUrl, httpClient) => {
    console.log(`       📺 جاري استخراج الحلقات...`);
    
    const doc = await fetchPageData(seasonUrl, httpClient);
    if (!doc) return [];
    
    const episodes = [];
    
    // الطريقة الأولى: قسم الحلقات المحدد
    const episodeSection = doc.querySelector('section.allepcont.getMoreByScroll');
    
    if (episodeSection) {
        const links = episodeSection.querySelectorAll('a[href*="topcinema.rip"]');
        
        links.forEach((link, i) => {
            const episodeNumber = i + 1;
            episodes.push({
                url: link.href,
                title: cleanText(link.querySelector('.ep-info h2, h2, .title')?.textContent || link.textContent) || `الحلقة ${episodeNumber}`,
                episodeNumber,
                position: i + 1
            });
        });
    }
    
    // الطريقة الثانية: البحث عن روابط حلقات
    if (episodes.length === 0) {
        const episodeLinks = doc.querySelectorAll('a[href*="حلقة"], a[href*="episode"]');
        episodeLinks.forEach((link, i) => {
            if (link.href?.includes('topcinema.rip')) {
                const episodeNumber = i + 1;
                episodes.push({
                    url: link.href,
                    title: cleanText(link.textContent) || `الحلقة ${episodeNumber}`,
                    episodeNumber,
                    position: i + 1
                });
            }
        });
    }
    
    console.log(`       ✅ وجد ${episodes.length} حلقة`);
    return episodes;
};

// ==================== استخراج تفاصيل الحلقة ====================
const extractEpisodeDetails = async (episodeData, seriesId, seasonId, httpClient) => {
    console.log(`         🎥 الحلقة ${episodeData.episodeNumber}`);
    
    const doc = await fetchPageData(episodeData.url, httpClient);
    if (!doc) return null;
    
    const shortLink = doc.querySelector('#shortlink')?.value || episodeData.url;
    
    // البحث عن رابط المشاهدة
    let watchServer = doc.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"]')?.content;
    if (!watchServer) {
        watchServer = doc.querySelector('a.watch[href*="/watch/"]')?.href;
    }
    
    // البحث عن روابط التحميل
    let downloadServers = {};
    const downloadLink = doc.querySelector('a[href*="download"]')?.href;
    
    if (downloadLink) {
        const downloadDoc = await fetchPageData(downloadLink, httpClient);
        if (downloadDoc) {
            downloadServers = await extractDownloadServers(downloadDoc);
        }
    } else {
        downloadServers = await extractDownloadServers(doc);
    }
    
    return {
        id: extractId(shortLink),
        seriesId,
        seasonId,
        episodeNumber: episodeData.episodeNumber,
        title: episodeData.title,
        url: episodeData.url,
        shortLink,
        watchServer,
        downloadServers,
        scrapedAt: new Date().toISOString()
    };
};

// ==================== مراقبة الصفحة الرئيسية ====================
const fetchHomeSeries = async (httpClient) => {
    console.log("\n🏠 جلب المسلسلات من الصفحة الرئيسية");
    
    const url = "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    const doc = await fetchPageData(url, httpClient);
    
    if (!doc) return [];
    
    const series = [];
    const elements = doc.querySelectorAll('.Small--Box a');
    
    elements.forEach((el, i) => {
        if (el.href?.includes('topcinema.rip')) {
            series.push({
                url: el.href,
                title: cleanText(el.querySelector('.title')?.textContent || el.textContent),
                image: el.querySelector('img')?.src,
                seasonsCount: cleanText(el.querySelector('.number.Collection span')?.textContent),
                fromHomePage: true,
                position: i + 1,
                lastSeen: new Date().toISOString()
            });
        }
    });
    
    console.log(`✅ وجد ${series.length} مسلسل في الصفحة الرئيسية`);
    return series;
};

// ==================== المعالج الرئيسي ====================
class SeriesScraper {
    constructor() {
        this.cache = new CacheManager(CACHE_DIR);
        this.http = new HttpClient(this.cache);
        this.progress = new ProgressTracker();
        this.storage = new StorageManager(this.progress);
        this.stats = {
            pagesProcessed: 0,
            seriesProcessed: 0,
            seasonsProcessed: 0,
            episodesProcessed: 0,
            startTime: Date.now()
        };
    }

    async processSeriesPage(pageNum) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📊 معالجة صفحة المسلسلات ${pageNum}`);
        console.log(`${'='.repeat(50)}`);
        
        const result = await extractSeriesList(pageNum, this.http);
        
        if (!result.success || result.isEmpty) {
            console.log(`\n🏁 وصلنا إلى نهاية المسلسلات في الصفحة ${pageNum}`);
            return false;
        }
        
        const seriesList = result.series;
        let seriesProcessed = 0;
        
        for (let i = 0; i < seriesList.length; i++) {
            const series = seriesList[i];
            
            // التحقق من وجود المسلسل مسبقاً
            const details = await extractSeriesDetails(series, this.http);
            if (!details) continue;
            
            const exists = await this.storage.itemExists(TV_SERIES_DIR, details.id);
            
            if (!exists) {
                // حفظ المسلسل الجديد
                const fileName = `Page${this.progress.seriesFileNumber}.json`;
                await this.storage.saveItem(TV_SERIES_DIR, fileName, details, 'series');
                seriesProcessed++;
                this.stats.seriesProcessed++;
                
                // استخراج المواسم
                const seasons = await extractSeasons(details.url, this.http);
                
                for (const season of seasons) {
                    const seasonDetails = await extractSeasonDetails(season, details.id, this.http);
                    if (!seasonDetails) continue;
                    
                    // حفظ الموسم
                    const seasonFileName = `Page${this.progress.seasonFileNumber}.json`;
                    await this.storage.saveItem(SEASONS_DIR, seasonFileName, seasonDetails, 'seasons');
                    this.stats.seasonsProcessed++;
                    
                    // استخراج الحلقات
                    const episodes = await extractEpisodes(seasonDetails.url, this.http);
                    
                    for (const episode of episodes) {
                        const episodeDetails = await extractEpisodeDetails(episode, details.id, seasonDetails.id, this.http);
                        if (!episodeDetails) continue;
                        
                        // حفظ الحلقة
                        const episodeFileName = `Page${this.progress.episodeFileNumber}.json`;
                        await this.storage.saveItem(EPISODES_DIR, episodeFileName, episodeDetails, 'episodes');
                        this.stats.episodesProcessed++;
                        
                        // تأخير بين الحلقات
                        await delay(500);
                    }
                    
                    // تأخير بين المواسم
                    await delay(1000);
                }
            } else {
                console.log(`   ✅ موجود مسبقاً (تخطي)`);
            }
            
            // عرض تقدم المسلسلات
            console.log(`   ✅ تقدم: ${i + 1}/${seriesList.length} مسلسل`);
            
            // تأخير بين المسلسلات
            await delay(1500);
        }
        
        console.log(`\n📊 نتائج الصفحة ${pageNum}:`);
        console.log(`   🆕 مسلسلات جديدة: ${seriesProcessed}`);
        console.log(`   📊 إجمالي المسلسلات: ${seriesList.length}`);
        
        return true;
    }

    async monitorHomePage() {
        console.log("\n" + "=".repeat(50));
        console.log("🏁 بدء مراقبة الصفحة الرئيسية");
        console.log("=".repeat(50));
        
        const homeSeries = await fetchHomeSeries(this.http);
        
        // حفظ الصفحة الرئيسية
        const homeData = {
            info: {
                type: 'home_series',
                fileName: 'Home.json',
                totalItems: homeSeries.length,
                lastUpdated: new Date().toISOString()
            },
            data: homeSeries
        };
        
        fs.writeFileSync(HOME_SERIES_FILE, JSON.stringify(homeData, null, 2));
        console.log(`💾 تم تحديث Home.json (${homeSeries.length} مسلسل)`);
        
        let newCount = 0;
        
        for (let i = 0; i < Math.min(homeSeries.length, 10); i++) { // نفحص أول 10 مسلسلات فقط في كل مرة
            const series = homeSeries[i];
            console.log(`\n📊 [${i + 1}/10] ${series.title.substring(0, 40)}...`);
            
            const details = await extractSeriesDetails(series, this.http);
            if (!details) continue;
            
            const exists = await this.storage.itemExists(TV_SERIES_DIR, details.id);
            
            if (!exists) {
                newCount++;
                console.log(`   🆕 مسلسل جديد!`);
                
                // حفظ المسلسل الجديد
                const fileName = `Page${this.progress.seriesFileNumber}.json`;
                await this.storage.saveItem(TV_SERIES_DIR, fileName, details, 'series');
                
                // استخراج مواسمه
                const seasons = await extractSeasons(details.url, this.http);
                for (const season of seasons) {
                    const seasonDetails = await extractSeasonDetails(season, details.id, this.http);
                    if (!seasonDetails) continue;
                    
                    const seasonFileName = `Page${this.progress.seasonFileNumber}.json`;
                    await this.storage.saveItem(SEASONS_DIR, seasonFileName, seasonDetails, 'seasons');
                }
            }
            
            await delay(1000);
        }
        
        console.log(`\n📊 نتائج المراقبة:`);
        console.log(`   🆕 مسلسلات جديدة: ${newCount}`);
        console.log(`   📊 إجمالي مسلسلات الصفحة الرئيسية: ${homeSeries.length}`);
    }

    async run() {
        console.log("\n" + "=".repeat(60));
        console.log("🎬 نظام استخراج المسلسلات - توب سينما");
        console.log("=".repeat(60));
        
        console.log(`📊 الإحصائيات الحالية:`);
        console.log(`   📺 مسلسلات: ${this.progress.totalExtracted.series}`);
        console.log(`   📅 مواسم: ${this.progress.totalExtracted.seasons}`);
        console.log(`   🎥 حلقات: ${this.progress.totalExtracted.episodes}`);
        console.log(`   📄 الصفحة الحالية: ${this.progress.seriesPage}`);
        console.log(`   📊 إجمالي الصفحات المستخرجة: ${this.progress.totalPagesScraped}`);
        
        console.log(`\n🎯 سيتم استخراج ${CONFIG.pagesPerRun} صفحات في هذه الجلسة`);
        
        this.progress.resetSession();
        
        // استخراج الصفحات المطلوبة
        while (this.progress.canProcessMorePages()) {
            const currentPage = this.progress.seriesPage;
            const hasMore = await this.processSeriesPage(currentPage);
            
            if (!hasMore) {
                console.log(`\n🏁 تم استخراج جميع الصفحات المتاحة (إجمالي ${this.progress.totalPagesScraped} صفحة)`);
                break;
            }
            
            this.progress.markPageProcessed(true);
            this.stats.pagesProcessed++;
            
            if (this.progress.canProcessMorePages()) {
                console.log(`\n⏳ انتظار 5 ثواني قبل الصفحة التالية...`);
                await delay(5000);
            }
        }
        
        // عرض إحصائيات الجلسة
        const elapsed = this.progress.getElapsedTime();
        const endTime = Date.now();
        const totalTime = ((endTime - this.stats.startTime) / 1000).toFixed(1);
        
        console.log("\n" + "=".repeat(60));
        console.log("📊 تقرير نهاية الجلسة");
        console.log("=".repeat(60));
        
        console.log(`⏱️ وقت التنفيذ: ${totalTime} ثانية`);
        console.log(`📊 الصفحات المعالجة: ${this.stats.pagesProcessed}`);
        console.log(`   🆕 مسلسلات جديدة: ${this.stats.seriesProcessed}`);
        console.log(`   🆕 مواسم جديدة: ${this.stats.seasonsProcessed}`);
        console.log(`   🆕 حلقات جديدة: ${this.stats.episodesProcessed}`);
        
        console.log(`\n📊 الإحصائيات التراكمية:`);
        console.log(`   📺 إجمالي المسلسلات: ${this.progress.totalExtracted.series}`);
        console.log(`   📅 إجمالي المواسم: ${this.progress.totalExtracted.seasons}`);
        console.log(`   🎥 إجمالي الحلقات: ${this.progress.totalExtracted.episodes}`);
        console.log(`   📄 آخر صفحة: ${this.progress.seriesPage}`);
        console.log(`   📊 إجمالي الصفحات: ${this.progress.totalPagesScraped}`);
        
        // إحصائيات HTTP
        const httpStats = this.http.getStats();
        console.log(`\n🌐 إحصائيات الطلبات:`);
        console.log(`   📤 طلبات ناجحة: ${httpStats.totalRequests}`);
        console.log(`   💾 من الكاش: ${httpStats.cacheHits}`);
        console.log(`   ❌ طلبات فاشلة: ${httpStats.failedRequests}`);
        
        // إذا اكتملت الصفحات، انتقل لوضع المراقبة
        if (this.progress.totalPagesScraped >= 55) { // افترض أن الموقع يحتوي على 55 صفحة
            console.log(`\n🔄 تم استخراج 55 صفحة، الانتقال لوضع مراقبة الصفحة الرئيسية...`);
            await this.monitorHomePage();
        }
        
        console.log("\n" + "=".repeat(60));
        console.log("✅ اكتملت الجلسة بنجاح");
        console.log("=".repeat(60));
        
        // حفظ تقرير الجلسة
        const sessionReport = {
            timestamp: new Date().toISOString(),
            duration: totalTime,
            pagesProcessed: this.stats.pagesProcessed,
            newSeries: this.stats.seriesProcessed,
            newSeasons: this.stats.seasonsProcessed,
            newEpisodes: this.stats.episodesProcessed,
            currentPage: this.progress.seriesPage,
            totalPages: this.progress.totalPagesScraped,
            totalSeries: this.progress.totalExtracted.series,
            totalSeasons: this.progress.totalExtracted.seasons,
            totalEpisodes: this.progress.totalExtracted.episodes,
            httpStats: httpStats
        };
        
        const reportFile = path.join(LOGS_DIR, `session_${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(sessionReport, null, 2));
        console.log(`📄 تم حفظ تقرير الجلسة في: ${reportFile}`);
    }
}

// ==================== التشغيل ====================
const scraper = new SeriesScraper();
scraper.run().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error(error.stack);
    
    // حفظ خطأ
    const errorReport = {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
    };
    
    const errorFile = path.join(LOGS_DIR, `error_${Date.now()}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorReport, null, 2));
    console.log(`❌ تم حفظ الخطأ في: ${errorFile}`);
    process.exit(1);
});
