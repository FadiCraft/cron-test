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
    series: 250,      // 250 مسلسل في كل ملف (مثل الأفلام)
    seasons: 500,     // 500 موسم في كل ملف
    episodes: 1000    // 1000 حلقة في كل ملف
};

const PAGES_PER_RUN = 5;           // 5 صفحات في كل تشغيل (مثل الأفلام)
const LATEST_EPISODES_COUNT = 10;  // 10 أحدث حلقات

// ==================== نظام الفهرس (مشابه لكود الأفلام) ====================
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
        
        this.episodes[episodeId] = {
            id: episodeId,
            seriesId: episodeData.seriesId,
            seasonId: episodeData.seasonId,
            episodeNumber: episodeData.episodeNumber,
            currentFile: episodeData.currentFile,
            lastUpdated: new Date().toISOString(),
            ...(isNew ? {
                firstSeen: new Date().toISOString()
            } : {})
        };
        
        if (isNew) {
            this.episodeStats.totalEpisodes++;
            
            // تحديث أحدث الحلقات
            this.episodeStats.latestEpisodes.unshift({
                id: episodeId,
                seriesId: episodeData.seriesId,
                seasonId: episodeData.seasonId,
                title: episodeData.title,
                scrapedAt: new Date().toISOString()
            });
            
            // الاحتفاظ فقط بـ 50 حلقة كحد أقصى
            if (this.episodeStats.latestEpisodes.length > 50) {
                this.episodeStats.latestEpisodes = this.episodeStats.latestEpisodes.slice(0, 50);
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
    
    getLatestEpisodes(count = 10) {
        return this.episodeStats.latestEpisodes.slice(0, count);
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

// ==================== نظام التقدم المعدل (مشابه للأفلام) ====================
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
                
                this.mode = data.mode || "scrape_all"; // 'scrape_all' أو 'update_home'
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
        this.currentPage = 1; // العودة للصفحة الأولى
        this.saveProgress();
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.homeScraped = false;
        this.saveProgress();
    }
    
    switchToUpdateMode() {
        this.mode = "update_home";
        this.shouldStop = true;
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

function extractIdFromUrl(url) {
    try {
        // استخراج ID فريد من الرابط
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        // المسلسل: /series/series-name/
        if (url.includes('/series/') && !url.includes('/season/') && !url.includes('/episode/')) {
            const seriesPart = pathParts[1] || pathParts[0];
            return `series_${seriesPart}`;
        }
        
        // الموسم: .../season/1/
        else if (url.includes('/season/')) {
            const seasonIndex = pathParts.findIndex(p => p === 'season');
            if (seasonIndex !== -1 && seasonIndex + 1 < pathParts.length) {
                const seriesPart = pathParts[1] || pathParts[0];
                const seasonNum = pathParts[seasonIndex + 1];
                return `season_${seriesPart}_${seasonNum}`;
            }
        }
        
        // الحلقة: .../episode/1/
        else if (url.includes('/episode/')) {
            const episodeIndex = pathParts.findIndex(p => p === 'episode');
            if (episodeIndex !== -1 && episodeIndex + 1 < pathParts.length) {
                const seriesPart = pathParts[1] || pathParts[0];
                const episodeNum = pathParts[episodeIndex + 1];
                return `episode_${seriesPart}_${episodeNum}`;
            }
        }
        
        // بديل: استخراج من الرقم في نهاية الرابط
        const match = url.match(/(\d+)\/?$/);
        if (match) {
            return `id_${match[1]}`;
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
                
                seriesList.push({
                    id: extractIdFromUrl(seriesUrl),
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

// ==================== استخراج بيانات المسلسل الكاملة ====================
async function fetchSeriesDetails(seriesData) {
    console.log(`\n🎬 [${seriesData.position}] ${seriesData.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchPage(seriesData.url);
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر (ID)
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
            id: seriesData.id,
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
        
        // البحث عن عناصر المواسم
        const seasonElements = doc.querySelectorAll('.Small--Box.Season, .Small--Box[href*="season"]');
        
        if (seasonElements.length > 0) {
            seasonElements.forEach((element, i) => {
                const link = element.querySelector('a');
                if (link && link.href) {
                    // استخراج رقم الموسم
                    const seasonNumMatch = link.textContent.match(/الموسم\s*(\d+)/) || 
                                          link.href.match(/season\/(\d+)/) || 
                                          [null, i + 1];
                    
                    const seasonNumber = parseInt(seasonNumMatch[1]);
                    const seasonTitle = cleanText(element.querySelector('.title')?.textContent || `الموسم ${seasonNumber}`);
                    const seasonImage = element.querySelector('img')?.src;
                    const seasonId = extractIdFromUrl(link.href);
                    
                    seasons.push({
                        id: seasonId,
                        url: link.href,
                        title: seasonTitle,
                        image: seasonImage,
                        seasonNumber: seasonNumber,
                        seriesId: seriesId,
                        position: i + 1
                    });
                }
            });
        }
        
        console.log(`   ✅ وجدت ${seasons.length} موسم`);
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        return [];
    }
}

// ==================== استخراج بيانات الموسم الكاملة ====================
async function fetchSeasonDetails(seasonData) {
    console.log(`   🎞️  الموسم ${seasonData.seasonNumber}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(seasonData.url);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الموسم`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر (ID)
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seasonData.url;
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seasonData.title);
        const image = doc.querySelector(".image img")?.src || seasonData.image;
        
        // استخراج سيرفرات التحميل للموسم كاملاً
        let downloadServers = {};
        const downloadButton = doc.querySelector('a.downloadFullSeason, a[href*="download"][href*="season"]');
        if (downloadButton) {
            downloadServers = await extractSeasonDownloadServers(downloadButton.href);
        }
        
        return {
            id: seasonData.id,
            seriesId: seasonData.seriesId,
            seasonNumber: seasonData.seasonNumber,
            title: title,
            url: seasonData.url,
            shortLink: shortLink,
            image: image,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج سيرفرات تحميل الموسم ====================
async function extractSeasonDownloadServers(downloadUrl) {
    try {
        console.log(`     ⬇️  جاري استخراج سيرفرات تحميل الموسم...`);
        const html = await fetchPage(downloadUrl);
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
    }
}

// ==================== استخراج الحلقات من صفحة الموسم ====================
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
        
        // البحث عن قسم الحلقات
        const episodeSection = doc.querySelector('.allepcont, .getMoreByScroll, .episodes-list');
        
        if (episodeSection) {
            const episodeLinks = episodeSection.querySelectorAll('a[href*="episode"], a[href*="الحلقة"]');
            
            episodeLinks.forEach((link, i) => {
                if (link && link.href && link.href.includes('topcinema.rip')) {
                    // استخراج رقم الحلقة
                    const epNumMatch = link.textContent.match(/الحلقة\s*(\d+)/) || 
                                      link.href.match(/episode\/(\d+)/) || 
                                      [null, i + 1];
                    
                    const episodeNumber = parseInt(epNumMatch[1]);
                    const episodeTitle = cleanText(link.textContent || link.title || `الحلقة ${episodeNumber}`);
                    const episodeId = extractIdFromUrl(link.href);
                    
                    episodes.push({
                        id: episodeId,
                        url: link.href,
                        title: episodeTitle,
                        episodeNumber: episodeNumber,
                        seasonId: seasonId,
                        position: i + 1
                    });
                }
            });
        }
        
        console.log(`     ✅ وجدت ${episodes.length} حلقة`);
        return episodes;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج الحلقات: ${error.message}`);
        return [];
    }
}

// ==================== استخراج بيانات الحلقة الكاملة ====================
async function fetchEpisodeDetails(episodeData) {
    console.log(`       🎥 الحلقة ${episodeData.episodeNumber}: ${episodeData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(episodeData.url);
        if (!html) {
            console.log(`       ⚠️ فشل جلب صفحة الحلقة`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج الرابط المختصر (ID)
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
        if (downloadButton) {
            downloadServers = await extractEpisodeDownloadServers(downloadButton.href);
        }
        
        return {
            id: episodeData.id,
            seriesId: episodeData.seriesId,
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

// ==================== استخراج سيرفرات تحميل الحلقة ====================
async function extractEpisodeDownloadServers(downloadUrl) {
    try {
        console.log(`       ⬇️  جاري استخراج سيرفرات تحميل الحلقة...`);
        const html = await fetchPage(downloadUrl);
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
        
        return servers;
        
    } catch (error) {
        console.log(`       ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return {};
    }
}

// ==================== حفظ البيانات في الملفات (مثل كود الأفلام) ====================
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
            itemsPerFileLimit: ITEMS_PER_FILE[type + 's']
        },
        data: existingData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

// ==================== حفظ المسلسل ====================
function saveSeriesToTopFile(seriesDetails, progress) {
    const saved = saveToTopFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails, progress, "series");
    console.log(`   💾 تم حفظ المسلسل في ${progress.currentSeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} مسلسل`);
    
    progress.lastSeriesId = seriesDetails.id;
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ الموسم ====================
function saveSeasonToTopFile(seasonDetails, progress) {
    const saved = saveToTopFile(SEASONS_DIR, progress.currentSeasonFile, seasonDetails, progress, "season");
    console.log(`     💾 تم حفظ الموسم في ${progress.currentSeasonFile}`);
    console.log(`       📊 الإجمالي في الملف: ${saved.info.totalItems} موسم`);
    
    progress.lastSeasonId = seasonDetails.id;
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ الحلقة ====================
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
        series: seriesList
    };
    
    fs.writeFileSync(SERIES_HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`\n🏠 تم حفظ ${seriesList.length} مسلسل في TV_Series/Home.json`);
    
    return fileContent;
}

// ==================== حفظ أحدث الحلقات في Home.json ====================
function saveLatestEpisodesToHomeFile(episodesList) {
    const fileContent = {
        fileName: "Home.json",
        description: "أحدث 10 حلقات مضافة",
        totalEpisodes: episodesList.length,
        lastUpdated: new Date().toISOString(),
        episodes: episodesList
    };
    
    fs.writeFileSync(EPISODES_HOME_FILE, JSON.stringify(fileContent, null, 2));
    console.log(`\n🏠 تم حفظ ${episodesList.length} حلقة في Episodes/Home.json`);
    
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
        console.log(`\n📺 ====== معالجة صفحة المسلسلات ${pageNum} ======`);
        
        // جلب قائمة المسلسلات من الصفحة
        const pageData = await fetchSeriesListFromPage(pageNum);
        
        if (!pageData || pageData.series.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            progress.markAllPagesScraped();
            index.saveSeriesIndex();
            break;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل`);
        
        // استخراج كل مسلسل في الصفحة
        const pageSeriesData = [];
        
        for (let i = 0; i < pageData.series.length; i++) {
            const seriesData = pageData.series[i];
            
            console.log(`\n📊 التقدم في الصفحة: ${i + 1}/${pageData.series.length}`);
            console.log(`📊 المسلسلات في الملف: ${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series}`);
            
            // التحقق أولاً من وجود المسلسل
            if (index.isSeriesExists(seriesData.id)) {
                console.log(`   ✅ المسلسل موجود بالفعل: ${seriesData.title.substring(0, 40)}...`);
                continue;
            }
            
            // استخراج تفاصيل المسلسل
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (seriesDetails) {
                // إضافة إلى الفهرس
                const isNewSeries = index.addSeries(seriesDetails.id, {
                    ...seriesDetails,
                    currentFile: progress.currentSeriesFile,
                    page: pageNum
                });
                
                // حفظ المسلسل
                if (isNewSeries) {
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
                            
                            console.log(`\n📊 المواسم في الملف: ${progress.seasonsInCurrentFile}/${ITEMS_PER_FILE.seasons}`);
                            console.log(`📊 معالجة الموسم ${j + 1}/${seasons.length}`);
                            
                            // التحقق من وجود الموسم
                            if (index.isSeasonExistsBySeriesAndNumber(seriesDetails.id, seasonData.seasonNumber)) {
                                console.log(`   ✅ الموسم ${seasonData.seasonNumber} موجود بالفعل`);
                                continue;
                            }
                            
                            // استخراج تفاصيل الموسم
                            const seasonDetails = await fetchSeasonDetails(seasonData);
                            
                            if (seasonDetails) {
                                // إضافة الموسم إلى الفهرس
                                const isNewSeason = index.addSeason(seasonDetails.id, {
                                    ...seasonDetails,
                                    currentFile: progress.currentSeasonFile,
                                    episodesCount: 0 // سيتم تحديثه بعد استخراج الحلقات
                                });
                                
                                // حفظ الموسم
                                if (isNewSeason) {
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
                                            
                                            console.log(`\n📊 الحلقات في الملف: ${progress.episodesInCurrentFile}/${ITEMS_PER_FILE.episodes}`);
                                            console.log(`📊 معالجة الحلقة ${k + 1}/${episodes.length}`);
                                            
                                            // التحقق من وجود الحلقة
                                            if (index.isEpisodeExistsBySeasonAndNumber(seasonDetails.id, episodeData.episodeNumber)) {
                                                console.log(`   ✅ الحلقة ${episodeData.episodeNumber} موجودة بالفعل`);
                                                continue;
                                            }
                                            
                                            // استخراج تفاصيل الحلقة
                                            const episodeDetails = await fetchEpisodeDetails(episodeData);
                                            
                                            if (episodeDetails) {
                                                // إضافة الحلقة إلى الفهرس
                                                const isNewEpisode = index.addEpisode(episodeDetails.id, {
                                                    ...episodeDetails,
                                                    currentFile: progress.currentEpisodeFile
                                                });
                                                
                                                // حفظ الحلقة
                                                if (isNewEpisode) {
                                                    episodeDetails.currentFile = progress.currentEpisodeFile;
                                                    saveEpisodeToTopFile(episodeDetails, progress);
                                                    totalEpisodesExtracted++;
                                                }
                                            }
                                            
                                            // تأخير بين الحلقات
                                            if (k < episodes.length - 1) {
                                                await new Promise(resolve => setTimeout(resolve, 500));
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // تأخير بين المواسم
                            if (j < seasons.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                        }
                    }
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
                // مسلسل جديد - استخراجه كاملاً
                console.log(`   🆕 مسلسل جديد! جاري استخراجه كاملاً...`);
                
                // إضافة المسلسل إلى الفهرس
                index.addSeries(seriesDetails.id, {
                    ...seriesDetails,
                    currentFile: progress.currentSeriesFile,
                    page: 1
                });
                
                // حفظ المسلسل
                seriesDetails.currentFile = progress.currentSeriesFile;
                saveSeriesToTopFile(seriesDetails, progress);
                newSeriesCount++;
                
                // استخراج مواسم المسلسل
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url, seriesDetails.id);
                
                for (let j = 0; j < seasons.length; j++) {
                    const seasonData = seasons[j];
                    
                    // استخراج وحفظ الموسم
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
                            
                            // استخراج وحفظ الحلقة
                            const episodeDetails = await fetchEpisodeDetails(episodeData);
                            if (episodeDetails) {
                                episodeDetails.currentFile = progress.currentEpisodeFile;
                                index.addEpisode(episodeDetails.id, {
                                    ...episodeDetails,
                                    currentFile: progress.currentEpisodeFile
                                });
                                saveEpisodeToTopFile(episodeDetails, progress);
                                updatedEpisodesCount++;
                            }
                            
                            // تأخير بين الحلقات
                            if (k < episodes.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }
                    
                    // تأخير بين المواسم
                    if (j < seasons.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else {
                // مسلسل موجود - فحص التحديثات فقط
                console.log(`   ✅ المسلسل موجود، جاري فحص التحديثات...`);
                
                // استخراج مواسم المسلسل للفحص
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url, seriesDetails.id);
                
                for (const seasonData of seasons) {
                    // فحص إذا كان الموسم جديداً
                    const seasonExists = index.isSeasonExistsBySeriesAndNumber(seriesDetails.id, seasonData.seasonNumber);
                    
                    if (!seasonExists) {
                        console.log(`   🆕 موسم جديد: ${seasonData.seasonNumber}`);
                        
                        // استخراج وحفظ الموسم الجديد
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
                                // استخراج وحفظ الحلقات الجديدة
                                const episodeDetails = await fetchEpisodeDetails(episodeData);
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
        
        // تأخير بين المسلسلات
        if (i < pageData.series.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    // حفظ جميع مسلسلات الصفحة الأولى في Home.json
    saveAllSeriesToHomeFile(allHomeSeries);
    
    // حفظ أحدث الحلقات في Home.json
    const latestEpisodes = index.getLatestEpisodes(LATEST_EPISODES_COUNT);
    saveLatestEpisodesToHomeFile(latestEpisodes);
    
    console.log(`\n✅ اكتملت المرحلة 2:`);
    console.log(`   🆕 مسلسلات جديدة: ${newSeriesCount}`);
    console.log(`   🔄 مواسم محدثة/جديدة: ${updatedSeasonsCount}`);
    console.log(`   🔄 حلقات محدثة/جديدة: ${updatedEpisodesCount}`);
    console.log(`   🏠 مسلسلات في Home.json: ${allHomeSeries.length}`);
    console.log(`   📺 أحدث حلقات في Home.json: ${latestEpisodes.length}`);
    
    progress.homeScraped = true;
    progress.saveProgress();
    
    return { 
        newSeriesCount, 
        updatedSeasonsCount, 
        updatedEpisodesCount,
        totalHomeSeries: allHomeSeries.length,
        latestEpisodesCount: latestEpisodes.length,
        executionTime: Date.now() - startTime 
    };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات المتقدم");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    // تهيئة الأنظمة
    const index = new SeriesIndex();
    const progress = new ProgressTracker();
    
    // إعادة تعيين لمتغيرات هذا التشغيل
    progress.resetForNewRun();
    
    const stats = index.getStats();
    console.log(`📊 حالة النظام:`);
    console.log(`   🎬 مسلسلات فريدة: ${stats.series.total}`);
    console.log(`   📅 مواسم فريدة: ${stats.seasons.total}`);
    console.log(`   📺 حلقات فريدة: ${stats.episodes.total}`);
    console.log(`   📄 صفحات مكتملة: ${progress.allPagesScraped ? 'نعم' : 'لا'}`);
    console.log(`   📁 الملفات النشطة:`);
    console.log(`     المسلسلات: ${progress.currentSeriesFile} (${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series})`);
    console.log(`     المواسم: ${progress.currentSeasonFile} (${progress.seasonsInCurrentFile}/${ITEMS_PER_FILE.seasons})`);
    console.log(`     الحلقات: ${progress.currentEpisodeFile} (${progress.episodesInCurrentFile}/${ITEMS_PER_FILE.episodes})`);
    
    let phase1Results = null;
    let phase2Results = null;
    
    // تحديد المرحلة الحالية
    if (!progress.allPagesScraped) {
        // المرحلة 1: استخراج جميع الصفحات
        console.log(`\n🌐 المرحلة الحالية: استخراج الصفحات (${PAGES_PER_RUN} صفحات/تشغيل)`);
        phase1Results = await phase1ScrapeAll(progress, index);
    }
    
    // إذا انتهت المرحلة 1 أو كانت قد انتهت سابقاً
    if (progress.allPagesScraped) {
        // المرحلة 2: تحديث الصفحة الأولى
        console.log(`\n🏠 المرحلة الحالية: تحديث الصفحة الأولى`);
        phase2Results = await phase2UpdateHome(progress, index);
    }
    
    // ==================== النتائج النهائية ====================
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    // إحصائيات الفهرس النهائية
    const finalStats = index.getStats();
    
    if (phase1Results) {
        console.log(`📊 نتائج المرحلة 1 (الاستخراج الكامل):`);
        console.log(`   🎬 مسلسلات جديدة: ${phase1Results.totalSeriesExtracted}`);
        console.log(`   📅 مواسم جديدة: ${phase1Results.totalSeasonsExtracted}`);
        console.log(`   📺 حلقات جديدة: ${phase1Results.totalEpisodesExtracted}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase1Results.executionTime / 1000).toFixed(1)} ثانية`);
        console.log(`   📄 آخر صفحة معالجة: ${progress.currentPage}`);
    }
    
    if (phase2Results) {
        console.log(`\n📊 نتائج المرحلة 2 (تحديث الصفحة الأولى):`);
        console.log(`   🆕 مسلسلات جديدة: ${phase2Results.newSeriesCount}`);
        console.log(`   🔄 مواسم محدثة: ${phase2Results.updatedSeasonsCount}`);
        console.log(`   🔄 حلقات محدثة: ${phase2Results.updatedEpisodesCount}`);
        console.log(`   🏠 مسلسلات في Home.json: ${phase2Results.totalHomeSeries}`);
        console.log(`   📺 أحدث حلقات في Home.json: ${phase2Results.latestEpisodesCount}`);
        console.log(`   ⏱️ وقت التنفيذ: ${(phase2Results.executionTime / 1000).toFixed(1)} ثانية`);
    }
    
    console.log(`\n📈 الإحصائيات النهائية:`);
    console.log(`   🎬 مسلسلات فريدة إجمالاً: ${finalStats.series.total}`);
    console.log(`   📅 مواسم فريدة إجمالاً: ${finalStats.seasons.total}`);
    console.log(`   📺 حلقات فريدة إجمالاً: ${finalStats.episodes.total}`);
    console.log(`   📄 صفحات مكتملة: ${progress.allPagesScraped ? 'نعم' : 'لا'}`);
    
    // الملفات المحفوظة
    console.log(`\n💾 الملفات المحفوظة:`);
    
    [TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach((dir, i) => {
        const dirName = dir.split('/').pop();
        console.log(`\n   📁 ${dirName}:`);
        
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const fileStats = fs.statSync(filePath);
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const itemCount = content.totalItems || content.data?.length || content.series?.length || content.episodes?.length || 0;
                    console.log(`     📄 ${file}: ${itemCount} عنصر (${(fileStats.size / 1024).toFixed(1)} كيلوبايت)`);
                } catch {
                    console.log(`     📄 ${file}: (${(fileStats.size / 1024).toFixed(1)} كيلوبايت)`);
                }
            });
        } catch (error) {
            console.log(`     ⚠️ لا يمكن قراءة الملفات: ${error.message}`);
        }
    });
    
    // حفظ التقرير النهائي
    const finalReport = {
        timestamp: new Date().toISOString(),
        phase: progress.allPagesScraped ? "phase2_update_home" : "phase1_scrape_all",
        systemStats: finalStats,
        progress: {
            currentPage: progress.currentPage,
            allPagesScraped: progress.allPagesScraped,
            mode: progress.mode,
            currentFiles: {
                series: progress.currentSeriesFile,
                seasons: progress.currentSeasonFile,
                episodes: progress.currentEpisodeFile
            },
            itemsInFiles: {
                series: progress.seriesInCurrentFile,
                seasons: progress.seasonsInCurrentFile,
                episodes: progress.episodesInCurrentFile
            }
        },
        results: {
            phase1: phase1Results,
            phase2: phase2Results
        },
        nextRun: {
            phase: progress.allPagesScraped ? "phase2_update_home" : "phase1_scrape_all",
            startPage: progress.currentPage,
            currentFiles: {
                series: progress.currentSeriesFile,
                seasons: progress.currentSeasonFile,
                episodes: progress.currentEpisodeFile
            }
        }
    };
    
    fs.writeFileSync("series_report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`\n📄 تم حفظ التقرير النهائي في: series_report.json`);
    console.log("=".repeat(60));
    
    if (!progress.allPagesScraped) {
        console.log(`\n📌 في المرة القادمة:`);
        console.log(`   ستستمر المرحلة 1`);
        console.log(`   الصفحة: ${progress.currentPage}`);
        console.log(`   ملفات:`);
        console.log(`     المسلسلات: ${progress.currentSeriesFile}`);
        console.log(`     المواسم: ${progress.currentSeasonFile}`);
        console.log(`     الحلقات: ${progress.currentEpisodeFile}`);
    } else {
        console.log(`\n📌 النظام الآن في وضع التحديث:`);
        console.log(`   كل تشغيل سيحدث TV_Series/Home.json و Episodes/Home.json`);
        console.log(`   وسيضيف المحتوى الجديد للملفات المرتبة`);
    }
    console.log("=".repeat(60));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error("Stack:", error.stack);
    
    const errorReport = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        lastPage: new ProgressTracker().currentPage
    };
    
    fs.writeFileSync("series_error.json", JSON.stringify(errorReport, null, 2));
    console.log("❌ تم حفظ الخطأ في series_error.json");
    process.exit(1);
});
