import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const CATALOG_FILE = path.join(MOVIES_DIR, "catalog.json");

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
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

// ==================== استخراج ID من الرابط المختصر ====================
function extractMovieId(shortLink) {
    try {
        if (!shortLink) return null;
        const match = shortLink.match(/p=(\d+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة من meta tag ====================
function extractWatchServersFromMeta(doc) {
    const watchServers = [];
    
    try {
        // البحث عن meta tag الخاص برابط المشاهدة
        const metaVideo = doc.querySelector('meta[property="og:video:url"]');
        
        if (metaVideo && metaVideo.content) {
            const videoUrl = metaVideo.content;
            
            // إضافة سيرفر المشاهدة الرئيسي
            watchServers.push({
                type: "embed",
                url: videoUrl,
                quality: "متعدد الجودات"
            });
            
            console.log(`   ✅ عثر على رابط مشاهدة في meta tag`);
        }
        
        // البحث عن سيرفرات مشاهدة إضافية في القائمة
        const watchServerList = doc.querySelector('.watch--servers--list');
        
        if (watchServerList) {
            const serverItems = watchServerList.querySelectorAll('.server--item');
            
            serverItems.forEach(item => {
                const serverName = item.querySelector('span')?.textContent?.trim() || 'غير معروف';
                const serverId = item.getAttribute('data-server');
                const movieId = item.getAttribute('data-id');
                
                // إنشاء رابط للمشاهدة بناءً على ID
                if (movieId && serverId) {
                    const watchUrl = `https://topcinema.rip/?p=${movieId}&server=${serverId}`;
                    
                    watchServers.push({
                        type: "server",
                        url: watchUrl,
                        quality: "متعدد الجودات",
                        server: serverName
                    });
                }
            });
            
            console.log(`   ✅ عثر على ${serverItems.length} سيرفر مشاهدة إضافي`);
        }
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
    }
    
    return watchServers;
}

// ==================== استخراج سيرفرات التحميل من DownloadBox ====================
function extractDownloadServersFromPage(doc) {
    const downloadServers = [];
    
    try {
        // البحث عن قسم التحميل الرئيسي
        const downloadBox = doc.querySelector('.DownloadBox');
        
        if (!downloadBox) {
            console.log(`   ⚠️ لم يتم العثور على قسم التحميل`);
            return downloadServers;
        }
        
        // استخراج السيرفرات الاحترافية (Pro)
        const proServer = downloadBox.querySelector('.proServer a.downloadsLink');
        
        if (proServer && proServer.href) {
            const serverText = proServer.querySelector('.text span')?.textContent?.trim() || '';
            const serverName = proServer.querySelector('.text p')?.textContent?.trim() || 'VidTube';
            const quality = serverText.includes('متعدد') ? 'متعدد الجودات' : 'غير محدد';
            
            downloadServers.push({
                server: serverName,
                url: proServer.href,
                quality: quality,
                type: "pro"
            });
            
            console.log(`   ✅ سيرفر Pro: ${serverName}`);
        }
        
        // استخراج جميع كتل التحميل
        const downloadBlocks = downloadBox.querySelectorAll('.DownloadBlock');
        
        downloadBlocks.forEach(block => {
            // استخراج جودة هذا القسم
            const titleElement = block.querySelector('.download-title');
            let blockQuality = "غير محدد";
            
            if (titleElement) {
                const qualitySpan = titleElement.querySelector('span');
                if (qualitySpan) {
                    blockQuality = qualitySpan.textContent.trim();
                } else {
                    const titleText = titleElement.textContent.trim();
                    const qualityMatch = titleText.match(/(\d+p|متعدد)/i);
                    if (qualityMatch) {
                        blockQuality = qualityMatch[1];
                    }
                }
            }
            
            // استخراج جميع روابط التحميل في هذه الكتلة
            const downloadLinks = block.querySelectorAll('.download-items .downloadsLink');
            
            downloadLinks.forEach(link => {
                const serverSpan = link.querySelector('.text span');
                const qualityP = link.querySelector('.text p');
                
                const serverName = serverSpan?.textContent?.trim() || 'غير معروف';
                const linkQuality = qualityP?.textContent?.trim() || blockQuality;
                const url = link.href;
                
                // تحديد نوع السيرفر
                let serverType = "normal";
                if (link.classList.contains('green')) {
                    serverType = "recommended";
                }
                
                downloadServers.push({
                    server: serverName,
                    url: url,
                    quality: linkQuality,
                    type: serverType
                });
            });
        });
        
        console.log(`   ✅ عثر على ${downloadServers.length} سيرفر تحميل`);
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
    }
    
    return downloadServers;
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ عثر على ${movieElements.length} فيلم`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const title = element.querySelector('.title')?.textContent || 
                              element.textContent || 
                              `فيلم ${i + 1}`;
                
                movies.push({
                    title: title.trim(),
                    url: movieUrl,
                    page: pageNum,
                    position: i + 1
                });
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم الرئيسية ====================
async function fetchMovieDetails(movie) {
    console.log(`🎬 ${movie.title.substring(0, 40)}...`);
    
    const html = await fetchWithTimeout(movie.url);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const movieId = shortLink ? extractMovieId(shortLink) : null;
        
        if (!movieId) {
            console.log(`   ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // 2. البيانات الأساسية (الاسم، الصورة، ID)
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        // 3. القصة
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
        // 4. التفاصيل الأساسية
        const details = {
            category: [],
            genres: [],
            quality: [],
            duration: "",
            releaseYear: [],
            language: [],
            actors: []
        };
        
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = labelElement.textContent.replace(":", "").trim();
                const links = item.querySelectorAll("a");
                
                if (links.length > 0) {
                    const values = Array.from(links).map(a => a.textContent.trim());
                    
                    if (label.includes("قسم الفيلم")) {
                        details.category = values;
                    } else if (label.includes("نوع الفيلم")) {
                        details.genres = values;
                    } else if (label.includes("جودة الفيلم")) {
                        details.quality = values;
                    } else if (label.includes("موعد الصدور")) {
                        details.releaseYear = values;
                    } else if (label.includes("لغة الفيلم")) {
                        details.language = values;
                    } else if (label.includes("بطولة")) {
                        details.actors = values;
                    }
                } else {
                    const text = item.textContent.trim();
                    const value = text.split(":").slice(1).join(":").trim();
                    
                    if (label.includes("توقيت الفيلم")) {
                        details.duration = value;
                    }
                }
            }
        });
        
        // 5. استخراج سيرفرات المشاهدة من meta tag
        const watchServers = extractWatchServersFromMeta(doc);
        
        // 6. استخراج سيرفرات التحميل من DownloadBox
        const downloadServers = extractDownloadServersFromPage(doc);
        
        console.log(`   📺 سيرفرات مشاهدة: ${watchServers.length}`);
        console.log(`   ⬇️ سيرفرات تحميل: ${downloadServers.length}`);
        
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchServers: watchServers,
            downloadServers: downloadServers,
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ الصفحة ====================
function savePage(pageNum, pageData, moviesData) {
    const fileName = pageNum === 1 ? "Home.json" : `${pageNum}.json`;
    const filePath = path.join(MOVIES_DIR, fileName);
    
    const pageContent = {
        page: pageNum,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ ${fileName} بـ ${moviesData.length} فيلم`);
    
    return fileName;
}

// ==================== تحديث السجل (الكاتالوج) ====================
function updateCatalog(moviesData, pageNum) {
    try {
        let catalog = { movies: [] };
        
        if (fs.existsSync(CATALOG_FILE)) {
            catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
        }
        
        moviesData.forEach(movie => {
            if (movie && movie.id && movie.title) {
                const existingIndex = catalog.movies.findIndex(m => m.id === movie.id);
                
                if (existingIndex === -1) {
                    catalog.movies.push({
                        id: movie.id,
                        title: movie.title,
                        image: movie.image,
                        page: pageNum,
                        watchServers: movie.watchServers?.length || 0,
                        downloadServers: movie.downloadServers?.length || 0,
                        addedAt: new Date().toISOString()
                    });
                } else {
                    catalog.movies[existingIndex] = {
                        ...catalog.movies[existingIndex],
                        title: movie.title,
                        image: movie.image,
                        watchServers: movie.watchServers?.length || 0,
                        downloadServers: movie.downloadServers?.length || 0,
                        updatedAt: new Date().toISOString()
                    };
                }
            }
        });
        
        catalog.lastUpdated = new Date().toISOString();
        catalog.totalMovies = catalog.movies.length;
        catalog.totalPages = pageNum;
        
        fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
        console.log(`📒 تحديث السجل: ${catalog.movies.length} فيلم`);
        
        return catalog;
        
    } catch (error) {
        console.log(`❌ خطأ في تحديث السجل: ${error.message}`);
        return null;
    }
}

// ==================== معالجة صفحة واحدة ====================
async function processPage(pageNum) {
    console.log(`\n========================================`);
    console.log(`🚀 معالجة الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}`);
    console.log(`========================================`);
    
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`⏹️ لا توجد أفلام في هذه الصفحة`);
        return { success: false, total: 0 };
    }
    
    const moviesData = [];
    
    console.log(`🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        const details = await fetchMovieDetails(movie);
        
        if (details && details.id) {
            moviesData.push(details);
            console.log(`   ✅ ${i + 1}/${pageData.movies.length}: ${details.title.substring(0, 30)}...`);
        } else {
            console.log(`   ⏭️ تخطي الفيلم ${i + 1}`);
        }
        
        // انتظار قصير بين الأفلام
        if (i < pageData.movies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
    if (moviesData.length > 0) {
        savePage(pageNum, pageData, moviesData);
        updateCatalog(moviesData, pageNum);
        
        console.log(`\n✅ تم حفظ الصفحة ${pageNum} بنجاح`);
        console.log(`📊 الأفلام المحفوظة: ${moviesData.length}`);
        
        // عرض ملخص للسيرفرات
        const totalWatch = moviesData.reduce((sum, m) => sum + (m.watchServers?.length || 0), 0);
        const totalDownload = moviesData.reduce((sum, m) => sum + (m.downloadServers?.length || 0), 0);
        console.log(`📺 إجمالي سيرفرات المشاهدة: ${totalWatch}`);
        console.log(`⬇️ إجمالي سيرفرات التحميل: ${totalDownload}`);
        
        // عرض عينة من الأفلام مع سيرفراتها
        if (moviesData.length > 0) {
            const sampleMovie = moviesData[0];
            console.log(`\n📋 عينة من فيلم واحد:`);
            console.log(`   العنوان: ${sampleMovie.title.substring(0, 40)}`);
            console.log(`   مشاهدة: ${sampleMovie.watchServers?.length || 0} سيرفر`);
            if (sampleMovie.watchServers?.length > 0) {
                sampleMovie.watchServers.forEach((server, idx) => {
                    console.log(`     ${idx + 1}. ${server.type}: ${server.url.substring(0, 50)}...`);
                });
            }
            console.log(`   تحميل: ${sampleMovie.downloadServers?.length || 0} سيرفر`);
            if (sampleMovie.downloadServers?.length > 0) {
                sampleMovie.downloadServers.slice(0, 3).forEach((server, idx) => {
                    console.log(`     ${idx + 1}. ${server.server} (${server.quality}): ${server.url.substring(0, 50)}...`);
                });
                if (sampleMovie.downloadServers.length > 3) {
                    console.log(`     ... و${sampleMovie.downloadServers.length - 3} أكثر`);
                }
            }
        }
        
        return { success: true, total: moviesData.length };
    }
    
    return { success: false, total: 0 };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج جميع الصفحات");
    console.log("=".repeat(50));
    
    const START_PAGE = 1;
    const MAX_PAGES = 50;
    
    let totalMovies = 0;
    let successfulPages = 0;
    let totalWatchServers = 0;
    let totalDownloadServers = 0;
    
    console.log(`⚙️ الإعدادات: من الصفحة ${START_PAGE} إلى ${MAX_PAGES}`);
    
    for (let pageNum = START_PAGE; pageNum <= MAX_PAGES; pageNum++) {
        console.log(`\n📊 الصفحات المكتملة: ${successfulPages}/${pageNum - START_PAGE}`);
        
        try {
            const result = await processPage(pageNum);
            
            if (result.success) {
                totalMovies += result.total;
                successfulPages++;
                
                // حساب السيرفرات من آخر صفحة معالجة
                const filePath = path.join(MOVIES_DIR, pageNum === 1 ? "Home.json" : `${pageNum}.json`);
                if (fs.existsSync(filePath)) {
                    const pageData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    const watchCount = pageData.movies.reduce((sum, m) => sum + (m.watchServers?.length || 0), 0);
                    const downloadCount = pageData.movies.reduce((sum, m) => sum + (m.downloadServers?.length || 0), 0);
                    totalWatchServers += watchCount;
                    totalDownloadServers += downloadCount;
                }
                
                console.log(`📈 الإجمالي حتى الآن: ${totalMovies} فيلم`);
                console.log(`📺 سيرفرات مشاهدة: ${totalWatchServers}`);
                console.log(`⬇️ سيرفرات تحميل: ${totalDownloadServers}`);
            } else {
                console.log(`⚠️ فشل في الصفحة ${pageNum}`);
            }
            
        } catch (error) {
            console.log(`💥 خطأ في الصفحة ${pageNum}: ${error.message}`);
        }
        
        // انتظار بين الصفحات
        if (pageNum < MAX_PAGES) {
            console.log(`⏳ انتظار 3 ثواني للصفحة التالية...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // ==================== النتائج النهائية ====================
    console.log("\n" + "=".repeat(50));
    console.log("🎉 انتهى استخراج جميع الصفحات");
    console.log("=".repeat(50));
    console.log(`📊 النتائج النهائية:`);
    console.log(`   - الصفحات المكتملة: ${successfulPages}`);
    console.log(`   - إجمالي الأفلام: ${totalMovies}`);
    console.log(`   - سيرفرات المشاهدة: ${totalWatchServers}`);
    console.log(`   - سيرفرات التحميل: ${totalDownloadServers}`);
    console.log(`   - سجل الكاتالوج: ${CATALOG_FILE}`);
    
    // قراءة و عرض ملخص السجل
    try {
        if (fs.existsSync(CATALOG_FILE)) {
            const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
            console.log(`   - الأفلام في السجل: ${catalog.totalMovies}`);
            
            console.log(`\n📋 عينة من السجل (أول 3 أفلام):`);
            catalog.movies.slice(0, 3).forEach((movie, idx) => {
                console.log(`   ${idx + 1}. ${movie.title} (ID: ${movie.id})`);
                console.log(`      مشاهدة: ${movie.watchServers} سيرفر | تحميل: ${movie.downloadServers} سيرفر`);
            });
        }
    } catch (error) {
        console.log(`   ❌ خطأ في قراءة السجل: ${error.message}`);
    }
    
    console.log("\n📁 الملفات المحفوظة:");
    try {
        const files = fs.readdirSync(MOVIES_DIR)
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => {
                if (a === 'Home.json') return -1;
                if (b === 'Home.json') return 1;
                if (a === 'catalog.json') return 1;
                if (b === 'catalog.json') return -1;
                return parseInt(a) - parseInt(b);
            });
        
        files.forEach(file => {
            const filePath = path.join(MOVIES_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                console.log(`   📄 ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
            } catch {
                console.log(`   📄 ${file}`);
            }
        });
    } catch (error) {
        console.log(`   ❌ خطأ في قراءة الملفات: ${error.message}`);
    }
    
    console.log("=".repeat(50));
    
    // حفظ التقرير النهائي
    const finalReport = {
        status: "completed",
        totalPages: successfulPages,
        totalMovies: totalMovies,
        totalWatchServers: totalWatchServers,
        totalDownloadServers: totalDownloadServers,
        catalogFile: CATALOG_FILE,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("final_report.json", JSON.stringify(finalReport, null, 2));
    console.log(`📝 التقرير النهائي محفوظ في final_report.json`);
}

// التشغيل
main().catch(error => {
    console.error("💥 خطأ غير متوقع:", error.message);
    
    const errorReport = {
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
});
