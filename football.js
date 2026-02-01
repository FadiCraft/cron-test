import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
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
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Referer': 'https://www.yalla-shootu.live/',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`   ⚠️ استجابة غير ناجحة: ${response.status}`);
            return null;
        }
        
        return await response.text();
        
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.log(`   ⏱️ انتهى الوقت: ${url}`);
        } else {
            console.log(`   ❌ خطأ في جلب الصفحة: ${error.message}`);
        }
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة - الإصلاح هنا ====================
async function fetchWatchServers(matchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة من: ${matchUrl}`);
    
    const html = await fetchWithTimeout(matchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المباراة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        console.log(`   🔍 البحث عن سيرفرات المشاهدة...`);
        
        // الطريقة 1: البحث عن جميع iframes
        const allIframes = doc.querySelectorAll('iframe');
        console.log(`   📊 وجد ${allIframes.length} iframe`);
        
        allIframes.forEach((iframe, index) => {
            const src = iframe.getAttribute('src');
            if (src) {
                let serverName = "سيرفر غير معروف";
                let quality = "متوسط";
                
                // تحليل أنواع السيرفرات المختلفة للموقع الجديد
                if (src.includes("albaplayer")) serverName = "AlbaPlayer";
                else if (src.includes("streamtape")) serverName = "StreamTape";
                else if (src.includes("dood")) serverName = "DoodStream";
                else if (src.includes("voe")) serverName = "Voe";
                else if (src.includes("vidcloud")) serverName = "VidCloud";
                else if (src.includes("stream")) serverName = "Stream";
                else if (src.includes("video")) serverName = "Video Server";
                else if (src.includes("yalla-shoot")) serverName = "YallaShoot";
                
                // تحديد الجودة من السمة data-quality أو class
                const dataQuality = iframe.getAttribute('data-quality');
                if (dataQuality) quality = dataQuality;
                else if (iframe.className.includes('hd')) quality = "HD";
                else if (iframe.className.includes('full')) quality = "FULL HD";
                
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: quality,
                    server: serverName,
                    id: `iframe_${index + 1}`
                });
                
                console.log(`     • ${serverName}: ${src.substring(0, 60)}...`);
            }
        });
        
        // الطريقة 2: البحث عن عناصر embed
        const embedElements = doc.querySelectorAll('embed[src], object[data]');
        embedElements.forEach((embed, index) => {
            const src = embed.getAttribute('src') || embed.getAttribute('data');
            if (src) {
                watchServers.push({
                    type: 'embed',
                    url: src,
                    quality: "متوسط",
                    server: "Embed Player",
                    id: `embed_${index + 1}`
                });
                
                console.log(`     • Embed: ${src.substring(0, 60)}...`);
            }
        });
        
        // الطريقة 3: البحث عن عناصر video
        const videoElements = doc.querySelectorAll('video source[src]');
        videoElements.forEach((source, index) => {
            const src = source.getAttribute('src');
            if (src) {
                watchServers.push({
                    type: 'video',
                    url: src,
                    quality: "متوسط",
                    server: "Video Stream",
                    id: `video_${index + 1}`
                });
                
                console.log(`     • Video: ${src.substring(0, 60)}...`);
            }
        });
        
        // الطريقة 4: البحث عن روابط في scripts (للسيرفرات الديناميكية)
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const scriptContent = script.textContent;
            if (scriptContent) {
                // البحث عن روابط سيرفرات شائعة في scripts
                const serverPatterns = [
                    /https?:\/\/[^"\s]*(?:albaplayer|streamtape|dood|voe|vidcloud|yalla-shoot)[^"\s]*/gi,
                    /src\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/gi,
                    /embed\s*['"]?([^'"\s]+)['"]?/gi
                ];
                
                serverPatterns.forEach(pattern => {
                    const matches = scriptContent.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            let cleanUrl = match.replace(/src\s*[:=]\s*['"]|['"]$/g, '').trim();
                            if (cleanUrl.startsWith('http') && !watchServers.some(s => s.url === cleanUrl)) {
                                watchServers.push({
                                    type: 'script',
                                    url: cleanUrl,
                                    quality: "غير معروف",
                                    server: "Dynamic Server",
                                    id: `script_${watchServers.length + 1}`
                                });
                                
                                console.log(`     • Script: ${cleanUrl.substring(0, 60)}...`);
                            }
                        });
                    }
                });
            }
        });
        
        // إزالة التكرارات
        const uniqueServers = [];
        const seenUrls = new Set();
        
        watchServers.forEach(server => {
            if (server.url && !seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        if (uniqueServers.length > 0) {
            console.log(`   ✅ عثر على ${uniqueServers.length} سيرفر مشاهدة`);
            
            // ترتيب السيرفرات حسب الأولوية
            const orderedServers = uniqueServers.sort((a, b) => {
                const priority = {
                    'albaplayer': 1,
                    'streamtape': 2,
                    'dood': 3,
                    'voe': 4,
                    'vidcloud': 5,
                    'yalla-shoot': 6,
                    'stream': 7,
                    'video': 8,
                    'embed': 9,
                    'script': 10
                };
                
                const aPriority = priority[Object.keys(priority).find(key => a.server.toLowerCase().includes(key) || a.url.includes(key))] || 99;
                const bPriority = priority[Object.keys(priority).find(key => b.server.toLowerCase().includes(key) || b.url.includes(key))] || 99;
                
                return aPriority - bPriority;
            });
            
            return orderedServers;
        } else {
            console.log(`   ⚠️ لم يتم العثور على سيرفرات مشاهدة مباشرة`);
            
            // محاولة العثور على روابط بديلة في الصفحة
            const allLinks = doc.querySelectorAll('a[href*="stream"], a[href*="watch"], a[href*="live"]');
            const alternativeServers = [];
            
            allLinks.forEach((link, index) => {
                const href = link.getAttribute('href');
                const text = link.textContent.trim();
                
                if (href && href.includes('http')) {
                    alternativeServers.push({
                        type: 'link',
                        url: href,
                        quality: "غير معروف",
                        server: text || "رابط بديل",
                        id: `link_${index + 1}`
                    });
                    
                    console.log(`     • رابط بديل: ${text || "بدون اسم"} - ${href.substring(0, 50)}...`);
                }
            });
            
            if (alternativeServers.length > 0) {
                console.log(`   ⚠️ وجد ${alternativeServers.length} رابط بديل (ليس سيرفرات مباشرة)`);
                return alternativeServers;
            }
            
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
        return null;
    }
}

// ==================== دالة مساعدة لاستخراج الصور ====================
function extractImageUrl(imgElement) {
    if (!imgElement) return null;
    
    const src = imgElement.getAttribute('src');
    const dataSrc = imgElement.getAttribute('data-src');
    
    if (src && src.startsWith('http')) return src;
    if (src && !src.startsWith('http') && src.includes('wp-content')) {
        return `https://www.yalla-shootu.live${src.startsWith('/') ? '' : '/'}${src}`;
    }
    
    if (dataSrc && dataSrc.startsWith('http')) return dataSrc;
    if (dataSrc && !dataSrc.startsWith('http') && dataSrc.includes('wp-content')) {
        return `https://www.yalla-shootu.live${dataSrc.startsWith('/') ? '' : '/'}${dataSrc}`;
    }
    
    // إذا كان base64، نتخطاه
    if (src && src.startsWith('data:image')) return null;
    
    return null;
}

// ==================== استخراج المباريات من الصفحة - تم التعديل للموقع الجديد ====================
async function fetchMatchesFromPage(pageNum = 1) {
    const baseUrl = "https://www.yalla-shootu.live/";
    const url = pageNum === 1 ? baseUrl : `${baseUrl}page/${pageNum}/`;
    
    console.log(`\n📄 الصفحة ${pageNum}: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المباريات`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const matches = [];
        
        // البحث عن جميع عناصر المباريات - تم التعديل هنا
        const matchElements = doc.querySelectorAll('.AY_Match');
        
        console.log(`✅ وجد ${matchElements.length} عنصر مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة من العنصر
                const matchLink = element.querySelector('a[href*="matches"], a[href*="sia-me"]');
                const matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    continue;
                }
                
                // استخراج أسماء الفريقين - حسب هيكل الموقع الجديد
                const team1NameElem = element.querySelector('.TM1 .TM_Name');
                const team2NameElem = element.querySelector('.TM2 .TM_Name');
                
                let team1Name = team1NameElem ? team1NameElem.textContent.trim() : "غير معروف";
                let team2Name = team2NameElem ? team2NameElem.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفريقين
                const team1Img = element.querySelector('.TM1 img');
                const team2Img = element.querySelector('.TM2 img');
                
                let team1Logo = extractImageUrl(team1Img);
                let team2Logo = extractImageUrl(team2Img);
                
                // استخراج النتيجة - حسب هيكل الموقع الجديد
                let team1Score = "0";
                let team2Score = "0";
                let score = "0 - 0";
                
                const goals = element.querySelectorAll('.RS-goals');
                if (goals.length >= 2) {
                    team1Score = goals[0].textContent.trim();
                    team2Score = goals[1].textContent.trim();
                    score = `${team1Score} - ${team2Score}`;
                }
                
                // استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = element.querySelector('.MT_Time');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // استخراج حالة المباراة - تم التعديل هنا
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.MT_Stat');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                } else {
                    // تحديد الحالة من الكلاس
                    if (element.classList.contains('live')) matchStatus = "جارية الآن";
                    else if (element.classList.contains('not-started')) matchStatus = "لم تبدأ بعد";
                    else if (element.classList.contains('finished')) matchStatus = "انتهت";
                }
                
                // استخراج القنوات - حسب هيكل الموقع الجديد
                const channels = [];
                const channelItems = element.querySelectorAll('.MT_Info li span');
                channelItems.forEach(item => {
                    const channelName = item.textContent.trim();
                    if (channelName && channelName !== "غير معروف") {
                        channels.push(channelName);
                    }
                });
                
                // استخراج البطولة (العنصر الثالث في القائمة)
                let tournament = "غير محدد";
                if (channels.length >= 3) {
                    tournament = channels[2];
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
                    channels: channels.slice(0, 2), // أول عنصرين فقط هم القنوات
                    tournament: tournament,
                    page: pageNum,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    watchServers: null // سيتم تعبئتها لاحقاً
                };
                
                matches.push(match);
                
                // عرض تفاصيل الاستخراج
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                console.log(`     النتيجة: ${score} | الوقت: ${matchTime}`);
                
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

// ==================== استخراج تفاصيل المباريات - الإصلاح هنا ====================
async function fetchMatchesDetails(matches) {
    console.log(`\n🔍 جلب تفاصيل ${matches.length} مباراة...`);
    
    const matchesWithDetails = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title} (${match.status})`);
        
        // محاولة استخراج سيرفرات المشاهدة للمباريات الجارية أو القادمة
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            try {
                console.log(`   🔍 محاولة استخراج سيرفرات المشاهدة...`);
                const watchServers = await fetchWatchServers(match.url);
                
                const matchWithDetails = {
                    ...match,
                    watchServers: watchServers
                };
                
                matchesWithDetails.push(matchWithDetails);
                
                if (watchServers && watchServers.length > 0) {
                    console.log(`   ✅ ${watchServers.length} سيرفر مشاهدة`);
                } else {
                    console.log(`   ⚠️ لا توجد سيرفرات مشاهدة`);
                }
                
            } catch (error) {
                console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
                
                // إضافة المباراة بدون سيرفرات
                const matchWithDetails = {
                    ...match,
                    watchServers: null
                };
                
                matchesWithDetails.push(matchWithDetails);
            }
        } else {
            // المباريات المنتهية أو غير المعروفة
            const matchWithDetails = {
                ...match,
                watchServers: null
            };
            
            matchesWithDetails.push(matchWithDetails);
            console.log(`   ⏭️ ${match.status} - لا توجد سيرفرات مشاهدة`);
        }
        
        // انتظار قصير بين المباريات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return matchesWithDetails;
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
                
                // إذا كانت القنوات فارغة، نضع array فارغ
                if (cleanMatch.channels.length === 0) {
                    cleanMatch.channels = [];
                }
            }
            
            // تنظيف البطولة
            if (cleanMatch.tournament === "غير معروف" || !cleanMatch.tournament) {
                cleanMatch.tournament = "غير محدد";
            }
            
            // تنظيف watchServers
            if (cleanMatch.watchServers && Array.isArray(cleanMatch.watchServers)) {
                // إزالة السيرفرات الفارغة
                cleanMatch.watchServers = cleanMatch.watchServers.filter(server => 
                    server && server.url && server.url.trim() !== ""
                );
                
                // إذا كانت فارغة بعد التنظيف، نضع null
                if (cleanMatch.watchServers.length === 0) {
                    cleanMatch.watchServers = null;
                }
            }
            
            return cleanMatch;
        });
        
        const outputData = {
            scrapedAt: new Date().toISOString(),
            source: "https://www.yalla-shootu.live/",
            totalMatches: cleanData.length,
            matches: cleanData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${cleanData.length}`);
        console.log(`💾 حجم الملف: ${fileSizeKB} كيلوبايت`);
        
        // إحصائيات
        const liveMatches = cleanData.filter(m => m.status === "جارية الآن").length;
        const upcomingMatches = cleanData.filter(m => m.status === "لم تبدأ بعد").length;
        const finishedMatches = cleanData.filter(m => m.status === "انتهت").length;
        const matchesWithServers = cleanData.filter(m => m.watchServers && m.watchServers.length > 0).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - المباريات بسيرفرات مشاهدة: ${matchesWithServers}/${liveMatches + upcomingMatches}`);
        
        // عرض أمثلة
        console.log(`\n📋 أمثلة على المباريات المستخرجة:`);
        cleanData.slice(0, 3).forEach((match, idx) => {
            console.log(`   ${idx + 1}. ${match.title}`);
            console.log(`     الحالة: ${match.status} | النتيجة: ${match.score}`);
            console.log(`     السيرفرات: ${match.watchServers ? match.watchServers.length : 0}`);
            if (match.watchServers && match.watchServers.length > 0) {
                match.watchServers.slice(0, 2).forEach(server => {
                    console.log(`       - ${server.server}: ${server.url.substring(0, 50)}...`);
                });
            }
        });
        
        return outputData;
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج المباريات من yalla-shootu.live");
    console.log("=".repeat(60));
    
    try {
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
            
            return { 
                success: true, 
                total: savedData.matches.length,
                live: savedData.matches.filter(m => m.status === "جارية الآن").length,
                upcoming: savedData.matches.filter(m => m.status === "لم تبدأ بعد").length,
                finished: savedData.matches.filter(m => m.status === "انتهت").length,
                withServers: savedData.matches.filter(m => m.watchServers && m.watchServers.length > 0).length,
                filePath: OUTPUT_FILE 
            };
        }
        
        return { success: false, total: 0 };
        
    } catch (error) {
        console.error(`\n💥 خطأ غير متوقع: ${error.message}`);
        console.error(error.stack);
        
        const errorReport = {
            error: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
        
        const errorFile = path.join(FOOTBALL_DIR, "error.json");
        fs.writeFileSync(errorFile, JSON.stringify(errorReport, null, 2));
        
        return { success: false, error: error.message };
    }
}

// التشغيل
if (import.meta.url === `file://${process.argv[1]}`) {
    main().then(result => {
        console.log(`\n${"=".repeat(60)}`);
        console.log(`النتيجة: ${result.success ? '✅ ناجح' : '❌ فاشل'}`);
        if (result.success) {
            console.log(`إجمالي المباريات: ${result.total}`);
            console.log(`المباريات الجارية: ${result.live}`);
            console.log(`المباريات القادمة: ${result.upcoming}`);
            console.log(`المباريات المنتهية: ${result.finished}`);
            console.log(`المباريات بسيرفرات مشاهدة: ${result.withServers}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
