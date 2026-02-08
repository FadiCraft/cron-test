import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== إعدادات المسارات المعدلة ====================
const SERIES_DIR = path.join(__dirname, "Series");
const AG_SERIES_DIR = path.join(SERIES_DIR, "AgSeries");
const TV_SERIES_DIR = path.join(AG_SERIES_DIR, "TV_Series");
const SEASONS_DIR = path.join(AG_SERIES_DIR, "Seasons");
const EPISODES_DIR = path.join(AG_SERIES_DIR, "Episodes");

// ==================== ملفات الفهرس ====================
const SERIES_INDEX_FILE = path.join(TV_SERIES_DIR, "index.json");
const SEASONS_INDEX_FILE = path.join(SEASONS_DIR, "index.json");
const EPISODES_INDEX_FILE = path.join(EPISODES_DIR, "index.json");
const PROGRESS_FILE = path.join(__dirname, "series_progress.json");
const SERIES_HOME_FILE = path.join(TV_SERIES_DIR, "Home.json");
const EPISODES_HOME_FILE = path.join(EPISODES_DIR, "Home.json");

// إنشاء المجلدات إذا لم تكن موجودة
[TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ تم إنشاء: ${dir}`);
    }
});

// ==================== إعدادات النظام ====================
const ITEMS_PER_FILE = {
    series: 250,      // 250 مسلسل في كل ملف
    seasons: 500,     // 500 موسم في كل ملف
    episodes: 1000    // 1000 حلقة في كل ملف
};

const PAGES_PER_RUN = 5;           // 5 صفحات في كل تشغيل
const LATEST_EPISODES_COUNT = 10;  // 10 أحدث حلقات

// ==================== نظام الفهرس ====================
class SeriesIndex {
    constructor() {
        this.loadIndices();
    }
    
    loadIndices() {
        // تحميل فهرس المسلسلات
        try {
            if (fs.existsSync(SERIES_INDEX_FILE)) {
                const data = JSON.parse(fs.readFileSync(SERIES_INDEX_FILE, 'utf8'));
                this.series = data.series || {};
                this.stats = data.stats || { totalSeries: 0, totalPages: 0 };
            } else {
                this.series = {};
                this.stats = { totalSeries: 0, totalPages: 0 };
                this.saveSeriesIndex();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل فهرس المسلسلات");
            this.series = {};
            this.stats = { totalSeries: 0, totalPages: 0 };
        }
        
        // تحميل فهرس المواسم
        try {
            if (fs.existsSync(SEASONS_INDEX_FILE)) {
                const data = JSON.parse(fs.readFileSync(SEASONS_INDEX_FILE, 'utf8'));
                this.seasons = data.seasons || {};
                this.seasonStats = data.stats || { totalSeasons: 0 };
            } else {
                this.seasons = {};
                this.seasonStats = { totalSeasons: 0 };
                this.saveSeasonsIndex();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل فهرس المواسم");
            this.seasons = {};
            this.seasonStats = { totalSeasons: 0 };
        }
        
        // تحميل فهرس الحلقات
        try {
            if (fs.existsSync(EPISODES_INDEX_FILE)) {
                const data = JSON.parse(fs.readFileSync(EPISODES_INDEX_FILE, 'utf8'));
                this.episodes = data.episodes || {};
                this.episodeStats = data.stats || { totalEpisodes: 0, latestEpisodes: [] };
            } else {
                this.episodes = {};
                this.episodeStats = { totalEpisodes: 0, latestEpisodes: [] };
                this.saveEpisodesIndex();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل فهرس الحلقات");
            this.episodes = {};
            this.episodeStats = { totalEpisodes: 0, latestEpisodes: [] };
        }
    }
    
    saveSeriesIndex() {
        const indexData = {
            series: this.series,
            stats: this.stats,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(SERIES_INDEX_FILE, JSON.stringify(indexData, null, 2));
    }
    
    saveSeasonsIndex() {
        const indexData = {
            seasons: this.seasons,
            stats: this.seasonStats,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(SEASONS_INDEX_FILE, JSON.stringify(indexData, null, 2));
    }
    
    saveEpisodesIndex() {
        const indexData = {
            episodes: this.episodes,
            stats: this.episodeStats,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(EPISODES_INDEX_FILE, JSON.stringify(indexData, null, 2));
    }
    
    // ==================== مسلسلات ====================
    addSeries(seriesId, seriesData) {
        const isNew = !this.series[seriesId];
        
        this.series[seriesId] = {
            id: seriesId,
            title: seriesData.title,
            currentFile: seriesData.currentFile,
            page: seriesData.page,
            seasonsCount: seriesData.seasonsCount || 0,
            lastUpdated: new Date().toISOString(),
            ...(isNew ? {
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            } : {
                firstSeen: this.series[seriesId].firstSeen,
                lastSeen: new Date().toISOString()
            })
        };
        
        if (isNew) {
            this.stats.totalSeries++;
        }
        
        this.saveSeriesIndex();
        return isNew;
    }
    
    isSeriesExists(seriesId) {
        return !!this.series[seriesId];
    }
    
    getSeries(seriesId) {
        return this.series[seriesId];
    }
    
    getAllSeriesInFile(fileName) {
        return Object.values(this.series).filter(series => series.currentFile === fileName);
    }
    
    // ==================== مواسم ====================
    addSeason(seasonId, seasonData) {
        const isNew = !this.seasons[seasonId];
        
        this.seasons[seasonId] = {
            id: seasonId,
            seriesId: seasonData.seriesId,
            seasonNumber: seasonData.seasonNumber,
            currentFile: seasonData.currentFile,
            episodesCount: seasonData.episodesCount || 0,
            lastUpdated: new Date().toISOString(),
            ...(isNew ? {
                firstSeen: new Date().toISOString()
            } : {})
        };
        
        if (isNew) {
            this.seasonStats.totalSeasons++;
        }
        
        this.saveSeasonsIndex();
        return isNew;
    }
    
    isSeasonExists(seasonId) {
        return !!this.seasons[seasonId];
    }
    
    isSeasonExistsBySeriesAndNumber(seriesId, seasonNumber) {
        return Object.values(this.seasons).some(
            season => season.seriesId === seriesId && season.seasonNumber === seasonNumber
        );
    }
    
    getSeasonsBySeries(seriesId) {
        return Object.values(this.seasons).filter(season => season.seriesId === seriesId);
    }
    
    // ==================== حلقات ====================
    addEpisode(episodeId, episodeData) {
        const isNew = !this.episodes[episodeId];
        
        const episodeRecord = {
            id: episodeId,
            seriesId: episodeData.seriesId,
            seasonId: episodeData.seasonId,
            episodeNumber: episodeData.episodeNumber,
            currentFile: episodeData.currentFile,
            title: episodeData.title,
            url: episodeData.url,
            lastUpdated: new Date().toISOString(),
            ...(isNew ? {
                firstSeen: new Date().toISOString()
            } : {})
        };
        
        this.episodes[episodeId] = episodeRecord;
        
        if (isNew) {
            this.episodeStats.totalEpisodes++;
            
            // إضافة إلى أحدث الحلقات
            this.episodeStats.latestEpisodes.unshift({
                id: episodeId,
                seriesId: episodeData.seriesId,
                seasonId: episodeData.seasonId,
                title: episodeData.title,
                episodeNumber: episodeData.episodeNumber,
                url: episodeData.url,
                scrapedAt: new Date().toISOString()
            });
            
            // الاحتفاظ فقط بـ LATEST_EPISODES_COUNT حلقة كحد أقصى
            if (this.episodeStats.latestEpisodes.length > LATEST_EPISODES_COUNT * 5) {
                this.episodeStats.latestEpisodes = this.episodeStats.latestEpisodes.slice(0, LATEST_EPISODES_COUNT * 5);
            }
        }
        
        this.saveEpisodesIndex();
        return isNew;
    }
    
    isEpisodeExists(episodeId) {
        return !!this.episodes[episodeId];
    }
    
    isEpisodeExistsBySeasonAndNumber(seasonId, episodeNumber) {
        return Object.values(this.episodes).some(
            episode => episode.seasonId === seasonId && episode.episodeNumber === episodeNumber
        );
    }
    
    getEpisodesBySeason(seasonId) {
        return Object.values(this.episodes).filter(episode => episode.seasonId === seasonId);
    }
    
    getLatestEpisodes(count = LATEST_EPISODES_COUNT) {
        return this.episodeStats.latestEpisodes.slice(0, count).map(ep => ({
            id: ep.id,
            seriesId: ep.seriesId,
            seasonId: ep.seasonId,
            title: ep.title,
            episodeNumber: ep.episodeNumber,
            url: ep.url,
            scrapedAt: ep.scrapedAt
        }));
    }
    
    // ==================== إحصائيات ====================
    getStats() {
        return {
            series: {
                total: Object.keys(this.series).length,
                stats: this.stats
            },
            seasons: {
                total: Object.keys(this.seasons).length,
                stats: this.seasonStats
            },
            episodes: {
                total: Object.keys(this.episodes).length,
                stats: this.episodeStats
            }
        };
    }
}

// ==================== نظام التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                this.currentPage = data.currentPage || 1;
                this.seriesFileNumber = data.seriesFileNumber || 1;
                this.seriesInCurrentFile = data.seriesInCurrentFile || 0;
                this.currentSeriesFile = data.currentSeriesFile || "Top1.json";
                
                this.seasonFileNumber = data.seasonFileNumber || 1;
                this.seasonsInCurrentFile = data.seasonsInCurrentFile || 0;
                this.currentSeasonFile = data.currentSeasonFile || "Top1.json";
                
                this.episodeFileNumber = data.episodeFileNumber || 1;
                this.episodesInCurrentFile = data.episodesInCurrentFile || 0;
                this.currentEpisodeFile = data.currentEpisodeFile || "Top1.json";
                
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.shouldStop = data.shouldStop || false;
                this.allPagesScraped = data.allPagesScraped || false;
                
                this.lastSeriesId = data.lastSeriesId || null;
                this.lastSeasonId = data.lastSeasonId || null;
                this.lastEpisodeId = data.lastEpisodeId || null;
                
                this.mode = data.mode || "scrape_all";
                this.homeScraped = data.homeScraped || false;
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ لا يمكن تحميل حالة التقدم");
            this.resetProgress();
        }
    }
    
    resetProgress() {
        this.currentPage = 1;
        this.seriesFileNumber = 1;
        this.seriesInCurrentFile = 0;
        this.currentSeriesFile = "Top1.json";
        
        this.seasonFileNumber = 1;
        this.seasonsInCurrentFile = 0;
        this.currentSeasonFile = "Top1.json";
        
        this.episodeFileNumber = 1;
        this.episodesInCurrentFile = 0;
        this.currentEpisodeFile = "Top1.json";
        
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.allPagesScraped = false;
        
        this.lastSeriesId = null;
        this.lastSeasonId = null;
        this.lastEpisodeId = null;
        
        this.mode = "scrape_all";
        this.homeScraped = false;
        
        this.saveProgress();
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            seriesFileNumber: this.seriesFileNumber,
            seriesInCurrentFile: this.seriesInCurrentFile,
            currentSeriesFile: this.currentSeriesFile,
            
            seasonFileNumber: this.seasonFileNumber,
            seasonsInCurrentFile: this.seasonsInCurrentFile,
            currentSeasonFile: this.currentSeasonFile,
            
            episodeFileNumber: this.episodeFileNumber,
            episodesInCurrentFile: this.episodesInCurrentFile,
            currentEpisodeFile: this.currentEpisodeFile,
            
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            shouldStop: this.shouldStop,
            allPagesScraped: this.allPagesScraped,
            
            lastSeriesId: this.lastSeriesId,
            lastSeasonId: this.lastSeasonId,
            lastEpisodeId: this.lastEpisodeId,
            
            mode: this.mode,
            homeScraped: this.homeScraped,
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    addSeriesToFile() {
        this.seriesInCurrentFile++;
        
        if (this.seriesInCurrentFile >= ITEMS_PER_FILE.series) {
            this.seriesFileNumber++;
            this.seriesInCurrentFile = 0;
            this.currentSeriesFile = `Top${this.seriesFileNumber}.json`;
            console.log(`\n📁 تم تعبئة ملف المسلسلات! إنشاء ملف جديد: ${this.currentSeriesFile}`);
        }
        
        this.saveProgress();
    }
    
    addSeasonToFile() {
        this.seasonsInCurrentFile++;
        
        if (this.seasonsInCurrentFile >= ITEMS_PER_FILE.seasons) {
            this.seasonFileNumber++;
            this.seasonsInCurrentFile = 0;
            this.currentSeasonFile = `Top${this.seasonFileNumber}.json`;
            console.log(`\n📁 تم تعبئة ملف المواسم! إنشاء ملف جديد: ${this.currentSeasonFile}`);
        }
        
        this.saveProgress();
    }
    
    addEpisodeToFile() {
        this.episodesInCurrentFile++;
        
        if (this.episodesInCurrentFile >= ITEMS_PER_FILE.episodes) {
            this.episodeFileNumber++;
            this.episodesInCurrentFile = 0;
            this.currentEpisodeFile = `Top${this.episodeFileNumber}.json`;
            console.log(`\n📁 تم تعبئة ملف الحلقات! إنشاء ملف جديد: ${this.currentEpisodeFile}`);
        }
        
        this.saveProgress();
    }
    
    addPageProcessed() {
        this.pagesProcessedThisRun++;
        
        if (this.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        } else if (!this.allPagesScraped) {
            this.currentPage++;
            console.log(`\n🔄 الانتقال للصفحة ${this.currentPage}...`);
        }
        
        this.saveProgress();
    }
    
    markAllPagesScraped() {
        this.allPagesScraped = true;
        this.mode = "update_home";
        this.currentPage = 1;
        this.saveProgress();
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
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

// ==================== دالة استخراج ID محسنة ====================
function extractIdFromShortLink(htmlContent) {
    try {
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;
        
        // البحث عن input#shortlink أولاً
        const shortLinkInput = doc.querySelector('#shortlink');
        if (shortLinkInput && shortLinkInput.value) {
            const shortLink = shortLinkInput.value;
            // استخراج الرقم من الرابط المختصر
            const match = shortLink.match(/\?p=(\d+)/) || shortLink.match(/\?gt=(\d+)/);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // بديل: استخراج من الرابط
        const canonicalLink = doc.querySelector('link[rel="canonical"]');
        if (canonicalLink && canonicalLink.href) {
            const url = canonicalLink.href;
            const parts = url.split('/').filter(p => p);
            const lastPart = parts[parts.length - 1];
            const numMatch = lastPart.match(/(\d+)/);
            return numMatch ? numMatch[1] : `temp_${Date.now()}`;
        }
        
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// ==================== استخراج قائمة المسلسلات من الصفحة ====================
async function fetchSeriesListFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/"
        : `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/page/${pageNum}/`;
    
    console.log(`\n📺 ===== جلب صفحة المسلسلات ${pageNum} =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
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
                
                // استخراج ID مؤقت للقائمة فقط
                const tempId = `series_${pageNum}_${i + 1}`;
                
                seriesList.push({
                    tempId: tempId,
                    url: seriesUrl,
                    title: title,
                    image: image,
                    page: pageNum,
                    position: i + 1
                });
            }
        }
        
        return { url, series: seriesList };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة ${pageNum}:`, error.message);
        return null;
    }
}

// ==================== استخراج بيانات المسلسل الكاملة مع ID الصحيح ====================
async function fetchSeriesDetails(seriesData) {
    console.log(`\n🎬 [${seriesData.position}] ${seriesData.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchPage(seriesData.url);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
            return null;
        }
        
        // استخراج ID من الرابط المختصر في الصفحة
        const seriesId = extractIdFromShortLink(html);
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر (للحفظ)
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesData.url;
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seriesData.title);
        const image = doc.querySelector(".image img")?.src || seriesData.image;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // التفاصيل
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
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج المواسم من صفحة المسلسل ====================
async function extractSeasonsFromSeriesPage(seriesUrl, seriesId) {
    console.log(`   📅 جاري استخراج المواسم...`);
    
    try {
        const html = await fetchPage(seriesUrl);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة المسلسل للمواسم`);
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seasons = [];
        
        // البحث عن عناصر المواسم بطرق مختلفة
        const seasonSelectors = [
            '.Small--Box.Season',
            'a[href*="season"]',
            '.season-item',
            '[class*="season"]',
            '.allseasoncont a'
        ];
        
        for (const selector of seasonSelectors) {
            const elements = doc.querySelectorAll(selector);
            
            if (elements.length > 0) {
                console.log(`   🔍 وجدت ${elements.length} عنصر باستخدام: ${selector}`);
                
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    let link;
                    
                    if (element.tagName === 'A') {
                        link = element;
                    } else {
                        link = element.querySelector('a');
                    }
                    
                    if (link && link.href && link.href.includes('topcinema.rip') && link.href.includes('season')) {
                        // استخراج رقم الموسم
                        const seasonText = cleanText(link.textContent);
                        const seasonNumMatch = seasonText.match(/الموسم\s*(\d+)/i) || 
                                              link.href.match(/season[\/\-](\d+)/i) || 
                                              [null, i + 1];
                        
                        const seasonNumber = parseInt(seasonNumMatch[1]);
                        
                        // إنشاء ID للموسم
                        const tempSeasonId = `season_${seriesId}_${seasonNumber}`;
                        
                        // التحقق من عدم تكرار الموسم
                        const isDuplicate = seasons.some(s => s.seasonNumber === seasonNumber);
                        if (!isDuplicate) {
                            seasons.push({
                                tempId: tempSeasonId,
                                url: link.href,
                                title: seasonText || `الموسم ${seasonNumber}`,
                                seasonNumber: seasonNumber,
                                seriesId: seriesId,
                                position: seasons.length + 1
                            });
                            
                            console.log(`     📌 الموسم ${seasonNumber}: ${seasonText.substring(0, 30)}...`);
                        }
                    }
                }
                
                if (seasons.length > 0) break;
            }
        }
        
        console.log(`   ✅ وجدت ${seasons.length} موسم`);
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        return [];
    }
}

// ==================== استخراج بيانات الموسم الكاملة مع ID الصحيح ====================
async function fetchSeasonDetails(seasonData) {
    console.log(`   🎞️  الموسم ${seasonData.seasonNumber}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(seasonData.url);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم`);
            return null;
        }
        
        // استخراج ID من الرابط المختصر في الصفحة
        const seasonId = extractIdFromShortLink(html);
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seasonData.url;
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seasonData.title);
        const image = doc.querySelector(".image img")?.src;
        
        return {
            id: seasonId,
            seriesId: seasonData.seriesId,
            seasonNumber: seasonData.seasonNumber,
            title: title,
            url: seasonData.url,
            shortLink: shortLink,
            image: image,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الحلقات من صفحة الموسم (مصحح) ====================
async function extractEpisodesFromSeasonPage(seasonUrl, seasonId) {
    console.log(`     📺 جاري استخراج الحلقات...`);
    
    try {
        const html = await fetchPage(seasonUrl);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم للحلقات`);
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        console.log(`     🔍 جاري البحث عن الحلقات في الصفحة...`);
        
        // === الطريقة 1: البحث عن عناصر الحلقات المباشرة ===
        const episodeSelectors = [
            '.Small--Box',
            '.episodul',
            '.episode-item',
            '[class*="episode"]',
            '[class*="episod"]',
            '.allepcont .Small--Box',
            '.getMoreByScroll .Small--Box',
            '[id*="episode"]'
        ];
        
        let foundWithSelector = false;
        
        for (const selector of episodeSelectors) {
            const elements = doc.querySelectorAll(selector);
            
            if (elements.length > 0) {
                console.log(`     ℹ️  وجدت ${elements.length} عنصر باستخدام: ${selector}`);
                
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    const link = element.querySelector('a');
                    
                    if (link && link.href && link.href.includes('topcinema.rip')) {
                        // التحقق من أن هذا عنصر حلقة
                        const text = cleanText(element.textContent);
                        const href = link.href;
                        
                        // شروط التأكد من أنها حلقة
                        const isEpisode = text.includes('الحلقة') || 
                                         href.includes('/episode/') || 
                                         href.includes('/watch/') ||
                                         element.querySelector('.epnum') ||
                                         element.classList.contains('episodul') ||
                                         (text.match(/\d+/) && text.length < 100);
                        
                        if (isEpisode) {
                            // استخراج رقم الحلقة
                            let episodeNumber = episodes.length + 1;
                            
                            // محاولة استخراج رقم الحلقة من النص
                            const numberMatch = text.match(/الحلقة\s*(\d+)/i) || 
                                               href.match(/episode\/(\d+)/i) ||
                                               element.querySelector('.epnum')?.textContent?.match(/\d+/);
                            
                            if (numberMatch && numberMatch[1]) {
                                episodeNumber = parseInt(numberMatch[1]);
                            }
                            
                            // استخراج عنوان الحلقة
                            let title = cleanText(
                                element.querySelector('.title, h3, h4, .name, .ep-title')?.textContent || 
                                link.textContent || 
                                `الحلقة ${episodeNumber}`
                            );
                            
                            // إذا كان العنوان قصيراً جداً، نبحث في العنصر بأكمله
                            if (title.length < 5) {
                                title = text.substring(0, 100);
                            }
                            
                            // إنشاء ID مؤقت
                            const tempEpisodeId = `ep_${seasonId}_${episodeNumber}_${Date.now()}`;
                            
                            // التحقق من عدم تكرار الحلقة
                            const isDuplicate = episodes.some(ep => 
                                ep.episodeNumber === episodeNumber || ep.url === href
                            );
                            
                            if (!isDuplicate) {
                                episodes.push({
                                    tempId: tempEpisodeId,
                                    url: href,
                                    title: title,
                                    episodeNumber: episodeNumber,
                                    seasonId: seasonId,
                                    position: episodes.length + 1
                                });
                                
                                console.log(`       📌 [${episodes.length}] ${title.substring(0, 40)}... (رقم ${episodeNumber})`);
                                foundWithSelector = true;
                            }
                        }
                    }
                }
                
                if (foundWithSelector && episodes.length > 0) {
                    console.log(`     ✅ وجدت ${episodes.length} حلقة باستخدام ${selector}`);
                    break;
                }
            }
        }
        
        // === الطريقة 2: إذا لم نجد حلقات بالطريقة الأولى، نبحث في جميع الروابط ===
        if (episodes.length === 0) {
            console.log(`     ℹ️  لم نجد حلقات بالطريقة الأولى، جاري البحث في جميع الروابط...`);
            
            const allLinks = doc.querySelectorAll('a[href*="topcinema.rip"]');
            
            for (let i = 0; i < allLinks.length; i++) {
                const link = allLinks[i];
                const href = link.href;
                const text = cleanText(link.textContent);
                
                // تحسين شروط تحديد الحلقات
                const isLikelyEpisode = 
                    (href.includes('/episode/') && !href.includes('/season/')) ||
                    (href.includes('/watch/') && !href.includes('/series/')) ||
                    text.includes('الحلقة') ||
                    text.match(/^الحلقة\s+\d+/i) ||
                    (text.match(/^\d+$/) && text.length < 4 && !href.includes('/season/')) ||
                    (text.match(/الحلقة\s+\d+\s*:/i));
                
                if (isLikelyEpisode) {
                    let episodeNumber = episodes.length + 1;
                    
                    // محاولة استخراج رقم الحلقة
                    const numberMatch = text.match(/الحلقة\s*(\d+)/i) || 
                                       href.match(/episode\/(\d+)/i) ||
                                       text.match(/^(\d+)$/);
                    
                    if (numberMatch && numberMatch[1]) {
                        episodeNumber = parseInt(numberMatch[1]);
                    }
                    
                    // إنشاء ID مؤقت
                    const tempEpisodeId = `ep_${seasonId}_${episodeNumber}_${Date.now()}`;
                    
                    // التحقق من عدم التكرار
                    const isDuplicate = episodes.some(ep => 
                        ep.episodeNumber === episodeNumber || ep.url === href
                    );
                    
                    if (!isDuplicate) {
                        episodes.push({
                            tempId: tempEpisodeId,
                            url: href,
                            title: text || `الحلقة ${episodeNumber}`,
                            episodeNumber: episodeNumber,
                            seasonId: seasonId,
                            position: episodes.length + 1
                        });
                        
                        console.log(`       📌 [${episodes.length}] ${text.substring(0, 40)}...`);
                    }
                }
            }
        }
        
        // === الطريقة 3: البحث في الجداول ===
        if (episodes.length === 0) {
            console.log(`     ℹ️  البحث في الجداول...`);
            
            const tables = doc.querySelectorAll('table');
            
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                
                for (const row of rows) {
                    const link = row.querySelector('a[href*="topcinema.rip"]');
                    
                    if (link) {
                        const rowText = cleanText(row.textContent);
                        
                        if (rowText.includes('الحلقة') || link.href.includes('/episode/')) {
                            let episodeNumber = episodes.length + 1;
                            const numberMatch = rowText.match(/الحلقة\s*(\d+)/i) || 
                                               link.href.match(/episode\/(\d+)/i);
                            
                            if (numberMatch && numberMatch[1]) {
                                episodeNumber = parseInt(numberMatch[1]);
                            }
                            
                            const tempEpisodeId = `ep_${seasonId}_${episodeNumber}_${Date.now()}`;
                            
                            episodes.push({
                                tempId: tempEpisodeId,
                                url: link.href,
                                title: rowText || `الحلقة ${episodeNumber}`,
                                episodeNumber: episodeNumber,
                                seasonId: seasonId,
                                position: episodes.length + 1
                            });
                        }
                    }
                }
            }
        }
        
        // === إزالة التكرارات ===
        const uniqueEpisodes = [];
        const seenUrls = new Set();
        
        for (const episode of episodes) {
            if (!seenUrls.has(episode.url)) {
                seenUrls.add(episode.url);
                uniqueEpisodes.push(episode);
            }
        }
        
        // === ترتيب الحلقات حسب الرقم ===
        uniqueEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        
        // === تحديث الأرقام بعد الترتيب ===
        uniqueEpisodes.forEach((ep, index) => {
            ep.position = index + 1;
        });
        
        console.log(`     ✅ النتيجة النهائية: ${uniqueEpisodes.length} حلقة فريدة`);
        
        // === طباعة معلومات عن الحلقات التي تم العثور عليها ===
        if (uniqueEpisodes.length > 0) {
            console.log(`     📋 قائمة الحلقات:`);
            uniqueEpisodes.slice(0, 5).forEach((ep, i) => {
                console.log(`       ${i + 1}. الحلقة ${ep.episodeNumber}: ${ep.title.substring(0, 50)}...`);
            });
            
            if (uniqueEpisodes.length > 5) {
                console.log(`       ... و ${uniqueEpisodes.length - 5} حلقات أخرى`);
            }
        }
        
        return uniqueEpisodes;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج الحلقات: ${error.message}`);
        return [];
    }
}

// ==================== استخراج بيانات الحلقة الكاملة مع ID الصحيح ====================
async function fetchEpisodeDetails(episodeData, seriesId) {
    console.log(`       🎥 الحلقة ${episodeData.episodeNumber}: ${episodeData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(episodeData.url);
        if (!html) {
            console.log(`       ⚠️ فشل جلب صفحة الحلقة`);
            return null;
        }
        
        // استخراج ID من الرابط المختصر في الصفحة
        const episodeId = extractIdFromShortLink(html);
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : episodeData.url;
        
        // استخراج سيرفر المشاهدة
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
        
        // استخراج سيرفرات التحميل
        let downloadServers = {};
        const downloadButton = doc.querySelector('a[href*="download"]');
        
        if (downloadButton && downloadButton.href) {
            try {
                const downloadHtml = await fetchPage(downloadButton.href);
                if (downloadHtml) {
                    const downloadDom = new JSDOM(downloadHtml);
                    const downloadDoc = downloadDom.window.document;
                    
                    const downloadBlocks = downloadDoc.querySelectorAll('.DownloadBlock');
                    
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
                            downloadServers[quality] = qualityServers;
                        }
                    });
                    
                    console.log(`       ✅ تم العثور على ${Object.keys(downloadServers).length} جودة للتحميل`);
                }
            } catch (error) {
                console.log(`       ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
            }
        }
        
        return {
            id: episodeId,
            seriesId: seriesId,
            seasonId: episodeData.seasonId,
            episodeNumber: episodeData.episodeNumber,
            title: episodeData.title,
            url: episodeData.url,
            shortLink: shortLink,
            watchServer: watchServer,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== دوال الحفظ ====================
function saveToTopFile(directory, fileName, data, progress, type = "series") {
    const filePath = path.join(directory, fileName);
    
    let existingData = [];
    let fileInfo = {};
    
    // تحميل الملف الحالي إذا كان موجوداً
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingData = fileContent.data || [];
            fileInfo = fileContent.info || {};
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة الملف ${fileName}: ${error.message}`);
        }
    }
    
    // البحث إذا كان العنصر موجوداً في الملف
    const existingIndex = existingData.findIndex(item => item.id === data.id);
    
    if (existingIndex !== -1) {
        // تحديث العنصر الموجود
        existingData[existingIndex] = data;
        console.log(`   🔄 تم تحديث العنصر في ${fileName}`);
    } else {
        // إضافة العنصر الجديد
        existingData.push(data);
        console.log(`   ➕ تم إضافة العنصر الجديد إلى ${fileName}`);
        
        // تحديث عداد الملف حسب النوع
        if (type === "series") {
            progress.addSeriesToFile();
        } else if (type === "season") {
            progress.addSeasonToFile();
        } else if (type === "episode") {
            progress.addEpisodeToFile();
        }
    }
    
    // حفظ الملف
    const fileContent = {
        info: {
            fileName: fileName,
            type: type,
            totalItems: existingData.length,
            created: fileInfo.created || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            itemsPerFileLimit: ITEMS_PER_FILE[type + 's'] || ITEMS_PER_FILE.episodes
        },
        data: existingData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

function saveSeriesToTopFile(seriesDetails, progress) {
    const saved = saveToTopFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails, progress, "series");
    console.log(`   💾 تم حفظ المسلسل في ${progress.currentSeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} مسلسل`);
    
    progress.lastSeriesId = seriesDetails.id;
    progress.saveProgress();
    
    return saved;
}

function saveSeasonToTopFile(seasonDetails, progress) {
    const saved = saveToTopFile(SEASONS_DIR, progress.currentSeasonFile, seasonDetails, progress, "season");
    console.log(`     💾 تم حفظ الموسم في ${progress.currentSeasonFile}`);
    console.log(`       📊 الإجمالي في الملف: ${saved.info.totalItems} موسم`);
    
    progress.lastSeasonId = seasonDetails.id;
    progress.saveProgress();
    
    return saved;
}

function saveEpisodeToTopFile(episodeDetails, progress) {
    const saved = saveToTopFile(EPISODES_DIR, progress.currentEpisodeFile, episodeDetails, progress, "episode");
    console.log(`       💾 تم حفظ الحلقة في ${progress.currentEpisodeFile}`);
    console.log(`         📊 الإجمالي في الملف: ${saved.info.totalItems} حلقة`);
    
    progress.lastEpisodeId = episodeDetails.id;
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ جميع مسلسلات الصفحة الأولى في Home.json ====================
function saveAllSeriesToHomeFile(seriesList) {
    const fileContent = {
        fileName: "Home.json",
        description: "جميع مسلسلات الصفحة الأولى",
        totalSeries: seriesList.length,
        lastUpdated: new Date().toISOString(),
        series: seriesList.map(series => ({
            id: series.id,
            title: series.title,
            url: series.url,
            image: series.image,
            imdbRating: series.imdbRating,
            story: series.story,
            scrapedAt: series.scrapedAt
        }))
    };
    
    fs.writeFileSync(SERIES_HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`\n🏠 تم حفظ ${seriesList.length} مسلسل في TV_Series/Home.json`);
    
    return fileContent;
}

// ==================== استخراج أحدث الحلقات من الصفحة الرئيسية ====================
async function fetchLatestEpisodesFromHomePage() {
    console.log("\n📺 جاري استخراج أحدث الحلقات من الصفحة الرئيسية...");
    
    try {
        const html = await fetchPage("https://topcinema.rip/");
        if (!html) {
            console.log("❌ فشل جلب الصفحة الرئيسية");
            return [];
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const latestEpisodes = [];
        
        // البحث عن قسم "آخر الحلقات المضافة"
        const sections = doc.querySelectorAll('section, .Wide--Contents, .widget, .latest-episodes');
        
        for (const section of sections) {
            const sectionTitle = cleanText(section.querySelector('h2, h3, .title, .widget-title')?.textContent || '');
            
            if (sectionTitle.includes('آخر الحلقات') || 
                sectionTitle.includes('الحلقات الجديدة') ||
                sectionTitle.includes('أحدث الحلقات') ||
                sectionTitle.includes('Recently Added')) {
                
                console.log(`     📍 وجدت قسم: ${sectionTitle}`);
                
                const episodeElements = section.querySelectorAll('.Small--Box, .episode-item, a[href*="episode"], a[href*="watch"]');
                
                for (let i = 0; i < Math.min(episodeElements.length, LATEST_EPISODES_COUNT * 2); i++) {
                    const element = episodeElements[i];
                    const link = element.querySelector('a') || element;
                    
                    if (link && link.href && link.href.includes('topcinema.rip')) {
                        const title = cleanText(link.textContent || link.title || element.textContent || `الحلقة ${i + 1}`);
                        
                        // استخراج ID مؤقت
                        const episodeId = `latest_${Date.now()}_${i}`;
                        
                        latestEpisodes.push({
                            id: episodeId,
                            title: title,
                            url: link.href,
                            scrapedAt: new Date().toISOString()
                        });
                        
                        console.log(`       📌 ${title.substring(0, 40)}...`);
                    }
                }
                
                if (latestEpisodes.length > 0) {
                    break;
                }
            }
        }
        
        // إذا لم نجد قسم محدد، نبحث في جميع عناصر Small--Box
        if (latestEpisodes.length === 0) {
            console.log(`     ℹ️  لم نجد قسم محدد، جاري البحث في جميع عناصر Small--Box...`);
            
            const allBoxes = doc.querySelectorAll('.Small--Box');
            
            for (let i = 0; i < Math.min(allBoxes.length, LATEST_EPISODES_COUNT * 3); i++) {
                const box = allBoxes[i];
                const link = box.querySelector('a');
                
                if (link && link.href && link.href.includes('topcinema.rip')) {
                    const title = cleanText(link.textContent || link.title || box.textContent);
                    
                    // نبحث عن حلقات (ليست مسلسلات أو مواسم)
                    if (!link.href.includes('/series/') && !link.href.includes('/season/')) {
                        const episodeId = `latest_box_${Date.now()}_${i}`;
                        
                        latestEpisodes.push({
                            id: episodeId,
                            title: title,
                            url: link.href,
                            scrapedAt: new Date().toISOString()
                        });
                    }
                }
            }
        }
        
        // إزالة التكرارات
        const uniqueEpisodes = [];
        const seenUrls = new Set();
        
        for (const episode of latestEpisodes) {
            if (!seenUrls.has(episode.url)) {
                seenUrls.add(episode.url);
                uniqueEpisodes.push(episode);
            }
        }
        
        // أخذ العدد المطلوب فقط
        const finalEpisodes = uniqueEpisodes.slice(0, LATEST_EPISODES_COUNT);
        
        console.log(`✅ تم استخراج ${finalEpisodes.length} حلقة من الصفحة الرئيسية`);
        return finalEpisodes;
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج أحدث الحلقات: ${error.message}`);
        return [];
    }
}

// ==================== حفظ أحدث الحلقات في Home.json ====================
async function saveLatestEpisodesToHomeFile() {
    console.log("\n📁 جاري حفظ أحدث الحلقات في Home.json...");
    
    let latestEpisodes = [];
    
    // المحاولة 1: استخراج من الصفحة الرئيسية
    latestEpisodes = await fetchLatestEpisodesFromHomePage();
    
    // المحاولة 2: إذا لم نجد في الصفحة الرئيسية، نستخدم الحلقات المخزنة في الفهرس
    if (latestEpisodes.length === 0) {
        console.log("ℹ️ لم نجد حلقات في الصفحة الرئيسية، جاري استخدام الحلقات المخزنة...");
        
        try {
            if (fs.existsSync(EPISODES_INDEX_FILE)) {
                const indexData = JSON.parse(fs.readFileSync(EPISODES_INDEX_FILE, 'utf8'));
                const allEpisodes = Object.values(indexData.episodes || {});
                
                // ترتيب الحلقات من الأحدث إلى الأقدم
                allEpisodes.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
                
                latestEpisodes = allEpisodes.slice(0, LATEST_EPISODES_COUNT).map(ep => ({
                    id: ep.id,
                    title: ep.title || `الحلقة ${ep.episodeNumber}`,
                    url: ep.url,
                    episodeNumber: ep.episodeNumber,
                    scrapedAt: ep.lastUpdated
                }));
                
                console.log(`✅ تم استخدام ${latestEpisodes.length} حلقة من الفهرس`);
            }
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة فهرس الحلقات: ${error.message}`);
        }
    }
    
    // المحاولة 3: إذا لم نجد في الفهرس، نبحث في ملفات الحلقات
    if (latestEpisodes.length === 0) {
        console.log("ℹ️ جاري البحث في ملفات الحلقات...");
        
        try {
            const episodeFiles = fs.readdirSync(EPISODES_DIR).filter(f => f.startsWith('Top') && f.endsWith('.json'));
            
            for (const file of episodeFiles) {
                const filePath = path.join(EPISODES_DIR, file);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (content.data && Array.isArray(content.data)) {
                    // أخذ آخر 5 حلقات من كل ملف
                    const fileEpisodes = content.data.slice(-5).map(ep => ({
                        id: ep.id,
                        title: ep.title,
                        url: ep.url,
                        episodeNumber: ep.episodeNumber,
                        scrapedAt: ep.scrapedAt
                    }));
                    
                    latestEpisodes = [...latestEpisodes, ...fileEpisodes];
                }
                
                if (latestEpisodes.length >= LATEST_EPISODES_COUNT) {
                    break;
                }
            }
            
            // ترتيب واختيار العدد المطلوب
            latestEpisodes.sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
            latestEpisodes = latestEpisodes.slice(0, LATEST_EPISODES_COUNT);
            
            console.log(`✅ تم استخدام ${latestEpisodes.length} حلقة من ملفات الحلقات`);
            
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة ملفات الحلقات: ${error.message}`);
        }
    }
    
    // إنشاء محتوى الملف
    const fileContent = {
        fileName: "Home.json",
        description: `أحدث ${LATEST_EPISODES_COUNT} حلقات مضافة`,
        totalEpisodes: latestEpisodes.length,
        lastUpdated: new Date().toISOString(),
        episodes: latestEpisodes
    };
    
    // حفظ الملف
    fs.writeFileSync(EPISODES_HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`🏠 تم حفظ ${latestEpisodes.length} حلقة في Episodes/Home.json`);
    
    return fileContent;
}

// ==================== المرحلة 1: استخراج جميع الصفحات ====================
async function phase1ScrapeAll(progress, index) {
    console.log("🚀 المرحلة 1: بدء الاستخراج الكامل للمسلسلات");
    console.log("=".repeat(60));
    
    const startTime = Date.now();
    let totalSeriesExtracted = 0;
    let totalSeasonsExtracted = 0;
    let totalEpisodesExtracted = 0;
    
    while (!progress.shouldStop) {
        const pageNum = progress.currentPage;
        
        // جلب قائمة المسلسلات من الصفحة
        const pageData = await fetchSeriesListFromPage(pageNum);
        
        if (!pageData || pageData.series.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            progress.markAllPagesScraped();
            index.saveSeriesIndex();
            break;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل من الصفحة ${pageNum}`);
        
        // استخراج كل مسلسل في الصفحة
        const pageSeriesData = [];
        
        for (let i = 0; i < pageData.series.length; i++) {
            const seriesData = pageData.series[i];
            
            console.log(`\n📊 التقدم في الصفحة: ${i + 1}/${pageData.series.length}`);
            console.log(`🎬 ${seriesData.title.substring(0, 40)}...`);
            
            // استخراج تفاصيل المسلسل مع ID الصحيح
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (seriesDetails) {
                // التحقق من وجود المسلسل باستخدام ID الصحيح
                const isSeriesExists = index.isSeriesExists(seriesDetails.id);
                
                if (isSeriesExists) {
                    console.log(`   ✅ المسلسل موجود بالفعل: ${seriesDetails.title.substring(0, 40)}...`);
                    continue;
                }
                
                // إضافة المسلسل إلى الفهرس
                index.addSeries(seriesDetails.id, {
                    ...seriesDetails,
                    currentFile: progress.currentSeriesFile,
                    page: pageNum
                });
                
                // حفظ المسلسل
                seriesDetails.currentFile = progress.currentSeriesFile;
                saveSeriesToTopFile(seriesDetails, progress);
                pageSeriesData.push(seriesDetails);
                totalSeriesExtracted++;
                
                // استخراج مواسم المسلسل
                console.log(`   📅 جاري استخراج مواسم المسلسل...`);
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url, seriesDetails.id);
                
                if (seasons.length > 0) {
                    console.log(`   ✅ وجدت ${seasons.length} موسم`);
                    
                    // استخراج كل موسم
                    for (let j = 0; j < seasons.length; j++) {
                        const seasonData = seasons[j];
                        
                        console.log(`📊 معالجة الموسم ${j + 1}/${seasons.length}`);
                        
                        // استخراج تفاصيل الموسم مع ID الصحيح
                        const seasonDetails = await fetchSeasonDetails(seasonData);
                        
                        if (seasonDetails) {
                            // التحقق من وجود الموسم
                            const isSeasonExists = index.isSeasonExists(seasonDetails.id);
                            
                            if (isSeasonExists) {
                                console.log(`   ✅ الموسم ${seasonDetails.seasonNumber} موجود بالفعل`);
                                continue;
                            }
                            
                            // إضافة الموسم إلى الفهرس
                            index.addSeason(seasonDetails.id, {
                                ...seasonDetails,
                                currentFile: progress.currentSeasonFile
                            });
                            
                            // حفظ الموسم
                            seasonDetails.currentFile = progress.currentSeasonFile;
                            saveSeasonToTopFile(seasonDetails, progress);
                            totalSeasonsExtracted++;
                            
                            // استخراج حلقات الموسم
                            console.log(`     📺 جاري استخراج حلقات الموسم...`);
                            const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url, seasonDetails.id);
                            
                            if (episodes.length > 0) {
                                console.log(`     ✅ وجدت ${episodes.length} حلقة`);
                                
                                // استخراج كل حلقة
                                for (let k = 0; k < episodes.length; k++) {
                                    const episodeData = episodes[k];
                                    
                                    console.log(`📊 معالجة الحلقة ${k + 1}/${episodes.length}`);
                                    
                                    // استخراج تفاصيل الحلقة مع ID الصحيح
                                    const episodeDetails = await fetchEpisodeDetails(episodeData, seriesDetails.id);
                                    
                                    if (episodeDetails) {
                                        // التحقق من وجود الحلقة
                                        const isEpisodeExists = index.isEpisodeExists(episodeDetails.id);
                                        
                                        if (isEpisodeExists) {
                                            console.log(`   ✅ الحلقة ${episodeDetails.episodeNumber} موجودة بالفعل`);
                                            continue;
                                        }
                                        
                                        // إضافة الحلقة إلى الفهرس
                                        index.addEpisode(episodeDetails.id, {
                                            ...episodeDetails,
                                            currentFile: progress.currentEpisodeFile
                                        });
                                        
                                        // حفظ الحلقة
                                        episodeDetails.currentFile = progress.currentEpisodeFile;
                                        saveEpisodeToTopFile(episodeDetails, progress);
                                        totalEpisodesExtracted++;
                                    }
                                    
                                    // تأخير بين الحلقات
                                    if (k < episodes.length - 1) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }
                                }
                            } else {
                                console.log(`     ⚠️ لم يتم العثور على حلقات لهذا الموسم`);
                            }
                        }
                        
                        // تأخير بين المواسم
                        if (j < seasons.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                } else {
                    console.log(`   ⚠️ لم يتم العثور على مواسم لهذا المسلسل`);
                }
            }
            
            // تأخير بين المسلسلات
            if (i < pageData.series.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        console.log(`\n✅ اكتملت صفحة المسلسلات ${pageNum}:`);
        console.log(`   🎬 مسلسلات جديدة: ${totalSeriesExtracted}`);
        console.log(`   📅 مواسم جديدة: ${totalSeasonsExtracted}`);
        console.log(`   📺 حلقات جديدة: ${totalEpisodesExtracted}`);
        
        // تحديث تقدم الصفحات
        progress.addPageProcessed();
        
        // تأخير بين الصفحات
        if (!progress.shouldStop && !progress.allPagesScraped) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // حفظ أحدث الحلقات بعد الانتهاء
    await saveLatestEpisodesToHomeFile();
    
    return { 
        totalSeriesExtracted, 
        totalSeasonsExtracted, 
        totalEpisodesExtracted,
        executionTime: Date.now() - startTime 
    };
}

// ==================== المرحلة 2: تحديث الصفحة الأولى ====================
async function phase2UpdateHome(progress, index) {
    console.log("\n🔄 المرحلة 2: تحديث الصفحة الأولى والفحص");
    console.log("=".repeat(60));
    
    const startTime = Date.now();
    let newSeriesCount = 0;
    let updatedSeasonsCount = 0;
    let updatedEpisodesCount = 0;
    
    console.log(`📄 جاري فحص الصفحة الأولى للمسلسلات...`);
    
    // جلب جميع مسلسلات الصفحة الأولى
    const pageData = await fetchSeriesListFromPage(1);
    
    if (!pageData || pageData.series.length === 0) {
        console.log("❌ لا يمكن جلب الصفحة الأولى");
        return { newSeriesCount, updatedSeasonsCount, updatedEpisodesCount };
    }
    
    console.log(`🔍 وجدت ${pageData.series.length} مسلسل في الصفحة الأولى`);
    
    const allHomeSeries = [];
    
    for (let i = 0; i < pageData.series.length; i++) {
        const seriesData = pageData.series[i];
        
        console.log(`\n📊 التقدم: ${i + 1}/${pageData.series.length}`);
        console.log(`🎬 ${seriesData.title.substring(0, 40)}...`);
        
        const seriesDetails = await fetchSeriesDetails(seriesData);
        
        if (seriesDetails) {
            allHomeSeries.push(seriesDetails);
            
            // التحقق من المسلسل في الفهرس
            const isSeriesExists = index.isSeriesExists(seriesDetails.id);
            
            if (!isSeriesExists) {
                // مسلسل جديد
                console.log(`   🆕 مسلسل جديد! جاري استخراجه كاملاً...`);
                
                index.addSeries(seriesDetails.id, {
                    ...seriesDetails,
                    currentFile: progress.currentSeriesFile,
                    page: 1
                });
                
                seriesDetails.currentFile = progress.currentSeriesFile;
                saveSeriesToTopFile(seriesDetails, progress);
                newSeriesCount++;
                
                // استخراج مواسم المسلسل
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url, seriesDetails.id);
                
                for (let j = 0; j < seasons.length; j++) {
                    const seasonData = seasons[j];
                    
                    const seasonDetails = await fetchSeasonDetails(seasonData);
                    if (seasonDetails) {
                        seasonDetails.currentFile = progress.currentSeasonFile;
                        index.addSeason(seasonDetails.id, {
                            ...seasonDetails,
                            currentFile: progress.currentSeasonFile
                        });
                        saveSeasonToTopFile(seasonDetails, progress);
                        updatedSeasonsCount++;
                        
                        // استخراج حلقات الموسم
                        const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url, seasonDetails.id);
                        
                        for (let k = 0; k < episodes.length; k++) {
                            const episodeData = episodes[k];
                            
                            const episodeDetails = await fetchEpisodeDetails(episodeData, seriesDetails.id);
                            if (episodeDetails) {
                                episodeDetails.currentFile = progress.currentEpisodeFile;
                                index.addEpisode(episodeDetails.id, {
                                    ...episodeDetails,
                                    currentFile: progress.currentEpisodeFile
                                });
                                saveEpisodeToTopFile(episodeDetails, progress);
                                updatedEpisodesCount++;
                            }
                            
                            if (k < episodes.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }
                    
                    if (j < seasons.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else {
                // مسلسل موجود - فحص التحديثات
                console.log(`   ✅ المسلسل موجود، جاري فحص التحديثات...`);
                
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url, seriesDetails.id);
                
                for (const seasonData of seasons) {
                    const seasonExists = index.isSeasonExistsBySeriesAndNumber(seriesDetails.id, seasonData.seasonNumber);
                    
                    if (!seasonExists) {
                        console.log(`   🆕 موسم جديد: ${seasonData.seasonNumber}`);
                        
                        const seasonDetails = await fetchSeasonDetails(seasonData);
                        if (seasonDetails) {
                            seasonDetails.currentFile = progress.currentSeasonFile;
                            index.addSeason(seasonDetails.id, {
                                ...seasonDetails,
                                currentFile: progress.currentSeasonFile
                            });
                            saveSeasonToTopFile(seasonDetails, progress);
                            updatedSeasonsCount++;
                            
                            // استخراج حلقات الموسم الجديد
                            const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url, seasonDetails.id);
                            
                            for (const episodeData of episodes) {
                                const episodeDetails = await fetchEpisodeDetails(episodeData, seriesDetails.id);
                                if (episodeDetails) {
                                    episodeDetails.currentFile = progress.currentEpisodeFile;
                                    index.addEpisode(episodeDetails.id, {
                                        ...episodeDetails,
                                        currentFile: progress.currentEpisodeFile
                                    });
                                    saveEpisodeToTopFile(episodeDetails, progress);
                                    updatedEpisodesCount++;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if (i < pageData.series.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    // حفظ مسلسلات الصفحة الأولى
    saveAllSeriesToHomeFile(allHomeSeries);
    
    // حفظ أحدث الحلقات
    await saveLatestEpisodesToHomeFile();
    
    console.log(`\n✅ اكتملت المرحلة 2:`);
    console.log(`   🆕 مسلسلات جديدة: ${newSeriesCount}`);
    console.log(`   🔄 مواسم محدثة/جديدة: ${updatedSeasonsCount}`);
    console.log(`   🔄 حلقات محدثة/جديدة: ${updatedEpisodesCount}`);
    console.log(`   🏠 مسلسلات في Home.json: ${allHomeSeries.length}`);
    
    progress.homeScraped = true;
    progress.saveProgress();
    
    return { 
        newSeriesCount, 
        updatedSeasonsCount, 
        updatedEpisodesCount,
        totalHomeSeries: allHomeSeries.length,
        executionTime: Date.now() - startTime 
    };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات المتقدم");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const index = new SeriesIndex();
    const progress = new ProgressTracker();
    
    progress.resetForNewRun();
    
    const stats = index.getStats();
    console.log(`📊 حالة النظام:`);
    console.log(`   🎬 مسلسلات فريدة: ${stats.series.total}`);
    console.log(`   📅 مواسم فريدة: ${stats.seasons.total}`);
    console.log(`   📺 حلقات فريدة: ${stats.episodes.total}`);
    console.log(`   📄 صفحات مكتملة: ${progress.allPagesScraped ? 'نعم' : 'لا'}`);
    
    let phase1Results = null;
    let phase2Results = null;
    
    if (!progress.allPagesScraped) {
        console.log(`\n🌐 المرحلة الحالية: استخراج الصفحات (${PAGES_PER_RUN} صفحات/تشغيل)`);
        phase1Results = await phase1ScrapeAll(progress, index);
    }
    
    if (progress.allPagesScraped) {
        console.log(`\n🏠 المرحلة الحالية: تحديث الصفحة الأولى`);
        phase2Results = await phase2UpdateHome(progress, index);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    const finalStats = index.getStats();
    
    if (phase1Results) {
        console.log(`📊 نتائج المرحلة 1 (الاستخراج الكامل):`);
        console.log(`   🎬 مسلسلات جديدة: ${phase1Results.totalSeriesExtracted}`);
        console.log(`   📅 مواسم جديدة: ${phase1Results.totalSeasonsExtracted}`);
        console.log(`   📺 حلقات جديدة: ${phase1Results.totalEpisodesExtracted}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase1Results.executionTime / 1000).toFixed(1)} ثانية`);
    }
    
    if (phase2Results) {
        console.log(`\n📊 نتائج المرحلة 2 (تحديث الصفحة الأولى):`);
        console.log(`   🆕 مسلسلات جديدة: ${phase2Results.newSeriesCount}`);
        console.log(`   🔄 مواسم محدثة: ${phase2Results.updatedSeasonsCount}`);
        console.log(`   🔄 حلقات محدثة: ${phase2Results.updatedEpisodesCount}`);
        console.log(`   🏠 مسلسلات في Home.json: ${phase2Results.totalHomeSeries}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase2Results.executionTime / 1000).toFixed(1)} ثانية`);
    }
    
    console.log(`\n📈 الإحصائيات النهائية:`);
    console.log(`   🎬 مسلسلات فريدة إجمالاً: ${finalStats.series.total}`);
    console.log(`   📅 مواسم فريدة إجمالاً: ${finalStats.seasons.total}`);
    console.log(`   📺 حلقات فريدة إجمالاً: ${finalStats.episodes.total}`);
    
    // حفظ التقرير النهائي
    const finalReport = {
        timestamp: new Date().toISOString(),
        phase: progress.allPagesScraped ? "phase2_update_home" : "phase1_scrape_all",
        systemStats: finalStats,
        progress: {
            currentPage: progress.currentPage,
            allPagesScraped: progress.allPagesScraped,
            mode: progress.mode
        },
        results: {
            phase1: phase1Results,
            phase2: phase2Results
        }
    };
    
    fs.writeFileSync("series_report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 تم حفظ التقرير النهائي في: series_report.json`);
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
    
    fs.writeFileSync("series_error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في series_error.json");
    process.exit(1);
});
