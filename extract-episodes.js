const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');

// تأكد من تثبيت axios أولاً: npm install axios

class EpisodeExtractor {
    constructor() {
        this.proxies = [
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://proxy.cors.sh/',
            'https://api.allorigins.win/raw?url='
        ];
        
        this.currentProxyIndex = 0;
        this.allEpisodes = [];
        this.batchSize = 500;
        this.outputDir = 'Ramadan';
        
        // إنشاء مجلد الإخراج إذا لم يكن موجوداً
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    // تنظيف النص
    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\u0600-\u06FF\s\-.,!?]/g, '')
            .trim();
    }

    // تنظيف العنوان
    cleanTitle(title) {
        return this.cleanText(title).substring(0, 100);
    }

    // إصلاح رابط الصورة
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
                return baseUrl + url;
            }
        }
        
        if (!url.startsWith('http')) {
            const base = new URL(baseUrl);
            return base.origin + '/' + url;
        }
        
        return url;
    }

    // جلب الصفحة مع المحاولة على عدة بروكسيات
    async fetchWithRetry(url, retries = 3) {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const proxy = this.proxies[this.currentProxyIndex];
                const targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                console.log(`المحاولة ${attempt + 1} مع بروكسي: ${proxy || 'مباشر'}`);
                
                const response = await axios.get(targetUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                        'Referer': 'https://larooza.life/'
                    }
                });
                
                return response.data;
            } catch (error) {
                console.error(`فشلت المحاولة ${attempt + 1}:`, error.message);
                this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
                
                if (attempt === retries - 1) {
                    throw error;
                }
                
                // انتظار قبل المحاولة التالية
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // استخراج الحلقات من الصفحة الرئيسية
    async extractEpisodesFromMainPage(url) {
        console.log('جاري تحميل الصفحة الرئيسية...');
        const html = await this.fetchWithRetry(url);
        
        // استخدام JSDOM لتحليل HTML
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const episodes = [];
        const episodeElements = doc.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3, article, .item');
        
        console.log(`تم العثور على ${episodeElements.length} عنصر`);
        
        for (const element of episodeElements) {
            try {
                const episode = await this.extractEpisodeFromElement(element, url);
                if (episode && episode.id) {
                    episodes.push(episode);
                    console.log(`تم استخراج: ${episode.title}`);
                }
            } catch (error) {
                console.error('خطأ في استخراج حلقة:', error.message);
            }
        }
        
        return episodes;
    }

    // استخراج بيانات الحلقة من العنصر
    async extractEpisodeFromElement(element, baseUrl) {
        // البحث عن الرابط
        const linkElement = element.querySelector('a');
        const href = linkElement ? linkElement.href : null;
        
        if (!href || !href.includes('video.php')) {
            return null;
        }
        
        // استخراج ID من الرابط
        const videoIdMatch = href.match(/vid=([a-zA-Z0-9]+)/);
        const id = videoIdMatch ? videoIdMatch[1] : null;
        
        if (!id) return null;
        
        // استخراج الصورة
        const imgElement = element.querySelector('img');
        let imageSrc = imgElement ? (imgElement.src || imgElement.getAttribute('data-src')) : null;
        
        // تنظيف عنوان الصورة
        if (imageSrc) {
            imageSrc = this.fixImageUrl(imageSrc, baseUrl);
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration, .duration, .time');
        const duration = durationElement ? this.cleanText(durationElement.textContent) : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis, .title, h3, h4');
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanTitle(titleElement.textContent || titleElement.getAttribute('title') || '');
        }
        
        return {
            id: id,
            title: title,
            image: imageSrc,
            short_link: href.startsWith('http') ? href : `https://larooza.life${href}`,
            duration: duration,
            description: '',
            servers: [],
            videoUrl: `https://larooza.life/embed.php?vid=${id}`
        };
    }

    // استخراج تفاصيل الحلقة من صفحتها
    async extractEpisodeDetails(episode) {
        try {
            console.log(`جاري استخراج تفاصيل: ${episode.title}`);
            const html = await this.fetchWithRetry(episode.short_link);
            
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            // استخراج الوصف
            const descMeta = doc.querySelector('meta[name="description"], meta[property="og:description"]');
            if (descMeta) {
                episode.description = this.cleanText(descMeta.getAttribute('content')).substring(0, 300);
            }
            
            // استخراج الصورة الرئيسية إذا لم تكن موجودة
            if (!episode.image) {
                const imageMeta = doc.querySelector('meta[property="og:image"]');
                if (imageMeta) {
                    episode.image = this.fixImageUrl(imageMeta.getAttribute('content'), episode.short_link);
                }
            }
            
            // استخراج السيرفرات
            episode.servers = await this.extractServers(episode.id);
            
            return episode;
        } catch (error) {
            console.error(`خطأ في استخراج تفاصيل ${episode.title}:`, error.message);
            return episode;
        }
    }

    // استخراج السيرفرات
    async extractServers(videoId) {
        try {
            const playUrl = `https://larooza.life/play.php?vid=${videoId}`;
            const html = await this.fetchWithRetry(playUrl);
            
            const { JSDOM } = require('jsdom');
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            const servers = [];
            const serverElements = doc.querySelectorAll('.WatchList li, .servers-list li, [data-embed-id]');
            
            serverElements.forEach((element, index) => {
                const embedUrl = element.getAttribute('data-embed-url') || 
                               element.querySelector('a')?.href;
                
                if (embedUrl) {
                    const nameElement = element.querySelector('strong, span, a');
                    const name = nameElement ? 
                        this.cleanText(nameElement.textContent) : 
                        `سيرفر ${index + 1}`;
                    
                    servers.push({
                        id: (index + 1).toString(),
                        name: name,
                        url: embedUrl
                    });
                }
            });
            
            // إذا لم نجد سيرفرات، نضيف بعض السيرفرات الافتراضية
            if (servers.length === 0) {
                servers.push({
                    id: "1",
                    name: "سيرفر افتراضي",
                    url: `https://larooza.life/embed.php?vid=${videoId}`
                });
            }
            
            return servers;
        } catch (error) {
            console.error(`خطأ في استخراج السيرفرات:`, error.message);
            return [{
                id: "1",
                name: "سيرفر افتراضي",
                url: `https://larooza.life/embed.php?vid=${videoId}`
            }];
        }
    }

    // حفظ الحلقات في ملفات JSON
    saveEpisodesToFiles(episodes) {
        const totalBatches = Math.ceil(episodes.length / this.batchSize);
        
        console.log(`\nجاري حفظ ${episodes.length} حلقة في ${totalBatches} ملف(ات)...`);
        
        for (let i = 0; i < totalBatches; i++) {
            const start = i * this.batchSize;
            const end = start + this.batchSize;
            const batch = episodes.slice(start, end);
            
            const filename = `Page${i + 1}.json`;
            const filepath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(batch, null, 2), 'utf8');
            console.log(`تم حفظ ${batch.length} حلقة في ${filename}`);
        }
        
        // حفظ ملف ملخص
        const summary = {
            total_episodes: episodes.length,
            total_files: totalBatches,
            last_updated: new Date().toISOString(),
            batch_size: this.batchSize
        };
        
        fs.writeFileSync(
            path.join(this.outputDir, 'summary.json'),
            JSON.stringify(summary, null, 2),
            'utf8'
        );
        
        console.log(`\nتم الانتهاء! تم حفظ جميع الحلقات في مجلد ${this.outputDir}/`);
    }

    // الدالة الرئيسية للبدء
    async startExtraction(baseUrl = 'https://larooza.life/category.php?cat=ramadan-2026') {
        console.log('بدء استخراج الحلقات...');
        console.log('الرابط:', baseUrl);
        
        try {
            // استخراج الحلقات من الصفحة الرئيسية
            let episodes = await this.extractEpisodesFromMainPage(baseUrl);
            
            console.log(`\nتم استخراج ${episodes.length} حلقة من الصفحة الرئيسية`);
            
            // استخراج تفاصيل كل حلقة
            console.log('\nجاري استخراج التفاصيل الكاملة...');
            for (let i = 0; i < episodes.length; i++) {
                episodes[i] = await this.extractEpisodeDetails(episodes[i]);
                
                // عرض التقدم
                if ((i + 1) % 10 === 0 || i === episodes.length - 1) {
                    console.log(`تم معالجة ${i + 1}/${episodes.length} حلقة`);
                }
            }
            
            // حفظ الحلقات في ملفات
            this.saveEpisodesToFiles(episodes);
            
            return episodes;
            
        } catch (error) {
            console.error('حدث خطأ أثناء الاستخراج:', error);
            process.exit(1);
        }
    }
}

// تنفيذ الاستخراج إذا تم تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new EpisodeExtractor();
    
    // يمكن تغيير الرابط من خلال وسيطات سطر الأوامر
    const baseUrl = process.argv[2] || 'https://larooza.life/category.php?cat=ramadan-2026';
    
    extractor.startExtraction(baseUrl)
        .then(() => {
            console.log('\nتم الانتهاء بنجاح!');
            process.exit(0);
        })
        .catch(error => {
            console.error('فشل الاستخراج:', error);
            process.exit(1);
        });
}

module.exports = EpisodeExtractor;
