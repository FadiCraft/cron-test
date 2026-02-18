import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== إعدادات المسارات ====================
const SERIES_DIR = path.join(__dirname, "Series");
const AG_SERIES_DIR = path.join(SERIES_DIR, "AgSeries");
const TV_SERIES_DIR = path.join(AG_SERIES_DIR, "TV_Series");
const SEASONS_DIR = path.join(AG_SERIES_DIR, "Seasons");
const EPISODES_DIR = path.join(AG_SERIES_DIR, "Episodes");
const PROGRESS_FILE = path.join(AG_SERIES_DIR, "series_progress.json");
const HOME_SERIES_FILE = path.join(TV_SERIES_DIR, "Home.json");
const UPDATE_TRACKER_FILE = path.join(AG_SERIES_DIR, "update_tracker.json");
const REPORT_FILE = path.join(AG_SERIES_DIR, "scraper_report.json");
const ERROR_FILE = path.join(AG_SERIES_DIR, "scraper_error.json");
const DEBUG_FILE = path.join(AG_SERIES_DIR, "debug_log.json");

// إنشاء المجلدات إذا لم تكن موجودة
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${dir}`);
        }
    });
    console.log("✅ اكتمل إنشاء المجلدات\n");
};

createDirectories();

// ==================== إعدادات النظام ====================
const ITEMS_PER_FILE = {
    series: 50,
    seasons: 100,
    episodes: 500
};

const PAGES_PER_RUN = 1;
const DELAY_BETWEEN_REQUESTS = 2000;
const MAX_RETRIES = 3;

// ==================== نظام التصحيح ====================
class DebugLogger {
    constructor() {
        this.logs = [];
        this.loadDebug();
    }
    
    loadDebug() {
        try {
            if (fs.existsSync(DEBUG_FILE)) {
                this.logs = JSON.parse(fs.readFileSync(DEBUG_FILE, 'utf8'));
            } else {
                this.logs = [];
            }
        } catch (error) {
            this.logs = [];
        }
    }
    
    log(type, message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: type,
            message: message,
            data: data
        };
        
        this.logs.push(entry);
        
        if (this.logs.length > 500) {
            this.logs = this.logs.slice(-500);
        }
        
        fs.writeFileSync(DEBUG_FILE, JSON.stringify(this.logs, null, 2));
        
        console.log(`🔍 [${type}] ${message}`);
        if (data) {
            console.log(`   📊 البيانات:`, data);
        }
    }
    
    clear() {
        this.logs = [];
        fs.writeFileSync(DEBUG_FILE, JSON.stringify([], null, 2));
    }
}

const debug = new DebugLogger();

// ==================== نظام تتبع التحديثات ====================
class UpdateTracker {
    constructor() {
        this.loadTracker();
    }
    
    loadTracker() {
        try {
            if (fs.existsSync(UPDATE_TRACKER_FILE)) {
                const data = JSON.parse(fs.readFileSync(UPDATE_TRACKER_FILE, 'utf8'));
                this.seriesLastChecked = data.seriesLastChecked || {};
                this.seasonsLastChecked = data.seasonsLastChecked || {};
                this.episodesLastChecked = data.episodesLastChecked || {};
                this.updateLog = data.updateLog || [];
                this.homeSeriesHistory = data.homeSeriesHistory || [];
            } else {
                this.seriesLastChecked = {};
                this.seasonsLastChecked = {};
                this.episodesLastChecked = {};
                this.updateLog = [];
                this.homeSeriesHistory = [];
                this.saveTracker();
            }
        } catch (error) {
            debug.log('ERROR', 'لا يمكن تحميل متتبع التحديثات', error.message);
            this.seriesLastChecked = {};
            this.seasonsLastChecked = {};
            this.episodesLastChecked = {};
            this.updateLog = [];
            this.homeSeriesHistory = [];
            this.saveTracker();
        }
    }
    
    saveTracker() {
        const trackerData = {
            seriesLastChecked: this.seriesLastChecked,
            seasonsLastChecked: this.seasonsLastChecked,
            episodesLastChecked: this.episodesLastChecked,
            updateLog: this.updateLog.slice(-100),
            homeSeriesHistory: this.homeSeriesHistory.slice(-50),
            lastUpdated: new Date().toISOString()
        };
        
        fs.writeFileSync(UPDATE_TRACKER_FILE, JSON.stringify(trackerData, null, 2));
    }
    
    markSeriesChecked(seriesId, seasonCount = null, episodeCount = null) {
        this.seriesLastChecked[seriesId] = {
            lastCheck: new Date().toISOString(),
            seasonCount: seasonCount,
            episodeCount: episodeCount
        };
        this.saveTracker();
    }
    
    markSeasonChecked(seasonId, episodeCount = null) {
        this.seasonsLastChecked[seasonId] = {
            lastCheck: new Date().toISOString(),
            episodeCount: episodeCount
        };
        this.saveTracker();
    }
    
    markEpisodeChecked(episodeId) {
        this.episodesLastChecked[episodeId] = new Date().toISOString();
        this.saveTracker();
    }
    
    logUpdate(type, id, title, changes) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            id: id,
            title: title,
            changes: changes
        };
        
        this.updateLog.push(logEntry);
        if (this.updateLog.length > 1000) {
            this.updateLog = this.updateLog.slice(-1000);
        }
        this.saveTracker();
        
        console.log(`📝 ${type} تحديث: ${title} - ${JSON.stringify(changes)}`);
    }
    
    recordHomeCheck(seriesList) {
        const record = {
            timestamp: new Date().toISOString(),
            count: seriesList.length,
            seriesIds: seriesList.map(s => s.id || extractIdFromShortLink(s.url)),
            seriesTitles: seriesList.map(s => s.title)
        };
        
        this.homeSeriesHistory.push(record);
        this.saveTracker();
        
        return record;
    }
    
    needsUpdateCheck(seriesId, hoursThreshold = 24) {
        if (!this.seriesLastChecked[seriesId]) return true;
        
        const lastCheck = new Date(this.seriesLastChecked[seriesId].lastCheck);
        const now = new Date();
        const hoursDiff = (now - lastCheck) / (1000 * 60 * 60);
        
        return hoursDiff >= hoursThreshold;
    }
}

// ==================== نظام التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
        this.updateTracker = new UpdateTracker();
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
                this.shouldStop = data.shouldStop || false;
                this.allPagesScraped = data.allPagesScraped || false;
                this.mode = data.mode || "scrape_series";
                
                this.currentSeriesId = data.currentSeriesId || null;
                this.currentSeasonId = data.currentSeasonId || null;
                
                this.currentSeriesFile = data.currentSeriesFile || "Page1.json";
                this.currentSeasonFile = data.currentSeasonFile || "Page1.json";
                this.currentEpisodeFile = data.currentEpisodeFile || "Page1.json";
                
                this.lastHomeUpdate = data.lastHomeUpdate || null;
                this.totalExtracted = data.totalExtracted || {
                    series: 0,
                    seasons: 0,
                    episodes: 0
                };
                
                this.lastHomeSeriesIds = data.lastHomeSeriesIds || [];
                
                debug.log('INFO', 'تم تحميل حالة التقدم', {
                    page: this.seriesPage,
                    mode: this.mode,
                    allPagesScraped: this.allPagesScraped
                });
                
            } else {
                debug.log('INFO', 'لا يوجد ملف تقدم، إنشاء جديد');
                this.resetProgress();
            }
        } catch (error) {
            debug.log('ERROR', 'خطأ في تحميل التقدم', error.message);
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
        this.shouldStop = false;
        this.allPagesScraped = false;
        this.mode = "scrape_series";
        
        this.currentSeriesId = null;
        this.currentSeasonId = null;
        
        this.currentSeriesFile = "Page1.json";
        this.currentSeasonFile = "Page1.json";
        this.currentEpisodeFile = "Page1.json";
        
        this.lastHomeUpdate = null;
        this.totalExtracted = {
            series: 0,
            seasons: 0,
            episodes: 0
        };
        
        this.lastHomeSeriesIds = [];
        
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
            shouldStop: this.shouldStop,
            allPagesScraped: this.allPagesScraped,
            mode: this.mode,
            
            currentSeriesId: this.currentSeriesId,
            currentSeasonId: this.currentSeasonId,
            
            currentSeriesFile: this.currentSeriesFile,
            currentSeasonFile: this.currentSeasonFile,
            currentEpisodeFile: this.currentEpisodeFile,
            
            lastHomeUpdate: this.lastHomeUpdate,
            totalExtracted: this.totalExtracted,
            lastHomeSeriesIds: this.lastHomeSeriesIds,
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
        debug.log('INFO', 'تم حفظ حالة التقدم', { page: this.seriesPage, mode: this.mode });
    }
    
    addSeriesToFile() {
        this.seriesInCurrentFile++;
        this.totalExtracted.series++;
        if (this.seriesInCurrentFile >= ITEMS_PER_FILE.series) {
            this.seriesFileNumber++;
            this.seriesInCurrentFile = 0;
            this.currentSeriesFile = `Page${this.seriesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف مسلسلات جديد: ${this.currentSeriesFile}`);
        }
        this.saveProgress();
    }
    
    addSeasonToFile() {
        this.seasonsInCurrentFile++;
        this.totalExtracted.seasons++;
        if (this.seasonsInCurrentFile >= ITEMS_PER_FILE.seasons) {
            this.seasonFileNumber++;
            this.seasonsInCurrentFile = 0;
            this.currentSeasonFile = `Page${this.seasonFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف مواسم جديد: ${this.currentSeasonFile}`);
        }
        this.saveProgress();
    }
    
    addEpisodeToFile() {
        this.episodesInCurrentFile++;
        this.totalExtracted.episodes++;
        if (this.episodesInCurrentFile >= ITEMS_PER_FILE.episodes) {
            this.episodeFileNumber++;
            this.episodesInCurrentFile = 0;
            this.currentEpisodeFile = `Page${this.episodeFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف حلقات جديد: ${this.currentEpisodeFile}`);
        }
        this.saveProgress();
    }
    
    addPageProcessed() {
        this.pagesProcessedThisRun++;
        
        if (this.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحة لهذا التشغيل`);
            this.shouldStop = true;
        } else if (!this.allPagesScraped) {
            this.seriesPage++;
            console.log(`\n🔄 الانتقال للصفحة ${this.seriesPage}...`);
        }
        
        this.saveProgress();
    }
    
    markAllPagesScraped() {
        debug.log('INFO', 'تم تحديد جميع الصفحات كمستخرجة');
        this.allPagesScraped = true;
        this.mode = "monitor_home";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    switchToHomeMode() {
        debug.log('INFO', 'التحول إلى وضع مراقبة الصفحة الرئيسية');
        this.mode = "monitor_home";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.saveProgress();
    }
    
    updateHomeSeriesIds(seriesIds) {
        this.lastHomeSeriesIds = seriesIds;
        this.lastHomeUpdate = new Date().toISOString();
        this.saveProgress();
    }
}

// ==================== دوال المساعدة ====================
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
    debug.log('FETCH', 'محاولة جلب', { url: url.substring(0, 50), retries });
    
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) {
                console.log(`   ↻ إعادة المحاولة ${i + 1}/${retries}...`);
                await delay(2000 * i);
            }
            
            const result = await fetchPage(url);
            if (result) {
                debug.log('FETCH', 'نجح الجلب', { url: url.substring(0, 50), attempt: i + 1 });
                return result;
            }
            
        } catch (error) {
            debug.log('FETCH_ERROR', 'فشلت المحاولة', { attempt: i + 1, error: error.message });
            console.log(`   ⚠️ محاولة ${i + 1} فشلت: ${error.message}`);
        }
    }
    
    debug.log('FETCH_FAILED', 'فشل جميع المحاولات', { url: url.substring(0, 50) });
    return null;
}

async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url.substring(0, 60)}...`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
            'Referer': 'https://topcinema.red/'
        };
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url, { 
            headers,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        debug.log('FETCH_RESPONSE', 'استجابة الخادم', { 
            status: response.status, 
            statusText: response.statusText
        });
        
        console.log(`📊 حالة الاستجابة: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const html = await response.text();
        console.log(`📄 حجم الصفحة: ${html.length} حرف`);
        
        if (html.length < 1000) {
            console.log(`⚠️ تحذير: الصفحة صغيرة جداً (أقل من 1000 حرف)!`);
            debug.log('WARNING', 'صفحة صغيرة جداً', { length: html.length, url });
            
            const debugPagePath = path.join(AG_SERIES_DIR, `debug_page_${Date.now()}.html`);
            fs.writeFileSync(debugPagePath, html);
            console.log(`💾 تم حفظ الصفحة للتصحيح في: ${debugPagePath}`);
        }
        
        await delay(DELAY_BETWEEN_REQUESTS);
        return html;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log(`❌ انتهى الوقت المحدد للجلب (30 ثانية)`);
            debug.log('TIMEOUT', 'انتهاء وقت الجلب', { url: url.substring(0, 50) });
        } else {
            console.log(`❌ خطأ في الجلب: ${error.message}`);
            debug.log('FETCH_ERROR', error.message, { url: url.substring(0, 50) });
        }
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractIdFromShortLink(shortLink) {
    try {
        if (!shortLink) return `temp_${Date.now()}`;
        
        if (shortLink.includes('?p=')) {
            const match = shortLink.match(/\?p=(\d+)/);
            return match ? `p_${match[1]}` : `temp_${Date.now()}`;
        } else if (shortLink.includes('?gt=')) {
            const match = shortLink.match(/\?gt=(\d+)/);
            return match ? `gt_${match[1]}` : `temp_${Date.now()}`;
        } else {
            const urlMatch = shortLink.match(/\/(\d+)(?:\/|$)/);
            return urlMatch ? `id_${urlMatch[1]}` : `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    } catch {
        return `temp_${Date.now()}`;
    }
}

// ==================== نظام الملفات ====================
class FileManager {
    constructor() {
        this.ensureDirectories();
    }
    
    ensureDirectories() {
        [TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    readJsonFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return { info: { type: 'data', totalItems: 0 }, data: [] };
            }
            
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(content);
            
            if (!parsed.data || !Array.isArray(parsed.data)) {
                return { info: { type: 'data', totalItems: 0 }, data: [] };
            }
            
            return parsed;
        } catch (error) {
            debug.log('FILE_ERROR', 'خطأ في قراءة الملف', { file: filePath, error: error.message });
            return { info: { type: 'data', totalItems: 0 }, data: [] };
        }
    }
    
    saveToFile(directory, fileName, data, type = 'data') {
        const filePath = path.join(directory, fileName);
        const existingContent = this.readJsonFile(filePath);
        
        const fileInfo = {
            type: type,
            fileName: fileName,
            totalItems: existingContent.data.length + 1,
            created: existingContent.info?.created || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            lastItemAdded: new Date().toISOString()
        };
        
        const fileContent = {
            info: fileInfo,
            data: [...existingContent.data, data]
        };
        
        if (fs.existsSync(filePath)) {
            const backupPath = filePath + '.backup';
            fs.copyFileSync(filePath, backupPath);
        }
        
        fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
        
        return fileContent;
    }
    
    saveHomeFile(seriesList) {
        const fileInfo = {
            type: 'home_series',
            fileName: 'Home.json',
            totalItems: seriesList.length,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            source: 'الصفحة الأولى',
            note: 'يتم تحديث هذا الملف في كل تشغيل بآخر مسلسلات الصفحة الأولى'
        };
        
        const fileContent = {
            info: fileInfo,
            data: seriesList
        };
        
        fs.writeFileSync(HOME_SERIES_FILE, JSON.stringify(fileContent, null, 2));
        
        return fileContent;
    }
    
    findItemInDirectory(directory, itemId, idField = 'id') {
        try {
            const files = fs.readdirSync(directory)
                .filter(file => file.startsWith('Page') && file.endsWith('.json'));
            
            for (const file of files) {
                const filePath = path.join(directory, file);
                const content = this.readJsonFile(filePath);
                
                if (content.data && Array.isArray(content.data)) {
                    const foundItem = content.data.find(item => item[idField] === itemId);
                    if (foundItem) {
                        return {
                            item: foundItem,
                            file: file,
                            filePath: filePath
                        };
                    }
                }
            }
            
            return null;
        } catch (error) {
            debug.log('FILE_ERROR', 'خطأ في البحث', { directory, itemId, error: error.message });
            return null;
        }
    }
    
    getAllItems(directory) {
        const items = [];
        try {
            const files = fs.readdirSync(directory)
                .filter(file => file.startsWith('Page') && file.endsWith('.json'));
            
            for (const file of files) {
                const filePath = path.join(directory, file);
                const content = this.readJsonFile(filePath);
                
                if (content.data && Array.isArray(content.data)) {
                    items.push(...content.data);
                }
            }
            
            return items;
        } catch (error) {
            debug.log('FILE_ERROR', 'خطأ في الحصول على العناصر', { directory, error: error.message });
            return items;
        }
    }
}

// ==================== استخراج الصفحة الرئيسية ====================
async function fetchHomePageSeries() {
    console.log("\n🏠 ===== جلب المسلسلات من الصفحة الرئيسية =====");
    
    const url = "https://topcinema.red/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchWithRetry(url);
    if (!html) {
        console.log("❌ فشل جلب الصفحة الرئيسية");
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seriesList = [];
        
        console.log("🔍 البحث عن المسلسلات في الصفحة الرئيسية...");
        
        // تحديث: البحث عن عناصر المسلسلات في الصفحة الرئيسية
        const seriesElements = doc.querySelectorAll('.Small--Box a.recent--block');
        console.log(`✅ وجدت ${seriesElements.length} مسلسل في الصفحة الرئيسية`);
        
        debug.log('HOME_PAGE', 'عناصر الصفحة الرئيسية', { count: seriesElements.length });
        
        for (let i = 0; i < seriesElements.length; i++) {
            const element = seriesElements[i];
            const seriesUrl = element.href;
            
            if (seriesUrl && seriesUrl.includes('topcinema.red')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                
                // استخراج عدد المواسم من عنصر Collection
                const seasonsElement = element.querySelector('.number.Collection span');
                const seasonsCount = seasonsElement ? cleanText(seasonsElement.textContent) : "";
                
                // استخراج تقييم IMDB
                const imdbElement = element.querySelector('.imdbRating i.fa-star')?.parentElement;
                const imdbRating = imdbElement ? cleanText(imdbElement.textContent) : "";
                
                // استخراج الأنواع (Genres)
                const genres = [];
                const liItems = element.querySelectorAll('ul.liList li');
                liItems.forEach(li => {
                    const text = cleanText(li.textContent);
                    if (text && !text.includes('IMDb') && !text.includes('WEB') && !text.includes('BluRay') && !text.includes('HD')) {
                        genres.push(text);
                    }
                });
                
                const tempId = extractIdFromShortLink(seriesUrl);
                
                seriesList.push({
                    id: tempId,
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
                    imdbRating: imdbRating,
                    genres: genres,
                    page: 1,
                    position: i + 1,
                    fromHomePage: true,
                    lastSeen: new Date().toISOString()
                });
                
                if (i < 5) {
                    console.log(`   [${i + 1}] ${title.substring(0, 40)}...`);
                }
            }
        }
        
        console.log(`✅ تم استخراج ${seriesList.length} مسلسل من الصفحة الرئيسية`);
        return seriesList;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج الصفحة الرئيسية:`, error.message);
        debug.log('ERROR', 'خطأ في استخراج الصفحة الرئيسية', error.message);
        return [];
    } finally {
        await delay(1000);
    }
}

// ==================== استخراج قائمة المسلسلات من الصفحة ====================
async function fetchSeriesListFromPage(pageNum) {
    const baseUrl = "https://topcinema.red/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    const url = pageNum === 1 ? baseUrl : `${baseUrl}page/${pageNum}/`;
    
    console.log(`\n📺 ====== جلب صفحة المسلسلات ${pageNum} ======`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchWithRetry(url);
    if (!html) {
        debug.log('SERIES_PAGE_FAIL', 'فشل جلب صفحة المسلسلات', { pageNum });
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seriesList = [];
        
        console.log("🔍 البحث عن المسلسلات...");
        
        // تحديث: البحث عن عناصر المسلسلات في صفحة القائمة
        const seriesElements = doc.querySelectorAll('.Small--Box a.recent--block');
        console.log(`✅ وجدت ${seriesElements.length} مسلسل في الصفحة`);
        
        debug.log('SERIES_PAGE', 'نتائج صفحة المسلسلات', { 
            pageNum, 
            count: seriesElements.length,
            htmlLength: html.length 
        });
        
        if (seriesElements.length === 0) {
            console.log(`⚠️ لا توجد عناصر مسلسلات في الصفحة ${pageNum}`);
            
            // تحقق من وجود ترقيم صفحات
            const pagination = doc.querySelector('.pagination, .wp-pagenavi, .nav-links');
            if (!pagination && pageNum > 1) {
                console.log(`📭 يبدو أن هذه آخر صفحة (لا يوجد ترقيم صفحات)`);
                return null;
            }
            return { url, series: [] };
        }
        
        for (let i = 0; i < seriesElements.length; i++) {
            const element = seriesElements[i];
            const seriesUrl = element.href;
            
            if (seriesUrl && seriesUrl.includes('topcinema.red')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                
                // استخراج عدد المواسم
                const seasonsElement = element.querySelector('.number.Collection span');
                const seasonsCount = seasonsElement ? cleanText(seasonsElement.textContent) : "";
                
                // استخراج تقييم IMDB
                const imdbElement = element.querySelector('.imdbRating i.fa-star')?.parentElement;
                const imdbRating = imdbElement ? cleanText(imdbElement.textContent) : "";
                
                // استخراج الجودة
                let quality = "";
                const liItems = element.querySelectorAll('ul.liList li');
                liItems.forEach(li => {
                    const text = cleanText(li.textContent);
                    if (text && (text.includes('WEB') || text.includes('BluRay') || text.includes('HD'))) {
                        quality = text;
                    }
                });
                
                seriesList.push({
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
                    imdbRating: imdbRating,
                    quality: quality,
                    page: pageNum,
                    position: i + 1,
                    scrapedAt: new Date().toISOString()
                });
            }
        }
        
        console.log(`📊 تم العثور على ${seriesList.length} مسلسل في الصفحة ${pageNum}`);
        return { url, series: seriesList };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
        debug.log('ERROR', 'خطأ في معالجة صفحة المسلسلات', { pageNum, error: error.message });
        return null;
    } finally {
        await delay(1000);
    }
}

// ==================== استخراج بيانات المسلسل الكاملة ====================
async function fetchSeriesDetails(seriesData) {
    console.log(`\n🎬 [${seriesData.position}] ${seriesData.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchWithRetry(seriesData.url);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // تحديث: استخراج الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesData.url;
        const seriesId = extractIdFromShortLink(shortLink);
        
        // تحديث: استخراج العنوان
        const titleElement = doc.querySelector(".post-title a");
        const title = titleElement ? cleanText(titleElement.textContent) : seriesData.title;
        
        // تحديث: استخراج الصورة
        const imageElement = doc.querySelector(".image img");
        const image = imageElement ? imageElement.src : seriesData.image;
        
        // تحديث: استخراج تقييم IMDB
        const imdbElement = doc.querySelector(".imdbR span");
        const imdbRating = imdbElement ? cleanText(imdbElement.textContent) : seriesData.imdbRating;
        
        // تحديث: استخراج قصة المسلسل
        const storyElement = doc.querySelector(".story p");
        const story = storyElement ? cleanText(storyElement.textContent) : "غير متوفر";
        
        // تحديث: استخراج التفاصيل من القائمة الجانبية
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
        
        // تحديث: استخراج رابط عرض جميع المواسم
        const watchButton = doc.querySelector('.BTNSDownWatch a.watch');
        const seasonsListUrl = watchButton ? watchButton.href : null;
        
        return {
            id: seriesId,
            title: title,
            url: seriesData.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            seasonsListUrl: seasonsListUrl,
            page: seriesData.page,
            position: seriesData.position,
            scrapedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        debug.log('ERROR', 'خطأ في استخراج تفاصيل المسلسل', { url: seriesData.url, error: error.message });
        return null;
    } finally {
        await delay(500);
    }
}

// ==================== استخراج المواسم من صفحة المسلسل ====================
async function extractSeasonsFromSeriesPage(seriesUrl) {
    console.log(`   📅 جاري استخراج المواسم من صفحة المسلسل...`);
    
    try {
        const html = await fetchWithRetry(seriesUrl);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة المسلسل للمواسم`);
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seasons = [];
        
        // تحديث: البحث عن المواسم في قسم tabContents
        const seasonsSection = doc.querySelector('section.allseasonss');
        if (!seasonsSection) {
            console.log(`   ℹ️  لا يوجد قسم للمواسم في الصفحة`);
            return [];
        }
        
        const seasonElements = seasonsSection.querySelectorAll('.Small--Box.Season');
        console.log(`   ✅ وجدت ${seasonElements.length} موسم`);
        
        seasonElements.forEach((element, index) => {
            const link = element.querySelector('a');
            if (link && link.href) {
                // استخراج رقم الموسم
                const epnumElement = element.querySelector('.epnum');
                let seasonNumber = index + 1;
                
                if (epnumElement) {
                    const epnumText = cleanText(epnumElement.textContent);
                    const numMatch = epnumText.match(/\d+/);
                    if (numMatch) {
                        seasonNumber = parseInt(numMatch[0]);
                    }
                }
                
                // استخراج عنوان الموسم
                const titleElement = element.querySelector('.title');
                const seasonTitle = titleElement ? cleanText(titleElement.textContent) : `الموسم ${seasonNumber}`;
                
                // استخراج صورة الموسم
                const imgElement = element.querySelector('img');
                const seasonImage = imgElement ? imgElement.src : null;
                
                seasons.push({
                    url: link.href,
                    title: seasonTitle,
                    image: seasonImage,
                    seasonNumber: seasonNumber,
                    position: index + 1
                });
            }
        });
        
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        debug.log('ERROR', 'خطأ في استخراج المواسم', { url: seriesUrl, error: error.message });
        return [];
    } finally {
        await delay(500);
    }
}

// ==================== استخراج بيانات الموسم الكاملة ====================
async function fetchSeasonDetails(seasonData, seriesId) {
    console.log(`   🎞️  الموسم ${seasonData.seasonNumber}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchWithRetry(seasonData.url);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seasonData.url;
        const seasonId = extractIdFromShortLink(shortLink);
        
        // استخراج العنوان
        const titleElement = doc.querySelector(".post-title a");
        const title = titleElement ? cleanText(titleElement.textContent) : seasonData.title;
        
        // استخراج الصورة
        const imageElement = doc.querySelector(".image img");
        const image = imageElement ? imageElement.src : seasonData.image;
        
        return {
            id: seasonId,
            seriesId: seriesId,
            seasonNumber: seasonData.seasonNumber,
            title: title,
            url: seasonData.url,
            shortLink: shortLink,
            image: image,
            scrapedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    } finally {
        await delay(500);
    }
}

// ==================== استخراج الحلقات من صفحة الموسم ====================
async function extractEpisodesFromSeasonPage(seasonUrl) {
    console.log(`     📺 جاري استخراج الحلقات من صفحة الموسم...`);
    
    try {
        const html = await fetchWithRetry(seasonUrl);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم للحلقات`);
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        // تحديث: البحث عن الحلقات في قسم allepcont
        const episodesSection = doc.querySelector('section.allepcont');
        if (!episodesSection) {
            console.log(`     ℹ️  لا يوجد قسم للحلقات في الصفحة`);
            return [];
        }
        
        const episodeLinks = episodesSection.querySelectorAll('a[href*="topcinema.red"]');
        console.log(`     ✅ وجدت ${episodeLinks.length} حلقة`);
        
        episodeLinks.forEach((link, index) => {
            // استخراج رقم الحلقة
            const epnumElement = link.querySelector('.epnum');
            let episodeNumber = index + 1;
            
            if (epnumElement) {
                const epnumText = cleanText(epnumElement.textContent);
                const numMatch = epnumText.match(/\d+/);
                if (numMatch) {
                    episodeNumber = parseInt(numMatch[0]);
                }
            }
            
            // استخراج عنوان الحلقة
            const titleElement = link.querySelector('.ep-info h2');
            const episodeTitle = titleElement ? cleanText(titleElement.textContent) : `الحلقة ${episodeNumber}`;
            
            // استخراج صورة الحلقة
            const imgElement = link.querySelector('.image img');
            const episodeImage = imgElement ? imgElement.src : null;
            
            episodes.push({
                url: link.href,
                title: episodeTitle,
                episodeNumber: episodeNumber,
                image: episodeImage,
                position: index + 1
            });
        });
        
        return episodes;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج الحلقات: ${error.message}`);
        debug.log('ERROR', 'خطأ في استخراج الحلقات', { url: seasonUrl, error: error.message });
        return [];
    } finally {
        await delay(500);
    }
}

// ==================== استخراج بيانات الحلقة الكاملة ====================
async function fetchEpisodeDetails(episodeData, seriesId, seasonId) {
    console.log(`       🎥 الحلقة ${episodeData.episodeNumber}: ${episodeData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchWithRetry(episodeData.url);
        if (!html) {
            console.log(`       ⚠️ فشل جلب صفحة الحلقة`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : episodeData.url;
        const episodeId = extractIdFromShortLink(shortLink);
        
        // استخراج عنوان الحلقة
        const titleElement = doc.querySelector(".post-title a");
        const title = titleElement ? cleanText(titleElement.textContent) : episodeData.title;
        
        // استخراج سيرفر المشاهدة (قد يكون موجوداً في meta tags)
        let watchServer = null;
        const watchMeta = doc.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"]');
        if (watchMeta && watchMeta.content) {
            watchServer = watchMeta.content;
        }
        
        return {
            id: episodeId,
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episodeData.episodeNumber,
            title: title,
            url: episodeData.url,
            shortLink: shortLink,
            image: episodeData.image,
            watchServer: watchServer,
            scrapedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
    } finally {
        await delay(500);
    }
}

// ==================== نظام الكشف عن التحديثات ====================
class UpdateDetector {
    constructor(fileManager, updateTracker) {
        this.fileManager = fileManager;
        this.updateTracker = updateTracker;
    }
    
    async checkSeriesForUpdates(seriesId, seriesUrl, seriesTitle) {
        console.log(`   🔄 فحص التحديثات للمسلسل: ${seriesTitle}`);
        
        if (!this.updateTracker.needsUpdateCheck(seriesId)) {
            console.log(`   ⏰ تم فحص هذا المسلسل مؤخراً، تخطي...`);
            return { hasUpdates: false, updates: [] };
        }
        
        try {
            const seriesData = this.fileManager.findItemInDirectory(TV_SERIES_DIR, seriesId);
            if (!seriesData) {
                console.log(`   ❌ المسلسل غير موجود في قاعدة البيانات`);
                return { hasUpdates: false, updates: [] };
            }
            
            const updates = [];
            
            // التحقق من وجود مواسم جديدة
            const currentSeasons = await extractSeasonsFromSeriesPage(seriesUrl);
            
            const storedSeasons = this.fileManager.getAllItems(SEASONS_DIR)
                .filter(season => season.seriesId === seriesId);
            
            console.log(`   📊 مقارنة المواسم: ${storedSeasons.length} مخزنة vs ${currentSeasons.length} حالية`);
            
            const newSeasons = this.detectNewSeasons(storedSeasons, currentSeasons);
            
            if (newSeasons.length > 0) {
                updates.push({
                    type: 'new_seasons',
                    count: newSeasons.length,
                    seasons: newSeasons
                });
                
                this.updateTracker.logUpdate('مسلسل', seriesId, seriesTitle, {
                    newSeasons: newSeasons.length,
                    seasons: newSeasons.map(s => s.title)
                });
            }
            
            this.updateTracker.markSeriesChecked(seriesId, currentSeasons.length, updates.length);
            
            const hasUpdates = updates.length > 0;
            
            if (hasUpdates) {
                console.log(`   📈 تم اكتشاف ${updates.length} تحديثات للمسلسل`);
            } else {
                console.log(`   ✅ لا توجد تحديثات للمسلسل`);
            }
            
            return { hasUpdates, updates };
            
        } catch (error) {
            console.log(`   ❌ خطأ في فحص التحديثات: ${error.message}`);
            return { hasUpdates: false, updates: [], error: error.message };
        }
    }
    
    detectNewSeasons(storedSeasons, currentSeasons) {
        const newSeasons = [];
        
        for (const currentSeason of currentSeasons) {
            const isNew = !storedSeasons.some(storedSeason => 
                storedSeason.seasonNumber === currentSeason.seasonNumber
            );
            
            if (isNew) {
                newSeasons.push(currentSeason);
            }
        }
        
        return newSeasons;
    }
    
    async checkSeasonForUpdates(season) {
        const updates = [];
        
        try {
            const currentEpisodes = await extractEpisodesFromSeasonPage(season.url);
            
            const storedEpisodes = this.fileManager.getAllItems(EPISODES_DIR)
                .filter(episode => episode.seasonId === season.id);
            
            console.log(`     📊 مقارنة حلقات الموسم ${season.seasonNumber}: ${storedEpisodes.length} مخزنة vs ${currentEpisodes.length} حالية`);
            
            const newEpisodes = this.detectNewEpisodes(storedEpisodes, currentEpisodes);
            
            if (newEpisodes.length > 0) {
                updates.push({
                    type: 'new_episodes',
                    count: newEpisodes.length,
                    episodes: newEpisodes
                });
                
                this.updateTracker.logUpdate('موسم', season.id, season.title, {
                    newEpisodes: newEpisodes.length,
                    episodes: newEpisodes.map(e => `الحلقة ${e.episodeNumber}`)
                });
            }
            
            this.updateTracker.markSeasonChecked(season.id, currentEpisodes.length);
            
            return {
                hasUpdates: updates.length > 0,
                updates
            };
            
        } catch (error) {
            console.log(`     ❌ خطأ في فحص تحديثات الموسم: ${error.message}`);
            return { hasUpdates: false, updates: [] };
        }
    }
    
    detectNewEpisodes(storedEpisodes, currentEpisodes) {
        const newEpisodes = [];
        
        const storedEpisodeNumbers = new Set(
            storedEpisodes.map(ep => ep.episodeNumber)
        );
        
        for (const currentEpisode of currentEpisodes) {
            if (!storedEpisodeNumbers.has(currentEpisode.episodeNumber)) {
                newEpisodes.push(currentEpisode);
            }
        }
        
        return newEpisodes;
    }
}

// ==================== نظام الاستخراج المنظم ====================
class OrganizedScraper {
    constructor(progressTracker, fileManager) {
        this.progress = progressTracker;
        this.fileManager = fileManager;
        this.updateDetector = new UpdateDetector(fileManager, progressTracker.updateTracker);
    }
    
    async processSeriesPage(pageNum) {
        console.log(`\n📺 ====== معالجة صفحة المسلسلات ${pageNum} ======`);
        
        const pageData = await fetchSeriesListFromPage(pageNum);
        
        if (!pageData) {
            console.log(`⚠️ فشل جلب الصفحة ${pageNum}`);
            
            if (pageNum === 1) {
                console.log(`❌ خطأ: لا يمكن جلب الصفحة الأولى!`);
                console.log(`🔄 سأحاول مرة أخرى في التشغيل القادم`);
                this.progress.shouldStop = true;
                return false;
            }
            
            console.log(`🏠 ربما وصلنا لآخر صفحة؟`);
            this.progress.markAllPagesScraped();
            return false;
        }
        
        if (pageData.series.length === 0) {
            console.log(`📭 الصفحة ${pageNum} لا تحتوي على مسلسلات`);
            
            if (pageNum === 1) {
                console.log(`❌ خطأ: الصفحة الأولى لا تحتوي على مسلسلات!`);
                console.log(`🔍 تحقق من هيكل الموقع`);
                this.progress.shouldStop = true;
                return false;
            }
            
            console.log(`🏁 يبدو أننا وصلنا لآخر صفحة (الصفحة ${pageNum})`);
            console.log(`📊 إجمالي المسلسلات المستخرجة: ${this.progress.totalExtracted.series}`);
            this.progress.markAllPagesScraped();
            return false;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل من الصفحة ${pageNum}`);
        
        if (pageNum === 1) {
            console.log(`🏠 تحديث Home.json بمسلسلات الصفحة الأولى...`);
            await this.updateHomeFile(pageData.series);
        }
        
        let extractedCount = 0;
        for (let i = 0; i < pageData.series.length; i++) {
            const seriesData = pageData.series[i];
            
            console.log(`\n📊 [${i + 1}/${pageData.series.length}] ${seriesData.title.substring(0, 40)}...`);
            
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (!seriesDetails) {
                console.log(`   ⚠️ تخطي المسلسل: فشل استخراج البيانات`);
                continue;
            }
            
            const existingSeries = this.fileManager.findItemInDirectory(TV_SERIES_DIR, seriesDetails.id);
            
            if (existingSeries) {
                console.log(`   ✅ المسلسل موجود بالفعل، جاري فحص التحديثات...`);
                
                const updateResult = await this.updateDetector.checkSeriesForUpdates(
                    seriesDetails.id,
                    seriesDetails.url,
                    seriesDetails.title
                );
                
                if (updateResult.hasUpdates) {
                    console.log(`   📈 تم اكتشاف تحديثات`);
                }
                
            } else {
                console.log(`   🆕 مسلسل جديد، جاري استخراجه...`);
                
                const savedSeries = this.fileManager.saveToFile(
                    TV_SERIES_DIR,
                    this.progress.currentSeriesFile,
                    seriesDetails
                );
                
                console.log(`   💾 تم حفظ المسلسل في ${this.progress.currentSeriesFile}`);
                this.progress.addSeriesToFile();
                this.progress.currentSeriesId = seriesDetails.id;
                extractedCount++;
                
                await this.extractSeasonsForSeries(seriesDetails);
            }
            
            if (i < pageData.series.length - 1) {
                console.log(`   ⏳ انتظار 2 ثانية قبل المسلسل التالي...`);
                await delay(2000);
            }
        }
        
        console.log(`\n✅ اكتملت معالجة الصفحة ${pageNum}`);
        console.log(`📊 تم استخراج ${extractedCount} مسلسل جديد من هذه الصفحة`);
        console.log(`📊 الإجمالي الكلي: ${this.progress.totalExtracted.series} مسلسل`);
        
        return true;
    }
    
    async updateHomeFile(homeSeriesList) {
        console.log(`\n🏠 تحديث ملف Home.json بمسلسلات الصفحة الأولى...`);
        
        const fullSeriesDetails = [];
        for (let i = 0; i < homeSeriesList.length; i++) {
            const seriesData = homeSeriesList[i];
            console.log(`   [${i + 1}/${homeSeriesList.length}] جلب تفاصيل: ${seriesData.title.substring(0, 30)}...`);
            
            const details = await fetchSeriesDetails(seriesData);
            if (details) {
                fullSeriesDetails.push(details);
            }
            
            if (i < homeSeriesList.length - 1) {
                await delay(1500);
            }
        }
        
        this.fileManager.saveHomeFile(fullSeriesDetails);
        console.log(`✅ تم تحديث Home.json بـ ${fullSeriesDetails.length} مسلسل`);
        
        const seriesIds = fullSeriesDetails.map(s => s.id);
        this.progress.updateHomeSeriesIds(seriesIds);
        this.progress.updateTracker.recordHomeCheck(fullSeriesDetails);
    }
    
    async extractSeasonsForSeries(seriesDetails) {
        console.log(`   📅 جاري استخراج مواسم المسلسل...`);
        
        const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url);
        
        if (seasons.length === 0) {
            console.log(`   ℹ️  لا توجد مواسم لهذا المسلسل`);
            return;
        }
        
        console.log(`   ✅ وجدت ${seasons.length} موسم`);
        
        for (let i = 0; i < seasons.length; i++) {
            const seasonData = seasons[i];
            
            console.log(`   📊 الموسم ${i + 1}/${seasons.length}: ${seasonData.title}`);
            
            const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
            
            if (!seasonDetails) {
                console.log(`     ⚠️ تخطي الموسم: فشل استخراج البيانات`);
                continue;
            }
            
            const savedSeason = this.fileManager.saveToFile(
                SEASONS_DIR,
                this.progress.currentSeasonFile,
                seasonDetails
            );
            
            console.log(`     💾 تم حفظ الموسم في ${this.progress.currentSeasonFile}`);
            this.progress.addSeasonToFile();
            this.progress.currentSeasonId = seasonDetails.id;
            
            await this.extractEpisodesForSeason(seasonDetails, seriesDetails.id);
            
            if (i < seasons.length - 1) {
                await delay(1500);
            }
        }
    }
    
    async extractEpisodesForSeason(seasonDetails, seriesId) {
        console.log(`     📺 جاري استخراج حلقات الموسم...`);
        
        const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
        
        if (episodes.length === 0) {
            console.log(`     ℹ️  لا توجد حلقات لهذا الموسم`);
            return;
        }
        
        console.log(`     ✅ وجدت ${episodes.length} حلقة`);
        
        for (let i = 0; i < episodes.length; i++) {
            const episodeData = episodes[i];
            
            if (i < 5 || i === episodes.length - 1) {
                console.log(`     📊 الحلقة ${i + 1}/${episodes.length}: ${episodeData.title.substring(0, 30)}...`);
            }
            
            const episodeDetails = await fetchEpisodeDetails(episodeData, seriesId, seasonDetails.id);
            
            if (episodeDetails) {
                const savedEpisode = this.fileManager.saveToFile(
                    EPISODES_DIR,
                    this.progress.currentEpisodeFile,
                    episodeDetails
                );
                
                this.progress.addEpisodeToFile();
            }
            
            if (i < episodes.length - 1) {
                await delay(800);
            }
        }
    }
    
    async monitorHomePage() {
        console.log("\n🏠 ===== بدء مراقبة الصفحة الرئيسية =====");
        
        const homeSeries = await fetchHomePageSeries();
        
        if (homeSeries.length === 0) {
            console.log("📭 لا توجد مسلسلات في الصفحة الرئيسية");
            return;
        }
        
        await this.updateHomeFile(homeSeries);
        
        const allStoredSeries = this.fileManager.getAllItems(TV_SERIES_DIR);
        const storedSeriesIds = new Set(allStoredSeries.map(s => s.id));
        
        console.log(`\n📊 إحصائيات:`);
        console.log(`   📁 المسلسلات المخزنة: ${allStoredSeries.length}`);
        console.log(`   🏠 مسلسلات الصفحة الرئيسية: ${homeSeries.length}`);
        
        console.log("\n🔍 البحث عن مسلسلات جديدة...");
        let newSeriesCount = 0;
        
        for (let i = 0; i < homeSeries.length; i++) {
            const seriesData = homeSeries[i];
            const seriesId = extractIdFromShortLink(seriesData.url);
            
            if (!storedSeriesIds.has(seriesId)) {
                console.log(`\n🆕 [${i + 1}] مسلسل جديد: ${seriesData.title}`);
                
                const seriesDetails = await fetchSeriesDetails(seriesData);
                
                if (seriesDetails) {
                    const savedSeries = this.fileManager.saveToFile(
                        TV_SERIES_DIR,
                        this.progress.currentSeriesFile,
                        seriesDetails
                    );
                    
                    this.progress.addSeriesToFile();
                    newSeriesCount++;
                    
                    await this.extractSeasonsForSeries(seriesDetails);
                }
            }
            
            await delay(1500);
        }
        
        console.log("\n🔄 البحث عن تحديثات للمسلسلات الموجودة...");
        let updatedSeriesCount = 0;
        
        for (let i = 0; i < homeSeries.length; i++) {
            const seriesData = homeSeries[i];
            const seriesId = extractIdFromShortLink(seriesData.url);
            
            if (storedSeriesIds.has(seriesId)) {
                console.log(`\n[${i + 1}] فحص تحديثات: ${seriesData.title}`);
                
                const seriesDetails = await fetchSeriesDetails(seriesData);
                
                if (seriesDetails) {
                    const updateResult = await this.updateDetector.checkSeriesForUpdates(
                        seriesDetails.id,
                        seriesDetails.url,
                        seriesDetails.title
                    );
                    
                    if (updateResult.hasUpdates) {
                        updatedSeriesCount++;
                    }
                }
            }
            
            await delay(1500);
        }
        
        console.log(`\n📊 نتائج مراقبة الصفحة الرئيسية:`);
        console.log(`   🆕 مسلسلات جديدة: ${newSeriesCount}`);
        console.log(`   🔄 مسلسلات محدثة: ${updatedSeriesCount}`);
        
        this.progress.lastHomeUpdate = new Date().toISOString();
        this.progress.saveProgress();
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - توب سينما");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const progress = new ProgressTracker();
    const fileManager = new FileManager();
    const scraper = new OrganizedScraper(progress, fileManager);
    
    console.log(`📊 حالة النظام:`);
    console.log(`   🎯 الوضع الحالي: ${progress.mode === 'scrape_series' ? 'استخراج المسلسلات' : 'مراقبة الصفحة الرئيسية'}`);
    console.log(`   📊 الإحصائيات: ${progress.totalExtracted.series} مسلسل, ${progress.totalExtracted.seasons} موسم, ${progress.totalExtracted.episodes} حلقة`);
    
    if (progress.mode === 'scrape_series') {
        console.log(`   📄 الصفحة الحالية: ${progress.seriesPage}`);
        console.log(`   📁 ملف المسلسلات: ${progress.currentSeriesFile} (${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series})`);
        
        if (progress.seriesPage === 1 && progress.totalExtracted.series === 0) {
            console.log(`\n🔍 جاري التحقق من إمكانية الوصول إلى الموقع...`);
            const testHtml = await fetchWithRetry("https://topcinema.red/");
            if (!testHtml) {
                console.log(`❌ لا يمكن الوصول إلى الموقع!`);
                console.log(`💡 تأكد من:`);
                console.log(`   1. اتصالك بالإنترنت`);
                console.log(`   2. الموقع يعمل (افتحه في المتصفح)`);
                
                const errorReport = {
                    error: "Cannot access website",
                    timestamp: new Date().toISOString()
                };
                fs.writeFileSync(ERROR_FILE, JSON.stringify(errorReport, null, 2));
                return;
            }
            console.log(`✅ الموقع يعمل، البدء في الاستخراج...\n`);
        }
        
        if (progress.allPagesScraped) {
            console.log(`\n🏁 تم استخراج جميع صفحات المسلسلات!`);
            console.log(`🔄 التبديل لوضع مراقبة الصفحة الرئيسية...`);
            progress.switchToHomeMode();
        } else {
            progress.resetForNewRun();
            
            console.log(`\n📌 ملاحظة: سيتم استخراج صفحة واحدة فقط في هذا التشغيل`);
            console.log(`   (يمكنك تغيير PAGES_PER_RUN لاستخراج أكثر من صفحة)\n`);
            
            let hasMorePages = await scraper.processSeriesPage(progress.seriesPage);
            
            if (hasMorePages) {
                progress.addPageProcessed();
                
                if (!progress.shouldStop && hasMorePages) {
                    console.log(`\n✅ اكتملت الصفحة ${progress.seriesPage - 1}`);
                    console.log(`👉 في المرة القادمة، سيبدأ من الصفحة ${progress.seriesPage}`);
                }
            }
        }
    }
    
    if (progress.mode === 'monitor_home') {
        console.log(`   📅 آخر مراقبة: ${progress.lastHomeUpdate ? new Date(progress.lastHomeUpdate).toLocaleString() : 'لم تتم من قبل'}`);
        console.log(`\n🔍 بدء مراقبة الصفحة الرئيسية...`);
        await scraper.monitorHomePage();
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    let seriesFiles = [];
    let seasonFiles = [];
    let episodeFiles = [];
    
    try {
        seriesFiles = fs.existsSync(TV_SERIES_DIR) ? fs.readdirSync(TV_SERIES_DIR).filter(f => f.endsWith('.json')) : [];
        seasonFiles = fs.existsSync(SEASONS_DIR) ? fs.readdirSync(SEASONS_DIR).filter(f => f.endsWith('.json')) : [];
        episodeFiles = fs.existsSync(EPISODES_DIR) ? fs.readdirSync(EPISODES_DIR).filter(f => f.endsWith('.json')) : [];
    } catch (e) {
        debug.log('ERROR', 'خطأ في قراءة الملفات', e.message);
    }
    
    const finalReport = {
        timestamp: new Date().toISOString(),
        mode: progress.mode,
        stats: {
            totalSeries: progress.totalExtracted.series,
            totalSeasons: progress.totalExtracted.seasons,
            totalEpisodes: progress.totalExtracted.episodes,
            seriesPage: progress.seriesPage,
            allPagesScraped: progress.allPagesScraped,
            lastHomeUpdate: progress.lastHomeUpdate
        },
        files: {
            seriesFiles: seriesFiles.length,
            seasonFiles: seasonFiles.length,
            episodeFiles: episodeFiles.length
        },
        nextRun: {
            mode: progress.mode,
            startPage: progress.mode === 'scrape_series' ? progress.seriesPage : 'home_monitoring',
            recommendation: progress.mode === 'scrape_series' ? 'متابعة استخراج المسلسلات' : 'مراقبة الصفحة الرئيسية'
        }
    };
    
    fs.writeFileSync(REPORT_FILE, JSON.stringify(finalReport, null, 2));
    console.log(`📄 تم حفظ التقرير في: ${REPORT_FILE}`);
    console.log(`📊 ${finalReport.files.seriesFiles} ملف مسلسلات, ${finalReport.files.seasonFiles} ملف مواسم, ${finalReport.files.episodeFiles} ملف حلقات`);
    
    if (fs.existsSync(DEBUG_FILE)) {
        const debugLogs = JSON.parse(fs.readFileSync(DEBUG_FILE, 'utf8'));
        const recentErrors = debugLogs.filter(log => log.type.includes('ERROR') || log.type.includes('FETCH_FAILED')).slice(-5);
        
        if (recentErrors.length > 0) {
            console.log(`\n🔍 آخر أخطاء التصحيح (${recentErrors.length}):`);
            recentErrors.forEach((log, i) => {
                console.log(`   ${i+1}. [${log.type}] ${log.message}`);
            });
        }
    }
    
    console.log("=".repeat(60));
    
    if (progress.mode === 'scrape_series' && progress.seriesPage === 1 && progress.totalExtracted.series === 0) {
        console.log(`\n💡 نصائح:`);
        console.log(`   1. تأكد من أن الموقع يعمل: https://topcinema.red`);
        console.log(`   2. تحقق من اتصال الإنترنت`);
        console.log(`   3. جرب تشغيل البرنامج مرة أخرى بعد دقيقة`);
    } else if (progress.mode === 'scrape_series') {
        console.log(`\n👉 للتشغيل التالي:`);
        console.log(`   قم بتشغيل البرنامج مرة أخرى لاستخراج الصفحة ${progress.seriesPage}`);
        if (progress.seriesPage > 1) {
            console.log(`   تم استخراج ${progress.totalExtracted.series} مسلسل حتى الآن`);
        }
    } else if (progress.mode === 'monitor_home') {
        console.log(`\n👉 للتشغيل التالي:`);
        console.log(`   سيتم مراقبة الصفحة الرئيسية للبحث عن مسلسلات جديدة`);
        console.log(`   آخر مراقبة: ${progress.lastHomeUpdate ? new Date(progress.lastHomeUpdate).toLocaleString() : 'لم تتم'}`);
    }
}

// ==================== تشغيل البرنامج ====================
main().catch(async error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    const errorReport = {
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        },
        system: {
            platform: process.platform,
            nodeVersion: process.version,
            memory: process.memoryUsage(),
            uptime: process.uptime()
        },
        timestamp: new Date().toISOString()
    };
    
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            errorReport.progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        }
    } catch (e) {
        errorReport.progressError = e.message;
    }
    
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errorReport, null, 2));
    console.log(`❌ تم حفظ تقرير الخطأ المفصل في ${ERROR_FILE}`);
    
    console.log("\n💡 نصائح لحل المشكلة:");
    console.log("1. تحقق من اتصال الإنترنت");
    console.log("2. تأكد من أن الموقع يعمل (https://topcinema.red)");
    console.log("3. افحص ملف debug_log.json في مجلد AgSeries لمزيد من التفاصيل");
    
    process.exit(1);
});

export {
    fetchPage,
    fetchSeriesListFromPage,
    fetchSeriesDetails,
    extractSeasonsFromSeriesPage,
    fetchSeasonDetails,
    extractEpisodesFromSeasonPage,
    fetchEpisodeDetails,
    ProgressTracker,
    FileManager,
    OrganizedScraper,
    UpdateDetector,
    debug
};
