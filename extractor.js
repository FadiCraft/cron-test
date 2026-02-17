// extractor.js - مستخرج مسلسلات وحلقات رمضان 2026 (نسخة سريعة - صفحة واحدة)
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
    // MAX_PAGES لم يعد مستخدماً بكثرة، لكن أبقيناه للتوافق
    MAX_PAGES: 1, // تم التعديل: صفحة واحدة فقط
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
                all_episodes: {}, // جميع الحلقات المستخرجة (لمنع التكرار)
                statistics: {
                    total_series: 0,
                    total_episodes: 0,
                    first_scan: true
                }
            };
        }
        return this.data;
    }

    async save() {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
    }

    // هل هذه أول مرة نشغل فيها الكود؟
    isFirstScan() {
        return !this.data.last_scan;
    }

    // هل هذه الحلقة جديدة؟ (ما استخرجناها قبل كدة)
    isEpisodeNew(episodeId) {
        return !this.data.all_episodes || !this.data.all_episodes[episodeId];
    }

    // سجل أننا استخرجنا حلقة
    markEpisodeExtracted(seriesId, episodeId, episodeData) {
        // سجل الحلقة في قائمة كل الحلقات
        if (!this.data.all_episodes) {
            this.data.all_episodes = {};
        }
        
        this.data.all_episodes[episodeId] = {
            series_id: seriesId,
            extracted_at: new Date().toISOString(),
            title: episodeData.title,
            number: episodeData.number,
            season: episodeData.season
        };
        
        // سجل آخر حلقة للمسلسل
        if (!this.data.series[seriesId]) {
            this.data.series[seriesId] = {
                last_episode: null,
                last_season: 1,
                episodes: {}
            };
        }
        
        this.data.series[seriesId].episodes[episodeId] = {
            extracted_at: new Date().toISOString(),
            title: episodeData.title,
            number: episodeData.number,
            season: episodeData.season
        };
        
        // تحديث آخر حلقة إذا كانت هذه الحلقة أحدث
        const currentLast = this.data.series[seriesId].last_episode;
        if (!currentLast || (episodeData.number && episodeData.number > (this.data.series[seriesId].episodes[currentLast]?.number || 0))) {
            this.data.series[seriesId].last_episode = episodeId;
            this.data.series[seriesId].last_season = episodeData.season;
        }
        
        this.data.last_scan = new Date().toISOString();
    }

    // جلب آخر حلقة استخرجناها لمسلسل معين
    getLastEpisodeForSeries(seriesId) {
        return this.data.series[seriesId]?.last_episode || null;
    }

    // جلب رقم آخر حلقة استخرجناها
    getLastEpisodeNumber(seriesId) {
        const lastEpisodeId = this.getLastEpisodeForSeries(seriesId);
        if (lastEpisodeId && this.data.series[seriesId]?.episodes[lastEpisodeId]) {
            return this.data.series[seriesId].episodes[lastEpisodeId].number;
        }
        return 0;
    }
}

class SeriesExtractor {
    constructor(progressTracker) {
        this.progress = progressTracker;
        this.seriesList = []; // للمسلسلات في Home.json
        this.newEpisodes = []; // للحلقات الجديدة فقط
        this.allEpisodes = []; // جميع الحلقات (لإعادة توزيعها)
        this.isFirstScan = progressTracker.isFirstScan();
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
        
        return url;
    }

    // استخراج جميع المسلسلات من صفحة واحدة (بدون تعدد صفحات)
    async extractAllSeries() {
        console.log('\n🔍 جاري استخراج المسلسلات من صفحة واحدة...');
        
        const allSeries = new Map(); // استخدم Map عشان نضمن عدم التكرار
        
        try {
            // صفحة واحدة فقط - بدون حلقة for
            console.log(`📄 مسح الصفحة الرئيسية للمسلسلات...`);
            
            const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&order=DESC`; // تم إزالة &page=
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            // استخراج روابط المسلسلات
            $('a.icon-link[href*="view-serie1.php"]').each((i, el) => {
                const link = $(el).attr('href');
                const title = $(el).text().trim();
                const seriesId = this.extractSeriesId(link);
                
                if (seriesId && title) {
                    allSeries.set(seriesId, {
                        id: seriesId,
                        title: title,
                        image: '', // سنملأها لاحقاً من أول حلقة
                        seasons: 1,
                        last_season: 1,
                        last_update: new Date().toISOString(),
                        episodes_count: 0
                    });
                }
            });
            
            // لا حاجة للتأخير بين الصفحات لأنها صفحة واحدة
            
        } catch (error) {
            console.log(`⚠️ خطأ في استخراج المسلسلات: ${error.message}`);
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
            
            // البحث عن كل المواسم
            const seasons = [];
            
            // البحث عن عناصر الموسم
            $('.Tab button.tablinks, .seasons button, [class*="season"] button, .tab button').each((i, el) => {
                const seasonText = $(el).text().trim();
                const match = seasonText.match(/\d+/);
                if (match) {
                    seasons.push(parseInt(match[0]));
                }
            });
            
            // البحث عن divs الخاصة بالمواسم
            let lastSeasonNumber = 1;
            let seasonHtml = html;
            
            $('div[id^="Season"], div[class*="season"], .tabcontent').each((i, el) => {
                const id = $(el).attr('id') || '';
                const match = id.match(/Season(\d+)/i);
                if (match) {
                    const seasonNum = parseInt(match[1]);
                    seasons.push(seasonNum);
                    
                    // إذا كان هذا أكبر رقم، نخزنه
                    if (seasonNum > lastSeasonNumber) {
                        lastSeasonNumber = seasonNum;
                        seasonHtml = $(el).html() || html;
                    }
                }
            });
            
            // إذا في مواسم متعددة، نأخذ آخر واحد
            let targetSeason = 1;
            
            if (seasons.length > 0) {
                targetSeason = Math.max(...seasons);
                series.seasons = seasons.length;
                series.last_season = targetSeason;
                console.log(`   📺 المسلسل فيه ${seasons.length} مواسم, نأخذ الموسم ${targetSeason}`);
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
        let firstEpisodeImage = ''; // لصورة المسلسل (من أول حلقة)
        
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
                
                // إذا كانت هذه أول حلقة، نحفظ صورتها للمسلسل
                if (i === 0 && image && !series.image) {
                    firstEpisodeImage = image;
                }
                
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
                    servers: [],
                    extracted_at: new Date().toISOString()
                });
                
            } catch (e) {
                // تجاهل الخطأ واستمر
            }
        });
        
        // ترتيب الحلقات تصاعدياً حسب الرقم
        episodes.sort((a, b) => (a.number || 0) - (b.number || 0));
        
        console.log(`   📥 تم العثور على ${episodes.length} حلقة في الموسم ${seasonNum}`);
        
        return {
            episodes,
            firstEpisodeImage
        };
    }

    // معالجة مسلسل واحد
    async processSeries(series) {
        console.log(`\n🎬 معالجة مسلسل: ${series.title}`);
        
        try {
            // استخراج آخر موسم
            const { targetSeason, seasonHtml } = await this.extractLastSeason(series);
            
            // استخراج حلقات آخر موسم
            const { episodes, firstEpisodeImage } = await this.extractEpisodesFromSeason(series, seasonHtml, targetSeason);
            
            // تعيين صورة المسلسل من أول حلقة إذا لم تكن موجودة
            if (!series.image && firstEpisodeImage) {
                series.image = this.fixImage(firstEpisodeImage);
            }
            
            // معرفة آخر حلقة استخرجناها سابقاً لهذا المسلسل
            const lastEpisodeNumber = this.progress.getLastEpisodeNumber(series.id);
            console.log(`   📊 آخر حلقة محفوظة: ${lastEpisodeNumber || 'لا يوجد'}`);
            
            // معالجة كل حلقة
            for (let i = 0; i < episodes.length; i++) {
                const episode = episodes[i];
                
                // تحقق إذا كانت الحلقة جديدة (لم نستخرجها من قبل)
                const isNew = this.progress.isEpisodeNew(episode.id);
                
                if (isNew) {
                    // إذا كانت أول مرة أو الحلقة أحدث من آخر حلقة محفوظة
                    if (this.isFirstScan || !lastEpisodeNumber || (episode.number && episode.number > lastEpisodeNumber)) {
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
                        console.log(`      ⏭️ [تخطي] ${episode.title.substring(0, 40)}... (أقدم من آخر حلقة)`);
                    }
                } else {
                    console.log(`      ✅ [موجود] ${episode.title.substring(0, 40)}... (مستخرج سابقاً)`);
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
                
                let embedUrl = $el.attr('data-embed-url') || 
                              $el.attr('data-src') || 
                              $el.find('a').attr('href') ||
                              $el.find('iframe').attr('src');
                
                if (embedUrl && embedUrl !== '#') {
                    let serverName = $el.find('strong').text().trim() || 
                                    $el.find('.name').text().trim() || 
                                    $el.text().trim().split('\n')[0].trim() ||
                                    `سيرفر ${i + 1}`;
                    
                    serverName = serverName.replace(/[\\n\\r\\t]+/g, ' ').trim();
                    
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

    // تحميل جميع الحلقات الموجودة (لإعادة التوزيع)
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
        
        // نأخذ أول 10 (مع تجنب التكرار)
        const uniqueEpisodes = [];
        const seenIds = new Set();
        
        for (const ep of allEpisodesForHome) {
            if (!seenIds.has(ep.id)) {
                seenIds.add(ep.id);
                uniqueEpisodes.push(ep);
            }
            if (uniqueEpisodes.length >= 10) break;
        }
        
        const latest10 = uniqueEpisodes.map(ep => {
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
            last_season: s.last_season || 1,
            episodes_count: s.episodes_count || 0
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
        
        // نجمع كل الحلقات (القديمة + الجديدة) مع تجنب التكرار
        const allEpisodesMap = new Map();
        
        // نضيف القديمة
        for (const ep of this.allEpisodes) {
            allEpisodesMap.set(ep.id, ep);
        }
        
        // نضيف الجديدة (ستحل محل القديمة إذا كان هناك تكرار)
        for (const ep of this.newEpisodes) {
            allEpisodesMap.set(ep.id, ep);
        }
        
        // نحول الـ Map إلى Array
        let allEpisodes = Array.from(allEpisodesMap.values());
        
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
        
        // عدد الحلقات الكلي (بدون تكرار)
        const allEpisodesMap = new Map();
        for (const ep of this.allEpisodes) allEpisodesMap.set(ep.id, ep);
        for (const ep of this.newEpisodes) allEpisodesMap.set(ep.id, ep);
        const totalEpisodes = allEpisodesMap.size;
        
        // آخر 10 حلقات للعرض السريع
        const allEpisodesForLatest = Array.from(allEpisodesMap.values());
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
            last_scan: new Date().toISOString(),
            first_scan: false
        };
        
        this.progress.data.latest_episodes = latestEpisodes;
        this.progress.data.latest_series = latestSeries;
        
        await this.progress.save();
    }

    // تشغيل الاستخراج الكامل
    async run() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج مسلسلات وحلقات رمضان 2026 (نسخة سريعة)');
        if (this.isFirstScan) {
            console.log('📌 هذه هي المرة الأولى - سيتم استخراج كل الحلقات');
        } else {
            console.log('📌 تشغيل تحديث - سيتم استخراج الحلقات الجديدة فقط');
        }
        console.log('='.repeat(60));
        
        // 0. تحميل الحلقات الموجودة
        await this.loadAllEpisodes();
        
        // 1. استخراج جميع المسلسلات (من صفحة واحدة)
        await this.extractAllSeries();
        
        // 2. معالجة كل مسلسل
        console.log('\n' + '='.repeat(60));
        console.log('🔄 جاري معالجة المسلسلات واستخراج الحلقات...');
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
        
        // حساب إجمالي الحلقات بدون تكرار
        const allEpisodesMap = new Map();
        for (const ep of this.allEpisodes) allEpisodesMap.set(ep.id, ep);
        for (const ep of this.newEpisodes) allEpisodesMap.set(ep.id, ep);
        
        console.log(`📚 إجمالي الحلقات: ${allEpisodesMap.size} حلقة`);
        
        if (this.newEpisodes.length > 0) {
            console.log('\n📋 الحلقات الجديدة:');
            this.newEpisodes.slice(0, 5).forEach((ep, i) => {
                const series = this.seriesList.find(s => s.id === ep.series_id);
                console.log(`   ${i + 1}. ${series?.title || 'مسلسل'} - الحلقة ${ep.number || ''}`);
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
