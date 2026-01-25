import fs from "fs";
import { JSDOM } from "jsdom";

console.log("🚀 بدء برنامج استخراج الأفلام...");

// دالة بسيطة لجلب صفحة
async function fetchPage(url) {
    try {
        console.log(`🌐 جلب: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`فشل الجلب: ${response.status}`);
        }
        
        return await response.text();
    } catch (error) {
        console.log(`❌ خطأ: ${error.message}`);
        return null;
    }
}

// البرنامج الرئيسي
async function main() {
    console.log("📅 الوقت:", new Date().toLocaleString());
    
    // 1. جلب الصفحة الرئيسية
    const url = "https://topcinema.rip/movies/";
    const html = await fetchPage(url);
    
    if (!html) {
        console.log("❌ فشل جلب الصفحة الرئيسية");
        return;
    }
    
    console.log("✅ تم جلب الصفحة الرئيسية");
    
    // 2. تحليل HTML
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // 3. البحث عن الأفلام
    const movieElements = doc.querySelectorAll('.Small--Box');
    console.log(`🔍 وجدت ${movieElements.length} عنصر فيلم`);
    
    const movies = [];
    
    // 4. استخراج أول 3 أفلام فقط
    const limit = Math.min(3, movieElements.length);
    
    for (let i = 0; i < limit; i++) {
        const element = movieElements[i];
        const titleElement = element.querySelector('.title');
        const linkElement = element.querySelector('a');
        
        const title = titleElement ? titleElement.textContent.trim() : `فيلم ${i + 1}`;
        const url = linkElement ? linkElement.href : '#';
        
        console.log(`🎬 ${i + 1}. ${title}`);
        
        movies.push({
            id: i + 1,
            title: title,
            url: url,
            scrapedAt: new Date().toISOString()
        });
    }
    
    // 5. حفظ النتائج في ملف واحد
    const result = {
        success: true,
        timestamp: new Date().toISOString(),
        source: url,
        totalMovies: movies.length,
        movies: movies,
        note: "تم استخراج أول 3 أفلام فقط للاختبار"
    };
    
    fs.writeFileSync("movies.json", JSON.stringify(result, null, 2));
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ اكتمل البرنامج بنجاح!");
    console.log("=".repeat(50));
    console.log(`📄 تم حفظ ${movies.length} فيلم في movies.json`);
    console.log(`📊 حجم الملف: ${(fs.statSync("movies.json").size / 1024).toFixed(2)} كيلوبايت`);
    console.log("=".repeat(50));
    
    // 6. عرض محتوى الملف
    console.log("\n📋 محتوى movies.json:");
    console.log(JSON.stringify(result, null, 2));
}

// تشغيل البرنامج
main().catch(error => {
    console.error("\n💥 خطأ غير متوقع:", error);
    console.error("Stack:", error.stack);
    
    // حفظ الخطأ
    const errorResult = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("error.json", JSON.stringify(errorResult, null, 2));
    console.log("❌ تم حفظ الخطأ في error.json");
});
