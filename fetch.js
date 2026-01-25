import fs from "fs";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

// إعدادات
const MOVIES_URL = "https://topcinema.media/movies/";
const PROXIES = [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?',
    ''
];

async function fetchWithProxies(url) {
    for (let proxy of PROXIES) {
        try {
            let targetUrl = proxy ? proxy + encodeURIComponent(url) : url;
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 15000
            });
            
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.log(`Proxy failed: ${proxy}, trying next...`);
        }
    }
    return null;
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100);
}

function extractMoviesFromHTML(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const movies = [];
    
    // البحث عن عناصر الأفلام
    const movieElements = document.querySelectorAll('.Small--Box:not(.Season)');
    
    movieElements.forEach(element => {
        try {
            // تخطي المسلسلات (التي لها رقم)
            const hasNumber = element.querySelector('.number') !== null;
            if (hasNumber) return;
            
            // استخراج الرابط
            const linkElement = element.querySelector('a.recent--block, a[href*="/20"], a');
            const link = linkElement ? linkElement.href : null;
            
            if (!link || link.includes('javascript:') || link.includes('#')) return;
            
            // استخراج الصورة
            const imgElement = element.querySelector('.Poster img, img[src*=".jpg"], img[src*=".png"], img');
            let imageSrc = null;
            if (imgElement) {
                imageSrc = imgElement.getAttribute('data-src') || imgElement.src;
                if (imageSrc && (imageSrc.includes('blank.gif') || imageSrc.includes('data:image'))) {
                    imageSrc = null;
                }
            }
            
            // استخراج العنوان
            let title = '';
            const titleElement = element.querySelector('.title, h3, h4');
            if (titleElement) {
                title = cleanText(titleElement.textContent);
            }
            
            if (!title) return;
            
            // استخراج الجودة
            const qualityElement = element.querySelector('.liList li:nth-child(2), .quality');
            const quality = qualityElement ? qualityElement.textContent.trim() : 'HD';
            
            // استخراج التقييم
            let rating = null;
            const ratingElement = element.querySelector('.imdbRating, .rating');
            if (ratingElement) {
                const ratingText = ratingElement.textContent.trim();
                const ratingMatch = ratingText.match(/(\d+\.\d+|\d+)/);
                if (ratingMatch) {
                    const ratingValue = parseFloat(ratingMatch[1]);
                    if (ratingValue >= 1 && ratingValue <= 10) {
                        rating = ratingValue.toFixed(1);
                    }
                }
            }
            
            // استخراج التصنيفات
            const categoryElements = element.querySelectorAll('.liList li:first-child, .cat');
            const categories = Array.from(categoryElements)
                .map(cat => cleanText(cat.textContent))
                .filter(cat => cat && !cat.includes('WEB-DL') && !cat.includes('p'));
            
            // استخراج السنة
            const yearMatch = title.match(/(19|20)\d{2}/);
            const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
            
            // إضافة الفيلم
            movies.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                title: title,
                url: link,
                image: imageSrc,
                quality: quality,
                rating: rating,
                categories: categories,
                year: year,
                type: 'فيلم',
                fetchedAt: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('Error extracting movie:', error);
        }
    });
    
    return movies;
}

async function extractLatestMovies(page = 1) {
    try {
        let url = MOVIES_URL;
        if (page > 1) {
            url = `${MOVIES_URL}page/${page}/`;
        }
        
        console.log(`Fetching movies from: ${url}`);
        
        const html = await fetchWithProxies(url);
        if (!html) {
            throw new Error('Failed to fetch movies');
        }
        
        const movies = extractMoviesFromHTML(html);
        console.log(`Extracted ${movies.length} movies from page ${page}`);
        
        return movies;
        
    } catch (error) {
        console.error('Error extracting movies:', error);
        return [];
    }
}

// دالة لاستخراج المسلسلات أيضاً
async function extractSeries() {
    try {
        const SERIES_URL = "https://topcinema.media/category/%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/";
        const html = await fetchWithProxies(SERIES_URL);
        
        if (!html) {
            return [];
        }
        
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const series = [];
        
        const seriesElements = document.querySelectorAll('.Small--Box:not(.Season)');
        
        seriesElements.forEach(element => {
            try {
                // التحقق إذا كان مسلسل (له رقم)
                const hasNumber = element.querySelector('.number') !== null;
                if (!hasNumber) return;
                
                // استخراج البيانات (نفس منطق الأفلام)
                const linkElement = element.querySelector('a.recent--block, a');
                const link = linkElement ? linkElement.href : null;
                
                if (!link) return;
                
                const imgElement = element.querySelector('.Poster img, img');
                let imageSrc = imgElement ? (imgElement.getAttribute('data-src') || imgElement.src) : null;
                
                const titleElement = element.querySelector('.title, h3');
                const title = titleElement ? cleanText(titleElement.textContent) : '';
                
                if (!title) return;
                
                const seriesItem = {
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    title: title,
                    url: link,
                    image: imageSrc,
                    type: 'مسلسل',
                    fetchedAt: new Date().toISOString()
                };
                
                series.push(seriesItem);
                
            } catch (error) {
                console.error('Error extracting series:', error);
            }
        });
        
        return series;
        
    } catch (error) {
        console.error('Error in extractSeries:', error);
        return [];
    }
}

async function main() {
    console.log('Starting movie extraction...');
    
    try {
        // استخراج الأفلام من الصفحة الأولى والثانية
        const moviesPage1 = await extractLatestMovies(1);
        const moviesPage2 = await extractLatestMovies(2);
        
        // استخراج المسلسلات
        const series = await extractSeries();
        
        // دمج النتائج
        const allMovies = [...moviesPage1, ...moviesPage2];
        
        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            stats: {
                totalMovies: allMovies.length,
                totalSeries: series.length,
                totalContent: allMovies.length + series.length
            },
            movies: allMovies,
            series: series,
            metadata: {
                source: 'topcinema.media',
                fetchedAt: new Date().toISOString(),
                version: '1.0.0'
            }
        };
        
        // حفظ النتائج
        fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
        
        // حفظ ملف منفصل للأفلام فقط
        fs.writeFileSync("movies.json", JSON.stringify({
            timestamp: new Date().toISOString(),
            movies: allMovies
        }, null, 2));
        
        // حفظ ملف منفصل للمسلسلات
        fs.writeFileSync("series.json", JSON.stringify({
            timestamp: new Date().toISOString(),
            series: series
        }, null, 2));
        
        console.log('Successfully extracted:');
        console.log(`- ${allMovies.length} movies`);
        console.log(`- ${series.length} series`);
        console.log('Results saved to result.json, movies.json, and series.json');
        
        return result;
        
    } catch (error) {
        console.error('Main function error:', error);
        
        // حفظ حالة الخطأ
        const errorResult = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            movies: [],
            series: []
        };
        
        fs.writeFileSync("result.json", JSON.stringify(errorResult, null, 2));
        
        return errorResult;
    }
}

// تشغيل البرنامج إذا تم تنفيذه مباشرة
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main, extractLatestMovies, extractSeries };
