// extractor.js - مستخرج حلقات رمضان 2026 (جميع الصفحات)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    BASE_URL: 'https://larooza.life',
    CATEGORY: 'ramadan-2026',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: 'data/Ramdan',
    MAX_PAGES: 50, // حد أقصى للصفحات
    REQUEST_DELAY: 2000 // 2 ثواني بين الصفحات
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

    // دالة جديدة: معرفة عدد الصفحات
    async getTotalPages() {
        console.log('\n🔍 جاري تحديد عدد الصفحات...');
        
        try {
            const firstPageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=1&order=DESC`;
            const html = await this.fetch(firstPageUrl);
            const $ = cheerio.load(html);
            
            let totalPages = 1;
            
            // البحث عن روابط الترقيم
            $('.pagination a, .pages a, .pager a, .wp-pagenavi a, .page-numbers').each((i, el) => {
                const text = $(el).text().trim();
                const num = parseInt(text);
                if (!isNaN(num) && num > totalPages) {
                    totalPages = num;
                }
            });
            
            // إذا لم نجد، نبحث في روابط الصفحات
            if (totalPages === 1) {
                $('a[href*="page="]').each((i, el) => {
                    const href = $(el).attr('href');
                    const match = href.match(/page=(\d+)/i);
                    if (match && match[1]) {
                        const num = parseInt(match[1]);
                        if (num > totalPages) totalPages = num;
                    }
                });
            }
            
            totalPages = Math.min(totalPages, CONFIG.MAX_PAGES);
            console.log(`📊 تم العثور على ${totalPages} صفحة`);
            return totalPages;
            
        } catch (error) {
            console.log('⚠️ لم نتمكن من تحديد عدد الصفحات، سنستخرج الصفحة الأولى فقط');
            return 1;
        }
    }

    // دالة معدلة: استخراج حلقات من صفحة محددة
    async extractPage(pageNum) {
        const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNum}&order=DESC`;
        console.log(`\n📄 استخراج الصفحة ${pageNum}...`);
        
        try {
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            const pageEpisodes = [];
            
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
                        
                        // معرف فريد
                        const videoId = link.match(/[?&]id=(\d+)/);
                        
                        pageEpisodes.push({
                            id: videoId ? `vid-${videoId[1]}` : `page${pageNum}-${Date.now()}-${index}`,
                            page: pageNum,
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
            
            console.log(`✅ تم استخراج ${pageEpisodes.length} حلقة من الصفحة ${pageNum}`);
            return pageEpisodes;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }

    // دالة معدلة: استخراج سيرفرات حلقة
    async extractServers(episode, episodeIndex, totalInPage) {
        try {
            if (!episode.link || episode.link === '#') {
                episode.servers = [];
                return;
            }
            
            const playUrl = episode.link.replace('video.php', 'play.php');
            console.log(`   🔗 [${episodeIndex + 1}/${totalInPage}] ${episode.title.substring(0, 30)}...`);
            
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
            
            if (servers.length > 0) {
                console.log(`      📺 ${servers.length} سيرفر`);
            } else {
                console.log(`      ⚠️ لا يوجد سيرفرات`);
            }
            
        } catch (e) {
            console.log(`      ⚠️ فشل استخراج السيرفرات`);
            episode.servers = [];
        }
    }

    // دالة جديدة: معالجة صفحة كاملة
    async processPage(pageNum) {
        console.log('\n' + '='.repeat(60));
        console.log(`📑 معالجة الصفحة ${pageNum} بالكامل`);
        console.log('='.repeat(60));
        
        // 1. استخراج الحلقات من الصفحة
        const pageEpisodes = await this.extractPage(pageNum);
        
        if (pageEpisodes.length === 0) {
            console.log(`⚠️ لا توجد حلقات في الصفحة ${pageNum}`);
            return [];
        }
        
        // 2. استخراج السيرفرات لكل حلقة في هذه الصفحة
        console.log(`\n🔄 استخراج السيرفرات (${pageEpisodes.length} حلقة)...\n`);
        
        for (let i = 0; i < pageEpisodes.length; i++) {
            await this.extractServers(pageEpisodes[i], i, pageEpisodes.length);
            
            // تأخير بسيط بين الحلقات
            if (i < pageEpisodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // 3. إحصائيات الصفحة
        const serversInPage = pageEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithServers = pageEpisodes.filter(ep => ep.servers?.length > 0).length;
        
        console.log('\n' + '─'.repeat(40));
        console.log(`📊 إحصائيات الصفحة ${pageNum}:`);
        console.log(`   🎬 ${pageEpisodes.length} حلقة`);
        console.log(`   📺 ${serversInPage} سيرفر`);
        console.log(`   ✨ ${episodesWithServers} حلقة تحتوي على سيرفرات`);
        console.log('─'.repeat(40));
        
        return pageEpisodes;
    }

    // دالة معدلة: استخراج كل الصفحات
    async extractAll() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج حلقات رمضان 2026 من لاروزا');
        console.log('='.repeat(60));
        
        // 1. معرفة عدد الصفحات
        const totalPages = await this.getTotalPages();
        
        // 2. معالجة كل صفحة بالترتيب
        for (let page = 1; page <= totalPages; page++) {
            const pageEpisodes = await this.processPage(page);
            
            // إضافة حلقات الصفحة إلى المجموعة الكلية
            this.episodes.push(...pageEpisodes);
            
            // تأخير بين الصفحات
            if (page < totalPages) {
                console.log(`\n⏳ انتظار ${CONFIG.REQUEST_DELAY / 1000} ثواني قبل الصفحة التالية...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
        }
        
        // 3. إحصائيات عامة
        const totalServers = this.episodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithServers = this.episodes.filter(ep => ep.servers?.length > 0).length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 إحصائيات عامة:');
        console.log(`   📑 ${totalPages} صفحة`);
        console.log(`   🎬 ${this.episodes.length} إجمالي الحلقات`);
        console.log(`   📺 ${episodesWithServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log('='.repeat(60));
    }

    // دالة حفظ الملفات (نفسها مع تعديل بسيط)
    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // ترتيب الحلقات حسب الصفحة
        const sortedEpisodes = [...this.episodes].sort((a, b) => (a.page || 0) - (b.page || 0));
        
        // تقسيم الحلقات
        const chunks = [];
        for (let i = 0; i < sortedEpisodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedEpisodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ الملفات
        for (let i = 0; i < chunks.length; i++) {
            const partNum = i + 1;
            const fileName = `ramadan-2026-part${partNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const data = {
                part: partNum,
                total_parts: chunks.length,
                total_episodes: sortedEpisodes.length,
                episodes_in_part: chunks[i].length,
                episodes_range: {
                    from: (i * CONFIG.EPISODES_PER_FILE) + 1,
                    to: (i * CONFIG.EPISODES_PER_FILE) + chunks[i].length
                },
                updated_at: new Date().toISOString(),
                episodes: chunks[i]
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ الفهرس
        const totalServers = sortedEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        
        const indexData = {
            category: 'ramadan-2026',
            last_update: new Date().toISOString(),
            total_episodes: sortedEpisodes.length,
            total_servers: totalServers,
            episodes_with_servers: sortedEpisodes.filter(ep => ep.servers?.length > 0).length,
            total_parts: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: chunks.map((_, i) => `ramadan-2026-part${i + 1}.json`)
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        
        // إحصائيات
        const withServers = sortedEpisodes.filter(ep => ep.servers?.length > 0).length;
        
        console.log('\n📊 الإحصائيات النهائية:');
        console.log(`   📁 ${chunks.length} ملف`);
        console.log(`   🎬 ${sortedEpisodes.length} حلقة`);
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
