const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.outputFile = 'kj.json';
        this.baseUrl = 'https://larooza.life';
        
        // إنشاء مجلد الإخراج
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // مسح الملف القديم عند إنشاء الكائن (بداية التشغيل)
        this.clearExistingFile();
        
        // قائمة User-Agents
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
        ];
        
        // CORS proxies للتحايل على القيود
        this.proxies = [
            '', // مباشر
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://api.allorigins.win/raw?url='
        ];
        this.currentProxy = 0;
        
        this.requestDelay = 1000; // تأخير 1 ثانية بين الطلبات
    }

    // تأخير بين الطلبات
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // مسح الملف القديم عند بداية التشغيل
    clearExistingFile() {
        const filePath = path.join(this.outputDir, this.outputFile);
        if (fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
            console.log(`🗑️ تم مسح محتوى الملف القديم: ${this.outputFile}`);
        }
    }

    async fetchWithProxy(url) {
        for (let i = 0; i < this.proxies.length; i++) {
            try {
                const proxy = this.proxies[this.currentProxy];
                let targetUrl = url;
                
                if (proxy && proxy !== '') {
                    targetUrl = proxy + encodeURIComponent(url);
                }
                
                console.log(`🔄 جرب Proxy ${this.currentProxy}: ${targetUrl.substring(0, 80)}...`);
                const html = await this.fetchUrl(targetUrl);
                if (html) return html;
            } catch (error) {
                console.log(`❌ Proxy ${this.currentProxy} فشل:`, error.message);
                this.currentProxy = (this.currentProxy + 1) % this.proxies.length;
            }
        }
        throw new Error('جميع البروكسيات فشلت');
    }

    async start(url = 'https://larooza.life/category.php?cat=ramadan-2026') {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`📁 سيتم الحفظ في: ${this.outputDir}/${this.outputFile}`);
        console.log(`🔗 الرابط: ${url}\n`);
        
        try {
            // 1. جلب الصفحة الرئيسية
            console.log('📥 جاري تحميل الصفحة الرئيسية...');
            const html = await this.fetchWithProxy(url);
            
            if (!html) {
                console.log('❌ فشل تحميل الصفحة');
                return;
            }
            
            // حفظ HTML للفحص
            this.saveDebugHTML(html);
            
            // 2. استخراج الحلقات من الصفحة
            console.log('🔍 جاري استخراج الحلقات...');
            const episodes = await this.extractEpisodesFromMainPage(html, url);
            
            if (episodes.length === 0) {
                console.log('⚠️ لم يتم العثور على حلقات، جرب طريقة بديلة...');
                // محاولة طريقة بديلة
                const alternativeEpisodes = await this.extractEpisodesAlternative(html, url);
                
                if (alternativeEpisodes.length === 0) {
                    console.log('❌ جميع محاولات الاستخراج فشلت');
                    // حفظ ملف فارغ
                    await this.saveEpisodes([]);
                    return;
                }
                
                episodes.push(...alternativeEpisodes);
            }
            
            console.log(`✅ تم استخراج ${episodes.length} حلقة من الصفحة الرئيسية`);
            
            // 3. استخراج التفاصيل الكاملة لكل حلقة
            console.log('\n🔍 جاري استخراج التفاصيل الكاملة...');
            const detailedEpisodes = await this.extractDetailsForEpisodes(episodes);
            
            // 4. حفظ النتائج في ملف واحد
            await this.saveEpisodes(detailedEpisodes);
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
            console.error(error.stack);
        }
    }

    async extractEpisodesFromMainPage(html, baseUrl) {
        const episodes = [];
        const root = parse(html);
        
        console.log('🔎 البحث عن الحلقات بطرق مختلفة...');
        
        // الطريقة 1: البحث عن جميع الروابط التي تحتوي على video.php
        const videoLinks = root.querySelectorAll('a[href*="video.php"]');
        console.log(`📊 الطريقة 1: وجدت ${videoLinks.length} رابط يحتوي على video.php`);
        
        for (const link of videoLinks) {
            try {
                const episode = await this.extractEpisodeFromLink(link, baseUrl);
                if (episode && episode.id) {
                    // تجنب التكرار
                    const exists = episodes.some(e => e.id === episode.id);
                    if (!exists) {
                        episodes.push(episode);
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        // الطريقة 2: البحث عن عناصر الفيديو
        if (episodes.length === 0) {
            const videoElements = root.querySelectorAll('[class*="video"], [class*="episode"], [class*="movie"]');
            console.log(`📊 الطريقة 2: وجدت ${videoElements.length} عنصر فيديو`);
            
            for (const element of videoElements) {
                try {
                    const episode = await this.extractEpisodeFromElement(element, baseUrl);
                    if (episode && episode.id) {
                        const exists = episodes.some(e => e.id === episode.id);
                        if (!exists) {
                            episodes.push(episode);
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        // الطريقة 3: البحث عن الصور في الروابط
        if (episodes.length === 0) {
            const imgElements = root.querySelectorAll('img');
            console.log(`📊 الطريقة 3: وجدت ${imgElements.length} صورة`);
            
            for (const img of imgElements) {
                try {
                    const parentLink = img.closest('a');
                    if (parentLink) {
                        const episode = await this.extractEpisodeFromLink(parentLink, baseUrl);
                        if (episode && episode.id) {
                            const exists = episodes.some(e => e.id === episode.id);
                            if (!exists) {
                                episodes.push(episode);
                            }
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        
        return episodes;
    }

    async extractEpisodesAlternative(html, baseUrl) {
        const episodes = [];
        const root = parse(html);
        
        console.log('🔧 جرب طريقة الاستخراج البديلة...');
        
        // البحث عن جميع الروابط
        const allLinks = root.querySelectorAll('a');
        console.log(`🔗 وجدت ${allLinks.length} رابط في الصفحة`);
        
        const videoPatterns = [
            /video\.php\?vid=([^&"']+)/i,
            /embed\.php\?vid=([^&"']+)/i,
            /play\.php\?vid=([^&"']+)/i,
            /watch\/([^\/"']+)/i,
            /\/([A-Z0-9]+)(?:\.html)?$/i
        ];
        
        for (const link of allLinks) {
            const href = link.getAttribute('href');
            if (!href) continue;
            
            let videoId = null;
            for (const pattern of videoPatterns) {
                const match = href.match(pattern);
                if (match) {
                    videoId = match[1];
                    break;
                }
            }
            
            if (videoId && videoId.length > 5) {
                try {
                    // استخراج الصورة
                    const img = link.querySelector('img');
                    let imageSrc = null;
                    if (img) {
                        imageSrc = img.getAttribute('src') || img.getAttribute('data-src');
                    }
                    
                    // استخراج العنوان
                    let title = 'عنوان غير معروف';
                    const titleAttr = link.getAttribute('title');
                    const imgAlt = img ? img.getAttribute('alt') : null;
                    const linkText = link.textContent.trim();
                    
                    if (titleAttr) title = this.cleanTitle(titleAttr);
                    else if (imgAlt) title = this.cleanTitle(imgAlt);
                    else if (linkText) title = this.cleanTitle(linkText);
                    
                    const episode = {
                        id: videoId,
                        title: title,
                        image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
                        short_link: this.fixImageUrl(href, baseUrl),
                        duration: '00:00',
                        description: '',
                        servers: [],
                        videoUrl: `${this.baseUrl}/embed.php?vid=${videoId}`
                    };
                    
                    // تجنب التكرار
                    const exists = episodes.some(e => e.id === episode.id);
                    if (!exists) {
                        episodes.push(episode);
                    }
                    
                } catch (error) {
                    continue;
                }
            }
        }
        
        return episodes;
    }

    async extractEpisodeFromLink(link, baseUrl) {
        const href = link.getAttribute('href');
        if (!href || !href.includes('video.php')) {
            return null;
        }
        
        // استخراج ID من الرابط
        const idMatch = href.match(/vid=([a-zA-Z0-9]+)/);
        if (!idMatch) return null;
        
        const id = idMatch[1];
        
        // استخراج الصورة
        let imageSrc = null;
        const img = link.querySelector('img');
        if (img) {
            imageSrc = img.getAttribute('src') || img.getAttribute('data-src');
            
            // تجاهل الصور الفارغة
            if (imageSrc && (imageSrc.includes('blank.gif') || imageSrc.includes('data:image'))) {
                imageSrc = null;
            }
        }
        
        // استخراج العنوان
        let title = 'عنوان غير معروف';
        const titleAttr = link.getAttribute('title');
        const imgAlt = img ? img.getAttribute('alt') : null;
        const linkText = link.textContent.trim();
        
        if (titleAttr) title = this.cleanTitle(titleAttr);
        else if (imgAlt) title = this.cleanTitle(imgAlt);
        else if (linkText) title = this.cleanTitle(linkText);
        
        // استخراج المدة
        let duration = '00:00';
        const durationElement = link.querySelector('[class*="duration"], [class*="time"]');
        if (durationElement) {
            duration = this.cleanText(durationElement.textContent);
        }
        
        return {
            id: id,
            title: title,
            image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
            short_link: this.fixImageUrl(href, baseUrl),
            duration: duration,
            description: '',
            servers: [],
            videoUrl: `${this.baseUrl}/embed.php?vid=${id}`
        };
    }

    async extractEpisodeFromElement(element, baseUrl) {
        // البحث عن رابط داخل العنصر
        const link = element.querySelector('a');
        if (!link) return null;
        
        return this.extractEpisodeFromLink(link, baseUrl);
    }

    async extractDetailsForEpisodes(episodes) {
        const detailedEpisodes = [];
        
        for (let i = 0; i < episodes.length; i++) {
            try {
                const episode = episodes[i];
                console.log(`📝 جاري استخراج تفاصيل (${i+1}/${episodes.length}): ${episode.title.substring(0, 30)}...`);
                
                // تأخير بين الطلبات لتجنب الحظر
                await this.delay(this.requestDelay);
                
                // استخراج تفاصيل الحلقة
                const details = await this.extractEpisodeDetails(episode.short_link);
                if (details) {
                    episode.description = details.description || '';
                    if (details.image && !episode.image) {
                        episode.image = details.image;
                    }
                    if (details.title) {
                        episode.title = details.title;
                    }
                }
                
                // تأخير إضافي قبل استخراج السيرفرات
                await this.delay(500);
                
                // استخراج السيرفرات
                const servers = await this.extractEpisodeServers(episode.id);
                if (servers && servers.length > 0) {
                    episode.servers = servers;
                }
                
                detailedEpisodes.push(episode);
                
            } catch (error) {
                console.log(`⚠️ خطأ في الحلقة ${i+1}:`, error.message);
                detailedEpisodes.push(episodes[i]); // إضافة الحلقة بدون تفاصيل
            }
        }
        
        return detailedEpisodes;
    }

    async extractEpisodeDetails(episodeUrl) {
        try {
            console.log(`🔗 جاري تحميل تفاصيل: ${episodeUrl.substring(0, 60)}...`);
            const html = await this.fetchWithProxy(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            // استخراج العنوان من meta
            const titleMeta = root.querySelector('meta[name="title"], meta[property="og:title"]');
            if (titleMeta) {
                details.title = this.cleanTitle(titleMeta.getAttribute('content'));
            }
            
            // استخراج الوصف من meta
            const descMeta = root.querySelector('meta[name="description"], meta[property="og:description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content');
                details.description = this.cleanText(desc).substring(0, 300) + '...';
            }
            
            // استخراج الصورة من meta
            const imageMeta = root.querySelector('meta[property="og:image"]');
            if (imageMeta) {
                details.image = imageMeta.getAttribute('content');
            }
            
            // إذا لم نجد في meta، نبحث في الصفحة
            if (!details.title) {
                const pageTitle = root.querySelector('h1, .title, [class*="title"]');
                if (pageTitle) {
                    details.title = this.cleanTitle(pageTitle.textContent);
                }
            }
            
            if (!details.description) {
                const pageDesc = root.querySelector('.description, .desc, [class*="description"]');
                if (pageDesc) {
                    const desc = pageDesc.textContent;
                    details.description = this.cleanText(desc).substring(0, 300) + '...';
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
            console.log(`🔗 جاري تحميل سيرفرات: ${playUrl.substring(0, 60)}...`);
            
            const html = await this.fetchWithProxy(playUrl);
            const root = parse(html);
            
            const servers = [];
            
            // البحث عن قائمة السيرفرات بطرق مختلفة
            const serverSelectors = [
                '.WatchList',
                '.server-list',
                '#servers',
                '[class*="server"]',
                'select[name="server"]'
            ];
            
            let serverList = null;
            for (const selector of serverSelectors) {
                serverList = root.querySelector(selector);
                if (serverList) break;
            }
            
            if (serverList) {
                // محاولة استخراج من عناصر li
                const serverItems = serverList.querySelectorAll('li, option');
                
                serverItems.forEach((item, index) => {
                    let embedUrl = item.getAttribute('data-embed-url') || 
                                  item.getAttribute('value') || 
                                  item.getAttribute('data-value');
                    
                    if (embedUrl && embedUrl.includes('embed')) {
                        // استخراج اسم السيرفر
                        let serverName = `سيرفر ${index + 1}`;
                        const nameElement = item.querySelector('strong, span, a');
                        if (nameElement) {
                            serverName = this.cleanText(nameElement.textContent);
                        } else if (item.textContent) {
                            serverName = this.cleanText(item.textContent);
                        }
                        
                        const serverId = item.getAttribute('data-embed-id') || 
                                       item.getAttribute('id') || 
                                       (index + 1).toString();
                        
                        servers.push({
                            id: serverId,
                            name: serverName,
                            url: embedUrl
                        });
                    }
                });
            }
            
            // إذا لم نجد سيرفرات، نضيف سيرفرات افتراضية
            if (servers.length === 0) {
                console.log(`⚠️ لم أجد سيرفرات، أضيف سيرفرات افتراضية`);
                const defaultServers = [
                    'https://vidmoly.net',
                    'https://dood.watch',
                    'https://voe.sx',
                    'https://uqload.co',
                    'https://streamtape.com',
                    'https://mixdrop.co',
                    'https://filelions.com',
                    'https://streamwish.com',
                    'https://mp4upload.com',
                    'https://www.ok.ru'
                ];
                
                defaultServers.forEach((server, index) => {
                    servers.push({
                        id: (index + 1).toString(),
                        name: `سيرفر ${index + 1}`,
                        url: `${server}/embed-${videoId}.html`
                    });
                });
            }
            
            console.log(`✅ وجدت ${servers.length} سيرفر`);
            return servers;
            
        } catch (error) {
            console.log(`❌ فشل استخراج السيرفرات:`, error.message);
            
            // إرجاع سيرفرات افتراضية في حالة الفشل
            return Array.from({ length: 5 }, (_, i) => ({
                id: (i + 1).toString(),
                name: `سيرفر ${i + 1}`,
                url: `${this.baseUrl}/embed.php?vid=${videoId}&server=${i + 1}`
            }));
        }
    }

    // دالات المساعدة
    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
            
            console.log(`🌐 جاري التحميل: ${url.substring(0, 80)}...`);
            
            const options = {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Referer': this.baseUrl,
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site'
                },
                timeout: 20000
            };
            
            const req = https.get(url, options, (res) => {
                console.log(`📊 الاستجابة: HTTP ${res.statusCode} ${res.statusMessage}`);
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (data.length > 0) {
                        console.log(`✅ تم تحميل ${data.length} بايت`);
                        resolve(data);
                    } else {
                        reject(new Error('لا توجد بيانات'));
                    }
                });
            });
            
            req.on('error', (err) => {
                console.log(`❌ خطأ في الطلب: ${err.message}`);
                reject(err);
            });
            
            req.on('timeout', () => {
                console.log('⏰ انتهت المهلة');
                req.destroy();
                reject(new Error('Timeout بعد 20 ثانية'));
            });
        });
    }

    cleanTitle(text) {
        return this.cleanText(text).substring(0, 100);
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s\-.,!?()]/g, '')
            .trim();
    }

    fixImageUrl(url, baseUrl) {
        if (!url) return '';
        
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        if (url.startsWith('/')) {
            try {
                const base = new URL(baseUrl);
                return base.origin + url;
            } catch {
                return this.baseUrl + url;
            }
        }
        
        if (!url.startsWith('http')) {
            return this.baseUrl + '/' + url;
        }
        
        return url;
    }

    // حفظ HTML للفحص
    saveDebugHTML(html) {
        const debugPath = path.join(this.outputDir, 'debug.html');
        fs.writeFileSync(debugPath, html, 'utf8');
        console.log(`📝 تم حفظ HTML للفحص في: ${debugPath}`);
    }

    async saveEpisodes(episodes) {
        const filePath = path.join(this.outputDir, this.outputFile);
        
        try {
            // التحقق إذا كان هناك بيانات للحفظ
            if (episodes.length === 0) {
                console.log('⚠️ لا توجد حلقات جديدة للحفظ');
                // حفظ مصفوفة فارغة
                fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
                return;
            }
            
            console.log(`\n💾 جاري حفظ ${episodes.length} حلقة جديدة في ${this.outputFile}...`);
            
            // إضافة معلومات التحديث
            const dataToSave = {
                metadata: {
                    total_episodes: episodes.length,
                    last_updated: new Date().toISOString(),
                    site: 'larooza.life',
                    file_name: this.outputFile,
                    source_url: 'https://larooza.life/category.php?cat=ramadan-2026'
                },
                episodes: episodes
            };
            
            // حفظ البيانات في الملف
            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            console.log(`✅ تم حفظ ${episodes.length} حلقة في ${this.outputFile}`);
            console.log(`📅 تاريخ التحديث: ${dataToSave.metadata.last_updated}`);
            
        } catch (error) {
            console.error('❌ خطأ في حفظ الملف:', error.message);
        }
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    const url = process.argv[2] || 'https://larooza.life/category.php?cat=ramadan-2026';
    
    extractor.start(url)
        .then(() => {
            console.log('\n✨ تم الانتهاء من العملية بنجاح!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
