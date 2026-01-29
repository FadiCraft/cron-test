import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");

// إنشاء مجلد movies إذا لم يكن موجوداً
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
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
            console.log(`⏱️ انتهى الوقت للموقع: ${url}`);
        }
        return null;
    }
}

// ==================== اكتشاف عدد الصفحات الكلي ====================
async function getTotalPages(baseUrl = "https://topcinema.rip/movies/") {
    console.log("🔍 جارٍ اكتشاف عدد الصفحات...");
    
    const html = await fetchWithTimeout(baseUrl);
    
    if (!html) {
        console.log("❌ فشل جلب الصفحة الرئيسية لاكتشاف عدد الصفحات");
        return 1; // نعود للصفحة الأولى فقط في حالة الفشل
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن عناصر الترقيم
        const paginationElements = doc.querySelectorAll('.pagination a, .page-numbers a');
        
        let maxPage = 1;
        
        paginationElements.forEach(element => {
            const href = element.getAttribute('href');
            if (href && href.includes('/page/')) {
                const pageMatch = href.match(/\/page\/(\d+)\//);
                if (pageMatch) {
                    const pageNum = parseInt(pageMatch[1]);
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            }
            
            // أيضًا التحقق من نص الصفحة
            const text = element.textContent.trim();
            if (text && /^\d+$/.test(text)) {
                const pageNum = parseInt(text);
                if (pageNum > maxPage) {
                    maxPage = pageNum;
                }
            }
        });
        
        // إذا لم نجد صفحات متعددة، نبحث عن آخر صفحة
        const lastPageElement = doc.querySelector('.last-page, .last, .pagination .last a');
        if (lastPageElement) {
            const href = lastPageElement.getAttribute('href');
            if (href && href.includes('/page/')) {
                const pageMatch = href.match(/\/page\/(\d+)\//);
                if (pageMatch) {
                    maxPage = parseInt(pageMatch[1]);
                }
            }
        }
        
        console.log(`✅ تم اكتشاف ${maxPage} صفحة`);
        return maxPage;
        
    } catch (error) {
        console.log(`❌ خطأ في اكتشاف عدد الصفحات: ${error.message}`);
        return 1;
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

// ==================== استخراج جميع سيرفرات المشاهدة من صفحة المشاهدة ====================
async function fetchWatchServers(watchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة...`);
    
    const html = await fetchWithTimeout(watchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // 1. البحث عن جميع الروابط التي تحتوي على كلمة "embed"
        const allLinks = doc.querySelectorAll('a[href*="embed"], a[href*="watch"]');
        allLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes('embed')) {
                // استخراج اسم السيرفر من النص أو الرابط
                let serverName = 'غير معروف';
                const text = link.textContent?.trim();
                if (text && text.length > 0) {
                    serverName = text;
                } else {
                    // استخراج اسم السيرفر من الرابط
                    const domainMatch = href.match(/https?:\/\/(?:www\.)?([^\/]+)/);
                    if (domainMatch) {
                        serverName = domainMatch[1].split('.')[0];
                    }
                }
                
                watchServers.push({
                    type: 'embed',
                    url: href,
                    quality: 'متعدد الجودات',
                    server: serverName
                });
            }
        });
        
        // 2. البحث في محتوى meta tags
        const metaElements = doc.querySelectorAll('meta');
        metaElements.forEach(meta => {
            const content = meta.getAttribute('content');
            if (content && content.includes('embed')) {
                watchServers.push({
                    type: 'embed',
                    url: content,
                    quality: 'متعدد الجودات',
                    server: 'Embed Server'
                });
            }
        });
        
        // 3. البحث في iframes
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src && src.includes('embed')) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: 'Iframe Embed'
                });
            }
        });
        
        // 4. البحث عن روابط JavaScript أو data attributes
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const scriptContent = script.textContent;
            if (scriptContent && scriptContent.includes('embed')) {
                const embedMatch = scriptContent.match(/https?[^"\s]*embed[^"\s]*/g);
                if (embedMatch) {
                    embedMatch.forEach(url => {
                        watchServers.push({
                            type: 'js_embed',
                            url: url,
                            quality: 'متعدد الجودات',
                            server: 'JavaScript Embed'
                        });
                    });
                }
            }
        });
        
        // 5. إزالة التكرارات
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

// ==================== استخراج جميع سيرفرات التحميل من صفحة التحميل ====================
async function fetchDownloadServers(downloadUrl) {
    console.log(`   🔍 جلب سيرفرات التحميل...`);
    
    const html = await fetchWithTimeout(downloadUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة التحميل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const downloadServers = [];
        
        // 1. استخراج سيرفرات Pro (المميزة)
        const proServerElements = doc.querySelectorAll('.proServer a.downloadsLink');
        proServerElements.forEach(server => {
            const nameElement = server.querySelector('.text span');
            const providerElement = server.querySelector('.text p');
            
            const serverName = nameElement?.textContent?.trim() || 'متعدد الجودات';
            const provider = providerElement?.textContent?.trim() || 'غير معروف';
            const url = server.getAttribute('href') || '';
            
            if (url) {
                downloadServers.push({
                    server: provider,
                    url: url,
                    quality: serverName,
                    type: 'pro'
                });
            }
        });
        
        // 2. استخراج جميع روابط التحميل من جميع الكتل
        const allDownloadLinks = doc.querySelectorAll('.download-items li a.downloadsLink');
        allDownloadLinks.forEach(link => {
            const providerElement = link.querySelector('.text span');
            const qualityElement = link.querySelector('.text p');
            
            const provider = providerElement?.textContent?.trim() || 'غير معروف';
            const quality = qualityElement?.textContent?.trim() || 'غير معروف';
            const url = link.getAttribute('href') || '';
            
            if (url && !link.closest('.proServer')) { // استبعاد روابط Pro لأننا أخذناها بالفعل
                downloadServers.push({
                    server: provider,
                    url: url,
                    quality: quality,
                    type: 'normal'
                });
            }
        });
        
        // 3. البحث عن روابط تحميل إضافية في الصفحة
        const allLinks = doc.querySelectorAll('a[href*="download"], a[href*="down"], a[href*="dl"]');
        allLinks.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();
            
            if (href && !href.includes('topcinema.rip')) {
                // محاولة استخراج اسم السيرفر
                let serverName = 'غير معروف';
                let quality = 'غير معروف';
                
                if (text) {
                    const parts = text.split(' ');
                    if (parts.length > 0) {
                        serverName = parts[0];
                        if (parts.length > 1) {
                            quality = parts.slice(1).join(' ');
                        }
                    }
                }
                
                // إذا لم يكن الرابط موجوداً بالفعل في القائمة
                const alreadyExists = downloadServers.some(s => s.url === href);
                if (!alreadyExists && !href.startsWith('#')) {
                    downloadServers.push({
                        server: serverName,
                        url: href,
                        quality: quality,
                        type: 'additional'
                    });
                }
            }
        });
        
        // 4. إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        
        downloadServers.forEach(server => {
            if (!seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر تحميل`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return [];
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum = 1) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum}...`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        const movieElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ عثر على ${movieElements.length} فيلم في الصفحة ${pageNum}`);
        
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
        
        return { url, page: pageNum, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة ${pageNum}: ${error.message}`);
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
        
        // 4. استخراج روابط المشاهدة والتحميل
        const watchLink = doc.querySelector('a.watch')?.getAttribute('href');
        const downloadLink = doc.querySelector('a.download')?.getAttribute('href');
        
        // 5. التفاصيل الأساسية
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
        
        // 6. جلب سيرفرات المشاهدة والتحميل إذا كانت الروابط متوفرة
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            watchServers = await fetchWatchServers(watchLink);
            await new Promise(resolve => setTimeout(resolve, 500)); // انتظار أطول لتجنب الحظر
        }
        
        if (downloadLink) {
            downloadServers = await fetchDownloadServers(downloadLink);
            await new Promise(resolve => setTimeout(resolve, 500)); // انتظار أطول لتجنب الحظر
        }
        
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
        console.log(`   ❌ خطأ في استخراج تفاصيل الفيلم: ${error.message}`);
        return null;
    }
}

// ==================== حفظ البيانات لكل صفحة ====================
function savePageToFile(pageData, moviesData, pageNum) {
    const outputFile = path.join(MOVIES_DIR, `${pageNum}.json`);
    
    const pageContent = {
        page: pageNum,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ البيانات في ${pageNum}.json بـ ${moviesData.length} فيلم`);
    
    return outputFile;
}

// ==================== حفظ ملف ملخص بجميع الصفحات ====================
function saveSummaryFile(totalPages, successfulPages) {
    const summaryFile = path.join(MOVIES_DIR, "summary.json");
    
    const summary = {
        totalPages: totalPages,
        successfulPages: successfulPages,
        scrapedAt: new Date().toISOString(),
        totalMovies: 0,
        pages: []
    };
    
    // حساب إجمالي الأفلام وجمع معلومات الصفحات
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageFile = path.join(MOVIES_DIR, `${pageNum}.json`);
        
        if (fs.existsSync(pageFile)) {
            try {
                const pageData = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
                summary.totalMovies += pageData.totalMovies;
                summary.pages.push({
                    page: pageNum,
                    file: `${pageNum}.json`,
                    totalMovies: pageData.totalMovies,
                    url: pageData.url
                });
            } catch (error) {
                console.log(`⚠️ خطأ في قراءة ملف الصفحة ${pageNum}: ${error.message}`);
            }
        }
    }
    
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`📋 حفظ ملف الملخص في summary.json`);
    
    return summaryFile;
}

// ==================== استخراج صفحة واحدة ====================
async function processSinglePage(pageNum, delayBetweenMovies = 1000) {
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`🎬 بدء استخراج الصفحة ${pageNum}`);
    console.log(`═══════════════════════════════════════════\n`);
    
    // جلب الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`⏹️ لا توجد أفلام في الصفحة ${pageNum}`);
        return { success: false, total: 0, page: pageNum };
    }
    
    const moviesData = [];
    
    console.log(`🔍 استخراج تفاصيل ${pageData.movies.length} فيلم في الصفحة ${pageNum}...`);
    
    // استخراج كل الأفلام في الصفحة
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        console.log(`\n   ${i + 1}/${pageData.movies.length}: ${movie.title.substring(0, 50)}...`);
        
        const details = await fetchMovieDetails(movie);
        
        if (details && details.id) {
            moviesData.push(details);
            console.log(`     ✅ تم استخراج الفيلم بنجاح`);
            console.log(`     👁️  مشاهدة: ${details.watchServers?.length || 0} سيرفر`);
            console.log(`     📥 تحميل: ${details.downloadServers?.length || 0} سيرفر`);
        } else {
            console.log(`     ⏭️ تخطي الفيلم`);
        }
        
        // انتظار بين الأفلام لتجنب الحظر
        if (i < pageData.movies.length - 1) {
            const delay = Math.floor(delayBetweenMovies + Math.random() * 500); // إضافة عشوائية
            console.log(`     ⏳ انتظار ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // حفظ البيانات في ملف الصفحة
    if (moviesData.length > 0) {
        const savedFile = savePageToFile(pageData, moviesData, pageNum);
        
        console.log(`\n✅ تم حفظ الصفحة ${pageNum} بنجاح في ${savedFile}`);
        console.log(`📊 الأفلام المحفوظة: ${moviesData.length}`);
        
        return { 
            success: true, 
            total: moviesData.length, 
            page: pageNum,
            file: savedFile 
        };
    }
    
    return { success: false, total: 0, page: pageNum };
}

// ==================== الدالة الرئيسية (جميع الصفحات) ====================
async function main() {
    console.log("🎬 بدء استخراج جميع الصفحات من موقع TopCinema");
    console.log("=".repeat(60));
    
    // اكتشاف عدد الصفحات الكلي
    const totalPages = await getTotalPages();
    
    if (totalPages <= 0) {
        console.log("❌ لم يتم العثور على صفحات للاستخراج");
        return { success: false };
    }
    
    console.log(`\n🔢 سيتم استخراج ${totalPages} صفحة`);
    
    const delayBetweenPages = 2000; // انتظار 2 ثانية بين الصفحات
    const successfulPages = [];
    const failedPages = [];
    
    // معالجة كل صفحة على حدة
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
            // معالجة الصفحة
            const result = await processSinglePage(pageNum);
            
            if (result.success) {
                successfulPages.push(pageNum);
                console.log(`\n✅ الصفحة ${pageNum}: ${result.total} فيلم`);
            } else {
                failedPages.push(pageNum);
                console.log(`\n❌ فشل استخراج الصفحة ${pageNum}`);
            }
            
            // انتظار بين الصفحات (ما عدا الصفحة الأخيرة)
            if (pageNum < totalPages) {
                console.log(`\n⏳ انتظار ${delayBetweenPages}ms قبل الصفحة التالية...\n`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenPages));
            }
            
        } catch (error) {
            console.log(`\n💥 خطأ غير متوقع في الصفحة ${pageNum}: ${error.message}`);
            failedPages.push(pageNum);
            
            // انتظار قبل المحاولة التالية
            if (pageNum < totalPages) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenPages * 2));
            }
        }
    }
    
    // حفظ ملف الملخص
    const summaryFile = saveSummaryFile(totalPages, successfulPages);
    
    // عرض التقرير النهائي
    console.log("\n" + "=".repeat(60));
    console.log("📊 التقرير النهائي");
    console.log("=".repeat(60));
    console.log(`📄 إجمالي الصفحات: ${totalPages}`);
    console.log(`✅ الصفحات الناجحة: ${successfulPages.length} (${successfulPages.join(', ')})`);
    console.log(`❌ الصفحات الفاشلة: ${failedPages.length} (${failedPages.join(', ')})`);
    
    // حساب إجمالي الأفلام
    let totalMovies = 0;
    successfulPages.forEach(pageNum => {
        const pageFile = path.join(MOVIES_DIR, `${pageNum}.json`);
        if (fs.existsSync(pageFile)) {
            try {
                const pageData = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
                totalMovies += pageData.totalMovies;
            } catch (error) {
                console.log(`⚠️ خطأ في قراءة ملف الصفحة ${pageNum}`);
            }
        }
    });
    
    console.log(`🎬 إجمالي الأفلام المستخرجة: ${totalMovies}`);
    console.log(`📁 الملفات المحفوظة في مجلد: ${MOVIES_DIR}`);
    console.log(`📋 ملف الملخص: ${summaryFile}`);
    
    // إنشاء ملف الفهرس
    const indexFile = path.join(MOVIES_DIR, "index.txt");
    const indexContent = [
        "فهرس ملفات الأفلام المستخرجة",
        "=================================",
        `تاريخ الاستخراج: ${new Date().toISOString()}`,
        `إجمالي الصفحات: ${totalPages}`,
        `الصفحات الناجحة: ${successfulPages.length}`,
        `إجمالي الأفلام: ${totalMovies}`,
        "",
        "قائمة الملفات:",
        ...successfulPages.map(pageNum => `${pageNum}.json`)
    ].join("\n");
    
    fs.writeFileSync(indexFile, indexContent, 'utf8');
    console.log(`📝 ملف الفهرس: ${indexFile}`);
    
    return {
        success: successfulPages.length > 0,
        totalPages: totalPages,
        successfulPages: successfulPages.length,
        failedPages: failedPages.length,
        totalMovies: totalMovies,
        summaryFile: summaryFile
    };
}

// ==================== تشغيل البرنامج ====================
main()
    .then(result => {
        console.log("\n" + "=".repeat(60));
        console.log("🎉 اكتمل الاستخراج بنجاح!");
        console.log("=".repeat(60));
        
        if (result.success) {
            console.log(`✅ تم استخراج ${result.totalMovies} فيلم من ${result.successfulPages} صفحة`);
        } else {
            console.log("⚠️ لم يتم استخراج أي أفلام بنجاح");
        }
    })
    .catch(error => {
        console.error("\n💥 خطأ غير متوقع في البرنامج:", error.message);
        
        const errorReport = {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };
        
        const errorFile = path.join(MOVIES_DIR, "error.json");
        fs.writeFileSync(errorFile, JSON.stringify(errorReport, null, 2));
        console.log(`📁 تم حفظ تقرير الخطأ في: ${errorFile}`);
    });
