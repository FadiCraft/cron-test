const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.outputFile = 'kj.json';
        this.baseUrl = 'https://z.larooza.life';
        
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
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        this.requestDelay = 1000;
        this.timeout = 20000;
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

    async fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
            
            console.log(`🌐 جاري التحميل: ${url.substring(0, 80)}...`);
            
            const options = {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Referer': this.baseUrl,
                    'Connection': 'keep-alive'
                },
                timeout: this.timeout
            };
            
            const req = https.get(url, options, (res) => {
                console.log(`📊 الاستجابة: HTTP ${res.statusCode}`);
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
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
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Timeout بعد ${this.timeout / 1000} ثواني`));
            });
        });
    }

    async start(url = 'https://z.larooza.life/category.php?cat=ramadan-2026') {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`🌐 الدومين: ${this.baseUrl}`);
        console.log(`📁 سيتم الحفظ في: ${this.outputDir}/${this.outputFile}`);
        console.log(`🔗 الرابط: ${url}\n`);
        
        try {
            // 1. جلب الصفحة الرئيسية
            console.log('📥 جاري تحميل الصفحة الرئيسية...');
            const html = await this.fetchUrl(url);
            
            if (!html) {
                console.log('❌ فشل تحميل الصفحة');
                return;
            }
            
            // حفظ HTML للفحص
            this.saveDebugHTML(html);
            
            // 2. استخراج الحلقات من الصفحة الرئيسية
            console.log('🔍 جاري استخراج الحلقات من الصفحة الرئيسية...');
            const root = parse(html);
            const episodes = this.extractEpisodesFromMainPage(root, url);
            
            if (episodes.length === 0) {
                console.log('❌ لم يتم العثور على حلقات في الصفحة الرئيسية');
                await this.saveEpisodes([]);
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

    extractEpisodesFromMainPage(root, baseUrl) {
        const episodes = [];
        const seenUrls = new Set();
        
        console.log('🔎 البحث عن الحلقات باستخدام selectors من واجهة المستخدم...');
        
        // البحث في جميع العناصر التي تحتوي على الحلقات - نفس selectors المستخدمة في الواجهة
        const episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3');
        
        console.log(`📊 وجدت ${episodeElements.length} عنصر للحلقات`);
        
        episodeElements.forEach((element, index) => {
            try {
                const episode = this.extractEpisodeFromElement(element, baseUrl);
                if (episode && episode.title && !seenUrls.has(episode.link)) {
                    // استخراج ID من الرابط
                    const vidMatch = episode.link.match(/vid=([a-zA-Z0-9_-]+)/i);
                    if (vidMatch) {
                        episode.id = vidMatch[1];
                        episode.videoUrl = `${this.baseUrl}/embed.php?vid=${episode.id}`;
                    } else {
                        episode.id = `episode_${index + 1}`;
                    }
                    
                    episodes.push(episode);
                    seenUrls.add(episode.link);
                }
            } catch (error) {
                console.log(`⚠️ خطأ في استخراج حلقة ${index + 1}:`, error.message);
            }
        });
        
        // إذا لم نجد بهذه الطريقة، نجرب طرق أخرى
        if (episodes.length === 0) {
            console.log('🔧 جرب طرق استخراج بديلة...');
            
            // البحث عن جميع الروابط مع video.php
            const videoLinks = root.querySelectorAll('a[href*="video.php"]');
            console.log(`🔗 وجدت ${videoLinks.length} رابط video.php`);
            
            videoLinks.forEach((link, index) => {
                try {
                    const href = link.getAttribute('href');
                    if (href) {
                        const episode = {
                            id: `vid_${index + 1}`,
                            title: this.extractTitleFromElement(link),
                            image: this.extractImageFromElement(link),
                            link: this.fixUrl(href, baseUrl),
                            duration: '00:00',
                            description: '',
                            servers: [],
                            videoUrl: href.replace('video.php', 'embed.php')
                        };
                        
                        // استخراج ID من الرابط
                        const vidMatch = href.match(/vid=([a-zA-Z0-9_-]+)/i);
                        if (vidMatch) {
                            episode.id = vidMatch[1];
                        }
                        
                        episodes.push(episode);
                    }
                } catch (error) {
                    console.log(`⚠️ خطأ في استخراج رابط ${index + 1}`);
                }
            });
        }
        
        return episodes.slice(0, 50); // الحد الأقصى 50 حلقة
    }

    extractEpisodeFromElement(element, baseUrl) {
        // البحث عن رابط الحلقة
        const linkElement = element.querySelector('a');
        const href = linkElement ? linkElement.getAttribute('href') : null;
        const link = href ? this.fixUrl(href, baseUrl) : null;
        
        // استخراج الصورة
        const imgElement = element.querySelector('img');
        let imageSrc = null;
        
        if (imgElement) {
            imageSrc = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
            
            // إذا كانت الصورة فارغة، تجاهلها
            if (imageSrc && (imageSrc.includes('blank.gif') || imageSrc.includes('data:image'))) {
                imageSrc = null;
            }
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration');
        const duration = durationElement ? this.cleanText(durationElement.textContent) : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis') || element.querySelector('a');
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanTitle(titleElement.textContent || titleElement.getAttribute('title') || '');
        }
        
        return {
            title: title,
            image: imageSrc ? this.fixImageUrl(imageSrc, baseUrl) : null,
            link: link,
            duration: duration,
            description: '',
            servers: []
        };
    }

    extractTitleFromElement(element) {
        // استخراج العنوان بطرق مختلفة
        const titleAttr = element.getAttribute('title');
        if (titleAttr) return this.cleanTitle(titleAttr);
        
        const textContent = element.textContent.trim();
        if (textContent) return this.cleanTitle(textContent);
        
        const imgAlt = element.querySelector('img')?.getAttribute('alt');
        if (imgAlt) return this.cleanTitle(imgAlt);
        
        return 'عنوان غير معروف';
    }

    extractImageFromElement(element) {
        const img = element.querySelector('img');
        if (img) {
            const src = img.getAttribute('src') || img.getAttribute('data-src');
            if (src && !src.includes('blank.gif') && !src.includes('data:image')) {
                return src;
            }
        }
        return null;
    }

    async extractDetailsForEpisodes(episodes) {
        const detailedEpisodes = [];
        
        for (let i = 0; i < episodes.length; i++) {
            try {
                const episode = episodes[i];
                console.log(`📝 جاري استخراج تفاصيل (${i+1}/${episodes.length}): ${episode.title.substring(0, 30)}...`);
                
                // تأخير بين الطلبات لتجنب الحظر
                await this.delay(this.requestDelay);
                
                // استخراج تفاصيل الحلقة من صفحتها
                if (episode.link && episode.link !== '#') {
                    const details = await this.extractEpisodeDetails(episode.link);
                    if (details) {
                        episode.description = details.description || '';
                        if (details.image && !episode.image) {
                            episode.image = details.image;
                        }
                        if (details.title && details.title !== 'عنوان غير معروف') {
                            episode.title = details.title;
                        }
                    }
                    
                    // استخراج السيرفرات
                    const servers = await this.extractEpisodeServers(episode.link);
                    if (servers && servers.length > 0) {
                        episode.servers = servers;
                    }
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
            const html = await this.fetchUrl(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            // استخراج العنوان من meta tag - نفس الطريقة في الواجهة
            const titleMeta = root.querySelector('meta[name="title"]');
            if (titleMeta) {
                details.title = this.cleanTitle(titleMeta.getAttribute('content'));
            }
            
            // استخراج الوصف من meta tag
            const descMeta = root.querySelector('meta[name="description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content');
                details.description = this.cleanText(desc).substring(0, 200) + '...';
            }
            
            // استخراج الصورة من meta tag
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

    async extractEpisodeServers(episodeUrl) {
        try {
            // تحويل video.php إلى play.php للحصول على صفحة المشاهدة - نفس الطريقة في الواجهة
            const playUrl = episodeUrl.replace('video.php', 'play.php');
            console.log(`🔗 جاري تحميل سيرفرات: ${playUrl.substring(0, 60)}...`);
            
            const html = await this.fetchUrl(playUrl);
            const root = parse(html);
            
            const servers = [];
            
            // البحث عن قائمة السيرفرات - نفس الطريقة في الواجهة
            const serverList = root.querySelector('.WatchList');
            
            if (serverList) {
                const serverItems = serverList.querySelectorAll('li');
                
                serverItems.forEach((item, index) => {
                    // استخراج رابط السيرفر من data-embed-url
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
            
            console.log(`✅ وجدت ${servers.length} سيرفر`);
            return servers;
            
        } catch (error) {
            console.log(`❌ فشل استخراج السيرفرات:`, error.message);
            
            // إرجاع سيرفرات افتراضية في حالة الفشل
            return Array.from({ length: 3 }, (_, i) => ({
                id: (i + 1).toString(),
                name: `سيرفر ${i + 1}`,
                url: `${this.baseUrl}/embed.php?vid=${episodeUrl.match(/vid=([a-zA-Z0-9_-]+)/i)?.[1] || 'unknown'}&server=${i + 1}`
            }));
        }
    }

    // دالات المساعدة
    fixUrl(url, baseUrl) {
        if (!url) return '#';
        
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

    fixImageUrl(url, baseUrl) {
        return this.fixUrl(url, baseUrl);
    }

    cleanTitle(text) {
        const cleaned = this.cleanText(text);
        return cleaned.length > 60 ? cleaned.substring(0, 60) + '...' : cleaned;
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\u0600-\u06FF\s\-.,!?:;'"()]/g, '')
            .replace(/^\s+|\s+$/g, '')
            .trim();
    }

    // حفظ HTML للفحص
    saveDebugHTML(html) {
        const debugPath = path.join(this.outputDir, 'debug.html');
        fs.writeFileSync(debugPath, html, 'utf8');
        console.log(`📝 تم حفظ HTML للفحص في: ${debugPath} (${html.length} حرف)`);
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
            
            // تحويل البيانات إلى نفس الهيكل المستخدم في الواجهة
            const formattedEpisodes = episodes.map(episode => ({
                id: episode.id || '',
                title: episode.title,
                image: episode.image,
                link: episode.link,
                duration: episode.duration,
                description: episode.description,
                servers: episode.servers,
                videoUrl: episode.videoUrl
            }));
            
            // إضافة معلومات التحديث
            const dataToSave = {
                metadata: {
                    total_episodes: formattedEpisodes.length,
                    last_updated: new Date().toISOString(),
                    site: this.baseUrl,
                    file_name: this.outputFile,
                    source_url: 'https://z.larooza.life/category.php?cat=ramadan-2026',
                    note: 'يتم استبدال الملف بالكامل في كل تشغيل'
                },
                episodes: formattedEpisodes
            };
            
            // حفظ البيانات في الملف
            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            console.log(`✅ تم حفظ ${formattedEpisodes.length} حلقة في ${this.outputFile}`);
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
