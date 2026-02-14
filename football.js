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

// ==================== أنماط الروابط المعروفة ====================
const MATCH_URL_PATTERNS = [
    {
        // نمط روابط المباريات المعتادة
        pattern: /^\/202[4-6]\/\d{2}\/[^\/]+\.html$/,
        domain: SITES.STREAM_DOMAIN
    },
    {
        // نمط روابط صفحات المباريات على الموقع الرئيسي
        pattern: /^\/matches\/[^\/]+\/$/,
        domain: SITES.MAIN.replace(/\/$/, '')
    }
];

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
                'Referer': SITES.MAIN,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
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
            console.log(`   ⏱️ انتهى الوقت: ${url.substring(0, 60)}...`);
        }
        return null;
    }
}

// ==================== بناء رابط المباراة ====================
function buildMatchUrl(matchData) {
    try {
        // محاولة بناء رابط بناءً على أسماء الفرق والبطولة
        const team1 = matchData.team1.name;
        const team2 = matchData.team2.name;
        const tournament = matchData.tournament;
        
        // استخراج اسم القناة من البطولة أو الوقت
        let channel = "bein";
        if (tournament.includes('أفريقيا')) {
            channel = "bein";
        } else if (tournament.includes('إسبانيا')) {
            channel = "bein";
        } else if (tournament.includes('إنجلترا')) {
            channel = "bein";
        } else if (tournament.includes('ألمانيا')) {
            channel = "bein";
        } else if (tournament.includes('فرنسا')) {
            channel = "bein";
        } else if (tournament.includes('إيطاليا')) {
            channel = "ad";
        } else if (tournament.includes('السعودية')) {
            channel = "ssc";
        }
        
        // استخراج رقم القناة (محاولة)
        let channelNumber = "";
        if (matchData.time) {
            const hour = matchData.time.split(':')[0];
            if (hour >= 22) channelNumber = "1";
            else if (hour >= 21) channelNumber = "2";
            else if (hour >= 19) channelNumber = "3";
            else if (hour >= 18) channelNumber = "4";
            else if (hour >= 17) channelNumber = "5";
            else channelNumber = "6";
        }
        
        // إنشاء الرابط
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        
        // قائمة الروابط المحتملة
        const possibleUrls = [
            `${SITES.STREAM_DOMAIN}/${year}/${month}/${channel}${channelNumber}hd.html`,
            `${SITES.STREAM_DOMAIN}/${year}/${month}/${channel}${channelNumber}.html`,
            `${SITES.STREAM_DOMAIN}/${year}/${month}/bein-sport-${channelNumber}hd.html`,
            `${SITES.STREAM_DOMAIN}/${year}/${month}/blog-post-${channelNumber}bein.html`,
        ];
        
        // إضافة روابط خاصة
        if (team1.includes('ريال مدريد') || team2.includes('ريال مدريد')) {
            possibleUrls.unshift(`${SITES.STREAM_DOMAIN}/${year}/${month}/bein-sport-1hd.html`);
        }
        if (team1.includes('إنتر ميلان') || team2.includes('يوفنتوس')) {
            possibleUrls.unshift(`${SITES.STREAM_DOMAIN}/${year}/${month}/ad-sport-1hd.html`);
        }
        
        return possibleUrls[0]; // نرجع أول رابط كاحتمال
        
    } catch (error) {
        console.log(`   ⚠️ خطأ في بناء الرابط: ${error.message}`);
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
        
        // البحث عن iframe
        const iframes = doc.querySelectorAll('iframe');
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src) continue;
            
            // تنظيف الرابط
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
        
        // البحث عن أي رابط سيرفر
        const serverLinks = doc.querySelectorAll('a[href*="albaplayer"], a[href*="koooralive"], a[href*="pl.koooralive"]');
        if (serverLinks.length > 0) {
            const href = serverLinks[0].getAttribute('href');
            return {
                type: 'link',
                url: href,
                quality: "HD",
                server: extractServerName(href),
                id: `server_${Date.now()}`
            };
        }
        
        return null;
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج السيرفر: ${error.message}`);
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
        
        // البحث عن عناصر المباريات - الطريقة الجديدة
        const matchContainers = doc.querySelectorAll('.AY_Match, .match-item, [class*="match"]');
        
        console.log(`✅ وجد ${matchContainers.length} عنصر مباراة`);
        
        for (let index = 0; index < matchContainers.length; index++) {
            const element = matchContainers[index];
            
            try {
                // استخراج أسماء الفرق
                let team1Name = "غير معروف";
                let team2Name = "غير معروف";
                
                // محاولة استخراج أسماء الفرق بعدة طرق
                const teamElements = element.querySelectorAll('.MT_Team .TM_Name, .team-name, [class*="team"]');
                
                if (teamElements.length >= 2) {
                    team1Name = teamElements[0].textContent.trim();
                    team2Name = teamElements[1].textContent.trim();
                } else {
                    // إذا ما لقينا عناصر الفرق، نبحث عن النص في عناصر معينة
                    const allText = element.textContent;
                    const teamNames = extractTeamNames(allText);
                    if (teamNames) {
                        team1Name = teamNames.team1;
                        team2Name = teamNames.team2;
                    }
                }
                
                // استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = element.querySelector('.MT_Time, .time, [class*="time"]');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                } else {
                    // البحث عن وقت في النص (مثل 15:00)
                    const timeMatch = element.textContent.match(/(\d{1,2}:\d{2})/);
                    if (timeMatch) matchTime = timeMatch[1];
                }
                
                // استخراج النتيجة
                let team1Score = "0";
                let team2Score = "0";
                let score = "0 - 0";
                
                const resultElement = element.querySelector('.MT_Result, .result, [class*="score"]');
                if (resultElement) {
                    const goals = resultElement.querySelectorAll('.RS-goals, [class*="goal"]');
                    if (goals.length === 2) {
                        team1Score = goals[0].textContent.trim();
                        team2Score = goals[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.MT_Stat, .status, [class*="status"]');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                }
                
                // توحيد الحالات
                if (matchStatus.includes('جارية')) matchStatus = "جارية الآن";
                else if (matchStatus.includes('بعد قليل')) matchStatus = "لم تبدأ بعد";
                else if (matchStatus.includes('لم تبدأ')) matchStatus = "لم تبدأ بعد";
                else if (matchStatus.includes('انتهت')) matchStatus = "انتهت";
                
                // استخراج البطولة
                let tournament = "غير محدد";
                const tourElement = element.querySelector('.TourName, .tournament, [class*="tour"]');
                if (tourElement) {
                    tournament = tourElement.textContent.trim();
                } else {
                    // البحث عن البطولة في النص
                    const tourMatch = element.textContent.match(/([^\d,]+,\s*[^\d]+)/);
                    if (tourMatch) tournament = tourMatch[1].trim();
                }
                
                // استخراج الشعارات
                let team1Logo = null;
                let team2Logo = null;
                
                const logos = element.querySelectorAll('img');
                if (logos.length >= 2) {
                    team1Logo = logos[0].getAttribute('src') || logos[0].getAttribute('data-src');
                    team2Logo = logos[1].getAttribute('src') || logos[1].getAttribute('data-src');
                }
                
                // بناء كائن المباراة
                const matchData = {
                    team1: { name: team1Name },
                    team2: { name: team2Name },
                    tournament: tournament,
                    time: matchTime
                };
                
                // بناء رابط المباراة
                const matchUrl = buildMatchUrl(matchData);
                
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
                    channels: determineChannels(tournament, matchUrl),
                    tournament: tournament,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    streamServer: null
                };
                
                matches.push(match);
                
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                console.log(`     الوقت: ${matchTime} | البطولة: ${tournament.substring(0, 30)}...`);
                console.log(`     الرابط: ${matchUrl || 'غير متوفر'}`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في عنصر ${index + 1}: ${error.message}`);
            }
        }
        
        console.log(`🎯 تم استخراج ${matches.length} مباراة`);
        
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

// ==================== دوال مساعدة ====================
function extractTeamNames(text) {
    try {
        // قائمة بأسماء الفرق المعروفة
        const knownTeams = [
            'ريال مدريد', 'برشلونة', 'أتلتيكو مدريد', 'إشبيلية', 'فالنسيا',
            'بايرن ميونخ', 'بوروسيا دورتموند', 'لايبزيج', 'باير ليفركوزن',
            'مانشستر سيتي', 'مانشستر يونايتد', 'ليفربول', 'تشيلسي', 'آرسنال',
            'إنتر ميلان', 'ميلان', 'يوفنتوس', 'روما', 'نابولي',
            'باريس سان جيرمان', 'مارسيليا', 'ليون', 'موناكو',
            'الهلال', 'النصر', 'الاتحاد', 'الأهلي', 'الزمالك', 'بيراميدز',
            'الترجي', 'النجم', 'الصفاقسي', 'الوداد', 'الرجاء', 'الجيش'
        ];
        
        // البحث عن أسماء الفرق في النص
        let foundTeams = [];
        knownTeams.forEach(team => {
            if (text.includes(team)) {
                foundTeams.push(team);
            }
        });
        
        if (foundTeams.length >= 2) {
            return { team1: foundTeams[0], team2: foundTeams[1] };
        }
        
        return null;
        
    } catch {
        return null;
    }
}

function determineChannels(tournament, url) {
    const channels = [];
    
    if (tournament.includes('إسبانيا')) channels.push("beIN Sports");
    if (tournament.includes('إنجلترا')) channels.push("beIN Sports");
    if (tournament.includes('ألمانيا')) channels.push("beIN Sports");
    if (tournament.includes('فرنسا')) channels.push("beIN Sports");
    if (tournament.includes('إيطاليا')) channels.push("AD Sports");
    if (tournament.includes('السعودية')) channels.push("SSC");
    if (tournament.includes('أفريقيا')) channels.push("beIN Sports");
    
    if (url) {
        if (url.includes('bein')) channels.push("beIN Sports");
        if (url.includes('ssc')) channels.push("SSC");
        if (url.includes('ad-sport')) channels.push("AD Sports");
    }
    
    return [...new Set(channels)]; // إزالة التكرار
}

// ==================== استخراج سيرفرات المشاهدة ====================
async function fetchMatchesStreams(matches) {
    console.log(`\n🔍 جلب سيرفرات المشاهدة لـ ${matches.length} مباراة...`);
    
    const matchesWithStreams = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title}`);
        
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            if (match.url) {
                try {
                    const streamServer = await extractStreamServer(match.url);
                    match.streamServer = streamServer;
                    
                    if (streamServer) {
                        console.log(`   ✅ تم العثور على سيرفر`);
                    } else {
                        console.log(`   ⚠️ لا يوجد سيرفر`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ خطأ: ${error.message}`);
                }
            } else {
                console.log(`   ⚠️ لا يوجد رابط للمباراة`);
            }
        } else {
            console.log(`   ⏭️ ${match.status}`);
        }
        
        matchesWithStreams.push(match);
        
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    
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
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${data.length}`);
        console.log(`💾 حجم الملف: ${fileSizeKB} كيلوبايت`);
        
        // إحصائيات
        const liveMatches = data.filter(m => m.status === "جارية الآن").length;
        const upcomingMatches = data.filter(m => m.status === "لم تبدأ بعد").length;
        const finishedMatches = data.filter(m => m.status === "انتهت").length;
        const matchesWithUrls = data.filter(m => m.url).length;
        const matchesWithStreams = data.filter(m => m.streamServer && m.streamServer.url).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - مباريات بروابط: ${matchesWithUrls}/${data.length}`);
        console.log(`   - مباريات بسيرفرات: ${matchesWithStreams}`);
        
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
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
                error: "لم يتم العثور على مباريات",
                scrapedAt: new Date().toISOString(),
                matches: []
            }, null, 2));
            
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
                filePath: OUTPUT_FILE 
            };
        }
        
        return { success: false, total: 0 };
        
    } catch (error) {
        console.error(`\n💥 خطأ غير متوقع: ${error.message}`);
        process.exit(1);
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
