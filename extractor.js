// extractor.js - النسخة التزايدية الذكية (تفحص كل حلقة على حدة)
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
    BASE_URL: 'https://q.larozavideo.net',
    CATEGORY: 'ramadan-2026',
    EPISODES_PER_FILE: 500,
    DATA_DIR: 'data/Ramdan',
    PROXIES: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        ''
    ],
    DELAY_BETWEEN_PAGES: 1500,
    DELAY_BETWEEN_SERVERS: 500,
    MAX_PAGES: 50 // حد أقصى للصفحات (للأمان)
};

class SmartIncrementalExtractor {
    constructor() {
        this.newEpisodes = [];
        this.existingLinks = new Set();
        this.totalNewServers = 0;
    }

    // ===========================================
    // 1. تحميل جميع الروابط الموجودة
    // ===========================================
    async loadExistingEpisodes() {
        console.log('\n📂 تحميل الحلقات الموجودة...');
        
        try {
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
            const files = await fs.readdir(CONFIG.DATA_DIR);
            const jsonFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'));
            
            let count = 0;
            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(CONFIG.DATA_DIR, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const data = JSON.parse(content);
                    
                    if (data.episodes) {
                        for (const ep of data.episodes) {
                            if (ep.link) {
                                this.existingLinks.add(ep.link);
                                count++;
                            }
                        }
                    }
                } catch (e) {
                    // تجاهل الأخطاء
                }
            }
            
            console.log(`✅ لدينا ${count} حلقة موجودة مسبقاً`);
            
        } catch (error) {
            console.log('📁 لا توجد ملفات سابقة - هذه أول تشغيلة');
        }
    }

    // ===========================================
    // 2. الاتصال بالموقع
    // ===========================================
    async fetch(url) {
        for (const proxy of CONFIG.PROXIES) {
            try {
                const fetchUrl = proxy ? proxy + encodeURIComponent(url) : url;
                const response = await axios({
                    method: 'get',
                    url: fetchUrl,
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                if (response.data && response.data.length > 500) {
                    return response.data;
                }
            } catch (e) {
                // جرب البروكسي التالي
            }
        }
        return null;
    }

    // ===========================================
    // 3. فحص صفحة واحدة وأخذ الجديد فقط
    // ===========================================
    async extractNewFromPage(pageNumber) {
        const url = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNumber}&order=DESC`;
        console.log(`\n📄 الصفحة ${pageNumber}...`);
        
        const html = await this.fetch(url);
        if (!html) {
            console.log(`   ❌ فشل الاتصال`);
            return [];
        }
        
        const $ = cheerio.load(html);
        const newInThisPage = [];
        
        // فحص كل حلقة في الصفحة
        $('li.col-xs-6, li.col-sm-4, li.col-md-3').each((index, element) => {
            const $el = $(element);
            const $link = $el.find('a[href*="video.php"]').first();
            
            let link = $link.attr('href') || '';
            if (!link) return;
            
            // تصحيح الرابط
            if (!link.startsWith('http')) {
                link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
            }
            
            // ★★★ الأهم: نتحقق من الرابط ★★★
            if (this.existingLinks.has(link)) {
                console.log(`   ⏭️ حلقة قديمة: ${link.split('/').pop()}`);
                return; // نتجاهلها ونكمل
            }
            
            // ===== حلقة جديدة =====
            let title = $el.find('.ellipsis').text().trim() ||
                       $link.attr('title')?.trim() ||
                       `حلقة جديدة`;
            
            let image = $el.find('img').attr('src') ||
                       $el.find('img').attr('data-src') ||
                       '';
            
            if (image.includes('blank.gif') || image.includes('data:image')) {
                image = '';
            }
            
            let duration = $el.find('.pm-label-duration').first().text().trim() || '00:00';
            
            const newEpisode = {
                id: `ramadan-${Date.now()}-p${pageNumber}-${index}`,
                page: pageNumber,
                title: this.cleanTitle(title),
                link: link,
                image: this.fixImage(image),
                duration: duration,
                servers: [],
                discovered_at: new Date().toISOString()
            };
            
            newInThisPage.push(newEpisode);
            this.existingLinks.add(link); // نضيف الرابط فوراً لمنع التكرار
            console.log(`   ✅ جديد: ${title.substring(0, 30)}...`);
        });
        
        console.log(`   📊 الخلاصة: ${newInThisPage.length} حلقة جديدة في الصفحة ${pageNumber}`);
        return newInThisPage;
    }

    // ===========================================
    // 4. استخراج جميع الحلقات الجديدة من كل الصفحات
    // ===========================================
    async extractAllNewEpisodes() {
        console.log('='.repeat(70));
        console.log('🎬 مستخرج رمضان 2026 - يفحص كل حلقة على حدة');
        console.log('='.repeat(70));
        
        await this.loadExistingEpisodes();
        
        console.log('\n🔍 بدء فحص الصفحات من 1 إلى آخر صفحة...\n');
        
        let page = 1;
        let hasContent = true;
        this.newEpisodes = [];
        
        while (hasContent && page <= CONFIG.MAX_PAGES) {
            const newFromThisPage = await this.extractNewFromPage(page);
            
            if (newFromThisPage.length > 0) {
                this.newEpisodes.push(...newFromThisPage);
                console.log(`   🆕 إجمالي الجديد حتى الآن: ${this.newEpisodes.length} حلقة`);
            }
            
            // نكمل للصفحة التالية إذا كانت الصفحة الحالية فيها حلقات
            // (حتى لو كلها قديمة، نكمل لأن يمكن في صفحة 2 حلقات جديدة)
            hasContent = newFromThisPage.length > 0 || page === 1;
            page++;
            
            if (hasContent && page <= CONFIG.MAX_PAGES) {
                await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_PAGES));
            }
        }
        
        console.log(`\n✅ انتهى الفحص. وجدنا ${this.newEpisodes.length} حلقة جديدة`);
        return this.newEpisodes;
    }

    // ===========================================
    // 5. استخراج السيرفرات للجديد فقط
    // ===========================================
    async extractServersForNewEpisodes() {
        if (this.newEpisodes.length === 0) {
            console.log('\n✨ لا توجد حلقات جديدة لاستخراج السيرفرات');
            return;
        }
        
        console.log('\n🔄 جاري استخراج السيرفرات للحلقات الجديدة...\n');
        
        for (let i = 0; i < this.newEpisodes.length; i++) {
            const episode = this.newEpisodes[i];
            console.log(`📌 ${i+1}/${this.newEpisodes.length}: ${episode.title.substring(0, 40)}...`);
            
            try {
                const playUrl = episode.link.replace('video.php', 'play.php');
                const html = await this.fetch(playUrl);
                
                if (html) {
                    const $ = cheerio.load(html);
                    const servers = [];
                    
                    $('.WatchList li').each((idx, el) => {
                        const $el = $(el);
                        const embedUrl = $el.attr('data-embed-url');
                        
                        if (embedUrl) {
                            const serverName = $el.find('strong').text().trim() || `سيرفر ${idx+1}`;
                            servers.push({
                                name: serverName,
                                url: embedUrl.startsWith('http') ? embedUrl : 'https:' + embedUrl
                            });
                        }
                    });
                    
                    episode.servers = servers;
                    this.totalNewServers += servers.length;
                    console.log(`   📺 ${servers.length} سيرفر`);
                }
            } catch (e) {
                console.log(`   ⚠️ لا يوجد سيرفرات`);
                episode.servers = [];
            }
            
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_SERVERS));
        }
    }

    // ===========================================
    // 6. إضافة الحلقات الجديدة للملفات (يكمل من آخر ملف)
    // ===========================================
    async appendToFiles() {
        if (this.newEpisodes.length === 0) {
            console.log('\n💾 لا توجد حلقات جديدة للحفظ');
            return;
        }
        
        console.log('\n💾 جاري حفظ الحلقات الجديدة...');
        
        // قراءة جميع الملفات
        const files = await fs.readdir(CONFIG.DATA_DIR);
        const pageFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'))
                              .sort((a, b) => {
                                  const na = parseInt(a.match(/page(\d+)\.json/)[1]);
                                  const nb = parseInt(b.match(/page(\d+)\.json/)[1]);
                                  return na - nb;
                              });
        
        let currentFileNumber = 1;
        let currentEpisodes = [];
        
        if (pageFiles.length > 0) {
            // نقرأ آخر ملف
            const lastFile = pageFiles[pageFiles.length - 1];
            currentFileNumber = parseInt(lastFile.match(/page(\d+)\.json/)[1]);
            
            const lastFilePath = path.join(CONFIG.DATA_DIR, lastFile);
            const lastFileData = JSON.parse(await fs.readFile(lastFilePath, 'utf-8'));
            currentEpisodes = lastFileData.episodes || [];
            
            console.log(`📂 آخر ملف: ${lastFile} (${currentEpisodes.length} حلقة)`);
        }
        
        // نضيف الحلقات الجديدة
        let remaining = [...this.newEpisodes];
        
        while (remaining.length > 0) {
            const spaceLeft = CONFIG.EPISODES_PER_FILE - currentEpisodes.length;
            
            if (spaceLeft > 0) {
                // نضيف للملف الحالي
                const toAdd = remaining.splice(0, spaceLeft);
                currentEpisodes.push(...toAdd);
                
                // حفظ الملف
                await this.saveFile(currentFileNumber, currentEpisodes);
                console.log(`📄 page${currentFileNumber}.json ← +${toAdd.length} (الآن ${currentEpisodes.length})`);
            }
            
            if (remaining.length > 0) {
                // الملف الحالي كامل - ننشئ ملف جديد
                currentFileNumber++;
                const toAdd = remaining.splice(0, CONFIG.EPISODES_PER_FILE);
                currentEpisodes = toAdd;
                
                await this.saveFile(currentFileNumber, currentEpisodes);
                console.log(`📄 page${currentFileNumber}.json (جديد) ← ${toAdd.length} حلقة`);
            }
        }
        
        // تحديث الفهرس
        await this.updateIndex();
        console.log(`📄 index.json ✓`);
    }

    // ===========================================
    // 7. حفظ ملف
    // ===========================================
    async saveFile(fileNumber, episodes) {
        const filePath = path.join(CONFIG.DATA_DIR, `page${fileNumber}.json`);
        
        const data = {
            file: `page${fileNumber}.json`,
            total_episodes: episodes.length,
            last_updated: new Date().toISOString(),
            episodes: episodes.sort((a, b) => {
                // ترتيب تنازلي: الأحدث أولاً
                if (a.page !== b.page) return b.page - a.page;
                return 0;
            })
        };
        
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    // ===========================================
    // 8. تحديث الفهرس
    // ===========================================
    async updateIndex() {
        const files = await fs.readdir(CONFIG.DATA_DIR);
        const pageFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'))
                              .sort();
        
        let totalEpisodes = 0;
        const fileList = [];
        
        for (const file of pageFiles) {
            const filePath = path.join(CONFIG.DATA_DIR, file);
            const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
            totalEpisodes += data.episodes?.length || 0;
            
            fileList.push({
                file: file,
                episodes: data.episodes?.length || 0,
                last_updated: data.last_updated
            });
        }
        
        const indexData = {
            project: "رمضان 2026 - لاروزا (فحص كل حلقة)",
            last_update: new Date().toISOString(),
            statistics: {
                total_episodes: totalEpisodes,
                new_this_run: this.newEpisodes.length,
                new_servers_this_run: this.totalNewServers,
                total_files: pageFiles.length,
                episodes_per_file: CONFIG.EPISODES_PER_FILE
            },
            files: fileList
        };
        
        await fs.writeFile(
            path.join(CONFIG.DATA_DIR, 'index.json'),
            JSON.stringify(indexData, null, 2)
        );
    }

    // ===========================================
    // دوال مساعدة
    // ===========================================
    cleanTitle(text) {
        if (!text) return 'بدون عنوان';
        return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 60);
    }

    fixImage(url) {
        if (!url) return '';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return CONFIG.BASE_URL + url;
        return url;
    }
}

// ===========================================
// التشغيل
// ===========================================
try {
    const extractor = new SmartIncrementalExtractor();
    
    // 1. فحص جميع الصفحات وأخذ الجديد فقط
    await extractor.extractAllNewEpisodes();
    
    // 2. استخراج السيرفرات للجديد فقط
    await extractor.extractServersForNewEpisodes();
    
    // 3. إضافة الجديد للملفات
    await extractor.appendToFiles();
    
    // 4. النتيجة
    console.log('\n' + '='.repeat(70));
    console.log('✅ ملخص التشغيلة');
    console.log('='.repeat(70));
    console.log(`🆕 حلقات جديدة: ${extractor.newEpisodes.length}`);
    console.log(`🔗 سيرفرات جديدة: ${extractor.totalNewServers}`);
    console.log('='.repeat(70));
    
} catch (error) {
    console.error('\n❌ خطأ:', error.message);
    process.exit(1);
}
