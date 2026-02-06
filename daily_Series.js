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
const TOP_MONTHLY_SERIES_DIR = path.join(AG_SERIES_DIR, "Top_Monthly_Series"); // جديد

// إنشاء المجلدات إذا لم تكن موجودة
const createDirectories = () => {
    console.log("📁 جاري إنشاء المجلدات...");
    [SERIES_DIR, AG_SERIES_DIR, TV_SERIES_DIR, SEASONS_DIR, EPISODES_DIR, TOP_MONTHLY_SERIES_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${dir}`);
        }
    });
    console.log("✅ اكتمل إنشاء المجلدات\n");
};

createDirectories();

// ==================== نظام التقدم ====================
class ProgressTracker {
    constructor() {
        this.currentSeriesFile = "Page1.json";
        this.currentSeasonFile = "Page1.json";
        this.currentEpisodeFile = "Page1.json";
        this.currentTopMonthlyFile = "Page1.json"; // جديد
    }
    
    saveTopMonthlySeries(seriesList) {
        const filePath = path.join(TOP_MONTHLY_SERIES_DIR, this.currentTopMonthlyFile);
        const fileContent = {
            info: {
                type: 'top_monthly_series',
                fileName: this.currentTopMonthlyFile,
                totalItems: seriesList.length,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                source: "https://topcinema.rip/",
                section: "أفضل مسلسلات هذا الشهر"
            },
            data: seriesList
        };
        
        fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
        console.log(`   💾 تم حفظ ${seriesList.length} مسلسل في ${this.currentTopMonthlyFile}`);
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
        const urlParts = url.split('/');
        let id = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        if (id.includes('?')) id = id.split('?')[0];
        if (id.includes('#')) id = id.split('#')[0];
        return id || `id_${Date.now()}`;
    } catch {
        return `id_${Date.now()}`;
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
        const seriesList = [];
        
        console.log("🔍 البحث عن قسم 'أفضل مسلسلات هذا الشهر'...");
        
        // البحث عن القسم المحدد
        const monthlySection = doc.querySelector('.Wide--Contents.Reverse.OneBox');
        
        if (!monthlySection) {
            console.log("❌ لم يتم العثور على القسم المطلوب");
            return [];
        }
        
        // التحقق من العنوان
        const sectionTitle = monthlySection.querySelector('h3')?.textContent;
        if (!sectionTitle || !sectionTitle.includes('أفضل مسلسلات')) {
            console.log(`⚠️  القسم ليس 'أفضل مسلسلات هذا الشهر': ${sectionTitle}`);
            return [];
        }
        
        console.log(`✅ وجدت القسم: ${sectionTitle}`);
        
        // استخراج المسلسلات
        const seriesElements = monthlySection.querySelectorAll('.Small--Box');
        console.log(`📊 وجدت ${seriesElements.length} مسلسل في القسم`);
        
        for (let i = 0; i < Math.min(seriesElements.length, 10); i++) {
            const element = seriesElements[i];
            const link = element.querySelector('a');
            
            if (link && link.href) {
                // استخراج العنوان
                const title = link.getAttribute('title') || 
                             element.querySelector('.title')?.textContent ||
                             "بدون عنوان";
                
                // استخراج الصورة
                const image = element.querySelector('img')?.src;
                
                // استخراج التصنيفات
                const categories = [];
                const categoryElements = element.querySelectorAll('.liList li:not(.imdbRating)');
                categoryElements.forEach(cat => {
                    const catText = cleanText(cat.textContent);
                    if (catText && !catText.includes('p') && !catText.includes('WEB') && !catText.includes('BluRay')) {
                        categories.push(catText);
                    }
                });
                
                // استخراج الجودة
                const quality = element.querySelector('.liList li:contains("p")')?.textContent || "غير محدد";
                
                // استخراج تقييم IMDB
                const imdbElement = element.querySelector('.imdbRating');
                const imdbRating = imdbElement ? cleanText(imdbElement.textContent.replace('⭐', '').trim()) : "غير متوفر";
                
                const seriesId = extractIdFromUrl(link.href);
                
                seriesList.push({
                    id: seriesId,
                    url: link.href,
                    title: cleanText(title),
                    image: image,
                    categories: categories,
                    quality: quality,
                    imdbRating: imdbRating,
                    position: i + 1,
                    section: "أفضل مسلسلات هذا الشهر",
                    scrapedAt: new Date().toISOString()
                });
                
                console.log(`   [${i + 1}] ${cleanText(title).substring(0, 40)}...`);
            }
        }
        
        console.log(`✅ تم استخراج ${seriesList.length} مسلسل من القسم`);
        return seriesList;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج المسلسلات:`, error.message);
        return [];
    }
}

// ==================== استخراج قائمة المسلسلات من صفحة القائمة ====================
async function fetchSeriesListFromPage() {
    const url = "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
    
    console.log(`\n📺 ===== جلب صفحة قائمة المسلسلات =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    if (!html) return null;
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seriesList = [];
        
        console.log("🔍 البحث عن المسلسلات...");
        
        // البحث عن المسلسلات في الصفحة الأولى
        const seriesElements = doc.querySelectorAll('.Small--Box');
        console.log(`✅ وجدت ${seriesElements.length} مسلسل في الصفحة`);
        
        for (let i = 0; i < seriesElements.length; i++) {
            const element = seriesElements[i];
            const link = element.querySelector('a');
            
            if (link && link.href) {
                const title = link.getAttribute('title') || 
                             element.querySelector('.title')?.textContent ||
                             element.textContent;
                
                const image = element.querySelector('img')?.src;
                
                seriesList.push({
                    url: link.href,
                    title: cleanText(title),
                    image: image,
                    position: i + 1
                });
                
                console.log(`   [${i + 1}] ${cleanText(title).substring(0, 40)}...`);
            }
        }
        
        return { url, series: seriesList };
        
    } catch (error) {
        console.error(`❌ خطأ في الصفحة:`, error.message);
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
        const seriesId = extractIdFromUrl(shortLink);
        
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
        const seasonElements = doc.querySelectorAll('.Small--Box.Season');
        
        if (seasonElements.length > 0) {
            seasonElements.forEach((element, i) => {
                const link = element.querySelector('a');
                if (link && link.href) {
                    // استخراج رقم الموسم
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
        
        // استخراج الرابط المختصر (ID)
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : seasonData.url;
        const seasonId = extractIdFromUrl(shortLink);
        
        // البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || seasonData.title);
        const image = doc.querySelector(".image img")?.src || seasonData.image;
        
        // استخراج رقم الموسم من العنوان
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
        
        // البحث عن قسم الحلقات
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
        
        // استخراج الرابط المختصر (ID)
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : episodeData.url;
        const episodeId = extractIdFromUrl(shortLink);
        
        // استخراج رقم الحلقة
        let episodeNumber = episodeData.episodeNumber;
        if (!episodeNumber) {
            const numberMatch = episodeData.title.match(/\d+/);
            episodeNumber = numberMatch ? parseInt(numberMatch[0]) : 1;
        }
        
        // استخراج سيرفر المشاهدة
        let watchServer = null;
        const watchMeta = doc.querySelector('meta[property="og:video:url"], meta[property="og:video:secure_url"]');
        if (watchMeta && watchMeta.content) {
            watchServer = watchMeta.content;
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
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`       ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== التحقق من وجود المسلسل ====================
function isSeriesExists(seriesId) {
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
        console.log(`⚠️ خطأ في فحص المسلسلات: ${error.message}`);
        return false;
    }
}

// ==================== التحقق من وجود الموسم ====================
function isSeasonExists(seasonId) {
    try {
        const seasonFiles = fs.readdirSync(SEASONS_DIR)
            .filter(file => file.startsWith('Page') && file.endsWith('.json'));
        
        for (const file of seasonFiles) {
            const filePath = path.join(SEASONS_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (content.data && Array.isArray(content.data)) {
                const found = content.data.find(season => season.id === seasonId);
                if (found) return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ خطأ في فحص المواسم: ${error.message}`);
        return false;
    }
}

// ==================== التحقق من وجود الحلقة ====================
function isEpisodeExists(episodeId) {
    try {
        const episodeFiles = fs.readdirSync(EPISODES_DIR)
            .filter(file => file.startsWith('Page') && file.endsWith('.json'));
        
        for (const file of episodeFiles) {
            const filePath = path.join(EPISODES_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (content.data && Array.isArray(content.data)) {
                const found = content.data.find(episode => episode.id === episodeId);
                if (found) return true;
            }
        }
        
        return false;
    } catch (error) {
        console.log(`⚠️ خطأ في فحص الحلقات: ${error.message}`);
        return false;
    }
}

// ==================== حفظ البيانات في الملفات (مع البقية) ====================
function saveToFile(directory, fileName, data, maxItems = 500) {
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
    
    // التحقق من عدم التكرار
    const isDuplicate = existingData.some(item => item.id === data.id);
    if (isDuplicate) {
        console.log(`   ⚠️ البيانات موجودة مسبقاً (ID: ${data.id})`);
        return null;
    }
    
    // إضافة البيانات الجديدة إلى البقية
    existingData.push(data);
    
    // إذا تجاوز العدد الحد الأقصى، إنشاء ملف جديد
    if (existingData.length > maxItems) {
        const newFileNumber = parseInt(fileName.match(/\d+/)[0]) + 1;
        const newFileName = `Page${newFileNumber}.json`;
        
        // حفظ الفائض في ملف جديد
        const overflowData = existingData.slice(maxItems);
        existingData = existingData.slice(0, maxItems);
        
        const overflowContent = {
            info: {
                type: fileInfo.type || 'data',
                fileName: newFileName,
                totalItems: overflowData.length,
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            },
            data: overflowData
        };
        
        const overflowPath = path.join(directory, newFileName);
        fs.writeFileSync(overflowPath, JSON.stringify(overflowContent, null, 2));
        console.log(`   📁 تم إنشاء ملف جديد: ${newFileName}`);
    }
    
    // تحديث معلومات الملف
    fileInfo = {
        type: fileInfo.type || 'data',
        fileName: fileName,
        totalItems: existingData.length,
        created: fileInfo.created || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };
    
    // حفظ الملف
    const fileContent = {
        info: fileInfo,
        data: existingData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    
    return fileContent;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 نظام استخراج المسلسلات - توب سينما");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    console.log("=".repeat(60));
    
    const progress = new ProgressTracker();
    const startTime = Date.now();
    
    // ==================== الجزء 1: أفضل مسلسلات هذا الشهر ====================
    console.log("\n" + "=".repeat(60));
    console.log("🏆 الجزء 1: استخراج أفضل مسلسلات هذا الشهر");
    console.log("=".repeat(60));
    
    const topMonthlySeries = await fetchTopMonthlySeries();
    
    if (topMonthlySeries.length > 0) {
        // حفظ المسلسلات في المجلد المنفصل (يتجدد في كل تشغيل)
        progress.saveTopMonthlySeries(topMonthlySeries);
        console.log(`✅ تم حفظ ${topMonthlySeries.length} مسلسل في Top_Monthly_Series/`);
    } else {
        console.log("⚠️ لا توجد مسلسلات في قسم 'أفضل مسلسلات هذا الشهر'");
    }
    
    // ==================== الجزء 2: قائمة المسلسلات ====================
    console.log("\n" + "=".repeat(60));
    console.log("📺 الجزء 2: استخراج صفحة قائمة المسلسلات");
    console.log("=".repeat(60));
    
    const pageData = await fetchSeriesListFromPage();
    
    if (!pageData || pageData.series.length === 0) {
        console.log("❌ لم يتم العثور على مسلسلات في الصفحة");
        return;
    }
    
    console.log(`📊 جاهز لاستخراج ${pageData.series.length} مسلسل`);
    
    let newSeriesCount = 0;
    let newSeasonsCount = 0;
    let newEpisodesCount = 0;
    
    // معالجة كل مسلسل
    for (let i = 0; i < pageData.series.length; i++) {
        const seriesData = pageData.series[i];
        
        console.log(`\n📊 [${i + 1}/${pageData.series.length}] ${seriesData.title.substring(0, 40)}...`);
        
        // 1. استخراج بيانات المسلسل
        const seriesDetails = await fetchSeriesDetails(seriesData);
        
        if (!seriesDetails) {
            console.log(`   ⚠️ تخطي المسلسل: فشل استخراج البيانات`);
            continue;
        }
        
        // التحقق إذا كان المسلسل موجوداً مسبقاً
        const seriesExists = isSeriesExists(seriesDetails.id);
        
        if (!seriesExists) {
            // حفظ المسلسل الجديد مع البقية
            const savedSeries = saveToFile(TV_SERIES_DIR, progress.currentSeriesFile, seriesDetails);
            if (savedSeries) {
                console.log(`   ✅ مسلسل جديد: تم الحفظ في TV_Series/`);
                newSeriesCount++;
            }
        } else {
            console.log(`   ✅ المسلسل موجود مسبقاً`);
            continue; // تخطي إذا كان موجوداً
        }
        
        // 2. استخراج مواسم المسلسل
        console.log(`   📅 جاري استخراج المواسم...`);
        const seasons = await extractSeasonsFromSeriesPage(seriesDetails.url);
        
        if (seasons.length > 0) {
            console.log(`   ✅ وجدت ${seasons.length} موسم`);
            
            // معالجة كل موسم
            for (let j = 0; j < seasons.length; j++) {
                const seasonData = seasons[j];
                
                console.log(`     🎞️  معالجة الموسم ${j + 1}/${seasons.length}`);
                
                // استخراج بيانات الموسم
                const seasonDetails = await fetchSeasonDetails(seasonData, seriesDetails.id);
                
                if (!seasonDetails) {
                    console.log(`     ⚠️ تخطي الموسم: فشل استخراج البيانات`);
                    continue;
                }
                
                // التحقق إذا كان الموسم موجوداً مسبقاً
                const seasonExists = isSeasonExists(seasonDetails.id);
                
                if (!seasonExists) {
                    // حفظ الموسم الجديد مع البقية
                    const savedSeason = saveToFile(SEASONS_DIR, progress.currentSeasonFile, seasonDetails);
                    if (savedSeason) {
                        console.log(`     ✅ موسم جديد: تم الحفظ في Seasons/`);
                        newSeasonsCount++;
                    }
                } else {
                    console.log(`     ✅ الموسم موجود مسبقاً`);
                    continue; // تخطي إذا كان موجوداً
                }
                
                // 3. استخراج حلقات الموسم
                console.log(`       📺 جاري استخراج الحلقات...`);
                const episodes = await extractEpisodesFromSeasonPage(seasonDetails.url);
                
                if (episodes.length > 0) {
                    console.log(`       ✅ وجدت ${episodes.length} حلقة`);
                    
                    // معالجة كل حلقة
                    for (let k = 0; k < episodes.length; k++) {
                        const episodeData = episodes[k];
                        
                        console.log(`         🎥 معالجة الحلقة ${k + 1}/${episodes.length}`);
                        
                        // استخراج بيانات الحلقة
                        const episodeDetails = await fetchEpisodeDetails(
                            episodeData, 
                            seriesDetails.id, 
                            seasonDetails.id
                        );
                        
                        if (!episodeDetails) {
                            console.log(`         ⚠️ تخطي الحلقة: فشل استخراج البيانات`);
                            continue;
                        }
                        
                        // التحقق إذا كانت الحلقة موجودة مسبقاً
                        const episodeExists = isEpisodeExists(episodeDetails.id);
                        
                        if (!episodeExists) {
                            // حفظ الحلقة الجديدة مع البقية
                            const savedEpisode = saveToFile(EPISODES_DIR, progress.currentEpisodeFile, episodeDetails);
                            if (savedEpisode) {
                                console.log(`         ✅ حلقة جديدة: تم الحفظ في Episodes/`);
                                newEpisodesCount++;
                            }
                        } else {
                            console.log(`         ✅ الحلقة موجودة مسبقاً`);
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
        }
        
        // تأخير بين المسلسلات
        if (i < pageData.series.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    // ==================== النتائج النهائية ====================
    const executionTime = Date.now() - startTime;
    
    console.log("\n" + "=".repeat(60));
    console.log("📊 التقرير النهائي:");
    console.log("=".repeat(60));
    console.log(`🏆 أفضل مسلسلات هذا الشهر: ${topMonthlySeries.length} مسلسل`);
    console.log(`🎬 مسلسلات جديدة: ${newSeriesCount}`);
    console.log(`📅 مواسم جديدة: ${newSeasonsCount}`);
    console.log(`📺 حلقات جديدة: ${newEpisodesCount}`);
    console.log(`⏱️ وقت التنفيذ: ${(executionTime / 1000).toFixed(1)} ثانية`);
    console.log("=".repeat(60));
    
    // حفظ التقرير
    const report = {
        timestamp: new Date().toISOString(),
        stats: {
            topMonthlySeries: topMonthlySeries.length,
            newSeries: newSeriesCount,
            newSeasons: newSeasonsCount,
            newEpisodes: newEpisodesCount,
            executionTime: `${(executionTime / 1000).toFixed(1)} ثانية`
        },
        topMonthlySeries: topMonthlySeries.map(s => ({ title: s.title, id: s.id })),
        directories: {
            topMonthly: TOP_MONTHLY_SERIES_DIR,
            tvSeries: TV_SERIES_DIR,
            seasons: SEASONS_DIR,
            episodes: EPISODES_DIR
        }
    };
    
    fs.writeFileSync("scraper_report.json", JSON.stringify(report, null, 2));
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
});لللفب
