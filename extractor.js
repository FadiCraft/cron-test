// extractor.js - مستخرج مسلسلات وحلقات رمضان 2026
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
    BASE_URL: 'https://laroza.lol',
    CATEGORY: 'ramadan-2026',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: path.join(__dirname, 'data', 'Ramdan'),
    SERIES_DIR: 'series',
    ECLIPS_DIR: 'eclips',
    MAX_PAGES: 50,
    REQUEST_DELAY: 2000,
    MAX_RETRIES: 3
};

class ProgressTracker {
    constructor(dataDir) {
        this.filePath = path.join(dataDir, 'progress.json');
        this.data = null;
    }

    async load() {
        try {
            const content = await fs.readFile(this.filePath, 'utf-8');
            this.data = JSON.parse(content);
        } catch (error) {
            // إذا الملف ما موجود، ننشئه جديد
            this.data = {
                last_scan: null,
                series: {}, // لكل مسلسل: آخر حلقة استخرجناها
                statistics: {
                    total_series: 0,
                    total_episodes: 0
                }
            };
        }
        return this.data;
    }

    async save() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    }

    // هل هذه الحلقة جديدة؟ (ما استخرجناها قبل كدة)
    isEpisodeNew(seriesId, episodeId) {
        const seriesProgress = this.data.series[seriesId];
        if (!seriesProgress) return true; // مسلسل جديد
        
        // نشوف إذا في هادا الحلقة محفوظة
        return !seriesProgress.episodes || !seriesProgress.episodes[episodeId];
    }

    // سجل أننا استخرجنا حلقة
    markEpisodeExtracted(seriesId, episodeId, episodeData) {
        if (!this.data.series[seriesId]) {
            this.data.series[seriesId] = {
                last_episode: null,
                episodes: {}
            };
        }
        
        this.data.series[seriesId].episodes[episodeId] = {
            extracted_at: new Date().toISOString(),
            title: episodeData.title,
            number: episodeData.number,
            season: episodeData.season
        };
        
        this.data.series[seriesId].last_episode = episodeId;
        this.data.last_scan = new Date().toISOString();
    }

    // سجل مسلسل جديد
    markSeriesExtracted(seriesId, seriesData) {
        if (!this.data.series[seriesId]) {
            this.data.series[seriesId] = {
                first_seen: new Date().toISOString(),
                title: seriesData.title,
                episodes: {}
            };
        }
    }

    // جلب آخر توقيت مسح
    getLastScanTime() {
        return this.data.last_scan ? new Date(this.data.last_scan) : null;
    }
}

class SeriesExtractor {
    constructor(progressTracker) {
        this.progress = progressTracker;
        this.seriesList = []; // للمسلسلات في Home.json
        this.newEpisodes = []; // للحلقات الجديدة فقط
        this.allEpisodes = []; // جميع الحلقات (لإعادة توزيعها)
    }

    async fetch(url, retryCount = 0) {
        for (const proxy of CONFIG.PROXIES) {
            try {
                const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                const response = await axios({
                    method: 'get',
                    url: fetchUrl,
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
                    },
                    maxRedirects: 5,
                    validateStatus: status => status < 400
                });
                
                if (response.data && typeof response.data === 'string' && response.data.length > 500) {
                    return response.data;
                }
            } catch (e) {
                // جرب البروكسي التالي
                continue;
            }
        }
        
        if (retryCount < CONFIG.MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            return this.fetch(url, retryCount + 1);
        }
        
        throw new Error(`فشل الاتصال بـ ${url}`);
    }

    // استخراج رقم الحلقة من العنوان
    extractEpisodeNumber(title) {
        const patterns = [
            /الحلقة\s*(\d+)/i,
            /حلقة\s*(\d+)/i,
            /episode\s*(\d+)/i,
            /(\d+)\s*الاولى|الثانية|الثالثة|الرابعة|الخامسة/i
        ];
        
        for (let pattern of patterns) {
            const match = title.match(pattern);
            if (match) return parseInt(match[1]);
        }
        
        return null;
    }

    // استخراج ID المسلسل من الرابط
    extractSeriesId(link) {
        const match = link.match(/[?&]ser=([a-f0-9]+)/i) || 
                     link.match(/serie1\.php\?ser=([a-f0-9]+)/i) ||
                     link.match(/ser=([a-f0-9]+)/i);
        
        return match ? match[1] : null;
    }

    // استخراج ID الحلقة من الرابط
    extractEpisodeId(link) {
        const match = link.match(/[?&]vid=([a-f0-9]+)/i) || 
                     link.match(/video\.php\?vid=([a-f0-9]+)/i);
        
        return match ? match[1] : null;
    }

    // إصلاح رابط الصورة
    fixImage(url) {
        if (!url) return '';
        
        // إذا الرابط يبدأ بـ //
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        // إذا الرابط يبدأ بـ /
        if (url.startsWith('/')) {
            return CONFIG.BASE_URL + url;
        }
        
        // إذا الرابط ما يبدأ بـ http
        if (!url.startsWith('http')) {
            return CONFIG.BASE_URL + '/' + url;
        }
        
        // تأكد من أن الرابط يستخدم https
        if (url.startsWith('http://')) {
            url = url.replace('http://', 'https://');
        }
        
        // بدل laroza.cfd إلى q.larozavideo.net إذا لزم الأمر
        if (url.includes('laroza.cfd')) {
            url = url.replace('laroza.cfd', 'q.larozavideo.net');
        }
        
        return url;
    }

    // استخراج جميع المسلسلات من الصفحات
    async extractAllSeries() {
        console.log('\n🔍 جاري استخراج المسلسلات...');
        
        const allSeries = new Map(); // استخدم Map عشان نضمن عدم التكرار
        
        for (let page = 1; page <= CONFIG.MAX_PAGES; page++) {
            console.log(`📄 مسح الصفحة ${page} للمسلسلات...`);
            
            try {
                const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${page}&order=DESC`;
                const html = await this.fetch(pageUrl);
                const $ = cheerio.load(html);
                
                // استخراج روابط المسلسلات
                $('a.icon-link[href*="view-serie1.php"]').each((i, el) => {
                    const link = $(el).attr('href');
                    const title = $(el).text().trim();
                    const seriesId = this.extractSeriesId(link);
                    
                    if (seriesId && title) {
                        // نحاول نلقى الصورة
                        let image = '';
                        
                        // البحث عن الصورة في العناصر القريبة
                        const parentDiv = $(el).closest('div').parent();
                        const img = parentDiv.find('img.pm-thumb').first() || 
                                   parentDiv.find('img').first() ||
                                   $(el).closest('.item, .post, div').find('img[src*="thumbs"]').first();
                        
                        if (img.length) {
                            image = img.attr('src') || img.attr('data-src') || img.attr('data-original') || '';
                        }
                        
                        allSeries.set(seriesId, {
                            id: seriesId,
                            title: title,
                            image: this.fixImage(image),
                            seasons: 1, // سنحدثها لاحقاً من صفحة المسلسل
                            last_season: 1,
                            last_update: new Date().toISOString()
                        });
                    }
                });
                
                // تأخير بين الصفحات
                if (page < CONFIG.MAX_PAGES) {
                    await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
                }
                
            } catch (error) {
                console.log(`⚠️ خطأ في الصفحة ${page}: ${error.message}`);
            }
        }
        
        console.log(`✅ تم العثور على ${allSeries.size} مسلسل`);
        
        // تحويل Map إلى Array
        this.seriesList = Array.from(allSeries.values());
        
        return this.seriesList;
    }

    // استخراج آخر موسم من صفحة المسلسل
    async extractLastSeason(series) {
        try {
            const seriesUrl = `${CONFIG.BASE_URL}/view-serie1.php?ser=${series.id}`;
            const html = await this.fetch(seriesUrl);
            const $ = cheerio.load(html);
            
            // استخراج العنوان الكامل
            const fullTitle = $('h1.title').first().text().trim();
            if (fullTitle) {
                series.title = fullTitle;
            }
            
            // استخراج الصورة إذا ما لقيناها قبل
            if (!series.image) {
                const img = $('.pm-poster-img img, .poster img, img[src*="thumbs"]').first();
                series.image = this.fixImage(img.attr('src') || img.attr('data-src') || '');
            }
            
            // البحث عن كل المواسم
            const seasons = [];
            
            // البحث عن عناصر الموسم (بطرق مختلفة)
            $('.Tab button.tablinks, .seasons button, [class*="season"] button, .tab button').each((i, el) => {
                const seasonText = $(el).text().trim();
                const match = seasonText.match(/\d+/);
                if (match) {
                    seasons.push(parseInt(match[0]));
                }
            });
            
            // البحث عن divs الخاصة بالمواسم
            let lastSeasonDiv = null;
            let lastSeasonNumber = 1;
            
            $('div[id^="Season"], div[class*="season"], .tabcontent').each((i, el) => {
                const id = $(el).attr('id') || '';
                const match = id.match(/Season(\d+)/i);
                if (match) {
                    const seasonNum = parseInt(match[1]);
                    seasons.push(seasonNum);
                    
                    // إذا كان هذا أكبر رقم، نخزنه
                    if (seasonNum > lastSeasonNumber) {
                        lastSeasonNumber = seasonNum;
                        lastSeasonDiv = $(el);
                    }
                }
            });
            
            // إذا في مواسم متعددة، نأخذ آخر واحد
            let targetSeason = 1;
            let seasonHtml = html;
            
            if (seasons.length > 0) {
                targetSeason = Math.max(...seasons);
                series.seasons = seasons.length;
                series.last_season = targetSeason;
                console.log(`   📺 المسلسل فيه ${seasons.length} مواسم, نأخذ الموسم ${targetSeason}`);
                
                // البحث عن div الموسم الأخير
                const lastSeasonId = `Season${targetSeason}`;
                const seasonDiv = $(`#${lastSeasonId}, .${lastSeasonId}, [data-season="${targetSeason}"]`).first();
                
                if (seasonDiv.length) {
                    // استخراج HTML الموسم
                    seasonHtml = seasonDiv.html() || html;
                }
            } else {
                console.log(`   📺 المسلسل موسم واحد`);
            }
            
            return {
                targetSeason,
                seasonHtml
            };
            
        } catch (error) {
            console.log(`   ❌ خطأ في استخراج المواسم: ${error.message}`);
            return {
                targetSeason: 1,
                seasonHtml: html
            };
        }
    }

    // استخراج الحلقات من الموسم
    async extractEpisodesFromSeason(series, html, seasonNum) {
        const $ = cheerio.load(html);
        const episodes = [];
        
        $('.thumbnail, .post, .item, .video-item, li.col-xs-6').each((i, el) => {
            try {
                const $el = $(el);
                
                // رابط الحلقة
                let link = $el.find('a[href*="video.php"]').attr('href') || 
                          $el.find('a[href*="vid="]').attr('href') ||
                          $el.find('a').first().attr('href');
                
                if (!link || link === '#' || link.includes('javascript')) return;
                
                if (!link.startsWith('http')) {
                    link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                }
                
                // عنوان الحلقة
                let title = $el.find('.ellipsis').text().trim() || 
                           $el.find('h3 a').text().trim() ||
                           $el.find('img').attr('alt') ||
                           'حلقة';
                
                // صورة الحلقة
                let image = $el.find('img').attr('src') || 
                           $el.find('img').attr('data-src') || 
                           $el.find('img').attr('data-original') || 
                           '';
                
                if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                    image = '';
                }
                
                // استخراج ID الحلقة
                const episodeId = this.extractEpisodeId(link);
                if (!episodeId) return;
                
                // استخراج رقم الحلقة
                const episodeNumber = this.extractEpisodeNumber(title);
                
                // المدة
                let duration = $el.find('.duration, .pm-label-duration, .time').first().text().trim() || '00:00';
                
                episodes.push({
                    id: episodeId,
                    series_id: series.id,
                    number: episodeNumber,
                    title: title,
                    image: this.fixImage(image),
                    link: link,
                    season: seasonNum,
                    duration: duration,
                    servers: [], // سنعباها لاحقاً
                    extracted_at: new Date().toISOString()
                });
                
            } catch (e) {
                // تجاهل الخطأ واستمر
            }
        });
        
        console.log(`   📥 تم العثور على ${episodes.length} حلقة في الموسم ${seasonNum}`);
        
        return episodes;
    }

    // معالجة مسلسل واحد
    async processSeries(series) {
        console.log(`\n🎬 معالجة مسلسل: ${series.title}`);
        
        try {
            // استخراج آخر موسم
            const { targetSeason, seasonHtml } = await this.extractLastSeason(series);
            
            // استخراج حلقات آخر موسم
            const episodes = await this.extractEpisodesFromSeason(series, seasonHtml, targetSeason);
            
            // معالجة كل حلقة
            for (let i = 0; i < episodes.length; i++) {
                const episode = episodes[i];
                
                // تحقق إذا كانت الحلقة جديدة
                if (this.progress.isEpisodeNew(series.id, episode.id)) {
                    console.log(`      🔄 [جديد] ${episode.title.substring(0, 50)}...`);
                    
                    // استخرج السيرفرات
                    await this.extractEpisodeServers(episode);
                    
                    // أضفها للحلقات الجديدة
                    this.newEpisodes.push(episode);
                    
                    // سجل في progress
                    this.progress.markEpisodeExtracted(series.id, episode.id, episode);
                    
                    // تأخير بين الحلقات
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.log(`      ✅ [قديم] ${episode.title.substring(0, 40)}... (موجود)`);
                    
                    // حتى لو قديمة، نحتاجها لإعادة التوزيع
                    // لكن بدون سيرفرات (لأنها محفوظة)
                    this.allEpisodes.push(episode);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ خطأ في معالجة المسلسل: ${error.message}`);
        }
    }

    // استخراج السيرفرات من صفحة التشغيل
    async extractEpisodeServers(episode) {
        try {
            // نحول رابط video.php إلى play.php
            const playUrl = episode.link.replace('video.php', 'play.php');
            
            const html = await this.fetch(playUrl);
            const $ = cheerio.load(html);
            
            const servers = [];
            
            // استخراج السيرفرات
            $('.WatchList li, .server-list li, .servers li, [class*="server"] li').each((i, el) => {
                const $el = $(el);
                
                // الرابط ممكن يكون في data-embed-url أو data-src أو href
                let embedUrl = $el.attr('data-embed-url') || 
                              $el.attr('data-src') || 
                              $el.find('a').attr('href') ||
                              $el.find('iframe').attr('src');
                
                if (embedUrl && embedUrl !== '#') {
                    let serverName = $el.find('strong').text().trim() || 
                                    $el.find('.name').text().trim() || 
                                    $el.text().trim().split('\n')[0].trim() ||
                                    `سيرفر ${i + 1}`;
                    
                    // تنظيف اسم السيرفر
                    serverName = serverName.replace(/[\\n\\r\\t]+/g, ' ').trim();
                    
                    // تأكد من أن الرابط كامل
                    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
                    else if (!embedUrl.startsWith('http')) embedUrl = CONFIG.BASE_URL + '/' + embedUrl;
                    
                    servers.push({
                        name: serverName.substring(0, 30),
                        url: embedUrl
                    });
                }
            });
            
            episode.servers = servers;
            console.log(`         📺 ${servers.length} سيرفر`);
            
        } catch (e) {
            console.log(`         ⚠️ فشل استخراج السيرفرات`);
            episode.servers = [];
        }
    }

    // تحميل جميع الحلقات الموجودة
    async loadAllEpisodes() {
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        
        try {
            const files = await fs.readdir(eclipsDir);
            const episodeFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json') && f !== 'Home.json');
            
            for (const file of episodeFiles) {
                try {
                    const content = await fs.readFile(path.join(eclipsDir, file), 'utf-8');
                    const data = JSON.parse(content);
                    if (data.episodes && Array.isArray(data.episodes)) {
                        this.allEpisodes = this.allEpisodes.concat(data.episodes);
                    }
                } catch (e) {
                    console.log(`⚠️ خطأ في قراءة ${file}`);
                }
            }
            
            console.log(`📚 تم تحميل ${this.allEpisodes.length} حلقة موجودة`);
        } catch (e) {
            console.log('📭 لا توجد حلقات سابقة');
        }
    }

    // حفظ أحدث 10 حلقات في Home.json (مجلد eclips)
    async saveLatestEpisodesHome() {
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        await fs.mkdir(eclipsDir, { recursive: true });
        
        // نجمع كل الحلقات (القديمة + الجديدة)
        let allEpisodesForHome = [...this.allEpisodes, ...this.newEpisodes];
        
        // نرتب حسب تاريخ الاستخراج (الأحدث أولاً)
        allEpisodesForHome.sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at));
        
        // نأخذ أول 10
        const latest10 = allEpisodesForHome.slice(0, 10).map(ep => {
            // نبحث عن عنوان المسلسل
            const series = this.seriesList.find(s => s.id === ep.series_id);
            return {
                id: ep.id,
                series_id: ep.series_id,
                series_title: series?.title || 'مسلسل',
                number: ep.number,
                title: ep.title,
                image: ep.image,
                season: ep.season,
                servers: ep.servers || [],
                extracted_at: ep.extracted_at
            };
        });
        
        const filePath = path.join(eclipsDir, 'Home.json');
        const data = {
            last_update: new Date().toISOString(),
            total: latest10.length,
            episodes: latest10
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`🏠 تم حفظ آخر 10 حلقات في eclips/Home.json`);
    }

    // حفظ المسلسلات في Home.json (مجلد series)
    async saveSeriesHome() {
        const seriesDir = path.join(CONFIG.DATA_DIR, CONFIG.SERIES_DIR);
        await fs.mkdir(seriesDir, { recursive: true });
        
        const filePath = path.join(seriesDir, 'Home.json');
        
        // نرتب المسلسلات أبجدياً
        const sortedSeries = [...this.seriesList].sort((a, b) => a.title.localeCompare(b.title, 'ar'));
        
        // تنظيف البيانات
        const cleanSeries = sortedSeries.map(s => ({
            id: s.id,
            title: s.title,
            image: s.image,
            seasons: s.seasons || 1,
            last_season: s.last_season || 1
        }));
        
        const data = {
            last_update: new Date().toISOString(),
            total_series: cleanSeries.length,
            series: cleanSeries
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ تم حفظ ${cleanSeries.length} مسلسل في series/Home.json`);
    }

    // حفظ جميع الحلقات في ملفات pageN.json
    async saveAllEpisodes() {
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        await fs.mkdir(eclipsDir, { recursive: true });
        
        // نجمع كل الحلقات (القديمة + الجديدة)
        let allEpisodes = [...this.allEpisodes, ...this.newEpisodes];
        
        // نرتب الحلقات حسب تاريخ الاستخراج (الأحدث أولاً)
        allEpisodes.sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at));
        
        // نمسح ملفات page القديمة (باستثناء Home.json)
        const files = await fs.readdir(eclipsDir).catch(() => []);
        for (const file of files) {
            if (file.startsWith('page') && file.endsWith('.json') && file !== 'Home.json') {
                await fs.unlink(path.join(eclipsDir, file)).catch(() => {});
            }
        }
        
        // نوزع الحلقات على ملفات جديدة (كل 500 حلقة)
        const pages = Math.ceil(allEpisodes.length / CONFIG.EPISODES_PER_FILE);
        
        for (let page = 1; page <= pages; page++) {
            const start = (page - 1) * CONFIG.EPISODES_PER_FILE;
            const end = start + CONFIG.EPISODES_PER_FILE;
            const pageEpisodes = allEpisodes.slice(start, end);
            
            // تنظيف البيانات للتخزين
            const cleanEpisodes = pageEpisodes.map(ep => ({
                id: ep.id,
                series_id: ep.series_id,
                number: ep.number,
                title: ep.title,
                image: ep.image,
                link: ep.link,
                season: ep.season,
                duration: ep.duration,
                servers: ep.servers || [],
                extracted_at: ep.extracted_at
            }));
            
            const filePath = path.join(eclipsDir, `page${page}.json`);
            const data = {
                page: page,
                total_pages: pages,
                total_episodes: allEpisodes.length,
                episodes_in_page: cleanEpisodes.length,
                last_update: new Date().toISOString(),
                episodes: cleanEpisodes
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 eclips/page${page}.json - ${cleanEpisodes.length} حلقة`);
        }
        
        console.log(`✅ تم توزيع ${allEpisodes.length} حلقة على ${pages} ملفات`);
    }

    // تحديث الإحصائيات في progress.json
    async updateStatistics() {
        // عدد المسلسلات
        const totalSeries = this.seriesList.length;
        
        // عدد الحلقات الكلي
        const totalEpisodes = this.allEpisodes.length + this.newEpisodes.length;
        
        // آخر 10 حلقات للعرض السريع
        const allEpisodesForLatest = [...this.allEpisodes, ...this.newEpisodes];
        allEpisodesForLatest.sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at));
        
        const latestEpisodes = allEpisodesForLatest.slice(0, 10).map(ep => ({
            id: ep.id,
            series_id: ep.series_id,
            series_title: this.seriesList.find(s => s.id === ep.series_id)?.title || '',
            title: ep.title,
            image: ep.image,
            number: ep.number,
            season: ep.season,
            added_at: ep.extracted_at
        }));
        
        // آخر 5 مسلسلات مضافة
        const latestSeries = this.seriesList
            .sort((a, b) => new Date(b.last_update) - new Date(a.last_update))
            .slice(0, 5)
            .map(s => ({
                id: s.id,
                title: s.title,
                image: s.image,
                added_at: s.last_update
            }));
        
        this.progress.data.statistics = {
            total_series: totalSeries,
            total_episodes: totalEpisodes,
            new_episodes_today: this.newEpisodes.length,
            last_scan: new Date().toISOString()
        };
        
        this.progress.data.latest_episodes = latestEpisodes;
        this.progress.data.latest_series = latestSeries;
        
        await this.progress.save();
    }

    // تشغيل الاستخراج الكامل
    async run() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج مسلسلات وحلقات رمضان 2026');
        console.log('='.repeat(60));
        
        // 0. تحميل الحلقات الموجودة
        await this.loadAllEpisodes();
        
        // 1. استخراج جميع المسلسلات
        await this.extractAllSeries();
        
        // 2. معالجة كل مسلسل
        console.log('\n' + '='.repeat(60));
        console.log('🔄 جاري معالجة المسلسلات واستخراج الحلقات الجديدة...');
        console.log('='.repeat(60));
        
        for (let i = 0; i < this.seriesList.length; i++) {
            const series = this.seriesList[i];
            console.log(`\n[${i + 1}/${this.seriesList.length}]`);
            await this.processSeries(series);
            
            // تأخير بين المسلسلات
            if (i < this.seriesList.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // 3. حفظ المسلسلات في series/Home.json
        await this.saveSeriesHome();
        
        // 4. حفظ جميع الحلقات في ملفات pageN.json
        await this.saveAllEpisodes();
        
        // 5. حفظ آخر 10 حلقات في eclips/Home.json
        await this.saveLatestEpisodesHome();
        
        // 6. تحديث الإحصائيات في progress.json
        await this.updateStatistics();
        
        // 7. طباعة التقرير النهائي
        this.printReport();
    }

    // طباعة التقرير النهائي
    printReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 تقرير اليوم:');
        console.log('='.repeat(60));
        console.log(`📁 المسلسلات: ${this.seriesList.length} مسلسل`);
        console.log(`🆕 الحلقات الجديدة اليوم: ${this.newEpisodes.length} حلقة`);
        console.log(`📚 إجمالي الحلقات: ${this.allEpisodes.length + this.newEpisodes.length} حلقة`);
        
        if (this.newEpisodes.length > 0) {
            console.log('\n📋 الحلقات الجديدة:');
            this.newEpisodes.slice(0, 5).forEach((ep, i) => {
                const series = this.seriesList.find(s => s.id === ep.series_id);
                console.log(`   ${i + 1}. ${series?.title || 'مسلسل'} - ${ep.title}`);
            });
            
            if (this.newEpisodes.length > 5) {
                console.log(`   ... و${this.newEpisodes.length - 5} حلقات أخرى`);
            }
        }
        
        console.log('\n✅ تم الانتهاء بنجاح!');
        console.log('='.repeat(60));
    }
}

// ========== التشغيل الرئيسي ==========
(async () => {
    try {
        // تأكد من وجود المجلدات
        await fs.mkdir(path.join(CONFIG.DATA_DIR, CONFIG.SERIES_DIR), { recursive: true });
        await fs.mkdir(path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR), { recursive: true });
        
        // حمل سجل التقدم
        const progress = new ProgressTracker(CONFIG.DATA_DIR);
        await progress.load();
        
        // شغل المستخرج
        const extractor = new SeriesExtractor(progress);
        await extractor.run();
        
    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        process.exit(1);
    }
})();
