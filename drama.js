import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== إعدادات المسارات ====================
const DAILYMOTION_DIR = path.join(__dirname, "Dailymotion");
const VIDEOS_DIR = path.join(DAILYMOTION_DIR, "Videos");
const CACHE_DIR = path.join(DAILYMOTION_DIR, "Cache");
const PROGRESS_FILE = path.join(DAILYMOTION_DIR, "progress.json");
const HOME_FILE = path.join(VIDEOS_DIR, "Home.json");
const CHANNEL_INFO_FILE = path.join(DAILYMOTION_DIR, "ArcadiaZone_info.json");

// إنشاء المجلدات
const createDirectories = async () => {
    console.log("📁 جاري إنشاء المجلدات...");
    const dirs = [DAILYMOTION_DIR, VIDEOS_DIR, CACHE_DIR];
    
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
    itemsPerFile: 200,           // 200 فيديو في كل ملف Part
    homeItemsCount: 30,           // 30 فيديو في Home.json
    requestDelay: 2000,           // تأخير بين الطلبات
    maxRetries: 3,
    concurrentRequests: 1,
    cacheTTL: 3600000,
    userAgent: 'NitWex-Bot/1.0'
};

// ==================== القناة المستهدفة ====================
const TARGET_CHANNEL = {
    name: "Arcadia.Zone",
    displayName: "Arcadia Zone",
    category: "gaming",
    language: "en"
};

console.log(`\n🎯 القناة المستهدفة: ${TARGET_CHANNEL.displayName} (${TARGET_CHANNEL.category})`);

// ==================== دالة لتوليد أرقام عشوائية ====================
function generateRandomStats(originalValue) {
    if (originalValue < 1000) {
        return Math.floor(Math.random() * (50000 - 1000 + 1)) + 1000;
    }
    return originalValue;
}

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
        
        if (this.memoryCache.has(key)) {
            const cached = this.memoryCache.get(key);
            if (Date.now() - cached.timestamp < this.ttl) {
                return cached.data;
            }
            this.memoryCache.delete(key);
        }

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
        } catch (error) {}
        return null;
    }

    async set(endpoint, params, data) {
        const key = this.getCacheKey(endpoint, params);
        this.memoryCache.set(key, { data, timestamp: Date.now() });
        const cachePath = this.getCachePath(key);
        fs.promises.writeFile(cachePath, JSON.stringify(data, null, 2)).catch(() => {});
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
        const queryString = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
        
        if (useCache) {
            const cached = await this.cacheManager.get(endpoint, params);
            if (cached) {
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

    async getUserInfo(username) {
        return this.request(`/user/${username}`, {
            fields: 'username,screenname,description,avatar_360_url,videos_total,views_total,followers_total,created_time'
        }, false); // لا نستخدم كاش لمعلومات القناة
    }

    async getUserVideos(username, page = 1, limit = 100) {
        return this.request(`/user/${username}/videos`, {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,likes_total',
            limit: limit,
            page: page,
            sort: 'recent'  // من الأحدث للأقدم
        }, false); // لا نستخدم كاش للفيديوهات
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
                
                this.lastVideoId = data.lastVideoId || null;
                this.lastVideoDate = data.lastVideoDate || null;
                this.processedVideoIds = new Set(data.processedVideoIds || []);
                
                this.videoFileNumber = data.videoFileNumber || 1;
                this.videosInCurrentFile = data.videosInCurrentFile || 0;
                
                this.totalVideos = data.totalVideos || 0;
                this.lastRunDate = data.lastRunDate || null;
                
                console.log(`📊 تم استئناف العمل`);
                console.log(`   🎥 فيديوهات سابقة: ${this.processedVideoIds.size}`);
                console.log(`   📄 آخر ملف Part: ${this.videoFileNumber}`);
                console.log(`   🆕 آخر فيديو: ${this.lastVideoId || 'لا يوجد'}`);
                
            } else {
                this.resetProgress();
            }
        } catch (error) {
            console.log("⚠️ خطأ في تحميل التقدم، بدء من جديد");
            this.resetProgress();
        }
    }

    resetProgress() {
        this.lastVideoId = null;
        this.lastVideoDate = null;
        this.processedVideoIds = new Set();
        
        this.videoFileNumber = 1;
        this.videosInCurrentFile = 0;
        
        this.totalVideos = 0;
        this.lastRunDate = null;
        
        this.saveProgress();
    }

    saveProgress() {
        const progressData = {
            lastVideoId: this.lastVideoId,
            lastVideoDate: this.lastVideoDate,
            processedVideoIds: Array.from(this.processedVideoIds),
            
            videoFileNumber: this.videoFileNumber,
            videosInCurrentFile: this.videosInCurrentFile,
            
            totalVideos: this.totalVideos,
            lastRunDate: new Date().toISOString(),
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }

    isVideoProcessed(videoId) {
        return this.processedVideoIds.has(videoId);
    }

    markVideoProcessed(videoId, videoDate) {
        this.processedVideoIds.add(videoId);
        this.totalVideos++;
        this.videosInCurrentFile++;
        
        // تحديث آخر فيديو (الأحدث دائماً)
        if (!this.lastVideoDate || videoDate > this.lastVideoDate) {
            this.lastVideoId = videoId;
            this.lastVideoDate = videoDate;
        }
        
        if (this.videosInCurrentFile >= CONFIG.itemsPerFile) {
            this.videoFileNumber++;
            this.videosInCurrentFile = 0;
            console.log(`      📄 بدء ملف Part${this.videoFileNumber}.json جديد`);
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
        this.homeVideos = [];
        this.newVideosCount = 0;
    }

    async saveVideo(videoData) {
        // إضافة للـ Home (أحدث الفيديوهات)
        this.addToHome(videoData);
        
        // حفظ في الملفات Part
        const fileName = `Part${this.progress.videoFileNumber}.json`;
        const filePath = path.join(VIDEOS_DIR, fileName);
        
        return new Promise((resolve) => {
            this.writeQueue.push({ filePath, videoData, resolve });
            this.processQueue();
        });
    }

    addToHome(videoData) {
        this.homeVideos.unshift(videoData);
        if (this.homeVideos.length > CONFIG.homeItemsCount) {
            this.homeVideos = this.homeVideos.slice(0, CONFIG.homeItemsCount);
        }
    }

    async saveHomeFile() {
        if (this.homeVideos.length === 0) return;
        
        console.log(`   🏠 حفظ أحدث ${this.homeVideos.length} فيديو في Home.json`);
        
        const homeData = {
            info: {
                type: 'home_videos',
                channel: TARGET_CHANNEL.displayName,
                description: 'أحدث الفيديوهات',
                totalVideos: this.homeVideos.length,
                lastUpdated: new Date().toISOString()
            },
            videos: this.homeVideos
        };
        
        await fs.promises.writeFile(HOME_FILE, JSON.stringify(homeData, null, 2));
    }

    async saveChannelInfo(channelInfo) {
        const infoData = {
            info: {
                channel: TARGET_CHANNEL.displayName,
                username: channelInfo.username,
                lastUpdated: new Date().toISOString()
            },
            data: channelInfo
        };
        
        await fs.promises.writeFile(CHANNEL_INFO_FILE, JSON.stringify(infoData, null, 2));
        console.log(`   💾 تم حفظ معلومات القناة`);
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
                        const partNum = parseInt(path.basename(filePath).replace('Part', '').replace('.json', ''));
                        data.info = {
                            type: 'videos',
                            channel: TARGET_CHANNEL.displayName,
                            partNumber: partNum,
                            created: new Date().toISOString(),
                            totalVideos: 0
                        };
                    }
                    
                    data.videos.push(videoData);
                    data.info.totalVideos = data.videos.length;
                    data.info.lastUpdated = new Date().toISOString();
                    
                    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
                    
                    this.newVideosCount++;
                    this.progress.markVideoProcessed(videoData.id, videoData.uploadedAt);
                    
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

    async finalize() {
        while (this.writeQueue.length > 0 || this.isWriting) {
            await new Promise(r => setTimeout(r, 500));
        }
        await this.saveHomeFile();
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

    async processChannel() {
        const channelName = TARGET_CHANNEL.name;
        console.log(`\n📺 معالجة قناة: ${TARGET_CHANNEL.displayName}`);
        
        try {
            // 1. جلب معلومات القناة
            console.log(`   ℹ️ جلب معلومات القناة...`);
            const channelInfo = await this.dailymotion.getUserInfo(channelName);
            if (channelInfo) {
                await this.storage.saveChannelInfo(channelInfo);
                console.log(`   📊 إجمالي فيديوهات القناة: ${channelInfo.videos_total || '?'}`);
            }
            
            // 2. جلب الفيديوهات
            console.log(`   🎬 جلب الفيديوهات...`);
            let page = 1;
            let videosFetched = 0;
            let newVideosFound = 0;
            let reachedExisting = false;
            let hasMorePages = true;
            
            while (hasMorePages) {
                console.log(`      📄 الصفحة ${page}...`);
                
                const videosData = await this.dailymotion.getUserVideos(channelName, page, 100);
                
                if (!videosData || !videosData.list || videosData.list.length === 0) {
                    console.log(`      🏁 انتهت الفيديوهات`);
                    break;
                }
                
                for (const video of videosData.list) {
                    // التحقق من وجود الفيديو مسبقاً
                    if (this.progress.isVideoProcessed(video.id)) {
                        if (!reachedExisting) {
                            console.log(`      🔄 وصلنا لفيديوهات موجودة مسبقاً، نتوقف...`);
                            reachedExisting = true;
                        }
                        hasMorePages = false;
                        break;
                    }
                    
                    // هذا فيديو جديد
                    const originalViews = video.views_total || 0;
                    const originalLikes = video.likes_total || 0;
                    
                    const enhancedViews = generateRandomStats(originalViews);
                    const enhancedLikes = generateRandomStats(originalLikes);
                    
                    const videoInfo = {
                        id: video.id,
                        title: video.title,
                        description: video.description || '',
                        thumbnail: video.thumbnail_url,
                        url: video.url,
                        embedUrl: `https://www.dailymotion.com/embed/video/${video.id}`,
                        duration: video.duration,
                        durationFormatted: formatDuration(video.duration),
                        views: enhancedViews,
                        viewsFormatted: formatViews(enhancedViews),
                        originalViews: originalViews,
                        likes: enhancedLikes,
                        originalLikes: originalLikes,
                        uploadedAt: video.created_time,
                        uploadedAtFormatted: new Date(video.created_time * 1000).toISOString(),
                        channel: {
                            name: channelName,
                            displayName: TARGET_CHANNEL.displayName,
                            category: TARGET_CHANNEL.category,
                            language: TARGET_CHANNEL.language
                        },
                        statsEnhanced: originalViews < 1000 || originalLikes < 1000,
                        scrapedAt: new Date().toISOString()
                    };
                    
                    await this.storage.saveVideo(videoInfo);
                    videosFetched++;
                    newVideosFound++;
                    
                    if (videosFetched % 20 === 0) {
                        console.log(`         ✅ ${videosFetched} فيديو جديد...`);
                    }
                }
                
                if (reachedExisting) {
                    break;
                }
                
                // التحقق من وجود صفحات إضافية
                if (videosData.has_more) {
                    page++;
                    console.log(`      ⏳ انتظار قبل الصفحة ${page}...`);
                    await new Promise(r => setTimeout(r, CONFIG.requestDelay));
                } else {
                    hasMorePages = false;
                }
            }
            
            console.log(`\n   ✅ اكتمل: ${newVideosFound} فيديو جديد من ${TARGET_CHANNEL.displayName}`);
            return newVideosFound;
            
        } catch (error) {
            console.log(`   ❌ خطأ: ${error.message}`);
            return 0;
        }
    }

    async run() {
        console.log("\n" + "=".repeat(60));
        console.log("🎬 NitWex - نظام استخراج فيديوهات Dailymotion");
        console.log("=".repeat(60));
        
        console.log(`\n📊 الإحصائيات الحالية:`);
        console.log(`   🎥 فيديوهات مخزنة: ${this.progress.processedVideoIds.size}`);
        console.log(`   📄 آخر ملف Part: ${this.progress.videoFileNumber}`);
        console.log(`   🏠 سيتم حفظ أحدث ${CONFIG.homeItemsCount} فيديو`);
        
        // معالجة القناة
        const newVideos = await this.processChannel();
        
        // إنهاء وحفظ Home.json
        await this.storage.finalize();
        
        // تقرير النهاية
        const elapsed = this.progress.getElapsedTime();
        console.log("\n" + "=".repeat(60));
        console.log(`✅ اكتمل التشغيل بنجاح في ${elapsed} ثانية`);
        console.log(`📊 النتائج:`);
        console.log(`   🆕 فيديوهات جديدة: ${newVideos}`);
        console.log(`   📈 إجمالي الفيديوهات: ${this.progress.processedVideoIds.size}`);
        console.log(`   📄 آخر ملف Part: Part${this.progress.videoFileNumber}.json`);
        console.log(`   🏠 تم تحديث Home.json بأحدث ${CONFIG.homeItemsCount} فيديو`);
        
        console.log("\n" + "=".repeat(60));
    }
}

// ==================== التشغيل ====================
const scraper = new NitWexScraper();
scraper.run().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
