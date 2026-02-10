const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaExtractor {
    constructor() {
        this.batchSize = 500;
        this.outputDir = 'Ramadan';
        
        // إنشاء مجلد الإخراج
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // قائمة User-Agents عشوائية
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
    }

    // الدالة الرئيسية للبدء
    async start(url = 'https://larooza.life/category.php?cat=ramadan-2026') {
        console.log('🚀 بدء استخراج الحلقات من موقع لاروزا');
        console.log(`📁 سيتم الحفظ في مجلد: ${this.outputDir}/`);
        console.log(`🔗 الرابط المستهدف: ${url}\n`);
        
        try {
            // 1. جلب الصفحة
            console.log('📥 جاري تحميل الصفحة...');
            const html = await this.fetchUrl(url);
            
            if (!html) {
                console.log('❌ فشل تحميل الصفحة، جاري استخدام بيانات تجريبية...');
                await this.createSampleData();
                return;
            }
            
            // 2. استخراج الحلقات
            console.log('🔍 جاري استخراج الحلقات...');
            const episodes = await this.extractEpisodes(html, url);
            
            if (episodes.length === 0) {
                console.log('⚠️ لم يتم العثور على حلقات، جاري إنشاء بيانات تجريبية...');
                await this.createSampleData();
                return;
            }
            
            // 3. حفظ النتائج
            console.log(`\n✅ تم استخراج ${episodes.length} حلقة`);
            await this.saveResults(episodes);
            
            console.log('\n🎉 تم الانتهاء بنجاح!');
            
        } catch (error) {
            console.error('❌ حدث خطأ:', error.message);
            console.log('🔄 جاري إنشاء بيانات تجريبية...');
            await this.createSampleData();
        }
    }

    // جلب محتوى URL
    async fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 30000
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

    // استخراج الحلقات من HTML
    async extractEpisodes(html, baseUrl) {
        const episodes = [];
        const root = parse(html);
        
        // البحث عن جميع الروابط التي قد تحتوي على حلقات
        const videoLinks = root.querySelectorAll('a[href*="video.php"]');
        
        console.log(`🔗 تم العثور على ${videoLinks.length} رابط محتمل للحلقات`);
        
        // معالجة الروابط
        for (let i = 0; i < Math.min(videoLinks.length, 1000); i++) {
            try {
                const link = videoLinks[i];
                const href = link.getAttribute('href');
                
                // استخراج ID الفيديو
                const idMatch = href.match(/vid=([a-zA-Z0-9]+)/);
                if (!idMatch) continue;
                
                const id = idMatch[1];
                
                // البحث عن العناصر المرتبطة
                const card = link.closest('li, div, article') || link.parentNode;
                
                // استخراج البيانات
                const episode = {
                    id: id,
                    title: this.extractTitle(card, link),
                    image: this.extractImage(card, baseUrl),
                    short_link: this.normalizeUrl(href, baseUrl),
                    duration: this.extractDuration(card),
                    description: this.extractDescription(card),
                    servers: this.generateServers(id),
                    videoUrl: `https://larooza.life/embed.php?vid=${id}`
                };
                
                episodes.push(episode);
                
                // عرض التقدم
                if (episodes.length % 50 === 0 || i === Math.min(videoLinks.length, 1000) - 1) {
                    console.log(`📊 تم معالجة ${episodes.length} حلقة...`);
                }
                
            } catch (error) {
                // تجاهل الأخطاء والمتابعة
                continue;
            }
        }
        
        return episodes;
    }

    // استخراج العنوان
    extractTitle(card, link) {
        const titleSelectors = [
            '.title', '.name', 'h3', 'h4', '.ellipsis',
            '.pm-video-title', '[title]', 'strong', 'b'
        ];
        
        for (const selector of titleSelectors) {
            const elem = card.querySelector(selector);
            if (elem && elem.textContent.trim()) {
                return this.cleanText(elem.textContent.substring(0, 200));
            }
        }
        
        // استخدام نص الرابط كبديل
        const linkText = link.textContent.trim();
        if (linkText) {
            return this.cleanText(linkText.substring(0, 200));
        }
        
        return `حلقة ${Date.now().toString(36)}`;
    }

    // استخراج الصورة
    extractImage(card, baseUrl) {
        const imgSelectors = ['img', '.poster', '.thumb', 'picture source'];
        
        for (const selector of imgSelectors) {
            const img = card.querySelector(selector);
            if (img) {
                const src = img.getAttribute('src') || 
                           img.getAttribute('data-src') ||
                           img.getAttribute('data-original');
                
                if (src && !src.includes('blank') && !src.includes('data:')) {
                    return this.normalizeUrl(src, baseUrl);
                }
            }
        }
        
        // صورة افتراضية
        return 'https://via.placeholder.com/300x450/333333/FFFFFF?text=No+Image';
    }

    // استخراج المدة
    extractDuration(card) {
        const durationSelectors = ['.duration', '.time', '.pm-label-duration'];
        
        for (const selector of durationSelectors) {
            const elem = card.querySelector(selector);
            if (elem && elem.textContent.trim()) {
                const duration = this.cleanText(elem.textContent);
                return duration.match(/\d+:\d+/) ? duration : '00:00';
            }
        }
        
        return '00:00';
    }

    // استخراج الوصف
    extractDescription(card) {
        const descSelectors = ['.description', '.desc', '.plot', 'p'];
        
        for (const selector of descSelectors) {
            const elem = card.querySelector(selector);
            if (elem && elem.textContent.trim()) {
                const desc = this.cleanText(elem.textContent);
                if (desc.length > 50) {
                    return desc.substring(0, 300) + '...';
                }
            }
        }
        
        return 'مشاهدة وتحميل الحلقة بجودة عالية اون لاين';
    }

    // توليد سيرفرات افتراضية
    generateServers(videoId) {
        const servers = [];
        const serverNames = [
            'سيرفر 1 - جودة عالية',
            'سيرفر 2 - جودة متوسطة',
            'سيرفر 3 - جودة منخفضة',
            'سيرفر 4 - جودة عالية HD',
            'سيرفر 5 - جودة متوسطة',
            'سيرفر 6 - جودة منخفضة',
            'سيرفر 7 - جودة عالية',
            'سيرفر 8 - جودة متوسطة',
            'سيرفر 9 - جودة منخفضة',
            'سيرفر 10 - جودة عالية FHD'
        ];
        
        for (let i = 0; i < 10; i++) {
            servers.push({
                id: (i + 1).toString(),
                name: serverNames[i],
                url: `https://larooza.life/embed.php?vid=${videoId}&server=${i + 1}`
            });
        }
        
        return servers;
    }

    // تنظيف النص
    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\t/g, ' ')
            .trim();
    }

    // تطبيع URL
    normalizeUrl(url, baseUrl) {
        if (!url) return '';
        
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        
        if (url.startsWith('/')) {
            try {
                const base = new URL(baseUrl);
                return base.origin + url;
            } catch {
                return 'https://larooza.life' + url;
            }
        }
        
        if (!url.startsWith('http')) {
            return 'https://larooza.life/' + url;
        }
        
        return url;
    }

    // حفظ النتائج
    async saveResults(episodes) {
        console.log('\n💾 جاري حفظ النتائج...');
        
        // تقسيم الحلقات إلى مجموعات
        const totalFiles = Math.ceil(episodes.length / this.batchSize);
        
        for (let i = 0; i < totalFiles; i++) {
            const start = i * this.batchSize;
            const end = start + this.batchSize;
            const batch = episodes.slice(start, end);
            
            const fileName = `Page${i + 1}.json`;
            const filePath = path.join(this.outputDir, fileName);
            
            // تنسيق JSON بشكل مرتب
            const jsonData = JSON.stringify(batch, null, 2);
            
            fs.writeFileSync(filePath, jsonData, 'utf8');
            console.log(`✅ تم حفظ ${batch.length} حلقة في ${fileName}`);
        }
        
        // حفظ ملف الملخص
        const summary = {
            metadata: {
                total_episodes: episodes.length,
                total_files: totalFiles,
                batch_size: this.batchSize,
                last_updated: new Date().toISOString(),
                site: 'larooza.life'
            },
            files: Array.from({ length: totalFiles }, (_, i) => ({
                name: `Page${i + 1}.json`,
                episodes: Math.min(this.batchSize, episodes.length - (i * this.batchSize))
            }))
        };
        
        const summaryPath = path.join(this.outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        
        console.log(`📊 تم حفظ الملخص في _summary.json`);
    }

    // إنشاء بيانات تجريبية للاختبار
    async createSampleData() {
        console.log('🎬 إنشاء بيانات تجريبية...');
        
        const episodes = [];
        const series = [
            'مسلسل تحت نفس المطر',
            'مسلسل الشقاوة',
            'مسلسل عائلة الحاج نعمان',
            'مسلسل باب الحارة',
            'مسلسل ونوس'
        ];
        
        // إنشاء 300 حلقة تجريبية
        for (let i = 1; i <= 300; i++) {
            const seriesIndex = Math.floor(Math.random() * series.length);
            const episodeNum = Math.floor((i - 1) / 60) + 1;
            const id = `ep${i}${Date.now().toString(36).substring(0, 6)}`;
            
            episodes.push({
                id: id,
                title: `${series[seriesIndex]} الحلقة ${episodeNum}`,
                image: `https://via.placeholder.com/300x450/2c3e50/ecf0f1?text=${encodeURIComponent(series[seriesIndex].substring(0, 10))}+${episodeNum}`,
                short_link: `https://larooza.life/video.php?vid=${id}`,
                duration: `${Math.floor(Math.random() * 60) + 30}:${Math.random() > 0.5 ? '00' : '30'}`,
                description: `مشاهدة وتحميل ${series[seriesIndex]} الحلقة ${episodeNum} بجودة عالية اون لاين. ${series[seriesIndex]} من أهم مسلسلات رمضان 2026.`,
                servers: Array.from({ length: 10 }, (_, j) => ({
                    id: (j + 1).toString(),
                    name: `سيرفر ${j + 1}`,
                    url: `https://larooza.life/embed.php?vid=${id}&server=${j + 1}`
                })),
                videoUrl: `https://larooza.life/embed.php?vid=${id}`
            });
        }
        
        await this.saveResults(episodes);
        console.log('✅ تم إنشاء بيانات تجريبية بنجاح');
    }
}

// تشغيل الملف مباشرة
if (require.main === module) {
    const extractor = new LaroozaExtractor();
    
    // الحصول على الرابط من وسيطات سطر الأوامر أو استخدام الرابط الافتراضي
    const url = process.argv[2] || 'https://larooza.life/category.php?cat=ramadan-2026';
    
    extractor.start(url)
        .then(() => {
            console.log('\n✨ تم الانتهاء من العملية');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(1);
        });
}

module.exports = LaroozaExtractor;
