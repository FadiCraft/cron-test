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

// ==================== نظام التقدم المحسن جداً ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
    }
    
    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                
                // معلومات الصفحات
                this.currentPage = data.currentPage || 1;
                this.pagesDoneThisRun = data.pagesDoneThisRun || 0;
                
                // معلومات المسلسل الحالي
                this.currentSeriesIndex = data.currentSeriesIndex || 0; // اندكس المسلسل في الصفحة
                this.currentSeriesId = data.currentSeriesId || null;
                
                // معلومات الموسم الحالي
                this.currentSeasonIndex = data.currentSeasonIndex || 0; // اندكس الموسم
                this.currentSeasonId = data.currentSeasonId || null;
                
                // معلومات الحلقة الحالية
                this.currentEpisodeIndex = data.currentEpisodeIndex || 0; // اندكس الحلقة
                
                // حالة المسلسل الحالي
                this.seriesExtracted = data.seriesExtracted || false;
                this.seasonsExtracted = data.seasonsExtracted || false;
                this.episodesExtracted = data.episodesExtracted || false;
                
                // معلومات الملفات
                this.seriesFileNumber = data.seriesFileNumber || 1;
                this.seriesInCurrentFile = data.seriesInCurrentFile || 0;
                this.seasonFileNumber = data.seasonFileNumber || 1;
                this.seasonsInCurrentFile = data.seasonsInCurrentFile || 0;
                this.episodeFileNumber = data.episodeFileNumber || 1;
                this.episodesInCurrentFile = data.episodesInCurrentFile || 0;
                
                // إحصائيات
                this.totalSeries = data.totalSeries || 0;
                this.totalSeasons = data.totalSeasons || 0;
                this.totalEpisodes = data.totalEpisodes || 0;
                
                // هل انتهينا؟
                this.allPagesScraped = data.allPagesScraped || false;
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
        this.currentPage = 1;
        this.pagesDoneThisRun = 0;
        
        this.currentSeriesIndex = 0;
        this.currentSeriesId = null;
        this.currentSeasonIndex = 0;
        this.currentSeasonId = null;
        this.currentEpisodeIndex = 0;
        
        this.seriesExtracted = false;
        this.seasonsExtracted = false;
        this.episodesExtracted = false;
        
        this.seriesFileNumber = 1;
        this.seriesInCurrentFile = 0;
        this.seasonFileNumber = 1;
        this.seasonsInCurrentFile = 0;
        this.episodeFileNumber = 1;
        this.episodesInCurrentFile = 0;
        
        this.totalSeries = 0;
        this.totalSeasons = 0;
        this.totalEpisodes = 0;
        
        this.allPagesScraped = false;
        this.shouldStop = false;
        
        this.saveProgress();
    }
    
    saveProgress() {
        const progressData = {
            currentPage: this.currentPage,
            pagesDoneThisRun: this.pagesDoneThisRun,
            
            currentSeriesIndex: this.currentSeriesIndex,
            currentSeriesId: this.currentSeriesId,
            currentSeasonIndex: this.currentSeasonIndex,
            currentSeasonId: this.currentSeasonId,
            currentEpisodeIndex: this.currentEpisodeIndex,
            
            seriesExtracted: this.seriesExtracted,
            seasonsExtracted: this.seasonsExtracted,
            episodesExtracted: this.episodesExtracted,
            
            seriesFileNumber: this.seriesFileNumber,
            seriesInCurrentFile: this.seriesInCurrentFile,
            seasonFileNumber: this.seasonFileNumber,
            seasonsInCurrentFile: this.seasonsInCurrentFile,
            episodeFileNumber: this.episodeFileNumber,
            episodesInCurrentFile: this.episodesInCurrentFile,
            
            totalSeries: this.totalSeries,
            totalSeasons: this.totalSeasons,
            totalEpisodes: this.totalEpisodes,
            
            allPagesScraped: this.allPagesScraped,
            shouldStop: this.shouldStop,
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }
    
    // بدء صفحة جديدة
    startNewPage(pageNum) {
        this.currentPage = pageNum;
        this.currentSeriesIndex = 0;
        this.currentSeriesId = null;
        this.currentSeasonIndex = 0;
        this.currentSeasonId = null;
        this.currentEpisodeIndex = 0;
        this.seriesExtracted = false;
        this.seasonsExtracted = false;
        this.episodesExtracted = false;
        this.saveProgress();
    }
    
    // بدء مسلسل جديد
    startNewSeries(seriesId) {
        this.currentSeriesId = seriesId;
        this.currentSeasonIndex = 0;
        this.currentEpisodeIndex = 0;
        this.seasonsExtracted = false;
        this.episodesExtracted = false;
        this.saveProgress();
    }
    
    // اكتمل المسلسل
    completeSeries() {
        this.seriesExtracted = true;
        this.currentSeriesIndex++;
        this.saveProgress();
    }
    
    // بدء موسم جديد
    startNewSeason(seasonId) {
        this.currentSeasonId = seasonId;
        this.currentEpisodeIndex = 0;
        this.episodesExtracted = false;
        this.saveProgress();
    }
    
    // اكتمل الموسم
    completeSeason() {
        this.currentSeasonIndex++;
        this.saveProgress();
    }
    
    // اكتملت الحلقة
    completeEpisode() {
        this.currentEpisodeIndex++;
        this.totalEpisodes++;
        this.episodesInCurrentFile++;
        
        if (this.episodesInCurrentFile >= ITEMS_PER_FILE) {
            this.episodeFileNumber++;
            this.episodesInCurrentFile = 0;
            console.log(`\n📁 إنشاء ملف حلقات جديد: Page${this.episodeFileNumber}.json`);
        }
        
        this.saveProgress();
    }
    
    // إضافة مسلسل
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
    
    // إضافة موسم
    addSeason() {
        this.totalSeasons++;
        this.seasonsInCurrentFile++;
        
        if (this.seasonsInCurrentFile >= ITEMS_PER_FILE) {
            this.seasonFileNumber++;
            this.seasonsInCurrentFile = 0;
            console.log(`\n📁 إنشاء ملف مواسم جديد: Page${this.seasonFileNumber}.json`);
        }
        
        this.saveProgress();
    }
    
    // اكتملت الصفحة
    completePage() {
        this.pagesDoneThisRun++;
        this.currentPage++;
        
        if (this.pagesDoneThisRun >= PAGES_PER_RUN) {
            console.log(`\n✅ اكتمل استخراج ${PAGES_PER_RUN} صفحات لهذا التشغيل`);
            this.shouldStop = true;
        }
        
        this.saveProgress();
    }
    
    // علامة انتهاء كل الصفحات
    markAllPagesComplete() {
        this.allPagesScraped = true;
        this.saveProgress();
    }
    
    // إعادة تعيين للتشغيل الجديد
    resetForNewRun() {
        this.pagesDoneThisRun = 0;
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
}

// ==================== استخراج قائمة المسلسلات من الصفحة ====================
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
                    position: seriesList.length + 1
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
    console.log(`\n   📊 [${seriesData.position}] استخراج مسلسل: ${seriesData.title.substring(0, 40)}...`);
    
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
        
        return {
            id: extractIdFromUrl(seriesData.url),
            title: title,
            url: seriesData.url,
            image: image,
            imdbRating: imdbRating || "غير متوفر",
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
async function extractSeasonsFromSeriesPage(seriesUrl) {
    console.log(`     📅 جاري استخراج المواسم...`);
    
    try {
        const html = await fetchWithRetry(seriesUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seasons = [];
        
        // محاولة استخراج المواسم بطرق مختلفة
        const seasonElements = doc.querySelectorAll('.Small--Box.Season a, a[href*="season"], a[href*="موسم"]');
        const seenUrls = new Set();
        
        seasonElements.forEach(link => {
            if (link.href && link.href.includes('topcinema.rip') && !seenUrls.has(link.href)) {
                seenUrls.add(link.href);
                
                let seasonNumber = seasons.length + 1;
                const title = cleanText(link.textContent);
                const numMatch = title.match(/\d+/) || link.href.match(/season[\/-](\d+)/i);
                if (numMatch) seasonNumber = parseInt(numMatch[1] || numMatch[0]);
                
                seasons.push({
                    url: link.href,
                    title: title || `الموسم ${seasonNumber}`,
                    seasonNumber: seasonNumber,
                    image: link.querySelector('img')?.src
                });
            }
        });
        
        // ترتيب المواسم حسب الرقم
        seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
        
        console.log(`     ✅ وجدت ${seasons.length} موسم`);
        return seasons;
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الموسم ====================
async function fetchSeasonDetails(seasonData, seriesId) {
    console.log(`       🎞️ الموسم ${seasonData.seasonNumber}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchWithRetry(seasonData.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seasonData.title);
        const image = doc.querySelector(".image img")?.src || seasonData.image;
        
        return {
            id: extractIdFromUrl(seasonData.url),
            seriesId: seriesId,
            seasonNumber: seasonData.seasonNumber,
            title: title,
            url: seasonData.url,
            image: image,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج الحلقات من صفحة الموسم ====================
async function extractEpisodesFromSeasonPage(seasonUrl) {
    console.log(`         📺 جاري استخراج الحلقات...`);
    
    try {
        const html = await fetchWithRetry(seasonUrl);
        if (!html) return [];
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        const seenUrls = new Set();
        
        // البحث عن روابط الحلقات
        const allLinks = doc.querySelectorAll('a[href*="topcinema.rip"]');
        
        allLinks.forEach(link => {
            const text = link.textContent + ' ' + (link.title || '');
            if ((text.includes('حلقة') || link.href.includes('حلقة')) && !seenUrls.has(link.href)) {
                seenUrls.add(link.href);
                
                let episodeNumber = episodes.length + 1;
                const numMatch = text.match(/\d+/) || link.href.match(/حلقة[\/-](\d+)/i);
                if (numMatch) episodeNumber = parseInt(numMatch[1] || numMatch[0]);
                
                episodes.push({
                    url: link.href,
                    title: cleanText(link.textContent || link.title || `الحلقة ${episodeNumber}`),
                    episodeNumber: episodeNumber
                });
            }
        });
        
        // ترتيب الحلقات حسب الرقم
        episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        
        console.log(`         ✅ وجدت ${episodes.length} حلقة`);
        return episodes;
        
    } catch (error) {
        console.log(`         ❌ خطأ: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الحلقة ====================
async function fetchEpisodeDetails(episodeData, seriesId, seasonId) {
    if (episodeData.episodeNumber % 10 === 0 || episodeData.episodeNumber === 1) {
        console.log(`           🎥 الحلقة ${episodeData.episodeNumber}`);
    }
    
    try {
        const html = await fetchWithRetry(episodeData.url);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
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
            id: extractIdFromUrl(episodeData.url),
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episodeData.episodeNumber,
            title: episodeData.title,
            url: episodeData.url,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        return null;
    }
}

// ==================== المعالج الرئيسي ====================
async function processPageCompletely(progress, fileManager, pageNum) {
    console.log("\n" + "=".repeat(60));
    console.log(`📺 معالجة الصفحة ${pageNum} كاملة`);
    console.log("=".repeat(60));
    
    // جلب قائمة المسلسلات في الصفحة
    const seriesList = await fetchSeriesListFromPage(pageNum);
    
    if (!seriesList || seriesList.length === 0) {
        console.log(`\n🏁 لا توجد مسلسلات في الصفحة ${pageNum}`);
        progress.markAllPagesComplete();
        return false;
    }
    
    console.log(`\n📊 الصفحة ${pageNum} تحتوي على ${seriesList.length} مسلسل`);
    
    // البدء من حيث توقفنا في هذه الصفحة
    const startIndex = progress.currentSeriesIndex;
    console.log(`🔄 الاستمرار من المسلسل رقم ${startIndex + 1}`);
    
    for (let i = startIndex; i < seriesList.length; i++) {
        const seriesData = seriesList[i];
        seriesData.position = i + 1;
        
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🎬 [${i + 1}/${seriesList.length}] ${seriesData.title}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        // 1. استخراج المسلسل
        if (!progress.seriesExtracted) {
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (seriesDetails) {
                const seriesFile = `Page${progress.seriesFileNumber}.json`;
                fileManager.saveToFile(TV_SERIES_DIR, seriesFile, seriesDetails);
                progress.addSeries();
                progress.startNewSeries(seriesDetails.id);
                console.log(`   ✅ تم حفظ المسلسل في ${seriesFile}`);
                progress.seriesExtracted = true;
                progress.saveProgress();
            } else {
                console.log(`   ⚠️ فشل استخراج المسلسل، الانتقال للتالي`);
                progress.completeSeries();
                continue;
            }
        }
        
        // 2. استخراج المواسم
        if (progress.seriesExtracted && !progress.seasonsExtracted) {
            const seasons = await extractSeasonsFromSeriesPage(seriesData.url);
            
            if (seasons.length > 0) {
                console.log(`   📊 استخراج ${seasons.length} موسم...`);
                
                const startSeasonIndex = progress.currentSeasonIndex;
                
                for (let j = startSeasonIndex; j < seasons.length; j++) {
                    const seasonData = seasons[j];
                    
                    const seasonDetails = await fetchSeasonDetails(seasonData, progress.currentSeriesId);
                    
                    if (seasonDetails) {
                        const seasonFile = `Page${progress.seasonFileNumber}.json`;
                        fileManager.saveToFile(SEASONS_DIR, seasonFile, seasonDetails);
                        progress.addSeason();
                        progress.startNewSeason(seasonDetails.id);
                        console.log(`       ✅ تم حفظ الموسم ${seasonData.seasonNumber}`);
                        
                        // 3. استخراج حلقات هذا الموسم
                        if (!progress.episodesExtracted) {
                            const episodes = await extractEpisodesFromSeasonPage(seasonData.url);
                            
                            if (episodes.length > 0) {
                                console.log(`         📊 استخراج ${episodes.length} حلقة...`);
                                
                                const startEpisodeIndex = progress.currentEpisodeIndex;
                                
                                for (let k = startEpisodeIndex; k < episodes.length; k++) {
                                    const episodeData = episodes[k];
                                    
                                    const episodeDetails = await fetchEpisodeDetails(
                                        episodeData, 
                                        progress.currentSeriesId, 
                                        progress.currentSeasonId
                                    );
                                    
                                    if (episodeDetails) {
                                        const episodeFile = `Page${progress.episodeFileNumber}.json`;
                                        fileManager.saveToFile(EPISODES_DIR, episodeFile, episodeDetails);
                                        progress.completeEpisode();
                                    }
                                    
                                    // تأخير بين الحلقات
                                    await delay(500);
                                }
                            }
                            
                            progress.episodesExtracted = true;
                        }
                        
                        // إعادة تعيين حالة الحلقات للموسم التالي
                        progress.episodesExtracted = false;
                        progress.currentEpisodeIndex = 0;
                        progress.saveProgress();
                    }
                    
                    // تأخير بين المواسم
                    await delay(1000);
                }
            }
            
            progress.seasonsExtracted = true;
        }
        
        // انتهينا من هذا المسلسل بالكامل
        progress.completeSeries();
        progress.seriesExtracted = false;
        progress.seasonsExtracted = false;
        progress.episodesExtracted = false;
        progress.currentSeasonIndex = 0;
        progress.currentEpisodeIndex = 0;
        progress.saveProgress();
        
        // تأخير بين المسلسلات
        if (i < seriesList.length - 1) {
            console.log(`\n⏳ انتظار 2 ثانية قبل المسلسل التالي...`);
            await delay(2000);
        }
        
        // تحقق إذا خلص وقت التشغيل
        if (progress.shouldStop) {
            console.log(`\n⏸️ توقف: اكتمل عدد الصفحات لهذا التشغيل.`);
            console.log(`📌 سنكمل من المسلسل رقم ${i + 2} في الصفحة ${pageNum} المرة القادمة.`);
            return true; // ما زال في نفس الصفحة
        }
    }
    
    // انتهينا من كل مسلسلات الصفحة
    console.log(`\n✅ اكتملت الصفحة ${pageNum} بالكامل!`);
    return true;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("\n" + "⭐".repeat(30));
    console.log("🎬 نظام استخراج المسلسلات - نسخة الصفحات الكاملة");
    console.log("⭐".repeat(30));
    console.log(`⏱️  الوقت: ${new Date().toLocaleString()}`);
    
    const progress = new ProgressTracker();
    const fileManager = new FileManager();
    
    // عرض حالة التقدم
    console.log("\n📊 حالة النظام:");
    console.log(`   الصفحة الحالية: ${progress.currentPage}`);
    console.log(`   المسلسل الحالي: ${progress.currentSeriesIndex + 1}`);
    console.log(`   الموسم الحالي: ${progress.currentSeasonIndex + 1}`);
    console.log(`   الحلقة الحالية: ${progress.currentEpisodeIndex + 1}`);
    console.log(`   الصفحات المنجزة هذا التشغيل: ${progress.pagesDoneThisRun}/${PAGES_PER_RUN}`);
    console.log(`   الإحصائيات: ${progress.totalSeries} مسلسل, ${progress.totalSeasons} موسم, ${progress.totalEpisodes} حلقة`);
    
    // إعادة تعيين عداد الصفحات إذا كان بداية تشغيل جديد
    if (progress.pagesDoneThisRun === 0) {
        progress.resetForNewRun();
    }
    
    // معالجة الصفحات
    let currentPage = progress.currentPage;
    let pageSuccess = true;
    
    while (!progress.shouldStop && !progress.allPagesScraped && pageSuccess) {
        pageSuccess = await processPageCompletely(progress, fileManager, currentPage);
        
        if (pageSuccess && !progress.shouldStop) {
            // انتقل للصفحة التالية
            progress.completePage();
            currentPage = progress.currentPage;
            
            if (!progress.shouldStop) {
                console.log(`\n⏳ انتظار 5 ثواني قبل الصفحة ${currentPage}...`);
                await delay(5000);
            }
        }
    }
    
    // تقرير النهاية
    console.log("\n" + "=".repeat(60));
    console.log("📋 تقرير نهاية التشغيل:");
    console.log(`   الصفحة الحالية: ${progress.currentPage}`);
    console.log(`   المسلسلات: ${progress.totalSeries}`);
    console.log(`   المواسم: ${progress.totalSeasons}`);
    console.log(`   الحلقات: ${progress.totalEpisodes}`);
    
    if (progress.allPagesScraped) {
        console.log("\n🎉 تهانينا! تم استخراج كل الصفحات!");
    } else {
        console.log(`\n🔄 سيستكمل العمل في المرة القادمة من:`);
        console.log(`   📄 الصفحة: ${progress.currentPage}`);
        console.log(`   🎬 المسلسل رقم: ${progress.currentSeriesIndex + 1}`);
        console.log(`   🎞️ الموسم رقم: ${progress.currentSeasonIndex + 1}`);
        console.log(`   🎥 الحلقة رقم: ${progress.currentEpisodeIndex + 1}`);
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
