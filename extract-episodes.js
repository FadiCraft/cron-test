const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.outputFile = 'kj.json';
        this.historyFile = 'extracted_history.json';
        this.baseUrl = 'https://z.larooza.life';
        this.extractedHistory = new Set();
        this.maxEpisodesPerRun = 5; // الحد الأقصى للحلقات في كل مرة
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // تحميل سجل الاستخراج
        this.loadExtractionHistory();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        this.requestDelay = 1000;
        this.timeout = 20000;
    }

    // تحميل سجل كل ما تم استخراجه من قبل
    loadExtractionHistory() {
        const historyPath = path.join(this.outputDir, this.historyFile);
        
        if (fs.existsSync(historyPath)) {
            try {
                const data = fs.readFileSync(historyPath, 'utf8');
                const history = JSON.parse(data);
                this.extractedHistory = new Set(history.extracted_ids || []);
                console.log(`📚 تم تحميل سجل ${this.extractedHistory.size} حلقة مستخرجة سابقاً`);
            } catch (error) {
                console.log('⚠️ خطأ في تحميل سجل الاستخراج:', error.message);
                this.extractedHistory = new Set();
            }
        } else {
            console.log('📝 لا يوجد سجل استخراج سابق، سيبدأ من الصفر');
            this.extractedHistory = new Set();
        }
    }

    // حفظ سجل الاستخراج
    saveExtractionHistory(newIds = []) {
        const historyPath = path.join(this.outputDir, this.historyFile);
        
        // إضافة المعرفات الجديدة إلى السجل
        newIds.forEach(id => {
            this.extractedHistory.add(id);
        });
        
        const historyData = {
            last_updated: new Date().toISOString(),
            total_extracted: this.extractedHistory.size,
            extracted_ids: Array.from(this.extractedHistory)
        };
        
        fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
        console.log(`📝 تم تحديث سجل الاستخراج: ${this.extractedHistory.size} حلقة إجمالاً`);
    }

    // تأخير بين الطلبات
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
        console.log(`📝 سجل الاستخراج: ${this.extractedHistory.size} حلقة مستخرجة سابقاً`);
        console.log(`🔗 الرابط: ${url}`);
        console.log(`⏰ الحد الأقصى للحلقات في هذه الجولة: ${this.maxEpisodesPerRun}\n`);
        
        try {
            // 1. جلب الصفحة الرئيسية
            console.log('📥 جاري تحميل الصفحة الرئيسية...');
            const html = await this.fetchUrl(url);
            
            if (!html) {
                console.log('❌ فشل تحميل الصفحة');
                return;
            }
            
            // 2. استخراج جميع الحلقات من الصفحة
            console.log('🔍 جاري استخراج الحلقات من الصفحة...');
            const root = parse(html);
            const allEpisodes = this.extractAllEpisodesFromPage(root, url);
            
            if (allEpisodes.length === 0) {
                console.log('❌ لم يتم العثور على حلقات في الصفحة');
                await this.saveOnlyNewEpisodes([]);
                return;
            }
            
            console.log(`📊 وجدت ${allEpisodes.length} حلقة في الصفحة`);
            
            // 3. تصفية الحلقات الجديدة فقط (التي لم نستخرجها من قبل)
            const newEpisodes = this.filterNewEpisodes(allEpisodes);
            
            console.log(`🆕 ${newEpisodes.length} حلقة جديدة (لم تستخرج من قبل)`);
            
            if (newEpisodes.length === 0) {
                console.log('⚠️ لا توجد حلقات جديدة للاستخراج');
                await this.saveOnlyNewEpisodes([]); // حفظ ملف فارغ
                return;
            }
            
            // 4. تحديد عدد الحلقات المراد معالجتها (بحد أقصى 5)
            let episodesToProcess = newEpisodes;
            if (newEpisodes.length > this.maxEpisodesPerRun) {
                console.log(`⚠️ عدد الحلقات الجديدة (${newEpisodes.length}) يتجاوز الحد المسموح (${this.maxEpisodesPerRun})`);
                episodesToProcess = newEpisodes.slice(0, this.maxEpisodesPerRun);
                console.log(`📌 سيتم استخراج أول ${this.maxEpisodesPerRun} حلقة فقط في هذه الجولة`);
                console.log(`📌 باقي الحلقات (${newEpisodes.length - this.maxEpisodesPerRun}) ستتم معالجتها في المرات القادمة`);
            }
            
            // 5. استخراج التفاصيل الكاملة للحلقات الجديدة فقط
            console.log(`\n🔍 جاري استخراج تفاصيل ${episodesToProcess.length} حلقة...`);
            const detailedEpisodes = await this.extractDetailsForEpisodes(episodesToProcess);
            
            // 6. حفظ الحلقات الجديدة فقط في الملف
            await this.saveOnlyNewEpisodes(detailedEpisodes);
            
            // 7. تحديث سجل الاستخراج
            const newIds = detailedEpisodes.map(ep => ep.id).filter(id => id);
            if (newIds.length > 0) {
                this.saveExtractionHistory(newIds);
                
                // رسالة معلومات إضافية
                if (newEpisodes.length > this.maxEpisodesPerRun) {
                    const remaining = newEpisodes.length - this.maxEpisodesPerRun;
                    console.log(`\n📌 ملاحظة: لا يزال هناك ${remaining} حلقة جديدة لم تتم معالجتها`);
                    console.log(`📌 قم بتشغيل البرنامج مرة أخرى لاستخراج المزيد من الحلقات`);
                }
            }
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
        }
    }

    extractAllEpisodesFromPage(root, baseUrl) {
        const episodes = [];
        const seenUrls = new Set();
        
        console.log('🔎 البحث عن جميع الحلقات في الصفحة...');
        
        // البحث في جميع العناصر التي تحتوي على الحلقات
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
                        episode.id = `episode_${Date.now()}_${index}`;
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
                        // استخراج ID من الرابط
                        const vidMatch = href.match(/vid=([a-zA-Z0-9_-]+)/i);
                        const episodeId = vidMatch ? vidMatch[1] : `vid_${Date.now()}_${index}`;
                        
                        const episode = {
                            id: episodeId,
                            title: this.extractTitleFromElement(link),
                            image: this.extractImageFromElement(link),
                            link: this.fixUrl(href, baseUrl),
                            duration: '00:00',
                            description: '',
                            servers: [],
                            videoUrl: `${this.baseUrl}/embed.php?vid=${episodeId}`
                        };
                        
                        episodes.push(episode);
                    }
                } catch (error) {
                    console.log(`⚠️ خطأ في استخراج رابط ${index + 1}`);
                }
            });
        }
        
        return episodes;
    }

    // تصفية الحلقات الجديدة فقط (التي لم نستخرجها من قبل)
    filterNewEpisodes(allEpisodes) {
        const newEpisodes = [];
        
        allEpisodes.forEach(episode => {
            if (episode.id && !this.extractedHistory.has(episode.id)) {
                newEpisodes.push(episode);
            }
        });
        
        return newEpisodes;
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
                console.log(`📝 جاري استخراج تفاصيل الحلقة الجديدة (${i+1}/${episodes.length}): ${episode.title.substring(0, 30)}...`);
                
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
                if ((i + 1) % 5 === 0 || i + 1 === episodes.length) {
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
            
            // استخراج العنوان من meta tag
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
            // تحويل video.php إلى play.php للحصول على صفحة المشاهدة
            const playUrl = episodeUrl.replace('video.php', 'play.php');
            console.log(`🔗 جاري تحميل سيرفرات: ${playUrl.substring(0, 60)}...`);
            
            const html = await this.fetchUrl(playUrl);
            const root = parse(html);
            
            const servers = [];
            
            // البحث عن قائمة السيرفرات
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

    // حفظ الحلقات الجديدة فقط (يمسح الملف القديم ويحفظ الجديد فقط)
    async saveOnlyNewEpisodes(newEpisodes) {
        const filePath = path.join(this.outputDir, this.outputFile);
        
        try {
            console.log(`\n💾 جاري حفظ ${newEpisodes.length} حلقة جديدة في ${this.outputFile}...`);
            
            // تحويل البيانات
            const formattedEpisodes = newEpisodes.map(episode => ({
                id: episode.id || '',
                title: episode.title,
                image: episode.image,
                link: episode.link,
                duration: episode.duration,
                description: episode.description,
                servers: episode.servers,
                videoUrl: episode.videoUrl,
                extracted_at: new Date().toISOString()
            }));
            
            // إضافة معلومات التحديث
            const dataToSave = {
                metadata: {
                    total_new_episodes: formattedEpisodes.length,
                    last_updated: new Date().toISOString(),
                    site: this.baseUrl,
                    file_name: this.outputFile,
                    source_url: 'https://z.larooza.life/category.php?cat=ramadan-2026',
                    note: 'يحتوي فقط على الحلقات الجديدة التي لم تستخرج من قبل',
                    total_in_history: this.extractedHistory.size,
                    max_episodes_per_run: this.maxEpisodesPerRun,
                    next_run_info: formattedEpisodes.length < this.maxEpisodesPerRun ? 
                        'كل الحلقات الجديدة تمت معالجتها' : 
                        'يوجد المزيد من الحلقات لمعالجتها في المرة القادمة'
                },
                episodes: formattedEpisodes
            };
            
            // حفظ البيانات في الملف (سيحل محل أي بيانات قديمة)
            fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            if (formattedEpisodes.length > 0) {
                console.log(`✅ تم حفظ ${formattedEpisodes.length} حلقة جديدة في ${this.outputFile}`);
                console.log(`📅 تاريخ التحديث: ${dataToSave.metadata.last_updated}`);
                console.log(`📊 حجم الملف: ${Math.round(fs.statSync(filePath).size / 1024)} كيلوبايت`);
            } else {
                console.log(`💾 تم حفظ ملف فارغ (لا توجد حلقات جديدة)`);
            }
            
        } catch (error) {
            console.error('❌ خطأ في حفظ الملف:', error.message);
        }
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    const url = process.argv[2] || 'https://z.larooza.life/category.php?cat=ramadan-2026';
    
    console.log(`⚙️  الإعدادات: الحد الأقصى للحلقات = ${extractor.maxEpisodesPerRun}`);
    
    extractor.start(url)
        .then(() => {
            console.log('\n✨ تم الانتهاء من العملية بنجاح!');
            console.log(`📂 الملف النهائي: ${extractor.outputDir}/${extractor.outputFile}`);
            console.log(`📝 سجل الاستخراج: ${extractor.outputDir}/${extractor.historyFile}`);
            console.log(`🔢 تم استخراج ${extractor.maxEpisodesPerRun} حلقة كحد أقصى`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
