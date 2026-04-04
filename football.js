import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOOTBALL_DIR = path.join(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

if (!fs.existsSync(FOOTBALL_DIR)) {
    fs.mkdirSync(FOOTBALL_DIR, { recursive: true });
}

async function fetchWithTimeout(url, timeout = 15000) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        return null;
    }
}

function extractPlayerFromHTML(html) {
    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
            const src = iframe.getAttribute('src');
            if (src && (src.includes('albaplayer') || src.includes('gomatch') || src.includes('ontime'))) {
                return [{ type: 'iframe', url: src, quality: "HD", server: "LiveServer", id: 'p1' }];
            }
        }
        return null;
    } catch (e) { return null; }
}

async function fetchMatchesFromPage() {
    // ملاحظة: تأكد من أن هذا الرابط هو الموقع الذي تفتحه في المتصفح وتجد فيه المباريات
    const url = "https://koranews.site88.one/"; 
    
    console.log(`\n🔍 جاري فحص الموقع: ${url}`);
    const html = await fetchWithTimeout(url);
    
    if (!html) {
        console.log(`❌ فشل الاتصال بالموقع`);
        return null;
    }

    try {
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const matches = [];
        
        // التعديل الجوهري: البحث عن الرابط الذي يحمل كلاس match-card-link
        const matchLinks = doc.querySelectorAll('a.match-card-link');
        
        console.log(`✅ تم العثور على ${matchLinks.length} كارت مباراة`);

        matchLinks.forEach((link, index) => {
            try {
                const matchUrl = link.getAttribute('href');
                const card = link.querySelector('.match-card');
                if (!card) return;

                const teams = card.querySelectorAll('.team-name');
                const logos = card.querySelectorAll('.team-logo img');
                const scoreSpans = card.querySelectorAll('.match-score span:not(.score-sep)');
                const status = card.querySelector('.match-status')?.textContent.trim() || "";
                const infoBar = card.querySelectorAll('.match-info-bar span');

                const match = {
                    id: `m_${Date.now()}_${index}`,
                    url: matchUrl,
                    title: `${teams[0]?.textContent.trim()} vs ${teams[1]?.textContent.trim()}`,
                    team1: {
                        name: teams[0]?.textContent.trim() || "غير معروف",
                        logo: logos[0]?.getAttribute('src'),
                        score: scoreSpans[0]?.textContent.trim() || "0"
                    },
                    team2: {
                        name: teams[1]?.textContent.trim() || "غير معروف",
                        logo: logos[1]?.getAttribute('src'),
                        score: scoreSpans[1]?.textContent.trim() || "0"
                    },
                    status: status,
                    tournament: infoBar[1]?.textContent.replace('🏆', '').trim() || "غير محدد",
                    channel: infoBar[0]?.textContent.replace('📺', '').trim() || "غير معروف",
                    watchServers: null
                };

                matches.push(match);
                console.log(`   [${index+1}] ${match.title} - ${match.status}`);
            } catch (err) { }
        });

        return matches;
    } catch (error) {
        console.log(`❌ خطأ في التحليل: ${error.message}`);
        return null;
    }
}

async function main() {
    const matches = await fetchMatchesFromPage();
    if (!matches || matches.length === 0) {
        console.log("⚠️ لم يتم استخراج أي بيانات. تأكد من أن الرابط يحتوي فعلاً على المباريات.");
        return;
    }

    // جلب الروابط للمباريات الجارية فقط
    for (let match of matches) {
        if (match.status.includes("جارية")) {
            console.log(`🔗 جلب مشغل: ${match.title}`);
            const matchHtml = await fetchWithTimeout(match.url);
            if (matchHtml) {
                match.watchServers = extractPlayerFromHTML(matchHtml);
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        scrapedAt: new Date().toISOString(),
        total: matches.length,
        matches: matches
    }, null, 2));
    
    console.log(`\n✅ تم الحفظ بنجاح في ${OUTPUT_FILE}`);
}

main();
