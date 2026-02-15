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
                        const parentDiv = $(el).closest('div').parent();
                        const img = parentDiv.find('img.pm-thumb').first() || 
                                   parentDiv.find('img').first();
                        
                        if (img.attr('src')) {
                            image = img.attr('src');
                        } else if (img.attr('data-src')) {
                            image = img.attr('data-src');
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
        
        // نحفظ المسلسلات في Home.json
        await this.saveSeriesHome();
        
        return this.seriesList;
    }

    // معالجة مسلسل واحد: استخراج معلوماته وحلقات الموسم الأخير
    async processSeries(series) {
        console.log(`\n🎬 معالجة مسلسل: ${series.title}`);
        
        try {
            // نزور صفحة المسلسل
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
                const img = $('.pm-poster-img img').first();
                series.image = this.fixImage(img.attr('src') || img.attr('data-src') || '');
            }
            
            // التحقق من وجود مواسم متعددة
            const seasons = [];
            $('.Tab button.tablinks, .seasons button, [class*="season"] button').each((i, el) => {
                const seasonText = $(el).text().trim();
                const match = seasonText.match(/\d+/);
                if (match) {
                    seasons.push(parseInt(match[0]));
                }
            });
            
            // إذا في مواسم، نأخذ آخر واحد
            let targetSeason = 1;
            if (seasons.length > 0) {
                targetSeason = Math.max(...seasons);
                series.seasons = seasons.length;
                series.last_season = targetSeason;
                console.log(`   📺 المسلسل فيه ${seasons.length} مواسم, نأخذ الموسم ${targetSeason}`);
            }
            
            // نقرر أي تبويب نضغط (آخر موسم)
            // في العادة، آخر تبويب هو الموسم الأخير
            const lastTabButton = $('.Tab button.tablinks').last();
            
            // نستخرج حلقات الموسم الأخير
            let episodesHtml = html;
            
            // إذا في مواسم وزر التبويب فيه onclick، نحاول نستخرج محتواه
            if (seasons.length > 0 && lastTabButton.length) {
                const onclick = lastTabButton.attr('onclick') || '';
                const seasonId = onclick.match(/'([^']+)'/)?.[1] || `Season${targetSeason}`;
                
                // في بعض المواقع، محتوى الموسم يكون في div منفصل
                const seasonDiv = $(`#${seasonId}, .${seasonId}, [data-season="${targetSeason}"]`).first();
                if (seasonDiv.length) {
                    // استخراج الحلقات من هذا الـ div
                    episodesHtml = seasonDiv.html() || html;
                }
            }
            
            // استخراج الحلقات من الموسم المستهدف
            await this.extractEpisodesFromSeason(series, episodesHtml, targetSeason);
            
        } catch (error) {
            console.log(`   ❌ خطأ في معالجة المسلسل: ${error.message}`);
        }
    }

    // استخراج الحلقات من الموسم
    async extractEpisodesFromSeason(series, html, seasonNum) {
        const $ = cheerio.load(html);
        const episodes = [];
        
        $('.thumbnail, .post, .item, .video-item').each((i, el) => {
            try {
                const $el = $(el);
                
                // رابط الحلقة
                let link = $el.find('a[href*="video.php"]').attr('href') || 
                          $el.find('a').first().attr('href');
                
                if (!link || link === '#') return;
                
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
        
        // معالجة كل حلقة: استخراج السيرفرات إذا كانت جديدة
        for (let i = 0; i < episodes.length; i++) {
            const episode = episodes[i];
            
            // تحقق إذا كانت الحلقة جديدة
            if (this.progress.isEpisodeNew(series.id, episode.id)) {
                console.log(`      🔄 حلقة جديدة: ${episode.title.substring(0, 40)}...`);
                
                // استخرج السيرفرات
                await this.extractEpisodeServers(episode);
                
                // أضفها للحلقات الجديدة
                this.newEpisodes.push(episode);
                
                // سجل في progress
                this.progress.markEpisodeExtracted(series.id, episode.id, episode);
                
                // تأخير بين الحلقات
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                console.log(`      ✅ حلقة قديمة: ${episode.title.substring(0, 30)}... (مسبقة)`);
            }
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
                
                if (embedUrl) {
                    let serverName = $el.find('strong').text().trim() || 
                                    $el.find('.name').text().trim() || 
                                    $el.text().trim().split('\n')[0].trim() ||
                                    `سيرفر ${i + 1}`;
                    
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

    // تشغيل الاستخراج الكامل
    async run() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج مسلسلات وحلقات رمضان 2026');
        console.log('='.repeat(60));
        
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
        
        // 3. حفظ الحلقات الجديدة
        if (this.newEpisodes.length > 0) {
            console.log('\n' + '='.repeat(60));
            console.log(`💾 حفظ ${this.newEpisodes.length} حلقة جديدة...`);
            await this.saveNewEpisodes();
        } else {
            console.log('\n📭 لا توجد حلقات جديدة اليوم');
        }
        
        // 4. تحديث الإحصائيات في progress.json
        await this.updateStatistics();
        
        // 5. طباعة التقرير النهائي
        this.printReport();
    }

    // حفظ المسلسلات في Home.json
    async saveSeriesHome() {
        const seriesDir = path.join(CONFIG.DATA_DIR, CONFIG.SERIES_DIR);
        await fs.mkdir(seriesDir, { recursive: true });
        
        const filePath = path.join(seriesDir, 'Home.json');
        
        // نرتب المسلسلات أبجدياً
        const sortedSeries = [...this.seriesList].sort((a, b) => a.title.localeCompare(b.title, 'ar'));
        
        const data = {
            last_update: new Date().toISOString(),
            total_series: sortedSeries.length,
            series: sortedSeries
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ تم حفظ ${sortedSeries.length} مسلسل في series/Home.json`);
    }

    // حفظ الحلقات الجديدة في ملفات eclips/pageN.json
    async saveNewEpisodes() {
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        await fs.mkdir(eclipsDir, { recursive: true });
        
        // نحمل الملفات الموجودة
        const existingFiles = await fs.readdir(eclipsDir).catch(() => []);
        const episodeFiles = existingFiles.filter(f => f.startsWith('page') && f.endsWith('.json'));
        
        // نجمع كل الحلقات الموجودة
        let allEpisodes = [];
        
        for (const file of episodeFiles) {
            try {
                const content = await fs.readFile(path.join(eclipsDir, file), 'utf-8');
                const data = JSON.parse(content);
                allEpisodes = allEpisodes.concat(data.episodes || []);
            } catch (e) {
                console.log(`⚠️ خطأ في قراءة ${file}`);
            }
        }
        
        // نضيف الحلقات الجديدة
        allEpisodes = allEpisodes.concat(this.newEpisodes);
        
        // نرتب الحلقات حسب تاريخ الاستخراج (الأحدث أولاً)
        allEpisodes.sort((a, b) => new Date(b.extracted_at) - new Date(a.extracted_at));
        
        // نمسح الملفات القديمة
        for (const file of episodeFiles) {
            await fs.unlink(path.join(eclipsDir, file)).catch(() => {});
        }
        
        // نوزع الحلقات على ملفات جديدة (كل 500 حلقة)
        const pages = Math.ceil(allEpisodes.length / CONFIG.EPISODES_PER_FILE);
        
        for (let page = 1; page <= pages; page++) {
            const start = (page - 1) * CONFIG.EPISODES_PER_FILE;
            const end = start + CONFIG.EPISODES_PER_FILE;
            const pageEpisodes = allEpisodes.slice(start, end);
            
            const filePath = path.join(eclipsDir, `page${page}.json`);
            const data = {
                page: page,
                total_pages: pages,
                total_episodes: allEpisodes.length,
                episodes_in_page: pageEpisodes.length,
                last_update: new Date().toISOString(),
                episodes: pageEpisodes
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 eclips/page${page}.json - ${pageEpisodes.length} حلقة`);
        }
    }

    // تحديث الإحصائيات في progress.json
    async updateStatistics() {
        // نحسب إجمالي الحلقات
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        let totalEpisodes = 0;
        
        try {
            const files = await fs.readdir(eclipsDir);
            for (const file of files) {
                if (file.startsWith('page') && file.endsWith('.json')) {
                    const content = await fs.readFile(path.join(eclipsDir, file), 'utf-8');
                    const data = JSON.parse(content);
                    totalEpisodes += data.episodes_in_page || 0;
                }
            }
        } catch (e) {}
        
        // عدد المسلسلات
        const totalSeries = this.seriesList.length;
        
        // آخر 10 حلقات
        const latestEpisodes = this.newEpisodes.slice(0, 10).map(ep => ({
            id: ep.id,
            series_id: ep.series_id,
            series_title: this.seriesList.find(s => s.id === ep.series_id)?.title || '',
            title: ep.title,
            image: ep.image,
            number: ep.number,
            season: ep.season,
            added_at: ep.extracted_at
        }));
        
        // آخر 5 مسلسلات
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

    // طباعة التقرير النهائي
    printReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 تقرير اليوم:');
        console.log('='.repeat(60));
        console.log(`📁 المسلسلات: ${this.seriesList.length} مسلسل`);
        console.log(`🆕 الحلقات الجديدة اليوم: ${this.newEpisodes.length} حلقة`);
        
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

    // دوال مساعدة
    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url;
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
