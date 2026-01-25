import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات
const PAGES_DIR = path.join(__dirname, "pages");
const MOVIES_DIR = path.join(__dirname, "movies");

// إنشاء المجلدات
[PAGES_DIR, MOVIES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// دالة fetch بسيطة
async function fetchPage(url) {
    try {
        console.log(`🌐 جاري جلب: ${url}`);
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        };
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            console.log(`❌ فشل الجلب: ${response.status} ${response.statusText}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

// دالة لتنظيف النص
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, " ").trim();
}

// دالة لاستخراج ID
function extractMovieId(url) {
    try {
        const match = url.match(/p=(\d+)/);
        return match ? match[1] : `temp_${Date.now()}`;
    } catch {
        return `temp_${Date.now()}`;
    }
}

// دالة لجلب الأفلام من الصفحة الأولى (كلها)
async function fetchAllMoviesFromPage() {
    const url = "https://topcinema.rip/movies/";
    
    console.log(`\n📖 ===== جلب الصفحة الأولى =====`);
    console.log(`🔗 الرابط: ${url}`);
    
    const html = await fetchPage(url);
    
    if (!html) {
        console.log("❌ فشل جلب الصفحة");
        return [];
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const movies = [];
        
        console.log("🔍 البحث عن الأفلام...");
        
        // البحث عن جميع الأفلام
        const movieElements = doc.querySelectorAll('.Small--Box a');
        
        console.log(`✅ وجدت ${movieElements.length} رابط أفلام`);
        
        // استخراج جميع الأفلام - بدون تحديد حد أقصى
        for (let i = 0; i < movieElements.length; i++) {
            const element = movieElements[i];
            const movieUrl = element.href;
            
            if (movieUrl && movieUrl.includes('topcinema.rip')) {
                const movieId = extractMovieId(movieUrl);
                const title = cleanText(element.querySelector('.title')?.textContent || 
                                      element.textContent || 
                                      `فيلم ${i + 1}`);
                
                movies.push({
                    id: movieId,
                    title: title,
                    url: movieUrl,
                    page: 1,
                    index: i + 1
                });
                
                console.log(`  ${i + 1}. ${title.substring(0, 40)}...`);
            }
        }
        
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في تحليل الصفحة:`, error.message);
        return [];
    }
}

// دالة لاستخراج سيرفر المشاهدة
async function fetchWatchServer(watchPageUrl) {
    try {
        console.log(`   🎥 جاري جلب صفحة المشاهدة...`);
        
        const html = await fetchPage(watchPageUrl);
        
        if (!html) {
            console.log("   ⚠️ فشل جلب صفحة المشاهدة");
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن meta tag للفيديو
        const videoMeta = doc.querySelector('meta[property="og:video"], meta[property="og:video:secure_url"]');
        
        if (videoMeta) {
            const videoUrl = videoMeta.getAttribute('content');
            console.log(`   ✅ وجد رابط فيديو: ${videoUrl.substring(0, 60)}...`);
            return {
                type: "embed",
                url: videoUrl,
                source: "meta_tag"
            };
        }
        
        // البحث عن iframe
        const iframe = doc.querySelector('iframe');
        if (iframe) {
            const iframeSrc = iframe.getAttribute('src');
            console.log(`   ✅ وجد iframe: ${iframeSrc.substring(0, 60)}...`);
            return {
                type: "iframe",
                url: iframeSrc,
                source: "iframe"
            };
        }
        
        console.log("   ⚠️ لم يتم العثور على سيرفر مشاهدة");
        return null;
        
    } catch (error) {
        console.log(`   ❌ خطأ في جلب سيرفر المشاهدة: ${error.message}`);
        return null;
    }
}

// دالة لاستخراج سيرفرات التحميل
async function fetchDownloadServers(downloadPageUrl) {
    try {
        console.log(`   📥 جاري جلب صفحة التحميل...`);
        
        const html = await fetchPage(downloadPageUrl);
        
        if (!html) {
            console.log("   ⚠️ فشل جلب صفحة التحميل");
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const servers = {
            multiQuality: [],
            byQuality: {}
        };
        
        // سيرفرات متعددة الجودات
        const proServers = doc.querySelectorAll('.proServer a');
        if (proServers.length > 0) {
            console.log(`   ✅ وجد ${proServers.length} سيرفر متعدد الجودات`);
            
            proServers.forEach(server => {
                const name = cleanText(server.querySelector('p')?.textContent) || "غير معروف";
                const url = server.href;
                
                servers.multiQuality.push({
                    name: name,
                    url: url,
                    type: "multi_quality"
                });
            });
        }
        
        // سيرفرات حسب الجودة
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
        if (downloadBlocks.length > 0) {
            console.log(`   ✅ وجد ${downloadBlocks.length} نوع جودة`);
            
            downloadBlocks.forEach(block => {
                const qualityElement = block.querySelector('span');
                const quality = qualityElement ? cleanText(qualityElement.textContent) : "غير معروف";
                
                servers.byQuality[quality] = [];
                
                const serverLinks = block.querySelectorAll('.download-items a');
                
                serverLinks.forEach(link => {
                    const name = cleanText(link.querySelector('span')?.textContent) || "غير معروف";
                    const serverQuality = cleanText(link.querySelector('p')?.textContent) || quality;
                    const url = link.href;
                    
                    servers.byQuality[quality].push({
                        name: name,
                        quality: serverQuality,
                        url: url
                    });
                });
                
                console.log(`   📊 جودة ${quality}: ${servers.byQuality[quality].length} سيرفر`);
            });
        }
        
        return servers;
        
    } catch (error) {
        console.log(`   ❌ خطأ في جلب سيرفرات التحميل: ${error.message}`);
        return null;
    }
}

// دالة لاستخراج فيلم واحد
async function fetchSingleMovie(movie) {
    console.log(`\n🎬 جاري استخراج الفيلم ${movie.index}:`);
    console.log(`   العنوان: ${movie.title}`);
    
    try {
        const html = await fetchPage(movie.url);
        
        if (!html) {
            console.log("   ⚠️ فشل جلب صفحة الفيلم");
            return null;
        }
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استخراج ID من الرابط المختصر
        const shortLinkInput = doc.querySelector('#shortlink');
        const shortLink = shortLinkInput ? shortLinkInput.value : movie.url;
        const movieId = extractMovieId(shortLink);
        
        // استخراج البيانات الأساسية
        const title = cleanText(doc.querySelector(".post-title a")?.textContent || movie.title);
        const image = doc.querySelector(".image img")?.src;
        const imdbRating = cleanText(doc.querySelector(".imdbR span")?.textContent);
        const story = cleanText(doc.querySelector(".story p")?.textContent);
        
        // استخراج التفاصيل
        const details = {};
        const detailItems = doc.querySelectorAll(".RightTaxContent li");
        
        detailItems.forEach(item => {
            const labelElement = item.querySelector("span");
            if (labelElement) {
                const label = cleanText(labelElement.textContent).replace(":", "").trim();
                if (label) {
                    const links = item.querySelectorAll("a");
                    if (links.length > 0) {
                        const values = Array.from(links).map(a => cleanText(a.textContent));
                        details[label] = values;
                    } else {
                        const text = cleanText(item.textContent);
                        const value = text.split(":").slice(1).join(":").trim();
                        details[label] = value;
                    }
                }
            }
        });
        
        // استخراج روابط المشاهدة والتحميل
        const watchButton = doc.querySelector('a.watch');
        const downloadButton = doc.querySelector('a.download');
        
        const watchPageUrl = watchButton ? watchButton.href : null;
        const downloadPageUrl = downloadButton ? downloadButton.href : null;
        
        let watchServer = null;
        let downloadServers = null;
        
        // استخراج سيرفر المشاهدة
        if (watchPageUrl) {
            console.log(`   🔗 صفحة المشاهدة: ${watchPageUrl}`);
            watchServer = await fetchWatchServer(watchPageUrl);
        } else {
            console.log("   ⚠️ لا يوجد رابط مشاهدة");
        }
        
        // استخراج سيرفرات التحميل
        if (downloadPageUrl) {
            console.log(`   🔗 صفحة التحميل: ${downloadPageUrl}`);
            downloadServers = await fetchDownloadServers(downloadPageUrl);
        } else {
            console.log("   ⚠️ لا يوجد رابط تحميل");
        }
        
        // البيانات النهائية للفيلم
        const movieData = {
            id: movieId,
            title: title,
            url: movie.url,
            shortLink: shortLink,
            image: image,
            imdbRating: imdbRating,
            story: story || "غير متوفر",
            details: details,
            watchPage: watchPageUrl,
            watchServer: watchServer,
            downloadPage: downloadPageUrl,
            downloadServers: downloadServers,
            page: 1,
            scrapedAt: new Date().toISOString()
        };
        
        console.log(`   ✅ تم استخراج بيانات الفيلم بنجاح`);
        
        return movieData;
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// دالة لحفظ كل الأفلام في ملف واحد
function saveAllMoviesInOneFile(moviesData, filename = "all_movies.json") {
    const allMovies = {
        total: moviesData.length,
        page: 1,
        scrapedAt: new Date().toISOString(),
        source: "https://topcinema.rip/movies/",
        movies: moviesData
    };
    
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, JSON.stringify(allMovies, null, 2));
    
    console.log(`\n💾 تم حفظ جميع الأفلام في: ${filename}`);
    console.log(`   📊 عدد الأفلام: ${moviesData.length}`);
    console.log(`   📁 حجم الملف: ${(fs.statSync(filePath).size / 1024).toFixed(2)} كيلوبايت`);
    
    return filePath;
}

// دالة لحفظ كل فيلم في ملف منفصل
function saveEachMovieSeparately(moviesData) {
    let savedCount = 0;
    
    moviesData.forEach(movie => {
        if (movie && movie.id) {
            const movieFile = path.join(MOVIES_DIR, `movie_${movie.id}.json`);
            fs.writeFileSync(movieFile, JSON.stringify(movie, null, 2));
            savedCount++;
        }
    });
    
    console.log(`💾 تم حفظ ${savedCount} فيلم في مجلد movies/`);
    return savedCount;
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج جميع الأفلام من الصفحة الأولى");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    
    // جلب قائمة الأفلام من الصفحة الأولى (كلها)
    const movies = await fetchAllMoviesFromPage();
    
    if (movies.length === 0) {
        console.log("\n❌ لم يتم العثور على أفلام");
        return;
    }
    
    console.log(`\n✅ تم العثور على ${movies.length} فيلم في الصفحة الأولى`);
    
    // استخراج كل الأفلام
    const moviesData = [];
    const totalMovies = movies.length;
    
    for (let i = 0; i < movies.length; i++) {
        const movie = movies[i];
        
        console.log(`\n📊 التقدم: ${i + 1}/${totalMovies} (${Math.round(((i + 1) / totalMovies) * 100)}%)`);
        
        const movieData = await fetchSingleMovie(movie);
        
        if (movieData) {
            moviesData.push(movieData);
        }
        
        // تأخير بسيط بين الأفلام لتجنب حظر IP
        if (i < movies.length - 1) {
            console.log(`⏳ انتظار 2 ثانية قبل الفيلم التالي...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // 1. حفظ كل الأفلام في ملف واحد
    saveAllMoviesInOneFile(moviesData);
    
    // 2. حفظ كل فيلم في ملف منفصل
    saveEachMovieSeparately(moviesData);
    
    // 3. حفظ ملخص النتائج
    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        page: 1,
        totalMoviesFound: movies.length,
        totalMoviesSaved: moviesData.length,
        executionTime: Date.now() - performance.now(),
        movies: moviesData.map(m => ({
            id: m.id,
            title: m.title,
            imdbRating: m.imdbRating,
            hasWatchServer: !!m.watchServer,
            hasDownloadServers: !!m.downloadServers,
            detailsCount: Object.keys(m.details).length
        }))
    };
    
    fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
    
    // عرض النتائج النهائية
    console.log("\n" + "=".repeat(70));
    console.log("🎉 اكتمل استخراج جميع الأفلام بنجاح!");
    console.log("=".repeat(70));
    console.log(`📊 النتائج النهائية:`);
    console.log(`   🔗 الصفحة: https://topcinema.rip/movies/`);
    console.log(`   🎬 عدد الأفلام الموجودة: ${movies.length}`);
    console.log(`   ✅ عدد الأفلام المستخرجة: ${moviesData.length}`);
    console.log(`   ⏱️ الوقت المستغرق: تقريباً ${(movies.length * 5)} ثانية`);
    
    console.log(`\n💾 الملفات المحفوظة:`);
    console.log(`   📄 all_movies.json → جميع الأفلام في ملف واحد`);
    console.log(`   📁 movies/ → ${fs.readdirSync(MOVIES_DIR).length} ملف منفصل`);
    console.log(`   📄 result.json → ملخص النتائج`);
    
    console.log("\n📋 عينة من الأفلام المستخرجة:");
    const sampleSize = Math.min(3, moviesData.length);
    for (let i = 0; i < sampleSize; i++) {
        const movie = moviesData[i];
        console.log(`\n${i + 1}. ${movie.title}`);
        console.log(`   🆔 ID: ${movie.id}`);
        console.log(`   ⭐ IMDB: ${movie.imdbRating || "غير متوفر"}`);
        console.log(`   🎥 سيرفر مشاهدة: ${movie.watchServer ? "نعم" : "لا"}`);
        
        if (movie.downloadServers) {
            const totalServers = (movie.downloadServers.multiQuality?.length || 0) + 
                               Object.values(movie.downloadServers.byQuality || {}).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`   📥 سيرفرات تحميل: ${totalServers} سيرفر`);
        }
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("📝 يمكنك فتح الملفات التالية:");
    console.log("   - all_movies.json: جميع الأفلام في ملف واحد");
    console.log("   - result.json: ملخص النتائج");
    console.log("=".repeat(70));
}

// تشغيل البرنامج
main().catch(error => {
    console.error("\n💥 حدث خطأ غير متوقع:", error);
    console.error("تفاصيل الخطأ:", error.message);
    
    // حفظ الخطأ
    const errorResult = {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorResult, null, 2));
    
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
