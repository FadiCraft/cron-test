// laroza_arabic.js - مستخرج أفلام عربية (جميع الصفحات)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    BASE_URL: 'https://laroza.lol', // تم التحديث
    CATEGORY: 'arabic-movies33',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: 'Larozaa/ArabicMovies',
    MAX_PAGES: 50,
    REQUEST_DELAY: 2000,
    HOME_EPISODES_COUNT: 30 // عدد الأفلام في الصفحة الرئيسية
};

class Extractor {
    constructor() {
        this.movies = []; // تغيير من episodes إلى movies
        this.homeMovies = []; // تغيير من homeEpisodes إلى homeMovies
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

    // استخراج ID الفيلم من الرابط
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

    async extractImageFromPage(movieLink) { // تغيير من episodeLink إلى movieLink
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
            
            const pageMovies = []; // تغيير من pageEpisodes إلى pageMovies
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
                                   `فيلم ${index + 1}`; // تغيير من "حلقة" إلى "فيلم"
                        
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
                        
                        pageMovies.push({
                            id: videoId || `unknown-${Date.now()}-${index}`,
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
            
            console.log(`✅ تم استخراج ${pageMovies.length} فيلم من الصفحة ${pageNum}`); // تغيير من "حلقة" إلى "فيلم"
            return pageMovies;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }

    async extractServers(movie, movieIndex, totalInPage) { // تغيير من episode إلى movie
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

    async extractFullImage(movie, movieIndex, totalInPage) { // تغيير من episode إلى movie
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
        console.log(`📑 معالجة الصفحة ${pageNum}${isHomePage ? ' (أول 30 فيلم للصفحة الرئيسية)' : ''}`); // تغيير من "حلقة" إلى "فيلم"
        console.log('='.repeat(60));
        
        const pageMovies = await this.extractPage(pageNum, limit); // تغيير من pageEpisodes إلى pageMovies
        
        if (pageMovies.length === 0) {
            console.log(`⚠️ لا توجد أفلام في الصفحة ${pageNum}`); // تغيير من "حلقات" إلى "أفلام"
            return [];
        }
        
        console.log(`\n🔄 استخراج السيرفرات والصور (${pageMovies.length} فيلم)...\n`); // تغيير من "حلقة" إلى "فيلم"
        
        for (let i = 0; i < pageMovies.length; i++) {
            await this.extractServers(pageMovies[i], i, pageMovies.length);
            await this.extractFullImage(pageMovies[i], i, pageMovies.length);
            
            if (i < pageMovies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        const serversInPage = pageMovies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithServers = pageMovies.filter(movie => movie.servers?.length > 0).length; // تغيير من episodesWithServers إلى moviesWithServers
        const moviesWithImages = pageMovies.filter(movie => movie.full_image).length; // تغيير من episodesWithImages إلى moviesWithImages
        
        console.log('\n' + '─'.repeat(40));
        console.log(`📊 إحصائيات الصفحة ${pageNum}:`);
        console.log(`   🎬 ${pageMovies.length} فيلم`); // تغيير من "حلقة" إلى "فيلم"
        console.log(`   📺 ${serversInPage} سيرفر`);
        console.log(`   ✨ ${moviesWithServers} فيلم يحتوي على سيرفرات`); // تغيير من "حلقة" إلى "فيلم"
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور كاملة`); // تغيير من "حلقة" إلى "فيلم"
        console.log('─'.repeat(40));
        
        return pageMovies;
    }

    // حفظ أول 30 فيلم في Home.json
    async saveHomeMovies() { // تغيير من saveHomeEpisodes إلى saveHomeMovies
        console.log('\n🏠 حفظ أول 30 فيلم للصفحة الرئيسية...'); // تغيير من "حلقات" إلى "أفلام"
        
        try {
            // استخراج أول 30 فيلم من الصفحة الأولى فقط
            const homeMovies = await this.processPage(1, CONFIG.HOME_EPISODES_COUNT, true);
            
            if (homeMovies.length > 0) {
                const filePath = path.join(CONFIG.DATA_DIR, 'Home.json');
                
                // تنظيف البيانات للحفظ
                const cleanMovies = homeMovies.map(movie => ({ // تغيير من ep إلى movie
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
                    movies_count: cleanMovies.length, // تغيير من episodes_count إلى movies_count
                    updated_at: new Date().toISOString(),
                    movies: cleanMovies // تغيير من episodes إلى movies
                };
                
                await fs.writeFile(filePath, JSON.stringify(data, null, 2));
                console.log(`✅ تم حفظ ${cleanMovies.length} فيلم في Home.json`); // تغيير من "حلقة" إلى "فيلم"
                
                return cleanMovies;
            } else {
                console.log('⚠️ لا توجد أفلام لحفظها في Home.json'); // تغيير من "حلقات" إلى "أفلام"
                return [];
            }
        } catch (error) {
            console.log(`❌ خطأ في حفظ Home.json: ${error.message}`);
            return [];
        }
    }

    async extractAll() {
        console.log('='.repeat(60));
        console.log('🎬 مستخرج أفلام عربية من لاروزا'); // تغيير العنوان
        console.log('='.repeat(60));
        
        // أولاً: حفظ أول 30 فيلم في Home.json
        this.homeMovies = await this.saveHomeMovies(); // تغيير من homeEpisodes إلى homeMovies
        
        // ثانياً: استخراج باقي الصفحات كالمعتاد
        const totalPages = await this.getTotalPages();
        
        for (let page = 1; page <= totalPages; page++) {
            // للصفحة الأولى، نستخرج الباقي (بعد الـ 30 الأولى)
            if (page === 1) {
                // نستكمل استخراج باقي أفلام الصفحة الأولى (بعد الـ 30)
                console.log(`\n📑 استكمال استخراج باقي أفلام الصفحة 1...`); // تغيير من "حلقات" إلى "أفلام"
                const remainingMovies = await this.processPage(1); // تغيير من remainingEpisodes إلى remainingMovies
                
                // نأخذ الأفلام بعد الـ 30 الأولى
                if (remainingMovies.length > CONFIG.HOME_EPISODES_COUNT) {
                    const afterHomeMovies = remainingMovies.slice(CONFIG.HOME_EPISODES_COUNT);
                    this.movies.push(...afterHomeMovies); // تغيير من episodes إلى movies
                }
            } else {
                // باقي الصفحات كالمعتاد
                const pageMovies = await this.processPage(page); // تغيير من pageEpisodes إلى pageMovies
                this.movies.push(...pageMovies); // تغيير من episodes إلى movies
            }
            
            if (page < totalPages) {
                console.log(`\n⏳ انتظار ${CONFIG.REQUEST_DELAY / 1000} ثواني قبل الصفحة التالية...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
        }
        
        // إحصائيات
        const totalServers = this.movies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithServers = this.movies.filter(movie => movie.servers?.length > 0).length;
        const moviesWithImages = this.movies.filter(movie => movie.full_image).length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 إحصائيات عامة:');
        console.log(`   🏠 ${this.homeMovies.length} فيلم في Home.json`); // تغيير من homeEpisodes إلى homeMovies
        console.log(`   📑 ${totalPages} صفحة`);
        console.log(`   🎬 ${this.movies.length} إجمالي الأفلام (باقي الصفحات)`); // تغيير من episodes إلى movies
        console.log(`   📺 ${moviesWithServers} فيلم يحتوي على سيرفرات`);
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور كاملة`);
        console.log(`   🔗 ${totalServers} إجمالي السيرفرات`);
        console.log('='.repeat(60));
    }

    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // ملاحظة: Home.json تم حفظه مسبقاً في saveHomeMovies()
        
        // حفظ باقي الأفلام في ملفات page1.json, page2.json
        const sortedMovies = [...this.movies].sort((a, b) => (a.page || 0) - (b.page || 0)); // تغيير من sortedEpisodes إلى sortedMovies
        
        const chunks = [];
        for (let i = 0; i < sortedMovies.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedMovies.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const cleanMovies = chunks[i].map(movie => ({ // تغيير من ep إلى movie
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
                total_movies: sortedMovies.length, // تغيير من total_episodes إلى total_movies
                movies_in_page: chunks[i].length, // تغيير من episodes_in_page إلى movies_in_page
                updated_at: new Date().toISOString(),
                movies: cleanMovies // تغيير من episodes إلى movies
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} فيلم`); // تغيير من "حلقة" إلى "فيلم"
        }
        
        const totalServers = sortedMovies.reduce((sum, movie) => sum + (movie.servers?.length || 0), 0);
        const moviesWithImages = sortedMovies.filter(movie => movie.full_image).length;
        
        const indexData = {
            last_update: new Date().toISOString(),
            total_movies: sortedMovies.length, // تغيير من total_episodes إلى total_movies
            total_pages: chunks.length,
            movies_per_file: CONFIG.EPISODES_PER_FILE, // تغيير من episodes_per_file إلى movies_per_file
            files: [
                'Home.json',
                ...chunks.map((_, i) => `page${i + 1}.json`)
            ],
            stats: {
                home_movies: this.homeMovies.length, // تغيير من home_episodes إلى home_movies
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
        console.log(`📄 Home.json - أول ${this.homeMovies.length} فيلم للصفحة الرئيسية`); // تغيير من "حلقة" إلى "فيلم"
        
        const withServers = sortedMovies.filter(movie => movie.servers?.length > 0).length;
        
        console.log('\n📊 الإحصائيات النهائية:');
        console.log(`   🏠 ${this.homeMovies.length} فيلم (Home.json)`); // تغيير من "حلقة" إلى "فيلم"
        console.log(`   📁 ${chunks.length} ملف (pageX.json)`);
        console.log(`   🎬 ${sortedMovies.length} فيلم (باقي الصفحات)`); // تغيير من "حلقة" إلى "فيلم"
        console.log(`   📺 ${withServers} فيلم يحتوي على سيرفرات`);
        console.log(`   🖼️ ${moviesWithImages} فيلم يحتوي على صور`);
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
