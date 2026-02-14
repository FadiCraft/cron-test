import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== إعدادات المسارات ====================
const NITWEX_DIR = path.join(__dirname, "NitWex");
const CHANNELS_DIR = path.join(NITWEX_DIR, "Channels");
const VIDEOS_DIR = path.join(NITWEX_DIR, "Videos");
const CACHE_DIR = path.join(NITWEX_DIR, "Cache");
const PROGRESS_FILE = path.join(NITWEX_DIR, "nitwex_progress.json");
const CHANNELS_LIST_FILE = path.join(NITWEX_DIR, "channels.json");

// إنشاء المجلدات
const createDirectories = async () => {
    console.log("📁 جاري إنشاء المجلدات...");
    const dirs = [NITWEX_DIR, CHANNELS_DIR, VIDEOS_DIR, CACHE_DIR];
    
    await Promise.all(dirs.map(async (dir) => {
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
            console.log(`   ✅ تم إنشاء: ${path.basename(dir)}`);
        }
    }));
    
    console.log("✅ اكتمل إنشاء المجلدات\n");
};

await createDirectories();

// ==================== إعدادات النظام ====================
const CONFIG = {
    itemsPerFile: 50,          // عدد الفيديوهات في كل ملف
    channelsPerRun: 2,          // عدد القنوات في كل تشغيل
    videosPerChannel: 50,       // عدد الفيديوهات من كل قناة
    requestDelay: 1000,         // تأخير بين الطلبات
    maxRetries: 3,
    concurrentRequests: 2,
    cacheTTL: 3600000,          // ساعة
    userAgent: 'NitWex-Bot/1.0'
};

// ==================== قائمة القنوات المستهدفة ====================
const TARGET_CHANNELS = [
    { name: "GUMEChannel", category: "short_films", language: "ar" },
    { name: "Shahid", category: "series", language: "ar" },
    { name: "MBCGroup", category: "entertainment", language: "ar" },
    { name: "Rotana", category: "music", language: "ar" },
    { name: "AlJazeera", category: "documentary", language: "ar" },
    { name: "DubaiTV", category: "entertainment", language: "ar" },
    { name: "AbuDhabiTV", category: "general", language: "ar" },
    { name: "KuwaitTV", category: "general", language: "ar" },
    // يمكنك إضافة المزيد من القنوات هنا
];

// ==================== نظام التخزين المؤقت ====================
class CacheManager {
    constructor(cacheDir, ttl = CONFIG.cacheTTL) {
        this.cacheDir = cacheDir;
        this.ttl = ttl;
        this.memoryCache = new Map();
    }

    getCacheKey(endpoint, params) {
        const key = `${endpoint}_${JSON.stringify(params)}`;
        return Buffer.from(key).toString('base64').replace(/[/+=]/g, '_');
    }

    getCachePath(key) {
        return path.join(this.cacheDir, `${key}.json`);
    }

    async get(endpoint, params) {
        const key = this.getCacheKey(endpoint, params);
        
        // فحص الذاكرة المؤقتة
        if (this.memoryCache.has(key)) {
            const cached = this.memoryCache.get(key);
            if (Date.now() - cached.timestamp < this.ttl) {
                return cached.data;
            }
            this.memoryCache.delete(key);
        }

        // فحص ملف الكاش
        const cachePath = this.getCachePath(key);
        try {
            if (fs.existsSync(cachePath)) {
                const stats = await fs.promises.stat(cachePath);
                if (Date.now() - stats.mtimeMs < this.ttl) {
                    const data = JSON.parse(await fs.promises.readFile(cachePath, 'utf8'));
                    this.memoryCache.set(key, { data, timestamp: Date.now() });
                    return data;
                }
            }
        } catch (error) {
            // تجاهل أخطاء الكاش
        }
        return null;
    }

    async set(endpoint, params, data) {
        const key = this.getCacheKey(endpoint, params);
        
        // تخزين في الذاكرة
        this.memoryCache.set(key, { data, timestamp: Date.now() });

        // تخزين في ملف
        const cachePath = this.getCachePath(key);
        fs.promises.writeFile(cachePath, JSON.stringify(data, null, 2)).catch(() => {});
    }

    clear() {
        this.memoryCache.clear();
    }
}

// ==================== نظام طلبات Dailymotion API ====================
class DailymotionClient {
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
        this.baseUrl = "https://api.dailymotion.com";
        this.requestQueue = [];
        this.activeRequests = 0;
        this.lastRequestTime = 0;
    }

    async request(endpoint, params = {}, useCache = true) {
        // بناء URL
        const queryString = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        if (useCache) {
            const cached = await this.cacheManager.get(endpoint, params);
            if (cached) {
                console.log(`   🔵 من الكاش: ${endpoint}`);
                return cached;
            }
        }

        return this.queueRequest(url, endpoint, params);
    }

    async queueRequest(url, endpoint, params) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, endpoint, params, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.activeRequests >= CONFIG.concurrentRequests) return;

        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < CONFIG.requestDelay) {
            setTimeout(() => this.processQueue(), CONFIG.requestDelay - timeSinceLastRequest);
            return;
        }

        if (this.requestQueue.length === 0) return;

        this.activeRequests++;
        const { url, endpoint, params, resolve, reject } = this.requestQueue.shift();

        try {
            const result = await this.executeRequest(url);
            this.lastRequestTime = Date.now();
            
            // تخزين في الكاش
            await this.cacheManager.set(endpoint, params, result);
            
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    }

    async executeRequest(url, retries = CONFIG.maxRetries) {
        for (let i = 0; i < retries; i++) {
            try {
                if (i > 0) {
                    console.log(`   ↻ إعادة المحاولة ${i + 1}/${retries}...`);
                    await new Promise(r => setTimeout(r, 2000 * i));
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': CONFIG.userAgent,
                        'Accept': 'application/json'
                    },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                return data;

            } catch (error) {
                if (i === retries - 1) throw error;
            }
        }
    }

    // دوال مساعدة لـ Dailymotion API
    async getUserInfo(username) {
        return this.request(`/user/${username}`, {
            fields: 'username,screenname,description,avatar_360_url,videos_total,views_total,followers_total,created_time'
        });
    }

    async getUserVideos(username, page = 1, limit = 25) {
        return this.request(`/user/${username}/videos`, {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,likes_total,comments_total,embed_url',
            limit: limit,
            page: page,
            sort: 'recent'
        });
    }

    async searchVideos(query, owner = null, page = 1, limit = 25) {
        const params = {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,owner.username',
            search: query,
            limit: limit,
            page: page,
            sort: 'recent'
        };
        
        if (owner) {
            params.owners = owner;
        }
        
        return this.request('/videos', params);
    }

    async getVideoInfo(videoId) {
        return this.request(`/video/${videoId}`, {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,likes_total,comments_total,embed_url,owner.username,channel.name'
        });
    }
}

// ==================== نظام تتبع التقدم ====================
class ProgressTracker {
    constructor() {
        this.loadProgress();
        this.startTime = performance.now();
    }

    loadProgress() {
        try {
            if (fs.existsSync(PROGRESS_FILE)) {
                const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
                
                this.currentChannelIndex = data.currentChannelIndex || 0;
                this.currentChannelPage = data.currentChannelPage || 1;
                this.processedChannels = data.processedChannels || [];
                this.channelsProcessedThisRun = data.channelsProcessedThisRun || 0;
                this.targetChannelsPerRun = CONFIG.channelsPerRun;
                
                this.videoFileNumber = data.videoFileNumber || 1;
                this.videosInCurrentFile = data.videosInCurrentFile || 0;
                
                this.totalExtracted = data.totalExtracted || {
                    channels: 0,
                    videos: 0
                };
                
                this.lastRunDate = data.lastRunDate || null;
                
                console.log(`📊 تم استئناف العمل من قناة رقم ${this.currentChannelIndex + 1}`);
                console.log(`🎯 سيتم معالجة ${this.targetChannelsPerRun} قنوات في هذا التشغيل`);
                
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ خطأ في تحميل التقدم، بدء من جديد");
            this.resetProgress();
        }
    }

    resetProgress() {
        this.currentChannelIndex = 0;
        this.currentChannelPage = 1;
        this.processedChannels = [];
        this.channelsProcessedThisRun = 0;
        this.targetChannelsPerRun = CONFIG.channelsPerRun;
        
        this.videoFileNumber = 1;
        this.videosInCurrentFile = 0;
        
        this.totalExtracted = { channels: 0, videos: 0 };
        this.lastRunDate = null;
        
        this.saveProgress();
    }

    saveProgress() {
        const progressData = {
            currentChannelIndex: this.currentChannelIndex,
            currentChannelPage: this.currentChannelPage,
            processedChannels: this.processedChannels,
            channelsProcessedThisRun: this.channelsProcessedThisRun,
            targetChannelsPerRun: this.targetChannelsPerRun,
            
            videoFileNumber: this.videoFileNumber,
            videosInCurrentFile: this.videosInCurrentFile,
            
            totalExtracted: this.totalExtracted,
            lastRunDate: new Date().toISOString(),
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }

    canProcessMoreChannels() {
        return this.channelsProcessedThisRun < this.targetChannelsPerRun && 
               this.currentChannelIndex < TARGET_CHANNELS.length;
    }

    markChannelProcessed(channelName) {
        this.processedChannels.push({
            name: channelName,
            date: new Date().toISOString(),
            videosCount: this.totalExtracted.videos
        });
        
        this.channelsProcessedThisRun++;
        this.currentChannelIndex++;
        this.currentChannelPage = 1; // إعادة تعيين الصفحة للقناة الجديدة
        this.totalExtracted.channels++;
        
        this.saveProgress();
        
        console.log(`\n📊 تقدم التشغيل: ${this.channelsProcessedThisRun}/${this.targetChannelsPerRun} قنوات`);
    }

    addVideo() {
        this.totalExtracted.videos++;
        this.videosInCurrentFile++;
        
        if (this.videosInCurrentFile >= CONFIG.itemsPerFile) {
            this.videoFileNumber++;
            this.videosInCurrentFile = 0;
        }
        
        this.saveProgress();
    }

    getElapsedTime() {
        return ((performance.now() - this.startTime) / 1000).toFixed(1);
    }
}

// ==================== نظام الحفظ ====================
class StorageManager {
    constructor(progress) {
        this.progress = progress;
        this.writeQueue = [];
        this.isWriting = false;
    }

    async saveChannel(channelData) {
        const fileName = `${channelData.username}.json`;
        const filePath = path.join(CHANNELS_DIR, fileName);
        
        const channelInfo = {
            info: {
                type: 'channel',
                username: channelData.username,
                screenname: channelData.screenname,
                lastUpdated: new Date().toISOString()
            },
            data: channelData
        };
        
        await fs.promises.writeFile(filePath, JSON.stringify(channelInfo, null, 2));
        console.log(`   💾 تم حفظ معلومات القناة: ${channelData.username}`);
    }

    async saveVideo(videoData) {
        const fileName = `Videos_Part${this.progress.videoFileNumber}.json`;
        const filePath = path.join(VIDEOS_DIR, fileName);
        
        return new Promise((resolve) => {
            this.writeQueue.push({ filePath, videoData, resolve });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.isWriting || this.writeQueue.length === 0) return;
        
        this.isWriting = true;
        
        while (this.writeQueue.length > 0) {
            const batch = this.writeQueue.splice(0, 5);
            
            await Promise.all(batch.map(async ({ filePath, videoData, resolve }) => {
                try {
                    let data = { info: {}, videos: [] };
                    
                    if (fs.existsSync(filePath)) {
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        data = JSON.parse(content);
                    } else {
                        data.info = {
                            type: 'videos',
                            partNumber: this.progress.videoFileNumber,
                            created: new Date().toISOString(),
                            totalVideos: 0
                        };
                    }
                    
                    data.videos.push(videoData);
                    data.info.totalVideos = data.videos.length;
                    data.info.lastUpdated = new Date().toISOString();
                    
                    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
                    this.progress.addVideo();
                    
                    resolve({ success: true, file: path.basename(filePath) });
                } catch (error) {
                    console.log(`⚠️ خطأ في الحفظ: ${error.message}`);
                    resolve({ success: false, error: error.message });
                }
            }));
            
            if (this.writeQueue.length > 0) {
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        this.isWriting = false;
    }

    async updateChannelsList() {
        let channelsList = { info: {}, channels: [] };
        
        if (fs.existsSync(CHANNELS_LIST_FILE)) {
            channelsList = JSON.parse(await fs.promises.readFile(CHANNELS_LIST_FILE, 'utf8'));
        } else {
            channelsList.info = {
                type: 'channels_list',
                created: new Date().toISOString(),
                totalChannels: 0
            };
        }
        
        // إضافة القنوات المستهدفة
        TARGET_CHANNELS.forEach(channel => {
            if (!channelsList.channels.some(c => c.name === channel.name)) {
                channelsList.channels.push({
                    ...channel,
                    addedAt: new Date().toISOString(),
                    status: 'active'
                });
            }
        });
        
        channelsList.info.totalChannels = channelsList.channels.length;
        channelsList.info.lastUpdated = new Date().toISOString();
        
        await fs.promises.writeFile(CHANNELS_LIST_FILE, JSON.stringify(channelsList, null, 2));
        console.log(`📋 تم تحديث قائمة القنوات (${channelsList.channels.length} قناة)`);
    }
}

// ==================== دوال مساعدة ====================
function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

function formatViews(views) {
    if (!views) return '0';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

// ==================== المعالج الرئيسي ====================
class NitWexScraper {
    constructor() {
        this.cache = new CacheManager(CACHE_DIR);
        this.dailymotion = new DailymotionClient(this.cache);
        this.progress = new ProgressTracker();
        this.storage = new StorageManager(this.progress);
    }

    async processChannel(channelConfig, channelIndex) {
        const channelName = channelConfig.name;
        console.log(`\n📺 [${channelIndex + 1}/${TARGET_CHANNELS.length}] معالجة قناة: ${channelName}`);
        
        try {
            // 1. جلب معلومات القناة
            console.log(`   ℹ️ جلب معلومات القناة...`);
            const channelInfo = await this.dailymotion.getUserInfo(channelName);
            
            if (!channelInfo) {
                console.log(`   ⚠️ لا توجد معلومات للقناة`);
                return false;
            }
            
            // حفظ معلومات القناة
            await this.storage.saveChannel({
                ...channelInfo,
                category: channelConfig.category,
                language: channelConfig.language,
                targetName: channelName
            });
            
            // 2. جلب فيديوهات القناة
            console.log(`   🎬 جلب فيديوهات القناة...`);
            let page = this.progress.currentChannelPage;
            let videosFetched = 0;
            let hasMorePages = true;
            
            while (hasMorePages && videosFetched < CONFIG.videosPerChannel) {
                console.log(`      📄 الصفحة ${page}...`);
                
                const videosData = await this.dailymotion.getUserVideos(channelName, page, 25);
                
                if (!videosData || !videosData.list || videosData.list.length === 0) {
                    hasMorePages = false;
                    break;
                }
                
                for (const video of videosData.list) {
                    if (videosFetched >= CONFIG.videosPerChannel) break;
                    
                    // تجهيز بيانات الفيديو للحفظ
                    const videoInfo = {
                        id: video.id,
                        title: video.title,
                        description: video.description || '',
                        thumbnail: video.thumbnail_url,
                        url: video.url,
                        embedUrl: video.embed_url || `https://www.dailymotion.com/embed/video/${video.id}`,
                        duration: video.duration,
                        durationFormatted: formatDuration(video.duration),
                        views: video.views_total || 0,
                        viewsFormatted: formatViews(video.views_total),
                        likes: video.likes_total || 0,
                        comments: video.comments_total || 0,
                        uploadedAt: video.created_time,
                        uploadedAtFormatted: new Date(video.created_time * 1000).toISOString(),
                        channel: {
                            name: channelInfo.screenname || channelName,
                            username: channelName,
                            category: channelConfig.category,
                            language: channelConfig.language
                        },
                        scrapedAt: new Date().toISOString()
                    };
                    
                    // حفظ الفيديو
                    await this.storage.saveVideo(videoInfo);
                    videosFetched++;
                    
                    // عرض تقدم متواضع
                    if (videosFetched % 10 === 0) {
                        console.log(`         ✅ ${videosFetched} فيديو...`);
                    }
                }
                
                // التحقق من وجود صفحات إضافية
                if (videosData.page < videosData.pages) {
                    page++;
                    await new Promise(r => setTimeout(r, CONFIG.requestDelay));
                } else {
                    hasMorePages = false;
                }
            }
            
            console.log(`   ✅ اكتمل: ${videosFetched} فيديو من ${channelName}`);
            
            // تحديث التقدم
            this.progress.markChannelProcessed(channelName);
            
            return true;
            
        } catch (error) {
            console.log(`   ❌ خطأ في معالجة القناة ${channelName}: ${error.message}`);
            return false;
        }
    }

    async run() {
        console.log("\n" + "=".repeat(60));
        console.log("🎬 NitWex - نظام استخراج فيديوهات Dailymotion");
        console.log("=".repeat(60));
        
        console.log(`📊 الإحصائيات الحالية:`);
        console.log(`   📺 قنوات: ${this.progress.totalExtracted.channels}`);
        console.log(`   🎥 فيديوهات: ${this.progress.totalExtracted.videos}`);
        console.log(`   📄 ملف الفيديو الحالي: ${this.progress.videoFileNumber}`);
        
        console.log(`\n🎯 سيتم معالجة ${this.progress.targetChannelsPerRun} قنوات`);
        console.log(`📋 إجمالي القنوات المستهدفة: ${TARGET_CHANNELS.length}`);
        
        // تحديث قائمة القنوات
        await this.storage.updateChannelsList();
        
        // معالجة القنوات
        let processedCount = 0;
        
        while (this.progress.canProcessMoreChannels() && 
               this.progress.currentChannelIndex < TARGET_CHANNELS.length) {
            
            const channelConfig = TARGET_CHANNELS[this.progress.currentChannelIndex];
            const success = await this.processChannel(channelConfig, this.progress.currentChannelIndex);
            
            if (success) {
                processedCount++;
            } else {
                // إذا فشلت القناة، انتقل للتالية
                this.progress.currentChannelIndex++;
                this.progress.saveProgress();
            }
            
            // تأخير بين القنوات
            if (this.progress.canProcessMoreChannels()) {
                console.log(`\n⏳ انتظار 3 ثواني قبل القناة التالية...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        
        // تقرير النهاية
        const elapsed = this.progress.getElapsedTime();
        console.log("\n" + "=".repeat(60));
        console.log(`✅ اكتمل التشغيل بنجاح في ${elapsed} ثانية`);
        console.log(`📊 الإحصائيات النهائية:`);
        console.log(`   📺 قنوات معالجة: ${processedCount}`);
        console.log(`   🎥 فيديوهات جديدة: ${this.progress.totalExtracted.videos}`);
        console.log(`   📄 آخر ملف فيديو: ${this.progress.videoFileNumber}`);
        
        // معلومات للجولة القادمة
        if (this.progress.currentChannelIndex < TARGET_CHANNELS.length) {
            console.log(`\n🔄 للتشغيل القادم:`);
            console.log(`   📺 سيبدأ من قناة: ${TARGET_CHANNELS[this.progress.currentChannelIndex].name}`);
        } else {
            console.log(`\n🏁 تم الانتهاء من جميع القنوات!`);
        }
        
        console.log("=".repeat(60));
        
        // إحصائيات الكاش
        console.log(`\n📦 معلومات الكاش:`);
        console.log(`   📁 مجلد الكاش: ${CACHE_DIR}`);
        console.log(`   💾 حجم الكاش: ${this.getCacheSize()}`);
    }

    getCacheSize() {
        try {
            const files = fs.readdirSync(CACHE_DIR);
            let totalSize = 0;
            files.forEach(file => {
                const stats = fs.statSync(path.join(CACHE_DIR, file));
                totalSize += stats.size;
            });
            return (totalSize / 1024).toFixed(2) + ' KB';
        } catch {
            return '0 KB';
        }
    }
}

// ==================== التشغيل ====================
const scraper = new NitWexScraper();
scraper.run().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
