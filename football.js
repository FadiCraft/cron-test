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

// ==================== دالة مساعدة للكشف عن نوع السيرفر ====================
function detectServerType(url) {
    if (!url) return "غير معروف";
    
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes("albaplayer")) return "AlbaPlayer";
    if (urlLower.includes("streamtape")) return "StreamTape";
    if (urlLower.includes("doodstream") || urlLower.includes("/dood/")) return "DoodStream";
    if (urlLower.includes("voe")) return "Voe";
    if (urlLower.includes("vidcloud")) return "VidCloud";
    if (urlLower.includes("koora")) return "Koora";
    if (urlLower.includes("on-time") || urlLower.includes("ontime")) return "OnTime";
    if (urlLower.includes("streamable")) return "Streamable";
    if (urlLower.includes("mixdrop")) return "MixDrop";
    if (urlLower.includes("vidoza")) return "Vidoza";
    if (urlLower.includes("upstream")) return "UpStream";
    if (urlLower.includes("player") && (urlLower.includes("stream") || urlLower.includes("play"))) return "Player";
    if (urlLower.includes(".m3u8")) return "M3U8";
    if (urlLower.includes(".mp4")) return "MP4";
    if (urlLower.includes("kk.pyxq.online")) return "KoraPlus";
    
    return "غير معروف";
}

// ==================== استخراج سيرفرات المشاهدة من صفحة المباراة ====================
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
        
        console.log(`   🔍 البحث عن سيرفرات المشاهدة...`);
        
        const servers = [];
        
        // استراتيجية 1: البحث عن iframes مباشرة
        const iframes = doc.querySelectorAll('iframe');
        console.log(`   🔍 فحص ${iframes.length} iframe`);
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src || src.trim() === '') continue;
            
            const serverType = detectServerType(src);
            console.log(`   🔍 وجد iframe: ${src.substring(0, 100)}...`);
            console.log(`   🔍 نوع السيرفر: ${serverType}`);
            
            if (serverType !== "غير معروف") {
                // تجنب التكرار
                const isDuplicate = servers.some(s => s.url === src.trim());
                if (!isDuplicate) {
                    console.log(`   ✅ وجد iframe: ${serverType} - ${src.substring(0, 80)}...`);
                    servers.push({
                        type: 'iframe',
                        url: src.trim(),
                        quality: "HD",
                        server: serverType,
                        id: `iframe_${servers.length + 1}`,
                        source: 'iframe'
                    });
                }
            }
        }
        
        // استراتيجية 2: البحث عن divs معينة قد تحتوي على روابط
        const playerDivs = doc.querySelectorAll('div[class*="player"], div[class*="Player"], div[class*="stream"], div[class*="Stream"], div[class*="embed"], div[class*="Embed"]');
        
        for (const div of playerDivs) {
            const html = div.innerHTML;
            
            // البحث عن src في iframes داخل div
            const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
            let match;
            while ((match = iframeRegex.exec(html)) !== null) {
                const url = match[1];
                const serverType = detectServerType(url);
                
                if (serverType !== "غير معروف") {
                    const isDuplicate = servers.some(s => s.url === url.trim());
                    if (!isDuplicate) {
                        console.log(`   ✅ وجد في div iframe: ${serverType} - ${url.substring(0, 80)}...`);
                        servers.push({
                            type: 'iframe',
                            url: url.trim(),
                            quality: "HD",
                            server: serverType,
                            id: `div_iframe_${servers.length + 1}`,
                            source: 'player_div'
                        });
                    }
                }
            }
        }
        
        // استراتيجية 3: البحث عن scripts التي تحتوي على روابط
        const scripts = doc.querySelectorAll('script');
        for (const script of scripts) {
            const content = script.textContent || script.innerHTML;
            if (content.includes('iframe') || content.includes('src') || 
                content.includes('albaplayer') || content.includes('ontime')) {
                
                // البحث عن روابط iframe في script
                const iframeRegex = /src=["'](https?:\/\/[^"']+)["']/g;
                const matches = content.match(iframeRegex);
                
                if (matches) {
                    for (const match of matches) {
                        const url = match.replace(/src=["']|["']/g, '');
                        const serverType = detectServerType(url);
                        
                        if (serverType !== "غير معروف") {
                            const isDuplicate = servers.some(s => s.url === url.trim());
                            if (!isDuplicate) {
                                console.log(`   ✅ وجد في script: ${serverType} - ${url.substring(0, 80)}...`);
                                servers.push({
                                    type: 'iframe',
                                    url: url.trim(),
                                    quality: "HD",
                                    server: serverType,
                                    id: `script_${servers.length + 1}`,
                                    source: 'script'
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // استراتيجية 4: البحث عن روابط مباشرة في الصفحة
        const allLinks = doc.querySelectorAll('a[href*="albaplayer"], a[href*="ontime"], a[href*="stream"], a[href*="player"]');
        
        for (const link of allLinks) {
            const href = link.getAttribute('href');
            if (href && href.includes('http')) {
                const serverType = detectServerType(href);
                if (serverType !== "غير معروف") {
                    const isDuplicate = servers.some(s => s.url === href.trim());
                    if (!isDuplicate) {
                        console.log(`   ✅ وجد في رابط a: ${serverType} - ${href.substring(0, 80)}...`);
                        servers.push({
                            type: 'direct',
                            url: href.trim(),
                            quality: "HD",
                            server: serverType,
                            id: `link_${servers.length + 1}`,
                            source: 'a_tag'
                        });
                    }
                }
            }
        }
        
        // ترشيح وإرجاع النتائج
        if (servers.length > 0) {
            console.log(`   📊 تم العثور على ${servers.length} سيرفر مشاهدة`);
            
            // عرض جميع السيرفرات الموجودة
            servers.forEach((server, index) => {
                console.log(`   ${index + 1}. ${server.server}: ${server.url.substring(0, 100)}...`);
            });
            
            return servers.slice(0, 3); // إرجاع أول 3 سيرفرات فقط
            
        } else {
            console.log(`   ⚠️ لم يتم العثور على أي سيرفرات مشاهدة`);
            
            // محاولة أخيرة: البحث عن أي إشارة لـ albaplayer أو ontime
            const pageContent = doc.body.innerHTML;
            const potentialDomains = ['kk.pyxq.online', 'albaplayer', 'ontime'];
            
            for (const domain of potentialDomains) {
                if (pageContent.includes(domain)) {
                    console.log(`   🔍 وجد إشارة إلى ${domain} في الصفحة`);
                    
                    // محاولة بناء رابط افتراضي
                    const potentialUrl = `https://kk.pyxq.online/albaplayer/ontime/`;
                    console.log(`   💡 رابط محتمل: ${potentialUrl}`);
                    
                    return [{
                        type: 'iframe',
                        url: potentialUrl,
                        quality: "HD",
                        server: "KoraPlus/AlbaPlayer",
                        id: 'potential_server',
                        source: 'auto_generated'
                    }];
                }
            }
            
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ خطأ في استخراج سيرفرات المشاهدة: ${error.message}`);
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
        
        // البحث عن جميع عناصر المباريات في الموقع الجديد
        const matchElements = doc.querySelectorAll('.match-container');
        
        console.log(`✅ وجد ${matchElements.length} عنصر مباراة`);
        
        for (let index = 0; index < matchElements.length; index++) {
            const element = matchElements[index];
            
            try {
                // استخراج رابط المباراة من العنصر
                const matchLink = element.querySelector('a');
                let matchUrl = matchLink ? matchLink.getAttribute('href') : null;
                
                if (!matchUrl) {
                    console.log(`   ⚠️ تخطي عنصر ${index + 1} - لا يوجد رابط`);
                    continue;
                }
                
                // استخراج أسماء الفريقين
                const team1NameElem = element.querySelector('.right-team .team-name');
                const team2NameElem = element.querySelector('.left-team .team-name');
                
                let team1Name = team1NameElem ? team1NameElem.textContent.trim() : "غير معروف";
                let team2Name = team2NameElem ? team2NameElem.textContent.trim() : "غير معروف";
                
                // استخراج شعارات الفريقين
                const team1Img = element.querySelector('.right-team img');
                const team2Img = element.querySelector('.left-team img');
                
                let team1Logo = team1Img ? team1Img.getAttribute('src') || team1Img.getAttribute('data-src') : null;
                let team2Logo = team2Img ? team2Img.getAttribute('src') || team2Img.getAttribute('data-src') : null;
                
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
                            // العنصر الثالث هو البطولة والمنطقة
                            tournament = text;
                        }
                    }
                });
                
                // تنظيف البطولة (إزالة اسم الدولة إذا كانت موجودة)
                if (tournament.includes(',')) {
                    tournament = tournament.split(',').slice(1).join(',').trim();
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
                    channels: channels,
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
                console.log(`     البطولة: ${tournament}`);
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
                const watchServers = await fetchWatchServers(match.url);
                
                const matchWithDetails = {
                    ...match,
                    watchServers: watchServers
                };
                
                matchesWithDetails.push(matchWithDetails);
                
                if (watchServers && watchServers.length > 0) {
                    console.log(`   ✅ تم العثور على ${watchServers.length} سيرفر مشاهدة`);
                    watchServers.forEach((server, idx) => {
                        console.log(`     ${idx + 1}. ${server.server}: ${server.url.substring(0, 80)}...`);
                    });
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
            
            // تنظيف watchServers
            if (cleanMatch.watchServers && Array.isArray(cleanMatch.watchServers)) {
                cleanMatch.watchServers = cleanMatch.watchServers.map(server => {
                    // إزالة خاصية source إذا كانت موجودة
                    const { source, ...serverWithoutSource } = server;
                    return serverWithoutSource;
                });
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
        console.log(`   - المباريات بسيرفرات مشاهدة: ${matchesWithServers}/${liveMatches + upcomingMatches}`);
        
        // عرض أمثلة
        console.log(`\n📋 أمثلة على المباريات المستخرجة:`);
        cleanData.slice(0, 3).forEach((match, idx) => {
            console.log(`\n   ${idx + 1}. ${match.title}`);
            console.log(`     الحالة: ${match.status} | النتيجة: ${match.score}`);
            console.log(`     البطولة: ${match.tournament}`);
            console.log(`     الرابط: ${match.url.substring(0, 80)}...`);
            if (match.watchServers && match.watchServers.length > 0) {
                console.log(`     السيرفرات: ${match.watchServers.length} سيرفر`);
                match.watchServers.forEach((server, sIdx) => {
                    console.log(`       ${sIdx + 1}. ${server.server}: ${server.url.substring(0, 80)}...`);
                });
            } else {
                console.log(`     السيرفرات: لا يوجد`);
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
    console.log("⚽ بدء استخراج المباريات من koraplus.blog");
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
