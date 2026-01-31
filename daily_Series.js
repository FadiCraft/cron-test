import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== الإعدادات ====================
const CONFIG = {
    baseUrl: "https://topcinema.rip",
    outputDir: path.join(__dirname, "Series"),
    
    sections: {
        agseries: {
            name: "مسلسلات عادية",
            url: "https://topcinema.rip/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/",
            type: "agseries"
        }
    },
    
    batchSize: {
        series: 500,
        seasons: 500,
        episodes: 5000
    },
    
    requestDelay: 2000,
    timeout: 30000,
    maxPagesFirstRun: 3
};

// ==================== إعداد النظام ====================
class SeriesScraper {
    constructor() {
        this.initSystem();
        this.stats = {
            totalSeries: 0,
            totalSeasons: 0,
            totalEpisodes: 0,
            startTime: new Date(),
            sections: {}
        };
    }
    
    initSystem() {
        if (!fs.existsSync(CONFIG.outputDir)) {
            fs.mkdirSync(CONFIG.outputDir, { recursive: true });
            console.log("📁 تم إنشاء مجلد Series");
        }
        
        for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.sections)) {
            const sectionDir = path.join(CONFIG.outputDir, sectionKey);
            
            if (!fs.existsSync(sectionDir)) {
                fs.mkdirSync(sectionDir, { recursive: true });
                console.log(`📁 تم إنشاء مجلد ${sectionKey}`);
            }
            
            const subDirs = ["TV_Series", "Seasons", "Episodes"];
            for (const subDir of subDirs) {
                const dirPath = path.join(sectionDir, subDir);
                
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                    console.log(`📁 تم إنشاء مجلد ${subDir}`);
                }
                
                const firstPagePath = path.join(dirPath, "Page1.json");
                if (!fs.existsSync(firstPagePath)) {
                    const firstPage = {
                        page: 1,
                        items: [],
                        total: 0,
                        createdAt: new Date().toISOString()
                    };
                    fs.writeFileSync(firstPagePath, JSON.stringify(firstPage, null, 2));
                }
                
                const currentPagePath = path.join(dirPath, "current_page.json");
                if (!fs.existsSync(currentPagePath)) {
                    const maxItems = subDir === "Episodes" ? CONFIG.batchSize.episodes : 
                                   subDir === "Seasons" ? CONFIG.batchSize.seasons : 
                                   CONFIG.batchSize.series;
                    
                    const currentPage = {
                        currentPage: 1,
                        itemsCount: 0,
                        maxItems: maxItems,
                        lastUpdated: new Date().toISOString()
                    };
                    fs.writeFileSync(currentPagePath, JSON.stringify(currentPage, null, 2));
                }
            }
            
            this.createInitialIndexes(sectionKey);
        }
    }
    
    createInitialIndexes(sectionKey) {
        const indexes = ["series_index", "seasons_index", "episodes_index"];
        
        for (const index of indexes) {
            const indexPath = path.join(CONFIG.outputDir, sectionKey, `${index}.json`);
            
            if (!fs.existsSync(indexPath)) {
                const initialData = {
                    meta: {
                        section: sectionKey,
                        created: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                        total: 0
                    },
                    items: {}
                };
                fs.writeFileSync(indexPath, JSON.stringify(initialData, null, 2));
            }
        }
    }
    
    async fetchWithTimeout(url, timeout = CONFIG.timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en;q=0.9'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.log(`⚠️ ${response.status} لـ ${url}`);
                return null;
            }
            
            return await response.text();
            
        } catch (error) {
            clearTimeout(timeoutId);
            console.log(`❌ ${error.name} لـ ${url}`);
            return null;
        }
    }
    
    extractIdFromShortLink(shortLink) {
        if (!shortLink) return `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const match = shortLink.match(/(?:gt|p)=(\d+)/);
        return match ? `id_${match[1]}` : `hash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ==================== استخراج الحلقات من صفحة الموسم ====================
    async extractEpisodesFromSeasonPage(doc, seriesId, seasonId) {
        const episodes = [];
        
        // البحث في قسم tabContents
        const tabContents = doc.querySelector('.tabContents');
        if (!tabContents) {
            console.log("❌ لم يتم العثور على قسم الحلقات");
            return episodes;
        }
        
        // البحث عن جميع الروابط في قسم الحلقات
        const episodeElements = tabContents.querySelectorAll('.row a');
        
        console.log(`🎥 عثر على ${episodeElements.length} عنصر في قسم الحلقات`);
        
        for (const element of episodeElements) {
            const episodeUrl = element.href;
            if (!episodeUrl) continue;
            
            // التحقق إذا كان الرابط يحتوي على "الحلقة" في النص أو الرابط
            const title = element.querySelector('.ep-info h2')?.textContent?.trim() || 
                         element.querySelector('h2')?.textContent?.trim() ||
                         element.getAttribute('title') || 'حلقة بدون عنوان';
            
            // إذا لم يكن العنوان يحتوي على "حلقة"، تخطى
            if (!title.includes('حلقة') && !episodeUrl.includes('الحلقة')) {
                continue;
            }
            
            const image = element.querySelector('img')?.src;
            
            // استخراج رقم الحلقة
            const episodeNumberElement = element.querySelector('.epnum');
            let episodeNumber = 1;
            
            if (episodeNumberElement) {
                const episodeNumberText = episodeNumberElement.textContent?.trim();
                if (episodeNumberText) {
                    const match = episodeNumberText.match(/\d+/);
                    if (match) {
                        episodeNumber = parseInt(match[0]);
                    }
                }
            } else {
                // محاولة استخراج رقم الحلقة من العنوان
                const titleMatch = title.match(/الحلقة\s*(\d+)/);
                if (titleMatch) {
                    episodeNumber = parseInt(titleMatch[1]);
                }
            }
            
            episodes.push({
                id: null,
                seriesId: seriesId,
                seasonId: seasonId,
                url: episodeUrl,
                title: title,
                image: image,
                episodeNumber: episodeNumber,
                scrapedAt: new Date().toISOString()
            });
        }
        
        console.log(`✅ تم استخراج ${episodes.length} حلقة`);
        return episodes;
    }
    
    // ==================== استخراج بيانات الحلقة الكاملة ====================
    async extractEpisodeDetails(episodeData) {
        console.log(`🎥 استخراج بيانات الحلقة: ${episodeData.title}`);
        
        const html = await this.fetchWithTimeout(episodeData.url);
        if (!html) return null;
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            // استخراج ID
            const shortLinkElement = doc.querySelector('#shortlink');
            const shortLink = shortLinkElement ? shortLinkElement.value : null;
            const episodeId = this.extractIdFromShortLink(shortLink);
            
            // روابط المشاهدة والتحميل
            const watchLink = doc.querySelector('a.watch')?.getAttribute('href');
            const downloadLink = doc.querySelector('a.download')?.getAttribute('href');
            
            // استخراج سيرفرات المشاهدة
            let watchServers = [];
            if (watchLink) {
                console.log(`   🔍 جلب سيرفرات المشاهدة من: ${watchLink}`);
                watchServers = await this.extractWatchServers(watchLink);
                await this.delay(500);
            }
            
            // استخراج سيرفرات التحميل
            let downloadServers = [];
            if (downloadLink) {
                console.log(`   🔍 جلب سيرفرات التحميل من: ${downloadLink}`);
                downloadServers = await this.extractDownloadServers(downloadLink);
                await this.delay(500);
            }
            
            return {
                ...episodeData,
                id: episodeId,
                shortLink: shortLink,
                watchLink: watchLink,
                downloadLink: downloadLink,
                watchServers: watchServers,
                downloadServers: downloadServers,
                scrapedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج بيانات الحلقة: ${error.message}`);
            return null;
        }
    }
    
    // ==================== استخراج سيرفرات المشاهدة ====================
    async extractWatchServers(watchUrl) {
        console.log(`   📺 استخراج سيرفرات المشاهدة`);
        const html = await this.fetchWithTimeout(watchUrl);
        if (!html) return [];
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const servers = [];
            
            // البحث عن جميع السيرفرات
            // 1. من خلال iframes
            const iframes = doc.querySelectorAll('iframe');
            iframes.forEach((iframe, index) => {
                const src = iframe.getAttribute('src');
                if (src && (src.includes('//') || src.includes('http'))) {
                    servers.push({
                        id: `watch_${Date.now()}_${index}`,
                        type: 'iframe',
                        url: src.startsWith('http') ? src : `https:${src}`,
                        quality: 'متعدد الجودات',
                        server: `سيرفر مشاهدة ${index + 1}`,
                        name: `سيرفر ${index + 1}`
                    });
                }
            });
            
            // 2. من خلال روابط embed في scripts
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(script => {
                const scriptContent = script.textContent || '';
                const embedMatches = scriptContent.match(/"embed"\s*:\s*"([^"]+)"/g);
                if (embedMatches) {
                    embedMatches.forEach((match, index) => {
                        const urlMatch = match.match(/"([^"]+)"/);
                        if (urlMatch && urlMatch[1]) {
                            servers.push({
                                id: `embed_${Date.now()}_${index}`,
                                type: 'embed',
                                url: urlMatch[1],
                                quality: 'متعدد الجودات',
                                server: 'Embed Player',
                                name: 'مشاهدة مباشرة'
                            });
                        }
                    });
                }
            });
            
            // 3. من خلال روابط الفيديو المباشرة
            const videoElements = doc.querySelectorAll('video source');
            videoElements.forEach((video, index) => {
                const src = video.getAttribute('src');
                if (src) {
                    servers.push({
                        id: `video_${Date.now()}_${index}`,
                        type: 'video',
                        url: src,
                        quality: video.getAttribute('data-quality') || 'غير معروف',
                        server: 'فيديو مباشر',
                        name: `جودة ${video.getAttribute('data-quality') || 'مجهولة'}`
                    });
                }
            });
            
            console.log(`   ✅ تم العثور على ${servers.length} سيرفر مشاهدة`);
            return servers;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
            return [];
        }
    }
    
    // ==================== استخراج سيرفرات التحميل ====================
    async extractDownloadServers(downloadUrl) {
        console.log(`   💾 استخراج سيرفرات التحميل`);
        const html = await this.fetchWithTimeout(downloadUrl);
        if (!html) return [];
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const servers = [];
            
            // 1. سيرفرات Pro
            const proServerElements = doc.querySelectorAll('.proServer a.downloadsLink');
            proServerElements.forEach((server, index) => {
                const nameElement = server.querySelector('.text span');
                const providerElement = server.querySelector('.text p');
                
                const serverName = nameElement?.textContent?.trim() || 'متعدد الجودات';
                const provider = providerElement?.textContent?.trim() || 'غير معروف';
                const url = server.getAttribute('href') || '';
                
                if (url) {
                    servers.push({
                        id: `pro_${Date.now()}_${index}`,
                        server: provider,
                        url: url,
                        quality: serverName,
                        type: 'pro',
                        name: `Pro ${provider}`
                    });
                }
            });
            
            // 2. سيرفرات عادية
            const normalServerElements = doc.querySelectorAll('.download-items li a.downloadsLink');
            normalServerElements.forEach((server, index) => {
                const providerElement = server.querySelector('.text span');
                const qualityElement = server.querySelector('.text p');
                
                const provider = providerElement?.textContent?.trim() || 'غير معروف';
                const quality = qualityElement?.textContent?.trim() || 'غير معروف';
                const url = server.getAttribute('href') || '';
                
                if (url) {
                    servers.push({
                        id: `normal_${Date.now()}_${index}`,
                        server: provider,
                        url: url,
                        quality: quality,
                        type: 'normal',
                        name: `${provider} - ${quality}`
                    });
                }
            });
            
            // 3. روابط مباشرة أخرى
            const directLinks = doc.querySelectorAll('a[href*="drive.google.com"], a[href*="mega.nz"], a[href*="mediafire.com"], a[href*="zippyshare.com"]');
            directLinks.forEach((link, index) => {
                const url = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || 'رابط مباشر';
                
                if (url) {
                    servers.push({
                        id: `direct_${Date.now()}_${index}`,
                        server: 'مباشر',
                        url: url,
                        quality: text,
                        type: 'direct',
                        name: text
                    });
                }
            });
            
            console.log(`   ✅ تم العثور على ${servers.length} سيرفر تحميل`);
            return servers;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج سيرفرات التحميل: ${error.message}`);
            return [];
        }
    }
    
    // ==================== استخراج المسلسلات من الصفحة ====================
    async extractSeriesFromPage(pageUrl, section) {
        console.log(`📖 جلب صفحة: ${pageUrl}`);
        
        const html = await this.fetchWithTimeout(pageUrl);
        if (!html) return [];
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const seriesList = [];
            
            const seriesElements = doc.querySelectorAll('.Small--Box a');
            console.log(`📊 عثر على ${seriesElements.length} مسلسل`);
            
            for (const element of seriesElements) {
                const seriesUrl = element.href;
                if (!seriesUrl || !seriesUrl.includes('topcinema.rip')) continue;
                
                const title = element.querySelector('.title')?.textContent?.trim() || 
                            element.textContent?.trim() || 
                            'مسلسل بدون عنوان';
                
                const image = element.querySelector('img')?.src;
                
                const seasonsCountElement = element.querySelector('.number.Collection span');
                const seasonsCount = seasonsCountElement ? 
                    parseInt(seasonsCountElement.textContent.replace('موسم', '').trim()) || 1 : 1;
                
                const imdbElement = element.querySelector('.imdbRating');
                const imdbRating = imdbElement ? 
                    imdbElement.textContent.replace('IMDb', '').trim() : null;
                
                const genres = [];
                const genreElements = element.querySelectorAll('.liList li');
                genreElements.forEach(li => {
                    if (!li.classList.contains('imdbRating')) {
                        genres.push(li.textContent.trim());
                    }
                });
                
                seriesList.push({
                    id: null,
                    url: seriesUrl,
                    title: title,
                    image: image,
                    seasonsCount: seasonsCount,
                    imdbRating: imdbRating,
                    genres: genres,
                    section: section,
                    discoveredAt: new Date().toISOString()
                });
            }
            
            return seriesList;
            
        } catch (error) {
            console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
            return [];
        }
    }
    
    // ==================== استخراج بيانات المسلسل الكاملة ====================
    async extractSeriesDetails(seriesUrl) {
        console.log(`🎬 استخراج بيانات المسلسل: ${seriesUrl}`);
        
        const html = await this.fetchWithTimeout(seriesUrl);
        if (!html) return null;
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            const shortLinkElement = doc.querySelector('#shortlink');
            const shortLink = shortLinkElement ? shortLinkElement.value : null;
            const seriesId = this.extractIdFromShortLink(shortLink);
            
            const title = doc.querySelector('.post-title a')?.textContent?.trim() || 'بدون عنوان';
            const image = doc.querySelector('.image img')?.src;
            const imdbRating = doc.querySelector('.imdbR span')?.textContent?.trim();
            const story = doc.querySelector('.story p')?.textContent?.trim() || "غير متوفر";
            
            const details = {
                category: [],
                genres: [],
                quality: [],
                duration: "",
                releaseYear: [],
                language: [],
                country: [],
                directors: [],
                actors: []
            };
            
            const detailItems = doc.querySelectorAll('.RightTaxContent li');
            detailItems.forEach(item => {
                const labelElement = item.querySelector('span');
                if (labelElement) {
                    const label = labelElement.textContent.replace(':', '').trim();
                    const links = item.querySelectorAll('a');
                    
                    if (links.length > 0) {
                        const values = Array.from(links).map(a => a.textContent.trim());
                        
                        if (label.includes('قسم المسلسل')) details.category = values;
                        else if (label.includes('نوع المسلسل')) details.genres = values;
                        else if (label.includes('جودة المسلسل')) details.quality = values;
                        else if (label.includes('موعد الصدور')) details.releaseYear = values;
                        else if (label.includes('لغة المسلسل')) details.language = values;
                        else if (label.includes('دولة المسلسل')) details.country = values;
                        else if (label.includes('المخرجين')) details.directors = values;
                        else if (label.includes('بطولة')) details.actors = values;
                    } else {
                        const text = item.textContent.trim();
                        const value = text.split(':').slice(1).join(':').trim();
                        if (label.includes('توقيت المسلسل')) details.duration = value;
                    }
                }
            });
            
            const seasons = await this.extractSeasonsFromSeriesPage(doc, seriesId);
            
            return {
                id: seriesId,
                title: title,
                url: seriesUrl,
                shortLink: shortLink,
                image: image,
                imdbRating: imdbRating,
                story: story,
                details: details,
                seasonsCount: seasons.length,
                seasons: seasons,
                scrapedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج بيانات المسلسل: ${error.message}`);
            return null;
        }
    }
    
    async extractSeasonsFromSeriesPage(doc, seriesId) {
        const seasons = [];
        const seasonElements = doc.querySelectorAll('.Small--Box.Season a');
        
        console.log(`📦 عثر على ${seasonElements.length} موسم`);
        
        for (const element of seasonElements) {
            const seasonUrl = element.href;
            if (!seasonUrl) continue;
            
            const title = element.querySelector('.title')?.textContent?.trim() || 'موسم بدون عنوان';
            const image = element.querySelector('img')?.src;
            
            const seasonNumberElement = element.querySelector('.epnum span');
            const seasonNumberText = seasonNumberElement?.nextSibling?.textContent?.trim();
            const seasonNumber = seasonNumberText ? parseInt(seasonNumberText) : 1;
            
            seasons.push({
                id: null,
                seriesId: seriesId,
                url: seasonUrl,
                title: title,
                image: image,
                seasonNumber: seasonNumber,
                scrapedAt: new Date().toISOString()
            });
        }
        
        return seasons;
    }
    
    async extractSeasonDetails(seasonData) {
        console.log(`📦 استخراج بيانات الموسم: ${seasonData.title}`);
        
        const html = await this.fetchWithTimeout(seasonData.url);
        if (!html) return null;
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            const shortLinkElement = doc.querySelector('#shortlink');
            const shortLink = shortLinkElement ? shortLinkElement.value : null;
            const seasonId = this.extractIdFromShortLink(shortLink);
            
            const episodes = await this.extractEpisodesFromSeasonPage(doc, seasonData.seriesId, seasonId);
            
            return {
                ...seasonData,
                id: seasonId,
                shortLink: shortLink,
                episodesCount: episodes.length,
                episodes: episodes,
                scrapedAt: new Date().toISOString()
            };
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج بيانات الموسم: ${error.message}`);
            return null;
        }
    }
    
    // ==================== تخزين البيانات ====================
    async addToStorage(section, type, data) {
        let folderName, indexFile;
        
        switch (type) {
            case 'series':
                folderName = 'TV_Series';
                indexFile = 'series_index.json';
                break;
            case 'season':
                folderName = 'Seasons';
                indexFile = 'seasons_index.json';
                break;
            case 'episode':
                folderName = 'Episodes';
                indexFile = 'episodes_index.json';
                break;
            default:
                console.log(`❌ نوع غير معروف: ${type}`);
                return false;
        }
        
        const storageDir = path.join(CONFIG.outputDir, section, folderName);
        
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
            console.log(`📁 تم إنشاء مجلد: ${storageDir}`);
        }
        
        const currentPagePath = path.join(storageDir, 'current_page.json');
        let currentPage;
        
        if (!fs.existsSync(currentPagePath)) {
            const batchSize = type === 'series' ? CONFIG.batchSize.series :
                            type === 'season' ? CONFIG.batchSize.seasons :
                            CONFIG.batchSize.episodes;
            
            currentPage = {
                currentPage: 1,
                itemsCount: 0,
                maxItems: batchSize,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(currentPagePath, JSON.stringify(currentPage, null, 2));
        } else {
            currentPage = JSON.parse(fs.readFileSync(currentPagePath, 'utf8'));
        }
        
        if (currentPage.itemsCount >= currentPage.maxItems) {
            currentPage.currentPage += 1;
            currentPage.itemsCount = 0;
            currentPage.lastUpdated = new Date().toISOString();
            fs.writeFileSync(currentPagePath, JSON.stringify(currentPage, null, 2));
            
            console.log(`📄 إنشاء صفحة جديدة: ${folderName} Page${currentPage.currentPage}`);
        }
        
        const currentPageFile = path.join(storageDir, `Page${currentPage.currentPage}.json`);
        let pageData;
        
        if (!fs.existsSync(currentPageFile)) {
            pageData = {
                page: currentPage.currentPage,
                items: [],
                total: 0,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };
        } else {
            pageData = JSON.parse(fs.readFileSync(currentPageFile, 'utf8'));
        }
        
        const exists = pageData.items.some(item => item.id === data.id);
        if (exists) {
            console.log(`   ⚠️ ${type} ${data.id} موجود مسبقاً`);
            return false;
        }
        
        pageData.items.push(data);
        pageData.total = pageData.items.length;
        pageData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(currentPageFile, JSON.stringify(pageData, null, 2));
        
        currentPage.itemsCount = pageData.items.length;
        currentPage.lastUpdated = new Date().toISOString();
        fs.writeFileSync(currentPagePath, JSON.stringify(currentPage, null, 2));
        
        await this.updateIndex(section, indexFile, data, currentPage.currentPage);
        
        console.log(`   ✅ تم تخزين ${type}: ${data.title.substring(0, 30)}...`);
        return true;
    }
    
    async updateIndex(section, indexName, data, pageNumber) {
        const indexPath = path.join(CONFIG.outputDir, section, indexName);
        let index;
        
        if (!fs.existsSync(indexPath)) {
            index = {
                meta: {
                    section: section,
                    created: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    total: 0
                },
                items: {}
            };
        } else {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }
        
        index.items[data.id] = {
            id: data.id,
            title: data.title,
            url: data.url,
            scrapedAt: data.scrapedAt,
            storedIn: `Page${pageNumber}`,
            lastUpdated: new Date().toISOString()
        };
        
        index.meta.total = Object.keys(index.items).length;
        index.meta.lastUpdated = new Date().toISOString();
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }
    
    // ==================== التشغيل الأولي ====================
    async firstRun() {
        console.log("🚀 بدء التشغيل الأولي - تخزين المسلسلات العادية فقط");
        console.log("=".repeat(60));
        
        for (const [sectionKey, sectionInfo] of Object.entries(CONFIG.sections)) {
            console.log(`\n📺 بدء قسم: ${sectionInfo.name}`);
            console.log("-".repeat(40));
            
            let pageNum = 1;
            let hasMorePages = true;
            
            while (hasMorePages && pageNum <= CONFIG.maxPagesFirstRun) {
                const pageUrl = pageNum === 1 ? 
                    sectionInfo.url : 
                    `${sectionInfo.url}page/${pageNum}/`;
                
                console.log(`\n📄 الصفحة ${pageNum}: ${pageUrl}`);
                
                const seriesList = await this.extractSeriesFromPage(pageUrl, sectionKey);
                
                if (seriesList.length === 0) {
                    console.log(`⏹️ لا توجد مسلسلات في الصفحة ${pageNum}`);
                    hasMorePages = false;
                    break;
                }
                
                console.log(`🔍 عثر على ${seriesList.length} مسلسل`);
                
                for (let i = 0; i < seriesList.length; i++) {
                    const series = seriesList[i];
                    console.log(`\n🎬 [${i + 1}/${seriesList.length}] معالجة: ${series.title.substring(0, 50)}...`);
                    
                    const seriesDetails = await this.extractSeriesDetails(series.url);
                    
                    if (seriesDetails) {
                        const stored = await this.addToStorage(sectionKey, 'series', seriesDetails);
                        
                        if (stored) {
                            this.stats.totalSeries++;
                            this.stats.sections[sectionKey] = this.stats.sections[sectionKey] || { 
                                series: 0, 
                                seasons: 0, 
                                episodes: 0 
                            };
                            this.stats.sections[sectionKey].series++;
                            
                            const maxSeasons = Math.min(seriesDetails.seasons.length, 3);
                            console.log(`📦 معالجة ${maxSeasons} موسم (من أصل ${seriesDetails.seasons.length})`);
                            
                            for (let j = 0; j < maxSeasons; j++) {
                                const season = seriesDetails.seasons[j];
                                console.log(`   📋 الموسم ${j + 1}/${maxSeasons}: ${season.title}`);
                                
                                const seasonDetails = await this.extractSeasonDetails(season);
                                
                                if (seasonDetails) {
                                    await this.addToStorage(sectionKey, 'season', seasonDetails);
                                    this.stats.totalSeasons++;
                                    this.stats.sections[sectionKey].seasons = (this.stats.sections[sectionKey].seasons || 0) + 1;
                                    
                                    const maxEpisodes = Math.min(seasonDetails.episodes.length, 3);
                                    console.log(`   🎥 معالجة ${maxEpisodes} حلقة (من أصل ${seasonDetails.episodes.length})`);
                                    
                                    for (let k = 0; k < maxEpisodes; k++) {
                                        const episode = seasonDetails.episodes[k];
                                        console.log(`      📺 الحلقة ${k + 1}/${maxEpisodes}: ${episode.title}`);
                                        
                                        const episodeDetails = await this.extractEpisodeDetails(episode);
                                        
                                        if (episodeDetails) {
                                            await this.addToStorage(sectionKey, 'episode', episodeDetails);
                                            this.stats.totalEpisodes++;
                                            this.stats.sections[sectionKey].episodes = (this.stats.sections[sectionKey].episodes || 0) + 1;
                                        }
                                        
                                        if (k < maxEpisodes - 1) {
                                            await this.delay(1000);
                                        }
                                    }
                                }
                                
                                if (j < maxSeasons - 1) {
                                    await this.delay(1500);
                                }
                            }
                        }
                    }
                    
                    if (i < seriesList.length - 1) {
                        await this.delay(CONFIG.requestDelay);
                    }
                }
                
                pageNum++;
                if (hasMorePages && pageNum <= CONFIG.maxPagesFirstRun) {
                    await this.delay(CONFIG.requestDelay);
                }
            }
            
            console.log(`\n✅ اكتمل قسم ${sectionInfo.name}`);
        }
        
        console.log("\n" + "=".repeat(60));
        console.log("🎉 التشغيل الأولي مكتمل!");
        this.printStats();
    }
    
    async dailyUpdate() {
        console.log("🔄 بدء الفحص اليومي");
        console.log("=".repeat(60));
        await this.firstRun();
    }
    
    printStats() {
        const endTime = new Date();
        const duration = (endTime - this.stats.startTime) / 1000 / 60;
        
        console.log("\n📈 الإحصائيات النهائية:");
        console.log("-".repeat(40));
        console.log(`⏱️  المدة: ${duration.toFixed(2)} دقيقة`);
        console.log(`🎬 إجمالي المسلسلات: ${this.stats.totalSeries}`);
        console.log(`📦 إجمالي المواسم: ${this.stats.totalSeasons}`);
        console.log(`🎥 إجمالي الحلقات: ${this.stats.totalEpisodes}`);
        
        for (const [section, stats] of Object.entries(this.stats.sections)) {
            console.log(`\n   ${CONFIG.sections[section].name}:`);
            console.log(`     - مسلسلات: ${stats.series || 0}`);
            console.log(`     - مواسم: ${stats.seasons || 0}`);
            console.log(`     - حلقات: ${stats.episodes || 0}`);
        }
    }
    
    async run() {
        console.log("🎬 نظام تخزين المسلسلات العادية فقط من topcinema.rip");
        console.log("=".repeat(60));
        
        const isFirstRun = this.checkIfFirstRun();
        
        if (isFirstRun) {
            console.log("🆕 هذا هو التشغيل الأول للنظام");
            await this.firstRun();
        } else {
            console.log("🔄 وضع التحديث اليومي");
            await this.dailyUpdate();
        }
        
        console.log("\n✨ اكتمل التشغيل بنجاح!");
    }
    
    checkIfFirstRun() {
        for (const sectionKey of Object.keys(CONFIG.sections)) {
            const indexPath = path.join(CONFIG.outputDir, sectionKey, 'series_index.json');
            if (fs.existsSync(indexPath)) {
                try {
                    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                    if (index.meta.total > 0) {
                        return false;
                    }
                } catch (error) {
                    console.log(`⚠️ خطأ في قراءة الفهرس: ${error.message}`);
                }
            }
        }
        return true;
    }
}

// ==================== التشغيل ====================
const scraper = new SeriesScraper();
scraper.run().catch(error => {
    console.error('💥 خطأ غير متوقع:', error);
    process.exit(1);
});
