const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.episodesPerRun = 30; // 30 حلقة فقط لكل مرة
        this.outputDir = 'Ramadan';
        this.existingEpisodes = new Set(); // لتجنب التكرار
        this.baseUrl = 'https://larooza.life';
        this.maxPagesToSearch = 20; // الحد الأقصى للصفحات للبحث
        
        // إنشاء مجلد الإخراج
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // تحميل الحلقات الموجودة (لتجنب التكرار فقط)
        this.loadExistingEpisodes();
        
        // قائمة User-Agents
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        ];
        
        // CORS proxies
        this.proxies = [
            '', // مباشر
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        this.currentProxy = 0;
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

    async start() {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`📁 سيتم الحفظ في: ${this.outputDir}/`);
        console.log(`🎯 عدد الحلقات المطلوبة: ${this.episodesPerRun}`);
        console.log(`🔍 البحث في جميع الصفحات...\n`);
        
        try {
            let allNewEpisodes = [];
            let currentPage = 1;
            let foundEpisodes = 0;
            
            // البحث في الصفحات حتى نجد 30 حلقة جديدة
            while (foundEpisodes < this.episodesPerRun && currentPage <= this.maxPagesToSearch) {
                console.log(`📄 جاري البحث في الصفحة ${currentPage}...`);
                
                const pageUrl = `https://larooza.life/category.php?cat=ramadan-2026&page=${currentPage}`;
                
                try {
                    const html = await this.fetchWithProxy(pageUrl);
                    
                    if (html) {
                        const pageEpisodes = await this.extractEpisodesFromPage(html, pageUrl);
                        
                        // فلترة الحلقات الجديدة فقط
                        const newEpisodes = pageEpisodes.filter(ep => 
                            ep && ep.id && !this.existingEpisodes.has(ep.id)
                        );
                        
                        if (newEpisodes.length > 0) {
                            allNewEpisodes = [...allNewEpisodes, ...newEpisodes];
                            foundEpisodes = allNewEpisodes.length;
                            
                            console.log(`✅ الصفحة ${currentPage}: وجد ${newEpisodes.length} حلقة جديدة`);
                            
                            // تحديث existingEpisodes بالحلقات الجديدة
                            newEpisodes.forEach(ep => {
                                if (ep.id) {
                                    this.existingEpisodes.add(ep.id);
                                }
                            });
                        } else {
                            console.log(`ℹ️ الصفحة ${currentPage}: لا توجد حلقات جديدة`);
                        }
                    }
                } catch (error) {
                    console.log(`❌ خطأ في الصفحة ${currentPage}:`, error.message);
                }
                
                currentPage++;
                
                // إضافة تأخير بسيط بين الصفحات
                await this.delay(1000);
            }
            
            console.log(`\n🔍 انتهى البحث في ${currentPage - 1} صفحات`);
            console.log(`✅ تم العثور على ${allNewEpisodes.length} حلقة جديدة`);
            
            // تحديد فقط 30 حلقة (أحدثها)
            const finalEpisodes = allNewEpisodes.slice(0, this.episodesPerRun);
            
            // استخراج التفاصيل الكاملة للحلقات المختارة
            console.log('\n🔍 جاري استخراج التفاصيل الكاملة...');
            const detailedEpisodes = await this.extractDetailsForEpisodes(finalEpisodes);
            
            // حفظ النتائج (استبدال كامل)
            await this.saveResults(detailedEpisodes);
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
        }
    }

    async extractEpisodesFromPage(html, pageUrl) {
        const episodes = [];
        const root = parse(html);
        
        // البحث عن عناصر الحلقات
        const episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3');
        
        for (const element of episodeElements) {
            try {
                const episode = await this.extractEpisodeFromElement(element, pageUrl);
                if (episode && episode.id) {
                    episodes.push(episode);
                }
            } catch (error) {
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
            videoUrl: `${this.baseUrl}/embed.php?vid=${id}`,
            timestamp: Date.now() // إضافة timestamp للترتيب
        };
    }

    async extractDetailsForEpisodes(episodes) {
        const detailedEpisodes = [];
        
        for (let i = 0; i < episodes.length; i++) {
            try {
                const episode = episodes[i];
                console.log(`📝 جاري تفاصيل (${i+1}/${episodes.length}): ${episode.title.substring(0, 30)}...`);
                
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
                    const embedUrl = item.getAttribute('data-embed-url');
                    
                    if (embedUrl) {
                        const serverNameElement = item.querySelector('strong');
                        const serverName = serverNameElement ? 
                            this.cleanText(serverNameElement.textContent) : 
                            `سيرفر ${index + 1}`;
                        
                        const serverId = item.getAttribute('data-embed-id') || (index + 1).toString();
                        
                        servers.push({
                            id: serverId,
                            name: serverName,
                            url: embedUrl
                        });
                    }
                });
            }
            
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
                
                console.log(`📚 تم تحميل ${this.existingEpisodes.size} حلقة سابقة`);
            }
            
        } catch (error) {
            console.log('⚠️ لا توجد حلقات سابقة أو حدث خطأ في التحميل');
        }
    }

    async saveResults(episodes) {
        const fileName = 'latest_episodes.json';
        const filePath = path.join(this.outputDir, fileName);
        
        console.log(`\n💾 جاري حفظ النتائج...`);
        
        if (episodes.length === 0) {
            // إذا ما في حلقات جديدة، نترك الملف فاضي
            fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
            console.log(`ℹ️ الملف ${fileName} أصبح فاضياً (لا توجد حلقات جديدة)`);
        } else {
            // حفظ الحلقات الجديدة (استبدال كامل)
            fs.writeFileSync(filePath, JSON.stringify(episodes, null, 2), 'utf8');
            console.log(`✅ تم حفظ ${episodes.length} حلقة في ${fileName}`);
            console.log(`🔄 تم استبدال جميع الحلقات القديمة`);
        }
        
        // حفظ updated_at
        const summary = {
            metadata: {
                total_episodes: episodes.length,
                last_updated: new Date().toISOString(),
                episodes_per_run: this.episodesPerRun,
                site: 'larooza.life'
            },
            episodes: episodes.map(ep => ({
                id: ep.id,
                title: ep.title,
                duration: ep.duration
            }))
        };
        
        const summaryPath = path.join(this.outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        
        console.log(`\n📊 الإحصائيات النهائية:`);
        console.log(`   - الحلقات المحفوظة: ${episodes.length}`);
        console.log(`   - الحلقات المتجنبة: ${this.existingEpisodes.size}`);
        console.log(`   - آخر تحديث: ${new Date().toLocaleString()}`);
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    extractor.start()
        .then(() => {
            console.log('\n✨ تم الانتهاء بنجاح!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
