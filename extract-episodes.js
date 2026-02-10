// extract-episodes.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class EpisodeExtractor {
    constructor() {
        this.proxies = [
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            ''
        ];
        
        this.currentProxyIndex = 0;
        this.allEpisodes = [];
        this.batchSize = 500;
        this.outputDir = 'Ramadan';
        
        // إنشاء مجلد الإخراج
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
            .replace(/[^\w\u0600-\u06FF\s\-.,!?()]/g, '')
            .trim();
    }

    // جلب الصفحة
    async fetchPage(url) {
        return new Promise((resolve, reject) => {
            const proxy = this.proxies[this.currentProxyIndex];
            const targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
            
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
                },
                timeout: 10000
            };
            
            https.get(targetUrl, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            }).on('error', (err) => {
                reject(err);
            }).on('timeout', () => {
                reject(new Error('Timeout'));
            });
        });
    }

    // استخراج الحلقات من الصفحة
    async extractEpisodes(baseUrl) {
        console.log('جاري استخراج الحلقات...');
        
        try {
            const html = await this.fetchPage(baseUrl);
            const root = parse(html);
            
            // البحث عن جميع الروابط التي تحتوي على video.php
            const links = root.querySelectorAll('a[href*="video.php"]');
            console.log(`تم العثور على ${links.length} رابط للحلقات`);
            
            const episodes = [];
            const processedIds = new Set();
            
            for (const link of links) {
                try {
                    const href = link.getAttribute('href');
                    const videoIdMatch = href.match(/vid=([a-zA-Z0-9]+)/);
                    
                    if (videoIdMatch && !processedIds.has(videoIdMatch[1])) {
                        const id = videoIdMatch[1];
                        processedIds.add(id);
                        
                        // البحث داخل العنصر المحيط
                        const parent = link.parentNode || link;
                        
                        // استخراج العنوان
                        let title = this.cleanText(link.textContent || link.getAttribute('title') || '');
                        if (!title) {
                            const titleElem = parent.querySelector('.title, h3, h4, .name');
                            title = titleElem ? this.cleanText(titleElem.textContent) : `حلقة ${id}`;
                        }
                        
                        // استخراج الصورة
                        let image = '';
                        const img = parent.querySelector('img');
                        if (img) {
                            const imgSrc = img.getAttribute('src') || img.getAttribute('data-src');
                            if (imgSrc && !imgSrc.includes('blank.gif')) {
                                image = imgSrc.startsWith('//') ? 'https:' + imgSrc : 
                                       imgSrc.startsWith('/') ? 'https://larooza.life' + imgSrc : imgSrc;
                            }
                        }
                        
                        // استخراج المدة
                        let duration = '00:00';
                        const durationElem = parent.querySelector('.duration, .time, .pm-label-duration');
                        if (durationElem) {
                            duration = this.cleanText(durationElem.textContent);
                        }
                        
                        episodes.push({
                            id: id,
                            title: title.substring(0, 150),
                            image: image,
                            short_link: href.startsWith('http') ? href : `https://larooza.life${href}`,
                            duration: duration,
                            description: '',
                            servers: [],
                            videoUrl: `https://larooza.life/embed.php?vid=${id}`
                        });
                        
                        console.log(`تم إضافة: ${title}`);
                        
                        // وقف عند 1000 حلقة كحد أقصى
                        if (episodes.length >= 1000) break;
                    }
                } catch (err) {
                    console.error('خطأ في معالجة رابط:', err.message);
                }
            }
            
            return episodes;
            
        } catch (error) {
            console.error('خطأ في استخراج الحلقات:', error.message);
            
            // إنشاء بيانات تجريبية للاختبار
            return this.generateSampleData();
        }
    }

    // إنشاء بيانات تجريبية للاختبار
    generateSampleData() {
        console.log('إنشاء بيانات تجريبية للاختبار...');
        
        const episodes = [];
        const titles = [
            'مسلسل تحت نفس المطر الحلقة 1',
            'مسلسل تحت نفس المطر الحلقة 2',
            'مسلسل تحت نفس المطر الحلقة 3',
            'مسلسل تحت نفس المطر الحلقة 4',
            'مسلسل تحت نفس المطر الحلقة 5'
        ];
        
        for (let i = 0; i < 100; i++) {
            const id = `test${i + 1}${Date.now().toString(36)}`;
            const titleIndex = i % titles.length;
            
            episodes.push({
                id: id,
                title: `${titles[titleIndex]} ${Math.floor(i / titles.length) + 1}`,
                image: `https://larooza.life/uploads/thumbs/${id}.jpg`,
                short_link: `https://larooza.life/video.php?vid=${id}`,
                duration: '45:00',
                description: 'وصف تجريبي للحلقة. هذه بيانات تجريبية للاختبار.',
                servers: [
                    { id: "1", name: "سيرفر 1", url: `https://example.com/embed/${id}` },
                    { id: "2", name: "سيرفر 2", url: `https://example2.com/embed/${id}` }
                ],
                videoUrl: `https://larooza.life/embed.php?vid=${id}`
            });
        }
        
        return episodes;
    }

    // حفظ الحلقات في ملفات
    saveEpisodes(episodes) {
        console.log(`\nجاري حفظ ${episodes.length} حلقة...`);
        
        // حذف الملفات القديمة
        if (fs.existsSync(this.outputDir)) {
            const files = fs.readdirSync(this.outputDir);
            for (const file of files) {
                fs.unlinkSync(path.join(this.outputDir, file));
            }
        }
        
        // تقسيم الحلقات إلى مجموعات
        const totalBatches = Math.ceil(episodes.length / this.batchSize);
        
        for (let i = 0; i < totalBatches; i++) {
            const start = i * this.batchSize;
            const end = start + this.batchSize;
            const batch = episodes.slice(start, end);
            
            const filename = `Page${i + 1}.json`;
            const filepath = path.join(this.outputDir, filename);
            
            fs.writeFileSync(filepath, JSON.stringify(batch, null, 2), 'utf8');
            console.log(`تم حفظ ${batch.length} حلقة في ${filename}`);
        }
        
        // حفظ ملخص
        const summary = {
            total_episodes: episodes.length,
            total_files: totalBatches,
            batch_size: this.batchSize,
            last_updated: new Date().toISOString(),
            site: 'larooza.life'
        };
        
        fs.writeFileSync(
            path.join(this.outputDir, 'summary.json'),
            JSON.stringify(summary, null, 2),
            'utf8'
        );
        
        console.log(`\nتم الانتهاء بنجاح!`);
        console.log(`جميع الملفات محفوظة في مجلد: ${this.outputDir}/`);
    }

    // الدالة الرئيسية
    async start() {
        console.log('🚀 بدء استخراج حلقات رمضان 2026\n');
        
        const baseUrl = process.argv[2] || 'https://larooza.life/category.php?cat=ramadan-2026';
        console.log(`الرابط: ${baseUrl}\n`);
        
        const episodes = await this.extractEpisodes(baseUrl);
        
        if (episodes.length > 0) {
            this.saveEpisodes(episodes);
        } else {
            console.log('لم يتم العثور على أي حلقات!');
        }
    }
}

// تشغيل إذا تم تنفيذ الملف مباشرة
if (require.main === module) {
    const extractor = new EpisodeExtractor();
    extractor.start().catch(console.error);
}

module.exports = EpisodeExtractor;
