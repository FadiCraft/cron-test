import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOOTBALL_DIR = path.join(__dirname, "football");
const OUTPUT_FILE = path.join(FOOTBALL_DIR, "Hg.json");

if (!fs.existsSync(FOOTBALL_DIR)) fs.mkdirSync(FOOTBALL_DIR, { recursive: true });

async function main() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const allMatches = [];

    try {
        console.log("🌐 جاري فتح الصفحة الرئيسية...");
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto("https://koraplus.blog/", { waitUntil: 'networkidle2', timeout: 60000 });

        // ننتظر قليلاً لضمان ظهور الكروت
        await new Promise(r => setTimeout(r, 5000));

        console.log("🔍 استخراج بيانات المباريات...");
        const matchesData = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('a.match-card-link');

            cards.forEach((card) => {
                const matchUrl = card.href;
                const article = card.querySelector('article.match-card');
                
                // استخراج معرف فريد من الرابط
                const matchId = matchUrl.split('/').filter(Boolean).pop();

                const teamLogos = article.querySelectorAll('.team-logo img');
                const teamNames = article.querySelectorAll('.team-name');
                const scoreElem = article.querySelector('.match-score');
                const status = article.querySelector('.match-status')?.textContent.trim() || "";
                const league = article.querySelector('.match-league')?.textContent.trim().replace('🏆 ', '') || "";
                const time = article.querySelector('.match-time')?.textContent.trim().replace('⏰ ', '') || "";
                const infoBarSpans = article.querySelectorAll('.match-info-bar span');

                results.push({
                    id: matchId,
                    url: matchUrl,
                    title: `${teamNames[0]?.textContent.trim()} vs ${teamNames[1]?.textContent.trim()}`,
                    status: status,
                    league: league,
                    time: time,
                    channel: infoBarSpans[0]?.textContent.trim().replace('📺 ', '') || "غير متوفر",
                    score: scoreElem?.textContent.trim().replace(/\s+/g, ' ') || "0 - 0",
                    team1: {
                        name: teamNames[0]?.textContent.trim() || "غير معروف",
                        logo: teamLogos[0]?.src || ""
                    },
                    team2: {
                        name: teamNames[1]?.textContent.trim() || "غير معروف",
                        logo: teamLogos[1]?.src || ""
                    }
                });
            });
            return results;
        });

        console.log(`✅ تم العثور على ${matchesData.length} مباراة. جاري استخراج سيرفرات المشاهدة...`);

        // استخراج سيرفر المشاهدة لكل مباراة (فقط للجارية والقادمة)
        for (const match of matchesData) {
            if (match.status !== "انتهت") {
                console.log(`🔗 جلب سيرفر المشاهدة لمباراة: ${match.title}`);
                const matchPage = await browser.newPage();
                try {
                    await matchPage.goto(match.url, { waitUntil: 'networkidle2', timeout: 40000 });
                    // ننتظر ظهور الـ iframe
                    await matchPage.waitForSelector('iframe', { timeout: 10000 }).catch(() => null);
                    
                    const watchServers = await matchPage.evaluate(() => {
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        return iframes
                            .map(f => f.src)
                            .filter(src => src.includes('site88') || src.includes('serv=') || src.includes('player'));
                    });

                    match.watchServers = watchServers.length > 0 ? watchServers.map((url, index) => ({
                        id: `server_${index + 1}`,
                        url: url,
                        name: "سيرفر رئيسي"
                    })) : null;

                } catch (e) {
                    console.log(`⚠️ تعذر جلب السيرفر لـ ${match.title}`);
                    match.watchServers = null;
                }
                await matchPage.close();
            } else {
                match.watchServers = null; // لا سيرفرات للمباريات المنتهية
            }
            allMatches.push(match);
        }

        // حفظ البيانات النهائية
        const finalOutput = {
            scrapedAt: new Date().toISOString(),
            totalMatches: allMatches.length,
            matches: allMatches
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 2));
        console.log(`\n🎉 اكتمل العمل! تم تحديث ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("❌ خطأ عام:", error.message);
    } finally {
        await browser.close();
    }
}

main();
