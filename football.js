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
        
        // 1. البحث عن iframes مباشرة
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
        
        // ... باقي الكود كما هو
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
    
    // جرب مصادر الصورة بالترتيب
    const src = imgElement.getAttribute('src');
    const dataSrc = imgElement.getAttribute('data-src');
    const dataLazySrc = imgElement.getAttribute('data-lazy-src');
    
    // إرجاع أول رابط صالح
    if (src && src.startsWith('http')) return src;
    if (dataSrc && dataSrc.startsWith('http')) return dataSrc;
    if (dataLazySrc && dataLazySrc.startsWith('http')) return dataLazySrc;
    
    return null;
}

// ==================== دالة محسنة لاستخراج المباريات ====================
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
        
        // البحث في جميع الأقسام المحتملة
        const matchContainers = [
            ...doc.querySelectorAll('.ay_84544a91.live'),
            ...doc.querySelectorAll('.ay_e493c374.not-started'),
            ...doc.querySelectorAll('.ay_e493c374'),
            ...doc.querySelectorAll('[class*="ay_"][class*="flex"] > div')
        ];
        
        // البحث في قسم ayala- إذا وجد
        const ayalaSection = doc.getElementById('ayala-');
        if (ayalaSection) {
            matchContainers.push(...ayalaSection.querySelectorAll('.ay_e493c374'));
        }
        
        // إزالة التكرارات
        const uniqueContainers = [];
        const seenContainers = new Set();
        
        matchContainers.forEach(container => {
            if (container && !seenContainers.has(container)) {
                seenContainers.add(container);
                uniqueContainers.push(container);
            }
        });
        
        console.log(`✅ وجد ${uniqueContainers.length} حاوية مباراة`);
        
        let matchCount = 0;
        
        uniqueContainers.forEach((container, i) => {
            try {
                // 1. استخراج رابط المباراة
                const matchLink = container.querySelector('a[href*="matches"]') || 
                                 container.closest('a[href*="matches"]');
                const matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl || !matchUrl.includes('yalla1shoot.com')) {
                    return;
                }
                
                // 2. استخراج الفريق الأول بشكل دقيق
                let team1Name = "غير معروف";
                let team1Logo = null;
                
                // البحث عن العنصر المخصص للفريق الأول
                const team1Element = container.querySelector('.TM1, .team1, .home-team, [class*="TM1"], div:first-child');
                if (team1Element) {
                    // استخراج اسم الفريق الأول
                    const nameElements = team1Element.querySelectorAll('.ay_40c64b2c, .ay_2001c2c9, [class*="name"], span, div');
                    for (const el of nameElements) {
                        if (el.textContent && el.textContent.trim().length > 1) {
                            team1Name = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // إذا لم نجد اسم، نحاول من صورة alt
                    const team1Img = team1Element.querySelector('img');
                    if (team1Img && team1Img.alt && team1Img.alt !== team1Name) {
                        team1Logo = extractImageUrl(team1Img);
                    }
                }
                
                // البحث المباشر عن صورة الفريق الأول
                const team1ImgDirect = container.querySelector('.TM1 img, .team1 img, div:first-child img, [alt*="فريق"]:first-child');
                if (team1ImgDirect && !team1Logo) {
                    team1Logo = extractImageUrl(team1ImgDirect);
                }
                
                // 3. استخراج الفريق الثاني بشكل دقيق
                let team2Name = "غير معروف";
                let team2Logo = null;
                
                // البحث عن العنصر المخصص للفريق الثاني
                const team2Element = container.querySelector('.TM2, .team2, .away-team, [class*="TM2"], div:last-child');
                if (team2Element) {
                    // استخراج اسم الفريق الثاني
                    const nameElements = team2Element.querySelectorAll('.ay_40c64b2c, .ay_2001c2c9, [class*="name"], span, div');
                    for (const el of nameElements) {
                        if (el.textContent && el.textContent.trim().length > 1) {
                            team2Name = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // إذا لم نجد اسم، نحاول من صورة alt
                    const team2Img = team2Element.querySelector('img');
                    if (team2Img && team2Img.alt && team2Img.alt !== team2Name) {
                        team2Logo = extractImageUrl(team2Img);
                    }
                }
                
                // البحث المباشر عن صورة الفريق الثاني
                const team2ImgDirect = container.querySelector('.TM2 img, .team2 img, div:last-child img, [alt*="فريق"]:last-child');
                if (team2ImgDirect && !team2Logo) {
                    team2Logo = extractImageUrl(team2ImgDirect);
                }
                
                // 4. البحث البديل عن الصور إذا لم نجدها بالطريقة الأولى
                if (!team1Logo || !team2Logo) {
                    const allImgs = container.querySelectorAll('img');
                    const imgArray = Array.from(allImgs);
                    
                    // إذا وجدنا صورتين مختلفتين
                    if (imgArray.length >= 2) {
                        if (!team1Logo) team1Logo = extractImageUrl(imgArray[0]);
                        if (!team2Logo) team2Logo = extractImageUrl(imgArray[1]);
                    } else if (imgArray.length === 1) {
                        // إذا وجدنا صورة واحدة فقط
                        const img = imgArray[0];
                        const imgUrl = extractImageUrl(img);
                        if (!team1Logo) team1Logo = imgUrl;
                        if (!team2Logo) team2Logo = imgUrl; // نفس الصورة للفريقين
                    }
                }
                
                // 5. استخراج النتيجة
                let score = "0 - 0";
                let team1Score = "0";
                let team2Score = "0";
                
                const scoreElement = container.querySelector('.ay_db8b21c0, .ay_bb4ca825, [class*="score"]');
                if (scoreElement) {
                    const goalElements = scoreElement.querySelectorAll('.RS-goals, [class*="goal"]');
                    if (goalElements.length >= 2) {
                        team1Score = goalElements[0].textContent.trim();
                        team2Score = goalElements[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // 6. استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = container.querySelector('.ay_9282e7ba, .ay_f2456e5f, [class*="time"]');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // 7. استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = container.querySelector('.ay_89db7309, .ay_e91cfaec, [class*="status"]');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                }
                
                // 8. استخراج القنوات
                const channels = [];
                const channelElements = container.querySelectorAll('li span, [class*="channel"]');
                channelElements.forEach(channel => {
                    const channelName = channel.textContent.trim();
                    if (channelName && channelName !== "غير معروف") {
                        channels.push(channelName);
                    }
                });
                
                // 9. استخراج البطولة
                let tournament = "غير معروف";
                if (channelElements.length >= 3) {
                    tournament = channelElements[2].textContent.trim();
                }
                
                // 10. إنشاء كائن المباراة
                const matchId = `match_${Date.now()}_${matchCount}`;
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
                    position: matchCount + 1,
                    scrapedAt: new Date().toISOString(),
                    watchServers: null
                };
                
                matches.push(match);
                matchCount++;
                
                // عرض تفاصيل الاستخراج للتأكد
                console.log(`   ✓ ${matchCount}: ${match.title}`);
                console.log(`     الفريق 1: ${team1Name} ${team1Logo ? '✅' : '❌'}`);
                console.log(`     الفريق 2: ${team2Name} ${team2Logo ? '✅' : '❌'}`);
                console.log(`     الحالة: ${matchStatus} | الوقت: ${matchTime}`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في استخراج مباراة ${i + 1}: ${error.message}`);
            }
        });
        
        console.log(`🎯 تم استخراج ${matchCount} مباراة`);
        
        // إزالة التكرارات حسب الرابط
        const uniqueMatches = [];
        const seenUrls = new Set();
        
        matches.forEach(match => {
            if (!seenUrls.has(match.url)) {
                seenUrls.add(match.url);
                uniqueMatches.push(match);
            }
        });
        
        console.log(`🔍 بعد إزالة التكرارات: ${uniqueMatches.length} مباراة فريدة`);
        
        return {
            url: url,
            matches: uniqueMatches,
            totalMatches: uniqueMatches.length,
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
        
        // فقط للمباريات الجارية أو القادمة
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
            
            if (cleanMatch.channels && Array.isArray(cleanMatch.channels)) {
                cleanMatch.channels = cleanMatch.channels.filter(channel => 
                    channel && channel.trim() !== "" && channel !== "غير معروف"
                );
            }
            
            if (cleanMatch.tournament === "غير معروف" || !cleanMatch.tournament) {
                cleanMatch.tournament = "غير محدد";
            }
            
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
        
        // عرض تفاصيل الصور المستخرجة
        console.log(`\n🖼️ تفاصيل الصور المستخرجة:`);
        let logosFound = 0;
        let differentLogos = 0;
        
        cleanData.forEach((match, idx) => {
            if (match.team1.logo || match.team2.logo) {
                logosFound++;
                
                if (match.team1.logo && match.team2.logo && match.team1.logo !== match.team2.logo) {
                    differentLogos++;
                    
                    if (idx < 3) { // عرض أول 3 مباريات كمثال
                        console.log(`   ${match.title}:`);
                        console.log(`     ${match.team1.name}: ${match.team1.logo ? '✅' : '❌'}`);
                        console.log(`     ${match.team2.name}: ${match.team2.logo ? '✅' : '❌'}`);
                        
                        if (match.team1.logo && match.team2.logo) {
                            console.log(`     نفس الصورة؟ ${match.team1.logo === match.team2.logo ? 'نعم' : 'لا'}`);
                        }
                    }
                }
            }
        });
        
        console.log(`📈 إحصائيات الصور:`);
        console.log(`   - مباريات بها شعارات: ${logosFound}/${cleanData.length}`);
        console.log(`   - مباريات بشعارات مختلفة: ${differentLogos}`);
        
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
            console.log(`المباريات بشعارات: ${result.withLogos || 0}`);
            console.log(`المباريات بشعارات مختلفة: ${result.withDifferentLogos || 0}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
