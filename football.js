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

// ==================== إعدادات المواقع ====================
const SITES = {
    MAIN: "https://www.kooratimes.com/",
    STREAM_DOMAIN: "https://10.stremach.live"
};

// ==================== fetch مع timeout ====================
async function fetchWithTimeout(url, timeout = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Referer': 'https://www.kooratimes.com/',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.log(`   ⚠️ استجابة غير ناجحة: ${response.status} ${response.statusText}`);
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

// ==================== دالة لاستخراج السيرفر من صفحة المشاهدة ====================
async function extractStreamServer(matchUrl) {
    console.log(`   🔍 جلب سيرفر المشاهدة من: ${matchUrl}`);
    
    const html = await fetchWithTimeout(matchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن iframe
        const iframes = doc.querySelectorAll('iframe');
        console.log(`   🔍 فحص ${iframes.length} iframe`);
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src) continue;
            
            console.log(`   ✅ وجد iframe: ${src.substring(0, 100)}...`);
            
            // تنظيف الرابط
            let cleanUrl = src.trim();
            
            // إضافة https:// إذا لم يكن موجوداً
            if (cleanUrl.startsWith('//')) {
                cleanUrl = 'https:' + cleanUrl;
            }
            
            return {
                type: 'iframe',
                url: cleanUrl,
                quality: "HD",
                server: extractServerName(cleanUrl),
                id: `server_${Date.now()}`
            };
        }
        
        // إذا لم نجد iframe، نبحث عن أي رابط يشبه السيرفر
        const links = doc.querySelectorAll('a[href*="albaplayer"], a[href*="koooralive"], a[href*="pl.koooralive"]');
        if (links.length > 0) {
            const href = links[0].getAttribute('href');
            console.log(`   ✅ وجد رابط سيرفر: ${href}`);
            return {
                type: 'link',
                url: href,
                quality: "HD",
                server: extractServerName(href),
                id: `server_${Date.now()}`
            };
        }
        
        console.log(`   ⚠️ لم يتم العثور على سيرفر في الصفحة`);
        return null;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج السيرفر: ${error.message}`);
        return null;
    }
}

// ==================== دالة لاستخراج اسم السيرفر من الرابط ====================
function extractServerName(url) {
    if (!url) return "غير معروف";
    
    if (url.includes('albaplayer')) return "AlbaPlayer";
    if (url.includes('koooralive.click')) return "KooraLive";
    if (url.includes('pl.koooralive')) return "KooraLive Player";
    if (url.includes('bein')) return "BeIN Sports";
    if (url.includes('ssc')) return "SSC";
    if (url.includes('ontime')) return "OnTime";
    
    return "سيرفر المشاهدة";
}

// ==================== استخراج المباريات من الصفحة الرئيسية ====================
async function fetchMatchesFromPage(pageNum = 1) {
    const url = pageNum === 1 ? SITES.MAIN : `${SITES.MAIN}page/${pageNum}/`;
    
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
        
        // البحث عن عناصر المباريات - الهيكل الجديد
        const matchElements = doc.querySelectorAll('.AY_Match');
        
        console.log(`✅ وجد ${matchElements.length} مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة من عنصر a داخل .MT_Mask
                const linkElement = element.querySelector('.MT_Mask a');
                let matchUrl = linkElement ? linkElement.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    continue;
                }
                
                // التأكد من أن الرابط كامل
                if (!matchUrl.startsWith('http')) {
                    matchUrl = SITES.STREAM_DOMAIN + matchUrl;
                }
                
                // استخراج أسماء الفرق من داخل .MT_Team
                const team1Element = element.querySelector('.MT_Team.TM1 .TM_Name');
                const team2Element = element.querySelector('.MT_Team.TM2 .TM_Name');
                
                const team1Name = team1Element ? team1Element.textContent.trim() : "غير معروف";
                const team2Name = team2Element ? team2Element.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفرق
                const team1Logo = element.querySelector('.MT_Team.TM1 .TM_Logo img')?.getAttribute('src') || 
                                  element.querySelector('.MT_Team.TM1 .TM_Logo img')?.getAttribute('data-src');
                const team2Logo = element.querySelector('.MT_Team.TM2 .TM_Logo img')?.getAttribute('src') ||
                                  element.querySelector('.MT_Team.TM2 .TM_Logo img')?.getAttribute('data-src');
                
                // استخراج بيانات المباراة من .MT_Data
                const mtData = element.querySelector('.MT_Data');
                
                // استخراج الوقت
                const timeElement = mtData?.querySelector('.MT_Time');
                const matchTime = timeElement ? timeElement.textContent.trim() : "غير معروف";
                
                // استخراج النتيجة
                const resultElement = mtData?.querySelector('.MT_Result');
                let team1Score = "0";
                let team2Score = "0";
                let score = "0 - 0";
                
                if (resultElement) {
                    const goalsElements = resultElement.querySelectorAll('.RS-goals');
                    if (goalsElements.length === 2) {
                        team1Score = goalsElements[0].textContent.trim();
                        team2Score = goalsElements[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // استخراج حالة المباراة
                const statusElement = mtData?.querySelector('.MT_Stat');
                let matchStatus = statusElement ? statusElement.textContent.trim() : "غير معروف";
                
                // توحيد حالات المباراة
                if (matchStatus === "جارية الان") matchStatus = "جارية الآن";
                else if (matchStatus === "بعد قليل") matchStatus = "لم تبدأ بعد";
                else if (matchStatus === "لم تبدأ بعد") matchStatus = "لم تبدأ بعد";
                else if (matchStatus === "انتهت") matchStatus = "انتهت";
                
                // استخراج البطولة
                const tournamentElement = mtData?.querySelector('.TourName');
                let tournament = tournamentElement ? tournamentElement.textContent.trim() : "غير محدد";
                
                // تنظيف البطولة (إزالة التكرار)
                if (tournament.includes(',')) {
                    tournament = tournament.split(',').map(t => t.trim()).join(' - ');
                }
                
                // تحديد القنوات الناقلة (افتراضياً)
                const channels = [];
                if (matchUrl.includes('bein')) channels.push("beIN Sports");
                if (matchUrl.includes('ssc')) channels.push("SSC");
                if (tournament.includes('الدوري الإسباني')) channels.push("beIN Sports");
                if (tournament.includes('الدوري الإيطالي')) channels.push("AD Sports");
                if (tournament.includes('الدوري الألماني')) channels.push("beIN Sports");
                
                // إنشاء كائن المباراة
                const matchId = `match_${Date.now()}_${index}`;
                const match = {
                    id: matchId,
                    url: matchUrl,
                    title: `${team1Name} vs ${team2Name}`,
                    team1: {
                        name: team1Name,
                        logo: team1Logo || null,
                        score: team1Score
                    },
                    team2: {
                        name: team2Name,
                        logo: team2Logo || null,
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
                    streamServer: null  // سيتم ملؤه لاحقاً
                };
                
                matches.push(match);
                
                // عرض تفاصيل الاستخراج
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                console.log(`     النتيجة: ${score} | الوقت: ${matchTime}`);
                console.log(`     البطولة: ${tournament}`);
                console.log(`     الرابط: ${matchUrl.substring(0, 60)}...`);
                
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

// ==================== استخراج سيرفرات المشاهدة للمباريات ====================
async function fetchMatchesStreams(matches) {
    console.log(`\n🔍 جلب سيرفرات المشاهدة لـ ${matches.length} مباراة...`);
    
    const matchesWithStreams = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title} (${match.status})`);
        
        // محاولة استخراج السيرفر للمباريات الجارية أو القادمة فقط
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            try {
                const streamServer = await extractStreamServer(match.url);
                
                const matchWithStream = {
                    ...match,
                    streamServer: streamServer
                };
                
                matchesWithStreams.push(matchWithStream);
                
                if (streamServer) {
                    console.log(`   ✅ تم العثور على سيرفر مشاهدة`);
                    console.log(`     ${streamServer.server}: ${streamServer.url.substring(0, 80)}...`);
                } else {
                    console.log(`   ⚠️ لا يوجد سيرفر مشاهدة متاح`);
                }
                
            } catch (error) {
                console.log(`   ❌ خطأ في استخراج السيرفر: ${error.message}`);
                
                const matchWithStream = {
                    ...match,
                    streamServer: null
                };
                
                matchesWithStreams.push(matchWithStream);
            }
        } else {
            // المباريات المنتهية
            const matchWithStream = {
                ...match,
                streamServer: null
            };
            
            matchesWithStreams.push(matchWithStream);
            console.log(`   ⏭️ ${match.status} - لا يوجد سيرفر مشاهدة`);
        }
        
        // انتظار قصير بين المباريات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return matchesWithStreams;
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
                    delete cleanMatch.channels;
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
            source: SITES.MAIN,
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
        const matchesWithStreams = cleanData.filter(m => m.streamServer && m.streamServer.url).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - المباريات بسيرفرات: ${matchesWithStreams}/${liveMatches + upcomingMatches}`);
        
        // عرض أمثلة
        console.log(`\n📋 أمثلة على المباريات المستخرجة:`);
        cleanData.slice(0, 3).forEach((match, idx) => {
            console.log(`\n   ${idx + 1}. ${match.title}`);
            console.log(`     الحالة: ${match.status} | النتيجة: ${match.score}`);
            console.log(`     البطولة: ${match.tournament}`);
            console.log(`     الوقت: ${match.time}`);
            if (match.streamServer && match.streamServer.url) {
                console.log(`     السيرفر: ${match.streamServer.server}`);
            } else {
                console.log(`     السيرفر: لا يوجد`);
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
    console.log("⚽ بدء استخراج المباريات من kooratimes.com");
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
        
        const matchesWithStreams = await fetchMatchesStreams(pageData.matches);
        const savedData = saveToHgFile(matchesWithStreams);
        
        if (savedData) {
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            
            return { 
                success: true, 
                total: savedData.matches.length,
                live: savedData.matches.filter(m => m.status === "جارية الآن").length,
                upcoming: savedData.matches.filter(m => m.status === "لم تبدأ بعد").length,
                finished: savedData.matches.filter(m => m.status === "انتهت").length,
                withStreams: savedData.matches.filter(m => m.streamServer && m.streamServer.url).length,
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
            console.log(`المباريات بسيرفرات: ${result.withStreams}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
