import fs from "fs";
import { JSDOM } from "jsdom";
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات
const BASE_URL = "https://topcinema.media/movies/";
const MAX_MOVIES = 50; // أقصى عدد أفلام
const CACHE_FILE = "movies_cache.json";

// دالة لجلب HTML مع معالجة الأخطاء
async function fetchHTML(url) {
    try {
        console.log(`📥 جلب البيانات من: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Referer': 'https://www.google.com/'
            },
            timeout: 15000
        });

        if (!response.ok) {
            console.log(`❌ خطأ HTTP: ${response.status}`);
            return null;
        }

        const html = await response.text();
        console.log(`✅ تم جلب ${(html.length / 1024).toFixed(2)}KB`);
        return html;

    } catch (error) {
        console.log(`💥 خطأ في الاتصال: ${error.message}`);
        return null;
    }
}

// دالة لاستخراج الأفلام من HTML
function extractMoviesFromHTML(html, pageNum = 1) {
    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const movies = [];

        // البحث عن جميع البطاقات
        const movieElements = document.querySelectorAll('.Small--Box:not(.Season)');
        
        console.log(`🔍 وجدت ${movieElements.length} بطاقة في الصفحة ${pageNum}`);

        movieElements.forEach((element, index) => {
            try {
                // تخطي العناصر الفارغة
                if (!element) return;

                // استخراج الرابط
                const linkElement = element.querySelector('a[href*="/20"]') || element.querySelector('a');
                if (!linkElement || !linkElement.href) return;

                const link = linkElement.href;
                if (!link.includes('topcinema') && !link.includes('http')) return;

                // استخراج الصورة
                let image = '';
                const imgElement = element.querySelector('img');
                if (imgElement) {
                    image = imgElement.src || imgElement.getAttribute('data-src') || '';
                    if (image.includes('blank.gif') || image.includes('data:image')) {
                        image = '';
                    }
                }

                // استخراج العنوان
                let title = '';
                const titleElement = element.querySelector('.title') || 
                                   element.querySelector('h3') || 
                                   element.querySelector('h4');
                
                if (titleElement) {
                    title = titleElement.textContent.trim();
                } else if (imgElement && imgElement.alt) {
                    title = imgElement.alt.trim();
                } else {
                    title = `فيلم ${(pageNum - 1) * 20 + index + 1}`;
                }

                // تنظيف العنوان
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 2) return;

                // استخراج الجودة
                let quality = 'HD';
                const qualityElement = element.querySelector('.liList li:nth-child(2)') || 
                                      element.querySelector('.quality');
                if (qualityElement) {
                    const qualityText = qualityElement.textContent.trim();
                    if (qualityText && qualityText.length > 0) {
                        quality = qualityText;
                    }
                }

                // استخراج التقييم
                let rating = null;
                const ratingElement = element.querySelector('.imdbRating') || 
                                     element.querySelector('.rating');
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
                    const catText = cat.textContent.trim();
                    if (catText && !catText.includes('WEB') && !catText.includes('p')) {
                        categories.push(catText);
                    }
                });

                // إضافة الفيلم
                movies.push({
                    id: `movie_${Date.now()}_${index}_${pageNum}`,
                    title: title,
                    url: link,
                    image: image || `https://via.placeholder.com/300x200/2a3a4d/ffffff?text=${encodeURIComponent(title.substring(0, 10))}`,
                    quality: quality,
                    rating: rating,
                    categories: categories.length > 0 ? categories : ['عام'],
                    year: new Date().getFullYear().toString(),
                    type: 'فيلم',
                    page: pageNum,
                    index: index,
                    fetchedAt: new Date().toISOString(),
                    hash: generateHash(title + link) // لتحديد التكرارات
                });

            } catch (error) {
                console.log(`⚠️ خطأ في معالجة بطاقة ${index}: ${error.message}`);
            }
        });

        return movies;

    } catch (error) {
        console.log(`💥 خطأ في تحليل HTML: ${error.message}`);
        return [];
    }
}

// دالة لتوليد هاش فريد
function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

// دالة لجلب أفلام من عدة صفحات
async function fetchMoviesFromMultiplePages() {
    console.log("🚀 بدء استخراج الأفلام من عدة صفحات...");
    
    const allMovies = [];
    const pagesToFetch = 3; // الصفحات 1، 2، 3
    
    for (let page = 1; page <= pagesToFetch; page++) {
        console.log(`📄 جاري الصفحة ${page}/${pagesToFetch}...`);
        
        let url = BASE_URL;
        if (page > 1) {
            url = `${BASE_URL}page/${page}/`;
        }
        
        const html = await fetchHTML(url);
        
        if (html) {
            const movies = extractMoviesFromHTML(html, page);
            if (movies.length > 0) {
                allMovies.push(...movies);
                console.log(`✅ الصفحة ${page}: ${movies.length} فيلم`);
            } else {
                console.log(`⚠️ الصفحة ${page}: 0 أفلام`);
            }
        } else {
            console.log(`❌ فشل في الصفحة ${page}`);
        }
        
        // انتظار بسيط بين الصفحات
        if (page < pagesToFetch) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return allMovies;
}

// دالة لإزالة التكرارات
function removeDuplicates(movies) {
    const uniqueMovies = [];
    const seenHashes = new Set();
    
    movies.forEach(movie => {
        if (!seenHashes.has(movie.hash)) {
            seenHashes.add(movie.hash);
            uniqueMovies.push(movie);
        }
    });
    
    return uniqueMovies;
}

// دالة لقراءة البيانات القديمة
function readOldData() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            console.log(`📖 قراءة ${data.movies?.length || 0} فيلم من الذاكرة القديمة`);
            return data;
        }
    } catch (error) {
        console.log("⚠️ لا توجد بيانات قديمة");
    }
    return { movies: [], timestamp: null };
}

// دالة لمقارنة البيانات القديمة والجديدة
function compareData(oldMovies, newMovies) {
    const oldCount = oldMovies.length;
    const newCount = newMovies.length;
    
    // البحث عن أفلام جديدة
    const oldHashes = new Set(oldMovies.map(m => m.hash));
    const newMoviesOnly = newMovies.filter(m => !oldHashes.has(m.hash));
    
    return {
        oldCount,
        newCount,
        newMoviesCount: newMoviesOnly.length,
        newMovies: newMoviesOnly
    };
}

// الدالة الرئيسية
async function main() {
    console.log("🎬 =======================================");
    console.log("🎬   KiroZozo Movie Extractor v2.0");
    console.log("🎬 =======================================");
    
    const startTime = Date.now();
    
    try {
        // 1. قراءة البيانات القديمة
        const oldData = readOldData();
        const oldMovies = oldData.movies || [];
        
        // 2. جلب البيانات الجديدة
        const rawMovies = await fetchMoviesFromMultiplePages();
        
        // إذا فشل الاستخراج، استخدم البيانات القديمة
        if (rawMovies.length === 0 && oldMovies.length > 0) {
            console.log("⚠️ استخدام البيانات القديمة (فشل الاستخراج)");
            saveResults(oldMovies, oldMovies, { fromCache: true });
            return;
        }
        
        // 3. تنظيف البيانات
        const uniqueMovies = removeDuplicates(rawMovies);
        
        // 4. مقارنة مع القديم
        const comparison = compareData(oldMovies, uniqueMovies);
        
        // 5. دمج القديم مع الجديد (احتفظ بكل الأفلام)
        const allMovies = removeDuplicates([...oldMovies, ...uniqueMovies]);
        
        // 6. حفظ النتائج
        saveResults(allMovies, comparison);
        
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\n✨ تم الانتهاء في ${duration.toFixed(2)} ثانية`);
        console.log(`📊 الإحصائيات:`);
        console.log(`   - الأفلام القديمة: ${comparison.oldCount}`);
        console.log(`   - الأفلام الجديدة: ${comparison.newCount}`);
        console.log(`   - أفلام جديدة مضافة: ${comparison.newMoviesCount}`);
        console.log(`   - الإجمالي: ${allMovies.length}`);
        console.log("🎬 =======================================");
        
    } catch (error) {
        console.error(`💥 خطأ رئيسي: ${error.message}`);
        
        // محاولة استخدام البيانات القديمة في حالة الخطأ
        const oldData = readOldData();
        if (oldData.movies.length > 0) {
            console.log("🔄 استخدام البيانات القديمة بسبب الخطأ");
            saveResults(oldData.movies, oldData.movies, { error: true, message: error.message });
        }
    }
}

// دالة لحفظ النتائج
function saveResults(movies, comparison, metadata = {}) {
    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        source: "topcinema.media",
        stats: {
            totalMovies: movies.length,
            fromCache: metadata.fromCache || false,
            newMoviesAdded: comparison.newMoviesCount || 0,
            uniqueMovies: movies.length
        },
        comparison: {
            oldCount: comparison.oldCount || 0,
            newCount: comparison.newCount || 0,
            newMoviesCount: comparison.newMoviesCount || 0
        },
        movies: movies,
        metadata: {
            fetchedAt: new Date().toISOString(),
            nextFetch: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            note: metadata.message || "تم التحديث بنجاح"
        }
    };
    
    // حفظ الملف الرئيسي
    fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
    
    // حفظ نسخة للذاكرة
    fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
    
    // حفظ ملف مبسط
    const simpleMovies = movies.map(m => ({
        title: m.title,
        quality: m.quality,
        rating: m.rating,
        url: m.url
    }));
    
    fs.writeFileSync("movies_simple.json", JSON.stringify({
        timestamp: new Date().toISOString(),
        count: movies.length,
        movies: simpleMovies.slice(0, 20) // أول 20 فيلم فقط
    }, null, 2));
    
    // إنشاء تقرير HTML
    createHTMLReport(result);
    
    console.log(`\n💾 تم حفظ النتائج:`);
    console.log(`   - result.json (${movies.length} فيلم)`);
    console.log(`   - movies_simple.json (${Math.min(20, movies.length)} فيلم)`);
    console.log(`   - ${CACHE_FILE} (للذاكرة)`);
    console.log(`   - report.html (تقرير مرئي)`);
}

// دالة لإنشاء تقرير HTML
function createHTMLReport(data) {
    const moviesToShow = data.movies.slice(0, 30); // أول 30 فيلم
    
    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>أفلام KiroZozo - ${new Date().toLocaleString('ar-EG')}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        
        body {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #f1f1f1;
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            padding: 40px 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            margin-bottom: 40px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            font-size: 2.8rem;
            margin-bottom: 15px;
            background: linear-gradient(90deg, #00dbde, #fc00ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.07);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            border-color: #00dbde;
        }
        
        .stat-number {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 10px;
            color: #00dbde;
        }
        
        .movies-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }
        
        .movie-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 15px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
        }
        
        .movie-card:hover {
            transform: translateY(-10px) scale(1.02);
            border-color: #fc00ff;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
        }
        
        .movie-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
            display: block;
        }
        
        .movie-info {
            padding: 20px;
        }
        
        .movie-title {
            font-size: 1.2rem;
            margin-bottom: 15px;
            line-height: 1.4;
            color: #fff;
            height: 60px;
            overflow: hidden;
        }
        
        .movie-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .movie-quality {
            background: linear-gradient(90deg, #00dbde, #0099ff);
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: bold;
        }
        
        .movie-rating {
            color: #ffd700;
            font-weight: bold;
            font-size: 1.1rem;
        }
        
        .movie-categories {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 15px;
        }
        
        .category-tag {
            background: rgba(255, 255, 255, 0.1);
            color: #ccc;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.8rem;
        }
        
        .footer {
            text-align: center;
            margin-top: 50px;
            padding: 30px;
            color: #aaa;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .update-info {
            background: rgba(0, 219, 222, 0.1);
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid rgba(0, 219, 222, 0.3);
        }
        
        @media (max-width: 768px) {
            .movies-grid {
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .stat-number {
                font-size: 2.5rem;
            }
        }
        
        @media (max-width: 480px) {
            .movies-grid {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 1.8rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 KiroZozo - قاعدة الأفلام</h1>
            <p>آخر تحديث: ${new Date(data.timestamp).toLocaleString('ar-EG')}</p>
            ${data.stats.fromCache ? 
                '<div class="update-info">⚠️ استخدام البيانات المخزنة (فشل الاتصال بالموقع)</div>' : 
                `<div class="update-info">✨ تمت الإضافة: ${data.comparison.newMoviesCount} فيلم جديد</div>`
            }
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${data.stats.totalMovies}</div>
                <div>إجمالي الأفلام</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.comparison.newMoviesCount}</div>
                <div>أفلام جديدة</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.stats.uniqueMovies}</div>
                <div>أفلام فريدة</div>
            </div>
        </div>
        
        <h2 style="margin-bottom: 25px; color: #00dbde; text-align: center;">🎥 آخر الأفلام:</h2>
        
        <div class="movies-grid">
            ${moviesToShow.map(movie => `
                <div class="movie-card" onclick="window.open('${movie.url}', '_blank')">
                    <img src="${movie.image}" alt="${movie.title}" class="movie-image" 
                         onerror="this.src='https://via.placeholder.com/300x200/2a3a4d/ffffff?text=${encodeURIComponent(movie.title.substring(0, 15))}'">
                    <div class="movie-info">
                        <h3 class="movie-title">${movie.title}</h3>
                        <div class="movie-meta">
                            <span class="movie-quality">${movie.quality}</span>
                            ${movie.rating ? `<span class="movie-rating">⭐ ${movie.rating}</span>` : ''}
                        </div>
                        <div class="movie-categories">
                            ${movie.categories.map(cat => `<span class="category-tag">${cat}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            <p>🔄 يتم التحديث تلقائياً كل 30 دقيقة بواسطة GitHub Actions</p>
            <p>⏰ التحديث التالي: ${new Date(data.metadata.nextFetch).toLocaleString('ar-EG')}</p>
            <p style="margin-top: 20px; font-size: 0.9rem; color: #777;">
                تم استخراج البيانات من: ${data.source}<br>
                النسخة: 2.0 | آخر تشغيل: ${new Date().toLocaleString('ar-EG')}
            </p>
        </div>
    </div>
    
    <script>
        // إضافة تأثيرات تفاعلية
        document.addEventListener('DOMContentLoaded', function() {
            // تأثير ظهور البطاقات
            const cards = document.querySelectorAll('.movie-card');
            cards.forEach((card, index) => {
                card.style.animationDelay = (index * 0.1) + 's';
                card.style.animation = 'fadeInUp 0.5s ease forwards';
            });
            
            // تحديث الوقت الحي
            function updateTime() {
                const timeElement = document.querySelector('.footer p:nth-child(2)');
                if (timeElement) {
                    const now = new Date();
                    const next = new Date('${data.metadata.nextFetch}');
                    const diff = next - now;
                    
                    if (diff > 0) {
                        const minutes = Math.floor(diff / 60000);
                        const seconds = Math.floor((diff % 60000) / 1000);
                        timeElement.innerHTML = 
                            \`⏰ التحديث التالي: بعد \${minutes}:\${seconds.toString().padStart(2, '0')}\`;
                    }
                }
            }
            
            setInterval(updateTime, 1000);
            updateTime();
        });
    </script>
    
    <style>
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .movie-card {
            opacity: 0;
            animation-fill-mode: forwards;
        }
    </style>
</body>
</html>`;
    
    fs.writeFileSync("report.html", html);
}

// تشغيل البرنامج
main();
