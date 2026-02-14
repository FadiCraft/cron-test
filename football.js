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
    STREAM_DOMAIN: "https://10.stremach.live",
    IMAGE_DOMAINS: [
        "https://www.kooralive07.live",
        "https://www.livekoratv.com",
        "https://www.kooratimes.com",
        "https://www.mop-kora-live.com"
    ]
};

// ==================== fetch مع timeout وتحسين الهيدرز ====================
async function fetchWithTimeout(url, timeout = 15000, isImage = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // هيدرز مخصصة للصور
    const headers = isImage ? {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Referer': SITES.MAIN,
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
    } : {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
        'Referer': SITES.MAIN,
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    };
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: headers
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

// ==================== دالة لإصلاح روابط الصور ====================
function fixImageUrl(url) {
    if (!url) return null;
    
    try {
        // إزالة الـ data-src والاحتفاظ بالرابط فقط
        let cleanUrl = url.replace(/^data:image\/.*?base64,.*$/, '').trim();
        
        // إذا كان الرابط يبدأ بـ // نضيف https:
        if (cleanUrl.startsWith('//')) {
            cleanUrl = 'https:' + cleanUrl;
        }
        
        // إذا كان الرابط نسبي (يبدأ بـ /)
        if (cleanUrl.startsWith('/')) {
            // نجرب الدومينات المختلفة
            for (const domain of SITES.IMAGE_DOMAINS) {
                const fullUrl = domain + cleanUrl;
                // نرجع أول دومين (سنحاول لاحقاً)
                return fullUrl;
            }
        }
        
        // التأكد أن الرابط يبدأ بـ http
        if (!cleanUrl.startsWith('http')) {
            return SITES.IMAGE_DOMAINS[0] + '/' + cleanUrl.replace(/^\/+/, '');
        }
        
        return cleanUrl;
        
    } catch {
        return null;
    }
}

// ==================== دالة لاستخراج السيرفر من صفحة المشاهدة ====================
async function extractStreamServer(matchUrl) {
    console.log(`   🔍 جلب سيرفر المشاهدة...`);
    
    const html = await fetchWithTimeout(matchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. البحث عن iframe بالطريقة المباشرة
        const iframes = doc.querySelectorAll('iframe');
        console.log(`   🔍 فحص ${iframes.length} iframe`);
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src) continue;
            
            console.log(`   ✅ وجد iframe: ${src.substring(0, 80)}...`);
            
            let cleanUrl = src.trim();
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
        
        // 2. البحث في محتوى الصفحة عن روابط السيرفرات
        const htmlContent = html.toLowerCase();
        
        // البحث عن رابط albaplayer
        const albaplayerMatch = htmlContent.match(/(?:src|href)=["'](https?:\/\/[^"']*albaplayer[^"']*)["']/i);
        if (albaplayerMatch) {
            const url = albaplayerMatch[1];
            console.log(`   ✅ وجد albaplayer في النص`);
            return {
                type: 'iframe',
                url: url,
                quality: "HD",
                server: "AlbaPlayer",
                id: `server_${Date.now()}`
            };
        }
        
        // 3. البحث عن أي رابط لـ pl.koooralive.click
        const kooraLiveMatch = htmlContent.match(/(?:src|href)=["'](https?:\/\/[^"']*koooralive\.click[^"']*)["']/i);
        if (kooraLiveMatch) {
            const url = kooraLiveMatch[1];
            console.log(`   ✅ وجد رابط KooraLive`);
            return {
                type: 'iframe',
                url: url,
                quality: "HD",
                server: "KooraLive",
                id: `server_${Date.now()}`
            };
        }
        
        console.log(`   ⚠️ لم يتم العثور على سيرفر`);
        return null;
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== دالة لاستخراج اسم السيرفر ====================
function extractServerName(url) {
    if (!url) return "غير معروف";
    if (url.includes('albaplayer')) return "AlbaPlayer";
    if (url.includes('koooralive.click')) return "KooraLive";
    if (url.includes('bein')) return "BeIN Sports";
    if (url.includes('ssc')) return "SSC";
    if (url.includes('ad-sport')) return "AD Sports";
    return "سيرفر المشاهدة";
}

// ==================== استخراج المباريات من الصفحة الرئيسية ====================
async function fetchMatchesFromPage() {
    const url = SITES.MAIN;
    
    console.log(`\n📄 جلب المباريات من: ${url}`);
    
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المباريات`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const matches = [];
        
        // البحث عن عناصر المباريات - الطريقة الصحيحة
        const matchElements = doc.querySelectorAll('.AY_Match');
        
        console.log(`✅ وجد ${matchElements.length} مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة من عنصر a داخل MT_Mask
                const linkElement = element.querySelector('.MT_Mask a');
                let matchUrl = linkElement ? linkElement.getAttribute('href') : null;
                
                // إذا ما لقينا رابط، نجرب البحث في onclick أو أي مصدر آخر
                if (!matchUrl) {
                    const onclick = element.querySelector('[onclick*="location"]')?.getAttribute('onclick');
                    if (onclick) {
                        const urlMatch = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
                        if (urlMatch) matchUrl = urlMatch[1];
                    }
                }
                
                // استخراج أسماء الفرق
                const team1Element = element.querySelector('.MT_Team.TM1 .TM_Name');
                const team2Element = element.querySelector('.MT_Team.TM2 .TM_Name');
                
                let team1Name = team1Element ? team1Element.textContent.trim() : "غير معروف";
                let team2Name = team2Element ? team2Element.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفرق - مع إصلاح الروابط
                let team1Logo = null;
                let team2Logo = null;
                
                const team1Img = element.querySelector('.MT_Team.TM1 .TM_Logo img');
                const team2Img = element.querySelector('.MT_Team.TM2 .TM_Logo img');
                
                if (team1Img) {
                    team1Logo = team1Img.getAttribute('src') || team1Img.getAttribute('data-src');
                    team1Logo = fixImageUrl(team1Logo);
                }
                
                if (team2Img) {
                    team2Logo = team2Img.getAttribute('src') || team2Img.getAttribute('data-src');
                    team2Logo = fixImageUrl(team2Logo);
                }
                
                // استخراج الوقت
                const timeElement = element.querySelector('.MT_Data .MT_Time');
                const matchTime = timeElement ? timeElement.textContent.trim() : "غير معروف";
                
                // استخراج النتيجة
                const resultElement = element.querySelector('.MT_Data .MT_Result');
                let team1Score = "0";
                let team2Score = "0";
                let score = "0 - 0";
                
                if (resultElement) {
                    const goals = resultElement.querySelectorAll('.RS-goals');
                    if (goals.length === 2) {
                        team1Score = goals[0].textContent.trim();
                        team2Score = goals[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // استخراج حالة المباراة
                const statusElement = element.querySelector('.MT_Data .MT_Stat');
                let matchStatus = statusElement ? statusElement.textContent.trim() : "غير معروف";
                
                // توحيد حالات المباراة
                if (matchStatus.includes('جارية')) matchStatus = "جارية الآن";
                else if (matchStatus.includes('بعد قليل')) matchStatus = "لم تبدأ بعد";
                else if (matchStatus.includes('لم تبدأ')) matchStatus = "لم تبدأ بعد";
                else if (matchStatus.includes('انتهت')) matchStatus = "انتهت";
                
                // استخراج البطولة
                const tourElement = element.querySelector('.MT_Data .TourName');
                let tournament = tourElement ? tourElement.textContent.trim() : "غير محدد";
                
                // تحديد القنوات الناقلة
                const channels = [];
                if (tournament.includes('إسبانيا')) channels.push("beIN Sports");
                if (tournament.includes('إنجلترا')) channels.push("beIN Sports");
                if (tournament.includes('ألمانيا')) channels.push("beIN Sports");
                if (tournament.includes('فرنسا')) channels.push("beIN Sports");
                if (tournament.includes('إيطاليا')) channels.push("AD Sports");
                if (tournament.includes('السعودية')) channels.push("SSC");
                if (tournament.includes('أفريقيا')) channels.push("beIN Sports");
                
                // بناء رابط المشاهدة إذا لم يكن موجوداً
                if (!matchUrl) {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    
                    // تحديد القناة المناسبة
                    let channelPrefix = "bein";
                    if (tournament.includes('إيطاليا')) channelPrefix = "ad";
                    else if (tournament.includes('السعودية')) channelPrefix = "ssc";
                    
                    // محاولة تحديد رقم القناة
                    let channelNum = "2";
                    if (matchTime) {
                        const hour = parseInt(matchTime.split(':')[0]);
                        if (hour >= 22) channelNum = "1";
                        else if (hour >= 20) channelNum = "2";
                        else if (hour >= 18) channelNum = "3";
                        else channelNum = "4";
                    }
                    
                    matchUrl = `${SITES.STREAM_DOMAIN}/${year}/${month}/${channelPrefix}${channelNum}hd.html`;
                }
                
                const match = {
                    id: `match_${Date.now()}_${index}`,
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
                    channels: [...new Set(channels)],
                    tournament: tournament,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    streamServer: null
                };
                
                matches.push(match);
                
                console.log(`   ✓ ${index + 1}: ${match.title}`);
                console.log(`     ⏱️ ${matchTime} | ${match.status}`);
                console.log(`     🏆 ${tournament.substring(0, 30)}...`);
                if (team1Logo) console.log(`     🖼️ شعار 1: موجود`);
                if (team2Logo) console.log(`     🖼️ شعار 2: موجود`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في مباراة ${index + 1}: ${error.message}`);
            }
        }
        
        console.log(`\n🎯 تم استخراج ${matches.length} مباراة`);
        
        return {
            url: url,
            matches: matches,
            totalMatches: matches.length,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة للمباريات ====================
async function fetchMatchesStreams(matches) {
    console.log(`\n🔍 جلب سيرفرات المشاهدة...`);
    
    const matchesWithStreams = [];
    let successCount = 0;
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title}`);
        
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            const streamServer = await extractStreamServer(match.url);
            
            if (streamServer) {
                match.streamServer = streamServer;
                successCount++;
                console.log(`   ✅ تم العثور على سيرفر: ${streamServer.server}`);
            } else {
                console.log(`   ⚠️ لا يوجد سيرفر`);
            }
        } else {
            console.log(`   ⏭️ ${match.status}`);
        }
        
        matchesWithStreams.push(match);
        
        // تأخير بين الطلبات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log(`\n📊 تم العثور على ${successCount} سيرفر من ${matches.length} مباراة`);
    
    return matchesWithStreams;
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(data) {
    try {
        const outputData = {
            scrapedAt: new Date().toISOString(),
            source: SITES.MAIN,
            totalMatches: data.length,
            matches: data
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${data.length}`);
        console.log(`💾 حجم الملف: ${fileSizeKB} كيلوبايت`);
        
        // إحصائيات
        const liveMatches = data.filter(m => m.status === "جارية الآن").length;
        const upcomingMatches = data.filter(m => m.status === "لم تبدأ بعد").length;
        const finishedMatches = data.filter(m => m.status === "انتهت").length;
        const matchesWithLogos = data.filter(m => m.team1.logo || m.team2.logo).length;
        const matchesWithStreams = data.filter(m => m.streamServer).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - مباريات بشعارات: ${matchesWithLogos}`);
        console.log(`   - مباريات بسيرفرات: ${matchesWithStreams}`);
        
        // عرض أمثلة
        console.log(`\n📋 أمثلة:`);
        data.slice(0, 3).forEach((match, idx) => {
            console.log(`\n   ${idx + 1}. ${match.title}`);
            console.log(`     السيرفر: ${match.streamServer?.server || 'لا يوجد'}`);
            if (match.streamServer) {
                console.log(`     الرابط: ${match.streamServer.url.substring(0, 60)}...`);
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
        const pageData = await fetchMatchesFromPage();
        
        if (!pageData || pageData.matches.length === 0) {
            console.log("\n❌ لم يتم العثور على مباريات");
            return { success: false, total: 0 };
        }
        
        const matchesWithStreams = await fetchMatchesStreams(pageData.matches);
        const savedData = saveToHgFile(matchesWithStreams);
        
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
