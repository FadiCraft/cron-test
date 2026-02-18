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
    if (urlLower.includes("gomatch")) return "GoMatch";
    
    return "غير معروف";
}

// ==================== استخراج رابط البث النهائي من الصفحات الوسيطة ====================
async function extractFinalStreamUrl(intermediateUrl, depth = 0) {
    // منع التكرار اللانهائي (حد أقصى 3 مستويات)
    if (depth > 3) {
        console.log(`   ⚠️ وصلنا للحد الأقصى من العمق (3 مستويات)`);
        return {
            type: 'intermediate',
            url: intermediateUrl,
            server: detectServerType(intermediateUrl),
            note: 'وصلنا للحد الأقصى من العمق'
        };
    }
    
    console.log(`   ${'  '.repeat(depth)}🔍 محاولة استخراج الرابط النهائي من: ${intermediateUrl.substring(0, 80)}...`);
    
    // إذا كان الرابط مباشراً (ينتهي بـ .m3u8 أو .mp4)
    if (intermediateUrl.includes('.m3u8') || intermediateUrl.includes('.mp4')) {
        console.log(`   ${'  '.repeat(depth)}✅ رابط مباشر: ${intermediateUrl.substring(0, 80)}...`);
        return {
            type: 'direct',
            url: intermediateUrl,
            server: intermediateUrl.includes('.m3u8') ? 'M3U8' : 'MP4'
        };
    }
    
    // جلب الصفحة الوسيطة
    const html = await fetchWithTimeout(intermediateUrl);
    if (!html) {
        return {
            type: 'intermediate',
            url: intermediateUrl,
            server: detectServerType(intermediateUrl),
            error: 'فشل جلب الصفحة'
        };
    }
    
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // استراتيجية 1: البحث عن iframe داخل الصفحة
        const iframes = doc.querySelectorAll('iframe');
        console.log(`   ${'  '.repeat(depth)}🔍 فحص ${iframes.length} iframe في الصفحة الوسيطة`);
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src) continue;
            
            // التعامل مع الروابط النسبية
            const fullUrl = src.startsWith('http') ? src : new URL(src, intermediateUrl).href;
            
            // إذا كان الرابط الجديد لا يزال وسيطاً، نتعمق أكثر
            if (fullUrl.includes('gomatch') || fullUrl.includes('albaplayer') || fullUrl.includes('ontime')) {
                const deeperResult = await extractFinalStreamUrl(fullUrl, depth + 1);
                if (deeperResult && deeperResult.type === 'direct') {
                    return deeperResult;
                }
            }
            
            // فحص إذا كان رابط بث مباشر
            if (fullUrl.includes('.m3u8') || fullUrl.includes('.mp4')) {
                console.log(`   ${'  '.repeat(depth)}✅ وجد رابط مباشر في iframe: ${fullUrl.substring(0, 80)}...`);
                return {
                    type: 'direct',
                    url: fullUrl,
                    server: fullUrl.includes('.m3u8') ? 'M3U8' : 'MP4'
                };
            }
        }
        
        // استراتيجية 2: البحث في script tags عن روابط البث
        const scripts = doc.querySelectorAll('script');
        for (const script of scripts) {
            const content = script.textContent || script.innerHTML;
            
            // البحث عن روابط .m3u8 في محتوى script
            const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
            const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g;
            
            let match;
            while ((match = m3u8Regex.exec(content)) !== null) {
                console.log(`   ${'  '.repeat(depth)}✅ وجد رابط M3U8 في script`);
                return {
                    type: 'direct',
                    url: match[1],
                    server: 'M3U8'
                };
            }
            
            while ((match = mp4Regex.exec(content)) !== null) {
                console.log(`   ${'  '.repeat(depth)}✅ وجد رابط MP4 في script`);
                return {
                    type: 'direct',
                    url: match[1],
                    server: 'MP4'
                };
            }
            
            // البحث عن روابط iframe داخل script
            const iframeRegex = /src=["'](https?:\/\/[^"']+)["']/g;
            while ((match = iframeRegex.exec(content)) !== null) {
                const url = match[1];
                if (url.includes('gomatch') || url.includes('albaplayer') || url.includes('ontime')) {
                    const deeperResult = await extractFinalStreamUrl(url, depth + 1);
                    if (deeperResult && deeperResult.type === 'direct') {
                        return deeperResult;
                    }
                }
            }
        }
        
        // استراتيجية 3: البحث عن عناصر video
        const videos = doc.querySelectorAll('video source, video');
        for (const video of videos) {
            const src = video.getAttribute('src') || video.getAttribute('data-src');
            if (src && (src.includes('.m3u8') || src.includes('.mp4'))) {
                const fullUrl = src.startsWith('http') ? src : new URL(src, intermediateUrl).href;
                console.log(`   ${'  '.repeat(depth)}✅ وجد رابط مباشر في video tag`);
                return {
                    type: 'direct',
                    url: fullUrl,
                    server: src.includes('.m3u8') ? 'M3U8' : 'MP4'
                };
            }
        }
        
        // استراتيجية 4: البحث في meta tags
        const metaTags = doc.querySelectorAll('meta[property="og:video"], meta[name="twitter:player"]');
        for (const meta of metaTags) {
            const content = meta.getAttribute('content');
            if (content && (content.includes('.m3u8') || content.includes('.mp4'))) {
                console.log(`   ${'  '.repeat(depth)}✅ وجد رابط مباشر في meta tag`);
                return {
                    type: 'direct',
                    url: content,
                    server: content.includes('.m3u8') ? 'M3U8' : 'MP4'
                };
            }
        }
        
        // إذا لم نجد رابطاً مباشراً، نعيد الرابط الأصلي مع ملاحظة
        console.log(`   ${'  '.repeat(depth)}⚠️ لم يتم العثور على رابط مباشر في الصفحة الوسيطة`);
        return {
            type: 'intermediate',
            url: intermediateUrl,
            server: detectServerType(intermediateUrl),
            note: 'هذا رابط صفحة وسيطة، قد يحتاج إلى زيارة للحصول على البث المباشر'
        };
        
    } catch (error) {
        console.log(`   ${'  '.repeat(depth)}❌ خطأ في استخراج الرابط النهائي: ${error.message}`);
        return {
            type: 'intermediate',
            url: intermediateUrl,
            server: detectServerType(intermediateUrl),
            error: error.message
        };
    }
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
        const processedUrls = new Set(); // لتجنب التكرار
        
        // استراتيجية 1: البحث عن iframes مباشرة
        const iframes = doc.querySelectorAll('iframe');
        console.log(`   🔍 فحص ${iframes.length} iframe`);
        
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (!src || src.trim() === '') continue;
            
            const fullUrl = src.startsWith('http') ? src : new URL(src, matchUrl).href;
            
            if (processedUrls.has(fullUrl)) continue;
            processedUrls.add(fullUrl);
            
            console.log(`   🔍 وجد iframe: ${fullUrl.substring(0, 100)}...`);
            
            // محاولة استخراج الرابط النهائي
            const finalStream = await extractFinalStreamUrl(fullUrl);
            
            if (finalStream) {
                console.log(`   ✅ تم استخراج الرابط النهائي: ${finalStream.url.substring(0, 100)}...`);
                
                servers.push({
                    type: finalStream.type,
                    url: finalStream.url,
                    quality: "HD",
                    server: finalStream.server || detectServerType(finalStream.url),
                    id: `stream_${servers.length + 1}`,
                    source: 'iframe',
                    intermediateUrl: finalStream.type === 'intermediate' ? fullUrl : undefined
                });
            }
        }
        
        // استراتيجية 2: البحث في scripts عن روابط مباشرة
        const scripts = doc.querySelectorAll('script');
        console.log(`   🔍 فحص ${scripts.length} script`);
        
        for (const script of scripts) {
            const content = script.textContent || script.innerHTML;
            
            // البحث عن روابط .m3u8
            const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/g;
            let match;
            while ((match = m3u8Regex.exec(content)) !== null) {
                const url = match[1];
                if (!processedUrls.has(url)) {
                    processedUrls.add(url);
                    console.log(`   ✅ وجد رابط M3U8 مباشر في script: ${url.substring(0, 80)}...`);
                    servers.push({
                        type: 'direct',
                        url: url,
                        quality: "HD",
                        server: 'M3U8',
                        id: `m3u8_${servers.length + 1}`,
                        source: 'script'
                    });
                }
            }
            
            // البحث عن روابط .mp4
            const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/g;
            while ((match = mp4Regex.exec(content)) !== null) {
                const url = match[1];
                if (!processedUrls.has(url)) {
                    processedUrls.add(url);
                    console.log(`   ✅ وجد رابط MP4 مباشر في script: ${url.substring(0, 80)}...`);
                    servers.push({
                        type: 'direct',
                        url: url,
                        quality: "HD",
                        server: 'MP4',
                        id: `mp4_${servers.length + 1}`,
                        source: 'script'
                    });
                }
            }
        }
        
        // استراتيجية 3: البحث عن عناصر video مباشرة
        const videos = doc.querySelectorAll('video source, video');
        for (const video of videos) {
            const src = video.getAttribute('src') || video.getAttribute('data-src');
            if (src) {
                const fullUrl = src.startsWith('http') ? src : new URL(src, matchUrl).href;
                if (!processedUrls.has(fullUrl) && (fullUrl.includes('.m3u8') || fullUrl.includes('.mp4'))) {
                    processedUrls.add(fullUrl);
                    console.log(`   ✅ وجد رابط مباشر في video tag: ${fullUrl.substring(0, 80)}...`);
                    servers.push({
                        type: 'direct',
                        url: fullUrl,
                        quality: "HD",
                        server: fullUrl.includes('.m3u8') ? 'M3U8' : 'MP4',
                        id: `video_${servers.length + 1}`,
                        source: 'video_tag'
                    });
                }
            }
        }
        
        // ترشيح وإرجاع النتائج
        if (servers.length > 0) {
            console.log(`   📊 تم العثور على ${servers.length} سيرفر مشاهدة`);
            
            // ترتيب السيرفرات: المباشرة أولاً
            servers.sort((a, b) => {
                if (a.type === 'direct' && b.type !== 'direct') return -1;
                if (a.type !== 'direct' && b.type === 'direct') return 1;
                return 0;
            });
            
            // عرض جميع السيرفرات الموجودة
            servers.forEach((server, index) => {
                console.log(`   ${index + 1}. ${server.server} (${server.type}): ${server.url.substring(0, 100)}...`);
                if (server.intermediateUrl) {
                    console.log(`     (من صفحة وسيطة: ${server.intermediateUrl.substring(0, 80)}...)`);
                }
            });
            
            return servers.slice(0, 5); // إرجاع أول 5 سيرفرات فقط
            
        } else {
            console.log(`   ⚠️ لم يتم العثور على أي سيرفرات مشاهدة`);
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
                    // إزالة خصائص غير ضرورية
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
        
        // إحصائيات السيرفرات المباشرة
        const directStreams = cleanData.reduce((count, match) => {
            if (match.watchServers) {
                return count + match.watchServers.filter(s => s.type === 'direct').length;
            }
            return count;
        }, 0);
        
        console.log(`\n📈 إحصائيات:`);
        console.log(`   - المباريات الجارية: ${liveMatches}`);
        console.log(`   - المباريات القادمة: ${upcomingMatches}`);
        console.log(`   - المباريات المنتهية: ${finishedMatches}`);
        console.log(`   - المباريات بسيرفرات مشاهدة: ${matchesWithServers}/${liveMatches + upcomingMatches}`);
        console.log(`   - روابط مباشرة (M3U8/MP4): ${directStreams}`);
        
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
                    const type = server.type === 'direct' ? '🔴 مباشر' : '🟡 وسيط';
                    console.log(`       ${sIdx + 1}. ${type} ${server.server}: ${server.url.substring(0, 80)}...`);
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
            const directStreams = savedData.matches.reduce((count, match) => {
                if (match.watchServers) {
                    return count + match.watchServers.filter(s => s.type === 'direct').length;
                }
                return count;
            }, 0);
            
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            
            return { 
                success: true, 
                total: savedData.matches.length,
                live: savedData.matches.filter(m => m.status === "جارية الآن").length,
                upcoming: savedData.matches.filter(m => m.status === "لم تبدأ بعد").length,
                finished: savedData.matches.filter(m => m.status === "انتهت").length,
                withServers: savedData.matches.filter(m => m.watchServers && m.watchServers.length > 0).length,
                directStreams: directStreams,
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
            console.log(`روابط مباشرة (M3U8/MP4): ${result.directStreams}`);
            console.log(`المسار: ${result.filePath}`);
        }
        process.exit(result.success ? 0 : 1);
    });
}

export { main };
