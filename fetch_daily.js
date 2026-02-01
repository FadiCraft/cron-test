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
async function fetchWithTimeout(url, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`   ⚠️ استجابة غير ناجحة: ${response.status} ${response.statusText}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`   ⏱️ انتهى الوقت لجلب ${url}`);
        } else {
            console.log(`   ❌ خطأ في جلب ${url}: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط المختصر ====================
function extractMovieId(shortLink) {
    try {
        if (!shortLink) return null;
        // محاولة مطابقة p=رقم
        const match = shortLink.match(/p=(\d+)/);
        if (match) return match[1];
        
        // محاولة مطابقة الرقم مباشرة في الرابط
        const match2 = shortLink.match(/\/(\d+)\/?$/);
        if (match2) return match2[1];
        
        return null;
    } catch {
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة ====================
async function fetchWatchServers(watchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة من: ${watchUrl}`);
    
    const html = await fetchWithTimeout(watchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // 1. البحث عن عناصر السيرفرات في watch__servers__list
        const serverContainers = doc.querySelectorAll('.watch__servers__list, .servers__list, .server-list');
        
        serverContainers.forEach(container => {
            const serverItems = container.querySelectorAll('li, .server-item, [data-server]');
            
            serverItems.forEach((item, index) => {
                const dataLink = item.getAttribute('data-link') || 
                                item.getAttribute('data-url') ||
                                item.querySelector('a')?.href;
                
                if (dataLink) {
                    const serverText = item.querySelector('span, .server-name')?.textContent?.trim() || 
                                      `سيرفر ${index + 1}`;
                    
                    const quality = item.getAttribute('data-qu') || 
                                   item.getAttribute('data-quality') || 
                                   '480';
                    
                    let finalUrl = dataLink;
                    if (dataLink.startsWith('/')) {
                        finalUrl = `https://asd.pics${dataLink}`;
                    }
                    
                    watchServers.push({
                        type: 'watch',
                        url: finalUrl,
                        quality: `${quality}p`,
                        server: serverText,
                        source: 'data-link'
                    });
                }
            });
        });
        
        // 2. البحث عن روابط embed مباشرة في الصفحة
        const embedLinks = doc.querySelectorAll('a[href*="embed"], a[href*="play"], a[href*="watch"]');
        
        embedLinks.forEach((link, index) => {
            const href = link.href;
            if (href && (href.includes('embed') || href.includes('play'))) {
                const linkText = link.textContent?.trim() || `رابط ${index + 1}`;
                
                watchServers.push({
                    type: 'embed',
                    url: href,
                    quality: 'متعدد الجودات',
                    server: linkText,
                    source: 'direct-link'
                });
            }
        });
        
        // 3. البحث في iframes
        const iframes = doc.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            const src = iframe.src;
            if (src && (src.includes('embed') || src.includes('video') || src.includes('player'))) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: `Iframe ${index + 1}`,
                    source: 'iframe'
                });
            }
        });
        
        // 4. البحث في scripts عن روابط
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (content) {
                const embedMatches = content.match(/(https?:\/\/[^"'\s]*embed[^"'\s]*)/g);
                if (embedMatches) {
                    embedMatches.forEach((url, index) => {
                        watchServers.push({
                            type: 'js-embed',
                            url: url,
                            quality: 'متعدد الجودات',
                            server: `JS Embed ${index + 1}`,
                            source: 'javascript'
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
        
        if (uniqueServers.length > 0) {
            console.log('   📋 قائمة السيرفرات:');
            uniqueServers.forEach((server, i) => {
                console.log(`     ${i + 1}. ${server.server} - ${server.quality}`);
            });
        }
        
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return [];
    }
}

// ==================== استخراج سيرفرات التحميل ====================
async function fetchDownloadServers(downloadUrl) {
    console.log(`   🔍 جلب سيرفرات التحميل من: ${downloadUrl}`);
    
    const html = await fetchWithTimeout(downloadUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة التحميل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const downloadServers = [];
        
        // 1. البحث عن روابط تحميل مباشرة
        const downloadLinks = doc.querySelectorAll('a[href*="download"], a[href*="down"], a[href*="dl"], .download-link');
        
        downloadLinks.forEach((link, index) => {
            const href = link.href;
            const text = link.textContent?.trim() || link.getAttribute('title') || `رابط تحميل ${index + 1}`;
            
            if (href && !href.includes('javascript:') && !href.startsWith('#')) {
                // محاولة تحديد الجودة
                let quality = 'غير معروف';
                const qualityPatterns = [
                    { pattern: /480|480p/, value: '480p' },
                    { pattern: /720|720p/, value: '720p' },
                    { pattern: /1080|1080p/, value: '1080p' },
                    { pattern: /web.?dl|WEB.?DL/i, value: 'WEB-DL' },
                    { pattern: /bluray|Blu.?Ray/i, value: 'BluRay' }
                ];
                
                for (const pattern of qualityPatterns) {
                    if (pattern.pattern.test(text.toLowerCase())) {
                        quality = pattern.value;
                        break;
                    }
                }
                
                // محاولة تحديد اسم السيرفر
                let serverName = 'غير معروف';
                const serverPatterns = [
                    { pattern: /سيرفر|server/i, extract: (text) => text },
                    { pattern: /ميديافاير|mediafire/i, value: 'Mediafire' },
                    { pattern: /جوجل|google/i, value: 'Google Drive' },
                    { pattern: /ميجا|mega/i, value: 'MEGA' }
                ];
                
                for (const pattern of serverPatterns) {
                    if (pattern.pattern.test(text.toLowerCase())) {
                        serverName = pattern.value || (pattern.extract ? pattern.extract(text) : 'غير معروف');
                        break;
                    }
                }
                
                downloadServers.push({
                    type: 'download',
                    url: href,
                    quality: quality,
                    server: serverName.substring(0, 50),
                    text: text.substring(0, 100),
                    source: 'direct-link'
                });
            }
        });
        
        // 2. البحث في أزرار التحميل
        const downloadButtons = doc.querySelectorAll('button[onclick*="download"], .download-btn, [class*="download"]');
        
        downloadButtons.forEach((button, index) => {
            const onclick = button.getAttribute('onclick');
            if (onclick) {
                // استخراج الرابط من onclick
                const urlMatch = onclick.match(/(https?:\/\/[^'"]+)/);
                if (urlMatch) {
                    const buttonText = button.textContent?.trim() || `زر تحميل ${index + 1}`;
                    
                    downloadServers.push({
                        type: 'button',
                        url: urlMatch[1],
                        quality: 'غير معروف',
                        server: buttonText.substring(0, 50),
                        text: buttonText,
                        source: 'button-onclick'
                    });
                }
            }
        });
        
        // 3. البحث في جداول أو قوائم التحميل
        const downloadTables = doc.querySelectorAll('table, .download-table, .links-table');
        
        downloadTables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const link = row.querySelector('a');
                if (link && link.href && link.href.includes('download')) {
                    const rowText = row.textContent?.trim() || 'رابط تحميل';
                    downloadServers.push({
                        type: 'table',
                        url: link.href,
                        quality: 'غير معروف',
                        server: 'جدول تحميل',
                        text: rowText.substring(0, 100),
                        source: 'table'
                    });
                }
            });
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
        
        if (uniqueServers.length > 0) {
            console.log('   📋 قائمة السيرفرات:');
            uniqueServers.forEach((server, i) => {
                console.log(`     ${i + 1}. ${server.server} - ${server.quality}`);
            });
        }
        
        return uniqueServers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
        return [];
    }
}

// ==================== استخراج الأفلام من صفحة ====================
async function fetchMoviesFromPage(pageNum = 1) {
    const url = `https://asd.pics/movies/page/${pageNum}/`;
    console.log(`📖 جلب الصفحة ${pageNum}: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة ${pageNum}`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log(`✅ تم جلب الصفحة بنجاح`);
        
        // إضافة ديبق للبحث عن العناصر
        console.log(`🔍 البحث عن عناصر الأفلام...`);
        
        // محاولة استخراج جميع الروابط المحتملة للأفلام
        const allLinks = doc.querySelectorAll('a[href*="/20"]'); // روابط تحتوي على تواريخ
        console.log(`   عدد الروابط الكلي: ${allLinks.length}`);
        
        // محاولات متعددة للعثور على الأفلام
        const selectors = [
            '.item__contents a.movie__block',
            '.box__xs__2 a',
            '.box__sm__2 a',
            '.box__md__3 a',
            '.box__lg__4 a',
            '.box__xl__5 a',
            '.movie-item a',
            '.post-item a',
            'article a',
            '.grid-item a',
            '[class*="movie"] a',
            '[class*="film"] a',
            'a[href*="asd.pics"][href*="/20"]' // روابط تحتوي على asd.pics وتواريخ
        ];
        
        let movieElements = [];
        let selectorUsed = '';
        
        for (const selector of selectors) {
            const elements = doc.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`   ✅ وجد ${elements.length} عنصر باستخدام: ${selector}`);
                movieElements = elements;
                selectorUsed = selector;
                break;
            }
        }
        
        if (movieElements.length === 0) {
            console.log(`   ⚠️ لم يتم العثور على أفلام باستخدام الـ selectors المحددة`);
            
            // محاولة أخيرة: البحث عن جميع الروابط التي قد تكون أفلام
            const allPossibleLinks = doc.querySelectorAll('a[href*="asd.pics"]');
            console.log(`   🔍 البحث في جميع روابط asd.pics: ${allPossibleLinks.length} رابط`);
            
            allPossibleLinks.forEach(link => {
                const href = link.href;
                // تصفية الروابط التي تبدو كصفحات أفلام
                if (href && href.includes('asd.pics') && 
                    (href.includes('/20') || href.includes('/فيلم') || href.match(/\/[^\/]+\/[^\/]+\/$/))) {
                    movieElements.push(link);
                }
            });
            
            console.log(`   📊 بعد التصفية: ${movieElements.length} رابط محتمل`);
        }
        
        // معالجة العناصر التي تم العثور عليها
        movieElements.forEach((element, i) => {
            try {
                const movieUrl = element.href;
                
                if (movieUrl && movieUrl.includes('asd.pics')) {
                    // استخراج العنوان
                    let title = '';
                    
                    // محاولات متعددة لاستخراج العنوان
                    const titleSelectors = [
                        '.post__info h3',
                        'h3',
                        '.title',
                        '.movie-title',
                        'h2',
                        'img[alt]'
                    ];
                    
                    for (const titleSelector of titleSelectors) {
                        const titleElement = element.querySelector(titleSelector);
                        if (titleElement) {
                            if (titleSelector === 'img[alt]') {
                                title = titleElement.getAttribute('alt') || '';
                            } else {
                                title = titleElement.textContent?.trim() || '';
                            }
                            if (title) break;
                        }
                    }
                    
                    // إذا لم يتم العثور على عنوان، استخدام alt الخاص بالصورة
                    if (!title) {
                        const img = element.querySelector('img');
                        if (img) {
                            title = img.alt || img.getAttribute('title') || '';
                        }
                    }
                    
                    // إذا لم ينجح أي شيء، استخدام نص الرابط
                    if (!title) {
                        title = element.textContent?.trim() || '';
                    }
                    
                    // تنظيف العنوان
                    title = title.replace(/\s+/g, ' ').trim();
                    
                    if (!title) {
                        title = `فيلم ${i + 1}`;
                    }
                    
                    // استخراج معلومات إضافية إن وجدت
                    const category = element.querySelector('.post__category, .category')?.textContent?.trim() || '';
                    const quality = element.querySelector('.__quality, .quality, .ribbon')?.textContent?.trim() || '';
                    const rating = element.querySelector('.post__ratings, .rating, .imdb')?.textContent?.trim() || '';
                    const genre = element.querySelector('.__genre, .genre')?.textContent?.trim() || '';
                    
                    // عرض معلومات الفيلم للتحقق
                    if (i < 5) { // عرض أول 5 أفلام فقط للتحقق
                        console.log(`   ${i + 1}. ${title.substring(0, 30)}...`);
                        console.log(`      URL: ${movieUrl}`);
                        if (category) console.log(`      التصنيف: ${category}`);
                        if (quality) console.log(`      الجودة: ${quality}`);
                        if (rating) console.log(`      التقييم: ${rating}`);
                    }
                    
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
            } catch (error) {
                console.log(`   ⚠️ خطأ في معالجة الفيلم ${i + 1}: ${error.message}`);
            }
        });
        
        console.log(`✅ تم العثور على ${movies.length} فيلم في الصفحة ${pageNum}`);
        
        if (movies.length === 0) {
            console.log(`   ⚠️ لم يتم العثور على أفلام، قد يكون هناك مشكلة في:`);
            console.log(`      1. هيكل الصفحة`);
            console.log(`      2. الـ selectors المستخدمة`);
            console.log(`      3. الحماية في الموقع`);
            console.log(`      4. المحتوى لا يتم تحميله بالكامل`);
        }
        
        return { url, movies, selectorUsed };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة ${pageNum}: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم ====================
async function fetchMovieDetails(movie) {
    console.log(`\n🎬 جلب تفاصيل الفيلم: ${movie.title.substring(0, 50)}...`);
    console.log(`   📍 الرابط: ${movie.url}`);
    
    const html = await fetchWithTimeout(movie.url);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        console.log(`   ✅ تم تحميل صفحة الفيلم بنجاح`);
        
        // 1. استخراج ID من الرابط المختصر
        let shortLink = null;
        let movieId = null;
        
        const shortLinkInput = doc.querySelector('#shortlink');
        if (shortLinkInput) {
            shortLink = shortLinkInput.value;
            movieId = extractMovieId(shortLink);
            console.log(`   🔑 الرابط المختصر: ${shortLink}`);
            console.log(`   🔑 ID الفيلم: ${movieId}`);
        } else {
            // محاولة استخراج ID من الرابط
            const urlMatch = movie.url.match(/\/(\d+)\/?$/);
            if (urlMatch) {
                movieId = urlMatch[1];
                console.log(`   🔑 ID الفيلم من الرابط: ${movieId}`);
            } else {
                console.log(`   ⚠️ لم يتم العثور على ID`);
            }
        }
        
        if (!movieId) {
            movieId = `movie_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log(`   🔑 ID مولد: ${movieId}`);
        }
        
        // 2. استخراج العنوان الرئيسي
        let title = movie.title;
        const titleElement = doc.querySelector('.post__name, h1.post-title, h1.entry-title, h1.title');
        if (titleElement) {
            title = titleElement.textContent?.trim() || title;
            console.log(`   📝 العنوان: ${title.substring(0, 60)}...`);
        }
        
        // 3. استخراج الصورة
        let image = '';
        const imageSelectors = [
            '.poster-img',
            '.poster__single img',
            '.post-thumbnail img',
            'img[src*="uploads"]',
            '.wp-post-image',
            '.featured-image img'
        ];
        
        for (const selector of imageSelectors) {
            const imgElement = doc.querySelector(selector);
            if (imgElement && imgElement.src) {
                image = imgElement.src;
                console.log(`   🖼️ الصورة: ${image.substring(0, 80)}...`);
                break;
            }
        }
        
        // 4. استخراج القصة
        let story = "غير متوفر";
        const storyElement = doc.querySelector('.post__story p, .story p, .entry-content p, .description p');
        if (storyElement) {
            story = storyElement.textContent?.trim() || story;
            console.log(`   📖 القصة: ${story.substring(0, 80)}...`);
        }
        
        // 5. استخراج التقييم
        let rating = movie.rating || "";
        const ratingElement = doc.querySelector('.post__ratings, .imdbRating, .rating, .tmdb-rating');
        if (ratingElement) {
            rating = ratingElement.textContent?.trim() || rating;
            console.log(`   ⭐ التقييم: ${rating}`);
        }
        
        // 6. استخراج روابط المشاهدة والتحميل
        let watchLink = null;
        let downloadLink = null;
        
        // البحث عن زر المشاهدة
        const watchButtons = doc.querySelectorAll('a.watch__btn, a.watch-btn, .watch-button, a[href*="/watch/"]');
        for (const button of watchButtons) {
            if (button.href) {
                watchLink = button.href;
                console.log(`   📺 رابط المشاهدة: ${watchLink}`);
                break;
            }
        }
        
        // البحث عن زر التحميل
        const downloadButtons = doc.querySelectorAll('a.download__btn, .download-btn, a[href*="/download/"], a[href*="download"]');
        for (const button of downloadButtons) {
            if (button.href && !button.href.includes('watch')) {
                downloadLink = button.href;
                console.log(`   💾 رابط التحميل: ${downloadLink}`);
                break;
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
        
        // البحث في info__area
        const infoArea = doc.querySelector('.info__area, .movie-info, .details');
        if (infoArea) {
            console.log(`   📋 جلب التفاصيل من info__area`);
            
            const infoItems = infoArea.querySelectorAll('li, .info-item');
            infoItems.forEach(item => {
                const labelElement = item.querySelector('.title__kit span, .label, strong');
                if (labelElement) {
                    const label = labelElement.textContent?.replace(':', '').trim().toLowerCase();
                    const content = item.textContent?.replace(labelElement.textContent, '').trim();
                    
                    if (label.includes('تصنيف') || label.includes('قسم')) {
                        const links = item.querySelectorAll('a');
                        details.category = Array.from(links).map(a => a.textContent.trim());
                    } 
                    else if (label.includes('نوع') || label.includes('جنس')) {
                        const links = item.querySelectorAll('a');
                        details.genres = Array.from(links).map(a => a.textContent.trim());
                    } 
                    else if (label.includes('مدة') || label.includes('وقت')) {
                        details.duration = content;
                    } 
                    else if (label.includes('سنة') || label.includes('تاريخ')) {
                        const links = item.querySelectorAll('a');
                        if (links.length > 0) {
                            details.releaseYear = Array.from(links).map(a => a.textContent.trim());
                        } else {
                            details.releaseYear = [content];
                        }
                    } 
                    else if (label.includes('لغة')) {
                        const links = item.querySelectorAll('a');
                        details.language = Array.from(links).map(a => a.textContent.trim());
                    } 
                    else if (label.includes('جودة')) {
                        const links = item.querySelectorAll('a');
                        details.quality = Array.from(links).map(a => a.textContent.trim());
                    } 
                    else if (label.includes('بلد') || label.includes('دولة')) {
                        const links = item.querySelectorAll('a');
                        details.country = Array.from(links).map(a => a.textContent.trim());
                    } 
                    else if (label.includes('إضافة') || label.includes('تاريخ')) {
                        details.addedDate = content;
                    }
                }
            });
            
            console.log(`   📊 التفاصيل المستخرجة:`);
            console.log(`      - التصنيف: ${details.category.join(', ') || 'لا يوجد'}`);
            console.log(`      - الأنواع: ${details.genres.join(', ') || 'لا يوجد'}`);
            console.log(`      - الجودة: ${details.quality.join(', ') || 'لا يوجد'}`);
            console.log(`      - السنة: ${details.releaseYear.join(', ') || 'لا يوجد'}`);
        }
        
        // 8. جلب سيرفرات المشاهدة والتحميل
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            console.log(`   🔄 جلب سيرفرات المشاهدة...`);
            watchServers = await fetchWatchServers(watchLink);
            await new Promise(resolve => setTimeout(resolve, 800)); // انتظار بين الطلبات
        }
        
        if (downloadLink) {
            console.log(`   🔄 جلب سيرفرات التحميل...`);
            downloadServers = await fetchDownloadServers(downloadLink);
            await new Promise(resolve => setTimeout(resolve, 800)); // انتظار بين الطلبات
        }
        
        // 9. تجميع النتيجة النهائية
        const result = {
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
        
        console.log(`   ✅ تم استخراج الفيلم بنجاح!`);
        console.log(`   📊 إحصائيات:`);
        console.log(`      - سيرفرات المشاهدة: ${watchServers.length}`);
        console.log(`      - سيرفرات التحميل: ${downloadServers.length}`);
        
        return result;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج تفاصيل الفيلم: ${error.message}`);
        console.log(`   🔧 Stack: ${error.stack}`);
        return null;
    }
}

// ==================== حفظ البيانات ====================
function saveToHgFile(pageData, moviesData) {
    const pageContent = {
        page: pageData?.page || 1,
        url: pageData?.url || "https://asd.pics/movies/",
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pageContent, null, 2));
    console.log(`\n💾 حفظ البيانات في: ${OUTPUT_FILE}`);
    console.log(`   📁 عدد الأفلام المحفوظة: ${moviesData.length}`);
    
    return OUTPUT_FILE;
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🎬 =========================================");
    console.log("🎬 بدء استخراج الأفلام من موقع asd.pics");
    console.log("🎬 =========================================");
    
    // اختيار صفحة للبدء (يمكن تغييرها)
    const startPage = 1;
    const pageNum = startPage;
    
    console.log(`\n📄 جلب الصفحة ${pageNum}...`);
    
    // جلب الصفحة
    const pageData = await fetchMoviesFromPage(pageNum);
    
    if (!pageData || !pageData.movies || pageData.movies.length === 0) {
        console.log(`\n⏹️ لا توجد أفلام في الصفحة ${pageNum}`);
        console.log(`📝 نصائح استكشاف الأخطاء:`);
        console.log(`   1. تحقق من اتصال الإنترنت`);
        console.log(`   2. تحقق من أن الموقع متاح: https://asd.pics/movies/`);
        console.log(`   3. قد يكون الموقع يستخدم JavaScript أو له هيكل مختلف`);
        console.log(`   4. حاول تشغيل الكود من خلال node مع تحديثات`);
        
        // إنشاء ملف خطأ للتحليل
        const errorReport = {
            error: "لم يتم العثور على أفلام",
            page: pageNum,
            url: `https://asd.pics/movies/page/${pageNum}/`,
            timestamp: new Date().toISOString(),
            suggestion: "تحقق من الـ selectors أو هيكل الموقع"
        };
        
        fs.writeFileSync("debug.json", JSON.stringify(errorReport, null, 2));
        console.log(`📝 تم حفظ تقرير التصحيح في debug.json`);
        
        return { success: false, total: 0 };
    }
    
    console.log(`\n🔍 بدء استخراج تفاصيل ${pageData.movies.length} فيلم...`);
    
    const moviesData = [];
    const failedMovies = [];
    
    // تحديد عدد الأفلام للاستخراج (يمكن تغييره)
    const maxMoviesToProcess = Math.min(pageData.movies.length, 5); // استخراج أول 5 أفلام فقط للاختبار
    
    for (let i = 0; i < maxMoviesToProcess; i++) {
        const movie = pageData.movies[i];
        
        console.log(`\n🔸 الفيلم ${i + 1}/${maxMoviesToProcess} 🔸`);
        
        const details = await fetchMovieDetails(movie);
        
        if (details && details.id) {
            moviesData.push(details);
            console.log(`   ✅ تمت إضافة الفيلم ${i + 1} بنجاح`);
        } else {
            failedMovies.push(movie.title);
            console.log(`   ⏭️ فشل استخراج الفيلم ${i + 1}`);
        }
        
        // انتظار بين الأفلام لمنع الحظر
        if (i < maxMoviesToProcess - 1) {
            const delay = 2000 + Math.random() * 2000; // بين 2 و 4 ثواني
            console.log(`   ⏳ انتظار ${Math.round(delay/1000)} ثانية...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // حفظ البيانات في Hg.json
    if (moviesData.length > 0) {
        const savedFile = saveToHgFile(pageData, moviesData);
        
        console.log(`\n🎉 =========================================`);
        console.log(`🎉 تمت العملية بنجاح!`);
        console.log(`🎉 =========================================`);
        console.log(`📊 النتائج:`);
        console.log(`   - الأفلام الناجحة: ${moviesData.length}`);
        console.log(`   - الأفلام الفاشلة: ${failedMovies.length}`);
        console.log(`   - الملف المحفوظ: ${savedFile}`);
        
        if (failedMovies.length > 0) {
            console.log(`\n⚠️ الأفلام التي فشل استخراجها:`);
            failedMovies.forEach((title, i) => {
                console.log(`   ${i + 1}. ${title}`);
            });
        }
        
        // عرض عينة من البيانات المحفوظة
        console.log(`\n📋 عينة من البيانات المحفوظة (الفيلم الأول):`);
        if (moviesData.length > 0) {
            const sample = moviesData[0];
            console.log(`   📌 ID: ${sample.id}`);
            console.log(`   🎬 العنوان: ${sample.title.substring(0, 50)}...`);
            console.log(`   🌐 الرابط: ${sample.url}`);
            console.log(`   ⭐ التقييم: ${sample.rating || 'غير متوفر'}`);
            console.log(`   📺 سيرفرات المشاهدة: ${sample.watchServers?.length || 0}`);
            console.log(`   💾 سيرفرات التحميل: ${sample.downloadServers?.length || 0}`);
            
            if (sample.watchServers && sample.watchServers.length > 0) {
                console.log(`   👁️  مثال سيرفر مشاهدة: ${sample.watchServers[0].server} - ${sample.watchServers[0].quality}`);
            }
        }
        
        // عرض معلومات الملف
        try {
            const stats = fs.statSync(OUTPUT_FILE);
            console.log(`\n📁 معلومات الملف:`);
            console.log(`   - الحجم: ${(stats.size / 1024).toFixed(2)} كيلوبايت`);
            console.log(`   - وقت التحديث: ${new Date().toLocaleString()}`);
        } catch (error) {
            console.log(`   ⚠️ خطأ في قراءة معلومات الملف: ${error.message}`);
        }
        
        return { success: true, total: moviesData.length, failed: failedMovies.length };
    } else {
        console.log(`\n⚠️ لم يتم استخراج أي أفلام بنجاح`);
        console.log(`   - حاول زيادة وقت الانتظار بين الطلبات`);
        console.log(`   - تحقق من اتصال الإنترنت`);
        console.log(`   - قد يكون الموقع محمي بجدران حماية`);
        
        return { success: false, total: 0, failed: failedMovies.length };
    }
}

// ==================== تشغيل البرنامج ====================
main().catch(error => {
    console.error("\n💥 =========================================");
    console.error("💥 خطأ غير متوقع في البرنامج!");
    console.error("💥 =========================================");
    console.error(`الخطأ: ${error.message}`);
    console.error(`التفاصيل: ${error.stack}`);
    
    const errorReport = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorReport, null, 2));
    console.error("\n📝 تم حفظ تقرير الخطأ في error.json");
});
