// extractor.js - مستخرج حلقات رمضان 2026
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    URL: 'https://larooza.life/category.php?cat=ramadan-2026',
    BASE_URL: 'https://larooza.life',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://proxy.cors.sh/',
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
                
                const res = await fetch(fetchUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                
                if (res.ok) return await res.text();
            } catch (e) {
                console.log(`⚠️ فشل: ${e.message}`);
            }
        }
        throw new Error('❌ فشل الاتصال');
    }

    async extractMainPage() {
        console.log('\n📥 استخراج الصفحة الرئيسية...');
        const html = await this.fetch(CONFIG.URL);
        const $ = cheerio.load(html);
        
        const episodes = [];
        
        $('li.col-xs-6, li.col-sm-4, li.col-md-3').each((i, el) => {
            const $el = $(el);
            const $link = $el.find('a').first();
            
            let image = $el.find('img').attr('src') || $el.find('img').attr('data-src') || '';
            if (image.includes('blank.gif') || image.includes('data:image')) image = '';
            
            const title = $el.find('.ellipsis').text().trim() || $link.attr('title') || 'بدون عنوان';
            
            episodes.push({
                id: `ep${Date.now()}${i}`,
                title: this.cleanTitle(title),
                link: $link.attr('href')?.startsWith('http') ? $link.attr('href') : CONFIG.BASE_URL + $link.attr('href'),
                image: this.fixImage(image),
                duration: $el.find('.pm-label-duration').text().trim() || '00:00',
                servers: []
            });
        });
        
        console.log(`✅ وجد ${episodes.length} حلقة`);
        return episodes.slice(0, 200);
    }

    async extractServers(episode) {
        try {
            const playUrl = episode.link.replace('video.php', 'play.php');
            const html = await this.fetch(playUrl);
            const $ = cheerio.load(html);
            
            $('.WatchList li').each((i, el) => {
                const $el = $(el);
                const embedUrl = $el.attr('data-embed-url');
                if (embedUrl) {
                    episode.servers.push({
                        name: $el.find('strong').text().trim() || `سيرفر ${i+1}`,
                        url: embedUrl
                    });
                }
            });
            
            console.log(`   📺 ${episode.servers.length} سيرفر`);
        } catch (e) {
            console.log(`   ⚠️ لا يوجد سيرفرات`);
        }
    }

    async extractAll() {
        this.episodes = await this.extractMainPage();
        
        console.log('\n🔄 استخراج السيرفرات...');
        for (let i = 0; i < this.episodes.length; i++) {
            console.log(`📌 ${i+1}/${this.episodes.length}: ${this.episodes[i].title.substring(0, 30)}...`);
            await this.extractServers(this.episodes[i]);
            await new Promise(r => setTimeout(r, 500));
        }
    }

    async saveFiles() {
        console.log('\n💾 حفظ الملفات...');
        
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // تقسيم الحلقات
        const chunks = [];
        for (let i = 0; i < this.episodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(this.episodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ كل ملف
        for (let i = 0; i < chunks.length; i++) {
            const fileName = `page${i+1}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            await fs.writeFile(filePath, JSON.stringify({
                page: i+1,
                total_pages: chunks.length,
                episodes: chunks[i],
                total_episodes: this.episodes.length,
                updated: new Date().toISOString()
            }, null, 2));
            
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ ملف الفهرس
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify({
                last_update: new Date().toISOString(),
                total_episodes: this.episodes.length,
                total_pages: chunks.length,
                episodes_per_file: CONFIG.EPISODES_PER_FILE
            }, null, 2)
        );
        
        console.log(`✅ تم حفظ ${chunks.length} ملف`);
    }

    cleanTitle(t) {
        return t.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 60) || 'بدون عنوان';
    }

    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        return url;
    }
}

// التشغيل الرئيسي
try {
    console.log('='.repeat(50));
    console.log('🎬 مستخرج حلقات رمضان 2026');
    console.log('='.repeat(50));
    
    const ex = new Extractor();
    await ex.extractAll();
    await ex.saveFiles();
    
    console.log('\n✅ تم بنجاح!');
} catch (e) {
    console.error('\n❌ خطأ:', e.message);
    process.exit(1);
}
