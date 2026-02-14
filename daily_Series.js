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

const PAGES_PER_RUN = 2;
const DELAY_BETWEEN_REQUESTS = 2000;
const MAX_RETRIES = 3;

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
            } else {
                this.seriesLastChecked = {};
                this.seasonsLastChecked = {};
                this.episodesLastChecked = {};
                this.updateLog = [];
                this.saveTracker();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل متتبع التحديثات، إنشاء جديد");
            this.seriesLastChecked = {};
            this.seasonsLastChecked = {};
            this.episodesLastChecked = {};
            this.updateLog = [];
            this.saveTracker();
        }
    }
    
    saveTracker() {
        const trackerData = {
            seriesLastChecked: this.seriesLastChecked,
            seasonsLastChecked: this.seasonsLastChecked,
            episodesLastChecked: this.episodesLastChecked,
            updateLog: this.updateLog.slice(-100),
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
                
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم، إنشاء جديد");
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
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
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
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        } else if (!this.allPagesScraped) {
            this.seriesPage++;
            console.log(`\n🔄 الانتقال للصفحة ${this.seriesPage}...`);
        }
        
        this.saveProgress();
    }
    
    markAllPagesScraped() {
        this.allPagesScraped = true;
        this.mode = "monitor_home";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    switchToHomeMode() {
        this.mode = "monitor_home";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.saveProgress();
    }
}

// ==================== دوال المساعدة ====================
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            if (i > 0) {
                console.log(`   ↻ إعادة المحاولة ${i + 1}/${retries}...`);
                await delay(2000 * i);
            }
            
            const result = await fetchPage(url);
            if (result) return result;
            
        } catch (error) {
            console.log(`   ⚠️ محاولة ${i + 1} فشلت: ${error.message}`);
        }
    }
    return null;
}

async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url.substring(0, 60)}...`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
            'Referer': 'https://topcinema.rip/'
        };
        
        const response = await fetch(url, { 
            headers,
            timeout: 30000
        });
        
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const html = await response.text();
        await delay(DELAY_BETWEEN_REQUESTS);
        return html;
        
    } catch (error) {
        console.log(`❌ خطأ في الجلب: ${error.message}`);
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

// ==================== استخراج سيرفرات تحميل الموسم ====================
async function extractSeasonDownloadServers(downloadUrl) {
    try {
        console.log(`     ⬇️  جاري استخراج سيرفرات تحميل الموسم...`);
        const html = await fetchWithRetry(downloadUrl);
        if (!html) return {};
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = {};
        
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "غير محدد";
            
            const serverLinks = block.querySelectorAll('a.downloadsLink');
            const qualityServers = [];
            
            serverLinks.forEach(link => {
                const serverName = cleanText(link.querySelector('span')?.textContent || 
                                           link.querySelector('p')?.textContent || 
                                           "غير معروف");
                
                qualityServers.push({
                    name: serverName,
                    url: link.href,
                    quality: quality
                });
            });
            
            if (qualityServers.length > 0) {
                servers[quality] = qualityServers;
            }
        });
        
        console.log(`     ✅ تم العثور على سيرفرات تحميل لـ ${Object.keys(servers).length} جودة`);
        return servers;
        
    } catch (error) {
        console.log(`     ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return {};
    } finally {
        await delay(500);
    }
}

// ==================== استخراج سيرفرات تحميل الحلقة ====================
async function extractEpisodeDownloadServers(downloadUrl) {
    try {
        console.log(`       ⬇️  جاري استخراج سيرفرات تحميل الحلقة...`);
        const html = await fetchWithRetry(downloadUrl);
        if (!html) return {};
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const servers = {};
        
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "غير محدد";
            
            const serverLinks = block.querySelectorAll('a.downloadsLink');
            const qualityServers = [];
            
            serverLinks.forEach(link => {
                const serverName = cleanText(link.querySelector('span')?.textContent || 
                                           link.querySelector('p')?.textContent || 
                                           "غير معروف");
                
                qualityServers.push({
                    name: serverName,
                    url: link.href,
                    quality: quality
                });
            });
            
            if (qualityServers.length > 0) {
                servers[quality] = qualityServers;
            }
        });
        
        console.log(`       ✅ تم العثور على سيرفرات تحميل لـ ${Object.keys(servers).length} جودة`);
        return servers;
        
    } catch (error) {
        console.log(`       ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return {};
    } finally {
        await delay(500);
    }
}

// ==================== استخراج سيرفرات التحميل من صفحة الحلقة مباشرة ====================
async function extractDownloadServersFromPage(doc) {
    try {
        const servers = {};
        
        const downloadBox = doc.querySelector('.DownloadBox');
        if (!downloadBox) return servers;
        
        const downloadBlocks = downloadBox.querySelectorAll('.DownloadBlock');
        
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement ? cleanText(qualityElement.textContent) : "غير محدد";
            
            const serverLinks = block.querySelectorAll('a.downloadsLink');
            const qualityServers = [];
            
            serverLinks.forEach(link => {
                const serverNameElement = link.querySelector('span') || link.querySelector('p');
                const serverName = serverNameElement ? cleanText(serverNameElement.textContent) : "غير معروف";
                
                qualityServers.push({
                    name: serverName,
                    url: link.href,
                    quality: quality
                });
            });
            
            if (qualityServers.length > 0) {
                servers[quality] = qualityServers;
            }
        });
        
        const proServer = downloadBox.querySelector('.proServer a.downloadsLink');
        if (proServer) {
            const serverNameElement = proServer.querySelector('span') || proServer.querySelector('p');
            const serverName = serverNameElement ? cleanText(serverNameElement.textContent) : "متعدد الجودات";
            
            if (!servers["متعدد الجودات"]) {
                servers["متعدد الجودات"] = [];
            }
            servers["متعدد الجودات"].push({
                name: serverName,
                url: proServer.href,
                quality: "متعدد الجودات"
            });
        }
        
        return servers;
        
    } catch (error) {
        console.log(`       ⚠️ خطأ في استخراج سيرفرات التحميل من الصفحة: ${error.message}`);
        return {};
    }
}

// ==================== نظام الملفات المحسن ====================
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
            console.log(`⚠️ خطأ في قراءة الملف ${filePath}: ${error.message}`);
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
            console.log(`⚠️ خطأ في البحث: ${error.message}`);
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
            console.log(`⚠️ خطأ في الحصول على العناصر: ${error.message}`);
            return items;
        }
    }
    
    updateItem(directory, itemId, updatedData, idField = 'id') {
        try {
            const files = fs.readdirSync(directory)
                .filter(file => file.startsWith('Page') && file.endsWith('.json'));
            
            for (const file of files) {
                const filePath = path.join(directory, file);
                const content = this.readJsonFile(filePath);
                
                if (content.data && Array.isArray(content.data)) {
                    const itemIndex = content.data.findIndex(item => item[idField] === itemId);
                    
                    if (itemIndex !== -1) {
                        const oldItem = { ...content.data[itemIndex] };
                        
                        content.data[itemIndex] = {
                            ...oldItem,
                            ...updatedData,
                            updatedAt: new Date().toISOString(),
                            originalCreatedAt: oldItem.createdAt || oldItem.scrapedAt
                        };
                        
                        content.info.lastUpdated = new Date().toISOString();
                        
                        const backupPath = filePath + '.backup';
                        if (fs.existsSync(filePath)) {
                            fs.copyFileSync(filePath, backupPath);
                        }
                        
                        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
                        
                        return {
                            success: true,
                            oldItem: oldItem,
                            newItem: content.data[itemIndex],
                            file: file
                        };
                    }
                }
            }
            
            return { success: false, message: 'Item not found' };
        } catch (error) {
            console.log(`⚠️ خطأ في التحديث: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// ==================== استخراج الصفحة الرئيسية ====================
async function fetchHomePageSeries() {
    console.log("\n🏠 ===== جلب المسلسلات من الصفحة الرئيسية =====");
    
    const url = "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
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
        
        const seriesElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ وجدت ${seriesElements.length} مسلسل في الصفحة الرئيسية`);
        
        for (let i = 0; i < seriesElements.length; i++) {
            const element = seriesElements[i];
            const seriesUrl = element.href;
            
            if (seriesUrl && seriesUrl.includes('topcinema.rip')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                const seasonsCount = cleanText(element.querySelector('.number.Collection span')?.textContent || "");
                
                seriesList.push({
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
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
        return [];
    } finally {
        await delay(1000);
    }
}

// ==================== استخراج قائمة المسلسلات من الصفحة ====================
async function fetchSeriesListFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/"
        : `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/page/${pageNum}/`;
    
    console.log(`\n📺 ===== جلب صفحة المسلسلات ${pageNum} =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchWithRetry(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seriesList = [];
        
        console.log("🔍 البحث عن المسلسلات...");
        
        const seriesElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ وجدت ${seriesElements.length} مسلسل في الصفحة`);
        
        for (let i = 0; i < seriesElements.length; i++) {
            const element = seriesElements[i];
            const seriesUrl = element.href;
            
            if (seriesUrl && seriesUrl.includes('topcinema.rip')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                const seasonsCount = cleanText(element.querySelector('.number.Collection span')?.textContent || "");
                
                seriesList.push({
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
                    page: pageNum,
                    position: i + 1,
                    scrapedAt: new Date().toISOString()
                });
            }
        }
        
        return { url, series: seriesList };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
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
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesData.url;
        const seriesId = extractIdFromShortLink(shortLink);
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seriesData.title);
        const image = doc.querySelector(".image img")?.src || seriesData.image;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
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
        
        return {
            id: seriesId,
            title: title,
            url: seriesData.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story || "غير متوفر",
            details: details,
            page: seriesData.page,
            position: seriesData.position,
            scrapedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
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
        
        const seasonElements = doc.querySelectorAll('.Small--Box.Season');
        
        if (seasonElements.length > 0) {
            seasonElements.forEach((element, i) => {
                const link = element.querySelector('a');
                if (link && link.href) {
                    const seasonNumberElement = element.querySelector('.epnum span');
                    let seasonNumber = i + 1;
                    
                    if (seasonNumberElement && seasonNumberElement.nextSibling) {
                        const seasonNumText = seasonNumberElement.nextSibling.textContent.trim();
                        const numMatch = seasonNumText.match(/\d+/);
                        if (numMatch) seasonNumber = parseInt(numMatch[0]);
                    }
                    
                    const seasonTitle = cleanText(element.querySelector('.title')?.textContent || `الموسم ${seasonNumber}`);
                    const seasonImage = element.querySelector('img')?.src;
                    
                    seasons.push({
                        url: link.href,
                        title: seasonTitle,
                        image: seasonImage,
                        seasonNumber: seasonNumber,
                        position: i + 1
                    });
                }
            });
        } else {
            console.log(`   ℹ️  لا توجد مواسم بالطريقة العادية، جاري البحث بطريقة بديلة...`);
            const allLinks = doc.querySelectorAll('a[href*="season"], a[href*="موسم"]');
            allLinks.forEach(link => {
                if (link.href.includes('topcinema.rip') && 
                    (link.href.includes('/series/') || link.textContent.includes('موسم'))) {
                    const title = cleanText(link.textContent);
                    const numMatch = title.match(/\d+/);
                    const seasonNumber = numMatch ? parseInt(numMatch[0]) : seasons.length + 1;
                    
                    seasons.push({
                        url: link.href,
                        title: title || `الموسم ${seasonNumber}`,
                        seasonNumber: seasonNumber,
                        position: seasons.length + 1
                    });
                }
            });
        }
        
        console.log(`   ✅ وجدت ${seasons.length} موسم`);
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        return [];
    } finally {
        await delay(500);
    }
}

// ==================== استخراج بيانات الموسم الكاملة ====================
async function fetchSeasonDetails(seasonData, seriesId) {
    console.log(`   🎞️  الموسم ${seasonData.seasonNumber || seasonData.position}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchWithRetry(seasonData.url);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seasonData.url;
        const seasonId = extractIdFromShortLink(shortLink);
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seasonData.title);
        const image = doc.querySelector(".image img")?.src || seasonData.image;
        
        let seasonNumber = seasonData.seasonNumber;
        if (!seasonNumber) {
            const numberMatch = title.match(/\d+/);
            seasonNumber = numberMatch ? parseInt(numberMatch[0]) : 1;
        }
        
        const downloadButton = doc.querySelector('a.downloadFullSeason, a[href*="download"][href*="season"]');
        const fullDownloadUrl = downloadButton ? downloadButton.href : null;
        
        let downloadServers = {};
        if (fullDownloadUrl) {
            downloadServers = await extractSeasonDownloadServers(fullDownloadUrl);
        }
        
        return {
            id: seasonId,
            seriesId: seriesId,
            seasonNumber: seasonNumber,
            title: title,
            url: seasonData.url,
            shortLink: shortLink,
            image: image,
            fullDownloadUrl: fullDownloadUrl,
            downloadServers: downloadServers,
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
        
        const episodeSection = doc.querySelector('section.allepcont.getMoreByScroll');
        
        if (episodeSection) {
            const episodeLinks = episodeSection.querySelectorAll('a[href*="topcinema.rip"]');
            
            episodeLinks.forEach((link, i) => {
                const episodeNumElement = link.querySelector('.epnum');
                
                if (episodeNumElement) {
                    const episodeNumText = episodeNumElement.textContent.trim();
                    const episodeNumMatch = episodeNumText.match(/\d+/);
                    const episodeNumber = episodeNumMatch ? parseInt(episodeNumMatch[0]) : i + 1;
                    
                    const titleElement = link.querySelector('.ep-info h2') || link;
                    const episodeTitle = cleanText(titleElement.textContent || titleElement.title || `الحلقة ${episodeNumber}`);
                    
                    episodes.push({
                        url: link.href,
                        title: episodeTitle,
                        episodeNumber: episodeNumber,
                        position: i + 1
                    });
                }
            });
        } else {
            console.log(`     ℹ️  لم يتم العثور على قسم الحلقات بالطريقة المباشرة، جاري البحث بطريقة بديلة...`);
            
            const allLinks = doc.querySelectorAll('a[href*="topcinema.rip"]');
            
            allLinks.forEach((link, i) => {
                const linkText = link.textContent + ' ' + (link.title || '');
                if (linkText.includes('حلقة') || link.href.includes('حلقة')) {
                    const episodeNumMatch = linkText.match(/حلقة\s*(\d+)/) || linkText.match(/\s(\d+)\s/) || [null, i + 1];
                    const episodeNumber = parseInt(episodeNumMatch[1]);
                    
                    episodes.push({
                        url: link.href,
                        title: cleanText(link.textContent || link.title || `الحلقة ${episodeNumber}`),
                        episodeNumber: episodeNumber,
                        position: episodes.length + 1
                    });
                }
            });
        }
        
        console.log(`     ✅ وجدت ${episodes.length} حلقة`);
        return episodes;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج الحلقات: ${error.message}`);
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
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : episodeData.url;
        const episodeId = extractIdFromShortLink(shortLink);
        
        let episodeNumber = episodeData.episodeNumber;
        if (!episodeNumber) {
            const numberMatch = episodeData.title.match(/\d+/);
            episodeNumber = numberMatch ? parseInt(numberMatch[0]) : 1;
        }
        
        let watchServer = null;
        const watchMeta = doc.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"]');
        if (watchMeta && watchMeta.content) {
            watchServer = watchMeta.content;
        } else {
            const watchButton = doc.querySelector('a.watch[href*="/watch/"]');
            if (watchButton && watchButton.href) {
                watchServer = watchButton.href;
            }
        }
        
        let downloadServers = {};
        const downloadButton = doc.querySelector('a[href*="download"]');
        if (downloadButton) {
            const downloadUrl = downloadButton.href;
            downloadServers = await extractEpisodeDownloadServers(downloadUrl);
        } else {
            downloadServers = await extractDownloadServersFromPage(doc);
        }
        
        return {
            id: episodeId,
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episodeNumber,
            title: episodeData.title,
            url: episodeData.url,
            shortLink: shortLink,
            watchServer: watchServer,
            downloadServers: downloadServers,
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
            
            const oldSeries = seriesData.item;
            const updates = [];
            
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
            
            for (const storedSeason of storedSeasons) {
                const seasonUpdates = await this.checkSeasonForUpdates(storedSeason);
                if (seasonUpdates.hasUpdates) {
                    updates.push({
                        type: 'season_updates',
                        seasonId: storedSeason.id,
                        seasonTitle: storedSeason.title,
                        updates: seasonUpdates.updates
                    });
                }
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
        
        if (!pageData || pageData.series.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            this.progress.markAllPagesScraped();
            return false;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل`);
        
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
                    console.log(`   📈 تطبيق التحديثات...`);
                    await this.applyUpdates(seriesDetails.id, updateResult.updates);
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
                
                await this.extractSeasonsForSeries(seriesDetails);
            }
            
            if (i < pageData.series.length - 1) {
                await delay(2000);
            }
        }
        
        return true;
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
    
    async applyUpdates(seriesId, updates) {
        for (const update of updates) {
            if (update.type === 'new_seasons') {
                console.log(`   🆕 جاري إضافة ${update.count} موسم جديد...`);
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
        
        const homeData = {
            info: {
                type: 'home_series',
                fileName: 'Home.json',
                totalItems: homeSeries.length,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            },
            data: homeSeries
        };
        
        fs.writeFileSync(HOME_SERIES_FILE, JSON.stringify(homeData, null, 2));
        console.log(`💾 تم تحديث Home.json (${homeSeries.length} مسلسل)`);
        
        let newSeriesCount = 0;
        let updatedSeriesCount = 0;
        
        for (let i = 0; i < homeSeries.length; i++) {
            const seriesData = homeSeries[i];
            
            console.log(`\n📊 [${i + 1}/${homeSeries.length}] ${seriesData.title.substring(0, 40)}...`);
            
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (!seriesDetails) {
                console.log(`   ⚠️ تخطي المسلسل: فشل استخراج البيانات`);
                continue;
            }
            
            const existingSeries = this.fileManager.findItemInDirectory(TV_SERIES_DIR, seriesDetails.id);
            
            if (existingSeries) {
                console.log(`   ✅ المسلسل موجود، جاري فحص التحديثات...`);
                
                const updateResult = await this.updateDetector.checkSeriesForUpdates(
                    seriesDetails.id,
                    seriesDetails.url,
                    seriesDetails.title
                );
                
                if (updateResult.hasUpdates) {
                    updatedSeriesCount++;
                    console.log(`   📈 تم اكتشاف تحديثات للمسلسل`);
                }
            } else {
                console.log(`   🆕 مسلسل جديد، جاري استخراجه...`);
                newSeriesCount++;
                
                const savedSeries = this.fileManager.saveToFile(
                    TV_SERIES_DIR,
                    this.progress.currentSeriesFile,
                    seriesDetails
                );
                
                this.progress.addSeriesToFile();
                
                await this.extractSeasonsForSeries(seriesDetails);
            }
            
            if (i < homeSeries.length - 1) {
                await delay(2000);
            }
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
        
        if (progress.allPagesScraped) {
            console.log(`\n🏁 تم استخراج جميع صفحات المسلسلات!`);
            console.log(`🔄 التبديل لوضع مراقبة الصفحة الرئيسية...`);
            progress.switchToHomeMode();
        } else {
            progress.resetForNewRun();
            
            let hasMorePages = true;
            while (!progress.shouldStop && hasMorePages) {
                hasMorePages = await scraper.processSeriesPage(progress.seriesPage);
                
                if (hasMorePages) {
                    progress.addPageProcessed();
                    
                    if (!progress.shouldStop) {
                        console.log(`\n⏳ انتظار 3 ثواني قبل الصفحة التالية...`);
                        await delay(3000);
                    }
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
            seriesFiles: fs.readdirSync(TV_SERIES_DIR).filter(f => f.endsWith('.json')).length,
            seasonFiles: fs.readdirSync(SEASONS_DIR).filter(f => f.endsWith('.json')).length,
            episodeFiles: fs.readdirSync(EPISODES_DIR).filter(f => f.endsWith('.json')).length
        },
        nextRun: {
            mode: progress.mode,
            startPage: progress.mode === 'scrape_series' ? progress.seriesPage : 'home_monitoring',
            recommendation: progress.mode === 'scrape_series' ? 'متابعة استخراج المسلسلات' : 'مراقبة الصفحة الرئيسية'
        }
    };
    
    fs.writeFileSync("scraper_report.json", JSON.stringify(finalReport, null, 2));
    console.log(`📄 تم حفظ التقرير في: scraper_report.json`);
    console.log(`📊 ${finalReport.files.seriesFiles} ملف مسلسلات, ${finalReport.files.seasonFiles} ملف مواسم, ${finalReport.files.episodeFiles} ملف حلقات`);
    console.log("=".repeat(60));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    const errorReport = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("scraper_error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في scraper_error.json");
    process.exit(1);
});
