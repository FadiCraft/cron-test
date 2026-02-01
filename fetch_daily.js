import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const MOVIES_DIR = path.join(__dirname, "movies");
const OUTPUT_FILE = path.join(MOVIES_DIR, "Hg.json");

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

// ==================== استخراج سيرفرات المشاهدة من صفحة المشاهدة ====================
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
        
        // الحصول على جميع عناصر السيرفرات
        const serverElements = doc.querySelectorAll('.servers__list li');
        
        serverElements.forEach((server, index) => {
            const dataLink = server.getAttribute('data-link');
            const serverText = server.querySelector('span')?.textContent?.trim() || `سيرفر ${index + 1}`;
            const quality = server.getAttribute('data-qu') || '480';
            
            if (dataLink) {
                // تحويل الرابط النسبي إلى مطلق
                let finalUrl = dataLink;
                if (dataLink.startsWith('/')) {
                    finalUrl = `https://asd.pics${dataLink}`;
                }
                
                watchServers.push({
                    type: 'watch',
                    url: finalUrl,
                    quality: `${quality}p`,
                    server: serverText
                });
            }
        });
        
        // البحث عن روابط إضافية في الصفحة
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            const src = iframe.getAttribute('src');
            if (src && src.includes('embed')) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: `Iframe ${index + 1}`
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
        
        console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر مشاهدة`);
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج سيرفرات التحميل من صفحة التحميل ====================
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
        
        // البحث عن روابط التحميل في الصفحة
        const downloadLinks = doc.querySelectorAll('a[href*="download"], a[href*="down"]');
        
        downloadLinks.forEach((link, index) => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim() || `رابط تحميل ${index + 1}`;
            
            if (href && !href.includes('watch') && !href.startsWith('#')) {
                // محاولة تحديد الجودة من النص
                let quality = 'غير معروف';
                if (text.includes('480p') || text.includes('480')) quality = '480p';
                if (text.includes('720p') || text.includes('720')) quality = '720p';
                if (text.includes('1080p') || text.includes('1080')) quality = '1080p';
                if (text.includes('WEB-DL')) quality = 'WEB-DL';
                
                // محاولة تحديد اسم السيرفر
                let serverName = 'غير معروف';
                if (text.includes('سيرفر')) serverName = text.split('سيرفر')[1]?.trim() || text;
                if (text.includes('Server')) serverName = text.split('Server')[1]?.trim() || text;
                
                downloadServers.push({
                    server: serverName.substring(0, 30),
                    url: href,
                    quality: quality,
                    type: 'download'
                });
            }
        });
        
        // البحث عن أزرار التحميل
        const downloadButtons = doc.querySelectorAll('button[onclick*="download"], .download-btn, .download-button');
        
        downloadButtons.forEach((button, index) => {
            const onclick = button.getAttribute('onclick');
            if (onclick) {
                // استخراج الرابط من onclick
                const urlMatch = onclick.match(/['"](https?:\/\/[^'"]+)['"]/);
                if (urlMatch) {
                    downloadServers.push({
                        server: `زر تحميل ${index + 1}`,
                        url: urlMatch[1],
                        quality: 'غير معروف',
                        type: 'button'
                    });
                }
            }
        });
        
        // إزالة التكرارات
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
        ? "https://asd.pics/movies/"
        : `https://asd.pics/movies/page/${pageNum}/`;
    
    console.log(`📖 جلب الصفحة ${pageNum === 1 ? "الرئيسية" : pageNum}...`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // البحث عن عناصر الأفلام
        const movieElements = doc.querySelectorAll('.item__contents a.movie__block');
        
        if (movieElements.length === 0) {
            // محاولة البحث بطريقة أخرى
            const fallbackElements = doc.querySelectorAll('.box__xs__2 a, .box__sm__2 a, .box__md__3 a, .box__lg__4 a, .box__xl__5 a');
            movieElements = fallbackElements;
        }
        
        console.log(`✅ عثر على ${movieElements.length} فيلم`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('asd.pics')) {
                // استخراج العنوان
                const titleElement = element.querySelector('.post__info h3') || 
                                     element.querySelector('h3') ||
                                     element.querySelector('.post__info h2') ||
                                     element.querySelector('h2');
                
                let title = titleElement?.textContent?.trim();
                
                if (!title) {
                    // محاولة استخراج من alt الخاص بالصورة
                    const imgAlt = element.querySelector('img')?.alt;
                    title = imgAlt || `فيلم ${i + 1}`;
                }
                
                // استخراج التصنيف
                const category = element.querySelector('.post__category')?.textContent?.trim() || '';
                
                // استخراج الجودة
                const quality = element.querySelector('.__quality')?.textContent?.trim() || '';
                
                // استخراج التقييم
                const rating = element.querySelector('.post__ratings')?.textContent?.trim() || '';
                
                // استخراج النوع
                const genre = element.querySelector('.__genre')?.textContent?.trim() || '';
                
                movies.push({
                    title: title,
                    url: movieUrl,
                    category: category,
                    quality: quality,
                    rating: rating,
                    genre: genre,
                    page: pageNum,
                    position: i + 1
                });
            }
        });
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
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
        
        // 2. استخراج العنوان الرئيسي
        const title = doc.querySelector('.post__name')?.textContent?.trim() || movie.title;
        
        // 3. استخراج الصورة
        const image = doc.querySelector('.poster-img')?.src || 
                      doc.querySelector('.poster__single img')?.src ||
                      doc.querySelector('.image img')?.src ||
                      movie.image;
        
        // 4. استخراج القصة
        const story = doc.querySelector('.post__story p')?.textContent?.trim() || 
                      doc.querySelector('.story p')?.textContent?.trim() || 
                      "غير متوفر";
        
        // 5. استخراج التقييم
        const ratingElement = doc.querySelector('.imdbRating, .rating, .post__ratings');
        const rating = ratingElement?.textContent?.trim() || movie.rating || "";
        
        // 6. استخراج روابط المشاهدة والتحميل
        const watchLink = doc.querySelector('a.watch__btn')?.href;
        let downloadLink = doc.querySelector('a.download__btn')?.href;
        
        // إذا لم يكن هناك زر تحميل، نبحث عن رابط تحميل في الصفحة
        if (!downloadLink) {
            const downloadElement = doc.querySelector('a[href*="download"], a[href*="down"]');
            if (downloadElement && !downloadElement.href.includes('watch')) {
                downloadLink = downloadElement.href;
            }
        }
        
        // 7. استخراج التفاصيل من info__area
        const details = {
            category: [],
            genres: [],
            quality: [],
            duration: "",
            releaseYear: [],
            language: [],
            country: [],
            addedDate: "",
            actors: []
        };
        
        // استخراج التفاصيل من القائمة
        const infoItems = doc.querySelectorAll('.info__area__ul li');
        
        infoItems.forEach(item => {
            const titleKit = item.querySelector('.title__kit span')?.textContent?.trim();
            
            if (!titleKit) return;
            
            if (titleKit.includes('تصنيف العرض')) {
                const categoryLinks = item.querySelectorAll('a');
                details.category = Array.from(categoryLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('نوع العرض')) {
                const genreLinks = item.querySelectorAll('a');
                details.genres = Array.from(genreLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('مدة العرض')) {
                const durationLink = item.querySelector('a');
                details.duration = durationLink?.textContent?.trim() || 
                                  item.textContent.replace('مدة العرض :', '').trim();
            } 
            else if (titleKit.includes('سنة العرض')) {
                const yearLinks = item.querySelectorAll('a');
                details.releaseYear = Array.from(yearLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('لغة العرض')) {
                const languageLinks = item.querySelectorAll('a');
                details.language = Array.from(languageLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('جودة العرض')) {
                const qualityLinks = item.querySelectorAll('a');
                details.quality = Array.from(qualityLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('بلد العرض')) {
                const countryLinks = item.querySelectorAll('a');
                details.country = Array.from(countryLinks).map(a => a.textContent.trim());
            } 
            else if (titleKit.includes('تاريخ الاضافة')) {
                const dateLink = item.querySelector('a');
                details.addedDate = dateLink?.textContent?.trim() || 
                                   item.textContent.replace('تاريخ الاضافة :', '').trim();
            }
        });
        
        // 8. جلب سيرفرات المشاهدة والتحميل إذا كانت الروابط متوفرة
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            console.log(`   📺 جلب صفحة المشاهدة...`);
            watchServers = await fetchWatchServers(watchLink);
            await new Promise(resolve => setTimeout(resolve, 500)); // انتظار أطول
        }
        
        if (downloadLink) {
            console.log(`   💾 جلب صفحة التحميل...`);
            downloadServers = await fetchDownloadServers(downloadLink);
            await new Promise(resolve => setTimeout(resolve, 500)); // انتظار أطول
        }
        
        return {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            rating: rating,
            story: story,
            details: details,
            watchServers: watchServers,
            downloadServers: downloadServers,
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
        return null;
    }
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(pageData, moviesData) {
    const pageContent = {
        page: 1,
        url: pageData.url,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ البيانات في Hg.json بـ ${moviesData.length} فيلم`);
    
    return OUTPUT_FILE;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 بدء استخراج الأفلام من asd.pics");
    console.log("=".repeat(50));
    
    const pageNum = 1;
    
    // جلب الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || pageData.movies.length === 0) {
        console.log(`⏹️ لا توجد أفلام في الصفحة`);
        return { success: false, total: 0 };
    }
    
    const moviesData = [];
    
    console.log(`🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    // استخراج كل الأفلام
    for (let i = 0; i < pageData.movies.length; i++) {
        const movie = pageData.movies[i];
        
        console.log(`\n📝 الفيلم ${i + 1}/${pageData.movies.length}: ${movie.title.substring(0, 30)}...`);
        
        const details = await fetchMovieDetails(movie);
        
        if (details && details.id) {
            moviesData.push(details);
            console.log(`   ✅ تم استخراج الفيلم بنجاح`);
            console.log(`     📊 ID: ${details.id}`);
            console.log(`     👁️  مشاهدة: ${details.watchServers?.length || 0} سيرفر`);
            console.log(`     📥 تحميل: ${details.downloadServers?.length || 0} سيرفر`);
        } else {
            console.log(`   ⏭️ تخطي الفيلم ${i + 1}`);
        }
        
        // انتظار بين الأفلام لمنع الحظر
        if (i < pageData.movies.length - 1) {
            const delay = 1500 + Math.random() * 1000; // بين 1.5 و 2.5 ثانية
            console.log(`   ⏳ انتظار ${Math.round(delay/1000)} ثانية...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // حفظ البيانات في Hg.json
    if (moviesData.length > 0) {
        const savedFile = saveToHgFile(pageData, moviesData);
        
        console.log(`\n✅ تم حفظ الصفحة الأولى بنجاح في ${savedFile}`);
        console.log(`📊 الأفلام المحفوظة: ${moviesData.length}`);
        
        // عرض إحصائيات
        console.log(`📋 إحصائيات:`);
        const totalWatchServers = moviesData.reduce((sum, movie) => sum + (movie.watchServers?.length || 0), 0);
        const totalDownloadServers = moviesData.reduce((sum, movie) => sum + (movie.downloadServers?.length || 0), 0);
        
        console.log(`   - إجمالي سيرفرات المشاهدة: ${totalWatchServers}`);
        console.log(`   - إجمالي سيرفرات التحميل: ${totalDownloadServers}`);
        
        // عرض عينة من البيانات المحفوظة
        console.log(`\n📋 عينة من البيانات المحفوظة:`);
        if (moviesData.length > 0) {
            const sampleMovie = moviesData[0];
            console.log(`   1. ID: ${sampleMovie.id}`);
            console.log(`      العنوان: ${sampleMovie.title.substring(0, 40)}...`);
            console.log(`      جودة: ${sampleMovie.details.quality.join(', ') || 'غير محدد'}`);
            console.log(`      سنة العرض: ${sampleMovie.details.releaseYear.join(', ') || 'غير محدد'}`);
            console.log(`      التقييم: ${sampleMovie.rating || 'غير متوفر'}`);
            
            if (sampleMovie.watchServers && sampleMovie.watchServers.length > 0) {
                console.log(`      سيرفر مشاهدة مثال: ${sampleMovie.watchServers[0].server} - ${sampleMovie.watchServers[0].quality}`);
            }
            
            if (sampleMovie.downloadServers && sampleMovie.downloadServers.length > 0) {
                console.log(`      سيرفر تحميل مثال: ${sampleMovie.downloadServers[0].server} - ${sampleMovie.downloadServers[0].quality}`);
            }
        }
        
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
        
        return { success: true, total: moviesData.length };
    }
    
    console.log(`⚠️ لم يتم استخراج أي أفلام`);
    return { success: false, total: 0 };
}

// التشغيل
main().catch(error => {
    console.error("💥 خطأ غير متوقع:", error.message);
    
    const errorReport = {
        error: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
    console.log("📝 تم حفظ تقرير الخطأ في error.json");
});
