import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ملف الإخراج
const OUTPUT_FILE = path.join(__dirname, "Hg.json");

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`⚠️ حالة غير ناجحة: ${response.status} لـ ${url}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`⏱️ انتهى الوقت لـ ${url}`);
        } else {
            console.log(`❌ خطأ في جلب ${url}: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج الأفلام من الصفحة الأولى ====================
async function fetchMoviesFromHomePage() {
    const url = "https://topcinema.rip/movies/";
    
    console.log(`📖 جلب الصفحة الرئيسية: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب الصفحة الرئيسية`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        // محاولة انتقاءات مختلفة لعناصر الأفلام
        let movieElements = doc.querySelectorAll('.Small--Box a');
        
        if (movieElements.length === 0) {
            movieElements = doc.querySelectorAll('article a, .post-item a, .movie-item a');
        }
        
        console.log(`✅ عثر على ${movieElements.length} عنصر في الصفحة الرئيسية`);
        
        movieElements.forEach((element, i) => {
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip') && movieUrl.includes('/movies/')) {
                const title = element.querySelector('.title, h2, h3, .post-title')?.textContent || 
                              element.textContent || 
                              `فيلم ${i + 1}`;
                
                movies.push({
                    title: title.trim(),
                    url: movieUrl,
                    position: i + 1
                });
            }
        });
        
        console.log(`✅ تم تصفية ${movies.length} فيلم صالح`);
        
        return { url, movies };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل الفيلم كاملة ====================
async function fetchFullMovieDetails(movie) {
    console.log(`  🎬 ${movie.title.substring(0, 40)}...`);
    
    const html = await fetchWithTimeout(movie.url, 15000);
    
    if (!html) {
        console.log(`     ⚠️ فشل جلب صفحة الفيلم`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : null;
        
        let movieId = null;
        if (shortLink) {
            const match = shortLink.match(/p=(\d+)/);
            movieId = match ? match[1] : null;
        }
        
        // إذا لم نجد ID من shortlink، نستخرج من URL
        if (!movieId) {
            const urlMatch = movie.url.match(/\/(\d+)\/$/);
            movieId = urlMatch ? urlMatch[1] : `temp_${Date.now()}_${movie.position}`;
        }
        
        // 2. البيانات الأساسية
        const title = doc.querySelector(".post-title a, h1.entry-title, h1")?.textContent?.trim() || movie.title;
        const image = doc.querySelector(".image img, .post-thumbnail img, img.wp-post-image")?.src;
        const imdbRating = doc.querySelector(".imdbR span, .rating, .imdb")?.textContent?.trim();
        
        // 3. القصة
        let story = "غير متوفر";
        const storyElement = doc.querySelector(".story p, .entry-content p, .content p");
        if (storyElement) {
            story = storyElement.textContent.trim();
        }
        
        // 4. التفاصيل الكاملة
        const details = {
            category: [],
            genres: [],
            quality: [],
            duration: "",
            releaseYear: [],
            language: [],
            actors: [],
            director: [],
            country: []
        };
        
        // استخراج من قائمة التفاصيل
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = labelElement.textContent.replace(":", "").trim();
                const links = item.querySelectorAll("a");
                
                if (links.length > 0) {
                    const values = Array.from(links).map(a => a.textContent.trim());
                    
                    if (label.includes("قسم الفيلم")) {
                        details.category = values;
                    } else if (label.includes("نوع الفيلم") || label.includes("تصنيف")) {
                        details.genres = values;
                    } else if (label.includes("جودة الفيلم") || label.includes("الجودة")) {
                        details.quality = values;
                    } else if (label.includes("موعد الصدور") || label.includes("السنة")) {
                        details.releaseYear = values;
                    } else if (label.includes("لغة الفيلم") || label.includes("اللغة")) {
                        details.language = values;
                    } else if (label.includes("بطولة") || label.includes("الممثلين")) {
                        details.actors = values;
                    } else if (label.includes("المخرج") || label.includes("إخراج")) {
                        details.director = values;
                    } else if (label.includes("البلد") || label.includes("الدولة")) {
                        details.country = values;
                    }
                } else {
                    const text = item.textContent.trim();
                    const value = text.split(":").slice(1).join(":").trim();
                    
                    if (label.includes("توقيت الفيلم") || label.includes("المدة")) {
                        details.duration = value;
                    }
                }
            }
        });
        
        // 5. روابط المشاهدة إن وجدت
        const watchLinks = [];
        const watchElements = doc.querySelectorAll(".dooplay_player_option a");
        watchElements.forEach(link => {
            if (link.href && !link.href.includes('#')) {
                watchLinks.push({
                    server: link.textContent.trim() || "مصدر غير معروف",
                    url: link.href
                });
            }
        });
        
        return {
            id: movieId,
            title: title,
            image: image,
            url: movie.url,
            imdbRating: imdbRating,
            story: story,
            details: details,
            watchLinks: watchLinks.length > 0 ? watchLinks : [],
            position: movie.position,
            scrapedAt: new Date().toISOString(),
            scrapedDate: new Date().toLocaleString('ar-SA')
        };
        
    } catch (error) {
        console.log(`     ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== حفظ في ملف Hg.json ====================
function saveToHgFile(pageData, moviesData) {
    try {
        const result = {
            page: "Home",
            url: pageData.url,
            totalMovies: moviesData.length,
            scrapedAt: new Date().toISOString(),
            timestamp: new Date().toLocaleString('ar-SA'),
            movies: moviesData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
        
        // التحقق من أن الملف تم إنشاؤه
        if (fs.existsSync(OUTPUT_FILE)) {
            const fileStats = fs.statSync(OUTPUT_FILE);
            console.log(`💾 تم حفظ ${moviesData.length} فيلم في ${OUTPUT_FILE}`);
            console.log(`📊 حجم الملف: ${(fileStats.size / 1024).toFixed(2)} KB`);
            return true;
        } else {
            console.log(`❌ الملف لم يتم إنشاؤه: ${OUTPUT_FILE}`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return false;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("🚀 بدء استخراج الصفحة الرئيسية فقط");
    console.log("=".repeat(60));
    console.log(`📅 التاريخ: ${new Date().toLocaleString('ar-SA')}`);
    console.log(`💾 ملف الإخراج: ${OUTPUT_FILE}`);
    console.log("=".repeat(60));
    
    try {
        // 1. جلب الصفحة الرئيسية فقط
        const pageData = await fetchMoviesFromHomePage();
        
        if (!pageData || pageData.movies.length === 0) {
            console.log("⏹️ لا توجد أفلام في الصفحة الرئيسية");
            return;
        }
        
        // 2. استخراج تفاصيل كل فيلم في الصفحة الأولى
        console.log(`\n🔍 استخراج تفاصيل ${pageData.movies.length} فيلم...`);
        
        const moviesData = [];
        
        // نأخذ أول 20 فيلم فقط من الصفحة الأولى (يمكنك تعديل الرقم)
        const limit = Math.min(20, pageData.movies.length);
        
        for (let i = 0; i < limit; i++) {
            const movie = pageData.movies[i];
            
            try {
                const details = await fetchFullMovieDetails(movie);
                
                if (details) {
                    moviesData.push(details);
                    console.log(`   ✅ ${i + 1}/${limit}: ${details.title.substring(0, 30)}...`);
                } else {
                    console.log(`   ⏭️ تخطي الفيلم ${i + 1}`);
                }
                
                // انتظار قصير بين الأفلام لتجنب الحظر
                if (i < limit - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (movieError) {
                console.log(`   ❌ خطأ في الفيلم ${i + 1}: ${movieError.message}`);
                continue;
            }
        }
        
        // 3. حفظ النتائج في Hg.json
        console.log(`\n💾 جاري حفظ النتائج في Hg.json...`);
        
        if (moviesData.length > 0) {
            const saved = saveToHgFile(pageData, moviesData);
            
            if (saved) {
                console.log("\n" + "=".repeat(60));
                console.log("🎉 تم استخراج الصفحة الرئيسية بنجاح!");
                console.log("=".repeat(60));
                console.log(`📊 إجمالي الأفلام: ${moviesData.length}`);
                console.log(`📁 الملف المحفوظ: Hg.json`);
                console.log(`⏰ وقت التنفيذ: ${new Date().toLocaleString('ar-SA')}`);
                console.log("=".repeat(60));
                
                // عرض عينة من البيانات
                console.log("\n📋 عينة من الأفلام المستخرجة:");
                moviesData.slice(0, 3).forEach((movie, i) => {
                    console.log(`${i + 1}. ${movie.title}`);
                    console.log(`   🎭 الأنواع: ${movie.details.genres.join(', ') || 'غير معروف'}`);
                    console.log(`   ⭐ IMDb: ${movie.imdbRating || 'غير متوفر'}`);
                    console.log(`   🎬 الرابط: ${movie.url}`);
                    console.log("");
                });
            } else {
                console.log("\n❌ فشل في حفظ النتائج");
            }
        } else {
            console.log("\n⚠️ لم يتم استخراج أي فيلم بنجاح");
        }
        
    } catch (error) {
        console.error("\n💥 خطأ في الدالة الرئيسية:", error.message);
    }
    
    console.log("\n✨ البرنامج انتهى!");
}

// التشغيل
main().then(() => {
    console.log("✅ تم الإنتهاء من استخراج الصفحة الأولى");
    process.exit(0);
}).catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error.message);
    process.exit(1);
});
