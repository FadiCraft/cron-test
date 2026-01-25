import fs from "fs";
import { JSDOM } from "jsdom";

// دالة تسجيل محسنة
class Logger {
    constructor() {
        this.logs = [];
        this.startTime = Date.now();
    }
    
    log(emoji, message, data = null) {
        const time = ((Date.now() - this.startTime) / 1000).toFixed(2);
        const logEntry = {
            time: `${time}s`,
            emoji,
            message,
            data,
            timestamp: new Date().toISOString()
        };
        
        this.logs.push(logEntry);
        
        // طباعة في الكونسول
        console.log(`[${time.padStart(6)}s] ${emoji} ${message}`);
        if (data) {
            console.log('   📦', JSON.stringify(data, null, 2));
        }
        
        return logEntry;
    }
    
    saveLogs() {
        const logFile = {
            summary: {
                duration: `${((Date.now() - this.startTime) / 1000).toFixed(2)}s`,
                totalLogs: this.logs.length,
                success: this.logs.some(l => l.emoji === '✨'),
                timestamp: new Date().toISOString()
            },
            logs: this.logs
        };
        
        fs.writeFileSync("extraction_log.json", JSON.stringify(logFile, null, 2));
        return logFile;
    }
}

// إنشاء logger
const logger = new Logger();

async function main() {
    try {
        logger.log('🚀', 'بدء عملية الاستخراج');
        
        // محاكاة الاستخراج
        const fakeMovies = [
            { title: "فيلم تجريبي 1", url: "https://example.com/1", found: true },
            { title: "فيلم تجريبي 2", url: "https://example.com/2", found: true }
        ];
        
        logger.log('📥', 'جلب الصفحة الرئيسية', { url: 'https://topcinema.media/movies/' });
        
        // محاكاة المعالجة
        fakeMovies.forEach((movie, i) => {
            logger.log('🔍', `معالجة فيلم ${i + 1}`, movie);
        });
        
        // محاكاة الحفظ
        const result = {
            movies: fakeMovies,
            count: fakeMovies.length,
            time: new Date().toISOString()
        };
        
        fs.writeFileSync("result.json", JSON.stringify(result, null, 2));
        fs.writeFileSync("movies.txt", fakeMovies.map(m => m.title).join('\n'));
        
        logger.log('💾', 'حفظ النتائج', { 
            files: ['result.json', 'movies.txt'],
            moviesCount: fakeMovies.length
        });
        
        // حفظ السجلات
        const logs = logger.saveLogs();
        
        logger.log('✨', 'تم الانتهاء بنجاح!', {
            totalMovies: fakeMovies.length,
            filesCreated: ['result.json', 'movies.txt', 'extraction_log.json'],
            duration: logs.summary.duration
        });
        
        // إنشاء تقرير HTML
        createReport(fakeMovies, logs);
        
    } catch (error) {
        logger.log('💥', 'حدث خطأ', { error: error.message });
    }
}

function createReport(movies, logs) {
    const html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>تقرير الاستخراج - ${new Date().toLocaleString('ar-EG')}</title>
        <style>
            body { font-family: Arial; padding: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: auto; background: white; padding: 20px; border-radius: 10px; }
            .header { background: #4CAF50; color: white; padding: 20px; border-radius: 5px; text-align: center; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
            .stat-box { background: #e8f5e8; padding: 15px; border-radius: 5px; text-align: center; }
            .log-entry { border-bottom: 1px solid #eee; padding: 10px; margin: 5px 0; }
            .success { color: green; }
            .error { color: red; }
            .movie-list { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 تقرير استخراج الأفلام</h1>
                <p>${new Date().toLocaleString('ar-EG')}</p>
            </div>
            
            <div class="stats">
                <div class="stat-box">
                    <h3>🎬 عدد الأفلام</h3>
                    <h2>${movies.length}</h2>
                </div>
                <div class="stat-box">
                    <h3>⏱️ المدة</h3>
                    <h2>${logs.summary.duration}</h2>
                </div>
                <div class="stat-box">
                    <h3>📝 عدد العمليات</h3>
                    <h2>${logs.logs.length}</h2>
                </div>
            </div>
            
            <h2>📋 قائمة الأفلام:</h2>
            <div class="movie-list">
                <ul>
                    ${movies.map(movie => `<li>${movie.title} - <a href="${movie.url}" target="_blank">رابط</a></li>`).join('')}
                </ul>
            </div>
            
            <h2>📜 سجل العمليات:</h2>
            <div id="logs">
                ${logs.logs.map(log => `
                    <div class="log-entry">
                        <strong>[${log.time}] ${log.emoji}</strong> ${log.message}
                        ${log.data ? `<br><small>${JSON.stringify(log.data)}</small>` : ''}
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 30px; text-align: center; color: #666;">
                <p>🔄 تم التشغيل تلقائياً بواسطة GitHub Actions</p>
                <p>📅 التحديث التالي: ${new Date(Date.now() + 1800000).toLocaleString('ar-EG')}</p>
            </div>
        </div>
    </body>
    </html>`;
    
    fs.writeFileSync("report.html", html);
}

main();
