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

const createDirectories = async () => {
    const dirs = [DAILYMOTION_DIR, VIDEOS_DIR, CACHE_DIR];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
    }
};

await createDirectories();

// ==================== إعدادات النظام ====================
const CONFIG = {
    videosPerFile: 35, // المطلوب: 35 فيديو لكل ملف
    maxVideosTotal: 70, // إجمالي الفيديوهات لملفين (p1, p2)
    requestDelay: 1000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// قائمة القنوات المطلوبة
const CHANNELS = [
    "Film.Arena",
    "Chnese-drama",
    "Drama-Portal",
    "Neon.History",
    "drama.box"
];

function generateRandomStats(originalValue) {
    if (originalValue < 1000) {
        return Math.floor(Math.random() * (50000 - 1000 + 1)) + 1000;
    }
    return originalValue;
}

// ==================== نظام طلبات Dailymotion API ====================
class DailymotionClient {
    constructor() {
        this.baseUrl = "https://api.dailymotion.com";
    }

    async getM3U8Url(videoId) {
        try {
            const response = await fetch(`https://www.dailymotion.com/player/metadata/video/${videoId}`, {
                headers: { 'User-Agent': CONFIG.userAgent }
            });
            const data = await response.json();
            return data.qualities?.auto?.[0]?.url || "";
        } catch (error) {
            return "";
        }
    }

    async request(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = `${this.baseUrl}${endpoint}?${queryString}`;
        const response = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent } });
        return await response.json();
    }

    async getUserVideos(username, limit = 100) {
        console.log(`📡 جلب فيديوهات القناة: ${username}...`);
        return this.request(`/user/${username}/videos`, {
            fields: 'id,title,thumbnail_url,duration,created_time,views_total',
            limit: limit,
            sort: 'recent'
        });
    }
}

// ==================== المعالج الرئيسي ====================
class MultiChannelScraper {
    constructor() {
        this.dailymotion = new DailymotionClient();
        this.allArabicVideos = [];
        this.arabicRegex = /[\u0600-\u06FF]/; // تصفية العربي فقط
    }

    async run() {
        console.log("🚀 بدء عملية الاستخراج من جميع القنوات...");

        for (const channelName of CHANNELS) {
            try {
                const data = await this.dailymotion.getUserVideos(channelName);
                if (!data.list) continue;

                for (const video of data.list) {
                    // التوقف إذا جمعنا ما يكفي لملفين (35 * 2)
                    if (this.allArabicVideos.length >= CONFIG.maxVideosTotal) break;

                    // فحص هل العنوان عربي؟
                    if (this.arabicRegex.test(video.title)) {
                        console.log(`✅ فيديو عربي مكتشف: ${video.title.substring(0, 40)}`);
                        
                        const m3u8Link = await this.dailymotion.getM3U8Url(video.id);

                        this.allArabicVideos.push({
                            id: video.id,
                            title: video.title,
                            thumbnail: video.thumbnail_url,
                            m3u8Url: m3u8Link,
                            embedUrl: `https://www.dailymotion.com/embed/video/${video.id}`,
                            duration: video.duration,
                            views: generateRandomStats(video.views_total),
                            uploadedAt: new Date(video.created_time * 1000).toISOString()
                        });

                        // تأخير بسيط لتجنب الحظر
                        await new Promise(r => setTimeout(r, CONFIG.requestDelay));
                    }
                }
            } catch (err) {
                console.error(`❌ خطأ في القناة ${channelName}:`, err.message);
            }

            if (this.allArabicVideos.length >= CONFIG.maxVideosTotal) break;
        }

        await this.saveInChunks();
    }

    async saveInChunks() {
        console.log(`📦 إجمالي الفيديوهات العربية المستخرجة: ${this.allArabicVideos.length}`);
        
        // تقسيم المصفوفة إلى أجزاء كل جزء 35
        for (let i = 0; i < this.allArabicVideos.length; i += CONFIG.videosPerFile) {
            const chunk = this.allArabicVideos.slice(i, i + CONFIG.videosPerFile);
            const fileNumber = (i / CONFIG.videosPerFile) + 1;
            const fileName = `p${fileNumber}.json`;
            const filePath = path.join(VIDEOS_DIR, fileName);

            await fs.promises.writeFile(filePath, JSON.stringify(chunk, null, 2));
            console.log(`💾 تم إنشاء الملف: ${fileName} ويحتوي على ${chunk.length} فيديو.`);
        }
    }
}

const scraper = new MultiChannelScraper();
scraper.run();
