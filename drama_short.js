const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// تهيئة المجلدات
const DRAMA_FOLDER = 'DramaShorts';
const JSON_FOLDER = path.join(DRAMA_FOLDER, 'json');

// إنشاء المجلدات إذا لم تكن موجودة
if (!fs.existsSync(DRAMA_FOLDER)) {
    fs.mkdirSync(DRAMA_FOLDER, { recursive: true });
}
if (!fs.existsSync(JSON_FOLDER)) {
    fs.mkdirSync(JSON_FOLDER, { recursive: true });
}

// قائمة قنوات Dailymotion للدراما العربية
const DRAMA_CHANNELS = [
    'Arcadia.Zone',
    'free.dubbing',
    'DubbingKingdom',
    'DubbedArabic',
    'albahlolshow',
    'mohamedgomaa37',
    'ArabicDubbedMovies',
    'ArabicAnimeDubbed'
];

// Proxy servers للتحايل على CORS
const PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/',
    ''
];

// وظيفة لطلب البيانات مع استخدام البروكسي
async function fetchWithRetry(url, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        for (const proxy of PROXIES) {
            try {
                const targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
                console.log(`محاولة ${attempt + 1}: جاري جلب البيانات من ${targetUrl.substring(0, 100)}...`);
                
                const response = await axios.get(targetUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'ar,en;q=0.9',
                        'Referer': 'https://www.dailymotion.com/'
                    }
                });
                
                return response.data;
            } catch (error) {
                console.log(`فشل مع البروكسي ${proxy}: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }
    throw new Error(`فشل في جلب البيانات من ${url} بعد ${retries} محاولات`);
}

// استخراج الفيديوهات من قناة Dailymotion
async function extractVideosFromChannel(channel, page = 1, limit = 100) {
    try {
        const apiUrl = `https://api.dailymotion.com/user/${channel}/videos?fields=id,title,description,thumbnail_720_url,thumbnail_480_url,url,duration,created_time,views_total,owner.screenname&limit=${limit}&page=${page}&sort=recent`;
        
        const data = await fetchWithRetry(apiUrl);
        
        if (data && data.list && data.list.length > 0) {
            return data.list.map(video => ({
                id: video.id,
                title: video.title,
                description: video.description || '',
                thumbnail: video.thumbnail_720_url || video.thumbnail_480_url || '',
                url: video.url,
                duration: video.duration,
                created_time: video.created_time,
                views: video.views_total,
                channel: video.owner?.screenname || channel,
                source: 'dailymotion',
                type: 'دراما'
            }));
        }
        return [];
    } catch (error) {
        console.error(`خطأ في استخراج الفيديوهات من القناة ${channel}:`, error.message);
        return [];
    }
}

// فلترة الفيديوهات للعثور على الدراما العربية
function filterDramaVideos(videos) {
    const dramaKeywords = [
        // أنواع الدراما
        'دراما', 'drama', 'مسلسل', 'series', 'حلقة', 'episode',
        // دول عربية
        'مصري', 'سوري', 'لبناني', 'سعودي', 'إماراتي', 'قطري', 'كويتي', 'عراقي',
        // أنواع الترجمة
        'مدبلج', 'مدبلجة', 'مترجم', 'مترجمة', 'عربي', 'عربية',
        // أنماط الدراما
        'رومانسي', 'عائلي', 'اجتماعي', 'تاريخي', 'بوليسي', 'جريمة',
        // مسلسلات عربية مشهورة
        'باب الحارة', 'الندم', 'العهد', 'الاخوة', 'الوعد', 'الغربال'
    ];
    
    return videos.filter(video => {
        const title = (video.title || '').toLowerCase();
        const description = (video.description || '').toLowerCase();
        
        return dramaKeywords.some(keyword => 
            title.includes(keyword.toLowerCase()) || 
            description.includes(keyword.toLowerCase())
        );
    });
}

// البحث في Dailymotion باستخدام مصطلحات الدراما
async function searchDailymotionForDrama(page = 1, limit = 50) {
    const searchTerms = [
        'مسلسل عربي',
        'دراما عربية',
        'مسلسلات عربية',
        'drama arabic',
        'arabic series',
        'مدبلج عربي',
        'مترجم عربي',
        'مسلسل مصري',
        'مسلسل سوري',
        'مسلسل خليجي'
    ];
    
    const allVideos = [];
    
    for (const term of searchTerms) {
        try {
            const searchUrl = `https://api.dailymotion.com/videos?fields=id,title,description,thumbnail_720_url,thumbnail_480_url,url,duration,created_time,views_total,owner.screenname&search=${encodeURIComponent(term)}&limit=${limit}&page=${page}&sort=recent`;
            
            const data = await fetchWithRetry(searchUrl);
            
            if (data && data.list) {
                const dramaVideos = data.list.map(video => ({
                    id: video.id,
                    title: video.title,
                    description: video.description || '',
                    thumbnail: video.thumbnail_720_url || video.thumbnail_480_url || '',
                    url: video.url,
                    duration: video.duration,
                    created_time: video.created_time,
                    views: video.views_total,
                    channel: video.owner?.screenname || 'unknown',
                    source: 'dailymotion',
                    type: 'دراما',
                    search_term: term
                }));
                
                allVideos.push(...dramaVideos);
            }
            
            // تأخير بين الطلبات لتجنب الحظر
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error(`خطأ في البحث عن ${term}:`, error.message);
        }
    }
    
    return allVideos;
}

// جمع جميع فيديوهات الدراما
async function collectAllDramaVideos(maxVideos = 5000) {
    const allVideos = [];
    const seenIds = new Set();
    
    console.log('بدأ جمع فيديوهات الدراما...');
    
    // 1. جمع من القنوات المتخصصة
    for (const channel of DRAMA_CHANNELS) {
        console.log(`جمع الفيديوهات من القناة: ${channel}`);
        
        for (let page = 1; page <= 5; page++) { // 5 صفحات من كل قناة
            try {
                const videos = await extractVideosFromChannel(channel, page, 50);
                
                for (const video of videos) {
                    if (!seenIds.has(video.id)) {
                        seenIds.add(video.id);
                        allVideos.push(video);
                    }
                }
                
                if (videos.length < 50) break;
                
                console.log(`تم جمع ${allVideos.length} فيديو حتى الآن من ${channel}`);
                
                if (allVideos.length >= maxVideos) {
                    console.log(`وصل إلى الحد الأقصى (${maxVideos}) من الفيديوهات`);
                    return allVideos;
                }
                
                // تأخير بين الصفحات
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`خطأ في الصفحة ${page} من ${channel}:`, error.message);
                break;
            }
        }
    }
    
    // 2. البحث باستخدام مصطلحات الدراما
    console.log('البحث باستخدام مصطلحات الدراما...');
    
    for (let page = 1; page <= 3; page++) { // 3 صفحات بحث
        try {
            const searchResults = await searchDailymotionForDrama(page, 50);
            
            for (const video of searchResults) {
                if (!seenIds.has(video.id)) {
                    seenIds.add(video.id);
                    allVideos.push(video);
                }
            }
            
            console.log(`بعد البحث: تم جمع ${allVideos.length} فيديو`);
            
            if (allVideos.length >= maxVideos) {
                console.log(`وصل إلى الحد الأقصى (${maxVideos}) من الفيديوهات`);
                return allVideos;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
            
        } catch (error) {
            console.error(`خطأ في صفحة البحث ${page}:`, error.message);
        }
    }
    
    // 3. فلترة الفيديوهات لإبقاء الدراما فقط
    console.log('فلترة الفيديوهات للعثور على الدراما...');
    const filteredVideos = filterDramaVideos(allVideos);
    console.log(`قبل الفلترة: ${allVideos.length}، بعد الفلترة: ${filteredVideos.length}`);
    
    return filteredVideos;
}

// حفظ الفيديوهات في ملفات JSON
function saveVideosToJsonFiles(videos, videosPerFile = 800) {
    const fileCount = Math.ceil(videos.length / videosPerFile);
    
    console.log(`جاري حفظ ${videos.length} فيديو في ${fileCount} ملفات JSON...`);
    
    // معلومات إضافية عن المجموعة
    const collectionInfo = {
        total_videos: videos.length,
        generated_at: new Date().toISOString(),
        source: 'dailymotion',
        type: 'arabic_drama'
    };
    
    // حفظ المعلومات العامة
    const infoFile = path.join(JSON_FOLDER, 'collection_info.json');
    fs.writeFileSync(infoFile, JSON.stringify(collectionInfo, null, 2), 'utf8');
    console.log(`تم حفظ معلومات المجموعة في ${infoFile}`);
    
    // تقسيم الفيديوهات وحفظها في ملفات منفصلة
    for (let i = 0; i < fileCount; i++) {
        const startIdx = i * videosPerFile;
        const endIdx = startIdx + videosPerFile;
        const chunk = videos.slice(startIdx, endIdx);
        
        // إضافة معلومات عن الملف
        const fileData = {
            file_number: i + 1,
            total_files: fileCount,
            videos_count: chunk.length,
            created_at: new Date().toISOString(),
            videos: chunk
        };
        
        const filename = path.join(JSON_FOLDER, `drama_videos_${i + 1}.json`);
        fs.writeFileSync(filename, JSON.stringify(fileData, null, 2), 'utf8');
        
        console.log(`تم حفظ الملف ${filename} (${chunk.length} فيديو)`);
    }
    
    // إنشاء ملف فهرس
    createIndexFile(videos, fileCount);
    
    return fileCount;
}

// إنشاء ملف فهرس للبحث السريع
function createIndexFile(videos, fileCount) {
    const index = {
        total_videos: videos.length,
        total_files: fileCount,
        last_updated: new Date().toISOString(),
        categories: {},
        channels: {},
        years: {}
    };
    
    // تجميع الإحصائيات
    videos.forEach(video => {
        // الإحصائيات حسب القناة
        if (video.channel) {
            index.channels[video.channel] = (index.channels[video.channel] || 0) + 1;
        }
        
        // الإحصائيات حسب السنة
        if (video.created_time) {
            const year = new Date(video.created_time * 1000).getFullYear();
            index.years[year] = (index.years[year] || 0) + 1;
        }
    });
    
    // حفظ الفهرس
    const indexFile = path.join(DRAMA_FOLDER, 'index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
    console.log(`تم إنشاء الفهرس في ${indexFile}`);
    
    // حفظ قائمة مختصرة للعناوين
    const titlesList = videos.map(v => ({
        id: v.id,
        title: v.title,
        channel: v.channel,
        url: v.url,
        file: Math.floor(videos.indexOf(v) / 800) + 1
    }));
    
    const titlesFile = path.join(DRAMA_FOLDER, 'titles_list.json');
    fs.writeFileSync(titlesFile, JSON.stringify(titlesList, null, 2), 'utf8');
    console.log(`تم حفظ قائمة العناوين في ${titlesFile}`);
}

// وظيفة رئيسية
async function main() {
    try {
        console.log('بدء عملية استخراج أفلام الدراما...');
        console.log('='.repeat(50));
        
        // جمع الفيديوهات
        const dramaVideos = await collectAllDramaVideos(5000);
        
        if (dramaVideos.length === 0) {
            console.log('لم يتم العثور على أي فيديوهات دراما');
            return;
        }
        
        console.log(`تم جمع ${dramaVideos.length} فيديو دراما`);
        
        // تحليل البيانات
        console.log('\nتحليل البيانات المجمعة:');
        console.log('-'.repeat(30));
        
        const uniqueChannels = [...new Set(dramaVideos.map(v => v.channel))];
        console.log(`عدد القنوات: ${uniqueChannels.length}`);
        console.log(`أكبر 5 قنوات:`);
        
        const channelCounts = {};
        dramaVideos.forEach(v => {
            channelCounts[v.channel] = (channelCounts[v.channel] || 0) + 1;
        });
        
        Object.entries(channelCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([channel, count], i) => {
                console.log(`  ${i + 1}. ${channel}: ${count} فيديو`);
            });
        
        // حفظ البيانات في ملفات JSON
        console.log('\nجاري حفظ البيانات في ملفات JSON...');
        const fileCount = saveVideosToJsonFiles(dramaVideos, 800);
        
        console.log('\n✅ تم الانتهاء بنجاح!');
        console.log('='.repeat(50));
        console.log(`الملفات المحفوظة: ${fileCount} ملف JSON`);
        console.log(`المجلد: ${DRAMA_FOLDER}/`);
        console.log(`إجمالي الفيديوهات: ${dramaVideos.length}`);
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ خطأ في العملية الرئيسية:', error.message);
        process.exit(1);
    }
}

// تشغيل البرنامج
if (require.main === module) {
    main();
}

// تصدير الوظائف لاستخدامها في مكان آخر
module.exports = {
    extractVideosFromChannel,
    searchDailymotionForDrama,
    collectAllDramaVideos,
    saveVideosToJsonFiles
};
