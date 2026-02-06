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
const TOP_MONTHLY_SERIES_DIR = path.join(AG_SERIES_DIR, "Top_Monthly_Series"); // الجديد
const PROGRESS_FILE = path.join(__dirname, "series_progress.json");

// إنشاء المجلدات إذا لم تكن موجودة
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, LATEST_EPISODES_DIR, TOP_MONTHLY_SERIES_DIR].forEach(dir => {
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
    topMonthlySeries: 100 // الجديد
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
                
                this.topMonthlySeriesFileNumber = data.topMonthlySeriesFileNumber || 1; // الجديد
                this.topMonthlySeriesInCurrentFile = data.topMonthlySeriesInCurrentFile || 0; // الجديد
                
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
                this.currentTopMonthlySeriesFile = data.currentTopMonthlySeriesFile || "TopMonthly_Page1.json"; // الجديد
                
                this.lastMonitoringDate = data.lastMonitoringDate || null;
                this.lastTopMonthlyScrapeDate = data.lastTopMonthlyScrapeDate || null; // الجديد
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
        
        this.topMonthlySeriesFileNumber = 1; // الجديد
        this.topMonthlySeriesInCurrentFile = 0; // الجديد
        
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
        this.currentTopMonthlySeriesFile = "TopMonthly_Page1.json"; // الجديد
        
        this.lastMonitoringDate = null;
        this.lastTopMonthlyScrapeDate = null; // الجديد
        
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
            
            topMonthlySeriesFileNumber: this.topMonthlySeriesFileNumber, // الجديد
            topMonthlySeriesInCurrentFile: this.topMonthlySeriesInCurrentFile, // الجديد
            
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
            currentTopMonthlySeriesFile: this.currentTopMonthlySeriesFile, // الجديد
            
            lastMonitoringDate: this.lastMonitoringDate,
            lastTopMonthlyScrapeDate: this.lastTopMonthlyScrapeDate, // الجديد
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
    
    addTopMonthlySeriesToFile() { // الجديد
        this.topMonthlySeriesInCurrentFile++;
        if (this.topMonthlySeriesInCurrentFile >= ITEMS_PER_FILE.topMonthlySeries) {
            this.topMonthlySeriesFileNumber++;
            this.topMonthlySeriesInCurrentFile = 0;
            this.currentTopMonthlySeriesFile = `TopMonthly_Page${this.topMonthlySeriesFileNumber}.json`;
            console.log(`\n📁 إنشاء ملف أفضل مسلسلات جديد: ${this.currentTopMonthlySeriesFile}`);
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
        
        // البحث عن القسم بناءً على الهيكل المطلوب
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
        
        // استخراج المسلسلات
        const seriesBoxes = topSeriesSection.querySelectorAll('.Small--Box');
        console.log(`✅ وجدت ${seriesBoxes.length} مسلسل في القسم`);
        
        for (let i = 0; i < seriesBoxes.length; i++) {
            const box = seriesBoxes[i];
            const link = box.querySelector('a');
            
            if (link && link.href && link.href.includes('/series/')) {
                // استخراج العنوان
                const titleElement = box.querySelector('.title') || link;
                const title = cleanText(titleElement.textContent);
                
                // استخراج الصورة
                const image = box.querySelector('img')?.src;
                
                // استخراج التصنيفات
                const categories = [];
                const categoryElements = box.querySelectorAll('.liList li:not(.imdbRating)');
                categoryElements.forEach(el => {
                    const catText = cleanText(el.textContent);
                    if (catText && !catText.includes('p') && !catText.includes('WEB-DL')) {
                        categories.push(catText);
                    }
                });
                
                // استخراج الجودة
                let quality = "غير محدد";
                const qualityMatch = box.textContent.match(/\d+p\s*(WEB-DL|HDTV|BluRay)?/i);
                if (qualityMatch) {
                    quality = qualityMatch[0];
                }
                
                // استخراج تقييم IMDB
                const imdbRatingElement = box.querySelector('.imdbRating');
                const imdbRating = imdbRatingElement ? 
                    cleanText(imdbRatingElement.textContent).replace('i', '').trim() : 
                    null;
                
                // استخراج ID من الرابط
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
async function extractSeasonsFromSeriesPage(seriesUrl) {
    console.log(`   📅 جاري استخراج المواسم من صفحة المسلسل...`);
    
    try {
        const html = await fetchPage(seriesUrl);
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
    }
}

// ==================== استخراج بيانات الموسم الكاملة ====================
async function fetchSeasonDetails(seasonData, seriesId) {
    console.log(`   🎞️  الموسم ${seasonData.seasonNumber || seasonData.position}: ${seasonData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(seasonData.url);
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
async function extractEpisodesFromSeasonPage(seasonUrl) {
    console.log(`     📺 جاري استخراج الحلقات من صفحة الموسم...`);
    
    try {
        const html = await fetchPage(seasonUrl);
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
                    
                    const episodeUrl = link.href;
                    
                    episodes.push({
                        url: episodeUrl,
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
    }
}

// ==================== استخراج بيانات الحلقة الكاملة ====================
async function fetchEpisodeDetails(episodeData, seriesId, seasonId) {
    console.log(`       🎥 الحلقة ${episodeData.episodeNumber}: ${episodeData.title.substring(0, 30)}...`);
    
    try {
        const html = await fetchPage(episodeData.url);
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
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
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

// ==================== استخراج سيرفرات تحميل الحلقة من صفحة التحميل ====================
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
        
        console.log(`       ✅ تم العثور على سيرفرات تحميل لـ ${Object.keys(servers).length} جودة`);
        return servers;
        
    } catch (error) {
        console.log(`       ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return {};
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

// ==================== حفظ المسلسل ====================
function saveSeries(seriesDetails, progress) {
    const saved = saveToFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails);
    console.log(`   💾 تم حفظ المسلسل في ${progress.currentSeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} مسلسل`);
    
    progress.addSeriesToFile();
    progress.currentSeriesId = seriesDetails.id;
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ الموسم ====================
function saveSeason(seasonDetails, progress) {
    const saved = saveToFile(SEASONS_DIR, progress.currentSeasonFile, seasonDetails);
    console.log(`     💾 تم حفظ الموسم في ${progress.currentSeasonFile}`);
    console.log(`       📊 الإجمالي في الملف: ${saved.info.totalItems} موسم`);
    
    progress.addSeasonToFile();
    progress.currentSeasonId = seasonDetails.id;
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ الحلقة ====================
function saveEpisode(episodeDetails, progress) {
    const saved = saveToFile(EPISODES_DIR, progress.currentEpisodeFile, episodeDetails);
    console.log(`       💾 تم حفظ الحلقة في ${progress.currentEpisodeFile}`);
    console.log(`         📊 الإجمالي في الملف: ${saved.info.totalItems} حلقة`);
    
    progress.addEpisodeToFile();
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ الحلقة الجديدة ====================
function saveLatestEpisode(episodeInfo, progress) {
    const saved = saveToFile(LATEST_EPISODES_DIR, progress.currentLatestEpisodesFile, episodeInfo);
    console.log(`   💾 تم حفظ الحلقة الجديدة في ${progress.currentLatestEpisodesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} حلقة جديدة`);
    
    progress.addLatestEpisodeToFile();
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ أفضل المسلسلات الشهرية ====================
function saveTopMonthlySeries(seriesData, progress) {
    const saved = saveToFile(TOP_MONTHLY_SERIES_DIR, progress.currentTopMonthlySeriesFile, seriesData);
    console.log(`   💾 تم حفظ المسلسل الشهري في ${progress.currentTopMonthlySeriesFile}`);
    console.log(`     📊 الإجمالي في الملف: ${saved.info.totalItems} مسلسل شهري`);
    
    progress.addTopMonthlySeriesToFile();
    progress.saveProgress();
    
    return saved;
}

// ==================== حفظ ملف current_page.json ====================
function saveCurrentPageFile(directory, pageNumber) {
    const currentPageFile = path.join(directory, "current_page.json");
    const currentPageData = {
        currentPage: pageNumber,
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(currentPageFile, JSON.stringify(currentPageData, null, 2));
}

// ==================== وضع مراقبة الحلقات الجديدة ====================
async function monitorLatestEpisodes(progress) {
    console.log("\n🔍 ===== بدء مراقبة الحلقات الجديدة =====");
    
    // استخراج آخر الحلقات من الصفحة الرئيسية
    const latestEpisodes = await fetchLatestEpisodes();
    
    // استخراج أفضل المسلسلات الشهرية
    const topMonthlySeries = await fetchTopMonthlySeries();
    
    if (topMonthlySeries.length > 0) {
        console.log("\n🏆 ===== حفظ أفضل المسلسلات الشهرية =====");
        for (const series of topMonthlySeries) {
            saveTopMonthlySeries(series, progress);
        }
        console.log(`✅ تم حفظ ${topMonthlySeries.length} مسلسل في أفضل المسلسلات الشهرية`);
        progress.lastTopMonthlyScrapeDate = new Date().toISOString();
        progress.saveProgress();
    }
    
    if (latestEpisodes.length === 0) {
        console.log("📭 لا توجد حلقات جديدة اليوم");
        return;
    }
    
    let newEpisodesProcessed = 0;
    let newSeriesExtracted = 0;
    
    for (let i = 0; i < latestEpisodes.length; i++) {
        const episode = latestEpisodes[i];
        
        console.log(`\n📊 معالجة الحلقة ${i + 1}/${latestEpisodes.length}`);
        console.log(`📺 ${episode.title.substring(0, 40)}...`);
        
        const seriesInfo = await extractSeriesInfoFromEpisode(episode.url);
        
        if (!seriesInfo) {
            console.log(`   ⚠️ تخطي الحلقة: لم يتم العثور على معلومات المسلسل`);
            continue;
        }
        
        const episodeInfo = {
            url: episode.url,
            title: episode.title,
            seriesId: seriesInfo.id,
            seriesTitle: seriesInfo.title,
            scrapedAt: new Date().toISOString()
        };
        
        saveLatestEpisode(episodeInfo, progress);
        newEpisodesProcessed++;
        
        const isSeriesExists = isSeriesInDatabase(seriesInfo.id);
        
        if (!isSeriesExists) {
            console.log(`   🆕 مسلسل جديد! جاري استخراجه كاملاً...`);
            
            const seriesDetails = await extractFullSeries(seriesInfo);
            
            if (seriesDetails) {
                const saved = saveToFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails);
                console.log(`   ✅ تم حفظ المسلسل الجديد في ${progress.currentSeriesFile}`);
                progress.addSeriesToFile();
                newSeriesExtracted++;
            }
        } else {
            console.log(`   ✅ المسلسل موجود بالفعل في قاعدة البيانات`);
        }
        
        if (i < latestEpisodes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log(`\n📊 نتائج المراقبة:`);
    console.log(`   📺 حلقات جديدة تمت معالجتها: ${newEpisodesProcessed}`);
    console.log(`   🎬 مسلسلات جديدة تم استخراجها: ${newSeriesExtracted}`);
    console.log(`   🏆 مسلسلات شهرية تم حفظها: ${topMonthlySeries.length}`);
    
    progress.lastMonitoringDate = new Date().toISOString();
    progress.saveProgress();
}

// ==================== الدالة الرئيسية المعدلة ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - توب سينما");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const progress = new ProgressTracker();
    
    console.log(`📊 حالة النظام:`);
    console.log(`   🎯 الوضع الحالي: ${progress.mode === 'scrape_series' ? 'استخراج المسلسلات' : 'مراقبة الحلقات الجديدة'}`);
    
    if (progress.mode === 'scrape_series') {
        console.log(`   📄 الصفحة الحالية: ${progress.seriesPage}`);
        console.log(`   📁 ملف المسلسلات: ${progress.currentSeriesFile}`);
        console.log(`   📊 المسلسلات في الملف: ${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series}`);
        
        if (progress.allPagesScraped) {
            console.log(`\n🏁 تم استخراج جميع صفحات المسلسلات!`);
            console.log(`🔄 التبديل لوضع مراقبة الحلقات الجديدة...`);
            progress.switchToMonitoringMode();
        } else {
            progress.resetForNewRun();
            await scrapeSeriesMode(progress);
        }
    }
    
    if (progress.mode === 'monitor_episodes') {
        console.log(`   📅 آخر مراقبة: ${progress.lastMonitoringDate ? new Date(progress.lastMonitoringDate).toLocaleString() : 'لم تتم من قبل'}`);
        console.log(`   🏆 آخر استخراج للمسلسلات الشهرية: ${progress.lastTopMonthlyScrapeDate ? new Date(progress.lastTopMonthlyScrapeDate).toLocaleString() : 'لم تتم من قبل'}`);
        console.log(`\n🔍 بدء مراقبة الحلقات الجديدة واستخراج أفضل المسلسلات...`);
        await monitorLatestEpisodes(progress);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(60));
    
    const finalReport = {
        timestamp: new Date().toISOString(),
        mode: progress.mode,
        stats: {
            seriesPage: progress.seriesPage,
            allPagesScraped: progress.allPagesScraped,
            seriesInFile: progress.seriesInCurrentFile,
            seasonsInFile: progress.seasonsInCurrentFile,
            episodesInFile: progress.episodesInCurrentFile,
            latestEpisodesInFile: progress.latestEpisodesInCurrentFile,
            topMonthlySeriesInFile: progress.topMonthlySeriesInCurrentFile
        },
        nextRun: {
            mode: progress.mode,
            startPage: progress.mode === 'scrape_series' ? progress.seriesPage : 'monitoring',
            seriesFile: progress.currentSeriesFile,
            seriesInFile: progress.seriesInCurrentFile
        }
    };
    
    fs.writeFileSync("scraper_report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`📄 تم حفظ التقرير في: scraper_report.json`);
    console.log("=".repeat(60));
}

// ==================== وضع استخراج المسلسلات ====================
async function scrapeSeriesMode(progress) {
    const startTime = Date.now();
    let totalSeriesExtracted = 0;
    let totalSeasonsExtracted = 0;
    let totalEpisodesExtracted = 0;
    
    while (!progress.shouldStop) {
        const pageNum = progress.seriesPage;
        console.log(`\n📺 ====== معالجة صفحة المسلسلات ${pageNum} ======`);
        
        const pageData = await fetchSeriesListFromPage(pageNum);
        
        if (!pageData || pageData.series.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            progress.markAllPagesScraped();
            break;
        }
        
        console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل`);
        
        for (let i = 0; i < pageData.series.length; i++) {
            const seriesData = pageData.series[i];
            
            console.log(`\n📊 التقدم في الصفحة: ${i + 1}/${pageData.series.length}`);
            console.log(`📊 المسلسلات في الملف: ${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series}`);
            
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (seriesDetails) {
                saveSeries(seriesDetails, progress);
                totalSeriesExtracted++;
                
                console.log(`   📅 جاري استخراج المواسم...`);
                const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url);
                
                if (seasons.length > 0) {
                    console.log(`   ✅ وجدت ${seasons.length} موسم للمسلسل`);
                    
                    for (let j = 0; j < seasons.length; j++) {
                        const seasonData = seasons[j];
                        
                        console.log(`\n📊 المواسم في الملف: ${progress.seasonsInCurrentFile}/${ITEMS_PER_FILE.seasons}`);
                        console.log(`📊 معالجة الموسم ${j + 1}/${seasons.length}`);
                        
                        const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
                        
                        if (seasonDetails) {
                            saveSeason(seasonDetails, progress);
                            totalSeasonsExtracted++;
                            
                            console.log(`     📺 جاري استخراج الحلقات للموسم...`);
                            const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
                            
                            if (episodes.length > 0) {
                                console.log(`     ✅ وجدت ${episodes.length} حلقة للموسم`);
                                
                                for (let k = 0; k < episodes.length; k++) {
                                    const episodeData = episodes[k];
                                    
                                    console.log(`\n📊 الحلقات في الملف: ${progress.episodesInCurrentFile}/${ITEMS_PER_FILE.episodes}`);
                                    console.log(`📊 معالجة الحلقة ${k + 1}/${episodes.length}`);
                                    
                                    const episodeDetails = await fetchEpisodeDetails(
                                        episodeData, 
                                        seriesDetails.id, 
                                        seasonDetails.id
                                    );
                                    
                                    if (episodeDetails) {
                                        saveEpisode(episodeDetails, progress);
                                        totalEpisodesExtracted++;
                                    }
                                    
                                    if (k < episodes.length - 1) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }
                                }
                            }
                        }
                        
                        if (j < seasons.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
            }
            
            if (i < pageData.series.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        saveCurrentPageFile(TV_SERIES_DIR, pageNum);
        
        console.log(`\n✅ اكتملت صفحة المسلسلات ${pageNum}:`);
        console.log(`   🎬 مسلسلات جديدة: ${totalSeriesExtracted}`);
        console.log(`   📊 إجمالي المسلسلات: ${totalSeriesExtracted}`);
        console.log(`   📊 إجمالي المواسم: ${totalSeasonsExtracted}`);
        console.log(`   📊 إجمالي الحلقات: ${totalEpisodesExtracted}`);
        
        progress.addPageProcessed();
        
        if (!progress.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    const executionTime = Date.now() - startTime;
    
    console.log("\n📊 إحصائيات هذا التشغيل:");
    console.log(`   🎬 مسلسلات جديدة: ${totalSeriesExtracted}`);
    console.log(`   📅 مواسم جديدة: ${totalSeasonsExtracted}`);
    console.log(`   📺 حلقات جديدة: ${totalEpisodesExtracted}`);
    console.log(`   📄 صفحات معالجة: ${progress.pagesProcessedThisRun}`);
    console.log(`   ⏱️ وقت التنفيذ: ${(executionTime / 1000).toFixed(1)} ثانية`);
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
