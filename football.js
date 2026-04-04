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
    // تشغيل المتصفح بإعدادات تضمن العمل على GitHub Actions
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    const allMatches = [];

    try {
        console.log("🌐 جاري فتح الصفحة الرئيسية...");
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // الانتقال للموقع والانتظار حتى يستقر الشبكة
        await page.goto("https://koraplus.blog/", { waitUntil: 'networkidle2', timeout: 60000 });

        console.log("⏳ ننتظر تحميل العناصر...");
        await new Promise(r => setTimeout(r, 5000));

        const matchesData = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('a.match-card-link');

            cards.forEach((card) => {
                const article = card.querySelector('article.match-card');
                if (!article) return;

                const teamLogos = article.querySelectorAll('.team-logo img');
                const teamNames = article.querySelectorAll('.team-name');
                const scoreSpans = article.querySelectorAll('.match-score span');
                const status = article.querySelector('.match-status')?.textContent.trim() || "";
                const league = article.querySelector('.match-league')?.textContent.trim().replace('🏆 ', '') || "";
                const time = article.querySelector('.match-time')?.textContent.trim().replace('⏰ ', '') || "";
                const infoBarSpans = article.querySelectorAll('.match-info-bar span');

                // تجميع النتيجة بشكل صحيح (0 - 0)
                let scoreText = "0 - 0";
                if (scoreSpans.length >= 3) {
                    scoreText = `${scoreSpans[0].textContent.trim()} - ${scoreSpans[2].textContent.trim()}`;
                }

                results.push({
                    url: card.href,
                    status: status,
                    league: league,
                    time: time,
                    channel: infoBarSpans[0]?.textContent.trim().replace('📺 ', '') || "غير متوفر",
                    score: scoreText,
                    team1: {
                        name: teamNames[0]?.textContent.trim() || "غير معروف",
                        logo: teamLogos[0]?.getAttribute('src') || ""
                    },
                    team2: {
                        name: teamNames[1]?.textContent.trim() || "غير معروف",
                        logo: teamLogos[1]?.getAttribute('src') || ""
                    }
                });
            });
            return results;
        });

        console.log(`✅ وجدنا ${matchesData.length} مباراة. نبدأ باستخراج السيرفرات...`);

        for (let i = 0; i < matchesData.length; i++) {
            const match = matchesData[i];
            
            // 1. توليد ID رقمي عشوائي (مثلاً من 6 أرقام)
            match.id = Math.floor(100000 + Math.random() * 900000);

            // 2. استخراج سيرفر المشاهدة (فقط للتي لم تنتهِ)
            if (match.status !== "انتهت") {
                console.log(`🔍 جاري فحص: ${match.team1.name} vs ${match.team2.name}`);
                const matchPage = await browser.newPage();
                try {
                    await matchPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
                    await matchPage.goto(match.url, { waitUntil: 'networkidle2', timeout: 45000 });
                    
                    // الانتظار حتى يتم تحميل أي iframe داخل الصفحة
                    await matchPage.waitForSelector('iframe', { timeout: 15000 }).catch(() => null);

                    const finalServers = await matchPage.evaluate(() => {
                        const iframes = Array.from(document.querySelectorAll('iframe'));
                        // البحث عن السيرفر الذي يحتوي على الكلمات المفتاحية المطلوبة
                        const serverLinks = iframes
                            .map(f => f.src)
                            .filter(src => src && (src.includes('site88') || src.includes('serv=') || src.includes('p=')));
                        
                        return serverLinks.length > 0 ? serverLinks.map((url, idx) => ({
                            id: `server_${idx + 1}`,
                            name: "سيرفر رئيسي",
                            url: url
                        })) : null;
                    });

                    match.watchServers = finalServers;
                    if (finalServers) console.log(`   ✨ تم العثور على السيرفر!`);

                } catch (e) {
                    match.watchServers = null;
                }
                await matchPage.close();
            } else {
                match.watchServers = null;
            }

            allMatches.push(match);
            // تأخير بسيط لتجنب الحظر
            await new Promise(r => setTimeout(r, 1000));
        }

        const output = {
            scrapedAt: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
            totalMatches: allMatches.length,
            matches: allMatches
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n🚀 تم الحفظ بنجاح في ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("❌ حدث خطأ كبير:", error.message);
    } finally {
        await browser.close();
    }
}

main();
