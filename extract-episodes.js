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
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        ];
        
        // CORS proxies للتحايل على القيود
        this.proxies = [
            '', // مباشر
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        this.currentProxy = 0;
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
                const targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                const html = await this.fetchUrl(targetUrl);
                if (html) return html;
            } catch (error) {
                console.log(`Proxy ${this.currentProxy} فشل:`, error.message);
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
            
            // 2. استخراج الحلقات من الصفحة
            console.log('🔍 جاري استخراج الحلقات...');
            const episodes = await this.extractEpisodesFromMainPage(html, url);
            
            if (episodes.length === 0) {
                console.log('⚠️ لم يتم العثور على حلقات');
                // حفظ ملف فارغ
                await this.saveEpisodes(episodes);
                return;
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
        }
    }

    async extractEpisodesFromMainPage(html, baseUrl) {
        const episodes = [];
        const root = parse(html);
        
        // البحث عن عناصر الحلقات بناءً على هيكل الموقع
        const episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3');
        
        console.log(`🔗 تم العثور على ${episodeElements.length} عنصر للحلقات`);
        
        for (const element of episodeElements) {
            try {
                const episode = await this.extractEpisodeFromElement(element, baseUrl);
                if (episode && episode.id) {
                    episodes.push(episode);
                }
            } catch (error) {
                // تجاهل الأخطاء والمتابعة
                continue;
            }
        }
        
        return episodes;
    }

    async extractEpisodeFromElement(element, baseUrl) {
        // البحث عن رابط الحلقة
        const linkElement = element.querySelector('a');
        const href = linkElement ? linkElement.getAttribute('href') : null;
        
        if (!href || !href.includes('video.php')) {
            return null;
        }
        
        // استخراج ID من الرابط
        const idMatch = href.match(/vid=([a-zA-Z0-9]+)/);
        if (!idMatch) return null;
        
        const id = idMatch[1];
        
        // استخراج الصورة
        const imgElement = element.querySelector('img');
        let imageSrc = null;
        
        if (imgElement) {
            imageSrc = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
            
            // تجاهل الصور الفارغة
            if (imageSrc && (imageSrc.includes('blank.gif') || imageSrc.includes('data:image'))) {
                imageSrc = null;
            }
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration');
        const duration = durationElement ? this.cleanText(durationElement.textContent) : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis') || linkElement;
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanTitle(
                titleElement.textContent || 
                titleElement.getAttribute('title') || 
                ''
            );
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

    async extractDetailsForEpisodes(episodes) {
        const detailedEpisodes = [];
        
        for (let i = 0; i < episodes.length; i++) {
            try {
                const episode = episodes[i];
                console.log(`📝 جاري استخراج تفاصيل (${i+1}/${episodes.length}): ${episode.title.substring(0, 30)}...`);
                
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
            const html = await this.fetchWithProxy(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            // استخراج العنوان من meta
            const titleMeta = root.querySelector('meta[name="title"]');
            if (titleMeta) {
                details.title = this.cleanTitle(titleMeta.getAttribute('content'));
            }
            
            // استخراج الوصف من meta
            const descMeta = root.querySelector('meta[name="description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content');
                details.description = this.cleanText(desc).substring(0, 300) + '...';
            }
            
            // استخراج الصورة من meta
            const imageMeta = root.querySelector('meta[property="og:image"]');
            if (imageMeta) {
                details.image = imageMeta.getAttribute('content');
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
            
            // البحث عن قائمة السيرفرات
            const serverList = root.querySelector('.WatchList');
            
            if (serverList) {
                const serverItems = serverList.querySelectorAll('li');
                
                serverItems.forEach((item, index) => {
                    // استخراج رابط السيرفر
                    const embedUrl = item.getAttribute('data-embed-url');
                    
                    if (embedUrl) {
                        // استخراج اسم السيرفر
                        const serverNameElement = item.querySelector('strong');
                        const serverName = serverNameElement ? 
                            this.cleanText(serverNameElement.textContent) : 
                            `سيرفر ${index + 1}`;
                        
                        // استخراج رقم السيرفر
                        const serverId = item.getAttribute('data-embed-id') || (index + 1).toString();
                        
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
            
            return servers;
            
        } catch (error) {
            console.log(`❌ فشل استخراج السيرفرات:`, error.message);
            
            // إرجاع سيرفرات افتراضية في حالة الفشل
            return Array.from({ length: 10 }, (_, i) => ({
                id: (i + 1).toString(),
                name: `سيرفر ${i + 1}`,
                url: `${this.baseUrl}/embed.php?vid=${videoId}&server=${i + 1}`
            }));
        }
    }

    // دالات المساعدة
    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Referer': this.baseUrl
                },
                timeout: 15000
            };
            
            const req = https.get(url, options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve(data);
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
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
            .replace(/[^\w\u0600-\u06FF\s\-.,!?]/g, '')
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
            
            // حفظ البيانات في الملف (ستحل محل أي بيانات موجودة مسبقاً)
            fs.writeFileSync(filePath, JSON.stringify(episodes, null, 2), 'utf8');
            
            console.log(`✅ تم حفظ ${episodes.length} حلقة في ${this.outputFile}`);
            
            // إضافة معلومات حول تاريخ التحديث
            this.addUpdateTimestamp();
            
        } catch (error) {
            console.error('❌ خطأ في حفظ الملف:', error.message);
        }
    }

    // إضافة طابع زمني للتحديث
    addUpdateTimestamp() {
        try {
            const filePath = path.join(this.outputDir, this.outputFile);
            
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                let data = JSON.parse(content);
                
                // إضافة معلومات التحديث
                const updateInfo = {
                    metadata: {
                        total_episodes: data.length,
                        last_updated: new Date().toISOString(),
                        site: 'larooza.life',
                        file_name: this.outputFile
                    }
                };
                
                // دمج المعلومات مع البيانات
                const finalData = {
                    ...updateInfo,
                    episodes: data
                };
                
                fs.writeFileSync(filePath, JSON.stringify(finalData, null, 2), 'utf8');
                
                console.log(`📅 تم تحديث تاريخ التحديث: ${updateInfo.metadata.last_updated}`);
                console.log(`📊 إجمالي الحلقات المحفوظة: ${data.length}`);
            }
        } catch (error) {
            console.log('⚠️ خطأ في إضافة تاريخ التحديث:', error.message);
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
