import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const RAMADAN_DIR = path.join(__dirname, "Ramadan");
const YEAR = "2025";
const YEAR_DIR = path.join(RAMADAN_DIR, YEAR);

// إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(RAMADAN_DIR)) {
    fs.mkdirSync(RAMADAN_DIR, { recursive: true });
}
if (!fs.existsSync(YEAR_DIR)) {
    fs.mkdirSync(YEAR_DIR, { recursive: true });
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 20000) {
    // إضافة النطاق الأساسي إذا كان الرابط نسبيًا
    let fullUrl = url;
    if (url && !url.startsWith('http')) {
        fullUrl = 'https://larooza.live/' + url;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(fullUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://larooza.live/',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`   ⚠️ استجابة غير ناجحة: ${response.status}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`   ⏱️ انتهى الوقت`);
        } else {
            console.log(`   ❌ خطأ في جلب الصفحة: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط ====================
function extractVideoId(url) {
    try {
        if (!url) return null;
        const match = url.match(/vid=([^&]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ==================== استخراج ID من رابط المسلسل ====================
function extractSeriesId(url) {
    try {
        if (!url) return null;
        const match = url.match(/ser=([^&]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة فقط ====================
async function fetchWatchServers(playUrl) {
    const html = await fetchWithTimeout(playUrl);
    
    if (!html) {
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // البحث عن سيرفرات المشاهدة
        const serverElements = doc.querySelectorAll('ul.WatchList li[data-embed-url]');
        
        serverElements.forEach(server => {
            const embedUrl = server.getAttribute('data-embed-url');
            const serverName = server.querySelector('strong')?.textContent?.trim() || `سيرفر ${watchServers.length + 1}`;
            
            if (embedUrl) {
                // إضافة النطاق الأساسي لروابط data-embed-url النسبية
                let fullEmbedUrl = embedUrl;
                if (embedUrl && !embedUrl.startsWith('http')) {
                    fullEmbedUrl = 'https://larooza.live/' + embedUrl;
                }
                
                watchServers.push({
                    id: `server_${watchServers.length + 1}`,
                    name: serverName,
                    url: fullEmbedUrl,
                    type: 'embed'
                });
            }
        });
        
        // البحث عن iframes
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            const src = iframe.getAttribute('src');
            if (src) {
                let fullSrc = src;
                // إضافة النطاق الأساسي لروابط iframe النسبية
                if (src && !src.startsWith('http')) {
                    fullSrc = 'https://larooza.live/' + src;
                }
                
                let serverName = 'غير معروف';
                if (fullSrc.includes('voe')) serverName = 'Voe';
                else if (fullSrc.includes('okprime')) serverName = 'OkPrime';
                else if (fullSrc.includes('stream')) serverName = 'Stream';
                
                watchServers.push({
                    id: `iframe_${index + 1}`,
                    name: serverName,
                    url: fullSrc,
                    type: 'iframe'
                });
            }
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        
        watchServers.forEach(server => {
            if (!seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        return uniqueServers;
        
    } catch (error) {
        return [];
    }
}

// ==================== استخراج سيرفرات الحلقة فقط ====================
async function fetchEpisodeServers(episodeUrl) {
    const episodeId = extractVideoId(episodeUrl);
    
    // تحويل رابط الحلقة إلى رابط المشاهدة
    let playUrl = episodeUrl;
    if (episodeUrl.includes('video.php?vid=')) {
        playUrl = episodeUrl.replace('video.php?vid=', 'play.php?vid=');
    }
    
    const watchServers = await fetchWatchServers(playUrl);
    
    return {
        id: episodeId,
        watchServers: watchServers
    };
}

// ==================== استخراج حلقات المسلسل مع سيرفراتها فقط ====================
async function fetchSeriesEpisodes(seriesUrl, seriesId) {
    console.log(`   📺 جلب حلقات المسلسل...`);
    
    const html = await fetchWithTimeout(seriesUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج عنوان المسلسل فقط
        const seriesTitle = doc.querySelector('h1.title')?.textContent?.trim() || 
                           doc.querySelector('h1')?.textContent?.trim() || 
                           'مسلسل غير معروف';
        
        // تنظيف العنوان لاستخدامه كاسم ملف آمن
        const cleanTitle = seriesTitle.replace(/[^\w\u0600-\u06FF\s\-]/g, '').replace(/\s+/g, '_');
        
        // استخراج صورة المسلسل فقط
        const seriesImage = doc.querySelector('img[width="300"]')?.src || 
                           doc.querySelector('.thumbnail img')?.src || 
                           '';
        
        // إضافة النطاق الأساسي للصورة النسبية
        if (seriesImage && !seriesImage.startsWith('http')) {
            seriesImage = 'https://larooza.live/' + seriesImage;
        }
        
        // البحث عن روابط الحلقات
        const episodes = [];
        const episodeElements = doc.querySelectorAll('a[href*="video.php?vid="]');
        
        console.log(`   ✅ عثر على ${episodeElements.length} حلقة`);
        
        // استخراج سيرفرات كل حلقة فقط
        for (let i = 0; i < episodeElements.length; i++) {
            const episodeElement = episodeElements[i];
            const episodeUrl = episodeElement.getAttribute('href');
            
            console.log(`     ${i + 1}/${episodeElements.length}: جلب سيرفرات الحلقة...`);
            
            const episodeData = await fetchEpisodeServers(episodeUrl);
            
            if (episodeData) {
                episodes.push(episodeData);
                console.log(`       ✓ ${episodeData.watchServers.length} سيرفر`);
            }
            
            // انتظار قصير بين الحلقات
            if (i < episodeElements.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return {
            seriesId: seriesId,
            seriesTitle: seriesTitle,
            cleanTitle: cleanTitle,
            seriesImage: seriesImage,
            seriesCategory: "رمضان",
            seriesYear: YEAR,
            totalEpisodes: episodes.length,
            episodes: episodes,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج حلقات المسلسل: ${error.message}`);
        return null;
    }
}

// ==================== استخراج جميع المسلسلات ====================
async function fetchRamadanSeries(pageUrl) {
    console.log(`📖 جلب صفحة المسلسلات: ${pageUrl}`);
    
    const html = await fetchWithTimeout(pageUrl);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المسلسلات`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const seriesList = [];
        
        // البحث عن روابط المسلسلات
        const seriesElements = doc.querySelectorAll('a[href*="view-serie"]');
        
        console.log(`✅ عثر على ${seriesElements.length} مسلسل`);
        
        // استخراج كل مسلسل
        for (let i = 0; i < seriesElements.length; i++) {
            const seriesElement = seriesElements[i];
            const seriesUrl = seriesElement.getAttribute('href');
            const seriesId = extractSeriesId(seriesUrl) || `series_${i + 1}`;
            
            console.log(`\n🎬 ${i + 1}/${seriesElements.length}: المسلسل ${seriesId}`);
            
            // استخراج حلقات المسلسل مع سيرفراتها
            const seriesData = await fetchSeriesEpisodes(seriesUrl, seriesId);
            
            if (seriesData && seriesData.episodes.length > 0) {
                // حفظ المسلسل في ملف منفصل
                const seriesFileName = `${seriesId}_${seriesData.cleanTitle}.json`;
                const seriesFilePath = path.join(YEAR_DIR, seriesFileName);
                
                fs.writeFileSync(seriesFilePath, JSON.stringify(seriesData, null, 2));
                console.log(`   💾 تم حفظ المسلسل في: ${seriesFileName}`);
                
                seriesList.push({
                    id: seriesId,
                    title: seriesData.seriesTitle,
                    fileName: seriesFileName,
                    episodes: seriesData.totalEpisodes
                });
            } else {
                console.log(`   ⚠️ لم يتم العثور على حلقات للمسلسل`);
            }
            
            // انتظار بين المسلسلات
            if (i < seriesElements.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        return seriesList;
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج المسلسلات: ${error.message}`);
        return null;
    }
}

// ==================== حفظ فهرس المسلسلات ====================
function saveIndexFile(seriesList) {
    const indexData = {
        year: YEAR,
        totalSeries: seriesList.length,
        totalEpisodes: seriesList.reduce((sum, series) => sum + series.episodes, 0),
        scrapedAt: new Date().toISOString(),
        series: seriesList
    };
    
    const indexPath = path.join(YEAR_DIR, `index_${YEAR}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    
    return indexPath;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج مسلسلات رمضان");
    console.log("=".repeat(50));
    console.log(`📅 السنة: ${YEAR}`);
    console.log(`📁 المجلد: ${YEAR_DIR}`);
    console.log("=".repeat(50));
    
    const RAMADAN_URL = `https://larooza.live/category.php?cat=13-ramadan-${YEAR}`;
    
    // استخراج المسلسلات
    const seriesList = await fetchRamadanSeries(RAMADAN_URL);
    
    if (!seriesList || seriesList.length === 0) {
        console.log(`\n⏹️ لم يتم العثور على مسلسلات`);
        return { success: false, total: 0 };
    }
    
    // حفظ فهرس المسلسلات
    const indexPath = saveIndexFile(seriesList);
    
    // عرض النتائج
    console.log("\n" + "=".repeat(50));
    console.log("📊 النتائج النهائية:");
    console.log("=".repeat(50));
    
    seriesList.forEach((series, idx) => {
        console.log(`\n${idx + 1}. ${series.title}`);
        console.log(`   🔸 ID: ${series.id}`);
        console.log(`   🔸 الملف: ${series.fileName}`);
        console.log(`   🔸 عدد الحلقات: ${series.episodes}`);
    });
    
    // عرض إحصائيات
    const totalEpisodes = seriesList.reduce((sum, series) => sum + series.episodes, 0);
    console.log(`\n📈 الإحصائيات:`);
    console.log(`   ✅ المسلسلات: ${seriesList.length}`);
    console.log(`   ✅ الحلقات: ${totalEpisodes}`);
    console.log(`   📁 الملفات: ${seriesList.length} ملف مسلسل`);
    console.log(`   📋 الفهرس: ${indexPath}`);
    
    console.log("\n" + "=".repeat(50));
    console.log("🎉 تم الانتهاء بنجاح!");
    console.log("=".repeat(50));
    
    return { 
        success: true, 
        totalSeries: seriesList.length, 
        totalEpisodes: totalEpisodes
    };
}

// التشغيل
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
});
