// ramadan-extractor.js - مستخرج حلقات رمضان 2026 (استخراج متسلسل كامل)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    MAX_PAGES: 100,
    REQUEST_DELAY: 2000, // 2 ثواني بين الصفحات
    REQUEST_DELAY_SERVERS: 500, // نصف ثانية بين استخراج السيرفرات
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ]
};

class RamadanExtractor {
    constructor() {
        this.allEpisodes = [];
        this.currentPageEpisodes = [];
        this.stats = {
            totalExtracted: 0,
            totalServers: 0,
            pagesProcessed: 0,
            startTime: Date.now(),
            currentPage: 0,
            episodesWithServers: 0
        };
    }

    getRandomUserAgent() {
        return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
    }

    // جلب المحتوى مع محاولات متعددة
    async fetch(url, retryCount = 0) {
        for (const proxy of CONFIG.PROXIES) {
            try {
                const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                const response = await axios({
                    method: 'get',
                    url: fetchUrl,
                    timeout: 30000,
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache'
                    },
                    maxRedirects: 5,
                    validateStatus: status => status < 400
                });
                
                if (response.data && typeof response.data === 'string' && response.data.length > 500) {
                    return response.data;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            return this.fetch(url, retryCount + 1);
        }
        
        throw new Error(`فشل الاتصال بـ ${url}`);
    }

    // استخراج عدد الصفحات المتاحة
    async getTotalPages() {
        console.log('🔍 جاري تحديد عدد الصفحات المتاحة...');
        
        try {
            const firstPageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=1&order=DESC`;
            const html = await this.fetch(firstPageUrl);
            const $ = cheerio.load(html);
            
            let totalPages = 1;
            
            // البحث عن الترقيم
            $('.pagination a, .pages a, .pager a, .wp-pagenavi a, .page-numbers').each((i, el) => {
                const text = $(el).text().trim();
                const num = parseInt(text);
                if (!isNaN(num) && num > totalPages) {
                    totalPages = num;
                }
            });
            
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
            console.log('⚠️ لم نتمكن من تحديد عدد الصفحات، سنفترض 20 صفحة');
            return 20;
        }
    }

    // استخراج الحلقات من صفحة محددة
    async extractEpisodesFromPage(pageNum) {
        const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNum}&order=DESC`;
        console.log(`\n📄 استخراج حلقات الصفحة ${pageNum}...`);
        
        try {
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            const pageEpisodes = [];
            
            // محاولة استخراج الحلقات
            $('li.col-xs-6, li.col-sm-4, li.col-md-3, .post, .item, article, .video-item').each((index, element) => {
                try {
                    const $el = $(element);
                    
                    // استخراج الرابط
                    let link = $el.find('a[href*="video.php"]').attr('href') || 
                              $el.find('a[href*="play.php"]').attr('href') ||
                              $el.find('a').first().attr('href');
                    
                    if (!link || link === '#' || link.includes('javascript')) {
                        return;
                    }
                    
                    // بناء الرابط الكامل
                    if (!link.startsWith('http')) {
                        link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                    }
                    
                    // استخراج العنوان
                    let title = $el.find('.ellipsis').text().trim() || 
                               $el.find('h2, h3, .title, .name').first().text().trim() ||
                               $el.find('img').attr('alt') ||
                               $el.attr('title') ||
                               `حلقة ${pageNum}-${index + 1}`;
                    
                    // استخراج الصورة
                    let image = $el.find('img').attr('src') || 
                               $el.find('img').attr('data-src') || 
                               $el.find('img').attr('data-original') || 
                               '';
                    
                    // استخراج المدة
                    let duration = $el.find('.duration, .time, .pm-label-duration').first().text().trim() || '00:00';
                    
                    // إنشاء معرف فريد
                    const videoId = this.extractVideoId(link);
                    
                    const episode = {
                        id: videoId || `page${pageNum}-ep${index}-${Date.now()}`,
                        page: pageNum,
                        position: index + 1,
                        title: this.cleanTitle(title),
                        link: link,
                        image: this.fixImage(image),
                        duration: duration,
                        servers: [],
                        extracted_at: new Date().toISOString(),
                        servers_extracted: false
                    };
                    
                    pageEpisodes.push(episode);
                    
                } catch (e) {
                    // تجاهل الخطأ الفردي
                }
            });
            
            console.log(`   ✅ تم العثور على ${pageEpisodes.length} حلقة في الصفحة ${pageNum}`);
            return pageEpisodes;
            
        } catch (error) {
            console.log(`   ❌ فشل استخراج الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }

    // استخراج معلومات السيرفرات لحلقة محددة
    async extractServersForEpisode(episode, episodeIndex, totalInPage) {
        try {
            if (!episode.link || episode.link.includes('test')) {
                return;
            }
            
            // تحويل رابط المشاهدة إلى رابط التشغيل
            const playUrl = episode.link.replace('video.php', 'play.php');
            
            console.log(`      🔗 استخراج سيرفرات الحلقة ${episodeIndex + 1}/${totalInPage}: ${episode.title.substring(0, 30)}...`);
            
            const html = await this.fetch(playUrl);
            const $ = cheerio.load(html);
            
            const servers = [];
            
            // محاولة استخراج السيرفرات بعدة طرق
            $('.WatchList li, .server-list li, .servers li, [class*="server"] li, .links li').each((i, el) => {
                const $el = $(el);
                
                // محاولة استخراج الرابط
                let embedUrl = $el.attr('data-embed-url') || 
                              $el.attr('data-src') || 
                              $el.attr('data-link') ||
                              $el.find('a').attr('href') ||
                              $el.find('iframe').attr('src');
                
                if (embedUrl) {
                    // استخراج اسم السيرفر
                    let serverName = $el.find('strong').text().trim() || 
                                    $el.find('.name, .server-name, .label').text().trim() || 
                                    $el.text().trim().split('\n')[0].trim() ||
                                    `سيرفر ${i + 1}`;
                    
                    // تنظيف الرابط
                    if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
                    else if (embedUrl.startsWith('/')) embedUrl = CONFIG.BASE_URL + embedUrl;
                    
                    servers.push({
                        name: this.cleanTitle(serverName).substring(0, 30),
                        url: embedUrl,
                        quality: this.detectQuality(embedUrl, $el.text())
                    });
                }
            });
            
            episode.servers = servers;
            episode.servers_extracted = true;
            episode.servers_count = servers.length;
            
            if (servers.length > 0) {
                this.stats.totalServers += servers.length;
                this.stats.episodesWithServers++;
            }
            
            // عرض تقدم السيرفرات
            if (servers.length > 0) {
                console.log(`         📺 ${servers.length} سيرفر`);
            } else {
                console.log(`         ⚠️ لا يوجد سيرفرات`);
            }
            
        } catch (e) {
            console.log(`         ❌ فشل استخراج السيرفرات`);
            episode.servers = [];
            episode.servers_extracted = false;
        }
    }

    // استخراج رقم الفيديو من الرابط
    extractVideoId(link) {
        const match = link.match(/[?&]id=(\d+)/) || link.match(/video[/-](\d+)/);
        return match ? `vid-${match[1]}` : null;
    }

    // كشف جودة الفيديو
    detectQuality(url, text) {
        const qualityMatch = text.match(/(\d{3,4}p)/i) || url.match(/(\d{3,4}p)/i);
        return qualityMatch ? qualityMatch[1] : 'HD';
    }

    // معالجة صفحة كاملة (استخراج الحلقات + سيرفراتها)
    async processPage(pageNum) {
        console.log('\n' + '═'.repeat(60));
        console.log(`📑 معالجة الصفحة ${pageNum} بالكامل`);
        console.log('═'.repeat(60));
        
        this.stats.currentPage = pageNum;
        
        // 1. استخراج الحلقات من الصفحة
        const episodes = await this.extractEpisodesFromPage(pageNum);
        
        if (episodes.length === 0) {
            console.log(`⚠️ لا توجد حلقات في الصفحة ${pageNum}`);
            return [];
        }
        
        // 2. استخراج السيرفرات لكل حلقة في هذه الصفحة
        console.log(`\n🔄 استخراج السيرفرات لـ ${episodes.length} حلقة من الصفحة ${pageNum}...\n`);
        
        for (let i = 0; i < episodes.length; i++) {
            await this.extractServersForEpisode(episodes[i], i, episodes.length);
            
            // تأخير بسيط بين استخراج سيرفرات كل حلقة
            if (i < episodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY_SERVERS));
            }
        }
        
        // 3. حفظ هذه الصفحة بشكل منفصل (كملف مؤقت)
        await this.savePageCheckpoint(pageNum, episodes);
        
        // 4. إضافة إلى المجموعة الكلية
        this.allEpisodes.push(...episodes);
        this.stats.totalExtracted += episodes.length;
        
        // 5. عرض إحصائيات الصفحة
        const serversInPage = episodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        console.log('\n' + '─'.repeat(40));
        console.log(`📊 إحصائيات الصفحة ${pageNum}:`);
        console.log(`   🎬 ${episodes.length} حلقة`);
        console.log(`   📺 ${serversInPage} سيرفر`);
        console.log(`   ✨ ${episodes.filter(ep => ep.servers?.length > 0).length} حلقة تحتوي على سيرفرات`);
        console.log('─'.repeat(40));
        
        return episodes;
    }

    // حفظ نقطة تفتيش للصفحة (في حال توقف البرنامج)
    async savePageCheckpoint(pageNum, episodes) {
        try {
            const checkpointDir = path.join(CONFIG.DATA_DIR, 'checkpoints');
            await fs.mkdir(checkpointDir, { recursive: true });
            
            const checkpointFile = path.join(checkpointDir, `page${pageNum}-complete.json`);
            
            const data = {
                page: pageNum,
                extracted_at: new Date().toISOString(),
                episodes_count: episodes.length,
                episodes: episodes.map(ep => ({
                    ...ep,
                    // نسخة مخففة للحفظ السريع
                    servers_summary: ep.servers?.map(s => s.name) || []
                }))
            };
            
            await fs.writeFile(checkpointFile, JSON.stringify(data, null, 2));
            console.log(`   💾 تم حفظ نقطة تفتيش للصفحة ${pageNum}`);
        } catch (e) {
            // تجاهل خطأ الحفظ المؤقت
        }
    }

    // استخراج جميع الصفحات بالترتيب
    async extractAllPages() {
        console.log('\n' + '='.repeat(60));
        console.log('🎬 بدء استخراج جميع صفحات رمضان 2026');
        console.log('='.repeat(60) + '\n');
        
        // معرفة عدد الصفحات
        const totalPages = await this.getTotalPages();
        
        // معالجة كل صفحة بالكامل قبل الانتقال للتالية
        for (let page = 1; page <= totalPages; page++) {
            await this.processPage(page);
            
            // تأخير بين الصفحات
            if (page < totalPages) {
                console.log(`\n⏳ انتظار ${CONFIG.REQUEST_DELAY / 1000} ثواني قبل الصفحة التالية...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
            
            this.stats.pagesProcessed = page;
        }
        
        // عرض إحصائيات عامة
        const totalServers = this.allEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithServers = this.allEpisodes.filter(ep => ep.servers?.length > 0).length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 إحصائيات عامة:');
        console.log(`   📑 ${totalPages} صفحة`);
        console.log(`   🎬 ${this.allEpisodes.length} إجمالي الحلقات`);
        console.log(`   📺 ${episodesWithServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log(`   ⏱️  الوقت المستغرق: ${((Date.now() - this.stats.startTime) / 1000 / 60).toFixed(2)} دقيقة`);
        console.log('='.repeat(60));
    }

    // فحص التحديثات (الصفحة الأولى فقط كاملة)
    async checkForUpdates() {
        console.log('\n' + '='.repeat(60));
        console.log('🔄 فحص التحديثات الجديدة');
        console.log('='.repeat(60) + '\n');
        
        // معالجة الصفحة الأولى فقط
        await this.processPage(1);
        
        // مقارنة مع البيانات الموجودة (يتطلب تحميل البيانات السابقة)
        try {
            const indexPath = path.join(CONFIG.DATA_DIR, 'index.json');
            const indexData = JSON.parse(await fs.readFile(indexPath, 'utf8'));
            
            console.log('\n📊 مقارنة مع البيانات السابقة...');
            console.log(`   ℹ️ كانت توجد ${indexData.total_episodes} حلقة`);
            console.log(`   ✨ الآن ${this.allEpisodes.length} حلقة`);
            
            const difference = this.allEpisodes.length - indexData.total_episodes;
            if (difference > 0) {
                console.log(`   ✅ تم العثور على ${difference} حلقة جديدة`);
            } else {
                console.log(`   📭 لا توجد حلقات جديدة`);
            }
            
        } catch (e) {
            console.log('   ℹ️ لا توجد بيانات سابقة للمقارنة');
        }
    }

    // حفظ جميع البيانات
    async saveFiles() {
        console.log('\n' + '='.repeat(60));
        console.log('💾 حفظ البيانات النهائية');
        console.log('='.repeat(60) + '\n');
        
        // إنشاء المجلد
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // ترتيب الحلقات (حسب الصفحة والترتيب)
        const sortedEpisodes = [...this.allEpisodes].sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page;
            return a.position - b.position;
        });
        
        // تقسيم الحلقات
        const chunks = [];
        for (let i = 0; i < sortedEpisodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedEpisodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ الملفات
        for (let i = 0; i < chunks.length; i++) {
            const fileNum = i + 1;
            const fileName = `ramadan-2026-part${fileNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            // إحصائيات الملف
            const serversInFile = chunks[i].reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
            
            const data = {
                part: fileNum,
                total_parts: chunks.length,
                episodes_range: {
                    from: (i * CONFIG.EPISODES_PER_FILE) + 1,
                    to: (i * CONFIG.EPISODES_PER_FILE) + chunks[i].length
                },
                episodes_count: chunks[i].length,
                servers_count: serversInFile,
                last_updated: new Date().toISOString(),
                episodes: chunks[i]
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName}`);
            console.log(`   🎬 ${chunks[i].length} حلقة | 📺 ${serversInFile} سيرفر`);
        }
        
        // حفظ الفهرس الرئيسي
        const totalServers = sortedEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        
        const indexData = {
            category: CONFIG.CATEGORY,
            year: '2026',
            last_full_update: new Date().toISOString(),
            total_episodes: sortedEpisodes.length,
            total_servers: totalServers,
            episodes_with_servers: sortedEpisodes.filter(ep => ep.servers?.length > 0).length,
            parts: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: chunks.map((_, i) => `ramadan-2026-part${i + 1}.json`),
            pages_processed: this.stats.pagesProcessed,
            stats: {
                extraction_time_seconds: ((Date.now() - this.stats.startTime) / 1000).toFixed(2),
                average_servers_per_episode: (totalServers / sortedEpisodes.length).toFixed(2)
            }
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`\n📄 index.json - فهرس رئيسي`);
        console.log(`   🎬 ${sortedEpisodes.length} إجمالي الحلقات`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log(`   ⏱️  ${indexData.stats.extraction_time_seconds} ثانية`);
        
        // تنظيف نقاط التفتيش
        try {
            const checkpointDir = path.join(CONFIG.DATA_DIR, 'checkpoints');
            await fs.rm(checkpointDir, { recursive: true, force: true });
        } catch (e) {
            // تجاهل
        }
    }

    // دوال مساعدة
    cleanTitle(text) {
        if (!text) return 'بدون عنوان';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100) || 'بدون عنوان';
    }

    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url;
    }
}

// واجهة سطر الأوامر
async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'full';
    
    const extractor = new RamadanExtractor();
    
    try {
        if (mode === 'full' || mode === '--full' || mode === 'all') {
            // استخراج جميع الصفحات (كل صفحة كاملة قبل الانتقال للتالية)
            await extractor.extractAllPages();
            
        } else if (mode === 'update' || mode === '--update') {
            // فحص التحديثات (الصفحة الأولى فقط كاملة)
            await extractor.checkForUpdates();
            
        } else {
            console.log('\n📌 طريقة الاستعمال:');
            console.log('   node ramadan-extractor.js full    # استخراج جميع الصفحات (كل صفحة كاملة)');
            console.log('   node ramadan-extractor.js update  # فحص الصفحة الأولى فقط');
            console.log('   node ramadan-extractor.js         # نفس full');
            process.exit(1);
        }
        
        // حفظ النتائج النهائية
        await extractor.saveFiles();
        
        console.log('\n✅ تم الانتهاء بنجاح!');
        
    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        
        // محاولة حفظ ما تم استخراجه حتى الآن
        console.log('\n💾 محاولة حفظ البيانات الحالية...');
        await extractor.saveFiles().catch(e => {
            console.log('❌ فشل حفظ البيانات');
        });
        
        process.exit(1);
    }
}

// تشغيل البرنامج
main();
