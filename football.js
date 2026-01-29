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
        
        // 1. البحث عن iframes مباشرة (الطريقة الأساسية)
        const iframes = doc.querySelectorAll('iframe[src*="yallashootcup"], iframe[src*="stream"], iframe.video-iframe, iframe[src*="albaplayer"]');
        
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src');
            if (src) {
                // استخراج اسم السيرفر من الرابط
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
        
        // 2. البحث عن روابط في عناصر embed أو video
        const videoElements = doc.querySelectorAll('video, embed, object');
        videoElements.forEach(element => {
            const src = element.getAttribute('src') || element.getAttribute('data-src');
            if (src && (src.includes('stream') || src.includes('yallashoot') || src.includes('watch'))) {
                watchServers.push({
                    type: 'embed',
                    url: src,
                    quality: 'متعدد الجودات',
                    server: 'Embed Stream'
                });
            }
        });
        
        // 3. البحث عن روابط في scripts
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
            const scriptContent = script.textContent;
            if (scriptContent) {
                // البحث عن روابط stream
                const streamRegex = /(https?:\/\/[^"\s]*yallashoot[^"\s]*|https?:\/\/[^"\s]*stream[^"\s]*|https?:\/\/[^"\s]*watch[^"\s]*|https?:\/\/[^"\s]*player[^"\s]*)/gi;
                const matches = scriptContent.match(streamRegex);
                
                if (matches) {
                    matches.forEach(url => {
                        if (!url.includes('yalla1shoot.com')) { // استبعاد روابط الموقع نفسه
                            watchServers.push({
                                type: 'js_stream',
                                url: url,
                                quality: 'متعدد الجودات',
                                server: 'JavaScript Stream'
                            });
                        }
                    });
                }
            }
        });
        
        // 4. البحث في divs أو sections التي قد تحتوي على روابط
        const streamSections = doc.querySelectorAll('.stream-section, .video-container, .live-stream, .player-container');
        streamSections.forEach(section => {
            const links = section.querySelectorAll('a[href*="stream"], a[href*="watch"], a[href*="player"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href && (href.includes('stream') || href.includes('yallashoot') || href.includes('watch'))) {
                    watchServers.push({
                        type: 'direct_link',
                        url: href,
                        quality: 'متعدد الجودات',
                        server: 'Direct Stream'
                    });
                }
            });
        });
        
        // 5. البحث عن خيارات البث في select dropdowns
        const selectElements = doc.querySelectorAll('select[name*="server"], select[name*="quality"]');
        selectElements.forEach(select => {
            const options = select.querySelectorAll('option[value*="http"]');
            options.forEach(option => {
                const streamUrl = option.value;
                if (streamUrl && streamUrl.startsWith('http')) {
                    watchServers.push({
                        type: 'select_option',
                        url: streamUrl,
                        quality: option.textContent.trim() || 'متعدد الجودات',
                        server: 'Stream Option'
                    });
                }
            });
        });
        
        // 6. إزالة التكرارات
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
        
        // البحث عن جميع عناصر المباريات باستخدام الكلاس المحدد
        const matchElements = doc.querySelectorAll('.ay_84544a91.live');
        
        // إذا لم نجد، نحاول بطرق أخرى
        let allMatchElements = matchElements;
        if (matchElements.length === 0) {
            console.log(`   🔍 لم يتم العثور على عناصر .ay_84544a91.live، جاري البحث بطرق أخرى...`);
            
            // البحث بكلاسات أخرى
            allMatchElements = doc.querySelectorAll('div[class*="match"], div[class*="live"], .live-match, .match-item');
            
            // إذا لم نجد، نبحث عن عناصر تحتوي على معلومات المباريات
            if (allMatchElements.length === 0) {
                const possibleMatchContainers = doc.querySelectorAll('.row, .matches-list, .container, section');
                
                possibleMatchContainers.forEach(container => {
                    const hasTeamNames = container.textContent.match(/فريق|نادي|دوري|بطولة|مباراة/) || 
                                        container.querySelectorAll('img[alt*="team"], img[alt*="نادي"]').length > 0;
                    
                    if (hasTeamNames) {
                        // نعتبر هذا الحاوية كمباراة واحدة
                        allMatchElements = container.querySelectorAll('div, article');
                    }
                });
            }
        }
        
        console.log(`✅ عثر على ${allMatchElements.length} عنصر مباراة محتمل`);
        
        let matchCount = 0;
        
        allMatchElements.forEach((element, i) => {
            try {
                // التحقق مما إذا كان العنصر يحتوي على معلومات مباراة
                const elementText = element.textContent || "";
                const hasTeamInfo = elementText.includes("فريق") || 
                                  element.querySelector('img[alt*="team"]') || 
                                  element.querySelector('img[alt*="نادي"]') ||
                                  elementText.match(/\d+\s*-\s*\d+/); // نمط النتيجة
                
                if (!hasTeamInfo && element.children.length < 2) {
                    // تخطي العناصر التي لا تحتوي على معلومات مباراة
                    return;
                }
                
                // استخراج رابط المباراة
                const matchLink = element.querySelector('a[href*="matches"], a[href*="match"]');
                const matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    // محاولة العثور على رابط في العنصر نفسه
                    const parentLink = element.closest('a[href*="matches"], a[href*="match"]');
                    if (parentLink) {
                        matchUrl = parentLink.getAttribute('href');
                    }
                }
                
                if (!matchUrl || !matchUrl.includes('yalla1shoot.com')) {
                    console.log(`   ⚠️ تخطي عنصر ${i + 1} - لا يوجد رابط مباراة صالح`);
                    return;
                }
                
                // استخراج الفريق الأول
                let team1Name = "غير معروف";
                let team1Logo = null;
                
                // البحث عن فريق 1 بطرق مختلفة
                const team1Div = element.querySelector('.TM1, .team1, .home-team, div:first-child');
                if (team1Div) {
                    const team1NameElement = team1Div.querySelector('.ay_40c64b2c, .team-name, .name, span, div');
                    team1Name = team1NameElement ? team1NameElement.textContent.trim() : team1Div.textContent.trim();
                    
                    const team1LogoElement = team1Div.querySelector('img');
                    team1Logo = team1LogoElement ? team1LogoElement.src : null;
                    
                    // تنظيف اسم الفريق
                    team1Name = team1Name.replace(/\s+/g, ' ').trim();
                    if (team1Name.length > 50) {
                        team1Name = team1Name.substring(0, 50) + "...";
                    }
                }
                
                // استخراج الفريق الثاني
                let team2Name = "غير معروف";
                let team2Logo = null;
                
                const team2Div = element.querySelector('.TM2, .team2, .away-team, div:last-child');
                if (team2Div) {
                    const team2NameElement = team2Div.querySelector('.ay_40c64b2c, .team-name, .name, span, div');
                    team2Name = team2NameElement ? team2NameElement.textContent.trim() : team2Div.textContent.trim();
                    
                    const team2LogoElement = team2Div.querySelector('img');
                    team2Logo = team2LogoElement ? team2LogoElement.src : null;
                    
                    // تنظيف اسم الفريق
                    team2Name = team2Name.replace(/\s+/g, ' ').trim();
                    if (team2Name.length > 50) {
                        team2Name = team2Name.substring(0, 50) + "...";
                    }
                }
                
                // استخراج النتيجة
                let score = "0 - 0";
                let team1Score = "0";
                let team2Score = "0";
                
                // البحث عن النتيجة بطرق مختلفة
                const scoreElement = element.querySelector('.ay_db8b21c0, .score, .match-score, .result');
                if (scoreElement) {
                    const scoreText = scoreElement.textContent.trim();
                    
                    // محاولة استخراج الأرقام من النص
                    const scoreMatch = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
                    if (scoreMatch) {
                        team1Score = scoreMatch[1];
                        team2Score = scoreMatch[2];
                        score = `${team1Score} - ${team2Score}`;
                    } else {
                        score = scoreText;
                    }
                } else {
                    // البحث عن أي نص يحتوي على نمط نتيجة
                    const textContent = element.textContent;
                    const scoreMatch = textContent.match(/(\d+)\s*[-–]\s*(\d+)/);
                    if (scoreMatch) {
                        team1Score = scoreMatch[1];
                        team2Score = scoreMatch[2];
                        score = `${team1Score} - ${team2Score}`;
                    }
                }
                
                // استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = element.querySelector('.ay_9282e7ba, .time, .match-time, span.time');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.ay_89db7309, .status, .match-status, span.status');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                } else {
                    // تحديد الحالة بناءً على الوقت
                    if (matchTime.includes("جارية") || matchTime.includes("مباشر")) {
                        matchStatus = "جارية الآن";
                    } else if (matchTime.includes("انتهت") || matchTime.includes("نهائي")) {
                        matchStatus = "انتهت";
                    } else if (matchTime.includes("ملغاة")) {
                        matchStatus = "ملغاة";
                    } else {
                        matchStatus = "قادمة";
                    }
                }
                
                // استخراج القنوات
                const channels = [];
                const channelElements = element.querySelectorAll('li span, .channel, .tv-channel');
                channelElements.forEach(channel => {
                    const channelName = channel.textContent.trim();
                    if (channelName && channelName !== "غير معروف" && channelName.length < 100) {
                        channels.push(channelName);
                    }
                });
                
                // إذا لم نجد قنوات، نبحث في النص العام
                if (channels.length === 0) {
                    const textContent = element.textContent;
                    if (textContent.includes("beIN") || textContent.includes("قناة")) {
                        const beinMatch = textContent.match(/beIN[^,\n]*/);
                        if (beinMatch) {
                            channels.push(beinMatch[0].trim());
                        }
                    }
                }
                
                // استخراج البطولة
                let tournament = "غير معروف";
                const tournamentElements = element.querySelectorAll('li span, .tournament, .league');
                if (tournamentElements.length >= 3) {
                    tournament = tournamentElements[2].textContent.trim();
                } else {
                    // البحث عن أي نص يشير إلى بطولة
                    const textContent = element.textContent;
                    if (textContent.includes("دوري") || textContent.includes("بطولة") || textContent.includes("كأس")) {
                        const lines = textContent.split('\n');
                        for (const line of lines) {
                            if (line.includes("دوري") || line.includes("بطولة") || line.includes("كأس")) {
                                tournament = line.trim();
                                break;
                            }
                        }
                    }
                }
                
                // إنشاء كائن المباراة
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
                    watchServers: null // سيتم ملؤه لاحقاً
                };
                
                matches.push(match);
                matchCount++;
                console.log(`   ✓ ${matchCount}: ${match.title} (${match.status})`);
                
            } catch (error) {
                console.log(`   ✗ خطأ في استخراج عنصر ${i + 1}: ${error.message}`);
            }
        });
        
        console.log(`🎯 تم استخراج ${matchCount} مباراة حقيقية من ${allMatchElements.length} عنصر`);
        
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
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title}`);
        
        // جلب سيرفرات المشاهدة
        const watchServers = await fetchWatchServers(match.url);
        
        // إضافة سيرفرات المشاهدة إلى المباراة
        const matchWithDetails = {
            ...match,
            watchServers: watchServers
        };
        
        matchesWithDetails.push(matchWithDetails);
        
        console.log(`   ${watchServers ? `✅ ${watchServers.length} سيرفر مشاهدة` : '❌ لا توجد سيرفرات مشاهدة'}`);
        
        // انتظار قصير بين المباريات لتجنب الحظر
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return matchesWithDetails;
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(data) {
    try {
        // تنظيف البيانات من القيم الفارغة
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
            // إذا كانت مصفوفة فارغة، نحولها إلى null
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
        
        // عرض إحصائيات
        const matchesWithServers = cleanData.filter(match => match.watchServers && match.watchServers.length > 0).length;
        console.log(`📈 إحصائيات:`);
        console.log(`   - مباريات بها سيرفرات مشاهدة: ${matchesWithServers}/${cleanData.length}`);
        console.log(`   - مباريات بدون سيرفرات مشاهدة: ${cleanData.length - matchesWithServers}`);
        
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
        // جلب المباريات من الصفحة الأولى
        const pageData = await fetchMatchesFromPage(1);
        
        if (!pageData || pageData.matches.length === 0) {
            console.log("\n❌ لم يتم العثور على أي مباريات");
            
            // حفظ ملف فارغ لتوثيق الخطأ
            const errorData = {
                error: "لم يتم العثور على مباريات",
                scrapedAt: new Date().toISOString(),
                totalMatches: 0,
                matches: []
            };
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(errorData, null, 2));
            return { success: false, total: 0 };
        }
        
        // جلب تفاصيل كل المباريات (بما في ذلك سيرفرات المشاهدة)
        const matchesWithDetails = await fetchMatchesDetails(pageData.matches);
        
        // حفظ البيانات في Hg.json
        const savedData = saveToHgFile(matchesWithDetails);
        
        if (savedData) {
            // عرض عينة من البيانات المحفوظة
            console.log(`\n📋 عينة من البيانات المحفوظة:`);
            if (savedData.matches.length > 0) {
                const sampleMatch = savedData.matches[0];
                console.log(`   1. ${sampleMatch.title}`);
                console.log(`      النتيجة: ${sampleMatch.score}`);
                console.log(`      الحالة: ${sampleMatch.status}`);
                console.log(`      البطولة: ${sampleMatch.tournament}`);
                console.log(`      القنوات: ${sampleMatch.channels ? sampleMatch.channels.join(', ') : 'لا توجد'}`);
                
                if (sampleMatch.watchServers && sampleMatch.watchServers.length > 0) {
                    console.log(`      سيرفر مشاهدة متوفر: نعم (${sampleMatch.watchServers.length} سيرفر)`);
                    console.log(`      مثال: ${sampleMatch.watchServers[0].server} - ${sampleMatch.watchServers[0].url.substring(0, 50)}...`);
                } else {
                    console.log(`      سيرفر مشاهدة متوفر: لا (null)`);
                }
            }
            
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            
            return { 
                success: true, 
                total: savedData.matches.length,
                withServers: savedData.matches.filter(m => m.watchServers && m.watchServers.length > 0).length,
                filePath: OUTPUT_FILE 
            };
        }
        
        return { success: false, total: 0 };
        
    } catch (error) {
        console.error(`\n💥 خطأ غير متوقع: ${error.message}`);
        console.error(error.stack);
        
        // حفظ تقرير الخطأ
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
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
