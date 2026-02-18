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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Referer': 'https://koraplus.blog/',
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

// ==================== دالة مساعدة للكشف عن نوع السيرفر ====================
function detectServerType(url) {
    if (!url) return "غير معروف";
    
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes("albaplayer")) return "AlbaPlayer";
    if (urlLower.includes("streamtape")) return "StreamTape";
    if (urlLower.includes("doodstream")) return "DoodStream";
    if (urlLower.includes("voe")) return "Voe";
    if (urlLower.includes("vidcloud")) return "VidCloud";
    if (urlLower.includes("on-time") || urlLower.includes("ontime")) return "OnTime";
    if (urlLower.includes("gomatch")) return "GoMatch";
    if (urlLower.includes("kk.pyxq.online")) return "KoraPlus";
    if (urlLower.includes("youtube")) return "YouTube";
    
    return "غير معروف";
}

// ==================== استخراج رابط المشغل من الـ HTML ====================
function extractPlayerFromHTML(html, pageUrl) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // البحث عن iframe
        const iframes = doc.querySelectorAll('iframe');
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src || src.trim() === '') continue;
            
            // تحويل الرابط النسبي إلى كامل
            let fullUrl = src;
            if (!src.startsWith('http')) {
                try {
                    fullUrl = new URL(src, pageUrl).href;
                } catch (e) {
                    continue;
                }
            }
            
            // التحقق من أنه رابط مشغل
            if (fullUrl.includes('gomatch') || fullUrl.includes('albaplayer') || 
                fullUrl.includes('ontime') || fullUrl.includes('player')) {
                
                const serverType = detectServerType(fullUrl);
                
                return [{
                    type: 'iframe',
                    url: fullUrl,
                    quality: "HD",
                    server: serverType,
                    id: `player_1`
                }];
            }
        }
        
        // البحث في محتوى script عن روابط iframe
        const scripts = doc.querySelectorAll('script');
        for (const script of scripts) {
            const content = script.textContent || script.innerHTML;
            
            // البحث عن متغير يحتوي على رابط iframe
            const iframeUrlMatch = content.match(/iframeUrl\s*=\s*["']([^"']+)["']/);
            if (iframeUrlMatch) {
                const url = iframeUrlMatch[1];
                if (url.includes('gomatch') || url.includes('albaplayer')) {
                    return [{
                        type: 'iframe',
                        url: url,
                        quality: "HD",
                        server: detectServerType(url),
                        id: 'player_1'
                    }];
                }
            }
        }
        
        // البحث في div placeholder
        const placeholder = doc.querySelector('#iframe-placeholder');
        if (placeholder) {
            const innerHtml = placeholder.innerHTML;
            const iframeMatch = innerHtml.match(/<iframe[^>]*src=["']([^"']+)["']/);
            if (iframeMatch) {
                const url = iframeMatch[1];
                if (url.includes('gomatch') || url.includes('albaplayer')) {
                    return [{
                        type: 'iframe',
                        url: url,
                        quality: "HD",
                        server: detectServerType(url),
                        id: 'player_1'
                    }];
                }
            }
        }
        
        return null;
        
    } catch (error) {
        return null;
    }
}

// ==================== استخراج المباريات من الصفحة الرئيسية ====================
async function fetchMatchesFromPage(pageNum = 1) {
    const baseUrl = "https://koraplus.blog/";
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
        const matchElements = doc.querySelectorAll('.match-container');
        
        console.log(`✅ وجد ${matchElements.length} مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة
                const matchLink = element.querySelector('a');
                let matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) continue;
                
                // التأكد من أن الرابط كامل
                if (!matchUrl.startsWith('http')) {
                    matchUrl = new URL(matchUrl, baseUrl).href;
                }
                
                // استخراج أسماء الفريقين والشعارات
                const team1NameElem = element.querySelector('.right-team .team-name');
                const team2NameElem = element.querySelector('.left-team .team-name');
                
                let team1Name = team1NameElem ? team1NameElem.textContent.trim() : "غير معروف";
                let team2Name = team2NameElem ? team2NameElem.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفريقين
                const team1Img = element.querySelector('.right-team img');
                const team2Img = element.querySelector('.left-team img');
                
                let team1Logo = team1Img ? (team1Img.getAttribute('src') || team1Img.getAttribute('data-src')) : null;
                let team2Logo = team2Img ? (team2Img.getAttribute('src') || team2Img.getAttribute('data-src')) : null;
                
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
                    channels: channels,
                    tournament: tournament,
                    page: pageNum,
                    position: index + 1,
                    scrapedAt: new Date().toISOString(),
                    watchServers: null
                };
                
                matches.push(match);
                console.log(`   ✓ ${index + 1}: ${match.title} (${match.status})`);
                
            } catch (error) {
                console.log(`   ✗ خطأ: ${error.message}`);
            }
        }
        
        return {
            url: url,
            matches: matches,
            totalMatches: matches.length,
            page: pageNum,
            scrapedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج روابط المشغل للمباريات ====================
async function fetchMatchesPlayers(matches) {
    console.log(`\n🔍 جلب روابط المشغل لـ ${matches.length} مباراة...`);
    
    const matchesWithPlayers = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title} (${match.status})`);
        
        // استخراج رابط المشغل للمباريات الجارية أو القادمة فقط
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            console.log(`   🔗 جلب الصفحة: ${match.url.substring(0, 80)}...`);
            
            const html = await fetchWithTimeout(match.url);
            
            if (html) {
                const player = extractPlayerFromHTML(html, match.url);
                
                matchesWithPlayers.push({
                    ...match,
                    watchServers: player
                });
                
                if (player) {
                    console.log(`   ✅ تم العثور على رابط المشغل`);
                } else {
                    console.log(`   ⚠️ لم يتم العثور على رابط مشغل`);
                }
            } else {
                console.log(`   ❌ فشل جلب صفحة المباراة`);
                matchesWithPlayers.push({
                    ...match,
                    watchServers: null
                });
            }
        } else {
            matchesWithPlayers.push({
                ...match,
                watchServers: null
            });
            console.log(`   ⏭️ مباراة منتهية`);
        }
        
        // انتظار قصير بين الطلبات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return matchesWithPlayers;
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(data) {
    try {
        // تنظيف البيانات بنفس الهيكل القديم
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
            
            // التأكد من وجود watchServers بالهيكل الصحيح
            if (!cleanMatch.watchServers) {
                cleanMatch.watchServers = null;
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
        
        // إحصائيات
        const liveMatches = cleanData.filter(m => m.status === "جارية الآن").length;
        const upcomingMatches = cleanData.filter(m => m.status === "لم تبدأ بعد").length;
        const finishedMatches = cleanData.filter(m => m.status === "انتهت").length;
        const matchesWithServers = cleanData.filter(m => m.watchServers && m.watchServers.length > 0).length;
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - المباريات بروابط مشغل: ${matchesWithServers}`);
        
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
        const pageData = await fetchMatchesFromPage(1);
        
        if (!pageData || pageData.matches.length === 0) {
            console.log("\n❌ لم يتم العثور على مباريات");
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
                scrapedAt: new Date().toISOString(),
                source: "https://koraplus.blog/",
                totalMatches: 0,
                matches: []
            }, null, 2));
            
            return { success: false, total: 0 };
        }
        
        const matchesWithPlayers = await fetchMatchesPlayers(pageData.matches);
        const savedData = saveToHgFile(matchesWithPlayers);
        
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
        console.error(`\n💥 خطأ: ${error.message}`);
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
            console.log(`المباريات بروابط مشغل: ${result.withServers}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
