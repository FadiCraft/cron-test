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
const TOP_MONTH_SERIES_DIR = path.join(AG_SERIES_DIR, "Top_Month_Series"); // 👈 جديد
const LATEST_EPISODES_DIR = path.join(AG_SERIES_DIR, "Latest_Episodes");
const PROGRESS_FILE = path.join(__dirname, "series_progress.json");

// إنشاء المجلدات إذا لم تكن موجودة
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, TOP_MONTH_SERIES_DIR, LATEST_EPISODES_DIR].forEach(dir => {
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
    series: 500,
    seasons: 500,
    episodes: 5000,
    latestEpisodes: 100,
    topMonthSeries: 50 // 👈 جديد
};

const PAGES_PER_RUN = 3;

// ==================== نظام التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
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
                
                this.latestEpisodesFileNumber = data.latestEpisodesFileNumber || 1;
                this.latestEpisodesInCurrentFile = data.latestEpisodesInCurrentFile || 0;
                
                this.topMonthSeriesFileNumber = data.topMonthSeriesFileNumber || 1; // 👈 جديد
                this.topMonthSeriesInCurrentFile = data.topMonthSeriesInCurrentFile || 0; // 👈 جديد
                
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.shouldStop = data.shouldStop || false;
                this.allPagesScraped = data.allPagesScraped || false;
                this.mode = data.mode || "scrape_top_month_series"; // 👈 تم التعديل
                
                this.currentSeriesId = data.currentSeriesId || null;
                this.currentSeasonId = data.currentSeasonId || null;
                
                this.currentSeriesFile = data.currentSeriesFile || "Page1.json";
                this.currentSeasonFile = data.currentSeasonFile || "Page1.json";
                this.currentEpisodeFile = data.currentEpisodeFile || "Page1.json";
                this.currentLatestEpisodesFile = data.currentLatestEpisodesFile || "Page1.json";
                this.currentTopMonthSeriesFile = data.currentTopMonthSeriesFile || "Page1.json"; // 👈 جديد
                
                this.lastTopSeriesScrape = data.lastTopSeriesScrape || null; // 👈 جديد
                this.lastMonitoringDate = data.lastMonitoringDate || null;
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
        
        this.latestEpisodesFileNumber = 1;
        this.latestEpisodesInCurrentFile = 0;
        
        this.topMonthSeriesFileNumber = 1; // 👈 جديد
        this.topMonthSeriesInCurrentFile = 0; // 👈 جديد
        
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.allPagesScraped = false;
        this.mode = "scrape_top_month_series"; // 👈 تم التعديل
        
        this.currentSeriesId = null;
        this.currentSeasonId = null;
        
        this.currentSeriesFile = "Page1.json";
        this.currentSeasonFile = "Page1.json";
        this.currentEpisodeFile = "Page1.json";
        this.currentLatestEpisodesFile = "Page1.json";
        this.currentTopMonthSeriesFile = "Page1.json"; // 👈 جديد
        
        this.lastTopSeriesScrape = null; // 👈 جديد
        this.lastMonitoringDate = null;
        
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
            
            latestEpisodesFileNumber: this.latestEpisodesFileNumber,
            latestEpisodesInCurrentFile: this.latestEpisodesInCurrentFile,
            
            topMonthSeriesFileNumber: this.topMonthSeriesFileNumber, // 👈 جديد
            topMonthSeriesInCurrentFile: this.topMonthSeriesInCurrentFile, // 👈 جديد
            
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            shouldStop: this.shouldStop,
            allPagesScraped: this.allPagesScraped,
            mode: this.mode,
            
            currentSeriesId: this.currentSeriesId,
            currentSeasonId: this.currentSeasonId,
            
            currentSeriesFile: this.currentSeriesFile,
            currentSeasonFile: this.currentSeasonFile,
            currentEpisodeFile: this.currentEpisodeFile,
            currentLatestEpisodesFile: this.currentLatestEpisodesFile,
            currentTopMonthSeriesFile: this.currentTopMonthSeriesFile, // 👈 جديد
            
            lastTopSeriesScrape: this.lastTopSeriesScrape, // 👈 جديد
            lastMonitoringDate: this.lastMonitoringDate,
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    addSeriesToFile() {
        this.seriesInCurrentFile++;
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
        if (this.episodesInCurrentFile >= ITEMS_PER_FILE.episodes) {
            this.episodeFileNumber++;
            this.episodesInCurrentFile = 0;
            this.currentEpisodeFile = `Page${this.episodeFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف حلقات جديد: ${this.currentEpisodeFile}`);
        }
        this.saveProgress();
    }
    
    addLatestEpisodeToFile() {
        this.latestEpisodesInCurrentFile++;
        if (this.latestEpisodesInCurrentFile >= ITEMS_PER_FILE.latestEpisodes) {
            this.latestEpisodesFileNumber++;
            this.latestEpisodesInCurrentFile = 0;
            this.currentLatestEpisodesFile = `Page${this.latestEpisodesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف حلقات جديدة جديد: ${this.currentLatestEpisodesFile}`);
        }
        this.saveProgress();
    }
    
    addTopMonthSeriesToFile() { // 👈 جديد
        this.topMonthSeriesInCurrentFile++;
        if (this.topMonthSeriesInCurrentFile >= ITEMS_PER_FILE.topMonthSeries) {
            this.topMonthSeriesFileNumber++;
            this.topMonthSeriesInCurrentFile = 0;
            this.currentTopMonthSeriesFile = `Page${this.topMonthSeriesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف أفضل مسلسلات جديد: ${this.currentTopMonthSeriesFile}`);
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
        this.mode = "monitor_episodes";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    switchToScrapeSeriesMode() { // 👈 جديد
        this.mode = "scrape_series";
        this.shouldStop = false;
        this.saveProgress();
    }
    
    switchToMonitoringMode() {
        this.mode = "monitor_episodes";
        this.shouldStop = true;
        this.saveProgress();
    }
    
    switchToScrapeNewSeriesMode() { // 👈 جديد
        this.mode = "scrape_new_series";
        this.shouldStop = false;
        this.saveProgress();
    }
    
    markTopSeriesScraped() { // 👈 جديد
        this.lastTopSeriesScrape = new Date().toISOString();
        this.saveProgress();
    }
    
    shouldScrapeTopSeriesThisMonth() { // 👈 جديد
        if (!this.lastTopSeriesScrape) return true;
        
        const lastScrape = new Date(this.lastTopSeriesScrape);
        const now = new Date();
        
        // إذا مر شهر كامل منذ آخر استخراج
        const diffMonths = (now.getFullYear() - lastScrape.getFullYear()) * 12 + 
                          (now.getMonth() - lastScrape.getMonth());
        
        return diffMonths >= 1;
    }
    
    resetForNewRun() {
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
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

function extractIdFromShortLink(shortLink) {
    try {
        if (shortLink.includes('?p=')) {
            const match = shortLink.match(/\?p=(\d+)/);
            return match ? `p_${match[1]}` : `temp_${Date.now()}`;
        } else if (shortLink.includes('?gt=')) {
            const match = shortLink.match(/\?gt=(\d+)/);
            return match ? `gt_${match[1]}` : `temp_${Date.now()}`;
        } else {
            return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    } catch {
        return `temp_${Date.now()}`;
    }
}

function extractIdFromUrl(url) {
    try {
        const urlParts = url.split('/');
        let id = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        if (id.includes('?')) id = id.split('?')[0];
        if (id.includes('#')) id = id.split('#')[0];
        return id || `id_${Date.now()}`;
    } catch {
        return `id_${Date.now()}`;
    }
}

// ==================== استخراج أفضل مسلسلات الشهر ====================
async function fetchTopSeriesOfMonth() {
    console.log("\n🏆 ===== جلب أفضل مسلسلات هذا الشهر =====");
    
    const url = "https://topcinema.rip/";
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) {
        console.log("❌ فشل جلب الصفحة الرئيسية");
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const topSeries = [];
        
        console.log("🔍 البحث عن قسم 'أفضل مسلسلات هذا الشهر'...");
        
        // البحث عن القسم المحدد
        const topSection = doc.querySelector('.Wide--Contents.Reverse.OneBox');
        if (!topSection) {
            console.log("❌ لم يتم العثور على قسم أفضل مسلسلات الشهر");
            return [];
        }
        
        // البحث عن العنوان للتأكد
        const sectionTitle = topSection.querySelector('h3')?.textContent;
        console.log(`✅ وجدت القسم: ${sectionTitle}`);
        
        // استخراج المسلسلات
        const seriesBoxes = topSection.querySelectorAll('.Small--Box');
        console.log(`✅ وجدت ${seriesBoxes.length} مسلسل في القسم`);
        
        for (let i = 0; i < seriesBoxes.length; i++) {
            const box = seriesBoxes[i];
            const link = box.querySelector('a');
            
            if (link && link.href) {
                const title = link.getAttribute('title') || 
                             box.querySelector('.title')?.textContent ||
                             "بدون عنوان";
                
                const image = box.querySelector('img')?.src;
                
                // استخراج التفاصيل من liList
                const details = {
                    genres: [],
                    quality: null,
                    imdbRating: null
                };
                
                const listItems = box.querySelectorAll('.liList li');
                listItems.forEach(item => {
                    const text = cleanText(item.textContent);
                    if (item.classList.contains('imdbRating')) {
                        const ratingMatch = text.match(/(\d+\.?\d*)/);
                        details.imdbRating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
                    } else if (text.includes('p')) {
                        details.quality = text;
                    } else {
                        details.genres.push(text);
                    }
                });
                
                const seriesId = extractIdFromUrl(link.href);
                
                topSeries.push({
                    id: seriesId,
                    url: link.href,
                    title: cleanText(title),
                    image: image,
                    position: i + 1,
                    rank: i + 1, // الترتيب في القائمة
                    details: details,
                    scrapedAt: new Date().toISOString()
                });
                
                console.log(`   [${i + 1}] ${title.substring(0, 40)}...`);
            }
        }
        
        console.log(`✅ تم استخراج ${topSeries.length} مسلسل من أفضل المسلسلات`);
        return topSeries;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج أفضل المسلسلات:`, error.message);
        return [];
    }
}

// ==================== حفظ أفضل مسلسلات الشهر ====================
function saveTopMonthSeries(seriesInfo, progress) {
    const filePath = path.join(TOP_MONTH_SERIES_DIR, progress.currentTopMonthSeriesFile);
    
    let existingData = [];
    let fileInfo = {};
    
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingData = fileContent.data || [];
            fileInfo = fileContent.info || {};
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة الملف ${progress.currentTopMonthSeriesFile}: ${error.message}`);
        }
    }
    
    // تحقق إذا كان المسلسل موجود بالفعل (بالعنوان والرابط)
    const isDuplicate = existingData.some(item => 
        item.url === seriesInfo.url || 
        item.title === seriesInfo.title
    );
    
    if (isDuplicate) {
        console.log(`   ⚠️ المسلسل موجود بالفعل، تخطي: ${seriesInfo.title.substring(0, 40)}...`);
        return null;
    }
    
    const allData = [...existingData, seriesInfo];
    
    fileInfo = {
        type: 'top_month_series',
        fileName: progress.currentTopMonthSeriesFile,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        totalItems: allData.length,
        created: fileInfo.created || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };
    
    const fileContent = {
        info: fileInfo,
        data: allData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    console.log(`   💾 تم حفظ المسلسل في ${progress.currentTopMonthSeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${fileInfo.totalItems} مسلسل`);
    
    progress.addTopMonthSeriesToFile();
    progress.saveProgress();
    
    return fileContent;
}

// ==================== استخراج المسلسلات من الصفحة الأولى فقط ====================
async function scrapeNewSeriesFromFirstPage(progress) {
    console.log("\n🆕 ===== استخراج المسلسلات الجديدة من الصفحة الأولى =====");
    
    const url = "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) {
        console.log("❌ فشل جلب صفحة المسلسلات");
        return { series: 0, seasons: 0, episodes: 0 };
    }
    
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // استخراج قائمة المسلسلات
    const seriesList = [];
    const seriesElements = doc.querySelectorAll('.Small--Box a');
    
    console.log(`🔍 وجدت ${seriesElements.length} مسلسل في الصفحة الأولى`);
    
    for (let i = 0; i < seriesElements.length; i++) {
        const element = seriesElements[i];
        const seriesUrl = element.href;
        
        if (seriesUrl && seriesUrl.includes('topcinema.rip')) {
            const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
            
            seriesList.push({
                url: seriesUrl,
                title: title,
                page: 1,
                position: i + 1
            });
            
            console.log(`   [${i + 1}] ${title.substring(0, 40)}...`);
        }
    }
    
    let totalSeriesExtracted = 0;
    let totalSeasonsExtracted = 0;
    let totalEpisodesExtracted = 0;
    let newSeriesCount = 0;
    let updatedSeriesCount = 0;
    
    // معالجة كل مسلسل
    for (let i = 0; i < seriesList.length; i++) {
        const seriesData = seriesList[i];
        
        console.log(`\n📊 معالجة المسلسل ${i + 1}/${seriesList.length}: ${seriesData.title.substring(0, 40)}...`);
        
        // استخراج معلومات المسلسل
        const seriesDetails = await fetchSeriesDetails(seriesData);
        
        if (!seriesDetails) {
            console.log(`   ⚠️ فشل استخراج معلومات المسلسل`);
            continue;
        }
        
        // فحص إذا كان المسلسل جديد أم موجود مسبقاً
        const isNewSeries = !isSeriesInDatabase(seriesDetails.id);
        
        if (isNewSeries) {
            console.log(`   🆕 مسلسل جديد!`);
            newSeriesCount++;
        } else {
            console.log(`   🔄 مسلسل موجود، جاري تحديثه...`);
            updatedSeriesCount++;
        }
        
        // حفظ المسلسل (سواء جديد أو تحديث)
        saveSeries(seriesDetails, progress);
        totalSeriesExtracted++;
        
        // استخراج المواسم
        const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url);
        
        if (seasons.length > 0) {
            console.log(`   📅 وجدت ${seasons.length} موسم`);
            
            for (let j = 0; j < seasons.length; j++) {
                const seasonData = seasons[j];
                
                // فحص إذا كان الموسم جديداً
                const isNewSeason = !isSeasonInDatabase(seasonData.url);
                
                if (isNewSeason) {
                    console.log(`     🆕 موسم جديد: ${seasonData.title}`);
                    
                    // استخراج بيانات الموسم
                    const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
                    
                    if (seasonDetails) {
                        saveSeason(seasonDetails, progress);
                        totalSeasonsExtracted++;
                        
                        // استخراج حلقات الموسم
                        const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
                        
                        if (episodes.length > 0) {
                            console.log(`       📺 وجدت ${episodes.length} حلقة جديدة`);
                            
                            for (let k = 0; k < episodes.length; k++) {
                                const episodeData = episodes[k];
                                
                                // فحص إذا كانت الحلقة جديدة
                                const isNewEpisode = !isEpisodeInDatabase(episodeData.url);
                                
                                if (isNewEpisode) {
                                    console.log(`         🆕 حلقة جديدة: ${episodeData.title}`);
                                    
                                    const episodeDetails = await fetchEpisodeDetails(
                                        episodeData,
                                        seriesDetails.id,
                                        seasonDetails.id
                                    );
                                    
                                    if (episodeDetails) {
                                        saveEpisode(episodeDetails, progress);
                                        totalEpisodesExtracted++;
                                    }
                                } else {
                                    console.log(`         ✅ الحلقة موجودة بالفعل`);
                                }
                                
                                // تأخير بين الحلقات
                                if (k < episodes.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                }
                            }
                        }
                    }
                } else {
                    console.log(`     ✅ الموسم موجود بالفعل`);
                    
                    // حتى إذا كان الموسم موجوداً، نتحقق من الحلقات الجديدة
                    // يمكن إضافة هذا الجزء لاحقاً إذا أردت
                }
                
                // تأخير بين المواسم
                if (j < seasons.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        
        // تأخير بين المسلسلات
        if (i < seriesList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log("\n📊 نتائج استخراج المسلسلات الجديدة:");
    console.log(`   🆕 مسلسلات جديدة: ${newSeriesCount}`);
    console.log(`   🔄 مسلسلات تم تحديثها: ${updatedSeriesCount}`);
    console.log(`   📊 إجمالي المسلسلات: ${totalSeriesExtracted}`);
    console.log(`   📊 إجمالي المواسم: ${totalSeasonsExtracted}`);
    console.log(`   📊 إجمالي الحلقات: ${totalEpisodesExtracted}`);
    
    return {
        series: totalSeriesExtracted,
        seasons: totalSeasonsExtracted,
        episodes: totalEpisodesExtracted,
        newSeries: newSeriesCount,
        updatedSeries: updatedSeriesCount
    };
}

// ==================== دوال فحص قاعدة البيانات ====================
function isSeriesInDatabase(seriesId) {
    try {
        const seriesFiles = fs.readdirSync(TV_SERIES_DIR)
            .filter(file => file.startsWith('Page') && file.endsWith('.json'));
        
        for (const file of seriesFiles) {
            const filePath = path.join(TV_SERIES_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (content.data && Array.isArray(content.data)) {
                const found = content.data.find(series => series.id === seriesId);
                if (found) return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ خطأ في فحص قاعدة بيانات المسلسلات: ${error.message}`);
        return false;
    }
}

function isSeasonInDatabase(seasonUrl) {
    try {
        const seasonFiles = fs.readdirSync(SEASONS_DIR)
            .filter(file => file.startsWith('Page') && file.endsWith('.json'));
        
        for (const file of seasonFiles) {
            const filePath = path.join(SEASONS_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (content.data && Array.isArray(content.data)) {
                const found = content.data.find(season => season.url === seasonUrl);
                if (found) return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ خطأ في فحص قاعدة بيانات المواسم: ${error.message}`);
        return false;
    }
}

function isEpisodeInDatabase(episodeUrl) {
    try {
        const episodeFiles = fs.readdirSync(EPISODES_DIR)
            .filter(file => file.startsWith('Page') && file.endsWith('.json'));
        
        for (const file of episodeFiles) {
            const filePath = path.join(EPISODES_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (content.data && Array.isArray(content.data)) {
                const found = content.data.find(episode => episode.url === episodeUrl);
                if (found) return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ خطأ في فحص قاعدة بيانات الحلقات: ${error.message}`);
        return false;
    }
}

// ==================== دوال الاستخراج الأساسية (نفسها كما كانت) ====================
async function fetchSeriesDetails(seriesData) {
    console.log(`   🎬 استخراج معلومات المسلسل...`);
    
    try {
        const html = await fetchPage(seriesData.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesData.url;
        const seriesId = extractIdFromShortLink(shortLink);
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seriesData.title);
        const image = doc.querySelector(".image img")?.src;
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
            isNew: true
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

async function extractSeasonsFromSeriesPage(seriesUrl) {
    console.log(`   📅 جاري استخراج المواسم...`);
    
    try {
        const html = await fetchPage(seriesUrl);
        if (!html) return [];
        
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
        }
        
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        return [];
    }
}

async function fetchSeasonDetails(seasonData, seriesId) {
    console.log(`     🎞️ استخراج معلومات الموسم...`);
    
    try {
        const html = await fetchPage(seasonData.url);
        if (!html) return null;
        
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
        
        return {
            id: seasonId,
            seriesId: seriesId,
            seasonNumber: seasonNumber,
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

async function extractEpisodesFromSeasonPage(seasonUrl) {
    console.log(`       📺 جاري استخراج الحلقات...`);
    
    try {
        const html = await fetchPage(seasonUrl);
        if (!html) return [];
        
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
        }
        
        return episodes;
        
    } catch (error) {
        console.log(`       ❌ خطأ في استخراج الحلقات: ${error.message}`);
        return [];
    }
}

async function fetchEpisodeDetails(episodeData, seriesId, seasonId) {
    console.log(`         🎥 استخراج معلومات الحلقة...`);
    
    try {
        const html = await fetchPage(episodeData.url);
        if (!html) return null;
        
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
        
        return {
            id: episodeId,
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episodeNumber,
            title: episodeData.title,
            url: episodeData.url,
            shortLink: shortLink,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`         ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ البيانات في الملفات ====================
function saveToFile(directory, fileName, data) {
    const filePath = path.join(directory, fileName);
    
    let existingData = [];
    let fileInfo = {};
    
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            existingData = fileContent.data || [];
            fileInfo = fileContent.info || {};
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة الملف ${fileName}: ${error.message}`);
        }
    }
    
    const allData = [...existingData, data];
    
    fileInfo = {
        type: 'data',
        fileName: fileName,
        totalItems: allData.length,
        created: fileInfo.created || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };
    
    const fileContent = {
        info: fileInfo,
        data: allData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

function saveSeries(seriesDetails, progress) {
    const saved = saveToFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails);
    console.log(`   💾 تم حفظ المسلسل في ${progress.currentSeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} مسلسل`);
    
    progress.addSeriesToFile();
    progress.currentSeriesId = seriesDetails.id;
    progress.saveProgress();
    
    return saved;
}

function saveSeason(seasonDetails, progress) {
    const saved = saveToFile(SEASONS_DIR, progress.currentSeasonFile, seasonDetails);
    console.log(`     💾 تم حفظ الموسم في ${progress.currentSeasonFile}`);
    console.log(`       📊 الإجمالي في الملف: ${saved.info.totalItems} موسم`);
    
    progress.addSeasonToFile();
    progress.currentSeasonId = seasonDetails.id;
    progress.saveProgress();
    
    return saved;
}

function saveEpisode(episodeDetails, progress) {
    const saved = saveToFile(EPISODES_DIR, progress.currentEpisodeFile, episodeDetails);
    console.log(`       💾 تم حفظ الحلقة في ${progress.currentEpisodeFile}`);
    console.log(`         📊 الإجمالي في الملف: ${saved.info.totalItems} حلقة`);
    
    progress.addEpisodeToFile();
    progress.saveProgress();
    
    return saved;
}

// ==================== الدالة الرئيسية المعدلة ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - توب سينما");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const progress = new ProgressTracker();
    
    console.log(`📊 حالة النظام:`);
    console.log(`   🎯 الوضع الحالي: ${getModeName(progress.mode)}`);
    
    switch (progress.mode) {
        case "scrape_top_month_series":
            console.log(`   📅 آخر استخراج لأفضل المسلسلات: ${progress.lastTopSeriesScrape ? new Date(progress.lastTopSeriesScrape).toLocaleString() : 'أول مرة'}`);
            await scrapeTopMonthSeriesMode(progress);
            break;
            
        case "scrape_new_series":
            console.log(`   📄 الصفحة الحالية: ${progress.seriesPage}`);
            await scrapeNewSeriesMode(progress);
            break;
            
        case "scrape_series":
            console.log(`   📄 الصفحة الحالية: ${progress.seriesPage}`);
            await scrapeAllSeriesMode(progress);
            break;
            
        case "monitor_episodes":
            console.log(`   📅 آخر مراقبة: ${progress.lastMonitoringDate ? new Date(progress.lastMonitoringDate).toLocaleString() : 'لم تتم من قبل'}`);
            await monitorEpisodesMode(progress);
            break;
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    saveFinalReport(progress);
}

function getModeName(mode) {
    const modes = {
        "scrape_top_month_series": "استخراج أفضل مسلسلات الشهر",
        "scrape_new_series": "استخراج المسلسلات الجديدة",
        "scrape_series": "استخراج جميع المسلسلات",
        "monitor_episodes": "مراقبة الحلقات الجديدة"
    };
    return modes[mode] || mode;
}

// ==================== وضع استخراج أفضل مسلسلات الشهر ====================
async function scrapeTopMonthSeriesMode(progress) {
    console.log("\n🏆 ===== بدء استخراج أفضل مسلسلات الشهر =====");
    
    // فحص إذا حان وقت استخراج أفضل المسلسلات لهذا الشهر
    if (!progress.shouldScrapeTopSeriesThisMonth()) {
        console.log(`📅 تم استخراج أفضل مسلسلات الشهر مؤخراً (${new Date(progress.lastTopSeriesScrape).toLocaleString()})`);
        console.log(`🔄 الانتقال لوضع استخراج المسلسلات الجديدة...`);
        progress.switchToScrapeNewSeriesMode();
        return;
    }
    
    const topSeries = await fetchTopSeriesOfMonth();
    
    if (topSeries.length === 0) {
        console.log("📭 لا توجد مسلسلات في قسم أفضل المسلسلات");
        progress.switchToScrapeNewSeriesMode();
        return;
    }
    
    let savedCount = 0;
    
    // حفظ كل مسلسل في ملف أفضل المسلسلات
    for (let i = 0; i < topSeries.length; i++) {
        const series = topSeries[i];
        
        console.log(`\n📊 معالجة المسلسل ${i + 1}/${topSeries.length}`);
        console.log(`🏆 الرتبة: ${series.rank} - ${series.title.substring(0, 40)}...`);
        
        // حفظ في ملف أفضل المسلسلات
        saveTopMonthSeries(series, progress);
        savedCount++;
        
        // فحص إذا كان المسلسل موجود في قاعدة البيانات العادية
        const isInDatabase = isSeriesInDatabase(series.id);
        
        if (!isInDatabase) {
            console.log(`   🆕 مسلسل جديد! جاري استخراجه كاملاً...`);
            
            // استخراج المسلسل كاملاً (مع مواسمه وحلقاته)
            await extractAndSaveFullSeries(series, progress);
        } else {
            console.log(`   ✅ المسلسل موجود بالفعل في قاعدة البيانات`);
        }
        
        // تأخير بين المسلسلات
        if (i < topSeries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log(`\n📊 نتائج استخراج أفضل المسلسلات:`);
    console.log(`   🏆 مسلسلات تم حفظها: ${savedCount}`);
    console.log(`   📅 تم تحديث تاريخ آخر استخراج`);
    
    progress.markTopSeriesScraped();
    progress.switchToScrapeNewSeriesMode();
}

async function extractAndSaveFullSeries(seriesInfo, progress) {
    console.log(`   🎬 استخراج المسلسل كاملاً...`);
    
    try {
        const html = await fetchPage(seriesInfo.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج بيانات المسلسل الكاملة
        const seriesDetails = await fetchSeriesDetails({
            url: seriesInfo.url,
            title: seriesInfo.title,
            page: 1,
            position: seriesInfo.position
        });
        
        if (!seriesDetails) return null;
        
        // حفظ المسلسل
        saveSeries(seriesDetails, progress);
        
        // استخراج المواسم
        const seasons = await extractSeasonsFromSeriesPage(seriesInfo.url);
        
        if (seasons.length > 0) {
            console.log(`   📅 وجدت ${seasons.length} موسم`);
            
            for (let j = 0; j < seasons.length; j++) {
                const seasonData = seasons[j];
                
                // استخراج بيانات الموسم
                const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
                
                if (seasonDetails) {
                    saveSeason(seasonDetails, progress);
                    
                    // استخراج الحلقات
                    const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
                    
                    if (episodes.length > 0) {
                        console.log(`     📺 وجدت ${episodes.length} حلقة`);
                        
                        for (let k = 0; k < episodes.length; k++) {
                            const episodeData = episodes[k];
                            
                            const episodeDetails = await fetchEpisodeDetails(
                                episodeData,
                                seriesDetails.id,
                                seasonDetails.id
                            );
                            
                            if (episodeDetails) {
                                saveEpisode(episodeDetails, progress);
                            }
                            
                            if (k < episodes.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                    }
                }
                
                if (j < seasons.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        
        return seriesDetails;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المسلسل كاملاً: ${error.message}`);
        return null;
    }
}

// ==================== وضع استخراج المسلسلات الجديدة ====================
async function scrapeNewSeriesMode(progress) {
    console.log("\n🆕 ===== بدء استخراج المسلسلات الجديدة =====");
    
    progress.resetForNewRun();
    
    const results = await scrapeNewSeriesFromFirstPage(progress);
    
    console.log(`\n✅ اكتمل استخراج المسلسلات الجديدة`);
    console.log(`🔄 الانتقال لوضع مراقبة الحلقات الجديدة...`);
    
    progress.switchToMonitoringMode();
}

// ==================== وضع استخراج جميع المسلسلات (الأصلي) ====================
async function scrapeAllSeriesMode(progress) {
    console.log("\n🎬 ===== بدء استخراج جميع المسلسلات =====");
    
    if (progress.allPagesScraped) {
        console.log(`\n🏁 تم استخراج جميع صفحات المسلسلات!`);
        console.log(`🔄 التبديل لوضع مراقبة الحلقات الجديدة...`);
        progress.switchToMonitoringMode();
        return;
    }
    
    // كود استخراج جميع المسلسلات (مثل الوظيفة الأصلية)
    // ... (يمكن إضافة الكود هنا إذا أردت الحفاظ على الوظيفة الأصلية)
}

// ==================== وضع مراقبة الحلقات الجديدة ====================
async function monitorEpisodesMode(progress) {
    console.log("\n🔍 ===== بدء مراقبة الحلقات الجديدة =====");
    
    // كود المراقبة (مثل الوظيفة الأصلية)
    // ... (يمكن إضافته هنا)
    
    progress.lastMonitoringDate = new Date().toISOString();
    progress.saveProgress();
}

// ==================== حفظ التقرير النهائي ====================
function saveFinalReport(progress) {
    const finalReport = {
        timestamp: new Date().toISOString(),
        mode: progress.mode,
        modeName: getModeName(progress.mode),
        stats: {
            seriesPage: progress.seriesPage,
            allPagesScraped: progress.allPagesScraped,
            seriesInFile: progress.seriesInCurrentFile,
            seasonsInFile: progress.seasonsInCurrentFile,
            episodesInFile: progress.episodesInCurrentFile,
            latestEpisodesInFile: progress.latestEpisodesInCurrentFile,
            topMonthSeriesInFile: progress.topMonthSeriesInCurrentFile
        },
        nextRun: {
            mode: progress.mode,
            startPage: progress.mode === 'scrape_series' ? progress.seriesPage : 'monitoring',
            seriesFile: progress.currentSeriesFile,
            topSeriesFile: progress.currentTopMonthSeriesFile
        }
    };
    
    fs.writeFileSync("scraper_report.json", JSON.stringify(finalReport, null, 2));
    console.log(`📄 تم حفظ التقرير في: scraper_report.json`);
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
