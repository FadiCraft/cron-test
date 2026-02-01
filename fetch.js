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
        stage: "stage_progress.json"  // تتبع تقدم المراحل
    },
    
    // إعدادات المراحل
    stageSize: 5,           // عدد الصفحات في كل مرحلة
    maxStages: 20,          // الحد الأقصى للمراحل (100 صفحة)
    
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
                console.log(`📊 تم تحميل تقدم المرحلة ${data.currentStage} (${data.completedPages.length}/${CONFIG.stageSize} صفحات)`);
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
            stageHistory: []
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
            this.currentStage.currentPage = pageNumber + 1;
            this.saveStageProgress();
        }
    }
    
    addToStageHistory(stageData) {
        this.currentStage.stageHistory.push({
            stage: this.currentStage.currentStage,
            completedAt: new Date().toISOString(),
            pagesCompleted: [...this.currentStage.completedPages],
            moviesCollected: stageData.moviesCollected,
            duration: stageData.duration
        });
        
        // الاحتفاظ فقط بـ 50 سجل آخر
        if (this.currentStage.stageHistory.length > 50) {
            this.currentStage.stageHistory = this.currentStage.stageHistory.slice(-50);
        }
    }
    
    nextStage() {
        const stageData = {
            moviesCollected: this.currentStage.moviesInCurrentStage,
            duration: 0 // سيتم تعبئته لاحقاً
        };
        
        this.addToStageHistory(stageData);
        
        this.currentStage.currentStage++;
        this.currentStage.completedPages = [];
        this.currentStage.moviesInCurrentStage = 0;
        this.currentStage.currentPage = ((this.currentStage.currentStage - 1) * CONFIG.stageSize) + 1;
        
        this.saveStageProgress();
        console.log(`🔄 الانتقال إلى المرحلة ${this.currentStage.currentStage}`);
        
        return this.currentStage.currentStage;
    }
    
    isStageComplete() {
        const { startPage, endPage } = this.getCurrentStageRange();
        const pagesInStage = endPage - startPage + 1;
        return this.currentStage.completedPages.length >= pagesInStage;
    }
    
    getNextPage() {
        const { startPage, endPage } = this.getCurrentStageRange();
        
        // العثور على أول صفحة غير مكتملة في المرحلة الحالية
        for (let page = startPage; page <= endPage; page++) {
            if (!this.currentStage.completedPages.includes(page)) {
                return page;
            }
        }
        
        // إذا كانت كل الصفحات مكتملة
        return null;
    }
    
    getProgress() {
        const { startPage, endPage } = this.getCurrentStageRange();
        const totalPagesInStage = endPage - startPage + 1;
        const completed = this.currentStage.completedPages.length;
        
        return {
            currentStage: this.currentStage.currentStage,
            totalStages: CONFIG.maxStages,
            stageProgress: `${completed}/${totalPagesInStage}`,
            percentage: Math.round((completed / totalPagesInStage) * 100),
            nextPage: this.getNextPage(),
            totalMovies: this.currentStage.totalMoviesCollected
        };
    }
}

// ==================== نظام استئناف التشغيل المحسن ====================
class ResumeManager {
    constructor() {
        this.resumeFile = path.join(CONFIG.outputDir, CONFIG.files.resume);
        this.state = this.loadState();
    }
    
    loadState() {
        if (fs.existsSync(this.resumeFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.resumeFile, 'utf8'));
                
                // التحقق من مدة الانقطاع
                if (data.lastSave) {
                    const lastSave = new Date(data.lastSave);
                    const now = new Date();
                    const hoursDiff = (now - lastSave) / (1000 * 60 * 60);
                    
                    if (hoursDiff > 24 && data.isRunning) {
                        console.log(`⚠️  انقطع التشغيل منذ ${hoursDiff.toFixed(1)} ساعة`);
                        data.isRunning = false;
                    }
                }
                
                console.log(`🔄 حالة الاستئناف: ${data.isRunning ? 'نشط' : 'غير نشط'}`);
                return data;
            } catch {
                return this.createInitialState();
            }
        }
        return this.createInitialState();
    }
    
    createInitialState() {
        return {
            isRunning: false,
            startTime: null,
            lastSave: null,
            currentMode: null,
            stageProgress: {},
            totalProcessed: 0,
            lastSuccessId: null,
            errors: []
        };
    }
    
    saveState(stateUpdate = {}) {
        this.state = { 
            ...this.state, 
            ...stateUpdate, 
            lastSave: new Date().toISOString() 
        };
        fs.writeFileSync(this.resumeFile, JSON.stringify(this.state, null, 2));
    }
    
    markStart(mode, stage = 1) {
        this.saveState({
            isRunning: true,
            startTime: new Date().toISOString(),
            currentMode: mode,
            stageProgress: { currentStage: stage },
            totalProcessed: 0,
            errors: []
        });
    }
    
    markProgress(page, index, movieId, stage) {
        this.saveState({
            stageProgress: { 
                currentStage: stage,
                currentPage: page,
                currentIndex: index
            },
            lastSuccessId: movieId,
            totalProcessed: this.state.totalProcessed + 1
        });
    }
    
    addError(error) {
        this.state.errors.push({
            message: error.message,
            time: new Date().toISOString(),
            type: error.type || 'unknown'
        });
        
        // الاحتفاظ فقط بـ 100 خطأ آخر
        if (this.state.errors.length > 100) {
            this.state.errors = this.state.errors.slice(-100);
        }
        
        this.saveState();
    }
    
    markStageComplete(stage, stats) {
        const stageProgress = this.state.stageProgress || {};
        stageProgress[`stage_${stage}`] = {
            completedAt: new Date().toISOString(),
            ...stats
        };
        
        this.saveState({ stageProgress });
    }
    
    markComplete() {
        this.saveState({
            isRunning: false,
            endTime: new Date().toISOString()
        });
    }
    
    shouldResume() {
        return this.state.isRunning && CONFIG.continueOnFail;
    }
    
    getResumePoint() {
        const stageProgress = this.state.stageProgress || {};
        return {
            page: stageProgress.currentPage || 1,
            index: stageProgress.currentIndex || 0,
            stage: stageProgress.currentStage || 1
        };
    }
}

// ==================== نظام إدارة الأخطاء ====================
class ErrorManager {
    constructor() {
        this.failedMoviesFile = path.join(CONFIG.outputDir, CONFIG.files.failed);
        this.failedMovies = this.loadFailedMovies();
    }
    
    loadFailedMovies() {
        if (fs.existsSync(this.failedMoviesFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.failedMoviesFile, 'utf8'));
            } catch {
                return { movies: {}, retryCount: {}, lastUpdated: new Date().toISOString() };
            }
        }
        return { movies: {}, retryCount: {}, lastUpdated: new Date().toISOString() };
    }
    
    saveFailedMovies() {
        this.failedMovies.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.failedMoviesFile, JSON.stringify(this.failedMovies, null, 2));
    }
    
    addFailedMovie(movieId, error, url, page) {
        if (!this.failedMovies.movies[movieId]) {
            this.failedMovies.movies[movieId] = {
                id: movieId,
                url: url,
                page: page,
                error: error.message || error,
                firstFailed: new Date().toISOString(),
                retryCount: 0,
                lastRetry: new Date().toISOString(),
                stage: this.getCurrentStage()
            };
        } else {
            this.failedMovies.movies[movieId].retryCount++;
            this.failedMovies.movies[movieId].lastRetry = new Date().toISOString();
            this.failedMovies.movies[movieId].lastError = error.message || error;
        }
        
        this.failedMovies.retryCount[movieId] = (this.failedMovies.retryCount[movieId] || 0) + 1;
        
        this.saveFailedMovies();
        console.log(`   ❌ فشل الفيلم ${movieId.substring(0, 15)}... (الصفحة ${page})`);
        
        return this.failedMovies.movies[movieId];
    }
    
    getCurrentStage() {
        // احسب المرحلة بناءً على الصفحة الحالية
        return Math.ceil((this.failedMovies.movies[Object.keys(this.failedMovies.movies)[0]]?.page || 1) / CONFIG.stageSize);
    }
    
    shouldRetry(movieId) {
        const retryCount = this.failedMovies.retryCount[movieId] || 0;
        return retryCount < CONFIG.maxRetries;
    }
    
    clearSuccessMovie(movieId) {
        if (this.failedMovies.movies[movieId]) {
            console.log(`   ✅ إزالة ${movieId.substring(0, 15)}... من قائمة الفاشلين`);
            delete this.failedMovies.movies[movieId];
            delete this.failedMovies.retryCount[movieId];
            this.saveFailedMovies();
        }
    }
    
    getFailedCount() {
        return Object.keys(this.failedMovies.movies || {}).length;
    }
    
    getFailedMoviesInStage(stage) {
        return Object.values(this.failedMovies.movies || {}).filter(movie => movie.stage === stage);
    }
}

// ==================== نظام التخزين الذكي ====================
class StorageManager {
    constructor() {
        this.errorManager = new ErrorManager();
        this.resumeManager = new ResumeManager();
        this.stageManager = new StageManager();
    }
    
    initSystem() {
        if (!fs.existsSync(CONFIG.outputDir)) {
            fs.mkdirSync(CONFIG.outputDir, { recursive: true });
            console.log(`📁 تم إنشاء المجلد: ${CONFIG.outputDir}`);
        }
        
        // تهيئة ملفات النظام
        const systemFiles = [CONFIG.files.index, CONFIG.files.stats, CONFIG.files.home];
        systemFiles.forEach(file => {
            const filePath = path.join(CONFIG.outputDir, file);
            if (!fs.existsSync(filePath)) {
                const initialData = this.getInitialDataForFile(file);
                fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
            }
        });
        
        const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
        let isFirstRun = false;
        
        if (fs.existsSync(indexFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                isFirstRun = Object.keys(data.movies || {}).length === 0;
            } catch {
                isFirstRun = true;
            }
        } else {
            isFirstRun = true;
        }
        
        console.log(`📊 النظام: ${isFirstRun ? 'تشغيل أول' : 'تحديث'}`);
        
        return {
            index: this.loadIndex(),
            stats: this.loadStats(),
            lastTopCinemaFile: this.getLastTopCinemaFile(),
            errorManager: this.errorManager,
            resumeManager: this.resumeManager,
            stageManager: this.stageManager,
            isFirstRun: isFirstRun
        };
    }
    
    getInitialDataForFile(filename) {
        switch (filename) {
            case CONFIG.files.index:
                return { movies: {}, lastUpdated: new Date().toISOString(), version: "3.0" };
            case CONFIG.files.stats:
                return {
                    totalMovies: 0,
                    totalFiles: 0,
                    failedMovies: 0,
                    firstRunDate: new Date().toISOString(),
                    lastRunDate: null,
                    runs: [],
                    stages: []
                };
            case CONFIG.files.home:
                return { movies: [], lastUpdated: new Date().toISOString() };
            default:
                return {};
        }
    }
    
    loadIndex() {
        const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
        if (fs.existsSync(indexFile)) {
            try {
                return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            } catch (error) {
                console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
            }
        }
        return this.getInitialDataForFile(CONFIG.files.index);
    }
    
    loadStats() {
        const statsFile = path.join(CONFIG.outputDir, CONFIG.files.stats);
        if (fs.existsSync(statsFile)) {
            try {
                return JSON.parse(fs.readFileSync(statsFile, 'utf8'));
            } catch (error) {
                console.log(`⚠️ خطأ في تحميل الإحصائيات: ${error.message}`);
            }
        }
        return this.getInitialDataForFile(CONFIG.files.stats);
    }
    
    getLastTopCinemaFile() {
        const files = fs.readdirSync(CONFIG.outputDir);
        const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
        
        if (topCinemaFiles.length === 0) {
            return this.createNewTopCinemaFile(1);
        }
        
        topCinemaFiles.sort((a, b) => {
            const numA = parseInt(a.match(/TopCinema(\d+)\.json/)?.[1] || 0);
            const numB = parseInt(b.match(/TopCinema(\d+)\.json/)?.[1] || 0);
            return numB - numA;
        });
        
        const lastFile = topCinemaFiles[0];
        const filePath = path.join(CONFIG.outputDir, lastFile);
        
        try {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
                filename: lastFile,
                number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
                movieCount: content.movies?.length || 0,
                isFull: (content.movies?.length || 0) >= CONFIG.batchSize,
                path: filePath
            };
        } catch (error) {
            console.log(`⚠️ خطأ في قراءة ملف ${lastFile}: ${error.message}`);
            return this.createNewTopCinemaFile(1);
        }
    }
    
    createNewTopCinemaFile(fileNumber) {
        const newFilename = `TopCinema${fileNumber}.json`;
        const newFilePath = path.join(CONFIG.outputDir, newFilename);
        
        const structure = {
            fileNumber: fileNumber,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            movies: [],
            totalMovies: 0,
            metadata: { 
                batchSize: CONFIG.batchSize, 
                source: "topcinema.rip",
                stage: this.stageManager.currentStage.currentStage
            }
        };
        
        fs.writeFileSync(newFilePath, JSON.stringify(structure, null, 2));
        console.log(`📄 تم إنشاء ملف جديد: ${newFilename}`);
        
        return {
            filename: newFilename,
            number: fileNumber,
            movieCount: 0,
            isFull: false,
            path: newFilePath
        };
    }
    
    async addMovieToTopCinemaFile(movieData, topCinemaInfo, system) {
        try {
            let content = { movies: [] };
            if (fs.existsSync(topCinemaInfo.path)) {
                content = JSON.parse(fs.readFileSync(topCinemaInfo.path, 'utf8'));
            }
            
            // التحقق من التكرار
            const exists = content.movies.some(m => m.id === movieData.id);
            if (exists) {
                console.log(`   ⚠️ ${movieData.id.substring(0, 15)}... موجود مسبقاً`);
                return { success: false, reason: 'duplicate' };
            }
            
            // التحقق من البيانات الأساسية
            if (!movieData.id || !movieData.title || !movieData.url) {
                console.log(`   ⚠️ بيانات ناقصة: ${movieData.id?.substring(0, 15) || 'unknown'}`);
                return { success: false, reason: 'incomplete_data' };
            }
            
            content.movies.push(movieData);
            content.lastUpdated = new Date().toISOString();
            content.totalMovies = content.movies.length;
            
            // إضافة معلومات المرحلة
            movieData.stage = system.stageManager.currentStage.currentStage;
            
            fs.writeFileSync(topCinemaInfo.path, JSON.stringify(content, null, 2));
            console.log(`   ✅ أضيف ${movieData.title.substring(0, 30)}...`);
            
            // تحديث الفهرس
            this.updateIndex(movieData, topCinemaInfo, system);
            
            // تحديث إحصاءات المرحلة
            system.stageManager.currentStage.moviesInCurrentStage++;
            system.stageManager.currentStage.totalMoviesCollected++;
            system.stageManager.saveStageProgress();
            
            // مسح من قائمة الفاشلين إذا كان موجوداً
            this.errorManager.clearSuccessMovie(movieData.id);
            
            return { success: true };
            
        } catch (error) {
            console.log(`❌ خطأ في إضافة الفيلم للملف: ${error.message}`);
            this.errorManager.addFailedMovie(movieData.id, error, movieData.url, movieData.page);
            return { success: false, reason: 'storage_error', error: error.message };
        }
    }
    
    updateIndex(movie, topCinemaFile, system) {
        const now = new Date().toISOString();
        
        if (!system.index.movies[movie.id]) {
            system.index.movies[movie.id] = {
                title: movie.title,
                image: movie.image,
                url: movie.url,
                firstSeen: now,
                lastSeen: now,
                storedIn: topCinemaFile.filename,
                lastPageSeen: movie.page,
                discoveryPage: movie.page,
                hasWatchServers: (movie.watchServers?.length || 0) > 0,
                hasDownloadServers: (movie.downloadServers?.length || 0) > 0,
                stage: system.stageManager.currentStage.currentStage,
                dataQuality: movie.dataQuality || 0
            };
            
            system.stats.totalMovies++;
            system.stats.successfulMovies = (system.stats.successfulMovies || 0) + 1;
            
        } else {
            system.index.movies[movie.id].lastSeen = now;
            system.index.movies[movie.id].lastPageSeen = movie.page;
            
            if (system.index.movies[movie.id].storedIn !== topCinemaFile.filename) {
                system.index.movies[movie.id].storedIn = topCinemaFile.filename;
            }
            
            system.stats.updatedMovies = (system.stats.updatedMovies || 0) + 1;
        }
    }
    
    saveSystemData(system, stageStats = null) {
        try {
            system.index.lastUpdated = new Date().toISOString();
            this.saveToFile(CONFIG.files.index, system.index);
            
            system.stats.lastRunDate = new Date().toISOString();
            system.stats.failedMovies = this.errorManager.getFailedCount();
            system.stats.runs = system.stats.runs || [];
            
            // إضافة إحصاءات المرحلة إذا كانت موجودة
            if (stageStats) {
                system.stats.stages = system.stats.stages || [];
                system.stats.stages.push(stageStats);
                
                if (system.stats.stages.length > 100) {
                    system.stats.stages = system.stats.stages.slice(-100);
                }
            }
            
            const runStats = {
                date: new Date().toISOString(),
                stage: system.stageManager.currentStage.currentStage,
                newMovies: system.newMoviesCount || 0,
                updatedMovies: system.updatedMoviesCount || 0,
                failedMovies: system.stats.failedMovies || 0,
                totalMovies: system.stats.totalMovies,
                duration: system.currentRunDuration || 0
            };
            
            system.stats.runs.push(runStats);
            
            if (system.stats.runs.length > 50) {
                system.stats.runs = system.stats.runs.slice(-50);
            }
            
            this.saveToFile(CONFIG.files.stats, system.stats);
            
        } catch (error) {
            console.log(`⚠️ خطأ في حفظ بيانات النظام: ${error.message}`);
        }
    }
    
    saveToFile(filename, data) {
        const filePath = path.join(CONFIG.outputDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return filePath;
    }
}

// ==================== نظام الطلبات الذكي ====================
class RequestManager {
    constructor() {
        this.activeRequests = 0;
        this.requestQueue = [];
        this.requestStats = {
            total: 0,
            successful: 0,
            failed: 0,
            retries: 0
        };
    }
    
    async fetchWithRetry(url, options = {}, retryCount = 0) {
        this.requestStats.total++;
        
        if (retryCount >= CONFIG.maxRetries) {
            this.requestStats.failed++;
            console.log(`   ⏹️ تخطي بعد ${CONFIG.maxRetries} محاولات`);
            return null;
        }
        
        while (this.activeRequests >= CONFIG.parallelRequests) {
            await this.delay(500);
        }
        
        this.activeRequests++;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
            
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ar,en;q=0.9',
                    'Referer': 'https://topcinema.rip/',
                    'Cache-Control': 'no-cache'
                },
                ...options
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            
            if (!text || text.length < 1000) {
                throw new Error('صفحة فارغة أو غير مكتملة');
            }
            
            this.activeRequests--;
            this.requestStats.successful++;
            
            return text;
            
        } catch (error) {
            this.activeRequests--;
            this.requestStats.retries++;
            
            if (error.name === 'AbortError') {
                console.log(`   ⏱️ انتهى الوقت (محاولة ${retryCount + 1}/${CONFIG.maxRetries})`);
            } else {
                console.log(`   ❌ خطأ (محاولة ${retryCount + 1}/${CONFIG.maxRetries}): ${error.message}`);
            }
            
            await this.delay(CONFIG.retryDelay * (retryCount + 1));
            
            return this.fetchWithRetry(url, options, retryCount + 1);
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getStats() {
        return { ...this.requestStats };
    }
}

// ==================== استخراج البيانات ====================
class DataExtractor {
    constructor() {
        this.requestManager = new RequestManager();
        this.errorManager = null;
    }
    
    setErrorManager(errorManager) {
        this.errorManager = errorManager;
    }
    
    extractMovieId(shortLink) {
        try {
            if (!shortLink) return `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const match = shortLink.match(/(?:p|gt)=(\d+)/);
            return match ? `id_${match[1]}` : `hash_${Date.now()}`;
        } catch {
            return `error_${Date.now()}`;
        }
    }
    
    async fetchMoviesFromPage(pageNum) {
        const url = pageNum === 1 
            ? "https://topcinema.rip/movies/"
            : `https://topcinema.rip/movies/page/${pageNum}/`;
        
        console.log(`📖 جلب الصفحة ${pageNum}...`);
        
        const html = await this.requestManager.fetchWithRetry(url);
        if (!html) {
            console.log(`❌ فشل جلب الصفحة ${pageNum}`);
            return [];
        }
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const movies = [];
            
            const movieElements = doc.querySelectorAll('.Small--Box a');
            console.log(`✅ عثر على ${movieElements.length} فيلم في الصفحة ${pageNum}`);
            
            movieElements.forEach((element, i) => {
                try {
                    const movieUrl = element.href;
                    
                    if (movieUrl && movieUrl.includes('topcinema.rip')) {
                        const title = element.querySelector('.title')?.textContent || 
                                    element.textContent || 
                                    `فيلم ${i + 1}`;
                        
                        const tempId = this.extractMovieId(movieUrl);
                        
                        movies.push({
                            id: tempId,
                            title: title.trim(),
                            url: movieUrl,
                            page: pageNum,
                            position: i + 1,
                            discoveredAt: new Date().toISOString(),
                            tempImage: element.querySelector('img')?.src
                        });
                    }
                } catch (error) {
                    console.log(`   ⚠️ خطأ في معالجة فيلم ${i + 1}: ${error.message}`);
                }
            });
            
            return movies;
            
        } catch (error) {
            console.log(`❌ خطأ في تحليل الصفحة ${pageNum}: ${error.message}`);
            return [];
        }
    }
    
    async fetchMovieDetailsWithRetry(movie, system) {
        // التحقق من فشل سابق
        if (this.errorManager?.failedMovies.movies[movie.id]?.retryCount >= CONFIG.maxRetries) {
            console.log(`   ⏭️ تخطي ${movie.id.substring(0, 15)}... - فشل سابقاً`);
            return null;
        }
        
        for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
            try {
                console.log(`🎬 ${movie.title.substring(0, 40)}... (محاولة ${attempt}/${CONFIG.maxRetries})`);
                
                const result = await this.fetchMovieDetails(movie);
                if (result) {
                    this.errorManager?.clearSuccessMovie(movie.id);
                    return result;
                }
                
                if (attempt < CONFIG.maxRetries) {
                    console.log(`   ⏳ إعادة المحاولة بعد ${CONFIG.retryDelay}ms...`);
                    await this.requestManager.delay(CONFIG.retryDelay * attempt);
                }
                
            } catch (error) {
                console.log(`   ❌ محاولة ${attempt} فشلت: ${error.message}`);
                
                if (attempt === CONFIG.maxRetries) {
                    this.errorManager?.addFailedMovie(movie.id, error, movie.url, movie.page);
                    
                    if (CONFIG.skipOnError) {
                        console.log(`   ⏭️ تخطي الفيلم`);
                        return null;
                    }
                }
                
                await this.requestManager.delay(CONFIG.retryDelay * attempt);
            }
        }
        
        return null;
    }
    
    async fetchMovieDetails(movie) {
        const html = await this.requestManager.fetchWithRetry(movie.url);
        if (!html) return null;
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            
            // استخراج ID
            const shortLinkInput = doc.querySelector('#shortlink');
            const shortLink = shortLinkInput ? shortLinkInput.value : null;
            const movieId = this.extractMovieId(shortLink);
            
            if (!movieId || movieId.startsWith('error_')) {
                throw new Error('لا يمكن استخراج ID صالح');
            }
            
            // البيانات الأساسية
            const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
            const image = doc.querySelector(".image img")?.src || movie.tempImage;
            const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
            
            if (!title || title.length < 2) {
                throw new Error('عنوان الفيلم غير صالح');
            }
            
            // القصة
            const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
            
            // الروابط
            const watchLink = doc.querySelector('a.watch')?.getAttribute('href');
            const downloadLink = doc.querySelector('a.download')?.getAttribute('href');
            
            // التفاصيل
            const details = {
                category: [],
                genres: [],
                quality: [],
                duration: "",
                releaseYear: [],
                language: [],
                country: [],
                directors: [],
                writers: [],
                actors: []
            };
            
            const detailItems = doc.querySelectorAll(".RightTaxContent li");
            detailItems.forEach(item => {
                const labelElement = item.querySelector("span");
                if (labelElement) {
                    const label = labelElement.textContent.replace(":", "").trim();
                    const links = item.querySelectorAll("a");
                    
                    if (links.length > 0) {
                        const values = Array.from(links).map(a => a.textContent.trim());
                        
                        if (label.includes("قسم الفيلم")) details.category = values;
                        else if (label.includes("نوع الفيلم")) details.genres = values;
                        else if (label.includes("جودة الفيلم")) details.quality = values;
                        else if (label.includes("موعد الصدور")) details.releaseYear = values;
                        else if (label.includes("لغة الفيلم")) details.language = values;
                        else if (label.includes("دولة الفيلم")) details.country = values;
                        else if (label.includes("المخرجين")) details.directors = values;
                        else if (label.includes("المؤلفين")) details.writers = values;
                        else if (label.includes("بطولة")) details.actors = values;
                    } else {
                        const text = item.textContent.trim();
                        const value = text.split(":").slice(1).join(":").trim();
                        if (label.includes("توقيت الفيلم")) details.duration = value;
                    }
                }
            });
            
            // سيرفرات المشاهدة والتحميل
            let watchServers = [];
            let downloadServers = [];
            
            if (watchLink) {
                try {
                    watchServers = await this.fetchWatchServers(watchLink);
                    await this.requestManager.delay(800);
                } catch (error) {
                    console.log(`   ⚠️ فشل جلب سيرفرات المشاهدة: ${error.message}`);
                }
            }
            
            if (downloadLink) {
                try {
                    downloadServers = await this.fetchDownloadServers(downloadLink);
                    await this.requestManager.delay(800);
                } catch (error) {
                    console.log(`   ⚠️ فشل جلب سيرفرات التحميل: ${error.message}`);
                }
            }
            
            // تجميع البيانات
            return {
                id: movieId,
                title: title,
                url: movie.url,
                shortLink: shortLink,
                image: image,
                imdbRating: imdbRating,
                story: story,
                details: details,
                watchServers: watchServers,
                downloadServers: downloadServers,
                page: movie.page,
                position: movie.position,
                discoveredAt: movie.discoveredAt,
                scrapedAt: new Date().toISOString(),
                dataQuality: this.calculateDataQuality(details, watchServers, downloadServers)
            };
            
        } catch (error) {
            console.log(`   ❌ خطأ في استخراج التفاصيل: ${error.message}`);
            throw error;
        }
    }
    
    calculateDataQuality(details, watchServers, downloadServers) {
        let score = 0;
        if (details.category.length > 0) score++;
        if (details.genres.length > 0) score++;
        if (details.quality.length > 0) score++;
        if (details.duration) score++;
        if (watchServers.length > 0) score++;
        if (downloadServers.length > 0) score++;
        return (score / 6) * 100;
    }
    
    async fetchWatchServers(watchUrl) {
        const html = await this.requestManager.fetchWithRetry(watchUrl);
        if (!html) return [];
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const watchServers = [];
            
            const metaElements = doc.querySelectorAll('meta');
            metaElements.forEach(meta => {
                const content = meta.getAttribute('content');
                if (content && content.includes('embed')) {
                    watchServers.push({
                        type: 'embed',
                        url: content,
                        quality: 'متعدد الجودات',
                        server: 'Embed Server'
                    });
                }
            });
            
            const iframes = doc.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                const src = iframe.getAttribute('src');
                if (src && src.includes('embed')) {
                    watchServers.push({
                        type: 'iframe',
                        url: src,
                        quality: 'متعدد الجودات',
                        server: 'Iframe Embed'
                    });
                }
            });
            
            return this.removeDuplicateServers(watchServers);
            
        } catch (error) {
            console.log(`   ⚠️ فشل استخراج سيرفرات المشاهدة: ${error.message}`);
            return [];
        }
    }
    
    async fetchDownloadServers(downloadUrl) {
        const html = await this.requestManager.fetchWithRetry(downloadUrl);
        if (!html) return [];
        
        try {
            const dom = new JSDOM(html);
            const doc = dom.window.document;
            const downloadServers = [];
            
            const proServerElements = doc.querySelectorAll('.proServer a.downloadsLink');
            proServerElements.forEach(server => {
                const nameElement = server.querySelector('.text span');
                const providerElement = server.querySelector('.text p');
                
                const serverName = nameElement?.textContent?.trim() || 'متعدد الجودات';
                const provider = providerElement?.textContent?.trim() || 'غير معروف';
                const url = server.getAttribute('href') || '';
                
                if (url) {
                    downloadServers.push({
                        server: provider,
                        url: url,
                        quality: serverName,
                        type: 'pro'
                    });
                }
            });
            
            const normalServerElements = doc.querySelectorAll('.download-items li a.downloadsLink');
            normalServerElements.forEach(server => {
                const providerElement = server.querySelector('.text span');
                const qualityElement = server.querySelector('.text p');
                
                const provider = providerElement?.textContent?.trim() || 'غير معروف';
                const quality = qualityElement?.textContent?.trim() || 'غير معروف';
                const url = server.getAttribute('href') || '';
                
                if (url && !server.closest('.proServer')) {
                    downloadServers.push({
                        server: provider,
                        url: url,
                        quality: quality,
                        type: 'normal'
                    });
                }
            });
            
            return this.removeDuplicateServers(downloadServers);
            
        } catch (error) {
            console.log(`   ⚠️ فشل استخراج سيرفرات التحميل: ${error.message}`);
            return [];
        }
    }
    
    removeDuplicateServers(servers) {
        const uniqueServers = [];
        const seenUrls = new Set();
        
        servers.forEach(server => {
            if (!seenUrls.has(server.url)) {
                seenUrls.add(server.url);
                uniqueServers.push(server);
            }
        });
        
        return uniqueServers;
    }
}

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
        console.log("=".repeat(50));
        
        this.currentStageStartTime = new Date();
        const stageProgress = this.system.stageManager.getProgress();
        
        console.log(`📊 تقدم المرحلة: ${stageProgress.stageProgress} (${stageProgress.percentage}%)`);
        
        let topCinemaFile = this.system.lastTopCinemaFile;
        let moviesInStage = 0;
        let newMoviesInStage = 0;
        
        while (true) {
            // الحصول على الصفحة التالية في المرحلة
            const nextPage = this.system.stageManager.getNextPage();
            if (!nextPage) {
                console.log("✅ اكتملت جميع الصفحات في هذه المرحلة");
                break;
            }
            
            // تحديد إذا كانت هذه هي آخر صفحة في المرحلة
            const { startPage, endPage } = this.system.stageManager.getCurrentStageRange();
            const isLastPageInStage = nextPage === endPage;
            
            console.log(`\n📄 الصفحة ${nextPage} (${nextPage - startPage + 1}/${endPage - startPage + 1} في المرحلة)`);
            
            // جلب الأفلام من الصفحة
            const movies = await this.dataExtractor.fetchMoviesFromPage(nextPage);
            
            if (movies.length === 0) {
                console.log(`⏹️ لا توجد أفلام في الصفحة ${nextPage}`);
                this.system.stageManager.markPageCompleted(nextPage);
                continue;
            }
            
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
                console.log(`🏠 حفظ الصفحة الأولى (${movies.length} فيلم)`);
            }
            
            // معالجة كل فيلم في الصفحة
            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];
                
                // التحقق إذا كان الفيلم موجوداً مسبقاً
                if (this.system.index.movies[movie.id]) {
                    console.log(`   ⏭️ ${i + 1}/${movies.length}: ${movie.title.substring(0, 30)}... - موجود`);
                    this.system.storageManager.updateIndex(movie, topCinemaFile, this.system);
                    this.system.updatedMoviesCount = (this.system.updatedMoviesCount || 0) + 1;
                    continue;
                }
                
                // التحقق من امتلاء الملف الحالي
                if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                    topCinemaFile = this.storageManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                    this.system.stats.totalFiles++;
                    console.log(`📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
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
                        moviesInStage++;
                        newMoviesInStage++;
                        
                        console.log(`   ✅ ${i + 1}/${movies.length}: ${movieDetails.title.substring(0, 30)}...`);
                        console.log(`     📊 جودة: ${movieDetails.dataQuality?.toFixed(0) || 0}%`);
                        console.log(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0}`);
                        console.log(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0}`);
                        
                        // حفظ نقطة التقدم
                        this.system.resumeManager.markProgress(nextPage, i + 1, movieDetails.id, stageNumber);
                    }
                }
                
                // تأخير بين الأفلام
                if (i < movies.length - 1) {
                    await this.requestManager.delay(CONFIG.requestDelay);
                }
            }
            
            // تحديث تقدم الصفحة
            this.system.stageManager.markPageCompleted(nextPage);
            
            // حفظ النظام كل صفحتين
            if (nextPage % 2 === 0) {
                this.storageManager.saveSystemData(this.system);
            }
            
            // تأخير بين الصفحات (تأخير أطول للصفحة الأخيرة)
            if (!isLastPageInStage) {
                await this.requestManager.delay(CONFIG.requestDelay * 1.5);
            } else {
                console.log(`\n⏳ إكمال المرحلة ${stageNumber}...`);
                await this.requestManager.delay(CONFIG.requestDelay * 2);
            }
        }
        
        // إكمال المرحلة
        const stageEndTime = new Date();
        const stageDuration = (stageEndTime - this.currentStageStartTime) / 1000 / 60;
        
        const stageStats = {
            stage: stageNumber,
            completedAt: new Date().toISOString(),
            duration: stageDuration,
            moviesCollected: newMoviesInStage,
            totalRequests: this.requestManager.getStats().total,
            successfulRequests: this.requestManager.getStats().successful,
            failedRequests: this.requestManager.getStats().failed
        };
        
        this.system.resumeManager.markStageComplete(stageNumber, stageStats);
        this.storageManager.saveSystemData(this.system, stageStats);
        
        console.log("\n" + "=".repeat(50));
        console.log(`✅ اكتملت المرحلة ${stageNumber}`);
        console.log(`📊 النتائج:`);
        console.log(`   🆕 أفلام جديدة: ${newMoviesInStage}`);
        console.log(`   ⏱️  المدة: ${stageDuration.toFixed(2)} دقيقة`);
        console.log(`   📈 إجمالي المراحل: ${stageNumber}/${CONFIG.maxStages}`);
        console.log(`   🎬 إجمالي الأفلام: ${this.system.stats.totalMovies}`);
        
        return {
            stage: stageNumber,
            moviesCollected: newMoviesInStage,
            duration: stageDuration,
            totalMovies: this.system.stats.totalMovies
        };
    }
    
    async run() {
        console.log("🎬 نظام جمع الأفلام على مراحل");
        console.log("=".repeat(60));
        
        try {
            // تهيئة النظام
            this.system = this.storageManager.initSystem();
            this.dataExtractor.setErrorManager(this.system.errorManager);
            
            // التحقق من حالة التشغيل السابقة
            const shouldResume = this.system.resumeManager.shouldResume();
            let currentStage = this.system.stageManager.currentStage.currentStage;
            
            if (shouldResume) {
                const resumePoint = this.system.resumeManager.getResumePoint();
                console.log(`🔄 استئناف التشغيل من المرحلة ${resumePoint.stage}`);
                console.log(`   📄 الصفحة ${resumePoint.page}, الفهرس ${resumePoint.index}`);
                currentStage = resumePoint.stage;
            } else {
                // بدء تشغيل جديد
                console.log("🆕 بدء تشغيل جديد");
                this.system.resumeManager.markStart("staged", currentStage);
            }
            
            // اختبار الاتصال
            console.log("🔗 اختبار الاتصال...");
            const testResponse = await this.requestManager.fetchWithRetry("https://topcinema.rip/");
            if (!testResponse) {
                console.log("❌ لا يمكن الوصول إلى الموقع");
                return;
            }
            console.log("✅ الاتصال ناجح");
            
            this.startTime = new Date();
            let totalMoviesCollected = 0;
            
            // تشغيل المراحل
            while (currentStage <= CONFIG.maxStages) {
                const stageResult = await this.runStage(currentStage);
                totalMoviesCollected += stageResult.moviesCollected;
                
                // الانتقال للمرحلة التالية إذا لم تكن الأخيرة
                if (currentStage < CONFIG.maxStages) {
                    const nextStage = this.system.stageManager.nextStage();
                    currentStage = nextStage;
                    
                    console.log(`\n⏳ استراحة قبل المرحلة التالية...`);
                    await this.requestManager.delay(5000); // استراحة 5 ثواني بين المراحل
                } else {
                    console.log("\n🎉 اكتملت جميع المراحل!");
                    break;
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
            console.log("\n📊 الملخص النهائي:");
            console.log(`   📈 المراحل المكتملة: ${currentStage - 1}/${CONFIG.maxStages}`);
            console.log(`   🎬 الأفلام المجمعة: ${totalMoviesCollected}`);
            console.log(`   📁 إجمالي الأفلام: ${this.system.stats.totalMovies}`);
            console.log(`   ⏱️  المدة الكلية: ${totalDuration.toFixed(2)} دقيقة`);
            console.log(`   ❌ الأفلام الفاشلة: ${this.system.stats.failedMovies}`);
            console.log(`   📄 الملف النشط: ${this.system.lastTopCinemaFile.filename}`);
            
            // عرض تقدم المراحل
            const progress = this.system.stageManager.getProgress();
            console.log(`\n📅 التقدم الحالي: المرحلة ${progress.currentStage} (${progress.percentage}%)`);
            
            if (this.system.stats.failedMovies > 0) {
                console.log(`\n⚠️  هناك ${this.system.stats.failedMovies} فيلم فشل في المعالجة`);
                console.log(`   📄 راجع ${CONFIG.files.failed} للتفاصيل`);
            }
            
        } catch (error) {
            console.error('💥 خطأ غير متوقع:', error.message);
            
            // حفظ حالة النظام قبل الخروج
            if (this.system) {
                this.system.resumeManager.addError({
                    message: error.message,
                    type: 'fatal'
                });
                this.storageManager.saveSystemData(this.system);
            }
            
            process.exit(1);
        }
    }
}

// ==================== التشغيل ====================
const scraper = new MovieScraper();
scraper.run();
