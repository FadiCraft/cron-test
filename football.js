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
                'Referer': 'https://www.yalla1shoot.com/',
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

// ==================== استخراج سيرفرات المشاهدة من صفحة المباراة ====================
async function fetchWatchServers(matchUrl) {
    console.log(`   🔍 جلب سيرفرات المشاهدة...`);
    
    const html = await fetchWithTimeout(matchUrl);
    
    if (!html) {
        console.log(`   ⚠️ فشل جلب صفحة المباراة`);
        return null;
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const watchServers = [];
        
        // البحث عن iframes مباشرة
        const iframes = doc.querySelectorAll('iframe[src*="yallashootcup"], iframe[src*="stream"], iframe.video-iframe, iframe[src*="albaplayer"]');
        
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src) {
                let serverName = "YallaShoot";
                if (src.includes("albaplayer")) {
                    serverName = "AlbaPlayer";
                } else if (src.includes("stream")) {
                    serverName = "Stream Server";
                }
                
                watchServers.push({
                    type: 'iframe',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: serverName
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
            return uniqueServers;
        } else {
            console.log(`   ⚠️ لم يتم العثور على سيرفرات مشاهدة`);
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
    if (dataSrc && dataSrc.startsWith('http')) return dataSrc;
    
    return null;
}

// ==================== استخراج المباريات من الصفحة ====================
async function fetchMatchesFromPage(pageNum = 1) {
    const baseUrl = "https://www.yalla1shoot.com/home_8/";
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
        
        // البحث عن جميع عناصر المباريات بالكلاسات المحددة
        const matchElements = doc.querySelectorAll('.ay_e493c374.not-started, .ay_84544a91.live, [class*="ay_"][class*="flex"]');
        
        console.log(`✅ وجد ${matchElements.length} عنصر مباراة`);
        
        matchElements.forEach((element, index) => {
            try {
                // استخراج رابط المباراة
                const matchLink = element.querySelector('a[href*="matches"]') || element.closest('a[href*="matches"]');
                const matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    return;
                }
                
                // استخراج الفريق الأول من العنصر الصحيح
                let team1Name = "غير معروف";
                let team1Logo = null;
                
                // البحث في العناصر الصحيحة للفريق الأول
                const team1Div = element.querySelector('.TM1');
                if (team1Div) {
                    // استخراج اسم الفريق الأول من .ay_2001c2c9
                    const team1NameElement = team1Div.querySelector('.ay_2001c2c9');
                    if (team1NameElement) {
                        team1Name = team1NameElement.textContent.trim();
                    }
                    
                    // استخراج شعار الفريق الأول
                    const team1Img = team1Div.querySelector('img');
                    if (team1Img) {
                        team1Logo = extractImageUrl(team1Img);
                        // إذا كان هناك alt، يمكن استخدامه كاسم احتياطي
                        if (!team1Name || team1Name === "غير معروف") {
                            team1Name = team1Img.alt || team1Name;
                        }
                    }
                }
                
                // استخراج الفريق الثاني من العنصر الصحيح
                let team2Name = "غير معروف";
                let team2Logo = null;
                
                const team2Div = element.querySelector('.TM2');
                if (team2Div) {
                    // استخراج اسم الفريق الثاني من .ay_2001c2c9
                    const team2NameElement = team2Div.querySelector('.ay_2001c2c9');
                    if (team2NameElement) {
                        team2Name = team2NameElement.textContent.trim();
                    }
                    
                    // استخراج شعار الفريق الثاني
                    const team2Img = team2Div.querySelector('img');
                    if (team2Img) {
                        team2Logo = extractImageUrl(team2Img);
                        // إذا كان هناك alt، يمكن استخدامه كاسم احتياطي
                        if (!team2Name || team2Name === "غير معروف") {
                            team2Name = team2Img.alt || team2Name;
                        }
                    }
                }
                
                // استخراج النتيجة
                let score = "0 - 0";
                let team1Score = "0";
                let team2Score = "0";
                
                const scoreElement = element.querySelector('.ay_bb4ca825, .ay_db8b21c0');
                if (scoreElement) {
                    const goals = scoreElement.querySelectorAll('.RS-goals');
                    if (goals.length >= 2) {
                        team1Score = goals[0].textContent.trim();
                        team2Score = goals[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = element.querySelector('.ay_f2456e5f, .ay_9282e7ba');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.ay_e91cfaec, .ay_89db7309');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                }
                
                // استخراج القنوات
                const channels = [];
                const channelContainer = element.querySelector('.ay_d2e59ec8, .ay_b222172d');
                if (channelContainer) {
                    const channelItems = channelContainer.querySelectorAll('li span');
                    channelItems.forEach(item => {
                        const channelName = item.textContent.trim();
                        if (channelName && channelName !== "غير معروف") {
                            channels.push(channelName);
                        }
                    });
                }
                
                // استخراج البطولة (عادة العنصر الثالث في القائمة)
                let tournament = "غير معروف";
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
                    watchServers: null
                };
                
                matches.push(match);
                
                // عرض تفاصيل الاستخراج
                console.log(`   ✓ ${index + 1}: ${match.title}`);
                console.log(`     الفريق 1: ${team1Name} ${team1Logo ? '✅' : '❌'}`);
                console.log(`     الفريق 2: ${team2Name} ${team2Logo ? '✅' : '❌'}`);
                console.log(`     النتيجة: ${score} | الوقت: ${matchTime} | الحالة: ${matchStatus}`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في استخراج مباراة ${index + 1}: ${error.message}`);
            }
        });
        
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
        
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            const watchServers = await fetchWatchServers(match.url);
            
            const matchWithDetails = {
                ...match,
                watchServers: watchServers
            };
            
            matchesWithDetails.push(matchWithDetails);
            
            console.log(`   ${watchServers ? `✅ ${watchServers.length} سيرفر مشاهدة` : '❌ لا توجد سيرفرات مشاهدة'}`);
        } else {
            const matchWithDetails = {
                ...match,
                watchServers: null
            };
            
            matchesWithDetails.push(matchWithDetails);
            console.log(`   ⏭️ ${match.status} - تم وضع null للسيرفرات`);
        }
        
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
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
            }
            
            // تنظيف البطولة
            if (cleanMatch.tournament === "غير معروف" || !cleanMatch.tournament) {
                cleanMatch.tournament = "غير محدد";
            }
            
            // إذا كانت watchServers هي null، نتركها null
            if (cleanMatch.watchServers && Array.isArray(cleanMatch.watchServers) && cleanMatch.watchServers.length === 0) {
                cleanMatch.watchServers = null;
            }
            
            return cleanMatch;
        });
        
        const outputData = {
            scrapedAt: new Date().toISOString(),
            source: "https://www.yalla1shoot.com/home_8/",
            totalMatches: cleanData.length,
            matches: cleanData
        };
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
        
        const stats = fs.statSync(OUTPUT_FILE);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        
        console.log(`\n✅ تم حفظ البيانات في ${OUTPUT_FILE}`);
        console.log(`📊 إجمالي المباريات: ${cleanData.length}`);
        console.log(`💾 حجم الملف: ${fileSizeKB} كيلوبايت`);
        
        // عرض إحصائيات مفصلة عن الصور
        console.log(`\n🖼️ إحصائيات الصور المستخرجة:`);
        
        let logosCount = 0;
        let differentLogosCount = 0;
        
        cleanData.forEach((match, idx) => {
            const hasTeam1Logo = match.team1.logo ? '✅' : '❌';
            const hasTeam2Logo = match.team2.logo ? '✅' : '❌';
            
            if (match.team1.logo || match.team2.logo) logosCount++;
            if (match.team1.logo && match.team2.logo && match.team1.logo !== match.team2.logo) differentLogosCount++;
            
            // عرض أول 3 مباريات كمثال
            if (idx < 3) {
                console.log(`   ${idx + 1}. ${match.title}`);
                console.log(`     ${match.team1.name}: ${hasTeam1Logo} ${match.team1.logo ? match.team1.logo.substring(0, 50) + '...' : ''}`);
                console.log(`     ${match.team2.name}: ${hasTeam2Logo} ${match.team2.logo ? match.team2.logo.substring(0, 50) + '...' : ''}`);
                
                if (match.team1.logo && match.team2.logo) {
                    const sameLogo = match.team1.logo === match.team2.logo;
                    console.log(`     نفس الصورة؟ ${sameLogo ? 'نعم ⚠️' : 'لا ✅'}`);
                }
            }
        });
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - مباريات بشعارات: ${logosCount}/${cleanData.length}`);
        console.log(`   - مباريات بشعارات مختلفة: ${differentLogosCount}`);
        
        return outputData;
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج المباريات من yalla1shoot.com");
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
                withLogos: savedData.matches.filter(m => m.team1.logo || m.team2.logo).length,
                withDifferentLogos: savedData.matches.filter(m => m.team1.logo && m.team2.logo && m.team1.logo !== m.team2.logo).length,
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
            console.log(`المباريات الجارية: ${result.live || 0}`);
            console.log(`المباريات القادمة: ${result.upcoming || 0}`);
            console.log(`المباريات بشعارات: ${result.withLogos || 0}`);
            console.log(`المباريات بشعارات مختلفة: ${result.withDifferentLogos || 0}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
