// extractor.js - مستخرج حلقات رمضان 2026 (جميع الصفحات)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    BASE_URL: 'https://laroza.lol', // تم التحديث
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
    MAX_PAGES: 50,
    REQUEST_DELAY: 2000,
    HOME_EPISODES_COUNT: 30 // عدد حلقات الصفحة الرئيسية
};

class Extractor {
    constructor() {
        this.episodes = [];
        this.homeEpisodes = []; // لأول 10 حلقات
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

    // استخراج ID الحلقة من الرابط
    extractVideoId(link) {
        // محاولة استخراج vid من الرابط
        const vidMatch = link.match(/[?&]vid=([a-f0-9]+)/i) || 
                        link.match(/\/video\.php\?vid=([a-f0-9]+)/i) ||
                        link.match(/[?&]id=([a-f0-9]+)/i);
        
        if (vidMatch && vidMatch[1]) {
            return vidMatch[1]; // مثلاً: a77bbfad0
        }
        
        // إذا لم نجد، نستخدم طريقة قديمة
        return null;
    }

    async getTotalPages() {
        console.log('\n🔍 جاري تحديد عدد الصفحات...');
        
        try {
            const firstPageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=1&order=DESC`;
            const html = await this.fetch(firstPageUrl);
            const $ = cheerio.load(html);
            
            let totalPages = 1;
            
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
            console.log('⚠️ لم نتمكن من تحديد عدد الصفحات، سنستخرج الصفحة الأولى فقط');
            return 1;
        }
    }

    async extractImageFromPage(episodeLink) {
        try {
            const pageUrl = episodeLink.includes('video.php') ? episodeLink : episodeLink;
            
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            let image = $('meta[property="og:image"]').attr('content') || 
                       $('meta[name="twitter:image"]').attr('content') ||
                       $('link[rel="image_src"]').attr('href') ||
                       '';
            
            if (image) {
                return this.fixImage(image);
            }
            
            return '';
        } catch (e) {
            return '';
        }
    }

    async extractPage(pageNum, limit = null) {
        const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNum}&order=DESC`;
        console.log(`\n📄 استخراج الصفحة ${pageNum}...`);
        
        try {
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            const pageEpisodes = [];
            let count = 0;
            
            $('li.col-xs-6, li.col-sm-4, li.col-md-3, .post, .item, article').each((index, element) => {
                // إذا كان هناك حد معين ووصلنا له، نتوقف
                if (limit && count >= limit) {
                    return false; // يوقف الـ each
                }
                
                try {
                    const $el = $(element);
                    
                    let link = $el.find('a[href*="video.php"]').attr('href') || 
                              $el.find('a').first().attr('href') || 
                              '#';
                    
                    if (link && link !== '#' && !link.includes('javascript')) {
                        if (!link.startsWith('http')) {
                            link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                        }
                        
                        let title = $el.find('.ellipsis').text().trim() || 
                                   $el.find('h2, h3, .title').first().text().trim() ||
                                   $el.find('img').attr('alt') ||
                                   `حلقة ${index + 1}`;
                        
                        let image = $el.find('img').attr('src') || 
                                   $el.find('img').attr('data-src') || 
                                   $el.find('img').attr('data-original') || 
                                   '';
                        
                        if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                            image = '';
                        }
                        
                        let duration = $el.find('.duration, .pm-label-duration, .time').first().text().trim() || '00:00';
                        
                        // استخراج ID الفيديو من الرابط
                        const videoId = this.extractVideoId(link);
                        
                        pageEpisodes.push({
                            id: videoId || `unknown-${Date.now()}-${index}`, // استخدام ID حقيقي أو مؤقت
                            page: pageNum,
                            title: this.cleanTitle(title),
                            link: link,
                            image: this.fixImage(image),
                            full_image: '',
                            duration: duration,
                            servers: [],
                            extracted_at: new Date().toISOString(),
                            image_extracted: false
                        });
                        
                        count++;
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

    async extractFullImage(episode, episodeIndex, totalInPage) {
        try {
            if (!episode.link || episode.link === '#') {
                return;
            }
            
            console.log(`      🖼️ جاري استخراج الصورة الكاملة...`);
            
            const fullImage = await this.extractImageFromPage(episode.link);
            
            if (fullImage) {
                episode.full_image = fullImage;
                if (!episode.image) {
                    episode.image = fullImage;
                }
                episode.image_extracted = true;
                console.log(`      ✅ تم استخراج الصورة الكاملة`);
            } else {
                episode.full_image = '';
                episode.image_extracted = false;
                console.log(`      ⚠️ لا توجد صورة كاملة`);
            }
            
        } catch (e) {
            console.log(`      ⚠️ فشل استخراج الصورة`);
            episode.full_image = '';
            episode.image_extracted = false;
        }
    }

    async processPage(pageNum, limit = null, isHomePage = false) {
        console.log('\n' + '='.repeat(60));
        console.log(`📑 معالجة الصفحة ${pageNum}${isHomePage ? ' (أول 10 حلقات للصفحة الرئيسية)' : ''}`);
        console.log('='.repeat(60));
        
        const pageEpisodes = await this.extractPage(pageNum, limit);
        
        if (pageEpisodes.length === 0) {
            console.log(`⚠️ لا توجد حلقات في الصفحة ${pageNum}`);
            return [];
        }
        
        console.log(`\n🔄 استخراج السيرفرات والصور (${pageEpisodes.length} حلقة)...\n`);
        
        for (let i = 0; i < pageEpisodes.length; i++) {
            await this.extractServers(pageEpisodes[i], i, pageEpisodes.length);
            await this.extractFullImage(pageEpisodes[i], i, pageEpisodes.length);
            
            if (i < pageEpisodes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        const serversInPage = pageEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithServers = pageEpisodes.filter(ep => ep.servers?.length > 0).length;
        const episodesWithImages = pageEpisodes.filter(ep => ep.full_image).length;
        
        console.log('\n' + '─'.repeat(40));
        console.log(`📊 إحصائيات الصفحة ${pageNum}:`);
        console.log(`   🎬 ${pageEpisodes.length} حلقة`);
        console.log(`   📺 ${serversInPage} سيرفر`);
        console.log(`   ✨ ${episodesWithServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🖼️ ${episodesWithImages} حلقة تحتوي على صور كاملة`);
        console.log('─'.repeat(40));
        
        return pageEpisodes;
    }

    // دالة جديدة: حفظ أول 10 حلقات في Home.json
    async saveHomeEpisodes() {
        console.log('\n🏠 حفظ أول 10 حلقات للصفحة الرئيسية...');
        
        try {
            // استخراج أول 10 حلقات من الصفحة الأولى فقط
            const homeEpisodes = await this.processPage(1, CONFIG.HOME_EPISODES_COUNT, true);
            
            if (homeEpisodes.length > 0) {
                const filePath = path.join(CONFIG.DATA_DIR, 'Home.json');
                
                // تنظيف البيانات للحفظ
                const cleanEpisodes = homeEpisodes.map(ep => ({
                    id: ep.id,
                    title: ep.title,
                    link: ep.link,
                    image: ep.full_image || ep.image,
                    duration: ep.duration,
                    servers: ep.servers || [],
                    extracted_at: ep.extracted_at
                }));
                
                const data = {
                    type: 'home_page',
                    episodes_count: cleanEpisodes.length,
                    updated_at: new Date().toISOString(),
                    episodes: cleanEpisodes
                };
                
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                console.log(`✅ تم حفظ ${cleanEpisodes.length} حلقة في Home.json`);
                
                return cleanEpisodes;
            } else {
                console.log('⚠️ لا توجد حلقات لحفظها في Home.json');
                return [];
            }
        } catch (error) {
            console.log(`❌ خطأ في حفظ Home.json: ${error.message}`);
            return [];
        }
    }

    async extractAll() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج حلقات رمضان 2026 من لاروزا');
        console.log('='.repeat(60));
        
        // أولاً: حفظ أول 10 حلقات في Home.json (يتم تجديده في كل تشغيل)
        this.homeEpisodes = await this.saveHomeEpisodes();
        
        // ثانياً: استخراج باقي الصفحات كالمعتاد
        const totalPages = await this.getTotalPages();
        
        for (let page = 1; page <= totalPages; page++) {
            // للصفحة الأولى، نستخرج الباقي (بعد الـ 10 الأولى)
            if (page === 1) {
                // نستكمل استخراج باقي حلقات الصفحة الأولى (بعد الـ 10)
                console.log(`\n📑 استكمال استخراج باقي حلقات الصفحة 1...`);
                const remainingEpisodes = await this.processPage(1);
                
                // نأخذ الحلقات بعد الـ 10 الأولى
                if (remainingEpisodes.length > CONFIG.HOME_EPISODES_COUNT) {
                    const afterHomeEpisodes = remainingEpisodes.slice(CONFIG.HOME_EPISODES_COUNT);
                    this.episodes.push(...afterHomeEpisodes);
                }
            } else {
                // باقي الصفحات كالمعتاد
                const pageEpisodes = await this.processPage(page);
                this.episodes.push(...pageEpisodes);
            }
            
            if (page < totalPages) {
                console.log(`\n⏳ انتظار ${CONFIG.REQUEST_DELAY / 1000} ثواني قبل الصفحة التالية...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
        }
        
        // إحصائيات
        const totalServers = this.episodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithServers = this.episodes.filter(ep => ep.servers?.length > 0).length;
        const episodesWithImages = this.episodes.filter(ep => ep.full_image).length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 إحصائيات عامة:');
        console.log(`   🏠 ${this.homeEpisodes.length} حلقة في Home.json`);
        console.log(`   📑 ${totalPages} صفحة`);
        console.log(`   🎬 ${this.episodes.length} إجمالي الحلقات (باقي الصفحات)`);
        console.log(`   📺 ${episodesWithServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🖼️ ${episodesWithImages} حلقة تحتوي على صور كاملة`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log('='.repeat(60));
    }

    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // ملاحظة: Home.json تم حفظه مسبقاً في saveHomeEpisodes()
        
        // حفظ باقي الحلقات في ملفات page1.json, page2.json
        const sortedEpisodes = [...this.episodes].sort((a, b) => (a.page || 0) - (b.page || 0));
        
        const chunks = [];
        for (let i = 0; i < sortedEpisodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedEpisodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const cleanEpisodes = chunks[i].map(ep => ({
                id: ep.id,
                page: ep.page,
                title: ep.title,
                link: ep.link,
                image: ep.full_image || ep.image,
                duration: ep.duration,
                servers: ep.servers || [],
                extracted_at: ep.extracted_at
            }));
            
            const data = {
                page: pageNum,
                total_pages: chunks.length,
                total_episodes: sortedEpisodes.length,
                episodes_in_page: chunks[i].length,
                updated_at: new Date().toISOString(),
                episodes: cleanEpisodes
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        const totalServers = sortedEpisodes.reduce((sum, ep) => sum + (ep.servers?.length || 0), 0);
        const episodesWithImages = sortedEpisodes.filter(ep => ep.full_image).length;
        
        const indexData = {
            last_update: new Date().toISOString(),
            total_episodes: sortedEpisodes.length,
            total_pages: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: [
                'Home.json', // نضيف Home.json للفهرس
                ...chunks.map((_, i) => `page${i + 1}.json`)
            ],
            stats: {
                home_episodes: this.homeEpisodes.length,
                episodes_with_servers: sortedEpisodes.filter(ep => ep.servers?.length > 0).length,
                episodes_with_images: episodesWithImages,
                total_servers: totalServers
            }
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        console.log(`📄 Home.json - أول ${this.homeEpisodes.length} حلقة للصفحة الرئيسية`);
        
        const withServers = sortedEpisodes.filter(ep => ep.servers?.length > 0).length;
        
        console.log('\n📊 الإحصائيات النهائية:');
        console.log(`   🏠 ${this.homeEpisodes.length} حلقة (Home.json)`);
        console.log(`   📁 ${chunks.length} ملف (pageX.json)`);
        console.log(`   🎬 ${sortedEpisodes.length} حلقة (باقي الصفحات)`);
        console.log(`   📺 ${withServers} حلقة تحتوي على سيرفرات`);
        console.log(`   🖼️ ${episodesWithImages} حلقة تحتوي على صور`);
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
