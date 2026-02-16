// extractor-simple.js - نسخة مبسطة تستخرج كل شيء مباشرة
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
    DATA_DIR: path.join(__dirname, 'data', 'Ramdan'),
    SERIES_DIR: 'series',
    ECLIPS_DIR: 'eclips',
    REQUEST_DELAY: 1000,
    MAX_RETRIES: 3
};

class SimpleExtractor {
    constructor() {
        this.allSeries = [];     // كل المسلسلات
        this.allEpisodes = [];   // كل الحلقات
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
                    }
                });
                
                if (response.data && typeof response.data === 'string' && response.data.length > 500) {
                    return response.data;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (retryCount < CONFIG.MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            return this.fetch(url, retryCount + 1);
        }
        
        throw new Error(`فشل الاتصال بـ ${url}`);
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

    // استخراج رقم الحلقة
    extractEpisodeNumber(title) {
        const patterns = [
            /الحلقة\s*(\d+)/i,
            /حلقة\s*(\d+)/i,
            /episode\s*(\d+)/i,
            /(\d+)/  // أي رقم في النص كملاذ أخير
        ];
        
        for (let pattern of patterns) {
            const match = title.match(pattern);
            if (match) return parseInt(match[1]);
        }
        return null;
    }

    // إصلاح رابط الصورة
    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url.replace('http://', 'https://');
    }

    // استخراج كل المسلسلات من الصفحة الرئيسية
    async extractAllSeries() {
        console.log('\n🔍 جاري استخراج المسلسلات...');
        
        // الصفحة الرئيسية للمسلسلات (الصفحة 1 فقط)
        const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}`;
        console.log(`📄 مسح الصفحة: ${pageUrl}`);
        
        const html = await this.fetch(pageUrl);
        const $ = cheerio.load(html);
        
        // استخراج روابط المسلسلات
        $('a[href*="view-serie1.php"]').each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            
            // نبحث عن الصورة - ممكن تكون في عناصر مختلفة
            let image = '';
            
            // البحث في العناصر المحيطة
            const parentDiv = $(el).closest('.col-xs-6, .item, .post');
            if (parentDiv.length) {
                image = parentDiv.find('img').attr('src') || 
                       parentDiv.find('img').attr('data-src') || 
                       parentDiv.find('img').attr('data-original') || '';
            }
            
            // إذا ما لقينا صورة، نجرب نبحث في العنصر نفسه
            if (!image) {
                image = $(el).find('img').attr('src') || '';
            }
            
            const seriesId = this.extractSeriesId(link);
            
            if (seriesId && title) {
                this.allSeries.push({
                    id: seriesId,
                    title: title,
                    image: this.fixImage(image),
                    link: link.startsWith('http') ? link : CONFIG.BASE_URL + '/' + link,
                    extracted_at: new Date().toISOString()
                });
            }
        });
        
        console.log(`✅ تم العثور على ${this.allSeries.length} مسلسل`);
        return this.allSeries;
    }

    // استخراج حلقات مسلسل واحد
    async extractSeriesEpisodes(series) {
        console.log(`\n🎬 معالجة: ${series.title}`);
        
        try {
            // نضيف معامل الموسم لنحصل على كل المواسم
            const seriesUrl = `${CONFIG.BASE_URL}/view-serie1.php?ser=${series.id}`;
            const html = await this.fetch(seriesUrl);
            const $ = cheerio.load(html);
            
            // نحديث العنوان إذا لقينا عنوان أكمل
            const fullTitle = $('h1.title').first().text().trim();
            if (fullTitle) {
                series.title = fullTitle;
            }
            
            // نحديث الصورة إذا ما كانت موجودة
            if (!series.image) {
                const seriesImage = $('img.poster, .series-image img, .poster img').attr('src') || '';
                if (seriesImage) {
                    series.image = this.fixImage(seriesImage);
                }
            }
            
            // نبحث عن كل المواسم
            const seasons = [];
            
            // نبحث عن أزرار المواسم
            $('button.tablinks, .seasons button, .tab button').each((i, el) => {
                const seasonText = $(el).text().trim();
                const match = seasonText.match(/\d+/);
                if (match) seasons.push(parseInt(match[0]));
            });
            
            // نبحث عن divs المواسم
            $('div[id^="Season"], div[class*="season"]').each((i, el) => {
                const id = $(el).attr('id') || '';
                const match = id.match(/Season(\d+)/i);
                if (match) seasons.push(parseInt(match[1]));
            });
            
            // إذا ما لقينا مواسم، نعتبر أنه موسم واحد
            if (seasons.length === 0) seasons.push(1);
            
            // نأخذ المواسم الفريدة ونرتبها
            const uniqueSeasons = [...new Set(seasons)].sort((a, b) => a - b);
            console.log(`   📺 المواسم: ${uniqueSeasons.join(', ')}`);
            
            // نستخرج الحلقات من كل موسم
            for (const seasonNum of uniqueSeasons) {
                await this.extractSeasonEpisodes(series, seasonNum);
            }
            
        } catch (error) {
            console.log(`   ❌ خطأ: ${error.message}`);
        }
    }

    // استخراج حلقات موسم معين
    async extractSeasonEpisodes(series, seasonNum) {
        try {
            // الرابط مع تحديد الموسم
            const seasonUrl = `${CONFIG.BASE_URL}/view-serie1.php?ser=${series.id}&season=${seasonNum}`;
            const html = await this.fetch(seasonUrl);
            const $ = cheerio.load(html);
            
            const episodes = [];
            
            // نبحث عن الحلقات
            $('.thumbnail, .post, .item, .video-item, li.col-xs-6, .episode-item').each((i, el) => {
                const $el = $(el);
                
                // رابط الحلقة
                let link = $el.find('a[href*="video.php"]').attr('href') || 
                          $el.find('a[href*="vid="]').attr('href') ||
                          $el.find('a').first().attr('href');
                
                if (!link || link === '#' || link.includes('javascript')) return;
                
                // عنوان الحلقة
                let title = $el.find('.ellipsis').text().trim() || 
                           $el.find('h3 a').text().trim() ||
                           $el.find('img').attr('alt') ||
                           `الحلقة ${i + 1}`;
                
                // صورة الحلقة
                let image = $el.find('img').attr('src') || 
                           $el.find('img').attr('data-src') || 
                           $el.find('img').attr('data-original') || 
                           series.image; // نستخدم صورة المسلسل كبديل
                
                // استخراج ID الحلقة
                const episodeId = this.extractEpisodeId(link);
                if (!episodeId) return;
                
                // رقم الحلقة
                const episodeNumber = this.extractEpisodeNumber(title) || i + 1;
                
                // المدة
                let duration = $el.find('.duration, .time').first().text().trim() || '00:00';
                
                episodes.push({
                    id: episodeId,
                    series_id: series.id,
                    series_title: series.title,
                    number: episodeNumber,
                    title: title,
                    image: this.fixImage(image),
                    link: link.startsWith('http') ? link : CONFIG.BASE_URL + '/' + link,
                    season: seasonNum,
                    duration: duration,
                    servers: [],
                    extracted_at: new Date().toISOString()
                });
            });
            
            // نرتب الحلقات حسب الرقم
            episodes.sort((a, b) => a.number - b.number);
            
            console.log(`   📥 الموسم ${seasonNum}: ${episodes.length} حلقة`);
            
            // نضيف الحلقات للقائمة الكاملة
            this.allEpisodes = this.allEpisodes.concat(episodes);
            
            // نستخرج السيرفرات لكل حلقة (اختياري - يمكن تعطيله للتسريع)
            if (episodes.length > 0) {
                console.log(`   🔗 جاري استخراج السيرفرات...`);
                for (let i = 0; i < Math.min(episodes.length, 3); i++) {
                    await this.extractEpisodeServers(episodes[i]);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
        } catch (error) {
            console.log(`   ⚠️ خطأ في الموسم ${seasonNum}: ${error.message}`);
        }
    }

    // استخراج سيرفرات الحلقة
    async extractEpisodeServers(episode) {
        try {
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
            console.log(`      ✅ ${servers.length} سيرفر`);
            
        } catch (e) {
            episode.servers = [];
        }
    }

    // حفظ جميع المسلسلات
    async saveSeries() {
        const seriesDir = path.join(CONFIG.DATA_DIR, CONFIG.SERIES_DIR);
        await fs.mkdir(seriesDir, { recursive: true });
        
        // نرتب المسلسلات أبجدياً
        const sortedSeries = [...this.allSeries].sort((a, b) => a.title.localeCompare(b.title, 'ar'));
        
        // نحسب عدد حلقات كل مسلسل
        const seriesWithCounts = sortedSeries.map(series => {
            const episodesCount = this.allEpisodes.filter(ep => ep.series_id === series.id).length;
            return {
                ...series,
                episodes_count: episodesCount
            };
        });
        
        // ملف المسلسلات الرئيسي
        const filePath = path.join(seriesDir, 'Home.json');
        await fs.writeFile(filePath, JSON.stringify({
            last_update: new Date().toISOString(),
            total: seriesWithCounts.length,
            series: seriesWithCounts
        }, null, 2));
        
        console.log(`\n✅ تم حفظ ${seriesWithCounts.length} مسلسل في series/Home.json`);
        
        // نحفظ كل مسلسل في ملف منفصل
        for (const series of seriesWithCounts) {
            const seriesFilePath = path.join(seriesDir, `${series.id}.json`);
            await fs.writeFile(seriesFilePath, JSON.stringify(series, null, 2));
        }
        console.log(`✅ تم حفظ ملفات فردية لكل مسلسل`);
    }

    // حفظ جميع الحلقات
    async saveEpisodes() {
        const eclipsDir = path.join(CONFIG.DATA_DIR, CONFIG.ECLIPS_DIR);
        await fs.mkdir(eclipsDir, { recursive: true });
        
        // نرتب الحلقات من الأحدث إلى الأقدم
        const sortedEpisodes = [...this.allEpisodes].sort((a, b) => 
            new Date(b.extracted_at) - new Date(a.extracted_at)
        );
        
        // ملف كل الحلقات
        const allFilePath = path.join(eclipsDir, 'all_episodes.json');
        await fs.writeFile(allFilePath, JSON.stringify({
            last_update: new Date().toISOString(),
            total: sortedEpisodes.length,
            episodes: sortedEpisodes
        }, null, 2));
        
        console.log(`✅ تم حفظ ${sortedEpisodes.length} حلقة في eclips/all_episodes.json`);
        
        // آخر 50 حلقة للعرض السريع
        const latestFilePath = path.join(eclipsDir, 'latest.json');
        await fs.writeFile(latestFilePath, JSON.stringify({
            last_update: new Date().toISOString(),
            total: Math.min(50, sortedEpisodes.length),
            episodes: sortedEpisodes.slice(0, 50)
        }, null, 2));
        
        console.log(`✅ تم حفظ آخر 50 حلقة في eclips/latest.json`);
        
        // نقسم الحلقات على صفحات (كل 500 حلقة)
        const episodesPerPage = 500;
        const pages = Math.ceil(sortedEpisodes.length / episodesPerPage);
        
        for (let page = 1; page <= pages; page++) {
            const start = (page - 1) * episodesPerPage;
            const end = start + episodesPerPage;
            const pageEpisodes = sortedEpisodes.slice(start, end);
            
            const pageFilePath = path.join(eclipsDir, `page${page}.json`);
            await fs.writeFile(pageFilePath, JSON.stringify({
                page: page,
                total_pages: pages,
                total_episodes: sortedEpisodes.length,
                episodes_in_page: pageEpisodes.length,
                last_update: new Date().toISOString(),
                episodes: pageEpisodes
            }, null, 2));
        }
        
        console.log(`✅ تم توزيع الحلقات على ${pages} صفحات`);
    }

    // تشغيل الاستخراج الكامل
    async run() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج مسلسلات وحلقات رمضان 2026 - نسخة مبسطة');
        console.log('='.repeat(60));
        
        // 1. استخراج المسلسلات
        await this.extractAllSeries();
        
        // 2. استخراج حلقات كل مسلسل
        console.log('\n' + '='.repeat(60));
        console.log('🔄 جاري استخراج الحلقات...');
        console.log('='.repeat(60));
        
        for (let i = 0; i < this.allSeries.length; i++) {
            console.log(`\n[${i + 1}/${this.allSeries.length}]`);
            await this.extractSeriesEpisodes(this.allSeries[i]);
            
            // تأخير بين المسلسلات
            if (i < this.allSeries.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        // 3. حفظ البيانات
        console.log('\n' + '='.repeat(60));
        console.log('💾 جاري حفظ البيانات...');
        console.log('='.repeat(60));
        
        await this.saveSeries();
        await this.saveEpisodes();
        
        // 4. التقرير النهائي
        console.log('\n' + '='.repeat(60));
        console.log('📊 التقرير النهائي:');
        console.log('='.repeat(60));
        console.log(`📁 المسلسلات: ${this.allSeries.length} مسلسل`);
        console.log(`📚 الحلقات: ${this.allEpisodes.length} حلقة`);
        console.log('='.repeat(60));
    }
}

// ========== التشغيل ==========
(async () => {
    try {
        const extractor = new SimpleExtractor();
        await extractor.run();
    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
    }
})();
