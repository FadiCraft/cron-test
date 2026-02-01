import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== الإعدادات المحسنة للمراحل ====================
const CONFIG = {
    baseUrl: "https://topcinema.rip/movies",
    outputDir: path.join(__dirname, "movies"),
    
    files: {
        home: "Home.json",
        index: "index.json",
        stats: "stats.json",
        failed: "failed_movies.json",
        resume: "resume_point.json",
        stage: "stage_progress.json"
    },
    
    // إعدادات المراحل
    stageSize: 5,           // عدد الصفحات في كل مرحلة
    maxStages: 20,          // الحد الأقصى للمراحل (100 صفحة)
    runOnlyOneStage: true,  // تشغيل مرحلة واحدة فقط ثم التوقف
    
    batchSize: 250,
    requestDelay: 1500,
    timeout: 40000,
    
    // إعدادات التكرار
    maxRetries: 3,
    retryDelay: 3000,
    
    // إعدادات التجاوز
    skipOnError: true,
    continueOnFail: true,
    
    // إعدادات الأداء
    parallelRequests: 2,
    chunkSize: 5,
    saveInterval: 10
};

// ==================== نظام تتبع المراحل ====================
class StageManager {
    constructor() {
        this.stageFile = path.join(CONFIG.outputDir, CONFIG.files.stage);
        this.currentStage = this.loadStageProgress();
    }
    
    loadStageProgress() {
        if (fs.existsSync(this.stageFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.stageFile, 'utf8'));
                console.log(`📊 حالة النظام: المرحلة ${data.currentStage}`);
                console.log(`   📄 الصفحات المكتملة: ${data.completedPages.length}/${CONFIG.stageSize}`);
                console.log(`   🎬 الأفلام المجمعة: ${data.totalMoviesCollected}`);
                return data;
            } catch {
                return this.createInitialStage();
            }
        }
        return this.createInitialStage();
    }
    
    createInitialStage() {
        return {
            currentStage: 1,
            totalStages: CONFIG.maxStages,
            stageSize: CONFIG.stageSize,
            completedPages: [],
            currentPage: 1,
            lastUpdated: new Date().toISOString(),
            moviesInCurrentStage: 0,
            totalMoviesCollected: 0,
            stageHistory: [],
            isRunning: false,
            lastRunEnd: null
        };
    }
    
    saveStageProgress() {
        this.currentStage.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.stageFile, JSON.stringify(this.currentStage, null, 2));
    }
    
    getCurrentStageRange() {
        const startPage = ((this.currentStage.currentStage - 1) * CONFIG.stageSize) + 1;
        const endPage = Math.min(startPage + CONFIG.stageSize - 1, CONFIG.maxStages * CONFIG.stageSize);
        return { startPage, endPage };
    }
    
    markPageCompleted(pageNumber) {
        if (!this.currentStage.completedPages.includes(pageNumber)) {
            this.currentStage.completedPages.push(pageNumber);
            this.currentStage.completedPages.sort((a, b) => a - b);
            this.currentStage.currentPage = pageNumber + 1;
            this.saveStageProgress();
            console.log(`   ✅ اكتملت الصفحة ${pageNumber}`);
        }
    }
    
    addToStageHistory(stageData) {
        this.currentStage.stageHistory.push({
            stage: this.currentStage.currentStage,
            completedAt: new Date().toISOString(),
            pagesCompleted: [...this.currentStage.completedPages],
            moviesCollected: stageData.moviesCollected,
            duration: stageData.duration,
            startPage: this.getCurrentStageRange().startPage,
            endPage: this.getCurrentStageRange().endPage
        });
        
        if (this.currentStage.stageHistory.length > 20) {
            this.currentStage.stageHistory = this.currentStage.stageHistory.slice(-20);
        }
    }
    
    isStageComplete() {
        const { startPage, endPage } = this.getCurrentStageRange();
        return this.currentStage.completedPages.length >= (endPage - startPage + 1);
    }
    
    getNextPage() {
        const { startPage, endPage } = this.getCurrentStageRange();
        
        for (let page = startPage; page <= endPage; page++) {
            if (!this.currentStage.completedPages.includes(page)) {
                return page;
            }
        }
        
        return null; // كل الصفحات مكتملة
    }
    
    getRemainingPagesInStage() {
        const { startPage, endPage } = this.getCurrentStageRange();
        const totalPages = endPage - startPage + 1;
        const completed = this.currentStage.completedPages.length;
        return totalPages - completed;
    }
    
    markStageStart() {
        this.currentStage.isRunning = true;
        this.currentStage.currentRunStart = new Date().toISOString();
        this.saveStageProgress();
    }
    
    markStageEnd() {
        this.currentStage.isRunning = false;
        this.currentStage.lastRunEnd = new Date().toISOString();
        this.saveStageProgress();
    }
    
    shouldMoveToNextStage() {
        return this.isStageComplete() && !CONFIG.runOnlyOneStage;
    }
    
    moveToNextStage() {
        if (this.currentStage.currentStage >= CONFIG.maxStages) {
            console.log("🎉 وصلت إلى آخر مرحلة!");
            return false;
        }
        
        const stageData = {
            moviesCollected: this.currentStage.moviesInCurrentStage,
            duration: 0
        };
        
        this.addToStageHistory(stageData);
        
        this.currentStage.currentStage++;
        this.currentStage.completedPages = [];
        this.currentStage.moviesInCurrentStage = 0;
        this.currentStage.currentPage = ((this.currentStage.currentStage - 1) * CONFIG.stageSize) + 1;
        
        this.saveStageProgress();
        console.log(`\n🔄 الانتقال إلى المرحلة ${this.currentStage.currentStage}`);
        
        return true;
    }
    
    getProgress() {
        const { startPage, endPage } = this.getCurrentStageRange();
        const totalPagesInStage = endPage - startPage + 1;
        const completed = this.currentStage.completedPages.length;
        const remaining = this.getRemainingPagesInStage();
        
        return {
            currentStage: this.currentStage.currentStage,
            totalStages: CONFIG.maxStages,
            stageRange: `${startPage}-${endPage}`,
            progress: `${completed}/${totalPagesInStage}`,
            percentage: Math.round((completed / totalPagesInStage) * 100),
            remainingPages: remaining,
            nextPage: this.getNextPage(),
            totalMovies: this.currentStage.totalMoviesCollected,
            isComplete: this.isStageComplete()
        };
    }
}

// باقي الكود يبقى كما هو مع تعديلات بسيطة في الدالة runStage:

// ==================== نظام المعالجة الرئيسي مع المراحل ====================
class MovieScraper {
    constructor() {
        this.storageManager = new StorageManager();
        this.dataExtractor = new DataExtractor();
        this.requestManager = new RequestManager();
        this.system = null;
        this.startTime = null;
        this.currentStageStartTime = null;
    }
    
    async runStage(stageNumber) {
        console.log(`\n🚀 بدء المرحلة ${stageNumber}`);
        console.log("=".repeat(60));
        
        this.currentStageStartTime = new Date();
        this.system.stageManager.markStageStart();
        
        const progress = this.system.stageManager.getProgress();
        const { startPage, endPage } = this.system.stageManager.getCurrentStageRange();
        
        console.log(`📊 نطاق الصفحات: ${startPage} إلى ${endPage}`);
        console.log(`📈 التقدم الحالي: ${progress.progress} (${progress.percentage}%)`);
        console.log(`⏳ الصفحات المتبقية: ${progress.remainingPages}`);
        
        let topCinemaFile = this.system.lastTopCinemaFile;
        let newMoviesInStage = 0;
        let totalMoviesProcessed = 0;
        
        // استخراج الصفحات في المرحلة الحالية
        while (true) {
            const nextPage = this.system.stageManager.getNextPage();
            
            if (!nextPage) {
                console.log("\n✅ اكتملت جميع الصفحات في هذه المرحلة");
                break;
            }
            
            console.log(`\n📄 الصفحة ${nextPage} (${nextPage - startPage + 1}/${endPage - startPage + 1})`);
            
            // جلب الأفلام من الصفحة
            const movies = await this.dataExtractor.fetchMoviesFromPage(nextPage);
            
            if (movies.length === 0) {
                console.log(`   ⏹️ لا توجد أفلام في هذه الصفحة`);
                this.system.stageManager.markPageCompleted(nextPage);
                continue;
            }
            
            totalMoviesProcessed += movies.length;
            console.log(`   📊 عثر على ${movies.length} فيلم`);
            
            // تخزين الصفحة الأولى في Home.json
            if (nextPage === 1) {
                const homeData = {
                    page: 1,
                    url: "https://topcinema.rip/movies/",
                    scrapedAt: new Date().toISOString(),
                    movies: movies.map(m => ({ id: m.id, title: m.title, url: m.url })),
                    total: movies.length,
                    stage: stageNumber
                };
                this.storageManager.saveToFile(CONFIG.files.home, homeData);
                console.log(`   🏠 حفظ الصفحة الأولى في Home.json`);
            }
            
            // معالجة الأفلام
            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];
                
                // التحقق من وجود الفيلم مسبقاً
                if (this.system.index.movies[movie.id]) {
                    // تحديث الفيلم الموجود
                    this.system.storageManager.updateIndex(movie, topCinemaFile, this.system);
                    this.system.updatedMoviesCount = (this.system.updatedMoviesCount || 0) + 1;
                    
                    if ((i + 1) % 10 === 0) {
                        console.log(`   ⏭️ ${i + 1}/${movies.length}: تحديث أفلام موجودة...`);
                    }
                    continue;
                }
                
                // التحقق من امتلاء الملف الحالي
                if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                    topCinemaFile = this.storageManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                    this.system.stats.totalFiles++;
                    console.log(`   📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
                }
                
                // استخراج تفاصيل الفيلم
                const movieDetails = await this.dataExtractor.fetchMovieDetailsWithRetry(movie, this.system);
                
                if (movieDetails) {
                    // تخزين الفيلم
                    const storageResult = await this.storageManager.addMovieToTopCinemaFile(
                        movieDetails, 
                        topCinemaFile, 
                        this.system
                    );
                    
                    if (storageResult.success) {
                        newMoviesInStage++;
                        
                        // عرض تقدم كل 5 أفلام
                        if (newMoviesInStage % 5 === 0) {
                            console.log(`   ✅ ${i + 1}/${movies.length}: ${newMoviesInStage} أفلام جديدة`);
                        }
                        
                        // حفظ نقطة التقدم
                        this.system.resumeManager.markProgress(nextPage, i + 1, movieDetails.id, stageNumber);
                    }
                }
                
                // تأخير بين الأفلام (تأخير أقل للأفلام الموجودة مسبقاً)
                if (i < movies.length - 1) {
                    const delayMultiplier = this.system.index.movies[movie.id] ? 0.5 : 1;
                    await this.requestManager.delay(CONFIG.requestDelay * delayMultiplier);
                }
            }
            
            // تحديث تقدم الصفحة
            this.system.stageManager.markPageCompleted(nextPage);
            
            // حفظ النظام بعد كل صفحة
            this.storageManager.saveSystemData(this.system);
            
            // إذا كانت هذه آخر صفحة في المرحلة
            if (nextPage === endPage) {
                console.log(`\n⏳ اكتملت الصفحة الأخيرة في المرحلة ${stageNumber}`);
                break;
            }
            
            // تأخير بين الصفحات
            const remainingPages = this.system.stageManager.getRemainingPagesInStage();
            console.log(`   ⏳ الانتقال للصفحة التالية... (${remainingPages} صفحات متبقية)`);
            await this.requestManager.delay(CONFIG.requestDelay * 2);
        }
        
        // إكمال المرحلة
        const stageEndTime = new Date();
        const stageDuration = (stageEndTime - this.currentStageStartTime) / 1000 / 60;
        
        this.system.stageManager.markStageEnd();
        
        const stageStats = {
            stage: stageNumber,
            completedAt: new Date().toISOString(),
            duration: stageDuration,
            moviesCollected: newMoviesInStage,
            moviesProcessed: totalMoviesProcessed,
            pagesCompleted: this.system.stageManager.currentStage.completedPages.length,
            requests: this.requestManager.getStats()
        };
        
        // حفظ إحصاءات المرحلة
        this.system.resumeManager.markStageComplete(stageNumber, stageStats);
        this.storageManager.saveSystemData(this.system, stageStats);
        
        console.log("\n" + "=".repeat(60));
        console.log(`✅ اكتملت المرحلة ${stageNumber}`);
        console.log(`📊 نتائج المرحلة:`);
        console.log(`   🆕 أفلام جديدة: ${newMoviesInStage}`);
        console.log(`   📄 أفلام معالجة: ${totalMoviesProcessed}`);
        console.log(`   📈 صفحات مكتملة: ${this.system.stageManager.currentStage.completedPages.length}/${CONFIG.stageSize}`);
        console.log(`   ⏱️  المدة: ${stageDuration.toFixed(2)} دقيقة`);
        console.log(`   🎬 إجمالي الأفلام: ${this.system.stats.totalMovies}`);
        
        return {
            stage: stageNumber,
            newMovies: newMoviesInStage,
            totalProcessed: totalMoviesProcessed,
            duration: stageDuration,
            isStageComplete: this.system.stageManager.isStageComplete()
        };
    }
    
    async run() {
        console.log("🎬 نظام جمع الأفلام على مراحل");
        console.log("=".repeat(60));
        
        try {
            // تهيئة النظام
            this.system = this.storageManager.initSystem();
            this.dataExtractor.setErrorManager(this.system.errorManager);
            
            // عرض حالة النظام
            const progress = this.system.stageManager.getProgress();
            console.log(`📊 حالة النظام الحالية:`);
            console.log(`   📍 المرحلة: ${progress.currentStage}/${progress.totalStages}`);
            console.log(`   📄 الصفحات: ${progress.stageRange}`);
            console.log(`   📈 التقدم: ${progress.progress} (${progress.percentage}%)`);
            console.log(`   🎬 الأفلام: ${progress.totalMovies}`);
            
            // التحقق إذا كانت المرحلة مكتملة بالفعل
            if (progress.isComplete) {
                console.log(`\n⚠️  المرحلة ${progress.currentStage} مكتملة بالفعل!`);
                
                if (CONFIG.runOnlyOneStage) {
                    console.log(`✅ تم إكمال ${CONFIG.stageSize} صفحات في هذه المرحلة`);
                    console.log(`🔄 للتشغيل مرة أخرى، إما:`);
                    console.log(`   1. انتقل للمرحلة التالية يدوياً`);
                    console.log(`   2. عدّل CONFIG.runOnlyOneStage = false`);
                    console.log(`   3. ابدأ مرحلة جديدة`);
                    return;
                }
            }
            
            // اختبار الاتصال
            console.log("\n🔗 اختبار الاتصال بالموقع...");
            const testResponse = await this.requestManager.fetchWithRetry("https://topcinema.rip/");
            if (!testResponse) {
                console.log("❌ لا يمكن الوصول إلى الموقع. تحقق من اتصال الإنترنت.");
                return;
            }
            console.log("✅ الاتصال ناجح");
            
            this.startTime = new Date();
            
            // تشغيل المرحلة الحالية
            const stageResult = await this.runStage(progress.currentStage);
            
            // التحقق إذا كنا بحاجة للانتقال للمرحلة التالية
            if (stageResult.isStageComplete && this.system.stageManager.shouldMoveToNextStage()) {
                console.log("\n⏳ التحضير للمرحلة التالية...");
                await this.requestManager.delay(3000);
                
                if (this.system.stageManager.moveToNextStage()) {
                    console.log(`🔄 بدء المرحلة ${this.system.stageManager.currentStage.currentStage}`);
                    await this.runStage(this.system.stageManager.currentStage.currentStage);
                }
            }
            
            // إكمال التشغيل
            const endTime = new Date();
            const totalDuration = (endTime - this.startTime) / 1000 / 60;
            
            this.system.resumeManager.markComplete();
            this.system.currentRunDuration = totalDuration;
            
            // حفظ البيانات النهائية
            this.storageManager.saveSystemData(this.system);
            
            console.log("\n" + "=".repeat(60));
            console.log("✨ اكتمل التشغيل بنجاح!");
            
            // عرض ملخص المرحلة
            const finalProgress = this.system.stageManager.getProgress();
            console.log(`\n📊 ملخص التشغيل:`);
            console.log(`   📍 المرحلة: ${finalProgress.currentStage}`);
            console.log(`   📄 الصفحات: ${finalProgress.stageRange}`);
            console.log(`   📈 التقدم: ${finalProgress.progress} (${finalProgress.percentage}%)`);
            console.log(`   🆕 أفلام جديدة: ${stageResult.newMovies}`);
            console.log(`   🎬 إجمالي الأفلام: ${this.system.stats.totalMovies}`);
            console.log(`   ⏱️  المدة: ${totalDuration.toFixed(2)} دقيقة`);
            console.log(`   📁 الملف النشط: ${this.system.lastTopCinemaFile.filename}`);
            
            // عرض إحصائيات الطلبات
            const requestStats = this.requestManager.getStats();
            console.log(`\n📡 إحصائيات الطلبات:`);
            console.log(`   ✅ ناجحة: ${requestStats.successful}`);
            console.log(`   ❌ فاشلة: ${requestStats.failed}`);
            console.log(`   🔄 إعادة محاولة: ${requestStats.retries}`);
            
            if (this.system.stats.failedMovies > 0) {
                console.log(`\n⚠️  هناك ${this.system.stats.failedMovies} فيلم فشل في المعالجة`);
                console.log(`   📄 راجع ${CONFIG.files.failed} للتفاصيل`);
            }
            
            // رسالة للمرحلة القادمة
            console.log("\n📅 للمرحلة القادمة:");
            if (finalProgress.isComplete) {
                if (finalProgress.currentStage < CONFIG.maxStages) {
                    console.log(`   سيبدأ التشغيل القادم من المرحلة ${finalProgress.currentStage + 1}`);
                } else {
                    console.log(`   🎉 وصلت إلى آخر مرحلة!`);
                }
            } else {
                console.log(`   سيستأنف من الصفحة ${finalProgress.nextPage || 'بداية المرحلة'}`);
            }
            
        } catch (error) {
            console.error('\n💥 خطأ غير متوقع:', error.message);
            console.error('Stack:', error.stack);
            
            if (this.system) {
                this.system.resumeManager.addError({
                    message: error.message,
                    type: 'fatal',
                    time: new Date().toISOString()
                });
                this.storageManager.saveSystemData(this.system);
                this.system.stageManager.markStageEnd();
            }
        }
    }
}

// ==================== سكريبت للتحكم في المراحل ====================
class StageController {
    static async showStatus() {
        const storageManager = new StorageManager();
        const system = storageManager.initSystem();
        
        const progress = system.stageManager.getProgress();
        
        console.log("📊 حالة نظام جمع الأفلام");
        console.log("=".repeat(50));
        console.log(`📍 المرحلة الحالية: ${progress.currentStage}/${progress.totalStages}`);
        console.log(`📄 نطاق الصفحات: ${progress.stageRange}`);
        console.log(`📈 التقدم: ${progress.progress} (${progress.percentage}%)`);
        console.log(`🎬 الأفلام المجمعة: ${progress.totalMovies}`);
        console.log(`📁 الملفات: ${system.stats.totalFiles}`);
        
        if (progress.isComplete) {
            console.log(`✅ المرحلة ${progress.currentStage} مكتملة`);
        } else {
            console.log(`⏳ الصفحة التالية: ${progress.nextPage || 'بداية المرحلة'}`);
        }
        
        // عرض تاريخ المراحل
        if (system.stageManager.currentStage.stageHistory.length > 0) {
            console.log("\n📅 تاريخ المراحل:");
            system.stageManager.currentStage.stageHistory.slice(-5).forEach(history => {
                console.log(`   المرحلة ${history.stage}: ${history.moviesCollected} أفلام - ${history.duration?.toFixed(1) || '?'} دقيقة`);
            });
        }
    }
    
    static async moveToNextStage() {
        const storageManager = new StorageManager();
        const system = storageManager.initSystem();
        
        const progress = system.stageManager.getProgress();
        
        if (!progress.isComplete) {
            console.log(`⚠️  المرحلة ${progress.currentStage} غير مكتملة بعد!`);
            console.log(`   التقدم: ${progress.progress}`);
            return false;
        }
        
        if (system.stageManager.moveToNextStage()) {
            console.log(`✅ انتقلت للمرحلة ${system.stageManager.currentStage.currentStage}`);
            return true;
        } else {
            console.log("❌ لا يمكن الانتقال لمرحلة أخرى");
            return false;
        }
    }
    
    static async resetStage(stageNumber = 1) {
        const storageManager = new StorageManager();
        const system = storageManager.initSystem();
        
        system.stageManager.currentStage.currentStage = stageNumber;
        system.stageManager.currentStage.completedPages = [];
        system.stageManager.currentStage.moviesInCurrentStage = 0;
        system.stageManager.currentStage.currentPage = ((stageNumber - 1) * CONFIG.stageSize) + 1;
        system.stageManager.saveStageProgress();
        
        console.log(`🔄 إعادة تعيين المرحلة إلى ${stageNumber}`);
    }
}

// ==================== التشغيل الرئيسي ====================
const scraper = new MovieScraper();

// التحقق من أوامر سطر الأوامر
const args = process.argv.slice(2);
const command = args[0];

if (command === 'status') {
    StageController.showStatus();
} else if (command === 'next') {
    StageController.moveToNextStage();
} else if (command === 'reset') {
    const stage = parseInt(args[1]) || 1;
    StageController.resetStage(stage);
} else if (command === 'help') {
    console.log("🎬 أوامر نظام جمع الأفلام:");
    console.log("  npm start           - تشغيل النظام (استخراج 5 صفحات)");
    console.log("  npm run status      - عرض حالة النظام");
    console.log("  npm run next        - الانتقال للمرحلة التالية");
    console.log("  npm run reset [N]   - إعادة تعيين المرحلة (المرحلة 1 افتراضياً)");
    console.log("  npm run help        - عرض هذه المساعدة");
} else {
    // التشغيل العادي
    scraper.run();
}
