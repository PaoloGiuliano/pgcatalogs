// lib/metrics.js

class Metrics {
    constructor() {
        this.data = {
            startTime: Date.now(),

            discover: {
                pages: 0,
                duration: 0
            },

            filtering: {
                before: 0,
                after: 0
            },

            processing: {
                total: 0,
                successes: 0,
                failures: 0,
                duration: 0
            },

            omdb: {
                hits: 0,
                fetches: 0
            },

            tmdb: {
                calls: 0
            },

            totalDuration: 0
        };

        this._discoverStart = 0;
        this._processingStart = 0;
    }

    // ---- Discover Timing ----
    startDiscover() {
        this._discoverStart = Date.now();
    }

    endDiscover(pageCount) {
        this.data.discover.pages = pageCount;
        this.data.discover.duration = Date.now() - this._discoverStart;
    }

    // ---- Filtering ----
    setFiltering(before, after) {
        this.data.filtering.before = before;
        this.data.filtering.after = after;
    }

    // ---- Processing Timing ----
    startProcessing() {
        this._processingStart = Date.now();
    }

    endProcessing(totalMovies) {
        this.data.processing.total = totalMovies;
        this.data.processing.duration = Date.now() - this._processingStart;
    }

    // ---- Processing Counters ----
    incSuccess() {
        this.data.processing.successes++;
    }

    incFailure() {
        this.data.processing.failures++;
    }

    // ---- TMDB ----
    incTmdbCalls() {
        this.data.tmdb.calls++;
    }

    // ---- OMDB ----
    incOmdbHit() {
        this.data.omdb.hits++;
    }

    incOmdbFetch() {
        this.data.omdb.fetches++;
    }

    // ---- Finalize Metrics ----
    finish() {
        this.data.totalDuration = Date.now() - this.data.startTime;
        return this.data;
    }

    // ---- Log Output ----
    print() {
        console.log("==== BUILD METRICS ====");
        console.log(JSON.stringify(this.finish(), null, 2));
        console.log("=======================");
    }
}

module.exports = Metrics;

