import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        
        // البحث عن الروابط
        const movieElements = doc.querySelectorAll('.Small--Box a');
        
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

// دالة لاستخراج فيلم واحد
async function fetchSingleMovie(movie) {
    console.log(`\n🎬 استخراج الفيلم ${movie.index}: ${movie.title}`);
    
    try {
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
            page: 1,
            scrapedAt: new Date().toISOString()
        };
        
        console.log(`   ✅ تم استخراج الفيلم بنجاح`);
        if (watchServer) console.log(`   🎥 سيرفر مشاهدة: ${watchServer.type}`);
        if (downloadServers) {
            const totalServers = (downloadServers.multiQuality?.length || 0) + 
                               Object.values(downloadServers.byQuality || {}).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`   📥 سيرفرات تحميل: ${totalServers} سيرفر`);
        }
        
        return movieData;
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// الدالة الرئيسية
async function main() {
    console.log("🚀 بدء استخراج الأفلام في ملف واحد");
    console.log("⏱️ الوقت: " + new Date().toLocaleString());
    
    // جلب قائمة الأفلام من الصفحة الأولى
    const moviesList = await fetchFirstPage();
    
    if (moviesList.length === 0) {
        console.log("\n❌ لم يتم العثور على أفلام");
        return;
    }
    
    console.log(`\n✅ تم العثور على ${moviesList.length} فيلم`);
    
    // استخراج كل الأفلام
    const allMoviesData = [];
    
    for (const movie of moviesList) {
        const movieData = await fetchSingleMovie(movie);
        
        if (movieData) {
            allMoviesData.push(movieData);
        }
        
        // تأخير بسيط بين الأفلام
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // إنشاء كائن يحتوي كل الأفلام
    const moviesCollection = {
        metadata: {
            total: allMoviesData.length,
            page: 1,
            source: "https://topcinema.rip/movies/",
            scrapedAt: new Date().toISOString(),
            version: "1.0"
        },
        movies: allMoviesData
    };
    
    // حفظ كل الأفلام في ملف JSON واحد
    const outputFile = "movies.json";
    fs.writeFileSync(outputFile, JSON.stringify(moviesCollection, null, 2));
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 اكتمل الاستخراج بنجاح!");
    console.log("=".repeat(60));
    console.log(`📄 الملف النهائي: ${outputFile}`);
    console.log(`🎬 عدد الأفلام: ${allMoviesData.length}`);
    console.log(`💾 حجم الملف: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} كيلوبايت`);
    
    // عرض ملخص
    console.log("\n📋 ملخص الأفلام المستخرجة:");
    allMoviesData.forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title}`);
        console.log(`   🆔 ID: ${movie.id}`);
        console.log(`   ⭐ IMDB: ${movie.imdbRating || "غير متوفر"}`);
        console.log(`   🎥 سيرفر مشاهدة: ${movie.watchServer ? "نعم" : "لا"}`);
        
        if (movie.downloadServers) {
            const totalServers = (movie.downloadServers.multiQuality?.length || 0) + 
                               Object.values(movie.downloadServers.byQuality || {}).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`   📥 سيرفرات تحميل: ${totalServers} سيرفر`);
        } else {
            console.log(`   📥 سيرفرات تحميل: لا`);
        }
        console.log();
    });
    
    console.log("=".repeat(60));
    console.log(`📝 يمكنك فتح الملف ${outputFile} لرؤية كل البيانات`);
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
    
    fs.writeFileSync("error.json", JSON.stringify(errorResult, null, 2));
    
    console.log("❌ تم حفظ الخطأ في error.json");
    process.exit(1);
});
