// stremio/catalog-builder/lib/utils.js
const https = require("https");

// Reuse sockets for every request
const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,       // allows high parallelism
    keepAliveMsecs: 30000
});

function httpsGetJson(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers, agent }, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
                }
            });
        });

        req.on("error", (err) => reject(err));
    });
}

async function retryWithBackoff(fn, retries = 5, delay = 500) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            // Detect rate limit or recoverable server errors
            const msg = err.message || "";
            const isRateLimit = msg.includes("429");
            const isServerError =
                msg.includes("500") ||
                msg.includes("502") ||
                msg.includes("503") ||
                msg.includes("504");

            // Only retry on safe conditions
            if (!isRateLimit && !isServerError) {
                throw err;
            }

            const wait = delay * Math.pow(2, i); // exponential backoff

            console.warn(
                `Retry ${i + 1}/${retries} after error: ${msg}. Waiting ${wait}ms`
            );

            await new Promise((res) => setTimeout(res, wait));
        }
    }

    throw new Error(`Failed after ${retries} retries`);
}


module.exports = {
    httpsGetJson,
    retryWithBackoff
};

