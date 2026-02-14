import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";
import https from "https";

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
const UPDATE_TRACKER_FILE = path.join(AG_SERIES_DIR, "update_tracker.json");

// إنشاء المجلدات بشكل متوازي
const createDirectories = async () => {
    console.log("📁 جاري إنشاء المجلدات...");
    const dirs = [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, CACHE_DIR];
    
    await Promise.all(dirs.map(async (dir) => {
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${path.basename(dir)}`);
        }
    }));
    
    console.log("✅ اكتمل إنشاء المجلدات\n");
};

await createDirectories();

// ==================== إعدادات النظام المحسنة ====================
const CONFIG = {
    itemsPerFile: {
        series: 50,
        seasons: 100,
        episodes: 500
    },
    pagesPerRun: 3, // بالضبط 3 صفحات في كل تشغيل
    requestDelay: 1000, // 1 ثانية بين الطلبات
    maxRetries: 3,
    concurrentRequests: 2, // طلبين متوازيين كحد أقصى
    cacheTTL: 3600000, // ساعة واحدة للتخزين المؤقت
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
        const hash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_');
        return path.join(this.cacheDir, `${hash}.json`);
    }

    async get(url) {
        // فحص الذاكرة المؤقتة أولاً
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
                const stats = await fs.promises.stat(cachePath);
                if (Date.now() - stats.mtimeMs < this.ttl) {
                    const data = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
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
        // تخزين في الذاكرة
        this.memoryCache.set(url, { data, timestamp: Date.now() });

        // تخزين في ملف (بشكل غير متزامن دون انتظار)
        const cachePath = this.getCachePath(url);
        fs.promises.writeFile(cachePath, JSON.stringify(data, null, 2)).catch(() => {});
    }

    clear() {
        this.memoryCache.clear();
    }
}

// ==================== نظام طلبات HTTP محسّن ====================
class HttpClient {
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
        this.requestQueue = [];
        this.activeRequests = 0;
        this.lastRequestTime = 0;
    }

    async fetch(url, useCache = true) {
        if (useCache) {
            const cached = await this.cacheManager.get(url);
            if (cached) {
                console.log(`   🔵 من الكاش: ${url.substring(0, 50)}...`);
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
            
            // تخزين في الكاش
            await this.cacheManager.set(url, result);
            
            resolve(result);
        } catch (error) {
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
                    throw new Error(`HTTP ${response.status}`);
                }

                const html = await response.text();
                return html;

            } catch (error) {
                if (i === retries - 1) throw error;
            }
        }
    }
}

// ==================== نظام تتبع التقدم المحسّن ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
        this.startTime = performance.now();
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
                
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.targetPages = CONFIG.pagesPerRun;
                this.mode = data.mode || "scrape_series";
                this.allPagesScraped = data.allPagesScraped || false;
                
                this.totalExtracted = data.totalExtracted || {
                    series: 0,
                    seasons: 0,
                    episodes: 0
                };
                
                console.log(`📊 تم استئناف العمل من الصفحة ${this.seriesPage}`);
                console.log(`🎯 سيتم استخراج ${this.targetPages} صفحات في هذا التشغيل`);
                
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
        this.pagesProcessedThisRun = 0;
        this.targetPages = CONFIG.pagesPerRun;
        this.mode = "scrape_series";
        this.allPagesScraped = false;
        this.totalExtracted = { series: 0, seasons: 0, episodes: 0 };
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
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            targetPages: this.targetPages,
            mode: this.mode,
            allPagesScraped: this.allPagesScraped,
            totalExtracted: this.totalExtracted,
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }

    canProcessMorePages() {
        return this.pagesProcessedThisRun < this.targetPages && !this.allPagesScraped;
    }

    markPageProcessed() {
        this.pagesProcessedThisRun++;
        this.seriesPage++;
        this.saveProgress();
        
        console.log(`\n📊 تقدم التشغيل: ${this.pagesProcessedThisRun}/${this.targetPages} صفحات`);
    }

    addToCount(type) {
        this.totalExtracted[type]++;
        
        switch(type) {
            case 'series':
                this.seriesInCurrentFile++;
                if (this.seriesInCurrentFile >= CONFIG.itemsPerFile.series) {
                    this.seriesFileNumber++;
                    this.seriesInCurrentFile = 0;
                }
                break;
            case 'seasons':
                this.seasonsInCurrentFile++;
                if (this.seasonsInCurrentFile >= CONFIG.itemsPerFile.seasons) {
                    this.seasonFileNumber++;
                    this.seasonsInCurrentFile = 0;
                }
                break;
            case 'episodes':
                this.episodesInCurrentFile++;
                if (this.episodesInCurrentFile >= CONFIG.itemsPerFile.episodes) {
                    this.episodeFileNumber++;
                    this.episodesInCurrentFile = 0;
                }
                break;
        }
        
        this.saveProgress();
    }

    getElapsedTime() {
        return ((performance.now() - this.startTime) / 1000).toFixed(1);
    }
}

// ==================== نظام الحفظ المحسّن ====================
class StorageManager {
    constructor(progress) {
        this.progress = progress;
        this.writeQueue = [];
        this.isWriting = false;
    }

    async saveItem(directory, fileName, item, type) {
        const filePath = path.join(directory, fileName);
        
        return new Promise((resolve) => {
            this.writeQueue.push({ filePath, item, type, resolve });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isWriting || this.writeQueue.length === 0) return;
        
        this.isWriting = true;
        
        while (this.writeQueue.length > 0) {
            const batch = this.writeQueue.splice(0, 5); // معالجة 5 عمليات في الدفعة
            
            await Promise.all(batch.map(async ({ filePath, item, type, resolve }) => {
                try {
                    let data = { info: {}, data: [] };
                    
                    if (fs.existsSync(filePath)) {
                        const content = await fs.promises.readFile(filePath, 'utf8');
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
                    
                    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
                    this.progress.addToCount(type);
                    
                    resolve({ success: true, file: path.basename(filePath) });
                } catch (error) {
                    console.log(`⚠️ خطأ في الحفظ: ${error.message}`);
                    resolve({ success: false, error: error.message });
                }
            }));
            
            // تأخير صغير بين الدفعات
            if (this.writeQueue.length > 0) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        this.isWriting = false;
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

// ==================== استخراج البيانات الأساسية ====================
const extractDownloadServers = async (doc, httpClient) => {
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
        
        // سيرفر Pro
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
    if (!doc) return [];
    
    const series = [];
    const elements = doc.querySelectorAll('.Small--Box a');
    
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
    
    console.log(`✅ وجد ${series.length} مسلسل`);
    return series;
};

// ==================== استخراج تفاصيل المسلسل ====================
const extractSeriesDetails = async (seriesData, httpClient) => {
    console.log(`   🎬 ${seriesData.title.substring(0, 40)}...`);
    
    const doc = await fetchPageData(seriesData.url, httpClient);
    if (!doc) return null;
    
    const shortLink = doc.querySelector('#shortlink')?.value || seriesData.url;
    
    const details = {};
    doc.querySelectorAll(".RightTaxContent li").forEach(item => {
        const label = item.querySelector("span")?.textContent?.replace(":", "").trim();
        if (label) {
            const links = item.querySelectorAll("a");
            details[label] = links.length ? Array.from(links).map(a => cleanText(a.textContent)) : cleanText(item.textContent.split(":").slice(1).join(":"));
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
            const seasonNum = i + 1;
            seasons.push({
                url: link.href,
                title: cleanText(el.querySelector('.title')?.textContent) || `الموسم ${seasonNum}`,
                image: el.querySelector('img')?.src,
                seasonNumber: seasonNum,
                position: i + 1
            });
        }
    });
    
    console.log(`   ✅ وجد ${seasons.length} موسم`);
    return seasons;
};

// ==================== استخراج تفاصيل الموسم ====================
const extractSeasonDetails = async (seasonData, seriesId, httpClient) => {
    console.log(`     🎞️ الموسم ${seasonData.seasonNumber}`);
    
    const doc = await fetchPageData(seasonData.url, httpClient);
    if (!doc) return null;
    
    const shortLink = doc.querySelector('#shortlink')?.value || seasonData.url;
    
    // محاولة العثور على رابط التحميل الكامل
    const downloadLink = doc.querySelector('a.downloadFullSeason, a[href*="download"][href*="season"]')?.href;
    
    let downloadServers = {};
    if (downloadLink) {
        const downloadDoc = await fetchPageData(downloadLink, httpClient);
        if (downloadDoc) {
            downloadServers = await extractDownloadServers(downloadDoc, httpClient);
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
    const episodeSection = doc.querySelector('section.allepcont.getMoreByScroll');
    
    if (episodeSection) {
        const links = episodeSection.querySelectorAll('a[href*="topcinema.rip"]');
        
        links.forEach((link, i) => {
            const episodeNum = i + 1;
            episodes.push({
                url: link.href,
                title: cleanText(link.querySelector('.ep-info h2')?.textContent || link.textContent) || `الحلقة ${episodeNum}`,
                episodeNumber: episodeNum,
                position: i + 1
            });
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
            downloadServers = await extractDownloadServers(downloadDoc, httpClient);
        }
    } else {
        downloadServers = await extractDownloadServers(doc, httpClient);
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

// ==================== الصفحة الرئيسية ====================
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
    }

    async processSeriesPage(pageNum) {
        console.log(`\n📊 معالجة صفحة المسلسلات ${pageNum}`);
        
        const seriesList = await extractSeriesList(pageNum, this.http);
        if (seriesList.length === 0) {
            this.progress.allPagesScraped = true;
            return false;
        }
        
        for (let i = 0; i < seriesList.length; i++) {
            const series = seriesList[i];
            
            const details = await extractSeriesDetails(series, this.http);
            if (!details) continue;
            
            // حفظ المسلسل
            const fileName = `Page${this.progress.seriesFileNumber}.json`;
            await this.storage.saveItem(TV_SERIES_DIR, fileName, details, 'series');
            
            // استخراج المواسم
            const seasons = await extractSeasons(details.url, this.http);
            
            for (const season of seasons) {
                const seasonDetails = await extractSeasonDetails(season, details.id, this.http);
                if (!seasonDetails) continue;
                
                // حفظ الموسم
                const seasonFileName = `Page${this.progress.seasonFileNumber}.json`;
                await this.storage.saveItem(SEASONS_DIR, seasonFileName, seasonDetails, 'seasons');
                
                // استخراج الحلقات
                const episodes = await extractEpisodes(seasonDetails.url, this.http);
                
                for (const episode of episodes) {
                    const episodeDetails = await extractEpisodeDetails(episode, details.id, seasonDetails.id, this.http);
                    if (!episodeDetails) continue;
                    
                    // حفظ الحلقة
                    const episodeFileName = `Page${this.progress.episodeFileNumber}.json`;
                    await this.storage.saveItem(EPISODES_DIR, episodeFileName, episodeDetails, 'episodes');
                    
                    // تأخير بين الحلقات
                    await new Promise(r => setTimeout(r, 500));
                }
                
                // تأخير بين المواسم
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // تأخير بين المسلسلات
            await new Promise(r => setTimeout(r, 1500));
            
            // عرض تقدم المسلسلات
            console.log(`   ✅ اكتمل ${i + 1}/${seriesList.length} مسلسل`);
        }
        
        return true;
    }

    async monitorHomePage() {
        console.log("\n🏁 بدء مراقبة الصفحة الرئيسية");
        
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
        
        await fs.promises.writeFile(HOME_SERIES_FILE, JSON.stringify(homeData, null, 2));
        console.log(`💾 تم تحديث Home.json (${homeSeries.length} مسلسل)`);
        
        let newCount = 0;
        let updatedCount = 0;
        
        for (let i = 0; i < homeSeries.length; i++) {
            const series = homeSeries[i];
            console.log(`\n📊 [${i + 1}/${homeSeries.length}] ${series.title.substring(0, 40)}...`);
            
            const details = await extractSeriesDetails(series, this.http);
            if (!details) continue;
            
            // التحقق من وجود المسلسل
            const seriesExists = await this.checkSeriesExists(details.id);
            
            if (!seriesExists) {
                newCount++;
                console.log(`   🆕 مسلسل جديد`);
                
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
            } else {
                console.log(`   ✅ مسجل مسبقاً`);
                updatedCount++;
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
        console.log(`\n📊 نتائج المراقبة:`);
        console.log(`   🆕 مسلسلات جديدة: ${newCount}`);
        console.log(`   🔄 مسلسلات موجودة: ${updatedCount}`);
    }

    async checkSeriesExists(seriesId) {
        try {
            const files = await fs.promises.readdir(TV_SERIES_DIR);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const content = JSON.parse(await fs.promises.readFile(path.join(TV_SERIES_DIR, file), 'utf8'));
                if (content.data?.some(item => item.id === seriesId)) {
                    return true;
                }
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
        return false;
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
        
        if (this.progress.mode === 'scrape_series') {
            console.log(`\n🎯 سيتم استخراج ${this.progress.targetPages} صفحات`);
            
            while (this.progress.canProcessMorePages()) {
                const currentPage = this.progress.seriesPage;
                const hasMore = await this.processSeriesPage(currentPage);
                
                if (!hasMore) {
                    console.log("\n🏁 تم استخراج جميع الصفحات!");
                    this.progress.allPagesScraped = true;
                    break;
                }
                
                this.progress.markPageProcessed();
                
                if (this.progress.canProcessMorePages()) {
                    console.log(`\n⏳ انتظار 3 ثواني قبل الصفحة التالية...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
            
            // إذا اكتملت جميع الصفحات، انتقل لوضع المراقبة
            if (this.progress.allPagesScraped) {
                console.log(`\n🔄 الانتقال لوضع مراقبة الصفحة الرئيسية...`);
                this.progress.mode = 'monitor_home';
                this.progress.saveProgress();
                await this.monitorHomePage();
            }
            
        } else if (this.progress.mode === 'monitor_home') {
            await this.monitorHomePage();
        }
        
        // تقرير النهاية
        const elapsed = this.progress.getElapsedTime();
        console.log("\n" + "=".repeat(60));
        console.log(`✅ اكتمل التشغيل بنجاح في ${elapsed} ثانية`);
        console.log(`📊 الإحصائيات النهائية:`);
        console.log(`   📺 مسلسلات: ${this.progress.totalExtracted.series}`);
        console.log(`   📅 مواسم: ${this.progress.totalExtracted.seasons}`);
        console.log(`   🎥 حلقات: ${this.progress.totalExtracted.episodes}`);
        console.log("=".repeat(60));
    }
}

// ==================== التشغيل ====================
const scraper = new SeriesScraper();
scraper.run().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
