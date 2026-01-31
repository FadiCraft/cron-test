// test-simple.js
import fs from "fs";

console.log("🚀 بدء الاختبار البسيط");

// 1. أولاً: جرب حفظ ملف نصي بسيط
const testContent = "هذا ملف اختبار\n" + new Date().toISOString();

try {
    fs.writeFileSync("test-file.txt", testContent);
    console.log("✅ تم حفظ test-file.txt");
} catch (error) {
    console.log("❌ خطأ في الحفظ:", error.message);
}

// 2. جلب صفحة الويب
console.log("\n🌐 جلب صفحة الويب...");
fetch("https://topcinema.rip/movies/")
    .then(response => {
        if (!response.ok) {
            throw new Error(`خطأ HTTP: ${response.status}`);
        }
        return response.text();
    })
    .then(html => {
        console.log("✅ تم جلب HTML بنجاح!");
        
        // 3. البحث عن العناوين بطريقة بسيطة
        const movies = [];
        
        // قسم HTML إلى أسطر
        const lines = html.split('\n');
        let count = 0;
        
        for (const line of lines) {
            if (line.includes('topcinema.rip') && line.includes('<a') && line.includes('title')) {
                // استخراج النص بين > و <
                const match = line.match(/>(.*?)</);
                if (match && match[1].trim().length > 5) {
                    movies.push(match[1].trim());
                    count++;
                    if (count >= 10) break; // فقط أول 10
                }
            }
        }
        
        console.log(`🎬 وجدنا ${movies.length} فيلم:`);
        movies.forEach((title, i) => {
            console.log(`   ${i + 1}. ${title}`);
        });
        
        // 4. حفظ النتائج في ملف JSON
        const result = {
            date: new Date().toISOString(),
            total: movies.length,
            movies: movies
        };
        
        fs.writeFileSync("movies-test.json", JSON.stringify(result, null, 2));
        console.log("\n💾 تم حفظ movies-test.json");
        
    })
    .catch(error => {
        console.log("❌ خطأ:", error.message);
    });
