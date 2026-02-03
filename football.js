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

// ==================== استخراج سيرفرات المشاهدة - نسخة معدلة ====================
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
        
        console.log(`   🔍 البحث عن سيرفر المشاهدة الرئيسي...`);
        
        // البحث فقط عن iframe مع class="cf" - السيرفر الرئيسي
        const mainIframe = doc.querySelector('iframe.cf');
        
        if (mainIframe) {
            const src = mainIframe.getAttribute('src');
            
            if (src && src.trim() !== '') {
                console.log(`   ✅ وجد iframe.cf: ${src}`);
                
                // تحديد نوع السيرفر بناءً على الرابط
                let serverType = "غير معروف";
                if (src.includes("albaplayer")) serverType = "AlbaPlayer";
                else if (src.includes("streamtape")) serverType = "StreamTape";
                else if (src.includes("dood")) serverType = "DoodStream";
                else if (src.includes("voe")) serverType = "Voe";
                else if (src.includes("vidcloud")) serverType = "VidCloud";
                else if (src.includes("yalla-shoot")) serverType = "YallaShoot";
                else if (src.includes("on-time")) serverType = "OnTime";
                else if (src.includes("kooraxx")) serverType = "KooraXX";
                else if (src.includes("player")) serverType = "Player";
                
                // التحقق من أن الرابط صالح للمشاهدة
                const isValidStreamingLink = src.includes("albaplayer") || 
                                           src.includes("streamtape") || 
                                           src.includes("dood") ||
                                           src.includes("voe") ||
                                           src.includes("vidcloud") ||
                                           src.includes("yalla-shoot") ||
                                           src.includes("on-time") ||
                                           src.includes("kooraxx") ||
                                           src.includes(".m3u8") ||
                                           src.includes(".mp4");
                
                if (isValidStreamingLink) {
                    return [{
                        type: 'iframe',
                        url: src.trim(),
                        quality: "HD",
                        server: serverType,
                        id: 'main_iframe'
                    }];
                } else {
                    console.log(`   ⚠️ الرابط ليس رابط مشاهدة صالح: ${src}`);
                    return null;
                }
            }
        }
        
        // إذا لم يتم العثور على iframe.cf، نبحث عن أي iframe قد يكون سيرفر مشاهدة
        console.log(`   🔍 لم يتم العثور على iframe.cf، البحث عن أي iframe...`);
        
        const allIframes = doc.querySelectorAll('iframe');
        
        for (const iframe of allIframes) {
            const src = iframe.getAttribute('src');
            
            if (src && src.trim() !== '') {
                // تحقق إذا كان الرابط يحتوي على كلمات تشير إلى سيرفر مشاهدة
                if (src.includes("albaplayer") || 
                    src.includes("streamtape") || 
                    src.includes("dood") ||
                    src.includes("voe") ||
                    src.includes("vidcloud") ||
                    src.includes("yalla-shoot") ||
                    src.includes("on-time") ||
                    src.includes("kooraxx") ||
                    src.includes(".m3u8") ||
                    src.includes(".mp4")) {
                    
                    console.log(`   ✅ وجد iframe بديل: ${src.substring(0, 100)}...`);
                    
                    let serverType = "غير معروف";
                    if (src.includes("albaplayer")) serverType = "AlbaPlayer";
                    else if (src.includes("streamtape")) serverType = "StreamTape";
                    else if (src.includes("dood")) serverType = "DoodStream";
                    else if (src.includes("voe")) serverType = "Voe";
                    else if (src.includes("vidcloud")) serverType = "VidCloud";
                    else if (src.includes("yalla-shoot")) serverType = "YallaShoot";
                    else if (src.includes("on-time")) serverType = "OnTime";
                    else if (src.includes("kooraxx")) serverType = "KooraXX";
                    
                    return [{
                        type: 'iframe',
                        url: src.trim(),
                        quality: "HD",
                        server: serverType,
                        id: 'alternative_iframe'
                    }];
                }
            }
        }
        
        // إذا لم يتم العثور على أي سيرفر مشاهدة
        console.log(`   ❌ لم يتم العثور على سيرفر مشاهدة في الصفحة`);
        return null;
        
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

// ==================== استخراج المباريات من الصفحة ====================
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
        
        // البحث عن جميع عناصر المباريات
        const matchElements = doc.querySelectorAll('.AY_Match');
        
        console.log(`✅ وجد ${matchElements.length} عنصر مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة من العنصر
                const matchLink = element.querySelector('a[href*="matches"], a[href*="sia-me"], a[href*="yalla-shoot"], a[href*="on-time"]');
                let matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    continue;
                }
                
                // إذا كان الرابط قصير، نضيف النطاق الأساسي
                if (matchUrl.startsWith('/')) {
                    matchUrl = `https://www.yalla-shootu.live${matchUrl}`;
                }
                
                // استخراج أسماء الفريقين
                const team1NameElem = element.querySelector('.TM1 .TM_Name');
                const team2NameElem = element.querySelector('.TM2 .TM_Name');
                
                let team1Name = team1NameElem ? team1NameElem.textContent.trim() : "غير معروف";
                let team2Name = team2NameElem ? team2NameElem.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفريقين
                const team1Img = element.querySelector('.TM1 img');
                const team2Img = element.querySelector('.TM2 img');
                
                let team1Logo = extractImageUrl(team1Img);
                let team2Logo = extractImageUrl(team2Img);
                
                // استخراج النتيجة
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
                
                // استخراج حالة المباراة
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
                
                // استخراج القنوات
                const channels = [];
                const channelItems = element.querySelectorAll('.MT_Info li span');
                channelItems.forEach(item => {
                    const channelName = item.textContent.trim();
                    if (channelName && channelName !== "غير معروف") {
                        channels.push(channelName);
                    }
                });
                
                // استخراج البطولة
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
                    channels: channels.slice(0, 2),
                    tournament: tournament,
                    page: pageNum,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    watchServers: null
                };
                
                matches.push(match);
                
                // عرض تفاصيل الاستخراج
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                console.log(`     النتيجة: ${score} | الوقت: ${matchTime}`);
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
                console.log(`   🔍 جارٍ استخراج سيرفر المشاهدة...`);
                const watchServers = await fetchWatchServers(match.url);
                
                const matchWithDetails = {
                    ...match,
                    watchServers: watchServers
                };
                
                matchesWithDetails.push(matchWithDetails);
                
                if (watchServers && watchServers.length > 0) {
                    console.log(`   ✅ تم العثور على سيرفر مشاهدة`);
                    console.log(`     السيرفر: ${watchServers[0].server}`);
                    console.log(`     الرابط: ${watchServers[0].url.substring(0, 80)}...`);
                } else {
                    console.log(`   ⚠️ لا يوجد سيرفر مشاهدة متاح`);
                }
                
            } catch (error) {
                console.log(`   ❌ خطأ في استخراج سيرفر المشاهدة: ${error.message}`);
                
                // إضافة المباراة مع watchServers = null
                const matchWithDetails = {
                    ...match,
                    watchServers: null
                };
                
                matchesWithDetails.push(matchWithDetails);
            }
        } else {
            // المباريات المنتهية
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
                
                if (cleanMatch.channels.length === 0) {
                    cleanMatch.channels = [];
                }
            }
            
            // تنظيف البطولة
            if (cleanMatch.tournament === "غير معروف" || !cleanMatch.tournament) {
                cleanMatch.tournament = "غير محدد";
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
            if (match.watchServers && match.watchServers.length > 0) {
                console.log(`     السيرفر: ${match.watchServers[0].server}`);
                console.log(`     الرابط: ${match.watchServers[0].url.substring(0, 60)}...`);
            } else {
                console.log(`     السيرفر: null`);
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
