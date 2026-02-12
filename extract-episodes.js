const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');
const http = require('http');

// ==================== الإعدادات ====================
// ✅ Blogger Settings
const CLIENT_ID = "676395600013-5gmnle6clg9f5mqfo7uci45nqurl0hsi.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REFRESH_TOKEN = "1//05-y_lVbQzPs1CgYIARAAGAUSNwF-L9IrtEhFugmwQXjaGN--8EVbAZZwmAGlroNEXUey43nFiT6hg0MGAHqaKU_oJtdXH_1lFrw";
const BLOG_ID = "8351599421307503563";
const SITE_URL = "https://www.kirozozo.xyz/";

// ✅ GitHub Settings
const GH_TOKEN = "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";
const GH_USER = "FadiCraft";
const GH_REPO = "cron-test";
const GITHUB_API = "https://api.github.com";
const PUBLISHED_FILE = "published_log.json";
const REPO_PATH = `${GH_USER}/${GH_REPO}`;

// ✅ Larooza Settings - روابط محدثة
const LAROOZA_BASE = "https://laroza.bond";
const LAROOZA_CATEGORY = "/category/ramadan-2026"; // تم تحديث المسار
const LAROOZA_URL = `${LAROOZA_BASE}${LAROOZA_CATEGORY}`;

// ==================== كلاس استخراج لاروزا ====================
class LaroozaExtractor {
    constructor() {
        // استخدام المسار المطلق للتأكد من حفظ الملفات
        this.workDir = process.cwd();
        this.outputDir = path.join(this.workDir, 'Ramadan');
        this.historyFile = path.join(this.outputDir, 'extracted_history.json');
        this.baseUrl = LAROOZA_BASE;
        this.extractedHistory = new Set();
        
        // إنشاء مجلد الإخراج إذا لم يكن موجوداً
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
            console.log(`📁 تم إنشاء مجلد: ${this.outputDir}`);
        }
        
        this.loadExtractionHistory();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ];
        
        this.requestDelay = 2000; // زيادة التأخير
        this.timeout = 30000; // زيادة المهلة
    }

    loadExtractionHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const data = fs.readFileSync(this.historyFile, 'utf8');
                const history = JSON.parse(data);
                this.extractedHistory = new Set(history.extracted_ids || []);
                console.log(`📚 سجل الاستخراج: ${this.extractedHistory.size} حلقة مستخرجة سابقاً`);
                console.log(`📁 مسار السجل: ${this.historyFile}`);
            } else {
                console.log('📝 لا يوجد سجل استخراج سابق - سيتم إنشاء سجل جديد');
                console.log(`📁 سيتم حفظ السجل في: ${this.historyFile}`);
                this.extractedHistory = new Set();
                // إنشاء ملف سجل فارغ
                this.saveExtractionHistory(null, true);
            }
        } catch (error) {
            console.error('⚠️ خطأ في قراءة سجل الاستخراج:', error.message);
            this.extractedHistory = new Set();
        }
    }

    saveExtractionHistory(newId = null, forceCreate = false) {
        try {
            if (newId) {
                this.extractedHistory.add(newId);
            }
            
            const historyData = {
                last_updated: new Date().toISOString(),
                total_extracted: this.extractedHistory.size,
                extracted_ids: Array.from(this.extractedHistory)
            };
            
            fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2), 'utf8');
            
            if (newId) {
                console.log(`📝 تم تحديث سجل الاستخراج: ${this.extractedHistory.size} حلقة إجمالاً`);
                console.log(`🆔 تم إضافة: ${newId}`);
            } else if (forceCreate) {
                console.log(`📝 تم إنشاء ملف سجل جديد: ${this.historyFile}`);
            }
            
            return true;
        } catch (error) {
            console.error('❌ خطأ في حفظ سجل الاستخراج:', error.message);
            return false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchUrl(url, redirectCount = 0) {
        if (redirectCount > 5) {
            throw new Error('عدد كبير جداً من إعادة التوجيه');
        }

        return new Promise((resolve, reject) => {
            const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
            
            // تحديد البروتوكول المناسب
            const client = url.startsWith('https') ? https : http;
            
            const options = {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0',
                    'Referer': this.baseUrl,
                },
                timeout: this.timeout,
                rejectUnauthorized: false // تجاهل مشاكل SSL
            };
            
            const req = client.get(url, options, (res) => {
                // التعامل مع إعادة التوجيه
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const location = res.headers.location;
                    if (location) {
                        console.log(`↪️ إعادة توجيه إلى: ${location}`);
                        // حل الرابط الجديد
                        const newUrl = location.startsWith('http') ? location : this.fixUrl(location);
                        // تأخير بسيط قبل إعادة المحاولة
                        setTimeout(() => {
                            this.fetchUrl(newUrl, redirectCount + 1).then(resolve).catch(reject);
                        }, 1000);
                        return;
                    }
                }
                
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (data.length < 100) {
                        console.warn('⚠️ تحذير: حجم الصفحة صغير جداً:', data.length);
                    }
                    resolve(data);
                });
            });
            
            req.on('error', (error) => {
                console.error(`❌ خطأ في الاتصال: ${error.message}`);
                reject(error);
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            
            req.end();
        });
    }

    fixUrl(url) {
        if (!url) return '#';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return this.baseUrl + url;
        if (!url.startsWith('http')) return this.baseUrl + '/' + url;
        return url;
    }

    async fetchAllEpisodes() {
        console.log(`📥 جاري تحميل صفحة لاروزا: ${LAROOZA_URL}`);
        
        try {
            const html = await this.fetchUrl(LAROOZA_URL);
            
            if (!html || html.length < 100) {
                console.error('❌ الصفحة المحملة فارغة أو صغيرة جداً');
                return [];
            }
            
            console.log(`📄 تم تحميل الصفحة بنجاح، الحجم: ${html.length} بايت`);
            
            const root = parse(html);
            
            // محاولة عدة محددات للحلقات
            let episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3, .episode-item, .video-item, article, .post-item');
            
            if (episodeElements.length === 0) {
                // محاولة البحث عن أي روابط فيديو
                const allLinks = root.querySelectorAll('a[href*="vid="], a[href*="video.php"]');
                episodeElements = allLinks.map(link => link.parentNode);
            }
            
            console.log(`📊 وجدت ${episodeElements.length} عنصر في الصفحة`);
            
            const episodes = [];
            for (const element of episodeElements) {
                try {
                    const episode = await this.extractEpisodeFromElement(element);
                    if (episode && episode.id && episode.title) {
                        episodes.push(episode);
                        console.log(`✅ تم استخراج: ${episode.title} (${episode.id})`);
                    }
                } catch (error) {
                    // تجاهل الأخطاء في استخراج حلقة واحدة
                }
            }
            
            console.log(`✅ تم استخراج ${episodes.length} حلقة بنجاح`);
            return episodes;
            
        } catch (error) {
            console.error('❌ فشل تحميل الصفحة:', error.message);
            return [];
        }
    }

    async extractEpisodeFromElement(element) {
        const linkElement = element.querySelector('a') || element;
        const href = linkElement?.getAttribute('href');
        
        if (!href) return null;
        
        const link = this.fixUrl(href);
        
        // البحث عن معرف الفيديو
        let episodeId = null;
        
        const vidMatch = link.match(/vid=([a-zA-Z0-9_-]+)/i);
        if (vidMatch) {
            episodeId = vidMatch[1];
        } else {
            // محاولة استخراج ID من الرابط
            const idMatch = link.match(/\/([a-zA-Z0-9_-]+)\.html/);
            if (idMatch) episodeId = idMatch[1];
        }
        
        if (!episodeId) return null;
        
        // استخراج الصورة
        const imgElement = element.querySelector('img');
        let image = null;
        
        if (imgElement) {
            image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src') || imgElement.getAttribute('data-original');
            if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                image = null;
            }
            if (image) image = this.fixUrl(image);
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration, .duration, .time, span[class*="time"]');
        const duration = durationElement ? this.cleanText(durationElement.textContent) : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis, h2, h3, h4, .title, a[title]');
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanTitle(titleElement.textContent || titleElement.getAttribute('title') || '');
        } else if (linkElement) {
            title = this.cleanTitle(linkElement.textContent || linkElement.getAttribute('title') || '');
        }
        
        if (title === 'عنوان غير معروف' || !title) {
            title = `حلقة ${episodeId}`;
        }
        
        // تأخير قبل استخراج التفاصيل
        await this.delay(this.requestDelay);
        
        // استخراج التفاصيل
        const details = await this.extractEpisodeDetails(link).catch(() => null);
        
        // استخراج السيرفرات
        const servers = await this.extractEpisodeServers(link).catch(() => []);
        
        return {
            id: episodeId,
            title: details?.title || title,
            image: details?.image || image || 'https://via.placeholder.com/300x450?text=No+Image',
            link: link,
            duration: duration,
            description: details?.description || `مشاهدة وتحميل ${title} - مسلسلات رمضان 2026`,
            servers: servers.length > 0 ? servers : [{
                id: '1',
                name: 'سيرفر المشاهدة',
                url: `${this.baseUrl}/embed.php?vid=${episodeId}`
            }],
            videoUrl: `${this.baseUrl}/embed.php?vid=${episodeId}`
        };
    }

    async extractEpisodeDetails(episodeUrl) {
        try {
            const html = await this.fetchUrl(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            // استخراج العنوان
            const titleMeta = root.querySelector('meta[name="title"], meta[property="og:title"]');
            if (titleMeta) {
                details.title = this.cleanTitle(titleMeta.getAttribute('content'));
            }
            
            // استخراج الوصف
            const descMeta = root.querySelector('meta[name="description"], meta[property="og:description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content');
                details.description = this.cleanText(desc).substring(0, 200) + '...';
            }
            
            // استخراج الصورة
            const imageMeta = root.querySelector('meta[property="og:image"]');
            if (imageMeta) {
                details.image = imageMeta.getAttribute('content');
            }
            
            return details;
        } catch (error) {
            return null;
        }
    }

    async extractEpisodeServers(episodeUrl) {
        try {
            const playUrl = episodeUrl.replace('video.php', 'play.php');
            const html = await this.fetchUrl(playUrl);
            const root = parse(html);
            
            const servers = [];
            const serverList = root.querySelector('.WatchList, .servers-list, #servers, .server-list');
            
            if (serverList) {
                const serverItems = serverList.querySelectorAll('li, .server-item, a[data-embed]');
                
                serverItems.forEach((item, index) => {
                    const embedUrl = item.getAttribute('data-embed-url') || 
                                   item.getAttribute('href') || 
                                   item.getAttribute('data-embed');
                    
                    if (embedUrl) {
                        const serverNameElement = item.querySelector('strong, span, .server-name');
                        let serverName = serverNameElement ? 
                            this.cleanText(serverNameElement.textContent) : 
                            null;
                        
                        if (!serverName) {
                            serverName = `سيرفر ${index + 1}`;
                        }
                        
                        servers.push({
                            id: (index + 1).toString(),
                            name: serverName,
                            url: this.fixUrl(embedUrl)
                        });
                    }
                });
            }
            
            return servers;
        } catch (error) {
            return [];
        }
    }

    cleanTitle(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s\-_،.،:?!]/gu, '') // الاحتفاظ بالحروف العربية
            .trim();
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async getNextUnpublishedEpisode() {
        console.log('\n🔍 البحث عن الحلقة التالية غير المنشورة...');
        
        const allEpisodes = await this.fetchAllEpisodes();
        
        if (allEpisodes.length === 0) {
            console.log('⚠️ لم يتم العثور على أي حلقات في الموقع!');
            return null;
        }
        
        console.log(`📊 إجمالي الحلقات في الموقع: ${allEpisodes.length}`);
        
        // عرض أول 3 حلقات للتحقق
        console.log('\n📋 عينة من الحلقات المتاحة:');
        for (let i = 0; i < Math.min(3, allEpisodes.length); i++) {
            console.log(`  ${i+1}. ${allEpisodes[i].title} (${allEpisodes[i].id})`);
        }
        
        for (const episode of allEpisodes) {
            if (!this.extractedHistory.has(episode.id)) {
                console.log(`\n🎬 الحلقة التالية: ${episode.title}`);
                console.log(`🆔 المعرف: ${episode.id}`);
                console.log(`🔗 الرابط: ${episode.link}`);
                
                if (episode.image) {
                    console.log(`🖼️ الصورة: ${episode.image.substring(0, 50)}...`);
                }
                
                if (episode.servers && episode.servers.length > 0) {
                    console.log(`🌐 السيرفرات: ${episode.servers.length}`);
                    episode.servers.forEach((s, i) => console.log(`     ${i+1}. ${s.name}`));
                }
                
                // حفظ الحلقة في السجل
                this.saveExtractionHistory(episode.id);
                
                return episode;
            }
        }
        
        console.log('⚠️ لا توجد حلقات جديدة للاستخراج!');
        console.log(`📊 إجمالي الحلقات المستخرجة سابقاً: ${this.extractor?.extractedHistory.size || 0}`);
        return null;
    }
}

// ==================== دوال النشر على Blogger ====================
async function getPublishedLog() {
    try {
        if (!GH_TOKEN || GH_TOKEN === "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" || GH_TOKEN.includes("your_github_token")) {
            console.log('⚠️ GH_TOKEN غير مضبوط بشكل صحيح، استخدام سجل محلي');
            return { items: [], lastCheck: new Date().toISOString(), total: 0 };
        }

        const response = await fetch(
            `${GITHUB_API}/repos/${REPO_PATH}/contents/${PUBLISHED_FILE}`,
            {
                headers: {
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (response.status === 200) {
            const data = await response.json();
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            return JSON.parse(content);
        } else {
            console.log('📝 لم يتم العثور على سجل نشر، سيتم إنشاء سجل جديد');
            return { items: [], lastCheck: new Date().toISOString(), total: 0 };
        }
    } catch (error) {
        console.error('❌ خطأ في قراءة السجل:', error.message);
        return { items: [], lastCheck: new Date().toISOString(), total: 0 };
    }
}

async function saveToPublishedLog(itemId, title) {
    try {
        if (!GH_TOKEN || GH_TOKEN === "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" || GH_TOKEN.includes("your_github_token")) {
            console.log('⚠️ GH_TOKEN غير مضبوط، حفظ السجل محلياً');
            
            // حفظ سجل محلي
            const localLogFile = path.join(process.cwd(), 'local_published_log.json');
            let log = { items: [], lastCheck: new Date().toISOString(), total: 0 };
            
            if (fs.existsSync(localLogFile)) {
                try {
                    log = JSON.parse(fs.readFileSync(localLogFile, 'utf8'));
                } catch (e) {}
            }
            
            if (!log.items.find(item => item.id === itemId)) {
                log.items.push({
                    id: itemId,
                    title: title,
                    date: new Date().toISOString()
                });
                log.total = log.items.length;
                log.lastCheck = new Date().toISOString();
                
                fs.writeFileSync(localLogFile, JSON.stringify(log, null, 2), 'utf8');
                console.log(`✅ تم حفظ السجل محلياً: ${localLogFile}`);
            }
            
            return true;
        }

        const log = await getPublishedLog();
        
        if (log.items.find(item => item.id === itemId)) {
            console.log(`⚠️ "${title}" منشور مسبقاً`);
            return true;
        }

        log.items.push({
            id: itemId,
            title: title,
            date: new Date().toISOString(),
            url: `https://kirozozoblog.blogspot.com/search?q=${encodeURIComponent(title)}`
        });
        
        log.lastCheck = new Date().toISOString();
        log.total = log.items.length;

        const content = JSON.stringify(log, null, 2);
        const contentBase64 = Buffer.from(content).toString('base64');

        // الحصول على SHA للملف إذا كان موجوداً
        let fileSha = '';
        try {
            const fileRes = await fetch(
                `${GITHUB_API}/repos/${REPO_PATH}/contents/${PUBLISHED_FILE}`,
                {
                    headers: {
                        'Authorization': `Bearer ${GH_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            if (fileRes.status === 200) {
                const fileData = await fileRes.json();
                fileSha = fileData.sha;
            }
        } catch (e) {}

        const updateRes = await fetch(
            `${GITHUB_API}/repos/${REPO_PATH}/contents/${PUBLISHED_FILE}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${GH_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `➕ نشر: ${title.substring(0, 30)}...`,
                    content: contentBase64,
                    sha: fileSha || undefined
                })
            }
        );

        if (updateRes.ok) {
            console.log('✅ تم تحديث سجل النشر على GitHub');
            return true;
        } else {
            const error = await updateRes.json();
            console.error('❌ فشل تحديث GitHub:', error.message);
            return false;
        }

    } catch (error) {
        console.error('🚨 خطأ في حفظ السجل:', error.message);
        return false;
    }
}

async function publishToBlogger(accessToken, content, title) {
    const post = {
        title: title,
        content: content,
        labels: [
            "مسلسلات",
            "مترجمة",
            "اون لاين",
            "كيروزوزو",
            "مشاهدة",
            "تحميل",
            "رمضان 2026",
            "مسلسلات رمضان"
        ]
    };

    const res = await fetch(
        `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(post)
        }
    );

    return await res.json();
}

// ==================== دوال إنشاء المحتوى ====================
function createContentHTML(item) {
    const title = item.title || 'عنوان غير محدد';
    const image = item.image || 'https://via.placeholder.com/300x450?text=No+Image';
    const description = item.description || `مشاهدة وتحميل ${title} - مسلسلات رمضان 2026 مترجمة اون لاين`;
    const servers = item.servers || [];
    const duration = item.duration || '00:00';
    const link = item.link || '#';
    
    const randomViews = Math.floor(Math.random() * 10000) + 5000;
    const randomLikes = Math.floor(Math.random() * 1000) + 200;
    const randomRating = (Math.random() * 2 + 3).toFixed(1);

    let serversHTML = '';
    if (servers.length > 0) {
        let buttonsHTML = '';
        let containersHTML = '';
        
        servers.forEach((server, index) => {
            buttonsHTML += `<button class="server-btn ${index === 0 ? 'active' : ''}" data-server="server${index + 1}">${server.name || `سيرفر ${index + 1}`}</button>`;
            
            containersHTML += `<div class="iframe-container ${index === 0 ? 'active' : ''}" id="server${index + 1}">
                <div class="iframe-placeholder">
                    <div class="play-icon-large" data-url="${server.url || link}">▶</div>
                    <div>${server.name || `سيرفر ${index + 1}`}</div>
                    <div class="watch-instruction">انقر على زر التشغيل لمشاهدة الحلقة</div>
                </div>
            </div>`;
        });
        
        serversHTML = `
        <div class="servers-container" id="serversSection" style="display: none;">
            <div class="servers-title"><span>📺</span> سيرفرات المشاهدة</div>
            <div class="server-buttons">${buttonsHTML}</div>
            ${containersHTML}
        </div>`;
    }

    // باقي الكود كما هو...
    return `<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - مشاهدة وتحميل</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { font-family: 'Cairo', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; color: white; }
        .main-container {
            align-items: center;
            background-image: linear-gradient(to right, rgba(0,0,0,.85), rgba(0,0,0,.4)), url('${image}');
            background-position: center center;
            background-repeat: no-repeat;
            background-size: cover;
            border-radius: 15px;
            color: white;
            display: flex;
            justify-content: space-between;
            padding: 60px 40px;
            position: relative;
            margin: 20px 0;
        }
        .content-main { flex: 1; margin-right: 30px; max-width: 70%; }
        .thumbnail-card {
            border-radius: 8px;
            box-shadow: rgba(0, 0, 0, 0.5) 0px 4px 12px;
            height: 120px;
            width: 200px;
            overflow: hidden;
            position: relative;
        }
        .thumbnail-card img { height: 100%; object-fit: cover; width: 100%; }
        .thumbnail-overlay {
            align-items: center;
            background: linear-gradient(rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.7));
            display: flex;
            flex-direction: column;
            height: 100%;
            justify-content: center;
            left: 0;
            position: absolute;
            top: 0;
            width: 100%;
        }
        .play-button {
            align-items: center;
            background: rgba(245, 197, 24, 0.9);
            border-radius: 50%;
            display: flex;
            height: 40px;
            justify-content: center;
            margin-bottom: 8px;
            width: 40px;
        }
        .play-button span { color: black; font-size: 18px; margin-left: 2px; }
        .thumbnail-text { color: white; font-size: 11px; font-weight: bold; line-height: 1.3; margin: 0; text-align: center; }
        .thumbnail-text span { color: #f5c518; }
        h1 { font-size: 48px; margin-bottom: 10px; }
        .rating-stats {
            display: flex;
            gap: 20px;
            margin: 15px 0;
            flex-wrap: wrap;
        }
        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.05);
            padding: 8px 15px;
            border-radius: 8px;
        }
        .stat-item i { color: #f5c518; }
        .meta-info { font-size: 14px; opacity: 0.9; }
        .description { color: #dddddd; line-height: 1.7; margin-top: 20px; max-width: 600px; }
        .player-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 14px 28px;
            font-size: 18px;
            cursor: pointer;
            background: #f5c518;
            border-radius: 6px;
            color: black;
            font-weight: bold;
            margin-right: 10px;
            text-decoration: none;
        }
        .site-link {
            border-radius: 6px;
            border: 1px solid white;
            color: white;
            display: inline-block;
            padding: 12px 22px;
            text-decoration: none;
        }
        .servers-container { margin-top: 40px; width: 100%; }
        .servers-title {
            font-size: 24px;
            margin-bottom: 20px;
            color: #f5c518;
            border-bottom: 2px solid #f5c518;
            padding-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .server-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin-bottom: 30px;
        }
        .server-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            padding: 12px 20px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            min-width: 140px;
            text-align: center;
        }
        .server-btn:hover { background: rgba(245, 197, 24, 0.2); border-color: #f5c518; }
        .server-btn.active { background: rgba(245, 197, 24, 0.9); color: black; border-color: #f5c518; }
        .iframe-container {
            width: 100%;
            height: 500px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            display: none;
        }
        .iframe-container.active { display: block; }
        .iframe-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #ccc;
            font-size: 18px;
        }
        .play-icon-large {
            font-size: 60px;
            color: #f5c518;
            margin-bottom: 20px;
            cursor: pointer;
        }
        .watch-instruction {
            margin-top: 20px;
            font-size: 16px;
            color: #aaa;
            text-align: center;
            max-width: 80%;
            line-height: 1.5;
        }
        .footer-link {
            text-align: center;
            margin: 30px 0;
        }
        .footer-link a {
            display: inline-block;
            background: #f5c518;
            color: black;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
        }
        @media (max-width: 768px) {
            .main-container { flex-direction: column; padding: 30px 20px; }
            .content-main { margin-right: 0; max-width: 100%; margin-bottom: 30px; }
            .thumbnail-card { width: 100%; max-width: 300px; margin: 0 auto; }
            h1 { font-size: 36px; }
            .iframe-container { height: 350px; }
        }
    </style>
</head>
<body>
    <div class="main-container">
        <div class="thumbnail-card">
            <img alt="${title}" src="${image}" />
            <div class="thumbnail-overlay">
                <div class="play-button"><span>▶</span></div>
                <p class="thumbnail-text">تشغيل<br /><span>${title.split(' ').slice(0, 3).join(' ')}</span></p>
            </div>
        </div>

        <div class="content-main">
            <h1>${title}</h1>
            
            <div class="rating-stats">
                <div class="stat-item"><i class="fas fa-star"></i><span>${randomRating} / 5</span></div>
                <div class="stat-item"><i class="fas fa-eye"></i><span>${randomViews.toLocaleString()} مشاهدة</span></div>
                <div class="stat-item"><i class="fas fa-thumbs-up"></i><span>${randomLikes.toLocaleString()} إعجاب</span></div>
            </div>
            
            <p class="meta-info">⭐ ${randomRating} &nbsp; | &nbsp; ${duration} &nbsp; | &nbsp; مسلسلات رمضان 2026 &nbsp; | &nbsp; مترجمة</p>
            
            <p class="description">${description}</p>
            
            <div style="margin-top: 30px;">
                <a href="#" id="watchBtn" class="player-btn"><span style="margin-left: 5px;">▶</span> مشاهدة الآن</a>
                <a href="${SITE_URL}" target="_blank" class="site-link"><i class="fas fa-external-link-alt"></i> زيارة موقع كيروزوزو</a>
            </div>
            
            ${serversHTML}
        </div>
    </div>

    <div class="footer-link">
        <a href="${SITE_URL}" target="_blank"><i class="fas fa-external-link-alt"></i> لمزيد من الأفلام والمسلسلات زوروا موقع كيروزوزو</a>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const watchBtn = document.getElementById('watchBtn');
        const serversSection = document.getElementById('serversSection');
        
        if (watchBtn && serversSection) {
            watchBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (serversSection.style.display === 'none' || serversSection.style.display === '') {
                    serversSection.style.display = 'block';
                    watchBtn.innerHTML = '<span style=\"margin-left: 5px;\">▲</span> إخفاء السيرفرات';
                    serversSection.scrollIntoView({ behavior: 'smooth' });
                } else {
                    serversSection.style.display = 'none';
                    watchBtn.innerHTML = '<span style=\"margin-left: 5px;\">▶</span> مشاهدة الآن';
                }
            });
        }
        
        const serverButtons = document.querySelectorAll('.server-btn');
        const iframeContainers = document.querySelectorAll('.iframe-container');
        
        serverButtons.forEach(button => {
            button.addEventListener('click', function() {
                const serverId = this.getAttribute('data-server');
                serverButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                iframeContainers.forEach(container => container.classList.remove('active'));
                document.getElementById(serverId).classList.add('active');
            });
        });
        
        const playIcons = document.querySelectorAll('.play-icon-large');
        playIcons.forEach(icon => {
            icon.addEventListener('click', function() {
                const videoUrl = this.getAttribute('data-url');
                const container = this.closest('.iframe-container');
                container.innerHTML = \`<iframe src="\${videoUrl}" width="100%" height="100%" frameborder="0" allowfullscreen style="border: none;"></iframe>\`;
            });
        });
    });
    </script>
</body>
</html>`;
}

// ==================== التشغيل الرئيسي ====================
(async () => {
    try {
        console.log('🚀 بدأ النشر الآلي - حلقة واحدة في كل مرة');
        console.log('==========================================\n');
        console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
        console.log('🌐 المصدر: موقع لاروزا - رمضان 2026');
        console.log('📝 الهدف: استخراج حلقة واحدة جديدة ونشرها\n');

        // التحقق من صحة التوكن
        if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
            throw new Error('❌ بيانات Blogger غير مكتملة');
        }

        const extractor = new LaroozaExtractor();
        const episode = await extractor.getNextUnpublishedEpisode();
        
        if (!episode) {
            console.log('⏹️ لا توجد حلقات جديدة للاستخراج والنشر');
            return;
        }

        console.log('\n📋 تفاصيل الحلقة المستخرجة:');
        console.log(`🎬 العنوان: ${episode.title}`);
        console.log(`🆔 المعرف: ${episode.id}`);
        console.log(`⏱️ المدة: ${episode.duration}`);
        console.log(`🌐 عدد السيرفرات: ${episode.servers?.length || 0}`);
        console.log(`🔗 الرابط: ${episode.link}\n`);

        console.log('🔍 التحقق من سجل النشر...');
        const publishedLog = await getPublishedLog();
        
        if (publishedLog.items.find(p => p.id === episode.id)) {
            console.log('⚠️ هذه الحلقة منشورة مسبقاً! سيتم تخطيها');
            return;
        }

        console.log('🔑 جاري الحصول على Access Token...');
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: REFRESH_TOKEN,
                grant_type: "refresh_token"
            })
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            throw new Error('❌ فشل الحصول على Access Token: ' + JSON.stringify(tokenData));
        }
        
        const accessToken = tokenData.access_token;
        console.log('✅ تم الحصول على التوكن\n');

        console.log('🛠️ جاري إنشاء المقال...');
        const htmlContent = createContentHTML(episode);

        console.log('📝 جاري النشر في Blogger...');
        const publishResult = await publishToBlogger(accessToken, htmlContent, episode.title);
        
        if (publishResult.id) {
            console.log('✅ تم النشر بنجاح!');
            console.log(`🔗 الرابط: ${publishResult.url}`);
            
            console.log('\n💾 جاري تحديث سجل النشر...');
            const saved = await saveToPublishedLog(episode.id, episode.title);
            
            if (saved) {
                console.log('🎉 اكتملت العملية بنجاح!');
                console.log('\n📊 ملخص:');
                console.log(`✅ تم استخراج ونشر: ${episode.title}`);
                console.log(`🆔 معرف الحلقة: ${episode.id}`);
                console.log(`📅 تاريخ النشر: ${new Date().toLocaleString('ar-SA')}`);
                console.log(`📚 إجمالي المستخرج: ${extractor.extractedHistory.size} حلقة`);
                console.log(`📚 إجمالي المنشور: ${publishedLog.items.length + 1} حلقة`);
            }
        } else {
            console.error('❌ فشل النشر:', publishResult.error?.message || 'خطأ غير معروف');
        }

    } catch (error) {
        console.error('🚨 خطأ رئيسي:', error.message);
        console.error('📋 تفاصيل الخطأ:', error.stack);
    }
})();
