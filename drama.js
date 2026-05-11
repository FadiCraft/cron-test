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

const createDirectories = async () => {
    const dirs = [DAILYMOTION_DIR, VIDEOS_DIR, CACHE_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
    }
};

await createDirectories();

// ==================== إعدادات النظام ====================
const CONFIG = {
    itemsPerFile: 200,
    homeItemsCount: 30,
    requestDelay: 2000,
    maxRetries: 3,
    concurrentRequests: 1,
    cacheTTL: 3600000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const TARGET_CHANNEL = {
    name: "Film.Arena",
    displayName: "Arena",
    category: "Drama",
    language: "ar"
};

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

    async get(endpoint, params) {
        const key = this.getCacheKey(endpoint, params);
        if (this.memoryCache.has(key)) return this.memoryCache.get(key).data;
        return null;
    }

    async set(endpoint, params, data) {
        const key = this.getCacheKey(endpoint, params);
        this.memoryCache.set(key, { data, timestamp: Date.now() });
    }
}

// ==================== نظام طلبات Dailymotion API ====================
class DailymotionClient {
    constructor(cacheManager) {
        this.cacheManager = cacheManager;
        this.baseUrl = "https://api.dailymotion.com";
    }

    async getM3U8Url(videoId) {
        try {
            const response = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
                headers: { 'User-Agent': CONFIG.userAgent }
            });
            const data = await response.json();
            return data.qualities?.auto?.[0]?.url || null;
        } catch (error) {
            console.log(`⚠️ فشل استخراج m3u8 للفيديو ${videoId}`);
            return null;
        }
    }

    async request(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}${endpoint}?${queryString}`;
        
        const response = await fetch(url, {
            headers: { 'User-Agent': CONFIG.userAgent }
        });
        return await response.json();
    }

    async getUserInfo(username) {
        return this.request(`/user/${username}`, {
            fields: 'username,screenname,description,avatar_360_url,videos_total'
        });
    }

    async getUserVideos(username, page = 1, limit = 100) {
        return this.request(`/user/${username}/videos`, {
            fields: 'id,title,description,thumbnail_url,url,duration,created_time,views_total,likes_total',
            limit: limit,
            page: page,
            sort: 'recent'
        });
    }
}

// ==================== نظام تتبع التقدم والحفظ ====================
class ProgressTracker {
    constructor() {
        this.processedVideoIds = new Set();
        this.videoFileNumber = 1;
        this.startTime = performance.now();
    }
    isVideoProcessed(id) { return this.processedVideoIds.has(id); }
    markVideoProcessed(id) { this.processedVideoIds.add(id); }
}

class StorageManager {
    constructor(progress) {
        this.progress = progress;
        this.homeVideos = [];
    }

    async saveVideo(videoData) {
        this.homeVideos.push(videoData);
        this.progress.markVideoProcessed(videoData.id);
        
        const fileName = `Part${this.progress.videoFileNumber}.json`;
        const filePath = path.join(VIDEOS_DIR, fileName);
    }

    async finalize() {
        // حفظ المصفوفة مباشرة مع الهيكل الثابت
        const videosArray = this.homeVideos.slice(0, CONFIG.homeItemsCount);
        await fs.promises.writeFile(HOME_FILE, JSON.stringify(videosArray, null, 2));
        console.log(`✅ تم حفظ Home.json مع روابط m3u8 بنجاح.`);
    }
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
        console.log(`🚀 بدء العمل على: ${TARGET_CHANNEL.displayName}`);
        
        // جلب عدد أكبر قليلاً لتعويض الفيديوهات التي سيتم تخطيها
        const videosData = await this.dailymotion.getUserVideos(TARGET_CHANNEL.name, 1, 100);
        
        if (!videosData.list) return;

        // التعبير النمطي لفحص وجود حروف عربية
        const arabicRegex = /[\u0600-\u06FF]/;
        let savedCount = 0;

        for (const video of videosData.list) {
            // التوقف إذا وصلنا للعدد المطلوب في الصفحة الرئيسية
            if (savedCount >= CONFIG.homeItemsCount) break;

            // التحقق من عنوان الفيديو
            if (!arabicRegex.test(video.title)) {
                console.log(`⏩ تخطي: "${video.title}" (ليس عربياً)`);
                continue; // تخطي هذا الفيديو والانتقال للتالي
            }

            console.log(`🔍 جلب m3u8 لـ: ${video.title.substring(0, 30)}...`);
            
            const m3u8Link = await this.dailymotion.getM3U8Url(video.id);

            // التعديل الأساسي هنا: استخدام سلسلة فارغة بدلاً من null
       const videoInfo = {
    id: video.id,
    title: video.title,
    thumbnail: video.thumbnail_url,
    m3u8Url: m3u8Link || "",
    embedUrl: `https://www.dailymotion.com/embed/video/${video.id}`,
    duration: Number(video.duration),      // تحويل إلى رقم صحيح
    views: Number(generateRandomStats(video.views_total)),  // تحويل إلى رقم صحيح
    uploadedAt: new Date(video.created_time * 1000).toISOString()
};

            await this.storage.saveVideo(videoInfo);
            savedCount++;
            
            await new Promise(r => setTimeout(r, 500));
        }
    }

    async run() {
        await this.processChannel();
        await this.storage.finalize();
    }
}

const scraper = new NitWexScraper();
scraper.run();
