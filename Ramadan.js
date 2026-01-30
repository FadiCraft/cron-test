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
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج سيرفرات الحلقة فقط ====================
async function fetchEpisodeServers(episodeUrl, episodeNumber) {
    const episodeId = extractVideoId(episodeUrl);
    
    console.log(`     الحلقة ${episodeNumber}: جلب السيرفرات...`);
    
    // تحويل رابط الحلقة إلى رابط المشاهدة
    let playUrl = episodeUrl;
    if (episodeUrl.includes('video.php?vid=')) {
        playUrl = episodeUrl.replace('video.php?vid=', 'play.php?vid=');
    }
    
    const watchServers = await fetchWatchServers(playUrl);
    
    if (watchServers.length > 0) {
        console.log(`       ✓ ${watchServers.length} سيرفر`);
    } else {
        console.log(`       ⚠️ لم يتم العثور على سيرفرات`);
    }
    
    return {
        id: episodeId,
        number: episodeNumber,
        watchServers: watchServers
    };
}

// ==================== استخراج مسلسل واحد فقط ====================
async function fetchSingleSeries(seriesUrl, seriesId) {
    console.log(`🎬 جلب المسلسل الأول...`);
    
    const html = await fetchWithTimeout(seriesUrl);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المسلسل`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج عنوان المسلسل
        const seriesTitle = doc.querySelector('h1.title')?.textContent?.trim() || 
                           doc.querySelector('h1')?.textContent?.trim() || 
                           'مسلسل غير معروف';
        
        console.log(`📺 المسلسل: ${seriesTitle}`);
        
        // تنظيف العنوان لاستخدامه كاسم ملف آمن
        const cleanTitle = seriesTitle.replace(/[^\w\u0600-\u06FF\s\-]/g, '').replace(/\s+/g, '_');
        
        // استخراج صورة المسلسل
        let seriesImage = doc.querySelector('img[width="300"]')?.src || 
                         doc.querySelector('.thumbnail img')?.src || 
                         '';
        
        // إضافة النطاق الأساسي للصورة النسبية
        if (seriesImage && !seriesImage.startsWith('http')) {
            seriesImage = 'https://larooza.live/' + seriesImage;
        }
        
        if (seriesImage) {
            console.log(`🖼️ صورة المسلسل: ${seriesImage}`);
        }
        
        // البحث عن روابط الحلقات
        const episodes = [];
        const episodeElements = doc.querySelectorAll('a[href*="video.php?vid="]');
        
        console.log(`✅ عثر على ${episodeElements.length} حلقة`);
        
        // استخراج أول 5 حلقات فقط للاختبار (يمكنك تغيير الرقم)
        const maxEpisodesToTest = Math.min(5, episodeElements.length);
        console.log(`🔧 اختيار أول ${maxEpisodesToTest} حلقات للاختبار`);
        
        // استخراج سيرفرات كل حلقة
        for (let i = 0; i < maxEpisodesToTest; i++) {
            const episodeElement = episodeElements[i];
            const episodeUrl = episodeElement.getAttribute('href');
            
            const episodeData = await fetchEpisodeServers(episodeUrl, i + 1);
            
            if (episodeData) {
                episodes.push(episodeData);
            }
            
            // انتظار قصير بين الحلقات
            if (i < maxEpisodesToTest - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        const seriesData = {
            seriesId: seriesId,
            seriesTitle: seriesTitle,
            cleanTitle: cleanTitle,
            seriesImage: seriesImage,
            seriesCategory: "رمضان",
            seriesYear: YEAR,
            totalEpisodes: episodeElements.length,
            testedEpisodes: maxEpisodesToTest,
            episodes: episodes,
            scrapedAt: new Date().toISOString(),
            note: "هذا ملف اختباري - تم استخراج أول مسلسل فقط"
        };
        
        return seriesData;
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج المسلسل: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية (مسلسل واحد فقط) ====================
async function main() {
    console.log("🎬 بدء اختبار استخراج مسلسل رمضان");
    console.log("=".repeat(50));
    console.log(`📅 السنة: ${YEAR}`);
    console.log(`📁 المجلد: ${YEAR_DIR}`);
    console.log("=".repeat(50));
    
    const RAMADAN_URL = `https://larooza.live/category.php?cat=13-ramadan-${YEAR}`;
    
    // 1. جلب صفحة المسلسلات
    console.log(`📖 جلب صفحة المسلسلات...`);
    const html = await fetchWithTimeout(RAMADAN_URL);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المسلسلات`);
        return { success: false };
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن روابط المسلسلات
        const seriesElements = doc.querySelectorAll('a[href*="view-serie"]');
        
        if (seriesElements.length === 0) {
            console.log(`❌ لم يتم العثور على مسلسلات`);
            return { success: false };
        }
        
        console.log(`✅ عثر على ${seriesElements.length} مسلسل`);
        console.log(`🔧 اختيار المسلسل الأول للاختبار`);
        
        // 2. أخذ أول مسلسل فقط
        const firstSeriesElement = seriesElements[0];
        const seriesUrl = firstSeriesElement.getAttribute('href');
        const seriesId = extractSeriesId(seriesUrl) || 'series_1';
        
        console.log(`🔗 رابط المسلسل: ${seriesUrl}`);
        console.log(`🆔 ID المسلسل: ${seriesId}`);
        
        // 3. استخراج المسلسل الأول
        const seriesData = await fetchSingleSeries(seriesUrl, seriesId);
        
        if (!seriesData || seriesData.episodes.length === 0) {
            console.log(`\n⏹️ لم يتم استخراج بيانات المسلسل`);
            return { success: false };
        }
        
        // 4. حفظ المسلسل في ملف
        const seriesFileName = `TEST_${seriesId}_${seriesData.cleanTitle}.json`;
        const seriesFilePath = path.join(YEAR_DIR, seriesFileName);
        
        fs.writeFileSync(seriesFilePath, JSON.stringify(seriesData, null, 2));
        console.log(`\n💾 تم حفظ المسلسل في: ${seriesFileName}`);
        
        // 5. إنشاء فهرس مختصر
        const indexData = {
            year: YEAR,
            testRun: true,
            totalSeriesAvailable: seriesElements.length,
            testedSeries: 1,
            totalEpisodesAvailable: seriesData.totalEpisodes,
            testedEpisodes: seriesData.testedEpisodes,
            scrapedAt: new Date().toISOString(),
            series: [{
                id: seriesId,
                title: seriesData.seriesTitle,
                fileName: seriesFileName,
                episodes: seriesData.totalEpisodes,
                testedEpisodes: seriesData.testedEpisodes
            }]
        };
        
        const indexPath = path.join(YEAR_DIR, `test_index_${YEAR}.json`);
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
        
        // 6. عرض النتائج
        console.log("\n" + "=".repeat(50));
        console.log("📊 نتائج الاختبار:");
        console.log("=".repeat(50));
        
        console.log(`\n📺 المسلسل: ${seriesData.seriesTitle}`);
        console.log(`   🔸 ID: ${seriesId}`);
        console.log(`   🔸 الملف: ${seriesFileName}`);
        console.log(`   🔸 إجمالي الحلقات: ${seriesData.totalEpisodes}`);
        console.log(`   🔸 الحلقات المختبرة: ${seriesData.testedEpisodes}`);
        
        // عرض إحصائيات السيرفرات
        let totalServers = 0;
        seriesData.episodes.forEach(episode => {
            totalServers += episode.watchServers.length;
        });
        
        console.log(`\n📈 إحصائيات السيرفرات:`);
        seriesData.episodes.forEach((episode, idx) => {
            console.log(`   الحلقة ${idx + 1}: ${episode.watchServers.length} سيرفر`);
        });
        
        console.log(`\n📊 الإجماليات:`);
        console.log(`   ✅ المسلسلات المتاحة: ${seriesElements.length}`);
        console.log(`   ✅ المسلسلات المختبرة: 1`);
        console.log(`   ✅ السيرفرات المستخرجة: ${totalServers}`);
        console.log(`   📁 ملفات JSON: 2`);
        console.log(`   📋 الفهرس: ${indexPath}`);
        console.log(`   📊 ملف المسلسل: ${seriesFilePath}`);
        
        console.log("\n" + "=".repeat(50));
        console.log("🎉 تم الانتهاء من الاختبار بنجاح!");
        console.log("=".repeat(50));
        
        console.log("\n💡 ملاحظة: هذا اختبار أولي فقط.");
        console.log("لتشغيل الكود كاملاً، قم بتعديل:");
        console.log("1. maxEpisodesToTest في السطر 180");
        console.log("2. seriesElements.length في السطر 216");
        
        return { 
            success: true, 
            totalSeries: 1, 
            testedEpisodes: seriesData.testedEpisodes,
            totalServers: totalServers,
            files: [seriesFileName, `test_index_${YEAR}.json`]
        };
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج المسلسلات: ${error.message}`);
        return { success: false };
    }
}

// التشغيل
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
