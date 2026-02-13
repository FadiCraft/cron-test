// extractor.js - النسخة التزايدية (يضيف الجديد فقط)
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
    DELAY_BETWEEN_PAGES: 2000,
    DELAY_BETWEEN_SERVERS: 800
};

class IncrementalExtractor {
    constructor() {
        this.newEpisodes = [];      // فقط الحلقات الجديدة في هذه التشغيلة
        this.allExistingLinks = new Set(); // روابط جميع الحلقات الموجودة
        this.currentPage = 1;
        this.hasMorePages = true;
        this.totalNewServers = 0;
        this.lastPageBeforeStop = 1;
    }

    // ===========================================
    // 1. تحميل جميع الروابط الموجودة مسبقاً
    // ===========================================
    async loadExistingEpisodes() {
        console.log('\n📂 فحص الحلقات الموجودة مسبقاً...');
        
        try {
            await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
            const files = await fs.readdir(CONFIG.DATA_DIR);
            const jsonFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'));
            
            let totalExisting = 0;
            
            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(CONFIG.DATA_DIR, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    const data = JSON.parse(content);
                    
                    if (data.episodes && Array.isArray(data.episodes)) {
                        for (const ep of data.episodes) {
                            if (ep.link) {
                                this.allExistingLinks.add(ep.link);
                                totalExisting++;
                            }
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ خطأ في قراءة ${file}: ${e.message}`);
                }
            }
            
            console.log(`✅ تم تحميل ${totalExisting} حلقة موجودة (${this.allExistingLinks.size} رابط فريد)`);
            
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
                // تجاهل الخطأ وجرب البروكسي التالي
            }
        }
        throw new Error('فشل الاتصال');
    }

    // ===========================================
    // 3. استخراج الحلقات الجديدة فقط من صفحة
    // ===========================================
    async extractNewEpisodesFromPage(pageNumber) {
        const url = `${CONFIG.BASE_URL}/category.php?cat=${CONFIG.CATEGORY}&page=${pageNumber}&order=DESC`;
        console.log(`📄 الصفحة ${pageNumber}...`);
        
        try {
            const html = await this.fetch(url);
            const $ = cheerio.load(html);
            
            const newEpisodesInPage = [];
            let foundExisting = false;
            
            $('li.col-xs-6, li.col-sm-4, li.col-md-3').each((index, element) => {
                const $el = $(element);
                const $link = $el.find('a[href*="video.php"]').first();
                
                let link = $link.attr('href') || '';
                if (!link) return;
                
                if (!link.startsWith('http')) {
                    link = CONFIG.BASE_URL + (link.startsWith('/') ? link : '/' + link);
                }
                
                // الأهم هنا: نتحقق إذا كانت الحلقة موجودة مسبقاً
                if (this.allExistingLinks.has(link)) {
                    foundExisting = true;
                    return false; // نوقف التكرار - وصلنا للحلقات القديمة
                }
                
                // إذا وصلنا هنا، الحلقة جديدة 👇
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
                
                newEpisodesInPage.push({
                    id: `ramadan-${Date.now()}-${pageNumber}-${index}`,
                    page: pageNumber,
                    title: this.cleanTitle(title),
                    link: link,
                    image: this.fixImage(image),
                    duration: duration,
                    servers: [],
                    extracted_at: new Date().toISOString(),
                    is_new: true
                });
            });
            
            console.log(`   ✅ ${newEpisodesInPage.length} حلقة جديدة`);
            
            // إذا وجدنا حلقة قديمة، معناه وصلنا لآخر الحلقات الجديدة
            if (foundExisting) {
                console.log(`   🛑 توقف: وصلنا للحلقات القديمة في الصفحة ${pageNumber}`);
                this.hasMorePages = false;
                this.lastPageBeforeStop = pageNumber;
            }
            
            return newEpisodesInPage;
            
        } catch (error) {
            console.log(`   ❌ فشل: ${error.message}`);
            this.hasMorePages = false;
            return [];
        }
    }

    // ===========================================
    // 4. استخراج جميع الحلقات الجديدة فقط
    // ===========================================
    async extractOnlyNewEpisodes() {
        console.log('='.repeat(70));
        console.log('🎬 مستخرج رمضان 2026 - نظام إضافة الحلقات الجديدة فقط');
        console.log('='.repeat(70));
        
        // أولاً: تحميل الحلقات الموجودة
        await this.loadExistingEpisodes();
        
        // ثانياً: استخراج الجديد فقط
        console.log('\n🔍 البحث عن الحلقات الجديدة...\n');
        
        this.currentPage = 1;
        this.hasMorePages = true;
        this.newEpisodes = [];
        
        while (this.hasMorePages) {
            const newEpisodesInPage = await this.extractNewEpisodesFromPage(this.currentPage);
            
            if (newEpisodesInPage.length > 0) {
                // إضافة الحلقات الجديدة للمصفوفة
                this.newEpisodes.push(...newEpisodesInPage);
                
                // إضافة روابطها للمجموعة (حتى لا نستخرجها مرة أخرى)
                newEpisodesInPage.forEach(ep => {
                    this.allExistingLinks.add(ep.link);
                });
                
                console.log(`   📊 إجمالي الجديد: ${this.newEpisodes.length} حلقة`);
            }
            
            this.currentPage++;
            
            // وقفة بين الصفحات
            if (this.hasMorePages) {
                await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_PAGES));
            }
        }
        
        console.log(`\n✅ تم العثور على ${this.newEpisodes.length} حلقة جديدة`);
        return this.newEpisodes;
    }

    // ===========================================
    // 5. استخراج سيرفرات الحلقات الجديدة فقط
    // ===========================================
    async extractServersForNewEpisodes() {
        if (this.newEpisodes.length === 0) {
            console.log('\n✨ لا توجد حلقات جديدة لاستخراج سيرفراتها');
            return;
        }
        
        console.log('\n🔄 جاري استخراج سيرفرات الحلقات الجديدة...\n');
        
        for (let i = 0; i < this.newEpisodes.length; i++) {
            const episode = this.newEpisodes[i];
            const progress = `${i + 1}/${this.newEpisodes.length}`;
            
            console.log(`📌 [${progress}] ${episode.title.substring(0, 40)}...`);
            
            try {
                const playUrl = episode.link.replace('video.php', 'play.php');
                const html = await this.fetch(playUrl);
                const $ = cheerio.load(html);
                
                const servers = [];
                
                $('.WatchList li').each((idx, el) => {
                    const $el = $(el);
                    const embedUrl = $el.attr('data-embed-url');
                    
                    if (embedUrl) {
                        const serverName = $el.find('strong').text().trim() || `سيرفر ${idx + 1}`;
                        
                        servers.push({
                            name: serverName,
                            url: embedUrl.startsWith('http') ? embedUrl : 'https:' + embedUrl
                        });
                    }
                });
                
                episode.servers = servers;
                this.totalNewServers += servers.length;
                
                console.log(`   📺 ${servers.length} سيرفر`);
                
            } catch (e) {
                console.log(`   ⚠️ لا يوجد سيرفرات`);
                episode.servers = [];
            }
            
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_SERVERS));
        }
    }

    // ===========================================
    // 6. إضافة الحلقات الجديدة للملفات (ديناميكي)
    // ===========================================
    async appendNewEpisodesToFiles() {
        if (this.newEpisodes.length === 0) {
            console.log('\n💾 لا توجد بيانات جديدة للحفظ');
            return 0;
        }
        
        console.log('\n💾 جاري إضافة الحلقات الجديدة...');
        
        // قراءة جميع الملفات الموجودة
        const files = await fs.readdir(CONFIG.DATA_DIR);
        const jsonFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'))
                              .sort((a, b) => {
                                  const numA = parseInt(a.match(/page(\d+)\.json/)[1]);
                                  const numB = parseInt(b.match(/page(\d+)\.json/)[1]);
                                  return numA - numB;
                              });
        
        let currentFileNumber = 1;
        let currentFileEpisodes = [];
        
        if (jsonFiles.length > 0) {
            // نقرأ آخر ملف لنكمل عليه
            const lastFile = jsonFiles[jsonFiles.length - 1];
            currentFileNumber = parseInt(lastFile.match(/page(\d+)\.json/)[1]);
            
            const lastFilePath = path.join(CONFIG.DATA_DIR, lastFile);
            const lastFileContent = await fs.readFile(lastFilePath, 'utf-8');
            const lastFileData = JSON.parse(lastFileContent);
            
            currentFileEpisodes = lastFileData.episodes || [];
            console.log(`📂 آخر ملف: ${lastFile} (${currentFileEpisodes.length} حلقة)`);
        }
        
        // إضافة الحلقات الجديدة واحدة واحدة
        let remainingNewEpisodes = [...this.newEpisodes];
        
        while (remainingNewEpisodes.length > 0) {
            // كم حلقة نستطيع إضافتها للملف الحالي؟
            const spaceInCurrentFile = CONFIG.EPISODES_PER_FILE - currentFileEpisodes.length;
            
            if (spaceInCurrentFile > 0 && currentFileEpisodes.length > 0) {
                // في ملف موجود وله مساحة
                const episodesToAdd = remainingNewEpisodes.splice(0, spaceInCurrentFile);
                currentFileEpisodes.push(...episodesToAdd);
                
                // حفظ الملف المحدث
                await this.saveFile(currentFileNumber, currentFileEpisodes);
                console.log(`📄 page${currentFileNumber}.json ← إضافة ${episodesToAdd.length} حلقة (الآن ${currentFileEpisodes.length})`);
                
            } else {
                // الملف الحالي كامل أو لا يوجد ملف - ننشئ ملف جديد
                if (currentFileEpisodes.length > 0) {
                    // حفظ الملف القديم كامل
                    await this.saveFile(currentFileNumber, currentFileEpisodes);
                }
                
                // ننتقل لملف جديد
                currentFileNumber++;
                const episodesToAdd = remainingNewEpisodes.splice(0, CONFIG.EPISODES_PER_FILE);
                currentFileEpisodes = episodesToAdd;
                
                // حفظ الملف الجديد
                await this.saveFile(currentFileNumber, currentFileEpisodes);
                console.log(`📄 page${currentFileNumber}.json (جديد) ← ${episodesToAdd.length} حلقة`);
            }
        }
        
        // تحديث ملف الفهرس
        await this.updateIndexFile();
        
        return this.newEpisodes.length;
    }
    
    // ===========================================
    // 7. حفظ ملف معين
    // ===========================================
    async saveFile(fileNumber, episodes) {
        const fileName = `page${fileNumber}.json`;
        const filePath = path.join(CONFIG.DATA_DIR, fileName);
        
        // ترتيب الحلقات من الأحدث للأقدم
        const sortedEpisodes = episodes.sort((a, b) => {
            if (a.page !== b.page) return b.page - a.page;
            return 0;
        });
        
        const fileData = {
            file_number: fileNumber,
            total_episodes: episodes.length,
            last_updated: new Date().toISOString(),
            episodes: sortedEpisodes
        };
        
        await fs.writeFile(filePath, JSON.stringify(fileData, null, 2));
    }
    
    // ===========================================
    // 8. تحديث الفهرس
    // ===========================================
    async updateIndexFile() {
        const files = await fs.readdir(CONFIG.DATA_DIR);
        const jsonFiles = files.filter(f => f.startsWith('page') && f.endsWith('.json'))
                              .sort((a, b) => {
                                  const numA = parseInt(a.match(/page(\d+)\.json/)[1]);
                                  const numB = parseInt(b.match(/page(\d+)\.json/)[1]);
                                  return numA - numB;
                              });
        
        let totalEpisodes = 0;
        const fileList = [];
        
        for (const file of jsonFiles) {
            const filePath = path.join(CONFIG.DATA_DIR, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            totalEpisodes += data.episodes?.length || 0;
            
            fileList.push({
                file: file,
                episodes: data.episodes?.length || 0,
                last_updated: data.last_updated
            });
        }
        
        const indexData = {
            project: "رمضان 2026 - لاروزا (نظام تزايدي)",
            last_update: new Date().toISOString(),
            statistics: {
                total_episodes_all_time: totalEpisodes,
                new_episodes_this_run: this.newEpisodes.length,
                new_servers_this_run: this.totalNewServers,
                total_files: jsonFiles.length,
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
// التشغيل الرئيسي
// ===========================================
try {
    const extractor = new IncrementalExtractor();
    
    // 1. استخراج الحلقات الجديدة فقط
    await extractor.extractOnlyNewEpisodes();
    
    // 2. استخراج السيرفرات للجديد فقط
    await extractor.extractServersForNewEpisodes();
    
    // 3. إضافة الجديد للملفات (يكمل من حيث توقف)
    const addedCount = await extractor.appendNewEpisodesToFiles();
    
    // 4. النتيجة النهائية
    console.log('\n' + '='.repeat(70));
    console.log('✅ ملخص التشغيلة الحالية');
    console.log('='.repeat(70));
    console.log(`📊 حلقات جديدة: ${extractor.newEpisodes.length}`);
    console.log(`🔗 سيرفرات جديدة: ${extractor.totalNewServers}`);
    console.log(`📁 تمت الإضافة في الملفات: pageX.json`);
    console.log('='.repeat(70));
    
} catch (error) {
    console.error('\n❌ خطأ:', error.message);
    process.exit(1);
}
