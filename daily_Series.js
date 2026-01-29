import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const SERIES_DIR = path.join(__dirname, "Series");
const SERIES_OUTPUT = path.join(SERIES_DIR, "Series", "Hg.json");
const SEASONS_OUTPUT = path.join(SERIES_DIR, "Seasons", "Hg.json");
const EPISODES_OUTPUT = path.join(SERIES_DIR, "Episodes", "Hg.json");

// إنشاء المجلدات إذا لم تكن موجودة
[path.join(SERIES_DIR, "Series"), 
 path.join(SERIES_DIR, "Seasons"), 
 path.join(SERIES_DIR, "Episodes")].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Referer': 'https://topcinema.rip/',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`   ❌ HTTP error: ${response.status}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`   ⏱️ انتهى الوقت لطلب: ${url}`);
        } else {
            console.log(`   ❌ خطأ في fetch: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج ID من الرابط المختصر ====================
function extractSeriesId(shortLink) {
    try {
        if (!shortLink) return null;
        const match = shortLink.match(/gt=(\d+)/);
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
        
        // البحث في meta tags عن رابط embed
        const metaElements = doc.querySelectorAll('meta[property="og:video:secure_url"], meta[property="og:video:url"], meta[content*="embed"]');
        
        metaElements.forEach(meta => {
            const content = meta.getAttribute('content');
            if (content && (content.includes('embed') || content.includes('watch') || content.includes('screen'))) {
                watchServers.push({
                    type: 'embed',
                    url: content,
                    quality: 'متعدد الجودات',
                    server: 'Embed Server'
                });
            }
        });
        
        // البحث عن روابط iframe مباشرة
        const iframes = doc.querySelectorAll('iframe[src*="embed"]');
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src) {
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: 'Iframe Embed'
                });
            }
        });
        
        // البحث عن روابط script
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const content = script.textContent;
            if (content && content.includes('embed')) {
                const embedMatch = content.match(/(https?:\/\/[^"'\s]*embed[^"'\s]*)/);
                if (embedMatch) {
                    watchServers.push({
                        type: 'script',
                        url: embedMatch[1],
                        quality: 'متعدد الجودات',
                        server: 'Script Embed'
                    });
                }
            }
        });
        
        console.log(`   ✅ عثر على ${watchServers.length} سيرفر مشاهدة`);
        return watchServers;
        
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
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        downloadBlocks.forEach(block => {
            const qualityElement = block.querySelector('.download-title span');
            const quality = qualityElement?.textContent?.trim() || 'غير معروف';
            
            const downloadLinks = block.querySelectorAll('a.downloadsLink');
            downloadLinks.forEach(link => {
                const providerElement = link.querySelector('.text span');
                const provider = providerElement?.textContent?.trim() || 'غير معروف';
                const url = link.getAttribute('href') || '';
                
                if (url && !link.closest('.proServer')) {
                    downloadServers.push({
                        server: provider,
                        url: url,
                        quality: quality,
                        type: 'normal'
                    });
                }
            });
        });
        
        // 3. البحث عن روابط تحميل إضافية
        const allDownloadLinks = doc.querySelectorAll('a[href*="download"], a[href*="dl"], a[href*="updown"], a[href*="ddownload"]');
        allDownloadLinks.forEach(link => {
            const url = link.getAttribute('href');
            const text = link.textContent?.trim() || '';
            
            if (url && !url.includes('topcinema.rip') && !url.startsWith('#')) {
                // التحقق إذا كان الرابط موجوداً بالفعل
                const exists = downloadServers.some(s => s.url === url);
                if (!exists) {
                    let serverName = 'غير معروف';
                    if (text) {
                        serverName = text.split(' ')[0] || 'غير معروف';
                    }
                    
                    downloadServers.push({
                        server: serverName,
                        url: url,
                        quality: 'غير معروف',
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

// ==================== استخراج الحلقات من صفحة الموسم ====================
async function fetchEpisodesFromSeason(seasonUrl, seriesId, seasonId) {
    console.log(`   📺 جلب الحلقات من صفحة الموسم...`);
    console.log(`   🔗 رابط الموسم: ${seasonUrl}`);
    
    const html = await fetchWithTimeout(seasonUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الموسم`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        // البحث في جميع الأقسام المحتملة للحلقات
        const episodeContainers = [
            '.allepcont.getMoreByScroll',
            '.allepcont',
            'section.allepcont',
            '.tabContents .row',
            '.episodes-list',
            '.episodes-container'
        ];
        
        let episodeElements = [];
        
        for (const selector of episodeContainers) {
            const container = doc.querySelector(selector);
            if (container) {
                console.log(`   ✅ عثر على حاوية الحلقات باستخدام: ${selector}`);
                episodeElements = container.querySelectorAll('a');
                break;
            }
        }
        
        // إذا لم نجد حاوية محددة، نبحث في جميع الروابط
        if (episodeElements.length === 0) {
            console.log(`   🔍 لم أعثر على حاوية حلقات، أبحث في جميع الروابط...`);
            episodeElements = doc.querySelectorAll('a');
        }
        
        console.log(`   🔍 فحص ${episodeElements.length} رابط...`);
        
        episodeElements.forEach((link, i) => {
            const episodeUrl = link.getAttribute('href');
            
            if (!episodeUrl || !episodeUrl.includes('topcinema.rip')) {
                return;
            }
            
            // التحقق إذا كان الرابط لحلقة
            const isEpisode = episodeUrl.includes('الحلقة') || 
                             episodeUrl.includes('episode') ||
                             link.querySelector('.epnum') ||
                             (link.querySelector('h2') && link.querySelector('h2').textContent.includes('الحلقة'));
            
            if (isEpisode) {
                // استخراج رقم الحلقة
                let episodeNumber = '';
                
                // 1. محاولة من epnum
                const epnumElement = link.querySelector('.epnum');
                if (epnumElement) {
                    const epnumText = epnumElement.textContent;
                    // البحث عن رقم
                    const numberMatch = epnumText.match(/(\d+(\.\d+)?)/);
                    if (numberMatch) {
                        episodeNumber = numberMatch[1];
                    } else {
                        // إذا كان هناك span داخل epnum
                        const span = epnumElement.querySelector('span');
                        if (span) {
                            const remainingText = epnumText.replace(span.textContent, '').trim();
                            const remainingMatch = remainingText.match(/(\d+(\.\d+)?)/);
                            if (remainingMatch) {
                                episodeNumber = remainingMatch[1];
                            }
                        }
                    }
                }
                
                // 2. محاولة من العنوان
                if (!episodeNumber) {
                    const titleElement = link.querySelector('h2');
                    if (titleElement) {
                        const titleText = titleElement.textContent;
                        const titleMatch = titleText.match(/الحلقة\s*(\d+(\.\d+)?)/);
                        if (titleMatch) {
                            episodeNumber = titleMatch[1];
                        }
                    }
                }
                
                // 3. محاولة من الرابط
                if (!episodeNumber) {
                    const urlMatch = episodeUrl.match(/الحلقة-(\d+(\.\d+)?)/);
                    if (urlMatch) {
                        episodeNumber = urlMatch[1];
                    }
                }
                
                // 4. استخدام الفهرس كملاذ أخير
                if (!episodeNumber) {
                    episodeNumber = (i + 1).toString();
                }
                
                episodes.push({
                    series_id: seriesId,
                    season_id: seasonId,
                    episodeNumber: episodeNumber,
                    title: `الحلقة ${episodeNumber}`,
                    url: episodeUrl
                });
                
                console.log(`     ✅ حلقة ${episodeNumber}: ${episodeUrl.substring(0, 60)}...`);
            }
        });
        
        // إزالة التكرارات
        const uniqueEpisodes = [];
        const seenUrls = new Set();
        
        episodes.forEach(ep => {
            if (!seenUrls.has(ep.url)) {
                seenUrls.add(ep.url);
                uniqueEpisodes.push(ep);
            }
        });
        
        console.log(`   📊 النتيجة: ${uniqueEpisodes.length} حلقة`);
        
        // عرض الحلقات التي تم العثور عليها
        if (uniqueEpisodes.length > 0) {
            console.log(`   📋 الحلقات الموجودة:`);
            uniqueEpisodes.forEach((ep, idx) => {
                if (idx < 5) {
                    console.log(`     ${idx + 1}. ${ep.title} - ${ep.url.substring(0, 50)}...`);
                }
            });
            if (uniqueEpisodes.length > 5) {
                console.log(`     ... و ${uniqueEpisodes.length - 5} حلقة أخرى`);
            }
        }
        
        return uniqueEpisodes;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج الحلقات: ${error.message}`);
        return [];
    }
}

// ==================== استخراج تفاصيل الحلقة ====================
async function fetchEpisodeDetails(episode, seriesId, seasonId) {
    console.log(`   🎬 جلب تفاصيل الحلقة ${episode.episodeNumber}...`);
    
    const html = await fetchWithTimeout(episode.url);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الحلقة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID الحلقة من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const episodeId = shortLink ? extractSeriesId(shortLink) : null;
        
        // استخراج روابط المشاهدة والتحميل
        const watchLinkElement = doc.querySelector('a.watch[href*="/watch/"], a[href*="watch"]');
        const downloadLinkElement = doc.querySelector('a.download[href*="/download/"], a[href*="download"]');
        
        const watchLink = watchLinkElement ? watchLinkElement.getAttribute('href') : null;
        const downloadLink = downloadLinkElement ? downloadLinkElement.getAttribute('href') : null;
        
        // إذا لم يكن الرابط مطلقاً، نضيف النطاق
        let fullWatchLink = watchLink;
        let fullDownloadLink = downloadLink;
        
        if (watchLink && !watchLink.startsWith('http')) {
            fullWatchLink = `https://topcinema.rip${watchLink.startsWith('/') ? '' : '/'}${watchLink}`;
        }
        
        if (downloadLink && !downloadLink.startsWith('http')) {
            fullDownloadLink = `https://topcinema.rip${downloadLink.startsWith('/') ? '' : '/'}${downloadLink}`;
        }
        
        // جلب سيرفرات المشاهدة والتحميل
        let watchServers = [];
        let downloadServers = [];
        
        if (fullWatchLink) {
            console.log(`   👁️  جلب سيرفرات المشاهدة من: ${fullWatchLink.substring(0, 60)}...`);
            watchServers = await fetchWatchServers(fullWatchLink);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (fullDownloadLink) {
            console.log(`   📥 جلب سيرفرات التحميل من: ${fullDownloadLink.substring(0, 60)}...`);
            downloadServers = await fetchDownloadServers(fullDownloadLink);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // استخراج صورة الحلقة
        const imageElement = doc.querySelector('.image img, img[src*="wp-content"]');
        const episodeImage = imageElement ? imageElement.getAttribute('src') : null;
        
        // استخراج عنوان الحلقة
        const titleElement = doc.querySelector('.post-title, h1, h2');
        const episodeTitle = titleElement ? titleElement.textContent.trim() : `الحلقة ${episode.episodeNumber}`;
        
        return {
            series_id: seriesId,
            season_id: seasonId,
            episodes_id: episodeId || `ep_${seriesId}_${seasonId}_${episode.episodeNumber}`,
            episodeNumber: episode.episodeNumber,
            title: episodeTitle,
            url: episode.url,
            image: episodeImage,
            watchLink: fullWatchLink,
            downloadLink: fullDownloadLink,
            watchServers: watchServers,
            downloadServers: downloadServers,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ في جلب تفاصيل الحلقة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج المواسم من صفحة المسلسل ====================
async function fetchSeasonsFromSeries(seriesUrl, seriesId) {
    console.log(`   📚 جلب المواسم من صفحة المسلسل...`);
    
    const html = await fetchWithTimeout(seriesUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const seasons = [];
        
        // البحث عن المواسم في قسم allseasonss
        const seasonElements = doc.querySelectorAll('.allseasonss .Season a, .Season a, a[href*="الموسم"]');
        
        console.log(`   🔍 عثر على ${seasonElements.length} عنصر موسم محتمل`);
        
        seasonElements.forEach((element, i) => {
            const seasonUrl = element.getAttribute('href');
            
            if (!seasonUrl || !seasonUrl.includes('topcinema.rip')) {
                return;
            }
            
            // استخراج رقم الموسم
            let seasonNumber = '';
            let seasonTitle = '';
            
            // 1. من epnum
            const epnumElement = element.querySelector('.epnum');
            if (epnumElement) {
                const epnumText = epnumElement.textContent;
                const numberMatch = epnumText.match(/(\d+)/);
                if (numberMatch) {
                    seasonNumber = numberMatch[1];
                }
            }
            
            // 2. من العنوان
            const titleElement = element.querySelector('.title');
            if (titleElement) {
                seasonTitle = titleElement.textContent.trim();
                const titleMatch = seasonTitle.match(/الموسم\s*(\d+)/);
                if (titleMatch && !seasonNumber) {
                    seasonNumber = titleMatch[1];
                }
            }
            
            // 3. من الرابط
            if (!seasonNumber) {
                const urlMatch = seasonUrl.match(/الموسم-(\d+)/);
                if (urlMatch) {
                    seasonNumber = urlMatch[1];
                }
            }
            
            // 4. استخدام الفهرس
            if (!seasonNumber) {
                seasonNumber = (i + 1).toString();
            }
            
            // استخراج ID الموسم من الرابط
            const seasonIdMatch = seasonUrl.match(/gt=(\d+)/);
            const seasonId = seasonIdMatch ? seasonIdMatch[1] : `s_${seriesId}_${seasonNumber}`;
            
            seasons.push({
                series_id: seriesId,
                season_id: seasonId,
                seasonNumber: seasonNumber,
                title: seasonTitle || `الموسم ${seasonNumber}`,
                url: seasonUrl
            });
            
            console.log(`     ✅ الموسم ${seasonNumber}: ${seasonTitle || 'بدون عنوان'} - ${seasonUrl.substring(0, 60)}...`);
        });
        
        // إذا لم نجد مواسم، نبحث في التبويبات
        if (seasons.length === 0) {
            console.log(`   🔍 البحث عن المواسم في التبويبات...`);
            const tabLinks = doc.querySelectorAll('.tabContents a, a[href*="season"], a[href*="موسم"]');
            
            tabLinks.forEach((link, i) => {
                const url = link.getAttribute('href');
                if (url && url.includes('topcinema.rip') && url.includes('الموسم')) {
                    const urlMatch = url.match(/الموسم-(\d+)/);
                    const seasonNum = urlMatch ? urlMatch[1] : (i + 1).toString();
                    const seasonId = `s_${seriesId}_${seasonNum}`;
                    
                    seasons.push({
                        series_id: seriesId,
                        season_id: seasonId,
                        seasonNumber: seasonNum,
                        title: `الموسم ${seasonNum}`,
                        url: url
                    });
                }
            });
        }
        
        // ترتيب المواسم تصاعدياً
        seasons.sort((a, b) => parseInt(a.seasonNumber) - parseInt(b.seasonNumber));
        
        console.log(`   ✅ عثر على ${seasons.length} موسم`);
        return seasons;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
        return [];
    }
}

// ==================== استخراج المسلسلات من صفحة ====================
async function fetchSeriesFromPage(pageNum = 1) {
    const url = `https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/${pageNum > 1 ? `page/${pageNum}/` : ''}`;
    
    console.log(`📖 جلب صفحة المسلسلات ${pageNum === 1 ? "الرئيسية" : pageNum}...`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const series = [];
        
        const seriesElements = doc.querySelectorAll('.Small--Box a, .recent--block');
        console.log(`✅ عثر على ${seriesElements.length} عنصر مسلسل`);
        
        seriesElements.forEach((element, i) => {
            const seriesUrl = element.getAttribute('href');
            
            if (!seriesUrl || !seriesUrl.includes('topcinema.rip') || !seriesUrl.includes('/series/')) {
                return;
            }
            
            const title = element.querySelector('.title')?.textContent?.trim() || 
                         element.getAttribute('title')?.trim() || 
                         element.textContent?.trim() || 
                         `مسلسل ${i + 1}`;
            
            // استخراج عدد المواسم إذا كان موجوداً
            const seasonsCountElement = element.querySelector('.number span, .Collection span');
            const seasonsCount = seasonsCountElement?.textContent?.trim() || "غير معروف";
            
            // استخراج الصورة
            const imageElement = element.querySelector('img');
            const image = imageElement ? imageElement.getAttribute('src') : null;
            
            // استخراج تقييم IMDB
            const imdbElement = element.querySelector('.imdbRating');
            const imdbRating = imdbElement ? imdbElement.textContent.replace('IMDb', '').trim() : null;
            
            series.push({
                title: title,
                url: seriesUrl,
                image: image,
                imdbRating: imdbRating,
                seasonsCount: seasonsCount,
                page: pageNum,
                position: i + 1
            });
            
            console.log(`   📺 ${i + 1}. ${title.substring(0, 40)}...`);
        });
        
        console.log(`📊 تم استخراج ${series.length} مسلسل`);
        return { url, series };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل المسلسل الرئيسية ====================
async function fetchSeriesDetails(series) {
    console.log(`🎬 ${series.title.substring(0, 40)}...`);
    console.log(`   🔗 ${series.url}`);
    
    const html = await fetchWithTimeout(series.url);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المسلسل`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        const seriesId = shortLink ? extractSeriesId(shortLink) : null;
        
        if (!seriesId) {
            console.log(`   ⚠️ لم يتم العثور على ID`);
            return null;
        }
        
        // 2. البيانات الأساسية (الاسم، الصورة، ID)
        const title = doc.querySelector(".post-title a, h1.post-title")?.textContent?.trim() || series.title;
        const image = doc.querySelector(".image img, img[src*='wp-content']")?.src || series.image;
        const imdbRatingElement = doc.querySelector(".imdbR span");
        const imdbRating = imdbRatingElement ? imdbRatingElement.textContent.trim() : series.imdbRating;
        
        // 3. القصة
        const storyElement = doc.querySelector(".story p");
        const story = storyElement ? storyElement.textContent.trim() : "غير متوفر";
        
        // 4. التفاصيل الأساسية
        const details = {
            category: [],
            genres: [],
            quality: [],
            releaseYear: [],
            country: [],
            directors: [],
            actors: []
        };
        
        const detailItems = doc.querySelectorAll(".RightTaxContent li, .details li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = labelElement.textContent.replace(":", "").trim();
                const links = item.querySelectorAll("a");
                
                if (links.length > 0) {
                    const values = Array.from(links).map(a => a.textContent.trim());
                    
                    if (label.includes("قسم المسلسل") || label.includes("القسم")) {
                        details.category = values;
                    } else if (label.includes("نوع المسلسل") || label.includes("النوع")) {
                        details.genres = values;
                    } else if (label.includes("جودة المسلسل") || label.includes("الجودة")) {
                        details.quality = values;
                    } else if (label.includes("موعد الصدور") || label.includes("السنة")) {
                        details.releaseYear = values;
                    } else if (label.includes("دولة المسلسل") || label.includes("البلد")) {
                        details.country = values;
                    } else if (label.includes("المخرجين") || label.includes("المخرج")) {
                        details.directors = values;
                    } else if (label.includes("بطولة") || label.includes("الممثلين")) {
                        details.actors = values;
                    }
                }
            }
        });
        
        console.log(`   ✅ ID: ${seriesId}, الأنواع: ${details.genres.length ? details.genres.join(', ') : 'غير معروف'}`);
        
        return {
            id: seriesId,
            title: title,
            url: series.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story,
            seasonsCount: series.seasonsCount,
            details: details,
            page: series.page,
            position: series.position,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ المسلسلات في Hg.json ====================
function saveSeriesToFile(pageData, seriesData) {
    const pageContent = {
        page: 1,
        url: pageData.url,
        totalSeries: seriesData.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        series: seriesData
    };
    
    fs.writeFileSync(SERIES_OUTPUT, JSON.stringify(pageContent, null, 2));
    console.log(`💾 حفظ المسلسلات في ${SERIES_OUTPUT} بـ ${seriesData.length} مسلسل`);
    
    return SERIES_OUTPUT;
}

// ==================== حفظ المواسم في Hg.json ====================
function saveSeasonsToFile(allSeasons) {
    const seasonsContent = {
        totalSeasons: allSeasons.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        seasons: allSeasons
    };
    
    fs.writeFileSync(SEASONS_OUTPUT, JSON.stringify(seasonsContent, null, 2));
    console.log(`💾 حفظ المواسم في ${SEASONS_OUTPUT} بـ ${allSeasons.length} موسم`);
    
    return SEASONS_OUTPUT;
}

// ==================== حفظ الحلقات في Hg.json ====================
function saveEpisodesToFile(allEpisodes) {
    const episodesContent = {
        totalEpisodes: allEpisodes.length,
        scrapedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        episodes: allEpisodes
    };
    
    fs.writeFileSync(EPISODES_OUTPUT, JSON.stringify(episodesContent, null, 2));
    console.log(`💾 حفظ الحلقات في ${EPISODES_OUTPUT} بـ ${allEpisodes.length} حلقة`);
    
    return EPISODES_OUTPUT;
}

// ==================== معالجة مسلسل واحد كاملاً ====================
async function processSingleSeries(seriesDetail, allSeasons, allEpisodes) {
    console.log(`\n🔍 بدء معالجة المسلسل: ${seriesDetail.title}`);
    console.log(`   🆔 ID: ${seriesDetail.id}`);
    
    // 1. جلب المواسم
    console.log(`   📚 جلب المواسم...`);
    const seasons = await fetchSeasonsFromSeries(seriesDetail.url, seriesDetail.id);
    
    if (seasons.length === 0) {
        console.log(`   ⏭️ لا توجد مواسم للمسلسل ${seriesDetail.id}`);
        return { seriesDetail, seasons: [], episodes: [] };
    }
    
    // إضافة المواسم إلى القائمة الرئيسية
    allSeasons.push(...seasons);
    
    // انتظار قصير بين طلبات المواسم
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const seriesEpisodes = [];
    
    // 2. جلب الحلقات لكل موسم
    for (let i = 0; i < seasons.length; i++) {
        const season = seasons[i];
        console.log(`\n   📖 معالجة ${season.title} (الموسم ${season.seasonNumber})...`);
        console.log(`   🔗 رابط الموسم: ${season.url}`);
        
        // جلب الحلقات من صفحة الموسم
        const episodes = await fetchEpisodesFromSeason(season.url, seriesDetail.id, season.season_id);
        
        if (episodes.length === 0) {
            console.log(`   ⏭️ لا توجد حلقات في ${season.title}`);
            continue;
        }
        
        console.log(`   ✅ وجد ${episodes.length} حلقة`);
        
        // 3. جلب تفاصيل كل حلقة
        for (let j = 0; j < episodes.length; j++) {
            const episode = episodes[j];
            
            console.log(`   🎬 معالجة ${episode.title}...`);
            const episodeDetails = await fetchEpisodeDetails(episode, seriesDetail.id, season.season_id);
            
            if (episodeDetails) {
                seriesEpisodes.push(episodeDetails);
                allEpisodes.push(episodeDetails);
                
                const watchCount = episodeDetails.watchServers?.length || 0;
                const downloadCount = episodeDetails.downloadServers?.length || 0;
                console.log(`     ✅ ${episode.title}: ${watchCount} سيرفر مشاهدة, ${downloadCount} سيرفر تحميل`);
            } else {
                console.log(`     ⚠️ فشل جلب تفاصيل ${episode.title}`);
            }
            
            // انتظار بين الحلقات
            if (j < episodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        }
        
        // انتظار بين المواسم
        if (i < seasons.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    console.log(`   ✅ تم معالجة ${seriesEpisodes.length} حلقة من ${seasons.length} موسم`);
    return { seriesDetail, seasons, episodes: seriesEpisodes };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("📺 بدء استخراج المسلسلات الأجنبية");
    console.log("=".repeat(60));
    
    const startTime = Date.now();
    const pageNum = 1;
    
    // جلب صفحة المسلسلات
    const pageData = await fetchSeriesFromPage(pageNum);
    
    if (!pageData || pageData.series.length === 0) {
        console.log(`⏹️ لا توجد مسلسلات في الصفحة`);
        return { success: false, total: 0 };
    }
    
    console.log(`\n🔍 استخراج تفاصيل ${pageData.series.length} مسلسل...\n`);
    
    const seriesData = [];
    const allResults = [];
    const allSeasons = [];
    const allEpisodes = [];
    
    // ⭐⭐⭐ التعديل المهم: استخراج جميع المسلسلات ⭐⭐⭐
    const seriesToProcess = pageData.series.length; // جميع المسلسلات
    
    for (let i = 0; i < seriesToProcess; i++) {
        const series = pageData.series[i];
        console.log(`\n${"=".repeat(50)}`);
        console.log(`📺 المسلسل ${i + 1}/${seriesToProcess}: ${series.title}`);
        
        const seriesDetails = await fetchSeriesDetails(series);
        
        if (seriesDetails && seriesDetails.id) {
            seriesData.push(seriesDetails);
            console.log(`   ✅ ID: ${seriesDetails.id}`);
            console.log(`   📚 عدد المواسم: ${seriesDetails.seasonsCount}`);
            
            // معالجة المسلسل كاملاً (المواسم والحلقات)
            console.log(`   🔄 بدء استخراج المواسم والحلقات...`);
            const result = await processSingleSeries(seriesDetails, allSeasons, allEpisodes);
            allResults.push(result);
            
            console.log(`   ✅ تم معالجة ${result.seasons.length} موسم و ${result.episodes.length} حلقة`);
        } else {
            console.log(`   ⏭️ تخطي المسلسل (لا يوجد ID)`);
        }
        
        // انتظار بين المسلسلات
        if (i < seriesToProcess - 1) {
            console.log(`   ⏳ انتظار 3 ثواني قبل المسلسل التالي...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 ملخص النتائج:`);
    console.log(`   📺 المسلسلات: ${seriesData.length}`);
    console.log(`   📚 المواسم: ${allSeasons.length}`);
    console.log(`   🎬 الحلقات: ${allEpisodes.length}`);
    
    // 5. حفظ البيانات في ملفات JSON
    console.log(`\n💾 حفظ البيانات...`);
    
    if (seriesData.length > 0) {
        saveSeriesToFile(pageData, seriesData);
    }
    
    if (allSeasons.length > 0) {
        saveSeasonsToFile(allSeasons);
    }
    
    if (allEpisodes.length > 0) {
        saveEpisodesToFile(allEpisodes);
    }
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`\n✅ تم الانتهاء في ${duration} ثانية`);
    console.log(`📁 الملفات المحفوظة:`);
    console.log(`   📄 Series/Hg.json`);
    console.log(`   📄 Seasons/Hg.json`);
    console.log(`   📄 Episodes/Hg.json`);
    
    return {
        success: true,
        total: {
            series: seriesData.length,
            seasons: allSeasons.length,
            episodes: allEpisodes.length
        },
        duration: duration
    };
}

// ==================== تشغيل البرنامج ====================
main()
    .then(result => {
        if (result.success) {
            console.log(`\n🎉 تم استخراج ${result.total.series} مسلسل, ${result.total.seasons} موسم, ${result.total.episodes} حلقة`);
            console.log(`⏱️  الوقت المستغرق: ${result.duration} ثانية`);
            process.exit(0);
        } else {
            console.log(`\n❌ فشل استخراج البيانات`);
            process.exit(1);
        }
    })
    .catch(error => {
        console.error(`\n💥 خطأ غير متوقع: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    });
