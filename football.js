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

// ==================== استخراج جميع المباريات من الصفحة ====================
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
        
        // البحث عن جميع أنواع عناصر المباريات
        const matchSelectors = [
            '.ay_84544a91.live',          // المباريات الجارية
            '.ay_e493c374.not-started',   // المباريات التي لم تبدأ بعد
            '.ay_e493c374.finished',      // المباريات المنتهية (إن وجدت)
            '[class*="match"]',           // أي عنصر يحتوي على match
            '[class*="ay_"]'              // أي عنصر يبدأ بـ ay_
        ];
        
        let allMatchElements = [];
        
        // تجربة جميع المحددات
        for (const selector of matchSelectors) {
            const elements = doc.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`🔍 وجد ${elements.length} عنصر باستخدام: ${selector}`);
                elements.forEach(element => {
                    // تجنب التكرار
                    if (!allMatchElements.includes(element)) {
                        allMatchElements.push(element);
                    }
                });
            }
        }
        
        // البحث في قسم ayala- المحدد
        const ayalaSection = doc.getElementById('ayala-');
        if (ayalaSection) {
            console.log(`🎯 وجد قسم ayala-`);
            const ayalaMatches = ayalaSection.querySelectorAll('.ay_e493c374');
            ayalaMatches.forEach(match => {
                if (!allMatchElements.includes(match)) {
                    allMatchElements.push(match);
                }
            });
        }
        
        // البحث في أقسام أخرى محتملة
        const possibleSections = doc.querySelectorAll('.albaflex, .matches-section, .live-matches, .fixtures');
        possibleSections.forEach(section => {
            const sectionMatches = section.querySelectorAll('[class*="ay_"]');
            sectionMatches.forEach(match => {
                if (!allMatchElements.includes(match)) {
                    allMatchElements.push(match);
                }
            });
        });
        
        console.log(`✅ إجمالي العناصر الممكنة: ${allMatchElements.length}`);
        
        let matchCount = 0;
        
        allMatchElements.forEach((element, i) => {
            try {
                // تخطي العناصر الصغيرة التي لا تحتوي على بيانات كافية
                if (!element.textContent || element.textContent.trim().length < 20) {
                    return;
                }
                
                // استخراج رابط المباراة
                let matchUrl = null;
                
                // البحث عن رابط في العنصر نفسه
                const linkInElement = element.querySelector('a[href*="matches"]');
                if (linkInElement) {
                    matchUrl = linkInElement.getAttribute('href');
                }
                
                // إذا لم نجد، نبحث في العنصر الأم
                if (!matchUrl) {
                    const parentLink = element.closest('a[href*="matches"]');
                    if (parentLink) {
                        matchUrl = parentLink.getAttribute('href');
                    }
                }
                
                if (!matchUrl || !matchUrl.includes('yalla1shoot.com')) {
                    console.log(`   ⚠️ تخطي عنصر ${i + 1} - لا يوجد رابط مباراة صالح`);
                    return;
                }
                
                // استخراج أسماء الفرق
                let team1Name = "غير معروف";
                let team2Name = "غير معروف";
                
                // البحث عن أسماء الفرق بطرق مختلفة
                const teamNames = element.textContent.match(/[أ-ي]+\s+[أ-ي]*/g);
                if (teamNames && teamNames.length >= 2) {
                    team1Name = teamNames[0].trim();
                    team2Name = teamNames[1].trim();
                }
                
                // البحث عن أسماء الفرق في عناصر محددة
                const team1Elements = element.querySelectorAll('.TM1, .team1, .home-team, div:first-child');
                const team2Elements = element.querySelectorAll('.TM2, .team2, .away-team, div:last-child');
                
                team1Elements.forEach(teamEl => {
                    const nameEl = teamEl.querySelector('.ay_40c64b2c, .ay_2001c2c9, .team-name, .name');
                    if (nameEl && nameEl.textContent.trim().length > 1) {
                        team1Name = nameEl.textContent.trim();
                    }
                });
                
                team2Elements.forEach(teamEl => {
                    const nameEl = teamEl.querySelector('.ay_40c64b2c, .ay_2001c2c9, .team-name, .name');
                    if (nameEl && nameEl.textContent.trim().length > 1) {
                        team2Name = nameEl.textContent.trim();
                    }
                });
                
                // استخراج شعارات الفرق
                let team1Logo = null;
                let team2Logo = null;
                
                // البحث عن صور الفريق الأول
                const team1Img = element.querySelector('.TM1 img, .team1 img, .home-team img, div:first-child img');
                if (team1Img) {
                    team1Logo = extractImageUrl(team1Img);
                }
                
                // البحث عن صور الفريق الثاني
                const team2Img = element.querySelector('.TM2 img, .team2 img, .away-team img, div:last-child img');
                if (team2Img) {
                    team2Logo = extractImageUrl(team2Img);
                }
                
                // إذا لم نجد، نبحث في العناصر الداخلية
                if (!team1Logo) {
                    const allImgs = element.querySelectorAll('img');
                    allImgs.forEach(img => {
                        if (!team1Logo && img.alt && (img.alt.includes(team1Name) || team1Name.includes(img.alt))) {
                            team1Logo = extractImageUrl(img);
                        }
                    });
                }
                
                if (!team2Logo) {
                    const allImgs = element.querySelectorAll('img');
                    allImgs.forEach(img => {
                        if (!team2Logo && img.alt && (img.alt.includes(team2Name) || team2Name.includes(img.alt))) {
                            team2Logo = extractImageUrl(img);
                        }
                    });
                }
                
                // استخراج النتيجة
                let score = "0 - 0";
                let team1Score = "0";
                let team2Score = "0";
                
                // البحث عن النتيجة في عناصر محددة
                const scoreElement = element.querySelector('.ay_db8b21c0, .ay_bb4ca825, .score, .match-score, .result');
                if (scoreElement) {
                    const goalElements = scoreElement.querySelectorAll('.RS-goals, .goal, .score-number');
                    if (goalElements.length >= 2) {
                        team1Score = goalElements[0].textContent.trim();
                        team2Score = goalElements[1].textContent.trim();
                        score = `${team1Score} - ${team2Score}`;
                    } else {
                        // محاولة استخراج من النص
                        const scoreText = scoreElement.textContent.trim();
                        const scoreMatch = scoreText.match(/(\d+)\s*[-–]\s*(\d+)/);
                        if (scoreMatch) {
                            team1Score = scoreMatch[1];
                            team2Score = scoreMatch[2];
                            score = `${team1Score} - ${team2Score}`;
                        }
                    }
                }
                
                // استخراج الوقت
                let matchTime = "غير معروف";
                const timeElement = element.querySelector('.ay_9282e7ba, .ay_f2456e5f, .time, .match-time, span.time');
                if (timeElement) {
                    matchTime = timeElement.textContent.trim();
                }
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.ay_89db7309, .ay_e91cfaec, .status, .match-status, span.status');
                if (statusElement) {
                    matchStatus = statusElement.textContent.trim();
                } else {
                    // تحديد الحالة من الكلاس
                    if (element.classList.contains('live')) {
                        matchStatus = "جارية الآن";
                    } else if (element.classList.contains('not-started')) {
                        matchStatus = "لم تبدأ بعد";
                    } else if (element.classList.contains('finished')) {
                        matchStatus = "انتهت";
                    }
                }
                
                // استخراج القنوات
                const channels = [];
                const channelElements = element.querySelectorAll('li span, .channel, .tv-channel');
                channelElements.forEach(channel => {
                    const channelName = channel.textContent.trim();
                    if (channelName && channelName !== "غير معروف" && !channelName.includes("أخبار")) {
                        channels.push(channelName);
                    }
                });
                
                // استخراج البطولة
                let tournament = "غير معروف";
                const tournamentElements = element.querySelectorAll('li span, .tournament, .league');
                if (tournamentElements.length >= 3) {
                    tournament = tournamentElements[2].textContent.trim();
                } else {
                    // البحث في النص
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
        
        console.log(`🎯 تم استخراج ${matchCount} مباراة من ${allMatchElements.length} عنصر`);
        
        // إزالة التكرارات
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
        
        // فقط المباريات الجارية أو التي على وشك البدء نبحث لها عن سيرفرات
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد" || match.status.includes("مباشر")) {
            const watchServers = await fetchWatchServers(match.url);
            
            // إضافة سيرفرات المشاهدة إلى المباراة
            const matchWithDetails = {
                ...match,
                watchServers: watchServers
            };
            
            matchesWithDetails.push(matchWithDetails);
            
            console.log(`   ${watchServers ? `✅ ${watchServers.length} سيرفر مشاهدة` : '❌ لا توجد سيرفرات مشاهدة'}`);
        } else {
            // للمباريات المنتهية أو الملغاة، نضع null
            const matchWithDetails = {
                ...match,
                watchServers: null
            };
            
            matchesWithDetails.push(matchWithDetails);
            console.log(`   ⏭️ ${match.status} - تم وضع null للسيرفرات`);
        }
        
        // انتظار قصير بين المباريات لتجنب الحظر
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
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
        const matchesByStatus = {
            live: cleanData.filter(m => m.status === "جارية الآن").length,
            upcoming: cleanData.filter(m => m.status === "لم تبدأ بعد").length,
            finished: cleanData.filter(m => m.status === "انتهت").length,
            unknown: cleanData.filter(m => m.status === "غير معروف").length
        };
        
        const matchesWithServers = cleanData.filter(match => match.watchServers && match.watchServers.length > 0).length;
        
        console.log(`📈 إحصائيات:`);
        console.log(`   - مباريات جارية: ${matchesByStatus.live}`);
        console.log(`   - مباريات قادمة: ${matchesByStatus.upcoming}`);
        console.log(`   - مباريات منتهية: ${matchesByStatus.finished}`);
        console.log(`   - مباريات غير معروفة: ${matchesByStatus.unknown}`);
        console.log(`   - مباريات بها سيرفرات مشاهدة: ${matchesWithServers}/${cleanData.length}`);
        
        // عرض عينة من البيانات المحفوظة
        console.log(`\n📋 عينة من المباريات المستخرجة:`);
        if (cleanData.length > 0) {
            const liveMatches = cleanData.filter(m => m.status === "جارية الآن");
            const upcomingMatches = cleanData.filter(m => m.status === "لم تبدأ بعد");
            
            if (liveMatches.length > 0) {
                console.log(`   🔴 المباريات الجارية:`);
                liveMatches.slice(0, 2).forEach((match, idx) => {
                    console.log(`     ${idx + 1}. ${match.title} - ${match.score}`);
                });
            }
            
            if (upcomingMatches.length > 0) {
                console.log(`   ⏳ المباريات القادمة:`);
                upcomingMatches.slice(0, 2).forEach((match, idx) => {
                    console.log(`     ${idx + 1}. ${match.title} - ${match.time}`);
                });
            }
        }
        
        return outputData;
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج جميع المباريات من yalla1shoot.com");
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
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            
            return { 
                success: true, 
                total: savedData.matches.length,
                live: savedData.matches.filter(m => m.status === "جارية الآن").length,
                upcoming: savedData.matches.filter(m => m.status === "لم تبدأ بعد").length,
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
            console.log(`المباريات الجارية: ${result.live || 0}`);
            console.log(`المباريات القادمة: ${result.upcoming || 0}`);
            console.log(`المباريات بسيرفرات: ${result.withServers || 0}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
