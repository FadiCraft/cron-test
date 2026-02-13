// ramadan-extractor.js - مستخرج حلقات رمضان 2026 مع دعم التحديثات
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
    BASE_URL: 'https://larooza.life',
    CATEGORY: 'ramadan-2026',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        ''
    ],
    EPISODES_PER_FILE: 500,
    DATA_DIR: 'data/Ramdan',
    MAX_PAGES: 100, // حد أقصى للصفحات للتأكد
    REQUEST_DELAY: 1000, // تأخير بين الطلبات (1 ثانية)
    USER_AGENTS: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ]
};

class RamadanExtractor {
    constructor() {
        this.allEpisodes = [];
        this.existingEpisodes = new Map(); // للتخزين المؤقت للعناصر الموجودة
        this.stats = {
            totalExtracted: 0,
            newEpisodes: 0,
            pagesScanned: 0,
            startTime: Date.now()
        };
    }

    // دالة عشوائية لاختيار User-Agent
    getRandomUserAgent() {
        return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
    }

    // جلب المحتوى مع محاولات متعددة
    async fetch(url, retryCount = 0) {
        for (const proxy of CONFIG.PROXIES) {
            try {
                const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
                
                const response = await axios({
                    method: 'get',
                    url: fetchUrl,
                    timeout: 30000,
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    },
                    maxRedirects: 5,
                    validateStatus: status => status < 400
                });
                
                if (response.data && typeof response.data === 'string' && response.data.length > 500) {
                    return response.data;
                }
            } catch (e) {
                // تجاهل الخطأ وجرب البروكسي التالي
                continue;
            }
        }
        
        // إذا فشلت كل المحاولات
        if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            return this.fetch(url, retryCount + 1);
        }
        
        throw new Error(`فشل الاتصال بـ ${url}`);
    }

    // استخراج عدد الصفحات المتاحة
    async getTotalPages() {
        console.log('🔍 جاري تحديد عدد الصفحات المتاحة...');
        
        try {
            const firstPageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=1&order=DESC`;
            const html = await this.fetch(firstPageUrl);
            const $ = cheerio.load(html);
            
            // محاولة العثور على روابط الترقيم
            let totalPages = 1;
            
            // البحث عن عناصر الترقيم المختلفة
            $('.pagination a, .pages a, .pager a, .wp-pagenavi a, .page-numbers').each((i, el) => {
                const text = $(el).text().trim();
                const num = parseInt(text);
                if (!isNaN(num) && num > totalPages) {
                    totalPages = num;
                }
            });
            
            // إذا لم نجد ترقيم، نحاول استخراج من "last page" أو "previous"
            if (totalPages === 1) {
                // البحث عن آخر صفحة في الروابط
                $('a[href*="page="]').each((i, el) => {
                    const href = $(el).attr('href');
                    const match = href.match(/page=(\d+)/i);
                    if (match && match[1]) {
                        const num = parseInt(match[1]);
                        if (num > totalPages) totalPages = num;
                    }
                });
            }
            
            // حد أقصى للحماية
            totalPages = Math.min(totalPages, CONFIG.MAX_PAGES);
            
            console.log(`📊 تم العثور على ${totalPages} صفحة`);
            return totalPages;
            
        } catch (error) {
            console.log('⚠️ لم نتمكن من تحديد عدد الصفحات، سنفترض 20 صفحة');
            return 20;
        }
    }

    // استخراج الحلقات من صفحة محددة
    async extractPage(pageNum) {
        const pageUrl = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNum}&order=DESC`;
        console.log(`📄 الصفحة ${pageNum}: ${pageUrl}`);
        
        try {
            const html = await this.fetch(pageUrl);
            const $ = cheerio.load(html);
            
            const pageEpisodes = [];
            let found = 0;
            
            // محاولة استخراج الحلقات بعدة طرق
            const selectors = [
                'li.col-xs-6',
                'li.col-sm-4',
                'li.col-md-3',
                '.post',
                '.item',
                'article',
                '.video-item',
                '.episode-item',
                '.movie-item'
            ];
            
            for (const selector of selectors) {
                $(selector).each((index, element) => {
                    try {
                        const $el = $(element);
                        
                        // استخراج الرابط
                        let link = $el.find('a[href*="video.php"]').attr('href') || 
                                  $el.find('a[href*="play.php"]').attr('href') ||
                                  $el.find('a[href*="watch"]').attr('href') ||
                                  $el.find('a').first().attr('href');
                        
                        if (!link || link === '#' || link.includes('javascript')) {
                            return;
                        }
                        
                        // بناء الرابط الكامل
                        if (!link.startsWith('http')) {
                            link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                        }
                        
                        // استخراج العنوان
                        let title = $el.find('.ellipsis').text().trim() || 
                                   $el.find('h2, h3, .title, .name').first().text().trim() ||
                                   $el.find('img').attr('alt') ||
                                   $el.attr('title') ||
                                   `حلقة ${pageNum}-${index + 1}`;
                        
                        // استخراج الصورة
                        let image = $el.find('img').attr('src') || 
                                   $el.find('img').attr('data-src') || 
                                   $el.find('img').attr('data-original') || 
                                   '';
                        
                        // استخراج المدة
                        let duration = $el.find('.duration, .time, .pm-label-duration, .runtime').first().text().trim() || '00:00';
                        
                        // إنشاء معرف فريد للحلقة
                        const episodeId = this.generateEpisodeId(link, title);
                        
                        // التحقق من وجود الحلقة مسبقاً
                        if (!this.existingEpisodes.has(episodeId)) {
                            const episode = {
                                id: episodeId,
                                page: pageNum,
                                title: this.cleanTitle(title),
                                link: link,
                                image: this.fixImage(image),
                                duration: duration,
                                servers: [],
                                extracted_at: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                            
                            pageEpisodes.push(episode);
                            found++;
                            this.stats.totalExtracted++;
                        }
                        
                    } catch (e) {
                        // تجاهل الخطأ الفردي
                    }
                });
                
                if (found > 0) break;
            }
            
            console.log(`   ✅ استخرجنا ${found} حلقة جديدة من الصفحة ${pageNum}`);
            return pageEpisodes;
            
        } catch (error) {
            console.log(`   ❌ فشل في استخراج الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }

    // إنشاء معرف فريد للحلقة
    generateEpisodeId(link, title) {
        // استخراج رقم الحلقة من الرابط إذا وجد
        const videoIdMatch = link.match(/[?&]id=(\d+)/) || link.match(/video[/-](\d+)/);
        if (videoIdMatch && videoIdMatch[1]) {
            return `vid-${videoIdMatch[1]}`;
        }
        
        // استخدام عنوان مقصوص كمعرف
        const cleanTitle = this.cleanTitle(title).substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-');
        return `ep-${cleanTitle}-${Date.now()}`;
    }

    // تحميل البيانات الموجودة
    async loadExistingData() {
        console.log('📂 جاري تحميل البيانات الموجودة...');
        
        try {
            const indexPath = path.join(CONFIG.DATA_DIR, 'index.json');
            const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
            
            if (indexExists) {
                const indexData = JSON.parse(await fs.readFile(indexPath, 'utf8'));
                
                // تحميل كل الحلقات الموجودة
                for (const file of indexData.files) {
                    try {
                        const filePath = path.join(CONFIG.DATA_DIR, file);
                        const pageData = JSON.parse(await fs.readFile(filePath, 'utf8'));
                        
                        for (const episode of pageData.episodes) {
                            this.existingEpisodes.set(episode.id, episode);
                        }
                    } catch (e) {
                        console.log(`   ⚠️ لا يمكن قراءة ${file}`);
                    }
                }
                
                console.log(`   ✅ تم تحميل ${this.existingEpisodes.size} حلقة موجودة`);
            } else {
                console.log('   ℹ️ لا توجد بيانات سابقة، سنبدأ من الصفر');
            }
        } catch (error) {
            console.log('   ⚠️ خطأ في تحميل البيانات السابقة');
        }
    }

    // المرحلة الأولى: استخراج جميع الصفحات
    async extractAllPages() {
        console.log('\n' + '='.repeat(60));
        console.log('🎬 المرحلة الأولى: استخراج جميع الصفحات');
        console.log('='.repeat(60) + '\n');
        
        // تحميل البيانات الموجودة
        await this.loadExistingData();
        
        // معرفة عدد الصفحات
        const totalPages = await this.getTotalPages();
        this.stats.pagesScanned = totalPages;
        
        // استخراج كل الصفحات
        for (let page = 1; page <= totalPages; page++) {
            const pageEpisodes = await this.extractPage(page);
            
            if (pageEpisodes.length > 0) {
                this.allEpisodes.push(...pageEpisodes);
            }
            
            // تأخير بين الطلبات
            if (page < totalPages) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.REQUEST_DELAY));
            }
        }
        
        // دمج مع الحلقات الموجودة
        const mergedEpisodes = [...this.existingEpisodes.values(), ...this.allEpisodes];
        this.allEpisodes = mergedEpisodes;
        
        console.log(`\n📊 إجمالي الحلقات بعد الدمج: ${this.allEpisodes.length}`);
        console.log(`   ✅ حلقات جديدة: ${this.allEpisodes.length - this.existingEpisodes.size}`);
        
        this.stats.newEpisodes = this.allEpisodes.length - this.existingEpisodes.size;
    }

    // المرحلة الثانية: فحص الصفحة الأولى فقط للتحديثات
    async checkForUpdates() {
        console.log('\n' + '='.repeat(60));
        console.log('🔄 المرحلة الثانية: فحص التحديثات الجديدة');
        console.log('='.repeat(60) + '\n');
        
        // تحميل البيانات الموجودة
        await this.loadExistingData();
        
        // استخراج الصفحة الأولى فقط
        const newEpisodes = await this.extractPage(1);
        
        // التحقق من الجدد
        const trulyNew = newEpisodes.filter(ep => !this.existingEpisodes.has(ep.id));
        
        if (trulyNew.length > 0) {
            console.log(`\n✅ تم العثور على ${trulyNew.length} حلقة جديدة!`);
            
            // إضافة الجدد للقائمة
            this.allEpisodes = [...this.existingEpisodes.values(), ...trulyNew];
            this.stats.newEpisodes = trulyNew.length;
            this.stats.totalExtracted = trulyNew.length;
            
            // ترتيب حسب التاريخ (الأحدث أولاً)
            this.allEpisodes.sort((a, b) => 
                new Date(b.extracted_at) - new Date(a.extracted_at)
            );
            
        } else {
            console.log('\n📭 لا توجد حلقات جديدة');
            this.allEpisodes = [...this.existingEpisodes.values()];
            this.stats.newEpisodes = 0;
        }
        
        this.stats.pagesScanned = 1;
    }

    // حفظ البيانات في ملفات
    async saveFiles() {
        console.log('\n💾 حفظ البيانات...');
        
        // إنشاء المجلد
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // ترتيب الحلقات (الأحدث أولاً)
        const sortedEpisodes = [...this.allEpisodes].sort((a, b) => {
            return new Date(b.extracted_at) - new Date(a.extracted_at);
        });
        
        // تقسيم الحلقات
        const chunks = [];
        for (let i = 0; i < sortedEpisodes.length; i += CONFIG.EPISODES_PER_FILE) {
            chunks.push(sortedEpisodes.slice(i, i + CONFIG.EPISODES_PER_FILE));
        }
        
        // حفظ الملفات
        for (let i = 0; i < chunks.length; i++) {
            const pageNum = i + 1;
            const fileName = `page${pageNum}.json`;
            const filePath = path.join(CONFIG.DATA_DIR, fileName);
            
            const data = {
                page: pageNum,
                total_pages: chunks.length,
                total_episodes: sortedEpisodes.length,
                episodes_in_page: chunks[i].length,
                updated_at: new Date().toISOString(),
                episodes: chunks[i]
            };
            
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            console.log(`📄 ${fileName} - ${chunks[i].length} حلقة`);
        }
        
        // حفظ الفهرس
        const indexData = {
            last_update: new Date().toISOString(),
            total_episodes: sortedEpisodes.length,
            total_pages: chunks.length,
            episodes_per_file: CONFIG.EPISODES_PER_FILE,
            files: chunks.map((_, i) => `page${i + 1}.json`),
            stats: {
                new_episodes_added: this.stats.newEpisodes,
                pages_scanned: this.stats.pagesScanned,
                extraction_time: `${((Date.now() - this.stats.startTime) / 1000).toFixed(2)} ثانية`
            }
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
        
        console.log(`📄 index.json - فهرس البيانات`);
        
        // إحصائيات
        console.log('\n📊 الإحصائيات النهائية:');
        console.log(`   📁 ${chunks.length} ملف`);
        console.log(`   🎬 ${sortedEpisodes.length} إجمالي الحلقات`);
        console.log(`   ✨ ${this.stats.newEpisodes} حلقة جديدة`);
        console.log(`   ⏱️  ${indexData.stats.extraction_time}`);
    }

    // دوال مساعدة للتنظيف
    cleanTitle(text) {
        if (!text) return 'بدون عنوان';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 100) || 'بدون عنوان';
    }

    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        if (!url.startsWith('http')) return CONFIG.BASE_URL + '/' + url;
        return url;
    }
}

// واجهة سطر الأوامر
async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'full';
    
    const extractor = new RamadanExtractor();
    
    if (mode === 'full' || mode === '--full') {
        // المرحلة الأولى: استخراج جميع الصفحات
        await extractor.extractAllPages();
        
    } else if (mode === 'update' || mode === '--update') {
        // المرحلة الثانية: فحص التحديثات فقط
        await extractor.checkForUpdates();
        
    } else {
        console.log('📌 استعمال البرنامج:');
        console.log('   node ramadan-extractor.js full    # استخراج جميع الصفحات');
        console.log('   node ramadan-extractor.js update  # فحص التحديثات فقط');
        console.log('   node ramadan-extractor.js         # نفس full');
        process.exit(1);
    }
    
    // حفظ النتائج
    await extractor.saveFiles();
    
    console.log('\n✅ تم الانتهاء بنجاح!');
}

// تشغيل البرنامج
main().catch(error => {
    console.error('\n❌ خطأ:', error.message);
    process.exit(1);
});
