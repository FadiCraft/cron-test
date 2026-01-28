import fs from "fs";
import path from "path";

// إنشاء مجلد movies
const moviesDir = path.join(process.cwd(), "movies");
if (!fs.existsSync(moviesDir)) {
    fs.mkdirSync(moviesDir, { recursive: true });
}

// ملف الإخراج
const outputFile = path.join(moviesDir, "Hg.json");

async function simpleMovieExtractor() {
    console.log("🎬 استخراج الأفلام من topcinema.rip...");
    
    try {
        // جلب الصفحة الرئيسية
        const response = await fetch("https://topcinema.rip/movies/", {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const html = await response.text();
        
        // البحث عن روابط الأفلام باستخدام regex بسيط
        const movieLinks = [];
        const linkRegex = /<a[^>]*href="(https:\/\/topcinema\.rip\/movies\/[^"]*)"[^>]*>/g;
        
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
            const url = match[1];
            
            // الحصول على العنوان من الرابط
            const titleMatch = html.match(new RegExp(`<a[^>]*href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<\/a>`));
            const title = titleMatch ? titleMatch[1].trim() : url.split("/").pop().replace(/-/g, " ");
            
            if (!movieLinks.some(m => m.url === url)) {
                movieLinks.push({
                    title: title,
                    url: url,
                    id: url.split("/").filter(Boolean).pop()
                });
            }
        }
        
        console.log(`✅ عثرت على ${movieLinks.length} فيلم`);
        
        // حفظ النتائج
        const result = {
            total: movieLinks.length,
            timestamp: new Date().toISOString(),
            movies: movieLinks.slice(0, 20) // أول 20 فيلم فقط
        };
        
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`💾 تم الحفظ في: ${outputFile}`);
        
        // عرض النتائج
        console.log("\n📋 الأفلام المستخرجة:");
        result.movies.forEach((movie, i) => {
            console.log(`${i + 1}. ${movie.title}`);
        });
        
    } catch (error) {
        console.error(`❌ خطأ: ${error.message}`);
        
        // حفظ خطأ
        const errorResult = {
            error: error.message,
            timestamp: new Date().toISOString(),
            movies: []
        };
        
        fs.writeFileSync(outputFile, JSON.stringify(errorResult, null, 2));
    }
}

// تشغيل
simpleMovieExtractor();
