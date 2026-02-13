const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaPagedExtractor {
    constructor() {
        this.episodesPerFile = 500;
        this.outputDir = 'Ramadan';
        this.allEpisodes = [];
        this.episodesMap = new Map();
        
        // نفس الإعدادات
        this.baseUrls = [
            'https://larooza.life',
            'https://www.larooza.life',
            'http://larooza.life'
        ];
        this.baseUrl = this.baseUrls[0];
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.loadExistingEpisodes();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36'
        ];
        
        this.proxies = [
            '',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
        
        // متغيرات للتحكم في التصفح
        this.maxPages = 100; // حد أقصى للصفحات (للأمان)
        this.minEpisodesPerPage = 1; // أقل عدد حلقات مقبول في الصفحة
    }

    loadExistingEpisodes() {
        try {
            const files = fs.readdirSync(this.outputDir)
                .filter(f => f.match(/^page\d+\.json$/));
            
            files.sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });

            for (const file of files) {
                const filePath = path.join(this.outputDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                
                // التعامل مع تنسيق الملف الجديد (مع metadata) أو القديم
                let episodes = [];
                try {
                    const parsed = JSON.parse(content);
                    if (parsed.episodes) {
                        // تنسيق جديد مع metadata
                        episodes = parsed.episodes;
                    } else if (Array.isArray(parsed)) {
                        // تنسيق قديم (مصفوفة مباشرة)
                        episodes = parsed;
                    }
                } catch (e) {
                    console.log(`⚠️ خطأ في قراءة ${file}`);
                    continue;
                }
                
                for (const episode of episodes) {
                    if (episode && episode.id) {
                        this.episodesMap.set(episode.id, episode);
                    }
                }
                
                this.allEpisodes.push(...episodes);
            }
            
            console.log(`📚 تم تحميل ${this.allEpisodes.length} حلقة من ${files.length} ملف`);
            
        } catch (error) {
            console.log('ℹ️ لا توجد ملفات سابقة، بدء من الصفر');
        }
    }

    async start() {
        console.log('🚀 بدء استخراج جميع صفحات رمضان 2026');
        console.log(`📁 الحفظ في: ${this.outputDir}/ (كل ${this.episodesPerFile} حلقة في ملف)`);
        
        let page = 1;
        let consecutiveEmptyPages = 0; // صفحات متتالية فارغة
        let maxConsecutiveEmpty = 3; // نتوقف بعد 3 صفحات متتالية فارغة
        
        let newEpisodesCount = 0;
        let updatedServersCount = 0;
        let totalEpisodesExtracted = 0;
        
        while (page <= this.maxPages && consecutiveEmptyPages < maxConsecutiveEmpty) {
            console.log(`\n📄 جاري معالجة الصفحة ${page}...`);
            
            // بناء الرابط بالضبط كما تريد
            const pageUrl = `${this.baseUrl}/category.php?cat=ramadan-2026&page=${page}&order=DESC`;
            
            console.log(`🔗 ${pageUrl}`);
            
            // محاولة تحميل الصفحة
            let html = null;
            let success = false;
            
            // تجربة عدة محاولات للصفحة
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    html = await this.fetchWithProxy(pageUrl);
                    if (html && html.length > 200) {
                        success = true;
                        break;
                    }
                } catch (e) {
                    console.log(`⚠️ محاولة ${attempt + 1} فشلت: ${e.message}`);
                    await this.sleep(2000); // انتظر قبل إعادة المحاولة
                }
            }
            
            if (!success) {
                console.log(`❌ فشل تحميل الصفحة ${page}`);
                consecutiveEmptyPages++;
                page++;
                continue;
            }
            
            // استخراج الحلقات من الصفحة
            const pageEpisodes = await this.extractEpisodesFromPage(html, page);
            
            console.log(`🔍 وجد ${pageEpisodes.length} حلقة في الصفحة ${page}`);
            
            if (pageEpisodes.length === 0) {
                console.log(`⚠️ الصفحة ${page} لا تحتوي على حلقات`);
                consecutiveEmptyPages++;
                page++;
                continue;
            }
            
            // إذا وصلنا لهنا، يعني الصفحة فيها حلقات
            consecutiveEmptyPages = 0;
            totalEpisodesExtracted += pageEpisodes.length;
            
            // معالجة كل حلقة
            for (const episode of pageEpisodes) {
                const existingEpisode = this.episodesMap.get(episode.id);
                
                if (!existingEpisode) {
                    // حلقة جديدة
                    newEpisodesCount++;
                    console.log(`🆕 [صفحة ${page}] حلقة جديدة: ${episode.title.substring(0, 30)}...`);
                    
                    // استخراج التفاصيل (السيرفرات)
                    const fullDetails = await this.extractEpisodeDetails(episode);
                    fullDetails.page = page; // نسجل رقم الصفحة
                    fullDetails.extractedAt = new Date().toISOString();
                    
                    this.episodesMap.set(episode.id, fullDetails);
                    
                } else {
                    // حلقة موجودة - نتحقق من السيرفرات
                    if (!existingEpisode.servers || existingEpisode.servers.length === 0) {
                        // إذا كانت بدون سيرفرات، نحاول استخراجها
                        console.log(`🔄 تحديث سيرفرات: ${episode.title.substring(0, 30)}...`);
                        const freshDetails = await this.extractEpisodeDetails(episode);
                        existingEpisode.servers = freshDetails.servers || [];
                        existingEpisode.lastChecked = new Date().toISOString();
                        existingEpisode.page = Math.min(existingEpisode.page || page, page);
                        
                        this.episodesMap.set(episode.id, existingEpisode);
                        updatedServersCount++;
                    }
                }
            }
            
            // كل 5 صفحات نحفظ مؤقتاً
            if (page % 5 === 0) {
                console.log(`\n💾 حفظ مؤقت بعد الصفحة ${page}...`);
                this.allEpisodes = Array.from(this.episodesMap.values());
                await this.savePaginatedFiles(true); // true يعني حفظ مؤقت
            }
            
            page++;
            
            // تأخير بين الصفحات
            await this.sleep(3000);
        }
        
        // تحديث القائمة الكاملة
        this.allEpisodes = Array.from(this.episodesMap.values());
        
        // ترتيب الحلقات حسب رقم الصفحة ثم حسب التاريخ
        this.allEpisodes.sort((a, b) => {
            if (a.page !== b.page) {
                return (a.page || 999) - (b.page || 999);
            }
            return new Date(b.extractedAt || 0) - new Date(a.extractedAt || 0);
        });
        
        // الحفظ النهائي
        await this.savePaginatedFiles(false);
        await this.createSummary();
        
        console.log(`\n✨ ============== الملخص النهائي ==============`);
        console.log(`📊 إجمالي الصفحات المستخرجة: ${page - consecutiveEmptyPages - 1}`);
        console.log(`📊 إجمالي الحلقات: ${this.allEpisodes.length}`);
        console.log(`🆕 حلقات جديدة: ${newEpisodesCount}`);
        console.log(`🔄 سيرفرات محدثة: ${updatedServersCount}`);
        console.log(`📁 محفوظة في ${Math.ceil(this.allEpisodes.length / this.episodesPerFile)} ملف`);
        console.log(`============================================`);
        
        return {
            total: this.allEpisodes.length,
            new: newEpisodesCount,
            updated: updatedServersCount,
            pages: page - 1
        };
    }

    async extractEpisodesFromPage(html, pageNumber) {
        try {
            const root = parse(html);
            const episodes = [];
            
            // محاولة عدة محددات
            const selectors = [
                'li.col-xs-6',
                'li.col-sm-4',
                'div.col-xs-6',
                'div.video-item',
                'article',
                '.episode-item',
                '.video-block',
                'li' // آخر خيار
            ];
            
            let items = [];
            for (const selector of selectors) {
                items = root.querySelectorAll(selector);
                if (items && items.length > 5) { // وجد عدد معقول من العناصر
                    console.log(`✅ استخدم المحدد: ${selector}`);
                    break;
                }
            }
            
            // إذا لسه قليل، نستخدم أي عناصر لقيناها
            if (items.length === 0) {
                // نحاول نبحث عن روابط فيديو مباشرة
                const links = root.querySelectorAll('a[href*="vid="], a[href*="video.php"]');
                items = links.map(link => link.parentNode);
            }
            
            for (const item of items) {
                try {
                    const episode = await this.extractBasicInfo(item, pageNumber);
                    if (episode && episode.id && !this.isDuplicate(episode.id, episodes)) {
                        episodes.push(episode);
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // إزالة التكرار في نفس الصفحة
            const uniqueEpisodes = [];
            const ids = new Set();
            for (const ep of episodes) {
                if (!ids.has(ep.id)) {
                    ids.add(ep.id);
                    uniqueEpisodes.push(ep);
                }
            }
            
            return uniqueEpisodes;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة ${pageNumber}:`, error.message);
            return [];
        }
    }

    isDuplicate(id, episodes) {
        if (this.episodesMap.has(id)) return true;
        return episodes.some(ep => ep.id === id);
    }

    async extractBasicInfo(element, pageNumber) {
        // استخراج الرابط
        let linkElement = element.querySelector('a');
        if (!linkElement) {
            // إذا كان العنصر نفسه رابط
            linkElement = element.tagName === 'a' ? element : null;
        }
        
        if (!linkElement) return null;
        
        const href = linkElement.getAttribute('href');
        if (!href) return null;
        
        // استخراج ID
        let id = null;
        const patterns = [
            /vid=([a-zA-Z0-9_-]+)/,
            /video\.php\?vid=([a-zA-Z0-9_-]+)/,
            /embed\.php\?vid=([a-zA-Z0-9_-]+)/,
            /\/([a-zA-Z0-9_-]{8,})\.html/,
            /v=([a-zA-Z0-9_-]+)/
        ];
        
        for (const pattern of patterns) {
            const match = href.match(pattern);
            if (match) {
                id = match[1];
                break;
            }
        }
        
        if (!id) {
            // آخر محاولة: نأخذ آخر جزء من الرابط
            const parts = href.split('/');
            id = parts[parts.length - 1].replace('.html', '').replace(/[^a-zA-Z0-9_-]/g, '');
            if (id.length < 5) return null; // ID قصير جداً مش منطقي
        }
        
        // استخراج العنوان
        let title = '';
        const titleSelectors = ['.ellipsis', 'h3', 'h4', '.title', 'img[alt]', 'a[title]', '.name', '.video-title'];
        
        for (const selector of titleSelectors) {
            const titleEl = element.querySelector(selector);
            if (titleEl) {
                title = titleEl.textContent || titleEl.getAttribute('alt') || titleEl.getAttribute('title') || '';
                if (title) break;
            }
        }
        
        if (!title) {
            // إذا مالقينا عنوان، نستخدم نص الرابط
            title = linkElement.textContent || '';
        }
        
        title = this.cleanText(title) || `حلقة ${id}`;
        
        // استخراج الصورة
        let image = null;
        const imgElement = element.querySelector('img');
        if (imgElement) {
            image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || imgElement.getAttribute('data-lazy-src');
            if (image && !image.startsWith('http')) {
                image = this.baseUrl + (image.startsWith('/') ? image : '/' + image);
            }
        }
        
        // استخراج المدة
        let duration = '';
        const durationSelectors = ['.duration', '.pm-label-duration', '.time', '.video-duration', '.length'];
        
        for (const selector of durationSelectors) {
            const durEl = element.querySelector(selector);
            if (durEl) {
                duration = durEl.textContent.trim();
                break;
            }
        }
        
        return {
            id: id,
            title: title,
            image: image,
            short_link: href.startsWith('http') ? href : `${this.baseUrl}${href.startsWith('/') ? href : '/' + href}`,
            videoUrl: `${this.baseUrl}/embed.php?vid=${id}`,
            duration: duration || '00:00',
            page: pageNumber,
            servers: [],
            extractedAt: new Date().toISOString(),
            lastChecked: new Date().toISOString()
        };
    }

    async extractEpisodeDetails(episode) {
        // هنا هتضيف كود استخراج السيرفرات من صفحة الحلقة
        // حالياً نرجع الحلقة بدون تغيير
        return episode;
    }

    async savePaginatedFiles(isTemporary = false) {
        const totalEpisodes = this.allEpisodes.length;
        const numberOfFiles = Math.ceil(totalEpisodes / this.episodesPerFile);
        
        if (numberOfFiles === 0) return;
        
        console.log(`\n💾 حفظ ${totalEpisodes} حلقة في ${numberOfFiles} ملف...`);
        
        for (let fileIndex = 0; fileIndex < numberOfFiles; fileIndex++) {
            const start = fileIndex * this.episodesPerFile;
            const end = Math.min(start + this.episodesPerFile, totalEpisodes);
            const fileEpisodes = this.allEpisodes.slice(start, end);
            
            // ترتيب الحلقات داخل الملف حسب الصفحة
            fileEpisodes.sort((a, b) => (a.page || 999) - (b.page || 999));
            
            const fileName = isTemporary ? 
                `page${fileIndex + 1}_temp.json` : 
                `page${fileIndex + 1}.json`;
            
            const filePath = path.join(this.outputDir, fileName);
            
            const fileData = {
                metadata: {
                    file_number: fileIndex + 1,
                    total_files: numberOfFiles,
                    episodes_range: `${start + 1}-${end}`,
                    total_episodes: fileEpisodes.length,
                    pages_range: this.getPagesRange(fileEpisodes),
                    generated_at: new Date().toISOString(),
                    is_temporary: isTemporary
                },
                episodes: fileEpisodes
            };
            
            fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
            console.log(`✅ ${fileName}: ${fileEpisodes.length} حلقة (صفحات ${fileData.metadata.pages_range})`);
        }
        
        // إذا كان حفظ مؤقت، نحذف الملفات المؤقتة القديمة
        if (!isTemporary) {
            const tempFiles = fs.readdirSync(this.outputDir)
                .filter(f => f.endsWith('_temp.json'));
            
            for (const file of tempFiles) {
                fs.unlinkSync(path.join(this.outputDir, file));
            }
        }
    }

    getPagesRange(episodes) {
        const pages = [...new Set(episodes.map(e => e.page).filter(p => p))].sort((a, b) => a - b);
        if (pages.length === 0) return 'غير معروف';
        if (pages.length === 1) return `${pages[0]}`;
        return `${pages[0]}-${pages[pages.length-1]}`;
    }

    async createSummary() {
        const files = fs.readdirSync(this.outputDir)
            .filter(f => f.match(/^page\d+\.json$/))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });
        
        // إحصائيات الصفحات
        const pagesSet = new Set(this.allEpisodes.map(e => e.page).filter(p => p));
        const pages = [...pagesSet].sort((a, b) => a - b);
        
        const summary = {
            metadata: {
                total_episodes: this.allEpisodes.length,
                total_files: files.length,
                episodes_per_file: this.episodesPerFile,
                pages_covered: pages.length,
                first_page: pages[0] || 1,
                last_page: pages[pages.length - 1] || 1,
                last_updated: new Date().toISOString(),
                source_site: this.baseUrl
            },
            files: files.map((f, index) => {
                const filePath = path.join(this.outputDir, f);
                const stats = fs.statSync(filePath);
                let fileEpisodes = [];
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const parsed = JSON.parse(content);
                    fileEpisodes = parsed.episodes || parsed;
                } catch (e) {}
                
                return {
                    name: f,
                    path: filePath,
                    size: stats.size,
                    episodes: fileEpisodes.length,
                    pages: this.getPagesRange(fileEpisodes),
                    modified: stats.mtime
                };
            }),
            pages_summary: {
                list: pages,
                count: pages.length,
                range: pages.length > 0 ? `${pages[0]}-${pages[pages.length-1]}` : 'لا توجد صفحات'
            }
        };
        
        const summaryPath = path.join(this.outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        
        // تحديث README
        const readmePath = path.join(this.outputDir, 'README.txt');
        const readmeContent = this.generateReadme(summary);
        fs.writeFileSync(readmePath, readmeContent);
        
        console.log(`📊 تم تحديث الملخص: ${this.allEpisodes.length} حلقة من ${pages.length} صفحة`);
    }

    generateReadme(summary) {
        const date = new Date().toLocaleString('ar-EG', {
            timeZone: 'Asia/Riyadh',
            dateStyle: 'full',
            timeStyle: 'long'
        });
        
        return `
╔════════════════════════════════════════╗
║     📁 حلقات رمضان 2026 - لاروزا      ║
╚════════════════════════════════════════╝

📊 إحصائيات عامة:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• إجمالي الحلقات: ${summary.metadata.total_episodes}
• عدد الصفحات: ${summary.metadata.pages_covered} صفحة
• نطاق الصفحات: ${summary.metadata.first_page} - ${summary.metadata.last_page}
• عدد الملفات: ${summary.metadata.total_files}
• كل ملف: ${summary.metadata.episodes_per_file} حلقة

📂 الملفات:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${summary.files.map(f => `• ${f.name}: ${f.episodes} حلقة (صفحات ${f.pages})`).join('\n')}

🕒 آخر تحديث:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
تم التوليد بواسطة Larooza Paged Extractor
`;
    }

    fetchWithProxy(url) {
        return new Promise((resolve, reject) => {
            // نختار بروكسي عشوائي
            const proxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const finalUrl = proxy ? proxy + encodeURIComponent(url) : url;
            
            const options = {
                headers: {
                    'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Referer': this.baseUrl,
                    'Cache-Control': 'no-cache'
                },
                timeout: 15000,
                rejectUnauthorized: false
            };
            
            const req = https.get(finalUrl, options, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    // متابعة التحويلات
                    this.fetchWithProxy(res.headers.location).then(resolve).catch(reject);
                    return;
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\-]/g, '') // يسمح بالعربية والإنجليزية والأرقام
            .trim();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// تشغيل الملف
if (require.main === module) {
    const extractor = new LaroozaPagedExtractor();
    
    extractor.start()
        .then(result => {
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            console.log(`📊 النتائج النهائية:`);
            console.log(`   • الصفحات: ${result.pages}`);
            console.log(`   • الحلقات: ${result.total}`);
            console.log(`   • الجديد: ${result.new}`);
            console.log(`   • المحدث: ${result.updated}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(0);
        });
}

module.exports = LaroozaPagedExtractor;
