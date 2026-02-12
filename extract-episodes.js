const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

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
const REPO_PATH = `${GH_USER}/${GH_REPO}`;
const HISTORY_FILE = "ramadan_history.json";
const PUBLISHED_FILE = "published_log.json";

// ✅ Larooza Settings - الرابط الصحيح من صفحة HTML العاملة
const LAROOZA_DOMAINS = [
    "https://larooza.life",      // ✅ هذا اللي شغال في صفحة HTML
    "https://laroza.bond",       // المحاولة الثانية
    "https://laroza.lol",        // المحاولة الثالثة
    "https://laroza.online",     // المحاولة الرابعة
    "https://laroza.video"       // المحاولة الخامسة
];

const LAROOZA_CATEGORY = "category.php?cat=ramadan-2026";

// ✅ Proxies - نفس اللي في صفحة HTML
const PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/',
    'https://api.allorigins.win/raw?url=',
    ''  // اتصال مباشر
];

// ==================== GitHub Storage ====================
class GitHubStorage {
    constructor() {
        this.token = GH_TOKEN;
        this.repo = REPO_PATH;
    }

    async readFile(filename) {
        try {
            const response = await fetch(
                `${GITHUB_API}/repos/${this.repo}/contents/${filename}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Cron-Job-Script'
                    }
                }
            );

            if (response.status === 200) {
                const data = await response.json();
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                return {
                    content: JSON.parse(content),
                    sha: data.sha
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    async writeFile(filename, content, message) {
        try {
            let sha = null;
            const existing = await this.readFile(filename);
            if (existing) sha = existing.sha;

            const contentBase64 = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

            const response = await fetch(
                `${GITHUB_API}/repos/${this.repo}/contents/${filename}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Cron-Job-Script'
                    },
                    body: JSON.stringify({
                        message: message,
                        content: contentBase64,
                        ...(sha && { sha })
                    })
                }
            );

            return response.ok;
        } catch (error) {
            console.error(`❌ خطأ في حفظ ${filename}:`, error.message);
            return false;
        }
    }

    async getHistory() {
        const data = await this.readFile(HISTORY_FILE);
        if (data) return data.content;
        
        const newHistory = {
            last_updated: new Date().toISOString(),
            total_extracted: 0,
            extracted_ids: []
        };
        await this.writeFile(HISTORY_FILE, newHistory, "✨ إنشاء سجل استخراج جديد");
        return newHistory;
    }

    async addToHistory(episodeId, episodeTitle) {
        const history = await this.getHistory();
        if (!history.extracted_ids.includes(episodeId)) {
            history.extracted_ids.push(episodeId);
            history.total_extracted = history.extracted_ids.length;
            history.last_updated = new Date().toISOString();
            await this.writeFile(HISTORY_FILE, history, `➕ إضافة: ${episodeTitle.substring(0, 30)}...`);
            return true;
        }
        return false;
    }

    async getPublishedLog() {
        const data = await this.readFile(PUBLISHED_FILE);
        if (data) return data.content;
        
        const newLog = {
            last_updated: new Date().toISOString(),
            total: 0,
            items: []
        };
        await this.writeFile(PUBLISHED_FILE, newLog, "✨ إنشاء سجل نشر جديد");
        return newLog;
    }

    async addToPublished(episodeId, episodeTitle, postUrl = "") {
        const log = await this.getPublishedLog();
        if (!log.items.find(item => item.id === episodeId)) {
            log.items.push({
                id: episodeId,
                title: episodeTitle,
                date: new Date().toISOString(),
                url: postUrl
            });
            log.total = log.items.length;
            log.last_updated = new Date().toISOString();
            await this.writeFile(PUBLISHED_FILE, log, `📝 نشر: ${episodeTitle.substring(0, 30)}...`);
            return true;
        }
        return false;
    }
}

// ==================== Larooza Extractor - بنفس منطق HTML ====================
class LaroozaExtractor {
    constructor(githubStorage) {
        this.github = githubStorage;
        this.extractedIds = new Set();
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    }

    async loadHistory() {
        const history = await this.github.getHistory();
        this.extractedIds = new Set(history.extracted_ids || []);
        console.log(`📚 سجل الاستخراج: ${this.extractedIds.size} حلقة مستخرجة سابقاً`);
    }

    async fetchWithProxies(url) {
        console.log(`📥 محاولة الاتصال بـ: ${url}`);
        
        // تجربة كل البروكسيات
        for (const proxy of PROXIES) {
            try {
                let fetchUrl = url;
                if (proxy) {
                    fetchUrl = proxy + encodeURIComponent(url);
                }
                
                console.log(`🔄 تجربة: ${proxy || 'اتصال مباشر'}`);
                
                const response = await fetch(fetchUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'User-Agent': this.userAgent
                    },
                    timeout: 15000
                });

                if (response.ok) {
                    const html = await response.text();
                    if (html && html.length > 500) {
                        console.log(`✅ نجح الاتصال عبر: ${proxy || 'مباشر'}`);
                        return { html, success: true, proxy };
                    }
                }
            } catch (error) {
                console.log(`❌ فشل: ${proxy || 'مباشر'}`);
                continue;
            }
        }
        
        return { html: null, success: false };
    }

    async fetchAllEpisodes() {
        console.log('\n🔍 جاري البحث عن حلقات رمضان 2026...');
        
        // تجربة كل الدومينات
        for (const domain of LAROOZA_DOMAINS) {
            const url = `${domain}/${LAROOZA_CATEGORY}`;
            console.log(`\n🌐 محاولة الدومين: ${domain}`);
            
            const result = await this.fetchWithProxies(url);
            
            if (result.success && result.html) {
                console.log(`✅ تم الاتصال بنجاح باستخدام: ${domain}`);
                const episodes = this.extractEpisodesFromHTML(result.html, domain);
                
                if (episodes.length > 0) {
                    console.log(`📊 تم العثور على ${episodes.length} حلقة في ${domain}`);
                    return episodes;
                }
            }
        }
        
        console.log('❌ فشل الاتصال بجميع الدومينات');
        return [];
    }

    extractEpisodesFromHTML(html, baseUrl) {
        const root = parse(html);
        const episodes = [];
        const seenUrls = new Set();

        // البحث عن عناصر الحلقات - نفس المحددات في صفحة HTML
        const episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3');
        
        console.log(`📑 تم العثور على ${episodeElements.length} عنصر حلقة في الصفحة`);

        for (const element of episodeElements) {
            try {
                const episode = this.extractEpisodeFromElement(element, baseUrl);
                if (episode && episode.id && !seenUrls.has(episode.link)) {
                    episodes.push(episode);
                    seenUrls.add(episode.link);
                }
            } catch (error) {
                // تجاهل الأخطاء الفردية
            }
        }

        return episodes.slice(0, 30); // أخذ أول 30 حلقة فقط
    }

    extractEpisodeFromElement(element, baseUrl) {
        // استخراج رابط الحلقة
        const linkElement = element.querySelector('a');
        if (!linkElement) return null;
        
        let link = linkElement.getAttribute('href');
        if (!link) return null;
        
        // تصحيح الرابط
        link = this.fixUrl(link, baseUrl);
        
        // استخراج معرف الفيديو
        const vidMatch = link.match(/[?&]vid=([a-zA-Z0-9_-]+)/i);
        if (!vidMatch) return null;
        
        const episodeId = vidMatch[1];
        
        // استخراج الصورة
        const imgElement = element.querySelector('img');
        let image = null;
        
        if (imgElement) {
            image = imgElement.getAttribute('src') || imgElement.getAttribute('data-src');
            if (image && (image.includes('blank.gif') || image.includes('data:image'))) {
                image = null;
            }
            if (image) {
                image = this.fixUrl(image, baseUrl);
            }
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration');
        const duration = durationElement ? durationElement.textContent.trim() : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis') || element.querySelector('a');
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanText(titleElement.textContent || titleElement.getAttribute('title') || '');
        }
        
        // استخراج تفاصيل إضافية
        const description = `مشاهدة وتحميل ${title} - مسلسلات رمضان 2026 مترجمة اون لاين بجودة عالية`;
        
        return {
            id: episodeId,
            title: title,
            image: image || 'https://via.placeholder.com/300x450/1a1a1a/e50914?text=رمضان+2026',
            link: link,
            duration: duration,
            description: description,
            servers: [{
                id: '1',
                name: 'سيرفر المشاهدة المباشر',
                url: `${baseUrl}/embed.php?vid=${episodeId}`
            }]
        };
    }

    fixUrl(url, baseUrl) {
        if (!url) return '#';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) {
            const base = new URL(baseUrl);
            return base.origin + url;
        }
        if (!url.startsWith('http')) return baseUrl + '/' + url;
        return url;
    }

    cleanText(text) {
        if (!text) return '';
        return text
            .replace(/[\n\r\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async getNextEpisode() {
        await this.loadHistory();
        
        const allEpisodes = await this.fetchAllEpisodes();
        
        if (allEpisodes.length === 0) {
            console.log('⚠️ لم يتم العثور على حلقات');
            return null;
        }

        // البحث عن أول حلقة غير مستخرجة
        for (const episode of allEpisodes) {
            if (!this.extractedIds.has(episode.id)) {
                console.log(`\n🎬 تم العثور على حلقة جديدة:`);
                console.log(`📺 العنوان: ${episode.title}`);
                console.log(`🆔 المعرف: ${episode.id}`);
                console.log(`🔗 الرابط: ${episode.link}`);
                
                // حفظ في السجل
                await this.github.addToHistory(episode.id, episode.title);
                this.extractedIds.add(episode.id);
                
                return episode;
            }
        }
        
        console.log('✅ جميع الحلقات مستخرجة مسبقاً');
        return null;
    }
}

// ==================== Blogger Publisher ====================
async function publishToBlogger(accessToken, content, title) {
    const post = {
        title: title,
        content: content,
        labels: [
            "مسلسلات رمضان 2026",
            "مسلسلات مترجمة",
            "مشاهدة اون لاين",
            "لاروزا",
            "كيروزوزو",
            "رمضان 2026"
        ]
    };

    const response = await fetch(
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

    return await response.json();
}

function createPostHTML(episode) {
    return `<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${episode.title} - مشاهدة مباشرة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Cairo', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
        body { background: linear-gradient(135deg, #141414, #000000); color: #fff; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .player-section {
            background: rgba(45, 45, 45, 0.95);
            border-radius: 15px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 8px 20px rgba(229, 9, 20, 0.2);
            border: 1px solid #e50914;
        }
        h1 {
            color: #e50914;
            font-size: 32px;
            margin-bottom: 30px;
            text-align: center;
            text-shadow: 0 2px 10px rgba(229, 9, 20, 0.5);
        }
        .video-wrapper {
            position: relative;
            padding-bottom: 56.25%;
            height: 0;
            overflow: hidden;
            border-radius: 10px;
            margin: 20px 0;
            border: 2px solid #e50914;
        }
        .video-wrapper iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
        }
        .episode-info {
            background: rgba(30, 30, 30, 0.9);
            padding: 25px;
            border-radius: 10px;
            margin-top: 30px;
            border: 1px solid #444;
        }
        .description {
            color: #ccc;
            font-size: 16px;
            line-height: 1.8;
            margin-top: 15px;
        }
        .watch-btn {
            display: inline-block;
            background: #e50914;
            color: #fff;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
            margin-top: 20px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(229, 9, 20, 0.3);
        }
        .watch-btn:hover {
            background: #b8070f;
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(229, 9, 20, 0.5);
        }
        .site-link {
            display: inline-block;
            background: #333;
            color: #fff;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
            margin-top: 20px;
            margin-right: 10px;
            transition: all 0.3s ease;
        }
        .site-link:hover {
            background: #444;
            transform: translateY(-3px);
        }
        .duration {
            display: inline-block;
            background: #e50914;
            padding: 8px 15px;
            border-radius: 5px;
            font-size: 14px;
            margin-top: 10px;
        }
        @media (max-width: 768px) {
            h1 { font-size: 24px; }
            .container { padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="player-section">
            <h1>🎬 ${episode.title}</h1>
            
            <div class="video-wrapper">
                <iframe src="${episode.servers[0].url}" allowfullscreen></iframe>
            </div>
            
            <div class="episode-info">
                <span class="duration">⏱️ ${episode.duration}</span>
                
                <p class="description">${episode.description}</p>
                
                <div style="text-align: center;">
                    <a href="${episode.servers[0].url}" class="watch-btn" target="_blank">
                        ▶ مشاهدة بملء الشاشة
                    </a>
                    <a href="${SITE_URL}" class="site-link" target="_blank">
                        🌐 كيروزوزو - المزيد من المسلسلات
                    </a>
                </div>
            </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #999;">
            <p>جميع حقوق الملكية محفوظة لأصحابها | موقع كيروزوزو للترفيه</p>
        </div>
    </div>
</body>
</html>`;
}

// ==================== Main ====================
(async () => {
    console.log('🎬 نظام استخراج ونشر حلقات رمضان 2026');
    console.log('======================================');
    console.log(`📅 التاريخ: ${new Date().toLocaleString('ar-SA')}`);
    console.log(`🔍 المصدر: لاروزا - رمضان 2026\n`);

    try {
        // 1. تهيئة التخزين
        const github = new GitHubStorage();
        
        // 2. استخراج الحلقة التالية
        const extractor = new LaroozaExtractor(github);
        const episode = await extractor.getNextEpisode();
        
        if (!episode) {
            console.log('\n⏹️ لا توجد حلقة جديدة للنشر');
            return;
        }

        // 3. التحقق من النشر المسبق
        const published = await github.getPublishedLog();
        if (published.items.find(p => p.id === episode.id)) {
            console.log('\n⚠️ هذه الحلقة منشورة مسبقاً');
            return;
        }

        // 4. الحصول على توكن Blogger
        console.log('\n🔑 جاري الحصول على توكن Blogger...');
        
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
            throw new Error('❌ فشل الحصول على توكن Blogger');
        }

        console.log('✅ تم الحصول على التوكن بنجاح');

        // 5. إنشاء محتوى المقال
        console.log('\n📝 جاري إنشاء المقال...');
        const htmlContent = createPostHTML(episode);

        // 6. النشر على Blogger
        console.log('📤 جاري النشر على Blogger...');
        const publishResult = await publishToBlogger(tokenData.access_token, htmlContent, episode.title);

        if (publishResult.id) {
            console.log('✅ تم النشر بنجاح!');
            console.log(`🔗 رابط المقال: ${publishResult.url}`);
            
            // 7. حفظ في سجل النشر
            await github.addToPublished(episode.id, episode.title, publishResult.url);
            
            console.log('\n📊 ملخص العملية:');
            console.log(`✅ الحلقة: ${episode.title}`);
            console.log(`🆔 المعرف: ${episode.id}`);
            console.log(`⏱️ المدة: ${episode.duration}`);
            console.log(`📅 النشر: ${new Date().toLocaleString('ar-SA')}`);
        } else {
            console.error('❌ فشل النشر:', publishResult.error?.message || 'خطأ غير معروف');
        }

    } catch (error) {
        console.error('\n🚨 خطأ رئيسي:', error.message);
        console.error('📋 تفاصيل:', error.stack);
    }
})();
