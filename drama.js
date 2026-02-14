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
const PROGRESS_FILE = path.join(DAILYMOTION_DIR, "nitwex_progress.json");
const HOME_FILE = path.join(VIDEOS_DIR, "Home.json");

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
    itemsPerFile: 200,          // 200 فيديو في كل ملف Part
    homeItemsCount: 30,          // 30 فيديو في Home.json
    channelsPerRun: 2,           // عدد القنوات في كل تشغيل
    videosPerChannel: Infinity,        // عدد الفيديوهات من كل قناة
    requestDelay: 1000,
    maxRetries: 3,
    concurrentRequests: 2,
    cacheTTL: 3600000,
    userAgent: 'NitWex-Bot/1.0'
};

// ==================== قائمة القنوات المستهدفة ====================
const TARGET_CHANNELS = [
    { name: "Arcadia.Zone", category: "gaming", language: "en" }
];

// ==================== دالة لتوليد أرقام عشوائية ====================
function generateRandomStats(originalValue) {
    // إذا كانت القيمة أقل من 1000، توليد رقم عشوائي بين 1000 و 50000
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

    async getUserVideos(username, page = 1, limit = 25) {
        return this.request(`/user/${username}/videos`, {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,likes_total',
            limit: limit,
            page: page,
            sort: 'recent'
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
                this.processedVideoIds = data.processedVideoIds || new Set();
                
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
        this.processedVideoIds = new Set();
        
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
            processedVideoIds: Array.from(this.processedVideoIds),
            
            lastUpdate: new Date().toISOString()
        };
        
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
    }

    isVideoProcessed(videoId) {
        return this.processedVideoIds.has(videoId);
    }

    markVideoProcessed(videoId) {
        this.processedVideoIds.add(videoId);
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
        this.currentChannelPage = 1;
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
        this.homeVideos = []; // لتخزين أحدث 30 فيديو
    }

    async saveVideo(videoData) {
        // إضافة للـ Home (أحدث 30 فيديو)
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
        // إضافة الفيديو في البداية (الأحدث أولاً)
        this.homeVideos.unshift(videoData);
        
        // الاحتفاظ بأحدث 30 فيديو فقط
        if (this.homeVideos.length > CONFIG.homeItemsCount) {
            this.homeVideos = this.homeVideos.slice(0, CONFIG.homeItemsCount);
        }
    }

    async saveHomeFile() {
        console.log(`   🏠 حفظ أحدث ${this.homeVideos.length} فيديو في Home.json`);
        
        const homeData = {
            info: {
                type: 'home_videos',
                description: 'أحدث 30 فيديو',
                totalVideos: this.homeVideos.length,
                lastUpdated: new Date().toISOString()
            },
            videos: this.homeVideos
        };
        
        await fs.promises.writeFile(HOME_FILE, JSON.stringify(homeData, null, 2));
        console.log(`   ✅ تم تحديث Home.json`);
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
                            partNumber: parseInt(path.basename(filePath).replace('Part', '').replace('.json', '')),
                            created: new Date().toISOString(),
                            totalVideos: 0
                        };
                    }
                    
                    // التحقق من عدم تكرار الفيديو
                    const exists = data.videos.some(v => v.id === videoData.id);
                    if (!exists) {
                        data.videos.push(videoData);
                        data.info.totalVideos = data.videos.length;
                        data.info.lastUpdated = new Date().toISOString();
                        
                        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
                        this.progress.addVideo();
                        this.progress.markVideoProcessed(videoData.id);
                    }
                    
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
        // انتظار اكتمال جميع عمليات الحفظ
        while (this.writeQueue.length > 0 || this.isWriting) {
            await new Promise(r => setTimeout(r, 500));
        }
        
        // حفظ ملف Home.json
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

    async processChannel(channelConfig, channelIndex) {
        const channelName = channelConfig.name;
        console.log(`\n📺 [${channelIndex + 1}/${TARGET_CHANNELS.length}] معالجة قناة: ${channelName}`);
        
        try {
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
                    
                    // التحقق من عدم تكرار الفيديو
                    if (this.progress.isVideoProcessed(video.id)) {
                        console.log(`      ⏭️ فيديو مكرر: ${video.id}`);
                        continue;
                    }
                    
                    // تطبيق قاعدة الأرقام العشوائية
                    const originalViews = video.views_total || 0;
                    const originalLikes = video.likes_total || 0;
                    
                    const enhancedViews = generateRandomStats(originalViews);
                    const enhancedLikes = generateRandomStats(originalLikes);
                    
                    // تجهيز بيانات الفيديو للحفظ
                    const videoInfo = {
                        id: video.id,
                        title: video.title,
                        description: video.description || '',
                        thumbnail: video.thumbnail_url,
                        url: video.url,
                        embedUrl: `https://www.dailymotion.com/embed/video/${video.id}`,
                        duration: video.duration,
                        durationFormatted: formatDuration(video.duration),
                        views: enhancedViews,  // استخدام القيمة المحسنة
                        viewsFormatted: formatViews(enhancedViews),
                        originalViews: originalViews,  // حفظ القيمة الأصلية للرجوع إليها
                        likes: enhancedLikes,
                        originalLikes: originalLikes,
                        uploadedAt: video.created_time,
                        uploadedAtFormatted: new Date(video.created_time * 1000).toISOString(),
                        channel: {
                            name: channelName,
                            category: channelConfig.category,
                            language: channelConfig.language
                        },
                        statsEnhanced: originalViews < 1000 || originalLikes < 1000, // هل تم تحسين الإحصائيات؟
                        scrapedAt: new Date().toISOString()
                    };
                    
                    // حفظ الفيديو
                    await this.storage.saveVideo(videoInfo);
                    videosFetched++;
                    
                    if (videosFetched % 10 === 0) {
                        console.log(`         ✅ ${videosFetched} فيديو...`);
                    }
                }
                
                if (videosData.page < videosData.pages) {
                    page++;
                    await new Promise(r => setTimeout(r, CONFIG.requestDelay));
                } else {
                    hasMorePages = false;
                }
            }
            
            console.log(`   ✅ اكتمل: ${videosFetched} فيديو جديد من ${channelName}`);
            
            if (videosFetched > 0) {
                this.progress.markChannelProcessed(channelName);
            } else {
                // إذا ما في فيديوهات جديدة، انتقل للقناة التالية
                this.progress.currentChannelIndex++;
                this.progress.saveProgress();
            }
            
            return true;
            
        } catch (error) {
            console.log(`   ❌ خطأ: ${error.message}`);
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
        console.log(`   📄 ملف Part الحالي: ${this.progress.videoFileNumber}`);
        console.log(`   🏠 سيتم حفظ أحدث ${CONFIG.homeItemsCount} فيديو في Home.json`);
        
        console.log(`\n🎯 سيتم معالجة ${this.progress.targetChannelsPerRun} قنوات`);
        console.log(`📋 إجمالي القنوات المستهدفة: ${TARGET_CHANNELS.length}`);
        
        // معالجة القنوات
        let processedCount = 0;
        
        while (this.progress.canProcessMoreChannels() && 
               this.progress.currentChannelIndex < TARGET_CHANNELS.length) {
            
            const channelConfig = TARGET_CHANNELS[this.progress.currentChannelIndex];
            const success = await this.processChannel(channelConfig, this.progress.currentChannelIndex);
            
            if (success) {
                processedCount++;
            }
            
            if (this.progress.canProcessMoreChannels()) {
                console.log(`\n⏳ انتظار 3 ثواني قبل القناة التالية...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        
        // إنهاء و حفظ Home.json
        await this.storage.finalize();
        
        // تقرير النهاية
        const elapsed = this.progress.getElapsedTime();
        console.log("\n" + "=".repeat(60));
        console.log(`✅ اكتمل التشغيل بنجاح في ${elapsed} ثانية`);
        console.log(`📊 الإحصائيات النهائية:`);
        console.log(`   📺 قنوات معالجة: ${processedCount}`);
        console.log(`   🎥 فيديوهات جديدة: ${this.progress.totalExtracted.videos}`);
        console.log(`   📄 آخر ملف Part: ${this.progress.videoFileNumber}`);
        console.log(`   🏠 أحدث فيديوهات: ${CONFIG.homeItemsCount} في Home.json`);
        
        // إحصائيات تحسين الأرقام
        console.log(`\n📊 إحصائيات تحسين الأرقام:`);
        console.log(`   📈 تم تحسين الفيديوهات ذات المشاهدات < 1000`);
        console.log(`   🎲 أرقام عشوائية بين 1000 و 50000`);
        
        if (this.progress.currentChannelIndex < TARGET_CHANNELS.length) {
            console.log(`\n🔄 للتشغيل القادم:`);
            console.log(`   📺 سيبدأ من قناة: ${TARGET_CHANNELS[this.progress.currentChannelIndex].name}`);
        } else {
            console.log(`\n🏁 تم الانتهاء من جميع القنوات!`);
        }
        
        console.log("=".repeat(60));
    }
}

// ==================== التشغيل ====================
const scraper = new NitWexScraper();
scraper.run().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
