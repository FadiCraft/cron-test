const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.episodesPerRun = 30;
        this.outputDir = 'Ramadan';
        this.existingEpisodes = new Set();
        this.baseUrl = 'https://larooza.life';
        this.maxPagesToSearch = 20;
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.loadExistingEpisodes();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
        ];
        
        this.proxies = [
            '',
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url='
        ];
        this.currentProxy = 0;
    }

    async fetchWithProxy(url) {
        const maxRetries = 3;
        
        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                const proxy = this.proxies[this.currentProxy];
                const targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                console.log(`🔄 جاري التحميل من: ${proxy ? 'بروكسي' : 'مباشر'} (المحاولة ${retry + 1})`);
                const html = await this.fetchUrl(targetUrl);
                
                if (html && html.length > 100) { // تأكد أن هناك محتوى
                    return html;
                }
                
            } catch (error) {
                console.log(`❌ محاولة ${retry + 1} فشلت:`, error.message);
                this.currentProxy = (this.currentProxy + 1) % this.proxies.length;
                await this.delay(2000 * (retry + 1)); // زيادة التأخير مع كل محاولة
            }
        }
        throw new Error('فشل تحميل الصفحة بعد عدة محاولات');
    }

    async start() {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`📁 المجلد: ${this.outputDir}/`);
        console.log(`🎯 الهدف: ${this.episodesPerRun} حلقة\n`);
        
        try {
            let allNewEpisodes = [];
            let currentPage = 1;
            
            // 1. أولاً: جلب الصفحة الرئيسية لتحليل الهيكل
            console.log('🔍 جاري تحليل هيكل الموقع...');
            const mainUrl = 'https://larooza.life/category.php?cat=ramadan-2026';
            const mainHtml = await this.fetchWithProxy(mainUrl);
            
            if (!mainHtml) {
                console.log('❌ فشل تحميل الصفحة الرئيسية');
                return;
            }
            
            // تحليل الهيكل للبحث عن أنماط الحلقات
            const structureInfo = this.analyzeStructure(mainHtml);
            console.log(`📊 معلومات الهيكل: ${structureInfo}`);
            
            // 2. البحث في الصفحات
            while (allNewEpisodes.length < this.episodesPerRun && currentPage <= this.maxPagesToSearch) {
                console.log(`\n📄 جاري البحث في الصفحة ${currentPage}...`);
                
                let pageUrl;
                if (currentPage === 1) {
                    pageUrl = mainUrl;
                } else {
                    pageUrl = `https://larooza.life/category.php?cat=ramadan-2026&page=${currentPage}`;
                }
                
                try {
                    const html = await this.fetchWithProxy(pageUrl);
                    
                    if (html) {
                        const pageEpisodes = await this.extractEpisodesFromPage(html, pageUrl);
                        
                        if (pageEpisodes.length > 0) {
                            console.log(`✅ الصفحة ${currentPage}: وجد ${pageEpisodes.length} حلقة`);
                            
                            // فلترة الحلقات الجديدة فقط
                            const newEpisodes = pageEpisodes.filter(ep => {
                                if (!ep || !ep.id) return false;
                                return !this.existingEpisodes.has(ep.id);
                            });
                            
                            if (newEpisodes.length > 0) {
                                console.log(`🎯 الصفحة ${currentPage}: ${newEpisodes.length} حلقة جديدة`);
                                allNewEpisodes = [...allNewEpisodes, ...newEpisodes];
                                
                                // تحديث existingEpisodes
                                newEpisodes.forEach(ep => {
                                    if (ep.id) {
                                        this.existingEpisodes.add(ep.id);
                                    }
                                });
                            } else {
                                console.log(`ℹ️ الصفحة ${currentPage}: كل الحلقات موجودة مسبقاً`);
                            }
                        } else {
                            console.log(`⚠️ الصفحة ${currentPage}: لم يتم العثور على حلقات`);
                            // محاولة طريقة استخراج بديلة
                            const altEpisodes = await this.extractEpisodesAlternative(html, pageUrl);
                            if (altEpisodes.length > 0) {
                                console.log(`🔄 طريقة بديلة: وجد ${altEpisodes.length} حلقة`);
                                allNewEpisodes = [...allNewEpisodes, ...altEpisodes];
                            }
                        }
                    }
                } catch (error) {
                    console.log(`❌ خطأ في الصفحة ${currentPage}:`, error.message);
                }
                
                currentPage++;
                
                // تأخير بين الصفحات
                await this.delay(1500);
            }
            
            console.log(`\n📊 انتهى البحث في ${currentPage - 1} صفحات`);
            console.log(`🔍 إجمالي الحلقات الجديدة: ${allNewEpisodes.length}`);
            
            // تحديد فقط 30 حلقة (أحدثها)
            const finalEpisodes = allNewEpisodes.slice(0, this.episodesPerRun);
            
            if (finalEpisodes.length > 0) {
                console.log('\n🔍 جاري استخراج التفاصيل الكاملة...');
                const detailedEpisodes = await this.extractDetailsForEpisodes(finalEpisodes);
                
                // حفظ النتائج
                await this.saveResults(detailedEpisodes);
            } else {
                console.log('\n⚠️ لم يتم العثور على أي حلقات جديدة');
                await this.saveResults([]);
            }
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
        }
    }

    analyzeStructure(html) {
        const root = parse(html);
        
        // محاولة العثور على الحلقات بطرق مختلفة
        const selectors = [
            'li.col-xs-6',
            'li.col-sm-4',
            'li.col-md-3',
            '.video-item',
            '.item',
            '.video-block',
            '.pm-video',
            '[data-video-id]',
            'a[href*="video.php"]'
        ];
        
        for (const selector of selectors) {
            const elements = root.querySelectorAll(selector);
            if (elements.length > 0) {
                return `العناصر: ${elements.length} باستخدام ${selector}`;
            }
        }
        
        return 'لم يتم التعرف على الهيكل';
    }

    async extractEpisodesFromPage(html, pageUrl) {
        const episodes = [];
        const root = parse(html);
        
        // محاولة 3 طرق مختلفة للعثور على الحلقات
        
        // الطريقة 1: البحث عن روابط الفيديو مباشرة
        const videoLinks = root.querySelectorAll('a[href*="video.php"]');
        console.log(`🔗 روابط الفيديو: ${videoLinks.length}`);
        
        for (const link of videoLinks) {
            try {
                const href = link.getAttribute('href');
                if (!href) continue;
                
                // استخراج ID من الرابط
                const idMatch = href.match(/vid=([a-zA-Z0-9]+)/);
                if (!idMatch) continue;
                
                const id = idMatch[1];
                
                // البحث عن الصورة في العنصر الأب
                let imageSrc = null;
                const parent = link.parentNode || link.closest('div, li');
                if (parent) {
                    const img = parent.querySelector('img');
                    if (img) {
                        imageSrc = img.getAttribute('src') || img.getAttribute('data-src');
                    }
                }
                
                // البحث عن العنوان
                let title = 'عنوان غير معروف';
                const titleElement = link.querySelector('.title, .ellipsis, h3, h4') || link;
                title = this.cleanTitle(titleElement.textContent || link.getAttribute('title') || '');
                
                episodes.push({
                    id: id,
                    title: title,
                    image: imageSrc ? this.fixImageUrl(imageSrc, pageUrl) : null,
                    short_link: this.fixImageUrl(href, pageUrl),
                    duration: '00:00',
                    description: '',
                    servers: [],
                    videoUrl: `${this.baseUrl}/embed.php?vid=${id}`
                });
                
            } catch (error) {
                continue;
            }
        }
        
        // إذا لم نجد حلقات، نجرب الطريقة البديلة
        if (episodes.length === 0) {
            return await this.extractEpisodesAlternative(html, pageUrl);
        }
        
        return episodes;
    }

    async extractEpisodesAlternative(html, pageUrl) {
        const episodes = [];
        const root = parse(html);
        
        // البحث عن جميع الصور مع روابط
        const imagesWithLinks = root.querySelectorAll('a img');
        
        for (const img of imagesWithLinks) {
            try {
                const parentLink = img.parentNode;
                if (!parentLink || parentLink.tagName !== 'A') continue;
                
                const href = parentLink.getAttribute('href');
                if (!href || !href.includes('video.php')) continue;
                
                // استخراج ID من الرابط
                const idMatch = href.match(/vid=([a-zA-Z0-9]+)/);
                if (!idMatch) continue;
                
                const id = idMatch[1];
                
                // البحث عن العنوان
                let title = 'عنوان غير معروف';
                const titleElement = parentLink.querySelector('.title, .ellipsis') || 
                                   parentLink.closest('div, li')?.querySelector('.title');
                
                if (titleElement) {
                    title = this.cleanTitle(titleElement.textContent || '');
                } else {
                    // استخراج العنوان من alt الصورة
                    title = this.cleanTitle(img.getAttribute('alt') || '');
                }
                
                episodes.push({
                    id: id,
                    title: title,
                    image: this.fixImageUrl(img.getAttribute('src') || img.getAttribute('data-src'), pageUrl),
                    short_link: this.fixImageUrl(href, pageUrl),
                    duration: '00:00',
                    description: '',
                    servers: [],
                    videoUrl: `${this.baseUrl}/embed.php?vid=${id}`
                });
                
            } catch (error) {
                continue;
            }
        }
        
        return episodes;
    }

    async extractDetailsForEpisodes(episodes) {
        const detailedEpisodes = [];
        
        for (let i = 0; i < episodes.length; i++) {
            try {
                const episode = episodes[i];
                console.log(`📝 تفاصيل (${i+1}/${episodes.length}): ${episode.title.substring(0, 40)}...`);
                
                // استخراج تفاصيل الحلقة
                try {
                    const details = await this.extractEpisodeDetails(episode.short_link);
                    if (details) {
                        episode.description = details.description || '';
                        if (details.image && !episode.image) {
                            episode.image = details.image;
                        }
                        if (details.title && details.title !== 'عنوان غير معروف') {
                            episode.title = details.title;
                        }
                    }
                } catch (error) {
                    console.log(`  ⚠️ فشل استخراج التفاصيل: ${error.message}`);
                }
                
                // استخراج السيرفرات
                try {
                    const servers = await this.extractEpisodeServers(episode.id);
                    if (servers && servers.length > 0) {
                        episode.servers = servers;
                    }
                } catch (error) {
                    console.log(`  ⚠️ فشل استخراج السيرفرات: ${error.message}`);
                }
                
                detailedEpisodes.push(episode);
                
                // تأخير بين الحلقات
                await this.delay(500);
                
            } catch (error) {
                console.log(`❌ خطأ في الحلقة ${i+1}:`, error.message);
                detailedEpisodes.push(episodes[i]);
            }
        }
        
        return detailedEpisodes;
    }

    async extractEpisodeDetails(episodeUrl) {
        try {
            const html = await this.fetchWithProxy(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            // استخراج العنوان من meta
            const titleMeta = root.querySelector('meta[name="title"], meta[property="og:title"]');
            if (titleMeta) {
                details.title = this.cleanTitle(titleMeta.getAttribute('content') || '');
            }
            
            // استخراج الوصف من meta
            const descMeta = root.querySelector('meta[name="description"], meta[property="og:description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content') || '';
                details.description = this.cleanText(desc).substring(0, 300) + '...';
            }
            
            // استخراج الصورة من meta
            const imageMeta = root.querySelector('meta[property="og:image"]');
            if (imageMeta) {
                details.image = imageMeta.getAttribute('content');
            }
            
            // إذا لم نجد في meta، نبحث في الصفحة
            if (!details.title || details.title === 'عنوان غير معروف') {
                const pageTitle = root.querySelector('h1.title');
                if (pageTitle) {
                    details.title = this.cleanTitle(pageTitle.textContent);
                }
            }
            
            return details;
            
        } catch (error) {
            console.log(`❌ فشل استخراج تفاصيل:`, error.message);
            return null;
        }
    }

    async extractEpisodeServers(videoId) {
        try {
            const playUrl = `${this.baseUrl}/play.php?vid=${videoId}`;
            const html = await this.fetchWithProxy(playUrl);
            const root = parse(html);
            
            const servers = [];
            
            // البحث عن السيرفرات بطرق مختلفة
            const serverSelectors = [
                '.WatchList li',
                '.server-list li',
                '.tab-content .tab-pane',
                'select[name="server"] option',
                '[data-embed-url]'
            ];
            
            for (const selector of serverSelectors) {
                const elements = root.querySelectorAll(selector);
                if (elements.length > 0) {
                    elements.forEach((element, index) => {
                        const embedUrl = element.getAttribute('data-embed-url') || 
                                       element.getAttribute('value') || 
                                       element.textContent.trim();
                        
                        if (embedUrl && embedUrl.includes('http')) {
                            servers.push({
                                id: (index + 1).toString(),
                                name: `سيرفر ${index + 1}`,
                                url: embedUrl
                            });
                        }
                    });
                    
                    if (servers.length > 0) break;
                }
            }
            
            // إذا لم نجد سيرفرات، نضيف سيرفرات افتراضية
            if (servers.length === 0) {
                const defaultServers = [
                    { name: 'فيديومولي', url: `https://vidmoly.net/embed-${videoId}.html` },
                    { name: 'دود', url: `https://dood.watch/e/${videoId}` },
                    { name: 'فوي', url: `https://voe.sx/e/${videoId}` }
                ];
                
                defaultServers.forEach((server, index) => {
                    servers.push({
                        id: (index + 1).toString(),
                        name: server.name,
                        url: server.url
                    });
                });
            }
            
            return servers;
            
        } catch (error) {
            console.log(`❌ فشل استخراج السيرفرات:`, error.message);
            
            return [
                {
                    id: '1',
                    name: 'سيرفر 1',
                    url: `${this.baseUrl}/embed.php?vid=${videoId}`
                }
            ];
        }
    }

    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': this.baseUrl,
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 20000
            };
            
            console.log(`🌐 جاري تحميل: ${url.substring(0, 60)}...`);
            
            const req = https.get(url, options, (res) => {
                console.log(`📡 الاستجابة: ${res.statusCode} ${res.statusMessage}`);
                
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // إذا كان هناك تحويل
                    console.log(`↪️ التحويل إلى: ${res.headers.location}`);
                    this.fetchUrl(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    console.log(`✅ تم تحميل ${data.length} بايت`);
                    resolve(data);
                });
            });
            
            req.on('error', (error) => {
                console.log(`❌ خطأ في الاتصال: ${error.message}`);
                reject(error);
            });
            
            req.on('timeout', () => {
                console.log('⏰ انتهى وقت الانتظار');
                req.destroy();
                reject(new Error('Timeout بعد 20 ثانية'));
            });
            
            req.end();
        });
    }

    cleanTitle(text) {
        if (!text) return 'عنوان غير معروف';
        return this.cleanText(text)
            .substring(0, 150)
            .replace(/\s+/g, ' ')
            .trim();
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\u0600-\u06FF\w\s\-.,!?():]/g, '')
            .trim();
    }

    fixImageUrl(url, baseUrl) {
        if (!url) return null;
        
        // إصلاح الروابط النسبية
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        if (url.startsWith('/')) {
            return this.baseUrl + url;
        }
        
        if (!url.startsWith('http')) {
            try {
                const base = new URL(baseUrl);
                return base.origin + '/' + url.replace(/^\//, '');
            } catch {
                return this.baseUrl + '/' + url.replace(/^\//, '');
            }
        }
        
        return url;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    loadExistingEpisodes() {
        try {
            const filePath = path.join(this.outputDir, 'latest_episodes.json');
            
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const episodes = JSON.parse(content);
                
                for (const episode of episodes) {
                    if (episode.id) {
                        this.existingEpisodes.add(episode.id);
                    }
                }
                
                console.log(`📚 تم تحميل ${this.existingEpisodes.size} حلقة سابقة من latest_episodes.json`);
            }
            
        } catch (error) {
            console.log('⚠️ لا توجد حلقات سابقة');
        }
    }

    async saveResults(episodes) {
        const fileName = 'latest_episodes.json';
        const filePath = path.join(this.outputDir, fileName);
        
        console.log(`\n💾 جاري حفظ النتائج في ${fileName}...`);
        
        if (episodes.length === 0) {
            fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
            console.log(`ℹ️ الملف أصبح فاضياً (0 حلقة)`);
        } else {
            fs.writeFileSync(filePath, JSON.stringify(episodes, null, 2), 'utf8');
            console.log(`✅ تم حفظ ${episodes.length} حلقة`);
        }
        
        // حفظ الملخص
        const summary = {
            metadata: {
                total_episodes: episodes.length,
                last_updated: new Date().toISOString(),
                episodes_per_run: this.episodesPerRun,
                site: 'larooza.life',
                run_timestamp: Date.now()
            },
            episodes_count: episodes.length
        };
        
        const summaryPath = path.join(this.outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        
        console.log(`\n📊 الإحصائيات:`);
        console.log(`   - الحلقات المحفوظة: ${episodes.length}`);
        console.log(`   - الحلقات المتجنبة: ${this.existingEpisodes.size}`);
        console.log(`   - الوقت: ${new Date().toLocaleString('ar-SA')}`);
    }
}

// تشغيل الملف
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    extractor.start()
        .then(() => {
            console.log('\n✨ تم الانتهاء!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشل:', error);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
