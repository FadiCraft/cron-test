// scripts/extractor.js
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
    BASE_URL: 'https://larooza.life',
    CATEGORY_URL: 'https://larooza.life/category.php?cat=ramadan-2026',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://proxy.cors.sh/',
        'https://api.allorigins.win/raw?url=',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: path.join(__dirname, '..', 'data', 'Ramdan'),
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

class Ramadan2026Extractor {
    constructor() {
        this.allEpisodes = [];
        this.totalServers = 0;
        this.currentProxyIndex = 0;
    }

    async fetchWithProxy(url, useProxy = true) {
        for (let i = this.currentProxyIndex; i < CONFIG.PROXIES.length; i++) {
            const proxy = CONFIG.PROXIES[i];
            
            try {
                let fetchUrl = url;
                if (useProxy && proxy) {
                    fetchUrl = proxy + encodeURIComponent(url);
                }

                console.log(`🌐 محاولة الاتصال: ${proxy || 'مباشر'}...`);

                const response = await fetch(fetchUrl, {
                    headers: {
                        'User-Agent': CONFIG.USER_AGENT,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 30000
                });

                if (!response.ok) continue;

                const html = await response.text();
                if (html && html.length > 1000) {
                    this.currentProxyIndex = i;
                    return html;
                }
            } catch (error) {
                console.log(`⚠️ فشل مع ${proxy}: ${error.message}`);
            }
        }
        throw new Error('❌ فشل الاتصال مع جميع الخوادم');
    }

    async extractMainPage() {
        console.log('📥 جاري استخراج الصفحة الرئيسية...');
        const html = await this.fetchWithProxy(CONFIG.CATEGORY_URL);
        const $ = cheerio.load(html);
        
        const episodes = [];
        
        // استخراج جميع الحلقات من الصفحة
        $('li.col-xs-6, li.col-sm-4, li.col-md-3').each((index, element) => {
            const $el = $(element);
            const $link = $el.find('a').first();
            const $img = $el.find('img');
            const $duration = $el.find('.pm-label-duration');
            
            let imageSrc = $img.attr('src') || $img.attr('data-src') || '';
            if (imageSrc && (imageSrc.includes('blank.gif') || imageSrc.includes('data:image'))) {
                imageSrc = '';
            }
            
            const episode = {
                id: `ep-${Date.now()}-${index}`,
                title: this.cleanTitle($el.find('.ellipsis').text() || $link.attr('title') || ''),
                link: $link.attr('href') || '#',
                image: this.fixImageUrl(imageSrc),
                duration: $duration.text().trim() || '00:00',
                description: '',
                servers: [],
                extracted_at: new Date().toISOString(),
                series: 'رمضان 2026'
            };
            
            if (episode.link && episode.link !== '#' && !episode.link.includes('javascript:')) {
                if (!episode.link.startsWith('http')) {
                    episode.link = CONFIG.BASE_URL + episode.link;
                }
                episodes.push(episode);
            }
        });
        
        console.log(`✅ تم استخراج ${episodes.length} حلقة من الصفحة الرئيسية`);
        return episodes.slice(0, 200); // حد أقصى 200 حلقة
    }

    async extractEpisodeDetails(episode) {
        console.log(`🔍 جاري استخراج تفاصيل: ${episode.title}`);
        
        try {
            const html = await this.fetchWithProxy(episode.link);
            const $ = cheerio.load(html);
            
            // استخراج التفاصيل
            episode.description = $('meta[name="description"]').attr('content') || '';
            if (episode.description.length > 200) {
                episode.description = episode.description.substring(0, 200) + '...';
            }
            
            const ogImage = $('meta[property="og:image"]').attr('content');
            if (ogImage) {
                episode.image = this.fixImageUrl(ogImage);
            }
            
            // استخراج السيرفرات
            await this.extractEpisodeServers(episode);
            
            return episode;
        } catch (error) {
            console.log(`❌ فشل استخراج تفاصيل ${episode.title}: ${error.message}`);
            return episode;
        }
    }

    async extractEpisodeServers(episode) {
        try {
            const playUrl = episode.link.replace('video.php', 'play.php');
            const html = await this.fetchWithProxy(playUrl);
            const $ = cheerio.load(html);
            
            const servers = [];
            
            // البحث عن السيرفرات
            $('.WatchList li').each((index, element) => {
                const $el = $(element);
                const embedUrl = $el.attr('data-embed-url');
                
                if (embedUrl) {
                    servers.push({
                        id: $el.attr('data-embed-id') || `server-${index}`,
                        name: $el.find('strong').text().trim() || `سيرفر ${index + 1}`,
                        url: embedUrl,
                        type: 'embed'
                    });
                }
            });
            
            episode.servers = servers;
            this.totalServers += servers.length;
            
            console.log(`   📺 تم استخراج ${servers.length} سيرفر`);
        } catch (error) {
            console.log(`   ⚠️ لا توجد سيرفرات متاحة`);
            episode.servers = [];
        }
    }

    async extractAllEpisodes() {
        console.log('🚀 بدء استخراج جميع الحلقات...\n');
        
        // استخراج الصفحة الرئيسية
        this.allEpisodes = await this.extractMainPage();
        
        if (this.allEpisodes.length === 0) {
            throw new Error('لم يتم العثور على حلقات');
        }
        
        console.log(`\n📊 تم العثور على ${this.allEpisodes.length} حلقة`);
        console.log('🔄 جاري استخراج التفاصيل الكاملة...\n');
        
        // استخراج تفاصيل كل حلقة
        for (let i = 0; i < this.allEpisodes.length; i++) {
            console.log(`📌 تقدم: ${i + 1}/${this.allEpisodes.length}`);
            await this.extractEpisodeDetails(this.allEpisodes[i]);
            
            // تأخير بسيط لتجنب الحظر
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`\n✅ تم استخراج ${this.allEpisodes.length} حلقة`);
        console.log(`   📺 إجمالي السيرفرات: ${this.totalServers}`);
        
        return this.allEpisodes;
    }

    async saveToFiles() {
        console.log('\n💾 جاري حفظ البيانات...');
        
        // التأكد من وجود المجلد
        await fs.ensureDir(CONFIG.DATA_DIR);
        
        // حذف الملفات القديمة (اختياري)
        // await fs.emptyDir(CONFIG.DATA_DIR);
        
        // تقسيم الحلقات إلى ملفات
        const chunks = this.chunkArray(this.allEpisodes, CONFIG.EPISODES_PER_FILE);
        
        for (let i = 0; i < chunks.length; i++) {
            const pageNumber = i + 1;
            const fileName = `page${pageNumber}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const pageData = {
                page: pageNumber,
                total_pages: chunks.length,
                episodes_per_page: CONFIG.EPISODES_PER_FILE,
                total_episodes: this.allEpisodes.length,
                total_servers: this.totalServers,
                extracted_at: new Date().toISOString(),
                category: 'رمضان 2026',
                source: CONFIG.BASE_URL,
                episodes: chunks[i]
            };
            
            await fs.writeJson(filePath, pageData, { spaces: 2 });
            console.log(`   📄 حفظ الملف ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ ملف الفهرس
        await this.saveIndexFile(chunks.length);
        
        console.log(`\n✅ تم حفظ البيانات في ${chunks.length} ملف`);
        return chunks.length;
    }

    async saveIndexFile(totalPages) {
        const indexPath = path.join(CONFIG.DATA_DIR, 'index.json');
        const indexData = {
            last_updated: new Date().toISOString(),
            total_episodes: this.allEpisodes.length,
            total_servers: this.totalServers,
            total_pages: totalPages,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            category: 'رمضان 2026',
            files: []
        };
        
        for (let i = 1; i <= totalPages; i++) {
            indexData.files.push({
                page: i,
                file: `page${i}.json`,
                episodes: i === totalPages 
                    ? this.allEpisodes.length % CONFIG.EPISODES_PER_FILE || CONFIG.EPISODES_PER_FILE
                    : CONFIG.EPISODES_PER_FILE
            });
        }
        
        await fs.writeJson(indexPath, indexData, { spaces: 2 });
        console.log(`   📄 حفظ ملف الفهرس index.json`);
    }

    cleanTitle(title) {
        return title
            .replace(/[\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\u0600-\u06FF\s\-]/g, '')
            .substring(0, 60)
            .trim() || 'عنوان غير معروف';
    }

    fixImageUrl(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url;
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    generateStats() {
        const stats = {
            total_episodes: this.allEpisodes.length,
            total_servers: this.totalServers,
            episodes_with_servers: this.allEpisodes.filter(ep => ep.servers && ep.servers.length > 0).length,
            episodes_with_images: this.allEpisodes.filter(ep => ep.image).length,
            average_servers_per_episode: (this.totalServers / this.allEpisodes.length).toFixed(2),
            extraction_date: new Date().toISOString()
        };
        
        return stats;
    }
}

// الوظيفة الرئيسية
async function main() {
    console.log('='.repeat(60));
    console.log('🎬 مستخرج حلقات رمضان 2026 من لاروزا');
    console.log('='.repeat(60) + '\n');
    
    try {
        const extractor = new Ramadan2026Extractor();
        
        // استخراج جميع الحلقات
        await extractor.extractAllEpisodes();
        
        // حفظ البيانات في ملفات
        const pagesCount = await extractor.saveToFiles();
        
        // عرض الإحصائيات
        const stats = extractor.generateStats();
        console.log('\n📊 الإحصائيات:');
        console.log('-'.repeat(40));
        console.log(`   إجمالي الحلقات: ${stats.total_episodes}`);
        console.log(`   إجمالي السيرفرات: ${stats.total_servers}`);
        console.log(`   حلقات تحتوي على سيرفرات: ${stats.episodes_with_servers}`);
        console.log(`   متوسط السيرفرات لكل حلقة: ${stats.average_servers_per_episode}`);
        console.log(`   عدد الملفات: ${pagesCount}`);
        
        console.log('\n✅ اكتملت العملية بنجاح!');
        
    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        process.exit(1);
    }
}

// تشغيل البرنامج
main();
