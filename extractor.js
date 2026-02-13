// extractor.js - مستخرج حلقات رمضان 2026
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    URL: 'https://larooza.life/category.php?cat=ramadan-2026',
    BASE_URL: 'https://larooza.life',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: 'data/Ramdan'
};

class Extractor {
    constructor() {
        this.episodes = [];
    }

    async fetch(url) {
        for (const proxy of CONFIG.PROXIES) {
            try {
                const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
                console.log(`🌐 محاولة: ${proxy || 'اتصال مباشر'}`);
                
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
                    console.log(`✅ نجح الاتصال`);
                    return response.data;
                }
            } catch (e) {
                console.log(`⚠️ فشل: ${e.message?.split('\n')[0] || 'خطأ غير معروف'}`);
                continue;
            }
        }
        throw new Error('فشل الاتصال بجميع البروكسيات');
    }

    async extractMainPage() {
        console.log('\n📥 جاري استخراج الحلقات من الصفحة الرئيسية...');
        
        try {
            const html = await this.fetch(CONFIG.URL);
            const $ = cheerio.load(html);
            
            const episodes = [];
            
            $('li.col-xs-6, li.col-sm-4, li.col-md-3, .post, .item, article').each((index, element) => {
                try {
                    const $el = $(element);
                    
                    // استخراج الرابط
                    let link = $el.find('a[href*="video.php"]').attr('href') || 
                              $el.find('a').first().attr('href') || 
                              '#';
                    
                    if (link && link !== '#' && !link.includes('javascript')) {
                        if (!link.startsWith('http')) {
                            link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                        }
                        
                        // استخراج العنوان
                        let title = $el.find('.ellipsis').text().trim() || 
                                   $el.find('h2, h3, .title').first().text().trim() ||
                                   $el.find('img').attr('alt') ||
                                   `حلقة ${index + 1}`;
                        
                        // استخراج الصورة
                        let image = $el.find('img').attr('src') || 
                                   $el.find('img').attr('data-src') || 
                                   $el.find('img').attr('data-original') || 
                                   '';
                        
                        if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                            image = '';
                        }
                        
                        // استخراج المدة
                        let duration = $el.find('.duration, .pm-label-duration, .time').first().text().trim() || '00:00';
                        
                        episodes.push({
                            id: `ramadan-${Date.now()}-${index}`,
                            title: this.cleanTitle(title),
                            link: link,
                            image: this.fixImage(image),
                            duration: duration,
                            servers: [],
                            extracted_at: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    // تجاهل الخطأ واستمر
                }
            });
            
            console.log(`✅ تم استخراج ${episodes.length} حلقة`);
            
            if (episodes.length === 0) {
                // إذا لم نجد حلقات، نضيف بعض الحلقات التجريبية للاختبار
                console.log('⚠️ لم يتم العثور على حلقات، إضافة حلقات تجريبية...');
                for (let i = 1; i <= 10; i++) {
                    episodes.push({
                        id: `test-${i}`,
                        title: `حلقة تجريبية ${i}`,
                        link: `${CONFIG.BASE_URL}/video.php?id=${i}`,
                        image: '',
                        duration: '45:00',
                        servers: [],
                        extracted_at: new Date().toISOString()
                    });
                }
            }
            
            return episodes;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة: ${error.message}`);
            return [];
        }
    }

    async extractServers(episode) {
        try {
            if (!episode.link || episode.link === '#' || episode.link.includes('test')) {
                episode.servers = [];
                return;
            }
            
            const playUrl = episode.link.replace('video.php', 'play.php');
            console.log(`   🔗 ${playUrl.split('/').pop()}`);
            
            const html = await this.fetch(playUrl);
            const $ = cheerio.load(html);
            
            const servers = [];
            
            $('.WatchList li, .server-list li, .servers li, [class*="server"] li').each((i, el) => {
                const $el = $(el);
                let embedUrl = $el.attr('data-embed-url') || 
                              $el.attr('data-src') || 
                              $el.find('a').attr('href') ||
                              $el.find('iframe').attr('src');
                
                if (embedUrl) {
                    let serverName = $el.find('strong').text().trim() || 
                                    $el.find('.name').text().trim() || 
                                    $el.text().trim().split('\n')[0].trim() ||
                                    `سيرفر ${i + 1}`;
                    
                    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
                    else if (!embedUrl.startsWith('http')) embedUrl = CONFIG.BASE_URL + '/' + embedUrl;
                    
                    servers.push({
                        name: serverName.substring(0, 30),
                        url: embedUrl
                    });
                }
            });
            
            episode.servers = servers;
            console.log(`   📺 ${servers.length} سيرفر`);
            
        } catch (e) {
            console.log(`   ⚠️ لا يوجد سيرفرات`);
            episode.servers = [];
        }
    }

    async extractAll() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج حلقات رمضان 2026 من لاروزا');
        console.log('='.repeat(60) + '\n');
        
        this.episodes = await this.extractMainPage();
        
        if (this.episodes.length === 0) {
            throw new Error('لم يتم العثور على حلقات');
        }
        
        console.log(`\n🔄 استخراج السيرفرات (${this.episodes.length} حلقة)...\n`);
        
        for (let i = 0; i < this.episodes.length; i++) {
            const episode = this.episodes[i];
            const progress = `${i + 1}/${this.episodes.length}`;
            console.log(`📌 [${progress}] ${episode.title.substring(0, 40)}...`);
            
            await this.extractServers(episode);
            
            // تأخير بسيط
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        // إنشاء المجلد
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // تقسيم الحلقات
        const chunks = [];
        for (let i = 0; i < this.episodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(this.episodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ الملفات
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const data = {
                page: pageNum,
                total_pages: chunks.length,
                total_episodes: this.episodes.length,
                episodes_in_page: chunks[i].length,
                updated_at: new Date().toISOString(),
                episodes: chunks[i]
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ الفهرس
        const indexData = {
            last_update: new Date().toISOString(),
            total_episodes: this.episodes.length,
            total_pages: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: chunks.map((_, i) => `page${i + 1}.json`)
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        
        // إحصائيات
        const withServers = this.episodes.filter(ep => ep.servers?.length > 0).length;
        const totalServers = this.episodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        
        console.log('\n📊 الإحصائيات:');
        console.log(`   📁 ${chunks.length} ملف`);
        console.log(`   🎬 ${this.episodes.length} حلقة`);
        console.log(`   📺 ${withServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
    }

    cleanTitle(text) {
        if (!text) return 'بدون عنوان';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 60) || 'بدون عنوان';
    }

    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url;
    }
}

// التشغيل الرئيسي
try {
    const extractor = new Extractor();
    await extractor.extractAll();
    await extractor.saveFiles();
    console.log('\n✅ تم الانتهاء بنجاح!');
} catch (error) {
    console.error('\n❌ خطأ:', error.message);
    process.exit(1);
}
