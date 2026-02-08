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

// ملفات الفهرس
const INDEX_FILES = {
    series: path.join(TV_SERIES_DIR, "index.json"),
    seasons: path.join(SEASONS_DIR, "index.json"),
    episodes: path.join(EPISODES_DIR, "index.json")
};

// ملفات Home
const HOME_FILES = {
    series: path.join(TV_SERIES_DIR, "Home.json"),
    episodes: path.join(EPISODES_DIR, "Home.json")
};

const PROGRESS_FILE = path.join(__dirname, "progress.json");

// إنشاء المجلدات
[TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ==================== إعدادات ====================
const PAGES_PER_RUN = 3;           // 3 صفحات كل مرة
const ITEMS_PER_FILE = 250;        // 250 عنصر في كل ملف
const LATEST_EPISODES_COUNT = 10;  // 10 أحدث حلقات

// ==================== نظام الفهرس البسيط ====================
class SimpleIndex {
    constructor(type) {
        this.type = type;
        this.indexFile = INDEX_FILES[type];
        this.load();
    }
    
    load() {
        try {
            if (fs.existsSync(this.indexFile)) {
                const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
                this.items = data.items || {};
                this.lastFile = data.lastFile || 1;
            } else {
                this.items = {};
                this.lastFile = 1;
            }
        } catch {
            this.items = {};
            this.lastFile = 1;
        }
    }
    
    save() {
        const data = {
            items: this.items,
            lastFile: this.lastFile,
            updated: new Date().toISOString()
        };
        fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2));
    }
    
    exists(id) {
        return !!this.items[id];
    }
    
    add(id, data) {
        this.items[id] = {
            ...data,
            added: new Date().toISOString()
        };
        this.save();
        return true;
    }
    
    getNextFileName() {
        return `Top${this.lastFile}.json`;
    }
    
    incrementFile() {
        this.lastFile++;
        this.save();
    }
}

// ==================== نظام التقدم البسيط ====================
class SimpleProgress {
    constructor() {
        this.load();
    }
    
    load() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                this.currentPage = data.currentPage || 1;
                this.mode = data.mode || "scrape_all"; // scrape_all أو update_home
                this.allPagesDone = data.allPagesDone || false;
                this.lastRun = data.lastRun || new Date().toISOString();
            } else {
                this.reset();
            }
        } catch {
            this.reset();
        }
    }
    
    reset() {
        this.currentPage = 1;
        this.mode = "scrape_all";
        this.allPagesDone = false;
        this.lastRun = new Date().toISOString();
        this.save();
    }
    
    save() {
        const data = {
            currentPage: this.currentPage,
            mode: this.mode,
            allPagesDone: this.allPagesDone,
            lastRun: this.lastRun,
            updated: new Date().toISOString()
        };
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
    }
    
    nextPage() {
        this.currentPage++;
        this.save();
    }
    
    markAllDone() {
        this.allPagesDone = true;
        this.mode = "update_home";
        this.save();
    }
}

// ==================== دوال أساسية ====================
async function fetchPage(url) {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        };
        
        const response = await fetch(url, { headers });
        if (!response.ok) return null;
        
        return await response.text();
    } catch {
        return null;
    }
}

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function extractIdFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        return pathParts[pathParts.length - 1] || `id_${Date.now()}`;
    } catch {
        return `id_${Date.now()}`;
    }
}

// ==================== استخراج المسلسلات من صفحة ====================
async function getSeriesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/"
        : `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/page/${pageNum}/`;
    
    console.log(`📄 الصفحة ${pageNum}: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return [];
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const series = [];
        
        const elements = doc.querySelectorAll('.Small--Box a');
        
        for (const element of elements) {
            if (element.href && element.href.includes('topcinema.rip')) {
                const title = cleanText(element.querySelector('.title')?.textContent || element.textContent);
                const image = element.querySelector('img')?.src;
                
                series.push({
                    id: extractIdFromUrl(element.href),
                    url: element.href,
                    title: title,
                    image: image,
                    page: pageNum
                });
            }
        }
        
        console.log(`✅ وجدت ${series.length} مسلسل`);
        return series;
    } catch {
        return [];
    }
}

// ==================== استخراج تفاصيل المسلسل ====================
async function getSeriesDetails(series) {
    console.log(`🎬 ${series.title.substring(0, 40)}...`);
    
    const html = await fetchPage(series.url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || series.title);
        const image = doc.querySelector(".image img")?.src || series.image;
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        const details = {};
        doc.querySelectorAll(".RightTaxContent li").forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = cleanText(labelElement.textContent).replace(":", "").trim();
                if (label) {
                    const links = item.querySelectorAll("a");
                    if (links.length > 0) {
                        details[label] = Array.from(links).map(a => cleanText(a.textContent));
                    } else {
                        const value = cleanText(item.textContent.split(":").slice(1).join(":"));
                        details[label] = value;
                    }
                }
            }
        });
        
        return {
            id: series.id,
            title: title,
            url: series.url,
            image: image,
            story: story || "غير متوفر",
            details: details,
            scrapedAt: new Date().toISOString()
        };
    } catch {
        return null;
    }
}

// ==================== استخراج المواسم ====================
async function getSeasonsFromSeries(seriesUrl, seriesId) {
    const html = await fetchPage(seriesUrl);
    if (!html) return [];
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seasons = [];
        
        // البحث عن المواسم
        const seasonElements = doc.querySelectorAll('.Small--Box.Season, a[href*="season"]');
        
        for (const element of seasonElements) {
            let link = element.tagName === 'A' ? element : element.querySelector('a');
            
            if (link && link.href && link.href.includes('topcinema.rip')) {
                const seasonText = cleanText(link.textContent);
                const seasonNum = seasonText.match(/الموسم\s*(\d+)/i)?.[1] || 
                                 link.href.match(/season[\/\-](\d+)/i)?.[1] || 
                                 (seasons.length + 1);
                
                seasons.push({
                    id: `${seriesId}_season_${seasonNum}`,
                    url: link.href,
                    title: seasonText || `الموسم ${seasonNum}`,
                    seasonNumber: parseInt(seasonNum),
                    seriesId: seriesId
                });
            }
        }
        
        return seasons;
    } catch {
        return [];
    }
}

// ==================== استخراج الحلقات ====================
async function getEpisodesFromSeason(seasonUrl, seasonId, seriesId) {
    const html = await fetchPage(seasonUrl);
    if (!html) return [];
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        // البحث عن الحلقات
        const episodeElements = doc.querySelectorAll('.Small--Box, .episodul, [class*="episode"]');
        
        for (const element of episodeElements) {
            const link = element.querySelector('a');
            
            if (link && link.href && link.href.includes('topcinema.rip')) {
                const text = cleanText(element.textContent);
                
                if (text.includes('الحلقة') || link.href.includes('/episode/') || link.href.includes('/watch/')) {
                    const epNum = text.match(/الحلقة\s*(\d+)/i)?.[1] || 
                                link.href.match(/episode\/(\d+)/i)?.[1] || 
                                (episodes.length + 1);
                    
                    episodes.push({
                        id: `${seasonId}_episode_${epNum}`,
                        url: link.href,
                        title: cleanText(link.textContent) || `الحلقة ${epNum}`,
                        episodeNumber: parseInt(epNum),
                        seasonId: seasonId,
                        seriesId: seriesId
                    });
                }
            }
        }
        
        return episodes;
    } catch {
        return [];
    }
}

// ==================== حفظ البيانات في ملف ====================
function saveToFile(directory, fileName, data, type) {
    const filePath = path.join(directory, fileName);
    
    let existing = { data: [] };
    if (fs.existsSync(filePath)) {
        try {
            existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {}
    }
    
    // إضافة البيانات الجديدة
    if (Array.isArray(data)) {
        // إضافة مصفوفة
        existing.data = [...existing.data, ...data];
    } else {
        // إضافة عنصر واحد
        existing.data.push(data);
    }
    
    // تحديث المعلومات
    existing.info = {
        type: type,
        fileName: fileName,
        totalItems: existing.data.length,
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    console.log(`💾 تم الحفظ في ${fileName} (${existing.data.length} ${type})`);
    
    return existing.data.length;
}

// ==================== استخراج أحدث الحلقات من الصفحة الرئيسية ====================
async function getLatestEpisodes() {
    console.log("\n🔍 جاري البحث عن أحدث الحلقات...");
    
    const html = await fetchPage("https://topcinema.rip/");
    if (!html) return [];
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        // البحث في جميع الروابط
        const allLinks = doc.querySelectorAll('a[href*="topcinema.rip"]');
        
        for (const link of allLinks) {
            if (episodes.length >= LATEST_EPISODES_COUNT) break;
            
            const href = link.href;
            const text = cleanText(link.textContent);
            
            // تحقق إذا كانت حلقة
            if (href.includes('/episode/') || href.includes('/watch/') || text.includes('الحلقة')) {
                episodes.push({
                    id: `latest_${Date.now()}_${episodes.length}`,
                    title: text,
                    url: href,
                    added: new Date().toISOString()
                });
            }
        }
        
        console.log(`✅ وجدت ${episodes.length} حلقة جديدة`);
        return episodes;
    } catch {
        return [];
    }
}

// ==================== حفظ Home.json ====================
function saveHomeJson(data, type) {
    const homeFile = HOME_FILES[type];
    const content = {
        fileName: "Home.json",
        type: type,
        totalItems: data.length,
        lastUpdated: new Date().toISOString(),
        data: data
    };
    
    fs.writeFileSync(homeFile, JSON.stringify(content, null, 2));
    console.log(`🏠 تم حفظ ${data.length} ${type} في Home.json`);
}

// ==================== الوضع 1: استخراج كل الصفحات ====================
async function scrapeAllPages(progress, indexes) {
    console.log("🚀 بدء استخراج جميع الصفحات");
    console.log("=".repeat(50));
    
    let pagesDone = 0;
    
    while (pagesDone < PAGES_PER_RUN) {
        const pageNum = progress.currentPage;
        
        // جلب مسلسلات الصفحة
        const seriesList = await getSeriesFromPage(pageNum);
        
        if (seriesList.length === 0) {
            console.log(`\n🏁 وصلنا إلى آخر صفحة!`);
            progress.markAllDone();
            break;
        }
        
        console.log(`\n📄 معالجة صفحة ${pageNum} (${seriesList.length} مسلسل)`);
        
        // معالجة كل مسلسل
        for (const series of seriesList) {
            // تحقق إذا كان المسلسل موجود
            if (indexes.series.exists(series.id)) {
                console.log(`   ✅ ${series.title.substring(0, 30)}... (موجود)`);
                continue;
            }
            
            // استخراج تفاصيل المسلسل
            const seriesDetails = await getSeriesDetails(series);
            if (!seriesDetails) continue;
            
            // تحديد ملف الحفظ
            const seriesFileName = indexes.series.getNextFileName();
            
            // حفظ المسلسل
            saveToFile(TV_SERIES_DIR, seriesFileName, seriesDetails, "series");
            indexes.series.add(series.id, { file: seriesFileName });
            
            // استخراج المواسم
            const seasons = await getSeasonsFromSeries(series.url, series.id);
            
            for (const season of seasons) {
                // تحقق إذا كان الموسم موجود
                if (indexes.seasons.exists(season.id)) continue;
                
                // تحديد ملف الحفظ للموسم
                const seasonFileName = indexes.seasons.getNextFileName();
                
                // حفظ الموسم
                saveToFile(SEASONS_DIR, seasonFileName, season, "season");
                indexes.seasons.add(season.id, { file: seasonFileName });
                
                // استخراج الحلقات
                const episodes = await getEpisodesFromSeason(season.url, season.id, series.id);
                
                for (const episode of episodes) {
                    // تحقق إذا كانت الحلقة موجودة
                    if (indexes.episodes.exists(episode.id)) continue;
                    
                    // تحديد ملف الحفظ للحلقات
                    const episodeFileName = indexes.episodes.getNextFileName();
                    
                    // حفظ الحلقة
                    saveToFile(EPISODES_DIR, episodeFileName, episode, "episode");
                    indexes.episodes.add(episode.id, { file: episodeFileName });
                }
            }
            
            // تأخير بين المسلسلات
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        pagesDone++;
        if (pagesDone < PAGES_PER_RUN) {
            progress.nextPage();
        }
        
        // تأخير بين الصفحات
        if (pagesDone < PAGES_PER_RUN) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return pagesDone;
}

// ==================== الوضع 2: تحديث الصفحة الأولى فقط ====================
async function updateHomeOnly(progress, indexes) {
    console.log("\n🔄 تحديث الصفحة الأولى فقط");
    console.log("=".repeat(50));
    
    // جلب مسلسلات الصفحة الأولى
    const seriesList = await getSeriesFromPage(1);
    console.log(`📄 وجدت ${seriesList.length} مسلسل في الصفحة الأولى`);
    
    const homeSeries = [];
    let newItemsAdded = 0;
    
    // معالجة كل مسلسل في الصفحة الأولى
    for (const series of seriesList) {
        // تحقق إذا كان المسلسل جديد
        if (!indexes.series.exists(series.id)) {
            console.log(`🆕 ${series.title.substring(0, 30)}... (جديد)`);
            
            // استخراج وحفظ المسلسل الجديد
            const seriesDetails = await getSeriesDetails(series);
            if (seriesDetails) {
                const seriesFileName = indexes.series.getNextFileName();
                saveToFile(TV_SERIES_DIR, seriesFileName, seriesDetails, "series");
                indexes.series.add(series.id, { file: seriesFileName });
                newItemsAdded++;
                
                // استخراج وحفظ المواسم الجديدة
                const seasons = await getSeasonsFromSeries(series.url, series.id);
                for (const season of seasons) {
                    if (!indexes.seasons.exists(season.id)) {
                        const seasonFileName = indexes.seasons.getNextFileName();
                        saveToFile(SEASONS_DIR, seasonFileName, season, "season");
                        indexes.seasons.add(season.id, { file: seasonFileName });
                        newItemsAdded++;
                        
                        // استخراج وحفظ الحلقات الجديدة
                        const episodes = await getEpisodesFromSeason(season.url, season.id, series.id);
                        for (const episode of episodes) {
                            if (!indexes.episodes.exists(episode.id)) {
                                const episodeFileName = indexes.episodes.getNextFileName();
                                saveToFile(EPISODES_DIR, episodeFileName, episode, "episode");
                                indexes.episodes.add(episode.id, { file: episodeFileName });
                                newItemsAdded++;
                            }
                        }
                    }
                }
            }
        }
        
        // إضافة المسلسل للـ Home (حتى لو كان موجود)
        const seriesDetails = await getSeriesDetails(series);
        if (seriesDetails) {
            homeSeries.push(seriesDetails);
        }
        
        // تأخير بين المسلسلات
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // حفظ Home.json للمسلسلات
    saveHomeJson(homeSeries, "series");
    
    // استخراج وحفظ أحدث الحلقات
    const latestEpisodes = await getLatestEpisodes();
    saveHomeJson(latestEpisodes, "episodes");
    
    console.log(`\n✅ تمت المعالجة:`);
    console.log(`   🎬 مسلسلات في Home.json: ${homeSeries.length}`);
    console.log(`   📺 حلقات في Home.json: ${latestEpisodes.length}`);
    console.log(`   🆕 عناصر جديدة مضافة: ${newItemsAdded}`);
    
    return { homeSeries: homeSeries.length, latestEpisodes: latestEpisodes.length, newItems: newItemsAdded };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - مبسط");
    console.log("⏱️ " + new Date().toLocaleString());
    console.log("=".repeat(50));
    
    // تهيئة الفهارس
    const indexes = {
        series: new SimpleIndex("series"),
        seasons: new SimpleIndex("seasons"),
        episodes: new SimpleIndex("episodes")
    };
    
    const progress = new SimpleProgress();
    
    console.log(`📊 حالة النظام:`);
    console.log(`   📄 الصفحة الحالية: ${progress.currentPage}`);
    console.log(`   🎯 الوضع: ${progress.mode === 'scrape_all' ? 'استخراج جميع الصفحات' : 'تحديث الصفحة الأولى فقط'}`);
    console.log(`   ✅ جميع الصفحات مكتملة: ${progress.allPagesDone ? 'نعم' : 'لا'}`);
    
    let result;
    
    if (progress.mode === "scrape_all" && !progress.allPagesDone) {
        // الوضع 1: استخراج صفحات جديدة
        console.log(`\n🔍 سيتم استخراج ${PAGES_PER_RUN} صفحات...`);
        result = await scrapeAllPages(progress, indexes);
        console.log(`\n✅ تم استخراج ${result} صفحات`);
    } else {
        // الوضع 2: تحديث الصفحة الأولى فقط
        console.log(`\n🔄 سيتم تحديث الصفحة الأولى فقط...`);
        result = await updateHomeOnly(progress, indexes);
    }
    
    // عرض النتائج
    console.log("\n" + "=".repeat(50));
    console.log("🎉 اكتمل التشغيل!");
    console.log("=".repeat(50));
    
    console.log(`\n💾 الملفات المحفوظة:`);
    
    // عرض إحصائيات المجلدات
    const folders = [
        { name: "TV_Series", dir: TV_SERIES_DIR },
        { name: "Seasons", dir: SEASONS_DIR },
        { name: "Episodes", dir: EPISODES_DIR }
    ];
    
    for (const folder of folders) {
        try {
            const files = fs.readdirSync(folder.dir).filter(f => f.endsWith('.json'));
            console.log(`\n📁 ${folder.name}:`);
            
            let totalItems = 0;
            for (const file of files) {
                const filePath = path.join(folder.dir, file);
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const count = content.data?.length || 0;
                    totalItems += count;
                    
                    if (file === "Home.json") {
                        console.log(`   🏠 ${file}: ${count} عنصر`);
                    } else {
                        console.log(`   📄 ${file}: ${count} عنصر`);
                    }
                } catch {}
            }
            
            console.log(`   📊 المجموع: ${totalItems} عنصر`);
            
        } catch (error) {
            console.log(`   ⚠️ خطأ في قراءة ${folder.name}: ${error.message}`);
        }
    }
    
    console.log("\n📌 في المرة القادمة:");
    if (progress.allPagesDone) {
        console.log("   سيتم تحديث الصفحة الأولى فقط");
    } else {
        console.log(`   سيتم استخراج من الصفحة ${progress.currentPage}`);
    }
    console.log("=".repeat(50));
}

// تشغيل البرنامج
main().catch(error => {
    console.error("\n💥 خطأ:", error.message);
    process.exit(1);
});
