// laroza_arabic.js - مستخرج أفلام عربية (جميع الصفحات)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
    BASE_URL: 'https://laroza.lol',
    CATEGORY: 'arabic-movies33',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: path.join(__dirname, 'Larozaa', 'ArabicMovies'), // مسار مطلق
    MAX_PAGES: 50,
    REQUEST_DELAY: 2000,
    HOME_EPISODES_COUNT: 30
};

class Extractor {
    constructor() {
        this.movies = [];
        this.homeMovies = [];
    }

    // دالة جديدة للتأكد من وجود المجلد
    async ensureDirectoryExists() {
        try {
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
            console.log(`📁 تم التأكد من وجود المجلد: ${CONFIG.DATA_DIR}`);
        } catch (error) {
            console.log(`⚠️ خطأ في إنشاء المجلد: ${error.message}`);
            // محاولة إنشاء المجلد بطريقة أخرى
            const parentDir = path.dirname(CONFIG.DATA_DIR);
            await fs.mkdir(parentDir, { recursive: true });
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        }
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

    extractVideoId(link) {
        const vidMatch = link.match(/[?&]vid=([a-f0-9]+)/i) || 
                        link.match(/\/video\.php\?vid=([a-f0-9]+)/i) ||
                        link.match(/[?&]id=([a-f0-9]+)/i);
        
        if (vidMatch && vidMatch[1]) {
            return vidMatch[1];
        }
        
        // إنشاء ID فريد إذا لم نجد
        return `movie_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    async extractImageFromPage(movieLink) {
        try {
            const pageUrl = movieLink.includes('video.php') ? movieLink : movieLink;
            
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
            
            const pageMovies = [];
            let count = 0;
            
            $('li.col-xs-6, li.col-sm-4, li.col-md-3, .post, .item, article').each((index, element) => {
                if (limit && count >= limit) {
                    return false;
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
                                   `فيلم ${index + 1}`;
                        
                        let image = $el.find('img').attr('src') || 
                                   $el.find('img').attr('data-src') || 
                                   $el.find('img').attr('data-original') || 
                                   '';
                        
                        if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                            image = '';
                        }
                        
                        let duration = $el.find('.duration, .pm-label-duration, .time').first().text().trim() || '00:00';
                        
                        const videoId = this.extractVideoId(link);
                        
                        pageMovies.push({
                            id: videoId,
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
            
            console.log(`✅ تم استخراج ${pageMovies.length} فيلم من الصفحة ${pageNum}`);
            return pageMovies;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }

    async extractServers(movie, movieIndex, totalInPage) {
        try {
            if (!movie.link || movie.link === '#') {
                movie.servers = [];
                return;
            }
            
            const playUrl = movie.link.replace('video.php', 'play.php');
            console.log(`   🔗 [${movieIndex + 1}/${totalInPage}] ${movie.title.substring(0, 30)}...`);
            
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
            
            movie.servers = servers;
            
            if (servers.length > 0) {
                console.log(`      📺 ${servers.length} سيرفر`);
            } else {
                console.log(`      ⚠️ لا يوجد سيرفرات`);
            }
            
        } catch (e) {
            console.log(`      ⚠️ فشل استخراج السيرفرات`);
            movie.servers = [];
        }
    }

    async extractFullImage(movie, movieIndex, totalInPage) {
        try {
            if (!movie.link || movie.link === '#') {
                return;
            }
            
            console.log(`      🖼️ جاري استخراج الصورة الكاملة...`);
            
            const fullImage = await this.extractImageFromPage(movie.link);
            
            if (fullImage) {
                movie.full_image = fullImage;
                if (!movie.image) {
                    movie.image = fullImage;
                }
                movie.image_extracted = true;
                console.log(`      ✅ تم استخراج الصورة الكاملة`);
            } else {
                movie.full_image = '';
                movie.image_extracted = false;
                console.log(`      ⚠️ لا توجد صورة كاملة`);
            }
            
        } catch (e) {
            console.log(`      ⚠️ فشل استخراج الصورة`);
            movie.full_image = '';
            movie.image_extracted = false;
        }
    }

    async processPage(pageNum, limit = null, isHomePage = false) {
        console.log('\n' + '='.repeat(60));
        console.log(`📑 معالجة الصفحة ${pageNum}${isHomePage ? ' (أول 30 فيلم للصفحة الرئيسية)' : ''}`);
        console.log('='.repeat(60));
        
        const pageMovies = await this.extractPage(pageNum, limit);
        
        if (pageMovies.length === 0) {
            console.log(`⚠️ لا توجد أفلام في الصفحة ${pageNum}`);
            return [];
        }
        
        console.log(`\n🔄 استخراج السيرفرات والصور (${pageMovies.length} فيلم)...\n`);
        
        for (let i = 0; i < pageMovies.length; i++) {
            await this.extractServers(pageMovies[i], i, pageMovies.length);
            await this.extractFullImage(pageMovies[i], i, pageMovies.length);
            
            if (i < pageMovies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        const serversInPage = pageMovies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithServers = pageMovies.filter(movie => movie.servers?.length > 0).length;
        const moviesWithImages = pageMovies.filter(movie => movie.full_image).length;
        
        console.log('\n' + '─'.repeat(40));
        console.log(`📊 إحصائيات الصفحة ${pageNum}:`);
        console.log(`   🎬 ${pageMovies.length} فيلم`);
        console.log(`   📺 ${serversInPage} سيرفر`);
        console.log(`   ✨ ${moviesWithServers} فيلم يحتوي على سيرفرات`);
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور كاملة`);
        console.log('─'.repeat(40));
        
        return pageMovies;
    }

    async saveHomeMovies() {
        console.log('\n🏠 حفظ أول 30 فيلم للصفحة الرئيسية...');
        
        try {
            // التأكد من وجود المجلد أولاً
            await this.ensureDirectoryExists();
            
            const homeMovies = await this.processPage(1, CONFIG.HOME_EPISODES_COUNT, true);
            
            if (homeMovies.length > 0) {
                const filePath = path.join(CONFIG.DATA_DIR, 'Home.json');
                
                const cleanMovies = homeMovies.map(movie => ({
                    id: movie.id,
                    title: movie.title,
                    link: movie.link,
                    image: movie.full_image || movie.image,
                    duration: movie.duration,
                    servers: movie.servers || [],
                    extracted_at: movie.extracted_at
                }));
                
                const data = {
                    type: 'home_page',
                    movies_count: cleanMovies.length,
                    updated_at: new Date().toISOString(),
                    movies: cleanMovies
                };
                
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                console.log(`✅ تم حفظ ${cleanMovies.length} فيلم في Home.json`);
                console.log(`📁 المسار: ${filePath}`);
                
                return cleanMovies;
            } else {
                console.log('⚠️ لا توجد أفلام لحفظها في Home.json');
                return [];
            }
        } catch (error) {
            console.log(`❌ خطأ في حفظ Home.json: ${error.message}`);
            return [];
        }
    }

    async extractAll() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج أفلام عربية من لاروزا');
        console.log('='.repeat(60));
        
        // التأكد من وجود المجلد قبل البدء
        await this.ensureDirectoryExists();
        
        // أولاً: حفظ أول 30 فيلم في Home.json
        this.homeMovies = await this.saveHomeMovies();
        
        // ثانياً: استخراج باقي الصفحات كالمعتاد
        const totalPages = await this.getTotalPages();
        
        for (let page = 1; page <= totalPages; page++) {
            if (page === 1) {
                console.log(`\n📑 استكمال استخراج باقي أفلام الصفحة 1...`);
                const remainingMovies = await this.processPage(1);
                
                if (remainingMovies.length > CONFIG.HOME_EPISODES_COUNT) {
                    const afterHomeMovies = remainingMovies.slice(CONFIG.HOME_EPISODES_COUNT);
                    this.movies.push(...afterHomeMovies);
                }
            } else {
                const pageMovies = await this.processPage(page);
                this.movies.push(...pageMovies);
            }
            
            if (page < totalPages) {
                console.log(`\n⏳ انتظار ${CONFIG.REQUEST_DELAY / 1000} ثواني قبل الصفحة التالية...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
        }
        
        const totalServers = this.movies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithServers = this.movies.filter(movie => movie.servers?.length > 0).length;
        const moviesWithImages = this.movies.filter(movie => movie.full_image).length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 إحصائيات عامة:');
        console.log(`   🏠 ${this.homeMovies.length} فيلم في Home.json`);
        console.log(`   📑 ${totalPages} صفحة`);
        console.log(`   🎬 ${this.movies.length} إجمالي الأفلام (باقي الصفحات)`);
        console.log(`   📺 ${moviesWithServers} فيلم يحتوي على سيرفرات`);
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور كاملة`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log('='.repeat(60));
    }

    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        // التأكد من وجود المجلد مرة أخرى
        await this.ensureDirectoryExists();
        
        const sortedMovies = [...this.movies].sort((a, b) => (a.page || 0) - (b.page || 0));
        
        const chunks = [];
        for (let i = 0; i < sortedMovies.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedMovies.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const cleanMovies = chunks[i].map(movie => ({
                id: movie.id,
                page: movie.page,
                title: movie.title,
                link: movie.link,
                image: movie.full_image || movie.image,
                duration: movie.duration,
                servers: movie.servers || [],
                extracted_at: movie.extracted_at
            }));
            
            const data = {
                page: pageNum,
                total_pages: chunks.length,
                total_movies: sortedMovies.length,
                movies_in_page: chunks[i].length,
                updated_at: new Date().toISOString(),
                movies: cleanMovies
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} فيلم`);
        }
        
        const totalServers = sortedMovies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithImages = sortedMovies.filter(movie => movie.full_image).length;
        
        const indexData = {
            last_update: new Date().toISOString(),
            total_movies: sortedMovies.length,
            total_pages: chunks.length,
            movies_per_file: CONFIG.EPISODES_PER_FILE,
            files: [
                'Home.json',
                ...chunks.map((_, i) => `page${i + 1}.json`)
            ],
            stats: {
                home_movies: this.homeMovies.length,
                movies_with_servers: sortedMovies.filter(movie => movie.servers?.length > 0).length,
                movies_with_images: moviesWithImages,
                total_servers: totalServers
            }
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        console.log(`📄 Home.json - أول ${this.homeMovies.length} فيلم للصفحة الرئيسية`);
        
        const withServers = sortedMovies.filter(movie => movie.servers?.length > 0).length;
        
        console.log('\n📊 الإحصائيات النهائية:');
        console.log(`   🏠 ${this.homeMovies.length} فيلم (Home.json)`);
        console.log(`   📁 ${chunks.length} ملف (pageX.json)`);
        console.log(`   🎬 ${sortedMovies.length} فيلم (باقي الصفحات)`);
        console.log(`   📺 ${withServers} فيلم يحتوي على سيرفرات`);
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log(`   📁 المسار: ${CONFIG.DATA_DIR}`);
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
