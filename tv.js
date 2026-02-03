const fs = require('fs');
const path = require('path');
const https = require('https');
const { parse } = require('node-html-parser');

// المسار لحفظ الملف
const OUTPUT_DIR = path.join(__dirname, 'TV');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'tv.json');

// روابط جميع الأقسام مع أسمائها
const CATEGORIES = [
    {
        name: 'قنوات الأفلام',
        url: 'https://mbc.aflam4you.net/browse-watch-shahid-tv-live-videos-1-date.html',
        type: 'movies',
        icon: '🎬'
    },
    {
        name: 'قنوات الرياضة',
        url: 'https://mbc.aflam4you.net/browse-watch-koora_live-tv-live-videos-1-date.html',
        type: 'sports',
        icon: '⚽'
    },
    {
        name: 'قنوات الأخبار',
        url: 'https://mbc.aflam4you.net/browse-watch-news-for-today-tv-live-videos-1-date.html',
        type: 'news',
        icon: '📰'
    },
    {
        name: 'قنوات إسلامية',
        url: 'https://mbc.aflam4you.net/browse-watch-islamic-tv-live-videos-1-date.html',
        type: 'islamic',
        icon: '🕌'
    },
    {
        name: 'قنوات وثائقية',
        url: 'https://mbc.aflam4you.net/browse-watch-documment-tv-live-videos-1-date.html',
        type: 'documentary',
        icon: '🎥'
    },
    {
        name: 'قنوات الأطفال',
        url: 'https://mbc.aflam4you.net/browse-watch-junnuir-tv-live-videos-1-date.html',
        type: 'kids',
        icon: '👶'
    }
];

// إعدادات User-Agent
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
};

// دالة لتحميل HTML من رابط
async function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        console.log(`📡 جاري تحميل: ${url}`);
        
        const options = {
            headers: HEADERS,
            timeout: 30000
        };
        
        const req = https.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`فشل التحميل: ${res.statusCode}`));
                return;
            }
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve(data);
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// دالة لاستخراج القنوات من صفحة
function extractChannelsFromPage(html, category) {
    const channels = [];
    const root = parse(html);
    
    // البحث عن جميع عناصر القنوات
    const channelItems = root.querySelectorAll('li.col-xs-6.col-sm-4.col-md-3');
    
    console.log(`✅ وجد ${channelItems.length} قناة في قسم: ${category.name}`);
    
    channelItems.forEach((item, index) => {
        try {
            // استخراج الاسم
            const nameElement = item.querySelector('h3 a');
            const name = nameElement ? nameElement.textContent.trim() : `${category.name} ${index + 1}`;
            
            // استخراج الصورة
            const imgElement = item.querySelector('img.img-responsive');
            let imageUrl = null;
            if (imgElement) {
                const src = imgElement.getAttribute('src');
                if (src) {
                    imageUrl = src.startsWith('http') ? src : `https://mbc.aflam4you.net${src}`;
                }
            }
            
            // استخراج رابط الصفحة
            const linkElement = item.querySelector('.pm-video-thumb a');
            let pageUrl = null;
            if (linkElement) {
                const href = linkElement.getAttribute('href');
                if (href) {
                    pageUrl = href.startsWith('http') ? href : `https://mbc.aflam4you.net${href}`;
                }
            }
            
            // استخراج الجودة إذا كانت موجودة
            let quality = 'HD';
            const qualityElement = item.querySelector('.quality, .label');
            if (qualityElement) {
                const qualityText = qualityElement.textContent.trim();
                if (qualityText.includes('1080') || qualityText.includes('FHD')) quality = '1080p';
                else if (qualityText.includes('720')) quality = '720p';
                else if (qualityText.includes('4K') || qualityText.includes('UHD')) quality = '4K';
            }
            
            channels.push({
                id: `${category.type}_${index}`,
                name: name,
                image: imageUrl,
                pageUrl: pageUrl || '#',
                quality: quality,
                category: category.name,
                categoryType: category.type,
                categoryIcon: category.icon,
                serverUrl: null, // سيتم ملؤه لاحقاً
                lastUpdated: new Date().toISOString()
            });
            
        } catch (error) {
            console.error(`❌ خطأ في استخراج القناة ${index}:`, error.message);
        }
    });
    
    return channels;
}

// دالة لاستخراج سيرفر المشاهدة من صفحة القناة
async function extractServerUrl(pageUrl) {
    if (!pageUrl || pageUrl === '#') return null;
    
    try {
        const html = await fetchHTML(pageUrl);
        const root = parse(html);
        
        // البحث عن الـ iframe الذي يحتوي على سيرفر المشاهدة
        const iframe = root.querySelector('iframe');
        if (iframe) {
            const src = iframe.getAttribute('src');
            if (src) {
                // إضافة النطاق إذا كان الرابط نسبياً
                return src.startsWith('http') ? src : `https://mbc.aflam4you.net${src}`;
            }
        }
        
        // البحث عن video أو embed كبديل
        const video = root.querySelector('video source');
        if (video) {
            const src = video.getAttribute('src');
            if (src) return src;
        }
        
        const embed = root.querySelector('embed');
        if (embed) {
            const src = embed.getAttribute('src');
            if (src) return src;
        }
        
        return null;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج السيرفر من ${pageUrl}:`, error.message);
        return null;
    }
}

// دالة رئيسية لاستخراج جميع القنوات
async function extractAllChannels() {
    const allChannels = [];
    const stats = {
        total: 0,
        byCategory: {}
    };
    
    console.log('🚀 بدء استخراج القنوات من جميع الأقسام...\n');
    
    for (const category of CATEGORIES) {
        try {
            console.log(`\n📁 قسم: ${category.name} (${category.icon})`);
            console.log(`🔗 الرابط: ${category.url}`);
            
            // تحميل صفحة القسم
            const html = await fetchHTML(category.url);
            
            // استخراج القنوات من الصفحة
            const channels = extractChannelsFromPage(html, category);
            
            // استخراج سيرفرات المشاهدة للقنوات
            console.log(`⏳ جاري استخراج سيرفرات المشاهدة...`);
            
            for (let i = 0; i < Math.min(channels.length, 10); i++) { // نأخذ أول 10 فقط للتسريع
                const channel = channels[i];
                if (channel.pageUrl && channel.pageUrl !== '#') {
                    process.stdout.write(`\r📡 ${i + 1}/${Math.min(channels.length, 10)}`);
                    channel.serverUrl = await extractServerUrl(channel.pageUrl);
                }
            }
            
            console.log(`\n✅ تم استخراج ${channels.length} قناة من ${category.name}`);
            
            // إضافة القنوات للقائمة الرئيسية
            allChannels.push(...channels);
            
            // تحديث الإحصائيات
            stats.byCategory[category.type] = channels.length;
            stats.total += channels.length;
            
        } catch (error) {
            console.error(`❌ خطأ في قسم ${category.name}:`, error.message);
        }
    }
    
    return { channels: allChannels, stats };
}

// دالة لحفظ البيانات في ملف JSON
function saveToFile(data) {
    try {
        // إنشاء المجلد إذا لم يكن موجوداً
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        
        // تنسيق البيانات
        const outputData = {
            metadata: {
                lastUpdated: new Date().toISOString(),
                totalChannels: data.channels.length,
                categories: CATEGORIES.map(cat => ({
                    name: cat.name,
                    type: cat.type,
                    icon: cat.icon
                }))
            },
            statistics: data.stats,
            channels: data.channels
        };
        
        // حفظ الملف
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf8');
        
        console.log(`\n💾 تم حفظ البيانات في: ${OUTPUT_FILE}`);
        console.log(`📊 إحصائيات:`);
        console.log(`   📈 إجمالي القنوات: ${data.stats.total}`);
        
        Object.entries(data.stats.byCategory).forEach(([type, count]) => {
            const category = CATEGORIES.find(cat => cat.type === type);
            const icon = category ? category.icon : '📺';
            console.log(`   ${icon} ${type}: ${count} قناة`);
        });
        
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الملف:', error.message);
        return false;
    }
}

// دالة لإنشاء تقرير HTML
function generateHTMLReport(data) {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>قنوات MBC - تحديث ${new Date().toLocaleString('ar-EG')}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #0f0f0f;
            color: #fff;
            text-align: right;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #e50914, #b50710);
            border-radius: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #333;
        }
        .stat-number {
            font-size: 2em;
            color: #e50914;
            font-weight: bold;
        }
        .categories {
            margin: 30px 0;
        }
        .category-section {
            background: #1a1a1a;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border-right: 5px solid #e50914;
        }
        .channel-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .channel-card {
            background: #222;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #333;
        }
        .channel-name {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .channel-meta {
            font-size: 0.9em;
            color: #aaa;
            margin: 5px 0;
        }
        .server-link {
            display: inline-block;
            background: #27ae60;
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            text-decoration: none;
            margin-top: 5px;
            font-size: 0.9em;
        }
        .server-link:hover {
            background: #219955;
        }
        .no-server {
            color: #ff6b6b;
            font-size: 0.9em;
        }
        .last-updated {
            text-align: center;
            color: #aaa;
            margin-top: 30px;
            padding: 10px;
            border-top: 1px solid #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📺 قنوات MBC من aflam4you.net</h1>
            <p>آخر تحديث: ${new Date().toLocaleString('ar-EG')}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${data.stats.total}</div>
                <div>إجمالي القنوات</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${Object.keys(data.stats.byCategory).length}</div>
                <div>عدد الأقسام</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.channels.filter(c => c.serverUrl).length}</div>
                <div>قنوات مع سيرفر</div>
            </div>
        </div>
        
        ${CATEGORIES.map(category => {
            const categoryChannels = data.channels.filter(c => c.categoryType === category.type);
            return `
            <div class="category-section">
                <h2>${category.icon} ${category.name} (${categoryChannels.length})</h2>
                <div class="channel-list">
                    ${categoryChannels.map(channel => `
                    <div class="channel-card">
                        <div class="channel-name">${channel.name}</div>
                        <div class="channel-meta">🎯 ${channel.quality}</div>
                        ${channel.serverUrl ? 
                            `<a href="${channel.serverUrl}" target="_blank" class="server-link">📺 مشاهدة مباشرة</a>` :
                            `<div class="no-server">⚠️ لا يوجد سيرفر</div>`
                        }
                    </div>
                    `).join('')}
                </div>
            </div>
            `;
        }).join('')}
        
        <div class="last-updated">
            <p>تم التحديث تلقائياً بواسطة GitHub Actions</p>
            <p>ملف JSON: <a href="tv.json" style="color: #3498db;">tv.json</a></p>
        </div>
    </div>
</body>
</html>`;
    
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');
    console.log('📄 تم إنشاء تقرير HTML');
}

// الدالة الرئيسية
async function main() {
    console.log('🚀 بدء عملية استخراج القنوات...');
    console.log('⏰ الوقت: ', new Date().toLocaleString('ar-EG'));
    console.log('='.repeat(50));
    
    try {
        // استخراج جميع القنوات
        const result = await extractAllChannels();
        
        // حفظ البيانات في ملف JSON
        const saved = saveToFile(result);
        
        if (saved) {
            // إنشاء تقرير HTML
            generateHTMLReport(result);
            
            console.log('\n✅ تمت العملية بنجاح!');
            console.log('📁 تم حفظ:');
            console.log(`   📄 ${OUTPUT_FILE}`);
            console.log(`   📄 ${path.join(OUTPUT_DIR, 'index.html')}`);
        }
        
    } catch (error) {
        console.error('❌ فشل العملية:', error.message);
        process.exit(1);
    }
}

// تشغيل الدالة الرئيسية
main();
