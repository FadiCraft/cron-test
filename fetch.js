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

// دالة لجلب الأفلام من الصفحة الأولى
async function fetchFirstPage() {
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
        
        // البحث بطريقتين
        let movieElements = doc.querySelectorAll('.Small--Box a');
        
        if (movieElements.length === 0) {
            movieElements = doc.querySelectorAll('a[href*="/movie"], a[href*="/film"]');
            console.log("⚠️ استخدام طريقة بديلة للبحث");
        }
        
        console.log(`✅ وجدت ${movieElements.length} رابط أفلام`);
        
        // استخراج أول 5 أفلام فقط للاختبار
        const maxMovies = Math.min(5, movieElements.length);
        
        for (let i = 0; i < maxMovies; i++) {
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
    console.log(`   الرابط: ${movie.url}`);
    console.log(`   ID: ${movie.id}`);
    
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
        movies: moviesData
    };
    
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, JSON.stringify(allMovies, null, 2));
    
    console.log(`\n💾 تم حفظ جميع الأفلام في: ${filename}`);
    console.log(`   📊 عدد الأفلام: ${moviesData.length}`);
    
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

// دالة لعرض النتائج
function displayResults(movies, moviesData) {
    console.log("\n" + "=".repeat(70));
    console.log("📊 نتائج الاستخراج الكاملة:");
    console.log("=".repeat(70));
    
    console.log(`🔗 الصفحة: https://topcinema.rip/movies/`);
    console.log(`🎬 عدد الأفلام المستخرجة: ${movies.length}`);
    console.log(`✅ عدد الأفلام المحفوظة: ${moviesData.length}`);
    
    if (moviesData.length > 0) {
        console.log("\n📋 تفاصيل الأفلام:");
        moviesData.forEach((data, index) => {
            console.log(`\n${index + 1}. ${data.title}`);
            console.log(`   🆔 ID: ${data.id}`);
            console.log(`   ⭐ IMDB: ${data.imdbRating || "غير متوفر"}`);
            console.log(`   📖 القصة: ${data.story ? data.story.substring(0, 60) + "..." : "غير متوفر"}`);
            
            // عرض سيرفرات المشاهدة
            if (data.watchServer) {
                console.log(`   🎥 سيرفر المشاهدة: ${data.watchServer.type} - ${data.watchServer.url?.substring(0, 50)}...`);
            } else {
                console.log(`   🎥 سيرفر المشاهدة: غير متوفر`);
            }
            
            // عرض سيرفرات التحميل
            if (data.downloadServers) {
                const totalDownloadServers = 
                    (data.downloadServers.multiQuality?.length || 0) + 
                    Object.values(data.downloadServers.byQuality || {}).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`   📥 سيرفرات التحميل: ${totalDownloadServers} سيرفر`);
            } else {
                console.log(`   📥 سيرفرات التحميل: غير متوفر`);
            }
            
            console.log(`   🏷️ التفاصيل: ${Object.keys(data.details).length} حقل`);
        });
    }
    
    // حفظ ملف النتيجة
    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        page: 1,
        totalMoviesFound: movies.length,
        totalMoviesSaved: moviesData.length,
        movies: moviesData.map(m => ({
            id: m.id,
            title: m.title,
            imdbRating: m.imdbRating,
            hasWatchServer: !!m.watchServer,
            hasDownloadServers: !!m.downloadServers,
            detailsCount: Object.keys(m.details).length
        })),
        files: {
            all_movies: "all_movies.json",
            individual_movies: `movies/ (${moviesData.length} ملف)`
        }
    };
    
    fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
    
    console.log("\n💾 تم حفظ النتائج في الملفات:");
    console.log(`   📄 result.json - ملخص النتائج`);
    console.log(`   📄 all_movies.json - جميع الأفلام في ملف واحد`);
    console.log(`   📁 movies/ - كل فيلم في ملف منفصل`);
    console.log("=".repeat(70));
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج الصفحة الأولى مع سيرفرات المشاهدة والتحميل");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    
    // جلب قائمة الأفلام من الصفحة الأولى
    const movies = await fetchFirstPage();
    
    if (movies.length === 0) {
        console.log("\n❌ لم يتم العثور على أفلام");
        return;
    }
    
    console.log(`\n✅ تم العثور على ${movies.length} فيلم`);
    
    // استخراج كل فيلم
    const moviesData = [];
    
    for (const movie of movies) {
        const movieData = await fetchSingleMovie(movie);
        
        if (movieData) {
            moviesData.push(movieData);
        }
        
        // تأخير بسيط بين الأفلام
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // 1. حفظ كل الأفلام في ملف واحد
    saveAllMoviesInOneFile(moviesData);
    
    // 2. حفظ كل فيلم في ملف منفصل
    saveEachMovieSeparately(moviesData);
    
    // عرض النتائج
    displayResults(movies, moviesData);
    
    // ملخص نهائي
    console.log("\n🎉 اكتمل الاستخراج بنجاح!");
    console.log(`📁 الملفات المحفوظة:`);
    console.log(`   📄 all_movies.json → جميع الأفلام في ملف واحد`);
    console.log(`   📁 movies/ → ${fs.readdirSync(MOVIES_DIR).length} ملف منفصل`);
    console.log(`   📄 result.json → ملخص النتائج`);
    
    // عرض مثال من الملف الموحد
    console.log(`\n📋 مثال من all_movies.json:`);
    const allMovies = JSON.parse(fs.readFileSync("all_movies.json", "utf8"));
    console.log(`   أول فيلم: ${allMovies.movies[0]?.title}`);
    console.log(`   سيرفر مشاهدة: ${allMovies.movies[0]?.watchServer ? "نعم" : "لا"}`);
    console.log(`   سيرفرات تحميل: ${allMovies.movies[0]?.downloadServers ? "نعم" : "لا"}`);
}

// تشغيل البرنامج
main().catch(error => {
    console.error("\n💥 حدث خطأ غير متوقع:", error);
    
    // حفظ الخطأ
    const errorResult = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("result.json", JSON.stringify(errorResult, null, 2));
    
    console.log("❌ تم حفظ الخطأ في result.json");
    process.exit(1);
});
