import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات - مع إضافة debugging
const RAMADAN_DIR = path.join(__dirname, "Ramadan");
const YEAR = "2025";
const YEAR_DIR = path.join(RAMADAN_DIR, YEAR);

// تسجيل معلومات البدء
console.log("🎬 بدء استخراج مسلسلات رمضان");
console.log("📁 المسار الحالي:", __dirname);
console.log("📁 مجلد Ramadan المخطط:", RAMADAN_DIR);
console.log("📁 مجلد السنة المخطط:", YEAR_DIR);

// إنشاء المجلدات إذا لم تكن موجودة مع debugging
console.log("🔧 إنشاء المجلدات...");
if (!fs.existsSync(RAMADAN_DIR)) {
    console.log("📁 إنشاء مجلد Ramadan...");
    fs.mkdirSync(RAMADAN_DIR, { recursive: true });
    console.log("✅ تم إنشاء مجلد Ramadan");
} else {
    console.log("📁 مجلد Ramadan موجود بالفعل");
}

if (!fs.existsSync(YEAR_DIR)) {
    console.log("📁 إنشاء مجلد السنة...");
    fs.mkdirSync(YEAR_DIR, { recursive: true });
    console.log("✅ تم إنشاء مجلد السنة");
} else {
    console.log("📁 مجلد السنة موجود بالفعل");
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 30000) { // زيادة الوقت
    console.log(`🔗 جلب: ${url}`);
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
            console.log(`⚠️ استجابة غير ناجحة: ${response.status} لـ ${url}`);
            return null;
        }
        
        const text = await response.text();
        console.log(`✅ تم جلب ${url} (${text.length} حرف)`);
        return text;
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت لـ ${url}`);
        } else {
            console.log(`❌ خطأ في جلب ${url}: ${error.message}`);
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
    console.log(`     🔍 جلب سيرفرات المشاهدة من: ${playUrl}`);
    
    const html = await fetchWithTimeout(playUrl);
    
    if (!html) {
        console.log(`     ⚠️ فشل جلب صفحة التشغيل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // البحث عن سيرفرات المشاهدة
        const serverElements = doc.querySelectorAll('ul.WatchList li[data-embed-url]');
        console.log(`     📊 وجد ${serverElements.length} عنصر سيرفر`);
        
        serverElements.forEach(server => {
            const embedUrl = server.getAttribute('data-embed-url');
            const serverName = server.querySelector('strong')?.textContent?.trim() || `سيرفر ${watchServers.length + 1}`;
            
            if (embedUrl) {
                watchServers.push({
                    id: `server_${watchServers.length + 1}`,
                    name: serverName,
                    url: embedUrl,
                    type: 'embed'
                });
                console.log(`     ✅ سيرفر: ${serverName}`);
            }
        });
        
        // البحث عن iframes
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            const src = iframe.getAttribute('src');
            if (src && src.includes('http')) {
                let serverName = 'غير معروف';
                if (src.includes('voe')) serverName = 'Voe';
                else if (src.includes('okprime')) serverName = 'OkPrime';
                else if (src.includes('stream')) serverName = 'Stream';
                
                watchServers.push({
                    id: `iframe_${index + 1}`,
                    name: serverName,
                    url: src,
                    type: 'iframe'
                });
                console.log(`     ✅ iframe: ${serverName}`);
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
        
        console.log(`     ✅ عثر على ${uniqueServers.length} سيرفر مشاهدة`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`     ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج سيرفرات الحلقة فقط ====================
async function fetchEpisodeServers(episodeUrl) {
    const episodeId = extractVideoId(episodeUrl);
    console.log(`     🎬 الحلقة ID: ${episodeId}`);
    
    const playUrl = episodeUrl.replace('video.php?vid=', 'play.php?vid=');
    
    const watchServers = await fetchWatchServers(playUrl);
    
    return {
        id: episodeId,
        watchServers: watchServers
    };
}

// ==================== استخراج حلقات المسلسل ====================
async function fetchSeriesEpisodes(seriesUrl, seriesId) {
    console.log(`   📺 جلب حلقات المسلسل: ${seriesUrl}`);
    
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
        
        console.log(`   📝 اسم المسلسل: ${seriesTitle}`);
        
        // استخراج صورة المسلسل فقط
        const seriesImage = doc.querySelector('img[width="300"]')?.src || 
                           doc.querySelector('.thumbnail img')?.src || 
                           '';
        
        // البحث عن روابط الحلقات
        const episodes = [];
        const episodeElements = doc.querySelectorAll('a[href*="video.php?vid="]');
        
        console.log(`   ✅ عثر على ${episodeElements.length} حلقة`);
        
        // استخراج سيرفرات كل حلقة فقط
        for (let i = 0; i < Math.min(episodeElements.length, 3); i++) { // فقط 3 حلقات للاختبار
            const episodeElement = episodeElements[i];
            const episodeUrl = 'https://larooza.boats/' + episodeElement.getAttribute('href');
            
            console.log(`     ${i + 1}/${Math.min(episodeElements.length, 3)}: جلب سيرفرات الحلقة...`);
            
            const episodeData = await fetchEpisodeServers(episodeUrl);
            
            if (episodeData) {
                episodes.push(episodeData);
                console.log(`       ✓ ${episodeData.watchServers.length} سيرفر`);
            }
            
            // انتظار قصير بين الحلقات
            if (i < Math.min(episodeElements.length, 3) - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`   📊 تم استخراج ${episodes.length} حلقة للمسلسل`);
        
        return {
            seriesId: seriesId,
            seriesTitle: seriesTitle,
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
        
        console.log(`✅ عثر على ${seriesElements.length} رابط مسلسل`);
        
        // اختبار استخراج مسلسلين فقط
        const testSeries = Array.from(seriesElements).slice(0, 2);
        
        console.log(`🔬 اختبار استخراج ${testSeries.length} مسلسل للتحقق`);
        
        for (let i = 0; i < testSeries.length; i++) {
            const seriesElement = testSeries[i];
            const seriesUrl = 'https://larooza.boats/' + seriesElement.getAttribute('href');
            const seriesId = extractSeriesId(seriesUrl) || `series_${i + 1}_test`;
            
            console.log(`\n🎬 ${i + 1}/${testSeries.length}: المسلسل ${seriesId}`);
            console.log(`   🔗 الرابط: ${seriesUrl}`);
            
            // استخراج حلقات المسلسل مع سيرفراتها
            const seriesData = await fetchSeriesEpisodes(seriesUrl, seriesId);
            
            if (seriesData && seriesData.episodes.length > 0) {
                // حفظ المسلسل في ملف منفصل
                const seriesFileName = `${seriesId}.json`;
                const seriesFilePath = path.join(YEAR_DIR, seriesFileName);
                
                console.log(`   💾 محاولة حفظ في: ${seriesFilePath}`);
                
                // التحقق من إمكانية الكتابة
                try {
                    fs.writeFileSync(seriesFilePath, JSON.stringify(seriesData, null, 2));
                    console.log(`   ✅ تم حفظ المسلسل في: ${seriesFileName}`);
                    
                    seriesList.push({
                        id: seriesId,
                        title: seriesData.seriesTitle,
                        fileName: seriesFileName,
                        episodes: seriesData.totalEpisodes
                    });
                } catch (writeError) {
                    console.log(`   ❌ خطأ في الكتابة: ${writeError.message}`);
                    console.log(`   📁 صلاحيات المجلد: ${YEAR_DIR}`);
                    
                    // محاولة عرض صلاحيات المجلد
                    try {
                        const stats = fs.statSync(YEAR_DIR);
                        console.log(`   📁 صلاحيات المجلد: ${stats.mode.toString(8)}`);
                    } catch (statError) {
                        console.log(`   ❌ لا يمكن قراءة معلومات المجلد`);
                    }
                }
            } else {
                console.log(`   ⚠️ لم يتم العثور على حلقات للمسلسل`);
            }
            
            // انتظار بين المسلسلات
            if (i < testSeries.length - 1) {
                console.log(`   ⏳ انتظار 3 ثواني للمسلسل التالي...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        return seriesList;
        
    } catch (error) {
        console.log(`❌ خطأ في استخراج المسلسلات: ${error.message}`);
        console.log(error.stack);
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
        series: seriesList,
        testMode: true,
        message: "هذا ملف اختباري - استخراج جزئي"
    };
    
    const indexPath = path.join(YEAR_DIR, `index_${YEAR}.json`);
    
    console.log(`📋 محاولة حفظ الفهرس في: ${indexPath}`);
    
    try {
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
        console.log(`✅ تم حفظ الفهرس بنجاح`);
        
        // التحقق من وجود الملف
        if (fs.existsSync(indexPath)) {
            const stats = fs.statSync(indexPath);
            console.log(`📊 حجم الفهرس: ${stats.size} بايت`);
        }
        
        return indexPath;
    } catch (error) {
        console.log(`❌ فشل حفظ الفهرس: ${error.message}`);
        return null;
    }
}

// ==================== فحص الملفات المنشأة ====================
function checkCreatedFiles() {
    console.log("\n🔍 فحص الملفات المنشأة:");
    console.log("=".repeat(50));
    
    try {
        if (fs.existsSync(YEAR_DIR)) {
            const files = fs.readdirSync(YEAR_DIR);
            console.log(`📁 عدد الملفات في ${YEAR_DIR}: ${files.length}`);
            
            if (files.length > 0) {
                files.forEach((file, index) => {
                    const filePath = path.join(YEAR_DIR, file);
                    const stats = fs.statSync(filePath);
                    console.log(`${index + 1}. ${file} (${stats.size} بايت)`);
                });
            } else {
                console.log("⚠️ المجلد فارغ");
            }
        } else {
            console.log(`❌ المجلد ${YEAR_DIR} غير موجود`);
        }
    } catch (error) {
        console.log(`❌ خطأ في فحص الملفات: ${error.message}`);
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج مسلسلات رمضان (وضع الاختبار)");
    console.log("=".repeat(60));
    console.log(`📅 السنة: ${YEAR}`);
    console.log(`📁 المسار النهائي: ${YEAR_DIR}`);
    console.log(`⏰ وقت البدء: ${new Date().toISOString()}`);
    console.log("=".repeat(60));
    
    // اختبار كتابة ملف بسيط أولاً
    console.log("\n✏️ اختبار الكتابة في المجلد...");
    const testFilePath = path.join(YEAR_DIR, "test_file.txt");
    try {
        fs.writeFileSync(testFilePath, "هذا ملف اختباري - " + new Date().toISOString());
        console.log(`✅ تم كتابة ملف اختباري في: ${testFilePath}`);
    } catch (error) {
        console.log(`❌ فشل كتابة ملف اختباري: ${error.message}`);
        console.log(`⚠️ تحقق من صلاحيات المجلد: ${YEAR_DIR}`);
        return { success: false, error: "صلاحيات كتابة" };
    }
    
    const RAMADAN_URL = `https://larooza.boats/category.php?cat=13-ramadan-${YEAR}`;
    
    // استخراج المسلسلات (وضع الاختبار - مسلسلين فقط)
    console.log(`\n🌐 الانتقال إلى: ${RAMADAN_URL}`);
    const seriesList = await fetchRamadanSeries(RAMADAN_URL);
    
    if (!seriesList || seriesList.length === 0) {
        console.log(`\n⏹️ لم يتم العثور على مسلسلات`);
        
        // حفظ فهرس فارغ للاختبار
        const emptyIndex = {
            year: YEAR,
            totalSeries: 0,
            totalEpisodes: 0,
            scrapedAt: new Date().toISOString(),
            series: [],
            message: "لم يتم العثور على مسلسلات - وضع الاختبار"
        };
        
        const indexPath = path.join(YEAR_DIR, `index_${YEAR}.json`);
        fs.writeFileSync(indexPath, JSON.stringify(emptyIndex, null, 2));
        console.log(`📝 تم حفظ فهرس فارغ للاختبار`);
        
        checkCreatedFiles();
        return { success: false, total: 0 };
    }
    
    // حفظ فهرس المسلسلات
    const indexPath = saveIndexFile(seriesList);
    
    // فحص الملفات المنشأة
    checkCreatedFiles();
    
    // عرض النتائج
    console.log("\n" + "=".repeat(60));
    console.log("📊 نتائج الاختبار:");
    console.log("=".repeat(60));
    console.log(`✅ المسلسلات المستخرجة: ${seriesList.length}`);
    console.log(`✅ المسار: ${YEAR_DIR}`);
    console.log(`✅ الفهرس: ${indexPath || 'لم ينشأ'}`);
    
    if (indexPath) {
        try {
            const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            console.log(`📋 إجمالي الحلقات في الفهرس: ${indexData.totalEpisodes}`);
        } catch (error) {
            console.log(`⚠️ لا يمكن قراءة الفهرس`);
        }
    }
    
    // إنشاء تقرير بسيط
    const report = {
        status: "test_completed",
        year: YEAR,
        totalSeries: seriesList.length,
        totalEpisodes: seriesList.reduce((sum, series) => sum + series.episodes, 0),
        outputDir: YEAR_DIR,
        timestamp: new Date().toISOString(),
        files: fs.readdirSync(YEAR_DIR)
    };
    
    const reportFile = path.join(YEAR_DIR, `test_report_${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`📝 التقرير: ${reportFile}`);
    console.log("\n" + "=".repeat(60));
    console.log("🎉 تم الانتهاء من الاختبار!");
    console.log("=".repeat(60));
    
    return { 
        success: true, 
        totalSeries: seriesList.length,
        outputDir: YEAR_DIR
    };
}

// معالجة الأخطاء
process.on('unhandledRejection', (error) => {
    console.error('\n💥 خطأ غير معالج:', error.message);
    console.error(error.stack);
    
    // محاولة حفظ خطأ
    try {
        const errorDir = path.join(__dirname, "errors");
        if (!fs.existsSync(errorDir)) {
            fs.mkdirSync(errorDir, { recursive: true });
        }
        
        const errorFile = path.join(errorDir, `error_${Date.now()}.json`);
        const errorData = {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            dir: __dirname
        };
        
        fs.writeFileSync(errorFile, JSON.stringify(errorData, null, 2));
        console.log(`📝 سجل الخطأ محفوظ في: ${errorFile}`);
    } catch (writeError) {
        console.log(`❌ فشل حفظ سجل الخطأ: ${writeError.message}`);
    }
    
    process.exit(1);
});

// التشغيل
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع في main:", error.message);
    console.error(error.stack);
    process.exit(1);
});
