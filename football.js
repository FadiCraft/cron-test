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
        "https://www.livekoratv.com",
        "https://www.kooralive07.live",
        "https://www.kooratimes.com",
        "https://www.mop-kora-live.com"
    ]
};

// ==================== fetch مع timeout وتحسين الهيدرز ====================
async function fetchWithTimeout(url, timeout = 15000, isImage = false) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const headers = {
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

// ==================== دالة لإصلاح روابط الصور (تركز على data-src) ====================
function extractImageUrl(imgElement) {
    if (!imgElement) return null;
    
    try {
        // 1. المحاولة الأولى: data-src (الشعارات موجودة هنا)
        let url = imgElement.getAttribute('data-src');
        if (url && url.trim() !== '') {
            console.log(`      📸 استخراج من data-src: ${url.substring(0, 60)}...`);
            return fixImageUrl(url);
        }
        
        // 2. المحاولة الثانية: src
        url = imgElement.getAttribute('src');
        if (url && url.trim() !== '' && !url.startsWith('data:image')) {
            console.log(`      📸 استخراج من src: ${url.substring(0, 60)}...`);
            return fixImageUrl(url);
        }
        
        // 3. المحاولة الثالثة: أي مصدر آخر
        url = imgElement.getAttribute('data-lazy-src') || 
              imgElement.getAttribute('data-original') || 
              imgElement.getAttribute('data-srcset')?.split(' ')[0];
        
        if (url && url.trim() !== '') {
            console.log(`      📸 استخراج من مصدر آخر: ${url.substring(0, 60)}...`);
            return fixImageUrl(url);
        }
        
    } catch (error) {
        console.log(`      ⚠️ خطأ في استخراج الصورة: ${error.message}`);
    }
    
    return null;
}

// ==================== دالة لإصلاح روابط الصور ====================
function fixImageUrl(url) {
    if (!url) return null;
    
    try {
        let cleanUrl = url.trim();
        
        // إزالة البروتوكول إذا كان مزدوجاً
        cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
        cleanUrl = 'https://' + cleanUrl.replace(/^\/+/, '');
        
        // التأكد من أن الرابط ينتهي بامتداد صورة
        if (!cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i)) {
            // بعض الروابط لا تنتهي بالامتداد ولكنها صور
            // نضيف .png كافتراضي
            if (!cleanUrl.includes('?')) {
                cleanUrl = cleanUrl + '.png';
            }
        }
        
        return cleanUrl;
        
    } catch {
        return null;
    }
}

// ==================== دالة لاستخراج السيرفر من صفحة المشاهدة ====================
async function extractStreamServer(matchUrl) {
    console.log(`   🔍 جلب سيرفر المشاهدة من: ${matchUrl.substring(0, 60)}...`);
    
    const html = await fetchWithTimeout(matchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المشاهدة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // 1. البحث عن iframe بالكلاس cf (الموجود في الصفحة)
        const cfIframe = doc.querySelector('iframe.cf');
        if (cfIframe) {
            const src = cfIframe.getAttribute('src');
            if (src) {
                let cleanUrl = src.trim();
                if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
                console.log(`   ✅ وجد iframe.cf: ${cleanUrl.substring(0, 60)}...`);
                return {
                    type: 'iframe',
                    url: cleanUrl,
                    quality: "HD",
                    server: extractServerName(cleanUrl),
                    id: `server_${Date.now()}`
                };
            }
        }
        
        // 2. البحث عن iframe بالـ id streamFrame
        const streamFrame = doc.querySelector('iframe#streamFrame');
        if (streamFrame) {
            const src = streamFrame.getAttribute('src');
            if (src) {
                let cleanUrl = src.trim();
                if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
                if (cleanUrl.includes('albaplayer') && !cleanUrl.includes('?serv=')) {
                    cleanUrl = cleanUrl + '?serv=0';
                }
                console.log(`   ✅ وجد iframe#streamFrame: ${cleanUrl.substring(0, 60)}...`);
                return {
                    type: 'iframe',
                    url: cleanUrl,
                    quality: "HD",
                    server: extractServerName(cleanUrl),
                    id: `server_${Date.now()}`
                };
            }
        }
        
        // 3. البحث عن أي iframe
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src) continue;
            
            let cleanUrl = src.trim();
            if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
            
            if (cleanUrl.includes('albaplayer') || cleanUrl.includes('koooralive')) {
                if (cleanUrl.includes('albaplayer') && !cleanUrl.includes('?serv=')) {
                    cleanUrl = cleanUrl + '?serv=0';
                }
                console.log(`   ✅ وجد iframe: ${cleanUrl.substring(0, 60)}...`);
                return {
                    type: 'iframe',
                    url: cleanUrl,
                    quality: "HD",
                    server: extractServerName(cleanUrl),
                    id: `server_${Date.now()}`
                };
            }
        }
        
        // 4. البحث في محتوى الصفحة
        const htmlContent = html;
        const albaplayerMatch = htmlContent.match(/(?:src|href)=["'](https?:\/\/[^"']*albaplayer[^"']*)["']/i);
        if (albaplayerMatch) {
            let url = albaplayerMatch[1];
            if (!url.includes('?serv=')) url = url + '?serv=0';
            console.log(`   ✅ وجد albaplayer في النص`);
            return {
                type: 'iframe',
                url: url,
                quality: "HD",
                server: extractServerName(url),
                id: `server_${Date.now()}`
            };
        }
        
        console.log(`   ⚠️ لم يتم العثور على سيرفر`);
        return null;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج السيرفر: ${error.message}`);
        return null;
    }
}

// ==================== دالة لاستخراج اسم السيرفر ====================
function extractServerName(url) {
    if (!url) return "غير معروف";
    
    if (url.includes('bein1')) return "BeIN Sports 1";
    if (url.includes('bein2')) return "BeIN Sports 2";
    if (url.includes('bein3')) return "BeIN Sports 3";
    if (url.includes('bein4')) return "BeIN Sports 4";
    if (url.includes('bein5')) return "BeIN Sports 5";
    if (url.includes('bein6')) return "BeIN Sports 6";
    if (url.includes('ssc1')) return "SSC 1";
    if (url.includes('ssc2')) return "SSC 2";
    if (url.includes('ssc3')) return "SSC 3";
    if (url.includes('ad-sport')) return "AD Sports";
    
    if (url.includes('albaplayer')) {
        const match = url.match(/albaplayer\/([^\/?]+)/);
        if (match) {
            const channel = match[1];
            if (channel.includes('bein')) return channel.replace('bein', 'BeIN Sports ');
            if (channel.includes('ssc')) return channel.toUpperCase();
            return "AlbaPlayer";
        }
        return "AlbaPlayer";
    }
    
    return "سيرفر المشاهدة";
}

// ==================== استخراج المباريات من الصفحة الرئيسية ====================
async function fetchMatchesFromPage() {
    console.log(`\n📄 جلب المباريات من: ${SITES.MAIN}`);
    
    const html = await fetchWithTimeout(SITES.MAIN);
    
    if (!html) {
        console.log(`❌ فشل جلب صفحة المباريات`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const matches = [];
        
        // البحث عن عناصر المباريات
        const matchElements = doc.querySelectorAll('.AY_Match');
        console.log(`✅ وجد ${matchElements.length} مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج أسماء الفرق
                const team1Element = element.querySelector('.MT_Team.TM1 .TM_Name');
                const team2Element = element.querySelector('.MT_Team.TM2 .TM_Name');
                
                const team1Name = team1Element ? team1Element.textContent.trim() : "غير معروف";
                const team2Name = team2Element ? team2Element.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفرق - التركيز على data-src
                console.log(`   📸 استخراج شعارات مباراة ${index + 1}: ${team1Name} vs ${team2Name}`);
                
                const team1Img = element.querySelector('.MT_Team.TM1 .TM_Logo img');
                const team2Img = element.querySelector('.MT_Team.TM2 .TM_Logo img');
                
                const team1Logo = extractImageUrl(team1Img);
                const team2Logo = extractImageUrl(team2Img);
                
                // استخراج الوقت
                const timeElement = element.querySelector('.MT_Data .MT_Time');
                const matchTime = timeElement ? timeElement.textContent.trim() : "غير معروف";
                
                // استخراج النتيجة
                const resultElement = element.querySelector('.MT_Data .MT_Result');
                let team1Score = "0", team2Score = "0", score = "0 - 0";
                
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
                
                if (matchStatus.includes('جارية')) matchStatus = "جارية الآن";
                else if (matchStatus.includes('بعد قليل') || matchStatus.includes('لم تبدأ')) matchStatus = "لم تبدأ بعد";
                else if (matchStatus.includes('انتهت')) matchStatus = "انتهت";
                
                // استخراج البطولة
                const tourElement = element.querySelector('.MT_Data .TourName');
                let tournament = tourElement ? tourElement.textContent.trim() : "غير محدد";
                
                // استخراج رابط المباراة
                const linkElement = element.querySelector('.MT_Mask a');
                let matchUrl = linkElement ? linkElement.getAttribute('href') : null;
                
                if (matchUrl && !matchUrl.startsWith('http')) {
                    matchUrl = SITES.STREAM_DOMAIN + matchUrl;
                }
                
                // تحديد القنوات
                const channels = [];
                if (tournament.includes('إسبانيا')) channels.push("beIN Sports");
                if (tournament.includes('إنجلترا')) channels.push("beIN Sports");
                if (tournament.includes('إيطاليا')) channels.push("AD Sports");
                if (tournament.includes('السعودية')) channels.push("SSC");
                if (tournament.includes('أفريقيا')) channels.push("beIN Sports");
                
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
                
                console.log(`   ✓ ${index + 1}: ${team1Name} vs ${team2Name} (${matchStatus})`);
                if (team1Logo) console.log(`      🖼️ شعار ${team1Name}: موجود`);
                if (team2Logo) console.log(`      🖼️ شعار ${team2Name}: موجود`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في مباراة ${index + 1}: ${error.message}`);
            }
        }
        
        console.log(`\n🎯 تم استخراج ${matches.length} مباراة`);
        console.log(`📸 مباريات بشعارات: ${matches.filter(m => m.team1.logo || m.team2.logo).length}`);
        
        return {
            url: SITES.MAIN,
            matches: matches,
            totalMatches: matches.length,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ خطأ في تحليل الصفحة: ${error.message}`);
        return null;
    }
}

// ==================== استخراج سيرفرات المشاهدة ====================
async function fetchMatchesStreams(matches) {
    console.log(`\n🔍 جلب سيرفرات المشاهدة...`);
    
    const matchesWithStreams = [];
    let successCount = 0;
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title}`);
        
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            if (match.url) {
                const streamServer = await extractStreamServer(match.url);
                if (streamServer) {
                    match.streamServer = streamServer;
                    successCount++;
                    console.log(`   ✅ سيرفر: ${streamServer.server}`);
                } else {
                    console.log(`   ⚠️ لا يوجد سيرفر`);
                }
            } else {
                console.log(`   ⚠️ لا يوجد رابط للمباراة`);
            }
        } else {
            console.log(`   ⏭️ ${match.status}`);
        }
        
        matchesWithStreams.push(match);
        
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log(`\n📊 تم العثور على ${successCount} سيرفر`);
    return matchesWithStreams;
}

// ==================== حفظ البيانات ====================
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
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${data.length}`);
        
        const liveMatches = data.filter(m => m.status === "جارية الآن").length;
        const upcomingMatches = data.filter(m => m.status === "لم تبدأ بعد").length;
        const finishedMatches = data.filter(m => m.status === "انتهت").length;
        const matchesWithLogos = data.filter(m => m.team1.logo || m.team2.logo).length;
        const matchesWithStreams = data.filter(m => m.streamServer).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - الجارية: ${liveMatches}`);
        console.log(`   - القادمة: ${upcomingMatches}`);
        console.log(`   - المنتهية: ${finishedMatches}`);
        console.log(`   - بشعارات: ${matchesWithLogos}`);
        console.log(`   - بسيرفرات: ${matchesWithStreams}`);
        
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
            return { success: false };
        }
        
        const matchesWithStreams = await fetchMatchesStreams(pageData.matches);
        const savedData = saveToHgFile(matchesWithStreams);
        
        if (savedData) {
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            return { success: true, total: savedData.matches.length };
        }
        
        return { success: false };
        
    } catch (error) {
        console.error(`\n💥 خطأ: ${error.message}`);
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
