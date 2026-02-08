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
    series: 500,
    seasons: 500,
    episodes: 5000
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

// ==================== استخراج الصفحة الرئيسية ====================
async function fetchHomePageSeries() {
    console.log("\n🏠 ===== جلب المسلسلات من الصفحة الرئيسية =====");
    
    const url = "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
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
                    fromHomePage: true
                });
                
                console.log(`   [${i + 1}] ${title.substring(0, 40)}...`);
            }
        }
        
        console.log(`✅ تم استخراج ${seriesList.length} مسلسل من الصفحة الرئيسية`);
        return seriesList;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج الصفحة الرئيسية:`, error.message);
        return [];
    }
}

// ==================== حفظ ملف Home.json ====================
function saveHomeSeries(seriesList) {
    console.log(`\n💾 حفظ ${seriesList.length} مسلسل في Home.json`);
    
    const fileContent = {
        info: {
            type: 'home_series',
            fileName: 'Home.json',
            totalItems: seriesList.length,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        },
        data: seriesList
    };
    
    // الكتابة المباشرة (تحديث الملف)
    fs.writeFileSync(HOME_SERIES_FILE, JSON.stringify(fileContent, null, 2));
    
    console.log(`✅ تم تحديث Home.json (${seriesList.length} مسلسل)`);
    return fileContent;
}

// ==================== فحص إذا كان المسلسل موجود في قاعدة البيانات ====================
function isSeriesInDatabase(seriesId) {
    try {
        // البحث في جميع ملفات المسلسلات
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

// ==================== استخراج ID المسلسل من الرابط ====================
async function extractSeriesIdFromUrl(seriesUrl) {
    try {
        const html = await fetchPage(seriesUrl);
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesUrl;
        
        return extractIdFromShortLink(shortLink);
    } catch (error) {
        console.log(`❌ خطأ في استخراج ID: ${error.message}`);
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
        
        // استخراج الرابط المختصر (ID)
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seriesData.url;
        const seriesId = extractIdFromShortLink(shortLink);
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seriesData.title);
        const image = doc.querySelector(".image img")?.src;
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

// ==================== حفظ ملف current_page.json ====================
function saveCurrentPageFile(directory, pageNumber) {
    const currentPageFile = path.join(directory, "current_page.json");
    const currentPageData = {
        currentPage: pageNumber,
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(currentPageFile, JSON.stringify(currentPageData, null, 2));
}

// ==================== استخراج المسلسل كاملاً مع مواسمه وحلقاته ====================
async function extractFullSeriesWithSeasonsEpisodes(seriesDetails, progress) {
    console.log(`\n🎬 استخراج كامل للمسلسل: ${seriesDetails.title}`);
    
    const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url);
    
    if (seasons.length === 0) {
        console.log(`   ℹ️  لا توجد مواسم لهذا المسلسل`);
        return;
    }
    
    console.log(`   📅 وجدت ${seasons.length} موسم`);
    
    for (let i = 0; i < seasons.length; i++) {
        const seasonData = seasons[i];
        
        console.log(`\n📊 معالجة الموسم ${i + 1}/${seasons.length}`);
        
        const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
        
        if (!seasonDetails) {
            console.log(`   ⚠️ تخطي الموسم: فشل الاستخراج`);
            continue;
        }
        
        // حفظ الموسم
        saveSeason(seasonDetails, progress);
        
        // استخراج حلقات الموسم
        console.log(`   📺 جاري استخراج حلقات الموسم...`);
        const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
        
        if (episodes.length === 0) {
            console.log(`   ℹ️  لا توجد حلقات لهذا الموسم`);
            continue;
        }
        
        console.log(`   ✅ وجدت ${episodes.length} حلقة`);
        
        // معالجة كل حلقة
        for (let j = 0; j < episodes.length; j++) {
            const episodeData = episodes[j];
            
            console.log(`   🎥 استخراج الحلقة ${j + 1}/${episodes.length}`);
            
            const episodeDetails = await fetchEpisodeDetails(
                episodeData, 
                seriesDetails.id, 
                seasonDetails.id
            );
            
            if (episodeDetails) {
                // حفظ الحلقة
                saveEpisode(episodeDetails, progress);
            }
            
            // تأخير بين الحلقات
            if (j < episodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // تأخير بين المواسم
        if (i < seasons.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// ==================== فحص وتحديث المسلسل الموجود ====================
async function checkAndUpdateExistingSeries(seriesId, seriesUrl, progress) {
    console.log(`   🔄 فحص التحديثات للمسلسل...`);
    
    try {
        // استخراج المواسم الحالية للمسلسل
        const currentSeasons = await extractSeasonsFromSeriesPage(seriesUrl);
        
        if (currentSeasons.length === 0) {
            console.log(`   ℹ️  لا توجد مواسم حالية`);
            return;
        }
        
        // TODO: فحص إذا في مواسم جديدة وإضافتها
        // TODO: فحص إذا في حلقات جديدة للمواسم الموجودة
        
        console.log(`   ℹ️  سيتم تنفيذ آلية الفحص في التحديثات القادمة`);
        
    } catch (error) {
        console.log(`   ❌ خطأ في فحص التحديثات: ${error.message}`);
    }
}

// ==================== وضع مراقبة الصفحة الرئيسية (Home Mode) ====================
async function monitorHomePage(progress) {
    console.log("\n🏠 ===== بدء مراقبة الصفحة الرئيسية =====");
    
    // استخراج المسلسلات من الصفحة الرئيسية
    const homeSeries = await fetchHomePageSeries();
    
    if (homeSeries.length === 0) {
        console.log("📭 لا توجد مسلسلات في الصفحة الرئيسية");
        return;
    }
    
    // حفظ المسلسلات في Home.json (يتجدد كل تشغيل)
    saveHomeSeries(homeSeries);
    
    let newSeriesExtracted = 0;
    let existingSeriesChecked = 0;
    
    // فحص كل مسلسل
    for (let i = 0; i < homeSeries.length; i++) {
        const seriesData = homeSeries[i];
        
        console.log(`\n📊 معالجة المسلسل ${i + 1}/${homeSeries.length}`);
        console.log(`🎬 ${seriesData.title.substring(0, 40)}...`);
        
        // استخراج ID المسلسل
        const seriesId = await extractSeriesIdFromUrl(seriesData.url);
        
        if (!seriesId) {
            console.log(`   ⚠️ تخطي: لا يمكن استخراج ID`);
            continue;
        }
        
        // فحص إذا كان المسلسل موجود في قاعدة البيانات
        const isSeriesExists = isSeriesInDatabase(seriesId);
        
        if (!isSeriesExists) {
            console.log(`   🆕 مسلسل جديد! جاري استخراجه...`);
            
            // استخراج بيانات المسلسل الكاملة
            const seriesDetails = await fetchSeriesDetails(seriesData);
            
            if (seriesDetails) {
                // حفظ المسلسل في الملفات الرئيسية
                saveSeries(seriesDetails, progress);
                newSeriesExtracted++;
                
                // استخراج مواسمه وحلقاته كاملة
                await extractFullSeriesWithSeasonsEpisodes(seriesDetails, progress);
            }
        } else {
            console.log(`   ✅ المسلسل موجود، جاري فحص التحديثات...`);
            existingSeriesChecked++;
            
            // فحص وتحديث المسلسل الموجود
            await checkAndUpdateExistingSeries(seriesId, seriesData.url, progress);
        }
        
        // تأخير بين المسلسلات
        if (i < homeSeries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log(`\n📊 نتائج المراقبة:`);
    console.log(`   🎬 مسلسلات جديدة تم استخراجها: ${newSeriesExtracted}`);
    console.log(`   🔍 مسلسلات موجودة تم فحصها: ${existingSeriesChecked}`);
    
    // تحديث تاريخ آخر مراقبة
    progress.lastHomeUpdate = new Date().toISOString();
    progress.saveProgress();
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

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - توب سينما");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const progress = new ProgressTracker();
    
    console.log(`📊 حالة النظام:`);
    console.log(`   🎯 الوضع الحالي: ${progress.mode === 'scrape_series' ? 'استخراج المسلسلات' : 'مراقبة الصفحة الرئيسية'}`);
    
    if (progress.mode === 'scrape_series') {
        console.log(`   📄 الصفحة الحالية: ${progress.seriesPage}`);
        console.log(`   📁 ملف المسلسلات: ${progress.currentSeriesFile}`);
        console.log(`   📊 المسلسلات في الملف: ${progress.seriesInCurrentFile}/${ITEMS_PER_FILE.series}`);
        
        if (progress.allPagesScraped) {
            console.log(`\n🏁 تم استخراج جميع صفحات المسلسلات!`);
            console.log(`🔄 التبديل لوضع مراقبة الصفحة الرئيسية...`);
            progress.switchToHomeMode();
        } else {
            progress.resetForNewRun();
            await scrapeSeriesMode(progress);
        }
    }
    
    if (progress.mode === 'monitor_home') {
        console.log(`   📅 آخر مراقبة: ${progress.lastHomeUpdate ? new Date(progress.lastHomeUpdate).toLocaleString() : 'لم تتم من قبل'}`);
        console.log(`\n🔍 بدء مراقبة الصفحة الرئيسية...`);
        await monitorHomePage(progress);
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
            episodesInFile: progress.episodesInCurrentFile
        },
        nextRun: {
            mode: progress.mode,
            startPage: progress.mode === 'scrape_series' ? progress.seriesPage : 'home_monitoring'
        }
    };
    
    fs.writeFileSync("scraper_report.json", JSON.stringify(finalReport, null, 2));
    
    console.log(`📄 تم حفظ التقرير في: scraper_report.json`);
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
