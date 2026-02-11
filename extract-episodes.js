const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

// ==================== الإعدادات ====================
// ✅ Blogger Settings
const CLIENT_ID = "676395600013-j9kb2psm5il4aj7o9q9m7k0r521h7rrh.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REFRESH_TOKEN = "1//057rt4gQb0h6bCgYIARAAGAUSNwF-L9IrzWvRhe034kgg-KMqE4lI6OqBaraaWQQNDbpXm9XvvqXaIGBEJH_TVB9aldvxbdnbC-E";
const BLOG_ID = "8351599421307503563";
const SITE_URL = "https://www.kirozozo.xyz/";

// ✅ GitHub Settings (للسجل فقط)
const GH_TOKEN = "your_github_token_here";
const GH_USER = "FadiCraft";
const GH_REPO = "cron-test";
const GITHUB_API = "https://api.github.com";
const PUBLISHED_FILE = "published_log.json";
const REPO_PATH = `${GH_USER}/${GH_REPO}`;

// ✅ Larooza Settings
const LAROOZA_URL = "https://z.larooza.life/category.php?cat=ramadan-2026";
const BASE_URL = "https://z.larooza.life";

// ==================== كلاس استخراج لاروزا (مبسط) ====================
class LaroozaExtractor {
    constructor() {
        this.outputDir = 'Ramadan';
        this.historyFile = 'extracted_history.json';
        this.baseUrl = BASE_URL;
        this.extractedHistory = new Set();
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        this.loadExtractionHistory();
        
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        ];
        
        this.requestDelay = 1000;
        this.timeout = 20000;
    }

    // تحميل سجل الاستخراج
    loadExtractionHistory() {
        const historyPath = path.join(this.outputDir, this.historyFile);
        
        if (fs.existsSync(historyPath)) {
            try {
                const data = fs.readFileSync(historyPath, 'utf8');
                const history = JSON.parse(data);
                this.extractedHistory = new Set(history.extracted_ids || []);
                console.log(`📚 سجل الاستخراج: ${this.extractedHistory.size} حلقة مستخرجة سابقاً`);
            } catch (error) {
                this.extractedHistory = new Set();
            }
        } else {
            console.log('📝 لا يوجد سجل استخراج سابق');
            this.extractedHistory = new Set();
        }
    }

    // حفظ سجل الاستخراج
    saveExtractionHistory(newId) {
        const historyPath = path.join(this.outputDir, this.historyFile);
        
        this.extractedHistory.add(newId);
        
        const historyData = {
            last_updated: new Date().toISOString(),
            total_extracted: this.extractedHistory.size,
            extracted_ids: Array.from(this.extractedHistory)
        };
        
        fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
        console.log(`📝 تم تحديث سجل الاستخراج: ${this.extractedHistory.size} حلقة إجمالاً`);
    }

    // تأخير
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // جلب URL
    async fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
            
            const options = {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                    'Referer': this.baseUrl,
                },
                timeout: this.timeout
            };
            
            const req = https.get(url, options, (res) => {
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

    // استخراج جميع الحلقات من الصفحة بالترتيب
    async fetchAllEpisodes() {
        console.log('📥 جاري تحميل صفحة لاروزا...');
        const html = await this.fetchUrl(LAROOZA_URL);
        const root = parse(html);
        
        const episodes = [];
        const episodeElements = root.querySelectorAll('li.col-xs-6, li.col-sm-4, li.col-md-3');
        
        console.log(`📊 وجدت ${episodeElements.length} حلقة في الصفحة`);
        
        for (const element of episodeElements) {
            try {
                const episode = await this.extractEpisodeFromElement(element);
                if (episode && episode.id && episode.title) {
                    episodes.push(episode);
                }
            } catch (error) {
                // تخطي الخطأ
            }
        }
        
        // ترتيب الحلقات كما هي في الصفحة
        return episodes;
    }

    // استخراج حلقة من عنصر HTML
    async extractEpisodeFromElement(element) {
        const linkElement = element.querySelector('a');
        const href = linkElement?.getAttribute('href');
        
        if (!href) return null;
        
        const link = this.fixUrl(href);
        
        // استخراج ID من الرابط
        const vidMatch = link.match(/vid=([a-zA-Z0-9_-]+)/i);
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
            if (image) image = this.fixUrl(image);
        }
        
        // استخراج المدة
        const durationElement = element.querySelector('.pm-label-duration');
        const duration = durationElement ? this.cleanText(durationElement.textContent) : '00:00';
        
        // استخراج العنوان
        const titleElement = element.querySelector('.ellipsis') || element.querySelector('a');
        let title = 'عنوان غير معروف';
        if (titleElement) {
            title = this.cleanTitle(titleElement.textContent || titleElement.getAttribute('title') || '');
        }
        
        // جلب التفاصيل والسيرفرات
        await this.delay(this.requestDelay);
        const details = await this.extractEpisodeDetails(link);
        const servers = await this.extractEpisodeServers(link);
        
        return {
            id: episodeId,
            title: details?.title || title,
            image: details?.image || image,
            link: link,
            duration: duration,
            description: details?.description || '',
            servers: servers || [],
            videoUrl: `${this.baseUrl}/embed.php?vid=${episodeId}`
        };
    }

    // استخراج التفاصيل
    async extractEpisodeDetails(episodeUrl) {
        try {
            const html = await this.fetchUrl(episodeUrl);
            const root = parse(html);
            
            const details = {};
            
            const titleMeta = root.querySelector('meta[name="title"]');
            if (titleMeta) details.title = this.cleanTitle(titleMeta.getAttribute('content'));
            
            const descMeta = root.querySelector('meta[name="description"]');
            if (descMeta) {
                const desc = descMeta.getAttribute('content');
                details.description = this.cleanText(desc).substring(0, 200) + '...';
            }
            
            const imageMeta = root.querySelector('meta[property="og:image"]');
            if (imageMeta) details.image = imageMeta.getAttribute('content');
            
            return details;
        } catch (error) {
            return null;
        }
    }

    // استخراج السيرفرات
    async extractEpisodeServers(episodeUrl) {
        try {
            const playUrl = episodeUrl.replace('video.php', 'play.php');
            const html = await this.fetchUrl(playUrl);
            const root = parse(html);
            
            const servers = [];
            const serverList = root.querySelector('.WatchList');
            
            if (serverList) {
                const serverItems = serverList.querySelectorAll('li');
                
                serverItems.forEach((item, index) => {
                    const embedUrl = item.getAttribute('data-embed-url');
                    if (embedUrl) {
                        const serverNameElement = item.querySelector('strong');
                        const serverName = serverNameElement ? 
                            this.cleanText(serverNameElement.textContent) : 
                            `سيرفر ${index + 1}`;
                        
                        servers.push({
                            id: (index + 1).toString(),
                            name: serverName,
                            url: embedUrl
                        });
                    }
                });
            }
            
            return servers;
        } catch (error) {
            // إرجاع سيرفر افتراضي في حالة الفشل
            const vidMatch = episodeUrl.match(/vid=([a-zA-Z0-9_-]+)/i);
            const vid = vidMatch ? vidMatch[1] : 'unknown';
            
            return [{
                id: '1',
                name: 'سيرفر 1',
                url: `${this.baseUrl}/embed.php?vid=${vid}`
            }];
        }
    }

    // دوال مساعدة
    fixUrl(url) {
        if (!url) return '#';
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return this.baseUrl + url;
        if (!url.startsWith('http')) return this.baseUrl + '/' + url;
        return url;
    }

    cleanTitle(text) {
        if (!text) return '';
        return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    cleanText(text) {
        if (!text) return '';
        return text.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // الحصول على الحلقة التالية غير المستخرجة
    async getNextUnpublishedEpisode() {
        console.log('\n🔍 البحث عن الحلقة التالية غير المنشورة...');
        
        // 1. جلب جميع الحلقات من لاروزا
        const allEpisodes = await this.fetchAllEpisodes();
        console.log(`📊 إجمالي الحلقات في الموقع: ${allEpisodes.length}`);
        
        // 2. البحث عن أول حلقة لم تستخرج من قبل
        for (const episode of allEpisodes) {
            if (!this.extractedHistory.has(episode.id)) {
                console.log(`🎬 الحلقة التالية: ${episode.title}`);
                console.log(`🆔 ${episode.id}`);
                
                // حفظ معرف الحلقة في السجل (بعد الاستخراج)
                this.saveExtractionHistory(episode.id);
                
                return episode;
            }
        }
        
        console.log('⚠️ لا توجد حلقات جديدة للاستخراج!');
        return null;
    }
}

// ==================== دوال النشر على Blogger ====================

// قراءة سجل المنشورات من GitHub
async function getPublishedLog() {
  try {
    if (!GH_TOKEN) {
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
      return { items: [], lastCheck: new Date().toISOString(), total: 0 };
    }
  } catch (error) {
    console.error('❌ خطأ في قراءة السجل:', error.message);
    return { items: [], lastCheck: new Date().toISOString(), total: 0 };
  }
}

// حفظ سجل المنشورات في GitHub
async function saveToPublishedLog(itemId, title) {
  try {
    const log = await getPublishedLog();
    
    // التحقق من التكرار
    if (log.items.find(item => item.id === itemId)) {
      console.log(`⚠️ "${title}" منشور مسبقاً`);
      return true;
    }

    // إضافة العنصر الجديد
    log.items.push({
      id: itemId,
      title: title,
      date: new Date().toISOString(),
      url: `https://kirozozoblog.blogspot.com/search?q=${encodeURIComponent(title)}`
    });
    
    log.lastCheck = new Date().toISOString();
    log.total = log.items.length;

    // رفع الملف المحدث
    const content = JSON.stringify(log, null, 2);
    const contentBase64 = Buffer.from(content).toString('base64');

    // جلب SHA للملف الحالي
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
      return false;
    }

  } catch (error) {
    console.error('🚨 خطأ في حفظ السجل:', error.message);
    return false;
  }
}

// النشر في Blogger
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

// إنشاء محتوى HTML (نفس التصميم)
function createContentHTML(item) {
  const title = item.title || 'عنوان غير محدد';
  const image = item.image || '';
  const description = item.description || 'لا يوجد وصف متوفر.';
  const servers = item.servers || [];
  const duration = item.duration || 'غير محدد';
  const link = item.link || '#';
  
  const randomViews = Math.floor(Math.random() * 10000) + 5000;
  const randomLikes = Math.floor(Math.random() * 1000) + 200;
  const randomRating = (Math.random() * 2 + 3).toFixed(1);

  return `...`; // نفس الـ HTML الطويل من الكود الأول (حذفته للاختصار)
}

// ==================== التشغيل الرئيسي ====================
(async () => {
  try {
    console.log('🚀 بدأ النشر الآلي - حلقة واحدة في كل مرة');
    console.log('==========================================\n');
    console.log('📅 التاريخ:', new Date().toLocaleString('ar-SA'));
    console.log('🌐 المصدر: موقع لاروزا - رمضان 2026');
    console.log('📝 الهدف: استخراج حلقة واحدة جديدة ونشرها\n');

    // 1. استخراج الحلقة التالية غير المنشورة
    const extractor = new LaroozaExtractor();
    const episode = await extractor.getNextUnpublishedEpisode();
    
    if (!episode) {
      console.log('⏹️ لا توجد حلقات جديدة للاستخراج والنشر');
      console.log('📊 إجمالي الحلقات المستخرجة:', extractor.extractedHistory.size);
      return;
    }

    console.log('\n📋 تفاصيل الحلقة المستخرجة:');
    console.log(`🎬 العنوان: ${episode.title}`);
    console.log(`🆔 المعرف: ${episode.id}`);
    console.log(`⏱️ المدة: ${episode.duration}`);
    console.log(`🌐 السيرفرات: ${episode.servers?.length || 0}`);
    console.log(`🔗 الرابط: ${episode.link}\n`);

    // 2. التحقق من أن الحلقة لم تنشر من قبل
    console.log('🔍 التحقق من سجل النشر...');
    const publishedLog = await getPublishedLog();
    
    if (publishedLog.items.find(p => p.id === episode.id)) {
      console.log('⚠️ هذه الحلقة منشورة مسبقاً! سيتم تخطيها');
      console.log('📌 تأكد من سجل الاستخراج في المرة القادمة');
      return;
    }

    // 3. الحصول على Access Token
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
      throw new Error('❌ فشل الحصول على Access Token');
    }
    
    const accessToken = tokenData.access_token;
    console.log('✅ تم الحصول على التوكن\n');

    // 4. إنشاء المحتوى
    console.log('🛠️ جاري إنشاء المقال...');
    const htmlContent = createContentHTML(episode);

    // 5. النشر في Blogger
    console.log('📝 جاري النشر في Blogger...');
    const publishResult = await publishToBlogger(accessToken, htmlContent, episode.title);
    
    if (publishResult.id) {
      console.log('✅ تم النشر بنجاح!');
      console.log(`🔗 الرابط: ${publishResult.url}`);
      
      // 6. تحديث سجل النشر
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
    console.error(error.stack);
  }
})();
