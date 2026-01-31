import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==================== الإعدادات المحسنة ====================
const CONFIG = {
    baseUrl: "https://topcinema.rip/movies",
    outputDir: path.join(__dirname, "movies"),
    
    files: {
        home: "Home.json",
        index: "index.json",
        stats: "stats.json",
        failed: "failed_movies.json",  // سجل الأفلام الفاشلة
        resume: "resume_point.json"    // نقطة الاستئناف
    },
    
    batchSize: 250,
    requestDelay: 1500,  // زيادة قليلاً لتفادي الحظر
    timeout: 40000,      // زيادة المهلة
    
    // إعدادات التكرار
    maxRetries: 3,       // الحد الأقصى للمحاولات
    retryDelay: 3000,    // تأخير بين المحاولات
    
    // إعدادات التجاوز
    skipOnError: true,   // تخطي عند الفشل
    continueOnFail: true, // الاستمرار عند فشل فيلم
    
    isFirstRun: false,
    scanOnlyPage2: true,
    maxPagesFirstRun: 100,
    
    // إعدادات الأداء
    parallelRequests: 2,   // عدد الطلبات المتوازية
    chunkSize: 5,         // حجم الدفعة للمعالجة
    saveInterval: 10      // حفظ كل 10 أفلام
};

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
                return { movies: {}, retryCount: {} };
            }
        }
        return { movies: {}, retryCount: {}, lastUpdated: new Date().toISOString() };
    }
    
    saveFailedMovies() {
        this.failedMovies.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.failedMoviesFile, JSON.stringify(this.failedMovies, null, 2));
    }
    
    addFailedMovie(movieId, error, url) {
        if (!this.failedMovies.movies[movieId]) {
            this.failedMovies.movies[movieId] = {
                id: movieId,
                url: url,
                error: error.message || error,
                firstFailed: new Date().toISOString(),
                retryCount: 0,
                lastRetry: new Date().toISOString()
            };
        } else {
            this.failedMovies.movies[movieId].retryCount++;
            this.failedMovies.movies[movieId].lastRetry = new Date().toISOString();
            this.failedMovies.movies[movieId].lastError = error.message || error;
        }
        
        if (!this.failedMovies.retryCount[movieId]) {
            this.failedMovies.retryCount[movieId] = 1;
        } else {
            this.failedMovies.retryCount[movieId]++;
        }
        
        this.saveFailedMovies();
        console.log(`   ❌ تم تسجيل الفيلم الفاشل: ${movieId}`);
    }
    
    shouldRetry(movieId) {
        const retryCount = this.failedMovies.retryCount[movieId] || 0;
        return retryCount < CONFIG.maxRetries;
    }
    
    clearSuccessMovie(movieId) {
        if (this.failedMovies.movies[movieId]) {
            delete this.failedMovies.movies[movieId];
            delete this.failedMovies.retryCount[movieId];
            this.saveFailedMovies();
        }
    }
    
    getFailedCount() {
        return Object.keys(this.failedMovies.movies || {}).length;
    }
}

// ==================== نظام استئناف التشغيل ====================
class ResumeManager {
    constructor() {
        this.resumeFile = path.join(CONFIG.outputDir, CONFIG.files.resume);
        this.state = this.loadState();
    }
    
    loadState() {
        if (fs.existsSync(this.resumeFile)) {
            try {
                return JSON.parse(fs.readFileSync(this.resumeFile, 'utf8'));
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
            currentPage: 1,
            currentMovieIndex: 0,
            totalProcessed: 0,
            lastSuccessId: null,
            mode: "firstRun" // أو "dailyUpdate"
        };
    }
    
    saveState(stateUpdate = {}) {
        this.state = { ...this.state, ...stateUpdate, lastSave: new Date().toISOString() };
        fs.writeFileSync(this.resumeFile, JSON.stringify(this.state, null, 2));
    }
    
    markStart(mode) {
        this.saveState({
            isRunning: true,
            startTime: new Date().toISOString(),
            mode: mode,
            currentPage: 1,
            currentMovieIndex: 0,
            totalProcessed: 0
        });
    }
    
    markProgress(page, index, movieId) {
        this.saveState({
            currentPage: page,
            currentMovieIndex: index,
            lastSuccessId: movieId,
            totalProcessed: this.state.totalProcessed + 1
        });
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
        return {
            page: this.state.currentPage,
            index: this.state.currentMovieIndex
        };
    }
}

// ==================== نظام التخزين الذكي ====================
class StorageManager {
    constructor() {
        this.errorManager = new ErrorManager();
        this.resumeManager = new ResumeManager();
    }
    
    initSystem() {
        if (!fs.existsSync(CONFIG.outputDir)) {
            fs.mkdirSync(CONFIG.outputDir, { recursive: true });
            console.log(`📁 تم إنشاء المجلد: ${CONFIG.outputDir}`);
        }
        
        const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
        if (!fs.existsSync(indexFile)) {
            CONFIG.isFirstRun = true;
            console.log("🆕 هذا هو التشغيل الأول للنظام");
        } else {
            try {
                const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                CONFIG.isFirstRun = Object.keys(data.movies || {}).length === 0;
            } catch {
                CONFIG.isFirstRun = true;
            }
        }
        
        return {
            index: this.loadIndex(),
            stats: this.loadStats(),
            lastTopCinemaFile: this.getLastTopCinemaFile(),
            errorManager: this.errorManager,
            resumeManager: this.resumeManager
        };
    }
    
    loadIndex() {
        const indexFile = path.join(CONFIG.outputDir, CONFIG.files.index);
        if (fs.existsSync(indexFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
                console.log(`📊 الفهرس المحمول: ${Object.keys(data.movies || {}).length} فيلم`);
                return data;
            } catch (error) {
                console.log(`❌ خطأ في تحميل الفهرس: ${error.message}`);
            }
        }
        return {
            movies: {},
            lastUpdated: new Date().toISOString(),
            version: "2.0"
        };
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
        return {
            totalMovies: 0,
            totalFiles: 0,
            failedMovies: 0,
            firstRunDate: new Date().toISOString(),
            lastRunDate: null,
            runs: []
        };
    }
    
    getLastTopCinemaFile() {
        const files = fs.readdirSync(CONFIG.outputDir);
        const topCinemaFiles = files.filter(f => f.startsWith('TopCinema') && f.endsWith('.json'));
        
        if (topCinemaFiles.length === 0) {
            return {
                filename: "TopCinema1.json",
                number: 1,
                movieCount: 0,
                isFull: false,
                path: path.join(CONFIG.outputDir, "TopCinema1.json")
            };
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
            return {
                filename: lastFile,
                number: parseInt(lastFile.match(/TopCinema(\d+)\.json/)?.[1] || 1),
                movieCount: 0,
                isFull: false,
                path: filePath
            };
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
            metadata: { batchSize: CONFIG.batchSize, source: "topcinema.rip" }
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
                console.log(`   ⚠️ الفيلم ${movieData.id} موجود مسبقاً`);
                return { success: false, reason: 'duplicate' };
            }
            
            // التحقق من البيانات الأساسية
            if (!movieData.id || !movieData.title || !movieData.url) {
                console.log(`   ⚠️ بيانات الفيلم ناقصة: ${movieData.id}`);
                return { success: false, reason: 'incomplete_data' };
            }
            
            content.movies.push(movieData);
            content.lastUpdated = new Date().toISOString();
            content.totalMovies = content.movies.length;
            
            fs.writeFileSync(topCinemaInfo.path, JSON.stringify(content, null, 2));
            console.log(`   ✅ أضيف الفيلم ${movieData.id} إلى ${topCinemaInfo.filename}`);
            
            // تحديث الفهرس
            this.updateIndex(movieData, topCinemaInfo, system);
            
            // مسح من قائمة الفاشلين إذا كان موجوداً
            this.errorManager.clearSuccessMovie(movieData.id);
            
            return { success: true };
            
        } catch (error) {
            console.log(`❌ خطأ في إضافة الفيلم للملف: ${error.message}`);
            this.errorManager.addFailedMovie(movieData.id, error, movieData.url);
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
                hasDownloadServers: (movie.downloadServers?.length || 0) > 0
            };
            
            system.stats.totalMovies++;
            system.stats.successfulMovies = (system.stats.successfulMovies || 0) + 1;
            
        } else {
            system.index.movies[movie.id].lastSeen = now;
            system.index.movies[movie.id].lastPageSeen = movie.page;
            
            if (system.index.movies[movie.id].storedIn !== topCinemaFile.filename) {
                system.index.movies[movie.id].storedIn = topCinemaFile.filename;
            }
        }
    }
    
    saveSystemData(system) {
        try {
            system.index.lastUpdated = new Date().toISOString();
            this.saveToFile(CONFIG.files.index, system.index);
            
            system.stats.lastRunDate = new Date().toISOString();
            system.stats.failedMovies = this.errorManager.getFailedCount();
            system.stats.runs = system.stats.runs || [];
            
            const runStats = {
                date: new Date().toISOString(),
                newMovies: system.newMoviesCount || 0,
                updatedMovies: system.updatedMoviesCount || 0,
                failedMovies: system.stats.failedMovies || 0,
                totalMovies: system.stats.totalMovies,
                duration: system.currentRunDuration || 0
            };
            
            system.stats.runs.push(runStats);
            
            if (system.stats.runs.length > 30) {
                system.stats.runs = system.stats.runs.slice(-30);
            }
            
            this.saveToFile(CONFIG.files.stats, system.stats);
            console.log(`💾 تم حفظ بيانات النظام (${system.stats.totalMovies} فيلم)`);
            
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
    }
    
    async fetchWithRetry(url, options = {}, retryCount = 0) {
        if (retryCount >= CONFIG.maxRetries) {
            console.log(`   ⏹️ تخطي بعد ${CONFIG.maxRetries} محاولات فاشلة`);
            return null;
        }
        
        // التحكم في الطلبات المتوازية
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
            
            // التحقق من أن الصفحة تحتوي على بيانات
            if (!text || text.length < 1000) {
                throw new Error('صفحة فارغة أو غير مكتملة');
            }
            
            this.activeRequests--;
            return text;
            
        } catch (error) {
            this.activeRequests--;
            
            if (error.name === 'AbortError') {
                console.log(`   ⏱️ انتهى الوقت للطلب (محاولة ${retryCount + 1}/${CONFIG.maxRetries})`);
            } else {
                console.log(`   ❌ خطأ في الطلب (محاولة ${retryCount + 1}/${CONFIG.maxRetries}): ${error.message}`);
            }
            
            // تأخير قبل إعادة المحاولة
            await this.delay(CONFIG.retryDelay * (retryCount + 1));
            
            // إعادة المحاولة
            return this.fetchWithRetry(url, options, retryCount + 1);
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ==================== استخراج البيانات مع التعافي من الأخطاء ====================
class DataExtractor {
    constructor() {
        this.requestManager = new RequestManager();
        this.errorManager = new ErrorManager();
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
        
        console.log(`📖 جلب الصفحة ${pageNum}`);
        
        const html = await this.requestManager.fetchWithRetry(url);
        if (!html) {
            console.log(`❌ فشل جلب الصفحة ${pageNum} بعد جميع المحاولات`);
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
                        
                        // استخراج ID مبدئي من الرابط
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
        // التحقق إذا كان الفيلم قد فشل سابقاً ولا يجب إعادة المحاولة
        if (this.errorManager.failedMovies.movies[movie.id]?.retryCount >= CONFIG.maxRetries) {
            console.log(`   ⏭️ تخطي ${movie.id} - فشل ${CONFIG.maxRetries} مرات`);
            return null;
        }
        
        for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
            try {
                console.log(`🎬 ${movie.title.substring(0, 40)}... (محاولة ${attempt}/${CONFIG.maxRetries})`);
                
                const result = await this.fetchMovieDetails(movie);
                if (result) {
                    // مسح من قائمة الفاشلين إذا نجحت
                    this.errorManager.clearSuccessMovie(movie.id);
                    return result;
                }
                
                if (attempt < CONFIG.maxRetries) {
                    console.log(`   ⏳ إعادة المحاولة بعد ${CONFIG.retryDelay}ms...`);
                    await this.requestManager.delay(CONFIG.retryDelay * attempt);
                }
                
            } catch (error) {
                console.log(`   ❌ محاولة ${attempt} فشلت: ${error.message}`);
                
                if (attempt === CONFIG.maxRetries) {
                    this.errorManager.addFailedMovie(movie.id, error, movie.url);
                    
                    if (CONFIG.skipOnError) {
                        console.log(`   ⏭️ تخطي الفيلم بسبب الأخطاء المتكررة`);
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
            
            // 1. استخراج ID من الرابط المختصر
            const shortLinkInput = doc.querySelector('#shortlink');
            const shortLink = shortLinkInput ? shortLinkInput.value : null;
            const movieId = this.extractMovieId(shortLink);
            
            if (!movieId || movieId.startsWith('error_')) {
                throw new Error('لا يمكن استخراج ID صالح');
            }
            
            // 2. البيانات الأساسية (مع التحقق)
            const title = doc.querySelector(".post-title a")?.textContent?.trim() || movie.title;
            const image = doc.querySelector(".image img")?.src || movie.tempImage;
            const imdbRating = doc.querySelector(".imdbR span")?.textContent?.trim();
            
            if (!title || title.length < 2) {
                throw new Error('عنوان الفيلم غير صالح');
            }
            
            // 3. القصة
            const story = doc.querySelector(".story p")?.textContent?.trim() || "غير متوفر";
            
            // 4. روابط المشاهدة والتحميل
            const watchLink = doc.querySelector('a.watch')?.getAttribute('href');
            const downloadLink = doc.querySelector('a.download')?.getAttribute('href');
            
            // 5. التفاصيل
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
            
            // 6. جلب سيرفرات المشاهدة والتحميل (بمحاولات منفصلة)
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
            
            // 7. تجميع البيانات الكاملة
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
            
            // البحث في meta tags
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
            
            // البحث في iframes
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
            
            // سيرفرات Pro
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
            
            // سيرفرات عادية
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

// ==================== نظام المعالجة الرئيسي ====================
class MovieScraper {
    constructor() {
        this.storageManager = new StorageManager();
        this.dataExtractor = new DataExtractor();
        this.requestManager = new RequestManager();
        this.system = null;
        this.startTime = null;
    }
    
    async processMoviesInChunks(movies, processFunction) {
        const chunks = [];
        for (let i = 0; i < movies.length; i += CONFIG.chunkSize) {
            chunks.push(movies.slice(i, i + CONFIG.chunkSize));
        }
        
        let processedCount = 0;
        
        for (const chunk of chunks) {
            const promises = chunk.map(movie => processFunction(movie));
            const results = await Promise.allSettled(promises);
            
            processedCount += chunk.length;
            console.log(`   📦 معالجة ${processedCount}/${movies.length} (${Math.round(processedCount/movies.length*100)}%)`);
            
            // حفظ مؤقت كل عدة دفعات
            if (processedCount % CONFIG.saveInterval === 0) {
                this.storageManager.saveSystemData(this.system);
            }
            
            // تأخير بين الدفعات
            await this.requestManager.delay(CONFIG.requestDelay);
        }
        
        return processedCount;
    }
    
    async firstRun() {
        console.log("🚀 بدء التشغيل الأول - تخزين كل الأفلام");
        console.log("=".repeat(60));
        
        this.startTime = new Date();
        this.system.resumeManager.markStart("firstRun");
        
        let currentPage = 1;
        let totalMoviesCollected = 0;
        let topCinemaFile = this.system.lastTopCinemaFile;
        let resumePoint = this.system.resumeManager.getResumePoint();
        
        // الاستئناف من النقطة السابقة إذا كان هناك
        if (this.system.resumeManager.shouldResume()) {
            currentPage = resumePoint.page;
            console.log(`🔄 الاستئناف من الصفحة ${currentPage}`);
        }
        
        while (currentPage <= CONFIG.maxPagesFirstRun) {
            console.log(`\n📄 الصفحة ${currentPage}/${CONFIG.maxPagesFirstRun}`);
            
            const movies = await this.dataExtractor.fetchMoviesFromPage(currentPage);
            
            if (movies.length === 0) {
                console.log(`⏹️ لا توجد أفلام في الصفحة ${currentPage} - ربما انتهت الصفحات`);
                break;
            }
            
            // الصفحة الأولى -> Home.json
            if (currentPage === 1) {
                const homeData = {
                    page: 1,
                    url: "https://topcinema.rip/movies/",
                    scrapedAt: new Date().toISOString(),
                    movies: movies.map(m => ({ id: m.id, title: m.title, url: m.url })),
                    total: movies.length
                };
                this.storageManager.saveToFile(CONFIG.files.home, homeData);
                console.log(`🏠 حفظ الصفحة الأولى في Home.json (${movies.length} فيلم)`);
            }
            
            // معالجة الأفلام في هذه الصفحة
            let pageStartIndex = 0;
            if (currentPage === resumePoint.page && this.system.resumeManager.shouldResume()) {
                pageStartIndex = resumePoint.index;
                console.log(`   ↪️ الاستئناف من الفيلم ${pageStartIndex + 1}`);
            }
            
            for (let i = pageStartIndex; i < movies.length; i++) {
                const movie = movies[i];
                
                // تخطي إذا كان موجوداً في الفهرس
                if (this.system.index.movies[movie.id]) {
                    console.log(`   ⏭️ ${i + 1}/${movies.length}: تخطي ${movie.id} - موجود مسبقاً`);
                    continue;
                }
                
                // التحقق من امتلاء الملف الحالي
                if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                    topCinemaFile = this.storageManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                    this.system.stats.totalFiles++;
                    console.log(`📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
                }
                
                // استخراج تفاصيل الفيلم مع إعادة المحاولة
                const movieDetails = await this.dataExtractor.fetchMovieDetailsWithRetry(movie, this.system);
                
                if (movieDetails) {
                    // تخزين الفيلم
                    const storageResult = await this.storageManager.addMovieToTopCinemaFile(
                        movieDetails, 
                        topCinemaFile, 
                        this.system
                    );
                    
                    if (storageResult.success) {
                        topCinemaFile.movieCount++;
                        totalMoviesCollected++;
                        
                        console.log(`   ✅ ${i + 1}/${movies.length}: ${movieDetails.title.substring(0, 30)}...`);
                        console.log(`     📊 جودة البيانات: ${movieDetails.dataQuality?.toFixed(0) || 0}%`);
                        console.log(`     👁️  مشاهدة: ${movieDetails.watchServers?.length || 0} سيرفر`);
                        console.log(`     📥 تحميل: ${movieDetails.downloadServers?.length || 0} سيرفر`);
                        
                        // حفظ نقطة الاستئناف
                        this.system.resumeManager.markProgress(currentPage, i + 1, movieDetails.id);
                    }
                }
                
                // تأخير بين الأفلام
                await this.requestManager.delay(CONFIG.requestDelay);
            }
            
            // الانتقال للصفحة التالية
            currentPage++;
            resumePoint = { page: currentPage, index: 0 }; // إعادة تعيين الفهرس
            
            // تأخير بين الصفحات
            if (currentPage <= CONFIG.maxPagesFirstRun) {
                await this.requestManager.delay(CONFIG.requestDelay * 2);
            }
            
            // حفظ النظام كل 5 صفحات
            if (currentPage % 5 === 0) {
                this.storageManager.saveSystemData(this.system);
            }
        }
        
        // إكمال التشغيل
        this.system.resumeManager.markComplete();
        const endTime = new Date();
        const duration = (endTime - this.startTime) / 1000 / 60;
        this.system.currentRunDuration = duration;
        
        console.log("\n" + "=".repeat(60));
        console.log(`✅ التشغيل الأول مكتمل!`);
        console.log(`📊 الإجمالي: ${totalMoviesCollected} فيلم`);
        console.log(`📁 الملفات: ${this.system.stats.totalFiles} ملف TopCinema`);
        console.log(`❌ فشل: ${this.system.stats.failedMovies || 0} فيلم`);
        console.log(`⏱️  المدة: ${duration.toFixed(2)} دقيقة`);
        
        this.storageManager.saveSystemData(this.system);
        return totalMoviesCollected;
    }
    
    async dailyUpdate() {
        console.log("🔄 بدء التحديث اليومي");
        console.log("=".repeat(60));
        
        this.startTime = new Date();
        this.system.resumeManager.markStart("dailyUpdate");
        
        this.system.newMoviesCount = 0;
        this.system.updatedMoviesCount = 0;
        let topCinemaFile = this.system.lastTopCinemaFile;
        
        // تحديث الصفحة الأولى
        console.log("\n1️⃣ تحديث الصفحة الأولى...");
        const page1Movies = await this.dataExtractor.fetchMoviesFromPage(1);
        
        if (page1Movies.length > 0) {
            const homeData = {
                page: 1,
                url: "https://topcinema.rip/movies/",
                scrapedAt: new Date().toISOString(),
                movies: page1Movies.map(m => ({ id: m.id, title: m.title, url: m.url })),
                total: page1Movies.length,
                updatedAt: new Date().toISOString()
            };
            this.storageManager.saveToFile(CONFIG.files.home, homeData);
            console.log(`🏠 تم تحديث Home.json بـ ${page1Movies.length} فيلم`);
        }
        
        // فحص الصفحة الثانية
        console.log("\n2️⃣ فحص الصفحة الثانية...");
        const page2Movies = await this.dataExtractor.fetchMoviesFromPage(2);
        console.log(`📊 الصفحة الثانية تحتوي على ${page2Movies.length} فيلم`);
        
        let newMoviesFound = 0;
        let resumePoint = this.system.resumeManager.getResumePoint();
        
        for (let i = resumePoint.index; i < page2Movies.length; i++) {
            const movie = page2Movies[i];
            
            // التحقق من امتلاء الملف الحالي
            if (topCinemaFile.movieCount >= CONFIG.batchSize) {
                topCinemaFile = this.storageManager.createNewTopCinemaFile(topCinemaFile.number + 1);
                this.system.stats.totalFiles++;
                console.log(`📦 إنشاء ملف جديد: ${topCinemaFile.filename}`);
            }
            
            // التحقق إذا كان الفيلم جديداً
            if (!this.system.index.movies[movie.id]) {
                console.log(`   🎯 ${i + 1}/${page2Movies.length}: فيلم جديد`);
                
                const movieDetails = await this.dataExtractor.fetchMovieDetailsWithRetry(movie, this.system);
                if (movieDetails) {
                    const storageResult = await this.storageManager.addMovieToTopCinemaFile(
                        movieDetails, 
                        topCinemaFile, 
                        this.system
                    );
                    
                    if (storageResult.success) {
                        topCinemaFile.movieCount++;
                        newMoviesFound++;
                        this.system.newMoviesCount++;
                        
                        console.log(`     ✅ ${movieDetails.title.substring(0, 30)}...`);
                        console.log(`     📊 جودة: ${movieDetails.dataQuality?.toFixed(0) || 0}%`);
                        
                        // حفظ نقطة الاستئناف
                        this.system.resumeManager.markProgress(2, i + 1, movieDetails.id);
                    }
                }
                
                await this.requestManager.delay(CONFIG.requestDelay);
                
            } else {
                // تحديث الفيلم الموجود
                this.storageManager.updateIndex(movie, topCinemaFile, this.system);
                this.system.updatedMoviesCount++;
            }
        }
        
        // إكمال التشغيل
        this.system.resumeManager.markComplete();
        const endTime = new Date();
        const duration = (endTime - this.startTime) / 1000 / 60;
        this.system.currentRunDuration = duration;
        
        console.log("\n" + "=".repeat(60));
        console.log("📊 نتائج التحديث اليومي:");
        console.log(`   🆕 أفلام جديدة: ${newMoviesFound}`);
        console.log(`   🔄 أفلام محدثة: ${this.system.updatedMoviesCount}`);
        console.log(`   ❌ أفلام فاشلة: ${this.system.stats.failedMovies || 0}`);
        console.log(`   📁 الملف النشط: ${topCinemaFile.filename} (${topCinemaFile.movieCount}/${CONFIG.batchSize})`);
        console.log(`   📈 إجمالي الأفلام: ${this.system.stats.totalMovies}`);
        console.log(`   ⏱️  المدة: ${duration.toFixed(2)} دقيقة`);
        
        this.storageManager.saveSystemData(this.system);
        
        return {
            newMovies: newMoviesFound,
            updatedMovies: this.system.updatedMoviesCount,
            failedMovies: this.system.stats.failedMovies,
            activeFile: topCinemaFile.filename
        };
    }
    
    async run() {
        console.log("🎬 نظام جمع الأفلام المحسن");
        console.log("=".repeat(60));
        
        try {
            // تهيئة النظام
            this.system = this.storageManager.initSystem();
            
            // اختبار الاتصال
            console.log("🔗 اختبار الاتصال بالموقع...");
            const testResponse = await this.requestManager.fetchWithRetry("https://topcinema.rip/", {}, 0);
            if (!testResponse) {
                console.log("❌ لا يمكن الوصول إلى الموقع. تحقق من اتصال الإنترنت.");
                return;
            }
            console.log("✅ الاتصال ناجح");
            
            // اختيار وضع التشغيل
            if (CONFIG.isFirstRun) {
                await this.firstRun();
            } else {
                await this.dailyUpdate();
            }
            
            console.log("\n✨ اكتمل التشغيل بنجاح!");
            
            // عرض ملخص الأخطاء
            const failedCount = this.storageManager.errorManager.getFailedCount();
            if (failedCount > 0) {
                console.log(`⚠️  هناك ${failedCount} فيلم فشل في المعالجة`);
                console.log(`   📄 راجع ${CONFIG.files.failed} للتفاصيل`);
            }
            
        } catch (error) {
            console.error('💥 خطأ غير متوقع:', error.message);
            console.error('Stack:', error.stack);
            
            // حفظ حالة النظام قبل الخروج
            if (this.system) {
                this.system.resumeManager.saveState({ 
                    error: error.message,
                    lastError: new Date().toISOString()
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
