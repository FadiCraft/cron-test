import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعدادات المسارات
const FOOTBALL_DIR = path.join(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

// إنشاء مجلد football إذا لم يكن موجوداً
if (!fs.existsSync(FOOTBALL_DIR)) {
    fs.mkdirSync(FOOTBALL_DIR, { recursive: true });
}

// ==================== دالة مساعدة للكشف عن نوع السيرفر ====================
function detectServerType(url) {
    if (!url) return "غير معروف";
    
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes("albaplayer")) return "AlbaPlayer";
    if (urlLower.includes("streamtape")) return "StreamTape";
    if (urlLower.includes("doodstream") || urlLower.includes("/dood/")) return "DoodStream";
    if (urlLower.includes("voe")) return "Voe";
    if (urlLower.includes("vidcloud")) return "VidCloud";
    if (urlLower.includes("koora")) return "Koora";
    if (urlLower.includes("on-time") || urlLower.includes("ontime")) return "OnTime";
    if (urlLower.includes("streamable")) return "Streamable";
    if (urlLower.includes("mixdrop")) return "MixDrop";
    if (urlLower.includes("vidoza")) return "Vidoza";
    if (urlLower.includes("upstream")) return "UpStream";
    if (urlLower.includes("player") && (urlLower.includes("stream") || urlLower.includes("play"))) return "Player";
    if (urlLower.includes(".m3u8")) return "M3U8";
    if (urlLower.includes(".mp4")) return "MP4";
    if (urlLower.includes("kk.pyxq.online")) return "KoraPlus";
    if (urlLower.includes("gomatch")) return "GoMatch";
    if (urlLower.includes("youtube") || urlLower.includes("youtu.be")) return "YouTube";
    if (urlLower.includes("facebook") || urlLower.includes("fb.watch")) return "Facebook";
    if (urlLower.includes("twitch")) return "Twitch";
    
    return "غير معروف";
}

// ==================== استخراج سيرفرات المشاهدة باستخدام Puppeteer ====================
async function fetchWatchServersWithPuppeteer(matchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة من: ${matchUrl}`);
    console.log(`   🔍 استخدام Puppeteer لمحاكاة المتصفح...`);
    
    let browser = null;
    
    try {
        // تشغيل المتصفح
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
        
        const page = await browser.newPage();
        
        // تعيين User Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // مراقبة طلبات الشبكة لاكتشاف روابط البث
        const streamUrls = new Set();
        
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            // تسجيل طلبات .m3u8 و .mp4
            if (url.includes('.m3u8') || url.includes('.mp4')) {
                streamUrls.add(url);
                console.log(`   📡 طلب بث مباشر: ${url.substring(0, 100)}...`);
            }
            request.continue();
        });
        
        // الذهاب إلى الصفحة
        console.log(`   🌐 تحميل الصفحة...`);
        await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // انتظار 5 ثواني للـ JavaScript
        console.log(`   ⏳ انتظار 5 ثواني لتحميل JavaScript...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // محاكاة حدث التمرير لتحميل الـ iframe
        console.log(`   📜 محاكاة التمرير لتحميل الـ iframe...`);
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });
        
        // انتظار ثانيتين بعد التمرير
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // استخراج جميع الـ iframes
        const iframesData = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            const results = [];
            
            iframes.forEach(iframe => {
                const src = iframe.getAttribute('src');
                if (src && src.trim() !== '') {
                    results.push({
                        src: src,
                        width: iframe.width,
                        height: iframe.height,
                        id: iframe.id
                    });
                }
            });
            
            return results;
        });
        
        console.log(`   🔍 تم العثور على ${iframesData.length} iframe`);
        
        // استخراج محتوى الصفحة للبحث عن روابط في الـ script
        const scriptsContent = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script');
            return Array.from(scripts).map(s => s.textContent || s.innerHTML).join('\n');
        });
        
        // البحث عن روابط مباشرة في محتوى الصفحة
        const servers = [];
        const processedUrls = new Set();
        
        // إضافة روابط الـ iframe
        for (const iframeData of iframesData) {
            const fullUrl = iframeData.src;
            
            if (processedUrls.has(fullUrl)) continue;
            processedUrls.add(fullUrl);
            
            console.log(`   🔍 وجد iframe: ${fullUrl.substring(0, 100)}...`);
            
            // محاولة فتح الـ iframe في صفحة جديدة للحصول على الرابط النهائي
            try {
                const iframePage = await browser.newPage();
                await iframePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                console.log(`   🔍 فتح iframe: ${fullUrl.substring(0, 80)}...`);
                
                // مراقبة طلبات الشبكة في الـ iframe
                const iframeStreamUrls = new Set();
                await iframePage.setRequestInterception(true);
                iframePage.on('request', request => {
                    const url = request.url();
                    if (url.includes('.m3u8') || url.includes('.mp4')) {
                        iframeStreamUrls.add(url);
                        console.log(`   📡 رابط بث في iframe: ${url.substring(0, 100)}...`);
                    }
                    request.continue();
                });
                
                await iframePage.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // البحث في محتوى الـ iframe عن روابط
                const iframeContent = await iframePage.content();
                
                // البحث عن روابط مباشرة في محتوى الـ iframe
                const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
                const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g;
                
                let match;
                while ((match = m3u8Regex.exec(iframeContent)) !== null) {
                    const url = match[1];
                    if (!processedUrls.has(url)) {
                        processedUrls.add(url);
                        servers.push({
                            type: 'direct',
                            url: url,
                            quality: "HD",
                            server: 'M3U8',
                            id: `m3u8_${servers.length + 1}`,
                            source: 'iframe_content'
                        });
                    }
                }
                
                while ((match = mp4Regex.exec(iframeContent)) !== null) {
                    const url = match[1];
                    if (!processedUrls.has(url)) {
                        processedUrls.add(url);
                        servers.push({
                            type: 'direct',
                            url: url,
                            quality: "HD",
                            server: 'MP4',
                            id: `mp4_${servers.length + 1}`,
                            source: 'iframe_content'
                        });
                    }
                }
                
                // إضافة روابط البث المباشر التي تم رصدها
                for (const url of iframeStreamUrls) {
                    if (!processedUrls.has(url)) {
                        processedUrls.add(url);
                        servers.push({
                            type: 'direct',
                            url: url,
                            quality: "HD",
                            server: url.includes('.m3u8') ? 'M3U8' : 'MP4',
                            id: `stream_${servers.length + 1}`,
                            source: 'network_request'
                        });
                    }
                }
                
                // إذا لم نجد رابطاً مباشراً، نضيف رابط الـ iframe نفسه
                if (servers.length === 0) {
                    const serverType = detectServerType(fullUrl);
                    servers.push({
                        type: 'iframe',
                        url: fullUrl,
                        quality: "HD",
                        server: serverType,
                        id: `iframe_${servers.length + 1}`,
                        source: 'iframe_direct'
                    });
                }
                
                await iframePage.close();
                
            } catch (error) {
                console.log(`   ⚠️ خطأ في فتح iframe: ${error.message}`);
                // نضيف رابط الـ iframe كخيار
                const serverType = detectServerType(fullUrl);
                servers.push({
                    type: 'iframe',
                    url: fullUrl,
                    quality: "HD",
                    server: serverType,
                    id: `iframe_${servers.length + 1}`,
                    source: 'iframe_fallback'
                });
            }
        }
        
        // البحث في محتوى الـ scripts عن روابط
        const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
        const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g;
        
        let match;
        while ((match = m3u8Regex.exec(scriptsContent)) !== null) {
            const url = match[1];
            if (!processedUrls.has(url)) {
                processedUrls.add(url);
                servers.push({
                    type: 'direct',
                    url: url,
                    quality: "HD",
                    server: 'M3U8',
                    id: `m3u8_script_${servers.length + 1}`,
                    source: 'script'
                });
            }
        }
        
        while ((match = mp4Regex.exec(scriptsContent)) !== null) {
            const url = match[1];
            if (!processedUrls.has(url)) {
                processedUrls.add(url);
                servers.push({
                    type: 'direct',
                    url: url,
                    quality: "HD",
                    server: 'MP4',
                    id: `mp4_script_${servers.length + 1}`,
                    source: 'script'
                });
            }
        }
        
        // إضافة روابط البث المباشر من طلبات الشبكة
        for (const url of streamUrls) {
            if (!processedUrls.has(url)) {
                processedUrls.add(url);
                servers.push({
                    type: 'direct',
                    url: url,
                    quality: "HD",
                    server: url.includes('.m3u8') ? 'M3U8' : 'MP4',
                    id: `network_${servers.length + 1}`,
                    source: 'network'
                });
            }
        }
        
        await browser.close();
        
        if (servers.length > 0) {
            console.log(`   📊 تم العثور على ${servers.length} سيرفر مشاهدة`);
            
            // ترتيب السيرفرات: المباشرة أولاً
            servers.sort((a, b) => {
                if (a.type === 'direct' && b.type !== 'direct') return -1;
                if (a.type !== 'direct' && b.type === 'direct') return 1;
                return 0;
            });
            
            servers.forEach((server, index) => {
                console.log(`   ${index + 1}. ${server.server} (${server.type}): ${server.url.substring(0, 100)}...`);
            });
            
            return servers.slice(0, 5);
        } else {
            console.log(`   ⚠️ لم يتم العثور على أي سيرفرات مشاهدة`);
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج السيرفرات: ${error.message}`);
        if (browser) await browser.close();
        return null;
    }
}

// ==================== استخراج المباريات من الصفحة الرئيسية ====================
async function fetchMatchesFromPage(pageNum = 1) {
    const baseUrl = "https://koraplus.blog/";
    const url = pageNum === 1 ? baseUrl : `${baseUrl}page/${pageNum}/`;
    
    console.log(`\n📄 الصفحة ${pageNum}: ${url}`);
    
    // نستخدم fetch العادي للصفحة الرئيسية لأنها لا تحتاج JavaScript
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المباريات`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const matches = [];
        
        // البحث عن جميع عناصر المباريات
        const matchElements = doc.querySelectorAll('.match-container');
        
        console.log(`✅ وجد ${matchElements.length} عنصر مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة
                const matchLink = element.querySelector('a');
                let matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    continue;
                }
                
                // التأكد من أن الرابط كامل
                if (!matchUrl.startsWith('http')) {
                    matchUrl = new URL(matchUrl, baseUrl).href;
                }
                
                // استخراج أسماء الفريقين
                const team1NameElem = element.querySelector('.right-team .team-name');
                const team2NameElem = element.querySelector('.left-team .team-name');
                
                let team1Name = team1NameElem ? team1NameElem.textContent.trim() : "غير معروف";
                let team2Name = team2NameElem ? team2NameElem.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفريقين
                const team1Img = element.querySelector('.right-team img');
                const team2Img = element.querySelector('.left-team img');
                
                let team1Logo = team1Img ? team1Img.getAttribute('src') || team1Img.getAttribute('data-src') : null;
                let team2Logo = team2Img ? team2Img.getAttribute('src') || team2Img.getAttribute('data-src') : null;
                
                // استخراج النتيجة والوقت
                let team1Score = "0";
                let team2Score = "0";
                let score = "0 - 0";
                let matchTime = "غير معروف";
                
                const resultElement = element.querySelector('.match-timing .result');
                const timeElement = element.querySelector('.match-timing div:not(.result):not(.date)');
                
                if (resultElement) {
                    const resultText = resultElement.textContent.trim();
                    const scores = resultText.split('-');
                    if (scores.length === 2) {
                        team1Score = scores[0].trim();
                        team2Score = scores[1].trim();
                        score = resultText;
                    }
                }
                
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.match-timing .date');
                if (statusElement) {
                    const statusText = statusElement.textContent.trim();
                    if (statusText === "جارية الان") {
                        matchStatus = "جارية الآن";
                    } else if (statusText === "لم تبدأ بعد") {
                        matchStatus = "لم تبدأ بعد";
                    } else if (statusText === "انتهت المباراة") {
                        matchStatus = "انتهت";
                    } else {
                        matchStatus = statusText;
                    }
                }
                
                // استخراج القنوات والبطولة
                const channels = [];
                let tournament = "غير محدد";
                
                const channelItems = element.querySelectorAll('.match-info li span');
                channelItems.forEach((item, idx) => {
                    const text = item.textContent.trim();
                    if (text && text !== "غير معروف") {
                        if (idx < 2) {
                            channels.push(text);
                        } else if (idx === 2) {
                            tournament = text;
                        }
                    }
                });
                
                // تنظيف البطولة
                if (tournament.includes(',')) {
                    tournament = tournament.split(',').slice(1).join(',').trim();
                }
                
                // إنشاء كائن المباراة
                const matchId = `match_${Date.now()}_${index}`;
                const match = {
                    id: matchId,
                    url: matchUrl,
                    title: `${team1Name} vs ${team2Name}`,
                    team1: {
                        name: team1Name,
                        logo: team1Logo,
                        score: team1Score
                    },
                    team2: {
                        name: team2Name,
                        logo: team2Logo,
                        score: team2Score
                    },
                    score: score,
                    time: matchTime,
                    status: matchStatus,
                    channels: channels,
                    tournament: tournament,
                    page: pageNum,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    watchServers: null
                };
                
                matches.push(match);
                
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                console.log(`     النتيجة: ${score} | الوقت: ${matchTime}`);
                console.log(`     البطولة: ${tournament}`);
                console.log(`     الرابط: ${matchUrl.substring(0, 80)}...`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في استخراج مباراة ${index + 1}: ${error.message}`);
            }
        }
        
        console.log(`🎯 تم استخراج ${matches.length} مباراة`);
        
        return {
            url: url,
            matches: matches,
            totalMatches: matches.length,
            page: pageNum,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل صفحة المباريات: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل المباريات ====================
async function fetchMatchesDetails(matches) {
    console.log(`\n🔍 جلب تفاصيل ${matches.length} مباراة...`);
    
    const matchesWithDetails = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title} (${match.status})`);
        console.log(`   🔗 الرابط: ${match.url.substring(0, 80)}...`);
        
        // محاولة استخراج سيرفرات المشاهدة للمباريات الجارية أو القادمة
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            try {
                // استخدام Puppeteer للمباريات التي تحتاج JavaScript
                const watchServers = await fetchWatchServersWithPuppeteer(match.url);
                
                const matchWithDetails = {
                    ...match,
                    watchServers: watchServers
                };
                
                matchesWithDetails.push(matchWithDetails);
                
                if (watchServers && watchServers.length > 0) {
                    console.log(`   ✅ تم العثور على ${watchServers.length} سيرفر مشاهدة`);
                } else {
                    console.log(`   ⚠️ لا يوجد سيرفر مشاهدة متاح`);
                }
                
            } catch (error) {
                console.log(`   ❌ خطأ في استخراج سيرفر المشاهدة: ${error.message}`);
                
                const matchWithDetails = {
                    ...match,
                    watchServers: null
                };
                
                matchesWithDetails.push(matchWithDetails);
            }
        } else {
            const matchWithDetails = {
                ...match,
                watchServers: null
            };
            
            matchesWithDetails.push(matchWithDetails);
            console.log(`   ⏭️ ${match.status} - لا توجد سيرفرات مشاهدة`);
        }
        
        // انتظار قصير بين المباريات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return matchesWithDetails;
}

// ==================== دالة fetch بسيطة مع timeout ====================
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        return null;
    }
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(data) {
    try {
        const cleanData = data.map(match => {
            const cleanMatch = { ...match };
            
            // تنظيف القنوات
            if (cleanMatch.channels && Array.isArray(cleanMatch.channels)) {
                cleanMatch.channels = cleanMatch.channels.filter(channel => 
                    channel && channel.trim() !== "" && channel !== "غير معروف"
                );
            }
            
            // تنظيف البطولة
            if (cleanMatch.tournament === "غير معروف" || !cleanMatch.tournament) {
                cleanMatch.tournament = "غير محدد";
            }
            
            return cleanMatch;
        });
        
        const outputData = {
            scrapedAt: new Date().toISOString(),
            source: "https://koraplus.blog/",
            totalMatches: cleanData.length,
            matches: cleanData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${cleanData.length}`);
        console.log(`💾 حجم الملف: ${fileSizeKB} كيلوبايت`);
        
        return outputData;
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج المباريات من koraplus.blog");
    console.log("=".repeat(60));
    
    try {
        // التحقق من تثبيت Puppeteer
        try {
            await puppeteer.version();
        } catch (error) {
            console.log("❌ Puppeteer غير مثبت. قم بتشغيل: npm install puppeteer");
            return { success: false, error: "Puppeteer not installed" };
        }
        
        const pageData = await fetchMatchesFromPage(1);
        
        if (!pageData || pageData.matches.length === 0) {
            console.log("\n❌ لم يتم العثور على أي مباريات");
            
            const errorData = {
                error: "لم يتم العثور على مباريات",
                scrapedAt: new Date().toISOString(),
                totalMatches: 0,
                matches: []
            };
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(errorData, null, 2));
            return { success: false, total: 0 };
        }
        
        const matchesWithDetails = await fetchMatchesDetails(pageData.matches);
        const savedData = saveToHgFile(matchesWithDetails);
        
        if (savedData) {
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            return { success: true, total: savedData.matches.length };
        }
        
        return { success: false, total: 0 };
        
    } catch (error) {
        console.error(`\n💥 خطأ غير متوقع: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// التشغيل
if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(result => {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`النتيجة: ${result.success ? '✅ ناجح' : '❌ فاشل'}`);
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
