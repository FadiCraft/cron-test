import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات
const MOVIES_DIR = path.join(__dirname, "movies");

// إنشاء مجلد movies فقط
if (!fs.existsSync(MOVIES_DIR)) {
    fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

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

// دالة لجلب جميع الأفلام من الصفحة الأولى
async function fetchAllMoviesFromPage(pageNum = 1) {
    const url = pageNum === 1 
        ? "https://topcinema.rip/movies/"
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    console.log(`\n📖 ===== جلب الصفحة ${pageNum} =====`);
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
        
        if (movieElements.length === 0) {
            console.log("⚠️ لم يتم العثور على أفلام باستخدام .Small--Box a");
            // محاولة بطريقة بديلة
            const altElements = doc.querySelectorAll('a[href*="/movie"]');
            console.log(`🔍 المحاولة البديلة وجدت: ${altElements.length} رابط`);
            movieElements = altElements;
        }
        
        console.log(`✅ وجدت ${movieElements.length} فيلم في الصفحة ${pageNum}`);
        
        // استخراج جميع الأفلام
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
                    page: pageNum,
                    position: i + 1
                });
                
                console.log(`  ${i + 1}. ${title.substring(0, 40)}...`);
            }
        }
        
        return movies;
        
    } catch (error) {
        console.error(`❌ خطأ في تحليل الصفحة ${pageNum}:`, error.message);
        return [];
    }
}

// دالة لاستخراج سيرفر المشاهدة
async function fetchWatchServer(watchPageUrl) {
    try {
        const html = await fetchPage(watchPageUrl);
        
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن meta tag للفيديو
        const videoMeta = doc.querySelector('meta[property="og:video"], meta[property="og:video:secure_url"]');
        
        if (videoMeta) {
            const videoUrl = videoMeta.getAttribute('content');
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
            return {
                type: "iframe",
                url: iframeSrc,
                source: "iframe"
            };
        }
        
        return null;
        
    } catch (error) {
        return null;
    }
}

// دالة لاستخراج سيرفرات التحميل
async function fetchDownloadServers(downloadPageUrl) {
    try {
        const html = await fetchPage(downloadPageUrl);
        
        if (!html) return null;
        
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const servers = {
            multiQuality: [],
            byQuality: {}
        };
        
        // سيرفرات متعددة الجودات
        const proServers = doc.querySelectorAll('.proServer a');
        
        proServers.forEach(server => {
            const name = cleanText(server.querySelector('p')?.textContent) || "غير معروف";
            const url = server.href;
            
            servers.multiQuality.push({
                name: name,
                url: url,
                type: "multi_quality"
            });
        });
        
        // سيرفرات حسب الجودة
        const downloadBlocks = doc.querySelectorAll('.DownloadBlock');
        
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
        });
        
        return servers;
        
    } catch (error) {
        return null;
    }
}

// دالة لاستخراج فيلم واحد مع التفاصيل
async function fetchSingleMovieDetails(movie) {
    try {
        console.log(`\n🎬 استخراج الفيلم ${movie.position}: ${movie.title.substring(0, 30)}...`);
        
        const html = await fetchPage(movie.url);
        
        if (!html) {
            console.log(`   ⚠️ فشل جلب صفحة الفيلم`);
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
            console.log(`   🎥 جاري استخراج سيرفر المشاهدة...`);
            watchServer = await fetchWatchServer(watchPageUrl);
        }
        
        // استخراج سيرفرات التحميل
        if (downloadPageUrl) {
            console.log(`   📥 جاري استخراج سيرفرات التحميل...`);
            downloadServers = await fetchDownloadServers(downloadPageUrl);
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
            page: movie.page,
            position: movie.position,
            scrapedAt: new Date().toISOString()
        };
        
        console.log(`   ✅ تم استخراج الفيلم بنجاح`);
        
        return movieData;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج الفيلم: ${error.message}`);
        return null;
    }
}

// دالة لحفظ جميع أفلام الصفحة في ملف JSON واحد
function savePageMoviesToFile(pageNum, moviesData, pageUrl) {
    const fileName = `${pageNum}.json`; // 1.json, 2.json, 3.json
    const filePath = path.join(MOVIES_DIR, fileName);
    
    const pageData = {
        page: pageNum,
        url: pageUrl,
        totalMovies: moviesData.length,
        scrapedAt: new Date().toISOString(),
        movies: moviesData
    };
    
    fs.writeFileSync(filePath, JSON.stringify(pageData, null, 2));
    
    console.log(`\n💾 تم حفظ الصفحة ${pageNum} في: movies/${fileName}`);
    console.log(`   📊 عدد الأفلام: ${moviesData.length}`);
    console.log(`   📁 حجم الملف: ${(fs.statSync(filePath).size / 1024).toFixed(2)} كيلوبايت`);
    
    return filePath;
}

// دالة لحفظ ملخص النتائج
function saveSummary(pageNum, moviesFound, moviesExtracted, executionTime) {
    const summary = {
        success: true,
        lastRun: new Date().toISOString(),
        lastPageProcessed: pageNum,
        moviesFound: moviesFound,
        moviesExtracted: moviesExtracted,
        successRate: moviesExtracted > 0 ? ((moviesExtracted / moviesFound) * 100).toFixed(1) + "%" : "0%",
        executionTime: executionTime + "ms",
        files: {
            movies: fs.readdirSync(MOVIES_DIR).filter(f => f.endsWith('.json')).map(f => `movies/${f}`)
        }
    };
    
    fs.writeFileSync("summary.json", JSON.stringify(summary, null, 2));
    
    console.log(`\n📄 تم حفظ الملخص في: summary.json`);
    return summary;
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج الأفلام في ملف واحد لكل صفحة");
    console.log("📁 سيتم حفظ الملفات في مجلد movies/");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    
    const startTime = Date.now();
    const pageNum = 1; // يمكنك تغيير هذا لاستخراج صفحات أخرى
    
    // 1. جلب قائمة الأفلام من الصفحة
    const moviesList = await fetchAllMoviesFromPage(pageNum);
    
    if (moviesList.length === 0) {
        console.log("\n❌ لم يتم العثور على أفلام في هذه الصفحة");
        return;
    }
    
    console.log(`\n✅ تم العثور على ${moviesList.length} فيلم في الصفحة ${pageNum}`);
    
    // 2. استخراج تفاصيل كل الأفلام
    const moviesData = [];
    
    for (let i = 0; i < moviesList.length; i++) {
        const movie = moviesList[i];
        
        console.log(`\n📊 التقدم: ${i + 1}/${moviesList.length} (${Math.round(((i + 1) / moviesList.length) * 100)}%)`);
        
        const movieDetails = await fetchSingleMovieDetails(movie);
        
        if (movieDetails) {
            moviesData.push(movieDetails);
        }
        
        // تأخير بين الأفلام لتجنب حظر IP
        if (i < moviesList.length - 1) {
            console.log(`⏳ انتظار 1.5 ثانية قبل الفيلم التالي...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    // 3. حفظ جميع أفلام الصفحة في ملف JSON واحد
    const pageUrl = pageNum === 1 
        ? "https://topcinema.rip/movies/" 
        : `https://topcinema.rip/movies/page/${pageNum}/`;
    
    savePageMoviesToFile(pageNum, moviesData, pageUrl);
    
    // 4. حفظ ملخص النتائج
    const executionTime = Date.now() - startTime;
    saveSummary(pageNum, moviesList.length, moviesData.length, executionTime);
    
    // 5. عرض النتائج النهائية
    console.log("\n" + "=".repeat(70));
    console.log("🎉 اكتمل استخراج الصفحة بنجاح!");
    console.log("=".repeat(70));
    
    console.log(`📊 النتائج النهائية:`);
    console.log(`   🔗 الصفحة: ${pageUrl}`);
    console.log(`   🎬 عدد الأفلام الموجودة: ${moviesList.length}`);
    console.log(`   ✅ عدد الأفلام المستخرجة: ${moviesData.length}`);
    console.log(`   ⏱️ الوقت المستغرق: ${(executionTime / 1000).toFixed(1)} ثانية`);
    
    console.log(`\n💾 الملفات المحفوظة:`);
    console.log(`   📄 movies/${pageNum}.json → جميع أفلام الصفحة ${pageNum}`);
    console.log(`   📄 summary.json → ملخص النتائج`);
    
    console.log("\n📋 عينة من الأفلام المستخرجة:");
    const sampleSize = Math.min(3, moviesData.length);
    for (let i = 0; i < sampleSize; i++) {
        const movie = moviesData[i];
        console.log(`\n${i + 1}. ${movie.title}`);
        console.log(`   🆔 ID: ${movie.id}`);
        console.log(`   ⭐ IMDB: ${movie.imdbRating || "غير متوفر"}`);
        console.log(`   🎥 سيرفر مشاهدة: ${movie.watchServer ? "✅" : "❌"}`);
        
        if (movie.downloadServers) {
            const totalServers = (movie.downloadServers.multiQuality?.length || 0) + 
                               Object.values(movie.downloadServers.byQuality || {}).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`   📥 سيرفرات تحميل: ${totalServers} سيرفر`);
        } else {
            console.log(`   📥 سيرفرات تحميل: ❌`);
        }
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("📝 يمكنك فتح الملفات التالية:");
    console.log(`   - movies/${pageNum}.json: جميع أفلام الصفحة ${pageNum}`);
    console.log(`   - summary.json: ملخص النتائج`);
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
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorResult, null, 2));
    
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
