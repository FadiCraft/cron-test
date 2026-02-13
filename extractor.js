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
                console.log(`🌐 محاولة: ${proxy || 'مباشر'}`);
                
                const response = await axios.get(fetchUrl, {
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                    }
                });
                
                if (response.data && response.data.length > 1000) {
                    return response.data;
                }
            } catch (e) {
                console.log(`⚠️ فشل ${proxy || 'مباشر'}: ${e.message?.substring(0, 50)}...`);
            }
        }
        throw new Error('❌ فشل الاتصال مع جميع البروكسيات');
    }

    async extractMainPage() {
        console.log('\n📥 استخراج الصفحة الرئيسية...');
        const html = await this.fetch(CONFIG.URL);
        const $ = cheerio.load(html);
        
        const episodes = [];
        
        // استخراج الحلقات
        $('li.col-xs-6, li.col-sm-4, li.col-md-3').each((i, el) => {
            try {
                const $el = $(el);
                const $link = $el.find('a').first();
                
                // استخراج الصورة
                let image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || '';
                if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                    image = '';
                }
                
                // استخراج العنوان
                const title = $el.find('.ellipsis').text().trim() || 
                            $link.attr('title')?.trim() || 
                            `حلقة ${i+1}`;
                
                // استخراج الرابط
                let link = $link.attr('href') || '#';
                if (link && !link.startsWith('http')) {
                    link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                }
                
                // استخراج المدة
                const duration = $el.find('.pm-label-duration').text().trim() || '00:00';
                
                episodes.push({
                    id: `ramadan-2026-${Date.now()}-${i}`,
                    title: this.cleanTitle(title),
                    link: link,
                    image: this.fixImage(image),
                    duration: duration,
                    servers: [],
                    extracted_at: new Date().toISOString()
                });
            } catch (e) {
                console.log(`⚠️ خطأ في استخراج حلقة: ${e.message}`);
            }
        });
        
        console.log(`✅ تم استخراج ${episodes.length} حلقة`);
        return episodes.slice(0, 200); // حد 200 حلقة
    }

    async extractServers(episode) {
        try {
            // تحويل رابط الفيديو إلى رابط المشاهدة
            const playUrl = episode.link.replace('video.php', 'play.php');
            const html = await this.fetch(playUrl);
            const $ = cheerio.load(html);
            
            const servers = [];
            
            // استخراج السيرفرات
            $('.WatchList li, .server-list li, [class*="server"] li').each((i, el) => {
                const $el = $(el);
                let embedUrl = $el.attr('data-embed-url') || 
                              $el.attr('data-src') || 
                              $el.find('a').attr('href') ||
                              $el.find('iframe').attr('src');
                
                if (embedUrl) {
                    const serverName = $el.find('strong').text().trim() || 
                                      $el.find('.name').text().trim() || 
                                      `سيرفر ${i+1}`;
                    
                    servers.push({
                        id: `srv-${Date.now()}-${i}`,
                        name: serverName,
                        url: embedUrl.startsWith('http') ? embedUrl : CONFIG.BASE_URL + embedUrl
                    });
                }
            });
            
            episode.servers = servers;
            console.log(`   📺 ${servers.length} سيرفر`);
            
        } catch (e) {
            console.log(`   ⚠️ لا يوجد سيرفرات: ${e.message.substring(0, 30)}...`);
            episode.servers = [];
        }
    }

    async extractAll() {
        // استخراج الصفحة الرئيسية
        this.episodes = await this.extractMainPage();
        
        if (this.episodes.length === 0) {
            throw new Error('لم يتم العثور على أي حلقات');
        }
        
        // استخراج السيرفرات لكل حلقة
        console.log('\n🔄 جاري استخراج السيرفرات...');
        for (let i = 0; i < this.episodes.length; i++) {
            const episode = this.episodes[i];
            console.log(`📌 ${i+1}/${this.episodes.length}: ${episode.title.substring(0, 40)}...`);
            await this.extractServers(episode);
            
            // تأخير لتجنب حظر IP
            await new Promise(r => setTimeout(r, 800));
        }
    }

    async saveFiles() {
        console.log('\n💾 جاري حفظ الملفات...');
        
        // إنشاء المجلد
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // تقسيم الحلقات إلى مجموعات
        const chunks = [];
        for (let i = 0; i < this.episodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(this.episodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ كل مجموعة في ملف
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const data = {
                page: pageNum,
                total_pages: chunks.length,
                episodes: chunks[i],
                total_episodes: this.episodes.length,
                episodes_in_page: chunks[i].length,
                updated_at: new Date().toISOString(),
                category: 'رمضان 2026'
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ ملف الفهرس
        const indexData = {
            last_update: new Date().toISOString(),
            total_episodes: this.episodes.length,
            total_pages: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: chunks.map((chunk, i) => ({
                page: i + 1,
                file: `page${i+1}.json`,
                episodes: chunk.length
            }))
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        console.log(`\n✅ تم حفظ ${chunks.length} ملف بنجاح`);
    }

    cleanTitle(title) {
        if (!title) return 'بدون عنوان';
        return title
            .replace(/[\n\r\t]/g, ' ')
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

// ===========================================
// التشغيل الرئيسي
// ===========================================
try {
    console.log('='.repeat(60));
    console.log('🎬 مستخرج حلقات مسلسلات رمضان 2026 من لاروزا');
    console.log('='.repeat(60));
    
    const extractor = new Extractor();
    
    // 1. استخراج الحلقات
    await extractor.extractAll();
    
    // 2. حفظ الملفات
    await extractor.saveFiles();
    
    // 3. إحصائيات
    const withServers = extractor.episodes.filter(ep => ep.servers?.length > 0).length;
    const totalServers = extractor.episodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
    
    console.log('\n📊 الإحصائيات:');
    console.log('-'.repeat(40));
    console.log(`   إجمالي الحلقات: ${extractor.episodes.length}`);
    console.log(`   حلقات بسيرفرات: ${withServers}`);
    console.log(`   إجمالي السيرفرات: ${totalServers}`);
    console.log(`   متوسط السيرفرات: ${(totalServers / extractor.episodes.length).toFixed(1)}`);
    console.log(`   وقت التنفيذ: ${new Date().toLocaleString('ar-EG')}`);
    
    console.log('\n✅ اكتملت العملية بنجاح!');
    
} catch (error) {
    console.error('\n❌ خطأ:', error.message);
    process.exit(1);
}
