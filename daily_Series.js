import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const SERIES_DIR = path.join(__dirname, "Series");
const SERIES_OUTPUT = path.join(SERIES_DIR, "Series", "Hg.json");
const SEASONS_DIR = path.join(SERIES_DIR, "Seasons");
const EPISODES_DIR = path.join(SERIES_DIR, "Episodes");

// إنشاء المجلدات إذا لم تكن موجودة
[path.join(SERIES_DIR, "Series"), SEASONS_DIR, EPISODES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

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
        
        // البحث في meta tags عن رابط embed
        const metaElements = doc.querySelectorAll('meta[property="og:video:secure_url"], meta[property="og:video:url"]');
        const watchServers = [];
        
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
        
        // 3. إزالة التكرارات
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
    
    const html = await fetchWithTimeout(seasonUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة الموسم`);
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const episodes = [];
        
        // البحث عن جميع روابط الحلقات
        const episodeLinks = doc.querySelectorAll('a[href*="الحلقة"]');
        
        episodeLinks.forEach((link, i) => {
            const episodeUrl = link.getAttribute('href');
            const episodeNumber = link.querySelector('.epnum span')?.textContent?.trim() || 
                                  link.querySelector('.epnum')?.textContent?.replace('الحلقة', '').trim() || 
                                  (i + 1).toString();
            
            const title = link.querySelector('h2')?.textContent?.trim() || `الحلقة ${episodeNumber}`;
            
            if (episodeUrl && episodeUrl.includes('topcinema.rip')) {
                episodes.push({
                    seriesId: seriesId,
                    seasonId: seasonId,
                    episodeNumber: episodeNumber,
                    title: `الحلقة ${episodeNumber}`,
                    url: episodeUrl
                });
            }
        });
        
        console.log(`   ✅ عثر على ${episodes.length} حلقة`);
        return episodes;
        
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
        
        // استخراج روابط المشاهدة والتحميل
        const watchLinkElement = doc.querySelector('a.watch[href*="/watch/"]');
        const downloadLinkElement = doc.querySelector('a.download[href*="/download/"]');
        
        const watchLink = watchLinkElement ? watchLinkElement.getAttribute('href') : null;
        const downloadLink = downloadLinkElement ? downloadLinkElement.getAttribute('href') : null;
        
        // جلب سيرفرات المشاهدة والتحميل
        let watchServers = [];
        let downloadServers = [];
        
        if (watchLink) {
            watchServers = await fetchWatchServers(watchLink);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (downloadLink) {
            downloadServers = await fetchDownloadServers(downloadLink);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        return {
            seriesId: seriesId,
            seasonId: seasonId,
            episodeNumber: episode.episodeNumber,
            title: `الحلقة ${episode.episodeNumber}`,
            url: episode.url,
            watchLink: watchLink,
            downloadLink: downloadLink,
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
        const seasonElements = doc.querySelectorAll('.allseasonss .Season a');
        
        seasonElements.forEach((element, i) => {
            const seasonUrl = element.getAttribute('href');
            const seasonNumber = element.querySelector('.epnum')?.textContent?.trim() || 
                                element.querySelector('.epnum span')?.textContent?.trim() || 
                                (i + 1).toString();
            
            const title = element.querySelector('.title')?.textContent?.trim() || `الموسم ${seasonNumber}`;
            
            if (seasonUrl && seasonUrl.includes('topcinema.rip')) {
                seasons.push({
                    seriesId: seriesId,
                    seasonNumber: seasonNumber.replace('الموسم', '').trim(),
                    title: `الموسم ${seasonNumber}`,
                    url: seasonUrl
                });
            }
        });
        
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
    
    console.log(`📖 جلب صفحة المسلسلات ${pageNum === 1 ? "الرئيسية" : pageNum}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const series = [];
        
        const seriesElements = doc.querySelectorAll('.Small--Box a');
        console.log(`✅ عثر على ${seriesElements.length} مسلسل`);
        
        seriesElements.forEach((element, i) => {
            const seriesUrl = element.getAttribute('href');
            
            if (seriesUrl && seriesUrl.includes('topcinema.rip') && seriesUrl.includes('/series/')) {
                const title = element.querySelector('.title')?.textContent || 
                              element.textContent || 
                              `مسلسل ${i + 1}`;
                
                // استخراج عدد المواسم إذا كان موجوداً
                const seasonsCountElement = element.querySelector('.number span');
                const seasonsCount = seasonsCountElement?.textContent?.trim() || "غير معروف";
                
                series.push({
                    title: title.trim(),
                    url: seriesUrl,
                    seasonsCount: seasonsCount,
                    page: pageNum,
                    position: i + 1
                });
            }
        });
        
        return { url, series };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة`);
        return null;
    }
}

// ==================== استخراج تفاصيل المسلسل الرئيسية ====================
async function fetchSeriesDetails(series) {
    console.log(`🎬 ${series.title.substring(0, 40)}...`);
    
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
        const title = doc.querySelector(".post-title a")?.textContent?.trim() || series.title;
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
        
        // 3. القصة
        const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
        
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
        
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = labelElement.textContent.replace(":", "").trim();
                const links = item.querySelectorAll("a");
                
                if (links.length > 0) {
                    const values = Array.from(links).map(a => a.textContent.trim());
                    
                    if (label.includes("قسم المسلسل")) {
                        details.category = values;
                    } else if (label.includes("نوع المسلسل")) {
                        details.genres = values;
                    } else if (label.includes("جودة المسلسل")) {
                        details.quality = values;
                    } else if (label.includes("موعد الصدور")) {
                        details.releaseYear = values;
                    } else if (label.includes("دولة المسلسل")) {
                        details.country = values;
                    } else if (label.includes("المخرجين")) {
                        details.directors = values;
                    } else if (label.includes("بطولة")) {
                        details.actors = values;
                    }
                }
            }
        });
        
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

// ==================== حفظ المواسم في ملف حسب ID المسلسل ====================
function saveSeasonsToFile(seriesId, seasonsData) {
    const seasonsFile = path.join(SEASONS_DIR, `series_${seriesId}.json`);
    
    const seasonsContent = {
        seriesId: seriesId,
        totalSeasons: seasonsData.length,
        scrapedAt: new Date().toISOString(),
        seasons: seasonsData
    };
    
    fs.writeFileSync(seasonsFile, JSON.stringify(seasonsContent, null, 2));
    console.log(`   💾 حفظ ${seasonsData.length} موسم في ${seasonsFile}`);
    
    return seasonsFile;
}

// ==================== حفظ الحلقات في ملف حسب ID الموسم ====================
function saveEpisodesToFile(seasonId, episodesData) {
    const episodesFile = path.join(EPISODES_DIR, `season_${seasonId}.json`);
    
    const episodesContent = {
        seasonId: seasonId,
        totalEpisodes: episodesData.length,
        scrapedAt: new Date().toISOString(),
        episodes: episodesData
    };
    
    fs.writeFileSync(episodesFile, JSON.stringify(episodesContent, null, 2));
    console.log(`     💾 حفظ ${episodesData.length} حلقة في ${episodesFile}`);
    
    return episodesFile;
}

// ==================== معالجة مسلسل واحد كاملاً ====================
async function processSingleSeries(seriesDetail) {
    console.log(`\n🔍 بدء معالجة المسلسل: ${seriesDetail.title}`);
    console.log(`   🆔 ID: ${seriesDetail.id}`);
    
    // 1. جلب المواسم
    const seasons = await fetchSeasonsFromSeries(seriesDetail.url, seriesDetail.id);
    
    if (seasons.length === 0) {
        console.log(`   ⏭️ لا توجد مواسم للمسلسل ${seriesDetail.id}`);
        return { seriesDetail, seasons: [], episodes: [] };
    }
    
    // انتظار قصير بين طلبات المواسم
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 2. حفظ المواسم
    saveSeasonsToFile(seriesDetail.id, seasons);
    
    const allEpisodes = [];
    
    // 3. جلب الحلقات لكل موسم
    for (let i = 0; i < seasons.length; i++) {
        const season = seasons[i];
        console.log(`   📖 معالجة ${season.title}...`);
        
        // جلب الحلقات من صفحة الموسم
        const episodes = await fetchEpisodesFromSeason(season.url, seriesDetail.id, season.seasonNumber);
        
        if (episodes.length === 0) {
            console.log(`   ⏭️ لا توجد حلقات في ${season.title}`);
            continue;
        }
        
        const seasonEpisodes = [];
        
        // 4. جلب تفاصيل كل حلقة
        for (let j = 0; j < episodes.length; j++) {
            const episode = episodes[j];
            
            const episodeDetails = await fetchEpisodeDetails(episode, seriesDetail.id, season.seasonNumber);
            
            if (episodeDetails) {
                seasonEpisodes.push(episodeDetails);
                console.log(`     ✅ حلقة ${episode.episodeNumber}: ${episodeDetails.watchServers?.length || 0} سيرفر مشاهدة, ${episodeDetails.downloadServers?.length || 0} سيرفر تحميل`);
            }
            
            // انتظار بين الحلقات
            if (j < episodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // 5. حفظ حلقات الموسم
        if (seasonEpisodes.length > 0) {
            saveEpisodesToFile(season.seasonNumber, seasonEpisodes);
            allEpisodes.push(...seasonEpisodes);
        }
        
        // انتظار بين المواسم
        if (i < seasons.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return { seriesDetail, seasons, episodes: allEpisodes };
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("📺 بدء استخراج المسلسلات الأجنبية");
    console.log("=".repeat(50));
    
    const pageNum = 1;
    
    // جلب صفحة المسلسلات
    const pageData = await fetchSeriesFromPage(pageNum);
    
    if (!pageData || pageData.series.length === 0) {
        console.log(`⏹️ لا توجد مسلسلات في الصفحة`);
        return { success: false, total: 0 };
    }
    
    const seriesData = [];
    const allResults = [];
    
    console.log(`🔍 استخراج تفاصيل ${pageData.series.length} مسلسل...`);
    
    // استخراج كل المسلسلات
    for (let i = 0; i < pageData.series.length; i++) {
        const series = pageData.series[i];
        
        const seriesDetails = await fetchSeriesDetails(series);
        
        if (seriesDetails && seriesDetails.id) {
            seriesData.push(seriesDetails);
            console.log(`   ✅ ${i + 1}/${pageData.series.length}: ${seriesDetails.title.substring(0, 30)}...`);
            console.log(`     🆔 ID: ${seriesDetails.id}`);
            console.log(`     📚 مواسم: ${seriesDetails.seasonsCount}`);
            
            // معالجة المسلسل كاملاً (المواسم والحلقات)
            const result = await processSingleSeries(seriesDetails);
            allResults.push(result);
            
            console.log(`     ✅ تم معالجة ${result.seasons.length} موسم و ${result.episodes.length} حلقة`);
        } else {
            console.log(`   ⏭️ تخطي المسلسل ${i + 1}`);
        }
        
        // انتظار بين المسلسلات
        if (i < pageData.series.length - 1) {
            console.log(`\n⏳ انتظار 2 ثواني قبل المسلسل التالي...\n`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // حفظ بيانات المسلسلات في Hg.json
    if (seriesData.length > 0) {
        const savedFile = saveSeriesToFile(pageData, seriesData);
        
        console.log(`\n✅ تم الانتهاء بنجاح!`);
        console.log(`📊 الإحصائيات النهائية:`);
        console.log(`   - المسلسلات المحفوظة: ${seriesData.length}`);
        
        const totalSeasons = allResults.reduce((sum, result) => sum + result.seasons.length, 0);
        const totalEpisodes = allResults.reduce((sum, result) => sum + result.episodes.length, 0);
        
        console.log(`   - إجمالي المواسم: ${totalSeasons}`);
        console.log(`   - إجمالي الحلقات: ${totalEpisodes}`);
        
        // عرض إحصائيات السيرفرات
        const totalWatchServers = allResults.reduce((sum, result) => 
            sum + result.episodes.reduce((epSum, ep) => epSum + (ep.watchServers?.length || 0), 0), 0);
        
        const totalDownloadServers = allResults.reduce((sum, result) => 
            sum + result.episodes.reduce((epSum, ep) => epSum + (ep.downloadServers?.length || 0), 0), 0);
        
        console.log(`   - إجمالي سيرفرات المشاهدة: ${totalWatchServers}`);
        console.log(`   - إجمالي سيرفرات التحميل: ${totalDownloadServers}`);
        
        // عرض هيكلية الملفات
        console.log(`\n📁 هيكلية الملفات المحفوظة:`);
        console.log(`   - ${savedFile} (بيانات المسلسلات)`);
        
        const seriesFiles = fs.readdirSync(path.join(SERIES_DIR, "Series")).filter(f => f.endsWith('.json'));
        const seasonFiles = fs.readdirSync(SEASONS_DIR).filter(f => f.endsWith('.json'));
        const episodeFiles = fs.readdirSync(EPISODES_DIR).filter(f => f.endsWith('.json'));
        
        console.log(`   - مجلد المواسم: ${seasonFiles.length} ملف`);
        console.log(`   - مجلد الحلقات: ${episodeFiles.length} ملف`);
        
        // عرض عينة من البيانات المحفوظة
        if (seriesData.length > 0) {
            console.log(`\n📋 عينة من البيانات المحفوظة:`);
            const sampleSeries = seriesData[0];
            console.log(`   المسلسل:`);
            console.log(`     1. ID: ${sampleSeries.id}`);
            console.log(`        العنوان: ${sampleSeries.title.substring(0, 40)}...`);
            console.log(`        الأنواع: ${sampleSeries.details.genres.join(', ')}`);
            console.log(`        تقييم IMDB: ${sampleSeries.imdbRating || 'غير متوفر'}`);
            
            const relatedResult = allResults.find(r => r.seriesDetail.id === sampleSeries.id);
            if (relatedResult && relatedResult.episodes.length > 0) {
                const sampleEpisode = relatedResult.episodes[0];
                console.log(`\n   الحلقة:`);
                console.log(`       الموسم: ${sampleEpisode.seasonId}`);
                console.log(`       الحلقة: ${sampleEpisode.episodeNumber}`);
                console.log(`       سيرفرات المشاهدة: ${sampleEpisode.watchServers?.length || 0}`);
                console.log(`       سيرفرات التحميل: ${sampleEpisode.downloadServers?.length || 0}`);
                
                if (sampleEpisode.watchServers && sampleEpisode.watchServers.length > 0) {
                    console.log(`       مثال سيرفر مشاهدة: ${sampleEpisode.watchServers[0].url.substring(0, 50)}...`);
                }
            }
        }
        
        return { success: true, total: seriesData.length };
    }
    
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
    
    fs.writeFileSync(path.join(SERIES_DIR, "error.json"), JSON.stringify(errorReport, null, 2));
});
