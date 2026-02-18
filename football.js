import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
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
    if (urlLower.includes("koora")) return "Koora";
    if (urlLower.includes("on-time") || urlLower.includes("ontime")) return "OnTime";
    if (urlLower.includes("streamable")) return "Streamable";
    if (urlLower.includes("mixdrop")) return "MixDrop";
    if (urlLower.includes("vidoza")) return "Vidoza";
    if (urlLower.includes("upstream")) return "UpStream";
    if (urlLower.includes("player")) return "Player";
    if (urlLower.includes("kk.pyxq.online")) return "KoraPlus";
    if (urlLower.includes("gomatch")) return "GoMatch";
    if (urlLower.includes("youtube")) return "YouTube";
    if (urlLower.includes("facebook")) return "Facebook";
    
    return "غير معروف";
}

// ==================== استخراج رابط المشغل من صفحة المباراة ====================
async function fetchMatchPlayer(matchUrl) {
    console.log(`   🔍 جلب رابط المشغل من: ${matchUrl}`);
    
    let browser = null;
    
    try {
        // تشغيل المتصفح
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // تعيين User Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`   🌐 تحميل الصفحة...`);
        await page.goto(matchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // انتظار 3 ثواني للـ JavaScript
        console.log(`   ⏳ انتظار تحميل JavaScript...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // محاكاة التمرير لتحميل الـ iframe
        console.log(`   📜 التمرير لأسفل...`);
        await page.evaluate(() => {
            window.scrollBy(0, 1000);
        });
        
        // انتظار ثانيتين بعد التمرير
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // البحث عن iframe
        const iframeData = await page.evaluate(() => {
            // البحث في كل الـ iframes
            const iframes = document.querySelectorAll('iframe');
            
            for (const iframe of iframes) {
                const src = iframe.getAttribute('src');
                if (src && src.trim() !== '') {
                    // تحقق إذا كان الرابط من نوع المشغل المطلوب
                    if (src.includes('gomatch') || src.includes('albaplayer') || src.includes('ontime')) {
                        return {
                            found: true,
                            src: src,
                            type: 'player'
                        };
                    }
                }
            }
            
            // إذا لم نجد، نرجع أول iframe موجود
            if (iframes.length > 0) {
                const firstIframe = iframes[0];
                const src = firstIframe.getAttribute('src');
                if (src) {
                    return {
                        found: true,
                        src: src,
                        type: 'iframe'
                    };
                }
            }
            
            return { found: false };
        });
        
        await browser.close();
        
        if (iframeData.found) {
            console.log(`   ✅ وجد رابط المشغل: ${iframeData.src.substring(0, 100)}...`);
            
            const serverType = detectServerType(iframeData.src);
            
            return [{
                type: 'iframe',
                url: iframeData.src,
                quality: "HD",
                server: serverType,
                id: `player_1`,
                source: 'match_page'
            }];
        } else {
            console.log(`   ⚠️ لم يتم العثور على أي مشغل`);
            return null;
        }
        
    } catch (error) {
        console.log(`   ❌ خطأ: ${error.message}`);
        if (browser) await browser.close();
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
                
                // استخراج أسماء الفريقين
                const team1Elem = element.querySelector('.right-team .team-name');
                const team2Elem = element.querySelector('.left-team .team-name');
                
                const team1Name = team1Elem ? team1Elem.textContent.trim() : "غير معروف";
                const team2Name = team2Elem ? team2Elem.textContent.trim() : "غير معروف";
                
                // استخراج حالة المباراة
                let matchStatus = "غير معروف";
                const statusElement = element.querySelector('.match-timing .date');
                if (statusElement) {
                    const statusText = statusElement.textContent.trim();
                    if (statusText === "جارية الان") matchStatus = "جارية الآن";
                    else if (statusText === "لم تبدأ بعد") matchStatus = "لم تبدأ بعد";
                    else if (statusText === "انتهت المباراة") matchStatus = "انتهت";
                }
                
                // استخراج القنوات والبطولة
                const channels = [];
                let tournament = "غير محدد";
                
                const channelItems = element.querySelectorAll('.match-info li span');
                channelItems.forEach((item, idx) => {
                    const text = item.textContent.trim();
                    if (text && text !== "غير معروف") {
                        if (idx < 2) channels.push(text);
                        else if (idx === 2) tournament = text;
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
                    team1: { name: team1Name },
                    team2: { name: team2Name },
                    status: matchStatus,
                    channels: channels,
                    tournament: tournament,
                    scrapedAt: new Date().toISOString(),
                    player: null  // سيتم ملؤه لاحقاً
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
            page: pageNum
        };
        
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

// ==================== استخراج تفاصيل المباريات ====================
async function fetchMatchesDetails(matches) {
    console.log(`\n🔍 جلب روابط المشغل لـ ${matches.length} مباراة...`);
    
    const matchesWithDetails = [];
    
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        
        console.log(`\n${i + 1}/${matches.length}: ${match.title} (${match.status})`);
        
        // استخراج رابط المشغل للمباريات الجارية أو القادمة فقط
        if (match.status === "جارية الآن" || match.status === "لم تبدأ بعد") {
            const player = await fetchMatchPlayer(match.url);
            
            matchesWithDetails.push({
                ...match,
                player: player
            });
            
            if (player) {
                console.log(`   ✅ تم العثور على رابط المشغل`);
            } else {
                console.log(`   ⚠️ لا يوجد رابط مشغل`);
            }
        } else {
            matchesWithDetails.push({
                ...match,
                player: null
            });
            console.log(`   ⏭️ مباراة منتهية - لا يوجد مشغل`);
        }
        
        // انتظار بين المباريات
        if (i < matches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return matchesWithDetails;
}

// ==================== حفظ البيانات في Hg.json ====================
function saveToHgFile(data) {
    try {
        const outputData = {
            scrapedAt: new Date().toISOString(),
            source: "https://koraplus.blog/",
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
        const withPlayer = data.filter(m => m.player && m.player.length > 0).length;
        console.log(`📈 مباريات بروابط مشغل: ${withPlayer}`);
        
        return outputData;
        
    } catch (error) {
        console.log(`❌ خطأ في حفظ الملف: ${error.message}`);
        return null;
    }
}

// ==================== الدالة الرئيسية ====================
async function main() {
    console.log("⚽ بدء استخراج روابط المشغل من koraplus.blog");
    console.log("=".repeat(60));
    
    try {
        // التحقق من تثبيت Puppeteer
        try {
            await puppeteer.version();
        } catch (error) {
            console.log("❌ Puppeteer غير مثبت. قم بتشغيل: npm install puppeteer");
            return { success: false };
        }
        
        const pageData = await fetchMatchesFromPage(1);
        
        if (!pageData || pageData.matches.length === 0) {
            console.log("\n❌ لم يتم العثور على مباريات");
            return { success: false };
        }
        
        const matchesWithDetails = await fetchMatchesDetails(pageData.matches);
        const savedData = saveToHgFile(matchesWithDetails);
        
        if (savedData) {
            console.log(`\n🎉 تم الانتهاء بنجاح!`);
            return { success: true };
        }
        
        return { success: false };
        
    } catch (error) {
        console.error(`\n💥 خطأ: ${error.message}`);
        return { success: false };
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
