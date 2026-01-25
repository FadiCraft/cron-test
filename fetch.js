import fs from "fs";

// استخدم fetch محلي في Node.js 18+
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { JSDOM } = await import('jsdom');

// إعدادات
const MOVIES_URL = "https://topcinema.media/movies/";
const PROXIES = [
    '',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

async function fetchWithProxies(url) {
    for (let proxy of PROXIES) {
        try {
            let targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const html = await response.text();
                return html;
            }
        } catch (error) {
            console.log(`Proxy failed: ${proxy ? 'Using proxy' : 'Direct'}, trying next...`);
            continue;
        }
    }
    return null;
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^\u0600-\u06FF\s\w\-\.]/g, '')
        .trim();
}

function fixImageUrl(url, baseUrl) {
    if (!url) return '';
    
    if (url.startsWith('//')) {
        return 'https:' + url;
    }
    
    if (url.startsWith('/')) {
        try {
            const base = new URL(baseUrl);
            return base.origin + url;
        } catch {
            return 'https://topcinema.media' + url;
        }
    }
    
    if (!url.startsWith('http')) {
        return 'https://topcinema.media/' + url;
    }
    
    return url;
}

async function extractMoviesFromPage(page = 1) {
    try {
        let url = MOVIES_URL;
        if (page > 1) {
            url = `https://topcinema.media/movies/page/${page}/`;
        }
        
        console.log(`📥 جاري جلب الصفحة ${page} من: ${url}`);
        
        const html = await fetchWithProxies(url);
        
        if (!html) {
            console.error(`❌ فشل في جلب الصفحة ${page}`);
            return [];
        }
        
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const movies = [];
        
        // البحث عن جميع البطاقات
        const movieElements = document.querySelectorAll('.Small--Box');
        
        console.log(`🔍 وجدت ${movieElements.length} عنصر في الصفحة ${page}`);
        
        movieElements.forEach((element, index) => {
            try {
                // تخطي إذا كان موسم مسلسل
                if (element.classList.contains('Season')) return;
                
                // استخراج الرابط
                const linkElement = element.querySelector('a[href*="/20"]');
                if (!linkElement || !linkElement.href) return;
                
                const link = linkElement.href;
                if (!link.includes('topcinema.media')) return;
                
                // استخراج الصورة
                let imageSrc = null;
                const imgElement = element.querySelector('img');
                if (imgElement) {
                    imageSrc = imgElement.getAttribute('data-src') || imgElement.src;
                    if (imageSrc && (imageSrc.includes('blank') || imageSrc.includes('data:'))) {
                        imageSrc = null;
                    }
                }
                
                // استخراج العنوان
                const titleElement = element.querySelector('.title, h3, .ep-title');
                let title = titleElement ? cleanText(titleElement.textContent) : '';
                
                if (!title || title.length < 3) {
                    const altTitle = element.querySelector('img')?.alt;
                    title = altTitle ? cleanText(altTitle) : 'فيلم بدون عنوان';
                }
                
                // استخراج الجودة
                const qualityElement = element.querySelector('.liList li:nth-child(2), .quality');
                let quality = 'HD';
                if (qualityElement) {
                    const qualityText = qualityElement.textContent.trim();
                    if (qualityText && qualityText.length > 0) {
                        quality = qualityText;
                    }
                }
                
                // استخراج التقييم
                let rating = null;
                const ratingElement = element.querySelector('.imdbRating, .rating');
                if (ratingElement) {
                    const ratingText = ratingElement.textContent.trim();
                    const match = ratingText.match(/(\d+\.?\d*)/);
                    if (match) {
                        const num = parseFloat(match[1]);
                        if (num >= 1 && num <= 10) {
                            rating = num.toFixed(1);
                        }
                    }
                }
                
                // استخراج التصنيفات
                const categories = [];
                const catElements = element.querySelectorAll('.liList li:first-child, .cat a');
                catElements.forEach(cat => {
                    const catText = cleanText(cat.textContent);
                    if (catText && !catText.includes('WEB') && !catText.includes('p')) {
                        categories.push(catText);
                    }
                });
                
                // إضافة الفيلم إلى القائمة
                const movie = {
                    id: `movie_${Date.now()}_${index}`,
                    title: title,
                    url: link,
                    image: imageSrc ? fixImageUrl(imageSrc, url) : null,
                    quality: quality,
                    rating: rating,
                    categories: categories.length > 0 ? categories : ['عام'],
                    year: new Date().getFullYear().toString(),
                    type: 'فيلم',
                    fetchedAt: new Date().toISOString(),
                    page: page,
                    index: index
                };
                
                movies.push(movie);
                console.log(`✅ ${index + 1}. ${title} - ${quality}`);
                
            } catch (error) {
                console.error(`خطأ في معالجة عنصر ${index}:`, error.message);
            }
        });
        
        console.log(`🎬 تم استخراج ${movies.length} فيلم من الصفحة ${page}`);
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في استخراج الصفحة ${page}:`, error.message);
        return [];
    }
}

async function extractLatestMovies() {
    console.log('🚀 بدء استخراج الأفلام من KiroZozo...');
    console.log('⏳ قد يستغرق الأمر بضع دقائق...');
    
    try {
        // استخراج من أول صفحتين
        const moviesPage1 = await extractMoviesFromPage(1);
        const moviesPage2 = await extractMoviesFromPage(2);
        
        // دمج النتائج وإزالة التكرارات
        const allMovies = [...moviesPage1, ...moviesPage2];
        const uniqueMovies = [];
        const seenTitles = new Set();
        
        allMovies.forEach(movie => {
            if (!seenTitles.has(movie.title)) {
                seenTitles.add(movie.title);
                uniqueMovies.push(movie);
            }
        });
        
        console.log(`📊 الإحصائيات:`);
        console.log(`   - الصفحة 1: ${moviesPage1.length} فيلم`);
        console.log(`   - الصفحة 2: ${moviesPage2.length} فيلم`);
        console.log(`   - الإجمالي بعد إزالة التكرارات: ${uniqueMovies.length} فيلم`);
        
        // حفظ النتائج
        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            source: "topcinema.media",
            stats: {
                totalMovies: uniqueMovies.length,
                page1: moviesPage1.length,
                page2: moviesPage2.length,
                unique: uniqueMovies.length
            },
            movies: uniqueMovies,
            metadata: {
                fetchedAt: new Date().toISOString(),
                cacheDuration: "2 hours",
                nextFetch: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
            }
        };
        
        // حفظ في ملفات مختلفة
        fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
        
        // ملف مبسط للأفلام فقط
        const simpleMovies = uniqueMovies.map(movie => ({
            title: movie.title,
            url: movie.url,
            quality: movie.quality,
            rating: movie.rating
        }));
        
        fs.writeFileSync("movies_simple.json", JSON.stringify({
            timestamp: new Date().toISOString(),
            movies: simpleMovies
        }, null, 2));
        
        // ملف HTML لعرض النتائج
        createHTMLReport(result);
        
        console.log('✨ تم الانتهاء بنجاح!');
        console.log('📁 الملفات المحفوظة:');
        console.log('   - result.json (البيانات الكاملة)');
        console.log('   - movies_simple.json (بيانات مبسطة)');
        console.log('   - report.html (عرض النتائج)');
        
        return result;
        
    } catch (error) {
        console.error('💥 خطأ رئيسي:', error);
        
        // حفظ حالة الخطأ
        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            movies: []
        };
        
        fs.writeFileSync("result.json", JSON.stringify(errorResult, null, 2));
        
        return errorResult;
    }
}

function createHTMLReport(data) {
    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>نتائج استخراج الأفلام - KiroZozo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background: linear-gradient(135deg, #0f172a, #1e293b);
            color: #f1f5f9;
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 30px;
            background: rgba(30, 41, 59, 0.7);
            border-radius: 20px;
            border: 1px solid rgba(100, 116, 139, 0.3);
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            color: #60a5fa;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .stat-card {
            background: rgba(30, 41, 59, 0.7);
            padding: 20px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid rgba(100, 116, 139, 0.3);
            transition: transform 0.3s;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-card .number {
            font-size: 2.5rem;
            font-weight: bold;
            color: #34d399;
            margin-bottom: 10px;
        }
        
        .movies-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }
        
        .movie-card {
            background: rgba(30, 41, 59, 0.7);
            border-radius: 15px;
            overflow: hidden;
            border: 1px solid rgba(100, 116, 139, 0.3);
            transition: all 0.3s ease;
        }
        
        .movie-card:hover {
            transform: translateY(-10px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.3);
            border-color: #60a5fa;
        }
        
        .movie-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            background: linear-gradient(135deg, #1e293b, #0f172a);
        }
        
        .movie-info {
            padding: 20px;
        }
        
        .movie-title {
            font-size: 1.2rem;
            margin-bottom: 10px;
            color: #f1f5f9;
            line-height: 1.4;
        }
        
        .movie-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
            color: #94a3b8;
        }
        
        .quality-badge {
            background: #10b981;
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .rating-badge {
            background: #f59e0b;
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .categories {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 15px;
        }
        
        .category-tag {
            background: rgba(100, 116, 139, 0.3);
            color: #cbd5e1;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8rem;
        }
        
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 20px;
            color: #94a3b8;
            border-top: 1px solid rgba(100, 116, 139, 0.3);
        }
        
        @media (max-width: 768px) {
            .movies-grid {
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 نتائج استخراج الأفلام - KiroZozo</h1>
            <p>آخر تحديث: ${new Date(data.timestamp).toLocaleString('ar-EG')}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="number">${data.stats.totalMovies}</div>
                <div>إجمالي الأفلام</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.page1}</div>
                <div>من الصفحة الأولى</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.page2}</div>
                <div>من الصفحة الثانية</div>
            </div>
            <div class="stat-card">
                <div class="number">${data.stats.unique}</div>
                <div>أفلام فريدة</div>
            </div>
        </div>
        
        <h2 style="margin-bottom: 20px; color: #60a5fa;">🎥 الأفلام المستخرجة:</h2>
        
        <div class="movies-grid">
            ${data.movies.map(movie => `
                <div class="movie-card">
                    ${movie.image ? `
                        <img src="${movie.image}" alt="${movie.title}" class="movie-image"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"300\" height=\"200\" viewBox=\"0 0 300 200\"><rect width=\"300\" height=\"200\" fill=\"%231e293b\"/><text x=\"50%\" y=\"50%\" font-family=\"Arial\" font-size=\"20\" fill=\"%2360a5fa\" text-anchor=\"middle\" dy=\".3em\">${movie.title.substring(0, 20)}</text></svg>'">
                    ` : `
                        <div class="movie-image" style="display: flex; align-items: center; justify-content: center;">
                            <div style="text-align: center; color: #60a5fa;">
                                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="2" y="2" width="20" height="20" rx="3"/>
                                    <circle cx="8" cy="8" r="2"/>
                                    <path d="M22 12l-10 7 0-14 10 7z"/>
                                </svg>
                                <div style="margin-top: 10px;">${movie.title.substring(0, 30)}</div>
                            </div>
                        </div>
                    `}
                    <div class="movie-info">
                        <h3 class="movie-title">${movie.title}</h3>
                        <div class="movie-meta">
                            <span class="quality-badge">${movie.quality}</span>
                            ${movie.rating ? `<span class="rating-badge">⭐ ${movie.rating}</span>` : ''}
                        </div>
                        <div class="categories">
                            ${movie.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            <p>تم الاستخراج تلقائياً بواسطة GitHub Actions</p>
            <p>⏰ التحديث التالي: ${new Date(data.metadata.nextFetch).toLocaleString('ar-EG')}</p>
        </div>
    </div>
</body>
</html>`;
    
    fs.writeFileSync("report.html", html);
}

// التشغيل الرئيسي
async function main() {
    try {
        console.log('=======================================');
        console.log('🚀 بدء استخراج الأفلام من KiroZozo');
        console.log('=======================================');
        
        const result = await extractLatestMovies();
        
        console.log('=======================================');
        console.log(result.success ? '✅ تم الانتهاء بنجاح!' : '❌ حدث خطأ');
        console.log('=======================================');
        
    } catch (error) {
        console.error('💥 خطأ غير متوقع:', error);
    }
}

// تشغيل البرنامج
main();
