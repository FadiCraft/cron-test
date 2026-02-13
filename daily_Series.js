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

// إنشاء المجلدات
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${dir}`);
        }
    });
};
createDirectories();

// ==================== الإعدادات ====================
const PAGES_PER_RUN = 3; // 3 صفحات كل تشغيل
const DELAY_BETWEEN_REQUESTS = 2000;
const MAX_RETRIES = 3;
const ITEMS_PER_FILE = 50;

// ==================== نظام التقدم المحسن ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                
                // صفحات المسلسلات
                this.seriesCurrentPage = data.seriesCurrentPage || 1;
                this.seriesPagesDone = data.seriesPagesDone || 0;
                this.seriesFileNumber = data.seriesFileNumber || 1;
                this.seriesInCurrentFile = data.seriesInCurrentFile || 0;
                
                // مرحلة العمل
                this.currentPhase = data.currentPhase || "series"; // series, seasons, episodes
                this.currentIndex = data.currentIndex || 0; // الفهرس الحالي في المرحلة
                
                // إحصائيات
                this.totalSeries = data.totalSeries || 0;
                this.totalSeasons = data.totalSeasons || 0;
                this.totalEpisodes = data.totalEpisodes || 0;
                
                // هل انتهينا؟
                this.allSeriesScraped = data.allSeriesScraped || false;
                this.allSeasonsScraped = data.allSeasonsScraped || false;
                this.allEpisodesScraped = data.allEpisodesScraped || false;
                
                this.pagesProcessedThisRun = data.pagesProcessedThisRun || 0;
                this.shouldStop = data.shouldStop || false;
                
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ خطأ في تحميل التقدم، إنشاء جديد");
            this.resetProgress();
        }
    }
    
    resetProgress() {
        this.seriesCurrentPage = 1;
        this.seriesPagesDone = 0;
        this.seriesFileNumber = 1;
        this.seriesInCurrentFile = 0;
        
        this.currentPhase = "series";
        this.currentIndex = 0;
        
        this.totalSeries = 0;
        this.totalSeasons = 0;
        this.totalEpisodes = 0;
        
        this.allSeriesScraped = false;
        this.allSeasonsScraped = false;
        this.allEpisodesScraped = false;
        
        this.pagesProcessedThisRun = 0;
        this.shouldStop = false;
        
        this.saveProgress();
    }
    
    saveProgress() {
        const progressData = {
            seriesCurrentPage: this.seriesCurrentPage,
            seriesPagesDone: this.seriesPagesDone,
            seriesFileNumber: this.seriesFileNumber,
            seriesInCurrentFile: this.seriesInCurrentFile,
            
            currentPhase: this.currentPhase,
            currentIndex: this.currentIndex,
            
            totalSeries: this.totalSeries,
            totalSeasons: this.totalSeasons,
            totalEpisodes: this.totalEpisodes,
            
            allSeriesScraped: this.allSeriesScraped,
            allSeasonsScraped: this.allSeasonsScraped,
            allEpisodesScraped: this.allEpisodesScraped,
            
            pagesProcessedThisRun: this.pagesProcessedThisRun,
            shouldStop: this.shouldStop,
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    pageProcessed() {
        this.pagesProcessedThisRun++;
        this.seriesPagesDone++;
        this.seriesCurrentPage++;
        
        if (this.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        }
        
        this.saveProgress();
    }
    
    addSeries() {
        this.totalSeries++;
        this.seriesInCurrentFile++;
        
        if (this.seriesInCurrentFile >= ITEMS_PER_FILE) {
            this.seriesFileNumber++;
            this.seriesInCurrentFile = 0;
            console.log(`\n📁 إنشاء ملف مسلسلات جديد: Page${this.seriesFileNumber}.json`);
        }
        
        this.saveProgress();
    }
    
    moveToSeasonsPhase() {
        this.currentPhase = "seasons";
        this.currentIndex = 0;
        this.allSeriesScraped = true;
        this.saveProgress();
        console.log("\n🔄 الانتقال لمرحلة استخراج المواسم...");
    }
    
    moveToEpisodesPhase() {
        this.currentPhase = "episodes";
        this.currentIndex = 0;
        this.allSeasonsScraped = true;
        this.saveProgress();
        console.log("\n🔄 الانتقال لمرحلة استخراج الحلقات...");
    }
    
    incrementSeasonIndex() {
        this.currentIndex++;
        this.totalSeasons++;
        this.saveProgress();
    }
    
    incrementEpisodeIndex() {
        this.currentIndex++;
        this.totalEpisodes++;
        this.saveProgress();
    }
    
    markSeasonsComplete() {
        this.allSeasonsScraped = true;
        this.saveProgress();
    }
    
    markEpisodesComplete() {
        this.allEpisodesScraped = true;
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
            console.log(`   ⚠️ محاولة ${i + 1} فشلت`);
        }
    }
    return null;
}

async function fetchPage(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3'
        };
        
        const response = await fetch(url, { headers, timeout: 30000 });
        if (!response.ok) return null;
        
        const html = await response.text();
        await delay(DELAY_BETWEEN_REQUESTS);
        return html;
        
    } catch (error) {
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractIdFromUrl(url) {
    try {
        const match = url.match(/\/(\d+)(?:\/|$)/);
        return match ? `id_${match[1]}` : `id_${Date.now()}`;
    } catch {
        return `id_${Date.now()}`;
    }
}

// ==================== نظام الملفات ====================
class FileManager {
    readJsonFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return { data: [] };
            }
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
            return { data: [] };
        }
    }
    
    saveToFile(directory, fileName, data) {
        const filePath = path.join(directory, fileName);
        let existingData = [];
        
        if (fs.existsSync(filePath)) {
            try {
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                existingData = content.data || [];
            } catch {
                existingData = [];
            }
        }
        
        const fileContent = {
            info: {
                fileName: fileName,
                totalItems: existingData.length + 1,
                lastUpdated: new Date().toISOString()
            },
            data: [...existingData, data]
        };
        
        fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
        return fileContent;
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
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة المجلد: ${error.message}`);
        }
        return items;
    }
}

// ==================== استخراج المسلسلات من الصفحة (بدون تفاصيل) ====================
async function fetchSeriesListFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/"
        : `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/page/${pageNum}/`;
    
    console.log(`\n📺 الصفحة ${pageNum}: ${url}`);
    
    const html = await fetchWithRetry(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seriesList = [];
        
        const seriesElements = doc.querySelectorAll('.Small--Box a');
        
        for (const element of seriesElements) {
            const seriesUrl = element.href;
            if (seriesUrl && seriesUrl.includes('topcinema.rip')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                
                seriesList.push({
                    url: seriesUrl,
                    title: title,
                    image: image,
                    page: pageNum,
                    extracted: false,
                    id: extractIdFromUrl(seriesUrl)
                });
            }
        }
        
        console.log(`✅ وجدت ${seriesList.length} مسلسل في الصفحة ${pageNum}`);
        return seriesList;
        
    } catch (error) {
        console.log(`❌ خطأ في الصفحة ${pageNum}: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل المسلسل ====================
async function fetchSeriesDetails(seriesData) {
    console.log(`   📊 استخراج تفاصيل: ${seriesData.title.substring(0, 40)}...`);
    
    try {
        const html = await fetchWithRetry(seriesData.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
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
                        details[label] = Array.from(links).map(a => cleanText(a.textContent));
                    } else {
                        const text = cleanText(item.textContent);
                        const value = text.split(":").slice(1).join(":").trim();
                        details[label] = value;
                    }
                }
            }
        });
        
        // استخراج روابط المواسم (بدون تفاصيل)
        const seasonLinks = [];
        const seasonElements = doc.querySelectorAll('.Small--Box.Season a, a[href*="season"], a[href*="موسم"]');
        
        seasonElements.forEach(link => {
            if (link.href && link.href.includes('topcinema.rip') && !seasonLinks.includes(link.href)) {
                seasonLinks.push(link.href);
            }
        });
        
        return {
            id: seriesData.id,
            title: title,
            url: seriesData.url,
            image: image,
            imdbRating: imdbRating || "غير متوفر",
            story: story || "غير متوفر",
            details: details,
            seasonUrls: [...new Set(seasonLinks)], // إزالة التكرار
            page: seriesData.page,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الموسم ====================
async function fetchSeasonDetails(seasonUrl, seriesId) {
    console.log(`     🎞️ استخراج موسم: ${seasonUrl.substring(0, 50)}...`);
    
    try {
        const html = await fetchWithRetry(seasonUrl);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || "موسم");
        const image = doc.querySelector(".image img")?.src;
        
        // استخراج رقم الموسم
        let seasonNumber = 1;
        const numMatch = title.match(/\d+/) || seasonUrl.match(/season[\/-](\d+)/i);
        if (numMatch) seasonNumber = parseInt(numMatch[1] || numMatch[0]);
        
        // استخراج روابط الحلقات
        const episodeUrls = [];
        const episodeLinks = doc.querySelectorAll('a[href*="topcinema.rip"]');
        
        episodeLinks.forEach(link => {
            const text = link.textContent + ' ' + (link.title || '');
            if (text.includes('حلقة') || link.href.includes('حلقة')) {
                if (link.href && !episodeUrls.includes(link.href)) {
                    episodeUrls.push(link.href);
                }
            }
        });
        
        return {
            id: extractIdFromUrl(seasonUrl),
            seriesId: seriesId,
            seasonNumber: seasonNumber,
            title: title,
            url: seasonUrl,
            image: image,
            episodeUrls: episodeUrls,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الحلقة ====================
async function fetchEpisodeDetails(episodeUrl, seriesId, seasonId) {
    console.log(`       🎥 استخراج حلقة: ${episodeUrl.substring(0, 50)}...`);
    
    try {
        const html = await fetchWithRetry(episodeUrl);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج رقم الحلقة
        let episodeNumber = 1;
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || "حلقة");
        const numMatch = title.match(/\d+/) || episodeUrl.match(/حلقة[\/-](\d+)/i);
        if (numMatch) episodeNumber = parseInt(numMatch[1] || numMatch[0]);
        
        // استخراج روابط التحميل
        const downloadServers = {};
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
        downloadBlocks.forEach(block => {
            const quality = cleanText(block.querySelector('.download-title span')?.textContent) || "غير محدد";
            const links = block.querySelectorAll('a.downloadsLink');
            
            if (links.length > 0) {
                downloadServers[quality] = Array.from(links).map(link => ({
                    name: cleanText(link.textContent),
                    url: link.href
                }));
            }
        });
        
        return {
            id: extractIdFromUrl(episodeUrl),
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episodeNumber,
            title: title,
            url: episodeUrl,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== المرحلة 1: استخراج المسلسلات ====================
async function phaseExtractSeries(progress, fileManager) {
    console.log("\n" + "=".repeat(60));
    console.log("📺 المرحلة 1: استخراج المسلسلات");
    console.log(`📄 بدء من الصفحة: ${progress.seriesCurrentPage}`);
    console.log("=".repeat(60));
    
    let pagesProcessed = 0;
    
    while (!progress.shouldStop && pagesProcessed < PAGES_PER_RUN) {
        const pageNum = progress.seriesCurrentPage;
        console.log(`\n📋 معالجة الصفحة ${pageNum}...`);
        
        const seriesList = await fetchSeriesListFromPage(pageNum);
        
        if (!seriesList || seriesList.length === 0) {
            console.log(`\n🏁 لا توجد صفحات أكثر! الانتقال للمرحلة التالية.`);
            progress.moveToSeasonsPhase();
            break;
        }
        
        console.log(`\n📊 استخراج تفاصيل ${seriesList.length} مسلسل من الصفحة ${pageNum}:`);
        
        for (let i = 0; i < seriesList.length; i++) {
            const series = seriesList[i];
            console.log(`\n   [${i + 1}/${seriesList.length}] معالجة: ${series.title}`);
            
            const seriesDetails = await fetchSeriesDetails(series);
            
            if (seriesDetails) {
                const fileName = `Page${progress.seriesFileNumber}.json`;
                fileManager.saveToFile(TV_SERIES_DIR, fileName, seriesDetails);
                progress.addSeries();
                console.log(`   ✅ تم الحفظ في ${fileName}`);
            }
            
            // تأخير بين المسلسلات
            if (i < seriesList.length - 1) {
                await delay(1500);
            }
        }
        
        pagesProcessed++;
        progress.pageProcessed();
        
        // تأخير بين الصفحات
        if (!progress.shouldStop && pagesProcessed < PAGES_PER_RUN) {
            console.log(`\n⏳ انتظار 3 ثواني قبل الصفحة التالية...`);
            await delay(3000);
        }
    }
    
    if (progress.shouldStop) {
        console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات. انتظر التشغيل القادم.`);
    }
}

// ==================== المرحلة 2: استخراج المواسم ====================
async function phaseExtractSeasons(progress, fileManager) {
    console.log("\n" + "=".repeat(60));
    console.log("🎞️ المرحلة 2: استخراج المواسم");
    console.log("=".repeat(60));
    
    // استيراد جميع المسلسلات
    const allSeries = fileManager.getAllItems(TV_SERIES_DIR);
    console.log(`📊 إجمالي المسلسلات: ${allSeries.length}`);
    
    let processed = 0;
    const startIndex = progress.currentIndex;
    
    for (let i = startIndex; i < allSeries.length; i++) {
        const series = allSeries[i];
        
        console.log(`\n[${i + 1}/${allSeries.length}] معالجة مواسم: ${series.title.substring(0, 40)}...`);
        
        if (series.seasonUrls && series.seasonUrls.length > 0) {
            console.log(`   📅 وجدت ${series.seasonUrls.length} موسم`);
            
            for (let j = 0; j < series.seasonUrls.length; j++) {
                const seasonUrl = series.seasonUrls[j];
                
                const seasonDetails = await fetchSeasonDetails(seasonUrl, series.id);
                
                if (seasonDetails) {
                    const seasonFile = `Page${Math.floor(progress.totalSeasons / ITEMS_PER_FILE) + 1}.json`;
                    fileManager.saveToFile(SEASONS_DIR, seasonFile, seasonDetails);
                    progress.incrementSeasonIndex();
                    console.log(`     ✅ تم حفظ الموسم ${seasonDetails.seasonNumber}`);
                }
                
                // تحديث التقدم
                progress.currentIndex = i;
                progress.saveProgress();
                
                await delay(1000);
            }
        } else {
            console.log(`   ℹ️ لا توجد مواسم لهذا المسلسل`);
        }
        
        // تحديث الفهرس
        progress.currentIndex = i + 1;
        progress.saveProgress();
        
        // تحقق إذا خلصنا وقت
        if (progress.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n⏸️ توقف: اكتمل عدد الصفحات لهذا التشغيل.`);
            console.log(`📌 سنكمل من المسلسل رقم ${i + 1} في المرة القادمة.`);
            return;
        }
        
        processed++;
        
        // نعتبر كل 5 مسلسلات "صفحة" واحدة
        if (processed % 5 === 0) {
            progress.pagesProcessedThisRun++;
            progress.saveProgress();
            
            if (progress.pagesProcessedThisRun >= PAGES_PER_RUN) {
                console.log(`\n✅ اكتمل ${PAGES_PER_RUN} صفحات من المواسم لهذا التشغيل`);
                return;
            }
        }
        
        await delay(2000);
    }
    
    // انتهينا من كل المواسم
    console.log(`\n🎉 تم استخراج جميع المواسم! الانتقال للمرحلة التالية.`);
    progress.moveToEpisodesPhase();
}

// ==================== المرحلة 3: استخراج الحلقات ====================
async function phaseExtractEpisodes(progress, fileManager) {
    console.log("\n" + "=".repeat(60));
    console.log("🎥 المرحلة 3: استخراج الحلقات");
    console.log("=".repeat(60));
    
    // استيراد جميع المواسم
    const allSeasons = fileManager.getAllItems(SEASONS_DIR);
    console.log(`📊 إجمالي المواسم: ${allSeasons.length}`);
    
    let processed = 0;
    const startIndex = progress.currentIndex;
    
    for (let i = startIndex; i < allSeasons.length; i++) {
        const season = allSeasons[i];
        
        console.log(`\n[${i + 1}/${allSeasons.length}] معالجة حلقات الموسم ${season.seasonNumber} من مسلسل ${season.seriesId.substring(0, 15)}...`);
        
        if (season.episodeUrls && season.episodeUrls.length > 0) {
            console.log(`   📺 وجدت ${season.episodeUrls.length} حلقة`);
            
            for (let j = 0; j < season.episodeUrls.length; j++) {
                const episodeUrl = season.episodeUrls[j];
                
                const episodeDetails = await fetchEpisodeDetails(episodeUrl, season.seriesId, season.id);
                
                if (episodeDetails) {
                    const episodeFile = `Page${Math.floor(progress.totalEpisodes / ITEMS_PER_FILE) + 1}.json`;
                    fileManager.saveToFile(EPISODES_DIR, episodeFile, episodeDetails);
                    progress.incrementEpisodeIndex();
                    
                    if (j < 3) {
                        console.log(`       ✅ تم حفظ الحلقة ${episodeDetails.episodeNumber}`);
                    } else if (j === 3) {
                        console.log(`       ... وجاري حفظ باقي الحلقات`);
                    }
                }
                
                // تحديث التقدم
                progress.currentIndex = i;
                progress.saveProgress();
                
                await delay(800);
            }
        } else {
            console.log(`   ℹ️ لا توجد حلقات لهذا الموسم`);
        }
        
        // تحديث الفهرس
        progress.currentIndex = i + 1;
        progress.saveProgress();
        
        // تحقق إذا خلصنا وقت
        if (progress.pagesProcessedThisRun >= PAGES_PER_RUN) {
            console.log(`\n⏸️ توقف: اكتمل عدد الصفحات لهذا التشغيل.`);
            console.log(`📌 سنكمل من الموسم رقم ${i + 1} في المرة القادمة.`);
            return;
        }
        
        processed++;
        
        // نعتبر كل موسمين "صفحة" واحدة
        if (processed % 2 === 0) {
            progress.pagesProcessedThisRun++;
            progress.saveProgress();
            
            if (progress.pagesProcessedThisRun >= PAGES_PER_RUN) {
                console.log(`\n✅ اكتمل ${PAGES_PER_RUN} صفحات من الحلقات لهذا التشغيل`);
                return;
            }
        }
        
        await delay(1500);
    }
    
    // انتهينا من كل الحلقات
    console.log(`\n🎉🎉🎉 تهانينا! تم استخراج جميع البيانات كاملة!`);
    progress.markEpisodesComplete();
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("\n" + "⭐".repeat(30));
    console.log("🎬 نظام استخراج المسلسلات المتقدم");
    console.log("⭐".repeat(30));
    console.log(`⏱️  الوقت: ${new Date().toLocaleString()}`);
    
    const progress = new ProgressTracker();
    const fileManager = new FileManager();
    
    // عرض حالة التقدم
    console.log("\n📊 حالة النظام:");
    console.log(`   المرحلة الحالية: ${
        progress.currentPhase === 'series' ? '📺 استخراج مسلسلات' :
        progress.currentPhase === 'seasons' ? '🎞️ استخراج مواسم' :
        '🎥 استخراج حلقات'
    }`);
    console.log(`   الإحصائيات: ${progress.totalSeries} مسلسل, ${progress.totalSeasons} موسم, ${progress.totalEpisodes} حلقة`);
    
    if (progress.currentPhase === 'series') {
        console.log(`   الصفحة الحالية: ${progress.seriesCurrentPage}`);
        console.log(`   الصفحات المنجزة هذا التشغيل: ${progress.pagesProcessedThisRun}/${PAGES_PER_RUN}`);
    } else if (progress.currentPhase === 'seasons') {
        console.log(`   المسلسل الحالي: ${progress.currentIndex + 1}`);
    } else if (progress.currentPhase === 'episodes') {
        console.log(`   الموسم الحالي: ${progress.currentIndex + 1}`);
    }
    
    // تنفيذ المرحلة المناسبة
    if (progress.currentPhase === 'series' && !progress.allSeriesScraped) {
        await phaseExtractSeries(progress, fileManager);
        
        // تحقق إذا انتهينا من المسلسلات
        if (progress.allSeriesScraped) {
            progress.moveToSeasonsPhase();
        }
    }
    
    if (progress.currentPhase === 'seasons' && !progress.allSeasonsScraped) {
        await phaseExtractSeasons(progress, fileManager);
    }
    
    if (progress.currentPhase === 'episodes' && !progress.allEpisodesScraped) {
        await phaseExtractEpisodes(progress, fileManager);
    }
    
    // تقرير النهاية
    console.log("\n" + "=".repeat(60));
    console.log("📋 تقرير نهاية التشغيل:");
    console.log(`   المرحلة: ${progress.currentPhase}`);
    console.log(`   المسلسلات: ${progress.totalSeries}`);
    console.log(`   المواسم: ${progress.totalSeasons}`);
    console.log(`   الحلقات: ${progress.totalEpisodes}`);
    
    if (progress.allEpisodesScraped) {
        console.log("\n🎉🎉🎉 اكتمل استخراج كل شيء!");
    } else {
        console.log(`\n🔄 سيستكمل العمل في المرة القادمة من حيث توقف.`);
    }
    console.log("=".repeat(60));
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    console.error(error.stack);
    
    fs.writeFileSync("scraper_error.json", JSON.stringify({
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    }, null, 2));
    
    process.exit(1);
});
