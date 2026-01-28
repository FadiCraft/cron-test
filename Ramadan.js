import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const RAMADAN_DIR = path.join(__dirname, "Ramadan");
const YEAR = "2025"; // يمكن تغيير السنة حسب المطلوب
const YEAR_DIR = path.join(RAMADAN_DIR, YEAR);
const OUTPUT_FILE = path.join(YEAR_DIR, `Ramadan${YEAR}.json`);

// إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(RAMADAN_DIR)) {
    fs.mkdirSync(RAMADAN_DIR, { recursive: true });
}
if (!fs.existsSync(YEAR_DIR)) {
    fs.mkdirSync(YEAR_DIR, { recursive: true });
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://larooza.boats/',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط ====================
function extractVideoId(url) {
    try {
        if (!url) return null;
        // استخراج ID من رابط مثل video.php?vid=8090658f1
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
        // استخراج ID من رابط مثل view-serie1.php?ser=92j1tbk0j
        const match = url.match(/ser=([^&]+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة من صفحة التشغيل ====================
async function fetchWatchServers(playUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة...`);
    
    const html = await fetchWithTimeout(playUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة التشغيل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // البحث عن سيرفرات المشاهدة في ul.WatchList
        const serverElements = doc.querySelectorAll('ul.WatchList li[data-embed-url]');
        
        serverElements.forEach(server => {
            const embedUrl = server.getAttribute('data-embed-url');
            const embedId = server.getAttribute('data-embed-id');
            const serverName = server.querySelector('strong')?.textContent?.trim() || `سيرفر ${embedId}`;
            
            if (embedUrl) {
                watchServers.push({
                    id: embedId || `server_${watchServers.length + 1}`,
                    name: serverName,
                    url: embedUrl,
                    type: 'embed'
                });
            }
        });
        
        // البحث عن iframes مباشرة في الصفحة
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            const src = iframe.getAttribute('src');
            if (src && (src.includes('embed') || src.includes('voe') || src.includes('okprime'))) {
                // محاولة استخراج اسم السيرفر من الرابط
                let serverName = 'غير معروف';
                const domainMatch = src.match(/https?:\/\/(?:www\.)?([^\/]+)/);
                if (domainMatch) {
                    serverName = domainMatch[1].split('.')[0];
                }
                
                watchServers.push({
                    id: `iframe_${index + 1}`,
                    name: serverName,
                    url: src,
                    type: 'iframe'
                });
            }
        });
        
        // البحث عن روابط embed في scripts
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const scriptContent = script.textContent;
            if (scriptContent && scriptContent.includes('embed')) {
                const embedMatches = scriptContent.match(/https?[^"\s]*embed[^"\s]*/g);
                if (embedMatches) {
                    embedMatches.forEach((url, index) => {
                        watchServers.push({
                            id: `script_${index + 1}`,
                            name: 'Script Embed',
                            url: url,
                            type: 'script'
                        });
                    });
                }
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
        
        console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر مشاهدة`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الحلقة ====================
async function fetchEpisodeDetails(episodeUrl, seriesTitle, seriesImage) {
    console.log(`     🎬 جلب تفاصيل الحلقة...`);
    
    const html = await fetchWithTimeout(episodeUrl);
    
    if (!html) {
        console.log(`     ⚠️ فشل جلب صفحة الحلقة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج عنوان الحلقة
        const episodeTitle = doc.querySelector('h1.title')?.textContent?.trim() || 
                            doc.querySelector('title')?.textContent?.trim() || 
                            'حلقة غير معروفة';
        
        // استخراج صورة الحلقة
        const episodeImage = doc.querySelector('.pm-video-thumb img')?.src || 
                           doc.querySelector('img[alt*="الحلقة"]')?.src || 
                           seriesImage;
        
        // استخراج ID الحلقة
        const episodeId = extractVideoId(episodeUrl);
        
        // إنشاء رابط التشغيل من رابط الحلقة
        const playUrl = episodeUrl.replace('video.php?vid=', 'play.php?vid=');
        
        // جلب سيرفرات المشاهدة
        const watchServers = await fetchWatchServers(playUrl);
        
        return {
            id: episodeId,
            title: episodeTitle,
            url: episodeUrl,
            playUrl: playUrl,
            image: episodeImage,
            watchServers: watchServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج تفاصيل الحلقة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج جميع حلقات المسلسل ====================
async function fetchSeriesEpisodes(seriesUrl) {
    console.log(`   📺 جلب حلقات المسلسل...`);
    
    const html = await fetchWithTimeout(seriesUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج عنوان المسلسل
        const seriesTitle = doc.querySelector('h1.title')?.textContent?.trim() || 'مسلسل غير معروف';
        
        // استخراج صورة المسلسل
        const seriesImage = doc.querySelector('img[width="300"]')?.src || 
                           doc.querySelector('.thumbnail img')?.src || 
                           doc.querySelector('img[alt*="مسلسل"]')?.src || 
                           '';
        
        // استخراج ID المسلسل
        const seriesId = extractSeriesId(seriesUrl);
        
        // استخراج جميع حلقات المسلسل
        const episodes = [];
        const episodeElements = doc.querySelectorAll('.thumbnail .pm-video-thumb a');
        
        console.log(`   ✅ عثر على ${episodeElements.length} حلقة`);
        
        // استخراج تفاصيل كل حلقة
        for (let i = 0; i < episodeElements.length; i++) {
            const episodeElement = episodeElements[i];
            const episodeUrl = 'https://larooza.boats/' + episodeElement.getAttribute('href');
            const episodeTitle = episodeElement.getAttribute('title') || 
                               episodeElement.querySelector('img')?.getAttribute('alt') || 
                               `الحلقة ${i + 1}`;
            
            console.log(`     🔍 ${i + 1}/${episodeElements.length}: ${episodeTitle.substring(0, 40)}...`);
            
            const episodeDetails = await fetchEpisodeDetails(episodeUrl, seriesTitle, seriesImage);
            
            if (episodeDetails) {
                episodes.push(episodeDetails);
            }
            
            // انتظار قصير بين الحلقات
            if (i < episodeElements.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return {
            seriesId: seriesId,
            seriesTitle: seriesTitle,
            seriesImage: seriesImage,
            seriesUrl: seriesUrl,
            totalEpisodes: episodes.length,
            episodes: episodes
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج حلقات المسلسل: ${error.message}`);
        return null;
    }
}

// ==================== استخراج جميع المسلسلات من صفحة رمضان ====================
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
        const seriesElements = doc.querySelectorAll('a.icon-link');
        
        console.log(`✅ عثر على ${seriesElements.length} مسلسل`);
        
        // استخراج تفاصيل كل مسلسل
        for (let i = 0; i < seriesElements.length; i++) {
            const seriesElement = seriesElements[i];
            const seriesUrl = 'https://larooza.boats/' + seriesElement.getAttribute('href');
            const seriesTitle = seriesElement.textContent.trim();
            
            console.log(`\n🎬 ${i + 1}/${seriesElements.length}: ${seriesTitle}`);
            
            // استخراج حلقات المسلسل
            const seriesData = await fetchSeriesEpisodes(seriesUrl);
            
            if (seriesData && seriesData.episodes.length > 0) {
                seriesList.push(seriesData);
                console.log(`   ✅ تم استخراج ${seriesData.episodes.length} حلقة`);
            } else {
                console.log(`   ⚠️ لم يتم العثور على حلقات للمسلسل`);
            }
            
            // انتظار بين المسلسلات
            if (i < seriesElements.length - 1) {
                console.log(`⏳ انتظار 2 ثانية للمسلسل التالي...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        return seriesList;
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج المسلسلات: ${error.message}`);
        return null;
    }
}

// ==================== حفظ البيانات في ملف JSON ====================
function saveRamadanData(seriesData) {
    const data = {
        year: YEAR,
        totalSeries: seriesData.length,
        totalEpisodes: seriesData.reduce((sum, series) => sum + series.totalEpisodes, 0),
        scrapedAt: new Date().toISOString(),
        sourceUrl: "https://larooza.boats/category.php?cat=13-ramadan-2025",
        series: seriesData
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.log(`\n💾 حفظ البيانات في ${OUTPUT_FILE}`);
    
    return OUTPUT_FILE;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج مسلسلات رمضان");
    console.log("=".repeat(50));
    console.log(`📅 السنة: ${YEAR}`);
    console.log(`📁 المجلد: ${YEAR_DIR}`);
    
    const RAMADAN_URL = `https://larooza.boats/category.php?cat=13-ramadan-${YEAR}`;
    
    // استخراج المسلسلات
    const seriesData = await fetchRamadanSeries(RAMADAN_URL);
    
    if (!seriesData || seriesData.length === 0) {
        console.log(`\n⏹️ لم يتم العثور على مسلسلات`);
        return { success: false, total: 0 };
    }
    
    // حفظ البيانات
    const savedFile = saveRamadanData(seriesData);
    
    // عرض الإحصائيات
    console.log("\n" + "=".repeat(50));
    console.log("📊 إحصائيات الاستخراج:");
    console.log("=".repeat(50));
    console.log(`✅ المسلسلات: ${seriesData.length}`);
    
    const totalEpisodes = seriesData.reduce((sum, series) => sum + series.totalEpisodes, 0);
    const totalWatchServers = seriesData.reduce((sum, series) => {
        return sum + series.episodes.reduce((epSum, episode) => epSum + (episode.watchServers?.length || 0), 0);
    }, 0);
    
    console.log(`✅ الحلقات: ${totalEpisodes}`);
    console.log(`✅ سيرفرات المشاهدة: ${totalWatchServers}`);
    
    // عرض عينة من البيانات
    console.log("\n📋 عينة من البيانات المستخرجة:");
    seriesData.slice(0, 3).forEach((series, idx) => {
        console.log(`\n   ${idx + 1}. ${series.seriesTitle}`);
        console.log(`      ID: ${series.seriesId}`);
        console.log(`      الحلقات: ${series.totalEpisodes}`);
        console.log(`      الصورة: ${series.seriesImage ? 'نعم' : 'لا'}`);
        
        if (series.episodes.length > 0) {
            const firstEpisode = series.episodes[0];
            console.log(`      الحلقة الأولى: ${firstEpisode.title.substring(0, 40)}...`);
            console.log(`      سيرفرات الحلقة الأولى: ${firstEpisode.watchServers?.length || 0}`);
        }
    });
    
    // عرض معلومات الملف
    try {
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`\n📁 معلومات الملف:`);
        console.log(`   - المسار: ${OUTPUT_FILE}`);
        console.log(`   - الحجم: ${(stats.size / 1024).toFixed(2)} كيلوبايت`);
        console.log(`   - وقت التحديث: ${new Date().toISOString()}`);
    } catch (error) {
        console.log(`   ❌ خطأ في قراءة معلومات الملف: ${error.message}`);
    }
    
    // حفظ تقرير مفصل
    const report = {
        status: "completed",
        year: YEAR,
        totalSeries: seriesData.length,
        totalEpisodes: totalEpisodes,
        totalWatchServers: totalWatchServers,
        outputFile: OUTPUT_FILE,
        timestamp: new Date().toISOString(),
        seriesSummary: seriesData.map(series => ({
            title: series.seriesTitle,
            id: series.seriesId,
            episodes: series.totalEpisodes,
            image: series.seriesImage ? 'yes' : 'no'
        }))
    };
    
    const reportFile = path.join(YEAR_DIR, `report_${YEAR}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📝 التقرير المفصل محفوظ في: ${reportFile}`);
    
    console.log("\n" + "=".repeat(50));
    console.log("🎉 تم الانتهاء من استخراج مسلسلات رمضان بنجاح!");
    console.log("=".repeat(50));
    
    return { 
        success: true, 
        totalSeries: seriesData.length, 
        totalEpisodes: totalEpisodes,
        outputFile: OUTPUT_FILE 
    };
}

// التشغيل
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    
    const errorReport = {
        error: error.message,
        year: YEAR,
        timestamp: new Date().toISOString()
    };
    
    const errorFile = path.join(YEAR_DIR, `error_${YEAR}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorReport, null, 2));
    console.log(`📝 سجل الخطأ محفوظ في: ${errorFile}`);
});
