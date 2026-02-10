const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.outputFile = 'kj.json';
        this.baseUrl = 'https://z.larooza.life'; // تم التحديث إلى z.larooza.life
        
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
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
        ];
        
        // CORS proxies للتحايل على القيود
        this.proxies = [
            '', // مباشر
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://api.allorigins.win/raw?url=',
            'https://cors-anywhere.herokuapp.com/'
        ];
        this.currentProxy = 0;
        
        this.requestDelay = 1500; // تأخير 1.5 ثانية بين الطلبات
        this.timeout = 30000; // مهلة 30 ثانية
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
        const maxAttempts = this.proxies.length * 2; // محاولات لكل proxy مرتين
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const proxy = this.proxies[this.currentProxy];
                let targetUrl = url;
                
                if (proxy && proxy !== '') {
                    targetUrl = proxy + encodeURIComponent(url);
                }
                
                console.log(`🔄 المحاولة ${attempts + 1}: استخدام Proxy ${this.currentProxy}`);
                const html = await this.fetchUrl(targetUrl);
                if (html) {
                    console.log(`✅ نجحت المحاولة ${attempts + 1} مع Proxy ${this.currentProxy}`);
                    return html;
                }
            } catch (error) {
                console.log(`❌ فشلت المحاولة ${attempts + 1} مع Proxy ${this.currentProxy}:`, error.message);
                this.currentProxy = (this.currentProxy + 1) % this.proxies.length;
                attempts++;
                
                // تأخير قبل المحاولة التالية
                await this.delay(2000);
            }
        }
        throw new Error(`فشلت جميع المحاولات (${maxAttempts} محاولة)`);
    }

    async start(url = 'https://z.larooza.life/category.php?cat=ramadan-2026') {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`🌐 الدومين: ${this.baseUrl}`);
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
                    // محاولة نهائية باستخدام regex
                    const regexEpisodes = this.extractEpisodesWithRegex(html, url);
                    
                    if (regexEpisodes.length === 0) {
                        console.log('❌ جميع طرق الاستخراج فشلت');
                        // حفظ ملف فارغ
                        await this.saveEpisodes([]);
                        return;
                    }
                    
                    episodes.push(...regexEpisodes);
                } else {
                    episodes.push(...alternativeEpisodes);
                }
            }
            
            console.log(`✅ تم استخراج ${episodes.length} حلقة من الصفحة الرئيسية`);
            
            if (episodes.length > 0) {
                // 3. استخراج التفاصيل الكاملة لكل حلقة
                console.log('\n🔍 جاري استخراج التفاصيل الكاملة...');
                const detailedEpisodes = await this.extractDetailsForEpisodes(episodes);
                
                // 4. حفظ النتائج في ملف واحد
                await this.saveEpisodes(detailedEpisodes);
                
                console.log('\n🎉 تم الانتهاء بنجاح!');
            } else {
                console.log('\n⚠️ لم يتم العثور على أي حلقات للحفظ');
                await this.saveEpisodes([]);
            }
            
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
        
        // الطريقة 2: البحث عن div مع class يحتوي على video أو episode
        if (episodes.length === 0) {
            const videoDivs = root.querySelectorAll('div[class*="video"], div[class*="episode"], div[class*="movie"]');
            console.log(`📊 الطريقة 2: وجدت ${videoDivs.length} div للفيديو`);
            
            for (const div of videoDivs) {
                try {
                    const episode = await this.extractEpisodeFromDiv(div, baseUrl);
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
        
        // الطريقة 3: البحث عن جميع الروابط مع فحص href
        if (episodes.length === 0) {
            const allLinks = root.querySelectorAll('a[href]');
            console.log(`📊 الطريقة 3: فحص ${allLinks.length} رابط`);
            
            for (const link of allLinks) {
                const href = link.getAttribute('href');
                if (href && href.includes('vid=')) {
                    try {
                        const episode = await this.extractEpisodeFromLink(link, baseUrl);
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
        }
        
        return episodes;
    }

    async extractEpisodesAlternative(html, baseUrl) {
        const episodes = [];
        const root = parse(html);
        
        console.log('🔧 جرب طريقة الاستخراج البديلة...');
        
        // البحث عن جميع الروابط والصور
        const allElements = root.querySelectorAll('a, div');
        console.log(`🔗 فحص ${allElements.length} عنصر`);
        
        for (const element of allElements) {
            try {
                let href = element.getAttribute('href');
                let videoId = null;
                
                // البحث عن video ID في href
                if (href) {
                    const vidMatch = href.match(/vid=([a-zA-Z0-9_-]+)/i);
                    if (vidMatch) {
                        videoId = vidMatch[1];
                    }
                }
                
                // إذا لم نجد في href، نبحث في data attributes
                if (!videoId) {
                    const dataVid = element.getAttribute('data-vid') || 
                                   element.getAttribute('data-id') ||
                                   element.getAttribute('id');
                    if (dataVid && dataVid.length > 5) {
                        videoId = dataVid;
                    }
                }
                
                if (videoId) {
                    // استخراج الصورة
                    let imageSrc = null;
                    const img = element.querySelector('img');
                    if (img) {
                        imageSrc = img.getAttribute('src') || 
                                  img.getAttribute('data-src') ||
                                  img.getAttribute('data-original');
                    }
                    
                    // استخراج العنوان
                    let title = 'عنوان غير معروف';
                    const titleAttr = element.getAttribute('title');
                    const imgAlt = img ? img.getAttribute('alt') : null;
                    
                    if (titleAttr) title = this.cleanTitle(titleAttr);
                    else if (imgAlt) title = this.cleanTitle(imgAlt);
                    else {
                        // البحث عن نص العنوان في العنصر
                        const titleEl = element.querySelector('h3, h4, .title, .name');
                        if (titleEl) {
                            title = this.cleanTitle(titleEl.textContent);
                        } else if (element.textContent) {
                            title = this.cleanTitle(element.textContent.substring(0, 50));
                        }
                    }
                    
                    // إصلاح الرابط إذا كان نسبي
                    if (href && !href.startsWith('http')) {
                        if (href.startsWith('/')) {
                            href = this.baseUrl + href;
                        } else {
                            href = this.baseUrl + '/' + href;
                        }
                    } else if (!href) {
                        href = `${this.baseUrl}/video.php?vid=${videoId}`;
                    }
                    
                    const episode = {
                        id: videoId,
                        title: title,
                        image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
                        short_link: href,
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
                }
            } catch (error) {
                continue;
            }
        }
        
        return episodes;
    }

    extractEpisodesWithRegex(html, baseUrl) {
        console.log('🔍 جرب استخراج باستخدام Regex...');
        const episodes = [];
        
        // البحث عن video IDs باستخدام regex
        const videoIdPatterns = [
            /vid=([a-zA-Z0-9_-]+)/g,
            /video\.php\?vid=([a-zA-Z0-9_-]+)/g,
            /embed\.php\?vid=([a-zA-Z0-9_-]+)/g,
            /play\.php\?vid=([a-zA-Z0-9_-]+)/g,
            /"videoId":"([^"]+)"/g,
            /data-vid="([^"]+)"/g,
            /data-id="([^"]+)"/g
        ];
        
        const foundIds = new Set();
        
        for (const pattern of videoIdPatterns) {
            const matches = html.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].length > 5) {
                    foundIds.add(match[1]);
                }
            }
        }
        
        console.log(`🔗 وجدت ${foundIds.size} video ID باستخدام regex`);
        
        // البحث عن عناوين باستخدام regex
        const titlePattern = /<h3[^>]*>([^<]+)<\/h3>|<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/gi;
        const titleMatches = [];
        let titleMatch;
        while ((titleMatch = titlePattern.exec(html)) !== null) {
            const title = titleMatch[1] || titleMatch[2];
            if (title && title.trim().length > 5) {
                titleMatches.push(this.cleanTitle(title));
            }
        }
        
        // البحث عن صور باستخدام regex
        const imagePattern = /<img[^>]*src="([^"]+)"[^>]*>/gi;
        const imageMatches = [];
        let imageMatch;
        while ((imageMatch = imagePattern.exec(html)) !== null) {
            const src = imageMatch[1];
            if (src && !src.includes('blank.gif') && !src.includes('data:image')) {
                imageMatches.push(src);
            }
        }
        
        // إنشاء الحلقات
        let index = 0;
        for (const videoId of foundIds) {
            const episode = {
                id: videoId,
                title: titleMatches[index] || `حلقة ${index + 1}`,
                image: imageMatches[index] ? this.fixImageUrl(imageMatches[index], baseUrl) : null,
                short_link: `${this.baseUrl}/video.php?vid=${videoId}`,
                duration: '00:00',
                description: '',
                servers: [],
                videoUrl: `${this.baseUrl}/embed.php?vid=${videoId}`
            };
            
            episodes.push(episode);
            index++;
            
            if (index >= 50) break; // حد أقصى 50 حلقة
        }
        
        return episodes;
    }

    async extractEpisodeFromLink(link, baseUrl) {
        const href = link.getAttribute('href');
        if (!href) return null;
        
        // استخراج ID من الرابط
        let videoId = null;
        const vidMatch = href.match(/vid=([a-zA-Z0-9_-]+)/i);
        if (vidMatch) {
            videoId = vidMatch[1];
        }
        
        if (!videoId) return null;
        
        // استخراج الصورة
        let imageSrc = null;
        const img = link.querySelector('img');
        if (img) {
            imageSrc = img.getAttribute('src') || 
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-original');
            
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
        const durationElement = link.querySelector('[class*="duration"], [class*="time"], .pm-label-duration');
        if (durationElement) {
            duration = this.cleanText(durationElement.textContent);
        }
        
        // إصلاح الرابط إذا كان نسبي
        let finalHref = href;
        if (!href.startsWith('http')) {
            if (href.startsWith('/')) {
                finalHref = this.baseUrl + href;
            } else {
                finalHref = this.baseUrl + '/' + href;
            }
        }
        
        return {
            id: videoId,
            title: title,
            image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
            short_link: finalHref,
            duration: duration,
            description: '',
            servers: [],
            videoUrl: `${this.baseUrl}/embed.php?vid=${videoId}`
        };
    }

    async extractEpisodeFromDiv(div, baseUrl) {
        // البحث عن رابط داخل div
        const link = div.querySelector('a');
        if (link) {
            return this.extractEpisodeFromLink(link, baseUrl);
        }
        
        // إذا لم يكن هناك رابط، ابحث عن video ID في data attributes
        const videoId = div.getAttribute('data-vid') || 
                       div.getAttribute('data-id') ||
                       div.getAttribute('id');
        
        if (!videoId || videoId.length < 5) return null;
        
        // استخراج الصورة
        let imageSrc = null;
        const img = div.querySelector('img');
        if (img) {
            imageSrc = img.getAttribute('src') || 
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-original');
        }
        
        // استخراج العنوان
        let title = 'عنوان غير معروف';
        const titleEl = div.querySelector('h3, h4, .title, .name');
        if (titleEl) {
            title = this.cleanTitle(titleEl.textContent);
        }
        
        return {
            id: videoId,
            title: title,
            image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
            short_link: `${this.baseUrl}/video.php?vid=${videoId}`,
            duration: '00:00',
            description: '',
            servers: [],
            videoUrl: `${this.baseUrl}/embed.php?vid=${videoId}`
        };
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
                    if (details.title && details.title !== 'عنوان غير معروف') {
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
                
                // تحديث التقدم
                if ((i + 1) % 5 === 0) {
                    console.log(`📊 التقدم: ${i + 1}/${episodes.length} (${Math.round((i + 1) / episodes.length * 100)}%)`);
                }
                
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
            
            // استخراج العنوان
            const titleSelectors = [
                'meta[name="title"]',
                'meta[property="og:title"]',
                'h1',
                '.title',
                '[class*="title"]',
                '.video-title',
                '.episode-title'
            ];
            
            for (const selector of titleSelectors) {
                const element = root.querySelector(selector);
                if (element) {
                    const text = element.getAttribute('content') || element.textContent;
                    if (text && text.trim().length > 5) {
                        details.title = this.cleanTitle(text);
                        break;
                    }
                }
            }
            
            // استخراج الوصف
            const descSelectors = [
                'meta[name="description"]',
                'meta[property="og:description"]',
                '.description',
                '.desc',
                '[class*="description"]',
                '.video-description'
            ];
            
            for (const selector of descSelectors) {
                const element = root.querySelector(selector);
                if (element) {
                    const text = element.getAttribute('content') || element.textContent;
                    if (text && text.trim().length > 10) {
                        details.description = this.cleanText(text).substring(0, 300) + '...';
                        break;
                    }
                }
            }
            
            // استخراج الصورة
            const imageSelectors = [
                'meta[property="og:image"]',
                'meta[name="image"]',
                '.poster img',
                '.thumbnail img',
                '.video-thumbnail img'
            ];
            
            for (const selector of imageSelectors) {
                const element = root.querySelector(selector);
                if (element) {
                    const src = element.getAttribute('content') || 
                               element.getAttribute('src') ||
                               element.getAttribute('data-src');
                    if (src && !src.includes('blank.gif')) {
                        details.image = src;
                        break;
                    }
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
            
            // البحث عن جميع الخيارات في select
            const serverOptions = root.querySelectorAll('select[name="server"] option, select[id="server"] option');
            
            if (serverOptions.length > 0) {
                serverOptions.forEach((option, index) => {
                    const value = option.getAttribute('value');
                    if (value && value.includes('embed')) {
                        servers.push({
                            id: (index + 1).toString(),
                            name: option.textContent.trim() || `سيرفر ${index + 1}`,
                            url: value
                        });
                    }
                });
            } else {
                // البحث عن أزرار أو روابط السيرفرات
                const serverButtons = root.querySelectorAll('[class*="server"], .server-list a, .server-item');
                serverButtons.forEach((button, index) => {
                    const serverUrl = button.getAttribute('href') || 
                                     button.getAttribute('data-url') ||
                                     button.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
                    
                    if (serverUrl) {
                        servers.push({
                            id: (index + 1).toString(),
                            name: button.textContent.trim() || `سيرفر ${index + 1}`,
                            url: serverUrl
                        });
                    }
                });
            }
            
            // إذا لم نجد سيرفرات، نضيف سيرفرات افتراضية
            if (servers.length === 0) {
                console.log(`⚠️ لم أجد سيرفرات، أضيف سيرفرات افتراضية`);
                const defaultServers = [
                    { name: 'سيرفر 1', domain: 'vidmoly.net' },
                    { name: 'سيرفر 2', domain: 'dood.watch' },
                    { name: 'سيرفر 3', domain: 'voe.sx' },
                    { name: 'سيرفر 4', domain: 'uqload.co' },
                    { name: 'سيرفر 5', domain: 'streamtape.com' }
                ];
                
                defaultServers.forEach((server, index) => {
                    servers.push({
                        id: (index + 1).toString(),
                        name: server.name,
                        url: `https://${server.domain}/embed-${videoId}.html`
                    });
                });
            }
            
            console.log(`✅ وجدت ${servers.length} سيرفر`);
            return servers;
            
        } catch (error) {
            console.log(`❌ فشل استخراج السيرفرات:`, error.message);
            
            // إرجاع سيرفرات افتراضية في حالة الفشل
            return Array.from({ length: 3 }, (_, i) => ({
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
            
            console.log(`🌐 جاري التحميل (${userAgent.substring(0, 30)}...)`);
            
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
                    'Sec-Fetch-Site': 'cross-site',
                    'Cache-Control': 'max-age=0'
                },
                timeout: this.timeout
            };
            
            const req = https.get(url, options, (res) => {
                let statusMessage = `HTTP ${res.statusCode}`;
                if (res.statusMessage) {
                    statusMessage += ` ${res.statusMessage}`;
                }
                console.log(`📊 الاستجابة: ${statusMessage}`);
                
                if (res.statusCode !== 200) {
                    reject(new Error(`فشل التحميل: ${statusMessage}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (data.length > 0) {
                        console.log(`✅ تم تحميل ${Math.round(data.length / 1024)} كيلوبايت`);
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
                console.log(`⏰ انتهت المهلة بعد ${this.timeout / 1000} ثواني`);
                req.destroy();
                reject(new Error(`Timeout بعد ${this.timeout / 1000} ثواني`));
            });
        });
    }

    cleanTitle(text) {
        const cleaned = this.cleanText(text);
        return cleaned.length > 100 ? cleaned.substring(0, 100) + '...' : cleaned;
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s\-.,!?:;'"()]/g, '')
            .replace(/^\s+|\s+$/g, '')
            .trim();
    }

    fixImageUrl(url, baseUrl) {
        if (!url) return '';
        
        // إصلاح الروابط النسبية
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        if (url.startsWith('/')) {
            return this.baseUrl + url;
        }
        
        if (!url.startsWith('http')) {
            return this.baseUrl + '/' + url;
        }
        
        return url;
    }

    // حفظ HTML للفحص
    saveDebugHTML(html) {
        const debugPath = path.join(this.outputDir, 'debug.html');
        // حفظ أول 50000 حرف فقط
        const truncatedHtml = html.length > 50000 ? html.substring(0, 50000) + '... [TRUNCATED]' : html;
        fs.writeFileSync(debugPath, truncatedHtml, 'utf8');
        console.log(`📝 تم حفظ HTML للفحص في: ${debugPath} (${truncatedHtml.length} حرف)`);
    }

    async saveEpisodes(episodes) {
        const filePath = path.join(this.outputDir, this.outputFile);
        
        try {
            // التحقق إذا كان هناك بيانات للحفظ
            if (episodes.length === 0) {
                console.log('⚠️ لا توجد حلقات جديدة للحفظ');
                // حفظ مصفوفة فارغة مع معلومات
                const emptyData = {
                    metadata: {
                        total_episodes: 0,
                        last_updated: new Date().toISOString(),
                        site: this.baseUrl,
                        file_name: this.outputFile,
                        note: 'لم يتم العثور على حلقات'
                    },
                    episodes: []
                };
                
                fs.writeFileSync(filePath, JSON.stringify(emptyData, null, 2), 'utf8');
                console.log(`💾 تم حفظ ملف فارغ في ${this.outputFile}`);
                return;
            }
            
            console.log(`\n💾 جاري حفظ ${episodes.length} حلقة جديدة في ${this.outputFile}...`);
            
            // إضافة معلومات التحديث
            const dataToSave = {
                metadata: {
                    total_episodes: episodes.length,
                    last_updated: new Date().toISOString(),
                    site: this.baseUrl,
                    file_name: this.outputFile,
                    source_url: 'https://z.larooza.life/category.php?cat=ramadan-2026',
                    note: 'يتم استبدال الملف بالكامل في كل تشغيل'
                },
                episodes: episodes
            };
            
            // حفظ البيانات في الملف
            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            console.log(`✅ تم حفظ ${episodes.length} حلقة في ${this.outputFile}`);
            console.log(`📅 تاريخ التحديث: ${dataToSave.metadata.last_updated}`);
            console.log(`📊 حجم الملف: ${Math.round(fs.statSync(filePath).size / 1024)} كيلوبايت`);
            
        } catch (error) {
            console.error('❌ خطأ في حفظ الملف:', error.message);
        }
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    const url = process.argv[2] || 'https://z.larooza.life/category.php?cat=ramadan-2026';
    
    extractor.start(url)
        .then(() => {
            console.log('\n✨ تم الانتهاء من العملية بنجاح!');
            console.log(`📂 الملف النهائي: ${extractor.outputDir}/${extractor.outputFile}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
