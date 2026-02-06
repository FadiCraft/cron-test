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
const LATEST_EPISODES_DIR = path.join(AG_SERIES_DIR, "Latest_Episodes");
const TOP_MONTHLY_SERIES_DIR = path.join(AG_SERIES_DIR, "Top_Monthly_Series");
const FIRST_PAGE_UPDATES_DIR = path.join(AG_SERIES_DIR, "First_Page_Updates"); // الجديد
const PROGRESS_FILE = path.join(__dirname, "series_progress.json");

// إنشاء المجلدات إذا لم تكن موجودة
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, 
     LATEST_EPISODES_DIR, TOP_MONTHLY_SERIES_DIR, FIRST_PAGE_UPDATES_DIR].forEach(dir => {
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
    topMonthlySeries: 100,
    firstPageUpdates: 50 // الجديد
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
                
                this.topMonthlySeriesFileNumber = data.topMonthlySeriesFileNumber || 1;
                this.topMonthlySeriesInCurrentFile = data.topMonthlySeriesInCurrentFile || 0;
                
                this.firstPageUpdatesFileNumber = data.firstPageUpdatesFileNumber || 1; // الجديد
                this.firstPageUpdatesInCurrentFile = data.firstPageUpdatesInCurrentFile || 0; // الجديد
                
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.shouldStop = data.shouldStop || false;
                this.allPagesScraped = data.allPagesScraped || false;
                this.mode = data.mode || "scrape_series";
                
                this.currentSeriesId = data.currentSeriesId || null;
                this.currentSeasonId = data.currentSeasonId || null;
                
                this.currentSeriesFile = data.currentSeriesFile || "Page1.json";
                this.currentSeasonFile = data.currentSeasonFile || "Page1.json";
                this.currentEpisodeFile = data.currentEpisodeFile || "Page1.json";
                this.currentLatestEpisodesFile = data.currentLatestEpisodesFile || "Page1.json";
                this.currentTopMonthlySeriesFile = data.currentTopMonthlySeriesFile || "TopMonthly_Page1.json";
                this.currentFirstPageUpdatesFile = data.currentFirstPageUpdatesFile || "FirstPageUpdates_Page1.json"; // الجديد
                
                this.lastMonitoringDate = data.lastMonitoringDate || null;
                this.lastTopMonthlyScrapeDate = data.lastTopMonthlyScrapeDate || null;
                this.lastFirstPageCheckDate = data.lastFirstPageCheckDate || null; // الجديد
                this.lastFirstPageSeries = data.lastFirstPageSeries || []; // الجديد - لتخزين مسلسلات الصفحة الأولى السابقة
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
        
        this.topMonthlySeriesFileNumber = 1;
        this.topMonthlySeriesInCurrentFile = 0;
        
        this.firstPageUpdatesFileNumber = 1; // الجديد
        this.firstPageUpdatesInCurrentFile = 0; // الجديد
        
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        this.allPagesScraped = false;
        this.mode = "scrape_series";
        
        this.currentSeriesId = null;
        this.currentSeasonId = null;
        
        this.currentSeriesFile = "Page1.json";
        this.currentSeasonFile = "Page1.json";
        this.currentEpisodeFile = "Page1.json";
        this.currentLatestEpisodesFile = "Page1.json";
        this.currentTopMonthlySeriesFile = "TopMonthly_Page1.json";
        this.currentFirstPageUpdatesFile = "FirstPageUpdates_Page1.json"; // الجديد
        
        this.lastMonitoringDate = null;
        this.lastTopMonthlyScrapeDate = null;
        this.lastFirstPageCheckDate = null; // الجديد
        this.lastFirstPageSeries = []; // الجديد
        
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
            
            topMonthlySeriesFileNumber: this.topMonthlySeriesFileNumber,
            topMonthlySeriesInCurrentFile: this.topMonthlySeriesInCurrentFile,
            
            firstPageUpdatesFileNumber: this.firstPageUpdatesFileNumber, // الجديد
            firstPageUpdatesInCurrentFile: this.firstPageUpdatesInCurrentFile, // الجديد
            
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
            currentTopMonthlySeriesFile: this.currentTopMonthlySeriesFile,
            currentFirstPageUpdatesFile: this.currentFirstPageUpdatesFile, // الجديد
            
            lastMonitoringDate: this.lastMonitoringDate,
            lastTopMonthlyScrapeDate: this.lastTopMonthlyScrapeDate,
            lastFirstPageCheckDate: this.lastFirstPageCheckDate, // الجديد
            lastFirstPageSeries: this.lastFirstPageSeries, // الجديد
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
    
    addTopMonthlySeriesToFile() {
        this.topMonthlySeriesInCurrentFile++;
        if (this.topMonthlySeriesInCurrentFile >= ITEMS_PER_FILE.topMonthlySeries) {
            this.topMonthlySeriesFileNumber++;
            this.topMonthlySeriesInCurrentFile = 0;
            this.currentTopMonthlySeriesFile = `TopMonthly_Page${this.topMonthlySeriesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف أفضل مسلسلات جديد: ${this.currentTopMonthlySeriesFile}`);
        }
        this.saveProgress();
    }
    
    addFirstPageUpdateToFile() { // الجديد
        this.firstPageUpdatesInCurrentFile++;
        if (this.firstPageUpdatesInCurrentFile >= ITEMS_PER_FILE.firstPageUpdates) {
            this.firstPageUpdatesFileNumber++;
            this.firstPageUpdatesInCurrentFile = 0;
            this.currentFirstPageUpdatesFile = `FirstPageUpdates_Page${this.firstPageUpdatesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف تحديثات الصفحة الأولى جديد: ${this.currentFirstPageUpdatesFile}`);
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
    
    switchToMonitoringMode() {
        this.mode = "monitor_episodes";
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

// ==================== استخراج آخر الحلقات من الصفحة الرئيسية ====================
async function fetchLatestEpisodes() {
    console.log("\n📺 ===== جلب آخر الحلقات من الصفحة الرئيسية =====");
    
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
        const episodes = [];
        
        console.log("🔍 البحث عن قسم 'آخر الحلقات المضافة'...");
        
        const latestSection = doc.querySelector('.Wide--Contents');
        if (!latestSection) {
            console.log("❌ لم يتم العثور على قسم آخر الحلقات المضافة");
            return [];
        }
        
        const episodeBoxes = latestSection.querySelectorAll('.Small--Box');
        console.log(`✅ وجدت ${episodeBoxes.length} حلقة في القسم`);
        
        for (let i = 0; i < Math.min(episodeBoxes.length, 10); i++) {
            const box = episodeBoxes[i];
            const link = box.querySelector('a');
            
            if (link && link.href) {
                const title = link.getAttribute('title') || 
                             box.querySelector('.title')?.textContent ||
                             box.querySelector('h3')?.textContent ||
                             "بدون عنوان";
                
                episodes.push({
                    url: link.href,
                    title: cleanText(title),
                    seriesName: cleanText(box.querySelector('.title')?.textContent || ''),
                    position: i + 1
                });
                
                console.log(`   [${i + 1}] ${title.substring(0, 40)}...`);
            }
        }
        
        console.log(`✅ تم استخراج ${episodes.length} حلقة جديدة`);
        return episodes;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج الحلقات:`, error.message);
        return [];
    }
}

// ==================== استخراج أفضل مسلسلات هذا الشهر ====================
async function fetchTopMonthlySeries() {
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
        
        const topSeriesSections = doc.querySelectorAll('.Wide--Contents.Reverse.OneBox');
        let topSeriesSection = null;
        
        for (const section of topSeriesSections) {
            const titleElement = section.querySelector('.Title--Box h3');
            if (titleElement && titleElement.textContent.includes('أفضل مسلسلات هذا الشهر')) {
                topSeriesSection = section;
                break;
            }
        }
        
        if (!topSeriesSection) {
            console.log("❌ لم يتم العثور على قسم أفضل مسلسلات هذا الشهر");
            return [];
        }
        
        const seriesBoxes = topSeriesSection.querySelectorAll('.Small--Box');
        console.log(`✅ وجدت ${seriesBoxes.length} مسلسل في القسم`);
        
        for (let i = 0; i < seriesBoxes.length; i++) {
            const box = seriesBoxes[i];
            const link = box.querySelector('a');
            
            if (link && link.href && link.href.includes('/series/')) {
                const titleElement = box.querySelector('.title') || link;
                const title = cleanText(titleElement.textContent);
                
                const image = box.querySelector('img')?.src;
                
                const categories = [];
                const categoryElements = box.querySelectorAll('.liList li:not(.imdbRating)');
                categoryElements.forEach(el => {
                    const catText = cleanText(el.textContent);
                    if (catText && !catText.includes('p') && !catText.includes('WEB-DL')) {
                        categories.push(catText);
                    }
                });
                
                let quality = "غير محدد";
                const qualityMatch = box.textContent.match(/\d+p\s*(WEB-DL|HDTV|BluRay)?/i);
                if (qualityMatch) {
                    quality = qualityMatch[0];
                }
                
                const imdbRatingElement = box.querySelector('.imdbRating');
                const imdbRating = imdbRatingElement ? 
                    cleanText(imdbRatingElement.textContent).replace('i', '').trim() : 
                    null;
                
                const seriesId = extractIdFromUrl(link.href);
                
                topSeries.push({
                    id: seriesId,
                    url: link.href,
                    title: title,
                    image: image,
                    categories: categories,
                    quality: quality,
                    imdbRating: imdbRating,
                    position: i + 1,
                    scrapedAt: new Date().toISOString()
                });
                
                console.log(`   [${i + 1}] ${title.substring(0, 40)}... (IMDB: ${imdbRating || 'N/A'})`);
            }
        }
        
        console.log(`✅ تم استخراج ${topSeries.length} مسلسل من أفضل المسلسلات`);
        return topSeries;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج أفضل المسلسلات:`, error.message);
        return [];
    }
}

// ==================== فحص الصفحة الأولى للتحديثات ====================
async function checkFirstPageForUpdates(progress) {
    console.log("\n🔍 ===== فحص الصفحة الأولى للتحديثات =====");
    
    // جلب الصفحة الأولى
    const firstPageData = await fetchSeriesListFromPage(1);
    
    if (!firstPageData || firstPageData.series.length === 0) {
        console.log("⚠️ لا يمكن جلب بيانات الصفحة الأولى");
        return { newSeries: 0, updated: false };
    }
    
    const currentFirstPageSeries = firstPageData.series.map(series => {
        return {
            url: series.url,
            title: series.title,
            id: extractIdFromUrl(series.url)
        };
    });
    
    console.log(`📊 الصفحة الأولى تحتوي على ${currentFirstPageSeries.length} مسلسل`);
    
    // إذا كانت هذه هي المرة الأولى، نحفظ المسلسلات الحالية ونرجع
    if (progress.lastFirstPageSeries.length === 0) {
        console.log("📝 هذه هي المرة الأولى لفحص الصفحة الأولى، حفظ الحالة الحالية...");
        progress.lastFirstPageSeries = currentFirstPageSeries;
        progress.lastFirstPageCheckDate = new Date().toISOString();
        progress.saveProgress();
        return { newSeries: 0, updated: false };
    }
    
    // البحث عن مسلسلات جديدة
    const newSeries = [];
    
    for (const currentSeries of currentFirstPageSeries) {
        // البحث إذا كان المسلسل موجود في القائمة السابقة
        const isExisting = progress.lastFirstPageSeries.some(oldSeries => 
            oldSeries.id === currentSeries.id || oldSeries.url === currentSeries.url
        );
        
        if (!isExisting) {
            console.log(`🆕 مسلسل جديد في الصفحة الأولى: ${currentSeries.title.substring(0, 40)}...`);
            newSeries.push(currentSeries);
        }
    }
    
    if (newSeries.length === 0) {
        console.log("✅ لا توجد مسلسلات جديدة في الصفحة الأولى");
        progress.lastFirstPageCheckDate = new Date().toISOString();
        progress.saveProgress();
        return { newSeries: 0, updated: false };
    }
    
    console.log(`🎉 وجدت ${newSeries.length} مسلسل جديد في الصفحة الأولى!`);
    
    // استخراج المسلسلات الجديدة
    let extractedCount = 0;
    
    for (let i = 0; i < newSeries.length; i++) {
        const series = newSeries[i];
        
        console.log(`\n📊 معالجة المسلسل الجديد ${i + 1}/${newSeries.length}`);
        console.log(`🎬 ${series.title.substring(0, 40)}...`);
        
        // استخراج بيانات المسلسل الكاملة
        const seriesData = {
            url: series.url,
            title: series.title,
            position: i + 1,
            page: 1
        };
        
        const seriesDetails = await fetchSeriesDetails(seriesData);
        
        if (seriesDetails) {
            // حفظ المسلسل في قاعدة البيانات الرئيسية
            const saved = saveToFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails);
            console.log(`   💾 تم حفظ المسلسل الجديد في ${progress.currentSeriesFile}`);
            progress.addSeriesToFile();
            extractedCount++;
            
            // حفظ المسلسل في مجلد التحديثات الخاص بالصفحة الأولى
            const updateRecord = {
                seriesId: seriesDetails.id,
                title: seriesDetails.title,
                url: seriesDetails.url,
                addedAt: new Date().toISOString(),
                reason: "new_in_first_page",
                originalPosition: i + 1
            };
            
            saveToFile(FIRST_PAGE_UPDATES_DIR, progress.currentFirstPageUpdatesFile, updateRecord);
            progress.addFirstPageUpdateToFile();
        }
        
        // تأخير بين المسلسلات
        if (i < newSeries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // تحديث القائمة السابقة
    progress.lastFirstPageSeries = currentFirstPageSeries;
    progress.lastFirstPageCheckDate = new Date().toISOString();
    progress.saveProgress();
    
    console.log(`\n📊 نتائج فحص الصفحة الأولى:`);
    console.log(`   📝 مسلسلات جديدة وجدت: ${newSeries.length}`);
    console.log(`   ✅ مسلسلات جديدة تم استخراجها: ${extractedCount}`);
    
    return { newSeries: extractedCount, updated: true };
}

// ==================== استخراج معلومات المسلسل من صفحة الحلقة ====================
async function extractSeriesInfoFromEpisode(episodeUrl) {
    console.log(`   🔍 استخراج معلومات المسلسل من الحلقة...`);
    
    try {
        const html = await fetchPage(episodeUrl);
        if (!html) {
            console.log(`     ⚠️ فشل جلب صفحة الحلقة`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const breadcrumbs = doc.querySelector('#mpbreadcrumbs');
        if (!breadcrumbs) {
            console.log(`     ⚠️ لم يتم العثور على breadcrumbs`);
            return null;
        }
        
        let seriesLink = null;
        let seriesTitle = null;
        
        const breadcrumbLinks = breadcrumbs.querySelectorAll('a');
        for (const link of breadcrumbLinks) {
            const href = link.getAttribute('href');
            const text = link.textContent;
            
            if (href && href.includes('/series/') && 
                !href.includes('الموسم') && 
                !text.includes('الموسم') &&
                !text.includes('الحلقة')) {
                seriesLink = href;
                seriesTitle = text;
                break;
            }
        }
        
        if (!seriesLink) {
            for (const link of breadcrumbLinks) {
                const href = link.getAttribute('href');
                if (href && href.includes('/series/') && href.includes('مترجم')) {
                    seriesLink = href;
                    seriesTitle = link.textContent;
                    break;
                }
            }
        }
        
        if (seriesLink) {
            const seriesId = extractIdFromUrl(seriesLink);
            
            return {
                id: seriesId,
                url: seriesLink,
                title: cleanText(seriesTitle),
                episodeUrl: episodeUrl,
                scrapedAt: new Date().toISOString()
            };
        }
        
        console.log(`     ⚠️ لم يتم العثور على رابط المسلسل في breadcrumbs`);
        return null;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج معلومات المسلسل: ${error.message}`);
        return null;
    }
}

// ==================== فحص إذا كان المسلسل موجود في قاعدة البيانات ====================
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
        console.log(`⚠️ خطأ في فحص قاعدة البيانات: ${error.message}`);
        return false;
    }
}

// ==================== دالة لاستخراج المسلسل كاملاً ====================
async function extractFullSeries(seriesInfo) {
    console.log(`\n🎬 استخراج المسلسل كاملاً: ${seriesInfo.title || seriesInfo.id}`);
    
    try {
        const html = await fetchPage(seriesInfo.url);
        if (!html) {
            console.log(`   ❌ فشل جلب صفحة المسلسل`);
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesInfo.url;
        const seriesId = seriesInfo.id || extractIdFromUrl(shortLink);
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seriesInfo.title);
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
        
        const seriesDetails = {
            id: seriesId,
            title: title,
            url: seriesInfo.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story || "غير متوفر",
            details: details,
            scrapedAt: new Date().toISOString(),
            fromLatestEpisode: true
        };
        
        console.log(`   ✅ تم استخراج بيانات المسلسل`);
        
        console.log(`   📅 جاري استخراج المواسم...`);
        const seasons = await extractSeasonsFromSeriesPage(seriesInfo.url);
        
        if (seasons.length > 0) {
            console.log(`   ✅ وجدت ${seasons.length} موسم للمسلسل`);
            
            for (let i = 0; i < seasons.length; i++) {
                const seasonData = seasons[i];
                
                console.log(`   🎞️  معالجة الموسم ${i + 1}/${seasons.length}`);
                
                const seasonDetails = await fetchSeasonDetails(seasonData, seriesId);
                
                if (seasonDetails) {
                    console.log(`     ✅ تم استخراج الموسم ${seasonDetails.seasonNumber}`);
                    
                    console.log(`     📺 جاري استخراج حلقات الموسم...`);
                    const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
                    
                    if (episodes.length > 0) {
                        console.log(`     ✅ وجدت ${episodes.length} حلقة للموسم`);
                        
                        for (let j = 0; j < episodes.length; j++) {
                            const episodeData = episodes[j];
                            
                            console.log(`       🎥 استخراج الحلقة ${j + 1}/${episodes.length}`);
                            
                            const episodeDetails = await fetchEpisodeDetails(
                                episodeData, 
                                seriesId, 
                                seasonDetails.id
                            );
                            
                            if (episodeDetails) {
                                console.log(`         ✅ تم استخراج الحلقة ${episodeDetails.episodeNumber}`);
                            }
                            
                            if (j < episodes.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }
                }
                
                if (i < seasons.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        return seriesDetails;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المسلسل كاملاً: ${error.message}`);
        return null;
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
                const seasonsCount = cleanText(element.querySelector('.number.Collection span')?.textContent || "");
                
                seriesList.push({
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
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
                const label = cleanText(labelElement.textContent
