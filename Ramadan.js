const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

class LaroozaPagedExtractor {
    constructor() {
        this.episodesPerFile = 500; // كل ملف 500 حلقة
        this.outputDir = 'Ramadan';
        this.allEpisodes = []; // جميع الحلقات بدون تقسيم
        this.episodesMap = new Map(); // للوصول السريع وتحديث السيرفرات
        
        // إعدادات المواقع والبروكسي
        this.baseUrls = [
            'https://larooza.life',
            'https://www.larooza.life',
            'http://larooza.life'
        ];
        this.baseUrl = this.baseUrls[0];
        
        // إنشاء المجلد الرئيسي
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // تحميل البيانات الموجودة
        this.loadExistingEpisodes();
        
        // قائمة User-Agents
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36'
        ];
        
        // بروكسيات
        this.proxies = [
            '',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest='
        ];
    }

    loadExistingEpisodes() {
        try {
            // قراءة جميع ملفات page*.json
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
                const episodes = JSON.parse(content);
                
                // إضافة إلى الخريطة للوصول السريع
                for (const episode of episodes) {
                    this.episodesMap.set(episode.id, episode);
                }
                
                this.allEpisodes.push(...episodes);
            }
            
            console.log(`📚 تم تحميل ${this.allEpisodes.length} حلقة من ${files.length} ملف`);
            
        } catch (error) {
            console.log('ℹ️ لم يتم العثور على ملفات سابقة، بدء من الصفر');
        }
    }

    async start() {
        console.log('🚀 بدء استخراج جميع صفحات رمضان 2026');
        console.log(`📁 الحفظ في: ${this.outputDir}/ (كل ${this.episodesPerFile} حلقة في ملف)`);
        
        let page = 1;
        let hasMorePages = true;
        let newEpisodesCount = 0;
        let updatedServersCount = 0;
        
        while (hasMorePages) {
            console.log(`\n📄 جاري معالجة الصفحة ${page}...`);
            
            // بناء رابط الصفحة
            const pageUrl = `${this.baseUrl}/category.php?cat=ramadan-2026&page=${page}&order=DESC`;
            
            // محاولة بدائل إذا فشل الرابط
            const alternativeUrls = [
                pageUrl,
                `${this.baseUrl}/category/ramadan-2026?page=${page}`,
                `${this.baseUrl}/ramadan-2026/page/${page}`,
                `${this.baseUrl}/videos/ramadan-2026?page=${page}`
            ];
            
            let html = null;
            for (const url of alternativeUrls) {
                try {
                    html = await this.fetchWithProxy(url);
                    if (html && html.length > 500) {
                        console.log(`✅ تم تحميل الصفحة ${page}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!html || html.length < 500) {
                console.log(`🏁 الصفحة ${page} فارغة أو غير موجودة. انتهى التصفح.`);
                hasMorePages = false;
                break;
            }
            
            // استخراج حلقات الصفحة الحالية
            const pageEpisodes = await this.extractEpisodesFromPage(html, page);
            
            if (pageEpisodes.length === 0) {
                console.log(`🏁 لا توجد حلقات في الصفحة ${page}. انتهى التصفح.`);
                hasMorePages = false;
                break;
            }
            
            console.log(`✅ وجد ${pageEpisodes.length} حلقة في الصفحة ${page}`);
            
            // معالجة كل حلقة: تحقق من الجديد وتحديث السيرفرات
            for (const episode of pageEpisodes) {
                const existingEpisode = this.episodesMap.get(episode.id);
                
                if (!existingEpisode) {
                    // حلقة جديدة: نحتاج لاستخراج تفاصيلها (السيرفرات)
                    newEpisodesCount++;
                    console.log(`🆕 حلقة جديدة: ${episode.title}`);
                    
                    // استخراج تفاصيل الحلقة (السيرفرات)
                    const fullDetails = await this.extractEpisodeDetails(episode);
                    this.episodesMap.set(episode.id, fullDetails);
                    
                } else {
                    // حلقة موجودة: نتحقق إذا تغيرت السيرفرات
                    const currentServers = existingEpisode.servers || [];
                    
                    // استخراج السيرفرات الحالية
                    const freshDetails = await this.extractEpisodeDetails(episode);
                    const newServers = freshDetails.servers || [];
                    
                    // مقارنة السيرفرات
                    if (JSON.stringify(currentServers) !== JSON.stringify(newServers)) {
                        updatedServersCount++;
                        console.log(`🔄 تغيرت سيرفرات: ${episode.title}`);
                        existingEpisode.servers = newServers;
                        existingEpisode.lastChecked = new Date().toISOString();
                        this.episodesMap.set(episode.id, existingEpisode);
                    }
                }
            }
            
            page++;
            
            // تأخير بين الصفحات تجنباً للحظر
            await this.sleep(2000);
        }
        
        // بعد الانتهاء من جميع الصفحات، نحول الخريطة إلى مصفوفة
        this.allEpisodes = Array.from(this.episodesMap.values());
        
        // ترتيب الحلقات (الأحدث أولاً)
        this.allEpisodes.sort((a, b) => {
            return new Date(b.publishDate || 0) - new Date(a.publishDate || 0);
        });
        
        // حفظ النتائج في ملفات مقسمة (كل 500 حلقة)
        await this.savePaginatedFiles();
        
        // إنشاء ملف ملخص
        await this.createSummary();
        
        console.log(`\n✨ ملخص التشغيلة:`);
        console.log(`📊 إجمالي الحلقات: ${this.allEpisodes.length}`);
        console.log(`🆕 حلقات جديدة: ${newEpisodesCount}`);
        console.log(`🔄 سيرفرات محدثة: ${updatedServersCount}`);
        
        return {
            total: this.allEpisodes.length,
            new: newEpisodesCount,
            updated: updatedServersCount
        };
    }

    async extractEpisodesFromPage(html, pageNumber) {
        try {
            const root = parse(html);
            const episodes = [];
            
            // محاولة عدة محددات للعثور على عناصر الحلقات
            const selectors = [
                'li.col-xs-6',
                'li.col-sm-4',
                'div.video-item',
                'article.post',
                '.episode-item'
            ];
            
            let items = [];
            for (const selector of selectors) {
                items = root.querySelectorAll(selector);
                if (items && items.length > 0) {
                    break;
                }
            }
            
            for (const item of items) {
                try {
                    const episode = await this.extractBasicInfo(item, pageNumber);
                    if (episode && episode.id) {
                        episodes.push(episode);
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return episodes;
            
        } catch (error) {
            console.log(`❌ خطأ في استخراج الصفحة ${pageNumber}:`, error.message);
            return [];
        }
    }

    async extractBasicInfo(element, pageNumber) {
        // استخراج الرابط
        const linkElement = element.querySelector('a');
        if (!linkElement) return null;
        
        const href = linkElement.getAttribute('href');
        if (!href) return null;
        
        // استخراج ID
        let id = null;
        const patterns = [
            /vid=([a-zA-Z0-9]+)/,
            /video\.php\?vid=([a-zA-Z0-9]+)/,
            /\/([a-zA-Z0-9]{8,})\.html/
        ];
        
        for (const pattern of patterns) {
            const match = href.match(pattern);
            if (match) {
                id = match[1];
                break;
            }
        }
        
        if (!id) return null;
        
        // استخراج العنوان
        let title = 'عنوان غير معروف';
        const titleElement = element.querySelector('.ellipsis, h3, .title, img[alt]');
        if (titleElement) {
            title = titleElement.textContent || titleElement.getAttribute('alt') || title;
        }
        
        // استخراج الصورة
        let image = null;
        const imgElement = element.querySelector('img');
        if (imgElement) {
            image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
            if (image && !image.startsWith('http')) {
                image = this.baseUrl + (image.startsWith('/') ? image : '/' + image);
            }
        }
        
        // استخراج المدة
        let duration = '00:00';
        const durationElement = element.querySelector('.duration, .pm-label-duration, .time');
        if (durationElement) {
            duration = durationElement.textContent.trim();
        }
        
        return {
            id: id,
            title: this.cleanText(title),
            image: image,
            short_link: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            videoUrl: `${this.baseUrl}/embed.php?vid=${id}`,
            duration: duration,
            page: pageNumber,
            servers: [], // سنملأها لاحقاً
            publishDate: new Date().toISOString().split('T')[0],
            lastChecked: new Date().toISOString()
        };
    }

    async extractEpisodeDetails(episode) {
        try {
            // محاولة استخراج السيرفرات من صفحة الحلقة
            const episodeUrl = episode.short_link;
            const html = await this.fetchWithProxy(episodeUrl);
            
            if (html) {
                const root = parse(html);
                const servers = [];
                
                // محاولة استخراج روابط السيرفرات
                // هذا يعتمد على بنية الموقع الفعلية، قد تحتاج لتعديل المحددات
                const serverElements = root.querySelectorAll('.server-link, .download-link, iframe');
                
                for (const el of serverElements) {
                    const serverUrl = el.getAttribute('src') || el.getAttribute('href');
                    if (serverUrl && serverUrl.includes('embed')) {
                        servers.push({
                            url: serverUrl,
                            name: el.textContent || 'سيرفر',
                            quality: 'HD'
                        });
                    }
                }
                
                if (servers.length > 0) {
                    episode.servers = servers;
                }
            }
            
            return episode;
            
        } catch (error) {
            // إذا فشل استخراج التفاصيل، نعيد الحلقة بدون سيرفرات
            return episode;
        }
    }

    async savePaginatedFiles() {
        // تقسيم الحلقات إلى مجموعات كل 500 حلقة
        const totalEpisodes = this.allEpisodes.length;
        const numberOfFiles = Math.ceil(totalEpisodes / this.episodesPerFile);
        
        console.log(`\n💾 حفظ ${totalEpisodes} حلقة في ${numberOfFiles} ملف...`);
        
        for (let fileIndex = 0; fileIndex < numberOfFiles; fileIndex++) {
            const start = fileIndex * this.episodesPerFile;
            const end = Math.min(start + this.episodesPerFile, totalEpisodes);
            const fileEpisodes = this.allEpisodes.slice(start, end);
            
            const fileName = `page${fileIndex + 1}.json`;
            const filePath = path.join(this.outputDir, fileName);
            
            // تحضير بيانات الملف مع ميتاداتا
            const fileData = {
                metadata: {
                    file_number: fileIndex + 1,
                    total_files: numberOfFiles,
                    episodes_range: `${start + 1}-${end}`,
                    total_episodes: fileEpisodes.length,
                    generated_at: new Date().toISOString(),
                    last_episode_id: fileEpisodes[fileEpisodes.length - 1]?.id
                },
                episodes: fileEpisodes
            };
            
            fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
            console.log(`✅ تم حفظ ${fileEpisodes.length} حلقة في ${fileName}`);
        }
        
        // إنشاء ملف خاص بالصفحات الجديدة فقط إذا وجدت
        const newEpisodes = this.allEpisodes.filter(ep => {
            return !this.episodesMap.has(ep.id) || 
                   new Date(ep.lastChecked) > new Date(Date.now() - 24*60*60*1000);
        });
        
        if (newEpisodes.length > 0) {
            const newFileName = `new_${new Date().toISOString().split('T')[0]}.json`;
            const newFilePath = path.join(this.outputDir, 'updates', newFileName);
            
            if (!fs.existsSync(path.join(this.outputDir, 'updates'))) {
                fs.mkdirSync(path.join(this.outputDir, 'updates'), { recursive: true });
            }
            
            fs.writeFileSync(newFilePath, JSON.stringify(newEpisodes, null, 2), 'utf8');
            console.log(`✅ تم حفظ ${newEpisodes.length} حلقة جديدة/محدثة في updates/${newFileName}`);
        }
    }

    async createSummary() {
        const files = fs.readdirSync(this.outputDir)
            .filter(f => f.match(/^page\d+\.json$/))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });
        
        // إحصائيات السيرفرات
        let totalServers = 0;
        let episodesWithServers = 0;
        
        for (const episode of this.allEpisodes) {
            if (episode.servers && episode.servers.length > 0) {
                episodesWithServers++;
                totalServers += episode.servers.length;
            }
        }
        
        const summary = {
            metadata: {
                total_episodes: this.allEpisodes.length,
                total_files: files.length,
                episodes_per_file: this.episodesPerFile,
                episodes_with_servers: episodesWithServers,
                total_servers_found: totalServers,
                last_updated: new Date().toISOString(),
                source_site: this.baseUrl
            },
            files: files.map((f, index) => {
                const filePath = path.join(this.outputDir, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    path: filePath,
                    size: stats.size,
                    modified: stats.mtime
                };
            }),
            stats: {
                avg_servers_per_episode: (totalServers / this.allEpisodes.length).toFixed(2),
                coverage_percentage: ((episodesWithServers / this.allEpisodes.length) * 100).toFixed(2)
            }
        };
        
        const summaryPath = path.join(this.outputDir, '_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
        
        // إنشاء ملف README بسيط
        const readmePath = path.join(this.outputDir, 'README.txt');
        const readme = `
        📁 مجلد حلقات رمضان 2026
        ========================
        📊 إجمالي الحلقات: ${this.allEpisodes.length}
        📦 مقسمة على ${files.length} ملف (كل ${this.episodesPerFile} حلقة)
        🎬 حلقات بسيرفرات: ${episodesWithServers}
        🔗 إجمالي السيرفرات: ${totalServers}
        🕒 آخر تحديث: ${new Date().toLocaleString('ar-EG')}
        
        📂 الملفات:
        ${files.map((f, i) => `   ${i+1}. ${f}`).join('\n')}
        
        تم التوليد بواسطة Larooza Paged Extractor
        `;
        
        fs.writeFileSync(readmePath, readme);
    }

    fetchWithProxy(url) {
        return new Promise((resolve, reject) => {
            // محاولة استخدام البروكسي إذا فشل المباشر
            const useProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const finalUrl = useProxy ? useProxy + encodeURIComponent(url) : url;
            
            const options = {
                headers: {
                    'User-Agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Referer': this.baseUrl
                },
                timeout: 10000
            };
            
            const req = https.get(finalUrl, options, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    if (res.headers.location) {
                        this.fetchWithProxy(res.headers.location).then(resolve).catch(reject);
                        return;
                    }
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
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
        return text.replace(/[\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
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
            console.log(`\n✨ تم الانتهاء بنجاح!`);
            console.log(`📊 إجمالي: ${result.total} حلقة`);
            console.log(`🆕 جديد: ${result.new}`);
            console.log(`🔄 محدث: ${result.updated}`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 فشلت العملية:', error.message);
            process.exit(0);
        });
}

module.exports = LaroozaPagedExtractor;
